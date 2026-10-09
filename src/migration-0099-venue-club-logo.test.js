// @vitest-environment node
// Migration 0099: Das Vereinslogo des Spielorts wird per Trigger beim Schreiben am Turnier gespeichert,
// statt bei jedem Abruf der Turnierliste berechnet zu werden.
import { describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';

function aufbauen() {
  const { sqlite } = d1MitSchema();
  sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
    VALUES ('owner', 'owner@example.test', 'user', 's', 'h', '2026-01-01', '2026-01-01');
    INSERT INTO clubs (id, name, logo_url, status, owner_id, created_at, updated_at)
    VALUES ('c1', 'Boule Club', 'https://example.test/logo.png', 'published', 'owner', '2026-01-01', '2026-01-01');
    INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, status, created_at, updated_at)
    VALUES ('p1', 'c1', 'Platz', 'Hauptstr. 1, Ort', 50.5, 9.5, 'published', '2026-01-01', '2026-01-01')`);
  const turnier = (id, { location = 'Irgendwo', latitude = null, longitude = null, boulePlaceId = null } = {}) => sqlite
    .prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, latitude, longitude, boule_place_id, formation,
        status, visibility, created_at, updated_at)
      VALUES (?, 'owner', 'T', '2099-01-01', ?, ?, ?, ?, 'doublette', 'registration', 'public', '2026-01-01', '2026-01-01')`)
    .run(id, location, latitude, longitude, boulePlaceId);
  const logo = (id) => sqlite.prepare('SELECT venue_club_logo_url AS logo FROM tournaments WHERE id = ?').get(id).logo;
  return { sqlite, turnier, logo };
}

describe('Migration 0099 (Vereinslogo des Spielorts als Spalte)', () => {
  it('setzt das Logo beim Anlegen über verknüpften Platz, Koordinaten oder Adresse', () => {
    const { turnier, logo } = aufbauen();
    turnier('verknuepft', { boulePlaceId: 'p1' });
    turnier('koordinaten', { latitude: 50.5, longitude: 9.5 });
    turnier('adresse', { location: ' hauptstr. 1, ort ' });
    turnier('fremd', { latitude: 1, longitude: 1 });

    expect(logo('verknuepft')).toBe('https://example.test/logo.png');
    expect(logo('koordinaten')).toBe('https://example.test/logo.png');
    expect(logo('adresse')).toBe('https://example.test/logo.png');
    expect(logo('fremd')).toBeNull();
  });

  it('rechnet neu, wenn sich Spielort, Platz oder Verein ändert', () => {
    const { sqlite, turnier, logo } = aufbauen();
    turnier('t1', { latitude: 1, longitude: 1 });
    expect(logo('t1')).toBeNull();

    sqlite.exec("UPDATE tournaments SET latitude = 50.5, longitude = 9.5 WHERE id = 't1'");
    expect(logo('t1')).toBe('https://example.test/logo.png');

    sqlite.exec("UPDATE clubs SET logo_url = 'https://example.test/neu.png' WHERE id = 'c1'");
    expect(logo('t1')).toBe('https://example.test/neu.png');

    sqlite.exec("UPDATE clubs SET status = 'rejected' WHERE id = 'c1'");
    expect(logo('t1')).toBeNull();

    sqlite.exec("UPDATE clubs SET status = 'published' WHERE id = 'c1'");
    sqlite.exec("UPDATE boule_places SET latitude = 2 WHERE id = 'p1'");
    expect(logo('t1')).toBeNull();

    sqlite.exec(`INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, venue_type, status, created_at,
        updated_at)
      VALUES ('p2', 'c1', 'Halle', 'Nebenstr. 2', 50.5, 9.5, 'indoor', 'published', '2026-01-01', '2026-01-01')`);
    expect(logo('t1')).toBe('https://example.test/neu.png');

    sqlite.exec("DELETE FROM boule_places WHERE id = 'p2'");
    expect(logo('t1')).toBeNull();
  });

  it('liefert kein Logo, wenn mehrere Vereine am selben Ort spielen', () => {
    const { sqlite, turnier, logo } = aufbauen();
    turnier('t1', { latitude: 50.5, longitude: 9.5 });
    sqlite.exec(`INSERT INTO clubs (id, name, logo_url, status, owner_id, created_at, updated_at)
      VALUES ('c2', 'Zweiter Club', 'https://example.test/zwei.png', 'published', 'owner', '2026-01-01', '2026-01-01');
      INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, status, created_at, updated_at)
      VALUES ('p2', 'c2', 'Platz 2', 'Nebenstr. 2', 50.5, 9.5, 'published', '2026-01-01', '2026-01-01')`);
    expect(logo('t1')).toBeNull();
  });
});
