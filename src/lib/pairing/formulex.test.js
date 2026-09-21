import { describe, expect, it } from 'vitest';
import {
  checkRequirements, findByeTeam, formuleXStats, generateRound, getSiegaufschlag,
  pairLinearWithSwap, sameFormuleXRankingPlace, sortFormuleX,
} from './formulex.js';

const teamsOf = (count) => Array.from({ length: count }, (_, index) => ({ id: `t${index + 1}` }));

// Baut eine minimale statsById-Map (nur opponents/hadBye) für pairLinearWithSwap/findByeTeam,
// analog zu den FormuleXErgebnis-Fixtures in FormuleXTest.java.
function statsMap(entries) {
  return new Map(entries.map(([id, opponents = [], hadBye = false]) => [id, { opponents: new Set(opponents), hadBye }]));
}

// weitereRunde() aus FormuleX.java: Freilos ermitteln (bei ungerader Zahl), Rest linear mit
// Swap paaren, Freilos ans Ende anhängen - dieselbe Komposition wie generateRound() intern.
function weitereRunde(ordered, byId) {
  let rest = ordered;
  let bye = null;
  if (ordered.length % 2) {
    const byeTeam = findByeTeam(ordered.map((id) => ({ id })), byId);
    rest = ordered.filter((id) => id !== byeTeam.id);
    bye = { teamA: [byeTeam.id], teamB: [] };
  }
  const matches = pairLinearWithSwap(rest.map((id) => ({ id })), byId);
  if (bye) matches.push(bye);
  return matches;
}

describe('Formule X - Siegaufschlag (FormuleXTest#testSiegaufschlag*)', () => {
  it('100 bei bis zu 4 gespielten Runden', () => {
    for (const n of [1, 2, 3, 4]) expect(getSiegaufschlag(n)).toBe(100);
  });
  it('200 bei 5 bis 8 gespielten Runden', () => {
    for (const n of [5, 6, 7, 8]) expect(getSiegaufschlag(n)).toBe(200);
  });
  it('300 bei mehr als 8 gespielten Runden', () => {
    for (const n of [9, 10, 12, 13, 20]) expect(getSiegaufschlag(n)).toBe(300);
  });
});

describe('Formule X - Wertungsberechnung (FormuleXTest#testWertungsscore*)', () => {
  const teams = teamsOf(2);

  it('Sieger 13:7 bei Siegaufschlag 100 -> 100+13+6=119', () => {
    const stats = formuleXStats(teams, [{ teamA: ['t1'], teamB: ['t2'], scoreA: 13, scoreB: 7 }], 4);
    expect(stats.find((e) => e.teamId === 't1').wertung).toBe(119);
  });

  it('Verlierer 7:13 -> nur eigene Punkte', () => {
    const stats = formuleXStats(teams, [{ teamA: ['t1'], teamB: ['t2'], scoreA: 7, scoreB: 13 }], 4);
    expect(stats.find((e) => e.teamId === 't1').wertung).toBe(7);
  });

  it('Zeitlimit-Sieg 10:4 -> 100+10+6=116', () => {
    const stats = formuleXStats(teams, [{ teamA: ['t1'], teamB: ['t2'], scoreA: 10, scoreB: 4 }], 4);
    expect(stats.find((e) => e.teamId === 't1').wertung).toBe(116);
  });

  it('Freilos -> fix 126, keine Punkte-Aggregation', () => {
    const stats = formuleXStats(teams, [{ teamA: ['t1'], teamB: [] }], 4);
    const entry = stats.find((e) => e.teamId === 't1');
    expect(entry).toMatchObject({ wins: 1, wertung: 126, pointsFor: 0, pointsAgainst: 0 });
  });

  it('Unentschieden zählt als Verlierer für beide Seiten', () => {
    const stats = formuleXStats(teams, [{ teamA: ['t1'], teamB: ['t2'], scoreA: 5, scoreB: 5 }], 4);
    expect(stats.find((e) => e.teamId === 't1').wertung).toBe(5);
    expect(stats.find((e) => e.teamId === 't2').wertung).toBe(5);
  });
});

