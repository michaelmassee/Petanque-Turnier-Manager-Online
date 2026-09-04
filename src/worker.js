import tzlookup from 'tz-lookup';
import { CURRENCY_CODES } from './currencies.js';

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
  'rangliste',
  'schweizer',
  'trip_tete',
];
const FORMATIONS = ['tete', 'doublette', 'triplette'];
const REGISTRATION_TYPES = ['supermelee', 'melee', 'forme'];
const TOURNAMENT_STATUSES = ['draft', 'registration', 'running', 'finished'];
const VISIBILITIES = ['public', 'private'];
const REGISTRATION_STATUSES = ['pending', 'confirmed', 'cancelled', 'waitlist'];
const LANGUAGES = ['de', 'nl', 'en', 'es', 'fr'];
const SESSION_COOKIE = 'ptm_session';
const GOOGLE_OAUTH_STATE_COOKIE = 'ptm_google_oauth_state';
const FACEBOOK_OAUTH_STATE_COOKIE = 'ptm_facebook_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const GOOGLE_OAUTH_STATE_TTL_SECONDS = 60 * 10;
const FACEBOOK_OAUTH_STATE_TTL_SECONDS = 60 * 10;
const FACEBOOK_GRAPH_API_VERSION = 'v21.0';
const RESET_TTL_SECONDS = 60 * 30;
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60 * 15;
const LOGIN_RATE_LIMIT_MAX_PER_EMAIL = 5;
const LOGIN_RATE_LIMIT_MAX_PER_IP = 20;
const GEOCODE_RATE_LIMIT_WINDOW_SECONDS = 60 * 15;
const GEOCODE_RATE_LIMIT_MAX_PER_IP = 30;
const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24;
const EMAIL_RESEND_COOLDOWN_SECONDS = 60;
// Changing this invalidates every stored password_hash (verifyPassword re-derives with the
// current value). Any seeded/test users must be re-hashed and re-seeded after a change.
const PASSWORD_ITERATIONS = 100000;
// Fixed salt/hash used to run a real PBKDF2 verification for unknown emails during login, so
// the response time does not leak whether an email address is registered. Never used to
// authenticate anything.
const DUMMY_PASSWORD_SALT = 'aa8f6b0c2e9d4a3f1b7c5d6e8f9a0b1c';
const DUMMY_PASSWORD_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
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

const REGISTRATION_CONFIRMATION_EMAILS = {
  de: {
    subject: (name) => `Anmeldebestätigung: ${name}`,
    text: (name, dateTimeLabel, location, link) =>
      `Deine Anmeldung für "${name}" ist eingegangen.\n\nTermin: ${dateTimeLabel}\nOrt: ${location}\n\nAlle Infos zum Turnier:\n${link}\n\nEinen Kalendereintrag findest du im Anhang dieser E-Mail.`,
  },
  nl: {
    subject: (name) => `Inschrijvingsbevestiging: ${name}`,
    text: (name, dateTimeLabel, location, link) =>
      `Je inschrijving voor "${name}" is ontvangen.\n\nDatum: ${dateTimeLabel}\nLocatie: ${location}\n\nAlle informatie over het toernooi:\n${link}\n\nEen agenda-afspraak vind je als bijlage bij deze e-mail.`,
  },
  en: {
    subject: (name) => `Registration confirmation: ${name}`,
    text: (name, dateTimeLabel, location, link) =>
      `Your registration for "${name}" has been received.\n\nDate: ${dateTimeLabel}\nLocation: ${location}\n\nAll tournament details:\n${link}\n\nA calendar event is attached to this email.`,
  },
  es: {
    subject: (name) => `Confirmación de inscripción: ${name}`,
    text: (name, dateTimeLabel, location, link) =>
      `Tu inscripción para "${name}" se ha recibido.\n\nFecha: ${dateTimeLabel}\nLugar: ${location}\n\nToda la información del torneo:\n${link}\n\nEncontrarás una cita de calendario adjunta a este correo.`,
  },
  fr: {
    subject: (name) => `Confirmation d'inscription : ${name}`,
    text: (name, dateTimeLabel, location, link) =>
      `Ton inscription pour « ${name} » a bien été reçue.\n\nDate : ${dateTimeLabel}\nLieu : ${location}\n\nToutes les informations sur le tournoi :\n${link}\n\nUn rendez-vous de calendrier est joint à cet e-mail.`,
  },
};

const REGISTRATION_DISPLACED_EMAILS = {
  de: {
    subject: (name) => `Änderung deiner Anmeldung: ${name}`,
    textWaitlisted: (name, link) =>
      `Für "${name}" hat sich ein VIP-Teilnehmer angemeldet, für den kein regulärer Platz mehr frei war. Deine Anmeldung wurde daher auf die Warteliste verschoben.\n\nAlle Infos zum Turnier:\n${link}`,
    textCancelled: (name, link) =>
      `Für "${name}" hat sich ein VIP-Teilnehmer angemeldet, für den kein regulärer Platz mehr frei war. Da für dieses Turnier keine Warteliste aktiviert ist, wurde deine Anmeldung leider storniert.\n\nAlle Infos zum Turnier:\n${link}`,
  },
  nl: {
    subject: (name) => `Wijziging van je inschrijving: ${name}`,
    textWaitlisted: (name, link) =>
      `Voor "${name}" heeft een VIP-deelnemer zich ingeschreven, waarvoor geen reguliere plaats meer vrij was. Je inschrijving is daarom op de wachtlijst geplaatst.\n\nAlle informatie over het toernooi:\n${link}`,
    textCancelled: (name, link) =>
      `Voor "${name}" heeft een VIP-deelnemer zich ingeschreven, waarvoor geen reguliere plaats meer vrij was. Omdat er voor dit toernooi geen wachtlijst is geactiveerd, is je inschrijving helaas geannuleerd.\n\nAlle informatie over het toernooi:\n${link}`,
  },
  en: {
    subject: (name) => `Change to your registration: ${name}`,
    textWaitlisted: (name, link) =>
      `A VIP participant has registered for "${name}" and no regular spot was left. Your registration has therefore been moved to the waiting list.\n\nAll tournament details:\n${link}`,
    textCancelled: (name, link) =>
      `A VIP participant has registered for "${name}" and no regular spot was left. Since no waiting list is enabled for this tournament, your registration has unfortunately been cancelled.\n\nAll tournament details:\n${link}`,
  },
  es: {
    subject: (name) => `Cambio en tu inscripción: ${name}`,
    textWaitlisted: (name, link) =>
      `Un participante VIP se ha inscrito para "${name}" y no quedaba ninguna plaza regular. Por ello, tu inscripción se ha trasladado a la lista de espera.\n\nToda la información del torneo:\n${link}`,
    textCancelled: (name, link) =>
      `Un participante VIP se ha inscrito para "${name}" y no quedaba ninguna plaza regular. Como no hay lista de espera activada para este torneo, lamentablemente tu inscripción ha sido cancelada.\n\nToda la información del torneo:\n${link}`,
  },
  fr: {
    subject: (name) => `Modification de ton inscription : ${name}`,
    textWaitlisted: (name, link) =>
      `Un participant VIP s'est inscrit pour « ${name} » et il ne restait plus de place normale. Ton inscription a donc été placée sur liste d'attente.\n\nToutes les informations sur le tournoi :\n${link}`,
    textCancelled: (name, link) =>
      `Un participant VIP s'est inscrit pour « ${name} » et il ne restait plus de place normale. Comme aucune liste d'attente n'est activée pour ce tournoi, ton inscription a malheureusement été annulée.\n\nToutes les informations sur le tournoi :\n${link}`,
  },
};

const TOURNAMENT_REMINDER_EMAILS = {
  de: {
    subject: (name) => `Erinnerung: ${name} in 2 Tagen`,
    text: (name, dateTimeLabel, location, link) =>
      `Nur noch 2 Tage bis "${name}"!\n\nTermin: ${dateTimeLabel}\nOrt: ${location}\n\nAlle Infos zum Turnier:\n${link}\n\nDen Kalendereintrag findest du im Anhang dieser E-Mail.`,
  },
  nl: {
    subject: (name) => `Herinnering: ${name} over 2 dagen`,
    text: (name, dateTimeLabel, location, link) =>
      `Nog maar 2 dagen tot "${name}"!\n\nDatum: ${dateTimeLabel}\nLocatie: ${location}\n\nAlle informatie over het toernooi:\n${link}\n\nDe agenda-afspraak vind je als bijlage bij deze e-mail.`,
  },
  en: {
    subject: (name) => `Reminder: ${name} in 2 days`,
    text: (name, dateTimeLabel, location, link) =>
      `Only 2 days left until "${name}"!\n\nDate: ${dateTimeLabel}\nLocation: ${location}\n\nAll tournament details:\n${link}\n\nThe calendar event is attached to this email.`,
  },
  es: {
    subject: (name) => `Recordatorio: ${name} en 2 días`,
    text: (name, dateTimeLabel, location, link) =>
      `¡Solo quedan 2 días para "${name}"!\n\nFecha: ${dateTimeLabel}\nLugar: ${location}\n\nToda la información del torneo:\n${link}\n\nEncontrarás la cita de calendario adjunta a este correo.`,
  },
  fr: {
    subject: (name) => `Rappel : ${name} dans 2 jours`,
    text: (name, dateTimeLabel, location, link) =>
      `Plus que 2 jours avant « ${name} » !\n\nDate : ${dateTimeLabel}\nLieu : ${location}\n\nToutes les informations sur le tournoi :\n${link}\n\nLe rendez-vous de calendrier est joint à cet e-mail.`,
  },
};

