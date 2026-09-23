import { CURRENCY_CODES } from './currencies.js';
import { HttpError } from './errors.js';

const TOURNAMENT_TYPES = ['formule_x', 'jeder_gegen_jeden', 'ko', 'kaskaden', 'liga', 'maastrichter', 'poule_ab', 'rangliste', 'schweizer', 'trip_tete'];
const FORMATIONS = ['tete', 'doublette', 'triplette'];
// 'andere' is an input-only pseudo-formation: the DB column keeps its existing CHECK
// (tete/doublette/triplette) to avoid a table rebuild (see migrations/0006, and
// feedback-d1-migration-no-table-rebuild memory - a rebuild once cascade-deleted all
// tournaments via registrations.tournament_id ON DELETE CASCADE). 'andere' is stored as
// formation='tete' (identical partner/registration-type rules) plus formation_other=1.
const FORMATION_INPUT_VALUES = [...FORMATIONS, 'andere'];
const REGISTRATION_TYPES = ['supermelee', 'melee', 'forme'];
const TOURNAMENT_STATUSES = ['draft', 'registration', 'running', 'finished'];
const VISIBILITIES = ['public', 'private'];
export const PLAYER_LISTING_POSITIONS = ['leger', 'milieu', 'schiesser', 'egal'];
const RICH_TEXT_PREFIX = 'ptm-richtext:v1:';

const text = (value) => String(value || '').trim();
const nullableText = (value) => text(value) || null;
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
function nonNegativeInteger(value) { const number = Number(value || 0); if (!Number.isInteger(number) || number < 0) throw new HttpError(400, 'Eine nicht-negative Ganzzahl ist erforderlich'); return number; }
function normalizeFeeTiers(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) throw new HttpError(400, 'Ungültige Startgeld-Tarife');
  const ids = new Set();
  return value.map((tier) => {
    const id = text(tier?.id);
    const name = text(tier?.name);
    if (!id || id === 'legacy-standard' || ids.has(id) || name.length < 2 || name.length > 80) throw new HttpError(400, 'Ungültige Startgeld-Tarife');
    ids.add(id);
    return { id, name, amountCents: nonNegativeInteger(tier?.amountCents), active: tier?.active !== false };
  });
}
function normalizeRegistrationQuestions(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) throw new HttpError(400, 'Ungültige Teilnehmerfragen');
  const ids = new Set();
  return value.map((question) => {
    const id = text(question?.id);
    const label = text(question?.label);
    if (!id || ids.has(id) || label.length < 2 || label.length > 250) throw new HttpError(400, 'Ungültige Teilnehmerfragen');
    ids.add(id);
    return { id, label };
  });
}
function nullableCoordinate(value, min, max) { if (value === undefined || value === null || value === '') return null; const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new HttpError(400, 'Ungültige Koordinate'); return number; }
function isValidRichTextDocument(document) {
  if (!document || typeof document !== 'object' || document.type !== 'doc' || !Array.isArray(document.content) || Object.keys(document).some((key) => key !== 'type' && key !== 'content')) return false;
  const state = { nodes: 0, textLength: 0 };
  const validMark = (mark) => mark && typeof mark === 'object' && Object.keys(mark).length === 1 && ['bold', 'italic', 'underline', 'strike'].includes(mark.type);
  const validText = (node) => {
    if (!node || typeof node !== 'object' || node.type !== 'text' || typeof node.text !== 'string' || Object.keys(node).some((key) => key !== 'type' && key !== 'text' && key !== 'marks')) return false;
    state.nodes += 1;
    state.textLength += node.text.length;
    return state.nodes <= 1_000 && state.textLength <= 20_000 && (node.marks === undefined || (Array.isArray(node.marks) && node.marks.every(validMark)));
  };
  const validTextblock = (node) => {
    if (!node || typeof node !== 'object' || (node.content !== undefined && (!Array.isArray(node.content) || !node.content.every(validText)))) return false;
    state.nodes += 1;
    if (state.nodes > 1_000) return false;
    if (node.type === 'paragraph') return Object.keys(node).every((key) => key === 'type' || key === 'content');
    return node.type === 'heading' && Object.keys(node).every((key) => key === 'type' || key === 'content' || key === 'attrs')
      && node.attrs && Object.keys(node.attrs).length === 1 && node.attrs.level === 2;
  };
  const validListItem = (node, depth) => {
    if (!node || typeof node !== 'object' || node.type !== 'listItem' || !Object.keys(node).every((key) => key === 'type' || key === 'content') || !Array.isArray(node.content) || !node.content.length || depth > 4) return false;
    state.nodes += 1;
    return state.nodes <= 1_000 && node.content.every((child) => validTextblock(child) || validList(child, depth));
  };
  const validList = (node, depth) => {
    if (!node || typeof node !== 'object' || !Array.isArray(node.content) || !node.content.length || !node.content.every((item) => validListItem(item, depth + 1))) return false;
    state.nodes += 1;
    if (state.nodes > 1_000) return false;
    if (node.type === 'bulletList') return Object.keys(node).every((key) => key === 'type' || key === 'content');
    return node.type === 'orderedList' && Object.keys(node).every((key) => key === 'type' || key === 'content' || key === 'attrs')
      && (!node.attrs || (Object.keys(node.attrs).every((key) => key === 'start' || key === 'type')
        && (node.attrs.start === undefined || (Number.isInteger(node.attrs.start) && node.attrs.start > 0))
        && (node.attrs.type === null || node.attrs.type === undefined)));
  };
  return document.content.every((node) => validTextblock(node) || validList(node, 0));
}
export function normalizeRichText(value, errorMessage) {
  const description = nullableText(value);
  if (!description || !description.startsWith(RICH_TEXT_PREFIX)) return description;
  try {
    if (isValidRichTextDocument(JSON.parse(description.slice(RICH_TEXT_PREFIX.length)))) return description;
  } catch {
    // The shared error below deliberately hides parser details from the API response.
  }
  throw new HttpError(400, errorMessage);
}
function normalizeRegistrationDateTime(value, { legacyUtc }) {
  const normalized = nullableText(value); if (!normalized) return null;
  if (legacyUtc) { if (Number.isNaN(new Date(normalized).getTime())) throw new HttpError(400, 'Ein gültiger Anmeldezeitpunkt ist erforderlich'); return normalized; }
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new HttpError(400, 'Ein gültiger lokaler Anmeldezeitpunkt ist erforderlich');
  const [year, month, day, hour, minute] = match.slice(1).map(Number); const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) throw new HttpError(400, 'Ein gültiger lokaler Anmeldezeitpunkt ist erforderlich');
  return normalized;
}

