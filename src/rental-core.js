// Platz mieten: reine Logik (Eingaben prüfen, Verfügbarkeit je Stunde), ohne Datenbank. Gebucht werden volle
// Stunden innerhalb eines Tages; Datum/Stunde sind Ortszeit des Platzes, Wochentag 0 = Sonntag (Date#getUTCDay).
import { CURRENCY_CODES } from './currencies.js';
import { HttpError } from './errors.js';
import { richTextPlainText } from './lib/rich-text.js';

export const RENTAL_STATUSES = ['requested', 'confirmed', 'rejected', 'cancelled'];
export const RENTAL_ACTIVE_STATUSES = ['requested', 'confirmed'];
export const RENTAL_MAX_LANES = 200;
export const RENTAL_MAX_PERSONS = 500;
export const RENTAL_MAX_HORIZON_DAYS = 365;
export const RENTAL_AVAILABILITY_DAYS = 7;
export const RENTAL_MAX_BLOCKS = 50;
// Vermietungsart: einzelne Bahnen, nur komplett (ganze Halle bzw. ganzer Platz = alle Bahnen des Angebots) oder beides.
export const RENTAL_MODES = ['lanes', 'whole', 'both'];
const TEXT_LIMITS = { title: 120, description: 2000, priceNote: 120, wholePriceNote: 120, note: 500, blockLabel: 60 };
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function text(value, field, { required = false } = {}) {
  const result = String(value ?? '').trim();
  if (required && !result) throw new HttpError(400, 'Pflichtfeld fehlt', { field });
  if (result.length > TEXT_LIMITS[field]) throw new HttpError(400, 'Text zu lang', { field });
  return result || null;
}

// Beschreibung ist Rich Text wie bei Turnieren und Plätzen; das Limit zählt nur den sichtbaren Text.
function description(value) {
  const result = String(value ?? '').trim();
  if (richTextPlainText(result).length > TEXT_LIMITS.description) throw new HttpError(400, 'Text zu lang', { field: 'description' });
  return result || null;
}

function integer(value, field, min, max) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new HttpError(400, 'Ungültiger Wert', { field });
  return result;
}

// Leer = Preis auf Anfrage.
function price(value, field) {
  return value === null || value === undefined || value === '' ? null : integer(value, field, 0, 100000000);
}

/** Mindestens so viele Bahnen müssen in einer Stunde frei sein, damit sie für das Angebot buchbar ist. */
export function rentalMinLanes(offer) {
  return offer.rentalMode === 'whole' ? offer.laneCount : 1;
}

