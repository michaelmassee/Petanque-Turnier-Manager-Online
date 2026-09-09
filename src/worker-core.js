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

const text = (value) => String(value || '').trim();
const nullableText = (value) => text(value) || null;
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
function nonNegativeInteger(value) { const number = Number(value || 0); if (!Number.isInteger(number) || number < 0) throw new HttpError(400, 'Eine nicht-negative Ganzzahl ist erforderlich'); return number; }
function nullableCoordinate(value, min, max) { if (value === undefined || value === null || value === '') return null; const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new HttpError(400, 'Ungültige Koordinate'); return number; }
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

export function normalizeTournamentInput(body, { legacyRegistrationTimes = false, registrationTypeDefault = 'forme' } = {}) {
  const rawFormation = text(body.formation || 'doublette');
  const formationOther = rawFormation === 'andere';
  const tournament = { name: text(body.name), date: text(body.date), startTime: nullableText(body.startTime), location: text(body.location), description: nullableText(body.description), type: text(body.type || 'formule_x'), formation: formationOther ? 'tete' : rawFormation, formationOther, registrationType: text(body.registrationType || registrationTypeDefault), status: text(body.status || 'draft'), maxRegistrations: nonNegativeInteger(body.maxRegistrations), registrationDeadline: normalizeRegistrationDateTime(body.registrationDeadline, { legacyUtc: legacyRegistrationTimes }), registrationOpensAt: normalizeRegistrationDateTime(body.registrationOpensAt, { legacyUtc: legacyRegistrationTimes }), entryFeeCents: nonNegativeInteger(body.entryFeeCents), currency: text(body.currency || 'EUR').toUpperCase(), contactName: nullableText(body.contactName), contactEmail: nullableText(body.contactEmail), contactPhone: nullableText(body.contactPhone), visibility: text(body.visibility || 'private'), internalNotes: nullableText(body.internalNotes), managerId: nullableText(body.managerId), participantsPublic: Boolean(body.participantsPublic), licenseRequired: Boolean(body.licenseRequired), teamNameEnabled: Boolean(body.teamNameEnabled), waitlistEnabled: body.waitlistEnabled === undefined ? true : Boolean(body.waitlistEnabled), registrationEnabled: body.registrationEnabled === undefined ? true : Boolean(body.registrationEnabled), approvalRequired: Boolean(body.approvalRequired), latitude: nullableCoordinate(body.latitude, -90, 90), longitude: nullableCoordinate(body.longitude, -180, 180) };
  if (tournament.name.length < 2) throw new HttpError(400, 'Der Turniername muss mindestens 2 Zeichen enthalten');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tournament.date)) throw new HttpError(400, 'Ein gültiges Turnierdatum ist erforderlich');
  if (tournament.startTime && !/^\d{2}:\d{2}$/.test(tournament.startTime)) throw new HttpError(400, 'Eine gültige Startzeit ist erforderlich');
  if (tournament.location.length < 2) throw new HttpError(400, 'Der Ort muss mindestens 2 Zeichen enthalten');
  if (!TOURNAMENT_TYPES.includes(tournament.type)) throw new HttpError(400, 'Ungültiges Turniersystem');
  if (!FORMATION_INPUT_VALUES.includes(rawFormation)) throw new HttpError(400, 'Ungültige Formation');
  if (!REGISTRATION_TYPES.includes(tournament.registrationType)) throw new HttpError(400, 'Ungültiger Anmeldetyp');
  if (tournament.formation === 'tete' && tournament.registrationType !== 'forme') throw new HttpError(400, 'Formation Tête ist nur mit dem Anmeldetyp Formée möglich');
  if (tournament.registrationType === 'supermelee' && tournament.formation === 'tete') throw new HttpError(400, 'Supermêlée ist nur mit Doublette oder Triplette möglich');
  if (tournament.registrationType === 'supermelee' && tournament.type !== 'rangliste') throw new HttpError(400, 'Supermêlée erfordert das Turniersystem Rangliste');
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
