// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { resetTournamentRunning, setRegistrationClosed } from './worker.js';

describe('Turnierstart zurücksetzen und Anmeldung schließen (E-23)', () => {
  let db;
  const leitung = { id: 'u1', role: 'user' };
  const turnier = () => db.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const protokoll = () => db.sqlite.prepare('SELECT action, actor_user_id, actor_role FROM audit_log').all();

  function rundeMitPartie(scoreA = null) {
    db.sqlite.prepare("INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES ('rd1', 't1', 1, '2026-09-28')").run();
    db.sqlite.prepare(`INSERT INTO tournament_matches (id, tournament_id, round_id, team_a_registration_ids, team_b_registration_ids,
        score_a, score_b, created_at, updated_at)
      VALUES ('m1', 't1', 'rd1', '[]', '[]', ?, NULL, '2026-09-28', '2026-09-28')`).run(scoreA);
  }

  beforeEach(() => {
    db = d1MitSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility,
        created_at, updated_at, desktop_execution, local_started_at)
      VALUES ('t1', 'u1', 'Turnier', '2026-09-28', 'Ort', 'tete', 'running', 'public', '2026-09-01', '2026-09-01', 1,
        '2026-09-28T08:00:00.000Z')`).run();
  });

  it('setzt ein versehentlich gestartetes Turnier zurück und schließt die Anmeldung (P-27)', async () => {
    rundeMitPartie();

    const antwort = await resetTournamentRunning(db, turnier(), leitung);

    expect((await antwort.json()).tournament).toMatchObject({ status: 'registration', registrationClosed: true });
    expect(turnier()).toMatchObject({ status: 'registration', registration_closed: 1, local_started_at: null, desktop_execution: 0 });
    expect(turnier().running_reset_at).toBeTruthy();
    expect(protokoll()).toEqual([{ action: 'running_reset', actor_user_id: 'u1', actor_role: 'owner' }]);
  });

  it('verweigert das Zurücksetzen, sobald ein Rundenergebnis vorliegt (P-64)', async () => {
    rundeMitPartie(13);

    await expect(resetTournamentRunning(db, turnier(), leitung))
      .rejects.toMatchObject({ status: 409, details: { code: 'results_exist' } });
    expect(turnier()).toMatchObject({ status: 'running', registration_closed: 0 });
    expect(protokoll()).toEqual([]);
  });

  it('meldet ein nicht laufendes Turnier', async () => {
    db.sqlite.prepare("UPDATE tournaments SET status = 'registration' WHERE id = 't1'").run();

    await expect(resetTournamentRunning(db, turnier(), leitung)).rejects.toMatchObject({ status: 409 });
  });

  it('öffnet und schließt die Anmeldung mit Protokolleintrag', async () => {
    const anfrage = (closed) => new Request('https://ptm.test/api/tournaments/t1/registration-closed', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ closed }),
    });

    await setRegistrationClosed(anfrage(true), db, turnier(), leitung);
    expect(turnier().registration_closed).toBe(1);
    await setRegistrationClosed(anfrage(false), db, turnier(), leitung);
    expect(turnier().registration_closed).toBe(0);

    expect(protokoll().map((eintrag) => eintrag.action)).toEqual(['registration_closed', 'registration_opened']);
    await expect(setRegistrationClosed(anfrage('ja'), db, turnier(), leitung)).rejects.toMatchObject({ status: 400 });
  });
});
