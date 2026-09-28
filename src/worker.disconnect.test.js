// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { disconnectTournament } from './worker.js';

// node:sqlite kennt Vite nicht als Builtin, daher per require laden.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const migrationsDir = new URL('../migrations/', import.meta.url);

// D1-Ersatz auf Basis einer In-Memory-SQLite mit dem echten Schema aus allen Migrationen.
function d1MitSchema() {
  const sqlite = new DatabaseSync(':memory:');
  readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
    .forEach((name) => sqlite.exec(readFileSync(new URL(name, migrationsDir), 'utf8')));
  return {
    sqlite,
    prepare(sql) {
      let params = [];
      const statement = {
        bind: (...values) => { params = values; return statement; },
        run: async () => ({ success: true, meta: { changes: sqlite.prepare(sql).run(...params).changes } }),
        first: async () => sqlite.prepare(sql).get(...params) ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
      };
      return statement;
    },
  };
}

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
