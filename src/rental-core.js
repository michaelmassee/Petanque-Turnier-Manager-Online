// Platz mieten: reine Logik (Eingaben prüfen, Verfügbarkeit je Stunde), ohne Datenbank. Gebucht werden volle
// Stunden innerhalb eines Tages; Datum/Stunde sind Ortszeit des Platzes, Wochentag 0 = Sonntag (Date#getUTCDay).
import { CURRENCY_CODES } from './currencies.js';
import { HttpError } from './errors.js';

export const RENTAL_STATUSES = ['requested', 'confirmed', 'rejected', 'cancelled'];
export const RENTAL_ACTIVE_STATUSES = ['requested', 'confirmed'];
export const RENTAL_MAX_LANES = 200;
export const RENTAL_MAX_HORIZON_DAYS = 365;
export const RENTAL_AVAILABILITY_DAYS = 7;
const TEXT_LIMITS = { title: 120, description: 2000, priceNote: 120, note: 500 };
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function text(value, field, { required = false } = {}) {
  const result = String(value ?? '').trim();
  if (required && !result) throw new HttpError(400, 'Pflichtfeld fehlt', { field });
  if (result.length > TEXT_LIMITS[field]) throw new HttpError(400, 'Text zu lang', { field });
  return result || null;
}

function integer(value, field, min, max) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new HttpError(400, 'Ungültiger Wert', { field });
  return result;
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

export function normalizeOfferInput(body) {
  const currency = String(body?.currency || 'EUR').trim().toUpperCase();
  if (!CURRENCY_CODES.includes(currency)) throw new HttpError(400, 'Ungültige Währung', { field: 'currency' });
  const priceMinor = body?.priceMinor === null || body?.priceMinor === undefined || body?.priceMinor === ''
    ? null : integer(body.priceMinor, 'priceMinor', 0, 100000000);
  const minHours = integer(body?.minHours ?? 1, 'minHours', 1, 24);
  const maxHours = integer(body?.maxHours ?? 4, 'maxHours', 1, 24);
  if (maxHours < minHours) throw new HttpError(400, 'Höchstdauer ist kleiner als die Mindestdauer', { field: 'maxHours' });
  return {
    placeId: String(body?.placeId || '').trim(),
    title: text(body?.title, 'title', { required: true }),
    description: text(body?.description, 'description'),
    laneCount: integer(body?.laneCount, 'laneCount', 1, RENTAL_MAX_LANES),
    priceMinor,
    currency,
    priceNote: text(body?.priceNote, 'priceNote'),
    minHours,
    maxHours,
    bookingHorizonDays: integer(body?.bookingHorizonDays ?? 60, 'bookingHorizonDays', 1, RENTAL_MAX_HORIZON_DAYS),
    status: body?.status === 'inactive' ? 'inactive' : 'active',
    openingHours: normalizeOpeningHours(body?.openingHours),
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
  const lanes = integer(body?.lanes, 'lanes', 1, RENTAL_MAX_LANES);
  if (hours < offer.minHours || hours > offer.maxHours) throw new HttpError(400, 'Die Dauer liegt außerhalb der erlaubten Spanne', { field: 'hours' });
  if (lanes > offer.laneCount) throw new HttpError(400, 'So viele Bahnen gibt es nicht', { field: 'lanes' });
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
  return { date, startHour, hours, lanes, note: text(body?.note, 'note') };
}

/** Belegte Bahnen je Datum und Stunde aus aktiven Reservierungen ({ localDate, startHour, hours, lanes }). */
export function occupiedLanes(reservations) {
  const occupied = new Map();
  for (const reservation of reservations) {
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
 */
export function buildAvailability({ offer, openingHours, from, days = RENTAL_AVAILABILITY_DAYS, reservations, now }) {
  const occupied = occupiedLanes(reservations);
  const byWeekday = new Map(openingHours.map((entry) => [entry.weekday, entry]));
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(from, index);
    const opening = byWeekday.get(weekdayOf(date));
    const beyondHorizon = daysBetween(now.date, date) > offer.bookingHorizonDays;
    const slots = [];
    for (let hour = opening?.openHour ?? 0; opening && hour < opening.closeHour; hour += 1) {
      const past = date < now.date || (date === now.date && hour <= now.hour);
      slots.push({ hour, free: Math.max(0, offer.laneCount - (occupied.get(`${date}|${hour}`) || 0)), bookable: !past && !beyondHorizon });
    }
    return { date, weekday: weekdayOf(date), slots };
  });
}

const SLOT_DATE_FORMATS = {
  de: ([year, month, day]) => `${day}.${month}.${year}`,
  nl: ([year, month, day]) => `${day}-${month}-${year}`,
  en: ([year, month, day]) => `${year}-${month}-${day}`,
  es: ([year, month, day]) => `${day}/${month}/${year}`,
  fr: ([year, month, day]) => `${day}/${month}/${year}`,
};

const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

/** Zeitraum für Push- und Mailtexte, ohne Intl (spart im Worker die ICU-Ladezeit), z. B. „24.10.2026 14:00–16:00“. */
export function formatRentalSlot({ date, startHour, hours }, language = 'de') {
  const format = SLOT_DATE_FORMATS[language] || SLOT_DATE_FORMATS.de;
  return `${format(String(date).split('-'))} ${hourLabel(startHour)}–${hourLabel(startHour + hours)}`;
}
