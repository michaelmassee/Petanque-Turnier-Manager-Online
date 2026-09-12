import { describe, expect, it } from 'vitest';
import { generateRound, sortSwiss, swissStats } from './schweizer.js';

const teams = Array.from({ length: 6 }, (_, index) => ({ id: `t${index + 1}`, seedPosition: index + 1 }));

describe('Schweizer Pairing', () => {
  it('bildet in Runde 1 gesetzte, vollständige Paarungen', () => {
    const { matches } = generateRound(teams, []);
    expect(matches).toHaveLength(3);
    expect(new Set(matches.flatMap((match) => [...match.teamA, ...match.teamB])).size).toBe(6);
  });

  it('vermeidet in Folgerunden bereits gespielte Gegner', () => {
    const history = [
      { teamA: ['t1'], teamB: ['t2'], scoreA: 13, scoreB: 7 },
      { teamA: ['t3'], teamB: ['t4'], scoreA: 13, scoreB: 7 },
      { teamA: ['t5'], teamB: ['t6'], scoreA: 13, scoreB: 7 },
    ];
    const { matches } = generateRound(teams, history);
    expect(matches.some((match) => match.teamA[0] === 't1' && match.teamB[0] === 't2')).toBe(false);
  });

  it('berechnet Buchholz und sortiert ihn vor Punktedifferenz', () => {
    const stats = swissStats(teams, [
      { teamA: ['t1'], teamB: ['t2'], scoreA: 13, scoreB: 1 },
      { teamA: ['t3'], teamB: ['t4'], scoreA: 13, scoreB: 1 },
      { teamA: ['t2'], teamB: ['t3'], scoreA: 13, scoreB: 1 },
    ]);
    expect(sortSwiss(stats)[0].teamId).toBe('t2');
    expect(stats.find((entry) => entry.teamId === 't1').bhz).toBe(1);
  });

  it('wertet Nichtantritt wie 0:13 und berücksichtigt den Gegner für Buchholz', () => {
    const stats = swissStats(teams, [{ teamA: ['t1'], teamB: ['t2'], noShow: 'a' }]);
    expect(stats.find((entry) => entry.teamId === 't1')).toMatchObject({ wins: 0, pointsFor: 0, pointsAgainst: 13, bhz: 1 });
    expect(stats.find((entry) => entry.teamId === 't2')).toMatchObject({ wins: 1, pointsFor: 13, pointsAgainst: 0 });
  });

  it('verbucht bei Freilos die Hauptprojekt-Default-Freispielpunkte 13:7 (Diff 6)', () => {
    const stats = swissStats(teams, [{ teamA: ['t1'], teamB: [] }]);
    expect(stats.find((entry) => entry.teamId === 't1')).toMatchObject({ wins: 1, pointsFor: 13, pointsAgainst: 7, pointsDiff: 6 });
  });
});
