import tzlookup from 'tz-lookup';
import { buildPushPayload } from '@block65/webcrypto-web-push';
import { isAllowedPushEndpoint, unreadPostboxCount } from './postbox-core.js';
import { CURRENCY_CODES } from './currencies.js';
import { HttpError } from './errors.js';
import {
  assertPartnerCountMatchesFormation as assertCorePartnerCountMatchesFormation,
  isNewlyPublicTournament,
  isTournamentRoundNumberConflict,
  normalizePlayerListingPosition,
  normalizeRichText,
  initialParticipation,
  isCalendarEntry,
  normalizeTournamentInput as normalizeCoreTournamentInput,
  parseParticipation,
  registrationOpenStatus as coreRegistrationOpenStatus,
  tournamentMatchesSavedSearch,
  validateMatchScore,
  MAX_JSON_BODY_BYTES,
  readBodyWithLimit,
} from './worker-core.js';
import { checkRoundRequirements, getPairingStrategy, isOnlinePlayable, roundRequirementMessage } from './lib/pairing/index.js';
import { competitionRanks, computeRanking, sameStandardRankingPlace } from './lib/pairing/ranking.js';
import { sameSwissRankingPlace, sortSwiss, swissStats } from './lib/pairing/schweizer.js';
import { formuleXStats, sameFormuleXRankingPlace, sortFormuleX } from './lib/pairing/formulex.js';
import { assignGroups as assignKoGroups, orderBySeed as orderKoSeeds } from './lib/pairing/ko.js';
import { createPlaceholderEmail, isPlaceholderEmail } from './lib/registration-email.js';
import { isFuturePetanqueAktuellTournament, mapPetanqueAktuellTournament, preservedPetanqueAktuellLocation, parsePetanqueAktuellCalendar, parsePetanqueAktuellDetailAddress, parsePetanqueAktuellDetailLogoUrl, petanqueAktuellCalendarUrl, petanqueAktuellPageUrls } from './petanque-aktuell-core.js';
import { formatLocationAddress } from './location-format.js';

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
const FORMATION_REPORT_VALUES = [...FORMATIONS, 'andere'];
const REGISTRATION_TYPES = ['supermelee', 'melee', 'forme'];
const TOURNAMENT_STATUSES = ['draft', 'registration', 'running', 'finished'];
const VISIBILITIES = ['public', 'private'];
// Anmeldestatus (online verwaltet) - bewusst getrennt von der Teilnahme nach dem Check-in.
const REGISTRATION_STATUSES = ['pending', 'confirmed', 'cancelled', 'waitlist'];
const LANGUAGES = ['de', 'nl', 'en', 'es', 'fr'];
const SESSION_COOKIE = 'ptm_session';
const sessionRefreshes = new WeakMap();
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
const TOURNAMENT_REPORT_TOKEN_TTL_SECONDS = 60 * 60 * 24;
const TOURNAMENT_REPORT_SYSTEM_USER_ID = 'system-tournament-reports';
const TOURNAMENT_REPORT_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const TOURNAMENT_REPORT_RATE_LIMIT_MAX_PER_IP = 5;
const TOURNAMENT_REPORT_MAX_DAYS_AHEAD = 365 * 2;
const PLACE_REPORT_TOKEN_TTL_SECONDS = 60 * 60 * 24;
const PLACE_REPORT_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const PLACE_REPORT_RATE_LIMIT_MAX_PER_IP = 5;
const PETANQUE_AKTUELL_MAX_PAGES = 20;
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
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data: https://api.maptiler.com https://tile.openstreetmap.org; connect-src 'self' https://challenges.cloudflare.com https://api.maptiler.com https://tile.openstreetmap.org; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; frame-src https://challenges.cloudflare.com; form-action 'self'; upgrade-insecure-requests",
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

const TOURNAMENT_REPORT_VERIFICATION_EMAILS = {
  de: {
    subject: 'Turniermeldung bestätigen',
    text: (verificationUrl) => `Bitte bestätige deine gemeldete Turnier-/Kalenderveranstaltung über diesen Link:\n\n${verificationUrl}\n\nErst nach der Bestätigung wird der Eintrag öffentlich sichtbar. Der Link ist 24 Stunden gültig.`,
  },
  nl: {
    subject: 'Toernooimelding bevestigen',
    text: (verificationUrl) => `Bevestig je gemelde toernooi via deze link:\n\n${verificationUrl}\n\nPas na bevestiging wordt de melding openbaar zichtbaar. De link is 24 uur geldig.`,
  },
  en: {
    subject: 'Confirm your tournament report',
    text: (verificationUrl) => `Please confirm your reported tournament via this link:\n\n${verificationUrl}\n\nThe entry only becomes publicly visible after confirmation. The link is valid for 24 hours.`,
  },
  es: {
    subject: 'Confirmar torneo notificado',
    text: (verificationUrl) => `Confirma el torneo notificado con este enlace:\n\n${verificationUrl}\n\nLa entrada solo sera visible publicamente tras la confirmacion. El enlace es valido durante 24 horas.`,
  },
  fr: {
    subject: 'Confirmer le tournoi signalé',
    text: (verificationUrl) => `Confirme le tournoi signalé via ce lien :\n\n${verificationUrl}\n\nL’entrée ne devient publique qu’après confirmation. Le lien est valable 24 heures.`,
  },
};

const PLACE_REPORT_VERIFICATION_EMAILS = {
  de: {
    subject: 'Bouleplatz-Meldung bestätigen',
    text: (verificationUrl, editUrl) => `Bitte bestätige deinen gemeldeten Bouleplatz über diesen Link:\n\n${verificationUrl}\n\nErst nach der Bestätigung wird der Platz öffentlich sichtbar. Der Link ist 24 Stunden gültig.\n\nSpäter Angaben ändern kannst du jederzeit über diesen Link (unbegrenzt gültig, bitte aufbewahren):\n\n${editUrl}`,
  },
  nl: {
    subject: 'Baanmelding bevestigen',
    text: (verificationUrl, editUrl) => `Bevestig je gemelde jeu-de-boulesbaan via deze link:\n\n${verificationUrl}\n\nPas na bevestiging wordt de baan openbaar zichtbaar. De link is 24 uur geldig.\n\nJe kunt de gegevens later altijd wijzigen via deze link (onbeperkt geldig, bewaar hem goed):\n\n${editUrl}`,
  },
  en: {
    subject: 'Confirm your boules court report',
    text: (verificationUrl, editUrl) => `Please confirm your reported boules court via this link:\n\n${verificationUrl}\n\nThe court only becomes publicly visible after confirmation. The link is valid for 24 hours.\n\nYou can update the details later at any time via this link (valid indefinitely, please keep it):\n\n${editUrl}`,
  },
  es: {
    subject: 'Confirmar pista notificada',
    text: (verificationUrl, editUrl) => `Confirma la pista notificada con este enlace:\n\n${verificationUrl}\n\nLa pista solo sera visible publicamente tras la confirmacion. El enlace es valido durante 24 horas.\n\nMas adelante puedes editar los datos en cualquier momento con este enlace (valido sin limite, guardalo):\n\n${editUrl}`,
  },
  fr: {
    subject: 'Confirmer le terrain signalé',
    text: (verificationUrl, editUrl) => `Confirme le terrain signalé via ce lien :\n\n${verificationUrl}\n\nLe terrain ne devient public qu’après confirmation. Le lien est valable 24 heures.\n\nTu peux modifier les informations plus tard à tout moment via ce lien (valable sans limite, à conserver) :\n\n${editUrl}`,
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

const PARTICIPANTS_EMAIL_LABELS = {
  de: { team: 'Team', participants: 'Teilnehmer', license: 'Lizenznummer' },
  nl: { team: 'Team', participants: 'Deelnemers', license: 'Licentienummer' },
  en: { team: 'Team', participants: 'Participants', license: 'License number' },
  es: { team: 'Equipo', participants: 'Participantes', license: 'Número de licencia' },
  fr: { team: 'Équipe', participants: 'Participants', license: 'Numéro de licence' },
};

// Listet alle an einer Anmeldung beteiligten Personen (Hauptmelder + ggf. Partner) mit
// ihren Anmeldedaten auf, damit z. B. bei Doublette/Triplette auch die Partner sehen,
// mit welchen Daten sie gemeldet wurden.
function buildRegistrationParticipantsBlock(registration, language) {
  const labels = PARTICIPANTS_EMAIL_LABELS[language] || PARTICIPANTS_EMAIL_LABELS.de;
  const people = [
    { firstName: registration.first_name, lastName: registration.last_name, email: registration.email, club: registration.club, licenseNr: registration.license_nr },
  ];
  if (registration.partner_first_name && registration.partner_last_name) {
    people.push({ firstName: registration.partner_first_name, lastName: registration.partner_last_name, email: registration.partner_email, club: null, licenseNr: registration.partner_license_nr });
  }
  if (registration.partner2_first_name && registration.partner2_last_name) {
    people.push({ firstName: registration.partner2_first_name, lastName: registration.partner2_last_name, email: registration.partner2_email, club: null, licenseNr: registration.partner2_license_nr });
  }

  const lines = people.map((person) => {
    const details = [person.email, person.club, person.licenseNr ? `${labels.license}: ${person.licenseNr}` : null].filter(Boolean);
    const detailsText = details.length ? ` (${details.join(', ')})` : '';
    return `- ${person.firstName} ${person.lastName}${detailsText}`;
  });

  const teamLine = registration.team_name ? `${labels.team}: ${registration.team_name}\n` : '';
  return `\n\n${teamLine}${labels.participants}:\n${lines.join('\n')}`;
}

export const REGISTRATION_RECEIVED_EMAILS = {
  de: {
    subject: (name) => `Anmeldung eingegangen: ${name}`,
    text: (firstName, name, link, cancelLink, participantsBlock = '') =>
      `Hallo ${firstName},\n\ndeine Anmeldung für "${name}" ist eingegangen.${participantsBlock}\n\nDer Turnierersteller prüft deine Anmeldung noch. Du erhältst eine weitere E-Mail, sobald deine Anmeldung bestätigt wurde.\n\nAlle Infos zum Turnier:\n${link}\n\nMöchtest du dich wieder abmelden? Nutze diesen Link:\n${cancelLink}`,
  },
  nl: {
    subject: (name) => `Inschrijving ontvangen: ${name}`,
    text: (firstName, name, link, cancelLink, participantsBlock = '') =>
      `Hallo ${firstName},\n\nje inschrijving voor "${name}" is ontvangen.${participantsBlock}\n\nDe toernooiorganisator moet je inschrijving nog bevestigen. Je ontvangt een nieuwe e-mail zodra je deelname is bevestigd.\n\nAlle informatie over het toernooi:\n${link}\n\nWil je je weer afmelden? Gebruik deze link:\n${cancelLink}`,
  },
  en: {
    subject: (name) => `Registration received: ${name}`,
    text: (firstName, name, link, cancelLink, participantsBlock = '') =>
      `Hi ${firstName},\n\nyour registration for "${name}" has been received.${participantsBlock}\n\nThe tournament organizer still needs to confirm your registration. You will receive another email once your participation has been confirmed.\n\nAll tournament details:\n${link}\n\nWant to withdraw again? Use this link:\n${cancelLink}`,
  },
  es: {
    subject: (name) => `Inscripción recibida: ${name}`,
    text: (firstName, name, link, cancelLink, participantsBlock = '') =>
      `Hola ${firstName},\n\ntu inscripción para "${name}" se ha recibido.${participantsBlock}\n\nEl organizador del torneo aún debe confirmar tu inscripción. Recibirás otro correo cuando tu participación esté confirmada.\n\nToda la información del torneo:\n${link}\n\n¿Quieres darte de baja de nuevo? Usa este enlace:\n${cancelLink}`,
  },
  fr: {
    subject: (name) => `Inscription reçue : ${name}`,
    text: (firstName, name, link, cancelLink, participantsBlock = '') =>
      `Bonjour ${firstName},\n\nton inscription pour « ${name} » a bien été reçue.${participantsBlock}\n\nL’organisateur du tournoi doit encore confirmer ton inscription. Tu recevras un autre e-mail dès que ta participation sera confirmée.\n\nToutes les informations sur le tournoi :\n${link}\n\nTu veux te désinscrire ? Utilise ce lien :\n${cancelLink}`,
  },
};

export const REGISTRATION_CONFIRMATION_EMAILS = {
  de: {
    subject: (name) => `Anmeldung bestätigt: ${name}`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink, participantsBlock = '') =>
      `Hallo ${firstName},\n\ndeine Anmeldung für "${name}" wurde bestätigt.\n\nTermin: ${dateTimeLabel}\nOrt: ${location}${participantsBlock}\n\nAlle Infos zum Turnier:\n${link}\n\nEinen Kalendereintrag findest du im Anhang dieser E-Mail.\n\nMöchtest du dich wieder abmelden? Nutze diesen Link:\n${cancelLink}`,
  },
  nl: {
    subject: (name) => `Deelname bevestigd: ${name}`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink, participantsBlock = '') =>
      `Hallo ${firstName},\n\nJe deelname aan "${name}" is bevestigd.\n\nDatum: ${dateTimeLabel}\nLocatie: ${location}${participantsBlock}\n\nAlle informatie over het toernooi:\n${link}\n\nEen agenda-afspraak vind je als bijlage bij deze e-mail.\n\nWil je je weer afmelden? Gebruik deze link:\n${cancelLink}`,
  },
  en: {
    subject: (name) => `Participation confirmed: ${name}`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink, participantsBlock = '') =>
      `Hi ${firstName},\n\nYour participation in "${name}" has been confirmed.\n\nDate: ${dateTimeLabel}\nLocation: ${location}${participantsBlock}\n\nAll tournament details:\n${link}\n\nA calendar event is attached to this email.\n\nWant to withdraw again? Use this link:\n${cancelLink}`,
  },
  es: {
    subject: (name) => `Participación confirmada: ${name}`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink, participantsBlock = '') =>
      `Hola ${firstName},\n\nTu participación en "${name}" ha sido confirmada.\n\nFecha: ${dateTimeLabel}\nLugar: ${location}${participantsBlock}\n\nToda la información del torneo:\n${link}\n\nEncontrarás una cita de calendario adjunta a este correo.\n\n¿Quieres darte de baja de nuevo? Usa este enlace:\n${cancelLink}`,
  },
  fr: {
    subject: (name) => `Participation confirmée : ${name}`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink, participantsBlock = '') =>
      `Bonjour ${firstName},\n\nTa participation à « ${name} » est confirmée.\n\nDate : ${dateTimeLabel}\nLieu : ${location}${participantsBlock}\n\nToutes les informations sur le tournoi :\n${link}\n\nUn rendez-vous de calendrier est joint à cet e-mail.\n\nTu veux te désinscrire ? Utilise ce lien :\n${cancelLink}`,
  },
};

export const REGISTRATION_DISPLACED_EMAILS = {
  de: {
    subject: (name) => `Änderung deiner Anmeldung: ${name}`,
    textWaitlisted: (firstName, name, link, cancelLink) =>
      `Hallo ${firstName},\n\nFür "${name}" hat sich ein VIP-Teilnehmer angemeldet, für den kein regulärer Platz mehr frei war. Deine Anmeldung wurde daher auf die Warteliste verschoben.\n\nAlle Infos zum Turnier:\n${link}\n\nMöchtest du dich wieder abmelden? Nutze diesen Link:\n${cancelLink}`,
    textCancelled: (firstName, name, link) =>
      `Hallo ${firstName},\n\nFür "${name}" hat sich ein VIP-Teilnehmer angemeldet, für den kein regulärer Platz mehr frei war. Da für dieses Turnier keine Warteliste aktiviert ist, wurde deine Anmeldung leider storniert.\n\nAlle Infos zum Turnier:\n${link}`,
  },
  nl: {
    subject: (name) => `Wijziging van je inschrijving: ${name}`,
    textWaitlisted: (firstName, name, link, cancelLink) =>
      `Hallo ${firstName},\n\nVoor "${name}" heeft een VIP-deelnemer zich ingeschreven, waarvoor geen reguliere plaats meer vrij was. Je inschrijving is daarom op de wachtlijst geplaatst.\n\nAlle informatie over het toernooi:\n${link}\n\nWil je je weer afmelden? Gebruik deze link:\n${cancelLink}`,
    textCancelled: (firstName, name, link) =>
      `Hallo ${firstName},\n\nVoor "${name}" heeft een VIP-deelnemer zich ingeschreven, waarvoor geen reguliere plaats meer vrij was. Omdat er voor dit toernooi geen wachtlijst is geactiveerd, is je inschrijving helaas geannuleerd.\n\nAlle informatie over het toernooi:\n${link}`,
  },
  en: {
    subject: (name) => `Change to your registration: ${name}`,
    textWaitlisted: (firstName, name, link, cancelLink) =>
      `Hi ${firstName},\n\nA VIP participant has registered for "${name}" and no regular spot was left. Your registration has therefore been moved to the waiting list.\n\nAll tournament details:\n${link}\n\nWant to withdraw again? Use this link:\n${cancelLink}`,
    textCancelled: (firstName, name, link) =>
      `Hi ${firstName},\n\nA VIP participant has registered for "${name}" and no regular spot was left. Since no waiting list is enabled for this tournament, your registration has unfortunately been cancelled.\n\nAll tournament details:\n${link}`,
  },
  es: {
    subject: (name) => `Cambio en tu inscripción: ${name}`,
    textWaitlisted: (firstName, name, link, cancelLink) =>
      `Hola ${firstName},\n\nUn participante VIP se ha inscrito para "${name}" y no quedaba ninguna plaza regular. Por ello, tu inscripción se ha trasladado a la lista de espera.\n\nToda la información del torneo:\n${link}\n\n¿Quieres darte de baja de nuevo? Usa este enlace:\n${cancelLink}`,
    textCancelled: (firstName, name, link) =>
      `Hola ${firstName},\n\nUn participante VIP se ha inscrito para "${name}" y no quedaba ninguna plaza regular. Como no hay lista de espera activada para este torneo, lamentablemente tu inscripción ha sido cancelada.\n\nToda la información del torneo:\n${link}`,
  },
  fr: {
    subject: (name) => `Modification de ton inscription : ${name}`,
    textWaitlisted: (firstName, name, link, cancelLink) =>
      `Bonjour ${firstName},\n\nUn participant VIP s'est inscrit pour « ${name} » et il ne restait plus de place normale. Ton inscription a donc été placée sur liste d'attente.\n\nToutes les informations sur le tournoi :\n${link}\n\nTu veux te désinscrire ? Utilise ce lien :\n${cancelLink}`,
    textCancelled: (firstName, name, link) =>
      `Bonjour ${firstName},\n\nUn participant VIP s'est inscrit pour « ${name} » et il ne restait plus de place normale. Comme aucune liste d'attente n'est activée pour ce tournoi, ton inscription a malheureusement été annulée.\n\nToutes les informations sur le tournoi :\n${link}`,
  },
};

export const TOURNAMENT_REMINDER_EMAILS = {
  de: {
    subject: (name) => `Erinnerung: ${name} in 2 Tagen`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink) =>
      `Hallo ${firstName},\n\nNur noch 2 Tage bis "${name}"!\n\nTermin: ${dateTimeLabel}\nOrt: ${location}\n\nAlle Infos zum Turnier:\n${link}\n\nDen Kalendereintrag findest du im Anhang dieser E-Mail.\n\nMöchtest du dich wieder abmelden? Nutze diesen Link:\n${cancelLink}`,
  },
  nl: {
    subject: (name) => `Herinnering: ${name} over 2 dagen`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink) =>
      `Hallo ${firstName},\n\nNog maar 2 dagen tot "${name}"!\n\nDatum: ${dateTimeLabel}\nLocatie: ${location}\n\nAlle informatie over het toernooi:\n${link}\n\nDe agenda-afspraak vind je als bijlage bij deze e-mail.\n\nWil je je weer afmelden? Gebruik deze link:\n${cancelLink}`,
  },
  en: {
    subject: (name) => `Reminder: ${name} in 2 days`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink) =>
      `Hi ${firstName},\n\nOnly 2 days left until "${name}"!\n\nDate: ${dateTimeLabel}\nLocation: ${location}\n\nAll tournament details:\n${link}\n\nThe calendar event is attached to this email.\n\nWant to withdraw again? Use this link:\n${cancelLink}`,
  },
  es: {
    subject: (name) => `Recordatorio: ${name} en 2 días`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink) =>
      `Hola ${firstName},\n\n¡Solo quedan 2 días para "${name}"!\n\nFecha: ${dateTimeLabel}\nLugar: ${location}\n\nToda la información del torneo:\n${link}\n\nEncontrarás la cita de calendario adjunta a este correo.\n\n¿Quieres darte de baja de nuevo? Usa este enlace:\n${cancelLink}`,
  },
  fr: {
    subject: (name) => `Rappel : ${name} dans 2 jours`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink) =>
      `Bonjour ${firstName},\n\nPlus que 2 jours avant « ${name} » !\n\nDate : ${dateTimeLabel}\nLieu : ${location}\n\nToutes les informations sur le tournoi :\n${link}\n\nLe rendez-vous de calendrier est joint à cet e-mail.\n\nTu veux te désinscrire ? Utilise ce lien :\n${cancelLink}`,
  },
};

const REGISTRATION_CANCELLED_EMAILS = {
  de: {
    subject: (name) => `Abmeldung bestätigt: ${name}`,
    text: (firstName, name, link) =>
      `Hallo ${firstName},\n\nDeine Abmeldung von "${name}" wurde bestätigt.\n\nAlle Infos zum Turnier:\n${link}`,
  },
  nl: {
    subject: (name) => `Afmelding bevestigd: ${name}`,
    text: (firstName, name, link) =>
      `Hallo ${firstName},\n\nJe afmelding voor "${name}" is bevestigd.\n\nAlle informatie over het toernooi:\n${link}`,
  },
  en: {
    subject: (name) => `Withdrawal confirmed: ${name}`,
    text: (firstName, name, link) =>
      `Hi ${firstName},\n\nYour withdrawal from "${name}" has been confirmed.\n\nAll tournament details:\n${link}`,
  },
  es: {
    subject: (name) => `Baja confirmada: ${name}`,
    text: (firstName, name, link) =>
      `Hola ${firstName},\n\nTu baja de "${name}" ha sido confirmada.\n\nToda la información del torneo:\n${link}`,
  },
  fr: {
    subject: (name) => `Désinscription confirmée : ${name}`,
    text: (firstName, name, link) =>
      `Bonjour ${firstName},\n\nTa désinscription de « ${name} » a été confirmée.\n\nToutes les informations sur le tournoi :\n${link}`,
  },
};

const TOURNAMENT_BROADCAST_EMAILS = {
  de: {
    subject: (name) => `Nachricht an alle Teilnehmer: ${name}`,
    text: (firstName, name, senderName, message) =>
      `Hallo ${firstName},\n\n${senderName} hat allen Teilnehmern von "${name}" folgende Nachricht geschickt:\n\n${message}`,
  },
  nl: {
    subject: (name) => `Bericht aan alle deelnemers: ${name}`,
    text: (firstName, name, senderName, message) =>
      `Hallo ${firstName},\n\n${senderName} heeft alle deelnemers van "${name}" het volgende bericht gestuurd:\n\n${message}`,
  },
  en: {
    subject: (name) => `Message to all participants: ${name}`,
    text: (firstName, name, senderName, message) =>
      `Hi ${firstName},\n\n${senderName} sent the following message to all participants of "${name}":\n\n${message}`,
  },
  es: {
    subject: (name) => `Mensaje a todos los participantes: ${name}`,
    text: (firstName, name, senderName, message) =>
      `Hola ${firstName},\n\n${senderName} envió el siguiente mensaje a todos los participantes de "${name}":\n\n${message}`,
  },
  fr: {
    subject: (name) => `Message à tous les participants : ${name}`,
    text: (firstName, name, senderName, message) =>
      `Bonjour ${firstName},\n\n${senderName} a envoyé le message suivant à tous les participants de « ${name} » :\n\n${message}`,
  },
};

// Texte für Push-Benachrichtigungen zu Systemmeldungen (Turnier-/Anmelde-/Konto-/API-Key-
// Status), sprachabhängig wie die anderen Mail-Templates oben. Die In-App-Postbox übersetzt
// dieselben Ereignisse clientseitig über i18next (postboxMessageText in layout.jsx) - hier
// duplizieren wir das notgedrungen, weil der Push-Body vor der Zustellung feststehen muss.
const SYSTEM_NOTIFICATION_TEXTS = {
  de: {
    tournamentStatus: { draft: 'Entwurf', registration: 'Anmeldung offen', running: 'Läuft', finished: 'Abgeschlossen' },
    registrationStatus: { pending: 'Offen', confirmed: 'Bestätigt', waitlist: 'Warteliste', cancelled: 'Storniert' },
    registrationFor: (participant) => `Anmeldung von ${participant}`,
    accountEmailUnverified: 'E-Mail nicht bestätigt',
    accountPasswordChangeRequired: 'Passwortänderung erforderlich',
    apiKeyApproved: (label) => `API-Schlüssel „${label}“ wurde freigegeben`,
    apiKeyRevoked: (label) => `API-Schlüssel „${label}“ wurde gesperrt`,
    savedSearchMatches: (name, count) => `${count} neue${count === 1 ? 's' : ''} Turnier${count === 1 ? '' : 'e'} für „${name}“`,
  },
  nl: {
    tournamentStatus: { draft: 'Concept', registration: 'Inschrijving open', running: 'Bezig', finished: 'Afgerond' },
    registrationStatus: { pending: 'Open', confirmed: 'Bevestigd', waitlist: 'Wachtlijst', cancelled: 'Geannuleerd' },
    registrationFor: (participant) => `Aanmelding van ${participant}`,
    accountEmailUnverified: 'e-mail niet bevestigd',
    accountPasswordChangeRequired: 'wachtwoordwijziging vereist',
    apiKeyApproved: (label) => `API-sleutel „${label}” is goedgekeurd`,
    apiKeyRevoked: (label) => `API-sleutel „${label}” is ingetrokken`,
    savedSearchMatches: (name, count) => `${count} nieuw(e) toernooi(en) voor „${name}”`,
  },
  en: {
    tournamentStatus: { draft: 'Draft', registration: 'Registration open', running: 'Running', finished: 'Finished' },
    registrationStatus: { pending: 'Pending', confirmed: 'Confirmed', waitlist: 'Waitlist', cancelled: 'Cancelled' },
    registrationFor: (participant) => `Registration for ${participant}`,
    accountEmailUnverified: 'email not verified',
    accountPasswordChangeRequired: 'password change required',
    apiKeyApproved: (label) => `API key "${label}" was approved`,
    apiKeyRevoked: (label) => `API key "${label}" was revoked`,
    savedSearchMatches: (name, count) => `${count} new tournament${count === 1 ? '' : 's'} for "${name}"`,
  },
  es: {
    tournamentStatus: { draft: 'Borrador', registration: 'Inscripción abierta', running: 'En curso', finished: 'Finalizado' },
    registrationStatus: { pending: 'Pendiente', confirmed: 'Confirmado', waitlist: 'Lista de espera', cancelled: 'Cancelado' },
    registrationFor: (participant) => `Inscripción de ${participant}`,
    accountEmailUnverified: 'correo no verificado',
    accountPasswordChangeRequired: 'cambio de contraseña requerido',
    apiKeyApproved: (label) => `La clave API «${label}» fue aprobada`,
    apiKeyRevoked: (label) => `La clave API «${label}» fue revocada`,
    savedSearchMatches: (name, count) => `${count} torneo${count === 1 ? '' : 's'} nuevo${count === 1 ? '' : 's'} para «${name}»`,
  },
  fr: {
    tournamentStatus: { draft: 'Brouillon', registration: 'Inscriptions ouvertes', running: 'En cours', finished: 'Terminé' },
    registrationStatus: { pending: 'En attente', confirmed: 'Confirmé', waitlist: "Liste d'attente", cancelled: 'Annulé' },
    registrationFor: (participant) => `Inscription de ${participant}`,
    accountEmailUnverified: 'e-mail non confirmé',
    accountPasswordChangeRequired: 'changement de mot de passe requis',
    apiKeyApproved: (label) => `La clé API « ${label} » a été approuvée`,
    apiKeyRevoked: (label) => `La clé API « ${label} » a été révoquée`,
    savedSearchMatches: (name, count) => `${count} nouveau${count === 1 ? '' : 'x'} tournoi${count === 1 ? '' : 's'} pour « ${name} »`,
  },
};

function buildSystemNotificationPushBody(eventType, eventData, language) {
  const texts = SYSTEM_NOTIFICATION_TEXTS[language] || SYSTEM_NOTIFICATION_TEXTS.de;
  const data = eventData || {};
  if (eventType === 'tournament_status_changed') {
    return `${data.tournamentName}: ${texts.tournamentStatus[data.status] || data.status}`;
  }
  if (eventType === 'registration_status_changed') {
    return `${data.tournamentName}: ${texts.registrationFor(data.participant || '')} ${texts.registrationStatus[data.status] || data.status}`;
  }
  if (eventType === 'account_status_changed') {
    const parts = [data.role];
    if (!data.emailVerified) parts.push(texts.accountEmailUnverified);
    if (data.passwordChangeRequired) parts.push(texts.accountPasswordChangeRequired);
    return parts.join(', ');
  }
  if (eventType === 'api_key_status_changed') {
    return data.status === 'approved' ? texts.apiKeyApproved(data.label || '') : texts.apiKeyRevoked(data.label || '');
  }
  if (eventType === 'saved_search_new_matches') {
    return texts.savedSearchMatches(data.savedSearchName || '', data.count || 0);
  }
  return null;
}

const DESKTOP_APP_URL = 'https://michaelmassee.github.io/Petanque-Turnier-Manager/';

const EMAIL_FOOTERS = {
  de: `Pétanque Turnier Manager Online\nFinde dein nächstes Turnier – nach Ort, Verein oder Turniersystem – und melde dich direkt online an.\n\nFür Turnierleiter: Der Pétanque Turnier Manager ist die Profi-Software zur Turnierverwaltung:\n${DESKTOP_APP_URL}`,
  nl: `Pétanque Turnier Manager Online\nVind je volgende toernooi – op locatie, club of toernooisysteem – en schrijf je direct online in.\n\nVoor toernooileiders: Pétanque Turnier Manager is de professionele software voor toernooibeheer:\n${DESKTOP_APP_URL}`,
  en: `Pétanque Turnier Manager Online\nFind your next tournament – by location, club or tournament system – and register directly online.\n\nFor tournament directors: Pétanque Turnier Manager is the professional software for running tournaments:\n${DESKTOP_APP_URL}`,
  es: `Pétanque Turnier Manager Online\nEncuentra tu próximo torneo – por lugar, club o sistema de torneo – e inscríbete directamente en línea.\n\nPara directores de torneo: Pétanque Turnier Manager es el software profesional para gestionar torneos:\n${DESKTOP_APP_URL}`,
  fr: `Pétanque Turnier Manager Online\nTrouve ton prochain tournoi – par lieu, club ou système de tournoi – et inscris-toi directement en ligne.\n\nPour les organisateurs de tournois : Pétanque Turnier Manager est le logiciel professionnel de gestion de tournois :\n${DESKTOP_APP_URL}`,
};

export function appendEmailFooter(text, language) {
  const footer = EMAIL_FOOTERS[language] || EMAIL_FOOTERS.de;
  return `${text}\n\n----------\n\n${footer}`;
}

const EMAIL_BRAND = 'Pétanque Turnier Manager Online';
const EMAIL_LAYOUT_LABELS = {
  de: { openLink: 'Link öffnen', automated: `Diese E-Mail wurde automatisch von ${EMAIL_BRAND} versendet.` },
  nl: { openLink: 'Link openen', automated: `Deze e-mail is automatisch verzonden door ${EMAIL_BRAND}.` },
  en: { openLink: 'Open link', automated: `This email was sent automatically by ${EMAIL_BRAND}.` },
  es: { openLink: 'Abrir enlace', automated: `Este correo se ha enviado automáticamente desde ${EMAIL_BRAND}.` },
  fr: { openLink: 'Ouvrir le lien', automated: `Cet e-mail a été envoyé automatiquement par ${EMAIL_BRAND}.` },
};

function escapeEmailHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkifyEmailHtml(value) {
  const urlPattern = /(https?:\/\/[^\s<]+)/g;
  return String(value || '')
    .split(urlPattern)
    .map((part) => {
      const escaped = escapeEmailHtml(part);
      return /^https?:\/\/[^\s<]+$/.test(part)
        ? `<a href="${escaped}" style="color:#086f61;text-decoration:underline;word-break:break-all;">${escaped}</a>`
        : escaped;
    })
    .join('');
}

function renderEmailSection(text, labels) {
  return text
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => {
      const trimmed = paragraph.trim();
      if (/^https?:\/\/[^\s<]+$/.test(trimmed)) {
        const href = escapeEmailHtml(trimmed);
        return `<p style="margin:24px 0;"><a href="${href}" style="display:inline-block;background:#087f6f;border-radius:8px;color:#ffffff;font-weight:700;padding:13px 20px;text-decoration:none;">${labels.openLink}</a></p><p style="margin:0;color:#5e6d69;font-size:13px;line-height:20px;word-break:break-all;">${href}</p>`;
      }
      return `<p style="margin:0 0 18px;color:#25332f;font-size:16px;line-height:25px;">${linkifyEmailHtml(paragraph).replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}

/**
 * Builds an email-client-safe HTML alternative for every transactional message. The plain text
 * body remains the canonical fallback, while this layout gives modern clients a readable card,
 * clear action links and a separate product footer. All dynamic content is escaped before use.
 */
export function renderTransactionalEmailHtml(subject, text, language) {
  const labels = EMAIL_LAYOUT_LABELS[language] || EMAIL_LAYOUT_LABELS.de;
  const [content, footer = ''] = appendEmailFooter(text, language).split('\n\n----------\n\n');
  const footerHtml = renderEmailSection(footer, labels);
  return `<!doctype html>
<html lang="${escapeEmailHtml(language || 'de')}">
  <body style="margin:0;padding:0;background:#eef3f1;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef3f1;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;">
          <tr><td style="background:#07594f;padding:24px 32px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.1px;">${EMAIL_BRAND}</td></tr>
          <tr><td style="padding:34px 32px 24px;"><h1 style="margin:0 0 24px;color:#173b34;font-size:24px;line-height:31px;">${escapeEmailHtml(subject)}</h1>${renderEmailSection(content, labels)}</td></tr>
          <tr><td style="border-top:1px solid #dce6e2;padding:24px 32px 28px;background:#f8fbfa;">${footerHtml}</td></tr>
        </table>
        <p style="margin:16px 0 0;color:#71807b;font-size:12px;line-height:18px;">${labels.automated}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

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
  lines.push(`LOCATION:${icsEscapeText(formatLocationAddress(tournament.location))}`);
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
  const owner = await db.prepare('SELECT language FROM users WHERE id = ?').bind(tournament.owner_id).first();
  return owner?.language || registration.language || 'de';
}

/**
 * E-Mail-Versand ist pro User erst nach Admin-Freischaltung erlaubt (siehe migrations/0037).
 * Betrifft nur den tatsächlichen Mailversand rund um Turniere; Push/Postfach bleiben unberührt,
 * und die auslösende Aktion (Anmeldung, Stornierung, Broadcast) läuft in jedem Fall normal durch.
 */
async function canSendTournamentMail(db, tournament) {
  const owner = await db.prepare('SELECT role, mail_enabled FROM users WHERE id = ?').bind(tournament.owner_id).first();
  if (!owner) return true;
  return owner.role === 'admin' || Boolean(Number(owner.mail_enabled));
}

function buildTeamRecipients(registration) {
  const entries = [
    { email: registration.email, firstName: registration.first_name },
    { email: registration.partner_email, firstName: registration.partner_first_name },
    { email: registration.partner2_email, firstName: registration.partner2_first_name },
  ];
  const seen = new Set();
  const recipients = [];
  for (const entry of entries) {
    if (!entry.email || isPlaceholderEmail(entry.email)) continue;
    const key = entry.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(entry);
  }
  return recipients;
}

export function buildCancelLink(appOrigin, token) {
  return `${appOrigin}/?cancel_token=${encodeURIComponent(token)}`;
}

async function sendRegistrationConfirmationEmail(env, tournament, registration, appOrigin) {
  if (!(await canSendTournamentMail(env.DB, tournament))) return;
  const language = await resolveEmailLanguage(env.DB, tournament, registration);
  const templates = REGISTRATION_CONFIRMATION_EMAILS[language] || REGISTRATION_CONFIRMATION_EMAILS.de;
  const dateTimeLabel = formatTournamentDateTime(tournament, language);
  const link = `${appOrigin}/turniere/${tournament.id}/info`;
  const cancelLink = buildCancelLink(appOrigin, registration.cancel_token);
  const ics = buildTournamentIcs(tournament, appOrigin);
  const participantsBlock = buildRegistrationParticipantsBlock(registration, language);

  for (const recipient of buildTeamRecipients(registration)) {
    await enqueueTransactionalEmail(env, {
      to: recipient.email,
      subject: templates.subject(tournament.name),
      text: templates.text(recipient.firstName, tournament.name, dateTimeLabel, formatLocationAddress(tournament.location), link, cancelLink, participantsBlock),
      language,
      attachments: [{ filename: 'termin.ics', content: base64Encode(ics) }],
      logFallback: `Registration confirmation email for ${recipient.email} (tournament ${tournament.id})`,
      failureContext: `registration confirmation for registration ${registration.id}`,
      allowLogFallback: true,
    });
  }
}

async function sendRegistrationReceivedEmail(env, tournament, registration, appOrigin) {
  if (!(await canSendTournamentMail(env.DB, tournament))) return;
  const language = await resolveEmailLanguage(env.DB, tournament, registration);
  const templates = REGISTRATION_RECEIVED_EMAILS[language] || REGISTRATION_RECEIVED_EMAILS.de;
  const link = `${appOrigin}/turniere/${tournament.id}/info`;
  const cancelLink = buildCancelLink(appOrigin, registration.cancel_token);
  const participantsBlock = buildRegistrationParticipantsBlock(registration, language);

  for (const recipient of buildTeamRecipients(registration)) {
    await enqueueTransactionalEmail(env, {
      to: recipient.email,
      subject: templates.subject(tournament.name),
      text: templates.text(recipient.firstName, tournament.name, link, cancelLink, participantsBlock),
      language,
      logFallback: `Registration received email for ${recipient.email} (tournament ${tournament.id})`,
      failureContext: `registration receipt for registration ${registration.id}`,
      allowLogFallback: true,
    });
  }
}

async function sendDisplacementEmail(env, tournament, registration, wasCancelled, appOrigin) {
  if (!(await canSendTournamentMail(env.DB, tournament))) return;
  const language = await resolveEmailLanguage(env.DB, tournament, registration);
  const templates = REGISTRATION_DISPLACED_EMAILS[language] || REGISTRATION_DISPLACED_EMAILS.de;
  const link = `${appOrigin}/turniere/${tournament.id}/info`;
  const cancelLink = buildCancelLink(appOrigin, registration.cancel_token);

  for (const recipient of buildTeamRecipients(registration)) {
    await enqueueTransactionalEmail(env, {
      to: recipient.email,
      subject: templates.subject(tournament.name),
      text: wasCancelled
        ? templates.textCancelled(recipient.firstName, tournament.name, link)
        : templates.textWaitlisted(recipient.firstName, tournament.name, link, cancelLink),
      language,
      logFallback: `Displacement email for ${recipient.email} (tournament ${tournament.id}, cancelled=${wasCancelled})`,
      failureContext: `displacement notice for registration ${registration.id}`,
      allowLogFallback: true,
    });
  }
}

async function sendCancellationEmail(env, tournament, registration, appOrigin) {
  if (!(await canSendTournamentMail(env.DB, tournament))) return;
  const language = await resolveEmailLanguage(env.DB, tournament, registration);
  const templates = REGISTRATION_CANCELLED_EMAILS[language] || REGISTRATION_CANCELLED_EMAILS.de;
  const link = `${appOrigin}/turniere/${tournament.id}/info`;

  for (const recipient of buildTeamRecipients(registration)) {
    await enqueueTransactionalEmail(env, {
      to: recipient.email,
      subject: templates.subject(tournament.name),
      text: templates.text(recipient.firstName, tournament.name, link),
      language,
      logFallback: `Cancellation email for ${recipient.email} (tournament ${tournament.id})`,
      failureContext: `cancellation notice for registration ${registration.id}`,
      allowLogFallback: true,
    });
  }
}

const TOURNAMENT_REMINDER_LEAD_DAYS = 2;
const APP_ORIGIN = 'https://ptmonline.org';

async function sendTournamentReminders(env) {
  const target = new Date();
  target.setUTCDate(target.getUTCDate() + TOURNAMENT_REMINDER_LEAD_DAYS);
  const targetDate = target.toISOString().slice(0, 10);

  const tournaments = await env.DB.prepare("SELECT * FROM tournaments WHERE date = ? AND status != 'draft'").bind(targetDate).all();

  for (const tournament of tournaments.results || []) {
    const mailAllowed = await canSendTournamentMail(env.DB, tournament);
    const registrations = await env.DB
      .prepare(
        `SELECT * FROM registrations
         WHERE tournament_id = ? AND status IN ('pending', 'confirmed') AND reminder_sent_at IS NULL`,
      )
      .bind(tournament.id)
      .all();

    const notifiedEmails = new Set();

    for (const registration of registrations.results || []) {
      if (!registration.cancel_token) {
        registration.cancel_token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
        await env.DB.prepare('UPDATE registrations SET cancel_token = ? WHERE id = ?').bind(registration.cancel_token, registration.id).run();
      }

      const allRecipients = buildTeamRecipients(registration);
      const recipients = allRecipients.filter((recipient) => !notifiedEmails.has(recipient.email.toLowerCase()));

      if (recipients.length > 0 && mailAllowed) {
        const language = await resolveEmailLanguage(env.DB, tournament, registration);
        const templates = TOURNAMENT_REMINDER_EMAILS[language] || TOURNAMENT_REMINDER_EMAILS.de;
        const dateTimeLabel = formatTournamentDateTime(tournament, language);
        const link = `${APP_ORIGIN}/turniere/${tournament.id}/info`;
        const cancelLink = buildCancelLink(APP_ORIGIN, registration.cancel_token);
        const ics = buildTournamentIcs(tournament, APP_ORIGIN);

        try {
          for (const recipient of recipients) {
            await enqueueTransactionalEmail(env, {
              to: recipient.email,
              subject: templates.subject(tournament.name),
              text: templates.text(recipient.firstName, tournament.name, dateTimeLabel, formatLocationAddress(tournament.location), link, cancelLink),
              language,
              attachments: [{ filename: 'termin.ics', content: base64Encode(ics) }],
              logFallback: `Tournament reminder email for registration ${registration.id} (tournament ${tournament.id})`,
              failureContext: `tournament reminder for registration ${registration.id}`,
              allowLogFallback: true,
            });
          }
        } catch (error) {
          console.error(`Failed to send tournament reminder for registration ${registration.id}`, error);
          continue;
        }

        recipients.forEach((recipient) => notifiedEmails.add(recipient.email.toLowerCase()));
      }

      allRecipients.forEach((recipient) => notifiedEmails.add(recipient.email.toLowerCase()));
      await env.DB.prepare('UPDATE registrations SET reminder_sent_at = ? WHERE id = ?').bind(new Date().toISOString(), registration.id).run();
    }
  }
}

const PWA_INSTALL_PATHS = ['/manifest.webmanifest', '/service-worker.js'];

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      Promise.all([
        sendTournamentReminders(env).catch((error) => console.error('Tournament reminder cron failed', error)),
        syncPetanqueAktuellImports(env).catch((error) => console.error('Pétanque Aktuell sync cron failed', error)),
      ]),
    );
  },

  async queue(batch, env) {
    await processMailQueueBatch(batch, env);
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

    const response = await (async () => {
      try {
        assertSameOriginForUnsafeMethods(request, url);
      await cleanupExpiredSessions(env.DB);

      if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
        return json({ needsSetup: await needsSetup(env.DB), turnstileSiteKey: env.TURNSTILE_SITE_KEY || null, maptilerApiKey: env.MAPTILER_API_KEY || null });
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

      if (request.method === 'GET' && url.pathname === '/api/postbox') {
        const session = await requireSession(request, env.DB);
        return await getPostbox(env.DB, session.user);
      }

      if (request.method === 'GET' && url.pathname === '/api/postbox/recipients') {
        const session = await requireSession(request, env.DB);
        return await listPostboxRecipients(env.DB, session.user.id);
      }

      if (request.method === 'POST' && url.pathname === '/api/postbox/messages') {
        const session = await requireSession(request, env.DB);
        return await sendPostboxMessage(request, env, session.user);
      }

      const postboxReadMatch = url.pathname.match(/^\/api\/postbox\/messages\/([^/]+)\/read$/);
      if (postboxReadMatch && request.method === 'POST') {
        const session = await requireSession(request, env.DB);
        return await markPostboxMessageRead(env.DB, postboxReadMatch[1], session.user.id);
      }

      if (request.method === 'POST' && url.pathname === '/api/postbox/read-all') {
        const session = await requireSession(request, env.DB);
        return await markAllPostboxMessagesRead(env.DB, session.user.id);
      }

      if (request.method === 'GET' && url.pathname === '/api/push/public-key') {
        await requireSession(request, env.DB);
        if (!env.VAPID_PUBLIC_KEY) throw new HttpError(503, 'Push-Benachrichtigungen sind nicht konfiguriert');
        return json({ publicKey: env.VAPID_PUBLIC_KEY });
      }

      if (request.method === 'POST' && url.pathname === '/api/push/subscriptions') {
        const session = await requireSession(request, env.DB);
        return await savePushSubscription(request, env.DB, session.user.id);
      }

      if (request.method === 'DELETE' && url.pathname === '/api/push/subscriptions') {
        const session = await requireSession(request, env.DB);
        return await removePushSubscription(request, env.DB, session.user.id);
      }

      if (url.pathname === '/api/saved-searches') {
        const session = await requireSession(request, env.DB);
        if (request.method === 'GET') {
          return await listSavedSearches(env.DB, session.user.id);
        }
        if (request.method === 'POST') {
          return await createSavedSearch(request, env.DB, session.user.id);
        }
      }

      const savedSearchMatch = url.pathname.match(/^\/api\/saved-searches\/([^/]+)$/);
      if (savedSearchMatch && request.method === 'PUT') {
        const session = await requireSession(request, env.DB);
        return await updateSavedSearch(request, env.DB, savedSearchMatch[1], session.user.id);
      }
      if (savedSearchMatch && request.method === 'DELETE') {
        const session = await requireSession(request, env.DB);
        return await deleteSavedSearch(env.DB, savedSearchMatch[1], session.user.id);
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
          return await updateUser(request, env, userMatch[1], session.user.id);
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
        return await approveApiKey(env, adminApiKeyApproveMatch[1], session.user.id);
      }

      const adminApiKeyRevokeMatch = url.pathname.match(/^\/api\/admin\/api-keys\/([^/]+)\/revoke$/);
      if (adminApiKeyRevokeMatch && request.method === 'POST') {
        await requireAdmin(request, env.DB);
        return await revokeApiKey(env, adminApiKeyRevokeMatch[1]);
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/api-keys') {
        await requireAdmin(request, env.DB);
        return await adminCreateApiKey(env.DB, request);
      }

      const adminApiKeyMatch = url.pathname.match(/^\/api\/admin\/api-keys\/([^/]+)$/);
      if (adminApiKeyMatch && request.method === 'PUT') {
        await requireAdmin(request, env.DB);
        return await updateApiKeyLabel(env.DB, adminApiKeyMatch[1], request);
      }
      if (adminApiKeyMatch && request.method === 'DELETE') {
        await requireAdmin(request, env.DB);
        return await deleteApiKey(env.DB, adminApiKeyMatch[1]);
      }

      if (url.pathname === '/api/tournaments') {
        if (request.method === 'GET') {
          const session = await optionalSession(request, env.DB);
          return await listTournaments(env.DB, session?.user || null);
        }

        if (request.method === 'POST') {
          const auth = await requireManagerAuth(request, env.DB);
          return await createTournament(request, env, auth.user);
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/tournament-reports') {
        return await createTournamentReport(request, env, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/tournament-reports/verify') {
        return await verifyTournamentReport(request, env);
      }

      if (url.pathname === '/api/admin/petanque-aktuell/tournaments' && request.method === 'GET') {
        await requireAdmin(request, env.DB);
        return json({ tournaments: await listPetanqueAktuellCandidates(env.DB) });
      }

      if (url.pathname === '/api/admin/petanque-aktuell/import' && request.method === 'POST') {
        const session = await requireAdmin(request, env.DB);
        return await importPetanqueAktuellTournaments(request, env, session.user);
      }

      if (request.method === 'POST' && url.pathname === '/api/geocode') {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        await enforceGeocodeRateLimit(env.DB, ip);
        const body = await readJson(request);
        const countryCode = request.headers.get('CF-IPCountry');
        const results = await geocodeLocation(body.query, { countryCode, limit: 5 });
        const [best] = results;
        return json({
          results: results.map(({ lat, lng, displayName }) => ({ lat, lng, displayName })),
          lat: best?.lat ?? null,
          lng: best?.lng ?? null,
          displayName: best?.displayName ?? null,
        });
      }

      if (request.method === 'GET' && url.pathname === '/api/places') {
        const session = await optionalSession(request, env.DB);
        return await listBoulePlaces(env.DB, session?.user || null, url.searchParams.get('q'));
      }
      if (request.method === 'POST' && url.pathname === '/api/places') {
        const session = await requireSession(request, env.DB);
        return await createIndependentBoulePlace(request, env.DB, session.user, request.headers.get('CF-IPCountry'));
      }
      if (request.method === 'POST' && url.pathname === '/api/place-reports') {
        return await createPlaceReport(request, env, url);
      }
      if (request.method === 'POST' && url.pathname === '/api/place-reports/verify') {
        return await verifyPlaceReport(request, env.DB);
      }
      const placeReportTokenMatch = url.pathname.match(/^\/api\/place-reports\/by-token\/([^/]+)$/);
      if (placeReportTokenMatch && request.method === 'GET') {
        return await getPlaceReportByToken(env.DB, placeReportTokenMatch[1]);
      }
      if (placeReportTokenMatch && request.method === 'PUT') {
        return await updatePlaceReportByToken(request, env.DB, placeReportTokenMatch[1], request.headers.get('CF-IPCountry'));
      }
      if (request.method === 'GET' && url.pathname === '/api/places/mine') {
        const session = await requireSession(request, env.DB);
        return await listMyPlaceReports(env.DB, session.user.id);
      }
      if (request.method === 'POST' && url.pathname === '/api/clubs') {
        const session = await requireSession(request, env.DB);
        return await createClub(request, env.DB, session.user);
      }
      if (request.method === 'GET' && url.pathname === '/api/clubs/mine') {
        const session = await requireSession(request, env.DB);
        return await listMyClubs(env.DB, session.user.id);
      }
      const clubMatch = url.pathname.match(/^\/api\/clubs\/([^/]+)$/);
      if (clubMatch && request.method === 'GET') {
        const session = await optionalSession(request, env.DB);
        return await getClub(env.DB, clubMatch[1], session?.user || null);
      }
      if (clubMatch && request.method === 'PUT') {
        const session = await requireSession(request, env.DB);
        return await updateClub(request, env.DB, clubMatch[1], session.user);
      }
      if (clubMatch && request.method === 'DELETE') {
        const session = await requireSession(request, env.DB);
        return await deleteClub(env.DB, clubMatch[1], session.user);
      }
      const clubRequestMatch = url.pathname.match(/^\/api\/clubs\/([^/]+)\/editor-request$/);
      if (clubRequestMatch && request.method === 'POST') {
        const session = await requireSession(request, env.DB);
        return await requestClubEditor(env.DB, clubRequestMatch[1], session.user.id);
      }
      const clubEditorsMatch = url.pathname.match(/^\/api\/clubs\/([^/]+)\/editors$/);
      if (clubEditorsMatch && request.method === 'GET') {
        const session = await requireSession(request, env.DB);
        return await listClubEditors(env.DB, clubEditorsMatch[1], session.user);
      }
      if (clubEditorsMatch && request.method === 'POST') {
        const session = await requireSession(request, env.DB);
        return await addClubEditor(request, env.DB, clubEditorsMatch[1], session.user);
      }
      const clubEditorMatch = url.pathname.match(/^\/api\/clubs\/([^/]+)\/editors\/([^/]+)$/);
      if (clubEditorMatch && request.method === 'DELETE') {
        const session = await requireSession(request, env.DB);
        return await removeClubEditor(env.DB, clubEditorMatch[1], clubEditorMatch[2], session.user);
      }
      const clubPlaceMatch = url.pathname.match(/^\/api\/clubs\/([^/]+)\/places$/);
      if (clubPlaceMatch && request.method === 'POST') {
        const session = await requireSession(request, env.DB);
        return await createBoulePlace(request, env.DB, clubPlaceMatch[1], session.user, request.headers.get('CF-IPCountry'));
      }
      const placeClubLogoMatch = url.pathname.match(/^\/api\/places\/([^/]+)\/club-logo$/);
      if (placeClubLogoMatch && request.method === 'GET') {
        return await proxyBoulePlaceClubLogo(env.DB, placeClubLogoMatch[1]);
      }
      const placeMatch = url.pathname.match(/^\/api\/places\/([^/]+)$/);
      if (placeMatch && request.method === 'PUT') {
        const session = await requireSession(request, env.DB);
        return await updateBoulePlace(request, env.DB, placeMatch[1], session.user, request.headers.get('CF-IPCountry'));
      }
      if (placeMatch && request.method === 'DELETE') {
        const session = await requireSession(request, env.DB);
        return await deleteBoulePlace(env.DB, placeMatch[1], session.user);
      }
      const placeLikeMatch = url.pathname.match(/^\/api\/places\/([^/]+)\/like$/);
      if (placeLikeMatch && request.method === 'POST') {
        const session = await requireSession(request, env.DB);
        return await toggleBoulePlaceLike(env.DB, placeLikeMatch[1], session.user.id);
      }
      const placeFavoriteMatch = url.pathname.match(/^\/api\/places\/([^/]+)\/favorite$/);
      if (placeFavoriteMatch && request.method === 'POST') {
        const session = await requireSession(request, env.DB);
        return await toggleBoulePlaceFavorite(env.DB, placeFavoriteMatch[1], session.user.id);
      }
      if (request.method === 'GET' && url.pathname === '/api/player-listings') {
        const session = await optionalSession(request, env.DB);
        return await listPlayerListings(env.DB, session?.user || null, url.searchParams);
      }
      if (request.method === 'GET' && url.pathname === '/api/player-listings/mine') {
        const session = await requireSession(request, env.DB);
        return await listMyPlayerListings(env.DB, session.user.id);
      }
      if (request.method === 'POST' && url.pathname === '/api/player-listings') {
        const session = await requireSession(request, env.DB);
        return await createPlayerListing(request, env.DB, session.user, request.headers.get('CF-IPCountry'));
      }
      const playerListingMatch = url.pathname.match(/^\/api\/player-listings\/([^/]+)$/);
      if (playerListingMatch && request.method === 'PUT') {
        const session = await requireSession(request, env.DB);
        return await updatePlayerListing(request, env.DB, playerListingMatch[1], session.user, request.headers.get('CF-IPCountry'));
      }
      if (playerListingMatch && request.method === 'DELETE') {
        const session = await requireSession(request, env.DB);
        return await deletePlayerListing(env.DB, playerListingMatch[1], session.user);
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/player-listings') {
        await requireAdmin(request, env.DB);
        return await listAllPlayerListings(env.DB);
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/club-editor-requests') {
        await requireAdmin(request, env.DB);
        return await listClubEditorRequests(env.DB);
      }
      const approveClubEditorMatch = url.pathname.match(/^\/api\/admin\/clubs\/([^/]+)\/editors\/([^/]+)$/);
      if (approveClubEditorMatch && request.method === 'POST') {
        const session = await requireAdmin(request, env.DB);
        return await approveClubEditor(env.DB, approveClubEditorMatch[1], approveClubEditorMatch[2], session.user.id);
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/pending-places') {
        await requireAdmin(request, env.DB);
        return await listPendingBoulePlaces(env.DB);
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/place-reports') {
        await requireAdmin(request, env.DB);
        return await listPlaceReportsForAdmin(env.DB);
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/places') {
        await requireAdmin(request, env.DB);
        return await listAllBoulePlacesForAdmin(env.DB);
      }
      const publishPlaceMatch = url.pathname.match(/^\/api\/admin\/places\/([^/]+)\/publish$/);
      if (publishPlaceMatch && request.method === 'POST') {
        await requireAdmin(request, env.DB);
        return await publishBoulePlace(env.DB, publishPlaceMatch[1]);
      }
      const adminPlaceClubMatch = url.pathname.match(/^\/api\/admin\/places\/([^/]+)\/club$/);
      if (adminPlaceClubMatch && request.method === 'PUT') {
        await requireAdmin(request, env.DB);
        const body = await readJson(request);
        return await updateBoulePlaceClubAsAdmin(env.DB, adminPlaceClubMatch[1], body.clubId);
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/dashboard-stats') {
        await requireAdmin(request, env.DB);
        return await getAdminDashboardStats(env.DB);
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/clubs') {
        await requireAdmin(request, env.DB);
        return await listAllClubsForAdmin(env.DB);
      }
      const adminClubMatch = url.pathname.match(/^\/api\/admin\/clubs\/([^/]+)$/);
      if (adminClubMatch && request.method === 'PUT') {
        await requireAdmin(request, env.DB);
        return await updateClubAsAdmin(request, env.DB, adminClubMatch[1]);
      }
      const adminClubStatusMatch = url.pathname.match(/^\/api\/admin\/clubs\/([^/]+)\/status$/);
      if (adminClubStatusMatch && request.method === 'PUT') {
        await requireAdmin(request, env.DB);
        const body = await readJson(request);
        return await updateClubStatusAsAdmin(env.DB, adminClubStatusMatch[1], String(body.status || ''));
      }
      const adminClubOwnerMatch = url.pathname.match(/^\/api\/admin\/clubs\/([^/]+)\/owner$/);
      if (adminClubOwnerMatch && request.method === 'PUT') {
        await requireAdmin(request, env.DB);
        const body = await readJson(request);
        return await updateClubOwnerAsAdmin(env.DB, adminClubOwnerMatch[1], String(body.userId || ''));
      }
      if (adminClubMatch && request.method === 'DELETE') {
        await requireAdmin(request, env.DB);
        return await deleteClubAsAdmin(env.DB, adminClubMatch[1]);
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
          const session = await optionalSession(request, env.DB);
          const shareAccess = await hasTournamentShareAccess(env.DB, tournament, url.searchParams.get('share'));
          return await createRegistration(request, env, tournament, { session, shareAccess });
        }
      }

      const tournamentEditorsMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/editors$/);
      if (tournamentEditorsMatch) {
        const session = await requireSession(request, env.DB);
        const tournament = await getTournamentById(env.DB, tournamentEditorsMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }

        if (request.method === 'GET') {
          assertCanManageTournament(tournament, session.user);
          return json({ editors: tournamentEditors(tournament) });
        }

        if (request.method === 'POST') {
          assertCanManageEditors(tournament, session.user);
          return await addTournamentEditor(request, env.DB, tournament, session.user);
        }
      }

      const tournamentEditorMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/editors\/([^/]+)$/);
      if (tournamentEditorMatch && request.method === 'DELETE') {
        const session = await requireSession(request, env.DB);
        const tournament = await getTournamentById(env.DB, tournamentEditorMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageEditors(tournament, session.user);
        if (tournamentEditorMatch[2] === tournament.owner_id && session.user.role !== 'admin') {
          throw new HttpError(403, 'Der Owner kann nur von einem Admin entfernt werden');
        }
        await env.DB.prepare('DELETE FROM tournament_editors WHERE tournament_id = ? AND user_id = ?').bind(tournament.id, tournamentEditorMatch[2]).run();
        const updated = await getTournamentById(env.DB, tournament.id);
        return json({ editors: tournamentEditors(updated) });
      }

      const tournamentOwnerMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/owner$/);
      if (tournamentOwnerMatch && request.method === 'PUT') {
        const session = await requireAdmin(request, env.DB);
        const tournament = await getTournamentById(env.DB, tournamentOwnerMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        const updated = await updateTournamentOwner(request, env.DB, tournament);
        return json({ tournament: toPublicTournament(updated, session.user) });
      }

      const tournamentDuplicateMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/duplicate$/);
      if (tournamentDuplicateMatch && request.method === 'POST') {
        const session = await requireManagerAuth(request, env.DB);
        const tournament = await getTournamentById(env.DB, tournamentDuplicateMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, session.user);
        const duplicate = await duplicateTournament(env.DB, tournament, session.user);
        return json({ tournament: toPublicTournament(duplicate, session.user) }, 201);
      }

      const confirmPendingRegistrationsMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/registrations\/confirm-pending$/);
      if (confirmPendingRegistrationsMatch && request.method === 'POST') {
        const session = await requireManagerAuth(request, env.DB);
        const tournament = await getTournamentById(env.DB, confirmPendingRegistrationsMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, session.user);
        return await confirmPendingRegistrations(env, tournament, new URL(request.url).origin);
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

      const tournamentRoundsMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/rounds$/);
      if (tournamentRoundsMatch) {
        const tournament = await getTournamentById(env.DB, tournamentRoundsMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }

        if (request.method === 'GET') {
          const session = await optionalSession(request, env.DB);
          if (!canViewParticipants(tournament, session?.user || null)) {
            throw new HttpError(403, 'Zugriff verweigert');
          }
          return await listTournamentRounds(env.DB, tournament.id);
        }

        if (request.method === 'POST') {
          const session = await requireSession(request, env.DB);
          assertCanManageTournament(tournament, session.user);
          return await generateTournamentRound(env.DB, tournament);
        }
      }

      const tournamentTeamDrawMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/teams\/draw$/);
      if (tournamentTeamDrawMatch && request.method === 'POST') {
        const tournament = await getTournamentById(env.DB, tournamentTeamDrawMatch[1]);
        if (!tournament) throw new HttpError(404, 'Turnier nicht gefunden');
        const session = await requireSession(request, env.DB);
        assertCanManageTournament(tournament, session.user);
        return await drawSchweizerMeleeTeams(env.DB, tournament);
      }

      const tournamentMatchResultMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/matches\/([^/]+)\/result$/);
      if (tournamentMatchResultMatch && request.method === 'PUT') {
        const tournament = await getTournamentById(env.DB, tournamentMatchResultMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        const session = await requireSession(request, env.DB);
        assertCanManageTournament(tournament, session.user);
        return await setTournamentMatchResult(request, env.DB, tournament, tournamentMatchResultMatch[2]);
      }

      const tournamentRankingMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/ranking$/);
      if (tournamentRankingMatch && request.method === 'GET') {
        const tournament = await getTournamentById(env.DB, tournamentRankingMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        const session = await optionalSession(request, env.DB);
        if (!canViewParticipants(tournament, session?.user || null)) {
          throw new HttpError(403, 'Zugriff verweigert');
        }
        return await getTournamentRanking(env.DB, tournament);
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
        const result = await cancelRegistration(env.DB, registration.id);
        try {
          await sendCancellationEmail(env, { id: registration.tournament_id, name: registration.name, owner_id: registration.owner_id }, registration, APP_ORIGIN);
        } catch (error) {
          console.error(`Failed to send cancellation email for registration ${registration.id}`, error);
        }
        return result;
      }

      const tournamentMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)$/);
      if (tournamentMatch) {
        const tournament = await getTournamentById(env.DB, tournamentMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }

        if (request.method === 'GET') {
          const session = await optionalSession(request, env.DB);
          const shareAccess = await hasTournamentShareAccess(env.DB, tournament, url.searchParams.get('share'));
          if (!canViewTournament(tournament, session?.user || null) && !shareAccess) {
            throw new HttpError(403, 'Zugriff verweigert');
          }
          return json({ tournament: toPublicTournament(tournament, session?.user || null) });
        }

        const session = await requireSession(request, env.DB);
        assertCanManageTournament(tournament, session.user);

        if (request.method === 'PUT') {
          return await updateTournament(request, env, tournament, session.user);
        }

        if (request.method === 'DELETE') {
          return await deleteTournament(env.DB, tournament.id);
        }
      }

      const tournamentStartMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/start$/);
      if (tournamentStartMatch && request.method === 'POST') {
        const session = await requireSession(request, env.DB);
        const tournament = await getTournamentById(env.DB, tournamentStartMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, session.user);
        return await startTournament(env, tournament, session.user);
      }

      const presentationMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/presentation$/);
      if (presentationMatch && request.method === 'PUT') {
        const session = await requireSession(request, env.DB);
        const tournament = await getTournamentById(env.DB, presentationMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, session.user);
        return await updateTournamentPresentation(request, env, tournament, session.user);
      }

      const shareLinkMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/share-link$/);
      if (shareLinkMatch) {
        const session = await requireSession(request, env.DB);
        const tournament = await getTournamentById(env.DB, shareLinkMatch[1]);
        if (!tournament) throw new HttpError(404, 'Turnier nicht gefunden');
        assertCanManageTournament(tournament, session.user);
        if (tournament.status === 'draft') throw new HttpError(400, 'Entwürfe können nicht geteilt werden');
        if (tournament.visibility !== 'private' && request.method === 'POST') {
          return json({ shareUrl: `${url.origin}/turniere/${tournament.id}/info` });
        }
        if (request.method === 'POST') return await createTournamentShareLink(env.DB, tournament.id, url.origin);
        if (request.method === 'DELETE') return await deleteTournamentShareLink(env.DB, tournament.id);
      }

      const imageProxyMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/image$/);
      if (imageProxyMatch && request.method === 'GET') {
        const tournament = await getTournamentById(env.DB, imageProxyMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        const session = await optionalSession(request, env.DB);
        const shareAccess = await hasTournamentShareAccess(env.DB, tournament, url.searchParams.get('share'));
        if (!canViewTournament(tournament, session?.user || null) && !shareAccess) {
          throw new HttpError(403, 'Zugriff verweigert');
        }
        return await proxyTournamentImage(tournament, url.searchParams.get('field'));
      }

      if (url.pathname === '/api/registrations/cancel-by-token' && request.method === 'POST') {
        return await cancelRegistrationByToken(request, env);
      }

      const registrationMatch = url.pathname.match(/^\/api\/registrations\/([^/]+)$/);
      if (registrationMatch) {
        const auth = await requireManagerAuth(request, env.DB);
        const registration = await getRegistrationWithTournament(env.DB, registrationMatch[1]);
        if (!registration) {
          throw new HttpError(404, 'Anmeldung nicht gefunden');
        }
        assertCanManageTournament(registration, auth.user);
        assertRegistrationOnlineEditable(registration);

        if (request.method === 'PUT') {
          return await updateRegistration(request, env, registration);
        }

        if (request.method === 'DELETE') {
          if (registration.status !== 'cancelled') {
            try {
              await sendCancellationEmail(env, { id: registration.tournament_id, name: registration.name, owner_id: registration.owner_id }, registration, APP_ORIGIN);
            } catch (error) {
              console.error(`Failed to send deletion notice email for registration ${registration.id}`, error);
            }
            await notifyUserByEmail(env, registration.email, 'registration_status_changed', { tournamentName: registration.name, status: 'cancelled' }, undefined, registration.owner_id);
          }
          return await deleteRegistration(env.DB, registration.id);
        }
      }

      const registrationParticipationMatch = url.pathname.match(/^\/api\/registrations\/([^/]+)\/participation$/);
      if (registrationParticipationMatch && request.method === 'PUT') {
        const auth = await requireManagerAuth(request, env.DB);
        const registration = await getRegistrationWithTournament(env.DB, registrationParticipationMatch[1]);
        if (!registration) {
          throw new HttpError(404, 'Anmeldung nicht gefunden');
        }
        assertCanManageTournament(registration, auth.user);
        assertRegistrationOnlineEditable(registration);
        const body = await readJson(request);
        return await setRegistrationParticipation(env.DB, registration, parseParticipation(body.participation));
      }

      if (url.pathname === '/api/sync/tournaments' && request.method === 'GET') {
        const auth = await requireApiKey(request, env.DB);
        return await listManagedTournaments(env.DB, auth.user);
      }

      const syncConnectMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/connect$/);
      if (syncConnectMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getTournamentById(env.DB, syncConnectMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, auth.user);
        return await connectTournament(request, env.DB, tournament);
      }

      const syncTakeoverMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/takeover$/);
      if (syncTakeoverMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getTournamentById(env.DB, syncTakeoverMatch[1]);
        if (!tournament) throw new HttpError(404, 'Turnier nicht gefunden');
        assertCanManageTournament(tournament, auth.user);
        return await takeoverTournamentDocument(request, env.DB, tournament);
      }

      const syncDisconnectMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/disconnect$/);
      if (syncDisconnectMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getTournamentById(env.DB, syncDisconnectMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, auth.user);
        await requireSyncLease(request, tournament);
        return await disconnectTournament(env.DB, tournament.id);
      }

      const syncStartMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/start$/);
      if (syncStartMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getTournamentById(env.DB, syncStartMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, auth.user);
        await requireSyncLease(request, tournament);
        return await startTournamentFromSync(env, tournament, auth.user);
      }

      const syncRegistrationsMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/registrations$/);
      if (syncRegistrationsMatch) {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getTournamentById(env.DB, syncRegistrationsMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, auth.user);

        if (request.method === 'GET') {
          return await syncGetRegistrations(env.DB, tournament.id, url);
        }
        if (request.method === 'POST') {
          // Anmeldung ohne oeffentliche Maske: Turnierdokument erfasst lokal eine neue Meldung und
          // legt sie hier serverseitig an, damit sie bei PTM-Online 1:1 mitgefuehrt wird.
          await requireSyncLease(request, tournament);
          return await createRegistration(request, env, tournament, { session: { user: auth.user }, syncBootstrap: true });
        }
      }

      const syncRegistrationUpsertMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/registrations\/([^/]+)$/);
      if (syncRegistrationUpsertMatch && request.method === 'PUT') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getTournamentById(env.DB, syncRegistrationUpsertMatch[1]);
        if (!tournament) throw new HttpError(404, 'Turnier nicht gefunden');
        assertCanManageTournament(tournament, auth.user);
        await requireSyncLease(request, tournament);
        return await upsertDocumentRegistration(request, env, tournament, syncRegistrationUpsertMatch[2]);
      }


      const syncResultsMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/results$/);
      if (syncResultsMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getTournamentById(env.DB, syncResultsMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, auth.user);
        await requireSyncLease(request, tournament);
        return await syncPostResults(request, env, tournament.id);
      }

      const syncMetadataMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/metadata$/);
      if (syncMetadataMatch && request.method === 'PUT') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getTournamentById(env.DB, syncMetadataMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, auth.user);
        return await syncPutTournamentMetadata(request, env, tournament, auth.user);
      }

      return json({ error: 'Not found' }, 404);
      } catch (error) {
        if (error instanceof HttpError) {
          return json({ error: error.message, ...(error.details ? { details: error.details } : {}) }, error.status);
        }

        console.error(error);
        return json({ error: 'Internal server error' }, 500);
      }
    })();
    return withRefreshedSessionCookie(request, response, url);
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
        `INSERT INTO users (id, first_name, last_name, email, role, password_salt, password_hash, email_verified_at, password_change_required, tournament_limit, mail_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'user', ?, ?, ?, 0, ?, 0, ?, ?)`,
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
  // Automated submissions that populate the hidden website field receive the normal
  // success response, but no account or verification email is created.
  if (nullableText(body.website)) {
    return json({ message: 'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.' }, 201);
  }
  const user = normalizeUserInput({ ...body, role: 'user' }, { requirePassword: true });
  const language = normalizeLanguage(body.language);
  const password = await hashPassword(user.password);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  try {
    await db
      .prepare(
        `INSERT INTO users (id, first_name, last_name, email, role, password_salt, password_hash, email_verified_at, language, mail_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'user', ?, ?, NULL, ?, 0, ?, ?)`,
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
    language,
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
      'SELECT id, first_name, last_name, email, pending_email, role, email_verified_at, password_change_required, tournament_limit, mail_enabled, created_at, updated_at FROM users ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE',
    )
    .all();
  return json({ users: result.results.map(toPublicUser) });
}

