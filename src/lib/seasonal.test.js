import { describe, expect, it } from 'vitest';
import { applySeasonClass, isAutumnSeason, isHalloweenSeason } from './seasonal.js';

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

describe('isHalloweenSeason', () => {
  it.each([2026, 2027])('ist %i nur im Oktober aktiv', (year) => {
    expect(isHalloweenSeason(new Date(year, 8, 30, 23, 59, 59))).toBe(false);
    expect(isHalloweenSeason(new Date(year, 9, 1))).toBe(true);
    expect(isHalloweenSeason(new Date(year, 9, 31, 23, 59, 59))).toBe(true);
    expect(isHalloweenSeason(new Date(year, 10, 1))).toBe(false);
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

  it('entfernt Halloween im November und behält die Herbst-Klasse', () => {
    const root = document.createElement('div');
    root.classList.add('existing-class');
    applySeasonClass(root, new Date(2026, 8, 30));
    expect(root.classList.contains('season-halloween')).toBe(false);
    applySeasonClass(root, new Date(2026, 9, 1));
    expect(root.classList.contains('season-halloween')).toBe(true);
    expect(root.classList.contains('season-autumn')).toBe(true);
    applySeasonClass(root, new Date(2026, 10, 1));
    expect(root.classList.contains('season-halloween')).toBe(false);
    expect(root.classList.contains('season-autumn')).toBe(true);
    expect(root.classList.contains('existing-class')).toBe(true);
  });
});
