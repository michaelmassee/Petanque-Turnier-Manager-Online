const ROLES = ['admin', 'user', 'turnierleiter'];
const TOURNAMENT_TYPES = [
  'formule_x',
  'jeder_gegen_jeden',
  'ko',
  'kaskaden',
  'liga',
  'maastrichter',
  'poule_ab',
  'schweizer',
  'supermelee',
  'trip_tete',
];
const FORMATIONS = ['tete', 'doublette', 'triplette'];
const TOURNAMENT_STATUSES = ['draft', 'registration', 'running', 'finished'];
const VISIBILITIES = ['public', 'private'];
const REGISTRATION_STATUSES = ['pending', 'confirmed', 'cancelled', 'waitlist'];
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
          return createUser(request, env.DB);
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

      if (url.pathname === '/api/tournaments') {
        const session = await optionalSession(request, env.DB);

        if (request.method === 'GET') {
          return listTournaments(env.DB, session?.user || null);
        }

        if (request.method === 'POST') {
          requireTournamentManager(session);
          return createTournament(request, env.DB, session.user);
        }
      }

      const tournamentRegistrationsMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/registrations$/);
      if (tournamentRegistrationsMatch) {
        const tournament = await getTournamentById(env.DB, tournamentRegistrationsMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Tournament not found');
        }

        if (request.method === 'GET') {
          const session = await requireSession(request, env.DB);
          assertCanManageTournament(tournament, session.user);
          return listRegistrations(env.DB, tournament.id);
        }

        if (request.method === 'POST') {
          return createRegistration(request, env.DB, tournament);
        }
      }

      const tournamentMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)$/);
      if (tournamentMatch) {
        const tournament = await getTournamentById(env.DB, tournamentMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Tournament not found');
        }

        if (request.method === 'GET') {
          const session = await optionalSession(request, env.DB);
          if (!canViewTournament(tournament, session?.user || null)) {
            throw new HttpError(403, 'Access denied');
          }
          return json({ tournament: toPublicTournament(tournament, session?.user || null) });
        }

        const session = await requireSession(request, env.DB);
        assertCanManageTournament(tournament, session.user);

        if (request.method === 'PUT') {
          return updateTournament(request, env.DB, tournament, session.user);
        }

        if (request.method === 'DELETE') {
          return deleteTournament(env.DB, tournament.id);
        }
      }

      const registrationMatch = url.pathname.match(/^\/api\/registrations\/([^/]+)$/);
      if (registrationMatch) {
        const session = await requireSession(request, env.DB);
        const registration = await getRegistrationWithTournament(env.DB, registrationMatch[1]);
        if (!registration) {
          throw new HttpError(404, 'Registration not found');
        }
        assertCanManageTournament(registration, session.user);

        if (request.method === 'PUT') {
          return updateRegistration(request, env.DB, registration);
        }

        if (request.method === 'DELETE') {
          return deleteRegistration(env.DB, registration.id);
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

async function listTournaments(db, user) {
  const rows = await db
    .prepare(
      `SELECT tournaments.*, users.name AS manager_name,
        (
          SELECT COUNT(*)
          FROM registrations
          WHERE registrations.tournament_id = tournaments.id
            AND registrations.status IN ('pending', 'confirmed')
        ) AS active_registrations,
        (
          SELECT COUNT(*)
          FROM registrations
          WHERE registrations.tournament_id = tournaments.id
            AND registrations.status = 'waitlist'
        ) AS waitlist_registrations
       FROM tournaments
       LEFT JOIN users ON users.id = tournaments.manager_id
       WHERE (?1 IS NOT NULL AND ?1 = 'admin')
          OR (?1 IS NOT NULL AND ?1 = 'turnierleiter' AND (tournaments.created_by = ?2 OR tournaments.manager_id = ?2 OR tournaments.visibility = 'public'))
          OR tournaments.visibility = 'public'
       ORDER BY tournaments.date DESC, tournaments.name COLLATE NOCASE`,
    )
    .bind(user?.role || null, user?.id || null)
    .all();

  return json({ tournaments: rows.results.map((row) => toPublicTournament(row, user)) });
}

async function createTournament(request, db, user) {
  const body = await readJson(request);
  const tournament = normalizeTournamentInput(body);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const managerId = user.role === 'admin' ? tournament.managerId || user.id : user.id;

  await db
    .prepare(
      `INSERT INTO tournaments (
        id, created_by, manager_id, name, date, start_time, location, description, type, formation, status,
        max_registrations, registration_deadline, entry_fee_cents, contact_name, contact_email, contact_phone,
        visibility, internal_notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      user.id,
      managerId,
      tournament.name,
      tournament.date,
      tournament.startTime,
      tournament.location,
      tournament.description,
      tournament.type,
      tournament.formation,
      tournament.status,
      tournament.maxRegistrations,
      tournament.registrationDeadline,
      tournament.entryFeeCents,
      tournament.contactName,
      tournament.contactEmail,
      tournament.contactPhone,
      tournament.visibility,
      tournament.internalNotes,
      now,
      now,
    )
    .run();

  const created = await getTournamentById(db, id);
  return json({ tournament: toPublicTournament(created, user) }, 201);
}

async function updateTournament(request, db, existing, user) {
  const body = await readJson(request);
  const tournament = normalizeTournamentInput(body);
  const now = new Date().toISOString();
  const managerId = user.role === 'admin' ? tournament.managerId || existing.manager_id || user.id : existing.manager_id || user.id;

  await db
    .prepare(
      `UPDATE tournaments
       SET manager_id = ?, name = ?, date = ?, start_time = ?, location = ?, description = ?, type = ?,
           formation = ?, status = ?, max_registrations = ?, registration_deadline = ?, entry_fee_cents = ?,
           contact_name = ?, contact_email = ?, contact_phone = ?, visibility = ?, internal_notes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      managerId,
      tournament.name,
      tournament.date,
      tournament.startTime,
      tournament.location,
      tournament.description,
      tournament.type,
      tournament.formation,
      tournament.status,
      tournament.maxRegistrations,
      tournament.registrationDeadline,
      tournament.entryFeeCents,
      tournament.contactName,
      tournament.contactEmail,
      tournament.contactPhone,
      tournament.visibility,
      tournament.internalNotes,
      now,
      existing.id,
    )
    .run();

  const updated = await getTournamentById(db, existing.id);
  return json({ tournament: toPublicTournament(updated, user) });
}

async function deleteTournament(db, id) {
  const result = await db.prepare('DELETE FROM tournaments WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) {
    throw new HttpError(404, 'Tournament not found');
  }
  return json({ ok: true });
}

async function listRegistrations(db, tournamentId) {
  const result = await db
    .prepare('SELECT * FROM registrations WHERE tournament_id = ? ORDER BY registered_at DESC')
    .bind(tournamentId)
    .all();
  return json({ registrations: result.results.map(toPublicRegistration) });
}

async function createRegistration(request, db, tournament) {
  if (tournament.visibility !== 'public' || tournament.status !== 'registration') {
    throw new HttpError(403, 'Registration is closed');
  }

  if (tournament.registration_deadline && new Date(tournament.registration_deadline).getTime() < Date.now()) {
    throw new HttpError(403, 'Registration deadline has passed');
  }

  const body = await readJson(request);
  const registration = normalizeRegistrationInput(body, { requireStatus: false });
  const status = await initialRegistrationStatus(db, tournament);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO registrations (
        id, tournament_id, first_name, last_name, email, club, license_nr,
        partner_first_name, partner_last_name, partner_email,
        partner2_first_name, partner2_last_name, partner2_email,
        team_name, seeding_position, status, registered_at, confirmed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      tournament.id,
      registration.firstName,
      registration.lastName,
      registration.email,
      registration.club,
      registration.licenseNr,
      registration.partnerFirstName,
      registration.partnerLastName,
      registration.partnerEmail,
      registration.partner2FirstName,
      registration.partner2LastName,
      registration.partner2Email,
      registration.teamName,
      registration.seedingPosition,
      status,
      now,
      status === 'confirmed' ? now : null,
      now,
      now,
    )
    .run();

  const created = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(id).first();
  return json({ registration: toPublicRegistration(created) }, 201);
}

async function updateRegistration(request, db, existing) {
  const body = await readJson(request);
  const registration = normalizeRegistrationInput(body, { requireStatus: true });
  const now = new Date().toISOString();
  const confirmedAt = registration.status === 'confirmed' ? existing.confirmed_at || now : null;

  await db
    .prepare(
      `UPDATE registrations
       SET first_name = ?, last_name = ?, email = ?, club = ?, license_nr = ?,
           partner_first_name = ?, partner_last_name = ?, partner_email = ?,
           partner2_first_name = ?, partner2_last_name = ?, partner2_email = ?,
           team_name = ?, seeding_position = ?, status = ?, confirmed_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      registration.firstName,
      registration.lastName,
      registration.email,
      registration.club,
      registration.licenseNr,
      registration.partnerFirstName,
      registration.partnerLastName,
      registration.partnerEmail,
      registration.partner2FirstName,
      registration.partner2LastName,
      registration.partner2Email,
      registration.teamName,
      registration.seedingPosition,
      registration.status,
      confirmedAt,
      now,
      existing.id,
    )
    .run();

  const updated = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(existing.id).first();
  return json({ registration: toPublicRegistration(updated) });
}

async function deleteRegistration(db, id) {
  const result = await db.prepare('DELETE FROM registrations WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) {
    throw new HttpError(404, 'Registration not found');
  }
  return json({ ok: true });
}

async function initialRegistrationStatus(db, tournament) {
  if (!Number(tournament.max_registrations)) {
    return 'pending';
  }

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM registrations
       WHERE tournament_id = ? AND status IN ('pending', 'confirmed')`,
    )
    .bind(tournament.id)
    .first();

  return Number(row?.count || 0) >= Number(tournament.max_registrations) ? 'waitlist' : 'pending';
}

async function getTournamentById(db, id) {
  return db
    .prepare(
      `SELECT tournaments.*, users.name AS manager_name,
        (
          SELECT COUNT(*)
          FROM registrations
          WHERE registrations.tournament_id = tournaments.id
            AND registrations.status IN ('pending', 'confirmed')
        ) AS active_registrations,
        (
          SELECT COUNT(*)
          FROM registrations
          WHERE registrations.tournament_id = tournaments.id
            AND registrations.status = 'waitlist'
        ) AS waitlist_registrations
       FROM tournaments
       LEFT JOIN users ON users.id = tournaments.manager_id
       WHERE tournaments.id = ?`,
    )
    .bind(id)
    .first();
}

async function getRegistrationWithTournament(db, id) {
  return db
    .prepare(
      `SELECT registrations.*, tournaments.created_by, tournaments.manager_id, tournaments.visibility
       FROM registrations
       JOIN tournaments ON tournaments.id = registrations.tournament_id
       WHERE registrations.id = ?`,
    )
    .bind(id)
    .first();
}

function requireTournamentManager(session) {
  if (!session || !['admin', 'turnierleiter'].includes(session.user.role)) {
    throw new HttpError(403, 'Admin or Turnierleiter role required');
  }
}

function canViewTournament(tournament, user) {
  return tournament.visibility === 'public' || canManageTournament(tournament, user);
}

function canManageTournament(tournament, user) {
  if (!user) {
    return false;
  }
  return user.role === 'admin' || (user.role === 'turnierleiter' && (tournament.created_by === user.id || tournament.manager_id === user.id));
}

function assertCanManageTournament(tournament, user) {
  if (!canManageTournament(tournament, user)) {
    throw new HttpError(403, 'Access denied');
  }
}

async function requireAdmin(request, db) {
  const session = await requireSession(request, db);
  if (session.user.role !== 'admin') {
    throw new HttpError(403, 'Admin role required');
  }
  return session;
}

async function optionalSession(request, db) {
  try {
    return await requireSession(request, db);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      return null;
    }
    throw error;
  }
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

  if (!isEmail(email)) {
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

function normalizeTournamentInput(body) {
  const tournament = {
    name: text(body.name),
    date: text(body.date),
    startTime: nullableText(body.startTime),
    location: text(body.location),
    description: nullableText(body.description),
    type: text(body.type || 'supermelee'),
    formation: text(body.formation || 'doublette'),
    status: text(body.status || 'draft'),
    maxRegistrations: nonNegativeInteger(body.maxRegistrations),
    registrationDeadline: nullableText(body.registrationDeadline),
    entryFeeCents: nonNegativeInteger(body.entryFeeCents),
    contactName: nullableText(body.contactName),
    contactEmail: nullableText(body.contactEmail),
    contactPhone: nullableText(body.contactPhone),
    visibility: text(body.visibility || 'private'),
    internalNotes: nullableText(body.internalNotes),
    managerId: nullableText(body.managerId),
  };

  if (tournament.name.length < 2) {
    throw new HttpError(400, 'Tournament name must contain at least 2 characters');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tournament.date)) {
    throw new HttpError(400, 'A valid tournament date is required');
  }
  if (tournament.startTime && !/^\d{2}:\d{2}$/.test(tournament.startTime)) {
    throw new HttpError(400, 'A valid start time is required');
  }
  if (tournament.location.length < 2) {
    throw new HttpError(400, 'Location must contain at least 2 characters');
  }
  if (!TOURNAMENT_TYPES.includes(tournament.type)) {
    throw new HttpError(400, 'Invalid tournament type');
  }
  if (!FORMATIONS.includes(tournament.formation)) {
    throw new HttpError(400, 'Invalid formation');
  }
  if (!TOURNAMENT_STATUSES.includes(tournament.status)) {
    throw new HttpError(400, 'Invalid tournament status');
  }
  if (!VISIBILITIES.includes(tournament.visibility)) {
    throw new HttpError(400, 'Invalid visibility');
  }
  if (tournament.contactEmail && !isEmail(tournament.contactEmail)) {
    throw new HttpError(400, 'A valid contact email is required');
  }

  return tournament;
}

function normalizeRegistrationInput(body, { requireStatus }) {
  const registration = {
    firstName: text(body.firstName),
    lastName: text(body.lastName),
    email: text(body.email).toLowerCase(),
    club: nullableText(body.club),
    licenseNr: nullableText(body.licenseNr),
    partnerFirstName: nullableText(body.partnerFirstName),
    partnerLastName: nullableText(body.partnerLastName),
    partnerEmail: nullableText(body.partnerEmail)?.toLowerCase() || null,
    partner2FirstName: nullableText(body.partner2FirstName),
    partner2LastName: nullableText(body.partner2LastName),
    partner2Email: nullableText(body.partner2Email)?.toLowerCase() || null,
    teamName: nullableText(body.teamName),
    seedingPosition: body.seedingPosition === '' || body.seedingPosition === undefined ? null : nonNegativeInteger(body.seedingPosition),
    status: text(body.status || 'pending'),
  };

  if (registration.firstName.length < 2 || registration.lastName.length < 2) {
    throw new HttpError(400, 'First name and last name are required');
  }
  if (!isEmail(registration.email)) {
    throw new HttpError(400, 'A valid email is required');
  }
  if (registration.partnerEmail && !isEmail(registration.partnerEmail)) {
    throw new HttpError(400, 'A valid partner email is required');
  }
  if (registration.partner2Email && !isEmail(registration.partner2Email)) {
    throw new HttpError(400, 'A valid second partner email is required');
  }
  if (requireStatus && !REGISTRATION_STATUSES.includes(registration.status)) {
    throw new HttpError(400, 'Invalid registration status');
  }

  return registration;
}

function text(value) {
  return String(value || '').trim();
}

function nullableText(value) {
  const normalized = text(value);
  return normalized || null;
}

function nonNegativeInteger(value) {
  const number = Number(value || 0);
  if (!Number.isInteger(number) || number < 0) {
    throw new HttpError(400, 'A non-negative integer is required');
  }
  return number;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function toPublicTournament(row, user) {
  return {
    id: row.id,
    createdBy: row.created_by,
    managerId: row.manager_id,
    managerName: row.manager_name,
    name: row.name,
    date: row.date,
    startTime: row.start_time,
    location: row.location,
    description: row.description,
    type: row.type,
    formation: row.formation,
    status: row.status,
    maxRegistrations: Number(row.max_registrations || 0),
    registrationDeadline: row.registration_deadline,
    entryFeeCents: Number(row.entry_fee_cents || 0),
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    visibility: row.visibility,
    internalNotes: canManageTournament(row, user) ? row.internal_notes : null,
    activeRegistrations: Number(row.active_registrations || 0),
    waitlistRegistrations: Number(row.waitlist_registrations || 0),
    canManage: canManageTournament(row, user),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicRegistration(row) {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    club: row.club,
    licenseNr: row.license_nr,
    partnerFirstName: row.partner_first_name,
    partnerLastName: row.partner_last_name,
    partnerEmail: row.partner_email,
    partner2FirstName: row.partner2_first_name,
    partner2LastName: row.partner2_last_name,
    partner2Email: row.partner2_email,
    teamName: row.team_name,
    seedingPosition: row.seeding_position,
    status: row.status,
    registeredAt: row.registered_at,
    confirmedAt: row.confirmed_at,
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
