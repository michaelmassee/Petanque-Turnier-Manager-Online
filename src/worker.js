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
const TOURNAMENT_TIP_STATUSES = ['pending_verification', 'pending_review', 'approved', 'rejected'];
const TOURNAMENT_TIP_VERIFICATION_TTL_SECONDS = 60 * 60 * 24;
const LANGUAGES = ['de', 'nl', 'en', 'es', 'fr'];
const SESSION_COOKIE = 'ptm_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const RESET_TTL_SECONDS = 60 * 30;
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60 * 15;
const LOGIN_RATE_LIMIT_MAX_PER_EMAIL = 5;
const LOGIN_RATE_LIMIT_MAX_PER_IP = 20;
const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24;
// Changing this invalidates every stored password_hash (verifyPassword re-derives with the
// current value). Any seeded/test users must be re-hashed and re-seeded after a change.
const PASSWORD_ITERATIONS = 100000;
const UNSAFE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};
const EMAIL_VERIFICATION_EMAILS = {
  de: {
    subject: 'E-Mail-Adresse bestätigen',
    text: (verificationUrl) => `Bitte bestätige deine E-Mail-Adresse über diesen Link:\n\n${verificationUrl}\n\nDer Link ist 24 Stunden gültig.`,
  },
  nl: {
    subject: 'E-mailadres bevestigen',
    text: (verificationUrl) => `Bevestig je e-mailadres via deze link:\n\n${verificationUrl}\n\nDe link is 24 uur geldig.`,
  },
  en: {
    subject: 'Verify your email address',
    text: (verificationUrl) => `Verify your email address with this link:\n\n${verificationUrl}\n\nThe link is valid for 24 hours.`,
  },
  es: {
    subject: 'Confirmar correo electronico',
    text: (verificationUrl) => `Confirma tu correo electronico con este enlace:\n\n${verificationUrl}\n\nEl enlace es valido durante 24 horas.`,
  },
  fr: {
    subject: 'Confirmer l’adresse e-mail',
    text: (verificationUrl) => `Confirme ton adresse e-mail avec ce lien:\n\n${verificationUrl}\n\nLe lien est valable 24 heures.`,
  },
};

const TOURNAMENT_TIP_VERIFICATION_EMAILS = {
  de: {
    subject: 'Turniermeldung bestätigen',
    text: (verificationUrl) => `Bitte bestätige deine Turniermeldung über diesen Link:\n\n${verificationUrl}\n\nDer Link ist 24 Stunden gültig.`,
  },
  nl: {
    subject: 'Toernooimelding bevestigen',
    text: (verificationUrl) => `Bevestig je toernooimelding via deze link:\n\n${verificationUrl}\n\nDe link is 24 uur geldig.`,
  },
  en: {
    subject: 'Confirm your tournament submission',
    text: (verificationUrl) => `Please confirm your tournament submission with this link:\n\n${verificationUrl}\n\nThe link is valid for 24 hours.`,
  },
  es: {
    subject: 'Confirmar aviso de torneo',
    text: (verificationUrl) => `Confirma tu aviso de torneo con este enlace:\n\n${verificationUrl}\n\nEl enlace es valido durante 24 horas.`,
  },
  fr: {
    subject: 'Confirmer le signalement du tournoi',
    text: (verificationUrl) => `Confirme le signalement de ton tournoi avec ce lien :\n\n${verificationUrl}\n\nLe lien est valable 24 heures.`,
  },
};

