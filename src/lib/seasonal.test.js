import { describe, expect, it } from 'vitest';
import { applySeasonClass, isAutumnSeason } from './seasonal.js';

describe('isAutumnSeason', () => {
  it('ist im Oktober und November aktiv', () => {
    expect(isAutumnSeason(new Date(2026, 9, 1))).toBe(true);
    expect(isAutumnSeason(new Date(2026, 9, 31))).toBe(true);
    expect(isAutumnSeason(new Date(2026, 10, 30, 23, 59))).toBe(true);
  });

  it('ist außerhalb des Zeitraums inaktiv', () => {
    expect(isAutumnSeason(new Date(2026, 8, 30, 23, 59))).toBe(false);
    expect(isAutumnSeason(new Date(2026, 11, 1))).toBe(false);
    expect(isAutumnSeason(new Date(2026, 11, 24))).toBe(false);
  });
});

describe('applySeasonClass', () => {
  it('setzt die Herbst-Klasse nur in der Saison', () => {
    const root = document.createElement('div');
    applySeasonClass(root, new Date(2026, 9, 5));
    expect(root.classList.contains('season-autumn')).toBe(true);
    applySeasonClass(root, new Date(2026, 11, 5));
    expect(root.classList.contains('season-autumn')).toBe(false);
  });
});
