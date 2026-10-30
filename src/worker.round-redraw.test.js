// @vitest-environment node
// Aktuelle Runde neu auslosen: gleiche Rundennummer, neue Partien, nur solange kein Ergebnis eingetragen ist.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

const ORIGIN = 'https://ptm.test';

describe('Aktuelle Runde neu auslosen', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const rows = (statement, ...params) => env.DB.sqlite.prepare(statement).all(...params);
  const post = (path) => worker.fetch(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { Cookie: 'ptm_session=owner-session' } }), env);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, status, visibility, participants_public, created_at, updated_at)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'schweizer', 'tete', 'running', 'public', 1, '2026-09-01', '2026-09-01')`);
    // 7 Teams: Die Schweizer Runde braucht ein Freilos, dessen Ergebnis (13:7) automatisch eingetragen ist.
    for (let index = 1; index <= 7; index += 1) {
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
        VALUES (?, 't1', ?, 'Muster', ?, 'confirmed', 'active', '2026-09-01', '2026-09-01', '2026-09-01')`, `r${index}`, `Spieler ${index}`, `r${index}@example.test`);
    }
  });

  // Wer die nächste Runde startet, hat die Ergebnisse geprüft: unbestätigte Spielermeldungen gelten dann als bestätigt (E-27).
  it('bestätigt beim Start der nächsten Runde offene Spielermeldungen', async () => {
    expect((await post('/api/tournaments/t1/rounds')).status).toBe(200);
    sql("UPDATE tournament_matches SET score_a = 13, score_b = 5, result_reported_by = json_extract(team_a_registration_ids, '$[0]'), result_report_pending = 1 WHERE score_a IS NULL");
    expect(rows('SELECT COUNT(*) AS count FROM tournament_matches WHERE result_report_pending = 1')[0].count).toBe(3);

    expect((await post('/api/tournaments/t1/rounds')).status).toBe(200);
    expect(rows('SELECT COUNT(*) AS count FROM tournament_matches WHERE result_report_pending = 1')[0].count).toBe(0);
  });

  it('ersetzt die aktuelle Runde mit gleicher Nummer, auch wenn nur das Freilos ein Ergebnis hat', async () => {
    expect((await post('/api/tournaments/t1/rounds')).status).toBe(200);
    const [before] = rows('SELECT id, round_number FROM tournament_rounds');
    expect(rows("SELECT COUNT(*) AS count FROM tournament_matches WHERE team_b_registration_ids = '[]' AND score_a = 13")[0].count).toBe(1);

    const response = await post('/api/tournaments/t1/rounds/redraw');
    expect(response.status).toBe(200);
    expect((await response.json()).rounds).toHaveLength(1);

    const after = rows('SELECT id, round_number FROM tournament_rounds');
    expect(after).toHaveLength(1);
    expect(after[0].round_number).toBe(1);
    expect(after[0].id).not.toBe(before.id);
    expect(rows('SELECT COUNT(*) AS count FROM tournament_matches WHERE round_id = ?', before.id)[0].count).toBe(0);
    expect(rows('SELECT COUNT(*) AS count FROM tournament_matches WHERE round_id = ?', after[0].id)[0].count).toBe(4);
  });

  it('lehnt ab, sobald ein Ergebnis eingetragen ist, und lässt die Runde stehen', async () => {
    await post('/api/tournaments/t1/rounds');
    sql("UPDATE tournament_matches SET score_a = 13, score_b = 5 WHERE id = (SELECT id FROM tournament_matches WHERE team_b_registration_ids != '[]' LIMIT 1)");
    const [before] = rows('SELECT id FROM tournament_rounds');

    const response = await post('/api/tournaments/t1/rounds/redraw');
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('In der aktuellen Runde sind schon Ergebnisse eingetragen. Neu auslosen geht nur ohne Ergebnisse.');
    expect(rows('SELECT id FROM tournament_rounds')).toEqual([before]);
  });

  it('löscht kein Ergebnis, das zwischen Prüfung und Austausch der Runde gemeldet wird', async () => {
    await post('/api/tournaments/t1/rounds');
    const [before] = rows('SELECT id FROM tournament_rounds');
    const [match] = rows("SELECT id FROM tournament_matches WHERE team_b_registration_ids != '[]' LIMIT 1");
    // Die Meldung trifft nach der Ergebnisprüfung, aber vor dem Batch ein.
    env.DB.vorBatch((sqlite) => sqlite.prepare('UPDATE tournament_matches SET score_a = 13, score_b = 5 WHERE id = ?').run(match.id));

    const response = await post('/api/tournaments/t1/rounds/redraw');
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('Die Runde wurde inzwischen geändert (Ergebnis eingetragen oder bereits neu ausgelost). Bitte aktualisieren.');
    expect(rows('SELECT id FROM tournament_rounds')).toEqual([before]);
    expect(rows('SELECT score_a, score_b FROM tournament_matches WHERE id = ?', match.id)).toEqual([{ score_a: 13, score_b: 5 }]);
    expect(rows('SELECT COUNT(*) AS count FROM tournament_matches WHERE round_id = ?', before.id)[0].count).toBe(4);
  });

  it('lehnt ohne Runde ab und lässt nur die Turnierleitung zu', async () => {
    expect((await post('/api/tournaments/t1/rounds/redraw')).status).toBe(400);
    const anonymous = await worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/rounds/redraw`, { method: 'POST' }), env);
    expect(anonymous.status).toBe(401);
  });

  it('benachrichtigt Spieler mit Live-Push über die neue Einteilung', async () => {
    sql("UPDATE tournaments SET live_view_enabled = 1 WHERE id = 't1'");
    sql(`INSERT INTO live_push_subscriptions (endpoint, registration_id, p256dh, auth, created_at, updated_at)
      VALUES ('https://fcm.googleapis.com/fcm/send/r1', 'r1', 'k', 'a', '2026-09-01', '2026-09-01')`);
    await post('/api/tournaments/t1/rounds');
    env.MAIL_QUEUE.sendBatch.mockClear();

    expect((await post('/api/tournaments/t1/rounds/redraw')).status).toBe(200);
    const items = env.MAIL_QUEUE.sendBatch.mock.calls.flatMap(([batch]) => batch.flatMap((message) => message.body.items));
    expect(items).toEqual([expect.objectContaining({
      endpoint: 'https://fcm.googleapis.com/fcm/send/r1',
      payload: expect.objectContaining({ title: 'Herbstturnier: Runde 1', tag: 'live-round-1', eventType: 'live_update' }),
    })]);
  });

  describe('nach geänderter Teilnahme', () => {
    const inRound = () => rows(`SELECT m.team_a_registration_ids AS a, m.team_b_registration_ids AS b FROM tournament_matches m
      JOIN tournament_rounds r ON r.id = m.round_id WHERE r.round_number = (SELECT MAX(round_number) FROM tournament_rounds)`)
      .flatMap((row) => [...JSON.parse(row.a), ...JSON.parse(row.b)]);
    const deactivate = (id) => sql("UPDATE registrations SET participation = 'inactive' WHERE id = ?", id);
    // Mêlée-Schweizer braucht mindestens 6 Teams, also 12 Spieler in Doublette.
    const addPlayers = (from, to) => {
      for (let index = from; index <= to; index += 1) {
        sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
          VALUES (?, 't1', ?, 'Muster', ?, 'confirmed', 'active', '2026-09-01', '2026-09-01', '2026-09-01')`, `r${index}`, `Spieler ${index}`, `r${index}@example.test`);
      }
    };

    it('Schweizer: lässt beim Neuauslosen der ersten Runde ein fehlendes Team weg und bildet die Teams neu', async () => {
      await post('/api/tournaments/t1/rounds');
      deactivate('r7');
      expect((await post('/api/tournaments/t1/rounds/redraw')).status).toBe(200);
      expect(inRound().sort()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
      expect(rows('SELECT COUNT(*) AS count FROM tournament_teams')[0].count).toBe(6);
    });

    it('Schweizer: paart ab Runde 2 nur aktive Teams und nimmt nachgemeldete auf', async () => {
      await post('/api/tournaments/t1/rounds');
      sql("UPDATE tournament_matches SET score_a = 13, score_b = 6 WHERE score_a IS NULL");
      deactivate('r2');
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
        VALUES ('r8', 't1', 'Nachzügler', 'Muster', 'r8@example.test', 'confirmed', 'active', '2026-09-02', '2026-09-02', '2026-09-02')`);

      expect((await post('/api/tournaments/t1/rounds')).status).toBe(200);
      const players = inRound();
      expect(players).not.toContain('r2');
      expect(players).toContain('r8');
      expect(players).toHaveLength(7);
    });

    it('K.O.: bildet beim Neuauslosen der ersten Runde Teams und Teilbäume aus den aktiven Meldungen', async () => {
      sql("UPDATE tournaments SET type = 'ko' WHERE id = 't1'");
      sql("INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at) VALUES ('r8', 't1', 'Acht', 'Muster', 'r8@example.test', 'confirmed', 'active', '2026-09-01', '2026-09-01', '2026-09-01')");
      expect((await post('/api/tournaments/t1/rounds')).status).toBe(200);
      deactivate('r8');
      deactivate('r7');
      deactivate('r6');
      deactivate('r5');

      expect((await post('/api/tournaments/t1/rounds/redraw')).status).toBe(200);
      expect(inRound().sort()).toEqual(['r1', 'r2', 'r3', 'r4']);
      expect(rows('SELECT COUNT(*) AS count FROM tournament_teams WHERE bracket_group IS NOT NULL')[0].count).toBe(4);
    });

    it('Supermêlée: lost ohne den fehlenden Spieler neu aus', async () => {
      // 9 Spieler (Partien zu 5 und 4), nach der Abmeldung 8 (zwei Partien zu 4).
      sql("UPDATE tournaments SET type = 'rangliste', registration_type = 'supermelee', formation = 'triplette' WHERE id = 't1'");
      addPlayers(8, 9);
      expect((await post('/api/tournaments/t1/rounds')).status).toBe(200);
      expect(inRound()).toContain('r9');
      deactivate('r9');

      expect((await post('/api/tournaments/t1/rounds/redraw')).status).toBe(200);
      expect(inRound()).not.toContain('r9');
      expect(inRound()).toHaveLength(8);
    });

    it('Mêlée: nimmt die erste Runde zurück und löst Teams mit fehlenden Spielern auf', async () => {
      sql("UPDATE tournaments SET registration_type = 'melee', formation = 'doublette' WHERE id = 't1'");
      addPlayers(8, 12);
      expect((await post('/api/tournaments/t1/teams/draw')).status).toBe(200);
      expect(rows('SELECT COUNT(*) AS count FROM tournament_teams')[0].count).toBe(6);
      expect((await post('/api/tournaments/t1/rounds')).status).toBe(200);
      deactivate('r1');

      const response = await post('/api/tournaments/t1/rounds/redraw');
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.roundWithdrawn).toBe(true);
      expect(body.rounds).toEqual([]);
      expect(rows('SELECT COUNT(*) AS count FROM tournament_rounds')[0].count).toBe(0);
      const teams = rows('SELECT member_registration_ids FROM tournament_teams').map((row) => JSON.parse(row.member_registration_ids));
      expect(teams).toHaveLength(5);
      expect(teams.flat()).not.toContain('r1');
    });

    it('Mêlée: nimmt die erste Runde nicht zurück, wenn zwischendurch ein Ergebnis gemeldet wird', async () => {
      sql("UPDATE tournaments SET registration_type = 'melee', formation = 'doublette' WHERE id = 't1'");
      addPlayers(8, 12);
      await post('/api/tournaments/t1/teams/draw');
      await post('/api/tournaments/t1/rounds');
      deactivate('r1');
      const [match] = rows("SELECT id FROM tournament_matches WHERE team_b_registration_ids != '[]' LIMIT 1");
      env.DB.vorBatch((sqlite) => sqlite.prepare('UPDATE tournament_matches SET score_a = 13, score_b = 5 WHERE id = ?').run(match.id));

      const response = await post('/api/tournaments/t1/rounds/redraw');
      expect(response.status).toBe(409);
      expect(rows('SELECT COUNT(*) AS count FROM tournament_rounds')[0].count).toBe(1);
      expect(rows('SELECT score_a FROM tournament_matches WHERE id = ?', match.id)).toEqual([{ score_a: 13 }]);
      expect(rows('SELECT COUNT(*) AS count FROM tournament_teams')[0].count).toBe(6);
    });

    it('Mêlée: lost normal neu aus, wenn die Teams noch passen', async () => {
      sql("UPDATE tournaments SET registration_type = 'melee', formation = 'doublette' WHERE id = 't1'");
      addPlayers(8, 12);
      await post('/api/tournaments/t1/teams/draw');
      await post('/api/tournaments/t1/rounds');

      const body = await (await post('/api/tournaments/t1/rounds/redraw')).json();
      expect(body.roundWithdrawn).toBeUndefined();
      expect(body.rounds).toHaveLength(1);
      expect(rows('SELECT COUNT(*) AS count FROM tournament_teams')[0].count).toBe(6);
    });
  });
});
