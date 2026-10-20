// @vitest-environment node
// Endrangliste veröffentlichen: einmal eingefrorener Snapshot, öffentlich auf der Turnierseite, auf Wunsch per
// Postfach, Push und Mail mit Link an alle bestätigten Teilnehmer.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

describe('Endrangliste veröffentlichen', () => {
  let env;
  let send;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const LEITUNG = { Cookie: 'ptm_session=s1' };

  const publish = (body = {}, headers = LEITUNG) => worker.fetch(new Request('https://ptm.test/api/tournaments/t1/ranking/publish', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), env);
  const ranking = (query = '', headers = {}) => worker.fetch(new Request(`https://ptm.test/api/tournaments/t1/ranking${query}`, { headers }), env);
  const mails = () => send.mock.calls.map(([payload]) => payload).filter((payload) => payload.to);

  beforeEach(() => {
    send = vi.fn(async () => {});
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send } };
    env.DB.sqlite.exec(`
      INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, mail_enabled, created_at, updated_at)
        VALUES ('u1', 'leitung@example.test', 'Lea', 'Leitung', 'user', 'salt', 'hash', 1, '2026-10-14', '2026-10-14'),
               ('u2', 'fremd@example.test', 'Fritz', 'Fremd', 'user', 'salt', 'hash', 1, '2026-10-14', '2026-10-14'),
               ('u3', 'bert@example.test', 'Bert', 'Test', 'user', 'salt', 'hash', 1, '2026-10-14', '2026-10-14');
      INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s1', 'u1', '2099-01-01T00:00:00.000Z', '2026-10-14'),
        ('s2', 'u2', '2099-01-01T00:00:00.000Z', '2026-10-14');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, type, registration_type, status, visibility, participants_public, created_at, updated_at)
        VALUES ('t1', 'u1', 'Herbstturnier', '2026-10-14', 'Ort', 'tete', 'schweizer', 'forme', 'finished', 'public', 0, '2026-10-14', '2026-10-14');
      INSERT INTO registrations (id, tournament_id, user_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
        VALUES ('p1', 't1', NULL, 'Anna', 'Test', 'anna@example.test', 'confirmed', 'active', '2026-10-14', '2026-10-14', '2026-10-14'),
               ('p2', 't1', 'u3', 'Bert', 'Test', 'bert@example.test', 'confirmed', 'active', '2026-10-14', '2026-10-14', '2026-10-14'),
               ('p3', 't1', NULL, 'Wanda', 'Warte', 'wanda@example.test', 'waitlist', 'inactive', '2026-10-14', '2026-10-14', '2026-10-14');
      INSERT INTO tournament_teams (id, tournament_id, member_registration_ids, created_at)
        VALUES ('a', 't1', '["p1"]', '2026-10-14'), ('b', 't1', '["p2"]', '2026-10-14');
      INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES ('r1', 't1', 1, '2026-10-14');
      INSERT INTO tournament_matches (id, tournament_id, round_id, team_a_id, team_b_id, team_a_registration_ids, team_b_registration_ids, score_a, score_b, created_at, updated_at)
        VALUES ('m1', 't1', 'r1', 'a', 'b', '["p1"]', '["p2"]', 13, 7, '2026-10-14', '2026-10-14');
    `);
  });

  it('friert die Rangliste ein und macht sie auch ohne „Teilnehmer öffentlich“ sichtbar', async () => {
    expect((await ranking()).status).toBe(403);

    const response = await publish();
    expect(response.status).toBe(200);
    expect(send).not.toHaveBeenCalled();

    sql("UPDATE tournament_matches SET score_a = 2, score_b = 13 WHERE id = 'm1'");
    const published = await (await ranking()).json();
    expect(published.publishedAt).toEqual(expect.any(String));
    expect(published.ranking[0]).toMatchObject({ teamId: 'a', rank: 1, members: [expect.objectContaining({ id: 'p1' })] });

    const tournament = await (await worker.fetch(new Request('https://ptm.test/api/tournaments/t1'), env)).json();
    expect(tournament.tournament.rankingPublishedAt).toBe(published.publishedAt);
  });

  it('schreibt bestätigte Teilnehmer per Mail mit Link, Postfach und Push an – nicht die Warteliste', async () => {
    expect((await publish({ notify: true })).status).toBe(200);

    expect(mails().map((mail) => mail.to).sort()).toEqual(['anna@example.test', 'bert@example.test']);
    expect(mails()[0]).toMatchObject({ subject: 'Endrangliste: Herbstturnier', actions: [expect.objectContaining({ url: 'https://ptm.test/turniere/t1/rangliste' })] });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'push', userId: 'u3' }));
    expect(env.DB.sqlite.prepare("SELECT kind, event_type, broadcast_tournament_id FROM postbox_messages").all())
      .toEqual([{ kind: 'system', event_type: 'tournament_ranking_published', broadcast_tournament_id: 't1' }]);
  });

  it('verlangt für einen zweiten Versand eine ausdrückliche Bestätigung', async () => {
    await publish({ notify: true });
    send.mockClear();

    const again = await publish({ notify: true });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ details: { code: 'ranking_already_mailed' } });
    expect(send).not.toHaveBeenCalled();

    expect((await publish({ notify: false })).status).toBe(200);
    expect((await publish({ notify: true, resend: true })).status).toBe(200);
    expect(mails()).toHaveLength(2);
  });

  it('schickt keine Mails, wenn der Mailversand der Turnierleitung gesperrt ist', async () => {
    sql("UPDATE users SET mail_enabled = 0 WHERE id = 'u1'");
    expect((await publish({ notify: true })).status).toBe(200);
    expect(mails()).toEqual([]);
  });

  it('hängt bei privaten Turnieren den Freigabe-Link an', async () => {
    sql("UPDATE tournaments SET visibility = 'private' WHERE id = 't1'");
    const share = await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/share-link', { method: 'POST', headers: LEITUNG }), env);
    expect(share.status).toBe(200);
    const token = env.DB.sqlite.prepare("SELECT token FROM tournament_share_links WHERE tournament_id = 't1'").get().token;
    await publish({ notify: true });
    expect(mails()[0].actions[0].url).toBe(`https://ptm.test/turniere/t1/rangliste?share=${token}`);
    expect((await ranking(`?share=${token}`)).status).toBe(200);
    expect((await worker.fetch(new Request(`https://ptm.test/api/tournaments/t1?share=${token}`), env)).status).toBe(200);
    expect((await ranking()).status).toBe(403);
  });

  it('stoppt den privaten Versand ohne nutzbaren Freigabelink vor Veröffentlichung und Benachrichtigungen', async () => {
    sql("UPDATE tournaments SET visibility = 'private' WHERE id = 't1'");
    const result = await publish({ notify: true });
    expect(result.status).toBe(409);
    expect((await result.json()).error).toContain('Freigabelink');
    expect(send).not.toHaveBeenCalled();
    expect(env.DB.sqlite.prepare('SELECT * FROM tournament_final_rankings').all()).toEqual([]);
    expect(env.DB.sqlite.prepare('SELECT * FROM postbox_messages').all()).toEqual([]);
    expect((await publish({ notify: false })).status).toBe(200);
  });

  it('verwendet nach Wiederaufnahme und erneutem Abschluss keine alte Veröffentlichung', async () => {
    await publish({ notify: true });
    const start = await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/start', { method: 'POST', headers: LEITUNG }), env);
    expect(start.status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT final_ranking_published_at FROM tournaments WHERE id = 't1'").get().final_ranking_published_at).toBeNull();
    sql("UPDATE tournament_matches SET score_a = 2, score_b = 13 WHERE id = 'm1'");
    const finish = await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/publication', {
      method: 'PUT', headers: { ...LEITUNG, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'finished', visibility: 'public' }),
    }), env);
    expect(finish.status).toBe(200);
    expect((await finish.json()).tournament.rankingPublishedAt).toBeNull();
    expect((await ranking()).status).toBe(403);
    expect((await (await ranking('?live=1', LEITUNG)).json()).ranking[0].teamId).toBe('b');
    // Erneut veröffentlichen geht ohne Rückfrage; ein zweiter Versand an die Teilnehmer muss bestätigt werden.
    const repeated = await publish({ notify: true });
    expect(repeated.status).toBe(409);
    expect(await repeated.json()).toMatchObject({ details: { code: 'ranking_already_mailed' } });
    const published = await publish({ notify: true, resend: true });
    expect(published.status).toBe(200);
    expect((await (await ranking()).json()).ranking[0].teamId).toBe('b');
  });

  it('erlaubt das Veröffentlichen nur der Turnierleitung und erst nach Turnierende', async () => {
    expect((await publish({}, { Cookie: 'ptm_session=s2' })).status).toBe(403);
    expect((await publish({}, {})).status).toBe(401);

    sql("UPDATE tournaments SET status = 'running' WHERE id = 't1'");
    expect((await publish()).status).toBe(409);

    sql("UPDATE tournaments SET status = 'finished', type = 'ko' WHERE id = 't1'");
    expect((await publish()).status).toBe(409);
  });

  it('zeigt der Turnierleitung mit live=1 den aktuellen Stand, anderen nicht', async () => {
    await publish();
    sql("UPDATE tournament_matches SET score_a = 2, score_b = 13 WHERE id = 'm1'");

    expect((await (await ranking('?live=1', LEITUNG)).json()).ranking[0].teamId).toBe('b');
    expect((await (await ranking('?live=1')).json()).ranking[0].teamId).toBe('a');
  });

  it('rechnet wieder live, sobald das Turnier erneut geöffnet wird', async () => {
    await publish();
    sql("UPDATE tournaments SET status = 'running', participants_public = 1 WHERE id = 't1'");
    sql("UPDATE tournament_matches SET score_a = 2, score_b = 13 WHERE id = 'm1'");

    const live = await (await ranking()).json();
    expect(live.publishedAt).toBeUndefined();
    expect(live.ranking[0].teamId).toBe('b');
  });
});
