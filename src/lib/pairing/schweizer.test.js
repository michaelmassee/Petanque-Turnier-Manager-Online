import { describe, expect, it } from 'vitest';
import { byeBuchholz, downfloatRounds, orderWithDownfloats, sameSwissRankingPlace, sortSwiss, swissStats, generateRound } from './schweizer.js';
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

  it('lost gleiche Setzposition in Runde 1 nur gegeneinander, wenn es unvermeidbar ist', () => {
    // früher immer ein 1–1 oder 2–2, obwohl 1–2, 1–2, 1–2 und 0–0 möglich ist
    const seeded = [0, 0, 1, 1, 1, 2, 2, 2].map((seedPosition, index) => ({ id: `s${index}`, seedPosition }));
    const seedOf = new Map(seeded.map((team) => [team.id, team.seedPosition]));
    for (let run = 0; run < 200; run++) {
      const { matches } = generateRound(seeded, []);
      expect(matches).toHaveLength(4);
      expect(new Set(matches.flatMap((match) => [...match.teamA, ...match.teamB])).size).toBe(8);
      expect(matches.filter((match) => seedOf.get(match.teamA[0]) > 0 && seedOf.get(match.teamA[0]) === seedOf.get(match.teamB[0]))).toEqual([]);
    }
  });

  it('gibt das Freilos in Runde 1 nicht an gesetzte Teams, solange ungesetzte da sind', () => {
    // 7 Teams, 4 gesetzt: Freilos an ein ungesetztes, von 4 gesetzten unter 6 Teams spielt genau ein Paar gegeneinander
    const seeded = [0, 0, 0, 1, 1, 1, 1].map((seedPosition, index) => ({ id: `s${index}`, seedPosition }));
    const seedOf = new Map(seeded.map((team) => [team.id, team.seedPosition]));
    for (let run = 0; run < 200; run++) {
      const { matches } = generateRound(seeded, []);
      const byes = matches.filter((match) => !match.teamB.length);
      expect(byes).toHaveLength(1);
      expect(seedOf.get(byes[0].teamA[0])).toBe(0);
      expect(matches.filter((match) => match.teamB.length && seedOf.get(match.teamA[0]) === 1 && seedOf.get(match.teamB[0]) === 1)).toHaveLength(1);
    }
  });

  it('gibt das Freilos an das schlechteste Team, wenn alle schon eins hatten', () => {
    const seven = Array.from({ length: 7 }, (_, index) => ({ id: `t${index + 1}` }));
    const history = seven.map((team) => ({ teamA: [team.id], teamB: [] }));
    history.push({ teamA: ['t7'], teamB: ['t6'], scoreA: 0, scoreB: 13 });
    const last = sortSwiss(swissStats(seven, history)).at(-1).teamId;
    const { matches } = generateRound(seven, history);
    expect(matches.filter((match) => !match.teamB.length).map((match) => match.teamA[0])).toEqual([last]);
  });
});

describe('Schweizer Freilos-Punkte', () => {
  it('bucht die in der Freilos-Partie gespeicherten Punkte, ohne Angabe 13:7', () => {
    const teams = [{ id: 'a' }, { id: 'b' }];
    const stats = (match) => swissStats(teams, [match]).find((entry) => entry.teamId === 'a');
    expect(stats({ teamA: ['a'], teamB: [], scoreA: 11, scoreB: 2 })).toMatchObject({ wins: 1, pointsFor: 11, pointsAgainst: 2 });
    expect(stats({ teamA: ['a'], teamB: [] })).toMatchObject({ wins: 1, pointsFor: 13, pointsAgainst: 7 });
  });
});

