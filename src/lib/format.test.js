import { describe, expect, it } from 'vitest';
import { formatWeekdayShort } from './format.js';

describe('Wochentag in Kurzform', () => {
  it('liefert den Wochentag des Kalendertags in der Anzeigesprache', () => {
    expect(formatWeekdayShort('2026-09-26', 'de')).toBe('Sa');
    expect(formatWeekdayShort('2026-09-28', 'en')).toBe('Mon');
    expect(formatWeekdayShort('', 'de')).toBe('');
  });
});
