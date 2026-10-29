import { EMPTY_TOURNAMENT_FORM, FORMATIONS, REGISTRATION_TYPES, TOURNAMENT_TYPES } from './constants.js';
import { labelFor, tournamentPayload } from './domain.js';

// Schnellstart: erst die Formation, dann das System wählen – nur online spielbare Systeme (siehe PAIRING_STRATEGIES).
// Supermêlée verlangt im Worker das Turniersystem Rangliste und gibt es nicht als Tête.
export const QUICK_START_FORMATIONS = ['tete', 'doublette', 'triplette'];

const QUICK_START_SYSTEMS = [
  { id: 'supermelee', type: 'rangliste', registrationType: 'supermelee', formations: ['doublette', 'triplette'] },
  { id: 'schweizer', type: 'schweizer', registrationType: 'forme' },
  { id: 'formule-x', type: 'formule_x', registrationType: 'forme' },
  { id: 'jeder-gegen-jeden', type: 'jeder_gegen_jeden', registrationType: 'forme' },
  { id: 'ko', type: 'ko', registrationType: 'forme' },
];

export function quickStartTemplates(formation) {
  return QUICK_START_SYSTEMS
    .filter((system) => !system.formations || system.formations.includes(formation))
    .map(({ id, type, registrationType }) => ({ id: `${id}-${formation}`, type, formation, registrationType }));
}

export function quickStartSystemLabel(template) {
  return template.registrationType === 'supermelee'
    ? labelFor(REGISTRATION_TYPES, template.registrationType)
    : labelFor(TOURNAMENT_TYPES, template.type);
}

export function quickStartTemplateLabel(template) {
  return `${quickStartSystemLabel(template)} ${labelFor(FORMATIONS, template.formation)}`;
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
    liveViewEnabled: true,
    playerResultReportingEnabled: true,
    contactName: currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : '',
    contactEmail: currentUser?.email || '',
    contactPhone: currentUser?.phone || '',
  });
}
