// @vitest-environment node
// Mêlée online in allen Systemen mit festen Teams: schrittweise Auslosung wie die Mêlée-Übernahme im Hauptprojekt,
// Rundenstart mit den ausgelosten Teams und Team-Rangliste.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { computeTournamentRanking, drawMeleeTeams, generateTournamentRound, getTournamentById, liveMeleeTeammates, releaseInvalidMeleeTeams, resetMeleeTeams } from './worker.js';

describe('Mêlée-Teams online', () => {
  let db;
  const turnier = () => getTournamentById(db, 't1');
  const teams = () => db.sqlite.prepare('SELECT member_registration_ids, seed_position FROM tournament_teams ORDER BY created_at').all()
    .map((row) => ({ members: JSON.parse(row.member_registration_ids), seedPosition: row.seed_position }));
  const spieler = (count, from = 1, seed = () => null) => {
    for (let index = from; index < from + count; index += 1) {
      db.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, seeding_position, registered_at, created_at, updated_at)
        VALUES (?, 't1', ?, 'Muster', ?, 'confirmed', 'active', ?, ?, ?, ?)`)
        .run(`p${index}`, `Spieler ${index}`, `p${index}@example.test`, seed(index), `2026-10-15T10:${String(index).padStart(2, '0')}:00Z`, '2026-10-15', '2026-10-15');
    }
  };
  const setup = (type, formation = 'doublette') => db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, registration_type, status, visibility, created_at, updated_at)
    VALUES ('t1', 'u1', 'Mêlée', '2026-10-15', 'Ort', ?, ?, 'melee', 'running', 'public', '2026-10-15', '2026-10-15')`).run(type, formation);

  beforeEach(() => {
    db = d1MitSchema();
    db.sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 's', 'h', '2026-10-15', '2026-10-15')`);
  });

  it('lost nur Spieler ohne Team aus, hängt neue Teams an und lässt die zuletzt angemeldeten offen', async () => {
    setup('formule_x');
    spieler(9);
    const first = await (await drawMeleeTeams(db, await turnier())).json();
    expect(first).toMatchObject({ drawnCount: 4, unassignedCount: 1 });
    expect(teams().flatMap((team) => team.members)).not.toContain('p9');

    spieler(1, 10);
    const second = await (await drawMeleeTeams(db, await turnier())).json();
    expect(second).toMatchObject({ drawnCount: 1, unassignedCount: 0 });
    expect(teams()).toHaveLength(5);
    expect(teams().slice(0, 4)).toEqual(first.teams.map(({ members, seedPosition }) => ({ members, seedPosition })));
    expect(teams()[4].members.sort()).toEqual(['p10', 'p9']);

    await expect(drawMeleeTeams(db, await turnier())).rejects.toMatchObject({ status: 400 });
  });

  it('trennt Spieler mit gleicher Setzposition und übernimmt die niedrigste ins Team', async () => {
    setup('schweizer');
    spieler(12, 1, (index) => (index <= 6 ? Math.ceil(index / 2) : null));
    await drawMeleeTeams(db, await turnier());
    const seeds = Object.fromEntries(db.sqlite.prepare('SELECT id, seeding_position FROM registrations').all().map((row) => [row.id, row.seeding_position]));
    for (const team of teams()) {
      const positions = team.members.map((id) => seeds[id]).filter(Boolean);
      expect(new Set(positions).size).toBe(positions.length);
      expect(team.seedPosition).toBe(positions.length ? Math.min(...positions) : 0);
    }
  });

  it.each(['formule_x', 'jeder_gegen_jeden', 'ko'])('startet %s erst nach der Auslosung und paart die ausgelosten Teams', async (type) => {
    setup(type, 'triplette');
    spieler(12);
    await expect(generateTournamentRound(db, await turnier())).rejects.toMatchObject({ status: 400, message: 'Bitte zuerst Mêlée-Teams auslosen' });
    await drawMeleeTeams(db, await turnier());
    await generateTournamentRound(db, await turnier());
    const matches = db.sqlite.prepare('SELECT team_a_registration_ids, team_b_registration_ids, team_a_id FROM tournament_matches').all();
    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches.filter((row) => row.team_a_id)) expect(JSON.parse(match.team_a_registration_ids)).toHaveLength(3);
    await expect(drawMeleeTeams(db, await turnier())).rejects.toMatchObject({ status: 409 });
    await expect(resetMeleeTeams(db, await turnier())).rejects.toMatchObject({ status: 409 });
  });

  it('verlangt die Mindestzahl Teams des Systems', async () => {
    setup('schweizer');
    spieler(10);
    await drawMeleeTeams(db, await turnier());
    await expect(generateTournamentRound(db, await turnier())).rejects.toMatchObject({ status: 400, message: 'Für eine Runde werden mindestens 6 Teams benötigt.' });
  });

  it('löst die Auslosung vor der ersten Runde vollständig auf', async () => {
    setup('ko');
    spieler(4);
    await drawMeleeTeams(db, await turnier());
    expect(await (await resetMeleeTeams(db, await turnier())).json()).toEqual({ teams: [] });
    expect(teams()).toEqual([]);
  });

  it('lehnt die Auslosung bei Formée und bei Tête ab', async () => {
    setup('formule_x', 'tete');
    spieler(4);
    await expect(drawMeleeTeams(db, await turnier())).rejects.toMatchObject({ status: 400 });
    db.sqlite.prepare("UPDATE tournaments SET formation = 'doublette', registration_type = 'forme'").run();
    await expect(drawMeleeTeams(db, await turnier())).rejects.toMatchObject({ status: 400 });
  });

  it('wertet Jeder gegen Jeden mit Mêlée je Team statt je Spieler', async () => {
    setup('jeder_gegen_jeden');
    spieler(6);
    await drawMeleeTeams(db, await turnier());
    await generateTournamentRound(db, await turnier());
    db.sqlite.prepare('UPDATE tournament_matches SET score_a = 13, score_b = 5 WHERE team_b_id IS NOT NULL').run();
    const ranking = await computeTournamentRanking(db, await turnier());
    expect(ranking).toHaveLength(3);
    expect(ranking.every((entry) => entry.teamId && entry.members.length === 2)).toBe(true);
    expect(ranking[0]).toMatchObject({ rank: 1, wins: 1 });
  });

  it('löst vor der ersten Runde das Team eines nicht mehr aktiven Spielers auf und lost dessen Partner neu aus', async () => {
    setup('formule_x');
    spieler(10);
    await drawMeleeTeams(db, await turnier());
    const partner = teams().find((team) => team.members.includes('p1')).members.find((id) => id !== 'p1');
    db.sqlite.prepare("UPDATE registrations SET participation = 'withdrawn' WHERE id = 'p1'").run();
    await releaseInvalidMeleeTeams(db, 't1');
    expect(teams()).toHaveLength(4);
    expect(teams().flatMap((team) => team.members)).not.toContain(partner);

    db.sqlite.prepare("UPDATE registrations SET status = 'cancelled' WHERE id = 'p2'").run();
    // Auslosung und Rundenstart räumen selbst auf, auch ohne vorherigen Aufruf.
    const result = await (await drawMeleeTeams(db, await turnier())).json();
    expect(result.teams.flatMap((team) => team.members)).not.toContain('p1');
    expect(result.teams.flatMap((team) => team.members)).not.toContain('p2');
    expect(result.teams.every((team) => team.members.length === 2)).toBe(true);
  });

  it('lässt die Teams ab der ersten Runde und bei Formée unverändert', async () => {
    setup('formule_x');
    spieler(8);
    await drawMeleeTeams(db, await turnier());
    await generateTournamentRound(db, await turnier());
    db.sqlite.prepare("UPDATE registrations SET participation = 'withdrawn' WHERE id = 'p1'").run();
    await releaseInvalidMeleeTeams(db, 't1');
    expect(teams()).toHaveLength(4);

    db.sqlite.exec("DELETE FROM tournament_matches; DELETE FROM tournament_rounds; UPDATE tournaments SET registration_type = 'forme'");
    await releaseInvalidMeleeTeams(db, 't1');
    expect(teams()).toHaveLength(4);
  });

  it('zeigt in der Live-Ansicht die online ausgelosten Teampartner', async () => {
    setup('ko', 'triplette');
    spieler(3);
    expect(await liveMeleeTeammates(db, 't1', 'p1')).toBeNull();
    await drawMeleeTeams(db, await turnier());
    const partners = await liveMeleeTeammates(db, 't1', 'p1');
    expect(partners.sort()).toEqual(['Spieler 2 Muster', 'Spieler 3 Muster']);
  });
});