const EMAIL_LOCALES = { de: 'de-DE', nl: 'nl-NL', en: 'en-GB', es: 'es-ES', fr: 'fr-FR' };

function formatTournamentDateTime(tournament, language) {
  const locale = EMAIL_LOCALES[language] || EMAIL_LOCALES.de;
  const date = new Date(`${tournament.date}T${tournament.start_time || '00:00'}:00`);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...(tournament.start_time ? { timeStyle: 'short' } : {}),
  }).format(date);
}

function icsEscapeText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function icsCompactDate(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function icsCompactDateTime(date) {
  return `${icsCompactDate(date)}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`;
}

function buildTournamentIcs(tournament, appOrigin) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Petanque Turnier Manager Online//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${tournament.id}@ptmonline.org`,
    `DTSTAMP:${icsCompactDateTime(new Date())}Z`,
  ];

  if (tournament.start_time) {
    const start = new Date(`${tournament.date}T${tournament.start_time}:00`);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    lines.push(`DTSTART;TZID=Europe/Berlin:${icsCompactDateTime(start)}`);
    lines.push(`DTEND;TZID=Europe/Berlin:${icsCompactDateTime(end)}`);
  } else {
    const start = new Date(`${tournament.date}T00:00:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    lines.push(`DTSTART;VALUE=DATE:${icsCompactDate(start)}`);
    lines.push(`DTEND;VALUE=DATE:${icsCompactDate(end)}`);
  }

  lines.push(`SUMMARY:${icsEscapeText(tournament.name)}`);
  lines.push(`LOCATION:${icsEscapeText(tournament.location)}`);
  lines.push(`DESCRIPTION:${icsEscapeText(`${appOrigin}/turniere/${tournament.id}/info`)}`);
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

function base64Encode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * A registration email doesn't necessarily belong to a platform account (most public
 * registrants are guests). If their email matches a known user, honor that account's language;
 * otherwise fall back to the tournament creator's language rather than a hardcoded default, since
 * that's the best available signal for who a given tournament's guest audience is.
 */
async function resolveEmailLanguage(db, tournament, registration) {
  const matchingUser = await db.prepare('SELECT language FROM users WHERE email = ?').bind(registration.email).first();
  if (matchingUser) {
    return matchingUser.language || registration.language || 'de';
  }
  const creator = await db.prepare('SELECT language FROM users WHERE id = ?').bind(tournament.created_by).first();
  return creator?.language || registration.language || 'de';
}

async function sendRegistrationConfirmationEmail(env, tournament, registration, appOrigin) {
  const language = await resolveEmailLanguage(env.DB, tournament, registration);
  const templates = REGISTRATION_CONFIRMATION_EMAILS[language] || REGISTRATION_CONFIRMATION_EMAILS.de;
  const dateTimeLabel = formatTournamentDateTime(tournament, language);
  const link = `${appOrigin}/turniere/${tournament.id}/info`;
  const ics = buildTournamentIcs(tournament, appOrigin);

  await sendTransactionalEmail(env, {
    to: registration.email,
    subject: templates.subject(tournament.name),
    text: templates.text(tournament.name, dateTimeLabel, tournament.location, link),
    attachments: [{ filename: 'termin.ics', content: base64Encode(ics) }],
    logFallback: `Registration confirmation email for ${registration.email} (tournament ${tournament.id})`,
    failureContext: `registration confirmation for registration ${registration.id}`,
    allowLogFallback: true,
  });
}

async function sendDisplacementEmail(env, tournament, registration, wasCancelled, appOrigin) {
  const language = await resolveEmailLanguage(env.DB, tournament, registration);
  const templates = REGISTRATION_DISPLACED_EMAILS[language] || REGISTRATION_DISPLACED_EMAILS.de;
  const link = `${appOrigin}/turniere/${tournament.id}/info`;

  await sendTransactionalEmail(env, {
    to: registration.email,
    subject: templates.subject(tournament.name),
    text: wasCancelled ? templates.textCancelled(tournament.name, link) : templates.textWaitlisted(tournament.name, link),
    logFallback: `Displacement email for ${registration.email} (tournament ${tournament.id}, cancelled=${wasCancelled})`,
    failureContext: `displacement notice for registration ${registration.id}`,
    allowLogFallback: true,
  });
}

const TOURNAMENT_REMINDER_LEAD_DAYS = 2;
const APP_ORIGIN = 'https://ptmonline.org';

async function sendTournamentReminders(env) {
  const target = new Date();
  target.setUTCDate(target.getUTCDate() + TOURNAMENT_REMINDER_LEAD_DAYS);
  const targetDate = target.toISOString().slice(0, 10);

  const tournaments = await env.DB.prepare("SELECT * FROM tournaments WHERE date = ? AND status != 'draft'").bind(targetDate).all();

  for (const tournament of tournaments.results || []) {
    const registrations = await env.DB
      .prepare(
        `SELECT * FROM registrations
         WHERE tournament_id = ? AND status IN ('pending', 'confirmed') AND reminder_sent_at IS NULL`,
      )
      .bind(tournament.id)
      .all();

    for (const registration of registrations.results || []) {
      const recipients = [...new Set(
        [registration.email, registration.partner_email, registration.partner2_email].filter(Boolean).map((email) => email.toLowerCase()),
      )];
      const language = await resolveEmailLanguage(env.DB, tournament, registration);
      const templates = TOURNAMENT_REMINDER_EMAILS[language] || TOURNAMENT_REMINDER_EMAILS.de;
      const dateTimeLabel = formatTournamentDateTime(tournament, language);
      const link = `${APP_ORIGIN}/turniere/${tournament.id}/info`;
      const ics = buildTournamentIcs(tournament, APP_ORIGIN);

      try {
        await sendTransactionalEmail(env, {
          to: recipients,
          subject: templates.subject(tournament.name),
          text: templates.text(tournament.name, dateTimeLabel, tournament.location, link),
          attachments: [{ filename: 'termin.ics', content: base64Encode(ics) }],
          logFallback: `Tournament reminder email for registration ${registration.id} (tournament ${tournament.id})`,
          failureContext: `tournament reminder for registration ${registration.id}`,
          allowLogFallback: true,
        });
      } catch (error) {
        console.error(`Failed to send tournament reminder for registration ${registration.id}`, error);
        continue;
      }

      await env.DB.prepare('UPDATE registrations SET reminder_sent_at = ? WHERE id = ?').bind(new Date().toISOString(), registration.id).run();
    }
  }
}

const PWA_INSTALL_PATHS = ['/manifest.webmanifest', '/service-worker.js'];

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendTournamentReminders(env));
  },

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

      if (request.method === 'GET' && url.pathname === '/api/auth/facebook/start') {
        return await startFacebookLogin(env, url);
      }

      if (request.method === 'GET' && url.pathname === '/api/auth/facebook/callback') {
        return await completeFacebookLogin(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/register') {
        return await registerUser(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/email/verify') {
        return await verifyEmail(request, env.DB);
      }

      if (request.method === 'POST' && url.pathname === '/api/email/resend') {
        return await resendVerificationEmail(request, env, url);
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
          const deleteTournaments = url.searchParams.get('deleteTournaments') === 'true';
          return await deleteUser(env.DB, userMatch[1], session.user.id, deleteTournaments);
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
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        await enforceGeocodeRateLimit(env.DB, ip);
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
          throw new HttpError(404, 'Turnier nicht gefunden');
        }

        if (request.method === 'GET') {
          const session = await requireSession(request, env.DB);
          assertCanManageTournament(tournament, session.user);
          return await listRegistrations(env.DB, tournament.id);
        }

        if (request.method === 'POST') {
          return await createRegistration(request, env, tournament);
        }
      }

      const tournamentParticipantsMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/participants$/);
      if (tournamentParticipantsMatch) {
        const tournament = await getTournamentById(env.DB, tournamentParticipantsMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }

        if (request.method === 'GET') {
          const session = await optionalSession(request, env.DB);
          if (!canViewParticipants(tournament, session?.user || null)) {
            throw new HttpError(403, 'Zugriff verweigert');
          }
          return await listPublicParticipants(env.DB, tournament.id, session?.user?.email || null);
        }
      }

      const registrationCancelMatch = url.pathname.match(/^\/api\/registrations\/([^/]+)\/cancel$/);
      if (registrationCancelMatch && request.method === 'POST') {
        const session = await requireSession(request, env.DB);
        const registration = await getRegistrationWithTournament(env.DB, registrationCancelMatch[1]);
        if (!registration) {
          throw new HttpError(404, 'Anmeldung nicht gefunden');
        }
        const isOwnRegistration = registration.email.toLowerCase() === session.user.email.toLowerCase();
        if (!isOwnRegistration && !canManageTournament(registration, session.user)) {
          throw new HttpError(403, 'Zugriff verweigert');
        }
        return await cancelRegistration(env.DB, registration.id);
      }

      const tournamentMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)$/);
      if (tournamentMatch) {
        const tournament = await getTournamentById(env.DB, tournamentMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }

        if (request.method === 'GET') {
          const session = await optionalSession(request, env.DB);
          if (!canViewTournament(tournament, session?.user || null)) {
            throw new HttpError(403, 'Zugriff verweigert');
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

      const presentationMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/presentation$/);
      if (presentationMatch && request.method === 'PUT') {
        const session = await requireSession(request, env.DB);
        const tournament = await getTournamentById(env.DB, presentationMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, session.user);
        return await updateTournamentPresentation(request, env.DB, tournament, session.user);
      }

      const imageProxyMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/image$/);
      if (imageProxyMatch && request.method === 'GET') {
        const tournament = await getTournamentById(env.DB, imageProxyMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        const session = await optionalSession(request, env.DB);
        if (!canViewTournament(tournament, session?.user || null)) {
          throw new HttpError(403, 'Zugriff verweigert');
        }
        return await proxyTournamentImage(tournament, url.searchParams.get('field'));
      }

      const registrationMatch = url.pathname.match(/^\/api\/registrations\/([^/]+)$/);
      if (registrationMatch) {
        const auth = await requireManagerAuth(request, env.DB);
        const registration = await getRegistrationWithTournament(env.DB, registrationMatch[1]);
        if (!registration) {
          throw new HttpError(404, 'Anmeldung nicht gefunden');
        }
        assertCanManageTournament(registration, auth.user);

        if (request.method === 'PUT') {
          return await updateRegistration(request, env, registration);
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
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, auth.user);
        return await syncGetRegistrations(env.DB, tournament.id, url);
      }

      const syncResultsMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/results$/);
      if (syncResultsMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getTournamentById(env.DB, syncResultsMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, auth.user);
        return await syncPostResults(request, env.DB, tournament.id);
      }

      const syncMetadataMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/metadata$/);
      if (syncMetadataMatch && request.method === 'PUT') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getTournamentById(env.DB, syncMetadataMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, auth.user);
        return await syncPutTournamentMetadata(request, env.DB, tournament, auth.user);
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
    throw new HttpError(409, 'Einrichtung bereits abgeschlossen');
  }

  const body = await readJson(request);
  const user = normalizeUserInput(body, { requirePassword: true });
  const password = await hashPassword(user.password);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO users (id, first_name, last_name, email, role, password_salt, password_hash, email_verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', ?, ?, ?, ?, ?)`,
    )
    .bind(id, user.firstName, user.lastName, user.email, password.salt, password.hash, now, now, now)
    .run();

  const session = await createSession(db, id);
  return json(
    { user: toPublicUser({ id, first_name: user.firstName, last_name: user.lastName, email: user.email, role: 'admin', email_verified_at: now, created_at: now, updated_at: now }) },
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
    throw new HttpError(400, 'E-Mail und Passwort sind erforderlich');
  }

  await enforceLoginRateLimit(db, email, ip);

  const row = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  // Always run a PBKDF2 verification, even for an unknown email, so response timing does not
  // reveal whether the address is registered.
  const passwordMatches = row
    ? await verifyPassword(password, row.password_salt, row.password_hash)
    : await verifyPassword(password, DUMMY_PASSWORD_SALT, DUMMY_PASSWORD_HASH);
  if (!row || !passwordMatches) {
    await recordLoginAttempt(db, email, ip);
    throw new HttpError(401, 'Ungültige Anmeldedaten');
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
    const user = await findOrCreateOAuthUser(env.DB, 'google', profile);
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

async function startFacebookLogin(env, url) {
  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET) {
    return redirectWithAuthError(url, 'facebook_not_configured');
  }

  const state = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const authUrl = new URL(`https://www.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/dialog/oauth`);
  authUrl.searchParams.set('client_id', env.FACEBOOK_APP_ID);
  authUrl.searchParams.set('redirect_uri', facebookRedirectUri(url));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'email public_profile');
  authUrl.searchParams.set('state', state);

  return redirect(authUrl.toString(), 302, {
    'Set-Cookie': facebookOAuthStateCookie(state, url),
  });
}

