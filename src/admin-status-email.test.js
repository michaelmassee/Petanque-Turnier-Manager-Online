// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_STATUS_LABELS, buildAdminStatusEmail, collectAdminStatus, sendAdminStatusEmails } from './admin-status-email.js';
import worker from './worker.js';
import { d1MitSchema } from './test-support/d1.js';

const until = '2026-10-16T01:00:00.000Z';
const from = '2026-10-15T01:00:00.000Z';
const scheduledTime = Date.parse(until);
const systemId = 'system-tournament-reports';

describe('Tägliche Administrator-Statusmail', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  function user(id, role = 'admin', verified = until, language = 'de', createdAt = from) {
    sql(`INSERT INTO users (id, email, role, email_verified_at, language, password_salt, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'salt', 'hash', ?, ?)`, id, `${id}@example.test`, role, verified, language, createdAt, createdAt);
  }
  function tournament(id, status, registrationEnabled = 1, createdAt = from) {
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, registration_enabled, created_at, updated_at)
      VALUES (?, 'admin', ?, '2099-01-01', 'Berlin', 'tete', ?, 'public', ?, ?, ?)`, id, id, status, registrationEnabled, createdAt, createdAt);
  }
  const send = (jobs = []) => sendAdminStatusEmails(env, jobs, scheduledTime, systemId);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } };
  });
  afterEach(() => vi.restoreAllMocks());

  it('zählt Bestände, exakte 24h-Grenzen, Kalendereinträge und Anmeldestatus getrennt', async () => {
    user('admin');
    user('before', 'user', until, 'de', '2026-10-15T00:59:59.999Z');
    user('at-end', 'user', null, 'en', until);
    sql('UPDATE users SET created_at = ? WHERE id = ?', from, systemId);
    tournament('running', 'running');
    tournament('calendar', 'registration', 0);
    tournament('old', 'draft', 1, '2026-01-01T00:00:00.000Z');
    tournament('at-end', 'finished', 1, until);
    for (const status of ['pending', 'confirmed', 'waitlist', 'cancelled', 'rejected']) {
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, registered_at, created_at, updated_at)
        VALUES (?, 'running', 'A', 'B', 'team@example.test', ?, ?, ?, ?)`, status, status, from, from, from);
    }
    sql("INSERT INTO visitor_daily_counts VALUES ('2026-10-15', 'guest', 12), ('2026-10-15', 'user', 3), ('2026-10-16', 'guest', 99)");
    sql("INSERT INTO api_keys (id, user_id, key_hash, label, status, requested_at, created_at, updated_at) VALUES ('key', 'admin', 'hash', 'Key', 'pending', ?, ?, ?)", from, from, from);
    sql("INSERT INTO clubs (id, name, status, owner_id, created_at, updated_at) VALUES ('club', 'Club', 'pending', 'admin', ?, ?)", from, from);
    sql("INSERT INTO club_editor_requests VALUES ('club', 'before', ?)", from);
    sql("INSERT INTO boule_places (id, club_id, name, address, status, created_at, updated_at) VALUES ('independent', NULL, 'Place', 'Berlin', 'pending', ?, ?), ('club-place', 'club', 'Club place', 'Berlin', 'pending', ?, ?)", from, from, from, from);
    sql("INSERT INTO player_listings (id, user_id, type, title, location_name, latitude, longitude, created_at, updated_at) VALUES ('listing', 'admin', 'training', 'Training', 'Berlin', 52, 13, ?, ?)", from, from);
    sql("INSERT INTO petanque_aktuell_imports VALUES ('external', 'calendar', ?, ?)", from, from);

    const stats = await collectAdminStatus(env.DB, from, until, systemId);
    expect(stats.users).toMatchObject({ total: 3, added: 1, verified: 2, admins: 1 });
    expect(stats.moderation).toEqual({ apiKeys: 1, clubs: 1, clubEditors: 1, places: 1 });
    expect(stats.listings).toEqual({ total: 1, added: 1 });
    expect(stats.imports).toEqual({ total: 1, synced: 1 });
    const mail = buildAdminStatusEmail(stats, [{ key: 'cleanup', ok: false }], from, until);
    expect(mail.text).toContain('Turniere mit Anmeldung: 3 / +1');
    expect(mail.text).toContain('Kalendereinträge: 1 / +1');
    expect(mail.text).toContain('Anmeldungen (Teams bzw. Einzelmeldungen): 5 / +5');
    expect(mail.text).toContain('Storniert: 1 / +1');
    expect(mail.text).toContain('Gäste: 12');
    expect(mail.text).toContain('Angemeldete Konten: 3');
    expect(mail.text).toContain('Fehlgeschlagen');
    expect(mail.text).not.toContain('@example.test');
  });

  it('sendet nur an verifizierte Admins und verwendet deren Kontosprache unabhängig vom Turnier-Mail-Schalter', async () => {
    user('admin');
    user('english', 'admin', until, 'en');
    user('unverified', 'admin', null);
    user('normal', 'user');
    await send();
    const mails = env.MAIL_QUEUE.send.mock.calls.map(([mail]) => mail);
    expect(mails.map((mail) => mail.to)).toEqual(['admin@example.test', 'english@example.test']);
    expect(mails[1]).toMatchObject({ language: 'en', subject: 'PTM Online – daily administrator status (2026-10-16)' });
    expect(mails[0].allowLogFallback).not.toBe(true);
  });

  it('verhindert doppelte Tagesmails auch bei parallelen Cron-Aufrufen', async () => {
    user('admin');
    await Promise.all([send(), send()]);
    await send();
    expect(env.MAIL_QUEUE.send).toHaveBeenCalledTimes(1);
    await sendAdminStatusEmails(env, [], scheduledTime + 86400000, systemId);
    expect(env.MAIL_QUEUE.send).toHaveBeenCalledTimes(2);
  });

  it('lässt nach Queue-Fehlern nur gescheiterte Empfänger erneut zu und setzt übrige Empfänger fort', async () => {
    user('a'); user('b'); user('c');
    env.MAIL_QUEUE.send.mockRejectedValueOnce(new Error('Queue unavailable'));
    await expect(send()).rejects.toThrow('Failed to enqueue');
    expect(env.MAIL_QUEUE.send).toHaveBeenCalledTimes(3);
    expect(env.DB.sqlite.prepare('SELECT user_id FROM admin_status_reports ORDER BY user_id').all()).toEqual([{ user_id: 'b' }, { user_id: 'c' }]);
    await send();
    expect(env.MAIL_QUEUE.send).toHaveBeenCalledTimes(4);
    expect(env.MAIL_QUEUE.send.mock.calls[3][0].to).toBe('a@example.test');
  });

  it('berechnet ohne Empfänger keine Kennzahlen und löscht alte Versandmarker', async () => {
    user('normal', 'user');
    sql("INSERT INTO admin_status_reports VALUES ('2026-09-01', 'normal', ?)", from);
    const batch = vi.spyOn(env.DB, 'batch');
    await send();
    expect(batch).not.toHaveBeenCalled();
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM admin_status_reports').get().count).toBe(0);
  });

  it('berechnet den Bericht für mehrere Empfänger nur einmal', async () => {
    user('admin'); user('other');
    const batch = vi.spyOn(env.DB, 'batch');
    await send();
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(8);
  });

  it('übernimmt D1-Lesekosten aus vorhandenen Abfragemetadaten ohne weitere Abfrage', async () => {
    const batch = env.DB.batch.bind(env.DB);
    vi.spyOn(env.DB, 'batch').mockImplementation(async (statements) => (await batch(statements))
      .map((result, index) => ({ ...result, meta: { ...result.meta, rows_read: index + 1 } })));
    const prepare = vi.spyOn(env.DB, 'prepare');
    const stats = await collectAdminStatus(env.DB, from, until, systemId);
    expect(stats.statisticsRowsRead).toBe(36);
    expect(prepare).toHaveBeenCalledTimes(8);
    expect(buildAdminStatusEmail(stats, [], from, until).text).toContain('D1-Lesezeilen der 8 Statistikabfragen: 36');
  });

  it.each(['de', 'en', 'fr', 'nl', 'es', 'unknown'])('rendert leere Bestände vollständig in %s', async (language) => {
    const stats = await collectAdminStatus(env.DB, from, until, systemId);
    const mail = buildAdminStatusEmail(stats, [{ key: 'stale', ok: true }, { key: 'reminders', ok: false }, { key: 'rentalsCleanup', ok: true }], from, until, language);
    expect(mail.text).not.toMatch(/undefined|NaN|null/);
    expect(mail.text).toContain('0 / +0');
    expect(mail.language).toBe(language === 'unknown' ? 'de' : language);
    expect(Object.keys(ADMIN_STATUS_LABELS[mail.language]).sort()).toEqual(Object.keys(ADMIN_STATUS_LABELS.de).sort());
  });

  it('markiert ohne Queue keine Mail als eingereiht', async () => {
    user('admin');
    delete env.MAIL_QUEUE;
    await expect(send()).rejects.toThrow('requires MAIL_QUEUE');
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM admin_status_reports').get().count).toBe(0);
  });

  async function cron(expression) {
    let pending;
    await worker.scheduled({ cron: expression, scheduledTime }, env, { waitUntil: (work) => { pending = work; } });
    await pending;
  }

  it('sendet im täglichen Cron nach den Wartungsjobs und verwendet das Ereignisdatum', async () => {
    user('admin');
    await cron('0 1 * * *');
    expect(env.MAIL_QUEUE.send).toHaveBeenCalledTimes(1);
    const mail = env.MAIL_QUEUE.send.mock.calls[0][0];
    expect(mail.subject).toContain('2026-10-16');
    expect(mail.text).toContain(`${from} – ${until}`);
    expect(mail.text).toContain('Turniererinnerungen: Beendet ohne Abbruch');
    expect(mail.text).toContain('Pétanque-Aktuell-Abgleich: Beendet ohne Abbruch');
    expect(mail.text).toContain('Abgelaufene Mietanfragen und Reservierungen löschen: Beendet ohne Abbruch');
  });

  it('versendet beim Stunden-Cron keine Statusmail und liest auch keine Berichtsmarker', async () => {
    user('admin');
    const prepare = vi.spyOn(env.DB, 'prepare');
    await cron('0 * * * *');
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
    expect(prepare.mock.calls.some(([statement]) => statement.includes('admin_status_reports'))).toBe(false);
  });

  it('meldet einen fehlgeschlagenen Wartungsjob in der täglichen Mail', async () => {
    user('admin');
    sql(`CREATE TRIGGER block_session_cleanup BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, 'cleanup blocked'); END`);
    sql("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('old', 'admin', '2000-01-01', '2000-01-01')");
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    await cron('0 1 * * *');
    expect(env.MAIL_QUEUE.send.mock.calls[0][0].text).toContain('Abgelaufene Sitzungen und Tokens bereinigen: Fehlgeschlagen');
    expect(errorLog).toHaveBeenCalled();
  });
});
