// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { migrationSql, migrationsDir } from './test-support/d1.js';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
let db;
afterEach(() => db?.close());
function setup() {
  db = new DatabaseSync(':memory:');
  readdirSync(migrationsDir).filter((name) => name.endsWith('.sql') && name < '0141').sort()
    .forEach((name) => db.exec(migrationSql(name)));
  db.exec(`INSERT INTO users (id,email,role,password_salt,password_hash,created_at,updated_at)
    VALUES ('u','u@example.test','admin','s','h','2026','2026');
    INSERT INTO clubs (id,name,status,logo_url,owner_id,created_at,updated_at)
    VALUES ('c','Boule Team Braunfels e.V.','published','https://example.test/logo.png','u','2026','2026');
    INSERT INTO tournaments (id,owner_id,name,date,location,club,latitude,longitude,formation,status,visibility,created_at,updated_at)
    VALUES ('t','u','Schlosspokal','2027-07-03','Boule-Park Bonbaden',' boule team braunfels e.v. ',50.5009807,8.4167299,'doublette','registration','public','2026','2026');`);
  db.exec(migrationSql('0141_tournament_organizer_club.sql'));
}
const row = () => db.prepare("SELECT organizer_club_id, organizer_club_logo_url, latitude, longitude, boule_place_id, logo_url FROM tournaments WHERE id='t'").get();

describe('Veranstalterlogo unabhängig vom Spielort', () => {
  it('ordnet bestehende Einträge zu, ohne Position oder eigenes Logo zu verändern', () => {
    setup();
    expect(row()).toEqual({ organizer_club_id: 'c', organizer_club_logo_url: 'https://example.test/logo.png',
      latitude: 50.5009807, longitude: 8.4167299, boule_place_id: null, logo_url: null });
  });

  it('behält die ID bei Vereinsumbenennung und aktualisiert Logo und Sichtbarkeit', () => {
    setup();
    db.exec("UPDATE clubs SET name='Neuer Vereinsname', logo_url='https://example.test/new.png' WHERE id='c'");
    expect(row()).toMatchObject({ organizer_club_id: 'c', organizer_club_logo_url: 'https://example.test/new.png' });
    db.exec("UPDATE clubs SET status='pending' WHERE id='c'");
    expect(row().organizer_club_logo_url).toBeNull();
    db.exec("UPDATE clubs SET status='published' WHERE id='c'");
    expect(row().organizer_club_logo_url).toBe('https://example.test/new.png');
  });

  it('löst geänderte Freitextvereine neu auf und verknüpft später veröffentlichte Vereine', () => {
    setup();
    db.exec("UPDATE tournaments SET club='Neuer Verein' WHERE id='t'");
    expect(row().organizer_club_id).toBeNull();
    db.exec(`INSERT INTO clubs (id,name,status,logo_url,owner_id,created_at,updated_at)
      VALUES ('new','Neuer Verein','pending','https://example.test/new.png','u','2026','2026')`);
    expect(row().organizer_club_id).toBeNull();
    db.exec("UPDATE clubs SET status='published' WHERE id='new'");
    expect(row()).toMatchObject({ organizer_club_id: 'new', organizer_club_logo_url: 'https://example.test/new.png' });
  });

  it('entfernt ein gelöschtes Vereinslogo und ordnet neue Einträge beim Schreiben zu', () => {
    setup();
    db.exec("DELETE FROM tournaments WHERE id='t'");
    db.exec(`INSERT INTO tournaments (id,owner_id,name,date,location,club,formation,status,visibility,created_at,updated_at)
      VALUES ('t','u','Neu','2027-07-03','Anderer Ort','Boule Team Braunfels e.V.','doublette','registration','public','2026','2026')`);
    expect(row().organizer_club_id).toBe('c');
    db.exec("DELETE FROM clubs WHERE id='c'");
    expect(row()).toMatchObject({ organizer_club_id: null, organizer_club_logo_url: null });
  });
});
