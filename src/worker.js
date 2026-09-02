const ROLES = ['admin', 'user'];
const DEFAULT_TOURNAMENT_LIMIT = 5;
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
const LANGUAGES = ['de', 'nl', 'en', 'es', 'fr'];
const SESSION_COOKIE = 'ptm_session';
const GOOGLE_OAUTH_STATE_COOKIE = 'ptm_google_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const GOOGLE_OAUTH_STATE_TTL_SECONDS = 60 * 10;
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
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()',
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

const EMAIL_CHANGE_EMAILS = {
  de: {
    subject: 'Neue E-Mail-Adresse bestätigen',
    text: (verificationUrl) => `Bitte bestätige deine neue E-Mail-Adresse über diesen Link:\n\n${verificationUrl}\n\nDer Link ist 24 Stunden gültig. Falls du diese Änderung nicht angefordert hast, kannst du diese E-Mail ignorieren.`,
  },
  nl: {
    subject: 'Nieuw e-mailadres bevestigen',
    text: (verificationUrl) => `Bevestig je nieuwe e-mailadres via deze link:\n\n${verificationUrl}\n\nDe link is 24 uur geldig. Als je deze wijziging niet hebt aangevraagd, kun je deze e-mail negeren.`,
  },
  en: {
    subject: 'Confirm your new email address',
    text: (verificationUrl) => `Confirm your new email address with this link:\n\n${verificationUrl}\n\nThe link is valid for 24 hours. If you did not request this change, you can ignore this email.`,
  },
  es: {
    subject: 'Confirmar nueva direccion de correo',
    text: (verificationUrl) => `Confirma tu nueva direccion de correo con este enlace:\n\n${verificationUrl}\n\nEl enlace es valido durante 24 horas. Si no solicitaste este cambio, puedes ignorar este correo.`,
  },
  fr: {
    subject: 'Confirmer la nouvelle adresse e-mail',
    text: (verificationUrl) => `Confirme ta nouvelle adresse e-mail avec ce lien :\n\n${verificationUrl}\n\nLe lien est valable 24 heures. Si tu n’es pas à l’origine de cette demande, tu peux ignorer cet e-mail.`,
  },
};

const PWA_INSTALL_PATHS = ['/manifest.webmanifest', '/service-worker.js'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === 'www.ptmonline.org') {
      url.hostname = 'ptmonline.org';
      return redirect(url.toString(), 301);
    }

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

      if (request.method === 'GET' && url.pathname === '/api/auth/google/start') {
        return await startGoogleLogin(env, url);
      }

      if (request.method === 'GET' && url.pathname === '/api/auth/google/callback') {
        return await completeGoogleLogin(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/register') {
        return await registerUser(request, env, url);
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

      if (request.method === 'PUT' && url.pathname === '/api/me') {
        const session = await requireSession(request, env.DB);
        return await updateOwnProfile(request, env, url, session.user.id);
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

      if (url.pathname === '/api/api-keys') {
        const session = await requireSession(request, env.DB);

        if (request.method === 'GET') {
          return await listOwnApiKeys(env.DB, session.user.id);
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/api-keys/request') {
        const session = await requireSession(request, env.DB);
        return await requestApiKey(request, env.DB, session.user);
      }

      const apiKeySecretMatch = url.pathname.match(/^\/api\/api-keys\/([^/]+)\/secret$/);
      if (apiKeySecretMatch && request.method === 'GET') {
        const session = await requireSession(request, env.DB);
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
          return await createTournament(request, env.DB, auth.user);
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/geocode') {
        const body = await readJson(request);
        const result = await geocodeLocation(body.query);
        return json({
          lat: result?.lat ?? null,
          lng: result?.lng ?? null,
          displayName: result?.displayName ?? null,
        });
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

async function startGoogleLogin(env, url) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return redirectWithAuthError(url, 'google_not_configured');
  }

  const state = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', googleRedirectUri(url));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  return redirect(authUrl.toString(), 302, {
    'Set-Cookie': googleOAuthStateCookie(state, url),
  });
}

async function completeGoogleLogin(request, env, url) {
  const expectedState = getCookie(request, GOOGLE_OAUTH_STATE_COOKIE);
  const returnedState = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';

  if (!expectedState || !returnedState || !timingSafeEqual(expectedState, returnedState) || !code) {
    return redirectWithAuthError(url, 'google_login_failed');
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return redirectWithAuthError(url, 'google_not_configured');
  }

  try {
    const token = await exchangeGoogleCode(env, url, code);
    const profile = await fetchGoogleProfile(token.access_token);
    const user = await findOrCreateGoogleUser(env.DB, profile);
    const session = await createSession(env.DB, user.id);
    const response = redirect(`${url.origin}/?auth=google_success`);
    response.headers.append('Set-Cookie', sessionCookie(session.id, session.expiresAt, url));
    response.headers.append('Set-Cookie', expiredGoogleOAuthStateCookie(url));
    return response;
  } catch (error) {
    console.error('Google login failed', error);
    return redirectWithAuthError(url, 'google_login_failed');
  }
}

async function exchangeGoogleCode(env, url, code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: googleRedirectUri(url),
    }),
  });

  const token = await response.json().catch(() => ({}));
  if (!response.ok || !token.access_token) {
    throw new HttpError(502, 'Google Anmeldung fehlgeschlagen.');
  }
  return token;
}

