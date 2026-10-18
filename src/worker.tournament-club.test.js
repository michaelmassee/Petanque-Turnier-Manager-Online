// @vitest-environment node
// Ausrichtender Verein am Turnier: wird beim Anlegen gespeichert und, falls leer,
// vom verknüpften Spielort übernommen (gewählt oder über die Adresse zugeordnet). Bei gleicher Adresse gewinnt der Vereinsplatz (0114).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

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
