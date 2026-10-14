// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { buildLiveResponse } from './worker.js';

describe('Systemabhängige Live-Rangliste', () => {
  let db;
  beforeEach(() => {
    db = d1MitSchema();
    db.sqlite.exec(`
      INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
        VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-10-14', '2026-10-14');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, type, registration_type, status, visibility, created_at, updated_at)
        VALUES ('t1', 'u1', 'Turnier', '2026-10-14', 'Ort', 'tete', 'schweizer', 'forme', 'running', 'public', '2026-10-14', '2026-10-14');
      INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
        VALUES ('p1', 't1', 'Anna', 'Test', 'anna@example.test', 'confirmed', 'active', '2026-10-14', '2026-10-14', '2026-10-14'),
        ('p2', 't1', 'Bert', 'Test', 'bert@example.test', 'confirmed', 'active', '2026-10-14', '2026-10-14', '2026-10-14');
      INSERT INTO tournament_teams (id, tournament_id, member_registration_ids, created_at)
        VALUES ('a', 't1', '["p1"]', '2026-10-14'), ('b', 't1', '["p2"]', '2026-10-14');
      INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES ('r1', 't1', 1, '2026-10-14');
      INSERT INTO tournament_matches (id, tournament_id, round_id, team_a_id, team_b_id, team_a_registration_ids, team_b_registration_ids, score_a, score_b, created_at, updated_at)
        VALUES ('m1', 't1', 'r1', 'a', 'b', '["p1"]', '["p2"]', 13, 7, '2026-10-14', '2026-10-14');
    `);
  });

  const live = async () => (await buildLiveResponse(new Request('https://ptm.test/api/live/registrations/p1'), db,
    db.sqlite.prepare("SELECT * FROM registrations WHERE id = 'p1'").get())).json();

  it.each(['mit_buchholz', 'ohne_buchholz'])('liefert Schweizer-Modus und berechnete Buchholz-Werte (%s)', async (mode) => {
    db.sqlite.prepare("UPDATE tournaments SET schweizer_ranking_mode = ? WHERE id = 't1'").run(mode);
    const response = await live();
    expect(response.tournament).toMatchObject({ type: 'schweizer', registrationType: 'forme', schweizerRankingMode: mode });
    expect(response.live.ranking[0]).toMatchObject({ registrationIds: ['p1'], rank: 1, wins: 1, bhz: 0, fbhz: 1, pointsFor: 13, pointsAgainst: 7, pointsDiff: 6, own: true });
  });

  it('erhält die Formule-X-Wertung', async () => {
    db.sqlite.exec("UPDATE tournaments SET type = 'formule_x' WHERE id = 't1'");
    expect((await live()).live.ranking[0]).toMatchObject({ wertung: 119, wins: 1, losses: 0, gameDiff: 1 });
  });

  it('erhält die Spieldifferenz bei Supermêlée', async () => {
    db.sqlite.exec("UPDATE tournaments SET type = 'rangliste', registration_type = 'supermelee' WHERE id = 't1'");
    expect((await live()).live.ranking[1]).toMatchObject({ registrationIds: ['p2'], wins: 0, losses: 1, gameDiff: -1, pointsDiff: -6 });
  });

  it('erhält systemabhängige Werte aus dem Turnierdokument', async () => {
    db.sqlite.prepare("UPDATE tournaments SET desktop_execution = 1, desktop_ranking_json = ? WHERE id = 't1'").run(JSON.stringify([
      { rank: 1, registrationIds: ['p1'], wins: 3, bhz: 7, fbhz: 21, pointsFor: 39, pointsAgainst: 15, pointsDiff: 24 },
    ]));
    expect((await live()).live.ranking[0]).toMatchObject({ rank: 1, bhz: 7, fbhz: 21, pointsDiff: 24 });
  });

  it('erfindet für K.O. keine Rangliste', async () => {
    db.sqlite.exec("UPDATE tournaments SET type = 'ko' WHERE id = 't1'");
    expect((await live()).live.ranking).toEqual([]);
  });
});
