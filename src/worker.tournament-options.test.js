// @vitest-environment node
// Turnieroptionen wie im Hauptprojekt: Freilos-Punkte, nicht gespielte Runde (Supermêlée), K.O.-Gruppen und Bahn nur
// Runde 1, Team-Anzeige in Spielrunde/Rangliste, Rückrunde (Jeder gegen Jeden).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { normalizeTournamentOptions } from './worker-core.js';
import worker from './worker.js';

const ORIGIN = 'https://ptm.test';

describe('normalizeTournamentOptions', () => {
  it('übernimmt nur übergebene Optionen und prüft Paare gemeinsam', () => {
    expect(normalizeTournamentOptions({ byePointsFor: 12, byePointsAgainst: 4, roundRobinReturn: true, teamDisplayRound: 'NR' }))
      .toEqual({ bye_points_for: 12, bye_points_against: 4, round_robin_return: 1, team_display_round: 'NR' });
    expect(normalizeTournamentOptions({ missedRoundPointsFor: 0, missedRoundPointsAgainst: 13 }))
      .toEqual({ missed_round_points_for: 0, missed_round_points_against: 13 });
    expect(() => normalizeTournamentOptions({ byePointsFor: 7, byePointsAgainst: 7 })).toThrow('Beim Freilos müssen die Pluspunkte größer als die Minuspunkte sein.');
    expect(() => normalizeTournamentOptions({ byePointsFor: 14, byePointsAgainst: 7 })).toThrow('Ungültige Freilos-Punkte');
    expect(() => normalizeTournamentOptions({ koGroupSize: 4, koMinLastGroupSize: 5 })).toThrow('Die Mindestgröße der letzten Gruppe darf die Gruppengröße nicht überschreiten.');
    expect(() => normalizeTournamentOptions({ koGroupSize: 1, koMinLastGroupSize: 1 })).toThrow('Ungültige Gruppengröße');
    expect(() => normalizeTournamentOptions({ teamDisplayRanking: 'X' })).toThrow('Ungültige Team-Anzeige');
    expect(() => normalizeTournamentOptions({ roundRobinReturn: 'ja' })).toThrow('Ungültige Einstellung Rückrunde');
    expect(normalizeTournamentOptions({ meleeTeamMode: 'TRIPLETTE_OHNE_FREILOS' })).toEqual({ melee_team_mode: 'TRIPLETTE_OHNE_FREILOS' });
    expect(() => normalizeTournamentOptions({ meleeTeamMode: 'GEMISCHT' })).toThrow('Ungültige Art der Mêlée-Teams');
  });
});

