// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { tournamentStartUtcIso } from './worker.js';

describe('Angesetzter Turnierbeginn als Anmeldeschluss (E-02)', () => {
  it('rechnet den Turnierbeginn in der Zeitzone des Turniers nach UTC um (P-65)', () => {
    expect(tournamentStartUtcIso({ date: '2026-06-06', start_time: '10:00', timezone: 'Europe/Berlin' })).toBe('2026-06-06T08:00:00.000Z');
    expect(tournamentStartUtcIso({ date: '2026-01-10', start_time: '10:00', timezone: 'Europe/Berlin' })).toBe('2026-01-10T09:00:00.000Z');
    expect(tournamentStartUtcIso({ date: '2026-06-06', start_time: '10:00', timezone: 'Europe/Lisbon' })).toBe('2026-06-06T09:00:00.000Z');
    expect(tournamentStartUtcIso({ date: '2026-06-06', timezone: 'Europe/Berlin' })).toBe('2026-06-05T22:00:00.000Z');
    expect(tournamentStartUtcIso({ date: '2026-06-06', start_time: '10:00' })).toBe('2026-06-06T08:00:00.000Z');
    expect(tournamentStartUtcIso({ date: '2026-06-06', start_time: '10:00', timezone: 'Keine/Zone' })).toBe('2026-06-06T10:00:00.000Z');
  });
});
