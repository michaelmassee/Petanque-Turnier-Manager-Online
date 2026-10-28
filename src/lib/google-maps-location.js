import { HttpError } from '../errors.js';

const MAP_HOSTS = new Set(['com', 'de', 'nl', 'fr', 'es'].flatMap((suffix) => [
  `google.${suffix}`, `www.google.${suffix}`, `maps.google.${suffix}`,
]));
const DECIMAL = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';

export function googleMapsUrl(value) {
  let url;
  try {
    if (typeof value !== 'string' || value.length > 8192) throw new Error();
    url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error();
    const validPath = url.hostname === 'maps.app.goo.gl'
      ? /^\/[\w-]+\/?$/.test(url.pathname)
      : url.hostname === 'goo.gl'
        ? /^\/maps\/[\w-]+\/?$/.test(url.pathname)
        : MAP_HOSTS.has(url.hostname) && (url.hostname.startsWith('maps.') || /^\/maps(?:\/|$)/.test(url.pathname));
    if (!validPath) throw new Error();
  } catch {
    throw new HttpError(400, 'Bitte einen gültigen Google-Maps-Link eingeben.');
  }
  return url;
}

export function isGoogleMapsShortUrl(url) {
  return url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl';
}

export function googleMapsCoordinates(value) {
  const url = googleMapsUrl(value);
  if (isGoogleMapsShortUrl(url)) return null;
  let path;
  try { path = decodeURIComponent(url.pathname); }
  catch { throw new HttpError(400, 'Bitte einen gültigen Google-Maps-Link eingeben.'); }
  if (/\/maps\/dir(?:\/|$)/.test(path)) {
    throw new HttpError(400, 'Bitte einen einzelnen Punkt in Google Maps markieren und dessen Link teilen.');
  }
  const pointPattern = new RegExp(`!3d(${DECIMAL})!4d(${DECIMAL})(?=!|/|$)`, 'g');
  let pairs = [...path.matchAll(pointPattern)].map((match) => [Number(match[1]), Number(match[2])]);
  if (!pairs.length) {
    const queryPattern = new RegExp(`^(?:loc:)?\\s*(${DECIMAL})\\s*,\\s*(${DECIMAL})\\s*$`, 'i');
    pairs = ['q', 'query'].flatMap((key) => url.searchParams.getAll(key)).flatMap((query) => {
      const match = query.trim().match(queryPattern);
      return match ? [[Number(match[1]), Number(match[2])]] : [];
    });
  }
  if (!pairs.length || new Set(pairs.map((pair) => pair.join(','))).size !== 1) {
    throw new HttpError(400, 'Bitte einen einzelnen Punkt in Google Maps markieren und dessen Link teilen.');
  }
  const [latitude, longitude] = pairs[0];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new HttpError(400, 'Ungültige Koordinate');
  }
  return { latitude, longitude };
}