describe('Formule X - erste Runde (FormuleXTest#testErsteRunde*)', () => {
  it('gerade Teamzahl: vollständige Paarung ohne Freilos', () => {
    const { matches } = generateRound(teamsOf(6), []);
    expect(matches).toHaveLength(3);
    expect(matches.every((match) => match.teamB.length)).toBe(true);
    expect(new Set(matches.flatMap((match) => [...match.teamA, ...match.teamB])).size).toBe(6);
  });

  it('ungerade Teamzahl: Freilos am Ende', () => {
    const { matches } = generateRound(teamsOf(5), []);
    expect(matches).toHaveLength(3);
    expect(matches[0].teamB.length).toBeGreaterThan(0);
    expect(matches[1].teamB.length).toBeGreaterThan(0);
    expect(matches[2].teamB).toEqual([]);
  });

  it('Minimalfall 2 Teams: eine Paarung, kein Freilos', () => {
    const { matches } = generateRound(teamsOf(2), []);
    expect(matches).toEqual([{ teamA: expect.any(Array), teamB: expect.any(Array) }]);
    expect(matches[0].teamB).toHaveLength(1);
  });
});

describe('Formule X - Paarung weiterer Runden (FormuleXTest#testWeitereRunde*/testRematch*/testSwap*)', () => {
  it('ohne Historie: 1vs2, 3vs4', () => {
    const byId = statsMap([['t1'], ['t2'], ['t3'], ['t4']]);
    const matches = weitereRunde(['t1', 't2', 't3', 't4'], byId);
    expect(matches).toEqual([{ teamA: ['t1'], teamB: ['t2'] }, { teamA: ['t3'], teamB: ['t4'] }]);
  });

  it('Rematch 1vs2 wird zu 1vs3 und 2vs4 geswapt', () => {
    const byId = statsMap([['t1', ['t2']], ['t2', ['t1']], ['t3'], ['t4']]);
    const matches = weitereRunde(['t1', 't2', 't3', 't4'], byId);
    expect(matches).toEqual([{ teamA: ['t1'], teamB: ['t3'] }, { teamA: ['t2'], teamB: ['t4'] }]);
  });

  it('Rematch-Kette: keine Paarung enthält bereits gespielte Gegner', () => {
    const byId = statsMap([
      ['t1', ['t2', 't3']], ['t2', ['t1', 't4']], ['t3', ['t1']], ['t4', ['t2']], ['t5'], ['t6'],
    ]);
    const matches = weitereRunde(['t1', 't2', 't3', 't4', 't5', 't6'], byId);
    expect(matches).toHaveLength(3);
    for (const match of matches) {
      expect(byId.get(match.teamA[0]).opponents.has(match.teamB[0])).toBe(false);
    }
  });

  it('zweiter Swap-Pfad (A,D)+(C,B) greift, wenn (A,C)+(B,D) fehlschlägt', () => {
    const byId = statsMap([['t1', ['t2', 't3']], ['t2', ['t1']], ['t3', ['t1']], ['t4']]);
    const matches = weitereRunde(['t1', 't2', 't3', 't4'], byId);
    expect(matches).toEqual([{ teamA: ['t1'], teamB: ['t4'] }, { teamA: ['t3'], teamB: ['t2'] }]);
  });

  it('2 Teams ohne Rematch: eine Paarung', () => {
    const byId = statsMap([['t1'], ['t2']]);
    expect(weitereRunde(['t1', 't2'], byId)).toEqual([{ teamA: ['t1'], teamB: ['t2'] }]);
  });

  it('2 Teams mit Rematch: kein Swap möglich, Rematch wird akzeptiert (Fail-Safe)', () => {
    const byId = statsMap([['t1', ['t2']], ['t2', ['t1']]]);
    expect(weitereRunde(['t1', 't2'], byId)).toEqual([{ teamA: ['t1'], teamB: ['t2'] }]);
  });

  it('alle haben gegeneinander gespielt: Rematch wird ohne Fehler akzeptiert', () => {
    const byId = statsMap([
      ['t1', ['t2', 't3', 't4']], ['t2', ['t1', 't3', 't4']], ['t3', ['t1', 't2', 't4']], ['t4', ['t1', 't2', 't3']],
    ]);
    expect(weitereRunde(['t1', 't2', 't3', 't4'], byId)).toHaveLength(2);
  });
});