const PWA_INSTALL_PATHS = ['/manifest.webmanifest', '/service-worker.js'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isPwaInstallAsset = PWA_INSTALL_PATHS.includes(url.pathname) || url.pathname.startsWith('/icons/');

    if (!isPwaInstallAsset) {
      const authResponse = await requireBasicAuth(request, env);
      if (authResponse) {
        return authResponse;
      }
    }

    if (!url.pathname.startsWith('/api/')) {
      return withSecurityHeaders(await env.ASSETS.fetch(request), url);
    }

    try {
      assertSameOriginForUnsafeMethods(request, url);
      await cleanupExpiredSessions(env.DB);

      if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
        return json({ needsSetup: await needsSetup(env.DB) });
      }

      if (request.method === 'POST' && url.pathname === '/api/setup') {
        return await setupAdmin(request, env.DB, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/login') {
        return await login(request, env.DB, url);
      }


      if (request.method === 'POST' && url.pathname === '/api/register') {
        return await registerUser(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/turnierleiter-access-requests') {
        return await requestTurnierleiterAccess(request, env.DB);
      }

      if (request.method === 'POST' && url.pathname === '/api/email/verify') {
        return await verifyEmail(request, env.DB);
      }

      if (request.method === 'POST' && url.pathname === '/api/password/forgot') {
        return await forgotPassword(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/password/reset') {
        return await resetPassword(request, env.DB);
      }

      if (request.method === 'POST' && url.pathname === '/api/logout') {
        return await logout(request, env.DB, url);
      }

      if (request.method === 'GET' && url.pathname === '/api/session') {
        const session = await requireSession(request, env.DB);
        return json({ user: session.user });
      }

      if (url.pathname === '/api/users') {
        const session = await requireAdmin(request, env.DB);

        if (request.method === 'GET') {
          return await listUsers(env.DB);
        }

        if (request.method === 'POST') {
          return await createUser(request, env.DB);
        }
      }

      const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch) {
        const session = await requireAdmin(request, env.DB);

        if (request.method === 'PUT') {
          return await updateUser(request, env.DB, userMatch[1], session.user.id);
        }

        if (request.method === 'DELETE') {
          return await deleteUser(env.DB, userMatch[1], session.user.id);
        }
      }

      if (request.method === 'GET' && url.pathname === '/api/admin/turnierleiter-access-requests') {
        await requireAdmin(request, env.DB);
        return await listTurnierleiterAccessRequests(env.DB, url);
      }

      const turnierleiterAccessApproveMatch = url.pathname.match(/^\/api\/admin\/turnierleiter-access-requests\/([^/]+)\/approve$/);
      if (turnierleiterAccessApproveMatch && request.method === 'POST') {
        const session = await requireAdmin(request, env.DB);
        return await approveTurnierleiterAccessRequest(env.DB, turnierleiterAccessApproveMatch[1], session.user.id);
      }

      const turnierleiterAccessRejectMatch = url.pathname.match(/^\/api\/admin\/turnierleiter-access-requests\/([^/]+)\/reject$/);
      if (turnierleiterAccessRejectMatch && request.method === 'POST') {
        const session = await requireAdmin(request, env.DB);
        return await rejectTurnierleiterAccessRequest(env.DB, turnierleiterAccessRejectMatch[1], session.user.id);
      }

      if (url.pathname === '/api/api-keys') {
        const session = await requireSession(request, env.DB);
        requireTournamentManager(session);

        if (request.method === 'GET') {
          return await listOwnApiKeys(env.DB, session.user.id);
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/api-keys/request') {
        const session = await requireSession(request, env.DB);
        requireTournamentManager(session);
        return await requestApiKey(request, env.DB, session.user);
      }

      const apiKeySecretMatch = url.pathname.match(/^\/api\/api-keys\/([^/]+)\/secret$/);
      if (apiKeySecretMatch && request.method === 'GET') {
        const session = await requireSession(request, env.DB);
        requireTournamentManager(session);
        return await retrieveApiKeySecret(env.DB, apiKeySecretMatch[1], session.user.id);
      }

      if (request.method === 'GET' && url.pathname === '/api/admin/api-keys') {
        await requireAdmin(request, env.DB);
        return await listAllApiKeys(env.DB, url);
      }

      const adminApiKeyApproveMatch = url.pathname.match(/^\/api\/admin\/api-keys\/([^/]+)\/approve$/);
      if (adminApiKeyApproveMatch && request.method === 'POST') {
        const session = await requireAdmin(request, env.DB);
        return await approveApiKey(env.DB, adminApiKeyApproveMatch[1], session.user.id);
      }

      const adminApiKeyRevokeMatch = url.pathname.match(/^\/api\/admin\/api-keys\/([^/]+)\/revoke$/);
      if (adminApiKeyRevokeMatch && request.method === 'POST') {
        await requireAdmin(request, env.DB);
        return await revokeApiKey(env.DB, adminApiKeyRevokeMatch[1]);
      }

      if (url.pathname === '/api/tournaments') {
        if (request.method === 'GET') {
          const session = await optionalSession(request, env.DB);
          return await listTournaments(env.DB, session?.user || null);
        }

        if (request.method === 'POST') {
          const auth = await requireManagerAuth(request, env.DB);
          requireTournamentManager(auth);
          return await createTournament(request, env.DB, auth.user);
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
          return await listRegistrations(env.DB, tournament.id);
        }

        if (request.method === 'POST') {
          return await createRegistration(request, env.DB, tournament);
        }
      }

      const tournamentParticipantsMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/participants$/);
      if (tournamentParticipantsMatch) {
        const tournament = await getTournamentById(env.DB, tournamentParticipantsMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Tournament not found');
        }

        if (request.method === 'GET') {
          const session = await optionalSession(request, env.DB);
          if (!canViewParticipants(tournament, session?.user || null)) {
            throw new HttpError(403, 'Access denied');
          }
          return await listPublicParticipants(env.DB, tournament.id);
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
          return await updateTournament(request, env.DB, tournament, session.user);
        }

        if (request.method === 'DELETE') {
          return await deleteTournament(env.DB, tournament.id);
        }
      }

      const registrationMatch = url.pathname.match(/^\/api\/registrations\/([^/]+)$/);
      if (registrationMatch) {
        const auth = await requireManagerAuth(request, env.DB);
        const registration = await getRegistrationWithTournament(env.DB, registrationMatch[1]);
        if (!registration) {
          throw new HttpError(404, 'Registration not found');
        }
        assertCanManageTournament(registration, auth.user);

        if (request.method === 'PUT') {
          return await updateRegistration(request, env.DB, registration);
        }

        if (request.method === 'DELETE') {
          return await deleteRegistration(env.DB, registration.id);
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/tournament-tips') {
        return await submitTournamentTip(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/tournament-tips/verify') {
        return await verifyTournamentTip(request, env.DB);
      }

      if (request.method === 'GET' && url.pathname === '/api/tournament-tips/approved') {
        return await listApprovedTournamentTips(env.DB);
      }

      if (request.method === 'GET' && url.pathname === '/api/tournament-tips/pending') {
        await requireAdmin(request, env.DB);
        return await listPendingTournamentTips(env.DB);
      }

      const tipMatch = url.pathname.match(/^\/api\/tournament-tips\/([^/]+)$/);
      if (tipMatch) {
        await requireAdmin(request, env.DB);

        if (request.method === 'PUT') {
          return await updateTournamentTipStatus(request, env.DB, tipMatch[1]);
        }

        if (request.method === 'DELETE') {
          return await deleteTournamentTip(env.DB, tipMatch[1]);
        }
      }

      const syncRegistrationsMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/registrations$/);
      if (syncRegistrationsMatch && request.method === 'GET') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getTournamentById(env.DB, syncRegistrationsMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Tournament not found');
        }
        assertCanManageTournament(tournament, auth.user);
        return await syncGetRegistrations(env.DB, tournament.id, url);
      }

      const syncResultsMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/results$/);
      if (syncResultsMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getTournamentById(env.DB, syncResultsMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Tournament not found');
        }
        assertCanManageTournament(tournament, auth.user);
        return await syncPostResults(request, env.DB, tournament.id);
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

async function requireBasicAuth(request, env) {
  const expectedUser = env.BASIC_AUTH_USER;
  const expectedPassword = env.BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return null;
  }

  const header = request.headers.get('Authorization') || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme === 'Basic' && encoded) {
    let decoded = '';
    try {
      decoded = atob(encoded);
    } catch {
      decoded = '';
    }

    const separatorIndex = decoded.indexOf(':');
    const user = separatorIndex === -1 ? decoded : decoded.slice(0, separatorIndex);
    const password = separatorIndex === -1 ? '' : decoded.slice(separatorIndex + 1);

    const userMatches = await constantTimeEquals(user, expectedUser);
    const passwordMatches = await constantTimeEquals(password, expectedPassword);

    if (userMatches && passwordMatches) {
      return null;
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Pétanque Turnier Manager"' },
  });
}

async function constantTimeEquals(a, b) {
  const [hashA, hashB] = await Promise.all([sha256Hex(a), sha256Hex(b)]);

  if (hashA.length !== hashB.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    mismatch |= hashA.charCodeAt(i) ^ hashB.charCodeAt(i);
  }

  return mismatch === 0;
}

async function needsSetup(db) {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM users').first();
  return Number(row?.count || 0) === 0;
}

async function setupAdmin(request, db, url) {
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
      `INSERT INTO users (id, name, email, role, password_salt, password_hash, email_verified_at, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', ?, ?, ?, ?, ?)`,
    )
    .bind(id, user.name, user.email, password.salt, password.hash, now, now, now)
    .run();

  const session = await createSession(db, id);
  return json(
    { user: toPublicUser({ id, name: user.name, email: user.email, role: 'admin', email_verified_at: now, created_at: now, updated_at: now }) },
    201,
    { 'Set-Cookie': sessionCookie(session.id, session.expiresAt, url) },
  );
}

