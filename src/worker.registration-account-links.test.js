// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  findMyLiveRegistration, getRegistrationWithTournament, linkUnlinkedRegistrationsForUser, listMyLiveRegistrations,
  resolveRegistrationUserIds, updateRegistration, updateUser, verifyEmail,
} from './worker.js';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const migrationsDir = new URL('../migrations/', import.meta.url);
// The backfill statements of 0080, re-run on rows inserted after the schema setup.
const accountLinkMigration = readFileSync(new URL('0080_registration_account_links.sql', migrationsDir), 'utf8');
const accountLinkBackfill = accountLinkMigration.slice(accountLinkMigration.indexOf('UPDATE registrations'));

function d1WithSchema() {
  const sqlite = new DatabaseSync(':memory:');
  readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
    .forEach((name) => sqlite.exec(readFileSync(new URL(name, migrationsDir), 'utf8')));
  const db = {
    sqlite,
    batch: async (statements) => {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
    prepare(sql) {
      let params = [];
      const statement = {
        bind: (...values) => { params = values; return statement; },
        run: async () => ({ success: true, meta: { changes: sqlite.prepare(sql).run(...params).changes } }),
        first: async () => sqlite.prepare(sql).get(...params) ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
      };
      return statement;
    },
  };
  return db;
}

function insertUsers(db, ...users) {
  for (const [id, email] of users) {
    db.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES (?, ?, 'user', 'salt', 'hash', '2026-01-01', '2026-01-01')`).run(id, email);
  }
}

function insertTripletteRegistration(db, emails) {
  db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
    VALUES ('t1', 'u1', 'Turnier', '2026-01-02', 'Ort', 'triplette', 'registration', 'public', '2026-01-01', '2026-01-01')`).run();
  db.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, partner_first_name, partner_last_name, partner_email, partner2_first_name, partner2_last_name, partner2_email, status, registered_at, created_at, updated_at)
    VALUES ('r1', 't1', 'Anna', 'A', ?, 'Ben', 'B', ?, 'Clara', 'C', ?, 'confirmed', '2026-01-01', '2026-01-01', '2026-01-01')`).run(...emails);
}

function accountLinks(db) {
  return db.sqlite.prepare("SELECT user_id, partner_user_id, partner2_user_id FROM registrations WHERE id = 'r1'").get();
}

async function tokenHash(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('stabile Konto-Verknüpfungen von Anmeldungen', () => {
  it('füllt alle Teamrollen beim Migrieren und setzt sie beim Konto-Löschen zurück', () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'anna@example.test'], ['u2', 'ben@example.test'], ['u3', 'clara@example.test']);
    insertTripletteRegistration(db, ['ANNA@example.test', 'ben@example.test', 'clara@example.test']);
    db.sqlite.exec(accountLinkBackfill);
    expect(accountLinks(db)).toEqual({ user_id: 'u1', partner_user_id: 'u2', partner2_user_id: 'u3' });

    db.sqlite.prepare("DELETE FROM users WHERE id = 'u2'").run();
    expect(accountLinks(db).partner_user_id).toBeNull();
  });

  it('verknüpft ein Konto beim Migrieren nur mit dem ersten Teammitglied derselben E-Mail', () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'anna@example.test'], ['u3', 'clara@example.test']);
    insertTripletteRegistration(db, ['anna@example.test', 'Anna@example.test', 'clara@example.test']);
    db.sqlite.exec(accountLinkBackfill);
    expect(accountLinks(db)).toEqual({ user_id: 'u1', partner_user_id: null, partner2_user_id: 'u3' });
  });

  it('lässt Konten ungeklärt, die sich nur in der Groß-/Kleinschreibung unterscheiden', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'anna@example.test'], ['u1b', 'Anna@example.test']);
    insertTripletteRegistration(db, ['anna@example.test', null, null]);
    db.sqlite.exec(accountLinkBackfill);
    expect(accountLinks(db).user_id).toBeNull();
    await expect(resolveRegistrationUserIds(db, { email: 'anna@example.test' }))
      .resolves.toEqual({ userId: null, partnerUserId: null, partner2UserId: null });
  });

  it('vergibt bei gemeinsamer E-Mail im Team das Konto nur an den ersten Platz', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'anna@example.test'], ['u2', 'ben@example.test']);
    await expect(resolveRegistrationUserIds(db, {
      email: 'ben@example.test', partnerEmail: 'anna@example.test', partner2Email: 'ANNA@example.test',
    })).resolves.toEqual({ userId: 'u2', partnerUserId: 'u1', partner2UserId: null });
  });

  it('verknüpft ein nachträglich angelegtes Konto nur mit einem Platz pro Anmeldung', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'owner@example.test']);
    insertTripletteRegistration(db, ['ben@example.test', 'anna@example.test', 'anna@example.test']);
    insertUsers(db, ['u2', 'anna@example.test']);
    await linkUnlinkedRegistrationsForUser(db, 'u2', 'Anna@example.test');
    expect(accountLinks(db)).toEqual({ user_id: null, partner_user_id: 'u2', partner2_user_id: null });
  });

  it('verknüpft Anmeldungen nach der Bestätigung einer neuen Konto-E-Mail', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'alt@example.test']);
    insertTripletteRegistration(db, ['neu@example.test', null, null]);
    const verificationToken = 'email-change-token';
    db.sqlite.prepare(`INSERT INTO email_verification_tokens (token_hash, user_id, expires_at, created_at, new_email)
      VALUES (?, 'u1', '2099-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'neu@example.test')`).run(await tokenHash(verificationToken));

    await expect(verifyEmail(new Request('https://example.test/api/email/verify', {
      method: 'POST', body: JSON.stringify({ token: verificationToken }),
    }), db)).resolves.toMatchObject({ status: 200 });

    expect(accountLinks(db).user_id).toBe('u1');
  });

  it('verknüpft Anmeldungen auch nach einer administrativen E-Mail-Änderung', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'alt@example.test']);
    insertTripletteRegistration(db, ['neu@example.test', null, null]);
    const request = new Request('https://example.test/api/users/u1', {
      method: 'PUT',
      body: JSON.stringify({
        firstName: 'Anna', lastName: 'Admin', email: 'neu@example.test', role: 'user', emailVerified: true,
      }),
    });

    await expect(updateUser(request, { DB: db }, 'u1', 'admin')).resolves.toMatchObject({ status: 200 });

    expect(accountLinks(db).user_id).toBe('u1');
  });

  it('gibt die Live-Ansicht über die gespeicherte ID auch nach einer E-Mail-Änderung frei', async () => {
    const db = d1WithSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'owner@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('player', 'new-address@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'owner', 'Live', '2099-01-01', 'Ort', 'doublette', 'running', 'public', '2026-01-01', '2026-01-01')`).run();
    db.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, registered_at, created_at, updated_at, user_id)
      VALUES ('r1', 't1', 'Anna', 'A', 'old-address@example.test', 'confirmed', '2026-01-01', '2026-01-01', '2026-01-01', 'player')`).run();

    await expect(findMyLiveRegistration(db, { id: 'player', email: 'new-address@example.test' }, 'r1')).resolves.toMatchObject({ id: 'r1' });
    const response = await listMyLiveRegistrations(db, { id: 'player', email: 'new-address@example.test' });
    expect((await response.json()).registrations).toHaveLength(1);
  });

  it('behält die Verknüpfung bei gleicher E-Mail und verknüpft eine korrigierte E-Mail neu', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'anna@example.test'], ['u2', 'ben@example.test'], ['u3', 'clara@example.test'], ['u4', 'dora@example.test']);
    insertTripletteRegistration(db, ['anna@example.test', 'ben@example.test', 'clara@example.test']);
    db.sqlite.exec(accountLinkBackfill);
    // The player's account e-mail changed meanwhile; the registration keeps the old contact address.
    db.sqlite.prepare("UPDATE users SET email = 'anna-neu@example.test' WHERE id = 'u1'").run();

    const edit = async (emails) => {
      const existing = await getRegistrationWithTournament(db, 'r1');
      const request = new Request('https://example.test/api/registrations/r1', {
        method: 'PUT',
        body: JSON.stringify({
          firstName: 'Anna', lastName: 'Adler', email: emails[0], status: 'confirmed',
          partnerFirstName: 'Ben', partnerLastName: 'Berg', partnerEmail: emails[1],
          partner2FirstName: 'Clara', partner2LastName: 'Cramer', partner2Email: emails[2],
        }),
      });
      const response = await updateRegistration(request, { DB: db }, existing);
      expect(response.status).toBe(200);
    };

    await edit(['anna@example.test', 'dora@example.test', 'clara@example.test']);
    expect(accountLinks(db)).toEqual({ user_id: 'u1', partner_user_id: 'u4', partner2_user_id: 'u3' });

    await edit(['anna@example.test', 'dora@example.test', 'unbekannt@example.test']);
    expect(accountLinks(db)).toEqual({ user_id: 'u1', partner_user_id: 'u4', partner2_user_id: null });
  });
});
