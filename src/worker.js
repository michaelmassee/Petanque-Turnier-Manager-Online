import tzlookup from 'tz-lookup';
import { buildPushPayload } from '@block65/webcrypto-web-push';
import {
  isAllowedPushEndpoint, LIVE_VIEW_AVAILABLE_EVENT, REGISTRATION_ACCOUNT_CONFLICT_EVENT,
  REGISTRATION_SLOT_LINKED_EVENT, TOURNAMENT_ADMIN_ACTION_EVENT, unreadPostboxCount,
} from './postbox-core.js';
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
  parseSyncRanking,
  parseSyncRoundMatches,
  parseSyncRoundNumber,
  buildPlayerLiveView,
  registrationBelongsToUser,
  buildLiveRoundPush,
  chunk,
  LIVE_PUSH_CHUNK_SIZE,
  isTournamentStale,
  dateDaysAgo,
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
import { firstFreeUsername, normalizeUsername, usernameCandidates, usernameProblem, USERNAME_CHANGE_INTERVAL_DAYS } from './lib/username.js';
import { parseRichText, richTextPlainText } from './lib/rich-text.js';
import { isFuturePetanqueAktuellTournament, mapPetanqueAktuellTournament, parsePetanqueAktuellCalendar, parsePetanqueAktuellDetailAddress, parsePetanqueAktuellDetailLogoUrl, petanqueAktuellCalendarUrl, petanqueAktuellPageUrls } from './petanque-aktuell-core.js';
import { formatLocationAddress, geocodingFallbackQuery } from './location-format.js';
import {
  SLOT_COLUMNS, isIncompleteTeam, nextSlotUserId, normalizePlayerName, registrationConflicts,
  registrationFlagsById, registrationSlots, registrationUnit, registrationUserIds, uniqueAccountLinks,
} from './registration-core.js';

const ROLES = ['admin', 'user'];
const USER_NAME_MAX_LENGTH = 50;
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
const SESSION_REFRESH_INTERVAL_SECONDS = 60 * 60;
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
    people.push({ firstName: registration.partner_first_name, lastName: registration.partner_last_name, email: registration.partner_email, club: registration.partner_club, licenseNr: registration.partner_license_nr });
  }
  if (registration.partner2_first_name && registration.partner2_last_name) {
    people.push({ firstName: registration.partner2_first_name, lastName: registration.partner2_last_name, email: registration.partner2_email, club: registration.partner2_club, licenseNr: registration.partner2_license_nr });
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
    text: (firstName, name, dateTimeLabel, location, link, cancelLink, participantsBlock = '', liveLink = '') =>
      `Hallo ${firstName},\n\ndeine Anmeldung für "${name}" wurde bestätigt.\n\nTermin: ${dateTimeLabel}\nOrt: ${location}${participantsBlock}\n\nAlle Infos zum Turnier:\n${link}${liveLink ? `\n\nDein Team live am Turniertag (Runde, Gegner, Bahn):\n${liveLink}` : ''}\n\nEinen Kalendereintrag findest du im Anhang dieser E-Mail.\n\nMöchtest du dich wieder abmelden? Nutze diesen Link:\n${cancelLink}`,
  },
  nl: {
    subject: (name) => `Deelname bevestigd: ${name}`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink, participantsBlock = '', liveLink = '') =>
      `Hallo ${firstName},\n\nJe deelname aan "${name}" is bevestigd.\n\nDatum: ${dateTimeLabel}\nLocatie: ${location}${participantsBlock}\n\nAlle informatie over het toernooi:\n${link}${liveLink ? `\n\nJe team live op de toernooidag (ronde, tegenstander, baan):\n${liveLink}` : ''}\n\nEen agenda-afspraak vind je als bijlage bij deze e-mail.\n\nWil je je weer afmelden? Gebruik deze link:\n${cancelLink}`,
  },
  en: {
    subject: (name) => `Participation confirmed: ${name}`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink, participantsBlock = '', liveLink = '') =>
      `Hi ${firstName},\n\nYour participation in "${name}" has been confirmed.\n\nDate: ${dateTimeLabel}\nLocation: ${location}${participantsBlock}\n\nAll tournament details:\n${link}${liveLink ? `\n\nYour team live on tournament day (round, opponent, lane):\n${liveLink}` : ''}\n\nA calendar event is attached to this email.\n\nWant to withdraw again? Use this link:\n${cancelLink}`,
  },
  es: {
    subject: (name) => `Participación confirmada: ${name}`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink, participantsBlock = '', liveLink = '') =>
      `Hola ${firstName},\n\nTu participación en "${name}" ha sido confirmada.\n\nFecha: ${dateTimeLabel}\nLugar: ${location}${participantsBlock}\n\nToda la información del torneo:\n${link}${liveLink ? `\n\nTu equipo en directo el día del torneo (ronda, rival, pista):\n${liveLink}` : ''}\n\nEncontrarás una cita de calendario adjunta a este correo.\n\n¿Quieres darte de baja de nuevo? Usa este enlace:\n${cancelLink}`,
  },
  fr: {
    subject: (name) => `Participation confirmée : ${name}`,
    text: (firstName, name, dateTimeLabel, location, link, cancelLink, participantsBlock = '', liveLink = '') =>
      `Bonjour ${firstName},\n\nTa participation à « ${name} » est confirmée.\n\nDate : ${dateTimeLabel}\nLieu : ${location}${participantsBlock}\n\nToutes les informations sur le tournoi :\n${link}${liveLink ? `\n\nTon équipe en direct le jour du tournoi (tour, adversaire, terrain) :\n${liveLink}` : ''}\n\nUn rendez-vous de calendrier est joint à cet e-mail.\n\nTu veux te désinscrire ? Utilise ce lien :\n${cancelLink}`,
  },
};


// Neuer persönlicher Live-Link auf Wunsch der Turnierleitung; der vorherige Link wird damit ungültig (EW-02).
export const LIVE_LINK_EMAILS = {
  de: {
    subject: (name) => `Dein Live-Link: ${name}`,
    text: (firstName, name, liveLink) =>
      `Hallo ${firstName},\n\nhier ist dein persönlicher Live-Link für "${name}" (Runde, Gegner, Bahn):\n${liveLink}\n\nEin früher verschickter Live-Link ist damit ungültig.`,
  },
  nl: {
    subject: (name) => `Je livelink: ${name}`,
    text: (firstName, name, liveLink) =>
      `Hallo ${firstName},\n\nhier is je persoonlijke livelink voor "${name}" (ronde, tegenstander, baan):\n${liveLink}\n\nEen eerder verstuurde livelink is daarmee ongeldig.`,
  },
  en: {
    subject: (name) => `Your live link: ${name}`,
    text: (firstName, name, liveLink) =>
      `Hi ${firstName},\n\nhere is your personal live link for "${name}" (round, opponent, lane):\n${liveLink}\n\nAny live link sent earlier is no longer valid.`,
  },
  es: {
    subject: (name) => `Tu enlace en directo: ${name}`,
    text: (firstName, name, liveLink) =>
      `Hola ${firstName},\n\naquí tienes tu enlace en directo personal para "${name}" (ronda, rival, pista):\n${liveLink}\n\nCualquier enlace enviado antes ya no es válido.`,
  },
  fr: {
    subject: (name) => `Ton lien direct : ${name}`,
    text: (firstName, name, liveLink) =>
      `Bonjour ${firstName},\n\nvoici ton lien direct personnel pour « ${name} » (tour, adversaire, terrain) :\n${liveLink}\n\nTout lien direct envoyé auparavant n’est plus valable.`,
  },
};

export function buildLiveLink(appOrigin, token) {
  return `${appOrigin}/live/t/${encodeURIComponent(token)}`;
}

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
    text: (firstName, name, senderName) =>
      `Hallo ${firstName},\n\n${senderName} hat allen Teilnehmern von "${name}" folgende Nachricht geschickt:`,
  },
  nl: {
    subject: (name) => `Bericht aan alle deelnemers: ${name}`,
    text: (firstName, name, senderName) =>
      `Hallo ${firstName},\n\n${senderName} heeft alle deelnemers van "${name}" het volgende bericht gestuurd:`,
  },
  en: {
    subject: (name) => `Message to all participants: ${name}`,
    text: (firstName, name, senderName) =>
      `Hi ${firstName},\n\n${senderName} sent the following message to all participants of "${name}":`,
  },
  es: {
    subject: (name) => `Mensaje a todos los participantes: ${name}`,
    text: (firstName, name, senderName) =>
      `Hola ${firstName},\n\n${senderName} envió el siguiente mensaje a todos los participantes de "${name}":`,
  },
  fr: {
    subject: (name) => `Message à tous les participants : ${name}`,
    text: (firstName, name, senderName) =>
      `Bonjour ${firstName},\n\n${senderName} a envoyé le message suivant à tous les participants de « ${name} » :`,
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
    organizerMessage: 'Nachricht',
    accountEmailUnverified: 'E-Mail nicht bestätigt',
    accountPasswordChangeRequired: 'Passwortänderung erforderlich',
    apiKeyApproved: (label) => `API-Schlüssel „${label}“ wurde freigegeben`,
    apiKeyRevoked: (label) => `API-Schlüssel „${label}“ wurde gesperrt`,
    savedSearchMatches: (name, count) => `${count} neue${count === 1 ? 's' : ''} Turnier${count === 1 ? '' : 'e'} für „${name}“`,
    tournamentAutoFinished: 'Automatisch beendet, da der Turnierbeginn mehr als 48 Stunden zurückliegt.',
    liveViewAvailable: (name) => `${name}: Du bist eingecheckt – Paarungen und Ergebnisse jetzt in der Live-Ansicht`,
    slotLinked: (name) => `${name}: Du wurdest für dieses Turnier eingetragen. Falls du das nicht bist, wähle in der Live-Ansicht „Das bin ich nicht“.`,
    accountConflict: (name) => `${name}: Du stehst in mehreren Anmeldungen. Die Turnierleitung klärt das; bitte melde dich bei ihr.`,
    adminAction: (name, action) => `${name}: ${({ binding_takeover: 'Dokumentbindung übernommen', binding_release: 'Dokumentbindung gelöst', running_reset: 'Turnierstart zurückgesetzt', tournament_deleted: 'Turnier gelöscht' })[action] || action}`,
    usernameChangedByAdmin: (username) => `Ein Admin hat deinen Benutzernamen in @${username} geändert.`,
    usernameReported: (username) => `Benutzername @${username} wurde gemeldet`,
  },
  nl: {
    tournamentStatus: { draft: 'Concept', registration: 'Inschrijving open', running: 'Bezig', finished: 'Afgerond' },
    registrationStatus: { pending: 'Open', confirmed: 'Bevestigd', waitlist: 'Wachtlijst', cancelled: 'Geannuleerd' },
    registrationFor: (participant) => `Aanmelding van ${participant}`,
    organizerMessage: 'Bericht',
    accountEmailUnverified: 'e-mail niet bevestigd',
    accountPasswordChangeRequired: 'wachtwoordwijziging vereist',
    apiKeyApproved: (label) => `API-sleutel „${label}” is goedgekeurd`,
    apiKeyRevoked: (label) => `API-sleutel „${label}” is ingetrokken`,
    savedSearchMatches: (name, count) => `${count} nieuw(e) toernooi(en) voor „${name}”`,
    tournamentAutoFinished: 'Automatisch afgerond, omdat de start van het toernooi meer dan 48 uur geleden is.',
    liveViewAvailable: (name) => `${name}: je bent ingecheckt – indelingen en uitslagen nu in de liveweergave`,
    slotLinked: (name) => `${name}: je bent voor dit toernooi ingeschreven. Ben jij dit niet, kies dan in de live-weergave „Dit ben ik niet”.`,
    accountConflict: (name) => `${name}: je staat in meerdere inschrijvingen. De wedstrijdleiding lost dit op; neem contact met haar op.`,
    adminAction: (name, action) => `${name}: ${({ binding_takeover: 'documentkoppeling overgenomen', binding_release: 'documentkoppeling verbroken', running_reset: 'toernooistart teruggezet', tournament_deleted: 'toernooi verwijderd' })[action] || action}`,
    usernameChangedByAdmin: (username) => `Een beheerder heeft je gebruikersnaam gewijzigd in @${username}.`,
    usernameReported: (username) => `Gebruikersnaam @${username} is gemeld`,
  },
  en: {
    tournamentStatus: { draft: 'Draft', registration: 'Registration open', running: 'Running', finished: 'Finished' },
    registrationStatus: { pending: 'Pending', confirmed: 'Confirmed', waitlist: 'Waitlist', cancelled: 'Cancelled' },
    registrationFor: (participant) => `Registration for ${participant}`,
    organizerMessage: 'Message',
    accountEmailUnverified: 'email not verified',
    accountPasswordChangeRequired: 'password change required',
    apiKeyApproved: (label) => `API key "${label}" was approved`,
    apiKeyRevoked: (label) => `API key "${label}" was revoked`,
    savedSearchMatches: (name, count) => `${count} new tournament${count === 1 ? '' : 's'} for "${name}"`,
    tournamentAutoFinished: 'Finished automatically because the tournament started more than 48 hours ago.',
    liveViewAvailable: (name) => `${name}: you are checked in – pairings and results are now in the live view`,
    slotLinked: (name) => `${name}: you have been entered for this tournament. If this is not you, choose “This is not me” in the live view.`,
    accountConflict: (name) => `${name}: you appear in several registrations. The organizers will resolve this; please contact them.`,
    adminAction: (name, action) => `${name}: ${({ binding_takeover: 'document binding taken over', binding_release: 'document binding released', running_reset: 'tournament start reset', tournament_deleted: 'tournament deleted' })[action] || action}`,
    usernameChangedByAdmin: (username) => `An admin changed your username to @${username}.`,
    usernameReported: (username) => `Username @${username} was reported`,
  },
  es: {
    tournamentStatus: { draft: 'Borrador', registration: 'Inscripción abierta', running: 'En curso', finished: 'Finalizado' },
    registrationStatus: { pending: 'Pendiente', confirmed: 'Confirmado', waitlist: 'Lista de espera', cancelled: 'Cancelado' },
    registrationFor: (participant) => `Inscripción de ${participant}`,
    organizerMessage: 'Mensaje',
    accountEmailUnverified: 'correo no verificado',
    accountPasswordChangeRequired: 'cambio de contraseña requerido',
    apiKeyApproved: (label) => `La clave API «${label}» fue aprobada`,
    apiKeyRevoked: (label) => `La clave API «${label}» fue revocada`,
    savedSearchMatches: (name, count) => `${count} torneo${count === 1 ? '' : 's'} nuevo${count === 1 ? '' : 's'} para «${name}»`,
    tournamentAutoFinished: 'Finalizado automáticamente porque el torneo comenzó hace más de 48 horas.',
    liveViewAvailable: (name) => `${name}: estás registrado – emparejamientos y resultados ahora en la vista en directo`,
    slotLinked: (name) => `${name}: te han inscrito en este torneo. Si no eres tú, elige «No soy yo» en la vista en directo.`,
    accountConflict: (name) => `${name}: figuras en varias inscripciones. La organización lo resolverá; ponte en contacto con ella.`,
    adminAction: (name, action) => `${name}: ${({ binding_takeover: 'vinculación del documento asumida', binding_release: 'vinculación del documento eliminada', running_reset: 'inicio del torneo revertido', tournament_deleted: 'torneo eliminado' })[action] || action}`,
    usernameChangedByAdmin: (username) => `Un administrador ha cambiado tu nombre de usuario a @${username}.`,
    usernameReported: (username) => `Se ha denunciado el nombre de usuario @${username}`,
  },
  fr: {
    tournamentStatus: { draft: 'Brouillon', registration: 'Inscriptions ouvertes', running: 'En cours', finished: 'Terminé' },
    registrationStatus: { pending: 'En attente', confirmed: 'Confirmé', waitlist: "Liste d'attente", cancelled: 'Annulé' },
    registrationFor: (participant) => `Inscription de ${participant}`,
    organizerMessage: 'Message',
    accountEmailUnverified: 'e-mail non confirmé',
    accountPasswordChangeRequired: 'changement de mot de passe requis',
    apiKeyApproved: (label) => `La clé API « ${label} » a été approuvée`,
    apiKeyRevoked: (label) => `La clé API « ${label} » a été révoquée`,
    savedSearchMatches: (name, count) => `${count} nouveau${count === 1 ? '' : 'x'} tournoi${count === 1 ? '' : 's'} pour « ${name} »`,
    tournamentAutoFinished: 'Terminé automatiquement, car le tournoi a commencé il y a plus de 48 heures.',
    liveViewAvailable: (name) => `${name} : vous êtes enregistré – tirages et résultats dans la vue en direct`,
    slotLinked: (name) => `${name} : vous avez été inscrit à ce tournoi. Si ce n’est pas vous, choisissez « Ce n’est pas moi » dans la vue en direct.`,
    accountConflict: (name) => `${name} : vous figurez dans plusieurs inscriptions. L’organisation va régler cela ; veuillez la contacter.`,
    adminAction: (name, action) => `${name} : ${({ binding_takeover: 'liaison du document reprise', binding_release: 'liaison du document supprimée', running_reset: 'démarrage du tournoi annulé', tournament_deleted: 'tournoi supprimé' })[action] || action}`,
    usernameChangedByAdmin: (username) => `Un administrateur a changé ton nom d’utilisateur en @${username}.`,
    usernameReported: (username) => `Le nom d’utilisateur @${username} a été signalé`,
  },
};

function buildSystemNotificationPushBody(eventType, eventData, language) {
  const texts = SYSTEM_NOTIFICATION_TEXTS[language] || SYSTEM_NOTIFICATION_TEXTS.de;
  const data = eventData || {};
  if (eventType === 'tournament_status_changed') {
    const status = `${data.tournamentName}: ${texts.tournamentStatus[data.status] || data.status}`;
    return data.automatic ? `${status}\n${texts.tournamentAutoFinished}` : status;
  }
  if (eventType === 'registration_status_changed') {
    const status = `${data.tournamentName}: ${texts.registrationFor(data.participant || '')} ${texts.registrationStatus[data.status] || data.status}`;
    return data.message ? `${status}\n${texts.organizerMessage}: ${data.message}` : status;
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
  if (eventType === LIVE_VIEW_AVAILABLE_EVENT) {
    return texts.liveViewAvailable(data.tournamentName || '');
  }
  if (eventType === REGISTRATION_SLOT_LINKED_EVENT) return texts.slotLinked(data.tournamentName || '');
  if (eventType === REGISTRATION_ACCOUNT_CONFLICT_EVENT) return texts.accountConflict(data.tournamentName || '');
  if (eventType === TOURNAMENT_ADMIN_ACTION_EVENT) return texts.adminAction(data.tournamentName || '', data.action);
  if (eventType === 'username_changed_by_admin') return texts.usernameChangedByAdmin(data.newUsername || '');
  if (eventType === 'username_reported') return texts.usernameReported(data.username || '');
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
      if (!/^https?:\/\/[^\s<]+$/.test(part)) return escapeEmailHtml(part);
      // Satzzeichen am Ende ("… siehe https://example.org.") gehört nicht zur Adresse, wie in RichText.
      const trailing = part.match(/[.,;:!?)\]]+$/)?.[0] || '';
      const url = escapeEmailHtml(trailing ? part.slice(0, -trailing.length) : part);
      return `<a href="${url}" style="color:#086f61;text-decoration:underline;word-break:break-all;">${url}</a>${escapeEmailHtml(trailing)}`;
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

const EMAIL_TEXT_STYLE = 'margin:0 0 10px;color:#25332f;font-size:16px;line-height:25px;';

function renderEmailInline(node) {
  let html = linkifyEmailHtml(node.text);
  for (const mark of node.marks || []) {
    if (mark.type === 'bold') html = `<strong>${html}</strong>`;
    if (mark.type === 'italic') html = `<em>${html}</em>`;
    if (mark.type === 'underline') html = `<u>${html}</u>`;
    if (mark.type === 'strike') html = `<s>${html}</s>`;
  }
  return html;
}

function renderEmailRichNode(node) {
  const inline = (node.content || []).map(renderEmailInline).join('');
  if (node.type === 'paragraph') return `<p style="${EMAIL_TEXT_STYLE}">${inline || '&nbsp;'}</p>`;
  if (node.type === 'heading') return `<p style="margin:0 0 10px;color:#173b34;font-size:18px;line-height:26px;font-weight:700;">${inline}</p>`;
  const tag = node.type === 'orderedList' ? 'ol' : 'ul';
  const start = tag === 'ol' && node.attrs?.start > 1 ? ` start="${node.attrs.start}"` : '';
  const items = node.content.map((item) => `<li style="margin:0 0 4px;">${item.content.map(renderEmailRichNode).join('')}</li>`).join('');
  return `<${tag}${start} style="margin:0 0 10px;padding-left:24px;color:#25332f;font-size:16px;line-height:25px;">${items}</${tag}>`;
}

// Nutzernachricht (Rich Text oder alter Klartext) als abgesetzte Box; alle Texte werden escaped.
function renderEmailMessageBox(value) {
  const document = parseRichText(value);
  const inner = document
    ? document.content.map(renderEmailRichNode).join('')
    : `<p style="${EMAIL_TEXT_STYLE}">${linkifyEmailHtml(value).replace(/\n/g, '<br>')}</p>`;
  return `<div style="margin:0 0 18px;padding:16px 20px 6px;background:#f4f8f7;border:1px solid #dce6e2;border-left:4px solid #087f6f;border-radius:8px;">${inner}</div>`;
}

/**
 * Builds an email-client-safe HTML alternative for every transactional message. The plain text
 * body remains the canonical fallback, while this layout gives modern clients a readable card,
 * clear action links and a separate product footer. All dynamic content is escaped before use.
 */
export function renderTransactionalEmailHtml(subject, text, language, messageBox = null) {
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
          <tr><td style="padding:34px 32px 24px;"><h1 style="margin:0 0 24px;color:#173b34;font-size:24px;line-height:31px;">${escapeEmailHtml(subject)}</h1>${renderEmailSection(content, labels)}${messageBox ? renderEmailMessageBox(messageBox) : ''}</td></tr>
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
    // Slot-E-Mail der ersten Person (E-22), falls sie nicht die Kontakt-E-Mail des Melders ist.
    { email: registration.player_email, firstName: registration.first_name },
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
  // Persönlicher Live-Link (E-21), nur wenn das Turnier die Live-Ansicht anbietet. Der Aufrufer reicht teils eine
  // zusammengesetzte Zeile durch, daher wird die Option frisch gelesen.
  const liveOption = await env.DB.prepare('SELECT live_view_enabled FROM tournaments WHERE id = ?').bind(tournament.id).first();
  const liveLink = isLiveViewEnabled(liveOption) ? buildLiveLink(appOrigin, await issueLiveToken(env.DB, registration.id)) : '';

  for (const recipient of buildTeamRecipients(registration)) {
    await enqueueTransactionalEmail(env, {
      to: recipient.email,
      subject: templates.subject(tournament.name),
      text: templates.text(recipient.firstName, tournament.name, dateTimeLabel, formatLocationAddress(tournament.location), link, cancelLink, participantsBlock, liveLink),
      language,
      attachments: [{ filename: 'termin.ics', content: base64Encode(ics) }],
      logFallback: `Registration confirmation email for ${recipient.email} (tournament ${tournament.id})`,
      failureContext: `registration confirmation for registration ${registration.id}`,
      allowLogFallback: true,
    });
  }
}

/**
 * "Live-Link neu senden" (EW-02): erzeugt einen neuen persönlichen Link, macht den alten ungültig und schickt ihn an
 * die E-Mail-Adressen der Spieler. Der Link selbst erscheint nie in der Antwort, nur in der Mail.
 */
