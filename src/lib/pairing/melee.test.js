import { describe, expect, it } from 'vitest';
import { buildMeleeTeams, meleeTeamSize } from './melee.js';

const spieler = (count, seed = () => 0) => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, seedPosition: seed(index) }));
// Deterministischer Zufall für reproduzierbare Mischungen.
const seeded = (start = 1) => { let state = start; return () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; }; };

describe('Mêlée-Teambildung', () => {
  it('leitet die Team-Größe aus der Formation ab', () => {
    expect(meleeTeamSize('doublette')).toBe(2);
    expect(meleeTeamSize('triplette')).toBe(3);
    expect(meleeTeamSize('tete')).toBeNull();
  });

  it('bildet gleich große Teams und lässt die zuletzt angemeldeten Spieler ohne Team', () => {
    const teams = buildMeleeTeams(spieler(11), 3, seeded());
    expect(teams).toHaveLength(3);
    expect(teams.every((team) => team.members.length === 3)).toBe(true);
    expect(teams.flatMap((team) => team.members).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'].sort());
  });

  it('liefert keine Teams, wenn nicht einmal ein Team zustande kommt', () => {
    expect(buildMeleeTeams(spieler(1), 2)).toEqual([]);
  });

  it('trennt Spieler mit gleicher Setzposition und vergibt die niedrigste Setzposition ans Team', () => {
    // Je zwei Spieler teilen sich Setzposition 1 bis 4, die anderen haben keine.
    const players = spieler(12, (index) => (index < 8 ? Math.floor(index / 2) + 1 : 0));
    for (let run = 1; run <= 20; run += 1) {
      const teams = buildMeleeTeams(players, 2, seeded(run));
      for (const team of teams) {
        const positions = team.members.map((id) => players.find((player) => player.id === id).seedPosition).filter(Boolean);
        expect(new Set(positions).size).toBe(positions.length);
        expect(team.seedPosition).toBe(positions.length ? Math.min(...positions) : 0);
      }
    }
  });

  it('scheitert bei unerfüllbarer Setzpositions-Bedingung nicht', () => {
    const teams = buildMeleeTeams(spieler(4, () => 1), 2, seeded());
    expect(teams).toHaveLength(2);
    expect(teams.every((team) => team.seedPosition === 1)).toBe(true);
  });
});
