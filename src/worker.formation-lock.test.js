// @vitest-environment node
// Formation nach der ersten Anmeldung: Vorhandene Anmeldungen passen nur zur Teamgröße, unter der sie abgegeben
// wurden. Die Formation bleibt daher fest, sobald aktive Anmeldungen oder Wartelistenplätze vorliegen.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

describe('Formation bei vorhandenen Anmeldungen', () => {
  let env;
  const sql = (query, ...args) => env.DB.sqlite.prepare(query).run(...args);
  const turnier = () => env.DB.sqlite.prepare("SELECT formation, formation_other FROM tournaments WHERE id = 't1'").get();
  const bearbeite = (formation) => worker.fetch(new Request('https://ptm.test/api/tournaments/t1', {
    method: 'PUT', headers: { Cookie: 'ptm_session=session1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Turnier', date: '2099-07-02', location: 'Berlin', latitude: 52.52, longitude: 13.405,
      type: 'ko', formation, registrationType: 'forme', status: 'registration', visibility: 'public' }),
  }), env);
  const melde = (id, status) => sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status,
      registered_at, created_at, updated_at)
    VALUES (?, 't1', 'Anna', 'A', 'anna@example.test', ?, '2026-10-01', '2026-10-01', '2026-10-01')`, id, status);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { sendBatch: vi.fn(async () => {}) } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, language, created_at, updated_at)
      VALUES ('u1', 'one@example.test', 'user', 's', 'h', 'de', '2026-10-13', '2026-10-13')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('session1', 'u1', '2199-01-01', '2026-10-13')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, registration_type, status,
        visibility, created_at, updated_at)
      VALUES ('t1', 'u1', 'Turnier', '2099-07-02', 'Berlin', 'ko', 'doublette', 'forme', 'registration', 'public',
        '2026-10-01', '2026-10-01')`);
  });

  it('ändert die Formation, solange keine Anmeldung vorliegt', async () => {
    expect((await bearbeite('triplette')).status).toBe(200);
    expect(turnier()).toEqual({ formation: 'triplette', formation_other: 0 });
  });

  it('sperrt die Formation bei einer aktiven Anmeldung', async () => {
    melde('r1', 'confirmed');

    const response = await bearbeite('triplette');

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ details: { code: 'formation_locked' } });
    expect(turnier()).toEqual({ formation: 'doublette', formation_other: 0 });
  });

  it('sperrt auch den Wechsel auf „andere“ bei einem Wartelistenplatz', async () => {
    melde('r1', 'waitlist');

    expect((await bearbeite('andere')).status).toBe(409);
    expect(turnier()).toEqual({ formation: 'doublette', formation_other: 0 });
  });

  it('erlaubt das Bearbeiten mit unveränderter Formation', async () => {
    melde('r1', 'confirmed');

    expect((await bearbeite('doublette')).status).toBe(200);
  });

  it('zählt stornierte Anmeldungen nicht', async () => {
    melde('r1', 'cancelled');

    expect((await bearbeite('triplette')).status).toBe(200);
  });
});
