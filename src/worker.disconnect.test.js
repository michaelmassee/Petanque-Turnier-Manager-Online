// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { disconnectTournament } from './worker.js';


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
  });

  it('hebt die Desktop-Durchführung auf, damit die Meldeliste online wieder gepflegt werden kann', async () => {
    await disconnectTournament(db, 't1');

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

    await disconnectTournament(db, 't1');

    expect(db.sqlite.prepare('SELECT document_managed, desktop_execution FROM tournaments WHERE id = ?').get('t2'))
      .toMatchObject({ document_managed: 1, desktop_execution: 1 });
  });
});