async function completeFacebookLogin(request, env, url) {
  const expectedState = getCookie(request, FACEBOOK_OAUTH_STATE_COOKIE);
  const returnedState = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';

  if (!expectedState || !returnedState || !timingSafeEqual(expectedState, returnedState) || !code) {
    return redirectWithAuthError(url, 'facebook_login_failed');
  }

  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET) {
    return redirectWithAuthError(url, 'facebook_not_configured');
  }

  try {
    const token = await exchangeFacebookCode(env, url, code);
    const profile = await fetchFacebookProfile(token.access_token);
    const user = await findOrCreateOAuthUser(env.DB, 'facebook', profile);
    const session = await createSession(env.DB, user.id);
    const response = redirect(`${url.origin}/?auth=facebook_success`);
    response.headers.append('Set-Cookie', sessionCookie(session.id, session.expiresAt, url));
    response.headers.append('Set-Cookie', expiredFacebookOAuthStateCookie(url));
    return response;
  } catch (error) {
    console.error('Facebook login failed', error);
    return redirectWithAuthError(url, 'facebook_login_failed');
  }
}

async function exchangeFacebookCode(env, url, code) {
  const tokenUrl = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', env.FACEBOOK_APP_ID);
  tokenUrl.searchParams.set('client_secret', env.FACEBOOK_APP_SECRET);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('redirect_uri', facebookRedirectUri(url));

  const response = await fetch(tokenUrl.toString());
  const token = await response.json().catch(() => ({}));
  if (!response.ok || !token.access_token) {
    throw new HttpError(502, 'Facebook Anmeldung fehlgeschlagen.');
  }
  return token;
}

async function fetchFacebookProfile(accessToken) {
  const profileUrl = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}/me`);
  profileUrl.searchParams.set('fields', 'id,name,email');
  profileUrl.searchParams.set('access_token', accessToken);

  const response = await fetch(profileUrl.toString());
  const profile = await response.json().catch(() => ({}));

  if (!response.ok || !profile.id || !profile.email) {
    throw new HttpError(502, 'Facebook Anmeldung fehlgeschlagen.');
  }

  return {
    providerUserId: String(profile.id),
    email: String(profile.email).trim().toLowerCase(),
    name: String(profile.name || profile.email).trim(),
  };
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

async function findOrCreateOAuthUser(db, provider, profile) {
  const linked = await db
    .prepare(
      `SELECT users.*
       FROM oauth_accounts
       JOIN users ON users.id = oauth_accounts.user_id
       WHERE oauth_accounts.provider = ? AND oauth_accounts.provider_user_id = ?`,
    )
    .bind(provider, profile.providerUserId)
    .first();

  const now = new Date().toISOString();
  if (linked) {
    await db.batch([
      db
        .prepare('UPDATE oauth_accounts SET email = ?, updated_at = ? WHERE provider = ? AND provider_user_id = ?')
        .bind(profile.email, now, provider, profile.providerUserId),
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
      oauthAccountInsert(db, existing.id, provider, profile, now),
    ]);
    return { ...existing, email_verified_at: existing.email_verified_at || now, updated_at: now };
  }

  const password = await hashPassword(crypto.randomUUID() + crypto.randomUUID());
  const userId = crypto.randomUUID();
  const userFullName = profile.name.length >= 2 ? profile.name : profile.email;
  const { firstName: userFirstName, lastName: userLastName } = splitFullName(userFullName);

  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, first_name, last_name, email, role, password_salt, password_hash, email_verified_at, password_change_required, tournament_limit, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'user', ?, ?, ?, 0, ?, ?, ?)`,
      )
      .bind(userId, userFirstName, userLastName, profile.email, password.salt, password.hash, now, DEFAULT_TOURNAMENT_LIMIT, now, now),
    oauthAccountInsert(db, userId, provider, profile, now),
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

