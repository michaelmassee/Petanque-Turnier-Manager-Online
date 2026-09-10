import { describe, expect, it } from 'vitest';
import { computeRanking } from './ranking.js';

describe('computeRanking', () => {
  it('sortiert nach Siegen, Spieldifferenz, Punktedifferenz, erzielten Punkten', () => {
    const matches = [
      { teamA: ['p1'], teamB: ['p2'], scoreA: 13, scoreB: 5 },
      { teamA: ['p1'], teamB: ['p3'], scoreA: 13, scoreB: 10 },
      { teamA: ['p2'], teamB: ['p3'], scoreA: 13, scoreB: 2 },
    ];
    const ranking = computeRanking(matches);
    expect(ranking.map((entry) => entry.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(ranking[0]).toMatchObject({ wins: 2, gameDiff: 2, pointsFor: 26, pointsAgainst: 15, pointsDiff: 11 });
  });

  it('wertet eine Fehlrunde als 0:13-Niederlage für das nicht angetretene Team', () => {
    const matches = [{ teamA: ['p1'], teamB: ['p2'], noShow: 'a' }];
    const ranking = computeRanking(matches);
    const p1 = ranking.find((entry) => entry.playerId === 'p1');
    const p2 = ranking.find((entry) => entry.playerId === 'p2');
    expect(p1).toMatchObject({ wins: 0, pointsFor: 0, pointsAgainst: 13 });
    expect(p2).toMatchObject({ wins: 1, pointsFor: 13, pointsAgainst: 0 });
  });

  it('ignoriert Matches ohne Ergebnis', () => {
    const matches = [{ teamA: ['p1'], teamB: ['p2'], scoreA: null, scoreB: null }];
    expect(computeRanking(matches)).toEqual([]);
  });
});
