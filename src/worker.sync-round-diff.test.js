// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import worker from './worker.js';

// Rundenaufträge aus dem Turnierdokument schreiben nur geänderte Partien: Jede Ergebniseingabe schickt die ganze Runde,
// Löschen und Neuanlegen aller Partien hätte bei 25 Partien rund 200 geschriebene D1-Zeilen je Ergebnis gekostet.
describe('Rundenauftrag gleicht Partien ab statt sie neu anzulegen', () => {
  const PTM_ZUGANG = 'e2e-api-key-mit-ausreichender-laenge';
  const IDS = ['a', 'b', 'c', 'd', 'e', 'f'].map((letter) => `11111111-1111-4111-8111-${letter.repeat(12)}`);
  const [A, B, C, D, E, F] = IDS;
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const partien = () => env.DB.sqlite.prepare(`SELECT id, team_a_registration_ids AS teamA, team_b_registration_ids AS teamB,
      score_a, score_b, match_index, court, no_show, updated_at FROM tournament_matches ORDER BY created_at, match_index`).all();
  const runde = async (matches) => {
    const request = syncAnfrage('PUT', '/api/sync/tournaments/t1/rounds/1', { matches });
    request.headers.set('Authorization', `Bearer ${PTM_ZUGANG}`);
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    return response.json();
  };
  const grundstand = [
    { teamA: [A], teamB: [B], court: '1' },
    { teamA: [C], teamB: [D], court: '2' },
    { teamA: [E], teamB: [F], court: '3' },
  ];

  beforeEach(() => {
    env = { DB: d1MitSchema() };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01')`);
    sql(`INSERT INTO api_keys (id, user_id, key_hash, label, status, requested_at, approved_at, created_at, updated_at)
      VALUES ('key1', 'owner', ?, 'PTM', 'approved', '2026-01-01', '2026-01-01', '2026-01-01', '2026-01-01')`,
    createHash('sha256').update(PTM_ZUGANG).digest('hex'));
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, registration_type, type, status, visibility,
      desktop_execution, created_at, updated_at)
      VALUES ('t1', 'owner', 'Turnier', '2099-09-28', 'Ort', 'tete', 'forme', 'schweizer', 'running', 'public', 1,
        '2026-01-01', '2026-01-01')`);
    for (const id of IDS) {
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
        VALUES (?, 't1', 'Vorname', 'Nachname', ?, 'confirmed', 'active', '2026-01-01', '2026-01-01', '2026-01-01')`, id, `${id}@example.test`);
    }
    bindeDokument(env.DB.sqlite, 't1');
  });

  it('ändert bei einem neuen Ergebnis nur diese Partie und behält die Partie-IDs', async () => {
    expect(await runde(grundstand)).toMatchObject({ created: true, matchCount: 3 });
    const vorher = partien();
    sql("UPDATE tournament_matches SET updated_at = 'unberuehrt'");

    expect(await runde(grundstand.map((match, index) => (index === 1 ? { ...match, scoreA: 13, scoreB: 9 } : match))))
      .toMatchObject({ created: false, matchCount: 3 });

    const nachher = partien();
    expect(nachher.map((partie) => partie.id)).toEqual(vorher.map((partie) => partie.id));
    expect(nachher.map((partie) => [partie.score_a, partie.score_b])).toEqual([[null, null], [13, 9], [null, null]]);
    expect(nachher.map((partie) => partie.updated_at === 'unberuehrt')).toEqual([true, false, true]);
  });

  it('lässt bei unverändertem Stand alle Partien unberührt', async () => {
    await runde(grundstand);
    sql("UPDATE tournament_matches SET updated_at = 'unberuehrt'");

    await runde(grundstand);

    expect(partien().every((partie) => partie.updated_at === 'unberuehrt')).toBe(true);
  });

  it('übernimmt eine neu ausgeloste Runde mit weniger und dann mehr Partien in richtiger Reihenfolge', async () => {
    await runde(grundstand);

    await runde([{ teamA: [A], teamB: [D] }, { teamA: [C], teamB: [B] }]);
    expect(partien().map((partie) => [JSON.parse(partie.teamA), JSON.parse(partie.teamB), partie.match_index, partie.court]))
      .toEqual([[[A], [D], 0, null], [[C], [B], 1, null]]);

    await runde([{ teamA: [A], teamB: [B] }, { teamA: [C], teamB: [D] }, { teamA: [E], teamB: [F] }]);
    expect(partien().map((partie) => [JSON.parse(partie.teamA)[0], partie.match_index])).toEqual([[A, 0], [C, 1], [E, 2]]);
  });

  it('setzt online gesetzte Zusatzwerte wie bisher auf den Standard zurück', async () => {
    await runde(grundstand);
    sql("UPDATE tournament_matches SET no_show = 'a', result_report_pending = 1 WHERE match_index = 0");

    await runde(grundstand);

    expect(env.DB.sqlite.prepare('SELECT no_show, result_report_pending FROM tournament_matches WHERE match_index = 0').get())
      .toEqual({ no_show: null, result_report_pending: 0 });
  });
});
