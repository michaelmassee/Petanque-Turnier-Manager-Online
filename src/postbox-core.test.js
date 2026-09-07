import { describe, expect, it } from 'vitest';
import { isAllowedPushEndpoint, unreadPostboxCount } from './postbox-core.js';

describe('Postbox-Grundlogik', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/token',
    'https://updates.push.services.mozilla.com/wpush/v2/token',
    'https://updates-autopush.mozilla.org/wpush/v2/token',
    'https://web.push.apple.com/QH/token',
  ])('akzeptiert bekannte Web-Push-Endpunkte', (endpoint) => expect(isAllowedPushEndpoint(endpoint)).toBe(true));

  it.each(['http://fcm.googleapis.com/x', 'https://example.org/push', 'https://fcm.googleapis.com.evil.example/x', 'not-a-url'])('lehnt unsichere Push-Endpunkte ab', (endpoint) => expect(isAllowedPushEndpoint(endpoint)).toBe(false));

  it('verwendet den serverseitigen Gesamtzähler unabhängig von der Listenlänge', () => {
    expect(unreadPostboxCount({ count: 251 })).toBe(251);
  });
});
