// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { d1MitSchema as d1WithSchema, migrationsDir } from './test-support/d1.js';
import {
  declineRegistrationSlot, findMyLiveRegistration, getRegistrationWithTournament, linkUnlinkedRegistrationsForUser,
  listMyLiveRegistrations, relinkRegistrationSlot, resolveRegistrationUserIds, updateRegistration, updateUser, verifyEmail,
} from './worker.js';

// The backfill statements of 0080, re-run on rows inserted after the schema setup.
const accountLinkMigration = readFileSync(new URL('0080_registration_account_links.sql', migrationsDir), 'utf8');
const accountLinkBackfill = accountLinkMigration.slice(accountLinkMigration.indexOf('UPDATE registrations'));

// Verknüpft werden nur verifizierte Konten (E-22); unverified = true legt ein unbestätigtes Konto an.
function insertUsers(db, ...users) {
  for (const [id, email, unverified] of users) {
    db.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at, email_verified_at)
      VALUES (?, ?, 'user', 'salt', 'hash', '2026-01-01', '2026-01-01', ?)`).run(id, email, unverified ? null : '2026-01-01');
  }
}

function insertTripletteRegistration(db, emails) {
  db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
    VALUES ('t1', 'u1', 'Turnier', '2026-01-02', 'Ort', 'triplette', 'registration', 'public', '2026-01-01', '2026-01-01')`).run();
  db.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, player_email, partner_first_name, partner_last_name, partner_email, partner2_first_name, partner2_last_name, partner2_email, status, registered_at, created_at, updated_at)
    VALUES ('r1', 't1', 'Anna', 'Adler', ?, ?, 'Ben', 'Berg', ?, 'Clara', 'Cramer', ?, 'confirmed', '2026-01-01', '2026-01-01', '2026-01-01')`)
    .run(emails[0] || 'kontakt@example.test', ...emails);
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
    await expect(resolveRegistrationUserIds(db, { playerEmail: 'anna@example.test' }))
      .resolves.toEqual({ userId: null, partnerUserId: null, partner2UserId: null });
  });

  it('vergibt bei gemeinsamer E-Mail im Team das Konto nur an den ersten Platz', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'anna@example.test'], ['u2', 'ben@example.test']);
    await expect(resolveRegistrationUserIds(db, {
      playerEmail: 'ben@example.test', partnerEmail: 'anna@example.test', partner2Email: 'ANNA@example.test',
    })).resolves.toEqual({ userId: 'u2', partnerUserId: 'u1', partner2UserId: null });
  });

  it('verknüpft nie über die Kontakt-E-Mail und nie unbestätigte Konten (E-11, E-22)', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'verein@example.test'], ['u2', 'ben@example.test', true]);
    await expect(resolveRegistrationUserIds(db, {
      email: 'verein@example.test', playerEmail: null, partnerEmail: 'ben@example.test',
    })).resolves.toEqual({ userId: null, partnerUserId: null, partner2UserId: null });
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

  const edit = async (db, persons) => {
    const existing = await getRegistrationWithTournament(db, 'r1');
    const request = new Request('https://example.test/api/registrations/r1', {
      method: 'PUT',
      body: JSON.stringify({
        firstName: persons[0][0], lastName: 'Adler', email: 'kontakt@example.test', playerEmail: persons[0][1], status: 'confirmed',
        partnerFirstName: persons[1][0], partnerLastName: 'Berg', partnerEmail: persons[1][1],
        partner2FirstName: persons[2][0], partner2LastName: 'Cramer', partner2Email: persons[2][1],
      }),
    });
    const response = await updateRegistration(request, { DB: db }, existing, { id: 'u1', role: 'user' });
    expect(response.status).toBe(200);
  };

  it('behält bei korrigierter Slot-E-Mail die Verknüpfung derselben Person (P-36)', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'anna@example.test'], ['u2', 'ben@example.test'], ['u3', 'clara@example.test'], ['u4', 'dora@example.test']);
    insertTripletteRegistration(db, ['anna@example.test', 'ben@example.test', 'clara@example.test']);
    db.sqlite.exec(accountLinkBackfill);

    await edit(db, [['Anna', 'anna@example.test'], ['Ben', 'dora@example.test'], ['Clara', 'clara@example.test']]);

    expect(accountLinks(db)).toEqual({ user_id: 'u1', partner_user_id: 'u2', partner2_user_id: 'u3' });
    const audit = db.sqlite.prepare("SELECT action, target FROM audit_log WHERE registration_id = 'r1'").all();
    expect(audit).toContainEqual({ action: 'slot_email_changed', target: 'slot:2' });
  });

  it('verknüpft bei einem Personenwechsel das Konto der neuen Person (P-49)', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'anna@example.test'], ['u2', 'ben@example.test'], ['u3', 'clara@example.test'], ['u4', 'dora@example.test']);
    insertTripletteRegistration(db, ['anna@example.test', 'ben@example.test', 'clara@example.test']);
    db.sqlite.exec(accountLinkBackfill);

    await edit(db, [['Anna', 'anna@example.test'], ['Dora', 'dora@example.test'], ['Clara', 'unbekannt@example.test']]);

    expect(accountLinks(db)).toEqual({ user_id: 'u1', partner_user_id: 'u4', partner2_user_id: 'u3' });
    const nachricht = db.sqlite.prepare("SELECT event_type FROM postbox_messages WHERE recipient_id = 'u4'").get();
    expect(nachricht.event_type).toBe('registration_slot_linked');
  });

  it('löst einen Slot mit "Das bin ich nicht" dauerhaft (P-60)', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'anna@example.test'], ['u2', 'ben@example.test']);
    insertTripletteRegistration(db, ['anna@example.test', 'ben@example.test', null]);
    db.sqlite.exec(accountLinkBackfill);

    const registration = await findMyLiveRegistration(db, { id: 'u2' }, 'r1');
    await declineRegistrationSlot(db, registration, { id: 'u2' });

    expect(accountLinks(db).partner_user_id).toBeNull();
    expect(db.sqlite.prepare("SELECT partner_first_name, partner_email FROM registrations WHERE id = 'r1'").get())
      .toEqual({ partner_first_name: 'Ben', partner_email: 'ben@example.test' });
    await linkUnlinkedRegistrationsForUser(db, 'u2', 'ben@example.test');
    expect(accountLinks(db).partner_user_id).toBeNull();
    expect(db.sqlite.prepare("SELECT action FROM audit_log WHERE registration_id = 'r1'").all())
      .toContainEqual({ action: 'account_declined' });
  });

  it('ordnet ein Konto nur über die ausdrückliche Aktion neu zu (KP-11)', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'anna@example.test'], ['u2', 'ben@example.test'], ['u4', 'dora@example.test']);
    insertTripletteRegistration(db, ['anna@example.test', 'ben@example.test', null]);
    db.sqlite.exec(accountLinkBackfill);
    db.sqlite.prepare("UPDATE registrations SET partner_email = 'dora@example.test' WHERE id = 'r1'").run();

    const registration = await getRegistrationWithTournament(db, 'r1');
    const response = await relinkRegistrationSlot({ DB: db }, registration, 2, { id: 'u1', role: 'user' });

    expect(response.status).toBe(200);
    expect(accountLinks(db).partner_user_id).toBe('u4');
    expect(db.sqlite.prepare("SELECT action FROM audit_log WHERE registration_id = 'r1'").all())
      .toContainEqual({ action: 'account_relinked' });
  });

  it('verknüpft ein später angelegtes Konto erst nach der Verifikation (KP-10)', async () => {
    const db = d1WithSchema();
    insertUsers(db, ['u1', 'owner@example.test'], ['u2', 'ben@example.test', true]);
    insertTripletteRegistration(db, ['anna@example.test', 'ben@example.test', null]);

    await linkUnlinkedRegistrationsForUser(db, 'u2', 'ben@example.test');
    expect(accountLinks(db).partner_user_id).toBeNull();

    db.sqlite.prepare("UPDATE users SET email_verified_at = '2026-02-01' WHERE id = 'u2'").run();
    await linkUnlinkedRegistrationsForUser(db, 'u2', 'ben@example.test');
    expect(accountLinks(db).partner_user_id).toBe('u2');
  });
});
