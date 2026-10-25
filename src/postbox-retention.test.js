// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import worker, { updateOwnProfile } from './worker.js';
import { cleanupReadPostboxMessages } from './postbox-retention.js';
import { d1MitSchema, migrationsDir, migrationSql } from './test-support/d1.js';

function seed(sqlite) {
  for (const id of ['sender', 'alice', 'bob', 'other']) {
    sqlite.prepare(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, email_verified_at, created_at, updated_at)
      VALUES (?, ?, 'Alice', 'Beispiel', 'user', 's', 'h', '2026-10-01', '2026-10-01', '2026-10-01')`).run(id, `${id}@example.test`);
    sqlite.prepare(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, '2099-01-01', '2026-10-01')`).run(id, id);
  }
  sqlite.exec(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
    VALUES ('t1', 'sender', 'Test', '2099-01-01', 'Ort', 'doublette', 'registration', 'public', '2026-10-01', '2026-10-01');
    INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, user_id, partner_user_id, registered_at, created_at, updated_at)
    VALUES ('r1', 't1', 'Alice', 'Beispiel', 'alice@example.test', 'waitlist', 'alice', 'bob', '2026-10-01', '2026-10-01', '2026-10-01');`);
}

function insert(sqlite, id, { sender = 'sender', recipient = 'alice', day = '2026-10-20T10:00:00.000Z', broadcast = null, readAt = null, kind = 'direct' } = {}) {
  sqlite.prepare(`INSERT INTO postbox_messages (id, sender_id, recipient_id, kind, body, created_at, broadcast_tournament_id, read_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, sender, recipient, kind, kind === 'direct' ? 'Hallo' : null, day, broadcast, readAt);
}

