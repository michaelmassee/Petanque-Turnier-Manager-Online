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

// Ziel beim Klick auf die Nachricht: die Live-Ansicht der eigenen Meldung (Bereich "Live", mit Login).
export function liveViewPathFor(eventData) {
  return eventData?.registrationId ? `/live/${encodeURIComponent(eventData.registrationId)}` : null;
}
