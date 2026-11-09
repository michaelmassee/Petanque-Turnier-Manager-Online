// @vitest-environment node
// Feste Teamnummer der Formée-Meldung wie die Nr. der Meldeliste im Hauptprojekt (TeamNummernVergabe, Lücken füllen),
// nur bei online durchgeführten Turnieren.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { assignTeamNumbers } from './worker.js';

const ORIGIN = 'https://ptm.test';

describe('Teamnummern der Meldungen', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const numbers = (id) => Object.fromEntries(env.DB.sqlite.prepare('SELECT id, team_number FROM registrations WHERE tournament_id = ?').all(id)
    .map((row) => [row.id, row.team_number]));
  const request = (path, method = 'GET') => worker.fetch(new Request(`${ORIGIN}${path}`, {
    method, headers: { Cookie: 'ptm_session=owner-session', 'Content-Type': 'application/json' },
  }), env);
  const list = async (id) => (await (await request(`/api/tournaments/${id}/registrations`)).json()).registrations;
  const tournamentRow = (id) => env.DB.sqlite.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);

  function tournament(id, { registrationType = 'forme', type = 'schweizer', documentManaged = 0 } = {}) {
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, registration_type, status, visibility, participants_public, document_managed, created_at, updated_at)
      VALUES (?, 'owner', ?, '2099-09-28', 'Ort', ?, 'doublette', ?, 'registration', 'public', 1, ?, '2026-09-01', '2026-09-01')`, id, id, type, registrationType, documentManaged);
  }
  function registration(tournamentId, index, status = 'confirmed') {
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
      VALUES (?, ?, ?, 'Muster', ?, ?, 'active', ?, '2026-09-01', '2026-09-01')`,
    `${tournamentId}-r${index}`, tournamentId, `Spieler${index}`, `${tournamentId}${index}@example.test`, status,
    `2026-09-01T10:${String(index).padStart(2, '0')}:00.000Z`);
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
  });

  it('vergibt bestätigten Meldungen schon in der Meldeliste feste Nummern; neue füllen Lücken stornierter Meldungen', async () => {
    tournament('t');
    [1, 2, 3].forEach((index) => registration('t', index));
    registration('t', 4, 'waitlist');
    expect((await list('t')).map((row) => [row.id, row.teamNumber]).sort()).toEqual([['t-r1', 1], ['t-r2', 2], ['t-r3', 3], ['t-r4', null]]);

    sql("UPDATE registrations SET status = 'cancelled' WHERE id = 't-r2'");
    registration('t', 5);
    await list('t');
    expect(numbers('t')).toEqual({ 't-r1': 1, 't-r2': null, 't-r3': 3, 't-r4': null, 't-r5': 2 });

    // Wieder bestätigte Meldungen bekommen freie Nummern; eine doppelte Nummer behält die frühere Meldung, die spätere
    // bekommt eine neue (fehlende Nummern in Anmeldereihenfolge).
    sql("UPDATE registrations SET status = 'confirmed' WHERE id IN ('t-r2', 't-r4')");
    sql("UPDATE registrations SET team_number = 1 WHERE id = 't-r3'");
    await list('t');
    expect(numbers('t')).toEqual({ 't-r1': 1, 't-r2': 3, 't-r3': 4, 't-r4': 5, 't-r5': 2 });
    expect(new Set(Object.values(numbers('t'))).size).toBe(5);
  });

  it('lässt die Nummer eines Teams, das schon gespielt hat, auch nach einer Stornierung stehen', async () => {
    tournament('k');
    [1, 2].forEach((index) => registration('k', index));
    await assignTeamNumbers(env.DB, tournamentRow('k'));
    sql(`INSERT INTO tournament_teams (id, tournament_id, member_registration_ids, created_at) VALUES ('team-1', 'k', '["k-r1"]', '2026-09-01')`);
    sql("UPDATE registrations SET status = 'cancelled' WHERE id = 'k-r1'");
    registration('k', 3);
    await assignTeamNumbers(env.DB, tournamentRow('k'));
    expect(numbers('k')).toEqual({ 'k-r1': 1, 'k-r2': 2, 'k-r3': 3 });
  });

  it('nummeriert nur online durchgeführte Formée-Turniere', async () => {
    tournament('d', { documentManaged: 1 });
    tournament('m', { registrationType: 'melee' });
    registration('d', 1);
    registration('m', 1);
    expect((await list('d'))[0].teamNumber).toBeNull();
    expect((await list('m'))[0].teamNumber).toBeNull();
    expect(numbers('d')['d-r1']).toBeNull();

    // Eine früher online vergebene Nummer gilt nach dem Verbinden mit dem Turnierdokument nicht mehr.
    tournament('o');
    registration('o', 1);
    await list('o');
    sql("UPDATE tournaments SET document_managed = 1 WHERE id = 'o'");
    expect((await list('o'))[0].teamNumber).toBeNull();
  });

  it('nutzt die Nummer der Meldung als Teamnummer in Spielrunde und Live-Daten', async () => {
    tournament('s');
    [1, 2, 3, 4, 5, 6].forEach((index) => registration('s', index));
    await list('s');
    sql("UPDATE registrations SET status = 'cancelled' WHERE id = 's-r1'");
    registration('s', 7);
    sql("UPDATE tournaments SET status = 'running' WHERE id = 's'");
    expect((await request('/api/tournaments/s/rounds', 'POST')).status).toBe(200);
    expect(numbers('s')['s-r7']).toBe(1);

    const { rounds, teams } = await (await request('/api/tournaments/s/rounds')).json();
    const byRegistration = new Map(teams.map((team) => [team.members[0], team.number]));
    expect(byRegistration.get('s-r7')).toBe(1);
    expect(byRegistration.get('s-r6')).toBe(6);
    for (const match of rounds[0].matches) {
      expect(match.teamANumber).toBe(numbers('s')[match.teamA[0].id]);
      if (match.teamB.length) expect(match.teamBNumber).toBe(numbers('s')[match.teamB[0].id]);
    }
  });
});
