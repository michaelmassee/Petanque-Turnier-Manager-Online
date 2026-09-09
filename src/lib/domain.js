import { ROLES, FORMATIONS } from './constants.js';
import { formatTournamentDateTime, timezoneAbbrev, detectViewerTimeZone, amountToMinorUnits, DISPLAY_LOCALES } from './format.js';
import { translateText } from './i18n.js';

export function authTitle(needsSetup, authView) {
  if (needsSetup) {
    return 'Ersten Admin anlegen';
  }
  if (authView === 'forgot') {
    return 'Passwort vergessen';
  }
  if (authView === 'register') {
    return 'Neu registrieren';
  }
  if (authView === 'registerSuccess') {
    return 'Registrierung gespeichert';
  }
  if (authView === 'reset') {
    return 'Passwort ändern';
  }
  if (authView === 'verify') {
    return 'E-Mail bestätigen';
  }
  if (authView === 'resendVerification') {
    return 'Bestätigungslink erneut anfordern';
  }
  if (authView === 'publicRegistration') {
    return 'Turnieranmeldung';
  }
  if (authView === 'cancelRegistration') {
    return 'Anmeldung stornieren';
  }
  return 'Anmelden';
}

export function authSubtitle(needsSetup, authView) {
  if (needsSetup) {
    return 'Lege den ersten Admin-Benutzer für dieses neue Projekt an.';
  }
  if (authView === 'forgot') {
    return 'Fordere einen Link zum Zurücksetzen deines Passworts an.';
  }
  if (authView === 'register') {
    return 'Registriere dein Benutzerkonto. Nach der E-Mail-Bestätigung kannst du dich anmelden.';
  }
  if (authView === 'registerSuccess') {
    return 'Bitte bestätige deine E-Mail-Adresse.';
  }
  if (authView === 'reset') {
    return 'Setze mit deinem Reset-Token ein neues Passwort.';
  }
  if (authView === 'verify') {
    return 'Bestätige deine E-Mail-Adresse, um dein Benutzerkonto freizuschalten.';
  }
  if (authView === 'resendVerification') {
    return 'Fordere einen neuen Bestätigungslink für dein Benutzerkonto an.';
  }
  if (authView === 'publicRegistration') {
    return 'Melde dich für ein öffentliches Turnier an.';
  }
  if (authView === 'cancelRegistration') {
    return 'Storniere deine Turnieranmeldung über den Link aus deiner E-Mail.';
  }
  return 'Melde dich mit deinem Benutzerkonto an.';
}

export function authErrorMessage(code) {
  if (code === 'google_not_configured') {
    return 'Google Anmeldung ist nicht konfiguriert.';
  }
  if (code === 'facebook_not_configured') {
    return 'Facebook Anmeldung ist nicht konfiguriert.';
  }
  if (code === 'facebook_login_failed') {
    return 'Facebook Anmeldung fehlgeschlagen.';
  }
  return 'Google Anmeldung fehlgeschlagen.';
}

export function googleMapsUrl(tournament) {
  if (typeof tournament.latitude === 'number' && typeof tournament.longitude === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tournament.latitude},${tournament.longitude}`)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tournament.location || '')}`;
}

export function tournamentImageUrl(tournamentId, field) {
  return `/api/tournaments/${tournamentId}/image?field=${field}`;
}

export function tournamentPayload(form) {
  return {
    managerId: form.managerId || null,
    name: form.name,
    date: form.date,
    startTime: form.startTime || null,
    location: form.location,
    latitude: (form.overrideCoordinates || form.locationConfirmed) && form.latitude !== '' ? Number(form.latitude) : undefined,
    longitude: (form.overrideCoordinates || form.locationConfirmed) && form.longitude !== '' ? Number(form.longitude) : undefined,
    description: form.description || null,
    type: form.type,
    formation: form.formation,
    registrationType: form.registrationType,
    status: form.status,
    maxRegistrations: Number(form.maxRegistrations || 0),
    registrationDeadline: form.registrationDeadline || null,
    registrationOpensAt: form.registrationOpensAt || null,
    entryFeeCents: amountToMinorUnits(form.entryFeeAmount, form.currency || 'EUR'),
    currency: form.currency || 'EUR',
    contactName: form.contactName || null,
    contactEmail: form.contactEmail || null,
    contactPhone: form.contactPhone || null,
    visibility: form.visibility,
    internalNotes: form.internalNotes || null,
    participantsPublic: Boolean(form.participantsPublic),
    licenseRequired: Boolean(form.licenseRequired),
    teamNameEnabled: Boolean(form.teamNameEnabled),
    waitlistEnabled: Boolean(form.waitlistEnabled),
    registrationEnabled: form.registrationEnabled === undefined ? true : Boolean(form.registrationEnabled),
    approvalRequired: Boolean(form.approvalRequired),
    websiteUrl: form.websiteUrl || null,
    logoUrl: form.logoUrl || null,
    flyerUrl: form.flyerUrl || null,
  };
}