async function listPostboxRecipients(db, userId) {
  const result = await db.prepare(
    "SELECT id, first_name, last_name, role FROM users WHERE id != ? AND id != ? AND role = 'user' ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE",
  ).bind(userId, TOURNAMENT_REPORT_SYSTEM_USER_ID).all();
  const tournaments = await db.prepare(
    'SELECT id, name FROM tournaments WHERE owner_id = ? AND registration_enabled = 1 ORDER BY name COLLATE NOCASE',
  ).bind(userId).all();
  return json({
    recipients: result.results.map((user) => ({ id: user.id, firstName: user.first_name, lastName: user.last_name, role: user.role })),
    tournaments: tournaments.results.map((tournament) => ({ id: tournament.id, name: tournament.name })),
  });
}

const PARTICIPANT_TOURNAMENTS_SUBQUERY = `SELECT DISTINCT reg.tournament_id FROM registrations reg
  JOIN users u2 ON lower(u2.email) = lower(reg.email)
  WHERE u2.id = ? AND reg.status IN ('pending', 'confirmed')`;

async function getPostbox(db, user) {
  const result = await db.prepare(
    `SELECT m.*, s.first_name AS sender_first_name, s.last_name AS sender_last_name, r.first_name AS recipient_first_name, r.last_name AS recipient_last_name, t.name AS broadcast_tournament_name
     FROM postbox_messages m
     LEFT JOIN users s ON s.id = m.sender_id
     LEFT JOIN users r ON r.id = m.recipient_id
     LEFT JOIN tournaments t ON t.id = m.broadcast_tournament_id
     WHERE m.recipient_id = ? OR m.sender_id = ?
        OR (m.broadcast_tournament_id IS NOT NULL AND m.broadcast_tournament_id IN (${PARTICIPANT_TOURNAMENTS_SUBQUERY}))
     ORDER BY m.created_at DESC LIMIT 25`,
  ).bind(user.id, user.id, user.id).all();
  const messages = result.results.map((row) => toPostboxMessage(row, user.id));
  const unread = await db.prepare(
    `SELECT COUNT(*) AS count FROM postbox_messages m
     WHERE m.read_at IS NULL AND (
       m.recipient_id = ?
       OR (m.broadcast_tournament_id IS NOT NULL AND m.broadcast_tournament_id IN (${PARTICIPANT_TOURNAMENTS_SUBQUERY}))
     )`,
  ).bind(user.id, user.id).first();
  return json({ messages, unreadCount: unreadPostboxCount(unread), todos: await listPostboxTodos(db, user) });
}

async function sendPostboxMessage(request, env, sender) {
  const body = await readJson(request);
  const recipientRaw = String(body.recipientId || '').trim();
  const text = String(body.body || '').trim();
  if (!recipientRaw) throw new HttpError(400, 'Bitte wähle einen Empfänger');
  if (!text || text.length > 250) throw new HttpError(400, 'Die Nachricht muss zwischen 1 und 250 Zeichen lang sein');

  if (recipientRaw.startsWith('tournament:')) {
    const tournamentId = recipientRaw.slice('tournament:'.length);
    const tournament = await env.DB.prepare('SELECT * FROM tournaments WHERE id = ?').bind(tournamentId).first();
    if (!tournament) throw new HttpError(404, 'Turnier nicht gefunden');
    if (tournament.owner_id !== sender.id) throw new HttpError(403, 'Nur der Organisator kann an alle Teilnehmer senden');
    if (isCalendarEntry(tournament)) throw new HttpError(409, 'Kalendereinträge haben keine Teilnehmer');
    const message = await createBroadcastPostboxMessage(env, { sender, tournament, body: text });
    return json({ message }, 201);
  }

  if (recipientRaw === sender.id) throw new HttpError(400, 'Bitte wähle einen anderen Empfänger');
  const recipient = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(recipientRaw).first();
  if (!recipient) throw new HttpError(404, 'Empfänger nicht gefunden');
  if (recipient.role !== 'user' || recipient.id === TOURNAMENT_REPORT_SYSTEM_USER_ID) {
    throw new HttpError(403, 'An diesen Empfänger kann keine Nachricht gesendet werden');
  }
  const message = await createPostboxMessage(env, { senderId: sender.id, recipientId: recipientRaw, kind: 'direct', body: text, pushTitle: 'Neue Nachricht', pushActor: `${sender.firstName} ${sender.lastName}` });
  return json({ message }, 201);
}

async function markPostboxMessageRead(db, id, userId) {
  const now = new Date().toISOString();
  const result = await db.prepare(
    `UPDATE postbox_messages SET read_at = COALESCE(read_at, ?) WHERE id = ? AND (
       recipient_id = ?
       OR (broadcast_tournament_id IS NOT NULL AND broadcast_tournament_id IN (${PARTICIPANT_TOURNAMENTS_SUBQUERY}))
     )`,
  ).bind(now, id, userId, userId).run();
  if (!result.meta.changes) throw new HttpError(404, 'Nachricht nicht gefunden');
  return json({ ok: true });
}

async function markAllPostboxMessagesRead(db, userId) {
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE postbox_messages SET read_at = COALESCE(read_at, ?) WHERE read_at IS NULL AND (
       recipient_id = ?
       OR (broadcast_tournament_id IS NOT NULL AND broadcast_tournament_id IN (${PARTICIPANT_TOURNAMENTS_SUBQUERY}))
     )`,
  ).bind(now, userId, userId).run();
  return json({ ok: true });
}

async function listPostboxTodos(db, user) {
  const todos = [];
  if (user.role === 'admin') {
    const unverified = await db.prepare('SELECT COUNT(*) AS count FROM users WHERE email_verified_at IS NULL').first();
    const keys = await db.prepare("SELECT COUNT(*) AS count FROM api_keys WHERE status = 'pending'").first();
    if (Number(unverified?.count)) todos.push({ type: 'unverified_users', count: Number(unverified.count) });
    if (Number(keys?.count)) todos.push({ type: 'api_key_requests', count: Number(keys.count) });
  }
  const pending = await db.prepare("SELECT COUNT(*) AS count FROM registrations r JOIN tournaments t ON t.id = r.tournament_id WHERE t.owner_id = ? AND r.status = 'pending'").bind(user.id).first();
  const waitlist = await db.prepare("SELECT COUNT(*) AS count FROM registrations r JOIN tournaments t ON t.id = r.tournament_id WHERE t.owner_id = ? AND r.status = 'waitlist'").bind(user.id).first();
  if (Number(pending?.count)) todos.push({ type: 'pending_registrations', count: Number(pending.count) });
  if (Number(waitlist?.count)) todos.push({ type: 'waitlist', count: Number(waitlist.count) });
  return todos;
}

async function createPostboxMessage(env, { senderId = null, recipientId, kind, body = null, eventType = null, eventData = null, pushTitle = 'Neue Nachricht', pushActor = '' }) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare('INSERT INTO postbox_messages (id, sender_id, recipient_id, kind, body, event_type, event_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, senderId, recipientId, kind, body, eventType, eventData ? JSON.stringify(eventData) : null, createdAt).run();
  await env.DB.prepare(
    `DELETE FROM postbox_messages WHERE recipient_id = ? AND id NOT IN (
       SELECT id FROM postbox_messages WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 25
     )`,
  ).bind(recipientId, recipientId).run();
  const row = await env.DB.prepare('SELECT * FROM postbox_messages WHERE id = ?').bind(id).first();
  const message = toPostboxMessage(row, recipientId);
  try {
    let pushBody = null;
    if (kind === 'system' && eventType) {
      const recipient = await env.DB.prepare('SELECT language FROM users WHERE id = ?').bind(recipientId).first();
      pushBody = buildSystemNotificationPushBody(eventType, eventData, recipient?.language || 'de');
    }
    await sendPushNotifications(env, recipientId, { title: pushTitle, actor: pushActor, body: pushBody, messageId: id });
  } catch (error) {
    console.error('Postbox push dispatch failed', error);
  }
  return message;
}

async function createBroadcastPostboxMessage(env, { sender, tournament, body }) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO postbox_messages (id, sender_id, recipient_id, kind, body, created_at, broadcast_tournament_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, sender.id, sender.id, 'direct', body, createdAt, tournament.id).run();
  await env.DB.prepare(
    `DELETE FROM postbox_messages WHERE recipient_id = ? AND id NOT IN (
       SELECT id FROM postbox_messages WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 25
     )`,
  ).bind(sender.id, sender.id).run();
  const row = await env.DB.prepare(
    `SELECT m.*, t.name AS broadcast_tournament_name FROM postbox_messages m LEFT JOIN tournaments t ON t.id = m.broadcast_tournament_id WHERE m.id = ?`,
  ).bind(id).first();
  const message = toPostboxMessage(row, sender.id);

  const registrations = await env.DB.prepare(
    "SELECT * FROM registrations WHERE tournament_id = ? AND status IN ('pending', 'confirmed')",
  ).bind(tournament.id).all();

  const uniqueRecipients = new Map();
  for (const registration of registrations.results || []) {
    for (const recipient of buildTeamRecipients(registration)) {
      const email = String(recipient.email || '').trim().toLowerCase();
      if (!email || email === sender.email.toLowerCase() || uniqueRecipients.has(email)) continue;
      uniqueRecipients.set(email, { email: recipient.email, firstName: recipient.firstName, language: registration.language });
    }
  }

  const accountUsers = await env.DB.prepare(
    `SELECT DISTINCT u.id FROM registrations reg JOIN users u ON lower(u.email) = lower(reg.email)
     WHERE reg.tournament_id = ? AND reg.status IN ('pending', 'confirmed') AND u.id != ?`,
  ).bind(tournament.id, sender.id).all();
  for (const accountUser of accountUsers.results || []) {
    await enqueuePushNotification(env, {
      userId: accountUser.id,
      payload: { title: 'Neue Nachricht', actor: `${sender.firstName} ${sender.lastName}`, messageId: id },
    });
  }

  const mailAllowed = await canSendTournamentMail(env.DB, tournament);
  for (const recipient of mailAllowed ? uniqueRecipients.values() : []) {
    const templates = TOURNAMENT_BROADCAST_EMAILS[recipient.language] || TOURNAMENT_BROADCAST_EMAILS.de;
    try {
      await enqueueTransactionalEmail(env, {
        to: recipient.email,
        subject: templates.subject(tournament.name),
        text: templates.text(recipient.firstName, tournament.name, `${sender.firstName} ${sender.lastName}`, body),
        language: recipient.language,
        logFallback: `Tournament broadcast email for ${recipient.email} (tournament ${tournament.id})`,
        failureContext: `tournament broadcast for tournament ${tournament.id}`,
        allowLogFallback: true,
      });
    } catch (error) {
      console.error('Postbox broadcast email dispatch failed', error);
    }
  }

  return message;
}

async function createSystemNotification(env, recipientId, eventType, eventData, pushTitle = 'Neue Statusmeldung') {
  if (!recipientId) return;
  await createPostboxMessage(env, { recipientId, kind: 'system', eventType, eventData, pushTitle });
}

async function notifyUserByEmail(env, email, eventType, eventData, pushTitle, excludeUserId = null) {
  if (!email) return;
  const user = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').bind(email).first();
  if (user && user.id !== excludeUserId) await createSystemNotification(env, user.id, eventType, eventData, pushTitle);
}

async function savePushSubscription(request, db, userId) {
  const subscription = await readJson(request);
  const endpoint = String(subscription.endpoint || '');
  const p256dh = String(subscription.keys?.p256dh || '');
  const auth = String(subscription.keys?.auth || '');
  if (!isAllowedPushEndpoint(endpoint) || !p256dh || !auth) throw new HttpError(400, 'Ungültiges Push-Abonnement');
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, expiration_time, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, expiration_time = excluded.expiration_time, updated_at = excluded.updated_at`)
    .bind(endpoint, userId, p256dh, auth, subscription.expirationTime || null, now, now).run();
  return json({ ok: true }, 201);
}

async function removePushSubscription(request, db, userId) {
  const body = await readJson(request);
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(String(body.endpoint || ''), userId).run();
  return json({ ok: true });
}

const SAVED_SEARCH_LIMIT = 3;

