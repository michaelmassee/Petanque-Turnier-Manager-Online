const FAVORITES_KEY_PREFIX = 'ptm_postbox_favorites_';
const RECENTS_KEY_PREFIX = 'ptm_postbox_recents_';
const MAX_RECENTS = 5;

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

export function loadFavoriteRecipientIds(userId) {
  if (!userId) return [];
  return readArray(FAVORITES_KEY_PREFIX + userId);
}

export function toggleFavoriteRecipientId(userId, id) {
  if (!userId) return [];
  const key = FAVORITES_KEY_PREFIX + userId;
  const current = readArray(key);
  const next = current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id];
  writeArray(key, next);
  return next;
}

export function loadRecentRecipientValues(userId) {
  if (!userId) return [];
  return readArray(RECENTS_KEY_PREFIX + userId);
}

export function pushRecentRecipientValue(userId, value) {
  if (!userId || !value) return [];
  const key = RECENTS_KEY_PREFIX + userId;
  const current = readArray(key);
  const next = [value, ...current.filter((existing) => existing !== value)].slice(0, MAX_RECENTS);
  writeArray(key, next);
  return next;
}
