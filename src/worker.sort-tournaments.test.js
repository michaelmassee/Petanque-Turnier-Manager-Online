import { describe, expect, it } from 'vitest';
import { sortTournamentRows } from './worker.js';

describe('sortTournamentRows', () => {
  it('sortiert nach Datum, Startzeit (ohne Zeit zuerst) und Name', () => {
    const rows = [
      { id: 'd', date: '2026-10-12', start_time: '10:00', name: 'B' },
      { id: 'c', date: '2026-10-12', start_time: '10:00', name: 'a' },
      { id: 'b', date: '2026-10-12', start_time: null, name: 'Z' },
      { id: 'e', date: '2026-10-13', start_time: '09:00', name: 'A' },
      { id: 'a', date: '2026-10-11', start_time: '14:00', name: 'X' },
    ];
    expect(sortTournamentRows(rows).map((row) => row.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('sortiert Namen ohne Rücksicht auf Groß-/Kleinschreibung und Akzente', () => {
    const rows = ['Zeller Cup', 'Élan', 'apfel', 'Ärger'].map((name) => ({ id: name, date: '2026-10-12', start_time: null, name }));
    expect(sortTournamentRows(rows).map((row) => row.id)).toEqual(['apfel', 'Ärger', 'Élan', 'Zeller Cup']);
  });
});
