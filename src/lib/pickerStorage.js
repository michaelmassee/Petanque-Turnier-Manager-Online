// Favoriten und zuletzt verwendete Einträge der Auswahl-Comboboxen, pro Nutzer und Bereich im localStorage.
// Bereiche: postbox (Empfänger, Schlüssel unverändert seit Einführung) und tournaments (Turnierauswahl bei
// Meldungen und „Turnier starten“, gemeinsam genutzt).
const KEY_PREFIXES = {
  postbox: { favorites: 'ptm_postbox_favorites_', recents: 'ptm_postbox_recents_' },
  tournaments: { favorites: 'ptm_tournament_favorites_', recents: 'ptm_tournament_recents_' },
};
const MAX_RECENTS = 5;

function storageKey(scope, kind, userId) {
  const prefixes = KEY_PREFIXES[scope];
  return prefixes && userId ? prefixes[kind] + userId : null;
}

function readArray(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // ignore (private mode, quota, etc.)
  }
}

export function loadFavorites(scope, userId) {
  const key = storageKey(scope, 'favorites', userId);
  return key ? readArray(key) : [];
}

export function toggleFavorite(scope, userId, id) {
  const key = storageKey(scope, 'favorites', userId);
  if (!key) return [];
  const current = readArray(key);
  const next = current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id];
  writeArray(key, next);
  return next;
}

export function loadRecents(scope, userId) {
  const key = storageKey(scope, 'recents', userId);
  return key ? readArray(key) : [];
}

export function pushRecent(scope, userId, value) {
  const key = storageKey(scope, 'recents', userId);
  if (!key || !value) return [];
  const next = [value, ...readArray(key).filter((existing) => existing !== value)].slice(0, MAX_RECENTS);
  writeArray(key, next);
  return next;
}
