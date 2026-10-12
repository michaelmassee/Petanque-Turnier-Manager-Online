// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { d1MitSchema, migrationSql } from './test-support/d1.js';

describe('Migration 0107 (Live-Ansicht immer verfügbar)', () => {
  it('aktiviert die alte Spalte für bestehende Turniere, ohne sie zu entfernen', () => {
    const { sqlite } = d1MitSchema();
    sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'owner@example.test', 'user', 's', 'h', '2026-01-01', '2026-01-01');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, live_view_enabled, created_at, updated_at)
      VALUES ('old', 'owner', 'Alt', '2099-01-01', 'Ort', 'doublette', 'registration', 'public', 0, '2026-01-01', '2026-01-01'),
             ('new', 'owner', 'Neu', '2099-01-02', 'Ort', 'doublette', 'registration', 'public', 1, '2026-01-01', '2026-01-01');`);

    sqlite.exec(migrationSql('0107_live_view_always_enabled.sql'));

    expect(sqlite.prepare('SELECT id, live_view_enabled FROM tournaments ORDER BY id').all())
      .toEqual([{ id: 'new', live_view_enabled: 1 }, { id: 'old', live_view_enabled: 1 }]);
  });
});
