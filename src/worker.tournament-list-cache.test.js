// @vitest-environment node
// GET /api/tournaments: Die öffentliche Liste kommt 60 s aus dem Cloudflare-Cache, auch für Angemeldete. Deren
// eigene Turniere (Owner/Bearbeiter, mit Verwaltungsfeldern) kommen frisch aus D1 dazu; Admins lesen alles frisch.
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

  describe('Angemeldete', () => {
    const fremd = { Cookie: 'ptm_session=s2' };
    const turniere = async (headers) => (await (await liste(headers)).json()).tournaments;

    beforeEach(() => {
      sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
        VALUES ('u2', 'u2@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
      sql(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s2', 'u2', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
      sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
        VALUES ('t2', 'owner', 'Entwurf', '2026-10-15', 'Karben', 'tete', 'draft', 'public', '2026-09-01', '2026-09-01')`);
      sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
        VALUES ('t3', 'u2', 'Eigenes Privates', '2026-10-20', 'Ilbenstadt', 'tete', 'registration', 'private', '2026-09-01', '2026-09-01')`);
    });

    it('bekommen fremde Turniere aus dem Cache und eigene frisch, nach Datum sortiert', async () => {
      await namen();
      sql("UPDATE tournaments SET name = 'Fremd geändert' WHERE id = 't1'");
      sql("UPDATE tournaments SET name = 'Eigenes Privates neu' WHERE id = 't3'");

      const tournaments = await turniere(fremd);
      expect(tournaments.map((tournament) => tournament.name)).toEqual(['Eigenes Privates neu', 'Herbstturnier']);
      expect(tournaments.map((tournament) => tournament.canManage)).toEqual([true, false]);
      expect(cache.put).toHaveBeenCalledTimes(1);
    });

    it('sehen als Bearbeiter fremde Entwürfe mit Verwaltungsfeldern', async () => {
      sql("INSERT INTO tournament_editors (id, tournament_id, user_id, created_at) VALUES ('e1', 't2', 'u2', '2026-09-01')");

      const tournaments = await turniere(fremd);
      expect(tournaments.map((tournament) => tournament.name)).toEqual(['Entwurf', 'Eigenes Privates', 'Herbstturnier']);
      expect(tournaments[0].canManage).toBe(true);
    });

    it('lesen als Admin alles frisch', async () => {
      await namen();
      sql("UPDATE users SET role = 'admin' WHERE id = 'u2'");
      sql("UPDATE tournaments SET name = 'Fremd geändert' WHERE id = 't1'");

      expect((await turniere(fremd)).map((tournament) => tournament.name)).toEqual(['Entwurf', 'Eigenes Privates', 'Fremd geändert']);
    });

    it('sehen nach einem eigenen Schreibzugriff sofort den neuen Stand', async () => {
      await namen();
      sql("UPDATE tournaments SET name = 'Fremd geändert' WHERE id = 't1'");
      const response = await worker.fetch(new Request('https://ptm.test/api/tournaments/t3', { method: 'DELETE', headers: fremd }), env);
      expect(response.ok).toBe(true);

      expect(await namen()).toEqual(['Fremd geändert']);
    });
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
