import { describe, expect, it } from 'vitest';
import { currentRoundView } from './current-round.js';

const team = (id) => [{ id }];
const match = (id, a, b, scoreA = null, scoreB = null, extra = {}) => ({
  id, teamA: team(a), teamB: b ? team(b) : [], scoreA, scoreB, noShow: null, ...extra,
});

describe('currentRoundView', () => {
  it('liefert ohne Runden null', () => {
    expect(currentRoundView([])).toBeNull();
    expect(currentRoundView(undefined)).toBeNull();
  });

  it('zeigt bei gleichzeitig gespielten KO-Bäumen das offene Viertelfinale von B neben dem Halbfinale von A', () => {
    const rounds = [
      { roundNumber: 4, matches: [
        match('a-vf1', 'a1', 'a2', 13, 5), match('a-vf2', 'a3', 'a4', 7, 13),
        match('b-vf1', 'b1', 'b2'), match('b-vf2', 'b3', 'b4'),
      ] },
      { roundNumber: 5, matches: [match('a-hf', 'a1', 'a4')] },
    ];
    const view = currentRoundView(rounds);
    expect(view.roundNumber).toBe(5);
    expect(view.matches.map((entry) => entry.id)).toEqual(['b-vf1', 'b-vf2', 'a-hf']);
  });

  it('übernimmt keine offene Partie, deren Team später neu eingeteilt ist, keine Freilose und keine Nichtantritte', () => {
    const rounds = [
      { roundNumber: 1, matches: [
        match('vergessen', 'x', 'y'), match('freilos', 'z'),
        match('nicht-angetreten', 'u', 'v', null, null, { noShow: 'a' }),
      ] },
      { roundNumber: 2, matches: [match('neu', 'x', 'w')] },
    ];
    expect(currentRoundView(rounds).matches.map((entry) => entry.id)).toEqual(['neu']);
  });

  it('lässt eine Runde ohne offene Vorgänger unverändert', () => {
    const rounds = [
      { roundNumber: 1, matches: [match('m1', 'a', 'b', 13, 0)] },
      { roundNumber: 2, matches: [match('m2', 'a', 'c')] },
    ];
    expect(currentRoundView(rounds)).toEqual(rounds[1]);
  });
});
