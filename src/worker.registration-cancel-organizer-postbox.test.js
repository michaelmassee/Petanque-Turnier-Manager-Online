// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

describe('Abmeldung: Postbox-Nachricht an die Turnierleitung', () => {
  let env;
  const postboxLeitung = () => env.DB.sqlite.prepare(
    "SELECT event_data FROM postbox_messages WHERE recipient_id = 'owner' AND event_type = 'registration_status_changed'",
  ).all().map((row) => JSON.parse(row.event_data));
  const mailsAnLeitung = () => env.MAIL_QUEUE.send.mock.calls.filter(([message]) => message.to === 'leitung@example.test');

  const perLink = () => worker.fetch(new Request('https://ptm.test/api/registrations/cancel-by-token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'cancel-1' }),
  }), env);
  const absagenAls = (session) => worker.fetch(new Request('https://ptm.test/api/registrations/r1/cancel', {
    method: 'POST', headers: { Cookie: `ptm_session=${session}` },
  }), env);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    env.DB.sqlite.exec(`INSERT INTO users (id, email, role, mail_enabled, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 1, 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('spieler', 'spieler@example.test', 'user', 1, 'salt', 'hash', '2026-01-01', '2026-01-01');
      INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-01-01'),
             ('spieler-session', 'spieler', '2099-01-01T00:00:00.000Z', '2026-01-01');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'tete', 'registration', 'public', '2026-01-01', '2026-01-01');
      INSERT INTO registrations (id, tournament_id, first_name, last_name, email, registrant_user_id, status, cancel_token, registered_at, created_at, updated_at)
      VALUES ('r1', 't1', 'Anna', 'Abmeldung', 'spieler@example.test', 'spieler', 'confirmed', 'cancel-1', '2026-01-01', '2026-01-01', '2026-01-01');`);
  });

  it('meldet die Abmeldung per Link nur in der Postbox, ohne Mail an die Turnierleitung', async () => {
    expect((await perLink()).status).toBe(200);

    expect(postboxLeitung()).toEqual([{ tournamentId: 't1', tournamentName: 'Herbstturnier', status: 'cancelled', participant: 'Anna Abmeldung' }]);
    expect(mailsAnLeitung()).toEqual([]);
  });

  it('meldet „Absagen“ durch das Team, aber nicht die eigene Stornierung der Turnierleitung', async () => {
    await absagenAls('spieler-session');
    expect(postboxLeitung()).toHaveLength(1);

    env.DB.sqlite.prepare("UPDATE registrations SET status = 'confirmed' WHERE id = 'r1'").run();
    await absagenAls('owner-session');
    expect(postboxLeitung()).toHaveLength(1);
  });

  it('meldet eine bereits stornierte Anmeldung nicht doppelt', async () => {
    await perLink();
    await perLink();

    expect(postboxLeitung()).toHaveLength(1);
  });
});
