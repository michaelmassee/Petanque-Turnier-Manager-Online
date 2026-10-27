// @vitest-environment node
// Migration 0138: „Zuletzt online“ aus letzter Anmeldung bzw. letzter Sitzungsverlängerung nachtragen.
import { describe, expect, it } from 'vitest';
import { d1MitSchema, migrationSql } from './test-support/d1.js';

describe('Migration 0138 (zuletzt online)', () => {
  it('nimmt den späteren Wert aus Login und Sitzungsverlängerung, sonst NULL', () => {
    const { sqlite } = d1MitSchema();
    const user = (id, lastLogin) => sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, last_login_at, created_at, updated_at)
      VALUES (?, ?, 'user', 's', 'h', ?, '2026-01-01', '2026-01-01')`).run(id, `${id}@example.test`, lastLogin);
    const session = (id, userId, expiresAt) => sqlite.prepare(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, '2026-01-01')`).run(id, userId, expiresAt);
    user('nur-login', '2026-10-20T08:00:00.000Z');
    user('sitzung-neuer', '2026-10-01T08:00:00.000Z');
    session('s1', 'sitzung-neuer', '2026-11-08T12:00:00.000Z');
    session('s2', 'sitzung-neuer', '2026-11-01T12:00:00.000Z');
    user('login-neuer', '2026-10-27T09:00:00.000Z');
    session('s3', 'login-neuer', '2026-11-05T12:00:00.000Z');
    user('nie', null);

    // Nur der Nachtrag; ADD COLUMN ist durch d1MitSchema schon gelaufen.
    sqlite.exec(migrationSql('0138_user_last_seen.sql').slice(migrationSql('0138_user_last_seen.sql').indexOf('UPDATE users')));

    const lastSeen = Object.fromEntries(sqlite.prepare("SELECT id, last_seen_at FROM users WHERE email LIKE '%@example.test'").all().map((row) => [row.id, row.last_seen_at]));
    expect(lastSeen).toEqual({
      'nur-login': '2026-10-20T08:00:00.000Z',
      'sitzung-neuer': '2026-10-25T12:00:00.000Z',
      'login-neuer': '2026-10-27T09:00:00.000Z',
      nie: null,
    });
  });
});
