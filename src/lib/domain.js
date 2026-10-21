import { ROLES, FORMATIONS } from './constants.js';
import { formatTournamentDateTime, timezoneAbbrev, detectViewerTimeZone, amountToMinorUnits, DISPLAY_LOCALES } from './format.js';
import i18next from './i18next-config.js';
import { formatLocationAddress } from '../location-format.js';
export { formatLocationAddress };

export function authTitle(needsSetup, authView) {
  if (needsSetup) {
    return i18next.t('Ersten Admin anlegen');
  }
  if (authView === 'forgot') {
    return i18next.t('Passwort vergessen');
  }
  if (authView === 'register') {
    return i18next.t('Neu registrieren');
  }
  if (authView === 'registerSuccess') {
    return i18next.t('Registrierung gespeichert');
  }
  if (authView === 'reset') {
    return i18next.t('Passwort ändern');
  }
  if (authView === 'verify') {
    return i18next.t('E-Mail bestätigen');
  }
  if (authView === 'resendVerification') {
    return i18next.t('Bestätigungslink erneut anfordern');
  }
  if (authView === 'publicRegistration') {
    return i18next.t('Turnieranmeldung');
  }
  if (authView === 'cancelRegistration') {
    return i18next.t('Anmeldung stornieren');
  }
  return i18next.t('Anmelden');
}

export function authSubtitle(needsSetup, authView) {
  if (needsSetup) {
    return i18next.t('Lege den ersten Admin-Benutzer für dieses neue Projekt an.');
  }
  if (authView === 'forgot') {
    return i18next.t('Fordere einen Link zum Zurücksetzen deines Passworts an.');
  }
  if (authView === 'register') {
    return i18next.t('Registriere dein Benutzerkonto. Nach der E-Mail-Bestätigung kannst du dich anmelden.');
  }
  if (authView === 'registerSuccess') {
    return i18next.t('Bitte bestätige deine E-Mail-Adresse.');
  }
  if (authView === 'reset') {
    return i18next.t('Setze mit deinem Reset-Token ein neues Passwort.');
  }
  if (authView === 'verify') {
    return i18next.t('Bestätige deine E-Mail-Adresse, um dein Benutzerkonto freizuschalten.');
  }
  if (authView === 'resendVerification') {
    return i18next.t('Fordere einen neuen Bestätigungslink für dein Benutzerkonto an.');
  }
  if (authView === 'publicRegistration') {
    return i18next.t('Melde dich für ein öffentliches Turnier an.');
  }
  if (authView === 'cancelRegistration') {
    return i18next.t('Storniere deine Turnieranmeldung über den Link aus deiner E-Mail.');
  }
  return i18next.t('Melde dich mit deinem Benutzerkonto an.');
}

export function authErrorMessage(code) {
  if (code === 'google_not_configured') {
    return i18next.t('Google Anmeldung ist nicht konfiguriert.');
  }
  if (code === 'facebook_not_configured') {
    return i18next.t('Facebook Anmeldung ist nicht konfiguriert.');
  }
  if (code === 'facebook_login_failed') {
    return i18next.t('Facebook Anmeldung fehlgeschlagen.');
  }
  return i18next.t('Google Anmeldung fehlgeschlagen.');
}

export function googleMapsUrl(tournament) {
  if (typeof tournament.latitude === 'number' && typeof tournament.longitude === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tournament.latitude},${tournament.longitude}`)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tournament.location || tournament.address || '')}`;
}

