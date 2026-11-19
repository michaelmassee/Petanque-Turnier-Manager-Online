import { describe, expect, it } from 'vitest';
import { EMPTY_TOURNAMENT_FORM } from './constants.js';
import { tournamentPayload } from './domain.js';

const form = { ...EMPTY_TOURNAMENT_FORM, name: 'Turnier', date: '2026-12-01', location: 'Ort', type: 'schweizer' };

// Live-Ansicht und Ergebnismeldung stehen in der Spielverwaltung: Das Formular darf sie nicht mit einem alten Stand
// überschreiben.
describe('tournamentPayload: Live-Ansicht und Ergebnismeldung', () => {
  it('schickt keine der drei Einstellungen mit', () => {
    const payload = tournamentPayload({ ...form, id: 't1', liveViewEnabled: true, playerResultReportingEnabled: true, resultReportConfirmationRequired: true });
    expect(payload).not.toHaveProperty('liveViewEnabled');
    expect(payload).not.toHaveProperty('playerResultReportingEnabled');
    expect(payload).not.toHaveProperty('resultReportConfirmationRequired');
  });
});
