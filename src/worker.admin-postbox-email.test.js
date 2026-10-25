// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAdminPostboxEmail } from './admin-postbox-email.js';
import { collectAdminStatus, sendAdminStatusEmails } from './admin-status-email.js';
import worker, { listPostboxRecipients, lookupPostboxRecipientByEmail, renderTransactionalEmailHtml, sendPlaceAddressCorrection, sendPostboxMessage, sendTeamMessage } from './worker.js';
import { d1MitSchema, migrationSql } from './test-support/d1.js';
import { POSTBOX_ADMIN_GROUP_EVENT, POSTBOX_ADMIN_RECIPIENT_ID } from './postbox-core.js';

const sender = { id: 'patrick', firstName: 'Patrick', lastName: 'Müller', username: 'patrick.mueller', role: 'user' };
const from = '2026-10-24T01:00:00.000Z';
const until = '2026-10-25T01:00:00.000Z';
const systemId = 'system-tournament-reports';
const richBody = `ptm-richtext:v1:${JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hallo <Admin>', marks: [{ type: 'bold' }] }] }] })}`;

describe('Nachrichten an Administratoren', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const rows = (statement) => env.DB.sqlite.prepare(statement).all();
  function user(id, role = 'admin', language = 'de', verified = from) {
    sql(`INSERT INTO users (id, first_name, last_name, username, email, role, language, email_verified_at,
      mail_enabled, password_salt, password_hash, created_at, updated_at)
      VALUES (?, ?, 'Müller', ?, ?, ?, ?, ?, 0, 's', 'h', ?, ?)`,
    id, id === 'patrick' ? 'Patrick' : id, id, `${id}@example.test`, role, language, verified, from, from);
  }
  function insert(id, recipient = 'admin', at = from, body = 'Hallo', kind = 'direct') {
    sql(`INSERT INTO postbox_messages (id, sender_id, recipient_id, kind, body, created_at)
      VALUES (?, 'patrick', ?, ?, ?, ?)`, id, recipient, kind, body, at);
  }
  const send = (recipientId, body = richBody, author = sender) => sendPostboxMessage(new Request('https://ptmonline.org/api/postbox/messages', {
    method: 'POST', body: JSON.stringify({ recipientId, body }),
  }), env, author);

  async function inbox(userId) {
    sql(`INSERT OR IGNORE INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, '2099-01-01T00:00:00.000Z', ?)`, userId, userId, from);
    const response = await worker.fetch(new Request('https://ptmonline.org/api/postbox', {
      headers: { Cookie: `ptm_session=${userId}` },
    }), env);
    expect(response.status).toBe(200);
    return response.json();
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } };
    user('patrick', 'user');
    user('admin', 'admin', 'en');
    user('other');
    user('normal', 'user');
  });
  afterEach(() => vi.restoreAllMocks());

  it('verteilt Admin-Gruppennachrichten an alle Admins per Postbox, Mail und Nachtbericht', async () => {
    const response = await send(POSTBOX_ADMIN_RECIPIENT_ID);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ recipientCount: 2, message: { mine: true, eventType: POSTBOX_ADMIN_GROUP_EVENT } });
    expect(rows('SELECT recipient_id, body FROM postbox_messages ORDER BY recipient_id')).toEqual([
      { recipient_id: 'admin', body: richBody }, { recipient_id: 'other', body: richBody },
    ]);
    const mails = env.MAIL_QUEUE.send.mock.calls.map(([mail]) => mail);
    expect(mails.map((mail) => [mail.to, mail.language])).toEqual([['admin@example.test', 'en'], ['other@example.test', 'de']]);
    expect(rows('SELECT recipient_id FROM admin_postbox_messages ORDER BY recipient_id')).toEqual([{ recipient_id: 'admin' }, { recipient_id: 'other' }]);
    env.MAIL_QUEUE.send.mockClear();
    await sendAdminStatusEmails(env, [], Date.now() + 3600000, systemId);
    const reports = env.MAIL_QUEUE.send.mock.calls.map(([mail]) => mail);
    expect(reports).toHaveLength(2);
    expect(reports.every((report) => report.text.includes('Hallo <Admin>'))).toBe(true);
  });

  it('zeigt dem Absender nur einen Eintrag und lässt jeden Admin seine Kopie unabhängig lesen', async () => {
    await send(POSTBOX_ADMIN_RECIPIENT_ID);
    expect((await inbox('patrick')).messages).toHaveLength(1);
    const adminInbox = await inbox('admin');
    expect(adminInbox.messages).toHaveLength(1);
    expect(adminInbox.unreadCount).toBe(1);
    const read = await worker.fetch(new Request('https://ptmonline.org/api/postbox/read-all', {
      method: 'POST', headers: { Cookie: 'ptm_session=admin' },
    }), env);
    expect(read.status).toBe(200);
    expect((await inbox('admin')).unreadCount).toBe(0);
    expect((await inbox('other')).unreadCount).toBe(1);
    expect((await inbox('normal')).messages).toEqual([]);
  });

  it('erreicht bei einem Admin als Absender auch dessen eigenes Konto genau einmal', async () => {
    await send(POSTBOX_ADMIN_RECIPIENT_ID, 'Adminfrage', { id: 'other', firstName: 'Olga', lastName: 'Admin', role: 'admin' });
    expect(env.MAIL_QUEUE.send.mock.calls.map(([mail]) => mail.to)).toEqual(['admin@example.test', 'other@example.test']);
    expect(rows('SELECT recipient_id FROM admin_postbox_messages ORDER BY recipient_id')).toEqual([{ recipient_id: 'admin' }, { recipient_id: 'other' }]);
    const ownInbox = await inbox('other');
    expect(ownInbox.messages).toHaveLength(1);
    expect(ownInbox.messages[0]).toMatchObject({ mine: true, eventType: POSTBOX_ADMIN_GROUP_EVENT });
    expect(ownInbox.unreadCount).toBe(0);
    expect((await inbox('admin')).messages).toHaveLength(1);
  });

  it('speichert keine Teilzustellung, wenn eine der Admin-Berichtskopien fehlschlägt', async () => {
    env.DB.sqlite.exec(`CREATE TRIGGER block_second_admin BEFORE INSERT ON admin_postbox_messages
      WHEN NEW.recipient_id = 'other' BEGIN SELECT RAISE(ABORT, 'archive unavailable'); END`);
    await expect(send(POSTBOX_ADMIN_RECIPIENT_ID)).rejects.toThrow('archive unavailable');
    expect(rows('SELECT * FROM postbox_messages')).toEqual([]);
    expect(rows('SELECT * FROM postbox_entries')).toEqual([]);
    expect(rows('SELECT * FROM postbox_orphan_candidates')).toEqual([]);
    expect(rows('SELECT * FROM admin_postbox_messages')).toEqual([]);
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
  });

  it('behält beim Gruppenversand trotz Mail-Queue-Fehlern beide Postbox-Nachrichten', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    env.MAIL_QUEUE.send.mockRejectedValueOnce(new Error('Queue unavailable'));
    expect((await send(POSTBOX_ADMIN_RECIPIENT_ID)).status).toBe(201);
    expect(env.MAIL_QUEUE.send).toHaveBeenCalledTimes(2);
    expect(rows('SELECT * FROM admin_postbox_messages')).toHaveLength(2);
  });

  it('erreicht unbestätigte Admins in der Postbox und meldet fehlende Admins als Fehler', async () => {
    sql("UPDATE users SET email_verified_at = NULL WHERE id = 'admin'");
    await send(POSTBOX_ADMIN_RECIPIENT_ID);
    expect(rows('SELECT id FROM postbox_messages')).toHaveLength(2);
    expect(env.MAIL_QUEUE.send.mock.calls.map(([mail]) => mail.to)).toEqual(['other@example.test']);
    sql("UPDATE users SET role = 'user' WHERE role = 'admin'");
    await expect(send(POSTBOX_ADMIN_RECIPIENT_ID)).rejects.toMatchObject({ status: 409, message: 'Kein Admin-Konto vorhanden' });
    expect(rows('SELECT id FROM postbox_messages')).toHaveLength(2);
  });

  it('macht Admins als Empfänger auswählbar und per E-Mail auffindbar, ohne Adressen offenzulegen', async () => {
    const { recipients } = await (await listPostboxRecipients(env.DB, sender.id)).json();
    expect(recipients.map((recipient) => recipient.id).sort()).toEqual(['admin', 'normal', 'other']);
    expect(recipients.every((recipient) => !('email' in recipient))).toBe(true);
    expect(await (await lookupPostboxRecipientByEmail(env.DB, sender.id, ' ADMIN@example.test ')).json())
      .toMatchObject({ recipient: { id: 'admin', role: 'admin' } });
  });

  it('speichert die Nachricht und sendet ihren Inhalt ausschließlich an den angeschriebenen Admin in dessen Sprache', async () => {
    expect((await send('admin')).status).toBe(201);
    expect(rows('SELECT sender_id, recipient_id, body FROM postbox_messages'))
      .toEqual([{ sender_id: 'patrick', recipient_id: 'admin', body: richBody }]);
    const [mail] = env.MAIL_QUEUE.send.mock.calls[0];
    expect(env.MAIL_QUEUE.send).toHaveBeenCalledTimes(1);
    expect(mail).toMatchObject({ to: 'admin@example.test', language: 'en', messageBox: richBody });
    expect(mail.text).toContain('Patrick Müller');
    const html = renderTransactionalEmailHtml(mail.subject, mail.text, mail.language, mail.messageBox, '', mail.actions);
    expect(html).toContain('<strong>Hallo &lt;Admin&gt;</strong>');
    expect(html).not.toContain('ptm-richtext:v1:');
    expect(html).toContain('https://ptmonline.org/');
    expect(rows('SELECT recipient_id, body FROM admin_postbox_messages'))
      .toEqual([{ recipient_id: 'admin', body: richBody }]);
  });

  it('versendet normale Postbox-Nachrichten nicht zusätzlich per E-Mail', async () => {
    expect((await send('normal')).status).toBe(201);
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
    expect(rows('SELECT * FROM admin_postbox_messages')).toEqual([]);
  });

  it('versendet auch Adresskorrekturen, die als Direktnachricht an die zuständigen Admins gehen', async () => {
    sql(`INSERT INTO boule_places (id, name, address, status, created_at, updated_at)
      VALUES ('p1', 'Bouleplatz', 'Berlin', 'published', ?, ?)`, from, from);
    const response = await sendPlaceAddressCorrection(new Request('https://ptmonline.org/api/places/p1/address-correction', {
      method: 'POST', body: JSON.stringify({ body: 'Die Adresse ist falsch.' }),
    }), env, 'p1', sender);
    expect(response.status).toBe(201);
    const mails = env.MAIL_QUEUE.send.mock.calls.map(([mail]) => mail);
    expect(mails.map((mail) => mail.to).sort()).toEqual(['admin@example.test', 'other@example.test']);
    expect(mails[0].text).toContain('Patrick Müller');
    expect(mails[0].messageBox).toContain('Die Adresse ist falsch.');
    expect(mails[0].messageBox).toContain('/plaetze#p1');
    expect(rows('SELECT message_id FROM admin_postbox_messages')).toHaveLength(2);
  });

  it.each([0, 1])('versendet bei Teammail-Freigabe %s genau eine Mail je angeschriebenem Admin', async (mailEnabled) => {
    sql("UPDATE users SET mail_enabled = ? WHERE id = 'patrick'", mailEnabled);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'patrick', 'Turnier', '2099-01-01', 'Berlin', 'tete', 'registration', 'public', ?, ?)`, from, from);
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, user_id, status, registered_at, created_at, updated_at)
      VALUES ('r1', 't1', 'Admin', 'Müller', 'admin@example.test', 'admin', 'confirmed', ?, ?, ?)`, from, from, from);
    const registration = rows("SELECT * FROM registrations WHERE id = 'r1'")[0];
    await sendTeamMessage(env, registration, sender, 'Teaminformation', 'https://ptmonline.org');
    expect(env.MAIL_QUEUE.send).toHaveBeenCalledTimes(1);
    expect(env.MAIL_QUEUE.send.mock.calls[0][0]).toMatchObject({ to: 'admin@example.test' });
    expect(env.MAIL_QUEUE.send.mock.calls[0][0].messageBox).toContain('Teaminformation');
    expect(rows('SELECT message_id FROM admin_postbox_messages')).toHaveLength(1);
  });

  it('versendet keine E-Mail an eine unbestätigte Adminadresse', async () => {
    sql("UPDATE users SET email_verified_at = NULL WHERE id = 'admin'");
    expect((await send('admin')).status).toBe(201);
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
    expect(rows('SELECT recipient_id FROM admin_postbox_messages')).toEqual([{ recipient_id: 'admin' }]);
  });

  it('behält bei Queue-Fehlern die Nachricht und den Nachtbericht bei, ohne einen erneuten Versand anzufordern', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    env.MAIL_QUEUE.send.mockRejectedValueOnce(new Error('Queue unavailable'));
    expect((await send('admin')).status).toBe(201);
    expect(rows('SELECT id FROM postbox_messages')).toHaveLength(1);
    expect(rows('SELECT message_id FROM admin_postbox_messages')).toHaveLength(1);
    expect(errorLog).toHaveBeenCalledWith('Admin postbox email enqueue failed', expect.any(Error));
  });

  it('verweigert Nachrichten an sich selbst und den reservierten Systemaccount', async () => {
    await expect(send('patrick')).rejects.toMatchObject({ status: 400 });
    await expect(send(systemId)).rejects.toMatchObject({ status: 403 });
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
    expect(rows('SELECT * FROM admin_postbox_messages')).toEqual([]);
  });

  it('behält alle Berichtseinträge auch nach mehr als 25 eingegangenen Nachrichten', async () => {
    for (let i = 0; i < 30; i += 1) await send('admin', `Nachricht ${i}`);
    expect(rows("SELECT id FROM postbox_entries WHERE user_id = 'admin'")).toHaveLength(25);
    expect(rows('SELECT message_id FROM admin_postbox_messages')).toHaveLength(30);
  });

  it('listet im Nachtbericht nur die eigenen Nachrichten innerhalb des exakten Zeitfensters als Klartext auf', async () => {
    insert('start', 'admin', from, richBody);
    insert('end', 'admin', until, 'Grenze Ende');
    insert('before', 'admin', '2026-10-24T00:59:59.999Z', 'Vor Zeitraum');
    insert('private', 'other', from, 'Andere private Nachricht');
    insert('normal', 'normal');
    insert('system', 'admin', from, null, 'system');
    await sendAdminStatusEmails(env, [], Date.parse(until), systemId);
    const mails = env.MAIL_QUEUE.send.mock.calls.map(([mail]) => mail);
    const adminMail = mails.find((mail) => mail.to === 'admin@example.test');
    expect(adminMail.text).toContain('Inbox messages addressed to you in the reporting period: 1');
    expect(adminMail.text).toContain('Sender: Patrick Müller');
    expect(adminMail.text).toContain(`Sent (UTC): ${from}`);
    expect(adminMail.text).toContain('Hallo <Admin>');
    expect(adminMail.text).not.toMatch(/ptm-richtext|Andere private|Grenze Ende|Vor Zeitraum/);
    const otherMail = mails.find((mail) => mail.to === 'other@example.test');
    expect(otherMail.text).toContain('Andere private Nachricht');
    expect(otherMail.text).not.toContain('Hallo <Admin>');
  });

  it('bereinigt Kopien nach sieben Tagen und entfernt sie bei Löschung eines beteiligten Kontos', async () => {
    insert('old', 'admin', '2026-10-18T00:59:59.999Z');
    insert('boundary', 'admin', '2026-10-18T01:00:00.000Z');
    insert('current', 'admin', from, 'Kontolöschung');
    await sendAdminStatusEmails(env, [], Date.parse(until), systemId);
    expect(rows('SELECT message_id FROM admin_postbox_messages ORDER BY message_id'))
      .toEqual([{ message_id: 'boundary' }, { message_id: 'current' }]);
    // Die Kontolöschung entfernt direkte Postbox-Nachrichten vor dem Benutzerkonto.
    sql("DELETE FROM postbox_messages WHERE sender_id = 'patrick'");
    sql("DELETE FROM users WHERE id = 'patrick'");
    expect(rows('SELECT * FROM admin_postbox_messages')).toEqual([]);
    user('patrick', 'user');
    insert('new', 'admin', from);
    sql("DELETE FROM users WHERE id = 'admin'");
    expect(rows('SELECT * FROM admin_postbox_messages')).toEqual([]);
  });

  it('übernimmt vorhandene Adminnachrichten bei der Migration, ohne andere Empfänger oder Broadcasts zu kopieren', async () => {
    env.DB.sqlite.exec('DROP TRIGGER archive_admin_postbox_message; DROP TABLE admin_postbox_messages;');
    const now = new Date().toISOString();
    insert('existing', 'admin', now);
    insert('normal', 'normal', now);
    insert('old', 'admin', '2000-01-01T00:00:00.000Z');
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'patrick', 'Turnier', '2099-01-01', 'Berlin', 'tete', 'registration', 'public', ?, ?)`, now, now);
    sql(`INSERT INTO postbox_messages (id, sender_id, recipient_id, kind, body, broadcast_tournament_id, created_at)
      VALUES ('broadcast', 'patrick', 'admin', 'direct', 'Broadcast', 't1', ?)`, now);
    env.DB.sqlite.exec(migrationSql('0130_admin_postbox_messages.sql'));
    expect(rows('SELECT message_id FROM admin_postbox_messages')).toEqual([{ message_id: 'existing' }]);
    const stats = await collectAdminStatus(env.DB, '2000-01-01', '2099-01-01', systemId);
    expect(stats.adminMessages).toHaveLength(1);
  });

  it('speichert Postbox und Berichtskopie atomar, wenn das Archivieren fehlschlägt', async () => {
    env.DB.sqlite.exec(`CREATE TRIGGER block_admin_archive BEFORE INSERT ON admin_postbox_messages
      BEGIN SELECT RAISE(ABORT, 'archive unavailable'); END`);
    await expect(send('admin')).rejects.toThrow('archive unavailable');
    expect(rows('SELECT * FROM postbox_messages')).toEqual([]);
    expect(rows('SELECT * FROM admin_postbox_messages')).toEqual([]);
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
  });

  it.each(['de', 'en', 'fr', 'nl', 'es', 'unknown'])('übersetzt die Mail in %s mit deutschem Fallback', (language) => {
    const mail = buildAdminPostboxEmail({ id: 'admin', email: 'admin@example.test', language }, sender, richBody);
    expect(mail.language).toBe(language === 'unknown' ? 'de' : language);
    expect(mail.text).toContain('Patrick Müller');
    expect(mail.subject).not.toMatch(/undefined|null/);
    expect(mail.actions[0].label).toBeTruthy();
  });
});
