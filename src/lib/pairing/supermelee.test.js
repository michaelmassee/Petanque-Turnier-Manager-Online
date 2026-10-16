import { describe, expect, it } from 'vitest';
import { buildHistoryIndex, computeGameSizes, generateRound } from './supermelee.js';

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

  // Bei 12 Spielern gehen sowohl "alles 4er" (3x4) als auch "alles 6er" (2x6) exakt
  // auf - hier muss der Hauptmodus (Doublette vs. Triplette) die Basisgröße
  // bestimmen, nicht eine pauschale Minimierung von "fours + fives".
  it('bevorzugt bei Doublette 4er auch dann, wenn 6er ohne Rest aufgehen', () => {
    expect(computeGameSizes(12, 'doublette')).toEqual([4, 4, 4]);
  });

  it('bevorzugt bei Triplette 6er auch dann, wenn 4er ohne Rest aufgehen', () => {
    expect(computeGameSizes(12, 'triplette')).toEqual([6, 6]);
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

  it('bevorzugt bei Doublette für das Ausnahme-Spiel (3er-Team) Spieler, die noch nicht in einem 3er-Team waren', () => {
    const players = makePlayers(9);
    // p1-p3 waren bereits im 3er-Team (Ausnahme bei Doublette, Basis ist 2er) -
    // bei der nächsten Runde sollen bevorzugt p4-p9 (noch keine Ausnahme) das
    // neue 3er-Team stellen, nicht wieder p1-p3.
    const history = [{ teamA: ['p1', 'p2', 'p3'], teamB: ['p4', 'p5'] }];
    const { matches } = generateRound(players, history, { formation: 'doublette', attempts: 50 });
    const exceptionMatch = matches.find((match) => match.teamA.length === 3 || match.teamB.length === 3);
    expect(exceptionMatch).toBeDefined();
    const exceptionTeam = exceptionMatch.teamA.length === 3 ? exceptionMatch.teamA : exceptionMatch.teamB;
    expect(exceptionTeam).not.toContain('p1');
    expect(exceptionTeam).not.toContain('p2');
    expect(exceptionTeam).not.toContain('p3');
  });

  it('bevorzugt bei Triplette für das Ausnahme-Spiel (2er-Team) Spieler, die noch nicht in einem 2er-Team waren', () => {
    const players = makePlayers(11);
    // p4/p5 waren bereits im 2er-Team (Ausnahme bei Triplette, Basis ist 3er) -
    // bei der nächsten Runde sollen bevorzugt die übrigen Spieler (noch keine
    // Ausnahme) das neue 2er-Team stellen, nicht wieder p4/p5.
    const history = [{ teamA: ['p1', 'p2', 'p3'], teamB: ['p4', 'p5'] }];
    const { matches } = generateRound(players, history, { formation: 'triplette', attempts: 50 });
    const exceptionMatch = matches.find((match) => match.teamA.length === 2 || match.teamB.length === 2);
    expect(exceptionMatch).toBeDefined();
    const exceptionTeam = exceptionMatch.teamA.length === 2 ? exceptionMatch.teamA : exceptionMatch.teamB;
    expect(exceptionTeam).not.toContain('p4');
    expect(exceptionTeam).not.toContain('p5');
  });

  // Deterministischer Zufall für reproduzierbare Läufe.
  const seeded = (start = 1) => { let state = start; return () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; }; };
  const play = (count, formation, rounds, random, players = makePlayers(count)) => {
    const history = [];
    for (let round = 0; round < rounds; round += 1) history.push(...generateRound(players, history, { formation, random }).matches);
    return history;
  };
  const teamsOf = (history) => history.flatMap((match) => [match.teamA, match.teamB]);

  it('setzt Spieler mit gleicher Setzposition > 0 nicht ins selbe Team (wie das Hauptprojekt)', () => {
    const players = makePlayers(12).map((player, index) => ({ ...player, seedPosition: index < 6 ? (index % 3) + 1 : 0 }));
    const seeds = Object.fromEntries(players.map((player) => [player.id, player.seedPosition]));
    for (let run = 1; run <= 10; run += 1) {
      for (const team of teamsOf(play(12, 'triplette', 3, seeded(run), players))) {
        const positions = team.map((id) => seeds[id]).filter(Boolean);
        expect(new Set(positions).size).toBe(positions.length);
      }
    }
  });

  it('verteilt Ausnahme-Teams in beiden Modi gleichmäßig (Spreizung höchstens 1)', () => {
    for (const [count, formation] of [[10, 'doublette'], [9, 'doublette'], [14, 'triplette']]) {
      for (let run = 1; run <= 10; run += 1) {
        const { exceptionCounts } = buildHistoryIndex(play(count, formation, 4, seeded(run)), formation);
        const values = makePlayers(count).map((player) => exceptionCounts[player.id] || 0);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('wiederholt bei 16 Spielern Doublette über 5 Runden keinen Teampartner', () => {
    for (let run = 1; run <= 5; run += 1) {
      const pairs = new Set();
      for (const team of teamsOf(play(16, 'doublette', 5, seeded(run)))) {
        const key = [...team].sort().join('|');
        expect(pairs.has(key)).toBe(false);
        pairs.add(key);
      }
    }
  });

  it('lost auch bei ausgeschöpften Partnern eine vollständige Runde (12 Spieler Triplette, 6 Runden)', () => {
    const history = play(12, 'triplette', 6, seeded(3));
    expect(history).toHaveLength(12);
    for (let round = 0; round < 6; round += 1) {
      const players = history.slice(round * 2, round * 2 + 2).flatMap((match) => [...match.teamA, ...match.teamB]);
      expect(new Set(players).size).toBe(12);
    }
  });
});