describe('Turnieroptionen in der Spielverwaltung', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const rows = (statement, ...params) => env.DB.sqlite.prepare(statement).all(...params);
  const request = (path, method = 'GET', body) => worker.fetch(new Request(`${ORIGIN}${path}`, {
    method, headers: { Cookie: 'ptm_session=owner-session', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  }), env);
  const options = (id, body) => request(`/api/tournaments/${id}/options`, 'PUT', body);
  const nextRound = (id) => request(`/api/tournaments/${id}/rounds`, 'POST');
  const decideOpenMatches = (id) => sql('UPDATE tournament_matches SET score_a = 13, score_b = 5 WHERE tournament_id = ? AND score_a IS NULL', id);

  function tournament(id, type, count, { registrationType = 'forme', teamNames = false } = {}) {
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, registration_type, status, visibility, participants_public, created_at, updated_at)
      VALUES (?, 'owner', ?, '2099-09-28', 'Ort', ?, 'tete', ?, 'running', 'public', 1, '2026-09-01', '2026-09-01')`, id, id, type, registrationType);
    for (let index = 1; index <= count; index += 1) {
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, team_name, status, participation, registered_at, created_at, updated_at)
        VALUES (?, ?, ?, 'Muster', ?, ?, 'confirmed', 'active', ?, '2026-09-01', '2026-09-01')`,
      `${id}-r${index}`, id, `Spieler${index}`, `${id}${index}@example.test`, teamNames ? `Team ${String.fromCharCode(64 + index)}` : null,
      `2026-09-01T10:${String(index).padStart(2, '0')}:00.000Z`);
    }
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
  });

  it('bucht Freilos-Punkte beim Auslosen, rückwirkend beim Ändern und in der Schweizer Rangliste', async () => {
    tournament('s', 'schweizer', 7);
    expect((await options('s', { byePointsFor: 12, byePointsAgainst: 4 })).status).toBe(200);
    expect((await nextRound('s')).status).toBe(200);
    const bye = () => rows("SELECT team_a_id, score_a, score_b FROM tournament_matches WHERE tournament_id = 's' AND team_b_registration_ids = '[]'")[0];
    expect(bye()).toMatchObject({ score_a: 12, score_b: 4 });

    expect((await options('s', { byePointsFor: 11, byePointsAgainst: 3 })).status).toBe(200);
    expect(bye()).toMatchObject({ score_a: 11, score_b: 3 });
    const { ranking } = await (await request('/api/tournaments/s/ranking?live=1')).json();
    expect(ranking.find((entry) => entry.teamId === bye().team_a_id)).toMatchObject({ wins: 1, pointsFor: 11, pointsAgainst: 3 });
    expect((await options('s', { byePointsFor: 5, byePointsAgainst: 9 })).status).toBe(400);
  });

  it('teilt K.O.-Teams nach Gruppengröße auf und vergibt Bahnen nur in Runde 1', async () => {
    tournament('k', 'ko', 10);
    expect((await options('k', { courtMode: 'N', koGroupSize: 4, koMinLastGroupSize: 2, koCourtFirstRoundOnly: true })).status).toBe(200);
    expect((await nextRound('k')).status).toBe(200);
    expect(rows("SELECT DISTINCT bracket_group FROM tournament_teams WHERE tournament_id = 'k' ORDER BY bracket_group").map((row) => row.bracket_group))
      .toEqual(['A', 'B', 'C']);
    expect(rows("SELECT court FROM tournament_matches WHERE tournament_id = 'k'").every((row) => row.court)).toBe(true);

    decideOpenMatches('k');
    expect((await nextRound('k')).status).toBe(200);
    const roundTwo = () => rows(`SELECT m.court FROM tournament_matches m JOIN tournament_rounds r ON r.id = m.round_id
      WHERE r.tournament_id = 'k' AND r.round_number = 2`);
    expect(roundTwo().length).toBeGreaterThan(0);
    expect(roundTwo().every((row) => row.court === null)).toBe(true);

    // Abschalten wirkt sofort auf die aktuelle Runde.
    expect((await options('k', { courtMode: 'N', koGroupSize: 4, koMinLastGroupSize: 2, koCourtFirstRoundOnly: false })).status).toBe(200);
    expect(roundTwo().every((row) => row.court)).toBe(true);
  });

  it('zeigt Teams in Spielrunde und Rangliste als Nummer oder Spielernamen statt Teamname', async () => {
    tournament('t', 'schweizer', 6, { teamNames: true });
    expect((await nextRound('t')).status).toBe(200);
    const firstMatch = async () => (await (await request('/api/tournaments/t/rounds')).json()).rounds[0].matches[0];
    const before = await firstMatch();
    expect(before.teamALabel).toBeUndefined();
    expect(before.teamA[0].teamLabel).toMatch(/^Team [A-F]$/);

    expect((await options('t', { teamDisplayRound: 'NR', teamDisplayRanking: 'SPIELERNAMEN' })).status).toBe(200);
    // Teamnummer = Anmeldereihenfolge: die Meldung t-rN ist Team N.
    const { rounds } = await (await request('/api/tournaments/t/rounds')).json();
    for (const match of rounds[0].matches) {
      expect(match.teamALabel).toBe(match.teamA[0].id.replace('t-r', ''));
      expect(match.teamBLabel).toBe(match.teamB[0].id.replace('t-r', ''));
    }

    decideOpenMatches('t');
    const { ranking } = await (await request('/api/tournaments/t/ranking?live=1')).json();
    expect(ranking.map((entry) => entry.displayLabel).sort()).toEqual([1, 2, 3, 4, 5, 6].map((index) => `Spieler${index} Muster`));

    expect((await options('t', { teamDisplayRound: 'SPIELERNAMEN' })).status).toBe(200);
    expect((await firstMatch()).teamALabel).toMatch(/^Spieler\d Muster$/);
  });

  it('spielt bei Jeder gegen Jeden mit Rückrunde jede Paarung zweimal mit getauschten Seiten', async () => {
    tournament('j', 'jeder_gegen_jeden', 3);
    for (let round = 1; round <= 3; round += 1) {
      expect((await nextRound('j')).status).toBe(200);
      decideOpenMatches('j');
    }
    expect((await nextRound('j')).status).toBe(400);

    expect((await options('j', { roundRobinReturn: true })).status).toBe(200);
    for (let round = 4; round <= 6; round += 1) {
      expect((await nextRound('j')).status).toBe(200);
      decideOpenMatches('j');
    }
    expect((await nextRound('j')).status).toBe(400);

    const pairings = rows(`SELECT r.round_number, m.team_a_id, m.team_b_id FROM tournament_matches m JOIN tournament_rounds r ON r.id = m.round_id
      WHERE r.tournament_id = 'j' AND m.team_b_id IS NOT NULL ORDER BY r.round_number`);
    for (const match of pairings.filter((entry) => entry.round_number <= 3)) {
      const returnMatch = pairings.find((entry) => entry.round_number === match.round_number + 3);
      expect([returnMatch.team_a_id, returnMatch.team_b_id]).toEqual([match.team_b_id, match.team_a_id]);
    }
  });
});
