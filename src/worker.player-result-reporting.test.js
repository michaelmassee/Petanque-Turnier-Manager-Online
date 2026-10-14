// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

describe('Ergebnismeldung durch Spieler', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const melden = (session, body, registrationId = 'r1') => worker.fetch(new Request(`https://ptm.test/api/live/registrations/${registrationId}/result`, {
    method: 'POST', headers: { Cookie: `ptm_session=${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), env);

  beforeEach(() => {
    env = { DB: d1MitSchema() };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('player', 'spieler@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('other', 'andere@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('outsider', 'fremd@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('player-session', 'player', '2099-01-01T00:00:00.000Z', '2026-01-01'),
             ('other-session', 'other', '2099-01-01T00:00:00.000Z', '2026-01-01'),
             ('outsider-session', 'outsider', '2099-01-01T00:00:00.000Z', '2026-01-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, registration_type, type, status, visibility,
      live_view_enabled, player_result_reporting_enabled, created_at, updated_at)
      VALUES ('t1', 'player', 'Turnier', '2099-09-28', 'Ort', 'tete', 'forme', 'rangliste', 'running', 'public', 1, 1, '2026-01-01', '2026-01-01')`);
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at, user_id)
      VALUES ('r1', 't1', 'Anna', 'A', 'anna@example.test', 'confirmed', 'active', '2026-01-01', '2026-01-01', '2026-01-01', 'player'),
             ('r2', 't1', 'Bert', 'B', 'bert@example.test', 'confirmed', 'active', '2026-01-01', '2026-01-01', '2026-01-01', 'other')`);
    sql("INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES ('round1', 't1', 1, '2026-01-01')");
    sql(`INSERT INTO tournament_matches (id, tournament_id, round_id, team_a_registration_ids, team_b_registration_ids, created_at, updated_at)
      VALUES ('match1', 't1', 'round1', '[\"r1\"]', '[\"r2\"]', '2026-01-01', '2026-01-01')`);
  });

  it('übernimmt das Ergebnis nur von einem beteiligten Spieler der aktuellen Partie', async () => {
    const response = await melden('player-session', { ownScore: 13, opponentScore: 7 });

    expect(response.status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT score_a, score_b FROM tournament_matches WHERE id = 'match1'").get()).toEqual({ score_a: 13, score_b: 7 });
  });

  it('merkt sich, wer gemeldet hat, und zeigt es der Turnierleitung in den Runden', async () => {
    await melden('other-session', { ownScore: 13, opponentScore: 7 }, 'r2');

    expect(env.DB.sqlite.prepare("SELECT result_reported_by FROM tournament_matches WHERE id = 'match1'").get()).toEqual({ result_reported_by: 'r2' });
    const { rounds } = await (await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/rounds', { headers: { Cookie: 'ptm_session=player-session' } }), env)).json();
    expect(rounds[0].matches[0].reportedBy).toMatchObject({ id: 'r2', firstName: 'Bert', lastName: 'B' });
  });

  it('verweigert die Meldung, wenn die Turnierleitung sie nicht freigegeben hat', async () => {
    sql("UPDATE tournaments SET player_result_reporting_enabled = 0 WHERE id = 't1'");
    expect((await melden('player-session', { ownScore: 13, opponentScore: 7 })).status).toBe(403);
  });

  it('verweigert Personen, die nicht an der Partie beteiligt sind', async () => {
    expect((await melden('outsider-session', { ownScore: 13, opponentScore: 7 })).status).toBe(404);
  });

  it('ordnet das Ergebnis eines Spielers aus Team B aus dessen Sicht richtig zu', async () => {
    const response = await melden('other-session', { ownScore: 13, opponentScore: 7 }, 'r2');

    expect(response.status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT score_a, score_b FROM tournament_matches WHERE id = 'match1'").get()).toEqual({ score_a: 7, score_b: 13 });
  });

  it('verweigert einem zurückgezogenen Spieler die Ergebnismeldung', async () => {
    sql("UPDATE registrations SET participation = 'withdrawn' WHERE id = 'r1'");
    expect((await melden('player-session', { ownScore: 13, opponentScore: 7 })).status).toBe(403);
  });

  it.each([
    [{ ownScore: 13, opponentScore: 13 }],
    [{ ownScore: -1, opponentScore: 13 }],
    [{ ownScore: 14, opponentScore: 7 }],
  ])('weist ungültige Ergebnisse zurück', async (body) => {
    expect((await melden('player-session', body)).status).toBe(400);
    expect(env.DB.sqlite.prepare("SELECT score_a, score_b FROM tournament_matches WHERE id = 'match1'").get())
      .toEqual({ score_a: null, score_b: null });
  });

  it('überschreibt ein zwischen Auswahl und Speichern gemeldetes Ergebnis nicht', async () => {
    env.DB.sqlite.exec(`CREATE TRIGGER concurrent_player_report BEFORE UPDATE OF score_a ON tournament_matches
      WHEN OLD.id = 'match1' AND OLD.score_a IS NULL
      BEGIN
        UPDATE tournament_matches SET score_a = 7, score_b = 13 WHERE id = OLD.id;
        SELECT RAISE(IGNORE);
      END;`);

    expect((await melden('player-session', { ownScore: 13, opponentScore: 7 })).status).toBe(409);
    expect(env.DB.sqlite.prepare("SELECT score_a, score_b FROM tournament_matches WHERE id = 'match1'").get())
      .toEqual({ score_a: 7, score_b: 13 });
  });
});
