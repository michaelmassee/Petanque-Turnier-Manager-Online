import { EMPTY_TOURNAMENT_FORM, FORMATIONS, REGISTRATION_TYPES, TOURNAMENT_TYPES } from './constants.js';
import { labelFor, tournamentPayload } from './domain.js';

// Feste Vorlagen für den Schnellstart – nur online spielbare Systeme (siehe PAIRING_STRATEGIES).
// Supermêlée verlangt im Worker das Turniersystem Rangliste, Tête nur den Anmeldetyp Formée.
export const QUICK_START_TEMPLATES = [
  { id: 'supermelee-doublette', type: 'rangliste', formation: 'doublette', registrationType: 'supermelee' },
  { id: 'supermelee-triplette', type: 'rangliste', formation: 'triplette', registrationType: 'supermelee' },
  { id: 'schweizer-tete', type: 'schweizer', formation: 'tete', registrationType: 'forme' },
  { id: 'schweizer-doublette', type: 'schweizer', formation: 'doublette', registrationType: 'forme' },
  { id: 'schweizer-triplette', type: 'schweizer', formation: 'triplette', registrationType: 'forme' },
  { id: 'formule-x-doublette', type: 'formule_x', formation: 'doublette', registrationType: 'forme' },
  { id: 'jeder-gegen-jeden-doublette', type: 'jeder_gegen_jeden', formation: 'doublette', registrationType: 'forme' },
  { id: 'ko-doublette', type: 'ko', formation: 'doublette', registrationType: 'forme' },
];

export function quickStartTemplateLabel(template) {
  const system = template.registrationType === 'supermelee'
    ? labelFor(REGISTRATION_TYPES, template.registrationType)
    : labelFor(TOURNAMENT_TYPES, template.type);
  return `${system} ${labelFor(FORMATIONS, template.formation)}`;
}

// Lokales Datum als ISO-String (YYYY-MM-DD); toISOString() läge kurz nach Mitternacht noch auf dem Vortag.
export function localIsoDate(date = new Date()) {
  return date.toLocaleDateString('sv');
}

// Schnellstart-Turniere sind immer privat und ohne Rückfragen: Name aus Vorlage und Datum, Ort aus dem Profilverein.
export function quickStartPayload(template, { currentUser, today = localIsoDate(), fallbackLocation }) {
  const club = (currentUser?.club || '').trim();
  return tournamentPayload({
    ...EMPTY_TOURNAMENT_FORM,
    type: template.type,
    formation: template.formation,
    registrationType: template.registrationType,
    name: `${quickStartTemplateLabel(template)} ${today}`,
    date: today,
    location: club.length >= 2 ? club : fallbackLocation,
    visibility: 'private',
    status: 'draft',
    registrationEnabled: true,
    contactName: currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : '',
    contactEmail: currentUser?.email || '',
    contactPhone: currentUser?.phone || '',
  });
}
