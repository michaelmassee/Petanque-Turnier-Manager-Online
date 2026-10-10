// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { findMyLiveRegistration, getRegistrationWithTournament, rejectRegistration, updateRegistration } from './worker.js';

function setup() {
  const DB = d1MitSchema();
  DB.sqlite.prepare(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, created_at, updated_at)
    VALUES ('owner', 'leitung@example.test', 'Lea', 'Leitung', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01')`).run();
  DB.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, registration_type, status, visibility, created_at, updated_at)
    VALUES ('t1', 'owner', 'Herbstpokal', '2099-09-28', 'Ort', 'tete', 'forme', 'registration', 'public', '2026-01-01', '2026-01-01')`).run();
  DB.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, team_name, user_id, status, participation, registered_at, created_at, updated_at, language)
    VALUES ('r1', 't1', 'Anna', 'Adler', 'anna@example.test', 'Boule-Asse', 'owner', 'pending', 'inactive', '2026-01-01', '2026-01-01', '2026-01-01', 'de')`).run();
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

describe('Abgelehnte Meldungen gelten nicht als aktiv', () => {
  const reject = async (env) => rejectRegistration(new Request('https://ptm.test/api/registrations/r1/reject', { method: 'POST', body: JSON.stringify({ reason: 'Voll' }) }),
    env, await getRegistrationWithTournament(env.DB, 'r1'), { id: 'owner', role: 'user' });
  const edit = async (env, id, fields) => updateRegistration(new Request(`https://ptm.test/api/registrations/${id}`, {
    method: 'PUT', body: JSON.stringify({ firstName: 'Anna', lastName: 'Adler', email: 'anna@example.test', playerEmail: 'anna@example.test', ...fields }),
  }), env, await getRegistrationWithTournament(env.DB, id), { id: 'owner', role: 'user' });

  it('gibt den Teamnamen frei', async () => {
    const env = setup();
    env.DB.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at, language)
      VALUES ('r2', 't1', 'Ben', 'Berg', 'ben@example.test', 'pending', 'inactive', '2026-01-02', '2026-01-02', '2026-01-02', 'de')`).run();
    await reject(env);
    await edit(env, 'r2', { firstName: 'Ben', lastName: 'Berg', email: 'ben@example.test', playerEmail: 'ben@example.test', teamName: 'Boule-Asse', status: 'pending' });
    expect(env.DB.sqlite.prepare("SELECT team_name FROM registrations WHERE id = 'r2'").get().team_name).toBe('Boule-Asse');
  });

  it('beendet den Zugang zur Live-Ansicht', async () => {
    const env = setup();
    env.DB.sqlite.prepare("UPDATE tournaments SET live_view_enabled = 1 WHERE id = 't1'").run();
    await expect(findMyLiveRegistration(env.DB, { id: 'owner' }, 'r1')).resolves.toBeTruthy();
    await reject(env);
    await expect(findMyLiveRegistration(env.DB, { id: 'owner' }, 'r1')).rejects.toMatchObject({ status: 404 });
  });

  it('lässt sich nicht über den Bearbeiten-Dialog ablehnen', async () => {
    const env = setup();
    await expect(edit(env, 'r1', { status: 'rejected' })).rejects.toMatchObject({ status: 400 });
    expect(env.DB.sqlite.prepare("SELECT status FROM registrations WHERE id = 'r1'").get().status).toBe('pending');
  });

  it('leert Grund und Bearbeiter, wenn die Meldung wieder aufgenommen wird', async () => {
    const env = setup();
    await reject(env);
    await edit(env, 'r1', { status: 'confirmed' });
    expect(env.DB.sqlite.prepare("SELECT status, rejection_reason, rejected_at, rejected_by FROM registrations WHERE id = 'r1'").get())
      .toEqual({ status: 'confirmed', rejection_reason: null, rejected_at: null, rejected_by: null });
  });

  it('behält den Grund bei einer Bearbeitung ohne Statuswechsel', async () => {
    const env = setup();
    await reject(env);
    await edit(env, 'r1', { firstName: 'Anne', status: 'rejected' });
    expect(env.DB.sqlite.prepare("SELECT first_name, status, rejection_reason FROM registrations WHERE id = 'r1'").get())
      .toEqual({ first_name: 'Anne', status: 'rejected', rejection_reason: 'Voll' });
  });
});