function oauthAccountInsert(db, userId, provider, profile, now) {
  return db
    .prepare(
      `INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), userId, provider, profile.providerUserId, profile.email, now, now);
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
        `INSERT INTO users (id, first_name, last_name, email, role, password_salt, password_hash, email_verified_at, language, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'user', ?, ?, NULL, ?, ?, ?)`,
      )
      .bind(id, user.firstName, user.lastName, user.email, password.salt, password.hash, language, now, now)
      .run();
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw new HttpError(409, 'E-Mail-Adresse bereits vergeben');
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
        throw new HttpError(409, 'E-Mail-Adresse bereits vergeben');
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

async function resendVerificationEmail(request, env, url) {
  const db = env.DB;
  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();
  const language = normalizeLanguage(body.language);

  if (!email) {
    throw new HttpError(400, 'E-Mail ist erforderlich');
  }

  const response = {
    message: 'Wenn ein unbestätigtes Konto mit dieser E-Mail-Adresse existiert, wurde ein neuer Bestätigungslink gesendet.',
  };

  const row = await db.prepare('SELECT id, email_verified_at FROM users WHERE email = ?').bind(email).first();
  if (!row || row.email_verified_at) {
    return json(response);
  }

  const lastToken = await db
    .prepare('SELECT created_at FROM email_verification_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(row.id)
    .first();

  if (lastToken && Date.now() - new Date(lastToken.created_at).getTime() < EMAIL_RESEND_COOLDOWN_SECONDS * 1000) {
    return json(response);
  }

  const verificationUrl = await createEmailVerification(db, env, url, row.id, email, language);

  if (isLocalhost(url)) {
    response.verificationUrl = verificationUrl;
  }

  return json(response);
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
    throw new HttpError(400, 'E-Mail ist erforderlich');
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
    throw new HttpError(400, 'Reset-Token ist erforderlich');
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
    throw new HttpError(400, 'Ungültiger oder abgelaufener Reset-Token');
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
      'SELECT id, first_name, last_name, email, pending_email, role, email_verified_at, password_change_required, tournament_limit, created_at, updated_at FROM users ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE',
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
        `INSERT INTO users (id, first_name, last_name, email, role, password_salt, password_hash, email_verified_at, password_change_required, tournament_limit, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, user.firstName, user.lastName, user.email, user.role, password.salt, password.hash, emailVerifiedAt, passwordChangeRequired, tournamentLimit, now, now)
      .run();
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw new HttpError(409, 'E-Mail-Adresse bereits vergeben');
    }
    throw error;
  }

  return json(
    {
      user: toPublicUser({
        id,
        first_name: user.firstName,
        last_name: user.lastName,
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
    throw new HttpError(404, 'Benutzer nicht gefunden');
  }

  const body = await readJson(request);
  const user = normalizeUserInput(body, { requirePassword: false });
  const now = new Date().toISOString();
  const emailVerifiedAt = resolveAdminEmailVerifiedAt(body, existing, user, now);
  const passwordChangeRequired = body.passwordChangeRequired === true ? 1 : 0;
  const tournamentLimit = resolveTournamentLimit(body, existing.tournament_limit ?? DEFAULT_TOURNAMENT_LIMIT);

  if (id === currentUserId && user.role !== 'admin') {
    throw new HttpError(400, 'Du kannst deine eigene Admin-Rolle nicht entfernen');
  }

  try {
    if (user.password) {
      const password = await hashPassword(user.password);
      await db
        .prepare(
          `UPDATE users
           SET first_name = ?, last_name = ?, email = ?, pending_email = NULL, role = ?, password_salt = ?, password_hash = ?, email_verified_at = ?, password_change_required = ?, tournament_limit = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(user.firstName, user.lastName, user.email, user.role, password.salt, password.hash, emailVerifiedAt, passwordChangeRequired, tournamentLimit, now, id)
        .run();
    } else {
      await db
        .prepare(
          'UPDATE users SET first_name = ?, last_name = ?, email = ?, pending_email = NULL, role = ?, email_verified_at = ?, password_change_required = ?, tournament_limit = ?, updated_at = ? WHERE id = ?',
        )
        .bind(user.firstName, user.lastName, user.email, user.role, emailVerifiedAt, passwordChangeRequired, tournamentLimit, now, id)
        .run();
    }
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw new HttpError(409, 'E-Mail-Adresse bereits vergeben');
    }
    throw error;
  }

  const updated = await db
    .prepare(
      'SELECT id, first_name, last_name, email, pending_email, role, email_verified_at, password_change_required, tournament_limit, created_at, updated_at FROM users WHERE id = ?',
    )
    .bind(id)
    .first();
  return json({ user: toPublicUser(updated) });
}

async function updateOwnProfile(request, env, url, userId) {
  const db = env.DB;
  const existing = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!existing) {
    throw new HttpError(404, 'Benutzer nicht gefunden');
  }

  const body = await readJson(request);
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const currentPassword = String(body.currentPassword || '');
  const newPassword = body.newPassword === undefined ? '' : String(body.newPassword);
  const language = normalizeLanguage(body.language);
  const licenseNr = nullableText(body.licenseNr);
  const club = nullableText(body.club);

  if (firstName.length < 2 || lastName.length < 2) {
    throw new HttpError(400, 'Vorname und Nachname müssen mindestens 2 Zeichen enthalten');
  }

  if (!isEmail(email)) {
    throw new HttpError(400, 'Eine gültige E-Mail ist erforderlich');
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
             SET first_name = ?, last_name = ?, pending_email = ?, club = ?, license_nr = ?, password_salt = ?, password_hash = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(firstName, lastName, pendingEmail, club, licenseNr, password.salt, password.hash, now, userId),
        db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(userId, currentSessionId || ''),
      ]);
    } else {
      await db
        .prepare('UPDATE users SET first_name = ?, last_name = ?, pending_email = ?, club = ?, license_nr = ?, updated_at = ? WHERE id = ?')
        .bind(firstName, lastName, pendingEmail, club, licenseNr, now, userId)
        .run();
    }
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      throw new HttpError(409, 'E-Mail-Adresse bereits vergeben');
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
    .prepare(
      'SELECT id, first_name, last_name, email, pending_email, role, club, license_nr, email_verified_at, password_change_required, created_at, updated_at FROM users WHERE id = ?',
    )
    .bind(userId)
    .first();

  const response = { user: toPublicUser(updated) };
  if (emailChanged && isLocalhost(url)) {
    response.verificationUrl = verificationUrl;
  }
  return json(response);
}

async function deleteUser(db, id, currentUserId, deleteTournaments) {
  if (id === currentUserId) {
    throw new HttpError(400, 'Du kannst deinen eigenen Benutzer nicht löschen');
  }

  const now = new Date().toISOString();

  if (deleteTournaments) {
    await db.batch([
      db
        .prepare(
          `DELETE FROM registrations WHERE tournament_id IN (
            SELECT id FROM tournaments WHERE created_by = ? OR manager_id = ?
          )`,
        )
        .bind(id, id),
      db.prepare('DELETE FROM tournaments WHERE created_by = ? OR manager_id = ?').bind(id, id),
    ]);
  } else {
    // Reassign to the admin performing the deletion instead of leaving created_by/manager_id
    // pointing at a user row that no longer exists.
    await db.prepare('UPDATE tournaments SET created_by = ?, updated_at = ? WHERE created_by = ?').bind(currentUserId, now, id).run();
    await db.prepare('UPDATE tournaments SET manager_id = ?, updated_at = ? WHERE manager_id = ?').bind(currentUserId, now, id).run();
  }

  const result = await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) {
    throw new HttpError(404, 'Benutzer nicht gefunden');
  }

  return json({ ok: true });
}

async function listTournaments(db, user) {
  const rows = await db
    .prepare(
      `SELECT tournaments.*, (users.first_name || ' ' || users.last_name) AS manager_name,
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
          OR (tournaments.visibility = 'public' AND tournaments.status != 'draft')
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

function resolveTournamentTimezone(geo, fallback = 'Europe/Berlin') {
  if (!Number.isFinite(geo.latitude) || !Number.isFinite(geo.longitude)) return fallback;
  try {
    return tzlookup(geo.latitude, geo.longitude);
  } catch (error) {
    console.error('Could not resolve tournament timezone', error);
    return fallback;
  }
}

function localDateTimeParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}

export function zonedDateTimeToUtcIso(value, timeZone) {
  if (!value) return null;
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const naiveMillis = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set([-86400000, 0, 86400000].map((delta) => {
    const instant = new Date(naiveMillis + delta);
    const rendered = localDateTimeParts(instant, timeZone);
    const [renderedDate, renderedTime] = rendered.split('T');
    const [renderedYear, renderedMonth, renderedDay] = renderedDate.split('-').map(Number);
    const [renderedHour, renderedMinute] = renderedTime.split(':').map(Number);
    return (Date.UTC(renderedYear, renderedMonth - 1, renderedDay, renderedHour, renderedMinute) - instant.getTime()) / 60000;
  }));
  const matches = [...offsets]
    .map((offsetMinutes) => new Date(naiveMillis - offsetMinutes * 60000))
    .filter((candidate) => localDateTimeParts(candidate, timeZone) === value)
    .sort((left, right) => left.getTime() - right.getTime());
  if (matches.length === 0) {
    throw new HttpError(400, 'Die eingegebene Ortszeit existiert wegen der Sommerzeitumstellung nicht.');
  }
  return matches[0].toISOString();
}

function legacyUtcIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Ein gültiger Anmeldezeitpunkt ist erforderlich');
  return date.toISOString();
}

function resolveRegistrationTimes(tournament, timezone, { legacyUtc = false } = {}) {
  return {
    registrationDeadline: legacyUtc ? legacyUtcIso(tournament.registrationDeadline) : zonedDateTimeToUtcIso(tournament.registrationDeadline, timezone),
    registrationOpensAt: legacyUtc ? legacyUtcIso(tournament.registrationOpensAt) : zonedDateTimeToUtcIso(tournament.registrationOpensAt, timezone),
  };
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
  const presentation = {
    websiteUrl: normalizePresentationUrl(body.websiteUrl),
    logoUrl: normalizePresentationUrl(body.logoUrl),
    flyerUrl: normalizePresentationUrl(body.flyerUrl),
  };
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const managerId = user.role === 'admin' ? tournament.managerId || user.id : user.id;
  const geo = await resolveTournamentGeolocation(tournament, null, now);
  const timezone = resolveTournamentTimezone(geo);
  const registrationTimes = resolveRegistrationTimes(tournament, timezone);

  await db
    .prepare(
      `INSERT INTO tournaments (
        id, created_by, manager_id, name, date, start_time, location, description, type, formation, registration_type, status,
        max_registrations, registration_deadline, registration_opens_at, entry_fee_cents, currency, contact_name, contact_email, contact_phone,
        visibility, internal_notes, participants_public, license_required, team_name_enabled, waitlist_enabled, website_url, logo_url, flyer_url,
        latitude, longitude, geocoded_at, timezone, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      tournament.registrationType,
      tournament.status,
      tournament.maxRegistrations,
      registrationTimes.registrationDeadline,
      registrationTimes.registrationOpensAt,
      tournament.entryFeeCents,
      tournament.currency,
      tournament.contactName,
      tournament.contactEmail,
      tournament.contactPhone,
      tournament.visibility,
      tournament.internalNotes,
      tournament.participantsPublic ? 1 : 0,
      tournament.licenseRequired ? 1 : 0,
      tournament.teamNameEnabled ? 1 : 0,
      tournament.waitlistEnabled ? 1 : 0,
      presentation.websiteUrl,
      presentation.logoUrl,
      presentation.flyerUrl,
      geo.latitude,
      geo.longitude,
      geo.geocodedAt,
      timezone,
      now,
      now,
    )
    .run();

  const created = await getTournamentById(db, id);
  return json({ tournament: toPublicTournament(created, user) }, 201);
}

async function updateTournament(request, db, existing, user) {
  if (Number(existing.document_managed || 0) === 1) {
    throw new HttpError(409, 'Die Eckdaten dieses Turniers werden im Turnierdokument gepflegt.');
  }
  const body = await readJson(request);
  const tournament = normalizeTournamentInput(body);
  const now = new Date().toISOString();
  const managerId = user.role === 'admin' ? tournament.managerId || existing.manager_id || user.id : existing.manager_id || user.id;
  const geo = await resolveTournamentGeolocation(tournament, existing, now);
  const timezone = resolveTournamentTimezone(geo, existing.timezone || 'Europe/Berlin');
  const registrationTimes = resolveRegistrationTimes(tournament, timezone);

  await db
    .prepare(
      `UPDATE tournaments
       SET manager_id = ?, name = ?, date = ?, start_time = ?, location = ?, description = ?, type = ?,
           formation = ?, registration_type = ?, status = ?, max_registrations = ?, registration_deadline = ?, registration_opens_at = ?, entry_fee_cents = ?, currency = ?,
           contact_name = ?, contact_email = ?, contact_phone = ?, visibility = ?, internal_notes = ?,
           participants_public = ?, license_required = ?, team_name_enabled = ?, waitlist_enabled = ?, latitude = ?, longitude = ?, geocoded_at = ?, timezone = ?, updated_at = ?
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
      tournament.registrationType,
      tournament.status,
      tournament.maxRegistrations,
      registrationTimes.registrationDeadline,
      registrationTimes.registrationOpensAt,
      tournament.entryFeeCents,
      tournament.currency,
      tournament.contactName,
      tournament.contactEmail,
      tournament.contactPhone,
      tournament.visibility,
      tournament.internalNotes,
      tournament.participantsPublic ? 1 : 0,
      tournament.licenseRequired ? 1 : 0,
      tournament.teamNameEnabled ? 1 : 0,
      tournament.waitlistEnabled ? 1 : 0,
      geo.latitude,
      geo.longitude,
      geo.geocodedAt,
      timezone,
      now,
      existing.id,
    )
    .run();

  const updated = await getTournamentById(db, existing.id);
  return json({ tournament: toPublicTournament(updated, user) });
}

function normalizePresentationUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }
  if (!isHttpUrl(trimmed)) {
    throw new HttpError(400, 'Eine gültige URL (http:// oder https://) ist erforderlich');
  }
  return trimmed;
}

const PROXY_IMAGE_FIELDS = { logo: 'logo_url', website: 'website_url', flyer: 'flyer_url' };
const IMAGE_PROXY_TIMEOUT_MS = 8000;
const IMAGE_PROXY_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_PROXY_CACHE_SECONDS = 60 * 60 * 6;

/**
 * Streams an externally hosted tournament image (logo/website/flyer) through our own origin so
 * it satisfies the strict `img-src 'self'` CSP instead of loosening that policy to arbitrary
 * external hosts.
 */
async function proxyTournamentImage(tournament, field) {
  const column = PROXY_IMAGE_FIELDS[field];
  if (!column) {
    throw new HttpError(400, 'Unbekanntes Bildfeld');
  }
  const targetUrl = tournament[column];
  if (!targetUrl || !isHttpUrl(targetUrl)) {
    throw new HttpError(404, 'Kein Bild hinterlegt');
  }
  if (isUnsafeImageTarget(targetUrl)) {
    throw new HttpError(400, 'Ziel-URL nicht erlaubt');
  }

  const cache = caches.default;
  const cacheKey = new Request(
    `https://image-proxy.internal/tournaments/${tournament.id}/${field}?source=${encodeURIComponent(targetUrl)}`,
  );
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(IMAGE_PROXY_TIMEOUT_MS),
      headers: { Accept: 'image/*' },
    });
  } catch (error) {
    console.error(`Image proxy fetch failed for "${targetUrl}"`, error);
    throw new HttpError(502, 'Bild konnte nicht geladen werden');
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    throw new HttpError(502, 'Bild konnte nicht geladen werden');
  }
  if (!upstream.ok) {
    throw new HttpError(502, 'Bild konnte nicht geladen werden');
  }

  const contentType = upstream.headers.get('Content-Type') || '';
  if (!/^image\//i.test(contentType)) {
    throw new HttpError(415, 'Ungültiger Bildtyp');
  }

  const contentLength = Number(upstream.headers.get('Content-Length') || 0);
  if (contentLength && contentLength > IMAGE_PROXY_MAX_BYTES) {
    throw new HttpError(413, 'Bild zu groß');
  }

  const response = new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${IMAGE_PROXY_CACHE_SECONDS}`,
      ...SECURITY_HEADERS,
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

const BLOCKED_IMAGE_PROXY_HOSTNAMES = new Set(['localhost', '0.0.0.0', 'metadata.google.internal']);

/**
 * Defense-in-depth SSRF guard. Cloudflare Workers already block outbound requests to
 * RFC1918/loopback/link-local ranges at the platform level, but this catches the common case of
 * a stored URL directly containing a private/loopback host without relying solely on that.
 */
function isUnsafeImageTarget(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return true;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return true;
  }
  const hostname = parsed.hostname.toLowerCase();
  return BLOCKED_IMAGE_PROXY_HOSTNAMES.has(hostname) || isPrivateIpLiteral(hostname);
}

function isPrivateIpLiteral(hostname) {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80')) {
    return true;
  }
  return false;
}

/**
 * Website/Logo/Flyer are presentation-only extras, not part of the tournament document's core
 * data, so this bypasses the document_managed lock enforced by updateTournament.
 */
async function updateTournamentPresentation(request, db, existing, user) {
  const body = await readJson(request);
  const websiteUrl = normalizePresentationUrl(body.websiteUrl);
  const logoUrl = normalizePresentationUrl(body.logoUrl);
  const flyerUrl = normalizePresentationUrl(body.flyerUrl);
  const now = new Date().toISOString();

  await db
    .prepare('UPDATE tournaments SET website_url = ?, logo_url = ?, flyer_url = ?, updated_at = ? WHERE id = ?')
    .bind(websiteUrl, logoUrl, flyerUrl, now, existing.id)
    .run();

  const updated = await getTournamentById(db, existing.id);
  return json({ tournament: toPublicTournament(updated, user) });
}

/** PTM Calc is the exclusive writer for the metadata of a linked tournament. */
async function syncPutTournamentMetadata(request, db, existing, user) {
  const body = await readJson(request);
  const legacyRegistrationTimes = body.registrationTimeSemantics !== 'tournament-local-v1';
  const tournament = normalizeTournamentInput(body, { legacyRegistrationTimes });
  const now = new Date().toISOString();
  const geo = await resolveTournamentGeolocation(tournament, existing, now);
  const timezone = resolveTournamentTimezone(geo, existing.timezone || 'Europe/Berlin');
  const registrationTimes = resolveRegistrationTimes(tournament, timezone, { legacyUtc: legacyRegistrationTimes });

  await db.prepare(
    `UPDATE tournaments
     SET name = ?, date = ?, start_time = ?, location = ?, description = ?, type = ?, formation = ?, registration_type = ?,
         status = ?, max_registrations = ?, registration_deadline = ?, registration_opens_at = ?, entry_fee_cents = ?, currency = ?, contact_name = ?,
         contact_email = ?, contact_phone = ?, visibility = ?, internal_notes = ?, participants_public = ?,
         license_required = ?, latitude = ?, longitude = ?, geocoded_at = ?, timezone = ?, document_managed = 1, updated_at = ?
     WHERE id = ?`,
  ).bind(
    tournament.name, tournament.date, tournament.startTime, tournament.location, tournament.description,
    tournament.type, tournament.formation, tournament.registrationType, tournament.status, tournament.maxRegistrations,
    registrationTimes.registrationDeadline, registrationTimes.registrationOpensAt, tournament.entryFeeCents, tournament.currency, tournament.contactName, tournament.contactEmail,
    tournament.contactPhone, tournament.visibility, tournament.internalNotes, tournament.participantsPublic ? 1 : 0,
    tournament.licenseRequired ? 1 : 0, geo.latitude, geo.longitude, geo.geocodedAt, timezone, now, existing.id,
  ).run();

  const updated = await getTournamentById(db, existing.id);
  return json({ tournament: toPublicTournament(updated, user) });
}

async function deleteTournament(db, id) {
  const [, tournamentResult] = await db.batch([
    db.prepare('DELETE FROM registrations WHERE tournament_id = ?').bind(id),
    db.prepare('DELETE FROM tournaments WHERE id = ?').bind(id),
  ]);
  if (tournamentResult.meta.changes === 0) {
    throw new HttpError(404, 'Turnier nicht gefunden');
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

async function listPublicParticipants(db, tournamentId, currentUserEmail) {
  const result = await db
    .prepare(
      `SELECT id, email, first_name, last_name, club, team_name, partner_first_name, partner_last_name, is_vip
       FROM registrations
       WHERE tournament_id = ? AND status IN ('pending', 'confirmed')
       ORDER BY registered_at ASC`,
    )
    .bind(tournamentId)
    .all();

  const normalizedCurrentEmail = currentUserEmail ? currentUserEmail.toLowerCase() : null;

  return json({
    participants: result.results.map((row) => {
      const isMine = normalizedCurrentEmail !== null && row.email.toLowerCase() === normalizedCurrentEmail;
      return {
        registrationId: isMine ? row.id : null,
        firstName: row.first_name,
        lastName: row.last_name,
        club: row.club,
        teamName: row.team_name,
        partnerFirstName: row.partner_first_name,
        partnerLastName: row.partner_last_name,
        isVip: Boolean(row.is_vip),
      };
    }),
  });
}

async function cancelRegistration(db, id) {
  const now = new Date().toISOString();
  const result = await db.prepare("UPDATE registrations SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(now, id).run();
  if (result.meta.changes === 0) {
    throw new HttpError(404, 'Anmeldung nicht gefunden');
  }
  const updated = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(id).first();
  return json({ registration: toPublicRegistration(updated) });
}

// Reine, testbare Freischaltungslogik: prüft anhand des übergebenen `now`-Zeitpunkts
// (Default: aktueller Server-Zeitpunkt), ob eine Anmeldung erlaubt ist. Nutzt
// ausschließlich UTC-Instant-Vergleiche (registration_opens_at/-deadline sind bereits
// korrekt in UTC gespeichert, siehe zonedDateTimeToUtcIso) – die Zeitzone des
// betrachtenden Browsers oder des Servers spielt für das Ergebnis keine Rolle.
export function registrationOpenStatus(tournament, now = new Date()) {
  if (tournament.visibility !== 'public' || tournament.status !== 'registration') {
    return 'closed';
  }
  if (tournament.registration_deadline && new Date(tournament.registration_deadline).getTime() < now.getTime()) {
    return 'deadline_passed';
  }
  if (tournament.registration_opens_at && new Date(tournament.registration_opens_at).getTime() > now.getTime()) {
    return 'not_yet_open';
  }
  return 'open';
}

const REGISTRATION_CLOSED_MESSAGES = {
  closed: 'Die Anmeldung ist geschlossen',
  deadline_passed: 'Die Meldefrist ist abgelaufen',
  not_yet_open: 'Die Anmeldung ist noch nicht geöffnet',
};

async function createRegistration(request, env, tournament) {
  const db = env.DB;

  const openStatus = registrationOpenStatus(tournament);
  if (openStatus !== 'open') {
    throw new HttpError(403, REGISTRATION_CLOSED_MESSAGES[openStatus]);
  }

  const body = await readJson(request);
  if (body.publicationNoticeAccepted !== true) {
    throw new HttpError(400, 'Der Hinweis zur möglichen Veröffentlichung der Anmeldedaten muss bestätigt werden');
  }

  const registration = normalizeRegistrationInput(body, { requireStatus: false });
  const language = normalizeLanguage(body.language);
  assertPartnerCountMatchesFormation(tournament, registration);
  assertLicenseMatchesTournament(tournament, registration);
  const { status, displace } = await initialRegistrationStatus(db, tournament, registration.isVip);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const appOrigin = new URL(request.url).origin;

  await db
    .prepare(
      `INSERT INTO registrations (
        id, tournament_id, first_name, last_name, email, club, license_nr,
        partner_first_name, partner_last_name, partner_email, partner_license_nr,
        partner2_first_name, partner2_last_name, partner2_email, partner2_license_nr,
        team_name, seeding_position, status, is_vip, language, registered_at, confirmed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      registration.partnerLicenseNr,
      registration.partner2FirstName,
      registration.partner2LastName,
      registration.partner2Email,
      registration.partner2LicenseNr,
      registration.teamName,
      registration.seedingPosition,
      status,
      registration.isVip ? 1 : 0,
      language,
      now,
      status === 'confirmed' ? now : null,
      now,
      now,
    )
    .run();

  const created = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(id).first();

  if (displace) {
    await displaceRegistration(env, tournament, displace, appOrigin);
  }

  try {
    await sendRegistrationConfirmationEmail(env, tournament, created, appOrigin);
  } catch (error) {
    console.error(`Failed to send registration confirmation email for registration ${id}`, error);
  }

  return json({ registration: toPublicRegistration(created) }, 201);
}

