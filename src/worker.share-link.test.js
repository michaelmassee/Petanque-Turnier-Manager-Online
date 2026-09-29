// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTournamentShareLink, deleteTournamentShareLink, hasTournamentShareAccess } from './worker.js';

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

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('Freigabe-Link privater Turniere', () => {
  let db;
  const FREIGABE = 'link-1';

  beforeEach(async () => {
    db = d1MitSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'u1', 'Turnier', '2026-10-04', 'Ort', 'triplette', 'draft', 'private', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare('INSERT INTO tournament_share_links (tournament_id, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('t1', await sha256Hex(FREIGABE), '2026-09-01', '2026-09-01');
  });

  const turnier = () => db.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();

  it('gewährt Zugriff auch auf einen privaten Entwurf', async () => {
    expect(await hasTournamentShareAccess(db, turnier(), FREIGABE)).toBe(true);
  });

  it('verweigert einen falschen Link und öffentliche Turniere', async () => {
    expect(await hasTournamentShareAccess(db, turnier(), 'falsch')).toBe(false);
    db.sqlite.prepare("UPDATE tournaments SET visibility = 'public' WHERE id = 't1'").run();
    expect(await hasTournamentShareAccess(db, turnier(), FREIGABE)).toBe(false);
  });

  const teilen = async () => (await (await createTournamentShareLink(db, 't1', 'https://ptm.test')).json()).shareUrl;
  const schluessel = (shareUrl) => new URL(shareUrl).searchParams.get('share');

  it('liefert beim erneuten Teilen denselben Link, der alte bleibt gültig', async () => {
    db.sqlite.prepare("DELETE FROM tournament_share_links WHERE tournament_id = 't1'").run();

    const erster = await teilen();
    const zweiter = await teilen();

    expect(zweiter).toBe(erster);
    expect(await hasTournamentShareAccess(db, turnier(), schluessel(erster))).toBe(true);
  });

  it('ersetzt einen Link ohne gespeicherten Schlüssel einmalig und behält ihn danach', async () => {
    const neu = await teilen();

    expect(schluessel(neu)).not.toBe(FREIGABE);
    expect(await hasTournamentShareAccess(db, turnier(), FREIGABE)).toBe(false);
    expect(await teilen()).toBe(neu);
  });

  it('erzeugt nach dem Deaktivieren einen neuen Link', async () => {
    const alt = await teilen();
    await deleteTournamentShareLink(db, 't1');

    const neu = await teilen();

    expect(neu).not.toBe(alt);
    expect(await hasTournamentShareAccess(db, turnier(), schluessel(alt))).toBe(false);
  });
});