export function registrationPayload(form, language) {
  return {
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    club: form.club || null,
    licenseNr: form.licenseNr || null,
    partnerFirstName: form.partnerFirstName || null,
    partnerLastName: form.partnerLastName || null,
    partnerEmail: form.partnerEmail || null,
    partnerLicenseNr: form.partnerLicenseNr || null,
    partner2FirstName: form.partner2FirstName || null,
    partner2LastName: form.partner2LastName || null,
    partner2Email: form.partner2Email || null,
    partner2LicenseNr: form.partner2LicenseNr || null,
    teamName: form.teamName || null,
    seedingPosition: form.seedingPosition === '' ? null : Number(form.seedingPosition),
    status: form.status,
    isVip: Boolean(form.isVip),
    publicationNoticeAccepted: Boolean(form.publicationNoticeAccepted),
    website: form.website || '',
    language,
  };
}

export function roleName(value) {
  return ROLES.find((role) => role.value === value)?.label || value;
}

export function labelFor(options, value) {
  return options.find((option) => option.value === value)?.label || value;
}

export function formationLabel(tournament) {
  if (tournament.formationOther) {
    return labelFor(FORMATIONS, 'andere');
  }
  return labelFor(FORMATIONS, tournament.formation);
}

export function isOwnTournament(tournament, user) {
  return Boolean(user) && (tournament.createdBy === user.id || tournament.managerId === user.id);
}

export function isUpcoming(tournament) {
  if (tournament.status === 'finished') {
    return false;
  }
  const today = new Date().toISOString().slice(0, 10);
  return tournament.date >= today;
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function registrationNotYetOpen(tournament) {
  return Boolean(tournament.registrationOpensAt) && new Date(tournament.registrationOpensAt).getTime() > Date.now();
}

export function hasOpenRegistration(tournament) {
  if (tournament.status !== 'registration') {
    return false;
  }
  if (registrationNotYetOpen(tournament)) {
    return false;
  }
  if (tournament.registrationDeadline && new Date(tournament.registrationDeadline).getTime() < Date.now()) {
    return false;
  }
  if (!tournament.maxRegistrations) {
    return true;
  }
  return tournament.activeRegistrations < tournament.maxRegistrations || Boolean(tournament.waitlistEnabled);
}

export const SLOTS_FREE_TEMPLATES = {
  de: (free, max) => `${free} von ${max} Plätzen frei`,
  nl: (free, max) => `${free} van ${max} plaatsen vrij`,
  en: (free, max) => `${free} of ${max} spots free`,
  es: (free, max) => `${free} de ${max} plazas libres`,
  fr: (free, max) => `${free} sur ${max} places libres`,
};

export const REGISTERED_COUNT_TEMPLATES = {
  de: (count) => `${count} angemeldet`,
  nl: (count) => `${count} aangemeld`,
  en: (count) => `${count} registered`,
  es: (count) => `${count} inscritos`,
  fr: (count) => `${count} inscrits`,
};

export function registrationStatusLabel(tournament, language) {
  if (tournament.registrationEnabled === false) {
    return translateText('Kein Anmeldeverfahren', language);
  }

  if (tournament.status === 'registration' && registrationNotYetOpen(tournament)) {
    return `${translateText('Anmeldung ab', language)} ${formatTournamentDateTime(tournament.registrationOpensAt, language, tournament.timezone)}`;
  }

  const deadlinePassed = tournament.registrationDeadline && new Date(tournament.registrationDeadline).getTime() < Date.now();
  const isFull = Boolean(tournament.maxRegistrations) && tournament.activeRegistrations >= tournament.maxRegistrations;
  const registrationOpen = tournament.status === 'registration' && !deadlinePassed;

  if (!registrationOpen || isFull) {
    if (isFull && tournament.waitlistRegistrations > 0) {
      return translateText('Anmeldung Warteliste möglich', language);
    }
    return translateText('Anmeldung nicht mehr möglich', language);
  }

  if (!tournament.maxRegistrations) {
    return (REGISTERED_COUNT_TEMPLATES[language] || REGISTERED_COUNT_TEMPLATES.de)(tournament.activeRegistrations || 0);
  }

  const free = tournament.maxRegistrations - tournament.activeRegistrations;
  return (SLOTS_FREE_TEMPLATES[language] || SLOTS_FREE_TEMPLATES.de)(free, tournament.maxRegistrations);
}

export const API_KEY_STATUS_LABELS = {
  pending: 'Ausstehend',
  approved: 'Freigeschaltet',
  revoked: 'Widerrufen',
};

export function formatTournamentStartTime(tournament, language) {
  if (!tournament.startTime) return translateText('Ganztägig', language);
  const zone = tournament.timezone || 'UTC';
  const viewerZone = detectViewerTimeZone();
  if (!viewerZone || viewerZone === zone) return tournament.startTime;
  const anchor = new Date(`${tournament.date}T${tournament.startTime}:00Z`);
  return `${tournament.startTime} ${timezoneAbbrev(anchor, zone, DISPLAY_LOCALES[language] || DISPLAY_LOCALES.de)}`;
}
