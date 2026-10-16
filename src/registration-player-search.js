import { HttpError } from './errors.js';

const encoder = new TextEncoder();
const SLOTS = ['primary', 'partner', 'partner2'];
const fields = (slot) => slot === 'primary'
  ? ['firstName', 'lastName', 'playerEmail', 'club', 'licenseNr']
  : [`${slot}FirstName`, `${slot}LastName`, `${slot}Email`, `${slot}Club`, `${slot}LicenseNr`];

async function signingKey(env) {
  if (!env.TURNSTILE_SECRET_KEY) throw new HttpError(503, 'Die Spielersuche ist derzeit nicht verfügbar.');
  return crypto.subtle.importKey('raw', encoder.encode(`registration-player-selection:v1:${env.TURNSTILE_SECRET_KEY}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function playerSelectionProof(env, actorId, tournamentId, targetId, purpose = 'details') {
  const payload = btoa(JSON.stringify({ actorId, tournamentId, targetId, purpose, expires: Date.now() + 300_000 }));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(payload));
  return `${payload}.${Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function verifyPlayerSelectionProof(env, proof, actorId, tournamentId, targetId, purpose = 'details') {
  try {
    if (typeof proof !== 'string' || proof.length > 4096) throw new Error();
    const [payload, signature, extra] = proof.split('.');
    if (extra || !/^[a-f0-9]{64}$/.test(signature)) throw new Error();
    const bytes = Uint8Array.from(signature.match(/../g), (pair) => parseInt(pair, 16));
    if (!await crypto.subtle.verify('HMAC', await signingKey(env), bytes, encoder.encode(payload))) throw new Error();
    const data = JSON.parse(atob(payload));
    if (data.actorId !== actorId || data.tournamentId !== tournamentId || data.targetId !== targetId
      || data.purpose !== purpose || data.expires <= Date.now() || data.expires > Date.now() + 300_000) throw new Error();
  } catch {
    throw new HttpError(400, 'Die Spielerauswahl ist ungültig oder abgelaufen. Bitte erneut auswählen.');
  }
}

export function assertPlayerSearchUser(user) {
  if (!user?.id || !user.emailVerifiedAt) throw new HttpError(403, 'Für die Spielersuche ist ein verifiziertes Benutzerkonto erforderlich.');
}

export async function limitPlayerSearch(env, request, user, details) {
  assertPlayerSearchUser(user);
  const accountLimit = details ? env.PLAYER_DETAILS_ACCOUNT_LIMIT : env.PLAYER_SEARCH_ACCOUNT_LIMIT;
  const ipLimit = details ? env.PLAYER_DETAILS_IP_LIMIT : env.PLAYER_SEARCH_IP_LIMIT;
  if (!accountLimit || !ipLimit) throw new HttpError(503, 'Die Spielersuche ist derzeit nicht verfügbar.');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  // Both counters advance even when one limit has already been reached. No D1 counters.
  const results = await Promise.all([accountLimit.limit({ key: user.id }), ipLimit.limit({ key: ip })]);
  if (results.some((result) => !result.success)) throw new HttpError(429, 'Zu viele Spielersuchen. Bitte warte eine Minute und versuche es erneut.');
}

export async function searchRegistrationPlayers(env, actorId, tournamentId, rawQuery) {
  const query = String(rawQuery || '').trim().toLowerCase();
  if (query.length < 3 || query.length > 100 || (query.includes('@') && !query.startsWith('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query))) {
    throw new HttpError(400, 'Bitte mindestens drei Zeichen oder eine vollständige E-Mail-Adresse eingeben.');
  }
  const email = query.includes('@') && !query.startsWith('@');
  const escaped = query.replace(/^@/, '').replace(/[\\%_]/g, '\\$&');
  const condition = email ? 'lower(email) = ?' : `(lower(first_name || ' ' || last_name) LIKE ? ESCAPE '\\'
    OR lower(username) LIKE ? ESCAPE '\\' OR lower(club) LIKE ? ESCAPE '\\')`;
  const values = email ? [query] : Array(3).fill(`%${escaped}%`);
  const rows = await env.DB.prepare(`SELECT id, first_name, last_name, username, club FROM users
    WHERE role = 'user' AND id != 'system-tournament-reports' AND email_verified_at IS NOT NULL AND ${condition}
    ORDER BY first_name COLLATE NOCASE, last_name COLLATE NOCASE, id LIMIT 20`).bind(...values).all();
  return { players: await Promise.all((rows.results || []).map(async (row) => ({
    id: row.id, firstName: row.first_name, lastName: row.last_name, username: row.username, club: row.club,
    proof: await playerSelectionProof(env, actorId, tournamentId, row.id),
  }))) };
}

async function selectedPlayer(env, id) {
  const player = await env.DB.prepare(`SELECT id, first_name, last_name, email, club, license_nr FROM users
    WHERE id = ? AND id != 'system-tournament-reports' AND role = 'user' AND email_verified_at IS NOT NULL`).bind(id).first();
  if (!player) throw new HttpError(400, 'Der ausgewählte Spieler ist nicht mehr verfügbar. Bitte erneut auswählen.');
  return player;
}

export async function registrationPlayerDetails(env, actorId, tournamentId, body) {
  await verifyPlayerSelectionProof(env, body.proof, actorId, tournamentId, body.userId);
  const player = await selectedPlayer(env, body.userId);
  return { player: {
    id: player.id, firstName: player.first_name, lastName: player.last_name,
    email: player.email, club: player.club, licenseNr: player.license_nr,
    proof: await playerSelectionProof(env, actorId, tournamentId, player.id, 'save'),
  } };
}

// Explicit identities take precedence over legacy email matching, including equal-name account changes.
export async function resolveSelectedRegistrationPlayers(env, body, user, tournamentId) {
  if (body.playerSelections === undefined) return {};
  assertPlayerSearchUser(user);
  const selections = body.playerSelections;
  if (!selections || typeof selections !== 'object' || Array.isArray(selections)
    || Object.keys(selections).some((slot) => !SLOTS.includes(slot))) {
    throw new HttpError(400, 'Die Spielerauswahl ist ungültig oder abgelaufen. Bitte erneut auswählen.');
  }
  const links = {};
  const seen = new Set();
  for (const slot of SLOTS) {
    const selection = selections[slot];
    if (!selection) continue;
    if (!selection.userId || seen.has(selection.userId)) throw new HttpError(400, 'Ein Spieler kann pro Team nur einmal ausgewählt werden.');
    seen.add(selection.userId);
    await verifyPlayerSelectionProof(env, selection.proof, user.id, tournamentId, selection.userId, 'save');
    const player = await selectedPlayer(env, selection.userId);
    const [first, last, email, club, license] = fields(slot);
    if (body[first] !== player.first_name || body[last] !== player.last_name) {
      throw new HttpError(400, 'Die Spielerauswahl ist ungültig oder abgelaufen. Bitte erneut auswählen.');
    }
    Object.assign(body, { [first]: player.first_name, [last]: player.last_name, [email]: player.email, [club]: player.club,
      [license]: player.license_nr || body[license] || null });
    if (slot === 'primary') body.noEmail = false;
    links[slot === 'primary' ? 'userId' : `${slot}UserId`] = player.id;
  }
  return links;
}
