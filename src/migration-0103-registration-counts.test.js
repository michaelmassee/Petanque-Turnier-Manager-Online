// @vitest-environment node
// Migration 0103: Aktive Meldungen und Warteliste werden per Trigger am Turnier gezählt; die Turnierliste lädt
// Bearbeiter, Owner und Ersteller gesammelt nach statt per Unterabfrage pro Turnier.
import { describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { getTournamentById, withTournamentPeople } from './worker.js';

function aufbauen() {
  const db = d1MitSchema();
  db.sqlite.exec(`INSERT INTO users (id, email, role, first_name, last_name, username, password_salt, password_hash, created_at, updated_at)
    VALUES ('owner', 'owner@example.test', 'user', 'Olga', 'Owner', 'olga', 's', 'h', '2026-01-01', '2026-01-01'),
           ('ed', 'ed@example.test', 'user', 'Ede', 'Editor', 'ede', 's', 'h', '2026-01-01', '2026-01-01');
    INSERT INTO tournaments (id, owner_id, creator_id, name, date, location, formation, status, visibility, created_at, updated_at)
    VALUES ('t1', 'owner', 'ed', 'T1', '2099-01-01', 'Ort', 'doublette', 'registration', 'public', '2026-01-01', '2026-01-01'),
           ('t2', 'owner', NULL, 'T2', '2099-01-02', 'Ort', 'doublette', 'registration', 'public', '2026-01-01', '2026-01-01');
    INSERT INTO tournament_editors (id, tournament_id, user_id, created_at)
    VALUES ('e1', 't1', 'ed', '2026-01-01'), ('e2', 't1', 'owner', '2026-01-01')`);
  const melden = (id, tournamentId, status) => db.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name,
      email, status, participation, registered_at, created_at, updated_at, execution_revision, language)
    VALUES (?, ?, 'A', 'B', 'a@example.test', ?, 'inactive', '2026-01-01', '2026-01-01', '2026-01-01', 1, 'de')`).run(id, tournamentId, status);
  const zahlen = (id) => db.sqlite.prepare('SELECT active_registrations AS a, waitlist_registrations AS w FROM tournaments WHERE id = ?').get(id);
  return { db, melden, zahlen };
}

describe('Migration 0103 (Meldezahlen als Spalten)', () => {
  it('zählt bei Anmelden, Statuswechsel, Umhängen und Löschen mit', () => {
    const { db, melden, zahlen } = aufbauen();
    melden('r1', 't1', 'pending');
    melden('r2', 't1', 'confirmed');
    melden('r3', 't1', 'waitlist');
    melden('r4', 't1', 'cancelled');
    expect(zahlen('t1')).toEqual({ a: 2, w: 1 });

    db.sqlite.exec("UPDATE registrations SET status = 'confirmed' WHERE id = 'r3'");
    db.sqlite.exec("UPDATE registrations SET status = 'rejected' WHERE id = 'r1'");
    expect(zahlen('t1')).toEqual({ a: 2, w: 0 });

    db.sqlite.exec("UPDATE registrations SET tournament_id = 't2' WHERE id = 'r2'");
    expect(zahlen('t1')).toEqual({ a: 1, w: 0 });
    expect(zahlen('t2')).toEqual({ a: 1, w: 0 });

    db.sqlite.exec("DELETE FROM registrations WHERE id = 'r3'");
    expect(zahlen('t1')).toEqual({ a: 0, w: 0 });
  });

  it('lädt Personen für die Liste genauso wie die Einzelabfrage', async () => {
    const { db } = aufbauen();
    const rows = db.sqlite.prepare('SELECT * FROM tournaments ORDER BY id').all();
    const liste = await withTournamentPeople(db, rows);

    for (const row of liste) {
      const einzeln = await getTournamentById(db, row.id);
      expect(JSON.parse(row.editors_json)).toEqual(JSON.parse(einzeln.editors_json));
      expect(JSON.parse(row.owner_json)).toEqual(JSON.parse(einzeln.owner_json));
      expect(row.creator_json === null ? null : JSON.parse(row.creator_json)).toEqual(einzeln.creator_json === null ? null : JSON.parse(einzeln.creator_json));
    }
    expect(JSON.parse(liste[0].editors_json)).toEqual([{ id: 'ed', firstName: 'Ede', lastName: 'Editor', username: 'ede' }]);
    expect(liste[1].creator_json).toBeNull();
  });
});
