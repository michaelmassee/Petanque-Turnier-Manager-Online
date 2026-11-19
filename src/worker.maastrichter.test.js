// @vitest-environment node
// Maastrichter online: Schweizer Vorrunden, danach K.O. in den Finalgruppen; Rangliste = Vorrunde, dazu die KO-Sieger.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

const ORIGIN = 'https://ptm.test';
// Eckdaten von t1 für PUT /api/tournaments/t1 (Formation steht wegen vorhandener Meldungen fest).
const T1_BODY = { name: 'Maastrichter', date: '2026-11-19', location: 'Ort', type: 'maastrichter', formation: 'tete', registrationType: 'forme', status: 'running', visibility: 'public' };

describe('Maastrichter online', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const rows = (statement, ...params) => env.DB.sqlite.prepare(statement).all(...params);
  const request = (path, init = {}) => worker.fetch(new Request(`${ORIGIN}${path}`, {
    ...init, headers: { Cookie: 'ptm_session=leitung-session', 'Content-Type': 'application/json', ...(init.headers || {}) },
  }), env);
  const nextRound = () => request('/api/tournaments/t1/rounds', { method: 'POST' });
  const redraw = () => request('/api/tournaments/t1/rounds/redraw', { method: 'POST' });
  // Das Team mit der kleineren Teamnummer gewinnt: eine eindeutige Vorrunden-Rangliste.
  const playOpenMatches = () => sql(`UPDATE tournament_matches SET
      score_a = CASE WHEN (SELECT team_number FROM registrations WHERE id = json_extract(team_a_registration_ids, '$[0]'))
        < (SELECT team_number FROM registrations WHERE id = json_extract(team_b_registration_ids, '$[0]')) THEN 13 ELSE 5 END,
      score_b = CASE WHEN (SELECT team_number FROM registrations WHERE id = json_extract(team_a_registration_ids, '$[0]'))
        < (SELECT team_number FROM registrations WHERE id = json_extract(team_b_registration_ids, '$[0]')) THEN 5 ELSE 13 END
    WHERE score_a IS NULL AND team_b_registration_ids != '[]'`);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('leitung', 'leitung@example.test', 'user', 'salt', 'hash', '2026-10-01', '2026-10-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('leitung-session', 'leitung', '2099-01-01T00:00:00.000Z', '2026-10-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, registration_type, status, visibility, ko_platz3, created_at, updated_at)
      VALUES ('t1', 'leitung', 'Maastrichter', '2026-11-19', 'Ort', 'maastrichter', 'tete', 'forme', 'running', 'public', 0, '2026-10-01', '2026-10-01')`);
    sql("INSERT INTO tournament_maastrichter_settings (tournament_id, preliminary_rounds, group_mode) VALUES ('t1', 2, 'NACH_GROESSE')");
    sql("UPDATE tournaments SET ko_group_size = 4, ko_min_last_group_size = 2 WHERE id = 't1'");
    for (let index = 1; index <= 8; index += 1) {
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, team_number, registered_at, created_at, updated_at)
        VALUES (?, 't1', ?, 'Muster', ?, 'confirmed', 'active', ?, ?, '2026-10-01', '2026-10-01')`,
      `p${index}`, `Spieler ${index}`, `p${index}@example.test`, index, `2026-10-01T10:0${index}:00Z`);
    }
  });

  it('spielt Vorrunden, bildet die Finalgruppen und liefert Vorrunden-Rangliste und KO-Sieger', async () => {
    for (let round = 1; round <= 2; round += 1) {
      const response = await nextRound();
      expect(response.status).toBe(200);
      // Vor dem Übergang in die Finalrunde nie Schluss
      expect((await response.json()).allRoundsPlayed).toBe(false);
      playOpenMatches();
    }
    expect(rows("SELECT COUNT(*) AS count FROM tournament_teams WHERE bracket_group IS NOT NULL")[0].count).toBe(0);

    // Erste Finalrunde: Gruppen A (Plätze 1–4) und B (Plätze 5–8) aus der Vorrunden-Rangliste
    expect((await nextRound()).status).toBe(200);
    const groups = rows(`SELECT t.bracket_group AS grp, t.ko_seed AS seed, t.id AS teamId
      FROM tournament_teams t ORDER BY grp, seed`);
    expect(groups.filter((row) => row.grp === 'A')).toHaveLength(4);
    expect(groups.filter((row) => row.grp === 'B')).toHaveLength(4);
    // Die erste Vorrunde lost zufällig: Maßstab ist die Vorrunden-Rangliste, Setzrang = Platz in der Gruppe.
    const preliminary = (await (await request('/api/tournaments/t1/ranking?live=1')).json()).ranking;
    expect(groups.map((row) => row.teamId)).toEqual(preliminary.map((entry) => entry.teamId));
    expect(groups.map((row) => row.seed)).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
    const semis = rows("SELECT stage_label FROM tournament_matches m JOIN tournament_rounds r ON r.id = m.round_id WHERE r.round_number = 3 ORDER BY match_index");
    expect(semis.map((row) => row.stage_label)).toEqual(['Halbfinale – Gruppe A', 'Halbfinale – Gruppe A', 'Halbfinale – Gruppe B', 'Halbfinale – Gruppe B']);

    // Neu auslosen der ersten Finalrunde bildet die Gruppen erneut, ohne Doppelungen
    expect((await redraw()).status).toBe(200);
    expect(rows("SELECT COUNT(*) AS count FROM tournament_teams WHERE bracket_group IS NOT NULL")[0].count).toBe(8);

    // Mit den Halbfinals steht noch eine Runde aus; sobald die Finals ausgelost sind, gibt es keine weitere Runde
    // (wie bei K.O. zählen die ausgelosten Runden, die Ergebnisse trägt die Turnierleitung danach noch ein).
    expect((await (await request('/api/tournaments/t1/rounds')).json()).allRoundsPlayed).toBe(false);
    playOpenMatches();
    const finals = await nextRound();
    expect(finals.status).toBe(200);
    expect((await finals.json()).allRoundsPlayed).toBe(true);
    playOpenMatches();
    const after = await nextRound();
    expect(after.status).toBe(400);
    expect((await after.json()).error).toBe('Alle Runden wurden bereits gespielt.');

    const ranking = await (await request('/api/tournaments/t1/ranking')).json();
    // Rangliste nur aus den 2 Vorrunden
    expect(ranking.ranking).toHaveLength(8);
    expect(Math.max(...ranking.ranking.map((entry) => entry.wins))).toBe(2);
    expect(ranking.koWinners.map((winner) => winner.label)).toEqual(['A-Finale', 'B-Finale']);
    expect(ranking.koWinners[0].registrationIds).toEqual(['p1']);
  });

  it('liefert und speichert die Einstellungen und sperrt sie nach Beginn der Finalrunde', async () => {
    const settings = await (await request('/api/tournaments/t1/maastrichter-settings')).json();
    expect(settings).toEqual({ preliminaryRounds: 2, groupMode: 'NACH_GROESSE', roundsDrawn: 0, finalStarted: false });

    for (let round = 1; round <= 3; round += 1) {
      expect((await nextRound()).status).toBe(200);
      playOpenMatches();
    }
    expect((await (await request('/api/tournaments/t1/maastrichter-settings')).json()).finalStarted).toBe(true);

    // Die Sperre steckt im Speichern selbst: Auch ohne Vorab-Prüfung bleibt die Vorrunden-Zahl nach Finalbeginn fest.
    const update = await request('/api/tournaments/t1', { method: 'PUT', body: JSON.stringify({ ...T1_BODY, maastrichterPreliminaryRounds: 3 }) });
    expect(update.status).toBe(409);
    expect((await update.json()).error).toBe('Die Maastrichter-Einstellungen können nach Beginn der Finalrunde nicht mehr geändert werden');
    expect(rows("SELECT preliminary_rounds FROM tournament_maastrichter_settings WHERE tournament_id = 't1'")).toEqual([{ preliminary_rounds: 2 }]);
  });

  // Vorrunden mit Ergebnissen durchspielen, ohne die erste Finalrunde auszulosen.
  async function playPreliminaryRounds() {
    for (let round = 1; round <= 2; round += 1) {
      expect((await nextRound()).status).toBe(200);
      playOpenMatches();
    }
  }
  const groupsSnapshot = () => rows("SELECT id, bracket_group, ko_seed FROM tournament_teams WHERE tournament_id = 't1' ORDER BY id");

  it('lässt die Finalgruppen unverändert, wenn das Neuauslosen der ersten Finalrunde scheitert', async () => {
    await playPreliminaryRounds();
    expect((await nextRound()).status).toBe(200);
    const before = groupsSnapshot();
    // Vorrunden-Korrektur dreht die Rangliste um: Ein erfolgreiches Neuauslosen würde die Gruppen neu bilden.
    sql(`UPDATE tournament_matches SET score_a = score_b, score_b = score_a WHERE round_id IN
      (SELECT id FROM tournament_rounds WHERE tournament_id = 't1' AND round_number <= 2) AND team_b_registration_ids != '[]'`);
    // Zeitgleich trifft ein Halbfinal-Ergebnis ein.
    env.DB.vorBatch((sqlite) => sqlite.prepare(`UPDATE tournament_matches SET score_a = 13, score_b = 2 WHERE id =
      (SELECT m.id FROM tournament_matches m JOIN tournament_rounds r ON r.id = m.round_id WHERE r.tournament_id = 't1' AND r.round_number = 3 LIMIT 1)`).run());
    const response = await redraw();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/Ergebnis/);
    expect(groupsSnapshot()).toEqual(before);
  });

  it('bildet die Finalgruppen beim erfolgreichen Neuauslosen nach einer Vorrunden-Korrektur neu (Gegenprobe)', async () => {
    await playPreliminaryRounds();
    expect((await nextRound()).status).toBe(200);
    const before = groupsSnapshot();
    sql(`UPDATE tournament_matches SET score_a = score_b, score_b = score_a WHERE round_id IN
      (SELECT id FROM tournament_rounds WHERE tournament_id = 't1' AND round_number <= 2) AND team_b_registration_ids != '[]'`);
    expect((await redraw()).status).toBe(200);
    expect(groupsSnapshot()).not.toEqual(before);
  });

  it('lost keine Runde mit veralteten Einstellungen aus', async () => {
    await playPreliminaryRounds();
    // Zwischen Lesen und Speichern der ersten Finalrunde wird auf 3 Vorrunden umgestellt.
    env.DB.vorBatch((sqlite) => sqlite.prepare("UPDATE tournament_maastrichter_settings SET preliminary_rounds = 3 WHERE tournament_id = 't1'").run());
    const response = await nextRound();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/Maastrichter-Einstellungen wurden inzwischen geändert/);
    expect(rows("SELECT COUNT(*) AS count FROM tournament_rounds WHERE tournament_id = 't1'")[0].count).toBe(2);
    expect(rows("SELECT COUNT(*) AS count FROM tournament_teams WHERE tournament_id = 't1' AND bracket_group IS NOT NULL")[0].count).toBe(0);
  });

  it('lässt die Finalrunde weiterlaufen, wenn die Turnierleitung Ausgeschiedene inaktiv setzt', async () => {
    await playPreliminaryRounds();
    expect((await nextRound()).status).toBe(200);
    // Halbfinal-Verlierer (die rechts gelosten Teams verlieren in playOpenMatches nicht immer) inaktiv setzen
    playOpenMatches();
    sql(`UPDATE registrations SET participation = 'inactive' WHERE id IN (
      SELECT CASE WHEN m.score_a > m.score_b THEN json_extract(m.team_b_registration_ids, '$[0]') ELSE json_extract(m.team_a_registration_ids, '$[0]') END
      FROM tournament_matches m JOIN tournament_rounds r ON r.id = m.round_id WHERE r.tournament_id = 't1' AND r.round_number = 3)`);
    expect(rows("SELECT COUNT(*) AS count FROM registrations WHERE tournament_id = 't1' AND participation = 'active'")[0].count).toBe(4);
    const finals = await nextRound();
    expect(finals.status).toBe(200);
    expect((await finals.json()).preliminaryRounds).toBe(2);
  });

  const storedSettings = () => rows("SELECT preliminary_rounds, group_mode FROM tournament_maastrichter_settings WHERE tournament_id = 't1'");
  const update = (body) => request('/api/tournaments/t1', { method: 'PUT', body: JSON.stringify({ ...T1_BODY, ...body }) });

  it('speichert keine Einstellungen, wenn die übrige Änderung abgelehnt wird', async () => {
    // Meldefrist in der Sommerzeitlücke: Die Eckdaten scheitern erst nach den Maastrichter-Prüfungen.
    const response = await update({ date: '2027-04-10', registrationDeadline: '2027-03-28T02:30', maastrichterPreliminaryRounds: 3, maastrichterGroupMode: 'NACH_SIEGEN' });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Sommerzeit/);
    expect(storedSettings()).toEqual([{ preliminary_rounds: 2, group_mode: 'NACH_GROESSE' }]);

    const ok = await update({ maastrichterPreliminaryRounds: 3, maastrichterGroupMode: 'NACH_SIEGEN' });
    expect(ok.status).toBe(200);
    expect(storedSettings()).toEqual([{ preliminary_rounds: 3, group_mode: 'NACH_SIEGEN' }]);
  });

  it('speichert weder Einstellungen noch Eckdaten, wenn die Finalrunde zeitgleich beginnt', async () => {
    await playPreliminaryRounds();
    // Zwischen Vorab-Prüfung und Speichern lost jemand die erste Finalrunde aus (Finalgruppen gesetzt).
    env.DB.vorBatch((sqlite) => sqlite.prepare("UPDATE tournament_teams SET bracket_group = 'A', ko_seed = 1 WHERE tournament_id = 't1'").run());
    const response = await update({ name: 'Umbenannt', maastrichterPreliminaryRounds: 3,
      liveViewEnabled: true, playerResultReportingEnabled: true, resultReportConfirmationRequired: true });
    expect(response.status).toBe(409);
    // Auch die Turnieroptionen im selben Batch bleiben ungespeichert.
    expect(rows("SELECT * FROM tournament_options WHERE tournament_id = 't1'")).toEqual([]);
    expect((await response.json()).error).toBe('Die Maastrichter-Einstellungen können nach Beginn der Finalrunde nicht mehr geändert werden');
    expect(storedSettings()).toEqual([{ preliminary_rounds: 2, group_mode: 'NACH_GROESSE' }]);
    expect(rows("SELECT name FROM tournaments WHERE id = 't1'")).toEqual([{ name: 'Maastrichter' }]);
  });

  it('überschreibt bei einer reinen Gruppenmodus-Änderung keine zeitgleich gespeicherte Vorrunden-Zahl', async () => {
    // Nach dem Vorab-Lesen (2 Vorrunden) speichert eine andere Anfrage 4 Vorrunden.
    env.DB.vorBatch((sqlite) => sqlite.prepare("UPDATE tournament_maastrichter_settings SET preliminary_rounds = 4 WHERE tournament_id = 't1'").run());
    expect((await update({ maastrichterGroupMode: 'NACH_SIEGEN' })).status).toBe(200);
    expect(storedSettings()).toEqual([{ preliminary_rounds: 4, group_mode: 'NACH_SIEGEN' }]);
  });

  it('nimmt ein direkt vor der ersten Finalrunde aktiviertes Team in die Finalgruppen auf', async () => {
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, team_number, registered_at, created_at, updated_at)
      VALUES ('p9', 't1', 'Spieler 9', 'Muster', 'p9@example.test', 'confirmed', 'inactive', 9, '2026-10-01T10:09:00Z', '2026-10-01', '2026-10-01')`);
    await playPreliminaryRounds();
    expect(rows("SELECT COUNT(*) AS count FROM tournament_teams WHERE tournament_id = 't1'")[0].count).toBe(8);
    sql("UPDATE registrations SET participation = 'active' WHERE id = 'p9'");

    expect((await nextRound()).status).toBe(200);
    const assigned = rows(`SELECT json_extract(member_registration_ids, '$[0]') AS registrationId, bracket_group AS grp
      FROM tournament_teams WHERE tournament_id = 't1' AND bracket_group IS NOT NULL`);
    expect(assigned).toHaveLength(9);
    // Ohne Vorrunden-Siege steht es unten: in der letzten Gruppe (4 + 4 + 1 → die 1 wird in B gefaltet)
    expect(assigned.find((row) => row.registrationId === 'p9').grp).toBe('B');
    const inFinal = rows(`SELECT COUNT(*) AS count FROM tournament_matches m JOIN tournament_rounds r ON r.id = m.round_id
      WHERE r.tournament_id = 't1' AND r.round_number = 3 AND (m.team_a_registration_ids = '["p9"]' OR m.team_b_registration_ids = '["p9"]')`);
    expect(inFinal[0].count).toBe(1);
  });

  it('behält Spiel um Platz 3 beim Speichern des Turnierformulars, das den Wert nicht mehr schickt', async () => {
    sql("UPDATE tournaments SET ko_platz3 = 1 WHERE id = 't1'");
    expect((await update({ name: 'Umbenannt' })).status).toBe(200);
    expect(rows("SELECT ko_platz3 FROM tournaments WHERE id = 't1'")).toEqual([{ ko_platz3: 1 }]);
    expect((await update({ koPlatz3: false })).status).toBe(200);
    expect(rows("SELECT ko_platz3 FROM tournaments WHERE id = 't1'")).toEqual([{ ko_platz3: 0 }]);
  });

  it('übernimmt einen Gruppenmodus auch ohne Vorrunden-Zahl und behält diese', async () => {
    expect((await update({ maastrichterGroupMode: 'NACH_SIEGEN' })).status).toBe(200);
    expect(storedSettings()).toEqual([{ preliminary_rounds: 2, group_mode: 'NACH_SIEGEN' }]);
  });

  describe('Turnieroptionen der Spielverwaltung', () => {
    const putOptions = (body) => request('/api/tournaments/t1/options', { method: 'PUT', body: JSON.stringify({ courtMode: 'X', ...body }) });

    it('speichert Vorrunden, Gruppenmodus und Spiel um Platz 3 und liefert den Stand zurück', async () => {
      const response = await putOptions({ koPlatz3: true, maastrichterPreliminaryRounds: 4, maastrichterGroupMode: 'NACH_SIEGEN' });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.koPlatz3).toBe(true);
      expect(data.maastrichter).toEqual({ preliminaryRounds: 4, groupMode: 'NACH_SIEGEN', roundsDrawn: 0, finalStarted: false });
      expect(storedSettings()).toEqual([{ preliminary_rounds: 4, group_mode: 'NACH_SIEGEN' }]);
      expect(rows("SELECT ko_platz3 FROM tournaments WHERE id = 't1'")).toEqual([{ ko_platz3: 1 }]);
    });

    it('lehnt weniger Vorrunden als bereits ausgelost ab', async () => {
      expect((await nextRound()).status).toBe(200);
      playOpenMatches();
      expect((await nextRound()).status).toBe(200);
      const response = await putOptions({ maastrichterPreliminaryRounds: 1 });
      expect(response.status).toBe(409);
      expect((await response.json()).error).toBe('Es sind bereits mehr Vorrunden ausgelost, als eingestellt werden sollen');
    });

    it('speichert weder Einstellungen noch übrige Optionen, wenn die Finalrunde zeitgleich beginnt', async () => {
      await playPreliminaryRounds();
      env.DB.vorBatch((sqlite) => sqlite.prepare("UPDATE tournament_teams SET bracket_group = 'A', ko_seed = 1 WHERE tournament_id = 't1'").run());
      const response = await putOptions({ courtMode: 'N', koPlatz3: true, maastrichterPreliminaryRounds: 3 });
      expect(response.status).toBe(409);
      expect((await response.json()).error).toBe('Die Maastrichter-Einstellungen können nach Beginn der Finalrunde nicht mehr geändert werden');
      expect(storedSettings()).toEqual([{ preliminary_rounds: 2, group_mode: 'NACH_GROESSE' }]);
      expect(rows("SELECT court_mode, ko_platz3 FROM tournaments WHERE id = 't1'")).toEqual([{ court_mode: 'X', ko_platz3: 0 }]);
    });
  });

  it('übernimmt die Einstellungen beim Anlegen und prüft sie', async () => {
    const body = { name: 'Neu', date: '2026-12-01', location: 'Ort', type: 'maastrichter', formation: 'doublette', registrationType: 'forme', status: 'draft', visibility: 'private' };
    const created = await request('/api/tournaments', { method: 'POST', body: JSON.stringify({ ...body, maastrichterPreliminaryRounds: 4, maastrichterGroupMode: 'NACH_SIEGEN' }) });
    expect(created.status).toBe(201);
    const { tournament } = await created.json();
    expect(rows('SELECT preliminary_rounds, group_mode FROM tournament_maastrichter_settings WHERE tournament_id = ?', tournament.id))
      .toEqual([{ preliminary_rounds: 4, group_mode: 'NACH_SIEGEN' }]);

    const count = () => rows("SELECT COUNT(*) AS count FROM tournaments WHERE owner_id = 'leitung'")[0].count;
    const before = count();
    const invalid = await request('/api/tournaments', { method: 'POST', body: JSON.stringify({ ...body, maastrichterPreliminaryRounds: 0 }) });
    expect(invalid.status).toBe(400);
    // Kein halb angelegtes Turnier, das das Turnier-Kontingent belegt
    expect(count()).toBe(before);
  });
});