async function login(request, db, url) {
  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  if (!email || !password) {
    throw new HttpError(400, 'Email and password are required');
  }

  await enforceLoginRateLimit(db, email, ip);

  const row = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
    await recordLoginAttempt(db, email, ip);
    throw new HttpError(401, 'Invalid login');
  }

  if (!row.email_verified_at) {
    await recordLoginAttempt(db, email, ip);
    return json({ error: 'Bitte bestätige zuerst deine E-Mail-Adresse.' }, 403);
  }

  await clearLoginAttempts(db, email);

  if (Number(row.password_change_required || 0)) {
    const token = await createPasswordResetToken(db, row.id);
    return json(
      {
        error: 'Bitte ändere dein Passwort, bevor du fortfährst.',
        passwordChangeRequired: true,
        resetToken: token,
      },
      403,
    );
  }

  const session = await createSession(db, row.id);
  return json({ user: toPublicUser(row) }, 200, { 'Set-Cookie': sessionCookie(session.id, session.expiresAt, url) });
}

async function registerUser(request, env, url) {
  const db = env.DB;
  const body = await readJson(request);
  const user = normalizeUserInput({ ...body, role: 'user' }, { requirePassword: true });
  const language = normalizeLanguage(body.language);
  const password = await hashPassword(user.password);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  try {
    await db
      .prepare(
        `INSERT INTO users (id, name, email, role, password_salt, password_hash, email_verified_at, created_at, updated_at)
         VALUES (?, ?, ?, 'user', ?, ?, NULL, ?, ?)`,
      )
      .bind(id, user.name, user.email, password.salt, password.hash, now, now)
      .run();
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw new HttpError(409, 'Email already exists');
    }
    throw error;
  }

  const verificationUrl = await createEmailVerification(db, env, url, id, user.email, language);
  const response = {
    message: 'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.',
  };

  if (isLocalhost(url)) {
    response.verificationUrl = verificationUrl;
  }

  return json(response, 201);
}

async function verifyEmail(request, db) {
  const body = await readJson(request);
  const token = String(body.token || '').trim();

  if (!token) {
    throw new HttpError(400, 'Bestätigungs-Token ist erforderlich');
  }

  const tokenHash = await sha256Hex(token);
  const verification = await db
    .prepare(
      `SELECT token_hash, user_id, expires_at, used_at
       FROM email_verification_tokens
       WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first();

  if (!verification || verification.used_at || new Date(verification.expires_at).getTime() <= Date.now()) {
    throw new HttpError(400, 'Bestätigungs-Link ist ungültig oder abgelaufen');
  }

  const now = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?').bind(now, now, verification.user_id),
    db.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE token_hash = ?').bind(now, tokenHash),
  ]);

  return json({ ok: true });
}

async function createPasswordResetToken(db, userId) {
  await db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(userId).run();

  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const tokenHash = await sha256Hex(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + RESET_TTL_SECONDS * 1000);

  await db
    .prepare(
      `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(tokenHash, userId, expiresAt.toISOString(), createdAt.toISOString())
    .run();

  return token;
}

async function logout(request, db, url) {
  const sessionId = getCookie(request, SESSION_COOKIE);
  if (sessionId) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }

  return json({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie(url) });
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

  const token = await createPasswordResetToken(db, row.id);
  const resetUrl = `${url.origin}/?reset_token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(env, email, resetUrl, isLocalhost(url));

  if (isLocalhost(url)) {
    response.resetUrl = resetUrl;
  }

  return json(response);
}

async function createEmailVerification(db, env, url, userId, email, language) {
  await db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').bind(userId).run();

  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const tokenHash = await sha256Hex(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + EMAIL_VERIFICATION_TTL_SECONDS * 1000);

  await db
    .prepare(
      `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(tokenHash, userId, expiresAt.toISOString(), createdAt.toISOString())
    .run();

  const verificationUrl = `${url.origin}/?verify_token=${encodeURIComponent(token)}`;
  await sendEmailVerificationEmail(env, email, verificationUrl, language, isLocalhost(url));
  return verificationUrl;
}

async function sendEmailVerificationEmail(env, email, verificationUrl, language, allowLogFallback) {
  const emailText = EMAIL_VERIFICATION_EMAILS[language] || EMAIL_VERIFICATION_EMAILS.de;
  await sendTransactionalEmail(env, {
    to: email,
    subject: emailText.subject,
    text: emailText.text(verificationUrl),
    logFallback: `Email verification link for ${email}: ${verificationUrl}`,
    failureContext: `email verification email for ${email}`,
    allowLogFallback,
  });
}

