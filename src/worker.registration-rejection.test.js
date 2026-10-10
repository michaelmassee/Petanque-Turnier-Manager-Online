// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { getRegistrationWithTournament, rejectRegistration } from './worker.js';

function setup() {
  const DB = d1MitSchema();
  DB.sqlite.prepare(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, created_at, updated_at)
    VALUES ('owner', 'leitung@example.test', 'Lea', 'Leitung', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01')`).run();
  DB.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, registration_type, status, visibility, created_at, updated_at)
    VALUES ('t1', 'owner', 'Herbstpokal', '2099-09-28', 'Ort', 'doublette', 'forme', 'registration', 'public', '2026-01-01', '2026-01-01')`).run();
  DB.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at, language)
    VALUES ('r1', 't1', 'Anna', 'Adler', 'anna@example.test', 'pending', 'inactive', '2026-01-01', '2026-01-01', '2026-01-01', 'de')`).run();
  return { DB, MAIL_QUEUE: { send: vi.fn() } };
}

describe('Ablehnung einer offenen Anmeldung', () => {
  it('speichert Status und Grund, ohne einen Platz zu belegen', async () => {
    const env = setup();
    const existing = await getRegistrationWithTournament(env.DB, 'r1');
    const response = await rejectRegistration(new Request('https://ptm.test/api/registrations/r1/reject', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Turnier ist voll.' }),
    }), env, existing, { id: 'owner', role: 'user' });

    expect(response.status).toBe(200);
    expect((await response.json()).registration).toMatchObject({ status: 'rejected', rejectionReason: 'Turnier ist voll.' });
    expect(env.DB.sqlite.prepare("SELECT status, rejection_reason, rejected_by FROM registrations WHERE id = 'r1'").get())
      .toEqual({ status: 'rejected', rejection_reason: 'Turnier ist voll.', rejected_by: 'owner' });
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS count FROM registrations WHERE tournament_id = 't1' AND status IN ('pending', 'confirmed')").get().count).toBe(0);
  });

  it('lässt keine zweite Entscheidung zu', async () => {
    const env = setup();
    const existing = await getRegistrationWithTournament(env.DB, 'r1');
    await rejectRegistration(new Request('https://ptm.test/api/registrations/r1/reject', { method: 'POST', body: '{}' }), env, existing, { id: 'owner', role: 'user' });
    const rejected = await getRegistrationWithTournament(env.DB, 'r1');
    await expect(rejectRegistration(new Request('https://ptm.test/api/registrations/r1/reject', { method: 'POST', body: '{}' }), env, rejected, { id: 'owner', role: 'user' }))
      .rejects.toMatchObject({ status: 409 });
  });
});
