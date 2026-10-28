import { describe, expect, it } from 'vitest';
import { sameSwissRankingPlace, sortSwiss, swissStats, generateRound } from './schweizer.js';
import runde16History from './schweizer.32-teams-runde-16.json';

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

  it('berücksichtigt Buchholz und Feinbuchholz beim geteilten Platz', () => {
    const base = { wins: 2, pointsDiff: 12, pointsFor: 26 };
    expect(sameSwissRankingPlace({ ...base, bhz: 3, fbhz: 4 }, { ...base, bhz: 3, fbhz: 4 })).toBe(true);
    expect(sameSwissRankingPlace({ ...base, bhz: 3, fbhz: 4 }, { ...base, bhz: 4, fbhz: 4 })).toBe(false);
    expect(sameSwissRankingPlace({ ...base, bhz: 3, fbhz: 4 }, { ...base, bhz: 4, fbhz: 4 }, 'ohne_buchholz')).toBe(true);
  });

  it('erzeugt keine vermeidbare Wiederholung, wenn die oberste Sieggruppe festsitzt (Hauptprojekt test-schweizer.ods, Runde 4)', () => {
    // Runden 1–3: 3–2, 5–4, 6–1 | 5–3, 1–2, 6–4 | 4–2, 3–1, 6–5 → Rangfolge 5, 3, 6, 4, 2, 1
    const game = (a, b, scoreA, scoreB) => ({ teamA: [`t${a}`], teamB: [`t${b}`], scoreA, scoreB });
    const history = [
      game(3, 2, 13, 12), game(5, 4, 13, 12), game(6, 1, 13, 0),
      game(5, 3, 13, 12), game(1, 2, 13, 12), game(6, 4, 7, 13),
      game(4, 2, 12, 13), game(3, 1, 13, 12), game(6, 5, 12, 13),
    ];
    expect(sortSwiss(swissStats(teams, history)).map((entry) => entry.teamId)).toEqual(['t5', 't3', 't6', 't4', 't2', 't1']);
    const { matches } = generateRound(teams, history);
    expect(matches.map((match) => `${match.teamA[0]}–${match.teamB[0]}`)).toEqual(['t5–t2', 't3–t6', 't4–t1']);
  });

  it('lässt nur unvermeidbare Wiederholungen zu, und so wenige wie möglich', () => {
    // t1 hat schon gegen t2..t6 gespielt; nur t1 muss wiederholen, die übrigen werden neu gepaart
    const history = ['t2', 't3', 't4', 't5', 't6'].map((id) => ({ teamA: ['t1'], teamB: [id], scoreA: 13, scoreB: 7 }));
    const { matches } = generateRound(teams, history);
    const played = new Set(history.map((match) => match.teamB[0]));
    expect(matches).toHaveLength(3);
    expect(matches.filter((match) => match.teamA[0] === 't1' && played.has(match.teamB[0]))).toHaveLength(1);
    expect(new Set(matches.flatMap((match) => [...match.teamA, ...match.teamB])).size).toBe(6);
  });

  it('findet auch in späten Runden großer Felder eine wiederholungsfreie Paarung, wenn es eine gibt', () => {
    // Review-Fall 32 Teams, Runde 16: das frühere Backtracking mit Suchbudget lieferte acht Wiederholungen
    // (und brauchte fast eine Sekunde CPU), obwohl eine Paarung ohne Wiederholung existiert.
    const id = (index) => `t${String(index).padStart(3, '0')}`;
    const fieldTeams = Array.from({ length: 32 }, (_, index) => ({ id: id(index) }));
    const history = runde16History.map(([a, b, scoreA, scoreB]) => ({ teamA: [id(a)], teamB: [id(b)], scoreA, scoreB }));
    const played = new Set(history.map((match) => [match.teamA[0], match.teamB[0]].sort().join('|')));
    const { matches } = generateRound(fieldTeams, history);
    expect(new Set(matches.flatMap((match) => [...match.teamA, ...match.teamB])).size).toBe(32);
    expect(matches.filter((match) => played.has([match.teamA[0], match.teamB[0]].sort().join('|')))).toEqual([]);
  });
});