async function updateRegistration(request, env, existing) {
  const db = env.DB;
  const body = await readJson(request);
  const registration = normalizeRegistrationInput(body, { requireStatus: true });
  assertPartnerCountMatchesFormation(existing, registration);
  assertLicenseMatchesTournament(existing, registration);
  const now = new Date().toISOString();
  const confirmedAt = registration.status === 'confirmed' ? existing.confirmed_at || now : null;

  await db
    .prepare(
      `UPDATE registrations
       SET first_name = ?, last_name = ?, email = ?, club = ?, license_nr = ?,
           partner_first_name = ?, partner_last_name = ?, partner_email = ?, partner_license_nr = ?,
           partner2_first_name = ?, partner2_last_name = ?, partner2_email = ?, partner2_license_nr = ?,
           team_name = ?, seeding_position = ?, status = ?, is_vip = ?, confirmed_at = ?, updated_at = ?
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
      registration.partnerLicenseNr,
      registration.partner2FirstName,
      registration.partner2LastName,
      registration.partner2Email,
      registration.partner2LicenseNr,
      registration.teamName,
      registration.seedingPosition,
      registration.status,
      registration.isVip ? 1 : 0,
      confirmedAt,
      now,
      existing.id,
    )
    .run();

  if (registration.isVip && Number(existing.max_registrations)) {
    await enforceVipPriorityOnUpdate(env, existing, new URL(request.url).origin);
  }

  const updated = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(existing.id).first();
  return json({ registration: toPublicRegistration(updated) });
}

async function enforceVipPriorityOnUpdate(env, existing, appOrigin) {
  const db = env.DB;
  const current = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(existing.id).first();
  if (!current || !Number(current.is_vip)) {
    return;
  }

  const tournament = {
    id: existing.tournament_id,
    created_by: existing.created_by,
    waitlist_enabled: existing.waitlist_enabled,
    name: existing.name,
    date: existing.date,
    start_time: existing.start_time,
    location: existing.location,
  };

  const activeCountRow = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM registrations
       WHERE tournament_id = ? AND status IN ('pending', 'confirmed') AND id != ?`,
    )
    .bind(existing.tournament_id, existing.id)
    .first();
  const activeCount = Number(activeCountRow?.count || 0);
  const isCurrentlyActive = current.status === 'pending' || current.status === 'confirmed';
  const overCapacity = activeCount + 1 > Number(existing.max_registrations);

  if (!overCapacity) {
    if (!isCurrentlyActive) {
      await db
        .prepare("UPDATE registrations SET status = 'pending', updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), existing.id)
        .run();
    }
    return;
  }

  const displace = await findDisplaceableNonVip(db, existing.tournament_id, existing.id);
  if (!displace) {
    return;
  }

  if (!isCurrentlyActive) {
    await db
      .prepare("UPDATE registrations SET status = 'pending', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), existing.id)
      .run();
  }

  await displaceRegistration(env, tournament, displace, appOrigin);
}

async function deleteRegistration(db, id) {
  const result = await db.prepare('DELETE FROM registrations WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) {
    throw new HttpError(404, 'Anmeldung nicht gefunden');
  }
  return json({ ok: true });
}

async function requestApiKey(request, db, user) {
  const body = await readJson(request);
  const label = String(body.label || '').trim();

  if (label.length < 2 || label.length > 120) {
    throw new HttpError(400, 'Label muss zwischen 2 und 120 Zeichen enthalten');
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
            `SELECT api_keys.*, (users.first_name || ' ' || users.last_name) AS user_name, users.email AS user_email
             FROM api_keys JOIN users ON users.id = api_keys.user_id
             WHERE api_keys.status = ? ORDER BY api_keys.requested_at DESC`,
          )
          .bind(status)
      : db.prepare(
          `SELECT api_keys.*, (users.first_name || ' ' || users.last_name) AS user_name, users.email AS user_email
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
    throw new HttpError(404, 'API-Schlüssel nicht gefunden');
  }
  if (existing.status !== 'pending') {
    throw new HttpError(409, 'API-Schlüssel wartet nicht auf Freischaltung');
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
    throw new HttpError(404, 'API-Schlüssel nicht gefunden oder bereits widerrufen');
  }
  return json({ ok: true });
}

async function retrieveApiKeySecret(db, id, userId) {
  const existing = await db.prepare('SELECT * FROM api_keys WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!existing) {
    throw new HttpError(404, 'API-Schlüssel nicht gefunden');
  }
  if (existing.status !== 'approved' || !existing.pending_secret) {
    throw new HttpError(410, 'Secret bereits abgerufen oder nicht verfügbar');
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
    throw new HttpError(400, 'Anmeldungen müssen als nicht-leeres Array übergeben werden');
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
      throw new HttpError(400, `Ungültiger Status für Anmeldung ${id}`);
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

async function sendTransactionalEmail(env, { to, subject, text, attachments, logFallback, failureContext, allowLogFallback = false }) {
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
        ...(attachments ? { attachments } : {}),
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

async function findDisplaceableNonVip(db, tournamentId, excludeId) {
  return db
    .prepare(
      `SELECT * FROM registrations
       WHERE tournament_id = ? AND status IN ('pending', 'confirmed') AND is_vip = 0 AND id != ?
       ORDER BY registered_at DESC LIMIT 1`,
    )
    .bind(tournamentId, excludeId || '')
    .first();
}

async function displaceRegistration(env, tournament, registrationToDisplace, appOrigin) {
  const wasCancelled = !Number(tournament.waitlist_enabled ?? 1);
  const now = new Date().toISOString();
  await env.DB
    .prepare('UPDATE registrations SET status = ?, updated_at = ? WHERE id = ?')
    .bind(wasCancelled ? 'cancelled' : 'waitlist', now, registrationToDisplace.id)
    .run();

  try {
    await sendDisplacementEmail(env, tournament, registrationToDisplace, wasCancelled, appOrigin);
  } catch (error) {
    console.error(`Failed to send displacement email for registration ${registrationToDisplace.id}`, error);
  }
}

async function initialRegistrationStatus(db, tournament, isVip) {
  if (!Number(tournament.max_registrations)) {
    return { status: 'pending', displace: null };
  }

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM registrations
       WHERE tournament_id = ? AND status IN ('pending', 'confirmed')`,
    )
    .bind(tournament.id)
    .first();

  const isFull = Number(row?.count || 0) >= Number(tournament.max_registrations);
  if (!isFull) {
    return { status: 'pending', displace: null };
  }
  if (isVip) {
    const displace = await findDisplaceableNonVip(db, tournament.id, null);
    if (displace) {
      return { status: 'pending', displace };
    }
  }
  if (!Number(tournament.waitlist_enabled ?? 1)) {
    throw new HttpError(403, 'Das Turnier ist ausgebucht. Eine Warteliste ist für dieses Turnier nicht aktiviert.');
  }
  return { status: 'waitlist', displace: null };
}

async function getTournamentById(db, id) {
  return db
    .prepare(
      `SELECT tournaments.*, (users.first_name || ' ' || users.last_name) AS manager_name,
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
              tournaments.registration_type, tournaments.license_required, tournaments.max_registrations, tournaments.waitlist_enabled,
              tournaments.name, tournaments.date, tournaments.start_time, tournaments.location
       FROM registrations
       JOIN tournaments ON tournaments.id = registrations.tournament_id
       WHERE registrations.id = ?`,
    )
    .bind(id)
    .first();
}

function isPubliclyVisible(tournament) {
  return tournament.visibility === 'public' && tournament.status !== 'draft';
}

function canViewTournament(tournament, user) {
  return isPubliclyVisible(tournament) || canManageTournament(tournament, user);
}

function canViewParticipants(tournament, user) {
  if (isPubliclyVisible(tournament) && Number(tournament.participants_public)) {
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
    throw new HttpError(403, 'Zugriff verweigert');
  }
}

async function requireAdmin(request, db) {
  const session = await requireSession(request, db);
  if (session.user.role !== 'admin') {
    throw new HttpError(403, 'Admin-Rolle erforderlich');
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
      `SELECT api_keys.id AS api_key_id, users.id, users.first_name, users.last_name, users.email, users.role, users.club, users.license_nr,
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
    throw new HttpError(401, 'Anmeldung erforderlich');
  }

  const row = await db
    .prepare(
      `SELECT users.id, users.first_name, users.last_name, users.email, users.pending_email, users.role, users.club, users.license_nr, users.email_verified_at, users.password_change_required,
              users.tournament_limit, users.created_at, users.updated_at, sessions.expires_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ?`,
    )
    .bind(sessionId)
    .first();

  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    throw new HttpError(401, 'Anmeldung erforderlich');
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
  const geocodeAttemptsCutoff = new Date(Date.now() - GEOCODE_RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  await db.prepare('DELETE FROM geocode_attempts WHERE created_at <= ?').bind(geocodeAttemptsCutoff).run();
  const unverifiedAccountCutoff = new Date(Date.now() - EMAIL_VERIFICATION_TTL_SECONDS * 1000).toISOString();
  await db
    .prepare('DELETE FROM users WHERE email_verified_at IS NULL AND created_at <= ?')
    .bind(unverifiedAccountCutoff)
    .run();
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

async function enforceGeocodeRateLimit(db, ip) {
  const windowStart = new Date(Date.now() - GEOCODE_RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();

  const ipCount = await db
    .prepare('SELECT COUNT(*) AS count FROM geocode_attempts WHERE ip = ? AND created_at > ?')
    .bind(ip, windowStart)
    .first();

  if (Number(ipCount?.count || 0) >= GEOCODE_RATE_LIMIT_MAX_PER_IP) {
    throw new HttpError(429, 'Zu viele Geocoding-Anfragen. Bitte versuche es später erneut.');
  }

  await db
    .prepare('INSERT INTO geocode_attempts (id, ip, created_at) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), ip, new Date().toISOString())
    .run();
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

function splitFullName(fullName) {
  const trimmed = String(fullName || '').trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: '' };
  }
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1).trim() };
}

function normalizeUserInput(body, { requirePassword }) {
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || 'user').trim().toLowerCase();
  const password = body.password === undefined ? '' : String(body.password);

  if (firstName.length < 2 || lastName.length < 2) {
    throw new HttpError(400, 'Vorname und Nachname müssen mindestens 2 Zeichen enthalten');
  }

  if (!isEmail(email)) {
    throw new HttpError(400, 'Eine gültige E-Mail ist erforderlich');
  }

  if (!ROLES.includes(role)) {
    throw new HttpError(400, 'Ungültige Rolle');
  }

  if (requirePassword || password) {
    assertPasswordStrength(password);
  }

  return { firstName, lastName, email, role, password };
}

function resolveTournamentLimit(body, fallback) {
  if (body.tournamentLimit === undefined || body.tournamentLimit === null || body.tournamentLimit === '') {
    return fallback;
  }
  const value = Number(body.tournamentLimit);
  if (!Number.isInteger(value) || value < 0) {
    throw new HttpError(400, 'Ungültiges Turnier-Limit');
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

export function normalizeTournamentInput(body, { legacyRegistrationTimes = false } = {}) {
  const tournament = {
    name: text(body.name),
    date: text(body.date),
    startTime: nullableText(body.startTime),
    location: text(body.location),
    description: nullableText(body.description),
    type: text(body.type || 'formule_x'),
    formation: text(body.formation || 'doublette'),
    registrationType: text(body.registrationType || 'forme'),
    status: text(body.status || 'draft'),
    maxRegistrations: nonNegativeInteger(body.maxRegistrations),
    registrationDeadline: normalizeRegistrationDateTime(body.registrationDeadline, { legacyUtc: legacyRegistrationTimes }),
    registrationOpensAt: normalizeRegistrationDateTime(body.registrationOpensAt, { legacyUtc: legacyRegistrationTimes }),
    entryFeeCents: nonNegativeInteger(body.entryFeeCents),
    currency: text(body.currency || 'EUR').toUpperCase(),
    contactName: nullableText(body.contactName),
    contactEmail: nullableText(body.contactEmail),
    contactPhone: nullableText(body.contactPhone),
    visibility: text(body.visibility || 'private'),
    internalNotes: nullableText(body.internalNotes),
    managerId: nullableText(body.managerId),
    participantsPublic: Boolean(body.participantsPublic),
    licenseRequired: Boolean(body.licenseRequired),
    teamNameEnabled: Boolean(body.teamNameEnabled),
    waitlistEnabled: body.waitlistEnabled === undefined ? true : Boolean(body.waitlistEnabled),
    latitude: nullableCoordinate(body.latitude, -90, 90),
    longitude: nullableCoordinate(body.longitude, -180, 180),
  };

  if (tournament.name.length < 2) {
    throw new HttpError(400, 'Der Turniername muss mindestens 2 Zeichen enthalten');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tournament.date)) {
    throw new HttpError(400, 'Ein gültiges Turnierdatum ist erforderlich');
  }
  if (tournament.startTime && !/^\d{2}:\d{2}$/.test(tournament.startTime)) {
    throw new HttpError(400, 'Eine gültige Startzeit ist erforderlich');
  }
  if (tournament.location.length < 2) {
    throw new HttpError(400, 'Der Ort muss mindestens 2 Zeichen enthalten');
  }
  if (!TOURNAMENT_TYPES.includes(tournament.type)) {
    throw new HttpError(400, 'Ungültiges Turniersystem');
  }
  if (!FORMATIONS.includes(tournament.formation)) {
    throw new HttpError(400, 'Ungültige Formation');
  }
  if (!REGISTRATION_TYPES.includes(tournament.registrationType)) {
    throw new HttpError(400, 'Ungültiger Anmeldetyp');
  }
  if (tournament.formation === 'tete' && tournament.registrationType !== 'forme') {
    throw new HttpError(400, 'Formation Tête ist nur mit dem Anmeldetyp Formée möglich');
  }
  if (tournament.registrationType === 'supermelee' && tournament.formation === 'tete') {
    throw new HttpError(400, 'Supermêlée ist nur mit Doublette oder Triplette möglich');
  }
  if (tournament.registrationType === 'supermelee' && tournament.type !== 'rangliste') {
    throw new HttpError(400, 'Supermêlée erfordert das Turniersystem Rangliste');
  }
  if (!TOURNAMENT_STATUSES.includes(tournament.status)) {
    throw new HttpError(400, 'Ungültiger Turnierstatus');
  }
  if (!VISIBILITIES.includes(tournament.visibility)) {
    throw new HttpError(400, 'Ungültige Sichtbarkeit');
  }
  if (tournament.contactEmail && !isEmail(tournament.contactEmail)) {
    throw new HttpError(400, 'Eine gültige Kontakt-E-Mail ist erforderlich');
  }
  if ((tournament.latitude === null) !== (tournament.longitude === null)) {
    throw new HttpError(400, 'Breiten- und Längengrad müssen gemeinsam gesetzt werden');
  }
  if (!CURRENCY_CODES.includes(tournament.currency)) {
    throw new HttpError(400, 'Ungültige Währung');
  }
  if (
    tournament.registrationOpensAt &&
    tournament.registrationDeadline &&
    new Date(tournament.registrationOpensAt).getTime() > new Date(tournament.registrationDeadline).getTime()
  ) {
    throw new HttpError(400, 'Anmeldung möglich ab darf nicht nach der Meldefrist liegen');
  }

  return tournament;
}

function normalizeRegistrationDateTime(value, { legacyUtc }) {
  const normalized = nullableText(value);
  if (!normalized) return null;
  if (legacyUtc) {
    if (Number.isNaN(new Date(normalized).getTime())) {
      throw new HttpError(400, 'Ein gültiger Anmeldezeitpunkt ist erforderlich');
    }
    return normalized;
  }
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new HttpError(400, 'Ein gültiger lokaler Anmeldezeitpunkt ist erforderlich');
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) {
    throw new HttpError(400, 'Ein gültiger lokaler Anmeldezeitpunkt ist erforderlich');
  }
  return normalized;
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
    partnerLicenseNr: nullableText(body.partnerLicenseNr),
    partner2FirstName: nullableText(body.partner2FirstName),
    partner2LastName: nullableText(body.partner2LastName),
    partner2Email: nullableText(body.partner2Email)?.toLowerCase() || null,
    partner2LicenseNr: nullableText(body.partner2LicenseNr),
    teamName: nullableText(body.teamName),
    seedingPosition: body.seedingPosition === '' || body.seedingPosition === undefined ? null : nonNegativeInteger(body.seedingPosition),
    status: text(body.status || 'pending'),
    isVip: Boolean(body.isVip),
  };

  if (registration.firstName.length < 2 || registration.lastName.length < 2) {
    throw new HttpError(400, 'Vorname und Nachname sind erforderlich');
  }
  if (!isEmail(registration.email)) {
    throw new HttpError(400, 'Eine gültige E-Mail ist erforderlich');
  }
  if (registration.partnerEmail && !isEmail(registration.partnerEmail)) {
    throw new HttpError(400, 'Eine gültige Partner-E-Mail ist erforderlich');
  }
  if (registration.partner2Email && !isEmail(registration.partner2Email)) {
    throw new HttpError(400, 'Eine gültige zweite Partner-E-Mail ist erforderlich');
  }
  if (requireStatus && !REGISTRATION_STATUSES.includes(registration.status)) {
    throw new HttpError(400, 'Ungültiger Anmeldestatus');
  }

  return registration;
}

export function assertPartnerCountMatchesFormation(tournament, registration) {
  const formation = tournament.registration_type === 'melee' || tournament.registration_type === 'supermelee'
    ? 'tete'
    : tournament.formation;
  const hasPartner = Boolean(registration.partnerFirstName && registration.partnerLastName);
  const hasPartner2 = Boolean(registration.partner2FirstName && registration.partner2LastName);

  if (formation === 'tete') {
    if (hasPartner || hasPartner2) {
      throw new HttpError(400, 'Formation Tête erlaubt nur einen Teilnehmer, keinen Partner');
    }
    return;
  }

  if (formation === 'doublette') {
    if (!hasPartner) {
      throw new HttpError(400, 'Formation Doublette erfordert genau einen Partner');
    }
    if (hasPartner2) {
      throw new HttpError(400, 'Formation Doublette erlaubt nur einen Partner');
    }
    return;
  }

  if (formation === 'triplette' && (!hasPartner || !hasPartner2)) {
    throw new HttpError(400, 'Formation Triplette erfordert genau zwei Partner');
  }
}

function assertLicenseMatchesTournament(tournament, registration) {
  if (!Number(tournament.license_required || 0)) {
    return;
  }
  if (!registration.licenseNr) {
    throw new HttpError(400, 'Lizenznummer ist erforderlich');
  }
  if (registration.partnerFirstName && !registration.partnerLicenseNr) {
    throw new HttpError(400, 'Lizenznummer für Partner ist erforderlich');
  }
  if (registration.partner2FirstName && !registration.partner2LicenseNr) {
    throw new HttpError(400, 'Lizenznummer für Partner 2 ist erforderlich');
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
    throw new HttpError(400, 'Ungültige Koordinate');
  }
  return number;
}

function nonNegativeInteger(value) {
  const number = Number(value || 0);
  if (!Number.isInteger(number) || number < 0) {
    throw new HttpError(400, 'Eine nicht-negative Ganzzahl ist erforderlich');
  }
  return number;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
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
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    pendingEmail: row.pending_email || null,
    role: row.role,
    club: row.club || null,
    licenseNr: row.license_nr || null,
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
    registrationType: row.registration_type || 'forme',
    status: row.status,
    maxRegistrations: Number(row.max_registrations || 0),
    registrationDeadline: row.registration_deadline,
    registrationOpensAt: row.registration_opens_at,
    timezone: row.timezone || 'Europe/Berlin',
    entryFeeCents: Number(row.entry_fee_cents || 0),
    currency: row.currency || 'EUR',
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    visibility: row.visibility,
    internalNotes: canManageTournament(row, user) ? row.internal_notes : null,
    participantsPublic: Boolean(Number(row.participants_public)),
    licenseRequired: Boolean(Number(row.license_required || 0)),
    teamNameEnabled: Boolean(Number(row.team_name_enabled || 0)),
    waitlistEnabled: Boolean(Number(row.waitlist_enabled ?? 1)),
    documentManaged: Boolean(Number(row.document_managed || 0)),
    websiteUrl: row.website_url || null,
    logoUrl: row.logo_url || null,
    flyerUrl: row.flyer_url || null,
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
    partnerLicenseNr: row.partner_license_nr,
    partner2FirstName: row.partner2_first_name,
    partner2LastName: row.partner2_last_name,
    partner2Email: row.partner2_email,
    partner2LicenseNr: row.partner2_license_nr,
    teamName: row.team_name,
    seedingPosition: row.seeding_position,
    status: row.status,
    isVip: Boolean(row.is_vip),
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

function facebookOAuthStateCookie(value, url) {
  const secure = !url || url.protocol === 'https:' ? '; Secure' : '';
  return `${FACEBOOK_OAUTH_STATE_COOKIE}=${value}; Path=/api/auth/facebook; HttpOnly; SameSite=Lax${secure}; Max-Age=${FACEBOOK_OAUTH_STATE_TTL_SECONDS}`;
}

function expiredFacebookOAuthStateCookie(url) {
  const secure = !url || url.protocol === 'https:' ? '; Secure' : '';
  return `${FACEBOOK_OAUTH_STATE_COOKIE}=; Path=/api/auth/facebook; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
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
  response.headers.append('Set-Cookie', expiredFacebookOAuthStateCookie(url));
  return response;
}

function googleRedirectUri(url) {
  return `${url.origin}/api/auth/google/callback`;
}

function facebookRedirectUri(url) {
  return `${url.origin}/api/auth/facebook/callback`;
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
