// @vitest-environment node
// GET /api/clubs lädt jeder App-Start: Die Antwort kommt aus dem Cloudflare-Cache statt bei jedem Aufruf
// alle Vereine und Plätze aus D1 zu lesen; Schreibzugriffe auf Vereine/Plätze löschen den Eintrag.
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

describe('Cache für GET /api/clubs', () => {
  let env;
  let cache;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const vereine = async () => (await (await worker.fetch(new Request('https://ptm.test/api/clubs'), env)).json()).clubs;

  beforeEach(() => {
    cache = fakeCache();
    vi.stubGlobal('caches', { default: cache });
    env = { DB: d1MitSchema() };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'owner@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s1', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO clubs (id, name, status, owner_id, created_at, updated_at)
      VALUES ('c1', 'Boule Club', 'published', 'owner', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, status, created_at, updated_at)
      VALUES ('p1', 'c1', 'Platz', 'Hauptstr. 1, Ort', 50.5, 9.5, 'published', '2026-09-01', '2026-09-01')`);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('liest beim zweiten Abruf nicht erneut aus der Datenbank', async () => {
    expect(await vereine()).toEqual([{ id: 'c1', name: 'Boule Club', locations: [{ latitude: 50.5, longitude: 9.5 }] }]);
    sql("UPDATE clubs SET name = 'Direkt geändert' WHERE id = 'c1'");

    expect((await vereine())[0].name).toBe('Boule Club');
  });

  it('gibt die Cache-Dauer nicht an den Browser weiter', async () => {
    await vereine();
    const response = await worker.fetch(new Request('https://ptm.test/api/clubs'), env);
    expect(response.headers.get('Cache-Control') || '').not.toContain('max-age=300');
  });

  it('verwirft den Eintrag nach einer Änderung an einem Platz', async () => {
    await vereine();
    const response = await worker.fetch(new Request('https://ptm.test/api/places/p1', {
      method: 'DELETE', headers: { Cookie: 'ptm_session=s1' },
    }), env);
    expect(response.ok).toBe(true);

    expect((await vereine())[0].locations).toEqual([]);
  });

  it('behält den Eintrag bei einer abgelehnten Änderung', async () => {
    await vereine();
    const response = await worker.fetch(new Request('https://ptm.test/api/places/p1', { method: 'DELETE' }), env);
    expect(response.ok).toBe(false);

    expect(cache.delete).not.toHaveBeenCalled();
  });

  describe('GET /api/places ohne Anmeldung', () => {
    const plaetze = async (path = '/api/places', headers = {}) => (await (await worker.fetch(new Request(`https://ptm.test${path}`, { headers }), env)).json()).places;

    it('kommt beim zweiten Abruf aus dem Cache', async () => {
      expect((await plaetze()).map((place) => place.name)).toEqual(['Platz']);
      sql("UPDATE boule_places SET name = 'Direkt geändert' WHERE id = 'p1'");

      expect((await plaetze()).map((place) => place.name)).toEqual(['Platz']);
    });

    it('liest Suchanfragen und Angemeldete immer frisch', async () => {
      await plaetze();
      sql("UPDATE boule_places SET name = 'Direkt geändert' WHERE id = 'p1'");

      expect((await plaetze('/api/places?q=Direkt')).map((place) => place.name)).toEqual(['Direkt geändert']);
      expect((await plaetze('/api/places', { Cookie: 'ptm_session=s1' })).map((place) => place.name)).toEqual(['Direkt geändert']);
    });

    it('verwirft den Eintrag nach einem Like', async () => {
      expect((await plaetze())[0].likeCount).toBe(0);
      const response = await worker.fetch(new Request('https://ptm.test/api/places/p1/like', {
        method: 'POST', headers: { Cookie: 'ptm_session=s1' },
      }), env);
      expect(response.ok).toBe(true);

      expect((await plaetze())[0].likeCount).toBe(1);
    });
  });
});