export function isValidLocalDate(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function weekdayOf(localDate) {
  return new Date(`${localDate}T00:00:00Z`).getUTCDay();
}

export function addDays(localDate, days) {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
}

export function normalizeOpeningHours(value) {
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = entries.map((entry) => {
    const weekday = integer(entry?.weekday, 'openingHours', 0, 6);
    const openHour = integer(entry?.openHour, 'openingHours', 0, 23);
    const closeHour = integer(entry?.closeHour, 'openingHours', 1, 24);
    if (closeHour <= openHour || seen.has(weekday)) throw new HttpError(400, 'Ungültige Öffnungszeiten', { field: 'openingHours' });
    seen.add(weekday);
    return { weekday, openHour, closeHour };
  });
  if (!result.length) throw new HttpError(400, 'Mindestens ein Öffnungstag ist erforderlich', { field: 'openingHours' });
  return result.sort((left, right) => left.weekday - right.weekday);
}

function localDate(value, field) {
  const result = String(value ?? '').trim();
  if (!result) return null;
  if (!isValidLocalDate(result)) throw new HttpError(400, 'Ungültiges Datum', { field });
  return result;
}

/**
 * Regelmäßige Belegungen (z. B. wöchentliches Vereinstraining): an einem Wochentag von–bis lanes Bahnen
 * (null = alle des Angebots) nicht mietbar, optional nur von validFrom bis validTo. Leere Liste ist erlaubt.
 */
export function normalizeRentalBlocks(value, laneCount) {
  const entries = Array.isArray(value) ? value : [];
  if (entries.length > RENTAL_MAX_BLOCKS) throw new HttpError(400, 'Zu viele regelmäßige Belegungen', { field: 'blocks' });
  return entries.map((entry) => {
    const weekday = integer(entry?.weekday, 'blocks', 0, 6);
    const startHour = integer(entry?.startHour, 'blocks', 0, 23);
    const endHour = integer(entry?.endHour, 'blocks', 1, 24);
    if (endHour <= startHour) throw new HttpError(400, 'Ungültige regelmäßige Belegung', { field: 'blocks' });
    const lanes = entry?.lanes === null || entry?.lanes === undefined || entry?.lanes === '' ? null : integer(entry.lanes, 'blocks', 1, laneCount);
    const validFrom = localDate(entry?.validFrom, 'blocks');
    const validTo = localDate(entry?.validTo, 'blocks');
    if (validFrom && validTo && validTo < validFrom) throw new HttpError(400, 'Ungültige regelmäßige Belegung', { field: 'blocks' });
    return { weekday, startHour, endHour, lanes, label: text(entry?.label, 'blockLabel'), validFrom, validTo };
  }).sort((left, right) => left.weekday - right.weekday || left.startHour - right.startHour);
}

/**
 * Regelmäßige Belegungen ({ offerId, weekday, startHour, endHour, lanes, label, validFrom, validTo }) als bestätigte
 * Pseudo-Reservierungen je Tag ab from für days Tage; lanes null = laneCountByOffer.get(offerId).
 */
export function expandRentalBlocks(blocks, from, days, laneCountByOffer) {
  const result = [];
  for (let index = 0; index < days; index += 1) {
    const date = addDays(from, index);
    const weekday = weekdayOf(date);
    for (const block of blocks) {
      if (block.weekday !== weekday || (block.validFrom && date < block.validFrom) || (block.validTo && date > block.validTo)) continue;
      result.push({
        offerId: block.offerId, localDate: date, startHour: block.startHour, hours: block.endHour - block.startHour,
        lanes: block.lanes ?? laneCountByOffer.get(block.offerId) ?? 0, status: 'confirmed', label: block.label || null,
      });
    }
  }
  return result;
}

export function normalizeOfferInput(body) {
  const currency = String(body?.currency || 'EUR').trim().toUpperCase();
  if (!CURRENCY_CODES.includes(currency)) throw new HttpError(400, 'Ungültige Währung', { field: 'currency' });
  const rentalMode = body?.rentalMode ?? 'lanes';
  if (!RENTAL_MODES.includes(rentalMode)) throw new HttpError(400, 'Ungültige Vermietungsart', { field: 'rentalMode' });
  const minHours = integer(body?.minHours ?? 1, 'minHours', 1, 24);
  const maxHours = integer(body?.maxHours ?? 4, 'maxHours', 1, 24);
  if (maxHours < minHours) throw new HttpError(400, 'Höchstdauer ist kleiner als die Mindestdauer', { field: 'maxHours' });
  const laneCount = integer(body?.laneCount, 'laneCount', 1, RENTAL_MAX_LANES);
  return {
    placeId: String(body?.placeId || '').trim(),
    title: text(body?.title, 'title', { required: true }),
    description: description(body?.description),
    laneCount,
    rentalMode,
    priceMinor: price(body?.priceMinor, 'priceMinor'),
    currency,
    priceNote: text(body?.priceNote, 'priceNote'),
    wholePriceMinor: price(body?.wholePriceMinor, 'wholePriceMinor'),
    wholePriceNote: text(body?.wholePriceNote, 'wholePriceNote'),
    minHours,
    maxHours,
    bookingHorizonDays: integer(body?.bookingHorizonDays ?? 60, 'bookingHorizonDays', 1, RENTAL_MAX_HORIZON_DAYS),
    status: body?.status === 'inactive' ? 'inactive' : 'active',
    openingHours: normalizeOpeningHours(body?.openingHours),
    blocks: normalizeRentalBlocks(body?.blocks, laneCount),
  };
}

/**
 * Prüft eine Reservierungsanfrage gegen Angebot und Öffnungszeiten. now = { date, hour } in Ortszeit des Platzes;
 * eine Stunde, die schon begonnen hat, ist nicht mehr buchbar.
 */
export function validateReservationRequest({ offer, openingHours, body, now }) {
  const date = String(body?.date || '');
  if (!isValidLocalDate(date)) throw new HttpError(400, 'Ungültiges Datum', { field: 'date' });
  const startHour = integer(body?.startHour, 'startHour', 0, 23);
  const hours = integer(body?.hours, 'hours', 1, 24);
  // Eine Komplettbuchung belegt immer alle Bahnen des Angebots.
  const whole = body?.whole === true;
  if (whole && offer.rentalMode === 'lanes') throw new HttpError(400, 'Dieses Angebot vermietet nur einzelne Bahnen', { field: 'whole' });
  if (!whole && offer.rentalMode === 'whole') throw new HttpError(400, 'Dieses Angebot wird nur komplett vermietet', { field: 'whole' });
  const lanes = whole ? offer.laneCount : integer(body?.lanes, 'lanes', 1, RENTAL_MAX_LANES);
  if (hours < offer.minHours || hours > offer.maxHours) throw new HttpError(400, 'Die Dauer liegt außerhalb der erlaubten Spanne', { field: 'hours' });
  if (lanes > offer.laneCount) throw new HttpError(400, 'So viele Bahnen gibt es nicht', { field: 'lanes' });
  const persons = integer(body?.persons, 'persons', 1, RENTAL_MAX_PERSONS);
  const opening = openingHours.find((entry) => entry.weekday === weekdayOf(date));
  if (!opening || startHour < opening.openHour || startHour + hours > opening.closeHour) {
    throw new HttpError(400, 'Der Zeitraum liegt außerhalb der Öffnungszeiten', { field: 'startHour' });
  }
  if (date < now.date || (date === now.date && startHour <= now.hour)) {
    throw new HttpError(400, 'Der Zeitraum liegt in der Vergangenheit', { field: 'startHour' });
  }
  if (daysBetween(now.date, date) > offer.bookingHorizonDays) {
    throw new HttpError(400, 'So weit im Voraus kann noch nicht reserviert werden', { field: 'date' });
  }
  return { date, startHour, hours, lanes, whole, persons, note: text(body?.note, 'note') };
}

/**
 * Belegte Bahnen je Datum und Stunde aus aktiven Reservierungen ({ localDate, startHour, hours, lanes, status }).
 * Mit status zählen nur Reservierungen in diesem Status (z. B. nur offene Anfragen).
 */
export function occupiedLanes(reservations, status = null) {
  const occupied = new Map();
  for (const reservation of reservations) {
    if (status && reservation.status !== status) continue;
    for (let hour = reservation.startHour; hour < reservation.startHour + reservation.hours; hour += 1) {
      const key = `${reservation.localDate}|${hour}`;
      occupied.set(key, (occupied.get(key) || 0) + reservation.lanes);
    }
  }
  return occupied;
}

/**
 * Verfügbarkeit ab from für days Tage: je Tag die Stunden innerhalb der Öffnungszeiten mit freien Bahnen.
 * Vergangene Stunden und Tage jenseits des Buchungshorizonts sind als nicht buchbar markiert.
 * blocks: regelmäßige Belegungen aller Angebote des Spielorts (mit offerId und laneCount des Angebots); sie zählen
 * wie bestätigte Reservierungen, blocked/blockLabels je Stunde betreffen nur Belegungen dieses Angebots.
 */
export function buildAvailability({ offer, openingHours, from, days = RENTAL_AVAILABILITY_DAYS, reservations, blocks = [], venueLaneCount = offer.laneCount, now }) {
  const laneCountByOffer = new Map([[offer.id, offer.laneCount], ...blocks.map((block) => [block.offerId, block.laneCount ?? offer.laneCount])]);
  const blockReservations = expandRentalBlocks(blocks.map((block) => ({ offerId: offer.id, ...block })), from, days, laneCountByOffer);
  const ownBlocks = blockReservations.filter((block) => block.offerId === offer.id);
  const blocked = occupiedLanes(ownBlocks);
  reservations = [...reservations, ...blockReservations];
  const offerReservations = reservations.filter((reservation) => !reservation.offerId || reservation.offerId === offer.id);
  const occupied = occupiedLanes(offerReservations);
  const venueOccupied = occupiedLanes(reservations);
  const confirmed = occupiedLanes(offerReservations.filter((reservation) => reservation.status !== 'requested'));
  const venueConfirmed = occupiedLanes(reservations.filter((reservation) => reservation.status !== 'requested'));
  const byWeekday = new Map(openingHours.map((entry) => [entry.weekday, entry]));
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(from, index);
    const opening = byWeekday.get(weekdayOf(date));
    const beyondHorizon = daysBetween(now.date, date) > offer.bookingHorizonDays;
    const slots = [];
    for (let hour = opening?.openHour ?? 0; opening && hour < opening.closeHour; hour += 1) {
      const past = date < now.date || (date === now.date && hour <= now.hour);
      const key = `${date}|${hour}`;
      const free = Math.max(0, Math.min(offer.laneCount - (occupied.get(key) || 0), venueLaneCount - (venueOccupied.get(key) || 0)));
      // Nur der zusätzliche Kapazitätsverbrauch durch Anfragen zählt als angefragt.
      // Fremde Anfragen in freien Spielortbahnen ändern bestätigte Angebotsbelegung nicht.
      const freeWithoutRequests = Math.max(0, Math.min(offer.laneCount - (confirmed.get(key) || 0), venueLaneCount - (venueConfirmed.get(key) || 0)));
      const requested = Math.max(0, freeWithoutRequests - free);
      // Nur Stunden mit eigener Belegung tragen blocked/blockLabels, das hält das Wochenraster klein.
      const blockedLanes = blocked.get(key) || 0;
      const blockLabels = blockedLanes ? [...new Set(ownBlocks.filter((block) => block.localDate === date && block.label
        && hour >= block.startHour && hour < block.startHour + block.hours).map((block) => block.label))] : [];
      slots.push({ hour, free, requested, ...(blockedLanes ? { blocked: blockedLanes, blockLabels } : {}), bookable: !past && !beyondHorizon });
    }
    return { date, weekday: weekdayOf(date), slots };
  });
}

