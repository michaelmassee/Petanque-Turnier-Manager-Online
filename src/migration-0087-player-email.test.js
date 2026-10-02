// @vitest-environment node
// Migration 0087: Die Kontakt-E-Mail entfällt, die E-Mail von Spieler 1 wird die Adresse der Anmeldung (E-11).
import { describe, expect, it } from 'vitest';
import { d1MitSchema, migrationSql } from './test-support/d1.js';

describe('Migration 0087 (E-Mail von Spieler 1)', () => {
  it('übernimmt die Kontaktadresse als E-Mail von Spieler 1 und richtet die Anmeldung danach aus', () => {
    const { sqlite } = d1MitSchema();
    sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'owner@example.test', 'user', 's', 'h', '2026-01-01', '2026-01-01');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'owner', 'T', '2099-01-01', 'Ort', 'doublette', 'registration', 'public', '2026-01-01', '2026-01-01')`);
    const anmeldung = (id, email, playerEmail) => sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name,
        last_name, email, player_email, status, registered_at, created_at, updated_at)
      VALUES (?, 't1', 'Anna', 'Adler', ?, ?, 'confirmed', '2026-01-01', '2026-01-01', '2026-01-01')`).run(id, email, playerEmail);
    anmeldung('alt', ' Anna@Example.test ', null);
    anmeldung('abweichend', 'melder@example.test', 'spielerin@example.test');
    anmeldung('gleich', 'anna@example.test', 'anna@example.test');
    anmeldung('ohne', 'ohne-email-1@ohne-email.invalid', null);

    sqlite.exec(migrationSql('0087_registration_player_email.sql'));

    const zeilen = Object.fromEntries(sqlite.prepare('SELECT id, email, player_email, user_id FROM registrations').all()
      .map((row) => [row.id, row]));
    expect(zeilen.alt).toMatchObject({ email: 'anna@example.test', player_email: 'anna@example.test', user_id: null });
    expect(zeilen.abweichend).toMatchObject({ email: 'spielerin@example.test', player_email: 'spielerin@example.test' });
    expect(zeilen.gleich).toMatchObject({ email: 'anna@example.test', player_email: 'anna@example.test' });
    expect(zeilen.ohne).toMatchObject({ email: 'ohne-email-1@ohne-email.invalid', player_email: null });
  });
});