function calendarPlatform({ userAgent = '', maxTouchPoints = 0 } = {}) {
  if (/iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'desktop';
}

function compactDate(isoDate) {
  return isoDate.replaceAll('-', '');
}

// Kalendereintrag als Google-Calendar-Vorlage: Ortszeit des Turniers (ctz), 4 Stunden Dauer bzw. ganztägig wie im ICS.
function googleCalendarUrl(tournament, detailsUrl) {
  let dates;
  if (tournament.startTime) {
    const [hours, minutes] = tournament.startTime.split(':').map(Number);
    const start = new Date(`${tournament.date}T00:00:00Z`);
    start.setUTCHours(hours, minutes);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    const stamp = (date) => date.toISOString().slice(0, 19).replace(/[-:]/g, '');
    dates = `${stamp(start)}/${stamp(end)}`;
  } else {
    const next = new Date(`${tournament.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    dates = `${compactDate(tournament.date)}/${compactDate(next.toISOString().slice(0, 10))}`;
  }
  const params = new URLSearchParams({ action: 'TEMPLATE', text: tournament.name, dates,
    location: formatLocationAddress(tournament.location), details: detailsUrl });
  if (tournament.startTime) params.set('ctz', tournament.timezone || 'Europe/Berlin');
  return `https://calendar.google.com/calendar/render?${params}`;
}

/**
 * „Kalendereintrag erstellen“: iOS öffnet die ICS-Datei direkt im Kalender, Android die Google-Calendar-Vorlage
 * (Chrome würde eine ICS-Datei dort nur herunterladen), am PC wird die ICS-Datei heruntergeladen.
 */
export function calendarEventLink(tournament, { shareToken = '', origin = '', userAgent = '', maxTouchPoints = 0 } = {}) {
  const platform = calendarPlatform({ userAgent, maxTouchPoints });
  const share = shareToken ? `share=${encodeURIComponent(shareToken)}` : '';
  if (platform === 'android') {
    const detailsUrl = `${origin}/turniere/${tournament.id}/info${share ? `?${share}` : ''}`;
    return { href: googleCalendarUrl(tournament, detailsUrl), download: false, external: true };
  }
  const params = [share, platform === 'desktop' ? 'download=1' : ''].filter(Boolean).join('&');
  return { href: `/api/tournaments/${tournament.id}/calendar.ics${params ? `?${params}` : ''}`, download: platform === 'desktop', external: false };
}

export function tournamentImageUrl(tournamentId, field, shareToken = '') {
  const params = new URLSearchParams({ field });
  if (shareToken) params.set('share', shareToken);
  return `/api/tournaments/${tournamentId}/image?${params}`;
}

export function clubLogoImageUrl(placeId) {
  return `/api/places/${placeId}/club-logo`;
}

export function tournamentPayload(form) {
  return {
    boulePlaceId: form.boulePlaceId || null,
    club: form.club || null,
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
    schweizerRankingMode: form.schweizerRankingMode || 'mit_buchholz',
    formuleXRounds: Number(form.formuleXRounds || 4),
    koPlatz3: form.koPlatz3 === undefined ? true : Boolean(form.koPlatz3),
    status: form.status,
    maxRegistrations: Number(form.maxRegistrations || 0),
    registrationDeadline: form.registrationDeadline || null,
    registrationOpensAt: form.registrationOpensAt || null,
    entryFeeCents: amountToMinorUnits(form.entryFeeAmount, form.currency || 'EUR'),
    feeTiers: (form.feeTiers || []).map((tier) => ({
      id: tier.id,
      name: tier.name,
      amountCents: amountToMinorUnits(tier.amount, form.currency || 'EUR'),
      active: tier.active !== false,
    })),
    registrationQuestions: (form.registrationQuestions || []).map((question) => ({ id: question.id, label: question.label })),
    currency: form.currency || 'EUR',
    contactName: form.contactName || null,
    contactEmail: form.contactEmail || null,
    contactPhone: form.contactPhone || null,
    visibility: form.visibility,
    internalNotes: form.internalNotes || null,
    participantsPublic: Boolean(form.participantsPublic),
    liveViewEnabled: Boolean(form.liveViewEnabled),
    playerResultReportingEnabled: Boolean(form.liveViewEnabled) && Boolean(form.playerResultReportingEnabled),
    licenseRequired: Boolean(form.licenseRequired),
    teamNameEnabled: Boolean(form.teamNameEnabled),
    waitlistEnabled: Boolean(form.waitlistEnabled),
    waitlistAutoPromote: form.waitlistAutoPromote === undefined ? true : Boolean(form.waitlistAutoPromote),
    registrationEnabled: form.registrationEnabled === undefined ? true : Boolean(form.registrationEnabled),
    approvalRequired: Boolean(form.approvalRequired),
    phoneRequired: Boolean(form.phoneRequired),
    websiteUrl: form.websiteUrl || null,
    logoUrl: form.logoUrl || null,
    flyerUrl: form.flyerUrl || null,
    whatsappGroupUrl: form.whatsappGroupUrl || null,
    paymentInfo: form.paymentInfo || null,
  };
}

export function registrationPayload(form, language) {
  return {
    ...(form.playerSelections && Object.keys(form.playerSelections).length ? { playerSelections: form.playerSelections } : {}),
    firstName: form.firstName,
    lastName: form.lastName,
    playerEmail: form.playerEmail || null,
    noEmail: Boolean(form.noEmail),
    club: form.club || null,
    licenseNr: form.licenseNr || null,
    partnerFirstName: form.partnerFirstName || null,
    partnerLastName: form.partnerLastName || null,
    partnerEmail: form.partnerEmail || null,
    partnerClub: form.partnerClub || null,
    partnerLicenseNr: form.partnerLicenseNr || null,
    partner2FirstName: form.partner2FirstName || null,
    partner2LastName: form.partner2LastName || null,
    partner2Email: form.partner2Email || null,
    partner2Club: form.partner2Club || null,
    partner2LicenseNr: form.partner2LicenseNr || null,
    phone: form.phone || '',
    teamName: form.teamName || null,
    seedingPosition: form.seedingPosition === '' ? null : Number(form.seedingPosition),
    status: form.status,
    isVip: Boolean(form.isVip),
    organizerMessage: form.organizerMessage || '',
    feeSelections: form.feeSelections || [],
    registrationAnswers: form.registrationAnswers || [],
    publicationNoticeAccepted: Boolean(form.publicationNoticeAccepted),
    personsConsentAccepted: Boolean(form.personsConsentAccepted),
    website: form.website || '',
    language,
  };
}

export function roleName(value) {
  const label = ROLES.find((role) => role.value === value)?.label;
  return label ? i18next.t(label) : value;
}

export function labelFor(options, value) {
  const label = options.find((option) => option.value === value)?.label;
  return label ? i18next.t(label) : value;
}

// Für <select>-Optionslisten aus einer Konstanten (TOURNAMENT_STATUSES,
// REGISTRATION_TYPES, ...): übersetzt jedes option.label. NUR für Listen mit
// festen, übersetzbaren Labels verwenden - niemals für Optionen mit
// Nutzerdaten (Turnier-/Personennamen), da diese sonst fälschlich als
// i18next-Key nachgeschlagen würden.
export function translatedOptions(options) {
  return options.map((option) => ({ ...option, label: i18next.t(option.label) }));
}

export function formationLabel(tournament) {
  if (tournament.formationOther) {
    return labelFor(FORMATIONS, 'andere');
  }
  return labelFor(FORMATIONS, tournament.formation);
}

export function isOwnTournament(tournament, user) {
  return Boolean(user) && (tournament.ownerId === user.id || (tournament.editors || []).some((editor) => editor.id === user.id));
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

export function clubMatchesTournament(club, tournament) {
  if (tournament?.latitude === null || tournament?.latitude === undefined || tournament?.longitude === null || tournament?.longitude === undefined) return false;
  return (club?.locations || []).some((location) => Number(location.latitude) === Number(tournament.latitude) && Number(location.longitude) === Number(tournament.longitude));
}

export function registrationNotYetOpen(tournament) {
  return Boolean(tournament.registrationOpeningPending) || (Boolean(tournament.registrationOpensAt) && new Date(tournament.registrationOpensAt).getTime() > Date.now());
}

export function registrationDeadlinePassed(tournament) {
  return Boolean(tournament.registrationDeadline) && new Date(tournament.registrationDeadline).getTime() < Date.now();
}

export function hasOpenRegistration(tournament) {
  if (tournament.status !== 'registration') {
    return false;
  }
  if (tournament.registrationClosed || registrationNotYetOpen(tournament)) {
    return false;
  }
  // Spätestens zum angesetzten Turnierbeginn schließt die Online-Anmeldung automatisch.
  if (tournament.startsAt && new Date(tournament.startsAt).getTime() <= Date.now()) {
    return false;
  }
  if (registrationDeadlinePassed(tournament)) {
    return false;
  }
  if (!tournament.maxRegistrations) {
    return true;
  }
  return tournament.activeRegistrations < tournament.maxRegistrations || Boolean(tournament.waitlistEnabled);
}

/** Aktive Anmeldungen oder Wartelistenplätze vorhanden – dann bleibt die Formation fest. */
export function hasRegistrations(tournament) {
  return Number(tournament?.activeRegistrations || 0) + Number(tournament?.waitlistRegistrations || 0) > 0;
}

/** Kalendereintrag = reiner Termin ohne Anmeldeverfahren; nie online durchführbar, kein Broadcast. */
export function isCalendarEntry(tournament) {
  return tournament.registrationEnabled === false;
}

export function hasOnlineRegistrationAvailable(tournament) {
  if (tournament.visibility !== 'public' || tournament.registrationEnabled === false) {
    return false;
  }
  return hasOpenRegistration(tournament);
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

/**
 * Anmeldezustand für das Status-Badge der Turnierkarte: calendar, running, closed (von Hand geschlossen), started
 * (Turnierbeginn erreicht), upcoming (Anmeldung öffnet erst), unavailable (Frist vorbei oder voll ohne Warteliste),
 * waitlist (voll, Anmeldung auf die Warteliste), open; sonst der Turnierstatus selbst.
 */
export function registrationStatusKind(tournament) {
  if (isCalendarEntry(tournament)) return 'calendar';
  if (tournament.status === 'running') return 'running';
  if (tournament.status !== 'registration') return tournament.status;
  if (tournament.registrationClosed) return 'closed';
  if (tournament.startsAt && new Date(tournament.startsAt).getTime() <= Date.now()) return 'started';
  if (registrationNotYetOpen(tournament)) return 'upcoming';
  if (registrationDeadlinePassed(tournament)) return 'unavailable';
  const isFull = Boolean(tournament.maxRegistrations) && tournament.activeRegistrations >= tournament.maxRegistrations;
  // Voll, aber mit Warteliste: Anmeldung geht weiter (wie hasOpenRegistration), auch wenn noch niemand wartet.
  if (isFull) return tournament.waitlistEnabled ? 'waitlist' : 'unavailable';
  return 'open';
}

const STATUS_BADGE_CLASSES = {
  calendar: 'status-calendar', running: 'status-running', closed: 'status-closed', started: 'status-closed',
  unavailable: 'status-closed', upcoming: 'status-upcoming', waitlist: 'status-waitlist', open: 'status-registration',
};

/** CSS-Klasse des Status-Badges: freie Plätze grün, Warteliste orange, keine Anmeldung mehr möglich rot. */
export function registrationStatusClass(tournament) {
  const kind = registrationStatusKind(tournament);
  return STATUS_BADGE_CLASSES[kind] || `status-${kind}`;
}

export function registrationStatusLabel(tournament, language) {
  const kind = registrationStatusKind(tournament);
  if (kind === 'calendar') return i18next.t('Kalendereintrag', { lng: language });
  if (kind === 'running') return i18next.t('Läuft', { lng: language });
  if (kind === 'closed') return i18next.t('Anmeldung geschlossen', { lng: language });
  if (kind === 'started') return i18next.t('Die Anmeldung ist mit Turnierbeginn geschlossen', { lng: language });
  if (kind === 'upcoming') {
    return `${i18next.t('Anmeldung ab', { lng: language })} ${formatTournamentDateTime(tournament.registrationOpensAt, language, tournament.timezone)}`;
  }
  if (kind === 'waitlist') return i18next.t('Anmeldung Warteliste möglich', { lng: language });
  if (kind !== 'open') return i18next.t('Anmeldung nicht mehr möglich', { lng: language });

  if (!tournament.maxRegistrations) {
    return (REGISTERED_COUNT_TEMPLATES[language] || REGISTERED_COUNT_TEMPLATES.de)(tournament.activeRegistrations || 0);
  }

  const free = tournament.maxRegistrations - tournament.activeRegistrations;
  return (SLOTS_FREE_TEMPLATES[language] || SLOTS_FREE_TEMPLATES.de)(free, tournament.maxRegistrations);
}

/** Grund zu „Anmeldung nicht mehr möglich“: Anmeldeschluss vorbei oder ausgebucht ohne Warteliste; sonst ''. */
export function registrationStatusReason(tournament, language) {
  if (registrationStatusKind(tournament) !== 'unavailable') return '';
  if (registrationDeadlinePassed(tournament)) {
    return i18next.t('Anmeldeschluss abgelaufen', { lng: language });
  }
  return i18next.t('ausgebucht', { lng: language });
}

export const API_KEY_STATUS_LABELS = {
  pending: 'Ausstehend',
  approved: 'Freigeschaltet',
  revoked: 'Widerrufen',
};

export function formatTournamentStartTime(tournament, language) {
  if (!tournament.startTime) return i18next.t('Ganztägig', { lng: language });
  const zone = tournament.timezone || 'UTC';
  const viewerZone = detectViewerTimeZone();
  if (!viewerZone || viewerZone === zone) return tournament.startTime;
  const anchor = new Date(`${tournament.date}T${tournament.startTime}:00Z`);
  return `${tournament.startTime} ${timezoneAbbrev(anchor, zone, DISPLAY_LOCALES[language] || DISPLAY_LOCALES.de)}`;
}

/** Ein Turnier ist ans Turnierdokument gebunden oder wurde bereits aus ihm gestartet; das Dokument ist dann Master. */
export function isDocumentBound(tournament) {
  return Boolean(tournament?.documentManaged || tournament?.desktopExecution);
}