/**
 * Würden die Belegungen blocks des Angebots offerId bestehende aktive Reservierungen am Spielort ({ offerId, localDate,
 * startHour, hours, lanes }) überbuchen? otherBlocks: Belegungen der übrigen Angebote am Spielort (mit offerId, laneCount).
 * Geprüft werden nur Stunden mit eigener Belegung und Reservierung, damit Altlasten das Speichern nicht blockieren.
 */
export function rentalBlocksConflict({ offerId, laneCount, blocks, otherBlocks = [], reservations, venueLaneCount = laneCount }) {
  const dates = [...new Set(reservations.map((reservation) => reservation.localDate))];
  const laneCountByOffer = new Map([...otherBlocks.map((block) => [block.offerId, block.laneCount]), [offerId, laneCount]]);
  const expand = (list) => dates.flatMap((date) => expandRentalBlocks(list, date, 1, laneCountByOffer));
  const ownBlocks = expand(blocks.map((block) => ({ ...block, offerId })));
  const reserved = occupiedLanes(reservations);
  const offerOccupied = occupiedLanes([...reservations.filter((reservation) => reservation.offerId === offerId), ...ownBlocks]);
  const venueOccupied = occupiedLanes([...reservations, ...ownBlocks, ...expand(otherBlocks)]);
  return [...occupiedLanes(ownBlocks).keys()].some((key) => reserved.has(key)
    && ((offerOccupied.get(key) || 0) > laneCount || (venueOccupied.get(key) || 0) > venueLaneCount));
}