export function registrationOpenStatus(tournament, now = new Date()) {
  if (tournament.registration_enabled === 0) return 'closed';
  if (tournament.visibility !== 'public' || tournament.status !== 'registration') return 'closed';
  if (tournament.registration_deadline && new Date(tournament.registration_deadline).getTime() < now.getTime()) return 'deadline_passed';
  if (tournament.registration_opens_at && new Date(tournament.registration_opens_at).getTime() > now.getTime()) return 'not_yet_open';
  return 'open';
}

export function validateMatchScore(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
    throw new HttpError(400, 'Ungültiges Ergebnis');
  }
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 13) {
    throw new HttpError(400, 'Ungültiges Ergebnis');
  }
  return score;
}

// Teilnahme nach dem Check-in, analog zur Aktiv-Spalte der Meldeliste im Hauptprojekt
// (leer = inactive, 1 = active, 2 = withdrawn/ausgesetzt). Bewusst getrennt vom Anmeldestatus;
// nur 'active' geht in die Rundenauslosung ein.
export const PARTICIPATIONS = ['inactive', 'active', 'withdrawn'];

/**
 * Teilnahme einer neu angelegten Meldung: Bei einem online durchgefuehrten, bereits laufenden
 * Turnier ist der Check-in schon erfolgt - bestaetigte Nachmeldungen (z. B. Schnelleingabe) spielen
 * daher sofort mit. Sonst gilt 'inactive' bis zum Check-in (Turnierstart bzw. Turnierdokument).
 */
export function initialParticipation(tournament, registrationStatus) {
  const onlineRunning = tournament.status === 'running' && Number(tournament.desktop_execution || 0) !== 1;
  return onlineRunning && registrationStatus === 'confirmed' ? 'active' : 'inactive';
}

export function parseParticipation(value, errorMessage = 'Ungültige Teilnahme') {
  const participation = text(value);
  if (!PARTICIPATIONS.includes(participation)) throw new HttpError(400, errorMessage);
  return participation;
}

export function normalizePlayerListingPosition(value) {
  const position = text(value || 'egal');
  if (!PLAYER_LISTING_POSITIONS.includes(position)) throw new HttpError(400, 'Bitte wähle eine Spielposition');
  return position;
}

export function playerListingMatchesPosition(listing, position) {
  return !position || listing.playing_position === position || listing.playing_position === 'egal';
}

// D1 gibt bei einem parallelen INSERT in den eindeutigen Rundenzähler einen
// SQLite-Fehler zurück. Die Zuordnung bleibt hier testbar und ist bewusst eng
// auf genau diesen Constraint beschränkt, damit andere Datenbankfehler nicht
// als harmloser Bedienkonflikt maskiert werden.
export function isTournamentRoundNumberConflict(error) {
  const message = String(error?.message || error || '');
  return /UNIQUE constraint failed:\s*tournament_rounds\.tournament_id,\s*tournament_rounds\.round_number/i.test(message);
}

