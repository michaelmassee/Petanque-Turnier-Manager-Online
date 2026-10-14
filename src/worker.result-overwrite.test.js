// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { setTournamentMatchResult } from './worker.js';

describe('Bestätigtes Überschreiben von Spielergebnissen', () => {
  let db;
  const tournament = { id: 't1', desktop_execution: 0 };
  const current = () => db.sqlite.prepare("SELECT score_a, score_b, no_show FROM tournament_matches WHERE id = 'm1'").get();
  const save = (body = {}) => setTournamentMatchResult(new Request('https://ptm.test/api/tournaments/t1/matches/m1/result', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scoreA: 13, scoreB: 7, ...body }),
  }), db, tournament, 'm1');
  const reported = () => db.sqlite.prepare("UPDATE tournament_matches SET score_a = 6, score_b = 13 WHERE id = 'm1'").run();
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
});
