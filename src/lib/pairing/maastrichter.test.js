import { describe, expect, it } from 'vitest';
import { assignFinalGroups, checkRequirements, generateRound, preliminaryRoundsPlayed, totalRounds } from './maastrichter.js';
import { isOnlinePlayable } from './index.js';

const teamIds = (count) => Array.from({ length: count }, (_, index) => `t${index + 1}`);
const ranked = (wins) => wins.map((value, index) => ({ teamId: `t${index + 1}`, wins: value }));

// Spielt die Partien einer Runde aus: das zuerst genannte Team gewinnt 13:5, Freilose bleiben ohne Ergebnis.
function play(matches, roundNumber) {
  return matches.map((match, matchIndex) => ({ ...match, roundNumber, matchIndex, ...(match.teamB.length ? { scoreA: 13, scoreB: 5 } : {}) }));
}

describe('Maastrichter', () => {
  it('ist online spielbar', () => {
    expect(isOnlinePlayable({ type: 'maastrichter', registrationType: 'forme' })).toBe(true);
  });

  it('verlangt mindestens 6 Teams und feste Teams', () => {
    expect(checkRequirements(5, { registrationType: 'forme' })).toEqual([{ type: 'minPlayers', min: 6 }]);
    expect(checkRequirements(6, { registrationType: 'forme' })).toEqual([]);
    expect(checkRequirements(8, { registrationType: 'supermelee' })[0].type).toBe('message');
    // Ab der Finalrunde gilt die K.O.-Mindestzahl: Ausgeschiedene dürfen inaktiv sein.
    expect(checkRequirements(4, { registrationType: 'forme', roundsPlayed: 3, preliminaryRounds: 3 })).toEqual([]);
    expect(checkRequirements(4, { registrationType: 'forme', roundsPlayed: 2, preliminaryRounds: 3 })).toEqual([{ type: 'minPlayers', min: 6 }]);
    // Ohne Angabe der Vorrunden (z. B. alter Client) vorsichtshalber die Vorrunden-Mindestzahl
    expect(checkRequirements(4, { registrationType: 'forme', roundsPlayed: 5 })).toEqual([{ type: 'minPlayers', min: 6 }]);
  });

  it('berechnet das Rundenende aus Vorrunden und der längsten Finalgruppe', () => {
    // 4 Teams: Halbfinale + Finale; 5 Teams: Cadrage + Halbfinale + Finale; 2 Teams: nur Finale
    expect(totalRounds(3, [4, 4, 2])).toBe(5);
    expect(totalRounds(3, [4, 5])).toBe(6);
    expect(totalRounds(2, [2])).toBe(3);
    expect(totalRounds(3, [])).toBeNull();
    expect(checkRequirements(8, { registrationType: 'forme', allRoundsPlayed: true })).toEqual([{ type: 'message', text: 'Alle Runden wurden bereits gespielt.' }]);
  });

  describe('Finalgruppen', () => {
    it('teilt nach Gruppengröße und faltet eine zu kleine letzte Gruppe', () => {
      const result = assignFinalGroups(ranked([3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0]), { maxGroupSize: 4, minLastGroupSize: 2 });
      const sizes = Object.entries(Object.groupBy(result, (entry) => entry.group)).map(([group, entries]) => [group, entries.length]);
      expect(sizes).toEqual([['A', 4], ['B', 4], ['C', 5]]);
      // Setzrang = Platz innerhalb der Gruppe in Reihenfolge der Vorrunden-Rangliste
      expect(result.filter((entry) => entry.group === 'B').map((entry) => [entry.teamId, entry.koSeed])).toEqual([['t5', 1], ['t6', 2], ['t7', 3], ['t8', 4]]);
    });

    it('teilt nach Siegen; eine Stufe mit nur einem Team bekommt keine Gruppe', () => {
      const result = assignFinalGroups(ranked([3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 0, 0, 0]), { groupMode: 'NACH_SIEGEN', preliminaryRounds: 3 });
      expect(result.find((entry) => entry.teamId === 't1')).toBeUndefined();
      expect(Object.entries(Object.groupBy(result, (entry) => entry.group)).map(([group, entries]) => [group, entries.map((entry) => entry.teamId)]))
        .toEqual([['A', ['t2', 't3', 't4']], ['B', ['t5', 't6', 't7', 't8', 't9', 't10']], ['C', ['t11', 't12', 't13']]]);
    });

    it('legt bei wenigen Teams alle in Gruppe A', () => {
      expect(new Set(assignFinalGroups(ranked([2, 2, 1, 1, 0, 0])).map((entry) => entry.group))).toEqual(new Set(['A']));
    });
  });

  it('spielt erst die Schweizer Vorrunden, danach K.O. in den Finalgruppen bis zum Ende', () => {
    const teams = teamIds(8).map((id) => ({ id, seedPosition: 0 }));
    let history = [];
    for (let round = 1; round <= 3; round++) {
      const { matches, phase } = generateRound(teams, history, { preliminaryRounds: 3 });
      expect(phase).toBe('preliminary');
      expect(matches).toHaveLength(4);
      history = [...history, ...play(matches, round)];
    }
    expect(preliminaryRoundsPlayed(history, 3)).toBe(3);

    // Ohne zugewiesene Gruppen keine Finalrunde
    expect(() => generateRound(teams, history, { preliminaryRounds: 3 })).toThrow('Finalgruppen');

    const groups = assignFinalGroups(teams.map((team) => ({ teamId: team.id, wins: 0 })), { maxGroupSize: 4, minLastGroupSize: 2 });
    const byId = new Map(groups.map((entry) => [entry.teamId, entry]));
    const koTeams = teams.map((team) => ({ ...team, bracketGroup: byId.get(team.id).group, koSeed: byId.get(team.id).koSeed }));

    const semis = generateRound(koTeams, history, { preliminaryRounds: 3, platz3: false });
    expect(semis.phase).toBe('final');
    expect(semis.matches.map((match) => match.label)).toEqual(['Halbfinale – Gruppe A', 'Halbfinale – Gruppe A', 'Halbfinale – Gruppe B', 'Halbfinale – Gruppe B']);
    // Setzrang 1 gegen 4, 2 gegen 3
    expect(semis.matches[0]).toMatchObject({ teamA: ['t1'], teamB: ['t4'] });
    history = [...history, ...play(semis.matches, 4)];

    const finals = generateRound(koTeams, history, { preliminaryRounds: 3, platz3: false });
    expect(finals.matches.map((match) => match.label)).toEqual(['Finale – Gruppe A', 'Finale – Gruppe B']);
    history = [...history, ...play(finals.matches, 5)];

    expect(() => generateRound(koTeams, history, { preliminaryRounds: 3, platz3: false })).toThrow('Alle Runden wurden bereits gespielt.');
  });

  it('lost die Finalgruppen in der Reihenfolge A, B, C … aus', () => {
    // Gruppe C (2 Teams) steht in der Teamliste vorn, ihre Partie soll trotzdem nach A und B kommen.
    const teams = [
      { id: 'c1', bracketGroup: 'C', koSeed: 1 }, { id: 'c2', bracketGroup: 'C', koSeed: 2 },
      ...['a', 'b'].flatMap((g) => [1, 2, 3, 4].map((seed) => ({ id: `${g}${seed}`, bracketGroup: g.toUpperCase(), koSeed: seed }))),
    ];
    const { matches } = generateRound(teams, [], { preliminaryRounds: 0 });
    expect(matches.map((match) => match.label)).toEqual(['Halbfinale – Gruppe A', 'Halbfinale – Gruppe A', 'Halbfinale – Gruppe B', 'Halbfinale – Gruppe B', 'Finale – Gruppe C']);
  });

  it('benennt auch eine einzelne Finalgruppe', () => {
    const teams = teamIds(6).map((id, index) => ({ id, bracketGroup: 'A', koSeed: index + 1 }));
    const { matches } = generateRound(teams, [], { preliminaryRounds: 0 });
    expect(matches.every((match) => match.label.endsWith('– Gruppe A'))).toBe(true);
    expect(matches[0].label).toBe('Cadrage – Gruppe A');
  });
});
