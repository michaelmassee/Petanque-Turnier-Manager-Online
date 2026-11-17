// @vitest-environment node
// Freigabelink über die Sync-API: Das Turnierdokument fragt vor dem Abschluss mit Benachrichtigung, ob ein privates
// Turnier einen aktiven Freigabelink hat, und aktiviert ihn nur auf ausdrücklichen Wunsch der Turnierleitung.
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

const LEITUNG = 'zugang-der-turnierleitung-mit-laenge';
const SPIELER = 'zugang-eines-spielers-mit-ausreichender-laenge';

describe('Freigabelink über die Sync-API', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const sync = (method, secret = LEITUNG) => worker.fetch(new Request('https://ptm.test/api/sync/tournaments/t1/share-link', {
    method, headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  }), env);
  const zustand = async (method = 'GET') => (await sync(method)).json();

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: () => {} } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01'),
             ('player', 'spieler@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    const zugang = (user, secret) => sql(`INSERT INTO api_keys (id, user_id, key_hash, label, status, requested_at,
        approved_at, created_at, updated_at)
      VALUES (?, ?, ?, 'PTM', 'approved', '2026-01-01', '2026-01-01', '2026-01-01', '2026-01-01')`,
    `key-${user}`, user, createHash('sha256').update(secret).digest('hex'));
    zugang('owner', LEITUNG);
    zugang('player', SPIELER);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'tete', 'running', 'private', '2026-09-01', '2026-09-01')`);
  });

  it('nennt ein privates Turnier ohne Freigabelink und aktiviert ihn erst per POST', async () => {
    expect(await zustand()).toEqual({ private: true, active: false });
    expect(await zustand()).toEqual({ private: true, active: false });

    expect(await zustand('POST')).toEqual({ private: true, active: true });
    expect(await zustand()).toEqual({ private: true, active: true });
  });

  it('behält einen aktiven Freigabelink beim erneuten Aktivieren', async () => {
    await zustand('POST');
    const vorher = env.DB.sqlite.prepare("SELECT token FROM tournament_share_links WHERE tournament_id = 't1'").get().token;
    await zustand('POST');
    expect(env.DB.sqlite.prepare("SELECT token FROM tournament_share_links WHERE tournament_id = 't1'").get().token).toBe(vorher);
  });

  it('braucht bei öffentlichen Turnieren keinen Freigabelink und legt keinen an', async () => {
    sql("UPDATE tournaments SET visibility = 'public' WHERE id = 't1'");
    expect(await zustand('POST')).toEqual({ private: false, active: true });
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS anzahl FROM tournament_share_links').get().anzahl).toBe(0);
  });

  it('nur mit API-Schlüssel der Turnierleitung', async () => {
    expect((await sync('GET', null)).status).toBe(401);
    expect((await sync('POST', SPIELER)).status).toBe(403);
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS anzahl FROM tournament_share_links').get().anzahl).toBe(0);
  });
});
