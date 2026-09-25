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

/**
 * Kalendereintrag = reiner Termin ohne Anmeldeverfahren (petanque-aktuell-Import oder
 * "Turnier melden"). Nie online durchführbar, kein Nachrichten-Broadcast.
 */
export function isCalendarEntry(tournament) {
  return Number(tournament.registration_enabled ?? 1) === 0;
}

export function registrationOpenStatus(tournament, now = new Date()) {
  if (isCalendarEntry(tournament)) return 'closed';
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
export function initialParticipation(tournament, registrationStatus, requestedParticipation, syncBootstrap = false) {
  // Das Turnierdokument ist bei einer Sync-Nachmeldung die fachliche Quelle für
  // den Check-in. Sein expliziter Zustand darf nicht durch den Desktop-Default
  // "inactive" ersetzt werden.
  if (syncBootstrap && requestedParticipation !== undefined) {
    return parseParticipation(requestedParticipation);
  }
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

export const MAX_JSON_BODY_BYTES = 1024 * 1024;

// Liest einen Request-/Response-Body mit harter Obergrenze. Content-Length wird nur als
// Frühabbruch genutzt - der Header kann fehlen (chunked) oder lügen, deshalb wird beim
// Streamen zusätzlich mitgezählt und bei Überschreitung abgebrochen.
export async function readBodyWithLimit(message, maxBytes, errorMessage = 'Anfrage zu groß') {
  const declaredLength = Number(message.headers.get('Content-Length') || 0);
  if (declaredLength > maxBytes) {
    throw new HttpError(413, errorMessage);
  }
  if (!message.body) {
    return new Uint8Array(0);
  }

  const reader = message.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // Rest des Streams verwerfen statt weiter aus dem Netz zu lesen.
      await reader.cancel();
      throw new HttpError(413, errorMessage);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Persönliche Live-Ansicht (Bereich "Live") und Desktop-Sync von Runden/Rangliste
// ---------------------------------------------------------------------------

const MAX_SYNC_MATCHES_PER_ROUND = 500;
const MAX_SYNC_RANKING_ENTRIES = 1000;
const MAX_COURT_LENGTH = 40;

function syncScore(value) {
  return value === undefined || value === null || value === '' ? null : validateMatchScore(value);
}

function syncRegistrationIds(value, validRegistrationIds, errorMessage) {
  if (!Array.isArray(value) || value.length > 3) throw new HttpError(400, errorMessage);
  const ids = value.map((id) => text(id));
  if (ids.some((id) => !id || !validRegistrationIds.has(id)) || new Set(ids).size !== ids.length) {
    throw new HttpError(400, errorMessage);
  }
  return ids;
}

/**
 * Prüft die Partien einer Spielrunde aus dem Turnierdokument. Die Runde wird serverseitig
 * komplett ersetzt, daher muss jede Partie vollständig und jede Meldung höchstens einmal
 * vertreten sein. Team B darf leer sein (Freilos), Scores dürfen fehlen (Partie läuft).
 */
export function parseSyncRoundMatches(body, validRegistrationIds) {
  const entries = body?.matches;
  if (!Array.isArray(entries) || entries.length > MAX_SYNC_MATCHES_PER_ROUND) {
    throw new HttpError(400, 'Partien müssen als Array übergeben werden');
  }
  const seen = new Set();
  return entries.map((entry, index) => {
    const teamA = syncRegistrationIds(entry?.teamA, validRegistrationIds, 'Ungültige Meldung in einer Partie');
    const teamB = syncRegistrationIds(entry?.teamB ?? [], validRegistrationIds, 'Ungültige Meldung in einer Partie');
    if (teamA.length === 0) throw new HttpError(400, 'Ungültige Meldung in einer Partie');
    for (const id of [...teamA, ...teamB]) {
      if (seen.has(id)) throw new HttpError(400, 'Eine Meldung ist in der Runde mehrfach eingeteilt');
      seen.add(id);
    }
    const court = nullableText(entry?.court);
    if (court && court.length > MAX_COURT_LENGTH) throw new HttpError(400, 'Ungültige Bahn');
    const matchIndex = entry?.matchIndex === undefined || entry?.matchIndex === null ? index : Number(entry.matchIndex);
    if (!Number.isInteger(matchIndex) || matchIndex < 0) throw new HttpError(400, 'Ungültige Partie-Nummer');
    return {
      teamA,
      teamB,
      scoreA: syncScore(entry?.scoreA),
      scoreB: syncScore(entry?.scoreB),
      court,
      stageLabel: nullableText(entry?.stageLabel),
      matchIndex,
    };
  });
}

export function parseSyncRoundNumber(value) {
  const roundNumber = Number(value);
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 999) {
    throw new HttpError(400, 'Ungültige Rundennummer');
  }
  return roundNumber;
}

/** Ranglisten-Snapshot aus dem Turnierdokument (Hauptprojekt ist bei Desktop-Durchführung Referenz). */
export function parseSyncRanking(body, validRegistrationIds) {
  const entries = body?.entries;
  if (!Array.isArray(entries) || entries.length > MAX_SYNC_RANKING_ENTRIES) {
    throw new HttpError(400, 'Rangliste muss als Array übergeben werden');
  }
  const count = (value) => (value === undefined || value === null ? null : nonNegativeInteger(value));
  return entries.map((entry) => {
    const rank = Number(entry?.place);
    if (!Number.isInteger(rank) || rank < 1) throw new HttpError(400, 'Ungültiger Ranglistenplatz');
    const registrationIds = syncRegistrationIds(entry?.registrationIds, validRegistrationIds, 'Ungültige Meldung in der Rangliste');
    if (registrationIds.length === 0) throw new HttpError(400, 'Ungültige Meldung in der Rangliste');
    const pointsFor = count(entry?.pointsFor);
    const pointsAgainst = count(entry?.pointsAgainst);
    return {
      rank,
      registrationIds,
      wins: count(entry?.wins),
      pointsFor,
      pointsAgainst,
      pointsDiff: pointsFor === null || pointsAgainst === null ? null : pointsFor - pointsAgainst,
    };
  });
}

const liveMemberLabel = (member) => [member.firstName, member.lastName].filter(Boolean).join(' ') || member.teamLabel || '?';
const liveTeamLabel = (members) => members.map((member) => member.teamLabel || liveMemberLabel(member)).join(' + ');

function liveMatchOutcome(own, other, noShow, ownSide) {
  if (noShow) return noShow === ownSide ? 'lost' : 'won';
  if (own === null || own === undefined || other === null || other === undefined) return 'open';
  if (own === other) return 'open';
  return own > other ? 'won' : 'lost';
}

/**
 * Baut aus Runden (Format von loadTournamentRounds) und einer normalisierten Rangliste
 * ([{ rank, registrationIds, label, wins, pointsFor, pointsAgainst, pointsDiff }]) die Sicht
 * eines einzelnen Spielers bzw. seiner Meldung.
 */
export function buildPlayerLiveView({ registrationId, rounds, ranking }) {
  const history = [];
  for (const round of rounds || []) {
    for (const match of round.matches || []) {
      const inA = match.teamA.some((member) => member.id === registrationId);
      const inB = !inA && match.teamB.some((member) => member.id === registrationId);
      if (!inA && !inB) continue;
      const own = inA ? match.teamA : match.teamB;
      const opponents = inA ? match.teamB : match.teamA;
      const ownScore = inA ? match.scoreA : match.scoreB;
      const opponentScore = inA ? match.scoreB : match.scoreA;
      const bye = opponents.length === 0;
      history.push({
        roundNumber: round.roundNumber,
        matchId: match.id,
        stageLabel: match.stageLabel || null,
        court: match.court || null,
        teamLabel: liveTeamLabel(own),
        teammates: own.filter((member) => member.id !== registrationId).map(liveMemberLabel),
        opponentLabel: bye ? null : liveTeamLabel(opponents),
        bye,
        ownScore: ownScore ?? null,
        opponentScore: opponentScore ?? null,
        noShow: match.noShow || null,
        outcome: liveMatchOutcome(ownScore, opponentScore, match.noShow, inA ? 'a' : 'b'),
      });
    }
  }

  const lastRoundNumber = rounds?.length ? rounds[rounds.length - 1].roundNumber : null;
  const latest = history[history.length - 1] || null;
  const currentMatch = latest && latest.roundNumber === lastRoundNumber ? latest : null;
  const played = history.filter((entry) => entry.outcome !== 'open');
  const summary = {
    played: played.length,
    wins: played.filter((entry) => entry.outcome === 'won').length,
    losses: played.filter((entry) => entry.outcome === 'lost').length,
    pointsFor: played.reduce((sum, entry) => sum + (entry.ownScore || 0), 0),
    pointsAgainst: played.reduce((sum, entry) => sum + (entry.opponentScore || 0), 0),
  };

  const entries = (ranking || []).map((entry) => ({ ...entry, own: entry.registrationIds.includes(registrationId) }));
  const ownEntry = entries.find((entry) => entry.own) || null;

  return {
    lastRoundNumber,
    currentMatch,
    history: [...history].reverse(),
    summary,
    rankingPlace: ownEntry ? ownEntry.rank : null,
    rankingSize: entries.length,
    ranking: entries,
  };
}

/** Findet die Meldungen, die zu einer E-Mail gehören (Hauptmeldung oder Partner). */
export function registrationBelongsToEmail(registration, email) {
  const normalized = text(email).toLowerCase();
  if (!normalized) return false;
  return [registration.email, registration.partner_email, registration.partner2_email]
    .some((value) => text(value).toLowerCase() === normalized);
}