async function fetchGoogleProfile(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await response.json().catch(() => ({}));

  if (!response.ok || !profile.sub || !profile.email || profile.email_verified !== true) {
    throw new HttpError(502, 'Google Anmeldung fehlgeschlagen.');
  }

  return {
    providerUserId: String(profile.sub),
    email: String(profile.email).trim().toLowerCase(),
    name: String(profile.name || profile.email).trim(),
  };
}

async function findOrCreateGoogleUser(db, profile) {
  const linked = await db
    .prepare(
      `SELECT users.*
       FROM oauth_accounts
       JOIN users ON users.id = oauth_accounts.user_id
       WHERE oauth_accounts.provider = 'google' AND oauth_accounts.provider_user_id = ?`,
    )
    .bind(profile.providerUserId)
    .first();

  const now = new Date().toISOString();
  if (linked) {
    await db.batch([
      db
        .prepare('UPDATE oauth_accounts SET email = ?, updated_at = ? WHERE provider = ? AND provider_user_id = ?')
        .bind(profile.email, now, 'google', profile.providerUserId),
      db
        .prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?')
        .bind(now, now, linked.id),
    ]);
    return { ...linked, email_verified_at: linked.email_verified_at || now, updated_at: now };
  }

  const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(profile.email).first();
  if (existing) {
    await db.batch([
      db
        .prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?')
        .bind(now, now, existing.id),
      googleAccountInsert(db, existing.id, profile, now),
    ]);
    return { ...existing, email_verified_at: existing.email_verified_at || now, updated_at: now };
  }

  const password = await hashPassword(crypto.randomUUID() + crypto.randomUUID());
  const userId = crypto.randomUUID();
  const userName = profile.name.length >= 2 ? profile.name : profile.email;

  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, name, email, role, password_salt, password_hash, email_verified_at, password_change_required, tournament_limit, created_at, updated_at)
         VALUES (?, ?, ?, 'user', ?, ?, ?, 0, ?, ?, ?)`,
      )
      .bind(userId, userName, profile.email, password.salt, password.hash, now, DEFAULT_TOURNAMENT_LIMIT, now, now),
    db
      .prepare(
        `INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email, created_at, updated_at)
         VALUES (?, ?, 'google', ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), userId, profile.providerUserId, profile.email, now, now),
  ]);

  return {
    id: userId,
    name: userName,
    email: profile.email,
    role: 'user',
    email_verified_at: now,
    password_change_required: 0,
    tournament_limit: DEFAULT_TOURNAMENT_LIMIT,
    created_at: now,
    updated_at: now,
  };
}

