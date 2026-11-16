// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import worker, { disconnectTournament, executeSyncWrite } from './worker.js';


describe('Trennen eines Turniers vom Turnierdokument', () => {
  let db;

  beforeEach(() => {
    db = d1MitSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at,
        document_managed, sync_document_id, sync_lease_token_hash, sync_takeover_request_id, desktop_execution, desktop_ranking_json)
      VALUES ('t1', 'u1', 'Turnier', '2026-09-28', 'Ort', 'doublette', 'running', 'public', '2026-09-01', '2026-09-01',
        1, 'doc-1', 'lease-hash', 'takeover-1', 1, '[{"place":1}]')`).run();
    bindeDokument(db.sqlite, 't1');
  });

  const trennen = () => executeSyncWrite(syncAnfrage('POST', '/api/sync/tournaments/t1/disconnect', {}), db,
    db.sqlite.prepare('SELECT * FROM tournaments WHERE id = ?').get('t1'), () => disconnectTournament(db, 't1'));

  it('hebt die Desktop-Durchführung auf, damit die Meldeliste online wieder gepflegt werden kann', async () => {
    await trennen();

    const tournament = db.sqlite.prepare('SELECT * FROM tournaments WHERE id = ?').get('t1');
    expect(tournament).toMatchObject({
      document_managed: 0,
      sync_document_id: null,
      sync_lease_token_hash: null,
      sync_takeover_request_id: null,
      desktop_execution: 0,
      desktop_ranking_json: null,
    });
  });

  it('lässt andere Turniere unverändert', async () => {
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at,
        document_managed, desktop_execution) VALUES ('t2', 'u1', 'Anderes', '2026-09-28', 'Ort', 'doublette', 'running', 'public', '2026-09-01', '2026-09-01', 1, 1)`).run();

    await trennen();

    expect(db.sqlite.prepare('SELECT document_managed, desktop_execution FROM tournaments WHERE id = ?').get('t2'))
      .toMatchObject({ document_managed: 1, desktop_execution: 1 });
  });
});

// Web-Gegenstück ohne Dokument-Lease: Der Turnierleiter trennt in der Turnierverwaltung.
describe('Trennen in der Turnierverwaltung', () => {
  let env;

  beforeEach(() => {
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => {}, delete: async () => true } });
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    env.DB.sqlite.exec(`
      INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
        VALUES ('u1', 'leitung@example.test', 'user', 's', 'h', '2026-11-16', '2026-11-16');
      INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s1', 'u1', '2099-01-01T00:00:00.000Z', '2026-11-16');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, type, status, visibility, created_at, updated_at,
          document_managed, sync_document_id, sync_lease_token_hash)
        VALUES ('t1', 'u1', 'Turnier', '2026-11-16', 'Ort', 'doublette', 'formule_x', 'draft', 'public', '2026-11-16', '2026-11-16',
          1, 'doc-1', 'lease-hash');
    `);
  });
  afterEach(() => { env.DB.sqlite.close(); vi.unstubAllGlobals(); });

  it('löst die Dokumentbindung, damit die Eckdaten online wieder bearbeitet werden können', async () => {
    const response = await worker.fetch(new Request('http://localhost/api/tournaments/t1/disconnect', {
      method: 'POST', headers: { Cookie: 'ptm_session=s1' },
    }), env);

    expect(response.status).toBe(200);
    expect(env.DB.sqlite.prepare('SELECT document_managed, sync_document_id FROM tournaments WHERE id = ?').get('t1'))
      .toMatchObject({ document_managed: 0, sync_document_id: null });
    expect(env.DB.sqlite.prepare("SELECT action FROM audit_log WHERE tournament_id = 't1'").all())
      .toEqual([{ action: 'binding_release' }]);
  });
});
