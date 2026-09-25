import { describe, expect, it } from 'vitest';
import { buildPlayerLiveView, parseSyncRanking, parseSyncRoundMatches, parseSyncRoundNumber, registrationBelongsToEmail, isTournamentStale, dateDaysAgo } from './worker-core.js';

const player = (id, firstName, lastName = 'X', teamLabel) => ({ id, firstName, lastName, teamLabel: teamLabel || `${firstName} ${lastName}` });
const anna = player('r1', 'Anna');
const ben = player('r2', 'Ben');
const carl = player('r3', 'Carl');
const dora = player('r4', 'Dora');
const eva = player('r5', 'Eva');

const rounds = [
  { roundNumber: 1, matches: [
    { id: 'm1', teamA: [anna, ben], teamB: [carl, dora], scoreA: 13, scoreB: 8, noShow: null },
    { id: 'm2', teamA: [eva], teamB: [], scoreA: 13, scoreB: 7, noShow: null },
  ] },
  { roundNumber: 2, matches: [
    { id: 'm3', teamA: [carl, eva], teamB: [anna, dora], scoreA: null, scoreB: null, noShow: null, court: '7' },
  ] },
];

describe('Live-Ansicht eines Spielers', () => {
  it('liefert aktuelle Partie mit Bahn, Historie und Bilanz', () => {
    const view = buildPlayerLiveView({ registrationId: 'r1', rounds, ranking: [] });
    expect(view.lastRoundNumber).toBe(2);
    expect(view.currentMatch).toMatchObject({ roundNumber: 2, court: '7', opponentLabel: 'Carl X + Eva X', outcome: 'open', teammates: ['Dora X'] });
    expect(view.history.map((entry) => entry.roundNumber)).toEqual([2, 1]);
    expect(view.history[1]).toMatchObject({ outcome: 'won', ownScore: 13, opponentScore: 8, court: null });
    expect(view.summary).toEqual({ played: 1, wins: 1, losses: 0, pointsFor: 13, pointsAgainst: 8 });
  });

  it('zeigt Team B korrekt aus Sicht der B-Seite und erkennt Niederlagen', () => {
    const view = buildPlayerLiveView({ registrationId: 'r3', rounds: rounds.slice(0, 1), ranking: [] });
    expect(view.currentMatch).toMatchObject({ ownScore: 8, opponentScore: 13, outcome: 'lost', opponentLabel: 'Anna X + Ben X' });
  });

  it('erkennt ein Freilos', () => {
    const view = buildPlayerLiveView({ registrationId: 'r5', rounds: rounds.slice(0, 1), ranking: [] });
    expect(view.currentMatch).toMatchObject({ bye: true, opponentLabel: null, outcome: 'won' });
  });

  it('hat keine aktuelle Partie, wenn der Spieler in der letzten Runde fehlt', () => {
    const view = buildPlayerLiveView({ registrationId: 'r2', rounds, ranking: [] });
    expect(view.currentMatch).toBeNull();
    expect(view.history).toHaveLength(1);
  });

  it('kommt ohne Runden aus', () => {
    const view = buildPlayerLiveView({ registrationId: 'r1', rounds: [], ranking: [] });
    expect(view).toMatchObject({ lastRoundNumber: null, currentMatch: null, history: [], rankingPlace: null, rankingSize: 0 });
  });

  it('wertet Nichtantreten aus Sicht beider Seiten', () => {
    const noShowRounds = [{ roundNumber: 1, matches: [{ id: 'm', teamA: [anna], teamB: [ben], scoreA: null, scoreB: null, noShow: 'a' }] }];
    expect(buildPlayerLiveView({ registrationId: 'r1', rounds: noShowRounds }).currentMatch.outcome).toBe('lost');
    expect(buildPlayerLiveView({ registrationId: 'r2', rounds: noShowRounds }).currentMatch.outcome).toBe('won');
  });

  it('markiert den eigenen Ranglistenplatz', () => {
    const ranking = [
      { rank: 1, registrationIds: ['r5'], label: 'Eva' },
      { rank: 2, registrationIds: ['r1', 'r2'], label: 'Anna + Ben' },
    ];
    const view = buildPlayerLiveView({ registrationId: 'r2', rounds, ranking });
    expect(view.rankingPlace).toBe(2);
    expect(view.rankingSize).toBe(2);
    expect(view.ranking.map((entry) => entry.own)).toEqual([false, true]);
  });
});

