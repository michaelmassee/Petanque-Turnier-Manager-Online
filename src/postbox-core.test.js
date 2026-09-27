import { describe, expect, it } from 'vitest';
import { isAllowedPushEndpoint, liveViewAvailableEventData, liveViewPathFor, unreadPostboxCount } from './postbox-core.js';

describe('Postbox-Grundlogik', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/token',
    'https://updates.push.services.mozilla.com/wpush/v2/token',
    'https://updates-autopush.mozilla.org/wpush/v2/token',
    'https://push.services.mozilla.com/wpush/v2/token',
    'https://web.push.apple.com/QH/token',
    'https://web.push-1.push.apple.com/QH/token',
  ])('akzeptiert bekannte Web-Push-Endpunkte', (endpoint) => expect(isAllowedPushEndpoint(endpoint)).toBe(true));

  it.each(['http://fcm.googleapis.com/x', 'https://example.org/push', 'https://fcm.googleapis.com.evil.example/x', 'not-a-url'])('lehnt unsichere Push-Endpunkte ab', (endpoint) => expect(isAllowedPushEndpoint(endpoint)).toBe(false));

  it('verwendet den serverseitigen Gesamtzähler unabhängig von der Listenlänge', () => {
    expect(unreadPostboxCount({ count: 251 })).toBe(251);
  });
});

describe('Postfach-Nachricht zur Live-Ansicht', () => {
  it('führt zur Live-Ansicht der eigenen Meldung', () => {
    const eventData = liveViewAvailableEventData({ id: 't1', name: 'Herbstturnier' }, { id: 'reg 1' });

    expect(eventData).toEqual({ tournamentId: 't1', tournamentName: 'Herbstturnier', registrationId: 'reg 1' });
    expect(liveViewPathFor(eventData)).toBe('/live/reg%201');
  });

  it('ohne Meldung kein Ziel', () => {
    expect(liveViewPathFor({})).toBeNull();
    expect(liveViewPathFor(null)).toBeNull();
  });
});