export async function resendLiveLink(env, registration, user, appOrigin) {
  const tournament = await getTournamentById(env.DB, registration.tournament_id);
  if (!isLiveViewEnabled(tournament)) throw new HttpError(409, 'Für dieses Turnier ist die Live-Ansicht nicht eingeschaltet');
  if (registration.status !== 'confirmed') throw new HttpError(409, 'Einen Live-Link gibt es nur für bestätigte Anmeldungen');
  const recipients = buildTeamRecipients(registration);
  if (recipients.length === 0) throw new HttpError(409, 'Die Anmeldung hat keine E-Mail-Adresse');
  if (!(await canSendTournamentMail(env.DB, tournament))) throw new HttpError(409, 'Für dieses Turnier ist der E-Mail-Versand nicht freigeschaltet');
  const language = await resolveEmailLanguage(env.DB, tournament, registration);
  const templates = LIVE_LINK_EMAILS[language] || LIVE_LINK_EMAILS.de;
  const liveLink = buildLiveLink(appOrigin, await issueLiveToken(env.DB, registration.id));
  for (const recipient of recipients) {
    await enqueueTransactionalEmail(env, {
      to: recipient.email,
      subject: templates.subject(tournament.name),
      text: templates.text(recipient.firstName, tournament.name, liveLink),
      language,
      logFallback: `Live link email for ${recipient.email} (tournament ${tournament.id})`,
      failureContext: `live link for registration ${registration.id}`,
      allowLogFallback: true,
    });
  }
  await env.DB.batch([auditStatement(env.DB, { tournamentId: tournament.id, registrationId: registration.id, actorUserId: user.id,
    actorRole: actorRoleFor(tournament, user), action: 'live_link_reissued', target: 'registration',
    details: { recipients: recipients.length } })]);
  return json({ sent: recipients.length });
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

function createRandomToken() {
  return crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
}

/** Turnier-Option „Live-Ansicht“ (Standard aus): persönlicher Link, Live-Liste und Push bei neuer Runde. */
function isLiveViewEnabled(tournament) {
  return Number(tournament?.live_view_enabled || 0) === 1;
}

/**
 * Erzeugt einen neuen persönlichen Live-Link je Anmeldung (EW-02). Gespeichert wird nur der Hash, deshalb gibt es den
 * Link im Klartext nur in der Mail, die ihn verschickt; jeder neue Link macht den vorherigen ungültig (Widerruf).
 * Bewusst getrennt vom cancel_token: Der Link darf nicht abmelden können.
 */
async function issueLiveToken(db, registrationId) {
  const token = createRandomToken();
  await db.prepare('UPDATE registrations SET live_token_hash = ? WHERE id = ?').bind(await sha256Hex(token), registrationId).run();
  return token;
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
// Muss mit dem täglichen Eintrag unter triggers.crons in wrangler.jsonc übereinstimmen.
const DAILY_CRON = '0 1 * * *';

// Beginn eines Turniers als UTC-Zeitpunkt (Datum + Startzeit in der Turnier-Zeitzone; ganztägige
// Turniere zählen ab 00:00 Ortszeit).
export function tournamentStartUtcIso(tournament) {
  const local = `${tournament.date}T${tournament.start_time || '00:00'}`;
  try {
    return zonedDateTimeToUtcIso(local, tournament.timezone || 'Europe/Berlin');
  } catch {
    return `${local}:00.000Z`;
  }
}

/**
 * Nach 48 Stunden ab Turnierbeginn läuft kein Turnier mehr: vergessene "Läuft"-Turniere werden
 * automatisch abgeschlossen, damit sie nicht dauerhaft im Bereich "Live" stehen. Die
 * Turnierleitung bekommt dazu eine Nachricht ins Postfach. Daten bleiben unverändert; ein späterer Metadaten-Sync aus dem Turnierdokument kann
 * den Status wieder setzen.
 */
async function finishStaleTournaments(env, now = new Date()) {
  const db = env.DB;
  const candidates = await db.prepare(`SELECT id, name, owner_id, date, start_time, timezone FROM tournaments
      WHERE status = 'running' AND date <= ?`).bind(dateDaysAgo(1, now)).all();
  const stale = (candidates.results || []).filter((row) => isTournamentStale(tournamentStartUtcIso(row), now));
  if (stale.length === 0) return;
  const statement = db.prepare("UPDATE tournaments SET status = 'finished', updated_at = ? WHERE id = ? AND status = 'running'");
  const results = await db.batch(stale.map((row) => statement.bind(now.toISOString(), row.id)));
  console.log(`Finished ${stale.length} stale running tournament(s)`);
  // Nur die Turnierleitung erfährt davon (Postfach + Push), Teilnehmer nicht.
  for (let index = 0; index < stale.length; index += 1) {
    if (!results[index]?.meta?.changes) continue;
    const row = stale[index];
    try {
      await createSystemNotification(env, row.owner_id, 'tournament_status_changed', { tournamentName: row.name, status: 'finished', automatic: true });
    } catch (error) {
      console.error(`Failed to notify owner about auto-finished tournament ${row.id}`, error);
    }
  }
}

/**
 * Datenschutz (DS-04, DS-05): Nach Abschluss eines Turniers und Ablauf der festen Frist von 12 Monaten werden Kontakt- und Slot-E-Mails,
 * Antworten auf Online-Fragen, Tarife und Nachrichten gelöscht; Namen, Ergebnisse und Ranglisten bleiben. Das Protokoll
 * bleibt erhalten, E-Mail-Adressen und Kontozuordnungen darin werden durch nicht rückführbare Kennungen ersetzt.
 */
const AUTOMATIC_PURGE_SETTING = 'automatic_personal_data_purge';
/** Feste Aufbewahrungsfrist für alle Turniere, gezählt ab Turnierdatum (DS-04). Die Spalte data_retention_months ist ungenutzt. */
const DATA_RETENTION_MONTHS = 12;

async function readSetting(db, key) {
  return (await db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first())?.value ?? null;
}

/**
 * Automatische Löschung personenbezogener Daten nach Ablauf der Aufbewahrungsfrist (DS-04): nur, wenn ein Admin sie
 * eingeschaltet hat. Standard ist aus, damit ein Deploy nicht ungeprüft historische Turnierdaten pseudonymisiert.
 */
export async function isAutomaticPurgeEnabled(db) {
  return (await readSetting(db, AUTOMATIC_PURGE_SETTING)) === 'true';
}

export async function purgeExpiredPersonalDataWennAktiviert(db, now = new Date()) {
  if (!(await isAutomaticPurgeEnabled(db))) return;
  await purgeExpiredPersonalData(db, now);
}

/** Beendete Turniere, deren Aufbewahrungsfrist abgelaufen ist und die noch nicht bereinigt wurden. */
async function tournamentsDueForPurge(db, now = new Date()) {
  const candidates = await db.prepare(`SELECT id, date FROM tournaments
      WHERE status = 'finished' AND personal_data_purged_at IS NULL`).all();
  return (candidates.results || []).filter((row) => {
    const limit = new Date(`${row.date}T00:00:00Z`);
    limit.setUTCMonth(limit.getUTCMonth() + DATA_RETENTION_MONTHS);
    return limit.getTime() <= now.getTime();
  });
}

/** Admin: Stand des Schalters und wie viele Turniere ein Löschlauf jetzt bereinigen würde. */
export async function getDataRetentionSettings(db, now = new Date()) {
  return json({
    automaticPurgeEnabled: await isAutomaticPurgeEnabled(db),
    dueTournaments: (await tournamentsDueForPurge(db, now)).length,
  });
}

export async function updateDataRetentionSettings(request, db, adminUser) {
  const body = await readJson(request);
  if (typeof body.automaticPurgeEnabled !== 'boolean') {
    throw new HttpError(400, 'automaticPurgeEnabled muss true oder false sein');
  }
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by_user_id) VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,
          updated_by_user_id = excluded.updated_by_user_id`)
      .bind(AUTOMATIC_PURGE_SETTING, String(body.automaticPurgeEnabled), now, adminUser.id),
    auditStatement(db, { actorUserId: adminUser.id, actorRole: 'admin', action: 'setting_changed',
      target: AUTOMATIC_PURGE_SETTING, details: { enabled: body.automaticPurgeEnabled }, now }),
  ]);
  return getDataRetentionSettings(db);
}

export async function purgeExpiredPersonalData(db, now = new Date()) {
  const due = await tournamentsDueForPurge(db, now);
  for (const tournament of due) {
    const nowIso = now.toISOString();
    const audits = (await db.prepare('SELECT id, action, actor_user_id, details_json FROM audit_log WHERE tournament_id = ? AND pseudonymized_at IS NULL')
      .bind(tournament.id).all()).results || [];
    // Pro Turnier und Konto eine zufällige Kennung: Abläufe bleiben im Protokoll nachvollziehbar, aber nicht rückführbar.
    const pseudonyms = new Map();
    const pseudonym = (value) => {
      if (!pseudonyms.has(value)) pseudonyms.set(value, `pseudo-${crypto.randomUUID()}`);
      return pseudonyms.get(value);
    };
    const pseudonymizeDetails = (value) => {
      if (typeof value === 'string') return value.includes('@') ? pseudonym(value.toLowerCase()) : value;
      if (Array.isArray(value)) return value.map(pseudonymizeDetails);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
          /userid$/i.test(key) && typeof entry === 'string' ? pseudonym(entry) : pseudonymizeDetails(entry)]));
      }
      return value;
    };
    const accountChange = /^account_/;
    const statements = [
      db.prepare(`UPDATE registrations SET email = 'ohne-email-' || lower(hex(randomblob(16))) || '@ohne-email.invalid',
          player_email = NULL, partner_email = NULL, partner2_email = NULL, fee_selections = '[]', registration_answers = '[]',
          organizer_message = NULL WHERE tournament_id = ?`).bind(tournament.id),
      ...audits.map((row) => {
        let details = null;
        try { details = row.details_json ? JSON.parse(row.details_json) : null; } catch { details = null; }
        if (details && typeof details === 'object') {
          details = pseudonymizeDetails(details);
          for (const key of ['from', 'to']) if (typeof details[key] === 'string' && accountChange.test(row.action || '')) details[key] = pseudonym(details[key]);
        }
        return db.prepare('UPDATE audit_log SET actor_user_id = ?, details_json = ?, pseudonymized_at = ? WHERE id = ?')
          .bind(row.actor_user_id ? pseudonym(row.actor_user_id) : null, details ? JSON.stringify(details) : null, nowIso, row.id);
      }),
      db.prepare('UPDATE tournaments SET personal_data_purged_at = ? WHERE id = ?').bind(nowIso, tournament.id),
    ];
    await db.batch(statements);
  }
  return due.length;
}

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
    // Stündlich: vergessene Turniere 48 Stunden nach Beginn abschließen. Erinnerungen und der
    // Pétanque-Aktuell-Abgleich laufen weiterhin nur einmal täglich (DAILY_CRON).
    // Das Aufräumen abgelaufener Sitzungen/Tokens lief früher vor jeder API-Anfrage (rund 8
    // DELETE-Abfragen pro Aufruf). Alle Lesepfade prüfen das Ablaufdatum selbst, stündlich reicht.
    const jobs = [
      finishStaleTournaments(env).catch((error) => console.error('Finishing stale tournaments failed', error)),
      cleanupExpiredSessions(env.DB).catch((error) => console.error('Cleanup cron failed', error)),
      deletePlayerListingsOfFinishedTournaments(env.DB).catch((error) => console.error('Deleting player listings of finished tournaments failed', error)),
    ];
    if (event.cron === DAILY_CRON) {
      jobs.push(
        sendTournamentReminders(env).catch((error) => console.error('Tournament reminder cron failed', error)),
        syncPetanqueAktuellImports(env).catch((error) => console.error('Pétanque Aktuell sync cron failed', error)),
        purgeExpiredPersonalDataWennAktiviert(env.DB).catch((error) => console.error('Purging expired personal data failed', error)),
      );
    }
    ctx.waitUntil(Promise.all(jobs));
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

      if (request.method === 'GET' && url.pathname === '/api/username-available') {
        return await checkUsernameAvailability(env.DB, url);
      }

      if (request.method === 'POST' && url.pathname === '/api/email/verify') {
        return await verifyEmail(request, env.DB, env);
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

      if (request.method === 'POST' && url.pathname === '/api/me/username/confirm') {
        const session = await requireSession(request, env.DB);
        return await confirmOwnUsername(env.DB, session.user.id);
      }

      if (request.method === 'DELETE' && url.pathname === '/api/me') {
        const session = await requireSession(request, env.DB);
        return await deleteOwnAccount(request, env.DB, url, session.user.id);
      }

      if (request.method === 'GET' && url.pathname === '/api/postbox') {
        const session = await requireSession(request, env.DB);
        return await getPostbox(env.DB, session.user);
      }

      if (request.method === 'GET' && url.pathname === '/api/postbox/recipients') {
        const session = await requireSession(request, env.DB);
        return await listPostboxRecipients(env.DB, session.user.id);
      }

      if (request.method === 'GET' && url.pathname === '/api/postbox/recipients/lookup') {
        const session = await requireSession(request, env.DB);
        return await lookupPostboxRecipientByEmail(env.DB, session.user.id, url.searchParams.get('email'));
      }

      if (request.method === 'POST' && url.pathname === '/api/postbox/messages') {
        const session = await requireSession(request, env.DB);
        return await sendPostboxMessage(request, env, session.user);
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

      const usernameReportMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/username-report$/);
      if (usernameReportMatch && request.method === 'POST') {
        const session = await requireSession(request, env.DB);
        return await reportUsername(request, env, usernameReportMatch[1], session.user.id);
      }

      if (request.method === 'GET' && url.pathname === '/api/admin/username-reports') {
        await requireAdmin(request, env.DB);
        return await listUsernameReports(env.DB);
      }

      const usernameReportResolveMatch = url.pathname.match(/^\/api\/admin\/username-reports\/([^/]+)\/resolve$/);
      if (usernameReportResolveMatch && request.method === 'POST') {
        const session = await requireAdmin(request, env.DB);
        return await resolveUsernameReport(request, env, usernameReportResolveMatch[1], session.user.id);
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
      if (request.method === 'GET' && url.pathname === '/api/clubs') {
        return await listPublishedClubs(env.DB);
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
      if (url.pathname === '/api/admin/settings/data-retention') {
        const session = await requireAdmin(request, env.DB);
        if (request.method === 'GET') return await getDataRetentionSettings(env.DB);
        if (request.method === 'PUT') return await updateDataRetentionSettings(request, env.DB, session.user);
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
          return await listRegistrations(env.DB, tournament);
        }

        if (request.method === 'POST') {
          const session = await optionalSession(request, env.DB);
          const shareToken = url.searchParams.get('share');
          const shareAccess = await hasTournamentShareAccess(env.DB, tournament, shareToken);
          const shareTokenHash = shareAccess ? await sha256Hex(shareToken) : null;
          return await createRegistration(request, env, tournament, { session, shareAccess, shareTokenHash });
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
          const response = await generateTournamentRound(env.DB, tournament);
          const latest = await env.DB.prepare('SELECT MAX(round_number) AS round_number FROM tournament_rounds WHERE tournament_id = ?').bind(tournament.id).first();
          if (latest?.round_number) await notifyLivePushForRound(env, tournament, Number(latest.round_number), url.origin);
          return response;
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

      if (url.pathname === '/api/live/me' && request.method === 'GET') {
        const session = await requireSession(request, env.DB);
        return await listMyLiveRegistrations(env.DB, session.user);
      }

      // Persönlicher Live-Link ohne Login (E-21): Wer den Link hat, sieht die Team-Ansicht und kann Push abonnieren.
      const liveTokenMatch = url.pathname.match(/^\/api\/live\/token\/([^/]+)(\/push)?$/);
      if (liveTokenMatch) {
        const registration = await findLiveRegistrationByToken(env.DB, decodeURIComponent(liveTokenMatch[1]));
        if (!liveTokenMatch[2] && request.method === 'GET') return await buildLiveResponse(request, env.DB, registration);
        if (liveTokenMatch[2] && request.method === 'POST') return await saveLivePushSubscription(request, env.DB, registration);
        if (liveTokenMatch[2] && request.method === 'DELETE') return await removeLivePushSubscription(request, env.DB, registration);
      }

      const liveRegistrationMatch = url.pathname.match(/^\/api\/live\/registrations\/([^/]+)(\/push)?$/);
      if (liveRegistrationMatch) {
        const session = await requireSession(request, env.DB);
        const registration = await findMyLiveRegistration(env.DB, session.user, liveRegistrationMatch[1]);
        if (!liveRegistrationMatch[2] && request.method === 'GET') return await buildLiveResponse(request, env.DB, registration);
        if (liveRegistrationMatch[2] && request.method === 'POST') return await saveLivePushSubscription(request, env.DB, registration);
        if (liveRegistrationMatch[2] && request.method === 'DELETE') return await removeLivePushSubscription(request, env.DB, registration);
      }


      // Öffentlicher VAPID-Schlüssel für Live-Push ohne Login (der Schlüssel ist nicht geheim).
      if (url.pathname === '/api/live/push/public-key' && request.method === 'GET') {
        if (!env.VAPID_PUBLIC_KEY) throw new HttpError(503, 'Push-Benachrichtigungen sind nicht konfiguriert');
        return json({ publicKey: env.VAPID_PUBLIC_KEY });
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
          assertTournamentDeletable(tournament, url.searchParams.get('confirmDocumentManaged') === 'true');
          return await deleteTournament(env, tournament, session.user);
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
        return await startTournament(env, tournament, session.user, new URL(request.url).origin);
      }

      // Web-Gegenstueck zu /api/sync/.../disconnect: Der Turnierleiter trennt ohne Dokument-Lease,
      // z. B. wenn das Turnierdokument nicht mehr verfuegbar ist, und fuehrt das Turnier online weiter.
      const tournamentDisconnectMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/disconnect$/);
      if (tournamentDisconnectMatch && request.method === 'POST') {
        const session = await requireSession(request, env.DB);
        const tournament = await getTournamentById(env.DB, tournamentDisconnectMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, session.user);
        const plan = disconnectTournament(env.DB, tournament.id);
        await env.DB.batch([...plan.statements, auditStatement(env.DB, { tournamentId: tournament.id,
          actorUserId: session.user.id, actorRole: actorRoleFor(tournament, session.user), action: 'binding_release',
          target: 'tournament' })]);
        await notifyOwnerAboutAction(env, tournament, session.user, 'binding_release');
        return json(plan.response.envelope.body);
      }

      const resetRunningMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/reset-running$/);
      if (resetRunningMatch && request.method === 'POST') {
        const session = await requireSession(request, env.DB);
        const tournament = await getTournamentById(env.DB, resetRunningMatch[1]);
        if (!tournament) throw new HttpError(404, 'Turnier nicht gefunden');
        assertCanManageTournament(tournament, session.user);
        const response = await resetTournamentRunning(env.DB, tournament, session.user);
        await notifyOwnerAboutAction(env, tournament, session.user, 'running_reset');
        return response;
      }

      const registrationClosedMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/registration-closed$/);
      if (registrationClosedMatch && request.method === 'PUT') {
        const session = await requireSession(request, env.DB);
        const tournament = await getTournamentById(env.DB, registrationClosedMatch[1]);
        if (!tournament) throw new HttpError(404, 'Turnier nicht gefunden');
        assertCanManageTournament(tournament, session.user);
        return await setRegistrationClosed(request, env.DB, tournament, session.user);
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

      const publicationMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/publication$/);
      if (publicationMatch && request.method === 'PUT') {
        const session = await requireSession(request, env.DB);
        const tournament = await getTournamentById(env.DB, publicationMatch[1]);
        if (!tournament) {
          throw new HttpError(404, 'Turnier nicht gefunden');
        }
        assertCanManageTournament(tournament, session.user);
        return await updateTournamentPublication(request, env, tournament, session.user);
      }

      const shareLinkMatch = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/share-link$/);
      if (shareLinkMatch) {
        const session = await requireSession(request, env.DB);
        const tournament = await getTournamentById(env.DB, shareLinkMatch[1]);
        if (!tournament) throw new HttpError(404, 'Turnier nicht gefunden');
        assertCanManageTournament(tournament, session.user);
        // Öffentliche Entwürfe haben noch keine sichtbare Seite; private sind über den Freigabe-Link teilbar.
        if (tournament.status === 'draft' && tournament.visibility !== 'private') throw new HttpError(400, 'Entwürfe können nicht geteilt werden');
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

      const registrationRelinkMatch = url.pathname.match(/^\/api\/registrations\/([^/]+)\/slots\/([1-3])\/relink$/);
      if (registrationRelinkMatch && request.method === 'POST') {
        const auth = await requireManagerAuth(request, env.DB);
        const registration = await getRegistrationWithTournament(env.DB, registrationRelinkMatch[1]);
        if (!registration) throw new HttpError(404, 'Anmeldung nicht gefunden');
        assertCanManageTournament(registration, auth.user);
        return await relinkRegistrationSlot(env, registration, Number(registrationRelinkMatch[2]), auth.user);
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
          return await updateRegistration(request, env, registration, auth.user);
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

      const registrationLiveLinkMatch = url.pathname.match(/^\/api\/registrations\/([^/]+)\/live-link$/);
      if (registrationLiveLinkMatch && request.method === 'POST') {
        const auth = await requireManagerAuth(request, env.DB);
        const registration = await getRegistrationWithTournament(env.DB, registrationLiveLinkMatch[1]);
        if (!registration) throw new HttpError(404, 'Anmeldung nicht gefunden');
        assertCanManageTournament(registration, auth.user);
        return await resendLiveLink(env, registration, auth.user, url.origin);
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
        const participation = parseParticipation(body.participation);
        return await setRegistrationParticipation(env.DB, registration, participation);
      }

      if (url.pathname === '/api/sync/tournaments' && request.method === 'GET') {
        const auth = await requireApiKey(request, env.DB);
        return await listManagedTournaments(env.DB, auth.user);
      }

      const syncConnectMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/connect$/);
      if (syncConnectMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncConnectMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        return await connectTournament(request, env.DB, tournament, auth.user);
      }

      const syncTakeoverMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/takeover$/);
      if (syncTakeoverMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncTakeoverMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        const response = await takeoverTournamentDocument(request, env.DB, tournament, auth.user);
        const taken = response.ok ? await response.clone().json() : null;
        // Nur eine echte Übernahme von einem anderen Dokument, keine Wiederholung derselben Übernahme.
        if (taken && tournament.sync_document_id && taken.syncDocumentId !== tournament.sync_document_id) {
          await notifyOwnerAboutAction(env, tournament, auth.user, 'binding_takeover');
        }
        return response;
      }

      const syncDisconnectMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/disconnect$/);
      if (syncDisconnectMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncDisconnectMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        return await executeSyncWrite(request, env.DB, tournament, (db) => disconnectTournament(db, tournament.id));
      }

      const syncStartMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/start$/);
      if (syncStartMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncStartMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        return await executeSyncWrite(request, env.DB, tournament, () => startTournamentFromSync(request, env, tournament),
          { user: auth.user });
      }

      const syncRegistrationsMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/registrations$/);
      if (syncRegistrationsMatch) {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncRegistrationsMatch[1]);
        assertCanManageTournament(tournament, auth.user);

        if (request.method === 'GET') {
          return await syncGetRegistrations(env.DB, tournament, url);
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
        const tournament = await getSyncTournament(env.DB, syncRegistrationUpsertMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        return await executeSyncWrite(request, env.DB, tournament,
          () => upsertDocumentRegistration(request, env, tournament, syncRegistrationUpsertMatch[2]));
      }

      const syncResultsMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/results$/);
      if (syncResultsMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncResultsMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        return await executeSyncWrite(request, env.DB, tournament, () => syncPostResults(request, env, tournament.id));
      }

      const syncRoundMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/rounds\/([^/]+)$/);
      if (syncRoundMatch && (request.method === 'PUT' || request.method === 'DELETE')) {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncRoundMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        if (request.method === 'DELETE') {
          return await executeSyncWrite(request, env.DB, tournament, (db) => syncDeleteRound(db, tournament, syncRoundMatch[2]));
        }
        return await executeSyncWrite(request, env.DB, tournament, async (db) => {
          const plan = await syncPutRound(request, db, tournament, syncRoundMatch[2]);
          const { roundNumber, matchCount, created } = plan.response.envelope.body;
          // Nur eine neu angelegte Runde löst Push aus - spätere PUTs derselben Runde sind Ergebnis-Updates. Beim
          // Replay eines Auftrags läuft afterCommit nicht erneut.
          return { ...plan, afterCommit: created && matchCount > 0
            ? () => notifyLivePushForRound(env, tournament, roundNumber, url.origin) : undefined };
        });
      }

      const syncRankingMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/ranking$/);
      if (syncRankingMatch && request.method === 'PUT') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncRankingMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        return await executeSyncWrite(request, env.DB, tournament, (db) => syncPutRanking(request, db, tournament));
      }

      const syncMetadataMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/metadata$/);
      if (syncMetadataMatch && request.method === 'PUT') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncMetadataMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        return await executeSyncWrite(request, env.DB, tournament, () => syncPutTournamentMetadata(request, env, tournament),
          { user: auth.user });
      }

      const syncDecisionsMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/decisions$/);
      if (syncDecisionsMatch && request.method === 'POST') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncDecisionsMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        return await executeSyncWrite(request, env.DB, tournament, (db) => syncPostDecisions(request, db, tournament, auth.user));
      }

      const syncRegistrationClosedMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/registration-closed$/);
      if (syncRegistrationClosedMatch && request.method === 'PUT') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncRegistrationClosedMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        return await executeSyncWrite(request, env.DB, tournament,
          (db) => syncPutRegistrationClosed(request, db, tournament, auth.user));
      }

      const syncMeleeTeamsMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/melee-teams$/);
      if (syncMeleeTeamsMatch && request.method === 'PUT') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncMeleeTeamsMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        return await executeSyncWrite(request, env.DB, tournament, (db) => syncPutMeleeTeams(request, db, tournament));
      }

      const syncMappingMatch = url.pathname.match(/^\/api\/sync\/tournaments\/([^/]+)\/mapping$/);
      if (syncMappingMatch && request.method === 'GET') {
        const auth = await requireApiKey(request, env.DB);
        const tournament = await getSyncTournament(env.DB, syncMappingMatch[1]);
        assertCanManageTournament(tournament, auth.user);
        await requireSyncLease(request, tournament);
        return await syncGetMapping(env.DB, tournament.id);
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
    const writtenTournament = request.method !== 'GET' && response.ok
      ? url.pathname.match(/^\/api\/(?:sync\/)?tournaments\/([^/]+)(?:\/|$)/)
      : null;
    if (writtenTournament) {
      await invalidateLiveSnapshot(url.origin, decodeURIComponent(writtenTournament[1]));
    }
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
  const username = await saveAccountWithUsername(db, { chosen: user.username, firstName: user.firstName, lastName: user.lastName }, (candidate) => db
    .prepare(
      `INSERT INTO users (id, first_name, last_name, username, email, role, password_salt, password_hash, email_verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, ?, ?, ?)`,
    )
    .bind(id, user.firstName, user.lastName, candidate, user.email, password.salt, password.hash, now, now, now)
    .run());

  const session = await createSession(db, id);
  return json(
    { user: toPublicUser({ id, first_name: user.firstName, last_name: user.lastName, username, email: user.email, role: 'admin', email_verified_at: now, created_at: now, updated_at: now }) },
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
    const user = await findOrCreateOAuthUser(env.DB, 'google', profile, env);
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
    const user = await findOrCreateOAuthUser(env.DB, 'facebook', profile, env);
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

export async function findOrCreateOAuthUser(db, provider, profile, env = { DB: db }) {
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
    await linkUnlinkedRegistrationsForUser(db, linked.id, profile.email, env);
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
    await linkUnlinkedRegistrationsForUser(db, existing.id, profile.email, env);
    return { ...existing, email_verified_at: existing.email_verified_at || now, updated_at: now };
  }

  const password = await hashPassword(crypto.randomUUID() + crypto.randomUUID());
  const userId = crypto.randomUUID();
  const userFullName = profile.name.length >= 2 ? profile.name : profile.email;
  const splitName = splitFullName(userFullName);
  const userFirstName = splitName.firstName.slice(0, USER_NAME_MAX_LENGTH);
  const userLastName = splitName.lastName.slice(0, USER_NAME_MAX_LENGTH);
  // Automatisch vergeben, der Nutzer bestätigt oder ändert ihn danach (Hinweis-Banner).
  const username = await saveAccountWithUsername(db, { firstName: userFirstName, lastName: userLastName }, (candidate) => db.batch([
    db
      .prepare(
        `INSERT INTO users (id, first_name, last_name, username, email, role, password_salt, password_hash, email_verified_at, password_change_required, tournament_limit, mail_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?, 0, ?, 0, ?, ?)`,
      )
      .bind(userId, userFirstName, userLastName, candidate, profile.email, password.salt, password.hash, now, DEFAULT_TOURNAMENT_LIMIT, now, now),
    oauthAccountInsert(db, userId, provider, profile, now),
  ]));
  await linkUnlinkedRegistrationsForUser(db, userId, profile.email, env);

  return {
    id: userId,
    first_name: userFirstName,
    last_name: userLastName,
    username,
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

export async function registerUser(request, env, url) {
  const db = env.DB;
  const body = await readJson(request);
  // Automated submissions that populate the hidden website field receive the normal
  // success response, but no account or verification email is created.
  if (nullableText(body.website)) {
    return json({ message: 'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.' }, 201);
  }
  const user = normalizeUserInput({ ...body, role: 'user' }, { requirePassword: true });
  const language = normalizeLanguage(body.language);
  const now = new Date().toISOString();
  // Ältere Clients ohne Benutzernamen-Feld erhalten einen Vorschlag, den sie später bestätigen.
  const usernameConfirmedAt = user.username ? now : null;
  const password = await hashPassword(user.password);
  const id = crypto.randomUUID();

  try {
    await saveAccountWithUsername(db, { chosen: user.username, firstName: user.firstName, lastName: user.lastName }, (candidate) => db
      .prepare(
        `INSERT INTO users (id, first_name, last_name, username, username_confirmed_at, email, role, password_salt, password_hash, email_verified_at, language, mail_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'user', ?, ?, NULL, ?, 0, ?, ?)`,
      )
      .bind(id, user.firstName, user.lastName, candidate, usernameConfirmedAt, user.email, password.salt, password.hash, language, now, now)
      .run());
  } catch (error) {
    throw accountConflictError(error) || error;
  }

  await linkUnlinkedRegistrationsForUser(db, id, user.email);

  const verificationUrl = await createEmailVerification(db, env, url, id, user.email, language);
  const response = {
    message: 'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.',
  };

  if (isLocalhost(url)) {
    response.verificationUrl = verificationUrl;
  }

  return json(response, 201);
}

export async function verifyEmail(request, db, env = { DB: db }) {
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
    await linkUnlinkedRegistrationsForUser(db, verification.user_id, verification.new_email, env);
    return json({ ok: true });
  }

  await db.batch([
    db.prepare('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?').bind(now, now, verification.user_id),
    db.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE token_hash = ?').bind(now, tokenHash),
  ]);

  const user = await db.prepare('SELECT email FROM users WHERE id = ?').bind(verification.user_id).first();
  await linkUnlinkedRegistrationsForUser(db, verification.user_id, user?.email, env);

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
      'SELECT id, first_name, last_name, username, username_changed_at, username_confirmed_at, email, pending_email, role, club, email_verified_at, password_change_required, tournament_limit, mail_enabled, created_at, updated_at FROM users ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE',
    )
    .all();
  return json({ users: result.results.map(toPublicUser) });
}

export async function listPostboxRecipients(db, userId) {
  const result = await db.prepare(
    "SELECT id, first_name, last_name, username, club, role FROM users WHERE id != ? AND id != ? AND role = 'user' ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE",
  ).bind(userId, TOURNAMENT_REPORT_SYSTEM_USER_ID).all();
  const tournaments = await db.prepare(
    `SELECT t.id, t.name, t.date, COUNT(r.id) AS registration_count
     FROM tournaments t
     LEFT JOIN registrations r ON r.tournament_id = t.id AND r.status IN ${BROADCAST_REGISTRATION_STATUSES_SQL}
     WHERE t.owner_id = ? AND t.registration_enabled = 1
     GROUP BY t.id, t.name, t.date
     ORDER BY t.name COLLATE NOCASE`,
  ).bind(userId).all();
  return json({
    recipients: result.results.map(toPostboxRecipient),
    tournaments: tournaments.results.map((tournament) => ({
      id: tournament.id,
      name: tournament.name,
      date: tournament.date,
      registrationCount: Number(tournament.registration_count),
    })),
  });
}

function toPostboxRecipient(user) {
  return { id: user.id, firstName: user.first_name, lastName: user.last_name, username: user.username || null, club: user.club || null, role: user.role };
}

// Exakte E-Mail findet einen Empfänger, ohne dass die Adresse zurückgegeben wird.
export async function lookupPostboxRecipientByEmail(db, userId, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!isEmail(normalized)) throw new HttpError(400, 'Eine gültige E-Mail ist erforderlich');
  const user = await db
    .prepare("SELECT id, first_name, last_name, username, club, role FROM users WHERE email = ? AND id != ? AND id != ? AND role = 'user'")
    .bind(normalized, userId, TOURNAMENT_REPORT_SYSTEM_USER_ID)
    .first();
  if (!user) throw new HttpError(404, 'Kein Benutzer mit dieser E-Mail-Adresse gefunden');
  return json({ recipient: toPostboxRecipient(user) });
}

const USERNAME_REPORTS_PER_DAY = 10;

export async function reportUsername(request, env, reportedUserId, reporterId) {
  const db = env.DB;
  const body = await readJson(request);
  const reason = nullableText(body.reason)?.slice(0, 500) || null;
  if (reportedUserId === reporterId) throw new HttpError(400, 'Du kannst dich nicht selbst melden');
  const reported = await db.prepare('SELECT id, username FROM users WHERE id = ?').bind(reportedUserId).first();
  if (!reported?.username) throw new HttpError(404, 'Benutzer nicht gefunden');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await db.prepare('SELECT COUNT(*) AS count FROM username_reports WHERE reporter_id = ? AND created_at > ?').bind(reporterId, since).first();
  if (Number(recent?.count || 0) >= USERNAME_REPORTS_PER_DAY) throw new HttpError(429, 'Zu viele Meldungen. Bitte versuche es morgen erneut.');

  try {
    await db
      .prepare('INSERT INTO username_reports (id, reported_user_id, reporter_id, reported_username, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), reported.id, reporterId, reported.username, reason, new Date().toISOString())
      .run();
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) throw new HttpError(409, 'Du hast diesen Benutzernamen bereits gemeldet');
    throw error;
  }

  const { results: admins } = await db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
  for (const admin of admins) {
    await createSystemNotification(env, admin.id, USERNAME_REPORTED_EVENT, { username: reported.username });
  }
  return json({ ok: true }, 201);
}

export async function listUsernameReports(db) {
  const { results } = await db.prepare(
    `SELECT r.id, r.reported_user_id, r.reported_username, r.reason, r.created_at,
            u.first_name, u.last_name, u.username, u.club,
            rep.first_name AS reporter_first_name, rep.last_name AS reporter_last_name, rep.username AS reporter_username
     FROM username_reports r
     JOIN users u ON u.id = r.reported_user_id
     LEFT JOIN users rep ON rep.id = r.reporter_id
     WHERE r.status = 'open'
     ORDER BY r.created_at`,
  ).all();
  return json({
    reports: results.map((row) => ({
      id: row.id,
      reportedUser: { id: row.reported_user_id, firstName: row.first_name, lastName: row.last_name, username: row.username, club: row.club || null },
      reportedUsername: row.reported_username,
      reporter: row.reporter_username
        ? { firstName: row.reporter_first_name, lastName: row.reporter_last_name, username: row.reporter_username }
        : null,
      reason: row.reason || null,
      createdAt: row.created_at,
    })),
  });
}

export async function resolveUsernameReport(request, env, reportId, adminId) {
  const db = env.DB;
  const body = await readJson(request);
  const report = await db.prepare("SELECT id, reported_user_id FROM username_reports WHERE id = ? AND status = 'open'").bind(reportId).first();
  if (!report) throw new HttpError(404, 'Meldung nicht gefunden');

  if (body.action === 'dismiss') {
    await db.prepare("UPDATE username_reports SET status = 'dismissed', resolved_by = ?, resolved_at = ? WHERE id = ?")
      .bind(adminId, new Date().toISOString(), reportId).run();
    return json({ ok: true });
  }
  if (body.action !== 'rename') throw new HttpError(400, 'Ungültige Aktion');

  const user = await db.prepare('SELECT id, username FROM users WHERE id = ?').bind(report.reported_user_id).first();
  if (!user) throw new HttpError(404, 'Benutzer nicht gefunden');
  const newUsername = await assertUsernameAllowed(db, body.newUsername, { userId: user.id });
  if (newUsername === user.username) throw new HttpError(400, 'Bitte einen neuen Benutzernamen angeben');
  await renameUsernameByAdmin(env, user, newUsername, nullableText(body.reason), adminId);
  return json({ ok: true });
}

const POSTBOX_MESSAGE_MAX_LENGTH = 500;
const POSTBOX_MESSAGE_MAX_STORED_LENGTH = 20_000;

// Ein Turnier-Broadcast erreicht offene, bestätigte und Wartelisten-Meldungen.
const BROADCAST_REGISTRATION_STATUSES_SQL = "('pending', 'confirmed', 'waitlist')";

// Turniere, deren Broadcasts der Nutzer sieht.
const PARTICIPANT_TOURNAMENTS_SUBQUERY = `SELECT DISTINCT reg.tournament_id FROM registrations reg
  WHERE ? IN (reg.user_id, reg.partner_user_id, reg.partner2_user_id)
    AND reg.status IN ${BROADCAST_REGISTRATION_STATUSES_SQL}`;

async function getPostbox(db, user) {
  const result = await db.prepare(
    `SELECT m.*, s.first_name AS sender_first_name, s.last_name AS sender_last_name, s.username AS sender_username, r.first_name AS recipient_first_name, r.last_name AS recipient_last_name, r.username AS recipient_username, t.name AS broadcast_tournament_name
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

// Nachrichtentext: Klartext oder Rich Text. Das Limit gilt für den sichtbaren Text; das Rich-Text-JSON ist nur grob gedeckelt.
export function postboxMessageBody(value) {
  const text = String(value || '').trim();
  const plainText = richTextPlainText(normalizeRichText(text, 'Ungültige Nachricht')).trim();
  if (!plainText || plainText.length > POSTBOX_MESSAGE_MAX_LENGTH || text.length > POSTBOX_MESSAGE_MAX_STORED_LENGTH) {
    throw new HttpError(400, 'Die Nachricht muss zwischen 1 und 500 Zeichen lang sein');
  }
  return text;
}

async function sendPostboxMessage(request, env, sender) {
  const body = await readJson(request);
  const recipientRaw = String(body.recipientId || '').trim();
  if (!recipientRaw) throw new HttpError(400, 'Bitte wähle einen Empfänger');
  const text = postboxMessageBody(body.body);

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

export async function createBroadcastPostboxMessage(env, { sender, tournament, body }) {
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
    `SELECT * FROM registrations WHERE tournament_id = ? AND status IN ${BROADCAST_REGISTRATION_STATUSES_SQL}`,
  ).bind(tournament.id).all();

  const uniqueRecipients = new Map();
  for (const registration of registrations.results || []) {
    for (const recipient of buildTeamRecipients(registration)) {
      const email = String(recipient.email || '').trim().toLowerCase();
      if (!email || email === sender.email.toLowerCase() || uniqueRecipients.has(email)) continue;
      uniqueRecipients.set(email, { email: recipient.email, firstName: recipient.firstName, language: registration.language });
    }
  }

  const accountUsers = await participantAccountUserIds(env.DB, tournament.id, sender.id, { includeWaitlist: true });
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
        text: templates.text(recipient.firstName, tournament.name, `${sender.firstName} ${sender.lastName}`),
        messageBox: body,
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
    filterClub: row.filter_club || '',
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
    filterClub: String(body.filterClub || '').trim().slice(0, 160),
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
      id, user_id, name, query, only_mine, filter_month, filter_formation, filter_registration_type, filter_type, filter_club, filter_open_only, filter_online_registration_only,
      origin_lat, origin_lng, origin_label, radius_km, notify_enabled, last_checked_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).bind(
    id, userId, input.name, input.query, input.onlyMine ? 1 : 0, input.filterMonth, input.filterFormation,
    input.filterRegistrationType, input.filterType, input.filterClub, input.filterOpenOnly ? 1 : 0, input.filterOnlineRegistrationOnly ? 1 : 0,
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
     filter_type = ?, filter_club = ?, filter_open_only = ?, filter_online_registration_only = ?, origin_lat = ?, origin_lng = ?, origin_label = ?, radius_km = ?, notify_enabled = ?,
     last_checked_at = CASE WHEN ? = 1 AND ? = 0 THEN NULL ELSE last_checked_at END, updated_at = ?
     WHERE id = ?`,
  ).bind(
    input.name, input.query, input.onlyMine ? 1 : 0, input.filterMonth, input.filterFormation, input.filterRegistrationType,
    input.filterType, input.filterClub, input.filterOpenOnly ? 1 : 0, input.filterOnlineRegistrationOnly ? 1 : 0, input.origin?.lat ?? null, input.origin?.lng ?? null, input.origin?.label ?? null,
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
  const clubIds = [...new Set(activeSearches.map((search) => search.filter_club).filter(Boolean))];
  const clubLocationsById = new Map(clubIds.map((clubId) => [clubId, []]));
  if (clubIds.length) {
    const placeholders = clubIds.map(() => '?').join(', ');
    const rows = await env.DB.prepare(
      `SELECT p.club_id, p.latitude, p.longitude
       FROM boule_places p JOIN clubs c ON c.id = p.club_id
       WHERE p.status = 'published' AND c.status = 'published' AND p.club_id IN (${placeholders})
         AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL`,
    ).bind(...clubIds).all();
    for (const row of rows.results || []) clubLocationsById.get(row.club_id)?.push({ latitude: Number(row.latitude), longitude: Number(row.longitude) });
  }
  let tournamentForMatching = tournament;
  if (activeSearches.some((search) => Number(search.filter_online_registration_only))) {
    const activeRegistrations = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM registrations WHERE tournament_id = ? AND status IN ('pending', 'confirmed')",
    ).bind(tournament.id).first();
    tournamentForMatching = { ...tournament, active_registrations: Number(activeRegistrations?.count || 0) };
  }
  const matches = activeSearches.filter((search) => tournamentMatchesSavedSearch(tournamentForMatching, search, clubLocationsById.get(search.filter_club) || []));
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
  let username;
  try {
    username = await saveAccountWithUsername(db, { chosen: user.username, firstName: user.firstName, lastName: user.lastName }, (candidate) => db
      .prepare(
        `INSERT INTO users (id, first_name, last_name, username, email, role, password_salt, password_hash, email_verified_at, password_change_required, tournament_limit, mail_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, user.firstName, user.lastName, candidate, user.email, user.role, password.salt, password.hash, emailVerifiedAt, passwordChangeRequired, tournamentLimit, mailEnabled, now, now)
      .run());
  } catch (error) {
    throw accountConflictError(error) || error;
  }

  await linkUnlinkedRegistrationsForUser(db, id, user.email);

  return json(
    {
      user: toPublicUser({
        id,
        first_name: user.firstName,
        last_name: user.lastName,
        username,
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

export async function updateUser(request, env, id, currentUserId) {
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
  const newUsername = user.username && user.username !== existing.username
    ? await assertUsernameAllowed(db, user.username, { userId: id })
    : null;

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
    throw accountConflictError(error) || error;
  }
  if (newUsername) {
    await renameUsernameByAdmin(env, existing, newUsername, nullableText(body.usernameChangeReason), currentUserId);
  }

  const updated = await db
    .prepare(
      'SELECT id, first_name, last_name, username, username_changed_at, username_confirmed_at, email, pending_email, role, club, email_verified_at, password_change_required, tournament_limit, mail_enabled, created_at, updated_at FROM users WHERE id = ?',
    )
    .bind(id)
    .first();
  if (updated.email_verified_at) {
    await linkUnlinkedRegistrationsForUser(env.DB, updated.id, updated.email, env);
  }
  if (updated.role !== existing.role || updated.email_verified_at !== existing.email_verified_at || Number(updated.password_change_required) !== Number(existing.password_change_required)) {
    await createSystemNotification(env, id, 'account_status_changed', { role: updated.role, emailVerified: Boolean(updated.email_verified_at), passwordChangeRequired: Boolean(Number(updated.password_change_required)) });
  }
  return json({ user: toPublicUser(updated) });
}

const USERNAME_CHANGED_BY_ADMIN_EVENT = 'username_changed_by_admin';
const USERNAME_REPORTED_EVENT = 'username_reported';

// Admin-Umbenennung: Der alte Name wird gesperrt, offene Meldungen gelten als erledigt, der Nutzer wird informiert
// und soll den neuen Namen bestätigen. Die 30-Tage-Frist des Nutzers bleibt unberührt.
async function renameUsernameByAdmin(env, user, newUsername, reason, adminId) {
  const db = env.DB;
  const now = new Date().toISOString();
  const statements = [
    db.prepare('UPDATE users SET username = ?, username_confirmed_at = NULL, updated_at = ? WHERE id = ?').bind(newUsername, now, user.id),
    db.prepare("UPDATE username_reports SET status = 'resolved', resolved_by = ?, resolved_at = ? WHERE reported_user_id = ? AND status = 'open'")
      .bind(adminId, now, user.id),
  ];
  if (user.username) {
    statements.push(db.prepare('INSERT OR IGNORE INTO blocked_usernames (username, reason, created_by, created_at) VALUES (?, ?, ?, ?)')
      .bind(user.username, reason, adminId, now));
  }
  try {
    await db.batch(statements);
  } catch (error) {
    throw accountConflictError(error) || error;
  }
  await createSystemNotification(env, user.id, USERNAME_CHANGED_BY_ADMIN_EVENT, { oldUsername: user.username || null, newUsername, reason });
}

async function resolveOwnUsernameChange(db, existing, value) {
  if (value === undefined || value === null || value === '') return null;
  const username = normalizeUsername(value);
  if (username === existing.username) return null;
  if (!existing.email_verified_at) {
    throw new HttpError(400, 'Der Benutzername kann erst nach Bestätigung der E-Mail-Adresse geändert werden');
  }
  if (usernameChangeAllowedAt(existing.username_changed_at)) {
    throw new HttpError(400, 'Der Benutzername kann nur alle 30 Tage geändert werden');
  }
  return assertUsernameAllowed(db, username, { userId: existing.id });
}

export async function confirmOwnUsername(db, userId) {
  const now = new Date().toISOString();
  await db.prepare('UPDATE users SET username_confirmed_at = COALESCE(username_confirmed_at, ?) WHERE id = ? AND username IS NOT NULL').bind(now, userId).run();
  return json({ ok: true });
}

export async function updateOwnProfile(request, env, url, userId) {
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
  if (firstName.length > USER_NAME_MAX_LENGTH || lastName.length > USER_NAME_MAX_LENGTH) {
    throw new HttpError(400, 'Vorname und Nachname dürfen höchstens 50 Zeichen enthalten');
  }
  const newUsername = await resolveOwnUsernameChange(db, existing, body.username);

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
    if (newUsername) {
      await db.prepare('UPDATE users SET username = ?, username_changed_at = ?, username_confirmed_at = ? WHERE id = ?')
        .bind(newUsername, now, now, userId).run();
    }
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
    throw accountConflictError(error) || error;
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
      'SELECT id, first_name, last_name, username, username_changed_at, username_confirmed_at, email, pending_email, role, club, license_nr, email_verified_at, password_change_required, created_at, updated_at FROM users WHERE id = ?',
    )
    .bind(userId)
    .first();

  const response = { user: toPublicUser(updated) };
  if (emailChanged && isLocalhost(url)) {
    response.verificationUrl = verificationUrl;
  }
  return json(response);
}

// Self-Service-Kontolöschung: eigene Turniere (inkl. Anmeldungen) werden mitgelöscht,
// Vereine/Gruppen und selbst gepflegte Bouleplätze gehen an den ältesten anderen Admin.
// clubs.owner_id ist ON DELETE CASCADE - ohne vorherige Übertragung würden Verein,
// Editoren und Vereinsplätze (boule_places.club_id CASCADE) stillschweigend mitgelöscht.
export async function deleteOwnAccount(request, db, url, userId) {
  if (userId === TOURNAMENT_REPORT_SYSTEM_USER_ID) {
    throw new HttpError(403, 'Zugriff verweigert');
  }
  const existing = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!existing) {
    throw new HttpError(404, 'Benutzer nicht gefunden');
  }

  const body = await readJson(request);
  const confirmation = String(body.confirmation || '');
  let confirmed = confirmation.length > 0 && (await verifyPassword(confirmation, existing.password_salt, existing.password_hash));
  if (!confirmed) {
    // Google-Konten haben nur ein zufälliges Passwort - dort bestätigt die E-Mail-Adresse.
    const oauthAccount = await db.prepare('SELECT 1 FROM oauth_accounts WHERE user_id = ? LIMIT 1').bind(userId).first();
    confirmed = Boolean(oauthAccount) && confirmation.trim().toLowerCase() === String(existing.email).toLowerCase();
  }
  if (!confirmed) {
    throw new HttpError(400, 'Passwort bzw. E-Mail-Adresse ist falsch');
  }

  const admin = await db
    .prepare("SELECT id FROM users WHERE role = 'admin' AND id != ? AND id != ? ORDER BY created_at ASC LIMIT 1")
    .bind(userId, TOURNAMENT_REPORT_SYSTEM_USER_ID)
    .first();
  if (!admin) {
    throw new HttpError(400, 'Der letzte Administrator kann sein Konto nicht löschen');
  }

  const now = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE clubs SET owner_id = ?, updated_at = ? WHERE owner_id = ?').bind(admin.id, now, userId),
    // Der neue Owner hat ohnehin volle Rechte - ein zusätzlicher Editor-Eintrag wäre redundant.
    db.prepare('DELETE FROM club_editors WHERE user_id = ? AND club_id IN (SELECT id FROM clubs WHERE owner_id = ?)').bind(admin.id, admin.id),
    db.prepare('UPDATE boule_places SET reported_by_user_id = ?, updated_at = ? WHERE reported_by_user_id = ?').bind(admin.id, now, userId),
    ...ownedTournamentDeletionStatements(db, userId, { actorUserId: userId, actorRole: 'owner', reason: 'account_deleted', now }),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);

  // Die Session ist per CASCADE gelöscht - kein verlängertes Cookie mehr nachschieben.
  sessionRefreshes.delete(request);
  return json({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie(url) });
}

export async function deleteUser(db, id, currentUserId, deleteTournaments) {
  if (id === TOURNAMENT_REPORT_SYSTEM_USER_ID) {
    throw new HttpError(403, 'Zugriff verweigert');
  }
  if (id === currentUserId) {
    throw new HttpError(400, 'Du kannst deinen eigenen Benutzer nicht löschen');
  }

  const now = new Date().toISOString();

  // Alles in einem Batch: bricht ein Schritt ab, bleibt das Konto mit Vereinen, Plätzen und Turnieren unverändert.
  const results = await db.batch([
    // Vereine/Gruppen und selbst gepflegte Bouleplätze gehen immer an den löschenden Admin:
    // clubs.owner_id ist ON DELETE CASCADE und würde Verein samt Vereinsplätzen mitreißen.
    db.prepare('UPDATE clubs SET owner_id = ?, updated_at = ? WHERE owner_id = ?').bind(currentUserId, now, id),
    db.prepare('DELETE FROM club_editors WHERE user_id = ? AND club_id IN (SELECT id FROM clubs WHERE owner_id = ?)').bind(currentUserId, currentUserId),
    db.prepare('UPDATE boule_places SET reported_by_user_id = ?, updated_at = ? WHERE reported_by_user_id = ?').bind(currentUserId, now, id),
    // Nur selbst besessene Turniere: bei denen dieser User lediglich Editor war, gehören sie anderen Ownern; der
    // tournament_editors-Eintrag entfällt über ON DELETE CASCADE auf user_id.
    ...(deleteTournaments
      ? ownedTournamentDeletionStatements(db, id, { actorUserId: currentUserId, actorRole: 'admin', reason: 'account_deleted', now })
      // Sonst an den löschenden Admin: owner_id ist NOT NULL mit FK ON DELETE CASCADE, ohne Umhängen würde das Turnier
      // kaskadierend mitgelöscht. creator_id (rein informativ) bleibt bewusst unangetastet.
      : [db.prepare('UPDATE tournaments SET owner_id = ?, updated_at = ? WHERE owner_id = ?').bind(currentUserId, now, id)]),
    db.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ]);
  if (results.at(-1).meta.changes === 0) {
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
/**
 * Ein abgeschlossenes Turnier nimmt kein neues Turnierdokument mehr an: es könnte nur noch Namen, Ergebnisse und
 * Rangliste des beendeten Turniers überschreiben. Das bereits gebundene Dokument bleibt davon unberührt.
 */
function assertBindableTournament(tournament, syncDocumentId) {
  if (tournament.status === 'finished' && tournament.sync_document_id !== syncDocumentId) {
    throw new HttpError(409, 'Ein abgeschlossenes Turnier kann nicht mit einem Turnierdokument verbunden werden', {
      code: 'tournament_finished',
    });
  }
}

export async function connectTournament(request, db, tournament, user = null) {
  const body = await readJson(request);
  const syncDocumentId = requireUuid(body.syncDocumentId, 'syncDocumentId');
  const leaseToken = requireSecret(body.leaseToken, 'leaseToken');
  const leaseTokenHash = await sha256Hex(leaseToken);
  const protocol = syncProtocolVersion(body.protocolVersion);
  const connectRequestId = body.connectRequestId === undefined ? null : requireUuid(body.connectRequestId, 'connectRequestId');
  assertBindableTournament(tournament, syncDocumentId);
  if (tournament.sync_document_id && tournament.sync_document_id !== syncDocumentId) {
    throw new HttpError(409, 'Dieses Turnier ist bereits mit einem anderen Turnierdokument verbunden', {
      code: 'document_bound', bindingRevision: Number(tournament.sync_binding_revision || 0),
    });
  }
  if (tournament.sync_document_id === syncDocumentId
      && !(await constantTimeEquals(leaseTokenHash, tournament.sync_lease_token_hash || ''))) {
    throw new HttpError(409, 'Das lokale Dokument besitzt kein gültiges Schreib-Lease', { code: 'lease_invalid' });
  }
  const newBinding = tournament.sync_document_id !== syncDocumentId;
  if (newBinding) await assertRecoveryConfirmed(db, tournament, body.recovery === true);
  const now = new Date().toISOString();
  const bindingRevision = tournament.sync_document_id ? Number(tournament.sync_binding_revision || 0) : 1;
  // Eine neue Bindung beginnt mit Schreibzähler 0; dasselbe Dokument behält seinen Stand (E-24, P-22).
  const connect = db.prepare(`UPDATE tournaments
                    SET document_managed = 1, sync_document_id = ?, sync_lease_token_hash = ?,
                        sync_binding_revision = ?, sync_protocol = ?,
                        sync_write_counter = CASE WHEN sync_document_id = ? THEN sync_write_counter ELSE 0 END,
                        updated_at = ?
                    WHERE id = ? AND (sync_document_id IS NULL OR sync_document_id = ?)`)
    .bind(syncDocumentId, leaseTokenHash, bindingRevision, protocol, syncDocumentId, now, tournament.id, syncDocumentId);
  const statements = [connect];
  if (newBinding) {
    statements.push(clearForeignLocalRegistrationIds(db, tournament.id,
      'sync_document_id = ? AND sync_lease_token_hash = ?', [syncDocumentId, leaseTokenHash]));
    statements.push(auditStatement(db, { tournamentId: tournament.id, actorUserId: user?.id, actorRole: 'document',
      action: 'binding_connect', target: 'tournament', details: { syncDocumentId, recovery: body.recovery === true }, now }));
  }
  if (connectRequestId) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO sync_requests (tournament_id, request_id, payload_hash, counter,
        sync_document_id, state, response_json, created_at) VALUES (?, ?, '', NULL, ?, 'done', NULL, ?)`)
      .bind(tournament.id, connectRequestId, syncDocumentId, now));
  }
  const [connected] = await db.batch(statements);
  if (!connected.meta.changes) {
    const current = await getTournamentById(db, tournament.id);
    throw new HttpError(409, 'Die Dokumentbindung wurde zwischenzeitlich geändert', {
      code: 'binding_conflict', bindingRevision: Number(current.sync_binding_revision || 0),
    });
  }
  const current = await getTournamentById(db, tournament.id);
  return json({ ok: true, syncDocumentId, bindingRevision, writeCounter: Number(current.sync_write_counter || 0) });
}

function syncProtocolVersion(value) {
  if (value === undefined || value === null) return 1;
  const version = Number(value);
  if (version !== 1 && version !== 2) throw new HttpError(400, 'protocolVersion ist ungültig');
  return version;
}

/**
 * Nach dem Turnierstart bindet ein anderes Dokument nur als ausdrückliche Wiederherstellung (E-03, KP-08). Ohne
 * recovery liefert der Server die Zahl der Online-Runden, damit PTM die Warnung vor dem Überschreiben zeigen kann.
 */
async function assertRecoveryConfirmed(db, tournament, recovery) {
  if (tournament.status !== 'running' || recovery) return;
  const rounds = await db.prepare('SELECT COUNT(*) AS count FROM tournament_rounds WHERE tournament_id = ?')
    .bind(tournament.id).first();
  throw new HttpError(409, 'Das Turnier läuft bereits; ein anderes Dokument kann nur als Wiederherstellung verbunden werden', {
    code: 'recovery_required', roundsOnline: Number(rounds?.count || 0),
  });
}

function auditStatement(db, { tournamentId = null, registrationId = null, actorUserId = null, actorRole, action, target = null,
  details = null, now = new Date().toISOString() }) {
  return db.prepare(`INSERT INTO audit_log (id, tournament_id, registration_id, actor_user_id, actor_role, action, target,
      details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), tournamentId, registrationId, actorUserId, actorRole, action, target,
      details ? JSON.stringify(details) : null, now);
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

/**
 * Turnier für die Sync-API. Ein gelöschtes Turnier meldet ausdrücklich tournament_deleted (KP-07); nur dieser Code
 * beendet in PTM die Verbindung, ein 404 oder Netzfehler gilt nie als Löschung.
 */
export async function getSyncTournament(db, id) {
  const tournament = await getTournamentById(db, id);
  if (tournament) return tournament;
  const tombstone = await db.prepare('SELECT name, deleted_at FROM tournament_tombstones WHERE tournament_id = ?').bind(id).first();
  if (tombstone) {
    throw new HttpError(410, 'Das Online-Turnier wurde gelöscht', {
      code: 'tournament_deleted', tournamentName: tombstone.name, deletedAt: tombstone.deleted_at,
    });
  }
  throw new HttpError(404, 'Turnier nicht gefunden');
}

export async function requireSyncLease(request, tournament) {
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

/**
 * Schreibauftrag des verbundenen Turnierdokuments nach dem Ein-Batch-Muster (Spezifikation E-24, T-19, T-23).
 *
 * build(db) liefert { statements, response, afterCommit? }:
 *  - statements: fachliche Änderungen; jede trägt ihre Vorbedingungen selbst im SQL.
 *  - response: { sql, binds } - SELECT mit genau einer Spalte, die den Antwort-Umschlag {status, body} als JSON
 *    aus dem Zustand NACH den Änderungen berechnet - oder { envelope } mit einer vorab feststehenden Antwort.
 *  - afterCommit(envelope): Benachrichtigungen o. Ä.; läuft nur bei der ersten Ausführung, nie beim Replay.
 *
 * Protokoll 2 (neuer PTM): Auftrags-ID und Schreibzähler sind Pflicht. Eintrag in sync_requests (Trigger prüfen
 * Zähler und Bindung), Zählerstand, Änderungen und gespeicherte Antwort laufen in genau einem Batch. Eine
 * Wiederholung mit gleicher Nutzlast liefert die gespeicherte Antwort (X-PTM-Replayed), mit anderer Nutzlast
 * idempotency_mismatch. Protokoll 1 (bisheriger PTM): gleiche Änderungen in einem Batch, ohne Zähler.
 */
export async function executeSyncWrite(request, db, tournament, build, context = {}) {
  await requireSyncLease(request, tournament);
  const url = new URL(request.url);
  if (Number(tournament.sync_protocol || 1) !== 2) {
    const plan = await build(db);
    try {
      await db.batch([...plan.statements, db.prepare('UPDATE tournaments SET last_sync_write_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), tournament.id)]);
    } catch (error) {
      if (plan.mapError) plan.mapError(error);
      throw error;
    }
    const envelope = await syncResponseEnvelope(db, plan.response);
    if (plan.afterCommit) await plan.afterCommit(envelope);
    return respondSyncEnvelope(db, tournament.id, envelope, context);
  }

  const requestId = requireUuid(request.headers.get('X-PTM-Request-Id'), 'X-PTM-Request-Id');
  const counter = Number(request.headers.get('X-PTM-Sync-Counter'));
  if (!Number.isInteger(counter) || counter < 1) throw new HttpError(400, 'X-PTM-Sync-Counter ist ungültig');
  const bodyText = await request.clone().text();
  const payloadHash = await sha256Hex(`${request.method} ${url.pathname}\n${bodyText}`);

  const replay = await syncReplay(db, tournament.id, requestId, payloadHash, context);
  if (replay) return replay;

  const plan = await build(db);
  const now = new Date().toISOString();
  const finalize = plan.response.sql
    ? db.prepare(`UPDATE sync_requests SET state = 'done', response_json = (${plan.response.sql})
        WHERE tournament_id = ? AND request_id = ?`).bind(...(plan.response.binds || []), tournament.id, requestId)
    : db.prepare(`UPDATE sync_requests SET state = 'done', response_json = ? WHERE tournament_id = ? AND request_id = ?`)
      .bind(JSON.stringify(plan.response.envelope), tournament.id, requestId);
  try {
    await db.batch([
      db.prepare(`INSERT INTO sync_requests (tournament_id, request_id, payload_hash, counter, sync_document_id,
          lease_token_hash, state, created_at) VALUES (?, ?, ?, ?, ?, ?, 'claimed', ?)`)
        .bind(tournament.id, requestId, payloadHash, counter, tournament.sync_document_id,
          tournament.sync_lease_token_hash, now),
      db.prepare('UPDATE tournaments SET sync_write_counter = ?, last_sync_write_at = ? WHERE id = ?').bind(counter, now, tournament.id),
      ...plan.statements,
      finalize,
    ]);
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes('document_forked')) {
      throw new HttpError(409, 'Dieses Dokument wurde parallel verändert – ist eine Kopie der Turnierdatei im Einsatz?', {
        code: 'document_forked',
      });
    }
    if (message.includes('binding_changed')) {
      throw new HttpError(409, 'Dieses Dokument wurde durch ein anderes Dokument abgelöst', { code: 'document_replaced' });
    }
    // Gleichzeitige Wiederholung desselben Auftrags: Primärschlüssel verletzt, Ergebnis des anderen Laufs liefern.
    const concurrentReplay = await syncReplay(db, tournament.id, requestId, payloadHash, context);
    if (concurrentReplay) return concurrentReplay;
    if (plan.mapError) plan.mapError(error);
    throw error;
  }
  const envelope = await storedSyncEnvelope(db, tournament.id, requestId);
  if (plan.afterCommit) await plan.afterCommit(envelope);
  return respondSyncEnvelope(db, tournament.id, envelope, context);
}

async function syncReplay(db, tournamentId, requestId, payloadHash, context) {
  const stored = await db.prepare('SELECT payload_hash, state FROM sync_requests WHERE tournament_id = ? AND request_id = ?')
    .bind(tournamentId, requestId).first();
  if (!stored) return null;
  if (stored.payload_hash !== payloadHash) {
    throw new HttpError(409, 'Dieselbe Auftrags-ID wurde mit anderem Inhalt gesendet', { code: 'idempotency_mismatch' });
  }
  const envelope = await storedSyncEnvelope(db, tournamentId, requestId);
  return respondSyncEnvelope(db, tournamentId, envelope, context, { 'X-PTM-Replayed': '1' });
}

/**
 * Antworten mit großen DTOs (Anmeldung, Turnier) werden nicht als Kopie gespeichert, sondern beim Senden aus dem
 * aktuellen Zustand ergänzt (hydrate). Der Umschlag selbst - Status, Erfolg oder Fehlercode - ist gespeichert und
 * bei jeder Wiederholung identisch.
 */
async function respondSyncEnvelope(db, tournamentId, envelope, context, headers = {}) {
  const body = { ...(envelope.body || {}) };
  const hydrate = envelope.hydrate;
  if (hydrate?.kind === 'registration') {
    const row = await db.prepare(`SELECT * FROM registrations WHERE tournament_id = ?
        AND (id = ? OR (? IS NOT NULL AND local_registration_uuid = ?))`)
      .bind(tournamentId, hydrate.id || '', hydrate.uuid || null, hydrate.uuid || null).first();
    if (row) body.registration = toPublicRegistration(row);
  } else if (hydrate?.kind === 'tournament') {
    const row = await getTournamentById(db, tournamentId);
    if (row) body.tournament = toPublicTournament(row, context.user || null);
  }
  return json(body, envelope.status, headers);
}

async function storedSyncEnvelope(db, tournamentId, requestId) {
  const row = await db.prepare('SELECT response_json FROM sync_requests WHERE tournament_id = ? AND request_id = ?')
    .bind(tournamentId, requestId).first();
  return JSON.parse(row.response_json);
}

async function syncResponseEnvelope(db, response) {
  if (!response.sql) return response.envelope;
  const row = await db.prepare(`SELECT (${response.sql}) AS response_json`).bind(...(response.binds || [])).first();
  return JSON.parse(row.response_json);
}

/**
 * Lokale PTM-Online-IDs (local_registration_uuid) gehören zum bisher gebundenen Dokument. Bindet sich ein anderes
 * Dokument, verweisen sie auf Zeilen, die es nicht mehr gibt, und blockieren jede Zuordnung des neuen Dokuments
 * (registration_mapping_conflict). Sie werden daher im selben Batch wie die Bindung verworfen; das neue Dokument
 * bindet seine Anmeldungen bei Bedarf über documentMaster + onlineRegistrationId neu. Die Bedingung stellt sicher,
 * dass nur verworfen wird, wenn genau diese Bindung auch geschrieben wurde.
 */
function clearForeignLocalRegistrationIds(db, tournamentId, bindingCondition, bindingParams) {
  return db.prepare(`UPDATE registrations SET local_registration_uuid = NULL
      WHERE tournament_id = ? AND local_registration_uuid IS NOT NULL
        AND EXISTS (SELECT 1 FROM tournaments WHERE id = ? AND ${bindingCondition})`)
    .bind(tournamentId, tournamentId, ...bindingParams);
}

export async function takeoverTournamentDocument(request, db, tournament, user = null) {
  const body = await readJson(request);
  const syncDocumentId = requireUuid(body.syncDocumentId, 'syncDocumentId');
  const leaseToken = requireSecret(body.leaseToken, 'leaseToken');
  const takeoverRequestId = requireUuid(body.takeoverRequestId, 'takeoverRequestId');
  const protocol = syncProtocolVersion(body.protocolVersion);
  const expectedRevision = Number(body.expectedBindingRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new HttpError(400, 'expectedBindingRevision ist ungültig');
  assertBindableTournament(tournament, syncDocumentId);
  const takeoverResponse = (current) => json({ ok: true, syncDocumentId, bindingRevision: Number(current.sync_binding_revision),
    writeCounter: Number(current.sync_write_counter || 0) });
  if (tournament.sync_takeover_request_id === takeoverRequestId && tournament.sync_document_id === syncDocumentId) {
    return takeoverResponse(tournament);
  }
  if (tournament.sync_document_id !== syncDocumentId) await assertRecoveryConfirmed(db, tournament, body.recovery === true);
  const nextRevision = expectedRevision + 1;
  const now = new Date().toISOString();
  // Die Übernahme beginnt mit Schreibzähler 0: Die alte Datei verliert Lease und Zählerstand (E-08, E-24).
  const takeover = db.prepare(`UPDATE tournaments
      SET document_managed = 1, sync_document_id = ?, sync_lease_token_hash = ?,
          sync_binding_revision = ?, sync_takeover_request_id = ?, sync_protocol = ?, sync_write_counter = 0, updated_at = ?
      WHERE id = ? AND sync_binding_revision = ?`)
    .bind(syncDocumentId, await sha256Hex(leaseToken), nextRevision, takeoverRequestId, protocol,
      now, tournament.id, expectedRevision);
  const bindingCondition = ['sync_document_id = ? AND sync_binding_revision = ? AND sync_takeover_request_id = ?',
    [syncDocumentId, nextRevision, takeoverRequestId]];
  const statements = [takeover,
    db.prepare(`INSERT INTO audit_log (id, tournament_id, actor_user_id, actor_role, action, target, details_json, created_at)
        SELECT ?, ?, ?, 'document', 'binding_takeover', 'tournament', ?, ?
        WHERE EXISTS (SELECT 1 FROM tournaments WHERE id = ? AND ${bindingCondition[0]})`)
      .bind(crypto.randomUUID(), tournament.id, user?.id || null,
        JSON.stringify({ syncDocumentId, previousDocumentId: tournament.sync_document_id || null }), now,
        tournament.id, ...bindingCondition[1])];
  if (tournament.sync_document_id !== syncDocumentId) {
    statements.push(clearForeignLocalRegistrationIds(db, tournament.id, ...bindingCondition));
  }
  const [result] = await db.batch(statements);
  const current = await getTournamentById(db, tournament.id);
  if (!result.meta.changes) {
    if (current.sync_takeover_request_id === takeoverRequestId && current.sync_document_id === syncDocumentId) {
      return takeoverResponse(current);
    }
    throw new HttpError(409, 'Die Dokumentbindung wurde zwischenzeitlich geändert', {
      code: 'binding_conflict', bindingRevision: Number(current.sync_binding_revision || 0),
    });
  }
  return takeoverResponse(current);
}

/**
 * Sync-Schreibzugriff des Turnierdokuments auf eine Anmeldung.
 *
 * Die lokale PTM-Online-ID (URL) ist bei der Neuanlage der Idempotenzschlüssel: Ein wiederholter Versuch (z. B. nach
 * Netzabbruch, bevor das Dokument die Online-ID gespeichert hat) liefert die bereits angelegte Anmeldung zurück,
 * statt eine zweite anzulegen. Bestehende Anmeldungen adressiert das Dokument über onlineRegistrationId aus seinem
 * Sync-Blatt; dabei übernimmt der Server die lokale ID, damit die Zuordnung auch für importierte Online-Anmeldungen
 * vom Server wiederhergestellt werden kann (T-21). Ist die ID schon einer anderen Anmeldung zugeordnet, bleibt sie
 * unverändert.
 */
export async function upsertDocumentRegistration(request, env, tournament, localRegistrationUuid) {
  const db = env.DB;
  const body = await readJson(request);
  const localUuid = requireUuid(localRegistrationUuid, 'localRegistrationUuid');
  if (body.onlineRegistrationId === undefined) {
    return createDocumentRegistration(db, tournament, localUuid, body);
  }
  const onlineRegistrationId = requireUuid(body.onlineRegistrationId, 'onlineRegistrationId');
  const existing = await db.prepare('SELECT * FROM registrations WHERE tournament_id = ? AND id = ?')
    .bind(tournament.id, onlineRegistrationId).first();
  if (!existing) {
    throw new HttpError(404, 'Eine Online-Anmeldung existiert nicht mehr');
  }
  const expected = Number(body.expectedExecutionRevision);
  if (!Number.isInteger(expected) || expected !== Number(existing.execution_revision || 1)) {
    throw new HttpError(409, 'Die Ausführungsdaten wurden zwischenzeitlich geändert', {
      code: 'execution_conflict', registration: toPublicRegistration(existing),
    });
  }
  const status = body.status === undefined ? existing.status : String(body.status);
  if (!REGISTRATION_STATUSES.includes(status)) throw new HttpError(400, 'Ungültiger Status');
  if (status === 'cancelled' && existing.status !== 'cancelled' && await registrationWasDrawn(db, tournament.id, existing.id)) {
    // Ab `running` wird eine Stornierung nur übertragen, solange die Meldung in keiner Runde ausgelost wurde (KP-15).
    throw new HttpError(409, 'Die Meldung wurde bereits ausgelost und kann nur lokal ausgesetzt werden', { code: 'registration_drawn' });
  }
  const participation = body.participation === undefined ? existing.participation : parseParticipation(body.participation);
  const seedingPosition = body.seedingPosition === undefined ? existing.seeding_position : body.seedingPosition;
  const documentMaster = body.documentMaster === true;
  const persons = documentMaster ? parseDocumentPersons(body, tournament) : null;
  let documentRegistration = null;
  if (documentMaster) {
    // The linked Calc document owns the displayed participants.  Registration-owned values such as
    // e-mail addresses, fees and answers deliberately remain untouched: a name correction in Calc
    // must not transfer the personal account/contact data of an older online registration.
    documentRegistration = normalizeRegistrationInput({
      ...body,
      ...(persons ? personsToRegistrationFields(persons) : {}),
      email: existing.email,
      partnerEmail: existing.partner_email,
      partner2Email: existing.partner2_email,
      status: existing.status,
      isVip: Boolean(Number(existing.is_vip || 0)),
      organizerMessage: existing.organizer_message,
    }, { requireStatus: true, documentSync: true });
    assertPartnerCountMatchesFormation(tournament, documentRegistration);
  }
  // Besetzung pro Person-Slot (T-18): Benutzer-IDs bleiben an ihrer Person, ein Slot ohne Benutzer-ID an Stelle eines
  // verknüpften Slots ist ein Personenwechsel - Verknüpfung und Slot-E-Mail der alten Person entfallen (P-45).
  const slotLinks = persons ? documentSlotLinks(existing, persons) : null;
  const now = new Date().toISOString();
  const slotSql = slotLinks ? `, user_id = ?, player_email = ?, partner_user_id = ?, partner_email = ?,
      partner2_user_id = ?, partner2_email = ?` : '';
  const slotBinds = slotLinks ? slotLinks.flatMap((link) => [link.userId, link.email]) : [];
  const update = db.prepare(`UPDATE registrations SET status = ?, participation = ?, seeding_position = ?,
      first_name = CASE WHEN ? THEN ? ELSE first_name END,
      last_name = CASE WHEN ? THEN ? ELSE last_name END,
      club = CASE WHEN ? THEN ? ELSE club END,
      license_nr = CASE WHEN ? THEN ? ELSE license_nr END,
      partner_first_name = CASE WHEN ? THEN ? ELSE partner_first_name END,
      partner_last_name = CASE WHEN ? THEN ? ELSE partner_last_name END,
      partner_license_nr = CASE WHEN ? THEN ? ELSE partner_license_nr END,
      partner2_first_name = CASE WHEN ? THEN ? ELSE partner2_first_name END,
      partner2_last_name = CASE WHEN ? THEN ? ELSE partner2_last_name END,
      partner2_license_nr = CASE WHEN ? THEN ? ELSE partner2_license_nr END,
      team_name = CASE WHEN ? THEN ? ELSE team_name END,
      local_registration_uuid = CASE WHEN EXISTS (SELECT 1 FROM registrations other WHERE other.tournament_id = ?
          AND other.local_registration_uuid = ? AND other.id != ?) THEN local_registration_uuid ELSE ? END${slotSql},
      execution_revision = execution_revision + 1, updated_at = ? WHERE id = ? AND execution_revision = ?`)
    .bind(status, participation, seedingPosition,
      documentMaster ? 1 : 0, documentRegistration?.firstName ?? null,
      documentMaster ? 1 : 0, documentRegistration?.lastName ?? null,
      documentMaster ? 1 : 0, documentRegistration?.club ?? null,
      documentMaster ? 1 : 0, documentRegistration?.licenseNr ?? null,
      documentMaster ? 1 : 0, documentRegistration?.partnerFirstName ?? null,
      documentMaster ? 1 : 0, documentRegistration?.partnerLastName ?? null,
      persons ? 1 : 0, documentRegistration?.partnerLicenseNr ?? null,
      documentMaster ? 1 : 0, documentRegistration?.partner2FirstName ?? null,
      documentMaster ? 1 : 0, documentRegistration?.partner2LastName ?? null,
      persons ? 1 : 0, documentRegistration?.partner2LicenseNr ?? null,
      documentMaster ? 1 : 0, documentRegistration?.teamName ?? null,
      tournament.id, localUuid, existing.id, localUuid, ...slotBinds,
      now, existing.id, expected);
  const unlinkAudits = slotLinks ? SLOT_COLUMNS
    .filter((column, index) => existing[column.userId] && !slotLinks.some((link) => link.userId === existing[column.userId]))
    .map((column) => db.prepare(`INSERT INTO audit_log (id, tournament_id, registration_id, actor_role, action, target, details_json, created_at)
        SELECT ?, ?, ?, 'document', 'account_unlinked', ?, ?, ? WHERE EXISTS (SELECT 1 FROM registrations WHERE id = ? AND updated_at = ?)`)
      .bind(crypto.randomUUID(), tournament.id, existing.id, `slot:${column.slot}`,
        JSON.stringify({ from: existing[column.userId], reason: 'person_replaced' }), now, existing.id, now)) : [];
  return {
    statements: [update, ...unlinkAudits],
    response: {
      sql: `SELECT CASE WHEN EXISTS (SELECT 1 FROM registrations WHERE id = ? AND execution_revision = ? AND updated_at = ?)
          THEN json_object('status', 200, 'body', json_object('created', json('false')),
            'hydrate', json_object('kind', 'registration', 'id', ?))
          ELSE json_object('status', 409, 'body', json_object('error', 'Die Ausführungsdaten wurden zwischenzeitlich geändert',
            'details', json_object('code', 'execution_conflict')))
          END`,
      binds: [existing.id, expected + 1, now, existing.id],
    },
  };
}

/**
 * Besetzung aus dem Dokument als Personenliste in Slot-Reihenfolge: [{ firstName, lastName, licenseNr, userId }]
 * (T-18). Die Personenzahl muss der Anmeldeeinheit entsprechen (E-20); eine Überschreitung ist nicht übertragbar.
 */
function parseDocumentPersons(body, tournament) {
  if (!Array.isArray(body.persons)) return null;
  const persons = body.persons
    .map((person) => ({
      firstName: text(person?.firstName), lastName: text(person?.lastName), licenseNr: nullableText(person?.licenseNr),
      userId: nullableText(person?.userId),
    }))
    .filter((person) => person.firstName || person.lastName);
  const unit = registrationUnit(tournament);
  if (persons.length < unit.min || persons.length > unit.max) {
    throw new HttpError(400, `Die Anmeldung muss ${unit.min === unit.max ? unit.min : `${unit.min} bis ${unit.max}`} Personen enthalten`, {
      code: 'unit_invalid', min: unit.min, max: unit.max,
    });
  }
  const userIds = persons.map((person) => person.userId).filter(Boolean);
  if (new Set(userIds).size !== userIds.length) {
    throw new HttpError(400, 'Eine Benutzer-ID darf nur einer Person zugeordnet sein', { code: 'user_id_invalid' });
  }
  return persons;
}

function personsToRegistrationFields(persons) {
  const [first = {}, second = {}, third = {}] = persons;
  return {
    firstName: first.firstName, lastName: first.lastName, licenseNr: first.licenseNr,
    partnerFirstName: second.firstName || null, partnerLastName: second.lastName || null, partnerLicenseNr: second.licenseNr || null,
    partner2FirstName: third.firstName || null, partner2LastName: third.lastName || null, partner2LicenseNr: third.licenseNr || null,
  };
}

/**
 * Kontoverknüpfung und Slot-E-Mail je Slot nach einer Übertragung aus dem Dokument. Jede empfangene Benutzer-ID muss zu
 * dieser Anmeldung gehören (T-17); PTM erhält sie nur aus PTM Online und kann keine neue Verknüpfung herstellen.
 */
function documentSlotLinks(existing, persons) {
  const existingSlots = SLOT_COLUMNS.map((column) => ({ userId: existing[column.userId] || null, email: existing[column.email] || null }));
  return SLOT_COLUMNS.map((column, index) => {
    const person = persons[index];
    if (!person) return { userId: null, email: null };
    if (person.userId) {
      const source = existingSlots.find((slot) => slot.userId === person.userId);
      if (!source) {
        throw new HttpError(409, 'Die Benutzer-ID gehört nicht zu dieser Anmeldung', { code: 'user_id_invalid', userId: person.userId });
      }
      return { userId: person.userId, email: source.email };
    }
    // Ein verknüpfter Slot ohne Benutzer-ID ist ein Personenwechsel; sonst eine Namenskorrektur (A-14).
    return existingSlots[index].userId ? { userId: null, email: null } : { userId: null, email: existingSlots[index].email };
  });
}

async function registrationWasDrawn(db, tournamentId, registrationId) {
  const row = await db.prepare(`SELECT 1 FROM tournament_matches m WHERE m.tournament_id = ?
      AND (EXISTS (SELECT 1 FROM json_each(m.team_a_registration_ids) j WHERE j.value = ?)
        OR EXISTS (SELECT 1 FROM json_each(m.team_b_registration_ids) j WHERE j.value = ?)) LIMIT 1`)
    .bind(tournamentId, registrationId, registrationId).first();
  return Boolean(row);
}

/**
 * Online-Anlage einer lokalen Meldung durch das verbundene Dokument (Spezifikation T-24). Eigener Zugangsweg, nicht
 * der Anmeldeweg für Formular, Freigabelink und Weboberfläche: Die Nachmeldung der Turnierleitung ist eine bewusste
 * Entscheidung und daher von Kapazität, Warteliste, Meldefrist und automatischem Anmeldeschluss ausgenommen. Überschreitet
 * sie die Kapazität, wird sie im selben Batch als over_capacity gekennzeichnet und protokolliert. Ab `running` legt das
 * Dokument keine Online-Anmeldung mehr an (A-05). Die lokale UUID ist der Idempotenzschlüssel der Neuanlage.
 */
async function createDocumentRegistration(db, tournament, localUuid, body) {
  const created = await db.prepare('SELECT id FROM registrations WHERE tournament_id = ? AND local_registration_uuid = ?')
    .bind(tournament.id, localUuid).first();
  const hydrate = { kind: 'registration', uuid: localUuid };
  if (created) {
    return { statements: [], response: { envelope: { status: 200, body: { created: false }, hydrate } } };
  }
  if (['running', 'finished'].includes(tournament.status)) {
    throw new HttpError(409, 'Anmeldung geschlossen – Turnier läuft', { code: 'tournament_running' });
  }
  const persons = parseDocumentPersons(body, tournament);
  // PTM erfasst in dieser Ausbaustufe keine Benutzer-IDs (E-19); eine neue Meldung kann keine bestehende ID tragen.
  if (persons?.some((person) => person.userId)) {
    throw new HttpError(400, 'Eine neue Meldung kann keine Benutzer-ID tragen', { code: 'user_id_invalid' });
  }
  if (persons) Object.assign(body, personsToRegistrationFields(persons));
  body.email = createPlaceholderEmail();
  const registration = normalizeRegistrationInput(body, { requireStatus: false, documentSync: true });
  assertCorePartnerCountMatchesFormation(tournament, registration);
  const feeSelections = resolveFeeSelections(tournament, body.feeSelections, registration);
  const registrationAnswers = resolveRegistrationAnswers(tournament, body.registrationAnswers, registration);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record = registrationRecord(id, tournament.id, registration, {
    organizerMessage: null, feeSelections, registrationAnswers, language: normalizeLanguage(body.language), now,
    accountLinks: { userId: null, partnerUserId: null, partner2UserId: null },
    cancelToken: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''),
  });
  const participation = body.participation === undefined ? 'inactive' : parseParticipation(body.participation);
  const maxRegistrations = Number(tournament.max_registrations || 0);
  const columns = Object.keys(record);
  return {
    statements: [
      db.prepare(`INSERT INTO registrations (${columns.join(', ')}, status, participation, confirmed_at,
          local_registration_uuid, origin, over_capacity)
        SELECT ${columns.map(() => '?').join(', ')}, 'confirmed', ?, ?, ?, 'document',
          CASE WHEN ? > 0 AND capacity.used >= ? THEN 1 ELSE 0 END
        FROM (SELECT COUNT(*) AS used FROM registrations WHERE tournament_id = ? AND status IN ('pending', 'confirmed')) capacity
        WHERE EXISTS (SELECT 1 FROM tournaments t WHERE t.id = ? AND t.status NOT IN ('running', 'finished'))
        ON CONFLICT DO NOTHING`)
        .bind(...Object.values(record), participation, now, localUuid, maxRegistrations, maxRegistrations,
          tournament.id, tournament.id),
      db.prepare(`INSERT INTO audit_log (id, tournament_id, registration_id, actor_role, action, target, created_at)
          SELECT ?, ?, ?, 'document', 'registration_over_capacity', 'registration', ?
          WHERE EXISTS (SELECT 1 FROM registrations WHERE id = ? AND over_capacity = 1)`)
        .bind(crypto.randomUUID(), tournament.id, id, now, id),
    ],
    response: {
      sql: `SELECT CASE WHEN EXISTS (SELECT 1 FROM registrations WHERE tournament_id = ? AND local_registration_uuid = ?)
          THEN json_object('status', 201, 'body', json_object('created', json('true')),
            'hydrate', json_object('kind', 'registration', 'uuid', ?))
          ELSE json_object('status', 409, 'body', json_object('error', 'Anmeldung geschlossen – Turnier läuft',
            'details', json_object('code', 'tournament_running')))
          END`,
      binds: [tournament.id, localUuid, localUuid],
    },
  };
}

/**
 * Loest die Dokument-Verwaltung eines Turniers wieder (document_managed = 0), Gegenstueck zu
 * connectTournament. Hebt damit auch die in updateTournament() geprueften document_managed-Sperren
 * fuer Web-UI-Edits wieder auf. Ohne verbundenes Dokument kann dieses auch nicht mehr Master der
 * Durchfuehrung sein: desktop_execution wird zurueckgesetzt (sonst bleiben Meldeliste und
 * Online-Auslosung dauerhaft gesperrt) und der Desktop-Ranglisten-Snapshot verworfen. Bereits
 * uebertragene Runden bleiben in tournament_matches erhalten.
 */
export async function disconnectTournament(db, tournamentId) {
  return {
    statements: [db.prepare(`UPDATE tournaments SET document_managed = 0, sync_document_id = NULL, sync_lease_token_hash = NULL,
              sync_takeover_request_id = NULL, desktop_execution = 0, desktop_ranking_json = NULL, updated_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), tournamentId)],
    response: { envelope: { status: 200, body: { ok: true } } },
  };
}

async function resolveTournamentGeolocation(tournament, existing, now, countryCode) {
  if (tournament.latitude !== null && tournament.longitude !== null) {
    return { latitude: tournament.latitude, longitude: tournament.longitude, geocodedAt: null };
  }
  if (existing && existing.location === tournament.location && existing.latitude !== null && existing.latitude !== undefined) {
    return { latitude: existing.latitude, longitude: existing.longitude, geocodedAt: existing.geocoded_at };
  }

  let [result] = await geocodeLocation(tournament.location, { countryCode, limit: 1 });
  const fallbackQuery = result ? null : geocodingFallbackQuery(tournament.location);
  if (fallbackQuery) [result] = await geocodeLocation(fallbackQuery, { countryCode, limit: 1 });
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
        latitude, longitude, geocoded_at, timezone, boule_place_id, live_view_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      tournament.liveViewEnabled ? 1 : 0,
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
        latitude, longitude, geocoded_at, timezone, boule_place_id, fee_tiers, registration_questions, live_view_enabled, created_at, updated_at
      )
      SELECT ?, owner_id, ?, ?, club, date, start_time, location, description, type, formation, formation_other, registration_type, 'draft',
        max_registrations, registration_deadline, registration_opens_at, entry_fee_cents, currency, schweizer_ranking_mode, formule_x_rounds, ko_platz3, contact_name, contact_email, contact_phone,
        visibility, internal_notes, participants_public, license_required, team_name_enabled, waitlist_enabled, registration_enabled, approval_required, website_url, logo_url, flyer_url,
        latitude, longitude, geocoded_at, timezone, boule_place_id, fee_tiers, registration_questions, live_view_enabled, ?, ?
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
// Import ausgeführt (undokumentierte HTML-Struktur der Fremdseite).
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

async function upsertPetanqueAktuellTournament(env, entry, ownerId, now, searches, countryCode) {
  const db = env.DB;
  const mapped = mapPetanqueAktuellTournament(entry);
  const details = await fetchPetanqueAktuellDetails(entry.id);
  if (details?.location) mapped.location = details.location;
  mapped.logoUrl = details?.logoUrl || null;
  // resolveTournamentGeolocation() erwartet latitude/longitude explizit als null (nicht
  // undefined), um "bereits geokodiert" von "noch nie geokodiert" zu unterscheiden.
  mapped.latitude = null;
  mapped.longitude = null;
  if (mapped.name.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(mapped.date) || mapped.location.length < 2) throw new HttpError(400, 'Der ausgewählte Pétanque-Aktuell-Termin ist unvollständig.');
  const existing = await db.prepare('SELECT tournament_id FROM petanque_aktuell_imports WHERE external_key = ?').bind(mapped.externalKey).first();
  if (existing) {
    const previous = await getTournamentById(db, existing.tournament_id);
    const geo = await resolveTournamentGeolocation(mapped, previous, now, countryCode);
    const timezone = resolveTournamentTimezone(geo, previous.timezone || 'Europe/Berlin');
    await db.prepare(`UPDATE tournaments SET name = ?, club = ?, date = ?, start_time = ?, location = ?, description = ?, formation = ?, formation_other = ?, license_required = ?, website_url = ?, flyer_url = ?, latitude = ?, longitude = ?, geocoded_at = ?, timezone = ?, status = 'registration', visibility = 'public', registration_enabled = 0, updated_at = ? WHERE id = ?`)
      .bind(mapped.name, mapped.club, mapped.date, mapped.startTime, mapped.location, mapped.description, mapped.formation === 'andere' ? 'tete' : mapped.formation, mapped.formation === 'andere' ? 1 : 0, mapped.licenseRequired ? 1 : 0, mapped.websiteUrl, mapped.flyerUrl, geo.latitude, geo.longitude, geo.geocodedAt, timezone, now, existing.tournament_id).run();
    // Ein vorhandenes Logo nicht löschen, wenn die Detailseite keins (mehr) liefert.
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
    try { result[await upsertPetanqueAktuellTournament(env, selected.get(key), user.id, now, searches, countryCode)] += 1; }
    catch (error) { console.error(`Pétanque Aktuell import failed for ${key}`, error); result.failed += 1; }
  }
  return json(result, 201);
}

// Der tägliche Sync bleibt bewusst schlank: nur eine Kalender-Abfrage und die Prüfung, ob
// der Termin noch vorhanden ist. Kein Detail-Scrape, keine Geokodierung, keine Feld-Updates -
// dafür gibt es den expliziten Import.
async function syncPetanqueAktuellImports(env) {
  const imports = await env.DB.prepare('SELECT external_key, tournament_id FROM petanque_aktuell_imports').all();
  if (imports.results.length === 0) return { kept: 0, deleted: 0 };
  const available = new Set((await fetchPetanqueAktuellCalendar()).map((entry) => entry.externalKey));
  const missing = imports.results.filter((imported) => !available.has(imported.external_key));
  if (missing.length > 0) await env.DB.batch(missing.map((imported) => env.DB.prepare('DELETE FROM tournaments WHERE id = ?').bind(imported.tournament_id)));
  await env.DB.prepare('UPDATE petanque_aktuell_imports SET synced_at = ?').bind(new Date().toISOString()).run();
  return { kept: imports.results.length - missing.length, deleted: missing.length };
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
  await assertDraftTransitionAllowed(db, existing, tournament.status);
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
           participants_public = ?, license_required = ?, team_name_enabled = ?, waitlist_enabled = ?, registration_enabled = ?, approval_required = ?, latitude = ?, longitude = ?, geocoded_at = ?, timezone = ?, boule_place_id = ?, live_view_enabled = ?, updated_at = ?
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
      tournament.liveViewEnabled ? 1 : 0,
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
  await notifyTournamentPublicationChange(env, existing, updated);
  return json({ tournament: toPublicTournament(updated, user) });
}

/** Veröffentlichung (gespeicherte Suchen) und Statuswechsel (Postfach) nach einer Turnieränderung melden. */
async function notifyTournamentPublicationChange(env, existing, updated) {
  if (isNewlyPublicTournament(existing, updated)) {
    await notifySavedSearchesForPublishedTournament(env, updated);
  }
  if (updated.status !== existing.status) {
    await createSystemNotification(env, existing.owner_id, 'tournament_status_changed', { tournamentName: updated.name, status: updated.status });
    const participants = await participantAccountUserIds(env.DB, existing.id, existing.owner_id);
    await Promise.all((participants.results || []).map((participant) => createSystemNotification(env, participant.id, 'tournament_status_changed', { tournamentName: updated.name, status: updated.status })));
  }
}

/**
 * Status und Sichtbarkeit - auch bei einem mit dem Turnierdokument verbundenen Turnier. Das Dokument überträgt sie
 * nicht (nur den Start über /sync/.../start), die Sperre von updateTournament gilt hier daher nicht. "Läuft" setzt
 * ausschließlich der Turnierstart; ein laufendes Turnier kann nur abgeschlossen werden.
 */
// Zurück zu Entwurf nur ohne bestehende Anmeldungen (Zustandsmodell, P-21); die Ablehnung nennt die Anzahl.
async function assertDraftTransitionAllowed(db, existing, status) {
  if (status !== 'draft' || existing.status === 'draft') return;
  const row = await db.prepare("SELECT COUNT(*) AS count FROM registrations WHERE tournament_id = ? AND status != 'cancelled'")
    .bind(existing.id).first();
  const count = Number(row?.count || 0);
  if (count > 0) {
    throw new HttpError(409, `Das Turnier hat ${count} Anmeldung${count === 1 ? '' : 'en'} und kann nicht zurück auf Entwurf gesetzt werden`, {
      code: 'registrations_exist', count,
    });
  }
}

export async function updateTournamentPublication(request, env, existing, user) {
  const body = await readJson(request);
  const status = String(body.status || '');
  const visibility = String(body.visibility || '');
  if (!['draft', 'registration', 'finished'].includes(status) && status !== existing.status) {
    throw new HttpError(400, 'Ungültiger Turnierstatus');
  }
  if (!VISIBILITIES.includes(visibility)) {
    throw new HttpError(400, 'Ungültige Sichtbarkeit');
  }
  if (existing.status === 'running' && !['running', 'finished'].includes(status)) {
    throw new HttpError(409, 'Ein laufendes Turnier kann nur abgeschlossen werden');
  }
  await assertDraftTransitionAllowed(env.DB, existing, status);
  await env.DB.prepare('UPDATE tournaments SET status = ?, visibility = ?, updated_at = ? WHERE id = ?')
    .bind(status, visibility, new Date().toISOString(), existing.id).run();
  const updated = await getTournamentById(env.DB, existing.id);
  await notifyTournamentPublicationChange(env, existing, updated);
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
  await notifyTournamentStarted(env, existing, updated);
  return updated;
}

async function notifyTournamentStarted(env, existing, updated) {
  if (isNewlyPublicTournament(existing, updated)) {
    await notifySavedSearchesForPublishedTournament(env, updated);
  }
  await createSystemNotification(env, existing.owner_id, 'tournament_status_changed', { tournamentName: updated.name, status: updated.status });
  const participants = await participantAccountUserIds(env.DB, existing.id, existing.owner_id);
  await Promise.all((participants.results || []).map((participant) => createSystemNotification(env, participant.id, 'tournament_status_changed', { tournamentName: updated.name, status: updated.status })));
}

async function startTournament(env, existing, user, appOrigin) {
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
  const result = await db.prepare(`UPDATE registrations SET participation = 'active', updated_at = ?
      WHERE tournament_id = ? AND status = 'confirmed' AND participation = 'inactive' RETURNING id`)
    .bind(new Date().toISOString(), tournamentId).all();
  return (result.results || []).map((row) => row.id);
}

/**
 * Sync-Variante von {@link startTournament}: Ein erster Rundenstart aus PTM legt fest, dass die
 * Durchführung in der Desktop-Anwendung erfolgt. Erst dann ist das Turnierdokument alleiniger
 * Master für Meldeliste und Ausführungsdaten.
 *
 * Läuft das Turnier bereits online, übernimmt das Dokument nur, solange online noch keine Runde
 * ausgelost wurde (z. B. Start aus dem Dokument offline verloren gegangen oder Dokument nach dem
 * Trennen neu verbunden). Mit Online-Runden wird es tatsächlich online durchgeführt: 409.
 */
export async function startTournamentFromSync(request, env, existing) {
  const db = env.DB;
  if (existing.status === 'running' && Number(existing.desktop_execution || 0) !== 1) {
    const onlineRound = await db.prepare('SELECT 1 FROM tournament_rounds WHERE tournament_id = ? LIMIT 1')
      .bind(existing.id).first();
    if (onlineRound) {
      assertDesktopExecution(existing);
    }
  }
  const body = await readJson(request).catch(() => ({}));
  const localStartedAt = body.localStartedAt && !Number.isNaN(new Date(body.localStartedAt).getTime())
    ? new Date(body.localStartedAt).toISOString() : null;
  const now = new Date().toISOString();
  const statements = [
    db.prepare(`UPDATE tournaments SET status = 'running', desktop_execution = 1,
        local_started_at = COALESCE(local_started_at, ?), updated_at = ? WHERE id = ?`)
      .bind(localStartedAt, now, existing.id),
  ];
  if (localStartedAt) {
    // Online-Anmeldungen zwischen lokalem Start und dem hier gesetzten `running` werden markiert und nie
    // automatisch importiert (KP-05).
    statements.push(db.prepare(`UPDATE registrations SET received_after_start = 1
        WHERE tournament_id = ? AND origin = 'online' AND registered_at > ?`).bind(existing.id, localStartedAt));
  }
  return {
    statements,
    response: { envelope: { status: 200, body: {}, hydrate: { kind: 'tournament' } } },
    async afterCommit() {
      if (existing.status !== 'running') {
        await notifyTournamentStarted(env, existing, await getTournamentById(db, existing.id));
      }
    },
  };
}

function actorRoleFor(tournament, user) {
  if (tournament.owner_id === user.id) return 'owner';
  return user.role === 'admin' ? 'admin' : 'editor';
}

/**
 * Setzt ein versehentlich gestartetes Turnier (z. B. Testlauf vor der Veröffentlichung) von `running` zurück, solange
 * online noch kein Rundenergebnis vorliegt (Spezifikation E-23). Die Online-Anmeldung bleibt dabei geschlossen, bis
 * sie ausdrücklich wieder geöffnet wird; PTM sieht das Zurücksetzen beim nächsten Abgleich (runningResetAt).
 */
export async function resetTournamentRunning(db, tournament, user) {
  const now = new Date().toISOString();
  const [reset] = await db.batch([
    db.prepare(`UPDATE tournaments SET status = 'registration', registration_closed = 1, running_reset_at = ?,
        local_started_at = NULL, desktop_execution = 0, updated_at = ?
        WHERE id = ? AND status = 'running'
          AND NOT EXISTS (SELECT 1 FROM tournament_matches WHERE tournament_id = ? AND (score_a IS NOT NULL OR score_b IS NOT NULL))`)
      .bind(now, now, tournament.id, tournament.id),
    db.prepare(`INSERT INTO audit_log (id, tournament_id, actor_user_id, actor_role, action, target, created_at)
        SELECT ?, ?, ?, ?, 'running_reset', 'tournament', ? WHERE EXISTS (SELECT 1 FROM tournaments WHERE id = ? AND running_reset_at = ?)`)
      .bind(crypto.randomUUID(), tournament.id, user.id, actorRoleFor(tournament, user), now, tournament.id, now),
  ]);
  if (!reset.meta.changes) {
    if (tournament.status !== 'running') {
      throw new HttpError(409, 'Das Turnier läuft nicht.');
    }
    throw new HttpError(409, 'Es liegen bereits Rundenergebnisse vor; der Turnierstart kann nicht mehr zurückgesetzt werden.', {
      code: 'results_exist',
    });
  }
  return json({ tournament: toPublicTournament(await getTournamentById(db, tournament.id), user) });
}

export async function setRegistrationClosed(request, db, tournament, user) {
  const body = await readJson(request);
  if (typeof body.closed !== 'boolean') throw new HttpError(400, 'closed muss true oder false sein');
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE tournaments SET registration_closed = ?, updated_at = ? WHERE id = ?').bind(body.closed ? 1 : 0, now, tournament.id),
    auditStatement(db, { tournamentId: tournament.id, actorUserId: user.id, actorRole: actorRoleFor(tournament, user),
      action: body.closed ? 'registration_closed' : 'registration_opened', target: 'tournament', now }),
  ]);
  return json({ tournament: toPublicTournament(await getTournamentById(db, tournament.id), user) });
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
  const logoUrl = normalizePresentationUrl(body.logoUrl, 'logoUrl');
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
        registration_type, status, visibility, registration_enabled, club, website_url, logo_url, flyer_url, contact_name, contact_email,
        latitude, longitude, geocoded_at, timezone, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      logoUrl,
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
async function syncPutTournamentMetadata(request, env, existing) {
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

  const statement = db.prepare(
    `UPDATE tournaments
     SET name = ?, date = ?, start_time = ?, location = ?, description = ?, type = ?, formation = ?, registration_type = ?,
         status = CASE WHEN status = 'running' AND ? NOT IN ('running', 'finished') THEN status ELSE ? END, max_registrations = ?, registration_deadline = ?, registration_opens_at = ?, entry_fee_cents = ?, currency = ?, contact_name = ?,
         contact_email = ?, contact_phone = ?, visibility = ?, internal_notes = ?, participants_public = ?,
         license_required = ?, latitude = ?, longitude = ?, geocoded_at = ?, timezone = ?, document_managed = 1, updated_at = ?
     WHERE id = ?`,
  ).bind(
    tournament.name, tournament.date, tournament.startTime, tournament.location, tournament.description,
    tournament.type, tournament.formation, tournament.registrationType, tournament.status, tournament.status, tournament.maxRegistrations,
    registrationTimes.registrationDeadline, registrationTimes.registrationOpensAt, tournament.entryFeeCents, tournament.currency, tournament.contactName, tournament.contactEmail,
    tournament.contactPhone, tournament.visibility, tournament.internalNotes, tournament.participantsPublic ? 1 : 0,
    tournament.licenseRequired ? 1 : 0, geo.latitude, geo.longitude, geo.geocodedAt, timezone, now, existing.id,
  );

  // Ein laufendes Turnier kehrt über die Eckdaten nie in die Anmeldephase zurück; dafür gibt es das ausdrückliche
  // Zurücksetzen (E-23).
  return {
    statements: [statement],
    response: { envelope: { status: 200, body: {}, hydrate: { kind: 'tournament' } } },
    async afterCommit() {
      const updated = await getTournamentById(db, existing.id);
      if (isNewlyPublicTournament(existing, updated)) {
        await notifySavedSearchesForPublishedTournament(env, updated);
      }
    },
  };
}

/**
 * Ein mit einem Turnierdokument verbundenes Turnier (document_managed) wird nur mit ausdrücklicher Bestätigung
 * gelöscht: Das Löschen entfernt Live-Ansicht und Ergebnisse der Spieler und nimmt dem Turnierdokument die
 * Verbindung. Schützt auch Aufrufe an der Web-Oberfläche vorbei (API, ältere App-Stände).
 */
export function assertTournamentDeletable(tournament, confirmDocumentManaged) {
  if (Number(tournament.document_managed || 0) === 1 && !confirmDocumentManaged) {
    throw new HttpError(409, 'Dieses Turnier wird von einem Turnierdokument geführt. Das Löschen muss ausdrücklich bestätigt werden.', { code: 'document_managed' });
  }
}

/**
 * Löscht ein Turnier und hinterlässt einen Löschnachweis (KP-07): PTM erhält danach tournament_deleted, verknüpfte
 * Konten sehen in der Live-Ansicht einen Löschhinweis. Der Nachweis enthält nur IDs, keine Kontaktdaten.
 */
export async function deleteTournament(env, tournament, user = null) {
  const db = env.DB;
  const now = new Date().toISOString();
  const [, , tournamentResult] = await db.batch([
    tombstoneStatement(db, 't.id = ?', [tournament.id], user?.id || null, now),
    db.prepare('DELETE FROM registrations WHERE tournament_id = ?').bind(tournament.id),
    db.prepare('DELETE FROM tournaments WHERE id = ?').bind(tournament.id),
    auditStatement(db, { tournamentId: tournament.id, actorUserId: user?.id || null,
      actorRole: user ? actorRoleFor(tournament, user) : 'system', action: 'tournament_deleted', target: 'tournament',
      details: { status: tournament.status, documentBound: Boolean(tournament.sync_document_id) }, now }),
  ]);
  if (tournamentResult.meta.changes === 0) {
    throw new HttpError(404, 'Turnier nicht gefunden');
  }
  await notifyOwnerAboutAction(env, tournament, user, 'tournament_deleted');
  return json({ ok: true });
}

/**
 * Löschnachweis (KP-07) für alle Turniere, die {@code where} (auf Alias {@code t}) trifft – vor dem Löschen im selben
 * Batch ausführen.
 */
function tombstoneStatement(db, where, binds, deletedByUserId, now) {
  return db.prepare(`INSERT OR REPLACE INTO tournament_tombstones (tournament_id, name, deleted_at, deleted_by_user_id, registrations_json)
      SELECT t.id, t.name, ?, ?, COALESCE((SELECT json_group_array(json_object('id', r.id,
          'userIds', json_array(r.user_id, r.partner_user_id, r.partner2_user_id)))
        FROM registrations r WHERE r.tournament_id = t.id AND r.status != 'cancelled'), '[]')
      FROM tournaments t WHERE ${where}`).bind(now, deletedByUserId, ...binds);
}

/**
 * Turniere eines Kontos, das gelöscht wird, mit Löschnachweis und Protokolleintrag je Turnier löschen – wie
 * {@link deleteTournament}: ein verbundenes PTM-Dokument erhält danach tournament_deleted statt 404, verknüpfte Konten
 * sehen in der Live-Ansicht den Löschhinweis.
 */
function ownedTournamentDeletionStatements(db, ownerId, { actorUserId, actorRole, reason, now }) {
  return [
    tombstoneStatement(db, 't.owner_id = ?', [ownerId], actorUserId, now),
    db.prepare(`INSERT INTO audit_log (id, tournament_id, actor_user_id, actor_role, action, target, details_json, created_at)
        SELECT lower(hex(randomblob(16))), t.id, ?, ?, 'tournament_deleted', 'tournament',
          json_object('status', t.status, 'documentBound', json(CASE WHEN t.sync_document_id IS NULL THEN 'false' ELSE 'true' END),
            'reason', ?), ?
        FROM tournaments t WHERE t.owner_id = ?`).bind(actorUserId, actorRole, reason, now, ownerId),
    db.prepare('DELETE FROM registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE owner_id = ?)').bind(ownerId),
    db.prepare('DELETE FROM tournaments WHERE owner_id = ?').bind(ownerId),
  ];
}

/**
 * T-22: Übernahme und Lösen der Bindung, Zurücksetzen von `running` und Löschen werden dem Turnierersteller per Postbox
 * mitgeteilt, wenn ein anderes Konto (Mitverwalter oder Admin) sie auslöst.
 */
async function notifyOwnerAboutAction(env, tournament, user, action) {
  if (!tournament.owner_id || !user || user.id === tournament.owner_id) return;
  try {
    await createSystemNotification(env, tournament.owner_id, TOURNAMENT_ADMIN_ACTION_EVENT, {
      tournamentId: tournament.id, tournamentName: tournament.name, action,
      actorName: [user.first_name ?? user.firstName, user.last_name ?? user.lastName].filter(Boolean).join(' ') || user.email || '',
    });
  } catch (error) {
    console.error(`Failed to notify owner about ${action} for tournament ${tournament.id}`, error);
  }
}

export async function listRegistrations(db, tournament) {
  const result = await db
    .prepare('SELECT * FROM registrations WHERE tournament_id = ? ORDER BY registered_at DESC')
    .bind(tournament.id)
    .all();
  const flagsFor = registrationFlagsById(result.results || []);
  return json({
    registrations: result.results.map((row) => ({ ...toManagedRegistration(row), ...registrationFlags(tournament, row, flagsFor) })),
  });
}

// Kennzeichen für Verwaltung und Abgleich: Doppelbelegung eines Kontos (Ausschlussgrund), mögliche Dublette (nur
// Hinweis) und unvollständiges Formée-Team (A-10, KP-06).
function registrationFlags(tournament, row, flagsFor) {
  const { accountConflictWith, possibleDuplicateWith } = flagsFor(row.id);
  return {
    accountConflict: accountConflictWith.length > 0,
    accountConflictWith,
    possibleDuplicate: possibleDuplicateWith.length > 0,
    possibleDuplicateWith,
    incomplete: isIncompleteTeam(tournament, row),
  };
}

/**
 * Konten zu den Slot-E-Mails einer Anmeldung (E-22): Verknüpft wird nur eine Adresse, die genau einem verifizierten
 * Konto gehört.
 */
export async function resolveRegistrationUserIds(db, registration, { registrationId = null } = {}) {
  const emails = [registration.playerEmail, registration.partnerEmail, registration.partner2Email]
    .map((email) => String(email || '').trim().toLowerCase());
  const result = await db.prepare(
    'SELECT id, email FROM users WHERE lower(email) IN (?, ?, ?) AND email_verified_at IS NOT NULL',
  ).bind(...emails).all();
  // Only link unambiguous matches: accounts differing just in e-mail case stay unlinked.
  const usersByEmail = new Map();
  for (const user of result.results || []) {
    const key = String(user.email).toLowerCase();
    usersByEmail.set(key, usersByEmail.has(key) ? null : user.id);
  }
  const [userId, partnerUserId, partner2UserId] = uniqueAccountLinks(emails.map((email) => {
    const id = email ? usersByEmail.get(email) : null;
    return id || null;
  }));
  return { userId, partnerUserId, partner2UserId };
}

/**
 * Verknüpft unverknüpfte Slots mit einem Konto, nachdem seine E-Mail verifiziert ist (KP-10). Liefert die neu
 * verknüpften Anmeldungen.
 */
export async function linkUnlinkedRegistrationsForUser(db, userId, email, notifyEnv = { DB: db }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!userId || !normalizedEmail) return [];
  const verified = await db.prepare('SELECT 1 FROM users WHERE id = ? AND lower(email) = ? AND email_verified_at IS NOT NULL')
    .bind(userId, normalizedEmail).first();
  if (!verified) return [];
  // Sequential batch: a slot is skipped when the account already sits in another slot.
  const results = await db.batch([
    db.prepare(`UPDATE registrations SET user_id = ? WHERE user_id IS NULL AND lower(player_email) = ?
      AND ? NOT IN (COALESCE(partner_user_id, ''), COALESCE(partner2_user_id, ''))
      RETURNING id, tournament_id`).bind(userId, normalizedEmail, userId),
    db.prepare(`UPDATE registrations SET partner_user_id = ? WHERE partner_user_id IS NULL AND lower(partner_email) = ?
      AND ? NOT IN (COALESCE(user_id, ''), COALESCE(partner2_user_id, ''))
      RETURNING id, tournament_id`).bind(userId, normalizedEmail, userId),
    db.prepare(`UPDATE registrations SET partner2_user_id = ? WHERE partner2_user_id IS NULL AND lower(partner2_email) = ?
      AND ? NOT IN (COALESCE(user_id, ''), COALESCE(partner_user_id, ''))
      RETURNING id, tournament_id`).bind(userId, normalizedEmail, userId),
  ]);
  const links = results.flatMap((result, index) => (result.results || []).map((row) => ({
    registrationId: row.id, tournamentId: row.tournament_id, slot: index + 1, userId,
  })));
  if (links.length > 0) {
    await db.batch(links.map((link) => auditStatement(db, { tournamentId: link.tournamentId, registrationId: link.registrationId,
      actorUserId: userId, actorRole: 'system', action: 'account_linked', target: `slot:${link.slot}`,
      details: { userId, reason: 'email_verified' } })));
    await notifySlotLinks(notifyEnv, links);
  }
  return links;
}

/**
 * Prüft nach neuen Slot-Verknüpfungen (E-22) auf Doppelbelegung (KP-06 b). Eine eigene Nachricht über die Verknüpfung
 * gibt es nicht mehr: Die Live-Ansicht hängt am persönlichen Link, nicht am Konto. Fehler lassen die Anmeldung nie
 * scheitern.
 */
async function notifySlotLinks(env, links) {
  const tournamentIds = new Set(links.map((link) => link.tournamentId));
  for (const tournamentId of tournamentIds) await notifyAccountConflicts(env, tournamentId);
}

/** Neu verknüpfte Slots einer Anmeldung gegenüber dem vorherigen Stand. */
function newSlotLinks(previous, next, registrationId, tournamentId) {
  const before = new Set(registrationUserIds(previous || {}));
  return SLOT_COLUMNS
    .map(({ slot, userId }) => ({ slot, userId: next[userId] }))
    .filter(({ userId }) => userId && !before.has(userId))
    .map(({ slot, userId }) => ({ registrationId, tournamentId, slot, userId }));
}

/**
 * Doppelbelegung (KP-06 b): Steht ein Konto in mehreren aktiven Anmeldungen desselben Turniers, erhält es genau eine
 * Postbox-Nachricht; die Anmeldungen bleiben angenommen und erscheinen in der Verwaltung und im Abgleich als Konflikt.
 */
async function notifyAccountConflicts(env, tournamentId) {
  try {
    const rows = await env.DB.prepare('SELECT * FROM registrations WHERE tournament_id = ?').bind(tournamentId).all();
    const { accountConflicts } = registrationConflicts(rows.results || []);
    if (accountConflicts.length === 0) return;
    const tournament = await env.DB.prepare('SELECT id, name FROM tournaments WHERE id = ?').bind(tournamentId).first();
    for (const { userId } of accountConflicts) {
      const claimed = await env.DB.prepare(`INSERT OR IGNORE INTO account_conflict_notifications (tournament_id, user_id, sent_at)
          VALUES (?, ?, ?)`).bind(tournamentId, userId, new Date().toISOString()).run();
      if (!claimed.meta?.changes) continue;
      await createSystemNotification(env, userId, REGISTRATION_ACCOUNT_CONFLICT_EVENT, {
        tournamentId, tournamentName: tournament?.name || '',
      });
    }
  } catch (error) {
    console.error(`Failed to check account conflicts for tournament ${tournamentId}`, error);
  }
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
      `SELECT id, email, first_name, last_name, club, team_name,
         partner_first_name, partner_last_name, partner_club,
         partner2_first_name, partner2_last_name, partner2_club, is_vip, status,
         over_capacity
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
      partnerClub: row.partner_club,
      partner2FirstName: row.partner2_first_name,
      partner2LastName: row.partner2_last_name,
      partner2Club: row.partner2_club,
      isVip: Boolean(row.is_vip),
      // Von der Turnierleitung über die Kapazität hinaus nachgemeldet (T-24); öffentlich als solche erkennbar.
      overCapacity: Boolean(Number(row.over_capacity || 0)),
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
    court: row.court || null,
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
  return json(await loadTournamentRounds(db, tournamentId));
}

async function loadTournamentRounds(db, tournamentId) {
  const roundsResult = await db.prepare('SELECT * FROM tournament_rounds WHERE tournament_id = ? ORDER BY round_number ASC').bind(tournamentId).all();
  const matchesResult = await db.prepare('SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY created_at ASC, match_index ASC').bind(tournamentId).all();
  const teamsResult = await db.prepare('SELECT id, member_registration_ids, seed_position FROM tournament_teams WHERE tournament_id = ? ORDER BY created_at, id').bind(tournamentId).all();
  const playersById = await getPlayersById(db, tournamentId);

  const matchesByRound = new Map();
  for (const row of matchesResult.results) {
    const list = matchesByRound.get(row.round_id) || [];
    list.push(toPublicMatch(row, playersById));
    matchesByRound.set(row.round_id, list);
  }

  return {
    teams: teamsResult.results.map((team) => ({ id: team.id, members: JSON.parse(team.member_registration_ids), seedPosition: Number(team.seed_position || 0) })),
    rounds: roundsResult.results.map((round) => ({
      id: round.id,
      roundNumber: round.round_number,
      matches: matchesByRound.get(round.id) || [],
    })),
  };
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
  return json({ ranking: await computeTournamentRanking(db, tournament) });
}

async function computeTournamentRanking(db, tournament) {
  if (Number(tournament.desktop_execution || 0) === 1) {
    return desktopRankingSnapshot(db, tournament);
  }
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
    return ranking.map((entry) => ({
      ...entry, teamId: entry.teamId,
      members: (teamsById.get(entry.teamId)?.members || []).map((id) => playersById.get(id) || { id, firstName: '?', lastName: '' }),
    }));
  }
  if (tournament.type === 'ko') {
    // Anders als Schweizer/Formule X/JGJ kennt das Hauptprojekt für K.O. keine
    // separate Endrangliste (kein "KoRanglisteSheet") - die Platzierung ergibt
    // sich direkt aus dem Turnierbaum selbst (Rundenbezeichnung, Sieger-/Platz3-
    // Anzeige, siehe lib/pairing/ko.js). Es gibt daher bewusst keine Rangliste.
    return [];
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
    return ranking.map((entry) => ({
      ...entry, teamId: entry.teamId,
      members: (teamsById.get(entry.teamId)?.members || []).map((id) => playersById.get(id) || { id, firstName: '?', lastName: '' }),
    }));
  }
  const ranking = competitionRanks(computeRanking(matches), sameStandardRankingPlace);
  const playersById = await getPlayersById(db, tournament.id);

  return ranking.map((entry) => ({
    ...entry,
    ...(playersById.get(entry.playerId) || {}),
  }));
}

async function desktopRankingSnapshot(db, tournament) {
  let entries = [];
  try {
    entries = JSON.parse(tournament.desktop_ranking_json || '[]');
  } catch {
    entries = [];
  }
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const playersById = await getPlayersById(db, tournament.id);
  return entries.map((entry) => ({
    ...entry,
    members: entry.registrationIds.map((id) => playersById.get(id) || { id, firstName: '?', lastName: '' }),
  }));
}

// Vereinheitlicht die systemabhängigen Ranglisten-Formen (Spieler-, Team- und Snapshot-Einträge)
// für die Live-Ansicht auf { rank, registrationIds, label, wins, pointsFor, pointsAgainst, pointsDiff }.
function toLiveRanking(ranking) {
  return ranking.map((entry) => {
    const members = entry.members || [entry];
    return {
      rank: entry.rank,
      registrationIds: entry.registrationIds || members.map((member) => member.id || member.playerId),
      label: members.map((member) => member.teamLabel || [member.firstName, member.lastName].filter(Boolean).join(' ') || '?').join(' + '),
      wins: entry.wins ?? null,
      pointsFor: entry.pointsFor ?? null,
      pointsAgainst: entry.pointsAgainst ?? null,
      pointsDiff: entry.pointsDiff ?? null,
    };
  });
}

function toLiveTournament(tournament) {
  return {
    id: tournament.id,
    name: tournament.name,
    date: tournament.date,
    startTime: tournament.start_time || null,
    location: tournament.location || null,
    status: tournament.status,
    type: tournament.type,
    desktopExecution: Number(tournament.desktop_execution || 0) === 1,
  };
}

// Alle Spieler eines Turniers sehen dieselben Runden/Ranglisten-Daten, nur anders gefiltert.
// Diese Turnier-Sicht wird daher einmal berechnet und kurz im Cloudflare-Cache (pro Rechenzentrum)
// gehalten; Schreibzugriffe auf das Turnier löschen den Eintrag sofort (invalidateLiveSnapshot).
const LIVE_SNAPSHOT_TTL_SECONDS = 15;

function liveSnapshotCacheKey(origin, tournamentId) {
  return new Request(`${origin}/__live-snapshot/${encodeURIComponent(tournamentId)}`);
}

function liveCache() {
  return typeof caches !== 'undefined' && caches.default ? caches.default : null;
}

async function invalidateLiveSnapshot(origin, tournamentId) {
  try {
    await liveCache()?.delete(liveSnapshotCacheKey(origin, tournamentId));
  } catch (error) {
    console.error(`Failed to invalidate live snapshot for tournament ${tournamentId}`, error);
  }
}

async function computeLiveSnapshot(db, tournament) {
  const [{ rounds }, ranking] = await Promise.all([
    loadTournamentRounds(db, tournament.id),
    computeTournamentRanking(db, tournament),
  ]);
  const content = { tournament: toLiveTournament(tournament), rounds, ranking: toLiveRanking(ranking) };
  const version = (await sha256Hex(JSON.stringify(content))).slice(0, 16);
  return { ...content, version };
}

async function getLiveSnapshot(db, tournament, origin) {
  const cache = liveCache();
  const key = liveSnapshotCacheKey(origin, tournament.id);
  if (cache) {
    const cached = await cache.match(key);
    if (cached) return cached.json();
  }
  const snapshot = await computeLiveSnapshot(db, tournament);
  if (cache) {
    await cache.put(key, new Response(JSON.stringify(snapshot), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${LIVE_SNAPSHOT_TTL_SECONDS}` },
    }));
  }
  return snapshot;
}

function liveRegistrationLabel(registration) {
  return registration.team_name || [
    [registration.first_name, registration.last_name],
    [registration.partner_first_name, registration.partner_last_name],
    [registration.partner2_first_name, registration.partner2_last_name],
  ].map((parts) => parts.filter(Boolean).join(' ')).filter(Boolean).join(' + ');
}

/**
 * Persönliche Live-Antwort. Das ETag setzt sich aus der Snapshot-Version und dem eigenen
 * Teilnahme-Status zusammen: Hat sich nichts geändert, antwortet der Server mit 304 ohne Inhalt.
 * Der Browser revalidiert dank "no-cache" jeden Abruf selbst (If-None-Match) und reicht bei 304
 * die zwischengespeicherte Antwort an die App durch.
 */
export async function buildLiveResponse(request, db, registration) {
  const tournament = await getTournamentById(db, registration.tournament_id);
  if (!tournament) throw new HttpError(404, 'Turnier nicht gefunden');
  const snapshot = await getLiveSnapshot(db, tournament, new URL(request.url).origin);
  const personal = {
    id: registration.id,
    label: liveRegistrationLabel(registration),
    participation: registration.participation,
    status: registration.status,
    // Alle Personen der Anmeldung sehen dieselbe Besetzung, nur Namen (KP-12, E-21).
    persons: registrationSlots(registration).map((slot) => [slot.firstName, slot.lastName].filter(Boolean).join(' ')),
    unit: registrationUnit(tournament).kind,
    registrationType: tournament.registration_type || 'forme',
    incomplete: isIncompleteTeam(tournament, registration),
    meleeTeammates: await liveMeleeTeammates(db, tournament.id, registration.id),
  };
  // Stand der Daten aus dem Turnierdokument, damit ein Netzausfall in PTM nicht als falsche Auslosung wirkt (KP-12).
  const dataAsOf = Number(tournament.document_managed || 0) === 1 ? tournament.last_sync_write_at || null : null;
  const personalVersion = (await sha256Hex(JSON.stringify([personal, dataAsOf, tournament.status]))).slice(0, 12);
  const etag = `"${snapshot.version}-${personalVersion}"`;
  const cacheHeaders = { 'Cache-Control': 'private, no-cache', ETag: etag };
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers: { ...SECURITY_HEADERS, ...cacheHeaders } });
  }
  return json({
    tournament: { ...snapshot.tournament, status: tournament.status },
    registration: personal,
    dataAsOf,
    live: buildPlayerLiveView({ registrationId: registration.id, rounds: snapshot.rounds, ranking: snapshot.ranking }),
  }, 200, cacheHeaders);
}

// Mitspieler aus der Mêlée-Teamzuordnung (KP-18): alle Personen desselben Teams sehen denselben Teaminhalt.
async function liveMeleeTeammates(db, tournamentId, registrationId) {
  const own = await db.prepare('SELECT team_uuid FROM melee_team_assignments WHERE tournament_id = ? AND registration_id = ?')
    .bind(tournamentId, registrationId).first();
  if (!own) return null;
  const result = await db.prepare(`SELECT r.first_name, r.last_name FROM melee_team_assignments a
      JOIN registrations r ON r.id = a.registration_id
      WHERE a.tournament_id = ? AND a.team_uuid = ? AND a.registration_id != ?
      ORDER BY a.position, r.last_name`).bind(tournamentId, own.team_uuid, registrationId).all();
  return (result.results || []).map((row) => [row.first_name, row.last_name].filter(Boolean).join(' '));
}

// Anmeldungen des eingeloggten Users in seinen Personen-Slots (E-21) - ab der Anmeldung bis kurz nach dem Turnier.
// Turniere, deren Beginn mehr als 48 Stunden zurückliegt, fallen heraus, auch falls der Cron (finishStaleTournaments)
// sie noch nicht abgeschlossen hat. Vom Veranstalter gelöschte Turniere erscheinen mit Löschhinweis (KP-07).
export async function listMyLiveRegistrations(db, user) {
  const since = dateDaysAgo(4);
  const result = await db.prepare(`SELECT r.id, r.tournament_id, r.first_name, r.last_name, r.partner_first_name, r.partner_last_name,
        r.partner2_first_name, r.partner2_last_name, r.team_name, r.participation, r.status AS registration_status,
        t.name, t.date, t.start_time, t.timezone, t.location, t.status
      FROM registrations r JOIN tournaments t ON t.id = r.tournament_id
      WHERE ? IN (r.user_id, r.partner_user_id, r.partner2_user_id)
        AND t.live_view_enabled = 1
        AND r.status IN ('pending', 'confirmed', 'waitlist')
        AND (t.status = 'registration' OR (t.status IN ('running', 'finished') AND t.date > ?))
      ORDER BY t.date DESC, t.start_time DESC`).bind(user.id, since).all();
  const deleted = await deletedLiveRegistrations(db, user.id, since);
  return json({
    registrations: [
      ...(result.results || []).filter((row) => !isTournamentStale(tournamentStartUtcIso(row))).map((row) => ({
        id: row.id,
        tournament: { id: row.tournament_id, name: row.name, date: row.date, startTime: row.start_time || null, location: row.location || null, status: row.status },
        label: row.team_name || [[row.first_name, row.last_name], [row.partner_first_name, row.partner_last_name], [row.partner2_first_name, row.partner2_last_name]]
          .map((parts) => parts.filter(Boolean).join(' ')).filter(Boolean).join(' + '),
        participation: row.participation,
        status: row.registration_status,
      })),
      ...deleted,
    ],
  });
}

async function deletedLiveRegistrations(db, userId, since, registrationId = null) {
  const result = await db.prepare(`SELECT t.tournament_id, t.name, t.deleted_at, json_extract(r.value, '$.id') AS registration_id
      FROM tournament_tombstones t, json_each(t.registrations_json) r
      WHERE t.deleted_at > ? AND (? IS NULL OR json_extract(r.value, '$.id') = ?)
        AND EXISTS (SELECT 1 FROM json_each(json_extract(r.value, '$.userIds')) u WHERE u.value = ?)`)
    .bind(since, registrationId, registrationId, userId).all();
  return (result.results || []).map((row) => ({
    id: row.registration_id,
    tournament: { id: row.tournament_id, name: row.name, deleted: true, deletedAt: row.deleted_at },
    deleted: true,
  }));
}

export async function findMyLiveRegistration(db, user, registrationId) {
  const registration = await db.prepare(`SELECT r.*, t.live_view_enabled FROM registrations r
      JOIN tournaments t ON t.id = r.tournament_id WHERE r.id = ?`).bind(registrationId).first();
  const ownsRegistration = registration && registrationBelongsToUser(registration, user.id);
  // Fremde Meldungen verhalten sich wie nicht vorhanden, damit IDs nicht ausprobiert werden können.
  if (!registration || registration.status === 'cancelled' || !ownsRegistration || !isLiveViewEnabled(registration)) {
    const [deleted] = registration ? [] : await deletedLiveRegistrations(db, user.id, dateDaysAgo(30), registrationId);
    if (deleted) {
      throw new HttpError(410, 'Turnier wurde vom Veranstalter gelöscht', { code: 'tournament_deleted', tournamentName: deleted.tournament.name });
    }
    throw new HttpError(404, 'Anmeldung nicht gefunden');
  }
  return registration;
}

export async function findLiveRegistrationByToken(db, token) {
  const trimmed = String(token || '').trim();
  const registration = trimmed.length >= 32
    ? await db.prepare(`SELECT r.*, t.live_view_enabled FROM registrations r
        JOIN tournaments t ON t.id = r.tournament_id WHERE r.live_token_hash = ?`).bind(await sha256Hex(trimmed)).first()
    : null;
  if (!registration || registration.status === 'cancelled' || !isLiveViewEnabled(registration)) {
    throw new HttpError(404, 'Dieser Live-Link ist ungültig oder abgelaufen');
  }
  return registration;
}

async function participantAccountUserIds(db, tournamentId, excludedUserId, { includeWaitlist = false } = {}) {
  const statuses = includeWaitlist ? BROADCAST_REGISTRATION_STATUSES_SQL : "('pending', 'confirmed')";
  return db.prepare(
    `SELECT id FROM (
       SELECT user_id AS id FROM registrations WHERE tournament_id = ? AND status IN ${statuses}
       UNION SELECT partner_user_id AS id FROM registrations WHERE tournament_id = ? AND status IN ${statuses}
       UNION SELECT partner2_user_id AS id FROM registrations WHERE tournament_id = ? AND status IN ${statuses}
     ) WHERE id IS NOT NULL AND id != ?`,
  ).bind(tournamentId, tournamentId, tournamentId, excludedUserId).all();
}

// Push-Abo aus der Live-Ansicht, an die Meldung gebunden (auch ohne Login über den persönlichen Link).
async function saveLivePushSubscription(request, db, registration) {
  const subscription = await readJson(request);
  const endpoint = String(subscription.endpoint || '');
  const p256dh = String(subscription.keys?.p256dh || '');
  const auth = String(subscription.keys?.auth || '');
  if (!isAllowedPushEndpoint(endpoint) || !p256dh || !auth) throw new HttpError(400, 'Ungültiges Push-Abonnement');
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO live_push_subscriptions (endpoint, registration_id, p256dh, auth, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint, registration_id) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, updated_at = excluded.updated_at`)
    .bind(endpoint, registration.id, p256dh, auth, now, now).run();
  return json({ ok: true }, 201);
}

async function removeLivePushSubscription(request, db, registration) {
  const body = await readJson(request);
  await db.prepare('DELETE FROM live_push_subscriptions WHERE endpoint = ? AND registration_id = ?').bind(String(body.endpoint || ''), registration.id).run();
  return json({ ok: true });
}

/**
 * Benachrichtigt alle Spieler mit Live-Push-Abo, die in der neuen Runde eingeteilt sind
 * ("Runde 3: Bahn 7 · gegen …"). Versand über die Queue in kleinen Paketen, ohne die
 * Mail-Drosselung, damit auch der letzte Spieler einer großen Runde zeitnah informiert wird.
 * Fehler dürfen die Rundenerstellung nie scheitern lassen.
 */
async function notifyLivePushForRound(env, tournament, roundNumber, appOrigin) {
  try {
    const option = await env.DB.prepare('SELECT live_view_enabled FROM tournaments WHERE id = ?').bind(tournament.id).first();
    if (!isLiveViewEnabled(option)) return;
    const subscriptions = await env.DB.prepare(`SELECT s.endpoint, s.p256dh, s.auth, s.registration_id, r.language
        FROM live_push_subscriptions s JOIN registrations r ON r.id = s.registration_id
        WHERE r.tournament_id = ? AND r.status = 'confirmed'`).bind(tournament.id).all();
    if (!subscriptions.results?.length) return;
    const { rounds } = await loadTournamentRounds(env.DB, tournament.id);
    const round = rounds.find((entry) => entry.roundNumber === roundNumber);
    if (!round) return;
    const items = [];
    for (const subscription of subscriptions.results) {
      const match = buildPlayerLiveView({ registrationId: subscription.registration_id, rounds: [round] }).currentMatch;
      if (!match) continue;
      items.push({
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        // Der Link selbst ist nur gehasht gespeichert: Die App findet den auf dem Gerät gemerkten Link über die Meldungs-ID.
        payload: buildLiveRoundPush({ tournamentName: tournament.name, match, language: subscription.language,
          url: `${appOrigin}/live/${encodeURIComponent(subscription.registration_id)}` }),
      });
    }
    const messages = chunk(items, LIVE_PUSH_CHUNK_SIZE).map((part) => ({ body: { kind: 'live_push', items: part } }));
    // sendBatch nimmt höchstens 100 Nachrichten pro Aufruf.
    for (const batch of chunk(messages, 100)) {
      await env.MAIL_QUEUE.sendBatch(batch);
    }
  } catch (error) {
    console.error(`Failed to queue live push for tournament ${tournament.id} round ${roundNumber}`, error);
  }
}

async function sendLivePushItems(env, items) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return;
  const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  await Promise.all((items || []).map(async (item) => {
    try {
      const pushPayload = await buildPushPayload(
        { data: item.payload },
        { endpoint: item.endpoint, expirationTime: null, keys: { p256dh: item.p256dh, auth: item.auth } },
        vapid,
      );
      const response = await fetch(item.endpoint, pushPayload);
      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare('DELETE FROM live_push_subscriptions WHERE endpoint = ?').bind(item.endpoint).run();
      } else if (!response.ok) {
        console.error('Live push failed', response.status, await response.text());
      }
    } catch (error) {
      console.error('Live push failed', error);
    }
  }));
}

async function tournamentRegistrationIds(db, tournamentId) {
  const result = await db.prepare('SELECT id FROM registrations WHERE tournament_id = ?').bind(tournamentId).all();
  return new Set((result.results || []).map((row) => row.id));
}

function assertDesktopExecution(tournament) {
  if (Number(tournament.desktop_execution || 0) !== 1) {
    throw new HttpError(409, 'Dieses Turnier wird online durchgeführt. Runden werden nicht aus dem Turnierdokument übernommen.');
  }
}

/**
 * Desktop-Durchführung: Das Turnierdokument überträgt eine komplette Spielrunde (Paarungen,
 * Ergebnisse, optional Bahn). Die Runde wird atomar ersetzt, damit Korrekturen im Dokument
 * (neu ausgeloste Runde, geänderte Ergebnisse) 1:1 übernommen werden.
 *
 * API-Vertrag für das Hauptprojekt (Bearer-API-Key + X-PTM-Sync-Document/X-PTM-Sync-Lease wie
 * bei den übrigen Sync-Schreibzugriffen; nur bei desktop_execution = 1, sonst 409):
 *   PUT    /api/sync/tournaments/:id/rounds/:roundNumber
 *          { matches: [{ teamA: [registrationId], teamB: [registrationId] (leer = Freilos),
 *                        scoreA, scoreB (0-13 oder null = läuft), court (optional, max. 40 Zeichen),
 *                        stageLabel (optional), matchIndex (optional, Default = Position) }] }
 *          -> { roundNumber, matchCount }
 *   DELETE /api/sync/tournaments/:id/rounds/:roundNumber  -> { ok, deleted }
 *   PUT    /api/sync/tournaments/:id/ranking
 *          { entries: [{ place, registrationIds: [..], wins?, pointsFor?, pointsAgainst? }] }
 *          -> { entryCount }
 * registrationId ist jeweils die Online-ID der Meldung (siehe PtmOnlineRegistrationMapping).
 */
async function syncPutRound(request, db, tournament, roundNumberValue) {
  assertDesktopExecution(tournament);
  const roundNumber = parseSyncRoundNumber(roundNumberValue);
  const body = await readJson(request);
  const matches = parseSyncRoundMatches(body, await tournamentRegistrationIds(db, tournament.id));
  const existing = await db.prepare('SELECT id FROM tournament_rounds WHERE tournament_id = ? AND round_number = ?').bind(tournament.id, roundNumber).first();
  const roundId = existing?.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const statements = [];
  if (existing) {
    statements.push(db.prepare('DELETE FROM tournament_matches WHERE round_id = ?').bind(roundId));
  } else {
    statements.push(db.prepare('INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES (?, ?, ?, ?)').bind(roundId, tournament.id, roundNumber, now));
  }
  for (const match of matches) {
    statements.push(db.prepare(`INSERT INTO tournament_matches (id, tournament_id, round_id, team_a_registration_ids, team_b_registration_ids,
        score_a, score_b, match_index, stage_label, court, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), tournament.id, roundId, JSON.stringify(match.teamA), JSON.stringify(match.teamB),
        match.scoreA, match.scoreB, match.matchIndex, match.stageLabel, match.court, now, now));
  }
  return {
    statements,
    response: { envelope: { status: 200, body: { roundNumber, matchCount: matches.length, created: !existing } } },
    mapError(error) {
      if (isTournamentRoundNumberConflict(error)) {
        throw new HttpError(409, 'Eine neue Runde wurde bereits zeitgleich erstellt. Bitte aktualisieren.');
      }
    },
  };
}

async function syncDeleteRound(db, tournament, roundNumberValue) {
  assertDesktopExecution(tournament);
  const roundNumber = parseSyncRoundNumber(roundNumberValue);
  const round = await db.prepare('SELECT id FROM tournament_rounds WHERE tournament_id = ? AND round_number = ?').bind(tournament.id, roundNumber).first();
  return {
    statements: round ? [
      db.prepare('DELETE FROM tournament_matches WHERE round_id = ?').bind(round.id),
      db.prepare('DELETE FROM tournament_rounds WHERE id = ?').bind(round.id),
    ] : [],
    response: { envelope: { status: 200, body: { ok: true, deleted: Boolean(round) } } },
  };
}

async function syncPutRanking(request, db, tournament) {
  assertDesktopExecution(tournament);
  const body = await readJson(request);
  const entries = parseSyncRanking(body, await tournamentRegistrationIds(db, tournament.id));
  // updated_at bleibt unberührt: Der Snapshot ist Ausführungsdatum, keine Turnier-Stammdatenänderung.
  return {
    statements: [db.prepare('UPDATE tournaments SET desktop_ranking_json = ? WHERE id = ?').bind(JSON.stringify(entries), tournament.id)],
    response: { envelope: { status: 200, body: { entryCount: entries.length } } },
  };
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

const REGISTRATION_CLOSED_MESSAGES = {
  closed: 'Die Anmeldung ist geschlossen',
  running: 'Anmeldung geschlossen – Turnier läuft',
  started: 'Die Anmeldung ist mit Turnierbeginn geschlossen',
  deadline_passed: 'Die Meldefrist ist abgelaufen',
  not_yet_open: 'Die Anmeldung ist noch nicht geöffnet',
};

export async function createRegistration(request, env, tournament, {
  session = null, shareAccess = false, shareTokenHash = null, syncBootstrap = false,
} = {}) {
  const db = env.DB;

  const body = await readJson(request);
  // Do not create registrations or trigger notifications when automated submissions
  // populate the hidden website field.
  if (nullableText(body.website)) {
    return json({ ok: true }, 201);
  }
  const isManager = canManageTournament(tournament, session?.user || null);
  // Nach dem Desktop-Start ist das Turnierdokument alleiniger Master: Web-Pflege ist gesperrt, vor Ort
  // erfasste Nachmeldungen legt das Dokument über seinen eigenen Zugangsweg an (T-24).
  if (isManager && !syncBootstrap && Number(tournament.desktop_execution || 0) === 1) {
    throw new HttpError(409, 'Die Meldeliste wird nach Turnierstart ausschließlich im Turnierdokument geführt.');
  }
  // Ab `running` legt das Dokument keine neuen Online-Anmeldungen mehr an (A-05, E-13).
  if (syncBootstrap && ['running', 'finished'].includes(tournament.status)) {
    throw new HttpError(409, 'Anmeldung geschlossen – Turnier läuft', { code: 'tournament_running' });
  }
  // Der reguläre Anmeldezeitraum gilt nur für öffentliche Selbstanmeldungen.
  // Bis zum Desktop-Start dürfen Turnierleiter die Meldeliste noch pflegen;
  // danach ist das verbundene Turnierdokument der alleinige Master.
  if (!isManager) {
    assertRegistrationOpen(tournament, shareAccess);
  }
  if (!isManager && body.publicationNoticeAccepted !== true) {
    throw new HttpError(400, 'Der Hinweis zur möglichen Veröffentlichung der Anmeldedaten muss bestätigt werden');
  }
  // DS-01: Wer anmeldet, bestätigt das Einverständnis der eingetragenen Personen mit der Weitergabe an den Veranstalter.
  if (!isManager && body.personsConsentAccepted !== true) {
    throw new HttpError(400, 'Das Einverständnis der eingetragenen Personen muss bestätigt werden');
  }
  if (isManager && body.noEmail === true) {
    body.email = createPlaceholderEmail();
  }

  const registration = normalizeRegistrationInput(body, { requireStatus: false, allowPlaceholder: isManager });
  // VIP vergibt nur die Turnierleitung; sonst könnte eine Selbstanmeldung andere Teams verdrängen.
  if (!isManager) registration.isVip = false;
  const organizerMessage = isManager ? null : registration.organizerMessage;
  const language = normalizeLanguage(body.language);
  assertCorePartnerCountMatchesFormation(tournament, registration);
  const feeSelections = resolveFeeSelections(tournament, body.feeSelections, registration);
  const registrationAnswers = resolveRegistrationAnswers(tournament, body.registrationAnswers, registration);
  assertLicenseMatchesTournament(tournament, registration);
  await assertNoDuplicateTeamName(db, tournament.id, registration.teamName);
  const accountLinks = await resolveRegistrationUserIds(db, registration);

  // Kapazität, VIP-Verdrängung, Warteliste und Anlage laufen in einem Batch; die Bedingungen stehen im SQL, damit
  // parallele Anmeldungen und ein gleichzeitiger Turnierstart nicht durchrutschen (T-12). pending und confirmed
  // belegen Kapazität, waitlist und cancelled nicht.
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const baseStatus = (isManager && body.confirmImmediately === true) || !Number(tournament.approval_required || 0)
    ? 'confirmed' : 'pending';
  const maxRegistrations = Number(tournament.max_registrations || 0);
  const waitlistEnabled = Number(tournament.waitlist_enabled ?? 1) === 1;
  const openCondition = registrationOpenSql({ isManager, syncBootstrap, shareTokenHash });
  const statements = [];
  if (registration.isVip && maxRegistrations > 0) {
    statements.push(db.prepare(`UPDATE registrations SET status = ?, updated_at = ?
        WHERE id = (SELECT id FROM registrations WHERE tournament_id = ? AND status IN ('pending', 'confirmed')
                    AND is_vip = 0 ORDER BY registered_at DESC LIMIT 1)
          AND (SELECT COUNT(*) FROM registrations WHERE tournament_id = ? AND status IN ('pending', 'confirmed')) >= ?
          AND EXISTS (SELECT 1 FROM tournaments t WHERE t.id = ? AND ${openCondition.sql})
        RETURNING id`)
      .bind(waitlistEnabled ? 'waitlist' : 'cancelled', now, tournament.id, tournament.id, maxRegistrations, tournament.id,
        ...openCondition.binds));
  }
  const record = registrationRecord(id, tournament.id, registration, {
    organizerMessage, feeSelections, registrationAnswers, language, now, accountLinks,
    cancelToken: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''),
  });
  const statusSql = `CASE WHEN ? = 0 OR capacity.used < ? THEN ? ELSE 'waitlist' END`;
  const statusBinds = [maxRegistrations, maxRegistrations, baseStatus];
  const columns = Object.keys(record);
  statements.push(db.prepare(`INSERT INTO registrations (${columns.join(', ')}, status, participation, confirmed_at)
      SELECT ${columns.map(() => '?').join(', ')}, ${statusSql},
        CASE WHEN (${statusSql}) = 'confirmed' THEN ? ELSE ? END,
        CASE WHEN (${statusSql}) = 'confirmed' THEN ? ELSE NULL END
      FROM (SELECT COUNT(*) AS used FROM registrations WHERE tournament_id = ? AND status IN ('pending', 'confirmed')) capacity
      WHERE EXISTS (SELECT 1 FROM tournaments t WHERE t.id = ? AND ${openCondition.sql})
        AND (? = 0 OR capacity.used < ? OR ? = 1)`)
    .bind(...Object.values(record), ...statusBinds,
      ...statusBinds, initialParticipation(tournament, 'confirmed', body.participation, syncBootstrap),
      initialParticipation(tournament, baseStatus === 'confirmed' ? 'waitlist' : baseStatus, body.participation, syncBootstrap),
      ...statusBinds, now,
      tournament.id, tournament.id, ...openCondition.binds, maxRegistrations, maxRegistrations, waitlistEnabled ? 1 : 0));
  const results = await db.batch(statements);

  const created = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(id).first();
  if (!created) {
    await throwRegistrationRejection(db, tournament, { isManager, shareAccess, syncBootstrap });
  }
  // Benachrichtigungen und E-Mails erst nach dem erfolgreichen Commit.
  const displacedId = statements.length > 1 ? results[0]?.results?.[0]?.id : null;
  const appOrigin = new URL(request.url).origin;
  const links = newSlotLinks(null, created, created.id, tournament.id);
  if (links.length > 0) {
    await db.batch(links.map((link) => auditStatement(db, { tournamentId: tournament.id, registrationId: created.id,
      actorUserId: session?.user?.id || null, actorRole: isManager ? actorRoleFor(tournament, session.user) : 'registrant',
      action: 'account_linked', target: `slot:${link.slot}`, details: { userId: link.userId, reason: 'slot_email' } })));
  }
  // Das absendende Konto erfährt nie, ob eine Slot-E-Mail verknüpft wurde (E-22); es selbst erhält keine Nachricht.
  await notifySlotLinks(env, links);
  if (!syncBootstrap) {
    await createSystemNotification(env, tournament.owner_id, 'registration_status_changed', {
      tournamentName: tournament.name,
      status: created.status,
      participant: `${created.first_name} ${created.last_name}`,
      ...(organizerMessage ? { message: organizerMessage } : {}),
    });
    await notifyUserByEmail(env, created.email, 'registration_status_changed', { tournamentName: tournament.name, status: created.status }, undefined, tournament.owner_id);
    if (displacedId) {
      const displaced = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(displacedId).first();
      try {
        await sendDisplacementEmail(env, tournament, displaced, !waitlistEnabled, appOrigin);
      } catch (error) {
        console.error(`Failed to send displacement email for registration ${displacedId}`, error);
      }
    }
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

function assertRegistrationOpen(tournament, shareAccess) {
  const openStatus = coreRegistrationOpenStatus({ ...tournament, visibility: shareAccess ? 'public' : tournament.visibility },
    new Date(), tournamentStartUtcIso(tournament));
  if (openStatus !== 'open') {
    throw new HttpError(403, REGISTRATION_CLOSED_MESSAGES[openStatus],
      openStatus === 'running' ? { code: 'tournament_running' } : undefined);
  }
}

// SQL-Bedingung auf dem Turnier (Alias t), unter der eine Anmeldung angelegt werden darf. Zeitprüfungen (Öffnung,
// Meldefrist, Turnierbeginn) liegen davor in JS; hier stehen nur die Zustände, die sich parallel ändern können.
function registrationOpenSql({ isManager, syncBootstrap, shareTokenHash }) {
  if (syncBootstrap) {
    return { sql: "t.status NOT IN ('running', 'finished')", binds: [] };
  }
  if (isManager) {
    return { sql: 'COALESCE(t.desktop_execution, 0) = 0', binds: [] };
  }
  return {
    sql: `t.status = 'registration' AND COALESCE(t.registration_closed, 0) = 0
      AND (t.visibility = 'public' OR EXISTS (SELECT 1 FROM tournament_share_links l
                                               WHERE l.tournament_id = t.id AND l.token_hash = ?))`,
    binds: [shareTokenHash || ''],
  };
}

// Spalten einer neuen Anmeldung ohne die kapazitätsabhängigen Felder status, participation und confirmed_at.
function registrationRecord(id, tournamentId, registration, {
  organizerMessage, feeSelections, registrationAnswers, language, now, accountLinks, cancelToken,
}) {
  return {
    id,
    tournament_id: tournamentId,
    first_name: registration.firstName,
    last_name: registration.lastName,
    email: registration.email,
    player_email: registration.playerEmail,
    club: registration.club,
    license_nr: registration.licenseNr,
    partner_first_name: registration.partnerFirstName,
    partner_last_name: registration.partnerLastName,
    partner_email: registration.partnerEmail,
    partner_club: registration.partnerClub,
    partner_license_nr: registration.partnerLicenseNr,
    partner2_first_name: registration.partner2FirstName,
    partner2_last_name: registration.partner2LastName,
    partner2_email: registration.partner2Email,
    partner2_club: registration.partner2Club,
    partner2_license_nr: registration.partner2LicenseNr,
    team_name: registration.teamName,
    seeding_position: registration.seedingPosition,
    is_vip: registration.isVip ? 1 : 0,
    organizer_message: organizerMessage,
    fee_selections: JSON.stringify(feeSelections),
    registration_answers: JSON.stringify(registrationAnswers),
    language,
    registered_at: now,
    created_at: now,
    updated_at: now,
    cancel_token: cancelToken,
    user_id: accountLinks.userId,
    partner_user_id: accountLinks.partnerUserId,
    partner2_user_id: accountLinks.partner2UserId,
  };
}

// Die Anlage fand nicht statt: Grund aus dem aktuellen Zustand bestimmen.
async function throwRegistrationRejection(db, tournament, { isManager, shareAccess, syncBootstrap }) {
  const current = await getTournamentById(db, tournament.id);
  if (syncBootstrap) {
    throw new HttpError(409, 'Anmeldung geschlossen – Turnier läuft', { code: 'tournament_running' });
  }
  if (isManager) {
    throw new HttpError(409, 'Die Meldeliste wird nach Turnierstart ausschließlich im Turnierdokument geführt.');
  }
  const stillShared = shareAccess && current.visibility === 'private'
    && Boolean(await db.prepare('SELECT 1 FROM tournament_share_links WHERE tournament_id = ?').bind(current.id).first());
  assertRegistrationOpen(current, stillShared);
  throw new HttpError(403, 'Das Turnier ist ausgebucht. Eine Warteliste ist für dieses Turnier nicht aktiviert.');
}

export async function updateRegistration(request, env, existing, actingUser = null) {
  const db = env.DB;
  const body = await readJson(request);
  if (body.noEmail === true) {
    body.email = isPlaceholderEmail(existing.email) ? existing.email : createPlaceholderEmail();
  }
  const registration = normalizeRegistrationInput(body, { requireStatus: true, allowPlaceholder: true });
  assertCorePartnerCountMatchesFormation(existing, registration);
  const feeSelections = resolveFeeSelections(existing, body.feeSelections, registration, existing);
  const registrationAnswers = resolveRegistrationAnswers(existing, body.registrationAnswers, registration, existing);
  assertLicenseMatchesTournament(existing, registration);
  await assertNoDuplicateTeamName(db, existing.tournament_id, registration.teamName, existing.id);
  const now = new Date().toISOString();
  const confirmedAt = registration.status === 'confirmed' ? existing.confirmed_at || now : null;
  assertCompositionEditable(existing, registration);
  const accountLinks = await resolveRegistrationUserIds(db, registration, { registrationId: existing.id });
  // Gleiche Person: Verknüpfung bleibt, auch bei korrigierter E-Mail (KP-11). Andere Person: neu über die Slot-E-Mail
  // (KP-20). Unverknüpfter Slot: über die Slot-E-Mail.
  const nextSlots = [
    { firstName: registration.firstName, lastName: registration.lastName, resolved: accountLinks.userId },
    { firstName: registration.partnerFirstName, lastName: registration.partnerLastName, resolved: accountLinks.partnerUserId },
    { firstName: registration.partner2FirstName, lastName: registration.partner2LastName, resolved: accountLinks.partner2UserId },
  ];
  const [userId, partnerUserId, partner2UserId] = uniqueAccountLinks(SLOT_COLUMNS.map((column, index) => nextSlotUserId({
    existing: { firstName: existing[column.first], lastName: existing[column.last], userId: existing[column.userId] },
    next: nextSlots[index],
    resolvedUserId: nextSlots[index].resolved,
  })));
  await db
    .prepare(
      `UPDATE registrations
       SET first_name = ?, last_name = ?, email = ?, player_email = ?, club = ?, license_nr = ?,
           partner_first_name = ?, partner_last_name = ?, partner_email = ?, partner_club = ?, partner_license_nr = ?,
           partner2_first_name = ?, partner2_last_name = ?, partner2_email = ?, partner2_club = ?, partner2_license_nr = ?,
           team_name = ?, seeding_position = ?, status = ?, is_vip = ?, fee_selections = ?, registration_answers = ?, confirmed_at = ?, updated_at = ?,
           user_id = ?, partner_user_id = ?, partner2_user_id = ?
       WHERE id = ?`,
    )
    .bind(
      registration.firstName,
      registration.lastName,
      registration.email,
      registration.playerEmail,
      registration.club,
      registration.licenseNr,
      registration.partnerFirstName,
      registration.partnerLastName,
      registration.partnerEmail,
      registration.partnerClub,
      registration.partnerLicenseNr,
      registration.partner2FirstName,
      registration.partner2LastName,
      registration.partner2Email,
      registration.partner2Club,
      registration.partner2LicenseNr,
      registration.teamName,
      registration.seedingPosition,
      registration.status,
      registration.isVip ? 1 : 0,
      JSON.stringify(feeSelections),
      JSON.stringify(registrationAnswers),
      confirmedAt,
      now,
      userId,
      partnerUserId,
      partner2UserId,
      existing.id,
    )
    .run();

  if (registration.isVip && Number(existing.max_registrations)) {
    await enforceVipPriorityOnUpdate(env, existing, new URL(request.url).origin);
  }

  const updated = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(existing.id).first();
  await auditRegistrationEdit(env, existing, updated, actingUser);
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

/**
 * Manuelle Online-Änderungen der Besetzung (T-18): Ist ein PTM-Dokument verbunden, gehört die Besetzung ab
 * Anmeldeschluss bzw. `running` dem Dokument (Check-in-Änderungen nur in PTM). Ohne Dokument bleibt die Weboberfläche
 * die einzige Stelle zur Pflege und ist daher nicht gesperrt.
 */
function assertCompositionEditable(existing, registration) {
  if (!existing.sync_document_id) return;
  const changed = SLOT_COLUMNS.some((column) => normalizePlayerName(existing[column.first], existing[column.last])
    !== normalizePlayerName(...slotNameFromInput(registration, column.slot)));
  if (!changed) return;
  const deadlinePassed = existing.registration_deadline && new Date(existing.registration_deadline).getTime() <= Date.now();
  if (['running', 'finished'].includes(existing.tournament_status) || deadlinePassed) {
    throw new HttpError(409, 'Die Teambesetzung wird nach Anmeldeschluss im verbundenen Turnierdokument geändert.', {
      code: 'composition_locked',
    });
  }
}

function slotNameFromInput(registration, slot) {
  if (slot === 1) return [registration.firstName, registration.lastName];
  if (slot === 2) return [registration.partnerFirstName, registration.partnerLastName];
  return [registration.partner2FirstName, registration.partner2LastName];
}

/**
 * Protokoll einer Änderung durch die Turnierleitung (T-14): Kontakt- und Slot-E-Mails, Besetzung, Kontoverknüpfungen
 * und Status. Neu verknüpfte Konten erhalten die Nachricht nach E-22.
 */
async function auditRegistrationEdit(env, existing, updated, actingUser) {
  const db = env.DB;
  const actor = { tournamentId: existing.tournament_id, registrationId: existing.id, actorUserId: actingUser?.id || null,
    actorRole: actingUser ? actorRoleFor(existing, actingUser) : 'organizer' };
  const statements = [];
  if (!sameText(existing.email, updated.email)) {
    statements.push(auditStatement(db, { ...actor, action: 'contact_email_changed', target: 'registration',
      details: { from: existing.email, to: updated.email } }));
  }
  for (const column of SLOT_COLUMNS) {
    const target = `slot:${column.slot}`;
    if (!sameText(existing[column.email], updated[column.email])) {
      statements.push(auditStatement(db, { ...actor, action: 'slot_email_changed', target,
        details: { from: existing[column.email] || null, to: updated[column.email] || null } }));
    }
    const before = [existing[column.first], existing[column.last]].filter(Boolean).join(' ');
    const after = [updated[column.first], updated[column.last]].filter(Boolean).join(' ');
    if (before !== after) {
      statements.push(auditStatement(db, { ...actor, action: 'composition_changed', target, details: { from: before, to: after } }));
    }
    if ((existing[column.userId] || null) !== (updated[column.userId] || null)) {
      statements.push(auditStatement(db, { ...actor, action: updated[column.userId] ? 'account_linked' : 'account_unlinked',
        target, details: { from: existing[column.userId] || null, to: updated[column.userId] || null } }));
    }
  }
  if (existing.status !== updated.status) {
    statements.push(auditStatement(db, { ...actor, action: 'status_changed', target: 'registration',
      details: { from: existing.status, to: updated.status } }));
  }
  if (statements.length > 0) await db.batch(statements);
  await notifySlotLinks(env, newSlotLinks(existing, updated, existing.id, existing.tournament_id));
}

function sameText(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/**
 * "Konto neu zuordnen" (KP-11, P-36): Nur diese ausdrückliche, protokollierte Aktion wechselt das Konto eines bereits
 * verknüpften Slots. Ziel ist das eine verifizierte Konto zur aktuellen Slot-E-Mail; ohne eindeutigen Treffer wird
 * der Slot gelöst.
 */
export async function relinkRegistrationSlot(env, registration, slot, user) {
  const db = env.DB;
  const column = SLOT_COLUMNS.find((entry) => entry.slot === slot);
  if (!text(registration[column.first]) && !text(registration[column.last])) {
    throw new HttpError(400, 'Dieser Personen-Platz ist nicht belegt');
  }
  const email = text(registration[column.email]).toLowerCase();
  const matches = email
    ? (await db.prepare('SELECT id FROM users WHERE lower(email) = ? AND email_verified_at IS NOT NULL').bind(email).all()).results || []
    : [];
  const targetUserId = matches.length === 1 ? matches[0].id : null;
  const otherSlots = SLOT_COLUMNS.filter((entry) => entry.slot !== slot).map((entry) => registration[entry.userId]);
  if (targetUserId && otherSlots.includes(targetUserId)) {
    throw new HttpError(409, 'Dieses Konto ist bereits mit einer anderen Person dieser Anmeldung verknüpft');
  }
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE registrations SET ${column.userId} = ?, updated_at = ? WHERE id = ?`).bind(targetUserId, now, registration.id),
    auditStatement(db, { tournamentId: registration.tournament_id, registrationId: registration.id, actorUserId: user.id,
      actorRole: actorRoleFor(registration, user), action: 'account_relinked', target: `slot:${slot}`,
      details: { from: registration[column.userId] || null, to: targetUserId }, now }),
  ]);
  if (targetUserId && targetUserId !== registration[column.userId]) {
    await notifySlotLinks(env, [{ registrationId: registration.id, tournamentId: registration.tournament_id, slot, userId: targetUserId }]);
  }
  const updated = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(registration.id).first();
  return json({ registration: toManagedRegistration(updated), linked: Boolean(targetUserId) });
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

export async function syncGetRegistrations(db, tournament, url) {
  const tournamentId = tournament.id;
  const since = url.searchParams.get('since');
  const sinceIso = since && !Number.isNaN(new Date(since).getTime()) ? new Date(since).toISOString() : new Date(0).toISOString();

  // Konflikte und Dubletten betreffen auch unveränderte Anmeldungen; sie werden daher immer über alle Anmeldungen
  // berechnet und als Gesamtliste mitgeliefert (A-29), die Anmeldungen selbst nur ab dem Cursor.
  const all = (await db.prepare('SELECT * FROM registrations WHERE tournament_id = ? ORDER BY updated_at ASC')
    .bind(tournamentId).all()).results || [];
  const changed = all.filter((row) => row.updated_at > sinceIso);
  const teams = await meleeTeamsByRegistration(db, tournamentId);
  const flagsFor = registrationFlagsById(all);

  const questionLabels = new Map(registrationQuestionsFromRow(tournament).map((question) => [question.id, question.label]));
  // Die Sync-API ist API-Key-geschützt. Sie liefert daher auch die organisatorischen
  // Anmeldedetails (Tarife und Antworten), damit das Turnierdokument einen vollständigen,
  // nachvollziehbaren Snapshot der Online-Meldung führen kann.
  const registrations = changed.map((row) => {
    const registration = toManagedRegistration(row);
    return {
      ...registration,
      ...registrationFlags(tournament, row, flagsFor),
      // Personen-Slots mit Benutzer-ID (T-17, T-18); die Benutzer-ID ist der Personenschlüssel registrierter Teilnehmer.
      persons: syncPersons(row),
      meleeTeamUuid: teams.get(row.id) || null,
      registrationAnswers: registration.registrationAnswers.map((answer) => ({
        ...answer,
        questionLabel: questionLabels.get(answer.questionId) || answer.questionId,
      })),
    };
  });
  const cursor = registrations.length > 0 ? registrations[registrations.length - 1].updatedAt : sinceIso;
  return json({
    registrations, cursor, tournament: await syncTournamentState(db, tournament),
    conflicts: registrationConflicts(all),
  });
}

function syncPersons(row) {
  return registrationSlots(row).map(({ slot, firstName, lastName, licenseNr, userId }) => ({ slot, firstName, lastName, licenseNr, userId }));
}

async function meleeTeamsByRegistration(db, tournamentId) {
  const result = await db.prepare('SELECT registration_id, team_uuid FROM melee_team_assignments WHERE tournament_id = ?')
    .bind(tournamentId).all();
  return new Map((result.results || []).map((row) => [row.registration_id, row.team_uuid]));
}

// Zustand des Online-Turniers, den das Dokument für Vorabcheck, Wiederherstellung und Zählerabgleich braucht.
async function syncTournamentState(db, tournament) {
  const rounds = await db.prepare('SELECT COUNT(*) AS count FROM tournament_rounds WHERE tournament_id = ?')
    .bind(tournament.id).first();
  return {
    status: tournament.status,
    date: tournament.date || null,
    registrationClosed: Boolean(Number(tournament.registration_closed || 0)),
    runningResetAt: tournament.running_reset_at || null,
    roundsOnline: Number(rounds?.count || 0),
    writeCounter: Number(tournament.sync_write_counter || 0),
  };
}

// Entscheidungen der Turnierleitung in PTM, die online nichts ändern, aber revisionssicher protokolliert werden (T-14):
// online storniert bewusst behalten oder lokal entfernt (KP-14/15), "möglicherweise identisch" verknüpft oder getrennt
// (KP-06 a2), Konflikt als verschiedene Personen aufgelöst (KP-06 c), Start trotz Befund oder ohne Netz (KP-05, P-25).
const SYNC_DECISIONS = ['keep_despite_online_status', 'remove_local', 'link', 'separate', 'resolve_different_persons',
  'start_despite_findings', 'start_without_sync', 'running_only'];

export async function syncPostDecisions(request, db, tournament, user) {
  const body = await readJson(request);
  const decisions = Array.isArray(body.decisions) ? body.decisions : [];
  if (decisions.length === 0 || decisions.length > 200) throw new HttpError(400, 'decisions muss 1 bis 200 Einträge enthalten');
  const now = new Date().toISOString();
  const statements = decisions.map((entry) => {
    const decision = text(entry?.decision);
    if (!SYNC_DECISIONS.includes(decision)) throw new HttpError(400, `Unbekannte Entscheidung: ${decision}`);
    const registrationId = entry.onlineRegistrationId === undefined || entry.onlineRegistrationId === null
      ? null : requireUuid(entry.onlineRegistrationId, 'onlineRegistrationId');
    const localUuid = entry.localRegistrationUuid === undefined || entry.localRegistrationUuid === null
      ? null : requireUuid(entry.localRegistrationUuid, 'localRegistrationUuid');
    const note = nullableText(entry.note);
    if (note && note.length > 500) throw new HttpError(400, 'note darf höchstens 500 Zeichen enthalten');
    return auditStatement(db, { tournamentId: tournament.id, registrationId, actorUserId: user?.id || null, actorRole: 'document',
      action: `decision_${decision}`, target: localUuid ? `local:${localUuid}` : 'tournament', details: note ? { note } : null, now });
  });
  return { statements, response: { envelope: { status: 200, body: { recorded: statements.length } } } };
}

/**
 * Das verbundene Dokument schließt (oder öffnet) die Online-Anmeldung, etwa beim letzten Abgleich vor dem Check-in,
 * damit bis zum Rundenstart keine Anmeldungen mehr eingehen (KP-05, Vorbeugung). Gezählter Schreibvorgang wie alle
 * Dokumentaufträge; protokolliert wie das Schließen in der Web-Oberfläche.
 */
export async function syncPutRegistrationClosed(request, db, tournament, user) {
  const body = await readJson(request);
  if (typeof body.closed !== 'boolean') throw new HttpError(400, 'closed muss true oder false sein');
  const now = new Date().toISOString();
  return {
    statements: [
      db.prepare('UPDATE tournaments SET registration_closed = ?, updated_at = ? WHERE id = ?').bind(body.closed ? 1 : 0, now, tournament.id),
      auditStatement(db, { tournamentId: tournament.id, actorUserId: user?.id || null, actorRole: 'document',
        action: body.closed ? 'registration_closed' : 'registration_opened', target: 'tournament', now }),
    ],
    response: { envelope: { status: 200, body: { registrationClosed: body.closed } } },
  };
}

/**
 * Mêlée-Teamzuordnung nach der Mêlée-Übernahme in PTM (KP-18, T-18): vollständiger Stand Team-UUID → Online-IDs der
 * Einzelanmeldungen. Die Anmeldungen bleiben Einzelanmeldungen; PTM ist Master der Teambildung.
 */
export async function syncPutMeleeTeams(request, db, tournament) {
  if (tournament.registration_type !== 'melee') {
    throw new HttpError(409, 'Eine Mêlée-Teamzuordnung gibt es nur bei Mêlée-Anmeldung', { code: 'not_melee' });
  }
  const body = await readJson(request);
  const teams = Array.isArray(body.teams) ? body.teams : null;
  if (!teams) throw new HttpError(400, 'teams muss ein Array sein');
  const known = new Set(((await db.prepare('SELECT id FROM registrations WHERE tournament_id = ?').bind(tournament.id).all()).results || [])
    .map((row) => row.id));
  const seen = new Set();
  const now = new Date().toISOString();
  const inserts = [];
  for (const team of teams) {
    const teamUuid = requireUuid(team?.teamUuid, 'teamUuid');
    const ids = Array.isArray(team?.registrationIds) ? team.registrationIds.map((id) => text(id)) : [];
    if (ids.length === 0) throw new HttpError(400, 'Ein Team braucht mindestens eine Anmeldung');
    ids.forEach((id, position) => {
      if (!known.has(id)) throw new HttpError(400, `Unbekannte Anmeldung ${id}`, { code: 'registration_unknown' });
      if (seen.has(id)) throw new HttpError(400, `Anmeldung ${id} ist mehreren Teams zugeordnet`, { code: 'registration_duplicate' });
      seen.add(id);
      inserts.push(db.prepare(`INSERT INTO melee_team_assignments (tournament_id, registration_id, team_uuid, position, assigned_at)
          VALUES (?, ?, ?, ?, ?)`).bind(tournament.id, id, teamUuid, position, now));
    });
  }
  return {
    statements: [db.prepare('DELETE FROM melee_team_assignments WHERE tournament_id = ?').bind(tournament.id), ...inserts],
    response: { envelope: { status: 200, body: { teamCount: teams.length, assignedCount: inserts.length } } },
  };
}

/**
 * Zuordnung UUID ↔ Online-Anmeldungs-ID aus Sicht des Servers (Spezifikation T-21). Das Dokument baut damit ein
 * beschädigtes Sync-Blatt wieder auf; der Server kennt die UUIDs als Idempotenzschlüssel der Online-Anlage.
 */
async function syncGetMapping(db, tournamentId) {
  const result = await db.prepare(`SELECT * FROM registrations WHERE tournament_id = ? AND local_registration_uuid IS NOT NULL
      ORDER BY registered_at ASC`).bind(tournamentId).all();
  return json({
    mappings: (result.results || []).map((row) => ({
      onlineRegistrationId: row.id,
      localRegistrationUuid: row.local_registration_uuid,
      status: row.status,
      firstName: row.first_name,
      lastName: row.last_name,
      partnerFirstName: row.partner_first_name,
      partnerLastName: row.partner_last_name,
      partner2FirstName: row.partner2_first_name,
      partner2LastName: row.partner2_last_name,
      executionRevision: Number(row.execution_revision || 1),
      overCapacity: Boolean(Number(row.over_capacity || 0)),
      receivedAfterStart: Boolean(Number(row.received_after_start || 0)),
      persons: syncPersons(row),
    })),
  });
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
    parsed.push({ id, status, seedingPosition, participation, expectedExecutionRevision, notify: entry.notify === true });
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
  const ids = parsed.map((entry) => entry.id);
  const expectedIds = expectedRevisionEntries.map((entry) => entry.id);
  const placeholders = (values) => values.map(() => '?').join(', ') || "''";
  // Antwort aus dem Zustand nach dem Batch: geändert sind genau die Zeilen mit dem Zeitstempel dieses Auftrags. Fehlt
  // eine Zeile mit erwarteter Revision, hat eine parallele Änderung sie verhindert (execution_conflict).
  const responseSql = `SELECT CASE WHEN (SELECT COUNT(*) FROM registrations WHERE tournament_id = ? AND updated_at = ?
        AND id IN (${placeholders(expectedIds)})) < ?
      THEN json_object('status', 409, 'body', json_object('error', 'Die Ausführungsdaten wurden zwischenzeitlich geändert',
        'details', json_object('code', 'execution_conflict')))
      ELSE json_object('status', 200, 'body', json_object('updatedCount',
        (SELECT COUNT(*) FROM registrations WHERE tournament_id = ? AND updated_at = ? AND id IN (${placeholders(ids)}))))
      END`;
  return {
    statements: parsed.map((entry) => updateStatement.bind(entry.status, entry.status, now, entry.status, entry.seedingPosition,
      entry.participation, now, entry.id, tournamentId, entry.expectedExecutionRevision, entry.expectedExecutionRevision)),
    response: { sql: responseSql, binds: [tournamentId, now, ...expectedIds, expectedIds.length, tournamentId, now, ...ids] },
    async afterCommit(envelope) {
      if (envelope.status !== 200) return;
      // Der Dokument-Sync löst keine E-Mails aus; Status-Benachrichtigungen bleiben einem ausdrücklichen notify
      // vorbehalten. Einen Check-in meldet PTM Online ohne E-Mail (E-09).
      for (const entry of parsed) {
        const previous = previousById.get(entry.id);
        if (!previous || previous.status === entry.status || entry.notify !== true) continue;
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
    },
  };
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

// messageBox: optionale Nutzernachricht (Klartext oder Rich Text), im HTML-Teil formatiert in einer eigenen Box,
// im Klartext-Teil als Klartext angehängt.
async function sendTransactionalEmail(env, { to, subject, text, messageBox = null, language = 'de', attachments, logFallback, failureContext, allowLogFallback = false }) {
  const stratoAvailable = stratoConfigured(env);
  const resendAvailable = Boolean(env.RESEND_API_KEY && env.MAIL_FROM);

  if (!stratoAvailable && !resendAvailable) {
    console.log(logFallback);
    if (allowLogFallback) {
      return;
    }
    throw new HttpError(503, 'E-Mail-Versand ist nicht konfiguriert.');
  }

  const body = appendEmailFooter(messageBox ? `${text}\n\n${richTextPlainText(messageBox)}` : text, language);
  const html = renderTransactionalEmailHtml(subject, text, language, messageBox);

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
      if (message.body?.kind === 'live_push') {
        await sendLivePushItems(env, message.body.items);
      } else if (message.body?.kind === 'push') {
        await sendPushNotifications(env, message.body.userId, message.body.payload);
      } else {
        await sendTransactionalEmail(env, message.body);
      }
      message.ack();
    } catch (error) {
      console.error(`Queued ${message.body?.kind === 'push' ? 'push' : 'email'} delivery failed for ${message.body?.kind === 'push' ? message.body?.userId : (message.body?.failureContext || message.body?.to)}`, error);
      message.retry({ delaySeconds: 10 });
    }
    // Die Drosselung gilt den Mail-Anbietern; Live-Pushes einer Runde sollen ohne Wartezeit raus.
    if (message.body?.kind !== 'live_push') await sleep(MAIL_QUEUE_SEND_DELAY_MS);
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

async function listPublishedClubs(db) {
  const rows = await db.prepare(
    `SELECT c.id, c.name, p.latitude, p.longitude
     FROM clubs c
     LEFT JOIN boule_places p ON p.club_id = c.id AND p.status = 'published' AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
     WHERE c.status = 'published'
     ORDER BY c.name COLLATE NOCASE`,
  ).all();
  const clubs = new Map();
  for (const row of rows.results || []) {
    if (!clubs.has(row.id)) clubs.set(row.id, { id: row.id, name: row.name, locations: [] });
    if (row.latitude !== null && row.longitude !== null) clubs.get(row.id).locations.push({ latitude: Number(row.latitude), longitude: Number(row.longitude) });
  }
  return json({ clubs: [...clubs.values()] });
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

export function toPublicPlayerListing(row, includeOwner = false) {
  return {
    id: row.id, ...(includeOwner ? { userId: row.user_id } : {}), type: row.type, title: row.title, description: row.description || null,
    locationName: formatLocationAddress(row.location_name), latitude: Number(row.latitude), longitude: Number(row.longitude),
    eventDate: row.event_date || null, ...(includeOwner && row.owner_first_name ? { ownerName: `${row.owner_first_name} ${row.owner_last_name}`, ownerUsername: row.owner_username || null } : {}),
    playingPosition: row.playing_position,
    tournamentId: row.linked_tournament_name ? row.tournament_id : null, tournamentName: row.linked_tournament_name || null,
    deleteWhenTournamentFinished: row.delete_when_tournament_finished !== 0,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

// Verknüpfte Turniere nur zeigen, solange sie öffentlich sind; private oder
// gelöschte Turniere lassen das Gesuch ohne Verweis stehen.
const PLAYER_LISTING_SELECT = `SELECT l.*, u.first_name AS owner_first_name, u.last_name AS owner_last_name, u.username AS owner_username, t.name AS linked_tournament_name
     FROM player_listings l JOIN users u ON u.id = l.user_id
     LEFT JOIN tournaments t ON t.id = l.tournament_id AND t.visibility = 'public'`;

export async function playerListingInput(db, body, countryCode) {
  const type = text(body.type);
  if (type !== 'tournament' && type !== 'training') throw new HttpError(400, 'Bitte wähle einen Typ');
  const title = text(body.title); if (title.length < 2) throw new HttpError(400, 'Bitte gib einen Titel ein');
  let locationName = text(body.locationName);
  const tournamentId = type === 'tournament' ? text(body.tournamentId) : '';
  let eventDate = type === 'tournament' ? text(body.eventDate) : '';
  let geo = null;
  if (tournamentId) {
    // Datum und Ort kommen immer aus dem Turnier: das Gesuch läuft mit ihm ab,
    // und Ortsname und Kartenpunkt können nicht auseinanderfallen.
    const tournament = await db.prepare("SELECT id, date, location, latitude, longitude FROM tournaments WHERE id = ? AND visibility = 'public'").bind(tournamentId).first();
    if (!tournament) throw new HttpError(400, 'Turnier nicht gefunden');
    eventDate = tournament.date;
    locationName = text(tournament.location);
    // Vorhandene Turnierkoordinaten übernehmen statt die Adresse erneut zu geocodieren.
    if (tournament.latitude !== null && tournament.longitude !== null) geo = { lat: Number(tournament.latitude), lng: Number(tournament.longitude) };
  }
  if (locationName.length < 2) throw new HttpError(400, 'Bitte gib einen Ort ein');
  const playingPosition = normalizePlayerListingPosition(body.playingPosition);
  if (type === 'tournament' && !eventDate) throw new HttpError(400, 'Bitte gib ein Datum an');
  if (!geo) [geo] = await geocodeLocation(locationName, { countryCode, limit: 1 });
  if (!geo) throw new HttpError(400, 'Kein Ort gefunden.');
  return {
    type, title, description: normalizeRichText(body.description, 'Ungültige Beschreibung'), locationName, latitude: geo.lat, longitude: geo.lng, eventDate: eventDate || null, playingPosition,
    tournamentId: tournamentId || null, deleteWhenTournamentFinished: body.deleteWhenTournamentFinished === false ? 0 : 1,
  };
}

// Stündlicher Cron: Gesuche zu beendeten Turnieren entfernen, sofern der
// Ersteller das nicht abgeschaltet hat. Vergessene Turniere schließt
// finishStaleTournaments ohnehin 48 Stunden nach Beginn ab.
export async function deletePlayerListingsOfFinishedTournaments(db) {
  await db.prepare(
    `DELETE FROM player_listings
     WHERE delete_when_tournament_finished = 1
       AND tournament_id IN (SELECT id FROM tournaments WHERE status = 'finished')`).run();
}

async function listPlayerListings(db, user, searchParams) {
  const term = String(searchParams.get('q') || '').trim();
  const typeFilter = String(searchParams.get('type') || '').trim();
  const playingPositionFilter = String(searchParams.get('playingPosition') || '').trim();
  const tournamentFilter = String(searchParams.get('tournamentId') || '').trim();
  const rows = await db.prepare(
    `${PLAYER_LISTING_SELECT}
     WHERE (l.type = 'training' OR (l.type = 'tournament' AND l.event_date >= date('now')))
       AND (?1 = '' OR l.type = ?1)
       AND (?2 = '' OR l.title LIKE '%' || ?2 || '%' COLLATE NOCASE OR l.description LIKE '%' || ?2 || '%' COLLATE NOCASE OR l.location_name LIKE '%' || ?2 || '%' COLLATE NOCASE)
       AND (?3 = '' OR l.playing_position = ?3 OR l.playing_position = 'egal')
       AND (?4 = '' OR (l.tournament_id = ?4 AND t.id IS NOT NULL))
     ORDER BY l.created_at DESC`).bind(typeFilter, term, playingPositionFilter, tournamentFilter).all();
  return json({ listings: (rows.results || []).map((row) => toPublicPlayerListing(row, Boolean(user))) });
}

async function listMyPlayerListings(db, userId) {
  const rows = await db.prepare(
    `${PLAYER_LISTING_SELECT}
     WHERE l.user_id = ? ORDER BY l.created_at DESC`).bind(userId).all();
  return json({ listings: (rows.results || []).map((row) => toPublicPlayerListing(row, true)) });
}

async function listAllPlayerListings(db) {
  const rows = await db.prepare(
    `${PLAYER_LISTING_SELECT}
     ORDER BY l.created_at DESC`).all();
  return json({ listings: (rows.results || []).map((row) => toPublicPlayerListing(row, true)) });
}

async function createPlayerListing(request, db, user, countryCode) {
  const count = await db.prepare('SELECT COUNT(*) AS count FROM player_listings WHERE user_id = ?').bind(user.id).first();
  if (Number(count.count) >= PLAYER_LISTING_LIMIT) throw new HttpError(400, 'Du hast bereits die maximale Anzahl an Mitspielgesuchen erreicht');
  const input = await playerListingInput(db, await readJson(request), countryCode);
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.prepare('INSERT INTO player_listings (id, user_id, type, title, description, location_name, latitude, longitude, event_date, playing_position, tournament_id, delete_when_tournament_finished, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.id, input.type, input.title, input.description, input.locationName, input.latitude, input.longitude, input.eventDate, input.playingPosition, input.tournamentId, input.deleteWhenTournamentFinished, now, now).run();
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
  const input = await playerListingInput(db, await readJson(request), countryCode);
  await db.prepare('UPDATE player_listings SET type = ?, title = ?, description = ?, location_name = ?, latitude = ?, longitude = ?, event_date = ?, playing_position = ?, tournament_id = ?, delete_when_tournament_finished = ?, updated_at = ? WHERE id = ?')
    .bind(input.type, input.title, input.description, input.locationName, input.latitude, input.longitude, input.eventDate, input.playingPosition, input.tournamentId, input.deleteWhenTournamentFinished, new Date().toISOString(), id).run();
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

async function listClubEditorRequests(db) { const rows = await db.prepare('SELECT r.club_id, r.user_id, r.created_at, c.name AS club_name, u.first_name, u.last_name, u.username, u.email FROM club_editor_requests r JOIN clubs c ON c.id = r.club_id JOIN users u ON u.id = r.user_id ORDER BY r.created_at').all(); return json({ requests: rows.results || [] }); }
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

export async function getRegistrationWithTournament(db, id) {
  return db
    .prepare(
      `SELECT registrations.*, tournaments.owner_id, tournaments.visibility, tournaments.status AS tournament_status, tournaments.document_managed, tournaments.desktop_execution, tournaments.formation,
              tournaments.registration_type, tournaments.license_required, tournaments.max_registrations, tournaments.waitlist_enabled, tournaments.entry_fee_cents, tournaments.fee_tiers, tournaments.registration_questions,
              tournaments.name, tournaments.date, tournaments.start_time, tournaments.location,
              tournaments.registration_deadline, tournaments.sync_document_id, tournaments.timezone,
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

/**
 * Freigabe-Link eines privaten Turniers - auch im Entwurf (z. B. Vorschau für Mitorganisatoren oder ein mit dem
 * Turnierdokument verbundenes Turnier). Anmelden kann man sich darüber erst bei offener Anmeldung.
 */
export async function hasTournamentShareAccess(db, tournament, token) {
  if (!token || tournament.visibility !== 'private') return false;
  const tokenHash = await sha256Hex(token);
  const link = await db.prepare('SELECT token_hash FROM tournament_share_links WHERE tournament_id = ? AND token_hash = ?').bind(tournament.id, tokenHash).first();
  return Boolean(link);
}

/**
 * Liefert den Freigabe-Link eines privaten Turniers - immer denselben, solange er nicht deaktiviert wurde. Ein Link
 * aus der Zeit vor Migration 0079 (nur Hash gespeichert) wird einmalig durch einen neuen ersetzt.
 */
export async function createTournamentShareLink(db, tournamentId, origin) {
  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO tournament_share_links (tournament_id, token_hash, token, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tournament_id) DO UPDATE SET token_hash = excluded.token_hash, token = excluded.token, updated_at = excluded.updated_at
     WHERE tournament_share_links.token IS NULL`,
  ).bind(tournamentId, await sha256Hex(token), token, now, now).run();
  const link = await db.prepare('SELECT token FROM tournament_share_links WHERE tournament_id = ?').bind(tournamentId).first();
  return json({ shareUrl: `${origin}/turniere/${tournamentId}/info?share=${encodeURIComponent(link.token)}` });
}

export async function deleteTournamentShareLink(db, tournamentId) {
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
          SELECT COALESCE(json_group_array(json_object('id', te.user_id, 'firstName', u.first_name, 'lastName', u.last_name, 'username', u.username)), '[]')
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
      `SELECT users.id, users.first_name, users.last_name, users.username, users.username_changed_at, users.username_confirmed_at, users.email, users.pending_email, users.role, users.club, users.license_nr, users.email_verified_at, users.password_change_required,
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

  // Every use extends the server-side session, at most once per SESSION_REFRESH_INTERVAL_SECONDS
  // (sonst schreibt z. B. jeder Live-Abruf im 30-Sekunden-Takt in die DB). The response wrapper
  // below refreshes the HttpOnly cookie with the same expiry.
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  if (expiresAt.getTime() - new Date(row.expires_at).getTime() >= SESSION_REFRESH_INTERVAL_SECONDS * 1000) {
    await db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').bind(expiresAt.toISOString(), sessionId).run();
    sessionRefreshes.set(request, { id: sessionId, expiresAt });
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
  const username = body.username === undefined || body.username === null || body.username === '' ? null : normalizeUsername(body.username);

  if (firstName.length < 2 || lastName.length < 2) {
    throw new HttpError(400, 'Vorname und Nachname müssen mindestens 2 Zeichen enthalten');
  }
  if (firstName.length > USER_NAME_MAX_LENGTH || lastName.length > USER_NAME_MAX_LENGTH) {
    throw new HttpError(400, 'Vorname und Nachname dürfen höchstens 50 Zeichen enthalten');
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

  return { firstName, lastName, email, role, password, username };
}

const USERNAME_PROBLEM_MESSAGES = {
  invalid: 'Der Benutzername muss 3 bis 30 Zeichen lang sein und darf nur a–z, 0–9 sowie . _ - enthalten (nicht am Anfang oder Ende)',
  reserved: 'Dieser Benutzername ist nicht erlaubt',
  offensive: 'Dieser Benutzername ist nicht erlaubt',
};

function usernameChangeAllowedAt(changedAt) {
  if (!changedAt) return null;
  const allowedAt = new Date(new Date(changedAt).getTime() + USERNAME_CHANGE_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  return allowedAt.getTime() > Date.now() ? allowedAt.toISOString() : null;
}

// Vergebene und von Admins gesperrte Namen gelten als belegt.
async function usernameTaken(db, username, exceptUserId = null) {
  const row = await db
    .prepare('SELECT 1 AS taken FROM users WHERE username = ? AND id != ? UNION ALL SELECT 1 FROM blocked_usernames WHERE username = ? LIMIT 1')
    .bind(username, exceptUserId || '', username)
    .first();
  return Boolean(row);
}

export async function assertUsernameAllowed(db, value, { userId = null } = {}) {
  const username = normalizeUsername(value);
  const problem = usernameProblem(username);
  if (problem) throw new HttpError(400, USERNAME_PROBLEM_MESSAGES[problem]);
  if (await usernameTaken(db, username, userId)) throw new HttpError(409, 'Benutzername bereits vergeben');
  return username;
}

// Erster freier Name zu den Basisvorschlägen, bei Kollision mit angehängter Zahl (anna.schmidt2 …).
async function findAvailableUsername(db, bases) {
  for (const base of bases) {
    const prefix = base.slice(0, 26);
    const { results } = await db
      .prepare('SELECT username FROM users WHERE substr(username, 1, ?) = ? UNION SELECT username FROM blocked_usernames WHERE substr(username, 1, ?) = ?')
      .bind(prefix.length, prefix, prefix.length, prefix)
      .all();
    const username = firstFreeUsername([base], new Set(results.map((row) => row.username)));
    if (username) return username;
  }
  throw new HttpError(500, 'Kein freier Benutzername gefunden');
}

export function generateUsername(db, firstName, lastName) {
  return findAvailableUsername(db, usernameCandidates(firstName, lastName));
}

const GENERATED_USERNAME_ATTEMPTS = 3;

function isUsernameConflict(error) {
  const message = String(error?.message || '');
  return message.includes('UNIQUE') && message.includes('username');
}

// Speichert ein Konto mit Benutzernamen. Ein automatisch erzeugter Name kann zwischen Prüfung und Speichern parallel
// vergeben werden (gleichnamige Anmeldungen); dann sucht der Worker den nächsten freien Namen und speichert erneut.
// Ein selbst gewählter Name wird nie ersetzt, dort meldet der Aufrufer die Kollision.
async function saveAccountWithUsername(db, { chosen = null, firstName, lastName }, save) {
  if (chosen) {
    const username = await assertUsernameAllowed(db, chosen);
    await save(username);
    return username;
  }
  for (let attempt = 1; ; attempt += 1) {
    const username = await generateUsername(db, firstName, lastName);
    try {
      await save(username);
      return username;
    } catch (error) {
      if (!isUsernameConflict(error) || attempt >= GENERATED_USERNAME_ATTEMPTS) throw error;
    }
  }
}

// UNIQUE-Verletzung beim Speichern eines Kontos: E-Mail oder Benutzername (parallele Anmeldung).
function accountConflictError(error) {
  const message = String(error?.message || '');
  if (!message.includes('UNIQUE')) return null;
  return new HttpError(409, message.includes('username') ? 'Benutzername bereits vergeben' : 'E-Mail-Adresse bereits vergeben');
}

export async function checkUsernameAvailability(db, url) {
  const username = normalizeUsername(url.searchParams.get('u'));
  const problem = usernameProblem(username);
  if (problem) return json({ available: false, problem, suggestion: null });
  if (!(await usernameTaken(db, username))) return json({ available: true, problem: null, suggestion: null });
  return json({ available: false, problem: 'taken', suggestion: await findAvailableUsername(db, [username]) });
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
    liveViewEnabled: Boolean(body.liveViewEnabled),
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

function normalizeRegistrationInput(body, { requireStatus, allowPlaceholder = false, documentSync = false }) {
  // Eine eigene Kontakt-E-Mail gibt es im Formular nicht mehr: Die E-Mail von Spieler 1 ist Pflicht und zugleich die
  // E-Mail der Anmeldung. Nur die Turnierleitung darf ohne E-Mail erfassen ("Keine E-Mail-Adresse vorhanden",
  // Platzhalter). Der Abgleich mit dem Turnierdokument behält die gespeicherte E-Mail unverändert (documentSync).
  const placeholder = (allowPlaceholder || documentSync) && isPlaceholderEmail(text(body.email)) ? text(body.email) : null;
  const playerEmail = placeholder && !documentSync ? null : nullableText(body.playerEmail)?.toLowerCase() || null;
  const registration = {
    firstName: text(body.firstName),
    lastName: text(body.lastName),
    email: documentSync ? text(body.email).toLowerCase() : placeholder || playerEmail || '',
    // Slot-E-Mail der ersten Person (E-22).
    playerEmail,
    club: nullableText(body.club),
    licenseNr: nullableText(body.licenseNr),
    partnerFirstName: nullableText(body.partnerFirstName),
    partnerLastName: nullableText(body.partnerLastName),
    partnerEmail: nullableText(body.partnerEmail)?.toLowerCase() || null,
    partnerClub: nullableText(body.partnerClub),
    partnerLicenseNr: nullableText(body.partnerLicenseNr),
    partner2FirstName: nullableText(body.partner2FirstName),
    partner2LastName: nullableText(body.partner2LastName),
    partner2Email: nullableText(body.partner2Email)?.toLowerCase() || null,
    partner2Club: nullableText(body.partner2Club),
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
  if (documentSync) {
    if (!isEmail(registration.email)) throw new HttpError(400, 'Eine gültige E-Mail ist erforderlich');
    if (registration.playerEmail && !isEmail(registration.playerEmail)) {
      throw new HttpError(400, 'Eine gültige E-Mail für Spieler 1 ist erforderlich');
    }
  } else if (!placeholder && !isEmail(registration.playerEmail || '')) {
    throw new HttpError(400, 'Eine gültige E-Mail für Spieler 1 ist erforderlich');
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

export const assertPartnerCountMatchesFormation = assertCorePartnerCountMatchesFormation;

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
    username: row.username || null,
    usernameConfirmed: Boolean(row.username_confirmed_at),
    usernameChangeAllowedAt: usernameChangeAllowedAt(row.username_changed_at),
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
    senderUsername: row.sender_username || null,
    recipientId: row.recipient_id,
    recipientName: row.recipient_first_name != null ? `${row.recipient_first_name || ''} ${row.recipient_last_name || ''}`.trim() : null,
    recipientUsername: row.recipient_username || null,
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
    registrationClosed: Boolean(Number(row.registration_closed || 0)),
    liveViewEnabled: isLiveViewEnabled(row),
    startsAt: row.date ? tournamentStartUtcIso(row) : null,
    runningResetAt: row.running_reset_at || null,
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
    playerEmail: row.player_email || null,
    club: row.club,
    licenseNr: row.license_nr,
    partnerFirstName: row.partner_first_name,
    partnerLastName: row.partner_last_name,
    partnerEmail: row.partner_email,
    partnerClub: row.partner_club || null,
    partnerLicenseNr: row.partner_license_nr,
    partner2FirstName: row.partner2_first_name,
    partner2LastName: row.partner2_last_name,
    partner2Email: row.partner2_email,
    partner2Club: row.partner2_club || null,
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
    accountConnected: Boolean(row.user_id),
    partnerAccountConnected: Boolean(row.partner_user_id),
    partner2AccountConnected: Boolean(row.partner2_user_id),
    organizerMessage: row.organizer_message || null,
    registrationAnswers: registrationAnswersFromRow(row),
    language: row.language || null,
    origin: row.origin || 'online',
    overCapacity: Boolean(Number(row.over_capacity || 0)),
    receivedAfterStart: Boolean(Number(row.received_after_start || 0)),
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
