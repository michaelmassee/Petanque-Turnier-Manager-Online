import { describe, expect, it } from 'vitest';
import { formatPetanqueOnlineAddress, isExternalPetanqueOnlineWebsite, isFuturePetanqueOnlineTournament, mapPetanqueOnlineFormation, mapPetanqueOnlineTournament, petanqueOnlineKey } from './petanque-online-core.js';

describe('Petanque-Online-Import', () => {
  it('bildet Quell-IDs und Formationen stabil ab', () => {
    expect(petanqueOnlineKey({ type: 'tournament', id: 9 })).toBe('tournament:9');
    expect(mapPetanqueOnlineFormation('tete_a_tete')).toBe('tete');
    expect(mapPetanqueOnlineFormation('doublette_mixed')).toBe('doublette');
    expect(mapPetanqueOnlineFormation('supermelee')).toBe('andere');
  });

  it('erzeugt einen nicht anmeldbaren Kalendereintrag mit Quellenangabe', () => {
    expect(mapPetanqueOnlineTournament({
      type: 'scraped', id: 47, name: 'Abendturnier', date: '2026-10-01', time: '18:30:00', formation: 'supermelee',
      club_name: 'BC Beispiel', club_city: 'Musterstadt', source_url: 'https://example.test/turnier', additional_info: 'Lizenzfrei',
    })).toMatchObject({ externalKey: 'scraped:47', startTime: '18:30', location: 'Musterstadt', formation: 'andere' });
    const withoutCapacity = mapPetanqueOnlineTournament({ type: 'scraped', id: 47, name: 'Abendturnier', date: '2026-10-01', club_name: 'BC Beispiel', club_city: 'Musterstadt', source_url: 'https://example.test/turnier', formation: 'supermelee' }).description;
    expect(withoutCapacity).toContain('Original-Formation: supermelee');
    expect(withoutCapacity).not.toContain('Max. Teams:');
  });

  it('zeigt nur Termine nach dem heutigen Tag zur Auswahl', () => {
    expect(isFuturePetanqueOnlineTournament({ date: '2026-09-13' }, '2026-09-12')).toBe(true);
    expect(isFuturePetanqueOnlineTournament({ date: '2026-09-12' }, '2026-09-12')).toBe(false);
  });

  it('funktioniert als Array.filter-Callback, ohne dass der Index den Default-today-Wert überschreibt', () => {
    const entries = [{ date: '2999-01-01' }, { date: '2999-01-02' }, { date: '2999-01-03' }];
    expect(entries.filter(isFuturePetanqueOnlineTournament)).toHaveLength(0);
    expect(entries.filter((entry) => isFuturePetanqueOnlineTournament(entry))).toHaveLength(3);
  });

  it('baut aus der gescrapten PostalAddress die vollständige Adresse inkl. Straße', () => {
    expect(formatPetanqueOnlineAddress({ streetAddress: 'Pariser Str. 45', postalCode: '40549', addressLocality: 'Düsseldorf' }, 'Düsseldorf'))
      .toBe('Pariser Str. 45, 40549 Düsseldorf');
  });

  it('lässt die PLZ weg, wenn sie fehlt', () => {
    expect(formatPetanqueOnlineAddress({ streetAddress: 'Pariser Str. 45', addressLocality: 'Düsseldorf' }, 'Düsseldorf'))
      .toBe('Pariser Str. 45, Düsseldorf');
  });

  it('fällt ohne Straße auf null zurück (Ort bleibt wie bisher unverändert)', () => {
    expect(formatPetanqueOnlineAddress({ postalCode: '40549', addressLocality: 'Düsseldorf' }, 'Düsseldorf')).toBeNull();
    expect(formatPetanqueOnlineAddress(null, 'Düsseldorf')).toBeNull();
    expect(formatPetanqueOnlineAddress(undefined, 'Düsseldorf')).toBeNull();
  });

  it('nutzt den Fallback-Ort, wenn addressLocality fehlt', () => {
    expect(formatPetanqueOnlineAddress({ streetAddress: 'Pariser Str. 45', postalCode: '40549' }, 'Düsseldorf'))
      .toBe('Pariser Str. 45, 40549 Düsseldorf');
  });

  it('erkennt eine echte Vereinswebseite als extern', () => {
    expect(isExternalPetanqueOnlineWebsite('https://www.boule-aachen.de/')).toBe(true);
    expect(isExternalPetanqueOnlineWebsite('http://www.turn-club-bissendorf.de/pages/sportarten/petanque.php')).toBe(true);
  });

  it('erkennt den petanque-online.de-Fallback-Link nicht als Vereinswebseite', () => {
    expect(isExternalPetanqueOnlineWebsite('https://petanque-online.de/turniere/dusseldorf-sur-place-6407')).toBe(false);
  });

  it('behandelt fehlende oder ungültige URLs als "keine Vereinswebseite"', () => {
    expect(isExternalPetanqueOnlineWebsite(null)).toBe(false);
    expect(isExternalPetanqueOnlineWebsite(undefined)).toBe(false);
    expect(isExternalPetanqueOnlineWebsite('')).toBe(false);
    expect(isExternalPetanqueOnlineWebsite('nicht-valide')).toBe(false);
  });
});
