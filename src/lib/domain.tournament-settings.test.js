import { describe, expect, it } from 'vitest';
import { EMPTY_TOURNAMENT_FORM } from './constants.js';
import { tournamentPayload } from './domain.js';

const form = { ...EMPTY_TOURNAMENT_FORM, name: 'Turnier', date: '2026-12-01', location: 'Ort', type: 'schweizer',
  liveViewEnabled: true, playerResultReportingEnabled: true };

describe('tournamentPayload: Bestätigungspflicht für Ergebnismeldungen', () => {
  it('schickt beim Anlegen den Standard „sofort übernehmen“ mit', () => {
    expect(tournamentPayload(form)).toMatchObject({ resultReportConfirmationRequired: false });
    expect(tournamentPayload({ ...form, resultReportConfirmationRequired: true })).toMatchObject({ resultReportConfirmationRequired: true });
  });

  it('schickt beim Bearbeiten nichts, solange der gespeicherte Wert nicht geladen ist', () => {
    expect(tournamentPayload({ ...form, id: 't1' })).not.toHaveProperty('resultReportConfirmationRequired');
    expect(tournamentPayload({ ...form, id: 't1', settingsLoadedFor: 't1', resultReportConfirmationRequired: true }))
      .toMatchObject({ resultReportConfirmationRequired: true });
  });

  it('schickt „aus“, wenn Spieler keine Ergebnisse melden dürfen', () => {
    expect(tournamentPayload({ ...form, playerResultReportingEnabled: false, resultReportConfirmationRequired: true }))
      .toMatchObject({ resultReportConfirmationRequired: false });
  });
});