async function sendPasswordResetEmail(env, email, resetUrl, allowLogFallback) {
  await sendTransactionalEmail(env, {
    to: email,
    subject: 'Passwort zurücksetzen',
    text: `Du kannst dein Passwort über diesen Link zurücksetzen:\n\n${resetUrl}\n\nDer Link ist 30 Minuten gültig.`,
    logFallback: `Password reset link for ${email}: ${resetUrl}`,
    failureContext: `password reset email for ${email}`,
    allowLogFallback,
  });
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
      .prepare('UPDATE users SET password_salt = ?, password_hash = ?, password_change_required = 0, updated_at = ? WHERE id = ?')
      .bind(hashedPassword.salt, hashedPassword.hash, now, reset.user_id),
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?').bind(now, tokenHash),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(reset.user_id),
  ]);

  return json({ ok: true });
}

async function listUsers(db) {
  const result = await db
    .prepare('SELECT id, name, email, role, email_verified_at, password_change_required, created_at, updated_at FROM users ORDER BY name COLLATE NOCASE')
    .all();
  return json({ users: result.results.map(toPublicUser) });
}

async function createUser(request, db) {
  const body = await readJson(request);
  const user = normalizeUserInput(body, { requirePassword: true });
  const password = await hashPassword(user.password);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const emailVerifiedAt = body.emailVerified === false ? null : now;
  const passwordChangeRequired = body.passwordChangeRequired === true ? 1 : 0;

  try {
    await db
      .prepare(
        `INSERT INTO users (id, name, email, role, password_salt, password_hash, email_verified_at, password_change_required, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, user.name, user.email, user.role, password.salt, password.hash, emailVerifiedAt, passwordChangeRequired, now, now)
      .run();
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw new HttpError(409, 'Email already exists');
    }
    throw error;
  }

  return json(
    {
      user: toPublicUser({
        id,
        name: user.name,
        email: user.email,
        role: user.role,
        email_verified_at: emailVerifiedAt,
        password_change_required: passwordChangeRequired,
        created_at: now,
        updated_at: now,
      }),
    },
    201,
  );
}

async function updateUser(request, db, id, currentUserId) {
  const existing = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!existing) {
    throw new HttpError(404, 'User not found');
  }

  const body = await readJson(request);
  const user = normalizeUserInput(body, { requirePassword: false });
  const now = new Date().toISOString();
  const emailVerifiedAt = resolveAdminEmailVerifiedAt(body, existing, user, now);
  const passwordChangeRequired = body.passwordChangeRequired === true ? 1 : 0;

  if (id === currentUserId && user.role !== 'admin') {
    throw new HttpError(400, 'You cannot remove your own admin role');
  }

  try {
    if (user.password) {
      const password = await hashPassword(user.password);
      await db
        .prepare(
          `UPDATE users
           SET name = ?, email = ?, role = ?, password_salt = ?, password_hash = ?, email_verified_at = ?, password_change_required = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(user.name, user.email, user.role, password.salt, password.hash, emailVerifiedAt, passwordChangeRequired, now, id)
        .run();
    } else {
      await db
        .prepare('UPDATE users SET name = ?, email = ?, role = ?, email_verified_at = ?, password_change_required = ?, updated_at = ? WHERE id = ?')
        .bind(user.name, user.email, user.role, emailVerifiedAt, passwordChangeRequired, now, id)
        .run();
    }
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw new HttpError(409, 'Email already exists');
    }
    throw error;
  }

  const updated = await db
    .prepare('SELECT id, name, email, role, email_verified_at, password_change_required, created_at, updated_at FROM users WHERE id = ?')
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

async function requestTurnierleiterAccess(request, db) {
  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();
  const message = nullableText(body.message);

  if (!isEmail(email)) {
    throw new HttpError(400, 'A valid email is required');
  }

  if (message && message.length > 1000) {
    throw new HttpError(400, 'Die Nachricht darf maximal 1000 Zeichen enthalten.');
  }

  const user = await db.prepare('SELECT id, role FROM users WHERE email = ?').bind(email).first();
  if (!user) {
    throw new HttpError(404, 'Benutzer nicht gefunden.');
  }
  if (user.role === 'turnierleiter' || user.role === 'admin') {
    throw new HttpError(409, 'Dieser Benutzer hat bereits Turnierleiter-Zugang.');
  }

  const existing = await db
    .prepare(
      `SELECT *
       FROM turnierleiter_access_requests
       WHERE user_id = ? AND status = 'pending'
       ORDER BY requested_at DESC
       LIMIT 1`,
    )
    .bind(user.id)
    .first();

  if (existing) {
    return json({
      request: toPublicTurnierleiterAccessRequest(existing),
      message: 'Turnierleiter-Zugang wurde bereits angefragt.',
    });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO turnierleiter_access_requests (id, user_id, status, message, requested_at, decided_at, decided_by, updated_at)
       VALUES (?, ?, 'pending', ?, ?, NULL, NULL, ?)`,
    )
    .bind(id, user.id, message, now, now)
    .run();

  const created = await db.prepare('SELECT * FROM turnierleiter_access_requests WHERE id = ?').bind(id).first();
  return json(
    {
      request: toPublicTurnierleiterAccessRequest(created),
      message: 'Turnierleiter-Zugang wurde angefragt.',
    },
    201,
  );
}

async function listTurnierleiterAccessRequests(db, url) {
  const status = url.searchParams.get('status');
  const statement =
    status && ['pending', 'approved', 'rejected'].includes(status)
      ? db
          .prepare(
            `SELECT turnierleiter_access_requests.*, users.name AS user_name, users.email AS user_email,
                    users.role AS user_role, users.email_verified_at AS user_email_verified_at,
                    admins.name AS decided_by_name
             FROM turnierleiter_access_requests
             JOIN users ON users.id = turnierleiter_access_requests.user_id
             LEFT JOIN users admins ON admins.id = turnierleiter_access_requests.decided_by
             WHERE turnierleiter_access_requests.status = ?
             ORDER BY turnierleiter_access_requests.requested_at DESC`,
          )
          .bind(status)
      : db.prepare(
          `SELECT turnierleiter_access_requests.*, users.name AS user_name, users.email AS user_email,
                  users.role AS user_role, users.email_verified_at AS user_email_verified_at,
                  admins.name AS decided_by_name
           FROM turnierleiter_access_requests
           JOIN users ON users.id = turnierleiter_access_requests.user_id
           LEFT JOIN users admins ON admins.id = turnierleiter_access_requests.decided_by
           ORDER BY turnierleiter_access_requests.requested_at DESC`,
        );

  const result = await statement.all();
  return json({ requests: result.results.map(toPublicTurnierleiterAccessRequest) });
}

async function approveTurnierleiterAccessRequest(db, id, adminUserId) {
  const existing = await db.prepare('SELECT * FROM turnierleiter_access_requests WHERE id = ?').bind(id).first();
  if (!existing) {
    throw new HttpError(404, 'Turnierleiter-Anfrage nicht gefunden.');
  }
  if (existing.status !== 'pending') {
    throw new HttpError(409, 'Turnierleiter-Anfrage ist nicht offen.');
  }

  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE users SET role = 'turnierleiter', updated_at = ? WHERE id = ?").bind(now, existing.user_id),
    db
      .prepare(
        `UPDATE turnierleiter_access_requests
         SET status = 'approved', decided_at = ?, decided_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, adminUserId, now, id),
  ]);

  const updated = await db.prepare('SELECT * FROM turnierleiter_access_requests WHERE id = ?').bind(id).first();
  return json({ request: toPublicTurnierleiterAccessRequest(updated) });
}

