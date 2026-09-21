import { describe, expect, it } from 'vitest';
import {
  assignGroups, berechneSetzliste, checkRequirements, generateRound, highestPowerOfTwo,
  planBracket, roundTitle,
} from './ko.js';

// Wer ein Match gewonnen/verloren hat (deterministisch: niedrigere id = besserer Seed
// gewinnt, siehe playAllRounds) - für Assertions auf Basis der rohen Rundenliste statt
// einer separaten Rangliste, die es für K.O. bewusst nicht gibt (siehe generateRound()/
// worker.js getTournamentRanking: kein "KoRanglisteSheet"-Äquivalent im Hauptprojekt).
function winner(match) { return match.scoreA > match.scoreB ? match.teamA[0] : match.teamB[0]; }
function loser(match) { return match.scoreA > match.scoreB ? match.teamB[0] : match.teamA[0]; }

const teamsOf = (count, bracketGroups) => Array.from({ length: count }, (_, index) => ({
  id: `t${index + 1}`, seedPosition: index + 1, bracketGroup: bracketGroups ? bracketGroups[index] : 'A',
}));

// Simuliert die worker.js-Nutzung: Runde für Runde erzeugen, deterministisch das Team mit
// der niedrigeren id (= besserer Seed) gewinnen lassen, Ergebnis inkl. roundNumber/matchIndex
// in die History zurückspeisen - genau wie generateTournamentRound() das tut.
function playAllRounds(teams, options = {}) {
  const history = [];
  const rounds = [];
  let roundNumber = 0;
  for (;;) {
    let matches;
    try {
      ({ matches } = generateRound(teams, history, options));
    } catch {
      break;
    }
    roundNumber += 1;
    const decided = matches.map((match, matchIndex) => {
      const aWins = Number(match.teamA[0].slice(1)) < Number(match.teamB[0].slice(1));
      return { ...match, scoreA: aWins ? 13 : 7, scoreB: aWins ? 7 : 13, noShow: null, roundNumber, matchIndex };
    });
    history.push(...decided);
    rounds.push(decided);
  }
  return { rounds, history };
}

