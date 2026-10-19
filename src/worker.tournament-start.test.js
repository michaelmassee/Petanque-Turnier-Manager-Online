// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { tournamentStartUtcIso, zonedDateTimeToUtcIso } from './worker.js';

describe('Angesetzter Turnierbeginn als Anmeldeschluss (E-02)', () => {
  it('rechnet den Turnierbeginn in der Zeitzone des Turniers nach UTC um (P-65)', () => {
    expect(tournamentStartUtcIso({ date: '2026-06-06', start_time: '10:00', timezone: 'Europe/Berlin' })).toBe('2026-06-06T08:00:00.000Z');
    expect(tournamentStartUtcIso({ date: '2026-01-10', start_time: '10:00', timezone: 'Europe/Berlin' })).toBe('2026-01-10T09:00:00.000Z');
    expect(tournamentStartUtcIso({ date: '2026-06-06', start_time: '10:00', timezone: 'Europe/Lisbon' })).toBe('2026-06-06T09:00:00.000Z');
    expect(tournamentStartUtcIso({ date: '2026-06-06', timezone: 'Europe/Berlin' })).toBe('2026-06-05T22:00:00.000Z');
    expect(tournamentStartUtcIso({ date: '2026-06-06', start_time: '10:00' })).toBe('2026-06-06T08:00:00.000Z');
    expect(tournamentStartUtcIso({ date: '2026-06-06', start_time: '10:00', timezone: 'Keine/Zone' })).toBe('2026-06-06T10:00:00.000Z');
  });

  it('rechnet MEZ-Zonen ohne Intl und behandelt die Sommerzeitumstellung wie zuvor', () => {
    expect(zonedDateTimeToUtcIso('2026-03-29T01:59', 'Europe/Paris')).toBe('2026-03-29T00:59:00.000Z');
    expect(() => zonedDateTimeToUtcIso('2026-03-29T02:30', 'Europe/Berlin')).toThrow('Sommerzeitumstellung');
    expect(zonedDateTimeToUtcIso('2026-03-29T03:00', 'Europe/Berlin')).toBe('2026-03-29T01:00:00.000Z');
    // Doppelte Stunde beim Zurückstellen: frühester Zeitpunkt (noch MESZ).
    expect(zonedDateTimeToUtcIso('2026-10-25T02:30', 'Europe/Berlin')).toBe('2026-10-25T00:30:00.000Z');
    expect(zonedDateTimeToUtcIso('2026-10-25T03:00', 'Europe/Berlin')).toBe('2026-10-25T02:00:00.000Z');
  });
});
