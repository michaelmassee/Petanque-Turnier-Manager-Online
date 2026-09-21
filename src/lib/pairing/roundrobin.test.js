import { describe, expect, it } from 'vitest';
import { checkRequirements, generateRound, pairingsPerRound, totalRounds } from './roundrobin.js';

const teamsOf = (count) => Array.from({ length: count }, (_, index) => ({ id: `t${index + 1}` }));

// Simuliert die App-Nutzung: jede Runde wird einzeln erzeugt und ihre Paarungen
// wandern in die history der nächsten Anfrage (wie in worker.js#generateTournamentRound).
function playAllRounds(teams) {
  const history = [];
  const rounds = [];
  for (let round = 0; round < totalRounds(teams.length); round++) {
    const { matches } = generateRound(teams, history);
    rounds.push(matches);
    history.push(...matches);
  }
  return rounds;
}

describe('Jeder gegen Jeden (Round Robin)', () => {
  it('berechnet Rundenzahl wie im Hauptprojekt (JederGegenJedenTest#testAnzRunden)', () => {
    expect(totalRounds(3)).toBe(3);
    expect(totalRounds(4)).toBe(3);
    expect(totalRounds(5)).toBe(5);
    expect(totalRounds(6)).toBe(5);
    expect(totalRounds(7)).toBe(7);
    expect(totalRounds(8)).toBe(7);
  });

  it('erzeugt für 6 Teams exakt die Hauptprojekt-Paarungen (JederGegenJedenTest#testGenerate_6)', () => {
    const rounds = playAllRounds(teamsOf(6));
    expect(rounds).toHaveLength(5);
    expect(rounds[0]).toEqual([{ teamA: ['t1'], teamB: ['t6'] }, { teamA: ['t2'], teamB: ['t5'] }, { teamA: ['t3'], teamB: ['t4'] }]);
    expect(rounds[1]).toEqual([{ teamA: ['t6'], teamB: ['t2'] }, { teamA: ['t3'], teamB: ['t1'] }, { teamA: ['t4'], teamB: ['t5'] }]);
    expect(rounds[2]).toEqual([{ teamA: ['t3'], teamB: ['t6'] }, { teamA: ['t4'], teamB: ['t2'] }, { teamA: ['t5'], teamB: ['t1'] }]);
    expect(rounds[3]).toEqual([{ teamA: ['t6'], teamB: ['t4'] }, { teamA: ['t5'], teamB: ['t3'] }, { teamA: ['t1'], teamB: ['t2'] }]);
    expect(rounds[4]).toEqual([{ teamA: ['t5'], teamB: ['t6'] }, { teamA: ['t1'], teamB: ['t4'] }, { teamA: ['t2'], teamB: ['t3'] }]);
  });

  it('erzeugt für 7 Teams exakt die Hauptprojekt-Paarungen inkl. rotierendem Freilos (JederGegenJedenTest#testGenerate_7)', () => {
    const rounds = playAllRounds(teamsOf(7));
    expect(rounds).toHaveLength(7);
    expect(rounds[0]).toEqual([{ teamA: ['t1'], teamB: [] }, { teamA: ['t2'], teamB: ['t7'] }, { teamA: ['t3'], teamB: ['t6'] }, { teamA: ['t4'], teamB: ['t5'] }]);
    expect(rounds[1]).toEqual([{ teamA: ['t2'], teamB: [] }, { teamA: ['t3'], teamB: ['t1'] }, { teamA: ['t4'], teamB: ['t7'] }, { teamA: ['t5'], teamB: ['t6'] }]);
    expect(rounds[2]).toEqual([{ teamA: ['t3'], teamB: [] }, { teamA: ['t4'], teamB: ['t2'] }, { teamA: ['t5'], teamB: ['t1'] }, { teamA: ['t6'], teamB: ['t7'] }]);
    expect(rounds[3]).toEqual([{ teamA: ['t4'], teamB: [] }, { teamA: ['t5'], teamB: ['t3'] }, { teamA: ['t6'], teamB: ['t2'] }, { teamA: ['t7'], teamB: ['t1'] }]);
    expect(rounds[4]).toEqual([{ teamA: ['t5'], teamB: [] }, { teamA: ['t6'], teamB: ['t4'] }, { teamA: ['t7'], teamB: ['t3'] }, { teamA: ['t1'], teamB: ['t2'] }]);
    expect(rounds[5]).toEqual([{ teamA: ['t6'], teamB: [] }, { teamA: ['t7'], teamB: ['t5'] }, { teamA: ['t1'], teamB: ['t4'] }, { teamA: ['t2'], teamB: ['t3'] }]);
    expect(rounds[6]).toEqual([{ teamA: ['t7'], teamB: [] }, { teamA: ['t1'], teamB: ['t6'] }, { teamA: ['t2'], teamB: ['t5'] }, { teamA: ['t3'], teamB: ['t4'] }]);
  });

  it('lässt über den gesamten Turnierverlauf jedes Team-Paar genau einmal aufeinandertreffen', () => {
    for (const teamCount of [5, 6, 7, 8]) {
      const teams = teamsOf(teamCount);
      const rounds = playAllRounds(teams);
      const seen = new Set();
      const byeCount = new Map(teams.map((team) => [team.id, 0]));
      for (const round of rounds) {
        expect(round).toHaveLength(pairingsPerRound(teamCount));
        for (const match of round) {
          if (!match.teamB.length) {
            byeCount.set(match.teamA[0], byeCount.get(match.teamA[0]) + 1);
            continue;
          }
          const key = [match.teamA[0], match.teamB[0]].sort().join('|');
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
      if (teamCount % 2 === 1) {
        for (const team of teams) expect(byeCount.get(team.id)).toBe(1);
      } else {
        for (const team of teams) expect(byeCount.get(team.id)).toBe(0);
      }
    }
  });

  it('wirft einen Fehler, wenn alle Runden bereits gespielt wurden', () => {
    const teams = teamsOf(4);
    const history = playAllRounds(teams).flat();
    expect(() => generateRound(teams, history)).toThrow('Alle Runden wurden bereits gespielt.');
  });

  it('erfordert mindestens 3 Teams', () => {
    expect(checkRequirements(2)).toEqual([{ type: 'minPlayers', min: 3 }]);
    expect(checkRequirements(3)).toEqual([]);
  });

  it('weist bei anderer Anmeldeart als Formée auf die Einschränkung hin', () => {
    expect(checkRequirements(6, { registrationType: 'melee' })).toEqual([
      { type: 'message', text: 'Jeder gegen Jeden ist online nur mit Anmeldeart "Formée" (feste Teams) spielbar.' },
    ]);
    expect(checkRequirements(6, { registrationType: 'forme' })).toEqual([]);
  });
});
