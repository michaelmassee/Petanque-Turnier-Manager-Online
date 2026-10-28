import { describe, expect, it } from 'vitest';
import { googleMapsCoordinates, googleMapsUrl } from './google-maps-location.js';

export const EXAMPLE_POINT = 'https://www.google.com/maps/place/50%C2%B030\'00.2%22N+8%C2%B025\'14.3%22E/@50.5003813,8.417934,574m/data=!3m1!1e3!4m5!3m4!4b1!8m2!3d50.5000636!4d8.4206376?entry=tts';

describe('Google-Maps-Punkt aus Links lesen', () => {
  it('liest den geteilten Punkt des Beispiels statt der abweichenden Kartenmitte', () => {
    expect(googleMapsCoordinates(EXAMPLE_POINT)).toEqual({ latitude: 50.5000636, longitude: 8.4206376 });
  });

  it.each([
    ['https://www.google.com/maps/search/?api=1&query=-33.86%2C151.21', -33.86, 151.21],
    ['https://maps.google.de/?q=0,0', 0, 0],
    ['https://google.fr/maps?q=-90,-180', -90, -180],
    ['https://www.google.nl/maps?q=90,180', 90, 180],
    ['https://www.google.es/maps?q=loc:50.5,8.4', 50.5, 8.4],
  ])('liest numerische Punkt-Parameter: %s', (url, latitude, longitude) => {
    expect(googleMapsCoordinates(url)).toEqual({ latitude, longitude });
  });

  it.each(['https://maps.app.goo.gl/WrGuVDaSh5nC47SK6', 'https://goo.gl/maps/abc123'])('erkennt Kurzlinks ohne deren Parameter als Punkt zu behandeln: %s', (url) => {
    expect(googleMapsCoordinates(`${url}?q=1,2`)).toBeNull();
  });

  it.each([
    'https://www.google.com/maps/@50,8,12z', 'https://maps.google.com/?ll=50,8',
    'https://www.google.com/maps/place/Linden', 'https://www.google.com/maps/dir/?q=50,8',
    'https://www.google.com/maps?q=50,8&query=51,9',
    'https://www.google.com/maps/data=!3d50!4d8!3d51!4d9',
    'https://www.google.com/maps?q=91,8', 'https://www.google.com/maps?q=50,-181',
  ])('importiert keinen uneindeutigen oder ungültigen Punkt: %s', (url) => {
    expect(() => googleMapsCoordinates(url)).toThrow();
  });

  it.each([
    'http://www.google.com/maps?q=50,8', 'https://evil.test/maps?q=50,8',
    'https://google.com.evil.test/maps?q=50,8', 'https://evil.google.com/maps?q=50,8',
    'https://user:pass@google.com/maps?q=50,8', 'https://www.google.com:444/maps?q=50,8',
    'https://www.google.com/url?q=https://evil.test', 'https://goo.gl/not-maps/test',
    'https://maps.app.goo.gl/', 'not-a-url', null,
  ])('akzeptiert ausschließlich erlaubte HTTPS-Maps-Adressen: %s', (url) => {
    expect(() => googleMapsUrl(url)).toThrow();
  });
});
