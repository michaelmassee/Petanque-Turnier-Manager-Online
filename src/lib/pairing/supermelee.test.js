import { describe, expect, it } from 'vitest';
import { computeGameSizes, generateRound } from './supermelee.js';

describe('computeGameSizes', () => {
  it('bildet bei Triplette möglichst viele 3v3-Spiele', () => {
    expect(computeGameSizes(6, 'triplette')).toEqual([6]);
    expect(computeGameSizes(12, 'triplette')).toEqual([6, 6]);
  });

  it('gleicht bei Triplette den Rest mit einem Ausnahme-Spiel aus', () => {
    expect(computeGameSizes(11, 'triplette')).toEqual([6, 5]);
  });

  it('bildet bei Doublette möglichst viele 2v2-Spiele', () => {
    expect(computeGameSizes(8, 'doublette')).toEqual([4, 4]);
  });

  it('liefert null für zu wenige Spieler', () => {
    expect(computeGameSizes(3, 'triplette')).toBeNull();
  });

  it('liefert null, wenn sich die Spieler mathematisch nicht in 2er/3er-Teams paaren lassen (z.B. 7)', () => {
    expect(computeGameSizes(7, 'triplette')).toBeNull();
  });
});

describe('generateRound', () => {
  function makePlayers(count) {
    return Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}` }));
  }

  it('setzt jeden Spieler in genau einem Team ein', () => {
    const players = makePlayers(9);
    const { matches } = generateRound(players, [], { formation: 'triplette' });
    const seen = new Set();
    for (const match of matches) {
      for (const playerId of [...match.teamA, ...match.teamB]) {
        expect(seen.has(playerId)).toBe(false);
        seen.add(playerId);
      }
    }
    expect(seen.size).toBe(9);
  });

  it('wirft bei weniger als 4 Spielern', () => {
    expect(() => generateRound(makePlayers(3), [], { formation: 'triplette' })).toThrow();
  });

  it('vermeidet wiederholte Teampartner, wenn eine Alternative existiert', () => {
    const players = makePlayers(9);
    const history = [{ teamA: ['p1', 'p2', 'p3'], teamB: ['p4', 'p5', 'p6'] }];
    const { matches } = generateRound(players, history, { formation: 'triplette', attempts: 50 });
    for (const match of matches) {
      for (const team of [match.teamA, match.teamB]) {
        expect(team.includes('p1') && team.includes('p2')).toBe(false);
        expect(team.includes('p2') && team.includes('p3')).toBe(false);
        expect(team.includes('p1') && team.includes('p3')).toBe(false);
      }
    }
  });
});
