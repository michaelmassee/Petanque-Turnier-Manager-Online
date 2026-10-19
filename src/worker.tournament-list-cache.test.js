// @vitest-environment node
// GET /api/tournaments ohne Anmeldung: alle sehen dieselbe Liste, sie kommt 60 s aus dem Cloudflare-Cache.
// Angemeldete lesen immer frisch, weil ihre Liste eigene Turniere und Verwaltungsfelder enthält.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

function fakeCache() {
  const entries = new Map();
  return {
    entries,
    match: vi.fn(async (request) => entries.get(request.url)?.clone()),
    put: vi.fn(async (request, response) => { entries.set(request.url, response); }),
    delete: vi.fn(async (request) => entries.delete(request.url)),
  };
}

describe('Cache für GET /api/tournaments', () => {
  let env;
  let cache;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const liste = (headers = {}) => worker.fetch(new Request('https://ptm.test/api/tournaments', { headers }), env);
  const namen = async (headers) => (await (await liste(headers)).json()).tournaments.map((tournament) => tournament.name);

  beforeEach(() => {
    cache = fakeCache();
    vi.stubGlobal('caches', { default: cache });
    env = { DB: d1MitSchema() };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'owner@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s1', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'owner', 'Herbstturnier', '2026-11-01', 'Karben', 'tete', 'registration', 'public', '2026-09-01', '2026-09-01')`);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('liest anonym beim zweiten Abruf nicht erneut aus der Datenbank', async () => {
    expect(await namen()).toEqual(['Herbstturnier']);
    sql("UPDATE tournaments SET name = 'Direkt geändert' WHERE id = 't1'");

    expect(await namen()).toEqual(['Herbstturnier']);
  });

  it('liefert Angemeldeten immer den aktuellen Stand', async () => {
    await namen();
    sql("UPDATE tournaments SET name = 'Direkt geändert' WHERE id = 't1'");

    expect(await namen({ Cookie: 'ptm_session=s1' })).toEqual(['Direkt geändert']);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it('gibt die Cache-Dauer nicht an den Browser weiter', async () => {
    await liste();
    const response = await liste();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });

  it('funktioniert ohne Cloudflare-Cache', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await namen()).toEqual(['Herbstturnier']);
  });
});
