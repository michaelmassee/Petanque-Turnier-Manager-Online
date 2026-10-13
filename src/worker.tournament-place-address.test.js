// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema, migrationSql } from './test-support/d1.js';
import { getTournamentById, toPublicTournament } from './worker.js';

describe('Gespeicherte Bouleplatz-Zuordnung über die Adresse', () => {
  let db;
  const sql = (statement, ...params) => db.sqlite.prepare(statement).run(...params);
  const addPlace = (id, address, status = 'published', clubId = null) => sql(`
    INSERT INTO boule_places (id, name, address, status, club_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '2026-10-13', '2026-10-13')`, id, id, address, status, clubId);
  const addTournament = (id, location, placeId = null) => sql(`
    INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, boule_place_id, created_at, updated_at)
    VALUES (?, 'owner', ?, '2099-01-01', ?, 'doublette', 'registration', 'public', ?, '2026-10-13', '2026-10-13')`, id, id, location, placeId);
  const linkedPlace = (id) => db.sqlite.prepare('SELECT boule_place_id FROM tournaments WHERE id = ?').get(id).boule_place_id;

  beforeEach(() => {
    db = d1MitSchema();
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'owner@example.test', 'user', 'salt', 'hash', '2026-10-13', '2026-10-13')`);
  });

  it('speichert den eindeutigen veröffentlichten Platz beim Import und liefert dessen ID öffentlich', async () => {
    addPlace('p1', 'Parkweg 1, Linden');
    addTournament('t1', '  PARKWEG 1, LINDEN  ');

    expect(linkedPlace('t1')).toBe('p1');
    expect(toPublicTournament(await getTournamentById(db, 't1'), null).boulePlaceId).toBe('p1');
  });

  it('ordnet nach einer Adresskorrektur zu und behält ausdrücklich gewählte Plätze', () => {
    addPlace('p1', 'Parkweg 1, Linden');
    addPlace('p2', 'Hallenweg 2, Linden');
    addTournament('t1', 'Unbekannt');
    sql("UPDATE tournaments SET location = 'Parkweg 1, Linden' WHERE id = 't1'");
    expect(linkedPlace('t1')).toBe('p1');
    sql("UPDATE tournaments SET location = 'Hallenweg 2, Linden' WHERE id = 't1'");
    expect(linkedPlace('t1')).toBe('p1');
  });

  it('nimmt bei mehreren Treffern den ersten und behält eine ausdrückliche Auswahl', () => {
    addPlace('platz', 'Großgasse 18, Karben');
    addPlace('halle', 'Großgasse 18, Karben');
    addTournament('t1', 'Großgasse 18, Karben');
    expect(linkedPlace('t1')).toBe('halle');
    addTournament('t2', 'Großgasse 18, Karben', 'platz');
    expect(linkedPlace('t2')).toBe('platz');
  });

  it('berücksichtigt nur veröffentlichte Plätze und Vereine', () => {
    sql(`INSERT INTO clubs (id, name, status, owner_id, created_at, updated_at)
      VALUES ('club', 'Verein', 'pending', 'owner', '2026-10-13', '2026-10-13')`);
    addPlace('p1', 'Vereinsweg 1', 'published', 'club');
    addPlace('p2', 'Parkweg 2', 'pending');
    addTournament('t1', 'Vereinsweg 1');
    addTournament('t2', 'Parkweg 2');
    expect(linkedPlace('t1')).toBeNull();
    expect(linkedPlace('t2')).toBeNull();
    sql("UPDATE clubs SET status = 'published' WHERE id = 'club'");
    sql("UPDATE boule_places SET status = 'published' WHERE id = 'p2'");
    expect(linkedPlace('t1')).toBe('p1');
    expect(linkedPlace('t2')).toBe('p2');
  });

  it('verknüpft einen später neu angelegten Platz mit vorhandenen Turnieren', () => {
    addTournament('t1', 'Parkweg 1');
    addPlace('p1', 'Parkweg 1');
    expect(linkedPlace('t1')).toBe('p1');
  });

  it('trägt bestehende Zuordnungen bei der Migration nach', () => {
    db.sqlite.exec('DROP TRIGGER tournaments_place_address_insert; DROP TRIGGER tournaments_place_address_update;');
    addPlace('p1', 'Parkweg 1');
    addPlace('platz', 'Großgasse 18');
    addPlace('halle', 'Großgasse 18');
    addTournament('t1', 'Parkweg 1');
    addTournament('t2', 'Großgasse 18');
    const migration = migrationSql('0109_tournament_place_address_binding.sql');
    db.sqlite.exec(migration.slice(migration.indexOf('-- Vorhandene Turniere nachtragen')));
    expect(linkedPlace('t1')).toBe('p1');
    expect(linkedPlace('t2')).toBe('halle');
  });

  it('verwendet denselben Treffer für Platzlink und Logo und lässt ein eigenes Turnierlogo bestehen', async () => {
    sql(`INSERT INTO clubs (id, name, status, owner_id, logo_url, created_at, updated_at) VALUES
      ('club-a', 'A Verein', 'published', 'owner', 'https://example.test/a.png', '2026-10-13', '2026-10-13'),
      ('club-b', 'B Verein', 'published', 'owner', 'https://example.test/b.png', '2026-10-13', '2026-10-13')`);
    addPlace('p-b', 'Parkweg 1', 'published', 'club-b');
    addPlace('p-a', 'Parkweg 1', 'published', 'club-a');
    addTournament('t1', 'Parkweg 1');
    const tournament = toPublicTournament(await getTournamentById(db, 't1'), null);
    expect(tournament.boulePlaceId).toBe('p-a');
    expect(tournament.logoUrl).toBe('https://example.test/a.png');
    sql("UPDATE tournaments SET boule_place_id = 'p-b' WHERE id = 't1'");
    expect(toPublicTournament(await getTournamentById(db, 't1'), null).logoUrl).toBe('https://example.test/b.png');
    sql("UPDATE tournaments SET logo_url = 'https://example.test/own.png' WHERE id = 't1'");
    expect(toPublicTournament(await getTournamentById(db, 't1'), null)).toMatchObject({ boulePlaceId: 'p-b', logoUrl: 'https://example.test/own.png' });
  });

  it('nutzt wie die Logo-Zuordnung auch gleiche Koordinaten trotz abweichender Adressschreibweise', async () => {
    addPlace('p1', 'Großgasse 18, Karben');
    sql("UPDATE boule_places SET latitude = 50.2, longitude = 8.7 WHERE id = 'p1'");
    addTournament('t1', 'Karben, Großgasse 18');
    sql("UPDATE tournaments SET latitude = 50.2, longitude = 8.7 WHERE id = 't1'");
    expect(toPublicTournament(await getTournamentById(db, 't1'), null).boulePlaceId).toBe('p1');
  });
});