/**
 * Tagesstatus für den Monatskalender aus einem Tag von buildAvailability: closed (nicht geöffnet), unavailable
 * (nichts mehr buchbar: vorbei oder jenseits des Horizonts), full (keine Stunde mit minLanes freien
 * Bahnen, bei Nur-komplett-Angeboten = alle Bahnen), free (alle buchbaren Stunden komplett frei), partial.
 */
export function dayAvailabilityStatus(day, laneCount, minLanes = 1) {
  if (!day.slots.length) return 'closed';
  const bookable = day.slots.filter((slot) => slot.bookable);
  if (!bookable.length) return 'unavailable';
  if (bookable.every((slot) => slot.free < minLanes)) return 'full';
  return bookable.every((slot) => slot.free >= laneCount) ? 'free' : 'partial';
}

/** Erster Tag und Länge eines Monats (YYYY-MM); null bei ungültiger Angabe. */
export function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) return null;
  const from = `${month}-01`;
  const [year, monthNumber] = month.split('-').map(Number);
  return { from, days: new Date(Date.UTC(year, monthNumber, 0)).getUTCDate() };
}

const SLOT_DATE_FORMATS = {
  de: ([year, month, day]) => `${day}.${month}.${year}`,
  nl: ([year, month, day]) => `${day}-${month}-${year}`,
  en: ([year, month, day]) => `${year}-${month}-${day}`,
  es: ([year, month, day]) => `${day}/${month}/${year}`,
  fr: ([year, month, day]) => `${day}/${month}/${year}`,
  it: ([year, month, day]) => `${day}/${month}/${year}`,
};

const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

/** Zeitraum für Push- und Mailtexte, ohne Intl (spart im Worker die ICU-Ladezeit), z. B. „24.10.2026 14:00–16:00“. */
export function formatRentalSlot({ date, startHour, hours }, language = 'de') {
  const format = SLOT_DATE_FORMATS[language] || SLOT_DATE_FORMATS.de;
  return `${format(String(date).split('-'))} ${hourLabel(startHour)}–${hourLabel(startHour + hours)}`;
}
