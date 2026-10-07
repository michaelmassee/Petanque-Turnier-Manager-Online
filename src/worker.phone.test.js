// @vitest-environment node
// Optionale Handynummer im Profil: Prüfung, Speichern, Löschen und Erhalt bei älteren Clients ohne Feld.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { createUser, normalizePhone, updateOwnProfile, updateUser } from './worker.js';

describe('Handynummer', () => {
  it('akzeptiert gängige Schreibweisen und lehnt Ungültiges ab', () => {
    expect(normalizePhone('  +49 171  1234567 ')).toBe('+49 171 1234567');
    expect(normalizePhone('0171/123-45 67')).toBe('0171/123-45 67');
    expect(normalizePhone('(0171) 1234567')).toBe('(0171) 1234567');
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(() => normalizePhone('12345')).toThrow('gültige Handynummer');
    expect(() => normalizePhone('0171 abc 1234')).toThrow('gültige Handynummer');
    expect(() => normalizePhone('49+171 1234567')).toThrow('gültige Handynummer');
    expect(() => normalizePhone('1'.repeat(16))).toThrow('gültige Handynummer');
  });

  describe('im Profil', () => {
    let db;
    const env = () => ({ DB: db });
    const url = new URL('http://localhost/api/me');
    const speichern = (felder) => updateOwnProfile(new Request(url, { method: 'PUT', body: JSON.stringify({
      firstName: 'Anna', lastName: 'Schmidt', email: 'anna@example.test', ...felder,
    }) }), env(), url, 'anna');
    const telefon = () => db.sqlite.prepare("SELECT phone FROM users WHERE id = 'anna'").get().phone;

    beforeEach(() => {
      db = d1MitSchema();
      db.sqlite.exec(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, email_verified_at, created_at, updated_at)
        VALUES ('anna', 'anna@example.test', 'Anna', 'Schmidt', 'user', 's', 'h', '2026-01-01', '2026-01-01', '2026-01-01')`);
    });

    it('speichert, liefert zurück und löscht die Nummer', async () => {
      const response = await speichern({ phone: '+49 171 1234567' });
      expect((await response.json()).user.phone).toBe('+49 171 1234567');
      expect(telefon()).toBe('+49 171 1234567');

      await speichern({ phone: '' });
      expect(telefon()).toBeNull();
    });

    it('lässt die Nummer unverändert, wenn ein älterer Client das Feld nicht mitschickt', async () => {
      await speichern({ phone: '+49 171 1234567' });
      await speichern({});
      expect(telefon()).toBe('+49 171 1234567');
    });

    it('lehnt eine ungültige Nummer ab, ohne etwas zu speichern', async () => {
      await expect(speichern({ phone: 'abc', club: 'Neu' })).rejects.toMatchObject({ status: 400 });
      expect(db.sqlite.prepare("SELECT club, phone FROM users WHERE id = 'anna'").get()).toEqual({ club: null, phone: null });
    });
  });

  describe('im Admin-Benutzerdialog', () => {
    let db;
    const anfrage = (body) => new Request('http://localhost/api/users', { method: 'POST', body: JSON.stringify(body) });
    const basis = { firstName: 'Anna', lastName: 'Schmidt', email: 'anna@example.test', role: 'user' };
    const telefon = () => db.sqlite.prepare("SELECT phone FROM users WHERE id = 'anna'").get().phone;
    const bearbeiten = (felder) => updateUser(anfrage({ ...basis, ...felder }), { DB: db }, 'anna', 'admin');

    beforeEach(() => {
      db = d1MitSchema();
      db.sqlite.exec(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, email_verified_at, created_at, updated_at) VALUES
        ('admin', 'admin@example.test', 'Ada', 'Admin', 'admin', 's', 'h', '2026-01-01', '2026-01-01', '2026-01-01'),
        ('anna', 'anna@example.test', 'Anna', 'Schmidt', 'user', 's', 'h', '2026-01-01', '2026-01-01', '2026-01-01')`);
    });

    it('setzt, ändert und löscht die Nummer beim Bearbeiten', async () => {
      const response = await bearbeiten({ phone: '0171 1234567' });
      expect((await response.json()).user.phone).toBe('0171 1234567');
      expect(telefon()).toBe('0171 1234567');

      await bearbeiten({ phone: '' });
      expect(telefon()).toBeNull();
    });

    it('lässt die Nummer unverändert, wenn das Feld fehlt, und lehnt ungültige Nummern ab', async () => {
      await bearbeiten({ phone: '0171 1234567' });
      await bearbeiten({});
      expect(telefon()).toBe('0171 1234567');

      await expect(bearbeiten({ phone: '12', lastName: 'Neu' })).rejects.toMatchObject({ status: 400 });
      expect(db.sqlite.prepare("SELECT last_name, phone FROM users WHERE id = 'anna'").get()).toEqual({ last_name: 'Schmidt', phone: '0171 1234567' });
    });

    it('speichert die Nummer beim Anlegen eines Kontos', async () => {
      const response = await createUser(anfrage({ ...basis, email: 'neu@example.test', password: `Test-${crypto.randomUUID()}`, phone: '+49 171 7654321' }), db);
      expect((await response.json()).user.phone).toBe('+49 171 7654321');
      expect(db.sqlite.prepare("SELECT phone FROM users WHERE email = 'neu@example.test'").get().phone).toBe('+49 171 7654321');
    });
  });
});
