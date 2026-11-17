import { describe, expect, it } from 'vitest';
import { playerResultReportingActive, supportsPlayerResultReporting } from './result-reporting.js';

describe('Ergebnismeldung durch Spieler je Turniersystem', () => {
  it('gibt es bei allen Systemen außer Trip-Tête', () => {
    expect(['schweizer', 'ko', 'maastrichter', 'poule', 'formule_x'].every(supportsPlayerResultReporting)).toBe(true);
    expect(supportsPlayerResultReporting('trip_tete')).toBe(false);
  });

  it('wirkt nur, wenn sie eingeschaltet ist und das System sie kennt', () => {
    expect(playerResultReportingActive({ type: 'schweizer', player_result_reporting_enabled: 1 })).toBe(true);
    expect(playerResultReportingActive({ type: 'schweizer', player_result_reporting_enabled: 0 })).toBe(false);
    expect(playerResultReportingActive({ type: 'trip_tete', player_result_reporting_enabled: 1 })).toBe(false);
    expect(playerResultReportingActive(null)).toBe(false);
  });
});
