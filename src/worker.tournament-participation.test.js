// @vitest-environment node
// „Alle aktivieren/deaktivieren“ in der Turnierdurchführung: betrifft alle bestätigten Meldungen,
// ausgesetzte bleiben ausgesetzt.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { getTournamentById, setTournamentParticipation } from './worker.js';

describe('Teilnahme aller Meldungen setzen', () => {
  let db;
  const turnier = () => getTournamentById(db, 't1');
  const meldung = (id, status, participation) => db.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
    VALUES (?, 't1', ?, 'Muster', ?, ?, ?, '2026-10-15T10:00:00Z', '2026-10-15', '2026-10-15')`).run(id, id, `${id}@example.test`, status, participation);
  const teilnahme = () => Object.fromEntries(db.sqlite.prepare('SELECT id, participation FROM registrations ORDER BY id').all().map((row) => [row.id, row.participation]));

  beforeEach(() => {
    db = d1MitSchema();
    db.sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 's', 'h', '2026-10-15', '2026-10-15');
      INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, registration_type, status, visibility, created_at, updated_at)
      VALUES ('t1', 'u1', 'Test', '2026-10-15', 'Ort', 'schweizer', 'doublette', 'team', 'running', 'public', '2026-10-15', '2026-10-15')`);
    meldung('a', 'confirmed', 'active');
    meldung('b', 'confirmed', 'inactive');
    meldung('c', 'confirmed', 'withdrawn');
    meldung('d', 'waitlist', 'inactive');
  });

  it('aktiviert alle bestätigten, lässt ausgesetzte und nicht bestätigte unberührt', async () => {
    const response = await (await setTournamentParticipation(db, await turnier(), 'active')).json();
    expect(response).toEqual({ updatedCount: 1 });
    expect(teilnahme()).toEqual({ a: 'active', b: 'active', c: 'withdrawn', d: 'inactive' });
  });

  it('deaktiviert alle bestätigten', async () => {
    await setTournamentParticipation(db, await turnier(), 'inactive');
    expect(teilnahme()).toEqual({ a: 'inactive', b: 'inactive', c: 'withdrawn', d: 'inactive' });
  });

  it('setzt nicht alle auf einmal aus', async () => {
    await expect(setTournamentParticipation(db, await turnier(), 'withdrawn')).rejects.toMatchObject({ status: 400 });
    expect(teilnahme().a).toBe('active');
  });
});
