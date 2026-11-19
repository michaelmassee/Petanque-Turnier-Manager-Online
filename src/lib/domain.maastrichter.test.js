import { describe, expect, it } from 'vitest';
import { EMPTY_TOURNAMENT_FORM } from './constants.js';
import { tournamentPayload } from './domain.js';

const form = { ...EMPTY_TOURNAMENT_FORM, name: 'Maastrichter', date: '2026-12-01', location: 'Ort', type: 'maastrichter', formation: 'tete' };

describe('tournamentPayload: Maastrichter-Einstellungen', () => {
  it('schickt beide Einstellungen mit', () => {
    expect(tournamentPayload({ ...form, maastrichterPreliminaryRounds: 4, maastrichterGroupMode: 'NACH_SIEGEN' }))
      .toMatchObject({ maastrichterPreliminaryRounds: 4, maastrichterGroupMode: 'NACH_SIEGEN' });
  });

  it('verwirft bei leerem Vorrunden-Feld nicht den gewählten Gruppenmodus', () => {
    const payload = tournamentPayload({ ...form, maastrichterPreliminaryRounds: '', maastrichterGroupMode: 'NACH_SIEGEN' });
    expect(payload.maastrichterGroupMode).toBe('NACH_SIEGEN');
    expect(payload).not.toHaveProperty('maastrichterPreliminaryRounds');
  });

  it('schickt noch nicht nachgeladene Einstellungen beim Bearbeiten nicht mit', () => {
    const payload = tournamentPayload({ ...form, maastrichterPreliminaryRounds: undefined, maastrichterGroupMode: undefined });
    expect(payload).not.toHaveProperty('maastrichterPreliminaryRounds');
    expect(payload).not.toHaveProperty('maastrichterGroupMode');
  });

  it('schickt sie bei anderen Systemen nicht mit', () => {
    expect(tournamentPayload({ ...form, type: 'ko' })).not.toHaveProperty('maastrichterGroupMode');
  });
});
