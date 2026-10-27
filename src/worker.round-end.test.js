// @vitest-environment node
// Rundenende bei Systemen mit natürlichem Ende (K.O., Jeder gegen Jeden): Maßgeblich sind die festen Teams seit der
// ersten Runde, nicht die gerade aktiven Meldungen – ausgeschiedene Teams setzt die Turnierleitung oft inaktiv.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

describe('Rundenende mit festen Teams', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('leitung', 'leitung@example.test', 'user', 'salt', 'hash', '2026-10-01', '2026-10-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('leitung-session', 'leitung', '2099-01-01T00:00:00.000Z', '2026-10-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, registration_type, status, visibility, created_at, updated_at)
      VALUES ('t1', 'leitung', 'Turnier', '2026-10-27', 'Ort', 'ko', 'tete', 'forme', 'running', 'public', '2026-10-01', '2026-10-01')`);
  });

  it('beendet K.O. nach dem Finale der festen Teams, auch wenn Ausgeschiedene inaktiv sind', async () => {
    for (let index = 1; index <= 4; index += 1) {
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
        VALUES (?, 't1', ?, 'Muster', ?, 'confirmed', 'active', ?, '2026-10-01', '2026-10-01')`, `p${index}`, `Spieler ${index}`, `p${index}@example.test`, `2026-10-01T10:0${index}:00Z`);
    }
    const runde = () => worker.fetch(new Request('https://ptm.test/api/tournaments/t1/rounds', {
      method: 'POST', headers: { Cookie: 'ptm_session=leitung-session' },
    }), env);
    const ergebnisse = () => sql('UPDATE tournament_matches SET score_a = 13, score_b = 4 WHERE score_a IS NULL');

    expect((await runde()).status).toBe(200);
    ergebnisse();
    // Halbfinal-Verlierer setzt die Turnierleitung inaktiv; das Finale (mit Spiel um Platz 3) steht trotzdem aus.
    sql("UPDATE registrations SET participation = 'inactive' WHERE id IN ('p3', 'p4')");
    expect((await runde()).status).toBe(200);
    ergebnisse();

    const danach = await runde();
    expect(danach.status).toBe(400);
    expect((await danach.json()).error).toBe('Alle Runden wurden bereits gespielt.');
  });
});
