import { describe, expect, it } from 'vitest';
import { buildAvailability, formatRentalSlot, normalizeOfferInput, normalizeOpeningHours, validateReservationRequest } from './rental-core.js';

const offer = { laneCount: 4, minHours: 1, maxHours: 3, bookingHorizonDays: 30 };
// 2026-10-19 ist ein Montag (Wochentag 1).
const openingHours = [{ weekday: 1, openHour: 10, closeHour: 20 }, { weekday: 6, openHour: 9, closeHour: 13 }];
const now = { date: '2026-10-19', hour: 11 };
const request = (body) => validateReservationRequest({ offer, openingHours, body: { lanes: 1, hours: 1, ...body }, now });

describe('Platz mieten: Eingaben', () => {
  it('verlangt eindeutige, sinnvolle Öffnungszeiten', () => {
    expect(normalizeOpeningHours([{ weekday: 6, openHour: 9, closeHour: 24 }, { weekday: 1, openHour: 10, closeHour: 20 }]).map((entry) => entry.weekday)).toEqual([1, 6]);
    expect(() => normalizeOpeningHours([])).toThrow();
    expect(() => normalizeOpeningHours([{ weekday: 1, openHour: 12, closeHour: 12 }])).toThrow();
    expect(() => normalizeOpeningHours([{ weekday: 1, openHour: 9, closeHour: 10 }, { weekday: 1, openHour: 11, closeHour: 12 }])).toThrow();
  });

  it('prüft Angebotsdaten', () => {
    const base = { title: 'Halle', laneCount: 6, openingHours };
    expect(normalizeOfferInput(base)).toMatchObject({ title: 'Halle', laneCount: 6, currency: 'EUR', priceMinor: null, minHours: 1, maxHours: 4 });
    expect(() => normalizeOfferInput({ ...base, title: ' ' })).toThrow();
    expect(() => normalizeOfferInput({ ...base, minHours: 3, maxHours: 2 })).toThrow();
    expect(() => normalizeOfferInput({ ...base, currency: 'XYZ' })).toThrow();
  });

  it('zählt beim Längenlimit der Rich-Text-Beschreibung nur den sichtbaren Text', () => {
    const base = { title: 'Halle', laneCount: 6, openingHours };
    const richText = (text) => `ptm-richtext:v1:${JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] }] })}`;
    expect(normalizeOfferInput({ ...base, description: richText('x'.repeat(2000)) }).description).toBe(richText('x'.repeat(2000)));
    expect(() => normalizeOfferInput({ ...base, description: richText('x'.repeat(2001)) })).toThrow();
  });

  it('akzeptiert eine Anfrage innerhalb der Öffnungszeiten', () => {
    expect(request({ date: '2026-10-24', startHour: 10, hours: 3, lanes: 4, note: ' Training ' }))
      .toEqual({ date: '2026-10-24', startHour: 10, hours: 3, lanes: 4, note: 'Training' });
  });

  it('lehnt Anfragen außerhalb von Öffnungszeit, Dauer, Bahnen, Vergangenheit und Horizont ab', () => {
    expect(() => request({ date: '2026-10-24', startHour: 11, hours: 3 })).toThrow('Öffnungszeiten');
    expect(() => request({ date: '2026-10-20', startHour: 10 })).toThrow('Öffnungszeiten');
    expect(() => request({ date: '2026-10-24', startHour: 9, hours: 4 })).toThrow('Dauer');
    expect(() => request({ date: '2026-10-24', startHour: 9, lanes: 5 })).toThrow('Bahnen');
    expect(() => request({ date: '2026-10-19', startHour: 11 })).toThrow('Vergangenheit');
    expect(request({ date: '2026-10-19', startHour: 12 }).startHour).toBe(12);
    expect(() => request({ date: '2026-12-21', startHour: 10 })).toThrow('Voraus');
    expect(() => request({ date: '2026-02-30', startHour: 10 })).toThrow('Datum');
  });
});

describe('Platz mieten: Verfügbarkeit', () => {
  it('zieht aktive Reservierungen je Stunde ab und markiert Vergangenes', () => {
    const days = buildAvailability({
      offer, openingHours, from: '2026-10-19', now,
      reservations: [
        { localDate: '2026-10-19', startHour: 12, hours: 2, lanes: 3 },
        { localDate: '2026-10-19', startHour: 13, hours: 1, lanes: 1 },
      ],
    });
    expect(days).toHaveLength(7);
    const monday = days[0].slots;
    expect(monday[0]).toEqual({ hour: 10, free: 4, bookable: false });
    expect(monday.find((slot) => slot.hour === 12)).toEqual({ hour: 12, free: 1, bookable: true });
    expect(monday.find((slot) => slot.hour === 13).free).toBe(0);
    expect(days[1].slots).toEqual([]);
    expect(days[5].slots.map((slot) => slot.hour)).toEqual([9, 10, 11, 12]);
  });

  it('formatiert den Zeitraum je Sprache', () => {
    expect(formatRentalSlot({ date: '2026-10-24', startHour: 9, hours: 2 }, 'de')).toBe('24.10.2026 09:00–11:00');
    expect(formatRentalSlot({ date: '2026-10-24', startHour: 22, hours: 2 }, 'en')).toBe('2026-10-24 22:00–24:00');
  });
});