export function normalizeTournamentInput(body, { legacyRegistrationTimes = false, registrationTypeDefault = 'forme' } = {}) {
  const rawFormation = text(body.formation || 'doublette');
  const formationOther = rawFormation === 'andere';
  const tournament = { name: text(body.name), club: nullableText(body.club), date: text(body.date), startTime: nullableText(body.startTime), location: text(body.location), description: normalizeRichText(body.description, 'Ungültige Turnierbeschreibung'), type: text(body.type || 'formule_x'), formation: formationOther ? 'tete' : rawFormation, formationOther, registrationType: text(body.registrationType || registrationTypeDefault), status: text(body.status || 'draft'), maxRegistrations: nonNegativeInteger(body.maxRegistrations), registrationDeadline: normalizeRegistrationDateTime(body.registrationDeadline, { legacyUtc: legacyRegistrationTimes }), registrationOpensAt: normalizeRegistrationDateTime(body.registrationOpensAt, { legacyUtc: legacyRegistrationTimes }), entryFeeCents: nonNegativeInteger(body.entryFeeCents), feeTiers: normalizeFeeTiers(body.feeTiers), feeTiersProvided: body.feeTiers !== undefined, registrationQuestions: normalizeRegistrationQuestions(body.registrationQuestions), registrationQuestionsProvided: body.registrationQuestions !== undefined, currency: text(body.currency || 'EUR').toUpperCase(), contactName: nullableText(body.contactName), contactEmail: nullableText(body.contactEmail), contactPhone: nullableText(body.contactPhone), visibility: text(body.visibility || 'private'), internalNotes: nullableText(body.internalNotes), participantsPublic: Boolean(body.participantsPublic), licenseRequired: Boolean(body.licenseRequired), teamNameEnabled: Boolean(body.teamNameEnabled), waitlistEnabled: body.waitlistEnabled === undefined ? true : Boolean(body.waitlistEnabled), registrationEnabled: body.registrationEnabled === undefined ? true : Boolean(body.registrationEnabled), approvalRequired: Boolean(body.approvalRequired), schweizerRankingMode: text(body.schweizerRankingMode || 'mit_buchholz'), formuleXRounds: nonNegativeInteger(body.formuleXRounds === undefined ? 4 : body.formuleXRounds), koPlatz3: body.koPlatz3 === undefined ? true : Boolean(body.koPlatz3), latitude: nullableCoordinate(body.latitude, -90, 90), longitude: nullableCoordinate(body.longitude, -180, 180) };
  if (tournament.name.length < 2) throw new HttpError(400, 'Der Turniername muss mindestens 2 Zeichen enthalten');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tournament.date)) throw new HttpError(400, 'Ein gültiges Turnierdatum ist erforderlich');
  if (tournament.startTime && !/^\d{2}:\d{2}$/.test(tournament.startTime)) throw new HttpError(400, 'Eine gültige Startzeit ist erforderlich');
  if (tournament.location.length < 2) throw new HttpError(400, 'Der Ort muss mindestens 2 Zeichen enthalten');
  if (!TOURNAMENT_TYPES.includes(tournament.type)) throw new HttpError(400, 'Ungültiges Turniersystem');
  if (!FORMATION_INPUT_VALUES.includes(rawFormation)) throw new HttpError(400, 'Ungültige Formation');
  if (!REGISTRATION_TYPES.includes(tournament.registrationType)) throw new HttpError(400, 'Ungültiger Anmeldetyp');
  if (rawFormation === 'tete' && tournament.registrationType !== 'forme') throw new HttpError(400, 'Formation Tête ist nur mit dem Anmeldetyp Formée möglich');
  if (tournament.registrationType === 'supermelee' && rawFormation === 'tete') throw new HttpError(400, 'Supermêlée ist nur mit Doublette oder Triplette möglich');
  if (tournament.registrationType === 'supermelee' && tournament.type !== 'rangliste') throw new HttpError(400, 'Supermêlée erfordert das Turniersystem Rangliste');
  if (!['mit_buchholz', 'ohne_buchholz'].includes(tournament.schweizerRankingMode)) throw new HttpError(400, 'Ungültiger Schweizer Ranglistenmodus');
  if (tournament.formuleXRounds < 1 || tournament.formuleXRounds > 20) throw new HttpError(400, 'Ungültige Formule-X-Rundenzahl');
  if (!TOURNAMENT_STATUSES.includes(tournament.status)) throw new HttpError(400, 'Ungültiger Turnierstatus');
  if (!VISIBILITIES.includes(tournament.visibility)) throw new HttpError(400, 'Ungültige Sichtbarkeit');
  if (tournament.contactEmail && !isEmail(tournament.contactEmail)) throw new HttpError(400, 'Eine gültige Kontakt-E-Mail ist erforderlich');
  if ((tournament.latitude === null) !== (tournament.longitude === null)) throw new HttpError(400, 'Breiten- und Längengrad müssen gemeinsam gesetzt werden');
  if (!CURRENCY_CODES.includes(tournament.currency)) throw new HttpError(400, 'Ungültige Währung');
  if (tournament.registrationOpensAt && tournament.registrationDeadline && new Date(tournament.registrationOpensAt).getTime() > new Date(tournament.registrationDeadline).getTime()) throw new HttpError(400, 'Anmeldung möglich ab darf nicht nach der Meldefrist liegen');
  return tournament;
}

