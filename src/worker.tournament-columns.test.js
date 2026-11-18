// @vitest-environment node
// D1 liefert höchstens 100 Spalten je Ergebnis ("too many columns in result set"). getTournamentById liest
// tournaments.* plus Unterabfragen; eine weitere Spalte an tournaments ließ am 2026-11-18 jede Turnierabfrage mit 500
// scheitern (Migration 0161, behoben mit 0162). Neue Turnierdaten gehören in eine eigene Tabelle.
import { describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { getTournamentById } from './worker.js';

const D1_MAX_RESULT_COLUMNS = 100;

describe('Spaltenlimit von D1', () => {
  it('getTournamentById bleibt unter 100 Ergebnisspalten', async () => {
    const db = d1MitSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'o@example.test', 'user', 's', 'h', '2026-01-01', '2026-01-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, registration_type, type, status,
      visibility, created_at, updated_at) VALUES ('t1', 'owner', 'T', '2099-01-01', 'O', 'tete', 'forme', 'schweizer', 'draft',
      'public', '2026-01-01', '2026-01-01')`).run();

    const tournament = await getTournamentById(db, 't1');

    expect(Object.keys(tournament).length).toBeLessThanOrEqual(D1_MAX_RESULT_COLUMNS);
  });
});
