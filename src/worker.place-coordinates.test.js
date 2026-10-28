// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

describe('Manuelle Bouleplatz-Koordinaten über die API', () => {
  let env;
  const input = { name: 'Boulepark', address: 'Parkweg 12, Linden', venueType: 'outdoor', courtCount: 4 };
  const manual = { overrideCoordinates: true, latitude: '49.12345', longitude: '7.98765' };
  const request = (path, { method = 'GET', session, body } = {}) => worker.fetch(new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session ? { Cookie: `ptm_session=${session}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  const stored = (id = 'p1') => env.DB.sqlite.prepare('SELECT latitude, longitude, address, address_unverified FROM boule_places WHERE id = ?').get(id);
  const save = (extra = {}, session = 'owner-session') => request('/api/places/p1', { method: 'PUT', session, body: { ...input, ...extra } });

  beforeEach(() => {
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ lat: '50.2', lon: '8.9', display_name: 'Linden' }]))));
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    env.DB.sqlite.exec(`
      INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at) VALUES
        ('owner', 'owner@example.test', 'user', 's', 'h', '2026-10-27', '2026-10-27'),
        ('other', 'other@example.test', 'user', 's', 'h', '2026-10-27', '2026-10-27');
      INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES
        ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-10-27'),
        ('other-session', 'other', '2099-01-01T00:00:00.000Z', '2026-10-27');
      INSERT INTO clubs (id, name, status, owner_id, created_at, updated_at)
        VALUES ('c1', 'Bouleclub', 'published', 'owner', '2026-10-27', '2026-10-27');
      INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, status, address_unverified, created_at, updated_at)
        VALUES ('p1', 'c1', 'Boulepark', 'Parkweg 12, Linden', 50.2, 8.9, 'published', 1, '2026-10-27', '2026-10-27');
      INSERT INTO boule_places (id, name, address, latitude, longitude, status, edit_token, created_at, updated_at)
        VALUES ('p2', 'Freier Platz', 'Parkweg 2, Linden', 50.3, 8.8, 'published', 'edit-token', '2026-10-27', '2026-10-27');
    `);
  });
  afterEach(() => { env.DB.sqlite.close(); vi.unstubAllGlobals(); });

  it('speichert Korrekturen beim Vereinsplatz ohne Geocoding und behält sie bei späteren Bearbeitungen', async () => {
    expect((await save(manual)).status).toBe(200);
    expect(stored()).toMatchObject({ latitude: 49.12345, longitude: 7.98765, address_unverified: 1 });
    expect((await save({ name: 'Neuer Platzname', overrideCoordinates: false, latitude: 12, longitude: 34 })).status).toBe(200);
    expect(stored()).toMatchObject({ latitude: 49.12345, longitude: 7.98765 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [0, 0], [-90, -180], [90, 180],
  ])('akzeptiert gültige Randwerte %s / %s', async (latitude, longitude) => {
    expect((await save({ overrideCoordinates: true, latitude, longitude })).status).toBe(200);
    expect(stored()).toMatchObject({ latitude, longitude });
  });

  it.each([
    { latitude: 91 }, { latitude: -91 }, { longitude: 181 }, { longitude: -181 },
    { latitude: null }, { longitude: '' }, { latitude: ' ' }, { longitude: 'abc' },
    { latitude: true }, { longitude: [] },
  ])('verwirft ungültige oder unvollständige manuelle Werte: %j', async (invalid) => {
    const response = await save({ ...manual, ...invalid });
    expect(response.status).toBe(400);
    expect(stored()).toMatchObject({ latitude: 50.2, longitude: 8.9 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('geocodiert eine neue Adresse, wenn der manuelle Modus ausgeschaltet ist', async () => {
    await save(manual);
    expect((await save({ address: 'Neuer Parkweg 3', overrideCoordinates: false, latitude: 12, longitude: 34 })).status).toBe(200);
    expect(stored()).toMatchObject({ address: 'Neuer Parkweg 3', latitude: 50.2, longitude: 8.9 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['/api/places', '/api/clubs/c1/places'])('übernimmt Koordinaten beim Anlegen: %s', async (path) => {
    const response = await request(path, { method: 'POST', session: 'owner-session', body: { ...input, ...manual, name: 'Neuer Platz', venueType: 'indoor' } });
    expect(response.status).toBe(201);
    const place = env.DB.sqlite.prepare("SELECT latitude, longitude FROM boule_places WHERE name = 'Neuer Platz'").get();
    expect(place).toEqual({ latitude: 49.12345, longitude: 7.98765 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('verlangt weiterhin Bearbeitungsrechte', async () => {
    expect((await save(manual, 'other-session')).status).toBe(403);
    expect((await save(manual, null)).status).toBe(401);
    expect(stored()).toMatchObject({ latitude: 50.2, longitude: 8.9 });
  });

  it('liefert die gespeicherten Werte per Bearbeitungslink und übernimmt manuelle Korrekturen', async () => {
    const response = await request('/api/place-reports/by-token/edit-token');
    expect(await response.json()).toMatchObject({ latitude: 50.3, longitude: 8.8 });
    const body = { ...input, ...manual, name: 'Freier Platz', address: 'Parkweg 2, Linden' };
    expect((await request('/api/place-reports/by-token/edit-token', { method: 'PUT', body })).status).toBe(200);
    expect(stored('p2')).toMatchObject({ latitude: 49.12345, longitude: 7.98765 });
    expect((await request('/api/place-reports/by-token/edit-token', { method: 'PUT', body: { ...body, overrideCoordinates: false } })).status).toBe(200);
    expect(stored('p2')).toMatchObject({ latitude: 49.12345, longitude: 7.98765 });
    expect((await request('/api/place-reports/by-token/invalid-token', { method: 'PUT', body })).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])('berücksichtigt den manuellen Modus bei öffentlichen Meldungen (%s)', async (overrideCoordinates) => {
    const response = await request('/api/place-reports', { method: 'POST', body: {
      ...input, ...manual, name: 'Gemeldeter Platz', overrideCoordinates, contactName: 'Anna Boule', contactEmail: 'anna@example.test', consentAccepted: true,
    } });
    expect(response.status).toBe(201);
    const place = env.DB.sqlite.prepare("SELECT latitude, longitude, status FROM boule_places WHERE contact_email = 'anna@example.test'").get();
    expect(place).toMatchObject({ status: 'pending', latitude: overrideCoordinates ? 49.12345 : 50.2, longitude: overrideCoordinates ? 7.98765 : 8.9 });
    expect(fetch).toHaveBeenCalledTimes(overrideCoordinates ? 0 : 1);
  });
});
