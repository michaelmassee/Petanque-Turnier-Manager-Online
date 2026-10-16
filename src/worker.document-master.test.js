// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import worker, { executeSyncWrite, syncPutTournamentSettings } from './worker.js';

// Ein mit einem Turnierdokument verbundenes Turnier: ab dem Verbinden ist das Dokument Master, nicht erst ab seinem
// Start (desktop_execution).
describe('Verbundenes Turnier: Dokument ist Master', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const turnier = () => env.DB.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const web = (method, path, body, session = 'owner-session') => worker.fetch(new Request(`https://ptm.test${path}`, {
    method, headers: { Cookie: `ptm_session=${session}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { sendBatch: vi.fn().mockResolvedValue(undefined) } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('player', 'spieler@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-01-01'),
             ('player-session', 'player', '2099-01-01T00:00:00.000Z', '2026-01-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, registration_type, type, status, visibility,
      player_result_reporting_enabled, schweizer_ranking_mode, created_at, updated_at)
      VALUES ('t1', 'owner', 'Turnier', '2099-09-28', 'Ort', 'tete', 'forme', 'schweizer', 'registration', 'public', 1,
        'ohne_buchholz', '2026-01-01', '2026-01-01')`);
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at, user_id)
      VALUES ('r1', 't1', 'Anna', 'A', 'anna@example.test', 'confirmed', 'inactive', '2026-01-01', '2026-01-01', '2026-01-01', 'player'),
             ('r2', 't1', 'Bert', 'B', 'bert@example.test', 'confirmed', 'inactive', '2026-01-01', '2026-01-01', '2026-01-01', null)`);
    bindeDokument(env.DB.sqlite, 't1');
  });

  function laufendMitRunde() {
    sql("UPDATE tournaments SET status = 'running' WHERE id = 't1'");
    sql("INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES ('round1', 't1', 1, '2026-01-01')");
    sql(`INSERT INTO tournament_matches (id, tournament_id, round_id, team_a_registration_ids, team_b_registration_ids, created_at, updated_at)
      VALUES ('match1', 't1', 'round1', '["r1"]', '["r2"]', '2026-01-01', '2026-01-01')`);
  }

  it('lehnt den Online-Start nach dem Verbinden ab und checkt niemanden automatisch ein', async () => {
    const response = await web('POST', '/api/tournaments/t1/start');

    expect(response.status).toBe(409);
    expect(turnier().status).toBe('registration');
    expect(env.DB.sqlite.prepare("SELECT participation FROM registrations WHERE tournament_id = 't1'").all())
      .toEqual([{ participation: 'inactive' }, { participation: 'inactive' }]);
  });

  it('sperrt Auslosung und Ergebniseingabe online, auch bevor das Dokument das Turnier gestartet hat', async () => {
    laufendMitRunde();

    expect((await web('POST', '/api/tournaments/t1/rounds')).status).toBe(409);
    expect((await web('PUT', '/api/tournaments/t1/matches/match1/result', { scoreA: 13, scoreB: 7 })).status).toBe(409);
    expect(env.DB.sqlite.prepare("SELECT score_a, score_b FROM tournament_matches WHERE id = 'match1'").get())
      .toEqual({ score_a: null, score_b: null });
  });

  it('nimmt eine Spielermeldung nur als offene Meldung für das Dokument an', async () => {
    laufendMitRunde();

    expect((await web('POST', '/api/live/registrations/r1/result', { ownScore: 13, opponentScore: 7 }, 'player-session')).status).toBe(200);

    expect(env.DB.sqlite.prepare("SELECT score_a, score_b FROM tournament_matches WHERE id = 'match1'").get())
      .toEqual({ score_a: null, score_b: null });
    expect(env.DB.sqlite.prepare('SELECT score_a, score_b, status FROM document_result_reports').all())
      .toEqual([{ score_a: 13, score_b: 7, status: 'open' }]);
  });

  it('meldet die Bindung in der Live-Ansicht', async () => {
    laufendMitRunde();

    const response = await web('GET', '/api/live/registrations/r1', undefined, 'player-session');

    expect(response.status).toBe(200);
    expect((await response.json()).tournament).toMatchObject({ documentBound: true, desktopExecution: false });
  });

  it('liefert den Ranglisten-Snapshot des Dokuments auch nach einem Zurücksetzen des Starts', async () => {
    sql(`UPDATE tournaments SET desktop_execution = 0, desktop_ranking_json = ? WHERE id = 't1'`,
      JSON.stringify([{ rank: 1, registrationIds: ['r2'], wins: 1, pointsFor: 13, pointsAgainst: 7, pointsDiff: 6 }]));

    const { ranking } = await (await web('GET', '/api/tournaments/t1/ranking')).json();

    expect(ranking).toEqual([expect.objectContaining({ rank: 1, registrationIds: ['r2'], wins: 1 })]);
  });

  describe('Spieleinstellungen aus dem Dokument', () => {
    const settings = (body) => {
      const request = syncAnfrage('PUT', '/api/sync/tournaments/t1/settings', body);
      return executeSyncWrite(request, env.DB, turnier(), (db) => syncPutTournamentSettings(request, db, turnier()));
    };

    it('überschreibt die Online-Werte, auch nach dem Start', async () => {
      sql("UPDATE tournaments SET status = 'running', desktop_execution = 1 WHERE id = 't1'");

      const response = await settings({ formation: 'triplette', schweizerRankingMode: 'mit_buchholz', formuleXRounds: 6, koPlatz3: false });

      expect(response.status).toBe(200);
      expect(turnier()).toMatchObject({ formation: 'triplette', formation_other: 0, schweizer_ranking_mode: 'mit_buchholz',
        formule_x_rounds: 6, ko_platz3: 0 });
    });

    it('übernimmt nur die übergebenen Werte', async () => {
      await settings({ formuleXRounds: 5 });

      expect(turnier()).toMatchObject({ formation: 'tete', schweizer_ranking_mode: 'ohne_buchholz', formule_x_rounds: 5 });
    });

    it('lehnt ungültige Werte ab', async () => {
      await expect(settings({ formation: 'quadrette' })).rejects.toMatchObject({ status: 400 });
      await expect(settings({ formuleXRounds: 0 })).rejects.toMatchObject({ status: 400 });
      await expect(settings({ koPlatz3: 'ja' })).rejects.toMatchObject({ status: 400 });
      sql("UPDATE tournaments SET registration_type = 'melee' WHERE id = 't1'");
      await expect(settings({ formation: 'tete' })).rejects.toMatchObject({ status: 400 });
    });

    it('verlangt die Schreib-Lease des verbundenen Dokuments', async () => {
      const request = syncAnfrage('PUT', '/api/sync/tournaments/t1/settings', { formuleXRounds: 5 }, { lease: 'falsch-falsch-falsch-falsch-falsch-falsch' });

      await expect(executeSyncWrite(request, env.DB, turnier(), (db) => syncPutTournamentSettings(request, db, turnier())))
        .rejects.toMatchObject({ status: 409 });
    });
  });
});
