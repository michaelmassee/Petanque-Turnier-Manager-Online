const FAVORITES_KEY_PREFIX = 'ptm_tournament_club_favorites_';

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
    // Ignore unavailable browser storage, for example in private mode.
  }
}

export function loadFavoriteClubIds(userId) {
  return userId ? readArray(FAVORITES_KEY_PREFIX + userId) : [];
}

export function toggleFavoriteClubId(userId, clubId) {
  if (!userId) return [];
  const key = FAVORITES_KEY_PREFIX + userId;
  const current = readArray(key);
  const next = current.includes(clubId) ? current.filter((id) => id !== clubId) : [...current, clubId];
  writeArray(key, next);
  return next;
}
