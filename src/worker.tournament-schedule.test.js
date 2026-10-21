// @vitest-environment node
// Öffentlicher Spielplan der Turnierseite: ganzes Turnier zum aktuellen Stand in einem Abruf, mit ETag.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { createTournamentShareLink } from './worker.js';

describe('Spielplan-Endpunkt (/schedule)', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const abrufen = (etag) => worker.fetch(new Request('https://ptm.test/api/tournaments/t1/schedule', etag ? { headers: { 'If-None-Match': etag } } : {}), env);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: () => {} } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, participants_public, created_at, updated_at)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'tete', 'running', 'public', 1, '2026-09-01', '2026-09-01')`);
  });

  it('liefert Runden, Rangliste, Status und Ankündigung und antwortet unverändert mit 304', async () => {
    const erste = await abrufen();
    expect(erste.status).toBe(200);
    expect(await erste.json()).toMatchObject({ status: 'running', rounds: [], ranking: [], dataAsOf: null, announcement: null });

    const etag = erste.headers.get('ETag');
    expect((await abrufen(etag)).status).toBe(304);
  });

  it('liefert nach einer Ankündigung ein neues ETag mit der Ankündigung', async () => {
    const etag = (await abrufen()).headers.get('ETag');
    sql("UPDATE tournaments SET announcement = 'Mittagspause', announcement_at = '2026-10-21T11:00:00.000Z' WHERE id = 't1'");

    const neu = await abrufen(etag);
    expect(neu.status).toBe(200);
    expect((await neu.json()).announcement).toEqual({ text: 'Mittagspause', at: '2026-10-21T11:00:00.000Z' });
  });

  it('gibt den Spielplan eines privaten Turniers mit gültigem Freigabe-Token heraus', async () => {
    sql("UPDATE tournaments SET visibility = 'private' WHERE id = 't1'");
    const created = await createTournamentShareLink(env.DB, 't1', 'https://ptm.test');
    const token = new URL((await created.json()).shareUrl).searchParams.get('share');
    const mitToken = (value) => worker.fetch(new Request(`https://ptm.test/api/tournaments/t1/schedule?share=${value}`), env);

    expect((await abrufen()).status).toBe(403);
    expect((await mitToken('falsch')).status).toBe(403);
    expect((await mitToken(token)).status).toBe(200);
    sql("UPDATE tournaments SET participants_public = 0 WHERE id = 't1'");
    expect((await mitToken(token)).status).toBe(403);
  });

  it('gibt den Spielplan nicht heraus, wenn die Teilnehmerliste nicht öffentlich ist', async () => {
    sql("UPDATE tournaments SET participants_public = 0 WHERE id = 't1'");
    expect((await abrufen()).status).toBe(403);
  });
});
