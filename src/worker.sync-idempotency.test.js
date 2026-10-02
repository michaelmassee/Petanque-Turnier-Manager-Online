// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, DOKUMENT, syncAnfrage } from './test-support/sync.js';
import { executeSyncWrite } from './worker.js';

const AUFTRAG_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUFTRAG_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ANDERES_DOKUMENT = '22222222-2222-4222-8222-222222222222';

describe('Schreibaufträge nach dem Ein-Batch-Muster (E-24, T-19, T-23)', () => {
  let db;

  const turnier = () => db.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const auftraege = () => db.sqlite.prepare("SELECT request_id, counter, state FROM sync_requests WHERE tournament_id = 't1'").all();

  // Setzt die Rangliste und berechnet die Antwort aus dem Zustand nach der Änderung.
  const ranglistenPlan = (wert, afterCommit) => (d1) => ({
    statements: [d1.prepare("UPDATE tournaments SET desktop_ranking_json = ? WHERE id = 't1'").bind(wert)],
    response: {
      sql: "SELECT json_object('status', 200, 'body', json_object('ranking', desktop_ranking_json)) FROM tournaments WHERE id = ?",
      binds: ['t1'],
    },
    afterCommit,
  });

  function senden(body, optionen, plan = ranglistenPlan(JSON.stringify(body))) {
    const request = syncAnfrage('PUT', '/api/sync/tournaments/t1/ranking', body, optionen);
    return executeSyncWrite(request, db, turnier(), plan);
  }

  beforeEach(() => {
    db = d1MitSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility,
        created_at, updated_at)
      VALUES ('t1', 'u1', 'Turnier', '2026-09-28', 'Ort', 'tete', 'running', 'public', '2026-09-01', '2026-09-01')`).run();
    bindeDokument(db.sqlite, 't1', { protocol: 2 });
  });

  it('speichert Zähler, Änderung und Antwort gemeinsam', async () => {
    const antwort = await senden([1], { counter: 1, requestId: AUFTRAG_1 });

    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({ ranking: '[1]' });
    expect(turnier()).toMatchObject({ sync_write_counter: 1, desktop_ranking_json: '[1]' });
    expect(auftraege()).toEqual([{ request_id: AUFTRAG_1, counter: 1, state: 'done' }]);
  });

  it('liefert bei Wiederholung nach dem Commit die gespeicherte Antwort, ohne erneut zu schreiben (P-69)', async () => {
    const afterCommit = vi.fn();
    await senden([1], { counter: 1, requestId: AUFTRAG_1 }, ranglistenPlan('[1]', afterCommit));
    db.sqlite.prepare("UPDATE tournaments SET desktop_ranking_json = '[9]' WHERE id = 't1'").run();

    const wiederholung = await senden([1], { counter: 1, requestId: AUFTRAG_1 }, ranglistenPlan('[1]', afterCommit));

    expect(wiederholung.headers.get('X-PTM-Replayed')).toBe('1');
    expect(await wiederholung.json()).toEqual({ ranking: '[1]' });
    expect(turnier().desktop_ranking_json).toBe('[9]');
    expect(afterCommit).toHaveBeenCalledTimes(1);
  });

  it('lehnt dieselbe Auftrags-ID mit anderem Inhalt ab', async () => {
    await senden([1], { counter: 1, requestId: AUFTRAG_1 });

    await expect(senden([2], { counter: 1, requestId: AUFTRAG_1 }))
      .rejects.toMatchObject({ status: 409, details: { code: 'idempotency_mismatch' } });
  });

  it('erkennt eine parallel weiterschreibende Kopie am Zähler und rollt den ganzen Auftrag zurück (P-63)', async () => {
    await senden([1], { counter: 1, requestId: AUFTRAG_1 });

    await expect(senden([2], { counter: 1, requestId: AUFTRAG_2 }))
      .rejects.toMatchObject({ status: 409, details: { code: 'document_forked' } });

    expect(turnier()).toMatchObject({ sync_write_counter: 1, desktop_ranking_json: '[1]' });
    expect(auftraege()).toHaveLength(1);
  });

  it('lässt Lücken im Zähler zu', async () => {
    await senden([1], { counter: 1, requestId: AUFTRAG_1 });
    await senden([5], { counter: 5, requestId: AUFTRAG_2 });

    expect(turnier().sync_write_counter).toBe(5);
  });

  it('verwirft den Auftrag vollständig, wenn eine Anweisung scheitert', async () => {
    const kaputt = (d1) => ({
      statements: [
        d1.prepare("UPDATE tournaments SET desktop_ranking_json = '[7]' WHERE id = 't1'"),
        d1.prepare('INSERT INTO gibt_es_nicht VALUES (1)'),
      ],
      response: { envelope: { status: 200, body: {} } },
    });

    await expect(senden([7], { counter: 1, requestId: AUFTRAG_1 }, kaputt)).rejects.toThrow();

    expect(turnier()).toMatchObject({ sync_write_counter: 0, desktop_ranking_json: null });
    expect(auftraege()).toEqual([]);
  });

  it('verlangt bei Protokoll 2 Auftrags-ID und gültigen Zähler', async () => {
    await expect(senden([1], { counter: 1 })).rejects.toMatchObject({ status: 400 });
    await expect(senden([1], { requestId: AUFTRAG_1 })).rejects.toMatchObject({ status: 400 });
    await expect(senden([1], { counter: 0, requestId: AUFTRAG_1 })).rejects.toMatchObject({ status: 400 });
  });

  it('weist ein abgelöstes Dokument vor jeder Änderung ab', async () => {
    await expect(senden([1], { counter: 1, requestId: AUFTRAG_1, dokument: ANDERES_DOKUMENT }))
      .rejects.toMatchObject({ status: 409, details: { code: 'document_replaced' } });
    expect(turnier().sync_document_id).toBe(DOKUMENT);
  });

  it('meldet eine zwischen Prüfung und Batch gewechselte Bindung als abgelöst', async () => {
    db.vorBatch((sqlite) => sqlite.prepare("UPDATE tournaments SET sync_lease_token_hash = 'neu' WHERE id = 't1'").run());

    await expect(senden([1], { counter: 1, requestId: AUFTRAG_1 }))
      .rejects.toMatchObject({ status: 409, details: { code: 'document_replaced' } });
    expect(turnier().desktop_ranking_json).toBeNull();
  });

  it('führt Protokoll-1-Aufträge ohne Zähler in einem Batch aus', async () => {
    bindeDokument(db.sqlite, 't1', { protocol: 1 });

    const antwort = await senden([3]);

    expect(await antwort.json()).toEqual({ ranking: '[3]' });
    expect(turnier()).toMatchObject({ sync_write_counter: 0, desktop_ranking_json: '[3]' });
    expect(auftraege()).toEqual([]);
  });
});
