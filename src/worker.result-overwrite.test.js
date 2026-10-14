// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { setTournamentMatchResult, setTournamentRoundResults } from './worker.js';

describe('Bestätigtes Überschreiben von Spielergebnissen', () => {
  let db;
  const tournament = { id: 't1', desktop_execution: 0 };
  const current = () => db.sqlite.prepare("SELECT score_a, score_b, no_show FROM tournament_matches WHERE id = 'm1'").get();
  const save = (body = {}) => setTournamentMatchResult(new Request('https://ptm.test/api/tournaments/t1/matches/m1/result', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scoreA: 13, scoreB: 7, ...body }),
  }), db, tournament, 'm1');
  const reported = () => db.sqlite.prepare("UPDATE tournament_matches SET score_a = 6, score_b = 13, result_reported_by = 'reg1' WHERE id = 'm1'").run();
  const reporter = () => db.sqlite.prepare("SELECT result_reported_by FROM tournament_matches WHERE id = 'm1'").get().result_reported_by;
  const expectedResult = { scoreA: 6, scoreB: 13, noShow: null };

  beforeEach(() => {
    db = d1MitSchema();
    db.sqlite.exec(`
      INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
        VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-10-14', '2026-10-14');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
        VALUES ('t1', 'u1', 'Turnier', '2026-10-14', 'Ort', 'tete', 'running', 'public', '2026-10-14', '2026-10-14');
      INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES ('r1', 't1', 1, '2026-10-14');
      INSERT INTO tournament_matches (id, tournament_id, round_id, team_a_registration_ids, team_b_registration_ids, created_at, updated_at)
        VALUES ('m1', 't1', 'r1', '[]', '[]', '2026-10-14', '2026-10-14');
    `);
  });

  it('speichert eine offene Partie ohne zusätzliche Bestätigung', async () => {
    await save();
    expect(current()).toMatchObject({ score_a: 13, score_b: 7 });
  });

  it('verweigert das Überschreiben einer Teammeldung ohne Bestätigung', async () => {
    reported();
    await expect(save({ expectedResult })).rejects.toMatchObject({ status: 409, details: {
      code: 'result_confirmation_required', currentResult: expectedResult,
    } });
    expect(current()).toMatchObject({ score_a: 6, score_b: 13 });
  });

  it('überschreibt genau das bestätigte Ergebnis', async () => {
    reported();
    await save({ expectedResult, confirmOverwrite: true });
    expect(current()).toMatchObject({ score_a: 13, score_b: 7 });
    expect(reporter()).toBeNull();
  });

  it('entfernt die Spielermeldung auch beim Speichern der ganzen Runde', async () => {
    reported();
    await batchSave([{ matchId: 'm1', scoreA: 13, scoreB: 7, expectedResult, confirmOverwrite: true }]);
    expect(current()).toMatchObject({ score_a: 13, score_b: 7 });
    expect(reporter()).toBeNull();
  });

  it('behandelt fehlende Felder im erwarteten Ergebnis wie leer', async () => {
    reported();
    await save({ expectedResult: { scoreA: 6, scoreB: 13 }, confirmOverwrite: true });
    expect(current()).toMatchObject({ score_a: 13, score_b: 7 });
  });

  it('verwirft den Live-Snapshot nach dem Speichern', async () => {
    const cacheDelete = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { default: { delete: cacheDelete } });
    try {
      await save();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(cacheDelete).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://ptm.test/__live-snapshot/t1' }));
  });

  it('akzeptiert keine Bestätigung eines veralteten Ergebnisses', async () => {
    reported();
    await expect(save({ expectedResult: { ...expectedResult, scoreA: 5 }, confirmOverwrite: true }))
      .rejects.toMatchObject({ status: 409 });
    expect(current()).toMatchObject({ score_a: 6, score_b: 13 });
  });

  it.each([false, true])('schützt atomar vor Änderungen zwischen Lesen und Schreiben (Bestätigung: %s)', async (confirmed) => {
    if (confirmed) reported();
    const prepare = db.prepare.bind(db);
    vi.spyOn(db, 'prepare').mockImplementation((sql) => {
      if (sql.startsWith('UPDATE tournament_matches')) {
        db.sqlite.prepare("UPDATE tournament_matches SET score_a = 8, score_b = 13 WHERE id = 'm1'").run();
      }
      return prepare(sql);
    });
    await expect(save(confirmed ? { expectedResult, confirmOverwrite: true } : {}))
      .rejects.toMatchObject({ status: 409, details: { currentResult: { scoreA: 8, scoreB: 13, noShow: null } } });
    expect(current()).toMatchObject({ score_a: 8, score_b: 13 });
  });
  const batchSave = (results, roundId = 'r1', selectedTournament = tournament) => setTournamentRoundResults(new Request('https://ptm.test/api/tournaments/t1/rounds/r1/results', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ results }),
  }), db, selectedTournament, roundId);
  function secondMatch() {
    db.sqlite.exec(`INSERT INTO tournament_matches (id, tournament_id, round_id, team_a_registration_ids, team_b_registration_ids, created_at, updated_at)
      VALUES ('m2', 't1', 'r1', '[]', '[]', '2026-10-14', '2026-10-14')`);
  }
  const result = (id = 'm1', extra = {}) => ({ matchId: id, scoreA: 13, scoreB: 7, ...extra });

  it('speichert eine Runde gebündelt und liest die Rundendaten nur einmal nach', async () => {
    secondMatch();
    const prepare = vi.spyOn(db, 'prepare');
    const batch = vi.spyOn(db, 'batch');
    const response = await (await batchSave([result(), result('m2', { scoreA: 5, scoreB: 13 })])).json();
    expect(response.savedMatchIds).toEqual(['m1', 'm2']);
    expect(response.conflicts).toEqual([]);
    expect(response.rounds[0].matches.map((match) => [match.scoreA, match.scoreB])).toEqual([[13, 7], [5, 13]]);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls.filter(([sql]) => sql.startsWith('SELECT'))).toHaveLength(5);
  });

  it('rollt eine Sammelanfrage bei einem Datenbankfehler vollständig zurück', async () => {
    secondMatch();
    db.sqlite.exec("CREATE TRIGGER fail_second_result BEFORE UPDATE ON tournament_matches WHEN NEW.id = 'm2' BEGIN SELECT RAISE(ABORT, 'Testfehler'); END;");
    await expect(batchSave([result(), result('m2')])).rejects.toThrow('Testfehler');
    expect(current()).toMatchObject({ score_a: null, score_b: null });
  });

  it('behält eine Teammeldung ohne Bestätigung und speichert andere offene Partien', async () => {
    secondMatch();
    reported();
    const response = await (await batchSave([result(), result('m2')])).json();
    expect(response.savedMatchIds).toEqual(['m2']);
    expect(response.conflicts).toEqual([{ matchId: 'm1', currentResult: expectedResult }]);
    expect(current()).toMatchObject({ score_a: 6, score_b: 13 });
  });

  it('ersetzt beim Sammelspeichern nur das ausdrücklich bestätigte Ergebnis', async () => {
    reported();
    const response = await (await batchSave([result('m1', { expectedResult, confirmOverwrite: true })])).json();
    expect(response.savedMatchIds).toEqual(['m1']);
    expect(current()).toMatchObject({ score_a: 13, score_b: 7 });
  });

  it.each([false, true])('erkennt parallele Änderungen beim Sammelspeichern atomar (%s)', async (confirmed) => {
    if (confirmed) reported();
    db.vorBatch((sqlite) => sqlite.exec("UPDATE tournament_matches SET score_a = 8, score_b = 13 WHERE id = 'm1'"));
    const response = await (await batchSave([result('m1', confirmed ? { expectedResult, confirmOverwrite: true } : {})])).json();
    expect(response.savedMatchIds).toEqual([]);
    expect(response.conflicts).toEqual([{ matchId: 'm1', currentResult: { scoreA: 8, scoreB: 13, noShow: null } }]);
    expect(current()).toMatchObject({ score_a: 8, score_b: 13 });
  });

  it('verhindert alle Schreibzugriffe bei einer ungültigen Partie in der Sammelanfrage', async () => {
    secondMatch();
    await expect(batchSave([result(), result('m2', { scoreA: 7, scoreB: 7 })])).rejects.toMatchObject({ status: 400 });
    expect(current()).toMatchObject({ score_a: null, score_b: null });
  });

  it.each([
    [], null, Array.from({ length: 26 }, () => ({ matchId: 'm1', scoreA: 13, scoreB: 7 })),
    [result(), result()], [result('m1', { expectedResult: { noShow: 'invalid' } })],
    [result('m1', { expectedResult: { scoreA: {} } })],
  ])('verwirft ungültige Sammelanfragen ohne Änderungen (%j)', async (results) => {
    await expect(batchSave(results)).rejects.toMatchObject({ status: 400 });
    expect(current()).toMatchObject({ score_a: null, score_b: null });
  });

  it('schreibt keine Partie einer anderen Runde oder eines anderen Turniers', async () => {
    await expect(batchSave([result()], 'r2')).rejects.toMatchObject({ status: 404 });
    await expect(batchSave([result()], 'r1', { ...tournament, id: 't2' })).rejects.toMatchObject({ status: 404 });
    expect(current()).toMatchObject({ score_a: null, score_b: null });
  });

  it('verweigert Sammelschreiben für Desktop-Turniere und ohne Anmeldung', async () => {
    await expect(batchSave([result()], 'r1', { ...tournament, desktop_execution: 1 })).rejects.toMatchObject({ status: 409 });
    const response = await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/rounds/r1/results', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ results: [result()] }),
    }), { DB: db });
    expect(response.status).toBe(401);
    expect(current()).toMatchObject({ score_a: null, score_b: null });
  });

});
