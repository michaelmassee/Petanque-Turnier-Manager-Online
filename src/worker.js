const ROLES = ['admin', 'user', 'turnierleiter'];
const SESSION_COOKIE = 'ptm_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const RESET_TTL_SECONDS = 60 * 30;
const PASSWORD_ITERATIONS = 210000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      await cleanupExpiredSessions(env.DB);

      if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
        return json({ needsSetup: await needsSetup(env.DB) });
      }

      if (request.method === 'POST' && url.pathname === '/api/setup') {
        return setupAdmin(request, env.DB);
      }

      if (request.method === 'POST' && url.pathname === '/api/login') {
        return login(request, env.DB);
      }

      if (request.method === 'POST' && url.pathname === '/api/password/forgot') {
        return forgotPassword(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/password/reset') {
        return resetPassword(request, env.DB);
      }

      if (request.method === 'POST' && url.pathname === '/api/logout') {
        return logout(request, env.DB);
      }

      if (request.method === 'GET' && url.pathname === '/api/session') {
        const session = await requireSession(request, env.DB);
        return json({ user: session.user });
      }

      if (url.pathname === '/api/users') {
        const session = await requireAdmin(request, env.DB);

        if (request.method === 'GET') {
          return listUsers(env.DB);
        }

        if (request.method === 'POST') {
          return createUser(request, env.DB, session.user.id);
        }
      }

      const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch) {
        const session = await requireAdmin(request, env.DB);

        if (request.method === 'PUT') {
          return updateUser(request, env.DB, userMatch[1], session.user.id);
        }

        if (request.method === 'DELETE') {
          return deleteUser(env.DB, userMatch[1], session.user.id);
        }
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
      }

      console.error(error);
      return json({ error: 'Internal server error' }, 500);
    }
  },
};

async function needsSetup(db) {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM users').first();
  return Number(row?.count || 0) === 0;
}

async function setupAdmin(request, db) {
  if (!(await needsSetup(db))) {
    throw new HttpError(409, 'Setup already completed');
  }

  const body = await readJson(request);
  const user = normalizeUserInput(body, { requirePassword: true });
  const password = await hashPassword(user.password);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO users (id, name, email, role, password_salt, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', ?, ?, ?, ?)`,
    )
    .bind(id, user.name, user.email, password.salt, password.hash, now, now)
    .run();

  const session = await createSession(db, id);
  return json(
    { user: toPublicUser({ id, name: user.name, email: user.email, role: 'admin', created_at: now, updated_at: now }) },
    201,
    { 'Set-Cookie': sessionCookie(session.id, session.expiresAt) },
  );
}

async function login(request, db) {
  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!email || !password) {
    throw new HttpError(400, 'Email and password are required');
  }

  const row = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
    throw new HttpError(401, 'Invalid login');
  }

  const session = await createSession(db, row.id);
  return json({ user: toPublicUser(row) }, 200, { 'Set-Cookie': sessionCookie(session.id, session.expiresAt) });
}

async function logout(request, db) {
  const sessionId = getCookie(request, SESSION_COOKIE);
  if (sessionId) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }

  return json({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie() });
}

async function forgotPassword(request, env, url) {
  const db = env.DB;
  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();

  if (!email) {
    throw new HttpError(400, 'Email is required');
  }

  const row = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  const response = {
    message: 'Wenn die E-Mail existiert, wurde ein Link zum Zurücksetzen erstellt.',
  };

  if (!row) {
    return json(response);
  }

  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const tokenHash = await sha256Hex(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + RESET_TTL_SECONDS * 1000);

  await db
    .prepare(
      `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(tokenHash, row.id, expiresAt.toISOString(), createdAt.toISOString())
    .run();

  const resetUrl = `${url.origin}/?reset_token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(env, email, resetUrl);

  if (['localhost', '127.0.0.1'].includes(url.hostname)) {
    response.resetUrl = resetUrl;
  }

  return json(response);
}

async function sendPasswordResetEmail(env, email, resetUrl) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    console.log(`Password reset link for ${email}: ${resetUrl}`);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: email,
      subject: 'Passwort zurücksetzen',
      text: `Du kannst dein Passwort über diesen Link zurücksetzen:\n\n${resetUrl}\n\nDer Link ist 30 Minuten gültig.`,
    }),
  });

  if (!response.ok) {
    console.error(`Password reset email failed for ${email}: ${response.status}`);
  }
}