describe('Persönliche Postbox und Aufbewahrung', () => {
  let db;
  const request = (user, body, path = '/api/postbox/read-all') => worker.fetch(new Request(`https://ptm.test${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { Cookie: `ptm_session=${user}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { DB: db });
  const inbox = async (user) => (await request(user, undefined, '/api/postbox')).json();
  const entries = (user) => db.sqlite.prepare('SELECT * FROM postbox_entries WHERE user_id = ? ORDER BY id').all(user);

  beforeEach(() => {
    db = d1MitSchema();
    seed(db.sqlite);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    db.sqlite.close();
  });

  it('begrenzt dauerhaft inaktive Konten auf 25, auch bei identischen Zeitpunkten und ungelesenen Nachrichten', async () => {
    for (let index = 0; index < 40; index += 1) insert(db.sqlite, `m${index}`);
    expect(entries('alice')).toHaveLength(25);
    expect(entries('sender')).toHaveLength(25);
    expect(entries('alice').every((entry) => entry.read_at === null)).toBe(true);
    expect(entries('alice').map((entry) => entry.message_id)).toEqual(Array.from({ length: 25 }, (_, index) => `m${index + 15}`));
    expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM postbox_messages').get().count).toBe(25);
    expect((await inbox('alice')).unreadCount).toBe(25);
    expect((await inbox('sender')).unreadCount).toBe(0);
  });

  it('behält die Absenderkopie, wenn nur die Empfängerpostbox voll ist', async () => {
    insert(db.sqlite, 'old');
    for (let index = 0; index < 25; index += 1) insert(db.sqlite, `system${index}`, { sender: null, kind: 'system', day: '2026-10-21T10:00:00.000Z' });
    expect((await inbox('alice')).messages.some((entry) => entry.id === 'old')).toBe(false);
    expect((await inbox('sender')).messages.map((entry) => entry.id)).toEqual(['old']);
    expect(db.sqlite.prepare("SELECT id FROM postbox_messages WHERE id = 'old'").get()).toBeTruthy();
  });

  it('führt Lesen, Frist und Löschung bei Rundnachrichten pro Konto, einschließlich eigener Kopien', async () => {
    db.sqlite.exec("UPDATE registrations SET partner2_user_id = 'alice' WHERE id = 'r1'");
    insert(db.sqlite, 'broadcast', { recipient: 'sender', broadcast: 't1' });
    expect(entries('alice')).toHaveLength(1);
    expect(entries('bob')).toHaveLength(1);
    expect((await inbox('other')).messages).toEqual([]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T10:00:00.000Z'));
    expect((await request('alice', { messageIds: ['broadcast'] })).status).toBe(200);
    const firstRead = entries('alice')[0].read_at;
    vi.setSystemTime(new Date('2026-10-25T10:00:00.000Z'));
    await request('alice', { messageIds: ['broadcast'] });
    expect(entries('alice')[0].read_at).toBe(firstRead);
    expect((await inbox('bob')).unreadCount).toBe(1);
    expect((await inbox('bob')).messages[0].readAt).toBeNull();
    await cleanupReadPostboxMessages(db, Date.parse('2026-10-28T09:59:59.999Z'));
    expect(entries('alice')).toHaveLength(1);
    await cleanupReadPostboxMessages(db, Date.parse('2026-10-28T10:00:00.000Z'));
    expect(entries('alice')).toHaveLength(0);
    expect(entries('bob')).toHaveLength(1);
    expect(entries('sender')).toHaveLength(1);
    await request('sender', { messageIds: ['broadcast'] });
    expect(entries('sender')[0].read_at).not.toBeNull();
  });

  it('begrenzt auch gemeinsame Endranglisten-Meldungen bei allen Offline-Empfängern auf 25 Kopien', () => {
    for (let index = 0; index < 35; index += 1) {
      insert(db.sqlite, `ranking${index}`, { recipient: 'sender', broadcast: 't1', kind: 'system' });
    }
    for (const id of ['alice', 'bob', 'sender']) expect(entries(id)).toHaveLength(25);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM postbox_messages').get().count).toBe(25);
    expect(db.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('löscht nur fällige gelesene Kopien nach der aktuellen Profilfrist und räumt verwaiste Inhalte auf', async () => {
    insert(db.sqlite, 'direct', { readAt: '2026-10-20T10:00:00.000Z' });
    insert(db.sqlite, 'unread', { sender: null, kind: 'system', day: '2020-01-01' });
    db.sqlite.exec("UPDATE users SET postbox_read_retention_days = 30 WHERE id = 'alice'");
    await cleanupReadPostboxMessages(db, Date.parse('2026-10-27T10:00:00.000Z'));
    expect(entries('alice')).toHaveLength(2);
    db.sqlite.exec("UPDATE users SET postbox_read_retention_days = 1 WHERE id = 'alice'");
    await cleanupReadPostboxMessages(db, Date.parse('2026-10-27T10:00:00.000Z'));
    expect(entries('alice').map((entry) => entry.message_id)).toEqual(['unread']);
    expect(entries('sender')).toHaveLength(1);
    db.sqlite.exec("UPDATE postbox_entries SET read_at = '2026-10-20T10:00:00.000Z' WHERE user_id = 'sender'");
    await cleanupReadPostboxMessages(db, Date.parse('2026-10-27T10:00:00.000Z'));
    expect(db.sqlite.prepare("SELECT id FROM postbox_messages WHERE id = 'direct'").get()).toBeUndefined();
    expect(db.sqlite.prepare('SELECT * FROM postbox_orphan_candidates').all()).toEqual([]);
  });

  it('markiert nur eigene ausgewählte Nachrichten und erlaubt ohne Anmeldung keinen Zugriff', async () => {
    insert(db.sqlite, 'mine');
    insert(db.sqlite, 'not-loaded');
    insert(db.sqlite, 'foreign', { recipient: 'bob' });
    await request('alice', { messageIds: ['mine', 'foreign'] });
    expect(entries('alice').find((entry) => entry.message_id === 'mine').read_at).toBeTruthy();
    expect(entries('alice').find((entry) => entry.message_id === 'not-loaded').read_at).toBeNull();
    expect(entries('bob')[0].read_at).toBeNull();
    const response = await worker.fetch(new Request('https://ptm.test/api/postbox/read-all', { method: 'POST', body: '{}' }), { DB: db });
    expect(response.status).toBe(401);
    for (const messageIds of [null, [''], [4], Array(26).fill('mine')]) {
      expect((await request('alice', { messageIds })).status).toBe(400);
    }
    // Ältere Clients ohne Auswahl erhalten die bisherige Aktion für ihre eigene aktuelle Postbox.
    await request('alice', {});
    expect(entries('alice').every((entry) => entry.read_at)).toBe(true);
  });

  it('zeigt Rundnachrichten nach Abmeldung nicht mehr an und markiert sie nicht als gelesen', async () => {
    insert(db.sqlite, 'broadcast', { recipient: 'sender', broadcast: 't1' });
    db.sqlite.exec("UPDATE registrations SET status = 'cancelled' WHERE id = 'r1'");
    expect((await inbox('alice')).messages).toEqual([]);
    await request('alice', { messageIds: ['broadcast'] });
    expect(entries('alice')[0].read_at).toBeNull();
  });

  it('bereinigt im Tages-Cron ohne Benutzeranmeldung und führt beim Stunden-Cron keine Postbox-Bereinigung aus', async () => {
    insert(db.sqlite, 'expired-system', { sender: null, kind: 'system', readAt: '2026-10-01T00:00:00.000Z' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('test: no network')));
    const run = async (cron) => {
      let work;
      await worker.scheduled({ cron, scheduledTime: Date.parse('2026-10-28T01:00:00.000Z') }, { DB: db }, { waitUntil: (promise) => { work = promise; } });
      await work;
    };
    await run('0 * * * *');
    expect(entries('alice')).toHaveLength(1);
    await run('0 1 * * *');
    expect(entries('alice')).toHaveLength(0);
  });

  it('speichert die persönliche Frist, erhält sie für alte Clients und liefert sie über die Sitzung', async () => {
    const url = new URL('https://ptm.test/api/me');
    const save = (body) => updateOwnProfile(new Request(url, { method: 'PUT', body: JSON.stringify({
      firstName: 'Alice', lastName: 'Beispiel', email: 'alice@example.test', ...body,
    }) }), { DB: db }, url, 'alice');
    expect((await (await request('alice', undefined, '/api/session')).json()).user.postboxReadRetentionDays).toBe(7);
    expect((await (await save({ postboxReadRetentionDays: 14 })).json()).user.postboxReadRetentionDays).toBe(14);
    await save({});
    expect((await (await request('alice', undefined, '/api/session')).json()).user.postboxReadRetentionDays).toBe(14);
    for (const value of [0, 366, 1.5, '7', null, true]) {
      await expect(save({ postboxReadRetentionDays: value })).rejects.toMatchObject({ status: 400 });
    }
    expect(db.sqlite.prepare("SELECT postbox_read_retention_days FROM users WHERE id = 'alice'").get().postbox_read_retention_days).toBe(14);
  });
});

describe('Migration der bisherigen Postbox', () => {
  it('übernimmt direkte Lesenachweise, setzt gemeinsame Rundnachrichten auf ungelesen und begrenzt Bestände', () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    try {
      readdirSync(migrationsDir).filter((file) => file.endsWith('.sql') && file < '0133').sort().forEach((file) => sqlite.exec(migrationSql(file)));
      seed(sqlite);
      insert(sqlite, 'direct', { readAt: '2026-10-21T10:00:00.000Z' });
      insert(sqlite, 'broadcast', { recipient: 'sender', broadcast: 't1', readAt: '2026-10-21T10:00:00.000Z' });
      for (let index = 0; index < 40; index += 1) insert(sqlite, `system${index}`, { recipient: 'other', sender: null, kind: 'system' });
      sqlite.exec(migrationSql('0133_postbox_retention.sql'));
      expect(sqlite.prepare("SELECT read_at FROM postbox_entries WHERE message_id = 'direct' AND user_id = 'alice'").get().read_at).toBe('2026-10-21T10:00:00.000Z');
      expect(sqlite.prepare("SELECT read_at FROM postbox_entries WHERE message_id = 'direct' AND user_id = 'sender'").get().read_at).toBeNull();
      expect(sqlite.prepare("SELECT read_at FROM postbox_entries WHERE message_id = 'broadcast'").all().every((row) => row.read_at === null)).toBe(true);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM postbox_entries WHERE user_id = 'other'").get().count).toBe(25);
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(sqlite.prepare("SELECT postbox_read_retention_days FROM users WHERE id = 'alice'").get().postbox_read_retention_days).toBe(7);
    } finally { sqlite.close(); }
  });
});
