// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { listPostboxRecipients } from './worker.js';
import { d1MitSchema } from './test-support/d1.js';

function seed(sqlite) {
  sqlite.exec(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, created_at, updated_at) VALUES
      ('organizer-1', 'orga@example.test', 'Olga', 'Orga', 'user', 's', 'h', '2026-01-01', '2026-01-01'),
      ('recipient-1', 'ada@example.test', 'Ada', 'Beispiel', 'user', 's', 'h', '2026-01-01', '2026-01-01');
    INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at) VALUES
      ('tournament-1', 'organizer-1', 'Herbstturnier', '2026-10-06', 'Ort', 'doublette', 'registration', 'public', '2026-01-01', '2026-01-01'),
      ('tournament-2', 'organizer-1', 'Leeres Turnier', '2026-11-01', 'Ort', 'doublette', 'registration', 'public', '2026-01-01', '2026-01-01');
    UPDATE tournaments SET registration_enabled = 1;`);
  const anmeldung = (id, status) => sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email,
      status, registered_at, created_at, updated_at)
    VALUES (?, 'tournament-1', 'Anna', 'Adler', ?, ?, '2026-01-01', '2026-01-01', '2026-01-01')`).run(id, `${id}@example.test`, status);
  anmeldung('offen', 'pending');
  anmeldung('bestaetigt', 'confirmed');
  anmeldung('warteliste', 'waitlist');
}

describe('Postbox-Empfänger für Turnier-Broadcasts', () => {
  it('liefert Turnierdatum und zählt nur offene oder bestätigte Meldungen, auch null', async () => {
    const db = d1MitSchema();
    seed(db.sqlite);

    const response = await listPostboxRecipients(db, 'organizer-1');

    await expect(response.json()).resolves.toEqual({
      recipients: [{ id: 'recipient-1', firstName: 'Ada', lastName: 'Beispiel', role: 'user' }],
      tournaments: [
        { id: 'tournament-1', name: 'Herbstturnier', date: '2026-10-06', registrationCount: 2 },
        { id: 'tournament-2', name: 'Leeres Turnier', date: '2026-11-01', registrationCount: 0 },
      ],
    });
  });
});
