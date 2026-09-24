import { describe, expect, it } from 'vitest';
import { formatLocationAddress, geocodingFallbackQuery } from './location-format.js';

describe('location-format', () => {
  it('stellt vertauschte Hausnummer und Straße richtig', () => {
    expect(formatLocationAddress('Clubhaus, 18, Großgasse, Okarben, 61184, Deutschland')).toBe('Clubhaus, Großgasse 18, Okarben, 61184, Deutschland');
  });

  it('baut "Straße Nr, PLZ" als Ersatzanfrage für unauffindbare Adressen', () => {
    expect(geocodingFallbackQuery('Clubhaus 1.PC-Petterweil von 1986 e.V, Großgasse 18, Okarben, Karben, Wetteraukreis, Hessen, Deutschland 61184')).toBe('Großgasse 18, 61184');
    expect(geocodingFallbackQuery('Clubhaus, 18, Großgasse, Okarben, 61184, Deutschland')).toBe('Großgasse 18, 61184');
    expect(geocodingFallbackQuery('Stadions. 15, 68519 Viernheim')).toBe('Stadions. 15, 68519');
  });

  it('liefert keine Ersatzanfrage ohne Straße mit Hausnummer oder PLZ', () => {
    expect(geocodingFallbackQuery('Groß-Gerau')).toBeNull();
    expect(geocodingFallbackQuery('75443 Ötisheim')).toBeNull();
    expect(geocodingFallbackQuery('Europaring 5, Groß-Gerau')).toBeNull();
    expect(geocodingFallbackQuery('')).toBeNull();
  });
});