// Issue #36, gleiche Fälle wie SchweizerSystemTest im Hauptprojekt.
describe('Schweizer Herunterlosen', () => {
  const eight = Array.from({ length: 8 }, (_, index) => ({ id: `t${index + 1}` }));
  const winsThreeAndFive = new Map(eight.map((team, index) => [team.id, index < 3 ? 3 : 2]));
  const ids = (teams) => teams.map((team) => team.id);
  const floaterFromTop = (floats, round) => orderWithDownfloats(eight, winsThreeAndFive, new Map(Object.entries(floats)), round)[2].id;

  it('erkennt Herunterlosen am Siegstand vor der Runde, Freilos zählt, gleiche Siege zählen nicht', () => {
    const history = [
      { roundNumber: 1, teamA: ['t1'], teamB: ['t2'], scoreA: 13, scoreB: 5 },
      { roundNumber: 1, teamA: ['t3'], teamB: ['t4'], scoreA: 13, scoreB: 5 },
      { roundNumber: 1, teamA: ['t5'], teamB: [] },
      { roundNumber: 2, teamA: ['t1'], teamB: ['t3'] },
      { roundNumber: 2, teamA: ['t5'], teamB: ['t2'], scoreA: 4, scoreB: 13 },
      { roundNumber: 2, teamA: ['t4'], teamB: [] },
    ];
    expect(Object.fromEntries(downfloatRounds(history))).toEqual({ t5: [1, 2], t4: [2] });
  });

  it('liefert ohne roundNumber keine Historie', () => {
    expect(downfloatRounds([{ teamA: ['t1'], teamB: ['t2'], scoreA: 13, scoreB: 5 }]).size).toBe(0);
  });

  it('lost ohne Historie das rangniedrigste Team herunter', () => {
    expect(floaterFromTop({}, 4)).toBe('t3');
  });

  it('schützt das in der letzten Runde heruntergeloste Team', () => {
    expect(floaterFromTop({ t3: [3] }, 4)).toBe('t2');
  });

  it('lost das am seltensten heruntergeloste Team herunter', () => {
    expect(floaterFromTop({ t1: [1], t2: [1, 2], t3: [1, 2] }, 5)).toBe('t1');
  });

  it('die vorletzte Runde schützt vor der Häufigkeit', () => {
    expect(floaterFromTop({ t1: [1, 2], t2: [1, 2], t3: [3] }, 5)).toBe('t2');
  });

  it('die letzte Runde schützt stärker als die vorletzte', () => {
    expect(floaterFromTop({ t1: [4], t2: [3], t3: [4] }, 5)).toBe('t2');
  });

  it('nimmt bei Gleichstand das rangniedrigste Team', () => {
    expect(floaterFromTop({ t1: [1], t2: [1], t3: [1] }, 4)).toBe('t3');
  });

  // Issue #38, gleicher Fall wie SchweizerSystemTest im Hauptprojekt.
  it('lost das Freilos-Team der Vorrunde nicht herunter', () => {
    const nine = Array.from({ length: 9 }, (_, index) => ({ id: `t${index + 1}` }));
    const history = [
      ...[[1, 6], [2, 7], [3, 8], [4, 9]].map(([a, b]) => ({ roundNumber: 1, teamA: [`t${a}`], teamB: [`t${b}`], scoreA: 13, scoreB: 5 })),
      { roundNumber: 1, teamA: ['t5'], teamB: [] },
    ];
    const { matches } = generateRound(nine, history);
    const opponent = (id) => {
      const match = matches.find((entry) => entry.teamB.length && (entry.teamA[0] === id || entry.teamB[0] === id));
      return match.teamA[0] === id ? match.teamB[0] : match.teamA[0];
    };
    expect(['t1', 't2', 't3']).toContain(opponent('t5'));
    expect(['t6', 't7', 't8']).toContain(opponent('t4'));
  });

  it('lost einen eingehenden Floater nicht gleich weiter herunter', () => {
    const wins = new Map(eight.map((team, index) => [team.id, index < 3 ? 3 : index < 5 ? 2 : 1]));
    const ordered = orderWithDownfloats(eight, wins, new Map([['t4', [3]], ['t5', [3]]]), 4);
    expect(ids(ordered)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8']);
  });
});

// Issue #38 Punkt 1, gleiche Regel wie FreilosBuchholz/SchweizerSystemTest im Hauptprojekt.
describe('Schweizer Freilos-Buchholz', () => {
  const three = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
  const byId = (stats) => Object.fromEntries(stats.map((entry) => [entry.teamId, { bhz: entry.bhz, fbhz: entry.fbhz }]));
  const roundOne = [
    { roundNumber: 1, teamA: ['t1'], teamB: ['t2'], scoreA: 13, scoreB: 5 },
    { roundNumber: 1, teamA: ['t3'], teamB: [] },
  ];

  it.each([[1, 1, 0, 1], [2, 2, 0, 3], [3, 2, 1, 5], [4, 3, 1, 9], [5, 3, 2, 13]])('neutral bei %i Runden und %i Siegen: BHZ %d, FBHZ %d', (rounds, wins, bhz, fbhz) => {
    const bye = byeBuchholz('neutral', rounds);
    expect([bye.bhz, bye.fbhz(wins)]).toEqual([bhz, fbhz]);
    const none = byeBuchholz('null', rounds);
    expect([none.bhz, none.fbhz(wins)]).toEqual([0, 0]);
  });

  it('gibt dem Freilos-Team nach Runde 1 dieselben Werte wie einem Sieger', () => {
    expect(byId(swissStats(three, roundOne, 'mit_buchholz', { byeBuchholz: 'neutral' })))
      .toEqual({ t1: { bhz: 0, fbhz: 1 }, t2: { bhz: 1, fbhz: 0 }, t3: { bhz: 0, fbhz: 1 } });
    expect(byId(swissStats(three, roundOne)).t3).toEqual({ bhz: 0, fbhz: 0 });
  });

  it('zählt ein Freilos einer ausgelosten, ungespielten Runde nicht', () => {
    const history = [...roundOne,
      { roundNumber: 2, teamA: ['t1'], teamB: ['t3'] },
      { roundNumber: 2, teamA: ['t2'], teamB: [] }];
    const stats = byId(swissStats(three, history, 'mit_buchholz', { byeBuchholz: 'neutral' }));
    expect(stats.t3).toEqual({ bhz: 0, fbhz: 1 });
    expect(stats.t2).toEqual({ bhz: 1, fbhz: 1 });
  });

  it('rundet den Freilos-Beitrag ab: im Pétanque gibt es keine halben Buchholz-Punkte', () => {
    const history = [...roundOne, { roundNumber: 2, teamA: ['t3'], teamB: ['t2'], scoreA: 13, scoreB: 11 }];
    const neutral = swissStats(three, history, 'mit_buchholz', { byeBuchholz: 'neutral' });
    expect(byId(neutral).t3.bhz).toBe(0);
    expect(neutral.every((entry) => Number.isInteger(entry.bhz) && Number.isInteger(entry.fbhz))).toBe(true);
  });

  it('korrigiert über die BHZ des Freilos-Teams auch die FBHZ seiner Gegner', () => {
    // Drei gewertete Runden: Das Freilos bringt t3 ⌊(3 − 1) / 2⌋ = 1 BHZ, seine Gegner t1 und t2 bekommen ihn in der FBHZ.
    const history = [...roundOne,
      { roundNumber: 2, teamA: ['t3'], teamB: ['t2'], scoreA: 13, scoreB: 11 },
      { roundNumber: 3, teamA: ['t1'], teamB: ['t3'], scoreA: 13, scoreB: 7 }];
    const neutral = byId(swissStats(three, history, 'mit_buchholz', { byeBuchholz: 'neutral' }));
    const none = byId(swissStats(three, history));
    expect(neutral.t3.bhz).toBe(none.t3.bhz + 1);
    expect(neutral.t2.fbhz).toBe(none.t2.fbhz + 1);
    expect(neutral.t1.fbhz).toBe(none.t1.fbhz + 1);
  });
});