function toPublicSavedSearch(row) {
  return {
    id: row.id,
    name: row.name,
    query: row.query || '',
    onlyMine: Boolean(Number(row.only_mine)),
    filterMonth: row.filter_month || '',
    filterFormation: row.filter_formation || '',
    filterRegistrationType: row.filter_registration_type || '',
    filterType: row.filter_type || '',
    filterOpenOnly: Boolean(Number(row.filter_open_only)),
    filterOnlineRegistrationOnly: Boolean(Number(row.filter_online_registration_only)),
    searchOrigin: row.origin_lat === null || row.origin_lat === undefined
      ? null
      : { lat: Number(row.origin_lat), lng: Number(row.origin_lng), label: row.origin_label || '' },
    radiusKm: row.radius_km || '',
    notifyEnabled: Boolean(Number(row.notify_enabled)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSavedSearchInput(body) {
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'Bitte gib der gespeicherten Suche einen Namen.');
  if (name.length > 80) throw new HttpError(400, 'Der Name darf höchstens 80 Zeichen lang sein.');
  const originInput = body.searchOrigin;
  const origin = originInput && Number.isFinite(Number(originInput.lat)) && Number.isFinite(Number(originInput.lng))
    ? { lat: Number(originInput.lat), lng: Number(originInput.lng), label: String(originInput.label || '') }
    : null;
  return {
    name,
    query: String(body.query || '').trim().slice(0, 200),
    onlyMine: Boolean(body.onlyMine),
    filterMonth: String(body.filterMonth || ''),
    filterFormation: String(body.filterFormation || ''),
    filterRegistrationType: String(body.filterRegistrationType || ''),
    filterType: String(body.filterType || ''),
    filterOpenOnly: Boolean(body.filterOpenOnly),
    filterOnlineRegistrationOnly: Boolean(body.filterOnlineRegistrationOnly),
    origin,
    radiusKm: origin ? String(body.radiusKm || '25') : null,
    notifyEnabled: Boolean(body.notifyEnabled),
  };
}

async function listSavedSearches(db, userId) {
  const result = await db.prepare('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
  return json({ savedSearches: (result.results || []).map(toPublicSavedSearch) });
}

async function createSavedSearch(request, db, userId) {
  const body = await readJson(request);
  const input = normalizeSavedSearchInput(body);

  const { count } = await db.prepare('SELECT COUNT(*) AS count FROM saved_searches WHERE user_id = ?').bind(userId).first();
  if (count >= SAVED_SEARCH_LIMIT) {
    throw new HttpError(403, 'Maximal 3 gespeicherte Suchen erlaubt.');
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO saved_searches (
      id, user_id, name, query, only_mine, filter_month, filter_formation, filter_registration_type, filter_type, filter_open_only, filter_online_registration_only,
      origin_lat, origin_lng, origin_label, radius_km, notify_enabled, last_checked_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).bind(
    id, userId, input.name, input.query, input.onlyMine ? 1 : 0, input.filterMonth, input.filterFormation,
    input.filterRegistrationType, input.filterType, input.filterOpenOnly ? 1 : 0, input.filterOnlineRegistrationOnly ? 1 : 0,
    input.origin?.lat ?? null, input.origin?.lng ?? null, input.origin?.label ?? null, input.radiusKm,
    input.notifyEnabled ? 1 : 0, now, now,
  ).run();

  const row = await db.prepare('SELECT * FROM saved_searches WHERE id = ?').bind(id).first();
  return json({ savedSearch: toPublicSavedSearch(row) }, 201);
}

async function updateSavedSearch(request, db, id, userId) {
  const existing = await db.prepare('SELECT id, notify_enabled FROM saved_searches WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!existing) throw new HttpError(404, 'Gespeicherte Suche nicht gefunden.');
  const body = await readJson(request);
  const input = normalizeSavedSearchInput(body);
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE saved_searches SET name = ?, query = ?, only_mine = ?, filter_month = ?, filter_formation = ?, filter_registration_type = ?,
     filter_type = ?, filter_open_only = ?, filter_online_registration_only = ?, origin_lat = ?, origin_lng = ?, origin_label = ?, radius_km = ?, notify_enabled = ?,
     last_checked_at = CASE WHEN ? = 1 AND ? = 0 THEN NULL ELSE last_checked_at END, updated_at = ?
     WHERE id = ?`,
  ).bind(
    input.name, input.query, input.onlyMine ? 1 : 0, input.filterMonth, input.filterFormation, input.filterRegistrationType,
    input.filterType, input.filterOpenOnly ? 1 : 0, input.filterOnlineRegistrationOnly ? 1 : 0, input.origin?.lat ?? null, input.origin?.lng ?? null, input.origin?.label ?? null,
    input.radiusKm, input.notifyEnabled ? 1 : 0, input.notifyEnabled ? 1 : 0, Number(existing.notify_enabled), now, id,
  ).run();
  const row = await db.prepare('SELECT * FROM saved_searches WHERE id = ?').bind(id).first();
  return json({ savedSearch: toPublicSavedSearch(row) });
}

async function deleteSavedSearch(db, id, userId) {
  const result = await db.prepare('DELETE FROM saved_searches WHERE id = ? AND user_id = ?').bind(id, userId).run();
  if (!result.meta.changes) throw new HttpError(404, 'Gespeicherte Suche nicht gefunden.');
  return json({ ok: true });
}

const D1_BATCH_SIZE = 100;

function batches(values, size = D1_BATCH_SIZE) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

// Ein Suchauftrag speichert keine Treffer. Deshalb reicht es, genau beim Übergang
// zu einem öffentlich sichtbaren Turnier abzugleichen; Entwürfe, private und
// gelöschte Turniere sind automatisch nicht mehr Bestandteil der Live-Suche.
async function notifySavedSearchesForPublishedTournament(env, tournament, searches = null) {
  const activeSearches = searches || (await env.DB.prepare('SELECT * FROM saved_searches WHERE notify_enabled = 1').all()).results || [];
  let tournamentForMatching = tournament;
  if (activeSearches.some((search) => Number(search.filter_online_registration_only))) {
    const activeRegistrations = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM registrations WHERE tournament_id = ? AND status IN ('pending', 'confirmed')",
    ).bind(tournament.id).first();
    tournamentForMatching = { ...tournament, active_registrations: Number(activeRegistrations?.count || 0) };
  }
  const matches = activeSearches.filter((search) => tournamentMatchesSavedSearch(tournamentForMatching, search));
  if (matches.length === 0) return 0;

  const createdAt = new Date().toISOString();
  const notifications = matches.map((search) => ({
    id: crypto.randomUUID(),
    recipientId: search.user_id,
    eventData: { savedSearchName: search.name, count: 1, tournamentNames: [tournament.name], tournamentId: tournament.id },
  }));

  for (const batch of batches(notifications)) {
    await env.DB.batch(batch.map((notification) => env.DB.prepare(
      'INSERT INTO postbox_messages (id, sender_id, recipient_id, kind, body, event_type, event_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(notification.id, null, notification.recipientId, 'system', null, 'saved_search_new_matches', JSON.stringify(notification.eventData), createdAt)));
  }

  const recipientIds = [...new Set(notifications.map((notification) => notification.recipientId))];
  for (const batch of batches(recipientIds)) {
    await env.DB.batch(batch.map((recipientId) => env.DB.prepare(
      `DELETE FROM postbox_messages WHERE recipient_id = ? AND id NOT IN (
         SELECT id FROM postbox_messages WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 25
       )`,
    ).bind(recipientId, recipientId)));
  }

  const languages = new Map();
  for (const batch of batches(recipientIds)) {
    const users = await env.DB.prepare(`SELECT id, language FROM users WHERE id IN (${batch.map(() => '?').join(', ')})`).bind(...batch).all();
    for (const user of users.results || []) languages.set(user.id, user.language || 'de');
  }
  for (const batch of batches(notifications)) {
    await env.MAIL_QUEUE.sendBatch(batch.map((notification) => ({
      body: {
        kind: 'push',
        userId: notification.recipientId,
        payload: {
          title: 'Neue Turniere gefunden',
          body: buildSystemNotificationPushBody('saved_search_new_matches', notification.eventData, languages.get(notification.recipientId) || 'de'),
          messageId: notification.id,
        },
      },
    })));
  }
  return notifications.length;
}

async function sendPushNotifications(env, userId, payload) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return;
  const subscriptions = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').bind(userId).all();
  const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  await Promise.all((subscriptions.results || []).map(async (subscription) => {
    try {
      const pushPayload = await buildPushPayload(
        { data: payload },
        { endpoint: subscription.endpoint, expirationTime: null, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        vapid,
      );
      const response = await fetch(subscription.endpoint, pushPayload);
      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(subscription.endpoint).run();
      } else if (!response.ok) {
        console.error('Postbox push failed', response.status, await response.text());
      }
    } catch (error) {
      console.error('Postbox push failed', error);
    }
  }));
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
  const mailEnabled = body.mailEnabled === true ? 1 : 0;

  try {
    await db
      .prepare(
        `INSERT INTO users (id, first_name, last_name, email, role, password_salt, password_hash, email_verified_at, password_change_required, tournament_limit, mail_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, user.firstName, user.lastName, user.email, user.role, password.salt, password.hash, emailVerifiedAt, passwordChangeRequired, tournamentLimit, mailEnabled, now, now)
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
        mail_enabled: mailEnabled,
        created_at: now,
        updated_at: now,
      }),
    },
    201,
  );
}

async function updateUser(request, env, id, currentUserId) {
  if (id === TOURNAMENT_REPORT_SYSTEM_USER_ID) {
    throw new HttpError(403, 'Zugriff verweigert');
  }
  const db = env.DB;
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
  const mailEnabled = body.mailEnabled === undefined ? Number(existing.mail_enabled) : (body.mailEnabled ? 1 : 0);

  if (id === currentUserId && user.role !== 'admin') {
    throw new HttpError(400, 'Du kannst deine eigene Admin-Rolle nicht entfernen');
  }

  try {
    if (user.password) {
      const password = await hashPassword(user.password);
      await db
        .prepare(
          `UPDATE users
           SET first_name = ?, last_name = ?, email = ?, pending_email = NULL, role = ?, password_salt = ?, password_hash = ?, email_verified_at = ?, password_change_required = ?, tournament_limit = ?, mail_enabled = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(user.firstName, user.lastName, user.email, user.role, password.salt, password.hash, emailVerifiedAt, passwordChangeRequired, tournamentLimit, mailEnabled, now, id)
        .run();
    } else {
      await db
        .prepare(
          'UPDATE users SET first_name = ?, last_name = ?, email = ?, pending_email = NULL, role = ?, email_verified_at = ?, password_change_required = ?, tournament_limit = ?, mail_enabled = ?, updated_at = ? WHERE id = ?',
        )
        .bind(user.firstName, user.lastName, user.email, user.role, emailVerifiedAt, passwordChangeRequired, tournamentLimit, mailEnabled, now, id)
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
      'SELECT id, first_name, last_name, email, pending_email, role, email_verified_at, password_change_required, tournament_limit, mail_enabled, created_at, updated_at FROM users WHERE id = ?',
    )
    .bind(id)
    .first();
  if (updated.role !== existing.role || updated.email_verified_at !== existing.email_verified_at || Number(updated.password_change_required) !== Number(existing.password_change_required)) {
    await createSystemNotification(env, id, 'account_status_changed', { role: updated.role, emailVerified: Boolean(updated.email_verified_at), passwordChangeRequired: Boolean(Number(updated.password_change_required)) });
  }
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
      // The session is still valid; this is form validation, not a session failure.
      throw new HttpError(400, 'Aktuelles Passwort ist erforderlich oder falsch');
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
  if (id === TOURNAMENT_REPORT_SYSTEM_USER_ID) {
    throw new HttpError(403, 'Zugriff verweigert');
  }
  if (id === currentUserId) {
    throw new HttpError(400, 'Du kannst deinen eigenen Benutzer nicht löschen');
  }

  const now = new Date().toISOString();

  if (deleteTournaments) {
    // Nur selbst besessene Turniere löschen - Turniere, bei denen dieser User
    // lediglich als Editor eingetragen war, gehören anderen Ownern und dürfen
    // nicht mitgerissen werden. Der zugehörige tournament_editors-Eintrag entfällt
    // ohnehin automatisch über ON DELETE CASCADE auf user_id.
    await db.batch([
      db
        .prepare('DELETE FROM registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE owner_id = ?)')
        .bind(id),
      db.prepare('DELETE FROM tournaments WHERE owner_id = ?').bind(id),
    ]);
  } else {
    // Reassign to the admin performing the deletion instead of leaving owner_id
    // pointing at a user row that no longer exists (owner_id ist NOT NULL mit
    // FK ON DELETE CASCADE - ohne Reassignment würde das Turnier sonst kaskadierend
    // mitgelöscht). creator_id (rein informativ) bleibt bewusst unangetastet.
    // Editor-Zuweisungen dieses Users entfallen automatisch über ON DELETE CASCADE.
    await db.prepare('UPDATE tournaments SET owner_id = ?, updated_at = ? WHERE owner_id = ?').bind(currentUserId, now, id).run();
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
      `SELECT tournaments.*,
        ${TOURNAMENT_EDITORS_JSON_SUBQUERY},
        ${TOURNAMENT_VENUE_CLUB_LOGO_SUBQUERY},
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
       WHERE (?1 IS NOT NULL AND ?1 = 'admin')
          OR (?2 IS NOT NULL AND (tournaments.owner_id = ?2 OR EXISTS (
               SELECT 1 FROM tournament_editors WHERE tournament_editors.tournament_id = tournaments.id AND tournament_editors.user_id = ?2
             )))
          OR (tournaments.visibility = 'public' AND tournaments.status != 'draft')
       ORDER BY tournaments.date ASC, tournaments.start_time ASC, tournaments.name COLLATE NOCASE`,
    )
    .bind(user?.role || null, user?.id || null)
    .all();

  return json({ tournaments: rows.results.map((row) => toPublicTournament(row, user)) });
}

/**
 * Wie listTournaments(), aber ohne den oeffentlichen Fallback-Zweig: liefert
 * ausschliesslich Turniere, die der uebergebene Nutzer (Owner oder Editor,
 * bzw. Admin alle) verwalten darf. Fuer den PTM-Plugin-Picker (API-Key-Auth) -
 * dort sollen keine fremden oeffentlichen Turniere anderer Nutzer erscheinen.
 */
async function listManagedTournaments(db, user) {
  const rows = await db
    .prepare(
      `SELECT tournaments.*,
        ${TOURNAMENT_EDITORS_JSON_SUBQUERY},
        ${TOURNAMENT_VENUE_CLUB_LOGO_SUBQUERY},
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
       WHERE (?1 = 'admin')
          OR (tournaments.owner_id = ?2 OR EXISTS (
               SELECT 1 FROM tournament_editors WHERE tournament_editors.tournament_id = tournaments.id AND tournament_editors.user_id = ?2
             ))
       ORDER BY tournaments.date ASC, tournaments.start_time ASC, tournaments.name COLLATE NOCASE`,
    )
    .bind(user.role, user.id)
    .all();

  return json({ tournaments: rows.results.map((row) => toPublicTournament(row, user)) });
}

/**
 * Markiert ein Turnier als von einem Dokument verwaltet (document_managed = 1),
 * ohne sonstige Metadaten zu ueberschreiben. Wird beim Verbinden eines
 * Turnierdokuments mit einem bestehenden Online-Turnier aufgerufen.
 */
async function connectTournament(request, db, tournament) {
  const body = await readJson(request);
  const syncDocumentId = requireUuid(body.syncDocumentId, 'syncDocumentId');
  const leaseToken = requireSecret(body.leaseToken, 'leaseToken');
  const leaseTokenHash = await sha256Hex(leaseToken);
  if (tournament.sync_document_id && tournament.sync_document_id !== syncDocumentId) {
    throw new HttpError(409, 'Dieses Turnier ist bereits mit einem anderen Turnierdokument verbunden', {
      code: 'document_bound', bindingRevision: Number(tournament.sync_binding_revision || 0),
    });
  }
  if (tournament.sync_document_id === syncDocumentId
      && !(await constantTimeEquals(leaseTokenHash, tournament.sync_lease_token_hash || ''))) {
    throw new HttpError(409, 'Das lokale Dokument besitzt kein gültiges Schreib-Lease', { code: 'lease_invalid' });
  }
  const now = new Date().toISOString();
  const bindingRevision = tournament.sync_document_id ? Number(tournament.sync_binding_revision || 0) : 1;
  await db.prepare(`UPDATE tournaments
                    SET document_managed = 1, sync_document_id = ?, sync_lease_token_hash = ?,
                        sync_binding_revision = ?, updated_at = ? WHERE id = ?`)
    .bind(syncDocumentId, leaseTokenHash, bindingRevision, now, tournament.id).run();
  return json({ ok: true, syncDocumentId, bindingRevision });
}

function requireUuid(value, field) {
  const normalized = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new HttpError(400, `${field} muss eine UUID sein`);
  }
  return normalized.toLowerCase();
}

function requireSecret(value, field) {
  const normalized = text(value);
  if (normalized.length < 32 || normalized.length > 512) throw new HttpError(400, `${field} ist ungültig`);
  return normalized;
}

async function requireSyncLease(request, tournament) {
  const syncDocumentId = request.headers.get('X-PTM-Sync-Document') || '';
  const leaseToken = request.headers.get('X-PTM-Sync-Lease') || '';
  if (!tournament.sync_document_id || !tournament.sync_lease_token_hash) {
    throw new HttpError(409, 'Dieses Turnier besitzt noch keine Dokumentbindung', { code: 'document_unbound' });
  }
  if (syncDocumentId !== tournament.sync_document_id) {
    throw new HttpError(409, 'Dieses Dokument wurde durch ein anderes Dokument abgelöst', { code: 'document_replaced' });
  }
  const leaseHash = await sha256Hex(leaseToken);
  if (!(await constantTimeEquals(leaseHash, tournament.sync_lease_token_hash))) {
    throw new HttpError(409, 'Das Schreib-Lease dieses Dokuments ist nicht mehr gültig', { code: 'lease_invalid' });
  }
}

async function takeoverTournamentDocument(request, db, tournament) {
  const body = await readJson(request);
  const syncDocumentId = requireUuid(body.syncDocumentId, 'syncDocumentId');
  const leaseToken = requireSecret(body.leaseToken, 'leaseToken');
  const takeoverRequestId = requireUuid(body.takeoverRequestId, 'takeoverRequestId');
  const expectedRevision = Number(body.expectedBindingRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new HttpError(400, 'expectedBindingRevision ist ungültig');
  if (tournament.sync_takeover_request_id === takeoverRequestId && tournament.sync_document_id === syncDocumentId) {
    return json({ ok: true, syncDocumentId, bindingRevision: Number(tournament.sync_binding_revision) });
  }
  const nextRevision = expectedRevision + 1;
  const result = await db.prepare(`UPDATE tournaments
      SET document_managed = 1, sync_document_id = ?, sync_lease_token_hash = ?,
          sync_binding_revision = ?, sync_takeover_request_id = ?, updated_at = ?
      WHERE id = ? AND sync_binding_revision = ?`)
    .bind(syncDocumentId, await sha256Hex(leaseToken), nextRevision, takeoverRequestId,
      new Date().toISOString(), tournament.id, expectedRevision).run();
  if (!result.meta.changes) {
    const current = await getTournamentById(db, tournament.id);
    if (current.sync_takeover_request_id === takeoverRequestId && current.sync_document_id === syncDocumentId) {
      return json({ ok: true, syncDocumentId, bindingRevision: Number(current.sync_binding_revision) });
    }
    throw new HttpError(409, 'Die Dokumentbindung wurde zwischenzeitlich geändert', {
      code: 'binding_conflict', bindingRevision: Number(current.sync_binding_revision || 0),
    });
  }
  return json({ ok: true, syncDocumentId, bindingRevision: nextRevision });
}

async function upsertDocumentRegistration(request, env, tournament, localRegistrationUuid) {
  const body = await readJson(request);
  const localUuid = requireUuid(localRegistrationUuid, 'localRegistrationUuid');
  const existing = await env.DB.prepare('SELECT * FROM registrations WHERE tournament_id = ? AND local_registration_uuid = ?')
    .bind(tournament.id, localUuid).first();
  if (!existing) {
    // Bootstrap is the only path on which the document may seed registration-owned fields.
    body.confirmImmediately = true;
    body.noEmail = true;
    const response = await createRegistration(new Request(request.url, {
      method: 'POST', headers: request.headers, body: JSON.stringify(body),
    }), env, tournament, { session: { user: { id: tournament.owner_id, role: 'user' } }, syncBootstrap: true });
    const payload = await response.clone().json();
    await env.DB.prepare('UPDATE registrations SET local_registration_uuid = ? WHERE id = ?')
      .bind(localUuid, payload.registration.id).run();
    return json({ registration: { ...payload.registration, localRegistrationUuid: localUuid }, created: true }, 201);
  }
  const expected = Number(body.expectedExecutionRevision);
  if (!Number.isInteger(expected) || expected !== Number(existing.execution_revision || 1)) {
    throw new HttpError(409, 'Die Ausführungsdaten wurden zwischenzeitlich geändert', {
      code: 'execution_conflict', registration: toPublicRegistration(existing),
    });
  }
  const status = body.status === undefined ? existing.status : String(body.status);
  if (!REGISTRATION_STATUSES.includes(status)) throw new HttpError(400, 'Ungültiger Status');
  const participation = body.participation === undefined ? existing.participation : parseParticipation(body.participation);
  const seedingPosition = body.seedingPosition === undefined ? existing.seeding_position : body.seedingPosition;
  await env.DB.prepare(`UPDATE registrations SET status = ?, participation = ?, seeding_position = ?,
      execution_revision = execution_revision + 1, updated_at = ? WHERE id = ?`)
    .bind(status, participation, seedingPosition, new Date().toISOString(), existing.id).run();
  return json({ registration: toPublicRegistration(await env.DB.prepare('SELECT * FROM registrations WHERE id = ?').bind(existing.id).first()), created: false });
}

/**
 * Loest die Dokument-Verwaltung eines Turniers wieder (document_managed = 0), Gegenstueck zu
 * connectTournament. Hebt damit auch die in updateTournament() geprueften document_managed-Sperren
 * fuer Web-UI-Edits wieder auf.
 */
async function disconnectTournament(db, tournamentId) {
  await db
    .prepare(`UPDATE tournaments SET document_managed = 0, sync_document_id = NULL, sync_lease_token_hash = NULL,
              sync_takeover_request_id = NULL, updated_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), tournamentId)
    .run();
  return json({ ok: true });
}

async function resolveTournamentGeolocation(tournament, existing, now, countryCode) {
  if (tournament.latitude !== null && tournament.longitude !== null) {
    return { latitude: tournament.latitude, longitude: tournament.longitude, geocodedAt: null };
  }
  if (existing && existing.location === tournament.location && existing.latitude !== null && existing.latitude !== undefined) {
    return { latitude: existing.latitude, longitude: existing.longitude, geocodedAt: existing.geocoded_at };
  }

  const [result] = await geocodeLocation(tournament.location, { countryCode, limit: 1 });
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

async function resolveTournamentBoulePlace(db, placeId) {
  const id = nullableText(placeId);
  if (!id) return null;
  const place = await db.prepare("SELECT p.id, p.address, p.latitude, p.longitude, c.logo_url AS club_logo_url FROM boule_places p LEFT JOIN clubs c ON c.id = p.club_id WHERE p.id = ? AND p.status = 'published' AND (p.club_id IS NULL OR c.status = 'published')").bind(id).first();
  if (!place) throw new HttpError(400, 'Bouleplatz nicht gefunden');
  return place;
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

async function createTournament(request, env, user) {
  const db = env.DB;
  let body = await readJson(request);
  const selectedPlace = await resolveTournamentBoulePlace(db, body.boulePlaceId);
  if (selectedPlace) body = { ...body, location: selectedPlace.address, latitude: selectedPlace.latitude, longitude: selectedPlace.longitude };
  const tournament = normalizeCoreTournamentInput(body);

  if (user.role !== 'admin' && tournament.registrationEnabled !== false) {
    const limit = user.tournamentLimit ?? DEFAULT_TOURNAMENT_LIMIT;
    const { count } = await db.prepare('SELECT COUNT(*) AS count FROM tournaments WHERE owner_id = ? AND registration_enabled = 1').bind(user.id).first();
    if (count >= limit) {
      throw new HttpError(403, 'Turnier-Limit erreicht. Bitte bei einem Admin um mehr Turniere bitten.');
    }
  }

  const presentation = {
    websiteUrl: normalizePresentationUrl(body.websiteUrl, 'websiteUrl'),
    logoUrl: normalizePresentationUrl(body.logoUrl, 'logoUrl'),
    flyerUrl: normalizePresentationUrl(body.flyerUrl, 'flyerUrl'),
  };
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const geo = await resolveTournamentGeolocation(tournament, null, now, request.headers.get('CF-IPCountry'));
  const timezone = resolveTournamentTimezone(geo);
  const registrationTimes = resolveRegistrationTimes(tournament, timezone);

  await db
    .prepare(
      `INSERT INTO tournaments (
        id, owner_id, creator_id, name, date, start_time, location, description, type, formation, formation_other, registration_type, status,
        max_registrations, registration_deadline, registration_opens_at, entry_fee_cents, currency, schweizer_ranking_mode, formule_x_rounds, ko_platz3, contact_name, contact_email, contact_phone,
        visibility, internal_notes, participants_public, license_required, team_name_enabled, waitlist_enabled, registration_enabled, approval_required, website_url, logo_url, flyer_url,
        latitude, longitude, geocoded_at, timezone, boule_place_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      user.id,
      user.id,
      tournament.name,
      tournament.date,
      tournament.startTime,
      tournament.location,
      tournament.description,
      tournament.type,
      tournament.formation,
      tournament.formationOther ? 1 : 0,
      tournament.registrationType,
      tournament.status,
      tournament.maxRegistrations,
      registrationTimes.registrationDeadline,
      registrationTimes.registrationOpensAt,
      tournament.entryFeeCents,
      tournament.currency,
      tournament.schweizerRankingMode,
      tournament.formuleXRounds,
      tournament.koPlatz3 ? 1 : 0,
      tournament.contactName,
      tournament.contactEmail,
      tournament.contactPhone,
      tournament.visibility,
      tournament.internalNotes,
      tournament.participantsPublic ? 1 : 0,
      tournament.licenseRequired ? 1 : 0,
      tournament.teamNameEnabled ? 1 : 0,
      tournament.waitlistEnabled ? 1 : 0,
      tournament.registrationEnabled ? 1 : 0,
      tournament.approvalRequired ? 1 : 0,
      presentation.websiteUrl,
      presentation.logoUrl,
      presentation.flyerUrl,
      geo.latitude,
      geo.longitude,
      geo.geocodedAt,
      timezone,
      selectedPlace?.id || null,
      now,
      now,
    )
    .run();

  await db.prepare('UPDATE tournaments SET fee_tiers = ? WHERE id = ?').bind(JSON.stringify(tournament.feeTiers), id).run();
  await db.prepare('UPDATE tournaments SET registration_questions = ? WHERE id = ?').bind(JSON.stringify(tournament.registrationQuestions), id).run();

  const created = await getTournamentById(db, id);
  if (isPubliclyVisible(created)) {
    await notifySavedSearchesForPublishedTournament(env, created);
  }
  return json({ tournament: toPublicTournament(created, user) }, 201);
}

// Kopiert Eckdaten und Bearbeitungsrechte eines Turniers in ein neues Turnier im Status
// "Entwurf" - bewusst ohne Anmeldungen, damit die Kopie unabhängig vom Original startet.
async function duplicateTournament(db, existing, actingUser) {
  const baseName = existing.name.replace(/ Kopie #\d+$/, '');
  const siblings = await db.prepare('SELECT name FROM tournaments WHERE owner_id = ?').bind(existing.owner_id).all();
  const copyPattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} Kopie #(\\d+)$`);
  let nextNumber = 1;
  for (const row of siblings.results || []) {
    const match = row.name.match(copyPattern);
    if (match) nextNumber = Math.max(nextNumber, Number(match[1]) + 1);
  }
  const name = `${baseName} Kopie #${nextNumber}`;

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO tournaments (
        id, owner_id, creator_id, name, club, date, start_time, location, description, type, formation, formation_other, registration_type, status,
        max_registrations, registration_deadline, registration_opens_at, entry_fee_cents, currency, schweizer_ranking_mode, formule_x_rounds, ko_platz3, contact_name, contact_email, contact_phone,
        visibility, internal_notes, participants_public, license_required, team_name_enabled, waitlist_enabled, registration_enabled, approval_required, website_url, logo_url, flyer_url,
        latitude, longitude, geocoded_at, timezone, boule_place_id, fee_tiers, registration_questions, created_at, updated_at
      )
      SELECT ?, owner_id, ?, ?, club, date, start_time, location, description, type, formation, formation_other, registration_type, 'draft',
        max_registrations, registration_deadline, registration_opens_at, entry_fee_cents, currency, schweizer_ranking_mode, formule_x_rounds, ko_platz3, contact_name, contact_email, contact_phone,
        visibility, internal_notes, participants_public, license_required, team_name_enabled, waitlist_enabled, registration_enabled, approval_required, website_url, logo_url, flyer_url,
        latitude, longitude, geocoded_at, timezone, boule_place_id, fee_tiers, registration_questions, ?, ?
      FROM tournaments WHERE id = ?`,
    )
    .bind(id, actingUser.id, name, now, now, existing.id)
    .run();

  for (const editorId of tournamentEditorIds(existing)) {
    await db
      .prepare('INSERT INTO tournament_editors (id, tournament_id, user_id, granted_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), id, editorId, actingUser.id, now)
      .run();
  }

  return await getTournamentById(db, id);
}

async function fetchPetanqueAktuellCalendar() {
  const pending = [petanqueAktuellCalendarUrl()];
  const fetched = new Set();
  const entries = new Map();
  while (pending.length > 0) {
    if (fetched.size >= PETANQUE_AKTUELL_MAX_PAGES) throw new HttpError(502, 'Pétanque-Aktuell-Kalender lieferte zu viele Seiten.');
    const pageUrl = pending.shift();
    if (fetched.has(pageUrl)) continue;
    fetched.add(pageUrl);
    let response;
    try {
      response = await fetch(pageUrl, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      console.error('Pétanque Aktuell calendar request failed', error);
      throw new HttpError(502, 'Pétanque-Aktuell-Kalender ist derzeit nicht erreichbar.');
    }
    if (!response.ok) throw new HttpError(502, 'Pétanque-Aktuell-Kalender ist derzeit nicht erreichbar.');
    const html = new TextDecoder('iso-8859-1').decode(await response.arrayBuffer());
    const pageEntries = parsePetanqueAktuellCalendar(html);
    if (pageEntries.length === 0) {
      if (fetched.size === 1) throw new HttpError(502, 'Pétanque-Aktuell-Kalender lieferte unvollständige Daten.');
      continue;
    }
    for (const entry of pageEntries) entries.set(entry.externalKey, entry);
    for (const url of petanqueAktuellPageUrls(html)) if (!fetched.has(url)) pending.push(url);
  }
  return [...entries.values()];
}

// Turnier-Detailseite scrapen, um PLZ/Straße+Nr. und Icon zu ermitteln, falls der Veranstalter sie
// gepflegt hat - die Kalender-Liste liefert nur den bloßen Ortsnamen. Nur beim expliziten
// Import ausgeführt, nicht beim täglichen Sync (undokumentierte HTML-Struktur, soll den
// Cron-Lauf nicht verlangsamen oder anfällig für Änderungen an der Fremdseite machen).
async function fetchPetanqueAktuellDetails(id) {
  if (!id) return null;
  try {
    const url = new URL(petanqueAktuellCalendarUrl());
    url.searchParams.set('kal_Aktion', 'detail');
    url.searchParams.set('kal_Nummer', String(id));
    const response = await fetch(url.href, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const html = new TextDecoder('iso-8859-1').decode(await response.arrayBuffer());
    return { location: parsePetanqueAktuellDetailAddress(html), logoUrl: parsePetanqueAktuellDetailLogoUrl(html) };
  } catch (error) {
    console.error(`Pétanque Aktuell tournament detail scrape failed for id ${id}`, error);
    return null;
  }
}

async function listPetanqueAktuellCandidates(db) {
  const [entries, imports] = await Promise.all([
    fetchPetanqueAktuellCalendar(),
    db.prepare('SELECT external_key FROM petanque_aktuell_imports').all(),
  ]);
  const importedKeys = new Set(imports.results.map((row) => row.external_key));
  return entries.filter((entry) => isFuturePetanqueAktuellTournament(entry)).map((entry) => ({
    ...mapPetanqueAktuellTournament(entry), sourceFormation: entry.formation, association: entry.association, licenseRequired: entry.licenseRequired, imported: importedKeys.has(entry.externalKey),
  })).filter((entry) => entry.name.length >= 2 && entry.location.length >= 2)
    .sort((left, right) => left.date.localeCompare(right.date) || (left.startTime || '').localeCompare(right.startTime || '') || left.name.localeCompare(right.name));
}

async function upsertPetanqueAktuellTournament(env, entry, ownerId, now, searches, { scrapeDetails = false, countryCode = null } = {}) {
  const db = env.DB;
  const mapped = mapPetanqueAktuellTournament(entry);
  if (scrapeDetails) {
    const details = await fetchPetanqueAktuellDetails(entry.id);
    if (details?.location) mapped.location = details.location;
    mapped.logoUrl = details?.logoUrl || null;
  }
  // resolveTournamentGeolocation() erwartet latitude/longitude explizit als null (nicht
  // undefined), um "bereits geokodiert" von "noch nie geokodiert" zu unterscheiden.
  mapped.latitude = null;
  mapped.longitude = null;
  if (mapped.name.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(mapped.date) || mapped.location.length < 2) throw new HttpError(400, 'Der ausgewählte Pétanque-Aktuell-Termin ist unvollständig.');
  const existing = await db.prepare('SELECT tournament_id FROM petanque_aktuell_imports WHERE external_key = ?').bind(mapped.externalKey).first();
  if (existing) {
    const previous = await getTournamentById(db, existing.tournament_id);
    if (!scrapeDetails) mapped.location = preservedPetanqueAktuellLocation(mapped.location, previous.location);
    const geo = await resolveTournamentGeolocation(mapped, previous, now, countryCode);
    const timezone = resolveTournamentTimezone(geo, previous.timezone || 'Europe/Berlin');
    await db.prepare(`UPDATE tournaments SET name = ?, club = ?, date = ?, start_time = ?, location = ?, description = ?, formation = ?, formation_other = ?, license_required = ?, website_url = ?, flyer_url = ?, latitude = ?, longitude = ?, geocoded_at = ?, timezone = ?, status = 'registration', visibility = 'public', registration_enabled = 0, updated_at = ? WHERE id = ?`)
      .bind(mapped.name, mapped.club, mapped.date, mapped.startTime, mapped.location, mapped.description, mapped.formation === 'andere' ? 'tete' : mapped.formation, mapped.formation === 'andere' ? 1 : 0, mapped.licenseRequired ? 1 : 0, mapped.websiteUrl, mapped.flyerUrl, geo.latitude, geo.longitude, geo.geocodedAt, timezone, now, existing.tournament_id).run();
    // Icon nur beim expliziten Import setzen (der Sync scrapt keine Detailseiten) und ein
    // vorhandenes Logo nicht löschen, wenn die Detailseite keins (mehr) liefert.
    if (mapped.logoUrl) await db.prepare('UPDATE tournaments SET logo_url = ? WHERE id = ?').bind(mapped.logoUrl, existing.tournament_id).run();
    await db.prepare('UPDATE petanque_aktuell_imports SET synced_at = ? WHERE external_key = ?').bind(now, mapped.externalKey).run();
    const updated = await getTournamentById(db, existing.tournament_id);
    if (isNewlyPublicTournament(previous, updated)) await notifySavedSearchesForPublishedTournament(env, updated, searches);
    return 'updated';
  }
  const id = crypto.randomUUID();
  const geo = await resolveTournamentGeolocation(mapped, null, now, countryCode);
  const timezone = resolveTournamentTimezone(geo);
  await db.batch([
    db.prepare(`INSERT INTO tournaments (id, owner_id, creator_id, name, date, start_time, location, description, type, formation, formation_other, license_required, registration_type, status, visibility, registration_enabled, club, website_url, logo_url, flyer_url, latitude, longitude, geocoded_at, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'formule_x', ?, ?, ?, 'forme', 'registration', 'public', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, ownerId, ownerId, mapped.name, mapped.date, mapped.startTime, mapped.location, mapped.description, mapped.formation === 'andere' ? 'tete' : mapped.formation, mapped.formation === 'andere' ? 1 : 0, mapped.licenseRequired ? 1 : 0, mapped.club, mapped.websiteUrl, mapped.logoUrl || null, mapped.flyerUrl, geo.latitude, geo.longitude, geo.geocodedAt, timezone, now, now),
    db.prepare('INSERT INTO petanque_aktuell_imports (external_key, tournament_id, imported_at, synced_at) VALUES (?, ?, ?, ?)').bind(mapped.externalKey, id, now, now),
  ]);
  await notifySavedSearchesForPublishedTournament(env, await getTournamentById(db, id), searches);
  return 'created';
}

async function importPetanqueAktuellTournaments(request, env, user) {
  const body = await readJson(request);
  const externalKeys = Array.isArray(body.externalKeys) ? [...new Set(body.externalKeys.map((key) => String(key || '').trim()).filter(Boolean))] : [];
  if (externalKeys.length === 0 || externalKeys.length > 200) throw new HttpError(400, 'Bitte wähle mindestens einen und höchstens 200 Termine aus.');
  const selected = new Map((await fetchPetanqueAktuellCalendar()).map((entry) => [entry.externalKey, entry]));
  if (externalKeys.some((key) => !selected.has(key))) throw new HttpError(400, 'Ein ausgewählter Pétanque-Aktuell-Termin ist nicht mehr verfügbar.');
  const now = new Date().toISOString();
  const searches = (await env.DB.prepare('SELECT * FROM saved_searches WHERE notify_enabled = 1').all()).results || [];
  const countryCode = request.headers.get('CF-IPCountry');
  const result = { created: 0, updated: 0, failed: 0 };
  for (const key of externalKeys) {
    try { result[await upsertPetanqueAktuellTournament(env, selected.get(key), user.id, now, searches, { scrapeDetails: true, countryCode })] += 1; }
    catch (error) { console.error(`Pétanque Aktuell import failed for ${key}`, error); result.failed += 1; }
  }
  return json(result, 201);
}

async function syncPetanqueAktuellImports(env) {
  const imports = await env.DB.prepare('SELECT external_key, tournament_id FROM petanque_aktuell_imports').all();
  if (imports.results.length === 0) return { updated: 0, deleted: 0 };
  const byKey = new Map((await fetchPetanqueAktuellCalendar()).map((entry) => [entry.externalKey, entry]));
  const now = new Date().toISOString();
  const searches = (await env.DB.prepare('SELECT * FROM saved_searches WHERE notify_enabled = 1').all()).results || [];
  let updated = 0;
  let deleted = 0;
  for (const imported of imports.results) {
    const entry = byKey.get(imported.external_key);
    if (!entry) { await env.DB.prepare('DELETE FROM tournaments WHERE id = ?').bind(imported.tournament_id).run(); deleted += 1; continue; }
    await upsertPetanqueAktuellTournament(env, entry, null, now, searches);
    updated += 1;
  }
  return { updated, deleted };
}

async function updateTournament(request, env, existing, user) {
  const db = env.DB;
  if (Number(existing.document_managed || 0) === 1) {
    throw new HttpError(409, 'Die Eckdaten dieses Turniers werden im Turnierdokument gepflegt.');
  }
  let body = await readJson(request);
  const selectedPlace = await resolveTournamentBoulePlace(db, body.boulePlaceId);
  if (selectedPlace) body = { ...body, location: selectedPlace.address, latitude: selectedPlace.latitude, longitude: selectedPlace.longitude };
  const tournament = normalizeCoreTournamentInput(body);
  if (existing.type === 'schweizer' && existing.status === 'running'
    && tournament.schweizerRankingMode !== (existing.schweizer_ranking_mode || 'mit_buchholz')) {
    throw new HttpError(409, 'Der Schweizer Ranglistenmodus kann nach Turnierstart nicht geändert werden');
  }
  const now = new Date().toISOString();
  const geo = await resolveTournamentGeolocation(tournament, existing, now, request.headers.get('CF-IPCountry'));
  const timezone = resolveTournamentTimezone(geo, existing.timezone || 'Europe/Berlin');
  const registrationTimes = resolveRegistrationTimes(tournament, timezone);

  await db
    .prepare(
      `UPDATE tournaments
       SET name = ?, club = ?, date = ?, start_time = ?, location = ?, description = ?, type = ?,
           formation = ?, formation_other = ?, registration_type = ?, status = ?, max_registrations = ?, registration_deadline = ?, registration_opens_at = ?, entry_fee_cents = ?, currency = ?, schweizer_ranking_mode = ?, formule_x_rounds = ?, ko_platz3 = ?,
           contact_name = ?, contact_email = ?, contact_phone = ?, visibility = ?, internal_notes = ?,
           participants_public = ?, license_required = ?, team_name_enabled = ?, waitlist_enabled = ?, registration_enabled = ?, approval_required = ?, latitude = ?, longitude = ?, geocoded_at = ?, timezone = ?, boule_place_id = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      tournament.name,
      tournament.club,
      tournament.date,
      tournament.startTime,
      tournament.location,
      tournament.description,
      tournament.type,
      tournament.formation,
      tournament.formationOther ? 1 : 0,
      tournament.registrationType,
      tournament.status,
      tournament.maxRegistrations,
      registrationTimes.registrationDeadline,
      registrationTimes.registrationOpensAt,
      tournament.entryFeeCents,
      tournament.currency,
      tournament.schweizerRankingMode,
      tournament.formuleXRounds,
      tournament.koPlatz3 ? 1 : 0,
      tournament.contactName,
      tournament.contactEmail,
      tournament.contactPhone,
      tournament.visibility,
      tournament.internalNotes,
      tournament.participantsPublic ? 1 : 0,
      tournament.licenseRequired ? 1 : 0,
      tournament.teamNameEnabled ? 1 : 0,
      tournament.waitlistEnabled ? 1 : 0,
      tournament.registrationEnabled ? 1 : 0,
      tournament.approvalRequired ? 1 : 0,
      geo.latitude,
      geo.longitude,
      geo.geocodedAt,
      timezone,
      selectedPlace?.id || null,
      now,
      existing.id,
    )
    .run();

  const feeTiers = tournament.feeTiersProvided ? tournament.feeTiers : jsonArray(existing.fee_tiers).filter((tier) => tier?.id !== 'legacy-standard');
  await db.prepare('UPDATE tournaments SET fee_tiers = ? WHERE id = ?').bind(JSON.stringify(feeTiers), existing.id).run();
  const registrationQuestions = tournament.registrationQuestionsProvided ? tournament.registrationQuestions : registrationQuestionsFromRow(existing);
  await db.prepare('UPDATE tournaments SET registration_questions = ? WHERE id = ?').bind(JSON.stringify(registrationQuestions), existing.id).run();
  if (tournament.registrationQuestionsProvided) await pruneRegistrationAnswers(db, existing.id, registrationQuestions);

  const updated = await getTournamentById(db, existing.id);
  if (isNewlyPublicTournament(existing, updated)) {
    await notifySavedSearchesForPublishedTournament(env, updated);
  }
  if (updated.status !== existing.status) {
    await createSystemNotification(env, existing.owner_id, 'tournament_status_changed', { tournamentName: updated.name, status: updated.status });
    const participants = await db.prepare("SELECT DISTINCT u.id FROM registrations r JOIN users u ON lower(u.email) = lower(r.email) WHERE r.tournament_id = ? AND r.status IN ('pending', 'confirmed') AND u.id != ?").bind(existing.id, existing.owner_id).all();
    await Promise.all((participants.results || []).map((participant) => createSystemNotification(env, participant.id, 'tournament_status_changed', { tournamentName: updated.name, status: updated.status })));
  }
  return json({ tournament: toPublicTournament(updated, user) });
}

/**
 * Kern des leichtgewichtigen Statuswechsels für "Turnier starten": setzt nur status auf 'running',
 * ohne die vollständige Turnier-Eingabemaske (normalizeCoreTournamentInput mit allen Pflicht-
 * feldern) zu durchlaufen - sonst müsste die Durchführungs-Seite das komplette Turnierformular
 * mitschleppen, nur um den Status umzuschalten. Von {@link startTournament} (Web-UI) und
 * {@link startTournamentFromSync} (Sync-API, markiert die Desktop-Durchführung) gemeinsam genutzt.
 */
async function performTournamentStart(env, existing) {
  const db = env.DB;
  if (existing.status === 'running') {
    return existing;
  }
  const now = new Date().toISOString();
  const result = await db.prepare("UPDATE tournaments SET status = 'running', updated_at = ? WHERE id = ? AND status != 'running'").bind(now, existing.id).run();
  const updated = await getTournamentById(db, existing.id);
  if (result.meta.changes === 0) {
    // Ein gleichzeitiger Request hat den Statuswechsel bereits durchgeführt -
    // Benachrichtigungen wurden bereits von diesem verschickt, nicht erneut auslösen.
    return updated;
  }
  if (isNewlyPublicTournament(existing, updated)) {
    await notifySavedSearchesForPublishedTournament(env, updated);
  }
  await createSystemNotification(env, existing.owner_id, 'tournament_status_changed', { tournamentName: updated.name, status: updated.status });
  const participants = await db.prepare("SELECT DISTINCT u.id FROM registrations r JOIN users u ON lower(u.email) = lower(r.email) WHERE r.tournament_id = ? AND r.status IN ('pending', 'confirmed') AND u.id != ?").bind(existing.id, existing.owner_id).all();
  await Promise.all((participants.results || []).map((participant) => createSystemNotification(env, participant.id, 'tournament_status_changed', { tournamentName: updated.name, status: updated.status })));
  return updated;
}

async function startTournament(env, existing, user) {
  if (isCalendarEntry(existing)) {
    throw new HttpError(409, 'Kalendereinträge können nicht gestartet werden');
  }
  if (!isOnlinePlayable(existing)) {
    throw new HttpError(409, 'Dieser Turniertyp unterstützt keine Online-Rundenverwaltung.');
  }
  const updated = await performTournamentStart(env, existing);
  if (existing.status !== 'running') {
    await checkInConfirmedRegistrations(env.DB, existing.id);
  }
  return json({ tournament: toPublicTournament(updated, user) });
}

/**
 * Automatischer Check-in beim Online-Turnierstart: alle bestätigten, noch nicht eingecheckten
 * Meldungen werden aktiv. Bereits ausgesetzte Meldungen bleiben unverändert. Nicht für die
 * Desktop-Durchführung ({@link startTournamentFromSync}) - dort meldet das Turnierdokument die
 * Teilnahme selbst.
 */
async function checkInConfirmedRegistrations(db, tournamentId) {
  await db.prepare(`UPDATE registrations SET participation = 'active', updated_at = ?
      WHERE tournament_id = ? AND status = 'confirmed' AND participation = 'inactive'`)
    .bind(new Date().toISOString(), tournamentId).run();
}

/**
 * Sync-Variante von {@link startTournament}: Ein erster Rundenstart aus PTM legt fest, dass die
 * Durchführung in der Desktop-Anwendung erfolgt. Erst dann ist das Turnierdokument alleiniger
 * Master für Meldeliste und Ausführungsdaten.
 */
async function startTournamentFromSync(env, existing, user) {
  await performTournamentStart(env, existing);
  await env.DB.prepare('UPDATE tournaments SET desktop_execution = 1, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), existing.id).run();
  const updated = await getTournamentById(env.DB, existing.id);
  return json({ tournament: toPublicTournament(updated, user) });
}

function normalizePresentationUrl(value, field) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }
  if (!isHttpUrl(trimmed)) {
    throw new HttpError(400, 'Eine gültige URL (http:// oder https://) ist erforderlich', field ? { field } : undefined);
  }
  return trimmed;
}

function assertTournamentReportDateWithinRange(dateStr) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const minDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const maxDate = new Date(today.getTime() + TOURNAMENT_REPORT_MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000);
  const value = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(value.getTime()) || value.getTime() < minDate.getTime()) {
    throw new HttpError(400, 'Das Turnierdatum muss in der Zukunft liegen');
  }
  if (value.getTime() > maxDate.getTime()) {
    throw new HttpError(400, 'Das Turnierdatum darf höchstens 2 Jahre in der Zukunft liegen');
  }
}

async function enforceTournamentReportRateLimit(db, ip) {
  const windowStart = new Date(Date.now() - TOURNAMENT_REPORT_RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();

  const ipCount = await db
    .prepare('SELECT COUNT(*) AS count FROM tournament_report_attempts WHERE ip = ? AND created_at > ?')
    .bind(ip, windowStart)
    .first();

  if (Number(ipCount?.count || 0) >= TOURNAMENT_REPORT_RATE_LIMIT_MAX_PER_IP) {
    throw new HttpError(429, 'Zu viele Turniermeldungen. Bitte versuche es später erneut.');
  }

  await db
    .prepare('INSERT INTO tournament_report_attempts (id, ip, created_at) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), ip, new Date().toISOString())
    .run();
}

async function verifyTurnstileToken(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) {
    // Not configured on this environment (e.g. local dev) - skip verification rather than
    // hard-blocking the whole feature.
    return;
  }
  if (!token) {
    throw new HttpError(400, 'Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.');
  }
  const params = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip && ip !== 'unknown') {
    params.set('remoteip', ip);
  }
  let result;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    result = await response.json();
  } catch (error) {
    console.error('Turnstile verification request failed', error);
    throw new HttpError(400, 'Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.');
  }
  if (!result?.success) {
    throw new HttpError(400, 'Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.');
  }
}

/**
 * Kein eingeloggter User beteiligt, aber owner_id ist NOT NULL - der aelteste Admin-Account
 * uebernimmt die Ownership fuer anonym gemeldete Turniere/Kalendereintraege.
 */
async function resolveDefaultReportOwnerId(db) {
  const admin = await db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").first();
  if (!admin) throw new HttpError(500, 'Kein Admin-Konto vorhanden');
  return admin.id;
}

/**
 * Public, unauthenticated "Turnier melden" submission. Replaces the old logged-in-only
 * calendar-entry form: anyone can report a tournament, but the entry stays hidden
 * (status='draft') until the contact email is confirmed via createTournamentReportToken,
 * and is auto-deleted if unconfirmed within 24h or once its date is in the past
 * (see cleanupExpiredSessions).
 */
async function createTournamentReport(request, env, url) {
  const db = env.DB;
  const body = await readJson(request);

  // Ignore automated submissions that populate the hidden website field without
  // revealing the detection.
  if (nullableText(body.website)) {
    return json({ ok: true }, 201);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await enforceTournamentReportRateLimit(db, ip);
  await verifyTurnstileToken(env, body.turnstileToken, ip);

  const club = text(body.club);
  const name = text(body.name);
  const location = text(body.location);
  const date = text(body.date);
  const startTime = nullableText(body.startTime);
  const rawFormation = text(body.formation || 'doublette');
  const formationOther = rawFormation === 'andere';
  const formation = formationOther ? 'tete' : rawFormation;
  const licenseRequired = Boolean(body.licenseRequired);
  const description = normalizeRichText(body.description, 'Ungültige Turnierbeschreibung');
  const websiteUrl = normalizePresentationUrl(body.websiteUrl, 'websiteUrl');
  const flyerUrl = normalizePresentationUrl(body.flyerUrl, 'flyerUrl');
  const contactName = text(body.contactName);
  const contactEmail = text(body.contactEmail).toLowerCase();
  const language = normalizeLanguage(body.language);

  if (club.length < 2) throw new HttpError(400, 'Der Verein muss mindestens 2 Zeichen enthalten');
  if (name.length < 2) throw new HttpError(400, 'Die Turnier-Informationen müssen mindestens 2 Zeichen enthalten');
  if (location.length < 2) throw new HttpError(400, 'Der Ort muss mindestens 2 Zeichen enthalten');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Ein gültiges Turnierdatum ist erforderlich');
  assertTournamentReportDateWithinRange(date);
  if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) throw new HttpError(400, 'Eine gültige Startzeit ist erforderlich');
  if (!FORMATION_REPORT_VALUES.includes(rawFormation)) throw new HttpError(400, 'Ungültige Formation');
  if (!websiteUrl) throw new HttpError(400, 'Eine Quelle/Webseite ist erforderlich');
  if (contactName.length < 2) throw new HttpError(400, 'Der Kontaktname muss mindestens 2 Zeichen enthalten');
  if (!isEmail(contactEmail)) throw new HttpError(400, 'Eine gültige Kontakt-E-Mail ist erforderlich');
  if (!body.consentAccepted) throw new HttpError(400, 'Zustimmung zur Datenschutzerklärung ist erforderlich');

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const tournamentForGeo = { location, latitude: null, longitude: null };
  const geo = await resolveTournamentGeolocation(tournamentForGeo, null, now, request.headers.get('CF-IPCountry'));
  const timezone = resolveTournamentTimezone(geo);
  const ownerId = await resolveDefaultReportOwnerId(db);

  await db
    .prepare(
      `INSERT INTO tournaments (
        id, owner_id, creator_id, name, date, start_time, location, description, type, formation, formation_other, license_required,
        registration_type, status, visibility, registration_enabled, club, website_url, flyer_url, contact_name, contact_email,
        latitude, longitude, geocoded_at, timezone, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      ownerId,
      TOURNAMENT_REPORT_SYSTEM_USER_ID,
      name,
      date,
      startTime,
      location,
      description,
      'formule_x',
      formation,
      formationOther ? 1 : 0,
      licenseRequired ? 1 : 0,
      'forme',
      'draft',
      'public',
      0,
      club,
      websiteUrl,
      flyerUrl,
      contactName,
      contactEmail,
      geo.latitude,
      geo.longitude,
      geo.geocodedAt,
      timezone,
      now,
      now,
    )
    .run();

  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + TOURNAMENT_REPORT_TOKEN_TTL_SECONDS * 1000);
  await db
    .prepare('INSERT INTO tournament_report_tokens (token_hash, tournament_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, id, expiresAt.toISOString(), now)
    .run();

  const verificationUrl = `${url.origin}/?report_verify_token=${encodeURIComponent(token)}`;
  const emailText = TOURNAMENT_REPORT_VERIFICATION_EMAILS[language] || TOURNAMENT_REPORT_VERIFICATION_EMAILS.de;
  await sendTransactionalEmail(env, {
    to: contactEmail,
    subject: emailText.subject,
    text: emailText.text(verificationUrl),
    language,
    logFallback: `Tournament report verification link for ${contactEmail}: ${verificationUrl}`,
    failureContext: `tournament report verification email for ${contactEmail}`,
    allowLogFallback: isLocalhost(url),
  });

  const response = { ok: true };
  if (isLocalhost(url)) {
    response.verificationUrl = verificationUrl;
  }
  return json(response, 201);
}

async function verifyTournamentReport(request, env) {
  const db = env.DB;
  const body = await readJson(request);
  const token = String(body.token || '').trim();
  if (!token) {
    throw new HttpError(400, 'Bestätigungs-Token ist erforderlich');
  }

  const tokenHash = await sha256Hex(token);
  const verification = await db
    .prepare('SELECT token_hash, tournament_id, expires_at, used_at FROM tournament_report_tokens WHERE token_hash = ?')
    .bind(tokenHash)
    .first();

  if (!verification || verification.used_at || new Date(verification.expires_at).getTime() <= Date.now()) {
    throw new HttpError(400, 'Bestätigungs-Link ist ungültig oder abgelaufen');
  }

  const previous = await getTournamentById(db, verification.tournament_id);
  const now = new Date().toISOString();
  await db.batch([
    // Bestätigter Kalendereintrag wird sichtbar wie ein importierter Termin (nicht "Läuft").
    db.prepare("UPDATE tournaments SET status = 'registration', updated_at = ? WHERE id = ?").bind(now, verification.tournament_id),
    db.prepare('UPDATE tournament_report_tokens SET used_at = ? WHERE token_hash = ?').bind(now, tokenHash),
  ]);
  const updated = await getTournamentById(db, verification.tournament_id);
  if (isNewlyPublicTournament(previous, updated)) {
    await notifySavedSearchesForPublishedTournament(env, updated);
  }

  return json({ ok: true, tournamentId: verification.tournament_id });
}

const PROXY_IMAGE_FIELDS = { logo: 'logo_url', website: 'website_url', flyer: 'flyer_url' };
const IMAGE_PROXY_TIMEOUT_MS = 8000;
const IMAGE_PROXY_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_PROXY_CACHE_SECONDS = 60 * 60 * 6;

/**
 * Streams an externally hosted image through our own origin so it satisfies the strict
 * `img-src 'self'` CSP instead of loosening that policy to arbitrary external hosts.
 */
async function proxyTournamentImage(tournament, field) {
  const column = PROXY_IMAGE_FIELDS[field];
  if (!column) {
    throw new HttpError(400, 'Unbekanntes Bildfeld');
  }
  // Ein explizit am Turnier hinterlegtes Logo hat Vorrang. Ohne ein solches
  // verwenden wir das Logo des veröffentlichten Vereins am gewählten Spielort.
  const targetUrl = field === 'logo' ? tournament.logo_url || tournament.venue_club_logo_url : tournament[column];
  return proxyExternalImage(targetUrl, `tournaments/${tournament.id}/${field}`);
}

async function proxyBoulePlaceClubLogo(db, placeId) {
  const place = await db.prepare(
    `SELECT p.id, c.logo_url AS club_logo_url
     FROM boule_places p JOIN clubs c ON c.id = p.club_id
     WHERE p.id = ? AND p.status = 'published' AND c.status = 'published'`,
  ).bind(placeId).first();
  if (!place) {
    throw new HttpError(404, 'Bouleplatz nicht gefunden');
  }
  return proxyExternalImage(place.club_logo_url, `places/${place.id}/club-logo`);
}

async function proxyExternalImage(targetUrl, cachePath) {
  if (!targetUrl || !isHttpUrl(targetUrl)) {
    throw new HttpError(404, 'Kein Bild hinterlegt');
  }
  if (isUnsafeImageTarget(targetUrl)) {
    throw new HttpError(400, 'Ziel-URL nicht erlaubt');
  }

  const cache = caches.default;
  const cacheKey = new Request(
    `https://image-proxy.internal/${cachePath}?source=${encodeURIComponent(targetUrl)}`,
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

  const body = await readBodyWithLimit(upstream, IMAGE_PROXY_MAX_BYTES, 'Bild zu groß');

  const response = new Response(body, {
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
async function updateTournamentPresentation(request, env, existing, user) {
  const db = env.DB;
  const body = await readJson(request);
  const websiteUrl = normalizePresentationUrl(body.websiteUrl, 'websiteUrl');
  const logoUrl = normalizePresentationUrl(body.logoUrl, 'logoUrl');
  const flyerUrl = normalizePresentationUrl(body.flyerUrl, 'flyerUrl');
  const now = new Date().toISOString();

  await db
    .prepare('UPDATE tournaments SET website_url = ?, logo_url = ?, flyer_url = ?, updated_at = ? WHERE id = ?')
    .bind(websiteUrl, logoUrl, flyerUrl, now, existing.id)
    .run();

  const updated = await getTournamentById(db, existing.id);
  return json({ tournament: toPublicTournament(updated, user) });
}

/** PTM Calc is the exclusive writer for the metadata of a linked tournament. */
async function syncPutTournamentMetadata(request, env, existing, user) {
  const db = env.DB;
  const body = await readJson(request);
  const legacyRegistrationTimes = body.registrationTimeSemantics !== 'tournament-local-v1';
  const tournament = normalizeCoreTournamentInput(body, {
    legacyRegistrationTimes,
    registrationTypeDefault: existing.registration_type || 'forme',
  });
  const now = new Date().toISOString();
  const geo = await resolveTournamentGeolocation(tournament, existing, now, request.headers.get('CF-IPCountry'));
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
  if (isNewlyPublicTournament(existing, updated)) {
    await notifySavedSearchesForPublishedTournament(env, updated);
  }
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
  return json({ registrations: result.results.map(toManagedRegistration) });
}

async function confirmPendingRegistrations(env, tournament, appOrigin) {
  const pending = await env.DB.prepare("SELECT * FROM registrations WHERE tournament_id = ? AND status = 'pending' ORDER BY registered_at ASC").bind(tournament.id).all();
  const registrations = pending.results || [];
  if (registrations.length === 0) return json({ confirmedCount: 0 });

  const now = new Date().toISOString();
  const updateResults = await env.DB.batch(registrations.map((registration) =>
    env.DB.prepare("UPDATE registrations SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
      .bind(now, now, registration.id),
  ));
  const confirmedRegistrations = registrations.filter((registration, index) => Number(updateResults[index]?.meta?.changes || 0) > 0);

  for (const registration of confirmedRegistrations) {
    await createSystemNotification(env, tournament.owner_id, 'registration_status_changed', { tournamentName: tournament.name, status: 'confirmed', participant: `${registration.first_name} ${registration.last_name}` });
    await notifyUserByEmail(env, registration.email, 'registration_status_changed', { tournamentName: tournament.name, status: 'confirmed' }, undefined, tournament.owner_id);
    try {
      await sendRegistrationConfirmationEmail(env, tournament, registration, appOrigin);
    } catch (error) {
      console.error(`Failed to send bulk registration confirmation email for registration ${registration.id}`, error);
    }
  }
  return json({ confirmedCount: confirmedRegistrations.length });
}

async function listPublicParticipants(db, tournamentId, currentUserEmail) {
  const result = await db
    .prepare(
      `SELECT id, email, first_name, last_name, club, team_name, partner_first_name, partner_last_name, is_vip, status
       FROM registrations
       WHERE tournament_id = ? AND status IN ('pending', 'confirmed', 'waitlist')
       ORDER BY registered_at ASC`,
    )
    .bind(tournamentId)
    .all();

  const normalizedCurrentEmail = currentUserEmail ? currentUserEmail.toLowerCase() : null;

  const toParticipant = (row) => {
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
  };

  return json({
    participants: result.results.filter((row) => row.status !== 'waitlist').map(toParticipant),
    waitlist: result.results.filter((row) => row.status === 'waitlist').map(toParticipant),
  });
}

function parseTeamIds(idsJson) {
  if (!idsJson) return [];
  try {
    return JSON.parse(idsJson);
  } catch {
    return [];
  }
}

function toPublicMatch(row, playersById) {
  const resolvePlayers = (idsJson) =>
    parseTeamIds(idsJson).map((id) => playersById.get(id) || { id, firstName: '?', lastName: '' });
  return {
    id: row.id,
    teamA: resolvePlayers(row.team_a_registration_ids),
    teamB: resolvePlayers(row.team_b_registration_ids),
    scoreA: row.score_a,
    scoreB: row.score_b,
    noShow: row.no_show,
    stageLabel: row.stage_label || null,
  };
}

async function getPlayersById(db, tournamentId) {
  const result = await db.prepare('SELECT id, first_name, last_name, partner_first_name, partner_last_name, partner2_first_name, partner2_last_name, team_name FROM registrations WHERE tournament_id = ?').bind(tournamentId).all();
  return new Map(result.results.map((row) => {
    // Bei Doublette/Triplette-Registrierungen ("forme") steckt das ganze Team in einer
    // einzigen Registrierung (Partner als Felder, keine eigenen Registrierungen). Die
    // Namen müssen daher hier schon pro Spieler mit " + " getrennt werden, sonst sieht
    // ein Doublette-/Triplette-Team in der Auslosungsanzeige wie ein einzelner Tête-Spieler
    // aus (siehe Bugreport: Schweizer/forme-Turnier "sieht aus wie Tête-Auslosung").
    const names = [
      [row.first_name, row.last_name],
      [row.partner_first_name, row.partner_last_name],
      [row.partner2_first_name, row.partner2_last_name],
    ]
      .map((parts) => parts.filter(Boolean).join(' '))
      .filter(Boolean);
    return [row.id, {
      id: row.id, firstName: row.first_name, lastName: row.last_name,
      teamLabel: row.team_name || names.join(' + '),
    }];
  }));
}

async function getSchweizerTeams(db, tournament) {
  const result = await db.prepare('SELECT * FROM tournament_teams WHERE tournament_id = ? ORDER BY created_at, id').bind(tournament.id).all();
  return result.results.map((row) => ({ id: row.id, members: JSON.parse(row.member_registration_ids), seedPosition: Number(row.seed_position || 0), bracketGroup: row.bracket_group || null }));
}

// Ordnet KO-Teams einmalig (vor der ersten Runde) einem unabhängigen Teilbaum zu (siehe
// lib/pairing/ko.js assignGroups - GruppenAufteilungRechner-Referenz) und persistiert das,
// damit die Zuordnung über alle folgenden Runden stabil bleibt. Idempotent: Teams, die
// bereits eine bracket_group haben, werden nicht verändert.
async function assignKoBracketGroups(db, tournament, teams) {
  if (teams.every((team) => team.bracketGroup)) {
    return teams;
  }
  const ordered = orderKoSeeds(teams);
  const assignment = assignKoGroups(ordered.map((team) => team.id));
  const groupById = new Map(assignment.map((entry) => [entry.teamId, entry.group]));
  await db.batch(teams.map((team) => db.prepare('UPDATE tournament_teams SET bracket_group = ? WHERE id = ?').bind(groupById.get(team.id) || 'A', team.id)));
  return teams.map((team) => ({ ...team, bracketGroup: groupById.get(team.id) || 'A' }));
}

async function createFormeTeams(db, tournament) {
  const current = await getSchweizerTeams(db, tournament);
  if (current.length) return current;
  const registrations = await db.prepare("SELECT id, seeding_position FROM registrations WHERE tournament_id = ? AND status = 'confirmed' AND participation = 'active' ORDER BY registered_at").bind(tournament.id).all();
  if (!registrations.results.length) return [];
  const nowMs = Date.now();
  // Jede Zeile bekommt einen eigenen, um 1ms pro Index versetzten Zeitstempel statt
  // desselben `now` für alle - sonst sortiert getSchweizerTeams() (ORDER BY created_at,
  // id) bei Gleichstand nach der zufälligen UUID statt der Anmeldereihenfolge, was vor
  // allem bei Jeder-gegen-Jeden die aus Sicht der Teams nachvollziehbare Reihenfolge
  // zerstört (Round Robin ist ansonsten unabhängig von der Reihenfolge korrekt).
  await db.batch(registrations.results.map((row, index) => db.prepare('INSERT INTO tournament_teams (id, tournament_id, member_registration_ids, seed_position, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), tournament.id, JSON.stringify([row.id]), Number(row.seeding_position || 0), new Date(nowMs + index).toISOString())));
  return getSchweizerTeams(db, tournament);
}

function assertOnlineExecution(tournament) {
  if (Number(tournament.desktop_execution || 0) === 1) {
    throw new HttpError(409, 'Dieses Turnier wird nicht online durchgeführt. Der Spielplan wird im Turnierdokument geführt.');
  }
}

async function drawSchweizerMeleeTeams(db, tournament) {
  assertOnlineExecution(tournament);
  if (tournament.type !== 'schweizer' || tournament.registration_type !== 'melee') throw new HttpError(400, 'Die Team-Auslosung ist nur für Schweizer Mêlée verfügbar');
  if (tournament.status === 'finished') throw new HttpError(409, 'Nach Turnierende können Teams nicht mehr ausgelost werden');
  const rounds = await db.prepare('SELECT COUNT(*) AS count FROM tournament_rounds WHERE tournament_id = ?').bind(tournament.id).first();
  if (Number(rounds.count)) throw new HttpError(409, 'Nach der ersten Runde können Teams nicht mehr ausgelost werden');
  const registrations = await db.prepare("SELECT id, seeding_position FROM registrations WHERE tournament_id = ? AND status = 'confirmed' AND participation = 'active' ORDER BY registered_at").bind(tournament.id).all();
  const size = tournament.formation === 'triplette' ? 3 : 2;
  if (registrations.results.length < size * 6) throw new HttpError(400, 'Für eine Runde werden mindestens 6 Teams benötigt.');
  const shuffled = [...registrations.results].sort(() => Math.random() - 0.5);
  const teamCount = Math.floor(shuffled.length / size); const now = new Date().toISOString();
  const statements = [db.prepare('DELETE FROM tournament_teams WHERE tournament_id = ?').bind(tournament.id)];
  for (let index = 0; index < teamCount; index++) {
    const members = shuffled.slice(index * size, (index + 1) * size);
    const seededPositions = members.map((member) => Number(member.seeding_position || 0)).filter(Boolean);
    const seedPosition = seededPositions.length ? Math.min(...seededPositions) : 0;
    statements.push(db.prepare('INSERT INTO tournament_teams (id, tournament_id, member_registration_ids, seed_position, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), tournament.id, JSON.stringify(members.map((member) => member.id)), seedPosition, now));
  }
  await db.batch(statements);
  return json({ teams: await getSchweizerTeams(db, tournament), unassignedCount: shuffled.length - teamCount * size });
}

async function listTournamentRounds(db, tournamentId) {
  const roundsResult = await db.prepare('SELECT * FROM tournament_rounds WHERE tournament_id = ? ORDER BY round_number ASC').bind(tournamentId).all();
  const matchesResult = await db.prepare('SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY created_at ASC').bind(tournamentId).all();
  const teamsResult = await db.prepare('SELECT id, member_registration_ids, seed_position FROM tournament_teams WHERE tournament_id = ? ORDER BY created_at, id').bind(tournamentId).all();
  const playersById = await getPlayersById(db, tournamentId);

  const matchesByRound = new Map();
  for (const row of matchesResult.results) {
    const list = matchesByRound.get(row.round_id) || [];
    list.push(toPublicMatch(row, playersById));
    matchesByRound.set(row.round_id, list);
  }

  return json({
    teams: teamsResult.results.map((team) => ({ id: team.id, members: JSON.parse(team.member_registration_ids), seedPosition: Number(team.seed_position || 0) })),
    rounds: roundsResult.results.map((round) => ({
      id: round.id,
      roundNumber: round.round_number,
      matches: matchesByRound.get(round.id) || [],
    })),
  });
}

async function generateTournamentRound(db, tournament) {
  if (isCalendarEntry(tournament)) {
    throw new HttpError(409, 'Kalendereinträge können nicht gestartet werden');
  }
  assertOnlineExecution(tournament);
  if (!isOnlinePlayable(tournament)) {
    throw new HttpError(400, 'Für dieses Turniersystem ist keine Online-Durchführung verfügbar');
  }
  if (tournament.status !== 'running') {
    throw new HttpError(400, 'Das Turnier muss den Status "Läuft" haben, um Runden zu generieren');
  }

  // Auch direkte API-Aufrufe müssen die systemabhängigen Mindestanforderungen,
  // die zulässige Anmeldeart und das natürliche Rundenende einhalten.
  const [activeConfirmed, existingRounds] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM registrations WHERE tournament_id = ? AND status = 'confirmed' AND participation = 'active'").bind(tournament.id).first(),
    db.prepare('SELECT COUNT(*) AS count FROM tournament_rounds WHERE tournament_id = ?').bind(tournament.id).first(),
  ]);
  const requirement = checkRoundRequirements(tournament, Number(activeConfirmed.count), Number(existingRounds.count))[0];
  if (requirement) {
    throw new HttpError(400, roundRequirementMessage(requirement));
  }

  const lastRound = await db
    .prepare('SELECT * FROM tournament_rounds WHERE tournament_id = ? ORDER BY round_number DESC LIMIT 1')
    .bind(tournament.id)
    .first();
  if (lastRound) {
    const openMatches = await db
      .prepare('SELECT COUNT(*) AS count FROM tournament_matches WHERE round_id = ? AND score_a IS NULL AND score_b IS NULL AND no_show IS NULL')
      .bind(lastRound.id)
      .first();
    if (Number(openMatches.count) > 0) {
      throw new HttpError(400, 'Bitte zuerst alle Ergebnisse der aktuellen Runde eintragen');
    }
  }

  const isSchweizer = tournament.type === 'schweizer' && tournament.registration_type !== 'supermelee';
  const isRoundRobin = tournament.type === 'jeder_gegen_jeden';
  const isFormuleX = tournament.type === 'formule_x';
  const isKo = tournament.type === 'ko';
  // Jeder gegen Jeden, Formule X und K.O. nutzen dasselbe feste-Teams-Modell wie
  // Schweizer-Formée: eine Meldung = ein Team über alle Runden (siehe
  // lib/pairing/roundrobin.js, lib/pairing/formulex.js, lib/pairing/ko.js) -
  // Mêlée-Durchmischung widerspräche allen dreien.
  const usesFixedTeams = isSchweizer || isRoundRobin || isFormuleX || isKo;
  let players;
  let teamsById = new Map();
  if (usesFixedTeams) {
    let teams = isRoundRobin || isFormuleX || isKo || tournament.registration_type === 'forme'
      ? await createFormeTeams(db, tournament)
      : await getSchweizerTeams(db, tournament);
    if (!teams.length) throw new HttpError(400, 'Bitte zuerst Mêlée-Teams auslosen');
    if (isKo) {
      teams = await assignKoBracketGroups(db, tournament, teams);
    }
    players = teams;
    teamsById = new Map(teams.map((team) => [team.id, team]));
  } else {
    const registrationsResult = await db.prepare("SELECT id FROM registrations WHERE tournament_id = ? AND status = 'confirmed' AND participation = 'active'").bind(tournament.id).all();
    players = registrationsResult.results.map((row) => ({ id: row.id }));
  }

  // round_number/match_index braucht nur K.O. (Winner-Advance-Rekonstruktion, siehe
  // lib/pairing/ko.js historyForGroup), für die anderen Formate sind die Felder harmlos.
  const historyResult = await db
    .prepare(
      `SELECT m.team_a_registration_ids, m.team_b_registration_ids, m.team_a_id, m.team_b_id,
              m.score_a, m.score_b, m.no_show, m.match_index, r.round_number
       FROM tournament_matches m JOIN tournament_rounds r ON r.id = m.round_id
       WHERE m.tournament_id = ?
       ORDER BY r.round_number ASC, m.match_index ASC`,
    )
    .bind(tournament.id)
    .all();
  const history = historyResult.results.map((row) => ({
    teamA: usesFixedTeams && row.team_a_id ? [row.team_a_id] : parseTeamIds(row.team_a_registration_ids),
    teamB: usesFixedTeams && row.team_b_id ? [row.team_b_id] : parseTeamIds(row.team_b_registration_ids),
    scoreA: row.score_a, scoreB: row.score_b, noShow: row.no_show,
    roundNumber: row.round_number, matchIndex: row.match_index,
  }));

  const strategy = getPairingStrategy(tournament);
  let matches;
  try {
    const strategyOptions = isSchweizer
      ? { mode: tournament.schweizer_ranking_mode }
      : isFormuleX
        ? { formuleXRounds: tournament.formule_x_rounds }
        : isKo
          ? { platz3: !!tournament.ko_platz3 }
          : { formation: tournament.formation };
    ({ matches } = strategy.generateRound(players, history, strategyOptions));
  } catch (error) {
    // generateRound prüft die Mindestvoraussetzungen (u.a. mind. 4 bestätigte
    // Meldungen, siehe lib/pairing/supermelee.js) und wirft dafür ein einfaches
    // Error - ohne diese Umwandlung landet das als 500 "Internal server error"
    // statt als verständliche Meldung beim Turniersteller.
    throw new HttpError(400, error.message);
  }

  const roundId = crypto.randomUUID();
  const roundNumber = (lastRound?.round_number || 0) + 1;
  const now = new Date().toISOString();

  const statements = [
    db.prepare('INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES (?, ?, ?, ?)').bind(roundId, tournament.id, roundNumber, now),
  ];
  matches.forEach((match, matchIndex) => {
    const teamA = usesFixedTeams ? teamsById.get(match.teamA[0]) : null;
    const teamB = usesFixedTeams && match.teamB.length ? teamsById.get(match.teamB[0]) : null;
    statements.push(
      db
        .prepare(
          'INSERT INTO tournament_matches (id, tournament_id, round_id, team_a_registration_ids, team_b_registration_ids, team_a_id, team_b_id, score_a, score_b, match_index, stage_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        // Freilos-Anzeigewert 13:7 statt 13:0, konsistent mit den Hauptprojekt-Default-
        // Freispielpunkten (Diff 6), die swissStats() in schweizer.js verbucht. Auch für
        // Jeder-gegen-Jeden nötig, sonst blockiert ein unbewertetes Freilos-Match die
        // nächste Runde (siehe openMatches-Check oben). K.O. kennt kein Freilos (Cadrage
        // statt Freilos, siehe lib/pairing/ko.js), match.teamB ist dort immer belegt.
        .bind(crypto.randomUUID(), tournament.id, roundId, JSON.stringify(teamA?.members || match.teamA), JSON.stringify(teamB?.members || match.teamB), teamA?.id || null, teamB?.id || null, usesFixedTeams && !teamB ? 13 : null, usesFixedTeams && !teamB ? 7 : null, matchIndex, match.label || null, now, now),
    );
  });
  try {
    await db.batch(statements);
  } catch (error) {
    // Mehrere berechtigte Turnierleiter können die letzte abgeschlossene Runde
    // gleichzeitig sehen. Der eindeutige Zähler entscheidet atomar, welche
    // Anfrage gewinnt; die andere ist ein erwartbarer Konflikt, kein 500er.
    if (isTournamentRoundNumberConflict(error)) {
      throw new HttpError(409, 'Eine neue Runde wurde bereits zeitgleich erstellt. Bitte aktualisieren.');
    }
    throw error;
  }

  return listTournamentRounds(db, tournament.id);
}

async function setTournamentMatchResult(request, db, tournament, matchId) {
  assertOnlineExecution(tournament);
  const match = await db.prepare('SELECT * FROM tournament_matches WHERE id = ? AND tournament_id = ?').bind(matchId, tournament.id).first();
  if (!match) {
    throw new HttpError(404, 'Spiel nicht gefunden');
  }

  const body = await readJson(request);
  const now = new Date().toISOString();

  if (body.noShow === 'a' || body.noShow === 'b') {
    await db.prepare('UPDATE tournament_matches SET no_show = ?, score_a = NULL, score_b = NULL, updated_at = ? WHERE id = ?').bind(body.noShow, now, matchId).run();
  } else {
    const scoreA = validateMatchScore(body.scoreA);
    const scoreB = validateMatchScore(body.scoreB);
    if (scoreA === scoreB) {
      throw new HttpError(400, 'Ungültiges Ergebnis');
    }
    await db.prepare('UPDATE tournament_matches SET score_a = ?, score_b = ?, no_show = NULL, updated_at = ? WHERE id = ?').bind(scoreA, scoreB, now, matchId).run();
  }

  return listTournamentRounds(db, tournament.id);
}

async function getTournamentRanking(db, tournament) {
  const matchesResult = await db
    .prepare('SELECT team_a_registration_ids, team_b_registration_ids, team_a_id, team_b_id, score_a, score_b, no_show FROM tournament_matches WHERE tournament_id = ?')
    .bind(tournament.id)
    .all();
  const matches = matchesResult.results.map((row) => ({
    teamA: parseTeamIds(row.team_a_registration_ids),
    teamB: parseTeamIds(row.team_b_registration_ids),
    scoreA: row.score_a,
    scoreB: row.score_b,
    noShow: row.no_show,
  }));
  if (tournament.type === 'schweizer' && tournament.registration_type !== 'supermelee') {
    const teams = await getSchweizerTeams(db, tournament);
    const teamsById = new Map(teams.map((team) => [team.id, team]));
    const swissMatches = matchesResult.results.map((row) => ({
      teamA: row.team_a_id ? [row.team_a_id] : [], teamB: row.team_b_id ? [row.team_b_id] : [], scoreA: row.score_a, scoreB: row.score_b, noShow: row.no_show,
    }));
    const playersById = await getPlayersById(db, tournament.id);
    const ranking = competitionRanks(
      sortSwiss(swissStats(teams, swissMatches, tournament.schweizer_ranking_mode), tournament.schweizer_ranking_mode),
      (previous, entry) => sameSwissRankingPlace(previous, entry, tournament.schweizer_ranking_mode),
    );
    return json({ ranking: ranking.map((entry) => ({
      ...entry, teamId: entry.teamId,
      members: (teamsById.get(entry.teamId)?.members || []).map((id) => playersById.get(id) || { id, firstName: '?', lastName: '' }),
    })) });
  }
  if (tournament.type === 'ko') {
    // Anders als Schweizer/Formule X/JGJ kennt das Hauptprojekt für K.O. keine
    // separate Endrangliste (kein "KoRanglisteSheet") - die Platzierung ergibt
    // sich direkt aus dem Turnierbaum selbst (Rundenbezeichnung, Sieger-/Platz3-
    // Anzeige, siehe lib/pairing/ko.js). Es gibt daher bewusst keine Rangliste.
    return json({ ranking: [] });
  }
  if (tournament.type === 'formule_x') {
    const teams = await createFormeTeams(db, tournament);
    const teamsById = new Map(teams.map((team) => [team.id, team]));
    const formuleXMatches = matchesResult.results.map((row) => ({
      teamA: row.team_a_id ? [row.team_a_id] : [], teamB: row.team_b_id ? [row.team_b_id] : [], scoreA: row.score_a, scoreB: row.score_b, noShow: row.no_show,
    }));
    // Siegaufschlag hängt von den bisher gespielten Runden ab (siehe formulex.js) -
    // pro erzeugter Runde entsteht konstant pairingsPerRound(teams.length) Matches.
    const perRound = Math.ceil(teams.length / 2);
    const roundsPlayed = perRound ? Math.floor(formuleXMatches.length / perRound) : 0;
    const playersById = await getPlayersById(db, tournament.id);
    const ranking = competitionRanks(sortFormuleX(formuleXStats(teams, formuleXMatches, roundsPlayed)), sameFormuleXRankingPlace);
    return json({ ranking: ranking.map((entry) => ({
      ...entry, teamId: entry.teamId,
      members: (teamsById.get(entry.teamId)?.members || []).map((id) => playersById.get(id) || { id, firstName: '?', lastName: '' }),
    })) });
  }
  const ranking = competitionRanks(computeRanking(matches), sameStandardRankingPlace);
  const playersById = await getPlayersById(db, tournament.id);

  return json({
    ranking: ranking.map((entry) => ({
      ...entry,
      ...(playersById.get(entry.playerId) || {}),
    })),
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

async function cancelRegistrationByToken(request, env) {
  const body = await readJson(request);
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) {
    throw new HttpError(400, 'Ungültiger Abmelde-Link');
  }

  const registration = await getRegistrationByCancelToken(env.DB, token);
  if (!registration) {
    throw new HttpError(404, 'Anmeldung nicht gefunden');
  }

  if (registration.status === 'cancelled') {
    return json({ registration: toPublicRegistration(registration) });
  }

  assertRegistrationOnlineEditable(registration);

  const result = await cancelRegistration(env.DB, registration.id);
  try {
    await sendCancellationEmail(env, { id: registration.tournament_id, name: registration.name, owner_id: registration.owner_id }, registration, APP_ORIGIN);
  } catch (error) {
    console.error(`Failed to send cancellation email for registration ${registration.id}`, error);
  }
  return result;
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

async function createRegistration(request, env, tournament, { session = null, shareAccess = false, syncBootstrap = false } = {}) {
  const db = env.DB;

  const body = await readJson(request);
  // Do not create registrations or trigger notifications when automated submissions
  // populate the hidden website field.
  if (nullableText(body.website)) {
    return json({ ok: true }, 201);
  }
  const isManager = canManageTournament(tournament, session?.user || null);
  if (isManager && Number(tournament.desktop_execution || 0) === 1) {
    throw new HttpError(409, 'Die Meldeliste wird nach Turnierstart ausschließlich im Turnierdokument geführt.');
  }
  // Der reguläre Anmeldezeitraum gilt nur für öffentliche Selbstanmeldungen.
  // Bis zum Desktop-Start dürfen Turnierleiter die Meldeliste noch pflegen;
  // danach ist das verbundene Turnierdokument der alleinige Master.
  if (!isManager) {
    const openStatus = coreRegistrationOpenStatus({ ...tournament, visibility: shareAccess ? 'public' : tournament.visibility });
    if (openStatus !== 'open') {
      throw new HttpError(403, REGISTRATION_CLOSED_MESSAGES[openStatus]);
    }
  }
  if (!isManager && body.publicationNoticeAccepted !== true) {
    throw new HttpError(400, 'Der Hinweis zur möglichen Veröffentlichung der Anmeldedaten muss bestätigt werden');
  }
  if (isManager && body.noEmail === true) {
    body.email = createPlaceholderEmail();
  }

  const registration = normalizeRegistrationInput(body, { requireStatus: false });
  const organizerMessage = isManager ? null : registration.organizerMessage;
  const language = normalizeLanguage(body.language);
  assertCorePartnerCountMatchesFormation(tournament, registration);
  const feeSelections = resolveFeeSelections(tournament, body.feeSelections, registration);
  const registrationAnswers = resolveRegistrationAnswers(tournament, body.registrationAnswers, registration);
  assertLicenseMatchesTournament(tournament, registration);
  await assertNoDuplicateTeamName(db, tournament.id, registration.teamName);
  await assertNoDuplicatePlayer(db, tournament.id, registration);
  const { status, displace } = await initialRegistrationStatus(db, tournament, registration.isVip, isManager && body.confirmImmediately === true);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const cancelToken = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const appOrigin = new URL(request.url).origin;

  await db
    .prepare(
      `INSERT INTO registrations (
        id, tournament_id, first_name, last_name, email, club, license_nr,
        partner_first_name, partner_last_name, partner_email, partner_license_nr,
        partner2_first_name, partner2_last_name, partner2_email, partner2_license_nr,
        team_name, seeding_position, status, participation, is_vip, organizer_message, fee_selections, registration_answers, language, registered_at, confirmed_at, created_at, updated_at, cancel_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      initialParticipation(tournament, status),
      registration.isVip ? 1 : 0,
      organizerMessage,
      JSON.stringify(feeSelections),
      JSON.stringify(registrationAnswers),
      language,
      now,
      status === 'confirmed' ? now : null,
      now,
      now,
      cancelToken,
    )
    .run();

  const created = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(id).first();
  if (!syncBootstrap) {
    await createSystemNotification(env, tournament.owner_id, 'registration_status_changed', { tournamentName: tournament.name, status: created.status, participant: `${created.first_name} ${created.last_name}` });
    await notifyUserByEmail(env, created.email, 'registration_status_changed', { tournamentName: tournament.name, status: created.status }, undefined, tournament.owner_id);
  }

  if (displace && !syncBootstrap) {
    await displaceRegistration(env, tournament, displace, appOrigin);
  }

  const mailEnabled = await canSendTournamentMail(db, tournament);
  if (mailEnabled && !syncBootstrap) {
    try {
      if (created.status === 'pending') {
        await sendRegistrationReceivedEmail(env, tournament, created, appOrigin);
      } else if (created.status === 'confirmed') {
        await sendRegistrationConfirmationEmail(env, tournament, created, appOrigin);
      }
    } catch (error) {
      console.error(`Failed to send registration confirmation email for registration ${id}`, error);
    }
  }

  return json({ registration: toPublicRegistration(created), mailEnabled }, 201);
}

async function updateRegistration(request, env, existing) {
  const db = env.DB;
  const body = await readJson(request);
  if (body.noEmail === true) {
    body.email = isPlaceholderEmail(existing.email) ? existing.email : createPlaceholderEmail();
  }
  const registration = normalizeRegistrationInput(body, { requireStatus: true });
  assertCorePartnerCountMatchesFormation(existing, registration);
  const feeSelections = resolveFeeSelections(existing, body.feeSelections, registration, existing);
  const registrationAnswers = resolveRegistrationAnswers(existing, body.registrationAnswers, registration, existing);
  assertLicenseMatchesTournament(existing, registration);
  await assertNoDuplicateTeamName(db, existing.tournament_id, registration.teamName, existing.id);
  await assertNoDuplicatePlayer(db, existing.tournament_id, registration, existing.id);
  const now = new Date().toISOString();
  const confirmedAt = registration.status === 'confirmed' ? existing.confirmed_at || now : null;

  await db
    .prepare(
      `UPDATE registrations
       SET first_name = ?, last_name = ?, email = ?, club = ?, license_nr = ?,
           partner_first_name = ?, partner_last_name = ?, partner_email = ?, partner_license_nr = ?,
           partner2_first_name = ?, partner2_last_name = ?, partner2_email = ?, partner2_license_nr = ?,
           team_name = ?, seeding_position = ?, status = ?, is_vip = ?, fee_selections = ?, registration_answers = ?, confirmed_at = ?, updated_at = ?
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
      JSON.stringify(feeSelections),
      JSON.stringify(registrationAnswers),
      confirmedAt,
      now,
      existing.id,
    )
    .run();

  if (registration.isVip && Number(existing.max_registrations)) {
    await enforceVipPriorityOnUpdate(env, existing, new URL(request.url).origin);
  }

  const updated = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(existing.id).first();
  if (updated.status !== existing.status) {
    await createSystemNotification(env, existing.owner_id, 'registration_status_changed', { tournamentName: existing.name, status: updated.status, participant: `${updated.first_name} ${updated.last_name}` });
    await notifyUserByEmail(env, updated.email, 'registration_status_changed', { tournamentName: existing.name, status: updated.status }, undefined, existing.owner_id);
    if (existing.status !== 'confirmed' && updated.status === 'confirmed') {
      try {
        await sendRegistrationConfirmationEmail(env, { ...existing, id: existing.tournament_id }, updated, new URL(request.url).origin);
      } catch (error) {
        console.error(`Failed to send registration confirmation email for registration ${updated.id}`, error);
      }
    }
  }
  return json({ registration: toManagedRegistration(updated) });
}

function assertRegistrationOnlineEditable(registration) {
  if (Number(registration.desktop_execution || 0) === 1) {
    throw new HttpError(409, 'Die Meldeliste wird nach Turnierstart ausschließlich im Turnierdokument geführt.');
  }
}

/**
 * Teilnahme während der Turnierdurchführung (siehe migrations/0074): inactive / active /
 * withdrawn (ausgesetzt). Nur 'active' geht bei der nächsten Rundenauslosung in den Spielerpool
 * ein - analog zum Hauptprojekt, wo nur Meldungen mit Aktiv-Spalte 1 in die Paarungsbildung
 * einfließen. Der Anmeldestatus bleibt davon unberührt.
 */
async function setRegistrationParticipation(db, existing, participation) {
  const now = new Date().toISOString();
  await db.prepare('UPDATE registrations SET participation = ?, updated_at = ? WHERE id = ?').bind(participation, now, existing.id).run();
  const updated = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(existing.id).first();
  return json({ registration: toManagedRegistration(updated) });
}

async function enforceVipPriorityOnUpdate(env, existing, appOrigin) {
  const db = env.DB;
  const current = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(existing.id).first();
  if (!current || !Number(current.is_vip)) {
    return;
  }

  const tournament = {
    id: existing.tournament_id,
    owner_id: existing.owner_id,
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

async function approveApiKey(env, id, adminUserId) {
  const db = env.DB;
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
  await createSystemNotification(env, updated.user_id, 'api_key_status_changed', { status: 'approved', label: updated.label });
  return json({ apiKey: toPublicApiKey(updated) });
}

async function revokeApiKey(env, id) {
  const db = env.DB;
  const existing = await db.prepare('SELECT * FROM api_keys WHERE id = ?').bind(id).first();
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
  await createSystemNotification(env, existing.user_id, 'api_key_status_changed', { status: 'revoked', label: existing.label });
  return json({ ok: true });
}

async function adminCreateApiKey(db, request) {
  const body = await readJson(request);
  const label = String(body.label || '').trim();
  const userId = String(body.userId || '').trim();

  if (!userId) {
    throw new HttpError(400, 'Nutzer erforderlich');
  }
  if (label.length < 2 || label.length > 120) {
    throw new HttpError(400, 'Label muss zwischen 2 und 120 Zeichen enthalten');
  }

  const user = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (!user) {
    throw new HttpError(404, 'Nutzer nicht gefunden');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO api_keys (id, user_id, key_hash, label, status, requested_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    )
    .bind(id, userId, `pending:${id}`, label, now, now, now)
    .run();

  const created = await db.prepare('SELECT * FROM api_keys WHERE id = ?').bind(id).first();
  return json({ apiKey: toPublicApiKey(created) }, 201);
}

async function updateApiKeyLabel(db, id, request) {
  const body = await readJson(request);
  const label = String(body.label || '').trim();

  if (label.length < 2 || label.length > 120) {
    throw new HttpError(400, 'Label muss zwischen 2 und 120 Zeichen enthalten');
  }

  const now = new Date().toISOString();
  const result = await db.prepare('UPDATE api_keys SET label = ?, updated_at = ? WHERE id = ?').bind(label, now, id).run();
  if (result.meta.changes === 0) {
    throw new HttpError(404, 'API-Schlüssel nicht gefunden');
  }

  const updated = await db.prepare('SELECT * FROM api_keys WHERE id = ?').bind(id).first();
  return json({ apiKey: toPublicApiKey(updated) });
}

async function deleteApiKey(db, id) {
  const result = await db.prepare('DELETE FROM api_keys WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) {
    throw new HttpError(404, 'API-Schlüssel nicht gefunden');
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

  const tournament = await db.prepare('SELECT registration_questions FROM tournaments WHERE id = ?').bind(tournamentId).first();
  const questionLabels = new Map(registrationQuestionsFromRow(tournament || {}).map((question) => [question.id, question.label]));
  // Die Sync-API ist API-Key-geschützt. Sie liefert daher auch die organisatorischen
  // Anmeldedetails (Tarife und Antworten), damit das Turnierdokument einen vollständigen,
  // nachvollziehbaren Snapshot der Online-Meldung führen kann.
  const registrations = result.results.map((row) => {
    const registration = toManagedRegistration(row);
    return {
      ...registration,
      registrationAnswers: registration.registrationAnswers.map((answer) => ({
        ...answer,
        questionLabel: questionLabels.get(answer.questionId) || answer.questionId,
      })),
    };
  });
  const cursor = registrations.length > 0 ? registrations[registrations.length - 1].updatedAt : sinceIso;
  return json({ registrations, cursor });
}

async function syncPostResults(request, env, tournamentId) {
  const db = env.DB;
  const body = await readJson(request);
  const entries = Array.isArray(body.registrations) ? body.registrations : [];
  if (entries.length === 0) {
    throw new HttpError(400, 'Anmeldungen müssen als nicht-leeres Array übergeben werden');
  }

  const now = new Date().toISOString();
  const parsed = [];
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

    const participation = entry.participation === undefined || entry.participation === null
      ? null : parseParticipation(entry.participation, `Ungültige Teilnahme für Anmeldung ${id}`);

    const expectedExecutionRevision = entry.expectedExecutionRevision === undefined || entry.expectedExecutionRevision === null
      ? null : Number(entry.expectedExecutionRevision);
    if (expectedExecutionRevision !== null && (!Number.isInteger(expectedExecutionRevision) || expectedExecutionRevision < 1)) {
      throw new HttpError(400, `Ungültige Ausführungsrevision für Anmeldung ${id}`);
    }
    parsed.push({ id, status, seedingPosition, participation, expectedExecutionRevision });
  }

  const statusChangeIds = parsed.filter((entry) => entry.status !== null).map((entry) => entry.id);
  const expectedRevisionEntries = parsed.filter((entry) => entry.expectedExecutionRevision !== null);
  if (expectedRevisionEntries.length > 0) {
    const placeholders = expectedRevisionEntries.map(() => '?').join(', ');
    const currentRows = await db.prepare(`SELECT id, execution_revision FROM registrations
      WHERE tournament_id = ? AND id IN (${placeholders})`).bind(tournamentId, ...expectedRevisionEntries.map((entry) => entry.id)).all();
    const revisionById = new Map((currentRows.results || []).map((row) => [row.id, Number(row.execution_revision || 1)]));
    const conflict = expectedRevisionEntries.find((entry) => revisionById.get(entry.id) !== entry.expectedExecutionRevision);
    if (conflict) {
      throw new HttpError(409, 'Die Ausführungsdaten wurden zwischenzeitlich geändert', {
        code: 'execution_conflict', registrationId: conflict.id,
      });
    }
  }
  const previousById = new Map();
  if (statusChangeIds.length > 0) {
    const placeholders = statusChangeIds.map(() => '?').join(', ');
    const previousRows = await db
      .prepare(
        `SELECT r.*, t.name, t.owner_id, t.date, t.start_time, t.location, t.waitlist_enabled FROM registrations r JOIN tournaments t ON t.id = r.tournament_id
         WHERE r.tournament_id = ? AND r.id IN (${placeholders})`,
      )
      .bind(tournamentId, ...statusChangeIds)
      .all();
    for (const row of previousRows.results || []) {
      previousById.set(row.id, row);
    }
  }

  const updateStatement = db.prepare(
    `UPDATE registrations
     SET status = COALESCE(?, status),
         confirmed_at = CASE WHEN ? = 'confirmed' THEN COALESCE(confirmed_at, ?) WHEN ? IS NOT NULL THEN NULL ELSE confirmed_at END,
         seeding_position = ?, participation = COALESCE(?, participation), execution_revision = execution_revision + 1, updated_at = ?
     WHERE id = ? AND tournament_id = ? AND (? IS NULL OR execution_revision = ?)`,
  );
  const updateResults =
    parsed.length > 0
      ? await db.batch(parsed.map((entry) => updateStatement.bind(entry.status, entry.status, now, entry.status, entry.seedingPosition, entry.participation, now, entry.id, tournamentId, entry.expectedExecutionRevision, entry.expectedExecutionRevision)))
      : [];

  let updatedCount = 0;
  for (let index = 0; index < parsed.length; index += 1) {
    const entry = parsed[index];
    const changes = updateResults[index]?.meta?.changes || 0;
    if (!changes && entry.expectedExecutionRevision !== null) {
      throw new HttpError(409, 'Die Ausführungsdaten wurden zwischenzeitlich geändert', { code: 'execution_conflict', registrationId: entry.id });
    }
    updatedCount += changes;

    const previous = previousById.get(entry.id);
    // Der Dokument-Sync löst keine E-Mails aus; Notifications wären ebenfalls
    // ein Retry-Seiteneffekt und bleiben deshalb einem expliziten API-Aufruf vorbehalten.
    if (previous && previous.status !== entry.status && changes && entry.notify === true) {
      await createSystemNotification(env, previous.owner_id, 'registration_status_changed', { tournamentName: previous.name, status: entry.status, participant: `${previous.first_name} ${previous.last_name}` });
      await notifyUserByEmail(env, previous.email, 'registration_status_changed', { tournamentName: previous.name, status: entry.status }, undefined, previous.owner_id);
      if (previous.status !== 'confirmed' && entry.status === 'confirmed') {
        try {
          await sendRegistrationConfirmationEmail(env, { ...previous, id: tournamentId }, previous, APP_ORIGIN);
        } catch (error) {
          console.error(`Failed to send synced registration confirmation email for registration ${previous.id}`, error);
        }
      }
    }
  }

  return json({ updatedCount });
}

async function sendViaResend(env, { to, subject, body, html, attachments, failureContext }) {
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
        text: body,
        html,
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

async function sendViaStrato(env, { to, subject, body, html, attachments }) {
  const { WorkerMailer } = await import('worker-mailer');
  const mailer = await WorkerMailer.connect({
    credentials: {
      username: env.STRATO_SMTP_USER,
      password: env.STRATO_SMTP_PASSWORD,
    },
    authType: 'plain',
    host: env.STRATO_SMTP_HOST || 'smtp.strato.de',
    port: Number(env.STRATO_SMTP_PORT) || 465,
    secure: true,
    startTls: false,
  });

  try {
    await mailer.send({
      from: env.STRATO_MAIL_FROM || env.MAIL_FROM,
      to,
      subject,
      text: body,
      html,
      ...(attachments ? { attachments } : {}),
    });
  } finally {
    await mailer.close?.();
  }
}

function stratoConfigured(env) {
  return Boolean(env.STRATO_SMTP_USER && env.STRATO_SMTP_PASSWORD);
}

const GOOGLE_MAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

function isGoogleMailRecipient(to) {
  const domain = String(to || '').split('@')[1]?.toLowerCase();
  return Boolean(domain && GOOGLE_MAIL_DOMAINS.has(domain));
}

async function sendTransactionalEmail(env, { to, subject, text, language = 'de', attachments, logFallback, failureContext, allowLogFallback = false }) {
  const stratoAvailable = stratoConfigured(env);
  const resendAvailable = Boolean(env.RESEND_API_KEY && env.MAIL_FROM);

  if (!stratoAvailable && !resendAvailable) {
    console.log(logFallback);
    if (allowLogFallback) {
      return;
    }
    throw new HttpError(503, 'E-Mail-Versand ist nicht konfiguriert.');
  }

  const body = appendEmailFooter(text, language);
  const html = renderTransactionalEmailHtml(subject, text, language);

  // Strato (Absender ptmonline@bclinden.de) hat kein SPF/DKIM-Alignment für sein
  // DMARC(p=reject)-Setup - Strato nimmt die Mail zwar an, Google verwirft sie
  // danach aber still. Für Gmail/Googlemail-Empfänger deshalb Resend zuerst
  // (ptmonline.org ist dort sauber mit SPF/DKIM verifiziert), für alle anderen
  // Empfänger bleibt Strato primär. Jeweils mit Fallback auf den anderen Anbieter.
  const preferResend = isGoogleMailRecipient(to);
  const primaryAvailable = preferResend ? resendAvailable : stratoAvailable;
  const fallbackAvailable = preferResend ? stratoAvailable : resendAvailable;
  const sendPrimary = () => (preferResend
    ? sendViaResend(env, { to, subject, body, html, attachments, failureContext })
    : sendViaStrato(env, { to, subject, body, html, attachments }));
  const sendFallback = () => (preferResend
    ? sendViaStrato(env, { to, subject, body, html, attachments })
    : sendViaResend(env, { to, subject, body, html, attachments, failureContext }));

  if (primaryAvailable) {
    try {
      await sendPrimary();
      return;
    } catch (error) {
      console.error(`${preferResend ? 'Resend' : 'Strato'} failed to send ${failureContext}, falling back to ${preferResend ? 'Strato' : 'Resend'}`, error);
      if (!fallbackAvailable) {
        throw error instanceof HttpError ? error : new HttpError(503, 'E-Mail konnte nicht versendet werden.');
      }
    }
  }

  await sendFallback();
}

// Wird von Mengen-Versandstellen (Reminder-Cron, Broadcast, Bulk-Status-Update) genutzt,
// damit der eigentliche Versand gedrosselt über den Queue-Consumer (queue()) läuft statt
// den Mailserver mit vielen Sends ohne Pause zu belasten. Einzelne, latenzkritische Flows
// (Passwort-Reset, E-Mail-/Report-Verifizierung) rufen weiterhin sendTransactionalEmail direkt.
async function enqueueTransactionalEmail(env, payload) {
  await env.MAIL_QUEUE.send(payload);
}

// Nutzt dieselbe Queue/denselben Consumer wie enqueueTransactionalEmail, damit auch
// Push-Fan-out bei Broadcasts (z. B. an alle Teilnehmer eines Turniers) gedrosselt statt
// unbegrenzt parallel läuft, ohne eine eigene Queue-Infrastruktur anzulegen.
async function enqueuePushNotification(env, { userId, payload }) {
  await env.MAIL_QUEUE.send({ kind: 'push', userId, payload });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAIL_QUEUE_SEND_DELAY_MS = 2000;

async function processMailQueueBatch(batch, env) {
  for (const message of batch.messages) {
    try {
      if (message.body?.kind === 'push') {
        await sendPushNotifications(env, message.body.userId, message.body.payload);
      } else {
        await sendTransactionalEmail(env, message.body);
      }
      message.ack();
    } catch (error) {
      console.error(`Queued ${message.body?.kind === 'push' ? 'push' : 'email'} delivery failed for ${message.body?.kind === 'push' ? message.body?.userId : (message.body?.failureContext || message.body?.to)}`, error);
      message.retry({ delaySeconds: 10 });
    }
    await sleep(MAIL_QUEUE_SEND_DELAY_MS);
  }
}

function reorderHouseNumberInDisplayName(displayName, address) {
  const houseNumber = address?.house_number;
  const road = address?.road;
  if (!houseNumber || !road) {
    return displayName;
  }
  return formatLocationAddress(displayName);
}

async function geocodeLocation(query, { limit = 5, countryCode } = {}) {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    return [];
  }

  let response;
  try {
    response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=${limit}&addressdetails=1&q=${encodeURIComponent(trimmed)}`,
      {
        headers: {
          'User-Agent': 'Petanque-Turnier-Manager-Online (https://github.com/massee/Petanque-Turnier-Manager-Online)',
          Accept: 'application/json',
        },
      },
    );
  } catch (error) {
    console.error(`Geocoding request failed for "${trimmed}"`, error);
    return [];
  }

  if (!response.ok) {
    console.error(`Geocoding failed for "${trimmed}": ${response.status}`);
    return [];
  }

  const rawResults = await response.json().catch(() => []);
  const matches = Array.isArray(rawResults) ? rawResults : [];

  const results = matches
    .map((match) => ({
      lat: Number(match.lat),
      lng: Number(match.lon),
      displayName: reorderHouseNumberInDisplayName(match.display_name || trimmed, match.address),
      countryCode: (match.address?.country_code || '').toUpperCase(),
    }))
    .filter((match) => Number.isFinite(match.lat) && Number.isFinite(match.lng));

  const hint = String(countryCode || '').toUpperCase();
  if (hint) {
    results.sort((a, b) => (b.countryCode === hint) - (a.countryCode === hint));
  }

  return results;
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

async function initialRegistrationStatus(db, tournament, isVip, confirmImmediately = false) {
  // Die Schnellaufnahme in der Turnierdurchführung ist ausschließlich für
  // berechtigte Turnierleiter erreichbar. Sie darf einen Spieler unmittelbar
  // in die nächste Auslosung übernehmen, ohne die öffentliche Freigabe-Regel
  // für Selbstanmeldungen zu verändern.
  const initialStatus = confirmImmediately || !Number(tournament.approval_required || 0) ? 'confirmed' : 'pending';
  if (!Number(tournament.max_registrations)) {
    return { status: initialStatus, displace: null };
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
    return { status: initialStatus, displace: null };
  }
  if (isVip) {
    const displace = await findDisplaceableNonVip(db, tournament.id, null);
    if (displace) {
      return { status: initialStatus, displace };
    }
  }
  if (!Number(tournament.waitlist_enabled ?? 1)) {
    throw new HttpError(403, 'Das Turnier ist ausgebucht. Eine Warteliste ist für dieses Turnier nicht aktiviert.');
  }
  return { status: 'waitlist', displace: null };
}

async function addTournamentEditor(request, db, tournament, actingUser) {
  const body = await readJson(request);
  const userId = String(body.userId || '').trim();
  if (!userId) {
    throw new HttpError(400, 'Bitte wähle einen Benutzer aus');
  }
  if (userId === tournament.owner_id) {
    throw new HttpError(400, 'Der Owner hat bereits Zugriff auf dieses Turnier');
  }
  const targetUser = await db.prepare('SELECT id, role FROM users WHERE id = ?').bind(userId).first();
  if (!targetUser || targetUser.role !== 'user') {
    throw new HttpError(404, 'Benutzer nicht gefunden');
  }
  if (tournamentEditorIds(tournament).includes(userId)) {
    throw new HttpError(409, 'Dieser Benutzer hat bereits Bearbeitungsrechte für dieses Turnier');
  }
  await db
    .prepare('INSERT INTO tournament_editors (id, tournament_id, user_id, granted_by, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), tournament.id, userId, actingUser.id, new Date().toISOString())
    .run();
  const updated = await getTournamentById(db, tournament.id);
  return json({ editors: tournamentEditors(updated) }, 201);
}

/**
 * Admin-only Ownership-Wechsel: setzt owner_id auf einen beliebigen bestehenden User.
 * creator_id (rein informativ, wer urspruenglich erstellt hat) bleibt unangetastet.
 */
async function updateTournamentOwner(request, db, tournament) {
  const body = await readJson(request);
  const userId = String(body.userId || '').trim();
  if (!userId) {
    throw new HttpError(400, 'Bitte wähle einen Benutzer aus');
  }
  const targetUser = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (!targetUser) {
    throw new HttpError(404, 'Benutzer nicht gefunden');
  }
  const now = new Date().toISOString();
  await db.prepare('UPDATE tournaments SET owner_id = ?, updated_at = ? WHERE id = ?').bind(userId, now, tournament.id).run();
  // Der neue Owner hat ohnehin volle Rechte - ein doppelter Editor-Eintrag ist redundant.
  await db.prepare('DELETE FROM tournament_editors WHERE tournament_id = ? AND user_id = ?').bind(tournament.id, userId).run();
  return await getTournamentById(db, tournament.id);
}

async function getTournamentById(db, id) {
  return db
    .prepare(
      `SELECT tournaments.*,
        ${TOURNAMENT_EDITORS_JSON_SUBQUERY},
        ${TOURNAMENT_VENUE_CLUB_LOGO_SUBQUERY},
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
       WHERE tournaments.id = ?`,
    )
    .bind(id)
    .first();
}

function clubCanEdit(club, user) {
  return user?.role === 'admin' || club.owner_id === user?.id || Boolean(club.editor_user_id);
}

const VENUE_TYPES = new Set(['outdoor', 'indoor']);
const FACILITY_CODES = new Set(['toilet', 'shelter', 'clubhouse', 'lighting', 'parking', 'catering', 'drinking_water', 'accessible']);

function venueType(value) {
  const normalized = String(value || 'outdoor').trim();
  if (!VENUE_TYPES.has(normalized)) throw new HttpError(400, 'Ungültiger Spielorttyp', { field: 'venueType' });
  return normalized;
}

function facilityCodes(value) {
  const values = Array.isArray(value) ? value : [];
  const result = [...new Set(values.map((entry) => String(entry || '').trim()).filter(Boolean))];
  if (result.some((entry) => !FACILITY_CODES.has(entry))) throw new HttpError(400, 'Ungültige Ausstattung', { field: 'facilityCodes' });
  return result;
}

function rowFacilityCodes(row) {
  try {
    const values = JSON.parse(row.facility_codes || '[]');
    return Array.isArray(values) ? values.filter((entry) => FACILITY_CODES.has(entry)) : [];
  } catch { return []; }
}

const SOCIAL_PLATFORMS = new Set(['facebook', 'instagram', 'x', 'youtube']);

function socialLinks(value) {
  const entries = value && typeof value === 'object' ? value : {};
  const result = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const url = normalizePresentationUrl(entries[platform], 'socialLinks');
    if (url) result[platform] = url;
  }
  return result;
}

function rowSocialLinks(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? Object.fromEntries(Object.entries(parsed).filter(([platform]) => SOCIAL_PLATFORMS.has(platform))) : {};
  } catch { return {}; }
}

const MEMBER_OF_MAX_ENTRIES = 10;
const MEMBER_OF_MAX_LENGTH = 120;

function memberOf(value) {
  const values = Array.isArray(value) ? value : [];
  const result = [...new Set(values.map((entry) => String(entry || '').trim()).filter(Boolean))].slice(0, MEMBER_OF_MAX_ENTRIES);
  if (result.some((entry) => entry.length > MEMBER_OF_MAX_LENGTH)) throw new HttpError(400, 'Verbandsname zu lang', { field: 'memberOf' });
  return result;
}

function rowMemberOf(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch { return []; }
}

function toPublicBoulePlace(row, user) {
  const canEdit = row.club_id ? clubCanEdit(row, user) : Boolean(user?.role === 'admin' || (row.reported_by_user_id && row.reported_by_user_id === user?.id));
  return {
    id: row.id, clubId: row.club_id, clubName: row.club_display_name || row.club_name || null, clubKind: row.club_kind || 'club', clubDescription: row.club_description || null, clubLogoUrl: row.club_logo_url || null, clubWebsiteUrl: row.club_website_url || null, clubSocialLinks: rowSocialLinks(row.club_social_links), venueType: row.venue_type || 'outdoor', name: row.name, address: formatLocationAddress(row.address),
    latitude: row.latitude === null ? null : Number(row.latitude), longitude: row.longitude === null ? null : Number(row.longitude),
    courtCount: Number(row.court_count || 0), description: row.description || null, accessible: Boolean(Number(row.accessible)),
    facilities: row.facilities || null, facilityCodes: rowFacilityCodes(row), status: row.status, likeCount: Number(row.like_count || 0), liked: Boolean(Number(row.liked || 0)),
    favorited: Boolean(Number(row.favorited || 0)),
    canEdit,
  };
}

function toPublicClub(row, user) {
  return {
    id: row.id, name: row.name, description: row.description || null, websiteUrl: row.website_url || null, logoUrl: row.logo_url || null,
    contactName: row.contact_name || null, contactEmail: row.contact_email || null, contactPhone: row.contact_phone || null,
    socialLinks: rowSocialLinks(row.social_links), memberOf: rowMemberOf(row.member_of),
    kind: row.kind || 'club', status: row.status, canEdit: clubCanEdit(row, user), ownerId: row.owner_id,
  };
}

async function listBoulePlaces(db, user, query) {
  const term = String(query || '').trim();
  const rows = await db.prepare(
    `SELECT p.*, c.name AS club_display_name, c.kind AS club_kind, c.description AS club_description, c.logo_url AS club_logo_url, c.website_url AS club_website_url, c.social_links AS club_social_links, c.owner_id,
       EXISTS(SELECT 1 FROM club_editors ce WHERE ce.club_id = c.id AND ce.user_id = ?1) AS editor_user_id,
       (SELECT COUNT(*) FROM boule_place_likes l WHERE l.place_id = p.id) AS like_count,
       EXISTS(SELECT 1 FROM boule_place_likes l WHERE l.place_id = p.id AND l.user_id = ?1) AS liked,
       EXISTS(SELECT 1 FROM boule_place_favorites f WHERE f.place_id = p.id AND f.user_id = ?1) AS favorited
     FROM boule_places p LEFT JOIN clubs c ON c.id = p.club_id
     WHERE p.status = 'published' AND (p.club_id IS NULL OR c.status = 'published')
       AND (?2 = '' OR p.name LIKE '%' || ?2 || '%' COLLATE NOCASE OR c.name LIKE '%' || ?2 || '%' COLLATE NOCASE OR p.club_name LIKE '%' || ?2 || '%' COLLATE NOCASE OR p.address LIKE '%' || ?2 || '%' COLLATE NOCASE)
     ORDER BY COALESCE(c.name, p.club_name) COLLATE NOCASE, p.name COLLATE NOCASE`).bind(user?.id || '', term).all();
  return json({ places: (rows.results || []).map((row) => toPublicBoulePlace(row, user)) });
}

async function getClub(db, id, user) {
  const club = await db.prepare(`SELECT c.*, EXISTS(SELECT 1 FROM club_editors ce WHERE ce.club_id = c.id AND ce.user_id = ?2) AS editor_user_id FROM clubs c WHERE c.id = ?1`).bind(id, user?.id || '').first();
  if (!club || (club.status !== 'published' && !clubCanEdit(club, user))) throw new HttpError(404, 'Verein nicht gefunden');
  const places = await db.prepare(
    `SELECT p.*, c.name AS club_name, c.kind AS club_kind, c.description AS club_description, c.logo_url AS club_logo_url, c.social_links AS club_social_links, c.owner_id, EXISTS(SELECT 1 FROM club_editors ce WHERE ce.club_id = c.id AND ce.user_id = ?2) AS editor_user_id,
      (SELECT COUNT(*) FROM boule_place_likes l WHERE l.place_id = p.id) AS like_count,
      EXISTS(SELECT 1 FROM boule_place_likes l WHERE l.place_id = p.id AND l.user_id = ?2) AS liked,
      EXISTS(SELECT 1 FROM boule_place_favorites f WHERE f.place_id = p.id AND f.user_id = ?2) AS favorited
     FROM boule_places p JOIN clubs c ON c.id = p.club_id WHERE p.club_id = ?1 AND (p.status = 'published' OR ?3 = 1) ORDER BY p.name COLLATE NOCASE`).bind(id, user?.id || '', clubCanEdit(club, user) ? 1 : 0).all();
  return json({ club: toPublicClub(club, user), places: (places.results || []).map((row) => toPublicBoulePlace(row, user)) });
}

function clubInput(body) {
  const name = text(body.name);
  if (name.length < 2) throw new HttpError(400, 'Der Vereinsname muss mindestens 2 Zeichen enthalten', { field: 'name' });
  const contactName = text(body.contactName);
  if (contactName.length < 2) throw new HttpError(400, 'Der Kontaktname muss mindestens 2 Zeichen enthalten', { field: 'contactName' });
  const contactEmail = text(body.contactEmail);
  if (!isEmail(contactEmail)) throw new HttpError(400, 'Eine gültige Kontakt-E-Mail ist erforderlich', { field: 'contactEmail' });
  const kind = String(body.kind || 'club').trim();
  if (!['club', 'group'].includes(kind)) throw new HttpError(400, 'Ungültiger Organisationstyp', { field: 'kind' });
  return { name, kind, description: normalizeRichText(body.description, 'Ungültige Organisationsbeschreibung'), websiteUrl: normalizePresentationUrl(body.websiteUrl, 'websiteUrl'), logoUrl: normalizePresentationUrl(body.logoUrl, 'logoUrl'), socialLinks: socialLinks(body.socialLinks), memberOf: memberOf(body.memberOf), contactName, contactEmail, contactPhone: nullableText(body.contactPhone) };
}

async function assertNoDuplicateBoulePlace(db, input, excludeId = '') {
  const existing = await db.prepare('SELECT id FROM boule_places WHERE lower(trim(name)) = lower(trim(?)) AND lower(trim(address)) = lower(trim(?)) AND venue_type = ? AND id != ?').bind(input.name, input.address, input.venueType, excludeId).first();
  if (existing) throw new HttpError(409, 'Dieser Bouleplatz ist bereits vorhanden');
}

async function createClub(request, db, user) {
  const body = await readJson(request);
  const input = clubInput(body);
  if (!body.venue || typeof body.venue !== 'object') throw new HttpError(400, 'Für eine Organisation ist ein Spielort erforderlich', { field: 'venue' });
  const venue = await placeInput(body.venue, request.headers?.get?.('CF-IPCountry'));
  const existingClub = await db.prepare('SELECT id FROM clubs WHERE lower(trim(name)) = lower(trim(?))').bind(input.name).first();
  if (existingClub) throw new HttpError(409, 'Dieser Verein oder diese Gruppe ist bereits vorhanden');
  await assertNoDuplicateBoulePlace(db, venue);
  const now = new Date().toISOString(); const id = crypto.randomUUID(); const venueId = crypto.randomUUID();
  await db.batch([
    db.prepare('INSERT INTO clubs (id, name, kind, description, website_url, logo_url, social_links, member_of, contact_name, contact_email, contact_phone, status, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'pending\', ?, ?, ?)').bind(id, input.name, input.kind, input.description, input.websiteUrl, input.logoUrl, JSON.stringify(input.socialLinks), JSON.stringify(input.memberOf), input.contactName, input.contactEmail, input.contactPhone, user.id, now, now),
    db.prepare('INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, venue_type, court_count, description, accessible, facilities, facility_codes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'pending\', ?, ?)').bind(venueId, id, venue.name, venue.address, venue.latitude, venue.longitude, venue.venueType, venue.courtCount, venue.description, venue.accessible ? 1 : 0, venue.facilities, JSON.stringify(venue.facilityCodes), now, now),
  ]);
  return json({ club: toPublicClub(await db.prepare('SELECT * FROM clubs WHERE id = ?').bind(id).first(), user), venueId }, 201);
}

async function assertClubEditor(db, clubId, user) {
  const club = await db.prepare('SELECT c.*, EXISTS(SELECT 1 FROM club_editors ce WHERE ce.club_id = c.id AND ce.user_id = ?2) AS editor_user_id FROM clubs c WHERE c.id = ?1').bind(clubId, user.id).first();
  if (!club) throw new HttpError(404, 'Verein nicht gefunden');
  if (!clubCanEdit(club, user)) throw new HttpError(403, 'Keine Bearbeitungsrechte für diesen Verein');
  return club;
}

async function assertClubOwner(db, clubId, user) {
  const club = await db.prepare('SELECT * FROM clubs WHERE id = ?').bind(clubId).first();
  if (!club) throw new HttpError(404, 'Organisation nicht gefunden');
  if (!(user?.role === 'admin' || club.owner_id === user?.id)) throw new HttpError(403, 'Nur der Owner darf Bearbeitungsrechte verwalten');
  return club;
}

async function updateClub(request, db, id, user) {
  const club = await assertClubEditor(db, id, user); const input = clubInput(await readJson(request)); const now = new Date().toISOString();
  // Bereits freigegebene Vereine bleiben bei Bearbeitung freigegeben, statt erneut zur Moderation zu müssen.
  const status = club.status === 'published' ? 'published' : 'pending';
  await db.prepare('UPDATE clubs SET name = ?, kind = ?, description = ?, website_url = ?, logo_url = ?, social_links = ?, member_of = ?, contact_name = ?, contact_email = ?, contact_phone = ?, status = ?, updated_at = ? WHERE id = ?').bind(input.name, input.kind, input.description, input.websiteUrl, input.logoUrl, JSON.stringify(input.socialLinks), JSON.stringify(input.memberOf), input.contactName, input.contactEmail, input.contactPhone, status, now, id).run();
  return await getClub(db, id, user);
}

async function deleteClub(db, id, user) {
  const club = await assertClubEditor(db, id, user);
  await db.batch([
    db.prepare('UPDATE boule_places SET club_id = NULL, reported_by_user_id = ?, updated_at = ? WHERE club_id = ?').bind(club.owner_id, new Date().toISOString(), id),
    db.prepare('DELETE FROM clubs WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

async function requestClubEditor(db, clubId, userId) {
  throw new HttpError(405, 'Bearbeitungsrechte werden direkt vom Owner vergeben');
}

async function listClubEditors(db, clubId, user) {
  await assertClubEditor(db, clubId, user);
  const rows = await db.prepare('SELECT u.id, u.first_name, u.last_name, u.email FROM club_editors ce JOIN users u ON u.id = ce.user_id WHERE ce.club_id = ? ORDER BY u.last_name, u.first_name').bind(clubId).all();
  return json({ editors: (rows.results || []).map((row) => ({ id: row.id, name: `${row.first_name} ${row.last_name}`.trim(), email: row.email })) });
}

async function addClubEditor(request, db, clubId, user) {
  const club = await assertClubOwner(db, clubId, user);
  const body = await readJson(request); const userId = text(body.userId); const email = text(body.email).toLowerCase();
  const target = userId
    ? await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first()
    : await db.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(email).first();
  if (!target) throw new HttpError(404, 'Benutzer nicht gefunden');
  if (club.owner_id === target.id) throw new HttpError(400, 'Der Owner hat bereits alle Bearbeitungsrechte');
  await db.prepare('INSERT OR IGNORE INTO club_editors (club_id, user_id, approved_by, approved_at) VALUES (?, ?, ?, ?)').bind(clubId, target.id, user.id, new Date().toISOString()).run();
  return json({ ok: true });
}

async function removeClubEditor(db, clubId, userId, user) {
  const club = await assertClubOwner(db, clubId, user);
  if (club.owner_id === userId) throw new HttpError(400, 'Der Owner kann nicht als Bearbeiter entfernt werden');
  await db.prepare('DELETE FROM club_editors WHERE club_id = ? AND user_id = ?').bind(clubId, userId).run();
  return json({ ok: true });
}

async function placeInput(body, countryCode) {
  const name = text(body.name); const address = text(body.address); if (name.length < 2 || address.length < 5) throw new HttpError(400, 'Name und vollständige Adresse des Platzes sind erforderlich');
  // Die Adresse ist die Quelle der Wahrheit. Client-Koordinaten wären sonst auch
  // außerhalb der LocationAutocomplete-Oberfläche frei fälschbar.
  const [geo] = await geocodeLocation(address, { countryCode, limit: 1 });
  if (!geo) throw new HttpError(400, 'Kein Ort gefunden.');
  const { lat: latitude, lng: longitude } = geo;
  const codes = facilityCodes(body.facilityCodes);
  const accessible = codes.includes('accessible') || Boolean(body.accessible);
  if (accessible && !codes.includes('accessible')) codes.push('accessible');
  return { name, address, latitude, longitude, venueType: venueType(body.venueType), courtCount: nonNegativeInteger(body.courtCount), description: normalizeRichText(body.description, 'Ungültige Platzbeschreibung'), accessible, facilities: nullableText(body.facilities), facilityCodes: codes };
}

async function createBoulePlace(request, db, clubId, user, countryCode) {
  const club = await assertClubEditor(db, clubId, user); const input = await placeInput(await readJson(request), countryCode); const id = crypto.randomUUID(); const now = new Date().toISOString();
  // Neue Plätze eines bereits freigegebenen Vereins gehen direkt live, statt erneut zur Moderation zu müssen.
  const status = club.status === 'published' ? 'published' : 'pending';
  const exists = await db.prepare('SELECT id FROM boule_places WHERE club_id = ? AND venue_type = ?').bind(clubId, input.venueType).first();
  if (exists) throw new HttpError(409, 'Diese Organisation hat bereits einen Spielort dieses Typs');
  await assertNoDuplicateBoulePlace(db, input);
  await db.prepare('INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, venue_type, court_count, description, accessible, facilities, facility_codes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, clubId, input.name, input.address, input.latitude, input.longitude, input.venueType, input.courtCount, input.description, input.accessible ? 1 : 0, input.facilities, JSON.stringify(input.facilityCodes), status, now, now).run();
  return json({ id }, 201);
}

async function createIndependentBoulePlace(request, db, user, countryCode) {
  const input = await placeInput(await readJson(request), countryCode); const id = crypto.randomUUID(); const now = new Date().toISOString();
  await assertNoDuplicateBoulePlace(db, input);
  await db.prepare("INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, venue_type, court_count, description, accessible, facilities, facility_codes, status, reported_by_user_id, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)")
    .bind(id, input.name, input.address, input.latitude, input.longitude, input.venueType, input.courtCount, input.description, input.accessible ? 1 : 0, input.facilities, JSON.stringify(input.facilityCodes), user.id, now, now).run();
  return json({ id }, 201);
}

async function assertBoulePlaceEditor(db, id, user) {
  const place = await db.prepare('SELECT club_id, reported_by_user_id, venue_type FROM boule_places WHERE id = ?').bind(id).first();
  if (!place) throw new HttpError(404, 'Bouleplatz nicht gefunden');
  let club = null;
  if (place.club_id) {
    club = await assertClubEditor(db, place.club_id, user);
  } else if (!(user?.role === 'admin' || (place.reported_by_user_id && place.reported_by_user_id === user.id))) {
    throw new HttpError(403, 'Keine Bearbeitungsrechte für diesen Bouleplatz');
  }
  return { ...place, club };
}

async function updateBoulePlace(request, db, id, user, countryCode) {
  const { club, venue_type: currentVenueType } = await assertBoulePlaceEditor(db, id, user);
  const input = await placeInput(await readJson(request), countryCode);
  // Plätze eines bereits freigegebenen Vereins bleiben bei Bearbeitung freigegeben, statt erneut zur Moderation zu müssen.
  const status = club ? (club.status === 'published' ? 'published' : 'pending') : 'published';
  if (club && input.venueType !== currentVenueType) {
    const conflict = await db.prepare('SELECT id FROM boule_places WHERE club_id = ? AND venue_type = ? AND id != ?').bind(club.id, input.venueType, id).first();
    if (conflict) throw new HttpError(409, 'Diese Organisation hat bereits einen Spielort dieses Typs');
  }
  await assertNoDuplicateBoulePlace(db, input, id);
  await db.prepare('UPDATE boule_places SET name = ?, address = ?, latitude = ?, longitude = ?, venue_type = ?, court_count = ?, description = ?, accessible = ?, facilities = ?, facility_codes = ?, status = ?, updated_at = ? WHERE id = ?').bind(input.name, input.address, input.latitude, input.longitude, input.venueType, input.courtCount, input.description, input.accessible ? 1 : 0, input.facilities, JSON.stringify(input.facilityCodes), status, new Date().toISOString(), id).run(); return json({ ok: true });
}

async function deleteBoulePlace(db, id, user) {
  await assertBoulePlaceEditor(db, id, user);
  await db.prepare('DELETE FROM boule_places WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function getPlaceReportByToken(db, token) {
  const place = await db.prepare('SELECT id, name, address, court_count, description, accessible, facilities FROM boule_places WHERE edit_token = ?').bind(token).first();
  if (!place) throw new HttpError(404, 'Bouleplatz nicht gefunden');
  return json({
    id: place.id,
    name: place.name,
    address: place.address,
    courtCount: place.court_count,
    description: place.description || '',
    accessible: Boolean(place.accessible),
    facilities: place.facilities || '',
  });
}

async function updatePlaceReportByToken(request, db, token, countryCode) {
  const place = await db.prepare('SELECT id FROM boule_places WHERE edit_token = ?').bind(token).first();
  if (!place) throw new HttpError(404, 'Bouleplatz nicht gefunden');
  const input = await placeInput(await readJson(request), countryCode);
  await db.prepare("UPDATE boule_places SET name = ?, address = ?, latitude = ?, longitude = ?, court_count = ?, description = ?, accessible = ?, facilities = ?, status = 'pending', updated_at = ? WHERE id = ?").bind(input.name, input.address, input.latitude, input.longitude, input.courtCount, input.description, input.accessible ? 1 : 0, input.facilities, new Date().toISOString(), place.id).run();
  return json({ ok: true });
}

async function listMyPlaceReports(db, userId) {
  const rows = await db.prepare('SELECT * FROM boule_places WHERE reported_by_user_id = ? ORDER BY created_at DESC').bind(userId).all();
  return json({ places: (rows.results || []).map((row) => toPublicBoulePlace(row, { id: userId })) });
}

// Alle über "Bouleplatz melden" ohne Verein eingereichten Plätze, jeder Status - im
// Unterschied zu listPendingBoulePlaces auch bereits veröffentlichte, da diese ohne
// Admin-Schritt live gehen (s. createPlaceReport) und trotzdem korrigierbar bleiben müssen.
async function listPlaceReportsForAdmin(db) {
  const rows = await db.prepare("SELECT * FROM boule_places WHERE club_id IS NULL ORDER BY created_at DESC").all();
  return json({ places: (rows.results || []).map((row) => toPublicBoulePlace(row, null)) });
}

async function listAllBoulePlacesForAdmin(db) {
  const rows = await db.prepare(
    `SELECT p.*, c.name AS club_display_name, c.kind AS club_kind, c.logo_url AS club_logo_url,
       c.website_url AS club_website_url, c.social_links AS club_social_links, c.owner_id
     FROM boule_places p LEFT JOIN clubs c ON c.id = p.club_id
     ORDER BY p.created_at DESC`).all();
  return json({ places: (rows.results || []).map((row) => toPublicBoulePlace(row, { role: 'admin' })) });
}

async function toggleBoulePlaceLike(db, placeId, userId) {
  const place = await db.prepare("SELECT p.id FROM boule_places p LEFT JOIN clubs c ON c.id = p.club_id WHERE p.id = ? AND p.status = 'published' AND (p.club_id IS NULL OR c.status = 'published')").bind(placeId).first(); if (!place) throw new HttpError(404, 'Bouleplatz nicht gefunden');
  const liked = await db.prepare('SELECT 1 FROM boule_place_likes WHERE place_id = ? AND user_id = ?').bind(placeId, userId).first();
  if (liked) await db.prepare('DELETE FROM boule_place_likes WHERE place_id = ? AND user_id = ?').bind(placeId, userId).run(); else await db.prepare('INSERT INTO boule_place_likes (place_id, user_id, created_at) VALUES (?, ?, ?)').bind(placeId, userId, new Date().toISOString()).run();
  const count = await db.prepare('SELECT COUNT(*) AS count FROM boule_place_likes WHERE place_id = ?').bind(placeId).first(); return json({ liked: !liked, likeCount: Number(count.count) });
}

const PLAYER_LISTING_LIMIT = 5;

function toPublicPlayerListing(row, includeOwner = false) {
  return {
    id: row.id, ...(includeOwner ? { userId: row.user_id } : {}), type: row.type, title: row.title, description: row.description || null,
    locationName: formatLocationAddress(row.location_name), latitude: Number(row.latitude), longitude: Number(row.longitude),
    eventDate: row.event_date || null, ...(includeOwner && row.owner_first_name ? { ownerName: `${row.owner_first_name} ${row.owner_last_name}` } : {}),
    playingPosition: row.playing_position,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function playerListingInput(body, countryCode) {
  const type = text(body.type);
  if (type !== 'tournament' && type !== 'training') throw new HttpError(400, 'Bitte wähle einen Typ');
  const title = text(body.title); if (title.length < 2) throw new HttpError(400, 'Bitte gib einen Titel ein');
  const locationName = text(body.locationName); if (locationName.length < 2) throw new HttpError(400, 'Bitte gib einen Ort ein');
  const eventDate = type === 'tournament' ? text(body.eventDate) : '';
  const playingPosition = normalizePlayerListingPosition(body.playingPosition);
  if (type === 'tournament' && !eventDate) throw new HttpError(400, 'Bitte gib ein Datum an');
  const [geo] = await geocodeLocation(locationName, { countryCode, limit: 1 });
  if (!geo) throw new HttpError(400, 'Kein Ort gefunden.');
  return { type, title, description: normalizeRichText(body.description, 'Ungültige Beschreibung'), locationName, latitude: geo.lat, longitude: geo.lng, eventDate: eventDate || null, playingPosition };
}

async function listPlayerListings(db, user, searchParams) {
  const term = String(searchParams.get('q') || '').trim();
  const typeFilter = String(searchParams.get('type') || '').trim();
  const playingPositionFilter = String(searchParams.get('playingPosition') || '').trim();
  const rows = await db.prepare(
    `SELECT l.*, u.first_name AS owner_first_name, u.last_name AS owner_last_name
     FROM player_listings l JOIN users u ON u.id = l.user_id
     WHERE (l.type = 'training' OR (l.type = 'tournament' AND l.event_date >= date('now')))
       AND (?1 = '' OR l.type = ?1)
       AND (?2 = '' OR l.title LIKE '%' || ?2 || '%' COLLATE NOCASE OR l.description LIKE '%' || ?2 || '%' COLLATE NOCASE OR l.location_name LIKE '%' || ?2 || '%' COLLATE NOCASE)
       AND (?3 = '' OR l.playing_position = ?3 OR l.playing_position = 'egal')
     ORDER BY l.created_at DESC`).bind(typeFilter, term, playingPositionFilter).all();
  return json({ listings: (rows.results || []).map((row) => toPublicPlayerListing(row, Boolean(user))) });
}

async function listMyPlayerListings(db, userId) {
  const rows = await db.prepare(
    `SELECT l.*, u.first_name AS owner_first_name, u.last_name AS owner_last_name
     FROM player_listings l JOIN users u ON u.id = l.user_id
     WHERE l.user_id = ? ORDER BY l.created_at DESC`).bind(userId).all();
  return json({ listings: (rows.results || []).map((row) => toPublicPlayerListing(row, true)) });
}

async function listAllPlayerListings(db) {
  const rows = await db.prepare(
    `SELECT l.*, u.first_name AS owner_first_name, u.last_name AS owner_last_name
     FROM player_listings l JOIN users u ON u.id = l.user_id
     ORDER BY l.created_at DESC`).all();
  return json({ listings: (rows.results || []).map((row) => toPublicPlayerListing(row, true)) });
}

async function createPlayerListing(request, db, user, countryCode) {
  const count = await db.prepare('SELECT COUNT(*) AS count FROM player_listings WHERE user_id = ?').bind(user.id).first();
  if (Number(count.count) >= PLAYER_LISTING_LIMIT) throw new HttpError(400, 'Du hast bereits die maximale Anzahl an Mitspielgesuchen erreicht');
  const input = await playerListingInput(await readJson(request), countryCode);
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.prepare('INSERT INTO player_listings (id, user_id, type, title, description, location_name, latitude, longitude, event_date, playing_position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.id, input.type, input.title, input.description, input.locationName, input.latitude, input.longitude, input.eventDate, input.playingPosition, now, now).run();
  return json({ id }, 201);
}

async function assertPlayerListingOwner(db, id, user) {
  const listing = await db.prepare('SELECT * FROM player_listings WHERE id = ?').bind(id).first();
  if (!listing) throw new HttpError(404, 'Mitspielgesuch nicht gefunden');
  if (!(user.role === 'admin' || listing.user_id === user.id)) throw new HttpError(403, 'Keine Bearbeitungsrechte für dieses Mitspielgesuch');
  return listing;
}

async function updatePlayerListing(request, db, id, user, countryCode) {
  await assertPlayerListingOwner(db, id, user);
  const input = await playerListingInput(await readJson(request), countryCode);
  await db.prepare('UPDATE player_listings SET type = ?, title = ?, description = ?, location_name = ?, latitude = ?, longitude = ?, event_date = ?, playing_position = ?, updated_at = ? WHERE id = ?')
    .bind(input.type, input.title, input.description, input.locationName, input.latitude, input.longitude, input.eventDate, input.playingPosition, new Date().toISOString(), id).run();
  return json({ ok: true });
}

async function deletePlayerListing(db, id, user) {
  await assertPlayerListingOwner(db, id, user);
  await db.prepare('DELETE FROM player_listings WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function toggleBoulePlaceFavorite(db, placeId, userId) {
  const place = await db.prepare("SELECT p.id FROM boule_places p LEFT JOIN clubs c ON c.id = p.club_id WHERE p.id = ? AND p.status = 'published' AND (p.club_id IS NULL OR c.status = 'published')").bind(placeId).first(); if (!place) throw new HttpError(404, 'Bouleplatz nicht gefunden');
  const favorited = await db.prepare('SELECT 1 FROM boule_place_favorites WHERE place_id = ? AND user_id = ?').bind(placeId, userId).first();
  if (favorited) await db.prepare('DELETE FROM boule_place_favorites WHERE place_id = ? AND user_id = ?').bind(placeId, userId).run(); else await db.prepare('INSERT INTO boule_place_favorites (place_id, user_id, created_at) VALUES (?, ?, ?)').bind(placeId, userId, new Date().toISOString()).run();
  return json({ favorited: !favorited });
}

async function enforcePlaceReportRateLimit(db, ip) {
  const windowStart = new Date(Date.now() - PLACE_REPORT_RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  const ipCount = await db.prepare('SELECT COUNT(*) AS count FROM boule_place_report_attempts WHERE ip = ? AND created_at > ?').bind(ip, windowStart).first();
  if (Number(ipCount?.count || 0) >= PLACE_REPORT_RATE_LIMIT_MAX_PER_IP) throw new HttpError(429, 'Zu viele Bouleplatz-Meldungen. Bitte versuche es später erneut.');
  await db.prepare('INSERT INTO boule_place_report_attempts (id, ip, created_at) VALUES (?, ?, ?)').bind(crypto.randomUUID(), ip, new Date().toISOString()).run();
}

/**
 * Public, unauthenticated "Bouleplatz melden" submission - analog zu createTournamentReport.
 * Kein Verein nötig (club_id bleibt NULL); der Platz bleibt 'pending' und wird erst durch
 * Bestätigung der Kontakt-E-Mail (verifyPlaceReport) veröffentlicht, ganz ohne Admin-Schritt.
 */
async function createPlaceReport(request, env, url) {
  const db = env.DB;
  const body = await readJson(request);

  if (nullableText(body.website)) {
    return json({ ok: true }, 201);
  }

  const session = await optionalSession(request, db);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await enforcePlaceReportRateLimit(db, ip);
  await verifyTurnstileToken(env, body.turnstileToken, ip);

  const name = text(body.name);
  const address = text(body.address);
  if (name.length < 2 || address.length < 5) throw new HttpError(400, 'Name und vollständige Adresse des Platzes sind erforderlich');
  // Die Adresse ist die Quelle der Wahrheit. Ein öffentlicher API-Aufruf darf
  // keine beliebige Kartenposition neben einer anderen Adresse veröffentlichen.
  const [geo] = await geocodeLocation(address, { countryCode: request.headers.get('CF-IPCountry'), limit: 1 });
  if (!geo) throw new HttpError(400, 'Kein Ort gefunden.');
  const { lat: latitude, lng: longitude } = geo;
  const courtCount = nonNegativeInteger(body.courtCount);
  const description = nullableText(body.description);
  const accessible = Boolean(body.accessible);
  const facilities = nullableText(body.facilities);
  const clubName = nullableText(body.clubName);
  const contactName = text(body.contactName);
  const contactEmail = text(body.contactEmail).toLowerCase();
  const language = normalizeLanguage(body.language);
  if (contactName.length < 2) throw new HttpError(400, 'Der Kontaktname muss mindestens 2 Zeichen enthalten');
  if (!isEmail(contactEmail)) throw new HttpError(400, 'Eine gültige Kontakt-E-Mail ist erforderlich');
  if (!body.consentAccepted) throw new HttpError(400, 'Zustimmung zur Datenschutzerklärung ist erforderlich');

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const editToken = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  await db
    .prepare(
      `INSERT INTO boule_places (id, club_id, club_name, name, address, latitude, longitude, court_count, description, accessible, facilities, status, contact_name, contact_email, reported_by_user_id, edit_token, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, clubName, name, address, latitude, longitude, courtCount, description, accessible ? 1 : 0, facilities, contactName, contactEmail, session?.user?.id || null, editToken, now, now)
    .run();

  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + PLACE_REPORT_TOKEN_TTL_SECONDS * 1000);
  await db
    .prepare('INSERT INTO boule_place_report_tokens (token_hash, place_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, id, expiresAt.toISOString(), now)
    .run();

  const verificationUrl = `${url.origin}/?place_report_verify_token=${encodeURIComponent(token)}`;
  const editUrl = `${url.origin}/platz-bearbeiten?edit_token=${encodeURIComponent(editToken)}`;
  const emailText = PLACE_REPORT_VERIFICATION_EMAILS[language] || PLACE_REPORT_VERIFICATION_EMAILS.de;
  await sendTransactionalEmail(env, {
    to: contactEmail,
    subject: emailText.subject,
    text: emailText.text(verificationUrl, editUrl),
    language,
    logFallback: `Boule place report verification link for ${contactEmail}: ${verificationUrl} (edit: ${editUrl})`,
    failureContext: `boule place report verification email for ${contactEmail}`,
    allowLogFallback: isLocalhost(url),
  });

  const response = { ok: true };
  if (isLocalhost(url)) {
    response.verificationUrl = verificationUrl;
    response.editUrl = editUrl;
  }
  return json(response, 201);
}

async function verifyPlaceReport(request, db) {
  const body = await readJson(request);
  const token = String(body.token || '').trim();
  if (!token) throw new HttpError(400, 'Bestätigungs-Token ist erforderlich');

  const tokenHash = await sha256Hex(token);
  const verification = await db
    .prepare('SELECT token_hash, place_id, expires_at, used_at FROM boule_place_report_tokens WHERE token_hash = ?')
    .bind(tokenHash)
    .first();
  if (!verification || verification.used_at || new Date(verification.expires_at).getTime() <= Date.now()) {
    throw new HttpError(400, 'Bestätigungs-Link ist ungültig oder abgelaufen');
  }

  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE boule_places SET status = 'published', updated_at = ? WHERE id = ?").bind(now, verification.place_id),
    db.prepare('UPDATE boule_place_report_tokens SET used_at = ? WHERE token_hash = ?').bind(now, tokenHash),
  ]);
  return json({ ok: true, placeId: verification.place_id });
}

async function listClubEditorRequests(db) { const rows = await db.prepare('SELECT r.club_id, r.user_id, r.created_at, c.name AS club_name, u.first_name, u.last_name, u.email FROM club_editor_requests r JOIN clubs c ON c.id = r.club_id JOIN users u ON u.id = r.user_id ORDER BY r.created_at').all(); return json({ requests: rows.results || [] }); }
async function approveClubEditor(db, clubId, userId, adminId) { const now = new Date().toISOString(); await db.batch([db.prepare('INSERT OR REPLACE INTO club_editors (club_id, user_id, approved_by, approved_at) VALUES (?, ?, ?, ?)').bind(clubId, userId, adminId, now), db.prepare("UPDATE clubs SET status = 'published', updated_at = ? WHERE id = ?").bind(now, clubId), db.prepare("UPDATE boule_places SET status = 'published', updated_at = ? WHERE club_id = ? AND status = 'pending'").bind(now, clubId), db.prepare('DELETE FROM club_editor_requests WHERE club_id = ? AND user_id = ?').bind(clubId, userId)]); return json({ ok: true }); }

async function listMyClubs(db, userId) {
  const rows = await db.prepare(
    `SELECT DISTINCT c.*, 1 AS editor_user_id FROM clubs c
     LEFT JOIN club_editors ce ON ce.club_id = c.id AND ce.user_id = ?1
     WHERE c.owner_id = ?1 OR ce.user_id = ?1
     ORDER BY c.name COLLATE NOCASE`).bind(userId).all();
  return json({ clubs: (rows.results || []).map((row) => toPublicClub(row, { id: userId })) });
}

async function listAllClubsForAdmin(db) {
  const rows = await db.prepare(
    `SELECT c.*, u.first_name AS owner_first_name, u.last_name AS owner_last_name, u.email AS owner_email,
       (SELECT COUNT(*) FROM boule_places p WHERE p.club_id = c.id) AS place_count,
       (SELECT COUNT(*) FROM club_editors ce WHERE ce.club_id = c.id) AS editor_count
     FROM clubs c JOIN users u ON u.id = c.owner_id
     ORDER BY c.created_at DESC`).all();
  return json({
    clubs: (rows.results || []).map((row) => ({
      ...toPublicClub(row, null),
      ownerName: `${row.owner_first_name} ${row.owner_last_name}`,
      ownerEmail: row.owner_email,
      placeCount: Number(row.place_count),
      editorCount: Number(row.editor_count),
      createdAt: row.created_at,
    })),
  });
}

async function updateClubStatusAsAdmin(db, id, status) {
  if (!['pending', 'published', 'rejected'].includes(status)) throw new HttpError(400, 'Ungültiger Status');
  const club = await db.prepare('SELECT id FROM clubs WHERE id = ?').bind(id).first();
  if (!club) throw new HttpError(404, 'Verein nicht gefunden');
  const now = new Date().toISOString();
  const statements = [db.prepare('UPDATE clubs SET status = ?, updated_at = ? WHERE id = ?').bind(status, now, id)];
  if (status === 'published') statements.push(db.prepare("UPDATE boule_places SET status = 'published', updated_at = ? WHERE club_id = ? AND status = 'pending'").bind(now, id));
  await db.batch(statements);
  return json({ ok: true });
}

async function updateClubAsAdmin(request, db, id) {
  const club = await db.prepare('SELECT id FROM clubs WHERE id = ?').bind(id).first();
  if (!club) throw new HttpError(404, 'Verein nicht gefunden');
  const input = clubInput(await readJson(request));
  await db.prepare('UPDATE clubs SET name = ?, description = ?, website_url = ?, logo_url = ?, contact_name = ?, contact_email = ?, contact_phone = ?, updated_at = ? WHERE id = ?')
    .bind(input.name, input.description, input.websiteUrl, input.logoUrl, input.contactName, input.contactEmail, input.contactPhone, new Date().toISOString(), id).run();
  return json({ ok: true });
}

async function updateClubOwnerAsAdmin(db, id, userId) {
  const club = await db.prepare('SELECT id FROM clubs WHERE id = ?').bind(id).first();
  if (!club) throw new HttpError(404, 'Verein nicht gefunden');
  const trimmedUserId = String(userId || '').trim();
  if (!trimmedUserId) throw new HttpError(400, 'Bitte wähle einen Benutzer aus');
  const owner = await db.prepare('SELECT id FROM users WHERE id = ?').bind(trimmedUserId).first();
  if (!owner) throw new HttpError(404, 'Benutzer nicht gefunden');
  const now = new Date().toISOString();
  await db.prepare('UPDATE clubs SET owner_id = ?, updated_at = ? WHERE id = ?').bind(owner.id, now, id).run();
  // Der neue Owner hat ohnehin volle Rechte - ein doppelter Editor-/Anfrage-Eintrag ist redundant.
  await db.prepare('DELETE FROM club_editors WHERE club_id = ? AND user_id = ?').bind(id, owner.id).run();
  await db.prepare('DELETE FROM club_editor_requests WHERE club_id = ? AND user_id = ?').bind(id, owner.id).run();
  return json({ ok: true });
}

async function deleteClubAsAdmin(db, id) {
  const club = await db.prepare('SELECT id FROM clubs WHERE id = ?').bind(id).first();
  if (!club) throw new HttpError(404, 'Verein nicht gefunden');
  await db.prepare('DELETE FROM clubs WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function updateBoulePlaceClubAsAdmin(db, placeId, clubId) {
  const place = await db.prepare('SELECT id, venue_type FROM boule_places WHERE id = ?').bind(placeId).first();
  if (!place) throw new HttpError(404, 'Bouleplatz nicht gefunden');

  const targetClubId = String(clubId || '').trim() || null;
  if (targetClubId) {
    const club = await db.prepare('SELECT id FROM clubs WHERE id = ?').bind(targetClubId).first();
    if (!club) throw new HttpError(404, 'Verein nicht gefunden');
    const conflict = await db.prepare('SELECT id FROM boule_places WHERE club_id = ? AND venue_type = ? AND id != ?').bind(targetClubId, place.venue_type, placeId).first();
    if (conflict) throw new HttpError(409, 'Diese Organisation hat bereits einen Spielort dieses Typs');
  }

  await db.prepare('UPDATE boule_places SET club_id = ?, updated_at = ? WHERE id = ?').bind(targetClubId, new Date().toISOString(), placeId).run();
  return json({ ok: true });
}

async function listPendingBoulePlaces(db) {
  const rows = await db.prepare(
    `SELECT p.*, c.name AS club_name, c.logo_url AS club_logo_url, c.owner_id
     FROM boule_places p LEFT JOIN clubs c ON c.id = p.club_id
     WHERE p.status = 'pending' ORDER BY p.created_at`).all();
  return json({ places: (rows.results || []).map((row) => toPublicBoulePlace(row, null)) });
}

async function getAdminDashboardStats(db) {
  const [users, pendingApiKeys, pendingClubEditorRequests, pendingClubs, pendingPlaces, playerListings] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM users').first(),
    db.prepare("SELECT COUNT(*) AS count FROM api_keys WHERE status = 'pending'").first(),
    db.prepare('SELECT COUNT(*) AS count FROM club_editor_requests').first(),
    db.prepare("SELECT COUNT(*) AS count FROM clubs WHERE status = 'pending'").first(),
    db.prepare("SELECT COUNT(*) AS count FROM boule_places WHERE club_id IS NULL AND status = 'pending'").first(),
    db.prepare('SELECT COUNT(*) AS count FROM player_listings').first(),
  ]);
  return json({
    users: Number(users.count),
    pendingApiKeys: Number(pendingApiKeys.count),
    pendingClubRequests: Number(pendingClubs.count) + Number(pendingClubEditorRequests.count),
    pendingPlaces: Number(pendingPlaces.count),
    playerListings: Number(playerListings.count),
  });
}

async function publishBoulePlace(db, id) {
  const result = await db.prepare("UPDATE boule_places SET status = 'published', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  if (!result.meta.changes) throw new HttpError(404, 'Bouleplatz nicht gefunden');
  return json({ ok: true });
}

async function getRegistrationWithTournament(db, id) {
  return db
    .prepare(
      `SELECT registrations.*, tournaments.owner_id, tournaments.visibility, tournaments.status AS tournament_status, tournaments.document_managed, tournaments.desktop_execution, tournaments.formation,
              tournaments.registration_type, tournaments.license_required, tournaments.max_registrations, tournaments.waitlist_enabled, tournaments.entry_fee_cents, tournaments.fee_tiers, tournaments.registration_questions,
              tournaments.name, tournaments.date, tournaments.start_time, tournaments.location,
              ${TOURNAMENT_EDITORS_JSON_SUBQUERY}
       FROM registrations
       JOIN tournaments ON tournaments.id = registrations.tournament_id
       WHERE registrations.id = ?`,
    )
    .bind(id)
    .first();
}

async function getRegistrationByCancelToken(db, token) {
  return db
    .prepare(
      `SELECT registrations.*, tournaments.owner_id, tournaments.name, tournaments.date, tournaments.start_time, tournaments.location, tournaments.status AS tournament_status, tournaments.document_managed, tournaments.desktop_execution
       FROM registrations
       JOIN tournaments ON tournaments.id = registrations.tournament_id
       WHERE registrations.cancel_token = ?`,
    )
    .bind(token)
    .first();
}

function isPubliclyVisible(tournament) {
  return tournament.visibility === 'public' && tournament.status !== 'draft';
}

function canViewTournament(tournament, user) {
  return isPubliclyVisible(tournament) || canManageTournament(tournament, user);
}

async function hasTournamentShareAccess(db, tournament, token) {
  if (!token || tournament.visibility !== 'private' || tournament.status === 'draft') return false;
  const tokenHash = await sha256Hex(token);
  const link = await db.prepare('SELECT token_hash FROM tournament_share_links WHERE tournament_id = ? AND token_hash = ?').bind(tournament.id, tokenHash).first();
  return Boolean(link);
}

async function createTournamentShareLink(db, tournamentId, origin) {
  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO tournament_share_links (tournament_id, token_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(tournament_id) DO UPDATE SET token_hash = excluded.token_hash, updated_at = excluded.updated_at`,
  ).bind(tournamentId, tokenHash, now, now).run();
  return json({ shareUrl: `${origin}/turniere/${tournamentId}/info?share=${encodeURIComponent(token)}` });
}

async function deleteTournamentShareLink(db, tournamentId) {
  await db.prepare('DELETE FROM tournament_share_links WHERE tournament_id = ?').bind(tournamentId).run();
  return json({ ok: true });
}

function canViewParticipants(tournament, user) {
  if (isPubliclyVisible(tournament) && Number(tournament.participants_public)) {
    return true;
  }
  return canManageTournament(tournament, user);
}

function tournamentEditors(tournament) {
  if (Array.isArray(tournament.editors)) return tournament.editors;
  if (!tournament.editors_json) return [];
  try {
    return JSON.parse(tournament.editors_json);
  } catch {
    return [];
  }
}

function tournamentEditorIds(tournament) {
  return tournamentEditors(tournament).map((editor) => editor.id);
}

const TOURNAMENT_EDITORS_JSON_SUBQUERY = `(
          SELECT COALESCE(json_group_array(json_object('id', te.user_id, 'firstName', u.first_name, 'lastName', u.last_name)), '[]')
          FROM tournament_editors te
          JOIN users u ON u.id = te.user_id
          WHERE te.tournament_id = tournaments.id
        ) AS editors_json`;

const TOURNAMENT_VENUE_CLUB_LOGO_SUBQUERY = `(
          SELECT COALESCE(
            (
              SELECT c.logo_url
              FROM boule_places p
              JOIN clubs c ON c.id = p.club_id
              WHERE p.id = tournaments.boule_place_id
                AND p.status = 'published'
                AND c.status = 'published'
            ),
            (
              SELECT CASE WHEN COUNT(DISTINCT c.id) = 1 THEN MIN(c.logo_url) END
              FROM boule_places p
              JOIN clubs c ON c.id = p.club_id
              WHERE tournaments.boule_place_id IS NULL
                AND (
                  (tournaments.latitude IS NOT NULL AND tournaments.longitude IS NOT NULL
                    AND p.latitude = tournaments.latitude AND p.longitude = tournaments.longitude)
                  OR ((tournaments.latitude IS NULL OR tournaments.longitude IS NULL)
                    AND lower(trim(p.address)) = lower(trim(tournaments.location)))
                )
                AND p.status = 'published'
                AND c.status = 'published'
            )
          )
        ) AS venue_club_logo_url`;

function canManageTournament(tournament, user) {
  if (!user) {
    return false;
  }
  return user.role === 'admin' || tournament.owner_id === user.id || tournamentEditorIds(tournament).includes(user.id);
}

function assertCanManageTournament(tournament, user) {
  if (!canManageTournament(tournament, user)) {
    throw new HttpError(403, 'Zugriff verweigert');
  }
}

function canManageEditors(tournament, user) {
  return Boolean(user) && (user.role === 'admin' || tournament.owner_id === user.id);
}

function assertCanManageEditors(tournament, user) {
  if (!canManageEditors(tournament, user)) {
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
              users.tournament_limit, users.mail_enabled, users.created_at, users.updated_at, sessions.expires_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ?`,
    )
    .bind(sessionId)
    .first();

  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    throw new HttpError(401, 'Anmeldung erforderlich');
  }

  // Every successful use extends the server-side session. The response wrapper
  // below refreshes the HttpOnly cookie with the same expiry.
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').bind(expiresAt.toISOString(), sessionId).run();
  sessionRefreshes.set(request, { id: sessionId, expiresAt });

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
    .prepare('DELETE FROM users WHERE email_verified_at IS NULL AND created_at <= ? AND id != ?')
    .bind(unverifiedAccountCutoff, TOURNAMENT_REPORT_SYSTEM_USER_ID)
    .run();

  // "Turnier melden": delete unconfirmed reports whose 24h confirmation window has
  // expired (cascades to their tournament_report_tokens row), plus already-confirmed
  // reports whose event date is in the past. Only tournaments that originated from
  // "Turnier melden" (i.e. have a tournament_report_tokens row, confirmed or not) are
  // touched - regular manager-created tournaments/calendar entries are unaffected.
  const reportTokenCutoff = new Date(Date.now() - TOURNAMENT_REPORT_TOKEN_TTL_SECONDS * 1000).toISOString();
  await db
    .prepare(
      `DELETE FROM tournaments WHERE id IN (
        SELECT tournament_id FROM tournament_report_tokens WHERE used_at IS NULL AND created_at <= ?
      )`,
    )
    .bind(reportTokenCutoff)
    .run();
  const today = new Date().toISOString().slice(0, 10);
  await db
    .prepare(
      `DELETE FROM tournaments WHERE date < ? AND id IN (SELECT tournament_id FROM tournament_report_tokens)`,
    )
    .bind(today)
    .run();
  // Note: verified (used_at IS NOT NULL) tokens are intentionally kept, not cleaned up here -
  // they remain the marker that identifies a tournament as originating from "Turnier melden"
  // for the past-date cleanup above, and cascade-delete automatically once their tournament
  // row is removed (ON DELETE CASCADE).
  const reportAttemptsCutoff = new Date(Date.now() - TOURNAMENT_REPORT_RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  await db.prepare('DELETE FROM tournament_report_attempts WHERE created_at <= ?').bind(reportAttemptsCutoff).run();

  // "Bouleplatz melden": analog zu Turniermeldungen - unbestätigte Platzmeldungen nach Ablauf
  // des 24h-Fensters löschen (kaskadiert auf ihre boule_place_report_tokens-Zeile).
  const placeReportTokenCutoff = new Date(Date.now() - PLACE_REPORT_TOKEN_TTL_SECONDS * 1000).toISOString();
  await db
    .prepare(
      `DELETE FROM boule_places WHERE id IN (
        SELECT place_id FROM boule_place_report_tokens WHERE used_at IS NULL AND created_at <= ?
      )`,
    )
    .bind(placeReportTokenCutoff)
    .run();
  const placeReportAttemptsCutoff = new Date(Date.now() - PLACE_REPORT_RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  await db.prepare('DELETE FROM boule_place_report_attempts WHERE created_at <= ?').bind(placeReportAttemptsCutoff).run();
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

export function normalizeTournamentInput(body, { legacyRegistrationTimes = false, registrationTypeDefault = 'forme' } = {}) {
  const tournament = {
    name: text(body.name),
    date: text(body.date),
    startTime: nullableText(body.startTime),
    location: text(body.location),
    description: nullableText(body.description),
    type: text(body.type || 'formule_x'),
    formation: text(body.formation || 'doublette'),
    registrationType: text(body.registrationType || registrationTypeDefault),
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
    organizerMessage: nullableText(body.organizerMessage),
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
  if (registration.organizerMessage && registration.organizerMessage.length > 250) {
    throw new HttpError(400, 'Die Nachricht an die Turnierleitung darf maximal 250 Zeichen enthalten.');
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

async function assertNoDuplicateTeamName(db, tournamentId, teamName, excludeId) {
  if (!teamName) {
    return;
  }
  const existing = await db
    .prepare(
      `SELECT id FROM registrations
       WHERE tournament_id = ? AND status != 'cancelled' AND LOWER(TRIM(team_name)) = LOWER(TRIM(?))
       ${excludeId ? 'AND id != ?' : ''}
       LIMIT 1`,
    )
    .bind(...(excludeId ? [tournamentId, teamName, excludeId] : [tournamentId, teamName]))
    .first();
  if (existing) {
    throw new HttpError(409, 'Ein Team mit diesem Namen ist für dieses Turnier bereits angemeldet', { field: 'teamName', name: teamName });
  }
}

// Vergleicht Namen unabhängig von Groß-/Kleinschreibung, Leerzeichen und Sonderzeichen
// (z. B. "Jean-Paul Müller" === "jean paul muller"), damit ein Spieler sich nicht mit
// leicht abgewandelter Schreibweise mehrfach für dasselbe Turnier anmelden kann.
function normalizePlayerName(firstName, lastName) {
  return `${firstName || ''}${lastName || ''}`
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function registrationPlayerNames(row) {
  const names = [normalizePlayerName(row.first_name ?? row.firstName, row.last_name ?? row.lastName)];
  const partnerFirst = row.partner_first_name ?? row.partnerFirstName;
  const partnerLast = row.partner_last_name ?? row.partnerLastName;
  if (partnerFirst && partnerLast) {
    names.push(normalizePlayerName(partnerFirst, partnerLast));
  }
  const partner2First = row.partner2_first_name ?? row.partner2FirstName;
  const partner2Last = row.partner2_last_name ?? row.partner2LastName;
  if (partner2First && partner2Last) {
    names.push(normalizePlayerName(partner2First, partner2Last));
  }
  return names.filter(Boolean);
}

async function assertNoDuplicatePlayer(db, tournamentId, registration, excludeId) {
  const incoming = [{
    field: 'firstName',
    name: normalizePlayerName(registration.firstName, registration.lastName),
    displayName: `${registration.firstName} ${registration.lastName}`.trim(),
  }];
  if (registration.partnerFirstName && registration.partnerLastName) {
    incoming.push({
      field: 'partnerFirstName',
      name: normalizePlayerName(registration.partnerFirstName, registration.partnerLastName),
      displayName: `${registration.partnerFirstName} ${registration.partnerLastName}`.trim(),
    });
  }
  if (registration.partner2FirstName && registration.partner2LastName) {
    incoming.push({
      field: 'partner2FirstName',
      name: normalizePlayerName(registration.partner2FirstName, registration.partner2LastName),
      displayName: `${registration.partner2FirstName} ${registration.partner2LastName}`.trim(),
    });
  }

  const result = await db
    .prepare(
      `SELECT first_name, last_name, partner_first_name, partner_last_name, partner2_first_name, partner2_last_name
       FROM registrations
       WHERE tournament_id = ? AND status != 'cancelled'
       ${excludeId ? 'AND id != ?' : ''}`,
    )
    .bind(...(excludeId ? [tournamentId, excludeId] : [tournamentId]))
    .all();

  for (const row of result.results) {
    const existingNames = new Set(registrationPlayerNames(row));
    for (const entry of incoming) {
      if (entry.name && existingNames.has(entry.name)) {
        throw new HttpError(
          409,
          'Dieser Spieler ist mit Vor- und Nachname bereits für dieses Turnier angemeldet (auch als Partner einer anderen Anmeldung)',
          { field: entry.field, name: entry.displayName },
        );
      }
    }
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
  const bytes = await readBodyWithLimit(request, MAX_JSON_BODY_BYTES);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
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
    mailEnabled: row.mail_enabled === undefined || row.mail_enabled === null ? true : Boolean(Number(row.mail_enabled)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPostboxMessage(row, currentUserId) {
  let eventData = null;
  try { eventData = row.event_data ? JSON.parse(row.event_data) : null; } catch { eventData = null; }
  return {
    id: row.id,
    senderId: row.sender_id || null,
    senderName: row.sender_id ? `${row.sender_first_name || ''} ${row.sender_last_name || ''}`.trim() : null,
    recipientId: row.recipient_id,
    recipientName: row.recipient_first_name != null ? `${row.recipient_first_name || ''} ${row.recipient_last_name || ''}`.trim() : null,
    broadcastTournamentId: row.broadcast_tournament_id || null,
    broadcastTournamentName: row.broadcast_tournament_name || null,
    kind: row.kind,
    body: row.body || null,
    eventType: row.event_type || null,
    eventData,
    createdAt: row.created_at,
    readAt: row.read_at || null,
    mine: row.sender_id === currentUserId,
  };
}

function jsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function feeTiersFromRow(row) {
  const custom = jsonArray(row.fee_tiers).filter((tier) => tier && tier.id !== 'legacy-standard');
  const standard = Number(row.entry_fee_cents || 0) > 0
    ? [{ id: 'legacy-standard', name: 'Startgeld', amountCents: Number(row.entry_fee_cents), active: true }]
    : [];
  return [...standard, ...custom];
}

function registrationFeeSelections(row) {
  return jsonArray(row.fee_selections).filter((selection) => selection && typeof selection.name === 'string' && Number.isInteger(selection.amountCents));
}

function registrationQuestionsFromRow(row) {
  return jsonArray(row.registration_questions)
    .filter((question) => question && typeof question.id === 'string' && typeof question.label === 'string')
    .map((question) => ({ id: question.id, label: question.label }));
}

function registrationAnswersFromRow(row) {
  return jsonArray(row.registration_answers)
    .filter((answer) => answer && ['primary', 'partner', 'partner2'].includes(answer.participant) && typeof answer.questionId === 'string' && answer.checked === true);
}

function resolveRegistrationAnswers(tournament, input, registration, existing = null) {
  if (input === undefined && existing) return registrationAnswersFromRow(existing);
  if (!Array.isArray(input)) throw new HttpError(400, 'Ungültige Teilnehmerantworten');
  const participants = new Set(['primary']);
  if (registration.partnerFirstName) participants.add('partner');
  if (registration.partner2FirstName) participants.add('partner2');
  const questionIds = new Set(registrationQuestionsFromRow(tournament).map((question) => question.id));
  const seen = new Set();
  return input.reduce((answers, answer) => {
    const participant = text(answer?.participant);
    const questionId = text(answer?.questionId);
    const key = `${participant}:${questionId}`;
    if (!participants.has(participant) || !questionIds.has(questionId) || seen.has(key) || typeof answer?.checked !== 'boolean') {
      throw new HttpError(400, 'Ungültige Teilnehmerantworten');
    }
    seen.add(key);
    if (answer.checked) answers.push({ participant, questionId, checked: true });
    return answers;
  }, []);
}

async function pruneRegistrationAnswers(db, tournamentId, questions) {
  const questionIds = new Set(questions.map((question) => question.id));
  const result = await db.prepare('SELECT id, registration_answers FROM registrations WHERE tournament_id = ?').bind(tournamentId).all();
  const updates = (result.results || []).flatMap((row) => {
    const answers = registrationAnswersFromRow(row).filter((answer) => questionIds.has(answer.questionId));
    return JSON.stringify(answers) === JSON.stringify(registrationAnswersFromRow(row))
      ? []
      : [db.prepare('UPDATE registrations SET registration_answers = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(answers), new Date().toISOString(), row.id)];
  });
  if (updates.length) await db.batch(updates);
}

function resolveFeeSelections(tournament, input, registration, existing = null) {
  if (input === undefined && existing) return registrationFeeSelections(existing);
  if (!Array.isArray(input)) throw new HttpError(400, 'Ungültige Startgeld-Auswahl');
  const allowed = new Set(['primary']);
  if (registration.partnerFirstName) allowed.add('partner');
  if (registration.partner2FirstName) allowed.add('partner2');
  const prior = new Map(registrationFeeSelections(existing || {}).map((selection) => [selection.participant, selection]));
  const tiers = new Map(feeTiersFromRow(tournament).map((tier) => [tier.id, tier]));
  const participants = new Set();
  return input.map((selection) => {
    const participant = text(selection?.participant);
    const tariffId = text(selection?.tariffId);
    if (!allowed.has(participant) || !tariffId || participants.has(participant)) throw new HttpError(400, 'Ungültige Startgeld-Auswahl');
    participants.add(participant);
    const tier = tiers.get(tariffId);
    const priorSelection = prior.get(participant);
    // Ein bereits gewählter Tarif ist ein Preis-Snapshot. Er bleibt beim Bearbeiten
    // der Anmeldung erhalten, selbst wenn der Tarif danach geändert/deaktiviert wurde.
    if (priorSelection?.tariffId === tariffId) return priorSelection;
    if (!tier || tier.active === false) throw new HttpError(400, 'Ungültige Startgeld-Auswahl');
    return { participant, tariffId: tier.id, name: tier.name, amountCents: Number(tier.amountCents) };
  });
}

function toPublicTournament(row, user) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    creatorId: row.creator_id,
    editors: tournamentEditors(row),
    name: row.name,
    date: row.date,
    startTime: row.start_time,
    location: formatLocationAddress(row.location),
    boulePlaceId: row.boule_place_id || null,
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    description: row.description,
    type: row.type,
    formation: row.formation,
    formationOther: Boolean(Number(row.formation_other || 0)),
    club: row.club || null,
    registrationType: row.registration_type || 'forme',
    schweizerRankingMode: row.schweizer_ranking_mode || 'mit_buchholz',
    formuleXRounds: Number(row.formule_x_rounds || 4),
    koPlatz3: row.ko_platz3 === undefined ? true : Boolean(Number(row.ko_platz3)),
    status: row.status,
    maxRegistrations: Number(row.max_registrations || 0),
    registrationDeadline: row.registration_deadline,
    registrationOpensAt: row.registration_opens_at,
    timezone: row.timezone || 'Europe/Berlin',
    entryFeeCents: Number(row.entry_fee_cents || 0),
    feeTiers: feeTiersFromRow(row),
    registrationQuestions: registrationQuestionsFromRow(row),
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
    registrationEnabled: Boolean(Number(row.registration_enabled ?? 1)),
    approvalRequired: Boolean(Number(row.approval_required || 0)),
    documentManaged: Boolean(Number(row.document_managed || 0)),
    desktopExecution: Boolean(Number(row.desktop_execution || 0)),
    websiteUrl: row.website_url || null,
    websiteIsOriginalClubSite: false,
    logoUrl: row.logo_url || row.venue_club_logo_url || null,
    flyerUrl: row.flyer_url || null,
    activeRegistrations: Number(row.active_registrations || 0),
    waitlistRegistrations: Number(row.waitlist_registrations || 0),
    canManage: canManageTournament(row, user),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicRegistration(row) {
  const noEmail = isPlaceholderEmail(row.email);
  const feeSelections = registrationFeeSelections(row);
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: noEmail ? '' : row.email,
    noEmail,
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
    feeSelections,
    feeTotalCents: feeSelections.reduce((total, selection) => total + Number(selection.amountCents || 0), 0),
    participation: row.participation || 'inactive',
    localRegistrationUuid: row.local_registration_uuid || null,
    registrationRevision: Number(row.registration_revision || 1),
    executionRevision: Number(row.execution_revision || 1),
    registeredAt: row.registered_at,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toManagedRegistration(row) {
  return {
    ...toPublicRegistration(row),
    organizerMessage: row.organizer_message || null,
    registrationAnswers: registrationAnswersFromRow(row),
    language: row.language || null,
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

function withRefreshedSessionCookie(request, response, url) {
  const session = sessionRefreshes.get(request);
  if (!session) return response;
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', sessionCookie(session.id, session.expiresAt, url));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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
