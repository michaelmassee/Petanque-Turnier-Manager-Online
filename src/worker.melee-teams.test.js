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
    // Formule X nimmt wie im Hauptprojekt nach Turnierstart neue Teams auf (hier ist niemand offen), JGJ/K.O. nicht.
    await expect(drawMeleeTeams(db, await turnier())).rejects.toMatchObject({ status: type === 'formule_x' ? 400 : 409 });
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

    // Ein Spieler aus einem noch bestehenden Team (die Auslosung ist zufällig): danach sind zwei Spieler frei.
    const cancelled = teams()[0].members[0];
    db.sqlite.prepare("UPDATE registrations SET status = 'cancelled' WHERE id = ?").run(cancelled);
    // Auslosung und Rundenstart räumen selbst auf, auch ohne vorherigen Aufruf.
    const result = await (await drawMeleeTeams(db, await turnier())).json();
    expect(result.teams.flatMap((team) => team.members)).not.toContain('p1');
    expect(result.teams.flatMap((team) => team.members)).not.toContain(cancelled);
    expect(result.teams).toHaveLength(4);
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

  const setMode = (mode) => db.sqlite.prepare("UPDATE tournaments SET melee_team_mode = ? WHERE id = 't1'").run(mode);
  const sizes = () => teams().map((team) => team.members.length);

  it('bildet ohne Freilos gemischte Doubletten/Triplettes mit gerader Teamzahl, Doubletten zuerst', async () => {
    setup('schweizer', 'triplette');
    setMode('TRIPLETTE_OHNE_FREILOS');
    spieler(11);
    const result = await (await drawMeleeTeams(db, await turnier())).json();
    expect(result).toMatchObject({ drawnCount: 4, unassignedCount: 0 });
    expect(sizes()).toEqual([2, 3, 3, 3]);
    expect(teams().length % 2).toBe(0);
  });

  it('lässt ohne Freilos bei 7 Spielern den zuletzt angemeldeten offen (6 = zwei Triplettes)', async () => {
    setup('schweizer', 'doublette');
    setMode('DOUBLETTE_OHNE_FREILOS');
    spieler(7);
    const result = await (await drawMeleeTeams(db, await turnier())).json();
    // 6 Spieler: drei Doubletten wären eine ungerade Teamzahl, daher wie im Supermêlée zwei Triplettes.
    expect(result).toMatchObject({ drawnCount: 2, unassignedCount: 1 });
    expect(sizes()).toEqual([3, 3]);
    expect(teams().flatMap((team) => team.members)).not.toContain('p7');
  });

  it('lost ohne Freilos vor Runde 1 nach Rückfrage alle Teams mit einem Nachzügler neu aus', async () => {
    setup('schweizer', 'doublette');
    setMode('DOUBLETTE_OHNE_FREILOS');
    spieler(8);
    await drawMeleeTeams(db, await turnier());
    expect(sizes()).toEqual([2, 2, 2, 2]);

    spieler(1, 9);
    await expect(drawMeleeTeams(db, await turnier())).rejects.toMatchObject({
      status: 409, details: { code: 'melee_redraw_required', newPlayers: 1, teams: 4 },
    });
    expect(teams()).toHaveLength(4);

    const result = await (await drawMeleeTeams(db, await turnier(), { confirmRedraw: true })).json();
    expect(result).toMatchObject({ redrawn: true, drawnCount: 4, unassignedCount: 0 });
    expect(sizes()).toEqual([2, 2, 2, 3]);
    expect(teams().flatMap((team) => team.members)).toContain('p9');
  });

  it('lost nicht neu aus, wenn parallel die erste Runde gestartet wurde', async () => {
    setup('schweizer', 'doublette');
    setMode('DOUBLETTE_OHNE_FREILOS');
    spieler(8);
    await drawMeleeTeams(db, await turnier());
    const before = teams();
    spieler(1, 9);
    db.vorBatch((sqlite) => sqlite.exec("INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES ('r1', 't1', 1, '2026-10-15')"));
    await expect(drawMeleeTeams(db, await turnier(), { confirmRedraw: true })).rejects.toMatchObject({ status: 409 });
    expect(teams()).toEqual(before);
  });

  it('startet keine Runde mit Teams, die parallel gelöscht wurden', async () => {
    setup('schweizer', 'doublette');
    spieler(12);
    await drawMeleeTeams(db, await turnier());
    db.vorBatch((sqlite) => sqlite.exec("DELETE FROM tournament_teams WHERE tournament_id = 't1'"));
    await expect(generateTournamentRound(db, await turnier())).rejects.toMatchObject({ status: 409 });
    expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM tournament_rounds').get().count).toBe(0);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM tournament_matches').get().count).toBe(0);
  });

  it('nimmt im Schweizer System nach Turnierstart Nachzügler als neue Teams auf, bestehende bleiben', async () => {
    setup('schweizer', 'doublette');
    spieler(12);
    await drawMeleeTeams(db, await turnier());
    await generateTournamentRound(db, await turnier());
    const before = teams();

    spieler(2, 13);
    const result = await (await drawMeleeTeams(db, await turnier())).json();
    expect(result).toMatchObject({ drawnCount: 1, unassignedCount: 0 });
    expect(teams().slice(0, before.length)).toEqual(before);
    expect(teams()[before.length].members.sort()).toEqual(['p13', 'p14']);
    await expect(resetMeleeTeams(db, await turnier())).rejects.toMatchObject({ status: 409 });

    db.sqlite.prepare('UPDATE tournament_matches SET score_a = 13, score_b = 5 WHERE score_a IS NULL').run();
    await generateTournamentRound(db, await turnier());
    const roundTwo = db.sqlite.prepare(`SELECT m.team_a_registration_ids AS a, m.team_b_registration_ids AS b FROM tournament_matches m
      JOIN tournament_rounds r ON r.id = m.round_id WHERE r.round_number = 2`).all();
    expect(roundTwo.some((match) => [match.a, match.b].some((ids) => ids.includes('p13')))).toBe(true);
  });

  it('fragt bei doppelten Namen nach, bevor ausgelost wird', async () => {
    setup('schweizer');
    spieler(4);
    db.sqlite.prepare("UPDATE registrations SET first_name = ' spieler 1 ' WHERE id = 'p2'").run();
    await expect(drawMeleeTeams(db, await turnier())).rejects.toMatchObject({
      status: 409, details: { code: 'melee_duplicate_names', names: ['Spieler 1 Muster'] },
    });
    expect(teams()).toEqual([]);
    const result = await (await drawMeleeTeams(db, await turnier(), { allowDuplicateNames: true })).json();
    expect(result.drawnCount).toBe(2);
  });
});

