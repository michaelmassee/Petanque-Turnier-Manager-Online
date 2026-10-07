// Benutzername (@handle): eindeutiger, für Menschen lesbarer Schlüssel neben Vor- und Nachname.
// Gemeinsam genutzt von Worker, Frontend und scripts/backfill-usernames.mjs.
import { isOffensiveUsername } from './usernameBlocklist.js';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_CHANGE_INTERVAL_DAYS = 30;

// a-z, 0-9 und . _ -, beginnt mit Buchstabe/Ziffer, kein Trennzeichen am Ende oder doppelt.
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9]|[._-](?=[a-z0-9])){2,29}$/;

// Wortteile, die Offizielles vortäuschen könnten.
export const RESERVED_USERNAME_PARTS = new Set([
  'admin', 'administrator', 'moderator', 'mod', 'support', 'system', 'root', 'api', 'null', 'undefined',
  'ptm', 'ptmonline', 'official', 'offiziell', 'team', 'service', 'info', 'webmaster', 'postmaster', 'noreply',
]);

const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', æ: 'ae', ø: 'oe', œ: 'oe' };

export function normalizeUsername(value) {
  return String(value ?? '').trim().replace(/^@/, '').toLowerCase();
}

// Liefert '' für einen gültigen Namen, sonst 'invalid' | 'reserved' | 'offensive'.
export function usernameProblem(value) {
  const name = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(name)) return 'invalid';
  if (name.split(/[._-]/).some((part) => RESERVED_USERNAME_PARTS.has(part))) return 'reserved';
  if (isOffensiveUsername(name)) return 'offensive';
  return '';
}

function slugifyNamePart(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[äöüßæøœ]/g, (char) => UMLAUTS[char])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fitLength(value, reserve = 0) {
  return value.slice(0, USERNAME_MAX_LENGTH - reserve).replace(/[._-]+$/, '');
}

// Vorschläge in absteigender Präferenz: vorname.nachname, vorname.n, spieler.
// Unzulässige Vorschläge (z. B. anstößig oder reserviert) werden übersprungen.
export function usernameCandidates(firstName, lastName) {
  const first = slugifyNamePart(firstName);
  const last = slugifyNamePart(lastName);
  const candidates = [
    [first, last].filter(Boolean).join('.'),
    first && last ? `${first}.${last[0]}` : '',
    first,
  ].map((candidate) => fitLength(candidate)).filter((candidate) => candidate && !usernameProblem(candidate));
  return [...new Set([...candidates, 'spieler'])];
}

export function suggestUsername(firstName, lastName) {
  return usernameCandidates(firstName, lastName)[0];
}

// Hängt eine Zahl an und kürzt dafür notfalls den Namen: withUsernameSuffix('anna.schmidt', 2) → 'anna.schmidt2'.
export function withUsernameSuffix(base, number) {
  const suffix = String(number);
  return `${fitLength(base, suffix.length)}${suffix}`;
}

// Erster freier Name zu den Basisvorschlägen, bei Kollision mit angehängter Zahl (anna.schmidt2 …).
// taken: Set der vergebenen und gesperrten Namen. Liefert null, wenn nichts frei ist.
export function firstFreeUsername(bases, taken) {
  for (const base of bases) {
    if (!taken.has(base) && !usernameProblem(base)) return base;
    for (let number = 2; number < 10000; number += 1) {
      const candidate = withUsernameSuffix(base, number);
      if (!taken.has(candidate) && !usernameProblem(candidate)) return candidate;
    }
  }
  return null;
}
