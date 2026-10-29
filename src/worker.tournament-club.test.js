// @vitest-environment node
// Ausrichtender Verein am Turnier: wird beim Anlegen gespeichert und, falls leer,
// vom verknüpften Spielort übernommen (gewählt oder über die Adresse zugeordnet). Bei gleicher Adresse gewinnt der Vereinsplatz (0114).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { duplicateTournament } from './worker.js';
import { quickStartPayload, quickStartTemplates } from './lib/quickstart-templates.js';

// Schnellstart-Payload im Worker-Test ohne Browser-Spracheinstellung erzeugen.
vi.mock('./lib/i18next-config.js', () => ({ default: { t: (key) => key } }));

describe('Ausrichtender Verein am Turnier', () => {
  let env;
  const sql = (query, ...args) => env.DB.sqlite.prepare(query).run(...args);
  const club = (id) => env.DB.sqlite.prepare('SELECT club, boule_place_id FROM tournaments WHERE id = ?').get(id);
  const create = async (body) => {
    const response = await worker.fetch(new Request('https://ptm.test/api/tournaments', {
      method: 'POST', headers: { Cookie: 'ptm_session=session1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Neues Turnier', date: '2099-07-02', location: 'Berlin', latitude: 52.52, longitude: 13.405, ...body }),
    }), env);
    expect(response.status).toBe(201);
    return (await response.json()).tournament;
  };

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { sendBatch: vi.fn(async () => {}) } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, language, created_at, updated_at)
      VALUES ('u1', 'one@example.test', 'admin', 's', 'h', 'de', '2026-10-13', '2026-10-13')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('session1', 'u1', '2199-01-01', '2026-10-13')`);
    sql(`INSERT INTO clubs (id, name, status, owner_id, created_at, updated_at)
      VALUES ('c1', 'BC Linden', 'published', 'u1', '2026-10-13', '2026-10-13')`);
    sql(`INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, status, created_at, updated_at) VALUES
      ('p-frei', NULL, 'Allgemeiner Platz', 'Parkweg 1, Linden', 50, 8, 'published', '2026-10-13', '2026-10-13'),
      ('p-club', 'c1', 'Vereinsplatz', 'Parkweg 1, Linden', 50, 8, 'published', '2026-10-13', '2026-10-13')`);
  });
  afterEach(() => env.DB.sqlite.close());

  it.each([null, 'c1'])('ordnet beim Schnellstart den Profilverein und sein Logo zu (Vereins-ID %s)', async (clubId) => {
    sql("UPDATE clubs SET logo_url = 'https://example.test/club.png' WHERE id = 'c1'");
    const payload = quickStartPayload(quickStartTemplates('doublette')[0], {
      currentUser: { firstName: 'Olga', lastName: 'Orga', club: 'BC Linden', clubId },
      today: '2099-07-02', fallbackLocation: 'Schnellstart',
    });
    const tournament = await create({ ...payload, latitude: 52.52, longitude: 13.405 });
    expect(tournament).toMatchObject({ club: 'BC Linden', organizerClubId: 'c1', logoUrl: 'https://example.test/club.png' });
  });

  it('verknüpft den Veranstalter ohne passenden Spielort und priorisiert sein Logo', async () => {
    sql("UPDATE clubs SET logo_url = 'https://example.test/club.png' WHERE id = 'c1'");
    const point = { latitude: 50.5009807, longitude: 8.4167299 };
    const tournament = await create({ club: ' bc linden ', ...point });
    expect(tournament).toMatchObject({ ...point, organizerClubId: 'c1', boulePlaceId: null,
      logoUrl: 'https://example.test/club.png', customLogoUrl: null });
    const custom = await create({ organizerClubId: 'c1', club: 'alter Name', logoUrl: 'https://example.test/custom.png', ...point });
    expect(custom).toMatchObject({ club: 'BC Linden', organizerClubId: 'c1',
      logoUrl: 'https://example.test/custom.png', customLogoUrl: 'https://example.test/custom.png' });
  });

  it('behält die Vereins-ID nach Umbenennung beim Bearbeiten', async () => {
    const tournament = await create({ club: 'BC Linden' });
    sql("UPDATE clubs SET name = 'Neuer Name', logo_url = 'https://example.test/new.png' WHERE id = 'c1'");
    const response = await worker.fetch(new Request(`https://ptm.test/api/tournaments/${tournament.id}`, {
      method: 'PUT', headers: { Cookie: 'ptm_session=session1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...tournament, organizerClubId: 'c1', name: 'Bearbeitet' }),
    }), env);
    expect(response.status).toBe(200);
    expect((await response.json()).tournament).toMatchObject({ organizerClubId: 'c1', club: 'Neuer Name', logoUrl: 'https://example.test/new.png' });
  });

  it('behält Veranstalter beim Kopieren nach Umbenennung und fällt auf das Spielortlogo zurück', async () => {
    sql("UPDATE clubs SET logo_url = 'https://example.test/venue.png' WHERE id='c1'");
    sql(`INSERT INTO clubs (id,name,status,logo_url,owner_id,created_at,updated_at)
      VALUES ('c2','Gastverein','published','https://example.test/organizer.png','u1','2026','2026')`);
    const tournament = await create({ club: 'Gastverein', boulePlaceId: 'p-club' });
    expect(tournament.logoUrl).toBe('https://example.test/organizer.png');
    sql("UPDATE clubs SET name='Gastverein umbenannt' WHERE id='c2'");
    const stored = env.DB.sqlite.prepare('SELECT * FROM tournaments WHERE id=?').get(tournament.id);
    const copy = await duplicateTournament(env.DB, stored, { id: 'u1' });
    expect(copy.organizer_club_id).toBe('c2');
    expect(copy.organizer_club_logo_url).toBe('https://example.test/organizer.png');
    sql("UPDATE clubs SET logo_url=NULL WHERE id='c2'");
    const response = await worker.fetch(new Request(`https://ptm.test/api/tournaments/${tournament.id}`, {
      headers: { Cookie: 'ptm_session=session1' },
    }), env);
    expect((await response.json()).tournament.logoUrl).toBe('https://example.test/venue.png');
  });

  it('lehnt unbekannte Veranstalter-IDs vor dem Anlegen ab', async () => {
    const response = await worker.fetch(new Request('https://ptm.test/api/tournaments', {
      method: 'POST', headers: { Cookie: 'ptm_session=session1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizerClubId: 'missing' }),
    }), env);
    expect(response.status).toBe(400);
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournaments').get().count).toBe(0);
  });

  it('speichert importierte Koordinaten am verknüpften Platz und behält sie bei späteren Bearbeitungen', async () => {
    const point = { latitude: 50.5000636, longitude: 8.4206376 };
    const created = await create({ boulePlaceId: 'p-club', overrideCoordinates: true, ...point });
    expect(created).toMatchObject({ ...point, boulePlaceId: 'p-club', location: 'Parkweg 1, Linden' });
    const update = (extra) => worker.fetch(new Request(`https://ptm.test/api/tournaments/${created.id}`, {
      method: 'PUT', headers: { Cookie: 'ptm_session=session1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Geänderter Name', date: '2099-07-02', location: created.location, boulePlaceId: 'p-club', ...extra }),
    }), env);
    // Ein wieder geöffnetes Formular sendet ohne Ortsauswahl oder manuelle Anpassung keine Koordinaten.
    const saved = await update({ overrideCoordinates: false });
    expect(saved.status).toBe(200);
    expect((await saved.json()).tournament).toMatchObject({ ...point, boulePlaceId: 'p-club', name: 'Geänderter Name' });
    const corrected = await update({ overrideCoordinates: true, latitude: 49.75, longitude: 7.5 });
    expect(corrected.status).toBe(200);
    expect((await corrected.json()).tournament).toMatchObject({ latitude: 49.75, longitude: 7.5, boulePlaceId: 'p-club' });
    // Die erneute Auswahl des Platzes darf wieder dessen Standardkoordinaten setzen.
    const selected = await update({ overrideCoordinates: false, latitude: 50, longitude: 8 });
    expect(selected.status).toBe(200);
    expect((await selected.json()).tournament).toMatchObject({ latitude: 50, longitude: 8 });
  });

  it('verwirft unvollständige manuelle Koordinaten auch bei gewähltem Platz', async () => {
    const response = await worker.fetch(new Request('https://ptm.test/api/tournaments', {
      method: 'POST', headers: { Cookie: 'ptm_session=session1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Turnier', date: '2099-07-02', location: 'Linden', boulePlaceId: 'p-club', overrideCoordinates: true, latitude: 50 }),
    }), env);
    expect(response.status).toBe(400);
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournaments').get().count).toBe(0);
  });

  it('speichert den eingegebenen Verein beim Anlegen', async () => {
    const tournament = await create({ club: 'Boulefreunde Mitte' });
    expect(tournament.club).toBe('Boulefreunde Mitte');
    expect(club(tournament.id).club).toBe('Boulefreunde Mitte');
  });

  it('übernimmt den Verein des gewählten Platzes nur, wenn keiner eingetragen ist', async () => {
    expect(club((await create({ boulePlaceId: 'p-club' })).id)).toEqual({ club: 'BC Linden', boule_place_id: 'p-club' });
    expect(club((await create({ boulePlaceId: 'p-club', club: 'Gastverein' })).id).club).toBe('Gastverein');
    expect(club((await create({ boulePlaceId: 'p-frei' })).id).club).toBeNull();
  });

  it('übernimmt den Verein auch, wenn die Adresse nur eingetippt wurde', async () => {
    const tournament = await create({ location: 'parkweg 1, linden', latitude: null, longitude: null });
    expect(club(tournament.id)).toEqual({ club: 'BC Linden', boule_place_id: 'p-club' });
    expect(tournament.club).toBe('BC Linden');
  });

  it('belegt den Verein beim Bearbeiten nach, wenn die neue Adresse zu einem Vereinsplatz passt', async () => {
    const tournament = await create({ location: 'Irgendwo 5', latitude: 1, longitude: 1 });
    expect(club(tournament.id)).toEqual({ club: null, boule_place_id: null });
    const response = await worker.fetch(new Request(`https://ptm.test/api/tournaments/${tournament.id}`, {
      method: 'PUT', headers: { Cookie: 'ptm_session=session1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Neues Turnier', date: '2099-07-02', location: 'Parkweg 1, Linden', latitude: 50, longitude: 8 }),
    }), env);
    expect(response.status).toBe(200);
    expect((await response.json()).tournament.club).toBe('BC Linden');
  });

  it('verknüpft über die Adresse zuerst den Vereinsplatz, sonst den Platz ohne Verein', async () => {
    const tournament = await create({ location: 'parkweg 1, linden', latitude: null, longitude: null });
    expect(club(tournament.id).boule_place_id).toBe('p-club');
    sql("UPDATE boule_places SET status = 'rejected' WHERE id = 'p-club'");
    const other = await create({ location: 'Parkweg 1, Linden', latitude: null, longitude: null });
    expect(club(other.id).boule_place_id).toBe('p-frei');
  });
});
