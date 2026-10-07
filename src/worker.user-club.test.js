// @vitest-environment node
// Profil-Verein: Verknüpfung mit dem Vereinsverzeichnis (users.club_id), Namensabgleich bei Umbenennung
// und die einmalige Bereinigung der Bestandsdaten in Migration 0094.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema, migrationSql } from './test-support/d1.js';
import { updateClub, updateClubAsAdmin, updateOwnProfile } from './worker.js';

const clubBody = (name) => ({ name, contactName: 'Kontakt', contactEmail: 'kontakt@example.test' });

describe('Profil-Verein', () => {
  let db;
  const url = new URL('http://localhost/api/me');
  const speichern = (club) => updateOwnProfile(new Request(url, { method: 'PUT', body: JSON.stringify({
    firstName: 'Anna', lastName: 'Schmidt', email: 'anna@example.test', club,
  }) }), { DB: db }, url, 'anna');
  const profil = () => db.sqlite.prepare("SELECT club, club_id FROM users WHERE id = 'anna'").get();

  beforeEach(() => {
    db = d1MitSchema();
    db.sqlite.exec(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, email_verified_at, created_at, updated_at) VALUES
        ('admin', 'admin@example.test', 'Ada', 'Admin', 'admin', 's', 'h', '2026-01-01', '2026-01-01', '2026-01-01'),
        ('anna', 'anna@example.test', 'Anna', 'Schmidt', 'user', 's', 'h', '2026-01-01', '2026-01-01', '2026-01-01');
      INSERT INTO clubs (id, name, status, owner_id, created_at, updated_at) VALUES
        ('linden', 'Boule Club Linden e.V.', 'published', 'admin', '2026-01-01', '2026-01-01'),
        ('offen', 'Noch nicht freigegeben', 'pending', 'admin', '2026-01-01', '2026-01-01')`);
  });

  it('verknüpft einen freigegebenen Verein unabhängig von Groß-/Kleinschreibung und übernimmt dessen Schreibweise', async () => {
    const response = await speichern('boule club linden e.v.');
    expect((await response.json()).user).toMatchObject({ club: 'Boule Club Linden e.V.', clubId: 'linden' });
    expect(profil()).toEqual({ club: 'Boule Club Linden e.V.', club_id: 'linden' });
  });

  it('lässt Freitext und nicht freigegebene Vereine unverknüpft und löst eine Verknüpfung wieder', async () => {
    await speichern('Boule Club Linden e.V.');
    await speichern('KSG Bönstadt');
    expect(profil()).toEqual({ club: 'KSG Bönstadt', club_id: null });
    await speichern('Noch nicht freigegeben');
    expect(profil()).toEqual({ club: 'Noch nicht freigegeben', club_id: null });
    await speichern('');
    expect(profil()).toEqual({ club: null, club_id: null });
  });

  it('überträgt eine Umbenennung durch Verein oder Admin auf verknüpfte Profile', async () => {
    await speichern('Boule Club Linden e.V.');
    const admin = { id: 'admin', role: 'admin' };
    await updateClub(new Request(url, { method: 'PUT', body: JSON.stringify(clubBody('BC Linden 1990 e.V.')) }), db, 'linden', admin);
    expect(profil()).toEqual({ club: 'BC Linden 1990 e.V.', club_id: 'linden' });
    await updateClubAsAdmin(new Request(url, { method: 'PUT', body: JSON.stringify(clubBody('Boule Club Linden')) }), db, 'linden');
    expect(profil()).toEqual({ club: 'Boule Club Linden', club_id: 'linden' });
  });

  it('speichert Vereine mit Owner auch ohne Kontaktperson und -E-Mail, prüft sie aber, wenn angegeben', async () => {
    const admin = { id: 'admin', role: 'admin' };
    const put = (body) => new Request(url, { method: 'PUT', body: JSON.stringify(body) });
    await updateClub(put({ name: 'Boule Club Linden e.V.', contactName: '', contactEmail: '' }), db, 'linden', admin);
    expect(db.sqlite.prepare("SELECT contact_name, contact_email FROM clubs WHERE id = 'linden'").get()).toEqual({ contact_name: null, contact_email: null });
    await updateClubAsAdmin(put({ name: 'Boule Club Linden e.V.' }), db, 'linden');
    await expect(updateClub(put({ name: 'Boule Club Linden e.V.', contactEmail: 'keine-mail' }), db, 'linden', admin)).rejects.toMatchObject({ status: 400 });
    await expect(updateClubAsAdmin(put({ name: 'Boule Club Linden e.V.', contactName: 'A' }), db, 'linden')).rejects.toMatchObject({ status: 400 });
  });

  it('löst beim Löschen des Vereins nur die Verknüpfung, Konto und Vereinstext bleiben', async () => {
    await speichern('Boule Club Linden e.V.');
    db.sqlite.exec("DELETE FROM clubs WHERE id = 'linden'");
    expect(profil()).toEqual({ club: 'Boule Club Linden e.V.', club_id: null });
  });
});

describe('Migration 0094 (Bestandsdaten)', () => {
  it('benennt Petterweil korrekt und ordnet die Schreibvarianten den Vereinen zu', () => {
    const { sqlite } = d1MitSchema();
    const vereine = {
      a: '1. PC Petterweil', b: '1.P C Petterweil', c: 'Pc-petterweil', d: 'PCPetterweil', e: 'Peterweil',
      f: '1. Pétanque Club Petterweil', g: 'BC Linden', h: 'boule club linden e.v.', i: 'KSG Bönstadt 1927 e.V.', j: null,
    };
    sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('admin', 'admin@example.test', 'admin', 's', 'h', '2026-01-01', '2026-01-01');
      INSERT INTO clubs (id, name, status, owner_id, created_at, updated_at) VALUES
        ('pcp', '1. PC PETTERWEIL', 'published', 'admin', '2026-01-01', '2026-01-01'),
        ('linden', 'Boule Club Linden e.V.', 'published', 'admin', '2026-01-01', '2026-01-01')`);
    for (const [id, club] of Object.entries(vereine)) {
      sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, club, created_at, updated_at)
        VALUES (?, ?, 'user', 's', 'h', ?, '2026-01-01', '2026-01-01')`).run(id, `${id}@example.test`, club);
    }

    // Spalte und Index existieren schon (d1MitSchema); nur die Datenbereinigung erneut ausführen.
    sqlite.exec(migrationSql('0094_user_club_id.sql').replace(/^(ALTER TABLE|CREATE INDEX)[^;]*;/gm, ''));

    expect(sqlite.prepare("SELECT name FROM clubs WHERE id = 'pcp'").get().name).toBe('1.PC-Petterweil von 1986 e.V.');
    const profile = Object.fromEntries(sqlite.prepare("SELECT id, club, club_id FROM users WHERE email LIKE '_@example.test'").all()
      .map((row) => [row.id, { club: row.club, clubId: row.club_id }]));
    const petterweil = { club: '1.PC-Petterweil von 1986 e.V.', clubId: 'pcp' };
    const linden = { club: 'Boule Club Linden e.V.', clubId: 'linden' };
    expect(profile).toEqual({
      a: petterweil, b: petterweil, c: petterweil, d: petterweil, e: petterweil, f: petterweil,
      g: linden, h: linden,
      i: { club: 'KSG Bönstadt 1927 e.V.', clubId: null },
      j: { club: null, clubId: null },
    });
  });
});