function googleAccountInsert(db, userId, profile, now) {
  return db
    .prepare(
      `INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email, created_at, updated_at)
       VALUES (?, ?, 'google', ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), userId, profile.providerUserId, profile.email, now, now);
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
      `SELECT token_hash, user_id, expires_at, used_at, new_email
       FROM email_verification_tokens
       WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first();

  if (!verification || verification.used_at || new Date(verification.expires_at).getTime() <= Date.now()) {
    throw new HttpError(400, 'Bestätigungs-Link ist ungültig oder abgelaufen');
  }

  const now = new Date().toISOString();

  if (verification.new_email) {
    try {
      await db.batch([
        db
          .prepare('UPDATE users SET email = ?, pending_email = NULL, email_verified_at = ?, updated_at = ? WHERE id = ?')
          .bind(verification.new_email, now, now, verification.user_id),
        db.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE token_hash = ?').bind(now, tokenHash),
      ]);
    } catch (error) {
      if (String(error.message || '').includes('UNIQUE')) {
        throw new HttpError(409, 'Email already exists');
      }
      throw error;
    }
    return json({ ok: true });
  }

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

async function createEmailVerification(db, env, url, userId, email, language, newEmail = null) {
  await db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').bind(userId).run();

  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const tokenHash = await sha256Hex(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + EMAIL_VERIFICATION_TTL_SECONDS * 1000);

  await db
    .prepare(
      `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at, created_at, new_email)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(tokenHash, userId, expiresAt.toISOString(), createdAt.toISOString(), newEmail)
    .run();

  const verificationUrl = `${url.origin}/?verify_token=${encodeURIComponent(token)}`;
  await sendEmailVerificationEmail(env, email, verificationUrl, language, isLocalhost(url), Boolean(newEmail));
  return verificationUrl;
}

async function sendEmailVerificationEmail(env, email, verificationUrl, language, allowLogFallback, isEmailChange = false) {
  const emailText = (isEmailChange ? EMAIL_CHANGE_EMAILS[language] : EMAIL_VERIFICATION_EMAILS[language]) || (isEmailChange ? EMAIL_CHANGE_EMAILS.de : EMAIL_VERIFICATION_EMAILS.de);
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

  assertPasswordStrength(password);

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
    .prepare(
      'SELECT id, name, email, pending_email, role, email_verified_at, password_change_required, tournament_limit, created_at, updated_at FROM users ORDER BY name COLLATE NOCASE',
    )
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
  const tournamentLimit = resolveTournamentLimit(body, DEFAULT_TOURNAMENT_LIMIT);

  try {
    await db
      .prepare(
        `INSERT INTO users (id, name, email, role, password_salt, password_hash, email_verified_at, password_change_required, tournament_limit, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, user.name, user.email, user.role, password.salt, password.hash, emailVerifiedAt, passwordChangeRequired, tournamentLimit, now, now)
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
        tournament_limit: tournamentLimit,
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
  const tournamentLimit = resolveTournamentLimit(body, existing.tournament_limit ?? DEFAULT_TOURNAMENT_LIMIT);

  if (id === currentUserId && user.role !== 'admin') {
    throw new HttpError(400, 'You cannot remove your own admin role');
  }

  try {
    if (user.password) {
      const password = await hashPassword(user.password);
      await db
        .prepare(
          `UPDATE users
           SET name = ?, email = ?, pending_email = NULL, role = ?, password_salt = ?, password_hash = ?, email_verified_at = ?, password_change_required = ?, tournament_limit = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(user.name, user.email, user.role, password.salt, password.hash, emailVerifiedAt, passwordChangeRequired, tournamentLimit, now, id)
        .run();
    } else {
      await db
        .prepare(
          'UPDATE users SET name = ?, email = ?, pending_email = NULL, role = ?, email_verified_at = ?, password_change_required = ?, tournament_limit = ?, updated_at = ? WHERE id = ?',
        )
        .bind(user.name, user.email, user.role, emailVerifiedAt, passwordChangeRequired, tournamentLimit, now, id)
        .run();
    }
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw new HttpError(409, 'Email already exists');
    }
    throw error;
  }

  const updated = await db
    .prepare(
      'SELECT id, name, email, pending_email, role, email_verified_at, password_change_required, tournament_limit, created_at, updated_at FROM users WHERE id = ?',
    )
    .bind(id)
    .first();
  return json({ user: toPublicUser(updated) });
}

async function updateOwnProfile(request, env, url, userId) {
  const db = env.DB;
  const existing = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!existing) {
    throw new HttpError(404, 'User not found');
  }

  const body = await readJson(request);
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const currentPassword = String(body.currentPassword || '');
  const newPassword = body.newPassword === undefined ? '' : String(body.newPassword);
  const language = normalizeLanguage(body.language);

  if (name.length < 2) {
    throw new HttpError(400, 'Name must contain at least 2 characters');
  }

  if (!isEmail(email)) {
    throw new HttpError(400, 'A valid email is required');
  }

  const emailChanged = email !== existing.email;
  const passwordChanged = newPassword.length > 0;

  if (emailChanged || passwordChanged) {
    if (!currentPassword || !(await verifyPassword(currentPassword, existing.password_salt, existing.password_hash))) {
      throw new HttpError(401, 'Aktuelles Passwort ist erforderlich oder falsch');
    }
  }

  if (passwordChanged) {
    assertPasswordStrength(newPassword);
  }

  if (passwordChanged && (await verifyPassword(newPassword, existing.password_salt, existing.password_hash))) {
    throw new HttpError(400, 'Neues Passwort darf nicht mit dem aktuellen Passwort übereinstimmen');
  }

  const now = new Date().toISOString();
  const pendingEmail = emailChanged ? email : null;
  const currentSessionId = getCookie(request, SESSION_COOKIE);

  try {
    if (passwordChanged) {
      const password = await hashPassword(newPassword);
      await db.batch([
        db
          .prepare(
            `UPDATE users
             SET name = ?, pending_email = ?, password_salt = ?, password_hash = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(name, pendingEmail, password.salt, password.hash, now, userId),
        db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(userId, currentSessionId || ''),
      ]);
    } else {
      await db
        .prepare('UPDATE users SET name = ?, pending_email = ?, updated_at = ? WHERE id = ?')
        .bind(name, pendingEmail, now, userId)
        .run();
    }
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw new HttpError(409, 'Email already exists');
    }
    throw error;
  }

  let verificationUrl = null;
  if (emailChanged) {
    verificationUrl = await createEmailVerification(db, env, url, userId, email, language, email);
  } else if (existing.pending_email) {
    // Reverting to the current email cancels an outstanding email-change confirmation link.
    await db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').bind(userId).run();
  }

  const updated = await db
    .prepare('SELECT id, name, email, pending_email, role, email_verified_at, password_change_required, created_at, updated_at FROM users WHERE id = ?')
    .bind(userId)
    .first();

  const response = { user: toPublicUser(updated) };
  if (emailChanged && isLocalhost(url)) {
    response.verificationUrl = verificationUrl;
  }
  return json(response);
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
          OR (?2 IS NOT NULL AND (tournaments.created_by = ?2 OR tournaments.manager_id = ?2))
          OR tournaments.visibility = 'public'
       ORDER BY tournaments.date ASC, tournaments.start_time ASC, tournaments.name COLLATE NOCASE`,
    )
    .bind(user?.role || null, user?.id || null)
    .all();

  return json({ tournaments: rows.results.map((row) => toPublicTournament(row, user)) });
}

async function resolveTournamentGeolocation(tournament, existing, now) {
  if (tournament.latitude !== null && tournament.longitude !== null) {
    return { latitude: tournament.latitude, longitude: tournament.longitude, geocodedAt: null };
  }
  if (existing && existing.location === tournament.location && existing.latitude !== null && existing.latitude !== undefined) {
    return { latitude: existing.latitude, longitude: existing.longitude, geocodedAt: existing.geocoded_at };
  }

  const result = await geocodeLocation(tournament.location);
  if (!result) {
    return { latitude: null, longitude: null, geocodedAt: null };
  }
  return { latitude: result.lat, longitude: result.lng, geocodedAt: now };
}

async function createTournament(request, db, user) {
  if (user.role !== 'admin') {
    const limit = user.tournamentLimit ?? DEFAULT_TOURNAMENT_LIMIT;
    const { count } = await db.prepare('SELECT COUNT(*) AS count FROM tournaments WHERE created_by = ?').bind(user.id).first();
    if (count >= limit) {
      throw new HttpError(403, 'Turnier-Limit erreicht. Bitte bei einem Admin um mehr Turniere bitten.');
    }
  }

  const body = await readJson(request);
  const tournament = normalizeTournamentInput(body);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const managerId = user.role === 'admin' ? tournament.managerId || user.id : user.id;
  const geo = await resolveTournamentGeolocation(tournament, null, now);

  await db
    .prepare(
      `INSERT INTO tournaments (
        id, created_by, manager_id, name, date, start_time, location, description, type, formation, status,
        max_registrations, registration_deadline, entry_fee_cents, contact_name, contact_email, contact_phone,
        visibility, internal_notes, participants_public, license_required, latitude, longitude, geocoded_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      tournament.licenseRequired ? 1 : 0,
      geo.latitude,
      geo.longitude,
      geo.geocodedAt,
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
  const geo = await resolveTournamentGeolocation(tournament, existing, now);

  await db
    .prepare(
      `UPDATE tournaments
       SET manager_id = ?, name = ?, date = ?, start_time = ?, location = ?, description = ?, type = ?,
           formation = ?, status = ?, max_registrations = ?, registration_deadline = ?, entry_fee_cents = ?,
           contact_name = ?, contact_email = ?, contact_phone = ?, visibility = ?, internal_notes = ?,
           participants_public = ?, license_required = ?, latitude = ?, longitude = ?, geocoded_at = ?, updated_at = ?
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
      tournament.licenseRequired ? 1 : 0,
      geo.latitude,
      geo.longitude,
      geo.geocodedAt,
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
  assertLicenseMatchesTournament(tournament, registration);
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
  assertLicenseMatchesTournament(existing, registration);
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

async function geocodeLocation(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    return null;
  }

  let response;
  try {
    response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`,
      {
        headers: {
          'User-Agent': 'Petanque-Turnier-Manager-Online (https://github.com/massee/Petanque-Turnier-Manager-Online)',
          Accept: 'application/json',
        },
      },
    );
  } catch (error) {
    console.error(`Geocoding request failed for "${trimmed}"`, error);
    return null;
  }

  if (!response.ok) {
    console.error(`Geocoding failed for "${trimmed}": ${response.status}`);
    return null;
  }

  const results = await response.json().catch(() => []);
  const match = Array.isArray(results) ? results[0] : null;
  if (!match) {
    return null;
  }

  const lat = Number(match.lat);
  const lng = Number(match.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng, displayName: match.display_name || trimmed };
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
      `SELECT registrations.*, tournaments.created_by, tournaments.manager_id, tournaments.visibility, tournaments.formation,
              tournaments.license_required
       FROM registrations
       JOIN tournaments ON tournaments.id = registrations.tournament_id
       WHERE registrations.id = ?`,
    )
    .bind(id)
    .first();
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
  return user.role === 'admin' || tournament.created_by === user.id || tournament.manager_id === user.id;
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
              users.email_verified_at, users.password_change_required, users.tournament_limit, users.created_at, users.updated_at
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
      `SELECT users.id, users.name, users.email, users.pending_email, users.role, users.email_verified_at, users.password_change_required,
              users.tournament_limit, users.created_at, users.updated_at, sessions.expires_at
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

  if (requirePassword || password) {
    assertPasswordStrength(password);
  }

  return { name, email, role, password };
}

function resolveTournamentLimit(body, fallback) {
  if (body.tournamentLimit === undefined || body.tournamentLimit === null || body.tournamentLimit === '') {
    return fallback;
  }
  const value = Number(body.tournamentLimit);
  if (!Number.isInteger(value) || value < 0) {
    throw new HttpError(400, 'Invalid tournament limit');
  }
  return value;
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
    licenseRequired: Boolean(body.licenseRequired),
    latitude: nullableCoordinate(body.latitude, -90, 90),
    longitude: nullableCoordinate(body.longitude, -180, 180),
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
  if ((tournament.latitude === null) !== (tournament.longitude === null)) {
    throw new HttpError(400, 'Latitude and longitude must be set together');
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

function assertLicenseMatchesTournament(tournament, registration) {
  if (Number(tournament.license_required || 0) && !registration.licenseNr) {
    throw new HttpError(400, 'Lizenznummer ist erforderlich');
  }
}

function text(value) {
  return String(value || '').trim();
}

function nullableText(value) {
  const normalized = text(value);
  return normalized || null;
}

function nullableCoordinate(value, min, max) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new HttpError(400, 'Invalid coordinate');
  }
  return number;
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

function assertPasswordStrength(password) {
  if (
    password.length < 8 ||
    !/[0-9]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new HttpError(
      400,
      'Das Passwort muss mindestens 8 Zeichen lang sein und mindestens eine Zahl, einen Kleinbuchstaben, einen Großbuchstaben und ein Sonderzeichen enthalten',
    );
  }
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
    pendingEmail: row.pending_email || null,
    role: row.role,
    emailVerifiedAt: row.email_verified_at || null,
    passwordChangeRequired: Boolean(Number(row.password_change_required || 0)),
    tournamentLimit: row.tournament_limit === undefined || row.tournament_limit === null ? DEFAULT_TOURNAMENT_LIMIT : Number(row.tournament_limit),
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
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
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
    licenseRequired: Boolean(Number(row.license_required || 0)),
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

function googleOAuthStateCookie(value, url) {
  const secure = !url || url.protocol === 'https:' ? '; Secure' : '';
  return `${GOOGLE_OAUTH_STATE_COOKIE}=${value}; Path=/api/auth/google; HttpOnly; SameSite=Lax${secure}; Max-Age=${GOOGLE_OAUTH_STATE_TTL_SECONDS}`;
}

function expiredSessionCookie(url) {
  const secure = !url || url.protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

function expiredGoogleOAuthStateCookie(url) {
  const secure = !url || url.protocol === 'https:' ? '; Secure' : '';
  return `${GOOGLE_OAUTH_STATE_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
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

function redirect(location, status = 302, headers = {}) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...headers,
    },
  });
}

function redirectWithAuthError(url, error) {
  const response = redirect(`${url.origin}/?auth_error=${encodeURIComponent(error)}`);
  response.headers.append('Set-Cookie', expiredGoogleOAuthStateCookie(url));
  return response;
}

function googleRedirectUri(url) {
  return `${url.origin}/api/auth/google/callback`;
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
