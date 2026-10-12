// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

describe('Abmeldung: Berechtigungen', () => {
  let env;

  function requestAs(session) {
    return worker.fetch(new Request('https://ptm.test/api/registrations/r1/cancel', {
      method: 'POST', headers: { Cookie: `ptm_session=${session}` },
    }), env);
  }

  function cancelByToken() {
    return worker.fetch(new Request('https://ptm.test/api/registrations/cancel-by-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'cancel-1' }),
    }), env);
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: () => {} } };
    env.DB.sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('creator', 'ersteller@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('registrant', 'anmelder@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('member', 'teammitglied@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('member2', 'teammitglied2@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('editor', 'bearbeiter@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('outsider', 'fremd@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01');
      INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-01-01'),
             ('creator-session', 'creator', '2099-01-01T00:00:00.000Z', '2026-01-01'),
             ('registrant-session', 'registrant', '2099-01-01T00:00:00.000Z', '2026-01-01'),
             ('member-session', 'member', '2099-01-01T00:00:00.000Z', '2026-01-01'),
             ('member2-session', 'member2', '2099-01-01T00:00:00.000Z', '2026-01-01'),
             ('editor-session', 'editor', '2099-01-01T00:00:00.000Z', '2026-01-01'),
             ('outsider-session', 'outsider', '2099-01-01T00:00:00.000Z', '2026-01-01');
      INSERT INTO tournaments (id, owner_id, creator_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'owner', 'creator', 'Turnier', '2099-09-28', 'Ort', 'tete', 'registration', 'public', '2026-01-01', '2026-01-01');
      INSERT INTO tournament_editors (id, tournament_id, user_id, granted_by, created_at)
      VALUES ('editor-right', 't1', 'editor', 'owner', '2026-01-01');
      INSERT INTO registrations (id, tournament_id, first_name, last_name, email, registrant_user_id, partner_user_id, partner2_user_id, status, participation, cancel_token, registered_at, created_at, updated_at)
      VALUES ('r1', 't1', 'Anna', 'Anmeldung', 'anmeldung@example.test', 'registrant', 'member', 'member2', 'confirmed', 'inactive', 'cancel-1', '2026-01-01', '2026-01-01', '2026-01-01');`);
  });

  it('storniert über den persönlichen Abmelde-Link ohne Konto', async () => {
    expect((await cancelByToken()).status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT status FROM registrations WHERE id = 'r1'").get().status).toBe('cancelled');
  });

  it.each([
    ['anmeldender Nutzer', 'registrant-session'],
    ['verknüpftes Teammitglied (Partner)', 'member-session'],
    ['verknüpftes Teammitglied (Partner 2)', 'member2-session'],
    ['Turnierleiter', 'owner-session'],
    ['Bearbeiter', 'editor-session'],
  ])('erlaubt die Abmeldung für %s', async (_role, session) => {
    expect((await requestAs(session)).status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT status FROM registrations WHERE id = 'r1'").get().status).toBe('cancelled');
  });

  it.each([
    ['ehemaliger Turnier-Ersteller ohne Leitungsrecht', 'creator-session'],
    ['unbeteiligter Nutzer', 'outsider-session'],
  ])('verweigert die Abmeldung für %s', async (_role, session) => {
    expect((await requestAs(session)).status).toBe(403);
    expect(env.DB.sqlite.prepare("SELECT status FROM registrations WHERE id = 'r1'").get().status).toBe('confirmed');
  });
});
