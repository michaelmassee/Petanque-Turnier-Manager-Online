import { describe, expect, it } from 'vitest';
import { EMPTY_TOURNAMENT_FORM } from './constants.js';
import { tournamentPayload } from './domain.js';

const form = { ...EMPTY_TOURNAMENT_FORM, name: 'Maastrichter', date: '2026-12-01', location: 'Ort', type: 'maastrichter', formation: 'tete' };

// Vorrunden und Finalgruppen stehen in den Turnieroptionen der Spielverwaltung, nicht im Turnierformular: Das Formular
// darf dort gespeicherte Werte nicht mit einem veralteten Stand überschreiben.
describe('tournamentPayload: Maastrichter-Einstellungen', () => {
  it('schickt keine Maastrichter-Einstellungen mit', () => {
    const payload = tournamentPayload({ ...form, maastrichterPreliminaryRounds: 4, maastrichterGroupMode: 'NACH_SIEGEN' });
    expect(payload).not.toHaveProperty('maastrichterPreliminaryRounds');
    expect(payload).not.toHaveProperty('maastrichterGroupMode');
  });

  it('schickt Spiel um Platz 3 nicht mit (K.O. und Maastrichter)', () => {
    expect(tournamentPayload({ ...form, koPlatz3: false })).not.toHaveProperty('koPlatz3');
    expect(tournamentPayload({ ...form, type: 'ko', koPlatz3: false })).not.toHaveProperty('koPlatz3');
  });
});
