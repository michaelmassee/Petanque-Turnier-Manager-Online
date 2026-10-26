// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { createUser } from './worker.js';
import { d1MitSchema } from './test-support/d1.js';

describe('Letzte erfolgreiche Konto-Anmeldung', () => {
  let db;
  let userId;
  const password = `Test-${crypto.randomUUID()}`;
  const now = '2026-10-26T12:34:00.000Z';
  const previous = '2026-10-25T10:00:00.000Z';
  const request = (path, options = {}) => worker.fetch(new Request(`https://ptm.test${path}`, options), { DB: db });
  const login = (value = password) => request('/api/login', {
    method: 'POST', body: JSON.stringify({ email: 'anna@example.test', password: value }),
  });
  const lastLogin = () => db.sqlite.prepare('SELECT last_login_at FROM users WHERE id = ?').get(userId).last_login_at;
  const sessionCount = () => db.sqlite.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').get(userId).count;
  const adminUsers = async () => {
    const response = await request('/api/users', { headers: { Cookie: 'ptm_session=admin-session' } });
    expect(response.status).toBe(200);
    return (await response.json()).users;
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    db = d1MitSchema();
    const response = await createUser(new Request('https://ptm.test/api/users', {
      method: 'POST', body: JSON.stringify({ firstName: 'Anna', lastName: 'Schmidt', email: 'anna@example.test', role: 'user', password, emailVerified: true }),
    }), db);
    userId = (await response.json()).user.id;
    db.sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('admin', 'admin@example.test', 'admin', 's', 'h', '2026-01-01', '2026-01-01');
      INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('admin-session', 'admin', '2099-01-01', '2026-01-01')`);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    db.sqlite.close();
  });

  it('liefert bei fehlender Historie null, auch wenn eine alte Sitzung existiert', async () => {
    db.sqlite.prepare(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('old-session', ?, '2099-01-01', '2026-01-01')`).run(userId);
    expect((await adminUsers()).find((user) => user.id === userId).lastLoginAt).toBeNull();
  });

  it('speichert den Login, behält ihn nach Logout und aktualisiert ihn beim nächsten Login', async () => {
    const response = await login();
    expect(response.status).toBe(200);
    expect(lastLogin()).toBe(now);
    expect((await adminUsers()).find((user) => user.id === userId).lastLoginAt).toBe(now);
    const cookie = response.headers.get('Set-Cookie').split(';')[0];

    vi.setSystemTime('2026-10-26T13:00:00.000Z');
    expect((await request('/api/session', { headers: { Cookie: cookie } })).status).toBe(200);
    expect(lastLogin()).toBe(now); // Verlängern einer Sitzung ist keine neue Anmeldung.
    expect((await request('/api/logout', { method: 'POST', headers: { Cookie: cookie } })).status).toBe(200);
    expect(sessionCount()).toBe(0);
    expect(lastLogin()).toBe(now);

    expect((await login()).status).toBe(200);
    expect(lastLogin()).toBe('2026-10-26T13:00:00.000Z');
  });

  it.each([
    ['falsches Passwort', '', 'falsch', 401],
    ['unbestätigte E-Mail', 'email_verified_at = NULL', password, 403],
    ['erzwungener Passwortwechsel', 'password_change_required = 1', password, 403],
  ])('ändert den Zeitpunkt nicht bei %s', async (_label, update, value, status) => {
    db.sqlite.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(previous, userId);
    if (update) db.sqlite.exec(`UPDATE users SET ${update} WHERE email = 'anna@example.test'`);
    expect((await login(value)).status).toBe(status);
    expect(lastLogin()).toBe(previous);
    expect(sessionCount()).toBe(0);
  });

  it.each(['google', 'facebook'])('erfasst auch die erfolgreiche %s-Anmeldung', async (provider) => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'test-token' }))
      .mockResolvedValueOnce(Response.json({ id: 'fb-1', sub: 'g-1', email: 'anna@example.test', email_verified: true, name: 'Anna Schmidt' }));
    const env = { DB: db, GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test', FACEBOOK_APP_ID: 'test', FACEBOOK_APP_SECRET: 'test' };
    const response = await worker.fetch(new Request(`https://ptm.test/api/auth/${provider}/callback?state=test-state&code=test-code`, {
      headers: { Cookie: `ptm_${provider}_oauth_state=test-state` },
    }), env);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain(`${provider}_success`);
    expect(sessionCount()).toBe(1);
    expect(lastLogin()).toBe(now);
  });

  it('schützt die Benutzerliste und den Login-Zeitpunkt durch Admin-Rechte', async () => {
    const response = await login();
    const cookie = response.headers.get('Set-Cookie').split(';')[0];
    expect((await request('/api/users')).status).toBe(401);
    expect((await request('/api/users', { headers: { Cookie: cookie } })).status).toBe(403);
  });

  it('setzt einen neueren Zeitpunkt bei verspätetem Speichern nicht zurück', async () => {
    const later = '2026-10-26T12:35:00.000Z';
    db.sqlite.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(later, userId);
    expect((await login()).status).toBe(200);
    expect(lastLogin()).toBe(later);
  });

  it('erstellt keine Sitzung, wenn das atomare Speichern des Login-Zeitpunkts fehlschlägt', async () => {
    db.sqlite.exec(`CREATE TRIGGER reject_login_update BEFORE UPDATE OF last_login_at ON users
      BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await login()).status).toBe(500);
    expect(sessionCount()).toBe(0);
    expect(lastLogin()).toBeNull();
  });
});