describe('K.O. - Setzliste/Bracket-Mathematik (CadrageRechner/KoTurnierbaumSheet)', () => {
  it('berechneSetzliste: Seed 1 und 2 treffen sich nur im Finale', () => {
    expect(berechneSetzliste(2)).toEqual([1, 2]);
    expect(berechneSetzliste(4)).toEqual([1, 4, 2, 3]);
    expect(berechneSetzliste(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(berechneSetzliste(16)).toEqual([1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
  });

  it('highestPowerOfTwo', () => {
    expect(highestPowerOfTwo(1)).toBe(1);
    expect(highestPowerOfTwo(8)).toBe(8);
    expect(highestPowerOfTwo(9)).toBe(8);
    expect(highestPowerOfTwo(17)).toBe(16);
  });

  it('planBracket: keine Cadrage bei Zweierpotenz', () => {
    expect(planBracket(8)).toEqual({ bracketSize: 8, numRounds: 3, cadrageCount: 0, ohneCadrage: 8 });
  });

  it('planBracket: Cadrage statt Freilos bei Nicht-Zweierpotenz (Hauptprojekt-Beispiel 10 Teams)', () => {
    expect(planBracket(10)).toEqual({ bracketSize: 8, numRounds: 3, cadrageCount: 4, ohneCadrage: 6 });
  });

  it('planBracket für weitere Nicht-Zweierpotenzen', () => {
    expect(planBracket(9)).toEqual({ bracketSize: 8, numRounds: 3, cadrageCount: 2, ohneCadrage: 7 });
    expect(planBracket(17)).toEqual({ bracketSize: 16, numRounds: 4, cadrageCount: 2, ohneCadrage: 15 });
  });

  it('roundTitle wird dynamisch aus der Rundenzahl abgeleitet', () => {
    expect(roundTitle(3, 3)).toBe('Finale');
    expect(roundTitle(2, 3)).toBe('Halbfinale');
    expect(roundTitle(1, 3)).toBe('1/4-Finale');
    expect(roundTitle(1, 4)).toBe('1/8-Finale');
  });
});

describe('K.O. - Gruppenaufteilung (GruppenAufteilungRechner)', () => {
  it('ein Feld <= maxGroupSize bleibt eine Gruppe', () => {
    const ids = Array.from({ length: 16 }, (_, i) => `t${i + 1}`);
    expect(assignGroups(ids).every((entry) => entry.group === 'A')).toBe(true);
  });

  it('Blockbildung ohne Faltung, wenn die letzte Gruppe genau minLastGroupSize erreicht', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `t${i + 1}`);
    const assignment = assignGroups(ids, { maxGroupSize: 16, minLastGroupSize: 4 });
    expect(assignment.filter((e) => e.group === 'A')).toHaveLength(16);
    expect(assignment.filter((e) => e.group === 'B')).toHaveLength(4);
  });

  it('eine zu kleine letzte Gruppe wird in die vorherige gefaltet', () => {
    const ids = Array.from({ length: 18 }, (_, i) => `t${i + 1}`);
    const assignment = assignGroups(ids, { maxGroupSize: 16, minLastGroupSize: 4 });
    expect(new Set(assignment.map((e) => e.group))).toEqual(new Set(['A']));
    expect(assignment).toHaveLength(18);
  });
});

describe('K.O. - checkRequirements', () => {
  it('mindestens 2 Teams', () => {
    expect(checkRequirements(1)).toEqual([{ type: 'minPlayers', min: 2 }]);
    expect(checkRequirements(2)).toEqual([]);
  });

  it('nur mit Anmeldeart Formée online spielbar', () => {
    expect(checkRequirements(8, { registrationType: 'melee' })).toEqual([
      { type: 'message', text: 'K.O. ist online nur mit Anmeldeart "Formée" (feste Teams) spielbar.' },
    ]);
    expect(checkRequirements(8, { registrationType: 'forme' })).toEqual([]);
  });
});

describe('K.O. - vollständiger Turnierdurchlauf (Zweierpotenz, 8 Teams)', () => {
  it('erzeugt genau 3 Runden und krönt Seed 1 als Sieger', () => {
    const teams = teamsOf(8);
    const { rounds } = playAllRounds(teams, { platz3: true });
    expect(rounds).toHaveLength(3);
    expect(rounds[0]).toHaveLength(4);
    expect(rounds[1]).toHaveLength(2);
    expect(rounds[2]).toHaveLength(2); // Finale + Spiel um Platz 3
  });

  it('Finale und Spiel um Platz 3 ergeben Sieger/Finalist/Platz3/Platz4 in der erwarteten Reihenfolge', () => {
    const teams = teamsOf(8);
    const { rounds } = playAllRounds(teams, { platz3: true });
    const [finalMatch, platz3Match] = rounds[2];
    expect(finalMatch.label).toBe('Finale');
    expect(winner(finalMatch)).toBe('t1');
    expect(loser(finalMatch)).toBe('t2');
    expect(platz3Match.label).toBe('Spiel um Platz 3');
    expect(winner(platz3Match)).toBe('t3');
    expect(loser(platz3Match)).toBe('t4');
  });

  it('ohne Platz3 wird nur das Finale gespielt, kein zusätzliches Match', () => {
    const teams = teamsOf(8);
    const { rounds } = playAllRounds(teams, { platz3: false });
    expect(rounds[2]).toHaveLength(1);
    expect(rounds[2][0].label).toBe('Finale');
  });
});

describe('K.O. - Cadrage statt Freilos (10 Teams, Hauptprojekt-Beispiel)', () => {
  it('erzeugt Cadrage + 3 Hauptrunden', () => {
    const teams = teamsOf(10);
    const { rounds } = playAllRounds(teams, { platz3: true });
    expect(rounds).toHaveLength(4);
    expect(rounds[0]).toHaveLength(2); // Cadrage: 4 Teams -> 2 Spiele
    expect(rounds[1]).toHaveLength(4); // Hauptrunde 1 (8 Teams)
    expect(rounds[2]).toHaveLength(2);
    expect(rounds[3]).toHaveLength(2); // Finale + Platz3
  });

  it('Cadrage-Sieger füllen die Hauptrunde-1-Slots, Finale/Platz3 wie bei der reinen Zweierpotenz', () => {
    const teams = teamsOf(10);
    const { rounds } = playAllRounds(teams, { platz3: true });
    expect(rounds[0].map(winner).sort()).toEqual(['t7', 't8']);
    const [finalMatch, platz3Match] = rounds[3];
    expect(winner(finalMatch)).toBe('t1');
    expect(loser(finalMatch)).toBe('t2');
    expect(winner(platz3Match)).toBe('t3');
    expect(loser(platz3Match)).toBe('t4');
  });
});

describe('K.O. - Gruppenaufteilung im Rundenbetrieb (2 unabhängige Bäume)', () => {
  it('Gruppen laufen unabhängig, längere Gruppe bestimmt die Gesamtrundenzahl', () => {
    const groups = [...Array(16).fill('A'), ...Array(4).fill('B')];
    const teams = teamsOf(20, groups);
    const { rounds } = playAllRounds(teams, { platz3: true });
    // Gruppe A (16 Teams, 4 Runden) laeuft laenger als Gruppe B (4 Teams, 2 Runden)
    expect(rounds).toHaveLength(4);
    expect(rounds[0].some((m) => m.label.includes('Gruppe A'))).toBe(true);
    expect(rounds[0].some((m) => m.label.includes('Gruppe B'))).toBe(true);
    // In den letzten beiden Runden spielt nur noch Gruppe A
    expect(rounds[2].every((m) => m.label.includes('Gruppe A'))).toBe(true);
    expect(rounds[3].every((m) => m.label.includes('Gruppe A'))).toBe(true);
  });

  it('jedes Gruppen-Finale krönt den jeweils bestgesetzten Teilnehmer seiner eigenen Gruppe', () => {
    const groups = [...Array(16).fill('A'), ...Array(4).fill('B')];
    const teams = teamsOf(20, groups);
    const { rounds } = playAllRounds(teams, { platz3: true });
    const groupBFinal = rounds[1].find((m) => m.label.includes('Gruppe B') && m.label.startsWith('Finale'));
    expect(winner(groupBFinal)).toBe('t17'); // Sieger Gruppe B (bestgesetztes Team der Gruppe)
    const groupAFinal = rounds[3].find((m) => m.label.includes('Gruppe A') && m.label.startsWith('Finale'));
    expect(winner(groupAFinal)).toBe('t1'); // Sieger Gruppe A
  });
});
