// Reine Logik der Turnieranmeldung (Spezifikation turnieranmeldung-ptmonline.md): Personen-Slots, Anmeldeeinheit,
// Doppelbelegung von Konten und mögliche Dubletten. Ohne Datenbankzugriff, damit Worker und Tests sie teilen.

// Personen-Slots 1–3 liegen in den Spalten Spieler, Partner, Partner 2 (Formationsstärke höchstens 3, E-20).
export const SLOT_COLUMNS = [
  { slot: 1, first: 'first_name', last: 'last_name', email: 'player_email', license: 'license_nr', userId: 'user_id' },
  { slot: 2, first: 'partner_first_name', last: 'partner_last_name', email: 'partner_email', license: 'partner_license_nr', userId: 'partner_user_id' },
  { slot: 3, first: 'partner2_first_name', last: 'partner2_last_name', email: 'partner2_email', license: 'partner2_license_nr', userId: 'partner2_user_id' },
];

// Aktive Anmeldungen belegen eine Person; eine stornierte nicht mehr (KP-06).
export const ACTIVE_REGISTRATION_STATUSES = ['pending', 'confirmed', 'waitlist'];

const text = (value) => String(value ?? '').trim();

// Vergleicht Namen unabhängig von Groß-/Kleinschreibung, Leerzeichen und Sonderzeichen
// (z. B. "Jean-Paul Müller" === "jean paul muller").
export function normalizePlayerName(firstName, lastName) {
  return `${firstName || ''}${lastName || ''}`
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Belegte Personen-Slots einer Anmeldungszeile. */
export function registrationSlots(row) {
  return SLOT_COLUMNS
    .filter(({ first, last }) => text(row[first]) || text(row[last]))
    .map(({ slot, first, last, email, license, userId }) => ({
      slot,
      firstName: row[first] || '',
      lastName: row[last] || '',
      email: row[email] || null,
      licenseNr: row[license] || null,
      userId: row[userId] || null,
    }));
}

/**
 * Anmeldeeinheit nach System und Anmeldeart (E-20): genau eine Person bei Supermêlée, Mêlée und Tête-à-tête, sonst
 * ein Team mit 2 Personen bis zur Formationsstärke. Ein Triplette-Team mit 2 Personen ist zulässig, aber unvollständig.
 */
export function registrationUnit(tournament) {
  const type = tournament.registration_type ?? tournament.registrationType;
  if (type === 'melee' || type === 'supermelee' || tournament.formation === 'tete') {
    return { kind: 'single', min: 1, max: 1 };
  }
  return { kind: 'team', min: 2, max: tournament.formation === 'triplette' ? 3 : 2 };
}

export function isIncompleteTeam(tournament, row) {
  const unit = registrationUnit(tournament);
  return unit.kind === 'team' && registrationSlots(row).length < unit.max;
}

/** Benutzer-IDs der Personen-Slots, ohne Wiederholung. */
export function registrationUserIds(row) {
  return [...new Set(SLOT_COLUMNS.map(({ userId }) => row[userId]).filter(Boolean))];
}

/**
 * Doppelbelegungen und mögliche Dubletten unter den aktiven Anmeldungen eines Turniers (KP-06).
 *  - accountConflicts: dieselbe Benutzer-ID in mehreren Anmeldungen (b, c) - echter Ausschlussgrund.
 *  - possibleDuplicates: gleicher normalisierter Name oder gleiche Slot-E-Mail ohne gemeinsame Benutzer-ID (b', c)
 *    - nur ein Hinweis ohne automatische Wirkung.
 * Das absendende Konto spielt keine Rolle; gezählt werden nur Personen in Slots (E-22).
 */
export function registrationConflicts(rows) {
  const active = rows.filter((row) => ACTIVE_REGISTRATION_STATUSES.includes(row.status));
  const byUser = new Map();
  const byName = new Map();
  const byEmail = new Map();
  const add = (map, key, id) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(id);
  };
  for (const row of active) {
    for (const slot of registrationSlots(row)) {
      add(byUser, slot.userId, row.id);
      add(byName, normalizePlayerName(slot.firstName, slot.lastName), row.id);
      add(byEmail, slot.email ? slot.email.toLowerCase() : null, row.id);
    }
  }
  const accountConflicts = [...byUser]
    .filter(([, ids]) => ids.size > 1)
    .map(([userId, ids]) => ({ userId, registrationIds: [...ids] }));
  const conflictPairs = new Set(accountConflicts.flatMap(({ registrationIds }) => pairKeys(registrationIds)));
  const possibleDuplicates = [];
  for (const [kind, map] of [['name', byName], ['email', byEmail]]) {
    for (const ids of map.values()) {
      if (ids.size < 2) continue;
      const registrationIds = [...ids];
      // Sicher über dasselbe Konto erkannt: Das ist bereits ein Konflikt, kein zusätzlicher Hinweis.
      if (pairKeys(registrationIds).every((key) => conflictPairs.has(key))) continue;
      possibleDuplicates.push({ kind, registrationIds });
    }
  }
  return { accountConflicts, possibleDuplicates };
}

function pairKeys(ids) {
  const sorted = [...ids].sort();
  const keys = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) keys.push(`${sorted[i]}|${sorted[j]}`);
  }
  return keys;
}

/** Kennzeichen pro Anmeldung für Verwaltung und Abgleich. */
export function registrationFlagsById(rows) {
  const { accountConflicts, possibleDuplicates } = registrationConflicts(rows);
  const flags = new Map();
  const entry = (id) => {
    if (!flags.has(id)) flags.set(id, { accountConflictWith: new Set(), possibleDuplicateWith: new Set() });
    return flags.get(id);
  };
  for (const { registrationIds } of accountConflicts) {
    for (const id of registrationIds) registrationIds.filter((other) => other !== id).forEach((other) => entry(id).accountConflictWith.add(other));
  }
  for (const { registrationIds } of possibleDuplicates) {
    for (const id of registrationIds) registrationIds.filter((other) => other !== id).forEach((other) => entry(id).possibleDuplicateWith.add(other));
  }
  return (id) => {
    const found = flags.get(id);
    return {
      accountConflictWith: found ? [...found.accountConflictWith] : [],
      possibleDuplicateWith: found ? [...found.possibleDuplicateWith] : [],
    };
  };
}

/**
 * Kontoverknüpfung eines Slots bei einer Änderung durch die Turnierleitung (E-11, KP-11, KP-20):
 *  - Bleibt die Person gleich (gleicher Name), bleibt eine bestehende Verknüpfung auch bei korrigierter E-Mail
 *    bestehen; ein Wechsel geht nur über "Konto neu zuordnen".
 *  - Wechselt die Person (anderer Name), entfällt die alte Verknüpfung; die neue entsteht über die Slot-E-Mail.
 *  - Ein unverknüpfter Slot wird über die Slot-E-Mail verknüpft (genau ein verifiziertes Konto).
 */
export function nextSlotUserId({ existing, next, resolvedUserId }) {
  if (!text(next.firstName) && !text(next.lastName)) return null;
  const samePerson = normalizePlayerName(existing.firstName, existing.lastName) === normalizePlayerName(next.firstName, next.lastName);
  if (existing.userId && samePerson) return existing.userId;
  return resolvedUserId || null;
}

/** Konten ohne Wiederholung: Ein Konto gehört zu genau einer Person, spätere Slots derselben Anmeldung bleiben leer. */
export function uniqueAccountLinks(ids) {
  const seen = new Set();
  return ids.map((id) => {
    if (!id || seen.has(id)) return null;
    seen.add(id);
    return id;
  });
}