async function rejectTurnierleiterAccessRequest(db, id, adminUserId) {
  const existing = await db.prepare('SELECT * FROM turnierleiter_access_requests WHERE id = ?').bind(id).first();
  if (!existing) {
    throw new HttpError(404, 'Turnierleiter-Anfrage nicht gefunden.');
  }
  if (existing.status !== 'pending') {
    throw new HttpError(409, 'Turnierleiter-Anfrage ist nicht offen.');
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE turnierleiter_access_requests
       SET status = 'rejected', decided_at = ?, decided_by = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(now, adminUserId, now, id)
    .run();

  const updated = await db.prepare('SELECT * FROM turnierleiter_access_requests WHERE id = ?').bind(id).first();
  return json({ request: toPublicTurnierleiterAccessRequest(updated) });
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
       ORDER BY tournaments.date ASC, tournaments.start_time ASC, tournaments.name COLLATE NOCASE`,
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
        visibility, internal_notes, participants_public, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      tournament.participantsPublic ? 1 : 0,
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
           contact_name = ?, contact_email = ?, contact_phone = ?, visibility = ?, internal_notes = ?,
           participants_public = ?, updated_at = ?
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
      tournament.participantsPublic ? 1 : 0,
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

async function listPublicParticipants(db, tournamentId) {
  const result = await db
    .prepare(
      `SELECT first_name, last_name, club, team_name, partner_first_name, partner_last_name
       FROM registrations
       WHERE tournament_id = ? AND status IN ('pending', 'confirmed')
       ORDER BY registered_at ASC`,
    )
    .bind(tournamentId)
    .all();

  return json({
    participants: result.results.map((row) => ({
      firstName: row.first_name,
      lastName: row.last_name,
      club: row.club,
      teamName: row.team_name,
      partnerFirstName: row.partner_first_name,
      partnerLastName: row.partner_last_name,
    })),
  });
}

async function createRegistration(request, db, tournament) {
  if (tournament.visibility !== 'public' || tournament.status !== 'registration') {
    throw new HttpError(403, 'Registration is closed');
  }

  if (tournament.registration_deadline && new Date(tournament.registration_deadline).getTime() < Date.now()) {
    throw new HttpError(403, 'Registration deadline has passed');
  }

  const body = await readJson(request);
  if (body.publicationNoticeAccepted !== true) {
    throw new HttpError(400, 'Der Hinweis zur möglichen Veröffentlichung der Anmeldedaten muss bestätigt werden');
  }

  const registration = normalizeRegistrationInput(body, { requireStatus: false });
  assertPartnerCountMatchesFormation(tournament.formation, registration);
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
  assertPartnerCountMatchesFormation(existing.formation, registration);
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

async function requestApiKey(request, db, user) {
  const body = await readJson(request);
  const label = String(body.label || '').trim();

  if (label.length < 2 || label.length > 120) {
    throw new HttpError(400, 'Label must contain between 2 and 120 characters');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO api_keys (id, user_id, key_hash, label, status, requested_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    )
    .bind(id, user.id, `pending:${id}`, label, now, now, now)
    .run();

  const created = await db.prepare('SELECT * FROM api_keys WHERE id = ?').bind(id).first();
  return json({ apiKey: toPublicApiKey(created) }, 201);
}

async function listOwnApiKeys(db, userId) {
  const result = await db
    .prepare('SELECT * FROM api_keys WHERE user_id = ? ORDER BY requested_at DESC')
    .bind(userId)
    .all();
  return json({ apiKeys: result.results.map(toPublicApiKey) });
}

async function listAllApiKeys(db, url) {
  const status = url.searchParams.get('status');
  const statement =
    status && ['pending', 'approved', 'revoked'].includes(status)
      ? db
          .prepare(
            `SELECT api_keys.*, users.name AS user_name, users.email AS user_email
             FROM api_keys JOIN users ON users.id = api_keys.user_id
             WHERE api_keys.status = ? ORDER BY api_keys.requested_at DESC`,
          )
          .bind(status)
      : db.prepare(
          `SELECT api_keys.*, users.name AS user_name, users.email AS user_email
           FROM api_keys JOIN users ON users.id = api_keys.user_id
           ORDER BY api_keys.requested_at DESC`,
        );

  const result = await statement.all();
  return json({
    apiKeys: result.results.map((row) => ({
      ...toPublicApiKey(row),
      userName: row.user_name,
      userEmail: row.user_email,
    })),
  });
}

async function approveApiKey(db, id, adminUserId) {
  const existing = await db.prepare('SELECT * FROM api_keys WHERE id = ?').bind(id).first();
  if (!existing) {
    throw new HttpError(404, 'API key not found');
  }
  if (existing.status !== 'pending') {
    throw new HttpError(409, 'API key is not pending approval');
  }

  const secret = `ptm_${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const keyHash = await sha256Hex(secret);
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE api_keys
       SET key_hash = ?, status = 'approved', approved_at = ?, approved_by = ?, pending_secret = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(keyHash, now, adminUserId, secret, now, id)
    .run();

  const updated = await db.prepare('SELECT * FROM api_keys WHERE id = ?').bind(id).first();
  return json({ apiKey: toPublicApiKey(updated) });
}

async function revokeApiKey(db, id) {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE api_keys
       SET status = 'revoked', revoked_at = ?, pending_secret = NULL, updated_at = ?
       WHERE id = ? AND status != 'revoked'`,
    )
    .bind(now, now, id)
    .run();

  if (result.meta.changes === 0) {
    throw new HttpError(404, 'API key not found or already revoked');
  }
  return json({ ok: true });
}

async function retrieveApiKeySecret(db, id, userId) {
  const existing = await db.prepare('SELECT * FROM api_keys WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!existing) {
    throw new HttpError(404, 'API key not found');
  }
  if (existing.status !== 'approved' || !existing.pending_secret) {
    throw new HttpError(410, 'Secret already retrieved or not available');
  }

  const now = new Date().toISOString();
  await db
    .prepare('UPDATE api_keys SET pending_secret = NULL, secret_retrieved_at = ?, updated_at = ? WHERE id = ?')
    .bind(now, now, id)
    .run();

  return json({ secret: existing.pending_secret });
}

async function syncGetRegistrations(db, tournamentId, url) {
  const since = url.searchParams.get('since');
  const sinceIso = since && !Number.isNaN(new Date(since).getTime()) ? new Date(since).toISOString() : new Date(0).toISOString();

  const result = await db
    .prepare('SELECT * FROM registrations WHERE tournament_id = ? AND updated_at > ? ORDER BY updated_at ASC')
    .bind(tournamentId, sinceIso)
    .all();

  const registrations = result.results.map(toPublicRegistration);
  const cursor = registrations.length > 0 ? registrations[registrations.length - 1].updatedAt : sinceIso;
  return json({ registrations, cursor });
}

async function syncPostResults(request, db, tournamentId) {
  const body = await readJson(request);
  const entries = Array.isArray(body.registrations) ? body.registrations : [];
  if (entries.length === 0) {
    throw new HttpError(400, 'registrations must be a non-empty array');
  }

  const now = new Date().toISOString();
  let updatedCount = 0;

  for (const entry of entries) {
    const id = String(entry.id || '');
    if (!id) {
      continue;
    }

    const status = entry.status !== undefined ? String(entry.status) : null;
    if (status !== null && !REGISTRATION_STATUSES.includes(status)) {
      throw new HttpError(400, `Invalid status for registration ${id}`);
    }

    const seedingPosition =
      entry.seedingPosition === undefined || entry.seedingPosition === null
        ? null
        : Number.parseInt(entry.seedingPosition, 10);

    const result = await db
      .prepare(
        `UPDATE registrations
         SET status = COALESCE(?, status), seeding_position = ?, updated_at = ?
         WHERE id = ? AND tournament_id = ?`,
      )
      .bind(status, seedingPosition, now, id, tournamentId)
      .run();

    updatedCount += result.meta.changes;
  }

  return json({ updatedCount });
}

async function submitTournamentTip(request, env, url) {
  const db = env.DB;
  const body = await readJson(request);
  const tip = normalizeTournamentTipInput(body);
  const language = normalizeLanguage(body.language);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO tournament_tips (
        id, name, date, start_time, location, formation, info, external_link, flyer_link,
        submitter_name, submitter_email, status, created_at, verified_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_verification', ?, NULL, ?)`,
    )
    .bind(
      id,
      tip.name,
      tip.date,
      tip.startTime,
      tip.location,
      tip.formation,
      tip.info,
      tip.externalLink,
      tip.flyerLink,
      tip.submitterName,
      tip.submitterEmail,
      now,
      now,
    )
    .run();

  const verificationUrl = await createTournamentTipVerification(db, env, url, id, tip.submitterEmail, language);
  const response = {
    message: 'Turniermeldung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.',
  };

  if (isLocalhost(url)) {
    response.verificationUrl = verificationUrl;
  }

  return json(response, 201);
}

async function createTournamentTipVerification(db, env, url, tipId, email, language) {
  await db.prepare('DELETE FROM tournament_tip_verification_tokens WHERE tip_id = ?').bind(tipId).run();

  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const tokenHash = await sha256Hex(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + TOURNAMENT_TIP_VERIFICATION_TTL_SECONDS * 1000);

  await db
    .prepare(
      `INSERT INTO tournament_tip_verification_tokens (token_hash, tip_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(tokenHash, tipId, expiresAt.toISOString(), createdAt.toISOString())
    .run();

  const verificationUrl = `${url.origin}/?tip_verify_token=${encodeURIComponent(token)}`;
  await sendTournamentTipVerificationEmail(env, email, verificationUrl, language, isLocalhost(url));
  return verificationUrl;
}

async function sendTournamentTipVerificationEmail(env, email, verificationUrl, language, allowLogFallback) {
  const emailText = TOURNAMENT_TIP_VERIFICATION_EMAILS[language] || TOURNAMENT_TIP_VERIFICATION_EMAILS.de;
  await sendTransactionalEmail(env, {
    to: email,
    subject: emailText.subject,
    text: emailText.text(verificationUrl),
    logFallback: `Tournament tip verification link for ${email}: ${verificationUrl}`,
    failureContext: `tournament tip verification email for ${email}`,
    allowLogFallback,
  });
}

async function sendTransactionalEmail(env, { to, subject, text, logFallback, failureContext, allowLogFallback = false }) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    console.log(logFallback);
    if (allowLogFallback) {
      return;
    }
    throw new HttpError(503, 'E-Mail-Versand ist nicht konfiguriert.');
  }

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to,
        subject,
        text,
      }),
    });
  } catch (error) {
    console.error(`Resend request failed for ${failureContext}`, error);
    throw new HttpError(503, 'E-Mail konnte nicht versendet werden.');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`Resend failed to send ${failureContext}: ${response.status} ${errorText}`);
    throw new HttpError(503, 'E-Mail konnte nicht versendet werden.');
  }
}

async function verifyTournamentTip(request, db) {
  const body = await readJson(request);
  const token = String(body.token || '').trim();

  if (!token) {
    throw new HttpError(400, 'Bestätigungs-Token ist erforderlich');
  }

  const tokenHash = await sha256Hex(token);
  const verification = await db
    .prepare(
      `SELECT token_hash, tip_id, expires_at, used_at
       FROM tournament_tip_verification_tokens
       WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first();

  if (!verification || verification.used_at || new Date(verification.expires_at).getTime() <= Date.now()) {
    throw new HttpError(400, 'Bestätigungs-Link ist ungültig oder abgelaufen');
  }

  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare("UPDATE tournament_tips SET status = 'pending_review', verified_at = ?, updated_at = ? WHERE id = ?")
      .bind(now, now, verification.tip_id),
    db.prepare('UPDATE tournament_tip_verification_tokens SET used_at = ? WHERE token_hash = ?').bind(now, tokenHash),
  ]);

  return json({ ok: true });
}

