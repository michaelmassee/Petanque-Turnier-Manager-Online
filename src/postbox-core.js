const PUSH_ENDPOINT_HOSTS = new Set([
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'updates-autopush.mozilla.org',
  'push.services.mozilla.com',
  'web.push.apple.com',
]);

export function isAllowedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (PUSH_ENDPOINT_HOSTS.has(host) || host.endsWith('.push.apple.com'));
  } catch {
    return false;
  }
}

export function unreadPostboxCount(row) {
  return Number(row?.count || 0);
}

// Postfach-Ereignis nach dem Check-in: die Live-Ansicht der Meldung ist verfügbar.
export const LIVE_VIEW_AVAILABLE_EVENT = 'live_view_available';

export function liveViewAvailableEventData(tournament, registration) {
  return { tournamentId: tournament.id, tournamentName: tournament.name, registrationId: registration.id };
}

// Ein Konto wurde automatisch über seine E-Mail mit einem Personen-Slot verknüpft (E-22). Die Live-Ansicht zeigt den
// Weg zu "Das bin ich nicht".
export const REGISTRATION_SLOT_LINKED_EVENT = 'registration_slot_linked';
// Ein Konto steht in mehreren aktiven Anmeldungen desselben Turniers (KP-06 b).
export const REGISTRATION_ACCOUNT_CONFLICT_EVENT = 'registration_account_conflict';
// Mitverwalter oder Admin hat eine folgenreiche Aktion am Turnier ausgelöst (T-22).
export const TOURNAMENT_ADMIN_ACTION_EVENT = 'tournament_admin_action';

// Nachrichten, deren Klick die Live-Ansicht der Meldung öffnet.
export const LIVE_VIEW_EVENTS = [LIVE_VIEW_AVAILABLE_EVENT, REGISTRATION_SLOT_LINKED_EVENT];

// Ziel beim Klick auf die Nachricht: die Live-Ansicht der eigenen Meldung (Bereich "Live", mit Login).
export function liveViewPathFor(eventData) {
  return eventData?.registrationId ? `/live/${encodeURIComponent(eventData.registrationId)}` : null;
}