export function assertPartnerCountMatchesFormation(tournament, registration) {
  const formation = tournament.registration_type === 'melee' || tournament.registration_type === 'supermelee' ? 'tete' : tournament.formation;
  const hasPartner = Boolean(registration.partnerFirstName && registration.partnerLastName); const hasPartner2 = Boolean(registration.partner2FirstName && registration.partner2LastName);
  if (formation === 'tete') { if (hasPartner || hasPartner2) throw new HttpError(400, 'Formation Tête erlaubt nur einen Teilnehmer, keinen Partner'); return; }
  if (formation === 'doublette') { if (!hasPartner) throw new HttpError(400, 'Formation Doublette erfordert genau einen Partner'); if (hasPartner2) throw new HttpError(400, 'Formation Doublette erlaubt nur einen Partner'); return; }
  if (formation === 'triplette' && (!hasPartner || !hasPartner2)) throw new HttpError(400, 'Formation Triplette erfordert genau zwei Partner');
}

// Duplikat von distanceKm (src/lib/domain.js) - worker.js kann domain.js nicht
// importieren, da diese Datei i18next/localStorage-Bootstrapping mitzieht, das im
// Worker-Runtime fehlt.
export function workerDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isNewlyPublicTournament(previous, next) {
  const isPublic = (tournament) => tournament.visibility === 'public' && tournament.status !== 'draft';
  return !isPublic(previous) && isPublic(next);
}

// Spiegelt bewusst die Client-Filterlogik aus filteredHomeTournaments (App.jsx) für
// den Veröffentlichungsabgleich "neue Treffer" - bei Änderungen dort auch hier nachziehen.
// "Nur meine Turniere" wird absichtlich NICHT nachgebildet: das ist ein
// sitzungsbezogener, subjektiver Filter ohne sinnvollen Cron-Kontext.
export function tournamentMatchesSavedSearch(tournament, search) {
  if (tournament.visibility !== 'public' || tournament.status === 'draft') return false;
  if (search.filter_month && tournament.date.slice(5, 7) !== search.filter_month) return false;
  if (search.filter_formation) {
    if (search.filter_formation === 'andere') {
      if (!Number(tournament.formation_other)) return false;
    } else if (tournament.formation !== search.filter_formation || Number(tournament.formation_other)) {
      return false;
    }
  }
  if (search.filter_registration_type && tournament.registration_type !== search.filter_registration_type) return false;
  if (search.filter_type && tournament.type !== search.filter_type) return false;
  if (search.filter_open_only) {
    if (tournament.status !== 'registration') return false;
    if (tournament.registration_opens_at && new Date(tournament.registration_opens_at).getTime() > Date.now()) return false;
    if (tournament.registration_deadline && new Date(tournament.registration_deadline).getTime() < Date.now()) return false;
  }
  if (search.filter_online_registration_only) {
    if (tournament.registration_enabled === 0 || tournament.status !== 'registration') return false;
    if (tournament.registration_opens_at && new Date(tournament.registration_opens_at).getTime() > Date.now()) return false;
    if (tournament.registration_deadline && new Date(tournament.registration_deadline).getTime() < Date.now()) return false;
    const maxRegistrations = Number(tournament.max_registrations || 0);
    const activeRegistrations = Number(tournament.active_registrations || 0);
    if (maxRegistrations && activeRegistrations >= maxRegistrations && !Number(tournament.waitlist_enabled ?? 1)) return false;
  }
  const query = String(search.query || '').trim().toLowerCase();
  if (query) {
    const haystack = [tournament.name, tournament.location, tournament.type].join(' ').toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (search.origin_lat !== null && search.origin_lat !== undefined) {
    if (tournament.latitude === null || tournament.longitude === null) return false;
    const distance = workerDistanceKm(search.origin_lat, search.origin_lng, tournament.latitude, tournament.longitude);
    if (distance > Number(search.radius_km || 25)) return false;
  }
  return true;
}