async function listApprovedTournamentTips(db) {
  const today = new Date().toISOString().slice(0, 10);
  const result = await db
    .prepare(
      `SELECT id, name, date, start_time, location, formation, info, external_link, flyer_link, created_at
       FROM tournament_tips
       WHERE status = 'approved' AND date >= ?
       ORDER BY date ASC`,
    )
    .bind(today)
    .all();

  return json({ tips: result.results.map(toPublicTournamentTip) });
}

async function listPendingTournamentTips(db) {
  const result = await db
    .prepare(
      `SELECT * FROM tournament_tips
       WHERE status = 'pending_review'
       ORDER BY created_at ASC`,
    )
    .all();

  return json({ tips: result.results.map(toModerationTournamentTip) });
}

async function updateTournamentTipStatus(request, db, id) {
  const body = await readJson(request);
  const status = String(body.status || '').trim();

  if (!['approved', 'rejected'].includes(status)) {
    throw new HttpError(400, 'Invalid status');
  }

  const now = new Date().toISOString();
  const result = await db
    .prepare('UPDATE tournament_tips SET status = ?, updated_at = ? WHERE id = ? AND status = ?')
    .bind(status, now, id, 'pending_review')
    .run();

  if (result.meta.changes === 0) {
    throw new HttpError(404, 'Tournament tip not found or not pending review');
  }

  return json({ ok: true });
}

