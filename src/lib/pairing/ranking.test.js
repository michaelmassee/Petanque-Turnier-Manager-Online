import { describe, expect, it } from 'vitest';
import { competitionRanks, computeRanking, computeSupermeleeRanking, sameStandardRankingPlace } from './ranking.js';

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

  it('vergibt bei vollständig gleichem Ergebnis denselben Platz wie das Hauptprojekt', () => {
    const ranking = competitionRanks([
      { playerId: 'p1', wins: 1, gameDiff: 1, pointsDiff: 12, pointsFor: 13 },
      { playerId: 'p2', wins: 1, gameDiff: 1, pointsDiff: 12, pointsFor: 13 },
      { playerId: 'p3', wins: 1, gameDiff: 1, pointsDiff: 12, pointsFor: 13 },
      { playerId: 'p4', wins: 1, gameDiff: 1, pointsDiff: 5, pointsFor: 9 },
      { playerId: 'p5', wins: 1, gameDiff: 1, pointsDiff: 5, pointsFor: 9 },
      { playerId: 'p6', wins: 1, gameDiff: 1, pointsDiff: 4, pointsFor: 13 },
    ], sameStandardRankingPlace);

    expect(ranking.map((entry) => entry.rank)).toEqual([1, 1, 1, 4, 4, 6]);
  });
});

describe('computeSupermeleeRanking', () => {
  it('wertet eine in einer vollständigen Runde fehlende Person mit 0:13 (Hauptprojekt-Standard)', () => {
    const rounds = [
      [{ teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], scoreA: 13, scoreB: 7 }],
      [{ teamA: ['p1', 'p3'], teamB: ['p2', 'p5'], scoreA: 13, scoreB: 11 }],
    ];
    const ranking = computeSupermeleeRanking(rounds, ['p1', 'p2', 'p3', 'p5']);
    const byId = Object.fromEntries(ranking.map((entry) => [entry.playerId, entry]));
    // p4 fehlt in Runde 2, p5 in Runde 1.
    expect(byId.p4).toMatchObject({ wins: 0, gameDiff: -2, pointsFor: 7, pointsAgainst: 26 });
    expect(byId.p5).toMatchObject({ wins: 0, gameDiff: -2, pointsFor: 11, pointsAgainst: 26 });
    expect(byId.p1).toMatchObject({ wins: 2, gameDiff: 2 });
  });

  it('wertet eine noch offene Runde nicht als Fehlrunde und listet aktive Spieler ohne Partie', () => {
    const rounds = [
      [{ teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], scoreA: 13, scoreB: 7 }],
      [{ teamA: ['p1', 'p3'], teamB: ['p2', 'p4'], scoreA: null, scoreB: null }],
    ];
    const ranking = computeSupermeleeRanking(rounds, ['p1', 'p2', 'p3', 'p4', 'p9']);
    expect(ranking.find((entry) => entry.playerId === 'p9')).toMatchObject({ wins: 0, gameDiff: -1, pointsAgainst: 13 });
    expect(ranking.find((entry) => entry.playerId === 'p1')).toMatchObject({ wins: 1, gameDiff: 1, pointsAgainst: 7 });
  });

  it('führt neu aktive Spieler ohne gewertete Runde mit 0 in der Rangliste', () => {
    expect(computeSupermeleeRanking([], ['p1'])).toEqual([{ playerId: 'p1', wins: 0, gameDiff: 0, pointsFor: 0, pointsAgainst: 0, pointsDiff: 0 }]);
  });
});

