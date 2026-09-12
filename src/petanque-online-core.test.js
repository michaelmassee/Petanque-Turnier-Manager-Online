import { describe, expect, it } from 'vitest';
import { isFuturePetanqueOnlineTournament, mapPetanqueOnlineFormation, mapPetanqueOnlineTournament, petanqueOnlineKey } from './petanque-online-core.js';

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
});