async function deleteTournamentTip(db, id) {
  const result = await db.prepare('DELETE FROM tournament_tips WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) {
    throw new HttpError(404, 'Tournament tip not found');
  }
  return json({ ok: true });
}

function normalizeTournamentTipInput(body) {
  const tip = {
    name: text(body.name),
    date: text(body.date),
    startTime: nullableText(body.startTime),
    location: nullableText(body.location),
    formation: text(body.formation || 'doublette'),
    info: nullableText(body.info),
    externalLink: text(body.externalLink),
    flyerLink: nullableText(body.flyerLink),
    submitterName: text(body.submitterName),
    submitterEmail: String(body.submitterEmail || '').trim().toLowerCase(),
    consent: body.consent === true,
  };

  if (tip.name.length < 2) {
    throw new HttpError(400, 'Tournament name must contain at least 2 characters');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tip.date)) {
    throw new HttpError(400, 'A valid tournament date is required');
  }
  if (!FORMATIONS.includes(tip.formation)) {
    throw new HttpError(400, 'Invalid formation');
  }
  if (!tip.externalLink || !/^https?:\/\//.test(tip.externalLink)) {
    throw new HttpError(400, 'A valid external link is required');
  }
  if (tip.submitterName.length < 2) {
    throw new HttpError(400, 'Submitter name must contain at least 2 characters');
  }
  if (!isEmail(tip.submitterEmail)) {
    throw new HttpError(400, 'A valid submitter email is required');
  }
  if (!tip.consent) {
    throw new HttpError(400, 'Die Datenschutzerklärung und der Veröffentlichungshinweis müssen akzeptiert werden');
  }

  return tip;
}

function toPublicTournamentTip(row) {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    startTime: row.start_time,
    location: row.location,
    formation: row.formation,
    info: row.info,
    externalLink: row.external_link,
    flyerLink: row.flyer_link,
  };
}

