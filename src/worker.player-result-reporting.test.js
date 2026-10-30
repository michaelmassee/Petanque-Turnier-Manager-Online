// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

describe('Ergebnismeldung durch Spieler', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const melden = (session, body, registrationId = 'r1') => worker.fetch(new Request(`https://ptm.test/api/live/registrations/${registrationId}/result`, {
    method: 'POST', headers: { Cookie: `ptm_session=${session}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), env);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { sendBatch: vi.fn().mockResolvedValue(undefined) } };
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

  it('sagt beim Melden, dass die Turnierleitung das Ergebnis schon eingetragen hat', async () => {
    sql("UPDATE tournament_matches SET score_a = 13, score_b = 8, result_reported_by = NULL WHERE id = 'match1'");

    const response = await melden('player-session', { ownScore: 8, opponentScore: 13 });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Die Turnierleitung hat das Ergebnis deiner Partie bereits eingetragen.', details: { code: 'result_already_entered' },
    });
    expect(env.DB.sqlite.prepare("SELECT score_a, score_b FROM tournament_matches WHERE id = 'match1'").get()).toEqual({ score_a: 13, score_b: 8 });
  });

  it('sagt beim Melden, dass ein Spieler das Ergebnis schon gemeldet hat', async () => {
    expect((await melden('other-session', { ownScore: 13, opponentScore: 7 }, 'r2')).status).toBe(200);

    const response = await melden('player-session', { ownScore: 7, opponentScore: 13 });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('Für deine Partie wurde bereits ein Ergebnis gemeldet.');
  });

  describe('Ergebnisse in der Live-Ansicht der Beteiligten', () => {
    const liveItems = () => env.MAIL_QUEUE.sendBatch.mock.calls
      .flatMap(([batch]) => batch.filter((message) => message.body.kind === 'live_push').flatMap((message) => message.body.items));
    const abonnieren = (registrationId) => sql(`INSERT INTO live_push_subscriptions (endpoint, registration_id, p256dh, auth, created_at, updated_at)
      VALUES (?, ?, 'k', 'a', '2026-01-01', '2026-01-01')`, `https://push.test/${registrationId}`, registrationId);
    const organisator = (path, body) => worker.fetch(new Request(`https://ptm.test${path}`, {
      method: 'PUT', headers: { Cookie: 'ptm_session=player-session', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), env);
    let hubCalls;

    beforeEach(() => {
      abonnieren('r1');
      abonnieren('r2');
      hubCalls = [];
      env.TOURNAMENT_LIVE_HUB = { idFromName: (name) => name, get: (id) => ({ fetch: async () => { hubCalls.push(id); return new Response(null, { status: 204 }); } }) };
    });

    // Offene Live-Ansichten laden über den WebSocket neu; ein stiller Push pro Ergebnis wäre nur noch Queue-Last.
    it.each([
      ['von der Turnierleitung', () => organisator('/api/tournaments/t1/matches/match1/result', { scoreA: 13, scoreB: 8 })],
      ['aus „Alle speichern“', () => organisator('/api/tournaments/t1/rounds/round1/results', { results: [{ matchId: 'match1', scoreA: 7, scoreB: 13 }] })],
      ['von einem Spieler gemeldet', () => melden('player-session', { ownScore: 13, opponentScore: 7 })],
    ])('meldet ein Ergebnis %s offenen Seiten, ohne Push an die Spieler', async (_label, speichern) => {
      expect((await speichern()).status).toBe(200);
      expect(liveItems()).toEqual([]);
      expect(hubCalls).toEqual(['t1']);
    });
  });

  it('merkt sich, wer gemeldet hat, und zeigt es der Turnierleitung in den Runden', async () => {
    await melden('other-session', { ownScore: 13, opponentScore: 7 }, 'r2');

    expect(env.DB.sqlite.prepare("SELECT result_reported_by FROM tournament_matches WHERE id = 'match1'").get()).toEqual({ result_reported_by: 'r2' });
    const { rounds } = await (await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/rounds', { headers: { Cookie: 'ptm_session=player-session' } }), env)).json();
    expect(rounds[0].matches[0].reportedBy).toMatchObject({ id: 'r2', firstName: 'Bert', lastName: 'B' });
  });

  it('benachrichtigt die Turnierleitung per Push über eine Teammeldung', async () => {
    sql(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at, updated_at)
      VALUES ('https://push.test/owner', 'player', 'key', 'auth', '2026-01-01', '2026-01-01')`);

    expect((await melden('other-session', { ownScore: 13, opponentScore: 7 }, 'r2')).status).toBe(200);

    expect(env.MAIL_QUEUE.sendBatch).toHaveBeenCalledWith([{ body: { kind: 'push', userId: 'player', payload: {
      title: 'Ergebnis gemeldet',
      body: 'Turnier: Bert B meldet 13:7',
      tag: 'result-match1',
      url: 'https://ptm.test/?tab=play&tournament=t1',
      eventType: 'tournament_result_reported',
      tournamentId: 't1',
    } } }]);
  });

  it('schickt keinen Push ohne Push-Abo der Turnierleitung oder an den Meldenden selbst', async () => {
    expect((await melden('other-session', { ownScore: 13, opponentScore: 7 }, 'r2')).status).toBe(200);
    sql("UPDATE tournament_matches SET score_a = NULL, score_b = NULL, result_reported_by = NULL WHERE id = 'match1'");
    sql(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at, updated_at)
      VALUES ('https://push.test/owner', 'player', 'key', 'auth', '2026-01-01', '2026-01-01')`);
    expect((await melden('player-session', { ownScore: 13, opponentScore: 7 })).status).toBe(200);

    expect(env.MAIL_QUEUE.sendBatch).not.toHaveBeenCalled();
  });

  it('meldet das gespeicherte Ergebnis auch dann als Erfolg, wenn der Push nicht eingereiht werden kann', async () => {
    sql(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at, updated_at)
      VALUES ('https://push.test/owner', 'player', 'key', 'auth', '2026-01-01', '2026-01-01')`);
    env.MAIL_QUEUE.sendBatch.mockRejectedValue(new Error('queue down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await melden('other-session', { ownScore: 13, opponentScore: 7 }, 'r2')).status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT score_a, score_b FROM tournament_matches WHERE id = 'match1'").get()).toEqual({ score_a: 7, score_b: 13 });
    expect(consoleError).toHaveBeenCalledWith('Failed to queue result push for tournament t1', expect.any(Error));
    consoleError.mockRestore();
  });

  describe('Bestätigung durch die Turnierleitung (E-27)', () => {
    const abrufen = async (path, session = 'player-session') => (await worker.fetch(new Request(`https://ptm.test${path}`, {
      headers: { Cookie: `ptm_session=${session}` },
    }), env)).json();
    const spielplan = () => abrufen('/api/tournaments/t1/schedule');
    const bestaetigen = (matchIds = ['match1']) => worker.fetch(new Request('https://ptm.test/api/tournaments/t1/result-reports/confirm', {
      method: 'POST', headers: { Cookie: 'ptm_session=player-session', 'Content-Type': 'application/json' }, body: JSON.stringify({ matchIds }),
    }), env);
    const pending = () => env.DB.sqlite.prepare("SELECT result_report_pending FROM tournament_matches WHERE id = 'match1'").get().result_report_pending;

    beforeEach(async () => {
      // Bert (Team B) meldet seinen Sieg 13:7.
      expect((await melden('other-session', { ownScore: 13, opponentScore: 7 }, 'r2')).status).toBe(200);
    });

    it('zeigt eine unbestätigte Meldung weder im Spielplan noch in der Rangliste', async () => {
      const { rounds, ranking } = await spielplan();
      expect(rounds[0].matches[0]).toMatchObject({ scoreA: null, scoreB: null, reportedBy: null, reportPending: false });
      expect(ranking.every((entry) => !entry.wins)).toBe(true);
      expect(pending()).toBe(1);
    });

    it('zeigt sie der Turnierleitung mit Ergebnis und Kennzeichen', async () => {
      const { rounds } = await abrufen('/api/tournaments/t1/rounds');
      expect(rounds[0].matches[0]).toMatchObject({ scoreA: 7, scoreB: 13, reportPending: true, reportedBy: expect.objectContaining({ id: 'r2' }) });
    });

    it('zeigt beiden Teams „wartet auf Bestätigung“ aus eigener Sicht', async () => {
      const bert = await abrufen('/api/live/registrations/r2', 'other-session');
      expect(bert.registration.resultReport).toEqual({ ownScore: 13, opponentScore: 7, status: 'open' });
      expect(bert.live.currentMatch).toMatchObject({ ownScore: null, opponentScore: null, outcome: 'open' });
      const anna = await abrufen('/api/live/registrations/r1');
      expect(anna.registration.resultReport).toEqual({ ownScore: 7, opponentScore: 13, status: 'open' });
    });

    it('veröffentlicht nach „Gesehen“', async () => {
      const response = await bestaetigen();
      expect(response.status).toBe(200);
      expect((await response.json()).rounds[0].matches[0].reportPending).toBe(false);
      expect((await spielplan()).rounds[0].matches[0]).toMatchObject({ scoreA: 7, scoreB: 13 });
      expect((await abrufen('/api/live/registrations/r2', 'other-session')).registration.resultReport).toBeNull();
    });

    // Eine erst nach dem letzten Laden eingegangene Meldung hat die Turnierleitung nicht gesehen: Sie bleibt offen.
    it('bestätigt nur die übergebenen, angezeigten Meldungen', async () => {
      expect((await bestaetigen([])).status).toBe(200);
      expect(pending()).toBe(1);
      expect((await bestaetigen(['andere-partie'])).status).toBe(200);
      expect(pending()).toBe(1);
      expect((await bestaetigen('match1')).status).toBe(400);
      expect(pending()).toBe(1);
      expect((await bestaetigen(['match1'])).status).toBe(200);
      expect(pending()).toBe(0);
    });

    it('lässt nur die Turnierleitung bestätigen', async () => {
      const fremd = await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/result-reports/confirm', {
        method: 'POST', headers: { Cookie: 'ptm_session=other-session', 'Content-Type': 'application/json' }, body: JSON.stringify({ matchIds: ['match1'] }),
      }), env);
      expect(fremd.status).toBe(403);
      expect(pending()).toBe(1);
    });

    it('bestätigt, wenn die Turnierleitung das Ergebnis selbst speichert', async () => {
      const response = await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/matches/match1/result', {
        method: 'PUT', headers: { Cookie: 'ptm_session=player-session', 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoreA: 6, scoreB: 13, confirmOverwrite: true, expectedResult: { scoreA: 7, scoreB: 13, noShow: null } }),
      }), env);
      expect(response.status).toBe(200);
      expect(pending()).toBe(0);
    });

    it('gilt nach Turnierende als bestätigt', async () => {
      sql("UPDATE tournaments SET status = 'finished' WHERE id = 't1'");
      expect((await spielplan()).rounds[0].matches[0]).toMatchObject({ scoreA: 7, scoreB: 13 });
    });
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

  it('nimmt nur die Meldung des Siegerteams an', async () => {
    const verlierer = await melden('player-session', { ownScore: 9, opponentScore: 13 });

    expect(verlierer.status).toBe(400);
    expect(await verlierer.json()).toEqual({ error: 'Nur das Siegerteam meldet das Ergebnis.', details: { code: 'winner_reports_only' } });
    expect(env.DB.sqlite.prepare("SELECT score_a, score_b FROM tournament_matches WHERE id = 'match1'").get())
      .toEqual({ score_a: null, score_b: null });

    // Der Gegner (Team B) hat gewonnen und meldet: aus seiner Sicht 13:9, gespeichert als Team A 9, Team B 13.
    expect((await melden('other-session', { ownScore: 13, opponentScore: 9 }, 'r2')).status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT score_a, score_b, result_reported_by FROM tournament_matches WHERE id = 'match1'").get())
      .toEqual({ score_a: 9, score_b: 13, result_reported_by: 'r2' });
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