async function resetPassword(request, db) {
  const body = await readJson(request);
  const token = String(body.token || '').trim();
  const password = String(body.password || '');

  if (!token) {
    throw new HttpError(400, 'Reset token is required');
  }

  if (password.length < 8) {
    throw new HttpError(400, 'Password must contain at least 8 characters');
  }

  const tokenHash = await sha256Hex(token);
  const reset = await db
    .prepare(
      `SELECT token_hash, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first();

  if (!reset || reset.used_at || new Date(reset.expires_at).getTime() <= Date.now()) {
    throw new HttpError(400, 'Invalid or expired reset token');
  }

  const hashedPassword = await hashPassword(password);
  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare('UPDATE users SET password_salt = ?, password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(hashedPassword.salt, hashedPassword.hash, now, reset.user_id),
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?').bind(now, tokenHash),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(reset.user_id),
  ]);

  return json({ ok: true });
}

async function listUsers(db) {
  const result = await db
    .prepare('SELECT id, name, email, role, created_at, updated_at FROM users ORDER BY name COLLATE NOCASE')
    .all();
  return json({ users: result.results.map(toPublicUser) });
}

async function createUser(request, db) {
  const body = await readJson(request);
  const user = normalizeUserInput(body, { requirePassword: true });
  const password = await hashPassword(user.password);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  try {
    await db
      .prepare(
        `INSERT INTO users (id, name, email, role, password_salt, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, user.name, user.email, user.role, password.salt, password.hash, now, now)
      .run();
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw new HttpError(409, 'Email already exists');
    }
    throw error;
  }

  return json({ user: toPublicUser({ id, name: user.name, email: user.email, role: user.role, created_at: now, updated_at: now }) }, 201);
}

async function updateUser(request, db, id, currentUserId) {
  const existing = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!existing) {
    throw new HttpError(404, 'User not found');
  }

  const body = await readJson(request);
  const user = normalizeUserInput(body, { requirePassword: false });
  const now = new Date().toISOString();

  if (id === currentUserId && user.role !== 'admin') {
    throw new HttpError(400, 'You cannot remove your own admin role');
  }

  try {
    if (user.password) {
      const password = await hashPassword(user.password);
      await db
        .prepare(
          `UPDATE users
           SET name = ?, email = ?, role = ?, password_salt = ?, password_hash = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(user.name, user.email, user.role, password.salt, password.hash, now, id)
        .run();
    } else {
      await db
        .prepare('UPDATE users SET name = ?, email = ?, role = ?, updated_at = ? WHERE id = ?')
        .bind(user.name, user.email, user.role, now, id)
        .run();
    }
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw new HttpError(409, 'Email already exists');
    }
    throw error;
  }

  const updated = await db
    .prepare('SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = ?')
    .bind(id)
    .first();
  return json({ user: toPublicUser(updated) });
}

async function deleteUser(db, id, currentUserId) {
  if (id === currentUserId) {
    throw new HttpError(400, 'You cannot delete your own user');
  }

  const result = await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) {
    throw new HttpError(404, 'User not found');
  }

  return json({ ok: true });
}

async function requireAdmin(request, db) {
  const session = await requireSession(request, db);
  if (session.user.role !== 'admin') {
    throw new HttpError(403, 'Admin role required');
  }
  return session;
}

async function requireSession(request, db) {
  const sessionId = getCookie(request, SESSION_COOKIE);
  if (!sessionId) {
    throw new HttpError(401, 'Login required');
  }

  const row = await db
    .prepare(
      `SELECT users.id, users.name, users.email, users.role, users.created_at, users.updated_at, sessions.expires_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ?`,
    )
    .bind(sessionId)
    .first();

  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    throw new HttpError(401, 'Login required');
  }

  return { user: toPublicUser(row) };
}

async function createSession(db, userId) {
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_SECONDS * 1000);

  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, userId, expiresAt.toISOString(), createdAt.toISOString())
    .run();

  return { id, expiresAt };
}

async function cleanupExpiredSessions(db) {
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(new Date().toISOString()).run();
  await db.prepare('DELETE FROM password_reset_tokens WHERE expires_at <= ? OR used_at IS NOT NULL').bind(new Date().toISOString()).run();
}

function normalizeUserInput(body, { requirePassword }) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || 'user').trim().toLowerCase();
  const password = body.password === undefined ? '' : String(body.password);

  if (name.length < 2) {
    throw new HttpError(400, 'Name must contain at least 2 characters');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'A valid email is required');
  }

  if (!ROLES.includes(role)) {
    throw new HttpError(400, 'Invalid role');
  }

  if (requirePassword && password.length < 8) {
    throw new HttpError(400, 'Password must contain at least 8 characters');
  }

  if (!requirePassword && password && password.length < 8) {
    throw new HttpError(400, 'Password must contain at least 8 characters');
  }

  return { name, email, role, password };
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await importPasswordKey(password);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256,
  );
  return { salt: toHex(salt), hash: toHex(bits) };
}

async function verifyPassword(password, salt, expectedHash) {
  const key = await importPasswordKey(password);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: fromHex(salt),
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256,
  );
  return timingSafeEqual(toHex(bits), expectedHash);
}

async function importPasswordKey(password) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
}

async function sha256Hex(value) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function sessionCookie(value, expiresAt) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Secure; Expires=${expiresAt.toUTCString()}`;
}

function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