describe('Formule X - Freilos-Ermittlung (FormuleXTest#testFindeByeTeam*/testUngerade*/testBYE*)', () => {
  it('ungerade Teamzahl ohne bisheriges Freilos: schlechtest platziertes Team', () => {
    const byId = statsMap([['t1'], ['t2'], ['t3'], ['t4'], ['t5']]);
    const matches = weitereRunde(['t1', 't2', 't3', 't4', 't5'], byId);
    expect(matches).toHaveLength(3);
    expect(matches[2]).toEqual({ teamA: ['t5'], teamB: [] });
  });

  it('Freilos nicht zweimal hintereinander: nächstschlechtestes Team ohne Freilos', () => {
    const byId = statsMap([['t1'], ['t2'], ['t3'], ['t4'], ['t5', [], true]]);
    const matches = weitereRunde(['t1', 't2', 't3', 't4', 't5'], byId);
    expect(matches[2]).toEqual({ teamA: ['t4'], teamB: [] });
  });

  it('alle hatten schon Freilos: Fallback letztes Team', () => {
    const byId = statsMap([['t1', [], true], ['t2', [], true], ['t3', [], true], ['t4', [], true], ['t5', [], true]]);
    const matches = weitereRunde(['t1', 't2', 't3', 't4', 't5'], byId);
    expect(matches[2]).toEqual({ teamA: ['t5'], teamB: [] });
  });

  it('einige mit Freilos: schlechtest platziertes Team ohne Freilos gewinnt', () => {
    const byId = statsMap([['t1', [], true], ['t2'], ['t3', [], true], ['t4'], ['t5']]);
    const bye = findByeTeam(['t1', 't2', 't3', 't4', 't5'].map((id) => ({ id })), byId);
    expect(bye.id).toBe('t5');
  });

  it('nur letztes Team hatte Freilos: vorletztes bekommt Freilos', () => {
    const byId = statsMap([['t1'], ['t2'], ['t3'], ['t4', [], true]]);
    const bye = findByeTeam(['t1', 't2', 't3', 't4'].map((id) => ({ id })), byId);
    expect(bye.id).toBe('t3');
  });
});