function toModerationTournamentTip(row) {
  return {
    ...toPublicTournamentTip(row),
    submitterName: row.submitter_name,
    submitterEmail: row.submitter_email,
    status: row.status,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
  };
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
      `SELECT registrations.*, tournaments.created_by, tournaments.manager_id, tournaments.visibility, tournaments.formation
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

function canViewParticipants(tournament, user) {
  if (tournament.visibility === 'public' && Number(tournament.participants_public)) {
    return true;
  }
  return canManageTournament(tournament, user);
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

async function requireApiKey(request, db) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'API key required');
  }

  const secret = authHeader.slice('Bearer '.length).trim();
  if (!secret) {
    throw new HttpError(401, 'API key required');
  }

  const keyHash = await sha256Hex(secret);
  const row = await db
    .prepare(
      `SELECT api_keys.id AS api_key_id, users.id, users.name, users.email, users.role,
              users.email_verified_at, users.password_change_required, users.created_at, users.updated_at
       FROM api_keys
       JOIN users ON users.id = api_keys.user_id
       WHERE api_keys.key_hash = ? AND api_keys.status = 'approved'`,
    )
    .bind(keyHash)
    .first();

  if (!row) {
    throw new HttpError(401, 'Invalid or inactive API key');
  }

  await db
    .prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), row.api_key_id)
    .run();

  return { user: toPublicUser(row), apiKeyId: row.api_key_id };
}

async function requireManagerAuth(request, db) {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return await requireApiKey(request, db);
  }
  return await requireSession(request, db);
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
      `SELECT users.id, users.name, users.email, users.role, users.email_verified_at, users.password_change_required,
              users.created_at, users.updated_at, sessions.expires_at
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
  await db.prepare('DELETE FROM email_verification_tokens WHERE expires_at <= ? OR used_at IS NOT NULL').bind(new Date().toISOString()).run();
  await db.prepare('DELETE FROM tournament_tip_verification_tokens WHERE expires_at <= ? OR used_at IS NOT NULL').bind(new Date().toISOString()).run();
  const attemptsCutoff = new Date(Date.now() - LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  await db.prepare('DELETE FROM login_attempts WHERE created_at <= ?').bind(attemptsCutoff).run();
}

async function enforceLoginRateLimit(db, email, ip) {
  const windowStart = new Date(Date.now() - LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();

  const emailCount = await db
    .prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE email = ? AND created_at > ?')
    .bind(email, windowStart)
    .first();
  const ipCount = await db
    .prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE ip = ? AND created_at > ?')
    .bind(ip, windowStart)
    .first();

  if (Number(emailCount?.count || 0) >= LOGIN_RATE_LIMIT_MAX_PER_EMAIL || Number(ipCount?.count || 0) >= LOGIN_RATE_LIMIT_MAX_PER_IP) {
    throw new HttpError(429, 'Zu viele Anmeldeversuche. Bitte versuche es später erneut.');
  }
}

async function recordLoginAttempt(db, email, ip) {
  await db
    .prepare('INSERT INTO login_attempts (id, email, ip, created_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), email, ip, new Date().toISOString())
    .run();
}

async function clearLoginAttempts(db, email) {
  await db.prepare('DELETE FROM login_attempts WHERE email = ?').bind(email).run();
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

function resolveAdminEmailVerifiedAt(body, existing, user, now) {
  if (body.emailVerified === true) {
    return existing.email_verified_at || now;
  }
  if (body.emailVerified === false) {
    return null;
  }
  return user.email === existing.email ? existing.email_verified_at : now;
}

function normalizeLanguage(value) {
  const language = String(value || 'de').trim().toLowerCase();
  return LANGUAGES.includes(language) ? language : 'de';
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
    participantsPublic: Boolean(body.participantsPublic),
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

function assertPartnerCountMatchesFormation(formation, registration) {
  const hasPartner = Boolean(registration.partnerFirstName && registration.partnerLastName);
  const hasPartner2 = Boolean(registration.partner2FirstName && registration.partner2LastName);

  if (formation === 'tete') {
    if (hasPartner || hasPartner2) {
      throw new HttpError(400, 'Formation tete allows only a single participant, no partner');
    }
    return;
  }

  if (formation === 'doublette') {
    if (!hasPartner) {
      throw new HttpError(400, 'Formation doublette requires exactly one partner');
    }
    if (hasPartner2) {
      throw new HttpError(400, 'Formation doublette allows only one partner');
    }
    return;
  }

  if (formation === 'triplette' && (!hasPartner || !hasPartner2)) {
    throw new HttpError(400, 'Formation triplette requires exactly two partners');
  }
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
    emailVerifiedAt: row.email_verified_at || null,
    passwordChangeRequired: Boolean(Number(row.password_change_required || 0)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicTurnierleiterAccessRequest(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || null,
    userEmail: row.user_email || null,
    userRole: row.user_role || null,
    userEmailVerifiedAt: row.user_email_verified_at || null,
    status: row.status,
    message: row.message || '',
    requestedAt: row.requested_at,
    decidedAt: row.decided_at || null,
    decidedBy: row.decided_by || null,
    decidedByName: row.decided_by_name || null,
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
    participantsPublic: Boolean(Number(row.participants_public)),
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

function toPublicApiKey(row) {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    status: row.status,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at,
    revokedAt: row.revoked_at,
    secretAvailable: Boolean(row.pending_secret),
    secretRetrievedAt: row.secret_retrieved_at,
    lastUsedAt: row.last_used_at,
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

function sessionCookie(value, expiresAt, url) {
  const secure = !url || url.protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=${expiresAt.toUTCString()}`;
}

function expiredSessionCookie(url) {
  const secure = !url || url.protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...headers,
    },
  });
}

function withSecurityHeaders(response, url) {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    secured.headers.set(name, value);
  }
  if (url && url.protocol !== 'https:') {
    // upgrade-insecure-requests forces same-origin assets (JS/CSS) to load over
    // HTTPS even when the page itself was served over plain HTTP. That breaks
    // local/LAN dev access (wrangler dev has no TLS listener), leaving a blank
    // page, without adding any protection for a connection that is already
    // non-HTTPS. Only applies to non-HTTPS requests, so deployed HTTPS traffic
    // is unaffected.
    secured.headers.set(
      'Content-Security-Policy',
      SECURITY_HEADERS['Content-Security-Policy'].replace(/;\s*upgrade-insecure-requests/, ''),
    );
  }
  return secured;
}

function assertSameOriginForUnsafeMethods(request, url) {
  if (!UNSAFE_METHODS.includes(request.method)) {
    return;
  }

  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) {
    throw new HttpError(403, 'Cross-origin request denied');
  }
}

function isLocalhost(url) {
  return ['localhost', '127.0.0.1'].includes(url.hostname);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