describe('Sync von Runden und Rangliste aus dem Turnierdokument', () => {
  const ids = new Set(['r1', 'r2', 'r3', 'r4']);

  it('normalisiert Partien inkl. Bahn, Freilos und offenen Ergebnissen', () => {
    const matches = parseSyncRoundMatches({ matches: [
      { teamA: ['r1'], teamB: ['r2'], scoreA: 13, scoreB: '5', court: ' 12 ' },
      { teamA: ['r3'], scoreA: null, stageLabel: 'Finale', matchIndex: 4 },
    ] }, ids);
    expect(matches).toEqual([
      { teamA: ['r1'], teamB: ['r2'], scoreA: 13, scoreB: 5, court: '12', stageLabel: null, matchIndex: 0 },
      { teamA: ['r3'], teamB: [], scoreA: null, scoreB: null, court: null, stageLabel: 'Finale', matchIndex: 4 },
    ]);
  });

  it('weist ungültige Partien ab', () => {
    expect(() => parseSyncRoundMatches({}, ids)).toThrow('Partien müssen als Array übergeben werden');
    expect(() => parseSyncRoundMatches({ matches: [{ teamA: ['fremd'], teamB: [] }] }, ids)).toThrow('Ungültige Meldung in einer Partie');
    expect(() => parseSyncRoundMatches({ matches: [{ teamA: [], teamB: ['r1'] }] }, ids)).toThrow('Ungültige Meldung in einer Partie');
    expect(() => parseSyncRoundMatches({ matches: [{ teamA: ['r1'], teamB: ['r1'] }] }, ids)).toThrow('mehrfach');
    expect(() => parseSyncRoundMatches({ matches: [{ teamA: ['r1'] }, { teamA: ['r1'] }] }, ids)).toThrow('mehrfach');
    expect(() => parseSyncRoundMatches({ matches: [{ teamA: ['r1'], scoreA: 14 }] }, ids)).toThrow('Ungültiges Ergebnis');
    expect(() => parseSyncRoundMatches({ matches: [{ teamA: ['r1'], court: 'x'.repeat(41) }] }, ids)).toThrow('Ungültige Bahn');
    expect(() => parseSyncRoundMatches({ matches: [{ teamA: ['r1'], matchIndex: -1 }] }, ids)).toThrow('Ungültige Partie-Nummer');
  });

  it('prüft die Rundennummer', () => {
    expect(parseSyncRoundNumber('3')).toBe(3);
    expect(() => parseSyncRoundNumber('0')).toThrow('Ungültige Rundennummer');
    expect(() => parseSyncRoundNumber('abc')).toThrow('Ungültige Rundennummer');
  });

  it('normalisiert den Ranglisten-Snapshot', () => {
    expect(parseSyncRanking({ entries: [
      { place: 1, registrationIds: ['r1', 'r2'], wins: 3, pointsFor: 39, pointsAgainst: 20 },
      { place: 2, registrationIds: ['r3'] },
    ] }, ids)).toEqual([
      { rank: 1, registrationIds: ['r1', 'r2'], wins: 3, pointsFor: 39, pointsAgainst: 20, pointsDiff: 19 },
      { rank: 2, registrationIds: ['r3'], wins: null, pointsFor: null, pointsAgainst: null, pointsDiff: null },
    ]);
    expect(() => parseSyncRanking({ entries: 'x' }, ids)).toThrow('Rangliste muss als Array übergeben werden');
    expect(() => parseSyncRanking({ entries: [{ place: 0, registrationIds: ['r1'] }] }, ids)).toThrow('Ungültiger Ranglistenplatz');
    expect(() => parseSyncRanking({ entries: [{ place: 1, registrationIds: [] }] }, ids)).toThrow('Ungültige Meldung in der Rangliste');
  });
});

describe('Zuordnung von Meldungen zu einem User', () => {
  it('erkennt Haupt- und Partner-E-Mail ohne Groß-/Kleinschreibung', () => {
    const registration = { email: 'a@x.de', partner_email: 'B@X.de', partner2_email: null };
    expect(registrationBelongsToEmail(registration, 'A@x.de')).toBe(true);
    expect(registrationBelongsToEmail(registration, 'b@x.de')).toBe(true);
    expect(registrationBelongsToEmail(registration, 'c@x.de')).toBe(false);
    expect(registrationBelongsToEmail(registration, '')).toBe(false);
  });
});

describe('Automatischer Turnierabschluss', () => {
  it('gilt genau 48 Stunden nach Turnierbeginn als abgelaufen', () => {
    const start = '2026-09-20T08:00:00.000Z';
    expect(isTournamentStale(start, new Date('2026-09-22T07:59:00Z'))).toBe(false);
    expect(isTournamentStale(start, new Date('2026-09-22T08:00:00Z'))).toBe(true);
    expect(isTournamentStale('ungültig', new Date('2026-09-22T08:00:00Z'))).toBe(false);
  });

  it('liefert das Vorauswahl-Datum in UTC', () => {
    expect(dateDaysAgo(1, new Date('2026-09-25T01:00:00Z'))).toBe('2026-09-24');
    expect(dateDaysAgo(4, new Date('2026-03-01T00:30:00Z'))).toBe('2026-02-25');
  });
});
