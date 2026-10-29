// @vitest-environment node
// GET /api/clubs und GET /api/places (ohne Suche) lädt jeder App-Start bzw. die Plätze-Seite: Die Antwort kommt
// aus dem Cloudflare-Cache statt bei jedem Aufruf alle Vereine und Plätze aus D1 zu lesen. Der Cache-Schlüssel
// trägt eine Version aus cache_versions (Vereine: 'clubs', Plätze: 'places'); Trigger erhöhen sie bei jeder
// relevanten Änderung, auch direkt per SQL (Import-Skripte).
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

describe('Cache für Vereins- und Plätzeliste', () => {
  let env;
  let cache;
  let queries;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const get = (path, headers = {}) => worker.fetch(new Request(`https://ptm.test${path}`, { headers }), env);
  const vereine = async () => (await (await get('/api/clubs')).json()).clubs;
  const plaetze = async (path = '/api/places', headers = {}) => (await (await get(path, headers)).json()).places;
  const listenAbfragen = () => queries.filter((statement) => /SELECT c\.id, c\.name, p\.latitude|AS club_display_name/.test(statement)).length;
  const angemeldet = { Cookie: 'ptm_session=s1' };

  beforeEach(() => {
    cache = fakeCache();
    vi.stubGlobal('caches', { default: cache });
    env = { DB: d1MitSchema() };
    queries = [];
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (statement) => { queries.push(statement); return prepare(statement); };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'owner@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s1', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO clubs (id, name, status, owner_id, created_at, updated_at)
      VALUES ('c1', 'Boule Club', 'published', 'owner', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, status, created_at, updated_at)
      VALUES ('p1', 'c1', 'Platz', 'Hauptstr. 1, Ort', 50.5, 9.5, 'published', '2026-09-01', '2026-09-01')`);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('liest die Vereinsliste beim zweiten Abruf nicht erneut aus der Datenbank', async () => {
    expect(await vereine()).toEqual([{ id: 'c1', name: 'Boule Club', locations: [{ latitude: 50.5, longitude: 9.5 }] }]);
    await vereine();
    expect(listenAbfragen()).toBe(1);
  });

  it('gibt die Cache-Dauer nicht an den Browser weiter', async () => {
    await vereine();
    const response = await get('/api/clubs');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('baut die Listen nach einer Änderung über die API neu auf', async () => {
    await vereine();
    const response = await worker.fetch(new Request('https://ptm.test/api/places/p1', { method: 'DELETE', headers: angemeldet }), env);
    expect(response.ok).toBe(true);

    expect((await vereine())[0].locations).toEqual([]);
  });

  it('baut die Listen auch nach einer direkten Datenbankänderung neu auf (Import-Skripte, andere Rechenzentren)', async () => {
    await vereine();
    expect((await plaetze()).map((place) => place.name)).toEqual(['Platz']);
    sql("UPDATE clubs SET name = 'Direkt geändert' WHERE id = 'c1'");
    sql("UPDATE boule_places SET name = 'Neuer Platz' WHERE id = 'p1'");

    expect((await vereine())[0].name).toBe('Direkt geändert');
    expect((await plaetze()).map((place) => place.name)).toEqual(['Neuer Platz']);
  });

  it('baut die Listen nach einem Deploy neu auf (neues Listenformat), sonst nicht', async () => {
    env.CF_VERSION_METADATA = { id: 'deploy-1' };
    await vereine();
    await vereine();
    expect(listenAbfragen()).toBe(1);

    env.CF_VERSION_METADATA = { id: 'deploy-2' };
    await vereine();
    expect(listenAbfragen()).toBe(2);
  });

  it('behält den Eintrag bei einer abgelehnten Änderung', async () => {
    await vereine();
    const response = await worker.fetch(new Request('https://ptm.test/api/places/p1', { method: 'DELETE' }), env);
    expect(response.ok).toBe(false);

    await vereine();
    expect(listenAbfragen()).toBe(1);
  });

  it('baut die Listen in einem weiteren Rechenzentrum nicht neu auf, sondern liest den Snapshot aus D1', async () => {
    await vereine();
    await plaetze();
    cache.entries.clear();

    expect((await vereine())[0].name).toBe('Boule Club');
    expect((await plaetze()).map((place) => place.name)).toEqual(['Platz']);
    expect(listenAbfragen()).toBe(2);
    expect(queries.filter((statement) => statement.startsWith('SELECT body FROM list_snapshots'))).toHaveLength(4);
  });

  it('setzt große Listen aus mehreren Snapshot-Teilen zusammen', async () => {
    const insert = env.DB.sqlite.prepare(`INSERT INTO clubs (id, name, status, owner_id, created_at, updated_at)
      VALUES (?, ?, 'published', 'owner', '2026-09-01', '2026-09-01')`);
    for (let index = 0; index < 9000; index += 1) insert.run(`club-${index}`, `Verein ${String(index).padStart(5, '0')} ${'ä'.repeat(60)}`);
    const erwartet = await vereine();
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS parts FROM list_snapshots WHERE name = 'published-clubs'").get().parts).toBeGreaterThan(1);

    cache.entries.clear();
    expect(await vereine()).toEqual(erwartet);
    expect(listenAbfragen()).toBe(1);
  });

  it('nutzt den Snapshot nach einer Änderung oder einem Deploy nicht mehr', async () => {
    env.CF_VERSION_METADATA = { id: 'deploy-1' };
    await vereine();
    sql("UPDATE clubs SET name = 'Umbenannt' WHERE id = 'c1'");
    cache.entries.clear();
    expect((await vereine())[0].name).toBe('Umbenannt');

    env.CF_VERSION_METADATA = { id: 'deploy-2' };
    cache.entries.clear();
    await vereine();
    expect(listenAbfragen()).toBe(3);
  });

  it('baut die Vereinsliste bei Änderungen ohne Einfluss auf sie nicht neu auf', async () => {
    await vereine();
    const response = await worker.fetch(new Request('https://ptm.test/api/places/p1/like', { method: 'POST', headers: angemeldet }), env);
    expect(response.ok).toBe(true);
    sql("UPDATE clubs SET description = 'Neu', logo_url = 'https://example.test/logo.png' WHERE id = 'c1'");
    sql("UPDATE boule_places SET name = 'Umbenannt', court_count = 8 WHERE id = 'p1'");
    sql("UPDATE users SET role = 'admin' WHERE id = 'owner'");

    await vereine();
    expect(queries.filter((statement) => /SELECT c\.id, c\.name, p\.latitude/.test(statement))).toHaveLength(1);
  });

  it('baut die Vereinsliste bei neuen Koordinaten oder einem unveröffentlichten Platz neu auf', async () => {
    await vereine();
    sql('UPDATE boule_places SET latitude = 51.5 WHERE id = ?', 'p1');
    expect((await vereine())[0].locations).toEqual([{ latitude: 51.5, longitude: 9.5 }]);
    sql("UPDATE boule_places SET status = 'pending' WHERE id = 'p1'");
    expect((await vereine())[0].locations).toEqual([]);
  });

  describe('GET /api/places', () => {
    it('liefert Angemeldeten dieselbe gemeinsame Liste aus dem Cache', async () => {
      await plaetze();
      const [place] = await plaetze('/api/places', angemeldet);

      expect(listenAbfragen()).toBe(1);
      // Schlanke Liste: persönliche Markierungen kommen aus /api/places/personal, Standardwerte fehlen.
      expect(place).toMatchObject({ id: 'p1', name: 'Platz' });
      expect(place).not.toHaveProperty('liked');
      expect(place).not.toHaveProperty('canEdit');
      expect(place).not.toHaveProperty('description');
    });

    it('weist Suchanfragen veralteter App-Stände ohne D1-Abfrage mit Update-Hinweis ab', async () => {
      await plaetze();
      const response = await get('/api/places?q=Platz');

      expect(response.status).toBe(410);
      expect(await response.json()).toMatchObject({
        error: 'Neue Version verfügbar. Speichere offene Eingaben und lade dann neu.', details: { code: 'client_outdated' },
      });
      expect(await plaetze('/api/places?q=')).toHaveLength(1);
      expect(listenAbfragen()).toBe(1);
    });

    it('zählt ein neues Like sofort mit', async () => {
      expect((await plaetze())[0].likeCount).toBeUndefined();
      const response = await worker.fetch(new Request('https://ptm.test/api/places/p1/like', { method: 'POST', headers: angemeldet }), env);
      expect(response.ok).toBe(true);

      expect((await plaetze())[0].likeCount).toBe(1);
    });

    it('baut die Liste bei einem Favoriten nicht neu auf (persönlich, nicht Teil der Liste)', async () => {
      await plaetze();
      const response = await worker.fetch(new Request('https://ptm.test/api/places/p1/favorite', { method: 'POST', headers: angemeldet }), env);
      expect(response.ok).toBe(true);

      await plaetze();
      expect(listenAbfragen()).toBe(1);
    });

    it('liefert eine schlanke Liste ohne Standardwerte, Koordinaten aber immer', async () => {
      sql(`UPDATE clubs SET kind = 'group', logo_url = 'https://example.test/logo.png', description = 'Wir spielen' WHERE id = 'c1'`);
      sql(`UPDATE boule_places SET venue_type = 'indoor', court_count = 6, accessible = 1, description = 'Hinter der Halle' WHERE id = 'p1'`);
      sql(`INSERT INTO boule_places (id, name, address, status, created_at, updated_at)
        VALUES ('p2', 'Ohne Verein', 'Dorfplatz', 'published', '2026-09-01', '2026-09-01')`);
      expect(await plaetze()).toEqual([
        { id: 'p2', name: 'Ohne Verein', address: 'Dorfplatz', latitude: null, longitude: null },
        { id: 'p1', name: 'Platz', address: 'Hauptstr. 1, Ort', latitude: 50.5, longitude: 9.5, clubId: 'c1', clubName: 'Boule Club',
          clubKind: 'group', hasClubLogo: true, venueType: 'indoor', courtCount: 6, accessible: true },
      ]);
    });

    it('liefert Beschreibung und Vereinsangaben über GET /api/places/:id', async () => {
      sql(`UPDATE clubs SET description = 'Wir spielen', website_url = 'https://example.test' WHERE id = 'c1'`);
      sql(`UPDATE boule_places SET description = 'Hinter der Halle', facilities = 'Bänke' WHERE id = 'p1'`);
      expect(await (await get('/api/places/p1')).json()).toEqual({
        id: 'p1', description: 'Hinter der Halle', facilities: 'Bänke', facilityCodes: [], clubDescription: 'Wir spielen',
        clubWebsiteUrl: 'https://example.test', clubSocialLinks: {}, clubOwnedByAdmin: false,
      });
      sql(`UPDATE boule_places SET status = 'pending' WHERE id = 'p1'`);
      expect((await get('/api/places/p1')).status).toBe(404);
      expect((await get('/api/places/gibt-es-nicht')).status).toBe(404);
    });

    it('markiert Vereine von Admins in den Details (GET /api/places/:id)', async () => {
      sql("UPDATE users SET role = 'admin' WHERE id = 'owner'");
      expect((await (await get('/api/places/p1')).json()).clubOwnedByAdmin).toBe(true);
    });
  });

  describe('GET /api/places/personal', () => {
    const marks = async (headers = angemeldet) => (await get('/api/places/personal', headers)).json();

    beforeEach(() => {
      sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
        VALUES ('u2', 'u2@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
      sql(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s2', 'u2', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
      sql(`INSERT INTO clubs (id, name, status, owner_id, created_at, updated_at)
        VALUES ('c2', 'Anderer Club', 'published', 'owner', '2026-09-01', '2026-09-01')`);
      sql(`INSERT INTO boule_places (id, club_id, name, address, status, reported_by_user_id, created_at, updated_at)
        VALUES ('p2', NULL, 'Gemeldet', 'Weg 2, Ort', 'published', 'u2', '2026-09-01', '2026-09-01')`);
      sql("INSERT INTO club_editors (club_id, user_id, approved_at) VALUES ('c2', 'u2', '2026-09-01')");
      sql("INSERT INTO boule_place_likes (place_id, user_id, created_at) VALUES ('p1', 'u2', '2026-09-01')");
      sql("INSERT INTO boule_place_favorites (place_id, user_id, created_at) VALUES ('p2', 'u2', '2026-09-01')");
    });

    it('liefert Likes, Favoriten und Bearbeitungsrechte der angemeldeten Person', async () => {
      expect(await marks({ Cookie: 'ptm_session=s2' })).toEqual({
        likedIds: ['p1'], favoritedIds: ['p2'], editableClubIds: ['c2'], editablePlaceIds: ['p2'], isAdmin: false,
      });
      expect((await marks()).editableClubIds.sort()).toEqual(['c1', 'c2']);
    });

    it('verlangt eine Anmeldung', async () => {
      expect((await get('/api/places/personal')).status).toBe(401);
    });
  });
});