describe('Formule X - Rangliste (FormuleXRanglisteRechnerTest)', () => {
  const base = (teamId, overrides) => ({ teamId, wins: 0, wertung: 0, pointsDiff: 0, pointsFor: 0, gamesAgainst: new Map(), ...overrides });

  it('leere Liste liefert leere Liste', () => {
    expect(sortFormuleX([])).toEqual([]);
  });

  it('Sieganzahl ist Hauptkriterium', () => {
    const team1 = base('t1', { wins: 3, wertung: 300 });
    const team2 = base('t2', { wins: 2, wertung: 500 });
    expect(sortFormuleX([team2, team1]).map((e) => e.teamId)).toEqual(['t1', 't2']);
  });

  it('Wertung entscheidet bei gleicher Sieganzahl', () => {
    const team1 = base('t1', { wins: 3, wertung: 400 });
    const team2 = base('t2', { wins: 3, wertung: 350 });
    expect(sortFormuleX([team2, team1]).map((e) => e.teamId)).toEqual(['t1', 't2']);
  });

  it('Punktedifferenz entscheidet bei gleicher Siegzahl/Wertung', () => {
    const team1 = base('t1', { wins: 2, wertung: 300, pointsDiff: 10 });
    const team2 = base('t2', { wins: 2, wertung: 300, pointsDiff: 5 });
    expect(sortFormuleX([team2, team1]).map((e) => e.teamId)).toEqual(['t1', 't2']);
  });

  it('eigene Punkte entscheiden bei gleicher Punktedifferenz', () => {
    const team1 = base('t1', { wins: 2, wertung: 300, pointsDiff: 5, pointsFor: 60 });
    const team2 = base('t2', { wins: 2, wertung: 300, pointsDiff: 5, pointsFor: 55 });
    expect(sortFormuleX([team2, team1]).map((e) => e.teamId)).toEqual(['t1', 't2']);
  });

  it('Direktvergleich entscheidet bei vollständigem Gleichstand zweier Teams', () => {
    const team1 = base('t1', { wins: 2, wertung: 300, pointsDiff: 5, pointsFor: 50, gamesAgainst: new Map([['t2', { ownScore: 13, oppScore: 7 }]]) });
    const team2 = base('t2', { wins: 2, wertung: 300, pointsDiff: 5, pointsFor: 50, gamesAgainst: new Map([['t1', { ownScore: 7, oppScore: 13 }]]) });
    expect(sortFormuleX([team2, team1]).map((e) => e.teamId)).toEqual(['t1', 't2']);
  });

  it('ohne Direktvergleich: Fallback auf Teamnummer', () => {
    const team2 = base('t2', { wins: 2, wertung: 300, pointsDiff: 5, pointsFor: 50 });
    const team1 = base('t1', { wins: 2, wertung: 300, pointsDiff: 5, pointsFor: 50 });
    expect(sortFormuleX([team2, team1]).map((e) => e.teamId)).toEqual(['t1', 't2']);
  });

  it('zyklischer Dreier-Gleichstand: Fallback auf Teamnummer', () => {
    const t1 = base('t1', { wins: 1, wertung: 200, pointsFor: 20, gamesAgainst: new Map([['t2', { ownScore: 13, oppScore: 7 }], ['t3', { ownScore: 7, oppScore: 13 }]]) });
    const t2 = base('t2', { wins: 1, wertung: 200, pointsFor: 20, gamesAgainst: new Map([['t3', { ownScore: 13, oppScore: 7 }], ['t1', { ownScore: 7, oppScore: 13 }]]) });
    const t3 = base('t3', { wins: 1, wertung: 200, pointsFor: 20, gamesAgainst: new Map([['t1', { ownScore: 13, oppScore: 7 }], ['t2', { ownScore: 7, oppScore: 13 }]]) });
    expect(sortFormuleX([t3, t1, t2]).map((e) => e.teamId)).toEqual(['t1', 't2', 't3']);
  });

  it('Freilos-Team ohne Spielergebnisse wird korrekt einsortiert', () => {
    const mitFreilos = base('t1', { wins: 3, wertung: 378 });
    const ohneFreilos = base('t2', { wins: 2, wertung: 238 });
    expect(sortFormuleX([ohneFreilos, mitFreilos]).map((e) => e.teamId)).toEqual(['t1', 't2']);
  });

  it('sameFormuleXRankingPlace erkennt vollständigen Gleichstand', () => {
    const a = base('t1', { wins: 2, wertung: 300, pointsDiff: 5, pointsFor: 50 });
    const b = base('t2', { wins: 2, wertung: 300, pointsDiff: 5, pointsFor: 50 });
    expect(sameFormuleXRankingPlace(a, b)).toBe(true);
    expect(sameFormuleXRankingPlace(a, { ...b, wertung: 299 })).toBe(false);
  });
});

describe('Formule X - Voraussetzungen und Rundenende', () => {
  it('erfordert mindestens 4 Teams', () => {
    expect(checkRequirements(3)).toEqual([{ type: 'minPlayers', min: 4 }]);
    expect(checkRequirements(4)).toEqual([]);
  });

  it('weist bei anderer Anmeldeart als Formée auf die Einschränkung hin', () => {
    expect(checkRequirements(6, { registrationType: 'melee' })).toEqual([
      { type: 'message', text: 'Formule X ist online nur mit Anmeldeart "Formée" (feste Teams) spielbar.' },
    ]);
  });

  it('meldet Turnierende, wenn die konfigurierte Rundenzahl erreicht ist', () => {
    expect(checkRequirements(6, { registrationType: 'forme', roundsPlayed: 4, formuleXRounds: 4 })).toEqual([
      { type: 'message', text: 'Alle Runden wurden bereits gespielt.' },
    ]);
  });

  it('generateRound wirft, wenn alle konfigurierten Runden bereits gespielt sind', () => {
    const teams = teamsOf(4);
    const history = Array.from({ length: 2 * 4 }, (_, i) => ({ teamA: [teams[i % 4].id], teamB: [teams[(i + 1) % 4].id], scoreA: 13, scoreB: 5 }));
    expect(() => generateRound(teams, history, { formuleXRounds: 4 })).toThrow('Alle Runden wurden bereits gespielt.');
  });
});
