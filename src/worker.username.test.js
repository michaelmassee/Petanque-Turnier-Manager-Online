// @vitest-environment node
// Benutzername (@handle): Vergabe bei Registrierung und OAuth, eigene Änderung mit 30-Tage-Frist, Admin-Umbenennung
// mit Sperre des alten Namens, Meldungen und E-Mail-Lookup für die Postbox.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import {
  checkUsernameAvailability, confirmOwnUsername, findOrCreateOAuthUser, listUsernameReports, lookupPostboxRecipientByEmail,
  registerUser, reportUsername, resolveUsernameReport, updateOwnProfile, updateUser,
} from './worker.js';

const anfrage = (body) => new Request('https://ptmonline.org/api', { method: 'POST', body: JSON.stringify(body) });
const url = new URL('http://localhost/api');
// Zufällig pro Lauf, erfüllt die Passwortregeln (Groß-/Kleinbuchstabe, Ziffer, Sonderzeichen).
const TESTPASSWORT = `Test-${crypto.randomUUID()}`;

describe('Benutzername', () => {
  let db;
  let env;
  const zeile = (sql, ...params) => db.sqlite.prepare(sql).get(...params);

  function konto(id, { role = 'user', username = id, verified = true, changedAt = null, confirmedAt = '2026-01-01' } = {}) {
    db.sqlite.prepare(`INSERT INTO users (id, email, first_name, last_name, username, username_changed_at, username_confirmed_at, role,
        password_salt, password_hash, email_verified_at, created_at, updated_at)
      VALUES (?, ?, 'Anna', 'Schmidt', ?, ?, ?, ?, 's', 'h', ?, '2026-01-01', '2026-01-01')`)
      .run(id, `${id}@example.test`, username, changedAt, confirmedAt, role, verified ? '2026-01-01' : null);
  }

  const profil = (userId, username) => updateOwnProfile(
    anfrage({ firstName: 'Anna', lastName: 'Schmidt', email: `${userId}@example.test`, username }), env, url, userId);

  beforeEach(() => {
    db = d1MitSchema();
    env = { DB: db, MAIL_QUEUE: { send: async () => {} } };
  });

  it('übernimmt bei der Registrierung den gewählten Namen als bestätigt und lehnt vergebene ab', async () => {
    konto('vorhanden', { username: 'anna.schmidt' });
    const daten = { firstName: 'Anna', lastName: 'Schmidt', email: 'neu@example.test', password: TESTPASSWORT };

    await expect(registerUser(anfrage({ ...daten, username: 'Anna.Schmidt' }), env, url)).rejects.toMatchObject({ status: 409, message: 'Benutzername bereits vergeben' });
    await expect(registerUser(anfrage({ ...daten, username: 'hurensohn' }), env, url)).rejects.toMatchObject({ status: 400 });
    await registerUser(anfrage({ ...daten, username: '@Anna.S' }), env, url);

    expect(zeile("SELECT username, username_confirmed_at IS NOT NULL AS bestaetigt FROM users WHERE email = 'neu@example.test'"))
      .toEqual({ username: 'anna.s', bestaetigt: 1 });
  });

  it('erzeugt ohne Angabe einen freien Namen, der noch bestätigt werden muss', async () => {
    konto('vorhanden', { username: 'anna.schmidt' });
    await registerUser(anfrage({ firstName: 'Anna', lastName: 'Schmidt', email: 'neu@example.test', password: TESTPASSWORT }), env, url);

    expect(zeile("SELECT username, username_confirmed_at FROM users WHERE email = 'neu@example.test'"))
      .toEqual({ username: 'anna.schmidt2', username_confirmed_at: null });
  });

  it('vergibt bei OAuth-Neuanmeldung einen freien, unbestätigten Namen', async () => {
    konto('vorhanden', { username: 'anna.schmidt' });
    const user = await findOrCreateOAuthUser(db, 'google', { providerUserId: 'g-1', email: 'g@example.test', name: 'Anna Schmidt' });

    expect(user.username).toBe('anna.schmidt2');
    expect(zeile('SELECT username_confirmed_at FROM users WHERE id = ?', user.id).username_confirmed_at).toBeNull();
  });

  // Simuliert eine parallele Anmeldung: Direkt vor dem nächsten INSERT in users belegt ein anderes Konto den Namen.
  function belegeVorNaechstemInsert(...usernames) {
    const prepare = db.prepare.bind(db);
    let offen = [...usernames];
    db.prepare = (sql) => {
      if (offen.length && /^\s*INSERT INTO users\b/.test(sql)) {
        const name = offen.shift();
        konto(`parallel-${name}`, { username: name });
      }
      return prepare(sql);
    };
  }

  it('weicht bei paralleler Vergabe eines automatisch erzeugten Namens auf den nächsten freien aus', async () => {
    belegeVorNaechstemInsert('anna.schmidt');
    await registerUser(anfrage({ firstName: 'Anna', lastName: 'Schmidt', email: 'neu@example.test', password: TESTPASSWORT }), env, url);

    expect(zeile("SELECT username FROM users WHERE email = 'neu@example.test'").username).toBe('anna.schmidt2');
  });

  it('weicht auch bei der OAuth-Neuanmeldung aus, statt den Login abzubrechen', async () => {
    db.vorBatch((sqlite) => sqlite.exec(`INSERT INTO users (id, email, first_name, last_name, username, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('parallel', 'parallel@example.test', 'Anna', 'Schmidt', 'anna.schmidt', 'user', 's', 'h', '2026-01-01', '2026-01-01')`));
    const user = await findOrCreateOAuthUser(db, 'google', { providerUserId: 'g-1', email: 'g@example.test', name: 'Anna Schmidt' });

    expect(user.username).toBe('anna.schmidt2');
    expect(zeile("SELECT COUNT(*) AS n FROM oauth_accounts WHERE provider_user_id = 'g-1'").n).toBe(1);
  });

  it('ersetzt einen selbst gewählten Namen bei paralleler Vergabe nicht, sondern meldet die Kollision', async () => {
    belegeVorNaechstemInsert('anna.s');
    await expect(registerUser(anfrage({ firstName: 'Anna', lastName: 'Schmidt', email: 'neu@example.test', password: TESTPASSWORT, username: 'anna.s' }), env, url))
      .rejects.toMatchObject({ status: 409, message: 'Benutzername bereits vergeben' });
    expect(zeile("SELECT COUNT(*) AS n FROM users WHERE email = 'neu@example.test'").n).toBe(0);
  });

  it('gibt nach drei Kollisionen in Folge auf', async () => {
    belegeVorNaechstemInsert('anna.schmidt', 'anna.schmidt2', 'anna.schmidt3');
    await expect(registerUser(anfrage({ firstName: 'Anna', lastName: 'Schmidt', email: 'neu@example.test', password: TESTPASSWORT }), env, url))
      .rejects.toMatchObject({ status: 409 });
  });

  it('meldet Verfügbarkeit mit Ersatzvorschlag', async () => {
    konto('vorhanden', { username: 'anna.schmidt' });
    const pruefe = async (name) => (await checkUsernameAvailability(db, new URL(`https://x/?u=${encodeURIComponent(name)}`))).json();

    await expect(pruefe('anna.schmidt')).resolves.toEqual({ available: false, problem: 'taken', suggestion: 'anna.schmidt2' });
    await expect(pruefe('ptm.admin')).resolves.toEqual({ available: false, problem: 'reserved', suggestion: null });
    await expect(pruefe('anna.s')).resolves.toEqual({ available: true, problem: null, suggestion: null });
  });

  it('erlaubt die erste eigene Änderung, die zweite erst nach 30 Tagen', async () => {
    konto('anna', { username: 'anna.schmidt', confirmedAt: null });

    await profil('anna', 'anna.s');
    expect(zeile("SELECT username, username_changed_at IS NOT NULL AS geaendert, username_confirmed_at IS NOT NULL AS bestaetigt FROM users WHERE id = 'anna'"))
      .toEqual({ username: 'anna.s', geaendert: 1, bestaetigt: 1 });
    await expect(profil('anna', 'anna.neu')).rejects.toMatchObject({ status: 400, message: 'Der Benutzername kann nur alle 30 Tage geändert werden' });

    db.sqlite.exec("UPDATE users SET username_changed_at = '2020-01-01' WHERE id = 'anna'");
    await profil('anna', 'anna.neu');
    expect(zeile("SELECT username FROM users WHERE id = 'anna'").username).toBe('anna.neu');
  });

  it('verlangt für eine Änderung eine bestätigte E-Mail', async () => {
    konto('anna', { username: 'anna.schmidt', verified: false });
    await expect(profil('anna', 'anna.s')).rejects.toMatchObject({ status: 400 });
  });

  it('bestätigt einen automatisch vergebenen Namen', async () => {
    konto('anna', { username: 'anna.schmidt', confirmedAt: null });
    await confirmOwnUsername(db, 'anna');
    expect(zeile("SELECT username_confirmed_at FROM users WHERE id = 'anna'").username_confirmed_at).not.toBeNull();
  });

  it('sperrt bei Admin-Umbenennung den alten Namen und informiert den Nutzer', async () => {
    konto('admin', { role: 'admin' });
    konto('anna', { username: 'boese.name' });
    const body = { firstName: 'Anna', lastName: 'Schmidt', email: 'anna@example.test', role: 'user', username: 'anna.schmidt', usernameChangeReason: 'Anstößig' };

    await updateUser(new Request('https://x', { method: 'PUT', body: JSON.stringify(body) }), env, 'anna', 'admin');

    expect(zeile("SELECT username, username_confirmed_at FROM users WHERE id = 'anna'")).toEqual({ username: 'anna.schmidt', username_confirmed_at: null });
    expect(zeile("SELECT reason FROM blocked_usernames WHERE username = 'boese.name'").reason).toBe('Anstößig');
    expect(JSON.parse(zeile("SELECT event_data FROM postbox_messages WHERE recipient_id = 'anna' AND event_type = 'username_changed_by_admin'").event_data))
      .toEqual({ oldUsername: 'boese.name', newUsername: 'anna.schmidt', reason: 'Anstößig' });

    konto('andere', { username: 'andere' });
    await expect(profil('andere', 'boese.name')).rejects.toMatchObject({ status: 409 });
  });

  it('nimmt Meldungen an, verhindert doppelte und schließt sie bei Umbenennung alle', async () => {
    konto('admin', { role: 'admin' });
    konto('anna', { username: 'boese.name' });
    konto('melder1');
    konto('melder2');

    await reportUsername(anfrage({ reason: 'beleidigend' }), env, 'anna', 'melder1');
    await reportUsername(anfrage({}), env, 'anna', 'melder2');
    await expect(reportUsername(anfrage({}), env, 'anna', 'melder1')).rejects.toMatchObject({ status: 409 });
    await expect(reportUsername(anfrage({}), env, 'melder1', 'melder1')).rejects.toMatchObject({ status: 400 });
    expect(zeile("SELECT COUNT(*) AS n FROM postbox_messages WHERE recipient_id = 'admin' AND event_type = 'username_reported'").n).toBe(2);

    const { reports } = await (await listUsernameReports(db)).json();
    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({ reportedUsername: 'boese.name', reason: 'beleidigend', reporter: { username: 'melder1' } });

    await resolveUsernameReport(anfrage({ action: 'rename', newUsername: 'anna.schmidt' }), env, reports[0].id, 'admin');
    expect(zeile("SELECT COUNT(*) AS n FROM username_reports WHERE status = 'resolved'").n).toBe(2);
    expect(zeile("SELECT username FROM users WHERE id = 'anna'").username).toBe('anna.schmidt');
  });

  it('verwirft eine Meldung ohne Änderung', async () => {
    konto('anna');
    konto('melder');
    await reportUsername(anfrage({}), env, 'anna', 'melder');
    const { reports } = await (await listUsernameReports(db)).json();

    await resolveUsernameReport(anfrage({ action: 'dismiss' }), env, reports[0].id, 'admin');
    expect(zeile('SELECT status FROM username_reports').status).toBe('dismissed');
    expect(zeile("SELECT username FROM users WHERE id = 'anna'").username).toBe('anna');
  });

  it('findet Postbox-Empfänger per exakter E-Mail, ohne die Adresse zu liefern', async () => {
    konto('ich');
    konto('anna', { username: 'anna.schmidt' });

    const { recipient } = await (await lookupPostboxRecipientByEmail(db, 'ich', ' ANNA@example.test ')).json();
    expect(recipient).toEqual({ id: 'anna', firstName: 'Anna', lastName: 'Schmidt', username: 'anna.schmidt', club: null, role: 'user' });
    await expect(lookupPostboxRecipientByEmail(db, 'ich', 'ich@example.test')).rejects.toMatchObject({ status: 404 });
    await expect(lookupPostboxRecipientByEmail(db, 'ich', 'unbekannt@example.test')).rejects.toMatchObject({ status: 404 });
  });
});
