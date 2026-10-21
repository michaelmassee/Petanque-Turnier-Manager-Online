// @vitest-environment node
// Adresse ungeprüft: Importierte Verbandsplätze tragen teils die Postanschrift des Vereins. Sie sind gekennzeichnet,
// bis die Verantwortlichen die Adresse ändern oder bestätigen; Besucher können eine Korrektur melden.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema, migrationSql } from './test-support/d1.js';
import worker from './worker.js';

describe('Ungeprüfte Platzadresse', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const zeile = (statement, ...params) => env.DB.sqlite.prepare(statement).get(...params);
  const anfrage = (path, { method = 'GET', session, body } = {}) => worker.fetch(new Request(`https://ptm.test${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session ? { Cookie: `ptm_session=${session}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  const platz = async () => (await (await anfrage('/api/places')).json()).places.find((entry) => entry.id === 'p1');
  const speichern = (extra = {}) => anfrage('/api/places/p1', {
    method: 'PUT', session: 'admin-session', body: { name: 'Platz', address: 'Marköbeler Str. 11 a, 61130 Nidderau', venueType: 'outdoor', courtCount: 0, ...extra },
  });

  beforeEach(() => {
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ lat: '50.2', lon: '8.9', display_name: 'Nidderau' }]))));
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, first_name, last_name, password_salt, password_hash, created_at, updated_at)
      VALUES ('admin', 'admin@example.test', 'admin', 'Ad', 'Min', 's', 'h', '2026-09-01', '2026-09-01'),
             ('raffi', 'raffi@example.test', 'user', 'Raffi', 'R', 's', 'h', '2026-09-01', '2026-09-01'),
             ('vereinschef', 'chef@example.test', 'user', 'Chef', 'C', 's', 'h', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('admin-session', 'admin', '2099-01-01T00:00:00.000Z', '2026-09-01'),
             ('raffi-session', 'raffi', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO clubs (id, name, status, owner_id, member_of, created_at, updated_at)
      VALUES ('c1', 'Boules Brothers', 'published', 'admin', '["Hessischer Petanque Verband"]', '2026-09-01', '2026-09-01'),
             ('c2', 'Eigener Verein', 'published', 'vereinschef', '["Hessischer Petanque Verband"]', '2026-09-01', '2026-09-01'),
             ('c3', 'Admin ohne Verband', 'published', 'admin', '[]', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, status, created_at, updated_at)
      VALUES ('p1', 'c1', 'Platz', 'Marköbeler Str. 11 a, 61130 Nidderau', 50.2, 8.9, 'published', '2026-09-01', '2026-09-01'),
             ('p2', 'c2', 'Platz 2', 'Hauptstr. 1, Ort', 50.3, 8.8, 'published', '2026-09-01', '2026-09-01'),
             ('p3', 'c3', 'Platz 3', 'Nebenstr. 2, Ort', 50.4, 8.7, 'published', '2026-09-01', '2026-09-01')`);
    // UPDATE-Teil der Migration auf die Testdaten anwenden (die Spalte legt d1MitSchema bereits an).
    env.DB.sqlite.exec(migrationSql('0123_boule_place_address_unverified.sql').split(/;\s*\n/).find((part) => part.includes('UPDATE boule_places')));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('kennzeichnet nur Plätze importierter Verbandsvereine, die noch dem Admin gehören', async () => {
    const flags = env.DB.sqlite.prepare('SELECT id, address_unverified AS flag FROM boule_places ORDER BY id').all();
    expect(flags).toEqual([{ id: 'p1', flag: 1 }, { id: 'p2', flag: 0 }, { id: 'p3', flag: 0 }]);
    expect((await platz()).addressUnverified).toBe(true);
  });

  it('bleibt beim Speichern ohne Adressänderung gekennzeichnet, bis die Adresse bestätigt wird', async () => {
    expect((await speichern()).status).toBe(200);
    expect(zeile("SELECT address_unverified AS flag FROM boule_places WHERE id = 'p1'").flag).toBe(1);

    await speichern({ addressVerified: true });
    expect(zeile("SELECT address_unverified AS flag FROM boule_places WHERE id = 'p1'").flag).toBe(0);
  });

  it('gilt als geprüft, sobald die Adresse geändert wird', async () => {
    await speichern({ address: 'Limesstraße, 61130 Nidderau-Ostheim' });
    expect(zeile("SELECT address_unverified AS flag FROM boule_places WHERE id = 'p1'").flag).toBe(0);
  });

  it('schickt eine Korrektur als Postbox-Nachricht an die Verantwortlichen, mit Platz und Link', async () => {
    const response = await anfrage('/api/places/p1/address-correction', { method: 'POST', session: 'raffi-session', body: { body: 'Der Platz liegt in der Limesstraße.' } });
    expect(response.status).toBe(201);
    const nachricht = zeile('SELECT sender_id, recipient_id, kind, body FROM postbox_messages');
    expect(nachricht).toMatchObject({ sender_id: 'raffi', recipient_id: 'admin', kind: 'direct' });
    expect(nachricht.body).toContain('Limesstraße');
    expect(nachricht.body).toContain('/plaetze#p1');
  });

  it('verlangt eine Anmeldung und einen Text', async () => {
    expect((await anfrage('/api/places/p1/address-correction', { method: 'POST', body: { body: 'x' } })).status).toBe(401);
    expect((await anfrage('/api/places/p1/address-correction', { method: 'POST', session: 'raffi-session', body: { body: '' } })).status).toBe(400);
  });
});
