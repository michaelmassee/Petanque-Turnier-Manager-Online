import { describe, expect, it } from 'vitest';
import { currentRoundView, playedKoMatches } from './current-round.js';

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

describe('playedKoMatches', () => {
  const ko = (id, a, b, scoreA, scoreB) => match(id, a, b, scoreA, scoreB, { stageLabel: 'A-Finale' });

  it('lässt gespielte KO-Partien früherer Runden stehen, neueste Runde zuerst', () => {
    const rounds = [
      { roundNumber: 5, matches: [match('vorrunde', 'v1', 'v2', 13, 2)] },
      { roundNumber: 6, matches: [ko('af1', 'a1', 'a2', 13, 4), ko('af2', 'a3', 'a4', 9, 13)] },
      { roundNumber: 7, matches: [ko('vf1', 'a1', 'a4')] },
    ];
    expect(playedKoMatches(rounds, currentRoundView(rounds), 'maastrichter').matches.map((entry) => entry.id)).toEqual(['af1', 'af2']);
  });

  it('übernimmt weder offene KO-Partien der aktuellen Anzeige noch Freilose', () => {
    const rounds = [
      { roundNumber: 1, matches: [ko('offen', 'b1', 'b2', null, null), ko('frei', 'b3', null, null, null)] },
      { roundNumber: 2, matches: [ko('hf', 'a1', 'a2', 13, 1)] },
    ];
    expect(playedKoMatches(rounds, currentRoundView(rounds), 'ko').matches).toEqual([]);
  });

  it('lässt Gruppenspiele anderer Turnierarten weg, auch wenn sie eine Stufe tragen', () => {
    const rounds = [
      { roundNumber: 1, matches: [match('poule', 'p1', 'p2', 13, 3, { stageLabel: 'Poule 1' })] },
      { roundNumber: 2, matches: [match('weiter', 'p1', 'p3')] },
    ];
    expect(playedKoMatches(rounds, currentRoundView(rounds), 'poule_ab').matches).toEqual([]);
  });
});
