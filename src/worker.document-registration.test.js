// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { upsertDocumentRegistration } from './worker.js';

// node:sqlite kennt Vite nicht als Builtin, daher per require laden.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const migrationsDir = new URL('../migrations/', import.meta.url);

const ONLINE_ID = '44444444-4444-4444-8444-444444444444';
const VERALTETE_LOKALE_ID = '33333333-3333-4333-8333-333333333333';
const LOKALE_ID = '55555555-5555-4555-8555-555555555555';

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

function anfrage(body) {
  return new Request('https://ptm.test/api/sync', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('Sync-Schreibzugriff des Turnierdokuments auf eine Anmeldung', () => {
  let env;
  const turnier = () => env.DB.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const anmeldung = () => env.DB.sqlite.prepare('SELECT * FROM registrations WHERE id = ?').get(ONLINE_ID);

  beforeEach(() => {
    env = { DB: d1MitSchema() };
    env.DB.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    env.DB.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility,
        created_at, updated_at, document_managed, desktop_execution)
      VALUES ('t1', 'u1', 'Turnier', '2026-09-28', 'Ort', 'tete', 'running', 'public', '2026-09-01', '2026-09-01', 1, 1)`).run();
    env.DB.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation,
        registered_at, created_at, updated_at, local_registration_uuid, execution_revision)
      VALUES (?, 't1', 'Maria', 'Bieder', 'mb@example.test', 'confirmed', 'inactive', '2026-09-01', '2026-09-01', '2026-09-01', ?, 3)`)
      .run(ONLINE_ID, VERALTETE_LOKALE_ID);
  });

  it('korrigiert den Namen über die Online-ID, auch wenn online eine veraltete lokale ID hängt', async () => {
    const response = await upsertDocumentRegistration(anfrage({
      firstName: 'Eustachius', lastName: 'Goetze', documentMaster: true, onlineRegistrationId: ONLINE_ID,
      expectedExecutionRevision: 3,
    }), env, turnier(), LOKALE_ID);

    expect(response.status).toBe(200);
    expect(anmeldung()).toMatchObject({
      first_name: 'Eustachius', last_name: 'Goetze', email: 'mb@example.test',
      local_registration_uuid: VERALTETE_LOKALE_ID, execution_revision: 4,
    });
  });

  it('lehnt eine veraltete Ausführungsrevision weiterhin ab', async () => {
    await expect(upsertDocumentRegistration(anfrage({
      firstName: 'Eustachius', lastName: 'Goetze', documentMaster: true, onlineRegistrationId: ONLINE_ID,
      expectedExecutionRevision: 2,
    }), env, turnier(), LOKALE_ID)).rejects.toMatchObject({ status: 409 });
    expect(anmeldung().last_name).toBe('Bieder');
  });

  it('meldet eine nicht mehr vorhandene Online-Anmeldung mit 404', async () => {
    await expect(upsertDocumentRegistration(anfrage({
      firstName: 'Eustachius', lastName: 'Goetze', documentMaster: true,
      onlineRegistrationId: '66666666-6666-4666-8666-666666666666', expectedExecutionRevision: 1,
    }), env, turnier(), LOKALE_ID)).rejects.toMatchObject({ status: 404 });
  });

  it('liefert bei wiederholter Neuanlage die bereits angelegte Anmeldung statt einer zweiten', async () => {
    const response = await upsertDocumentRegistration(anfrage({ firstName: 'Maria', lastName: 'Bieder' }),
      env, turnier(), VERALTETE_LOKALE_ID);

    expect(await response.json()).toMatchObject({ created: false, registration: { id: ONLINE_ID } });
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS anzahl FROM registrations WHERE tournament_id = 't1'").get().anzahl).toBe(1);
  });
});
