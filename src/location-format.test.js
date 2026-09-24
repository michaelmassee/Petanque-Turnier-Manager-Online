import { describe, expect, it } from 'vitest';
import { formatLocationAddress, geocodingFallbackQuery } from './location-format.js';

describe('location-format', () => {
  it('stellt vertauschte Hausnummer und Straße richtig', () => {
    expect(formatLocationAddress('Clubhaus, 18, Großgasse, Okarben, 61184, Deutschland')).toBe('Clubhaus, Großgasse 18, 61184 Okarben, Deutschland');
  });

  it('stellt die PLZ vor den Ort hinter der Straße', () => {
    expect(formatLocationAddress('Clubhaus 1.PC-Petterweil von 1986 e.V, 18, Großgasse, Okarben, Karben, Wetteraukreis, Hessen, 61184, Deutschland'))
      .toBe('Clubhaus 1.PC-Petterweil von 1986 e.V, Großgasse 18, 61184 Okarben, Karben, Wetteraukreis, Hessen, Deutschland');
    expect(formatLocationAddress('Clubhaus 1.PC-Petterweil von 1986 e.V, Großgasse 18, Okarben, Karben, Wetteraukreis, Hessen, Deutschland 61184'))
      .toBe('Clubhaus 1.PC-Petterweil von 1986 e.V, Großgasse 18, 61184 Okarben, Karben, Wetteraukreis, Hessen, Deutschland');
    expect(formatLocationAddress('Großgasse 18, 61184, Deutschland')).toBe('Großgasse 18, 61184, Deutschland');
  });

  it('ist idempotent', () => {
    const raw = 'Clubhaus 1.PC-Petterweil von 1986 e.V, 18, Großgasse, Okarben, Karben, Wetteraukreis, Hessen, 61184, Deutschland';
    expect(formatLocationAddress(formatLocationAddress(raw))).toBe(formatLocationAddress(raw));
    expect(formatLocationAddress('Clubhaus, Großgasse 18, Okarben, 61184, Deutschland')).toBe('Clubhaus, Großgasse 18, 61184 Okarben, Deutschland');
  });

  it('lässt Adressen mit korrekter PLZ oder ohne Straße unverändert', () => {
    expect(formatLocationAddress('Europaring 5, 64521 Groß-Gerau')).toBe('Europaring 5, 64521 Groß-Gerau');
    expect(formatLocationAddress('Ostpark, Rüsselsheim am Main, Hessen, 65428, Deutschland')).toBe('Ostpark, Rüsselsheim am Main, Hessen, 65428, Deutschland');
    expect(formatLocationAddress('75443 Ötisheim')).toBe('75443 Ötisheim');
    expect(formatLocationAddress('Loutraki (Griechenland)')).toBe('Loutraki (Griechenland)');
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
