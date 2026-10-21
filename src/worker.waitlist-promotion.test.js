// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { promoteWaitlist } from './worker.js';

describe('Automatisches Nachrücken aus der Warteliste', () => {
  let env;
  const status = (id) => env.DB.sqlite.prepare('SELECT status FROM registrations WHERE id = ?').get(id).status;
  const postbox = (userId) => env.DB.sqlite.prepare(
    "SELECT event_data FROM postbox_messages WHERE recipient_id = ? AND event_type = 'registration_status_changed'",
  ).all(userId).map((row) => JSON.parse(row.event_data));
  const mailsAn = () => env.MAIL_QUEUE.send.mock.calls.map(([message]) => message.to);

  function anmeldung(id, registrationStatus, registeredAt, extra = {}) {
    const columns = { id, tournament_id: 't1', first_name: id, last_name: 'Team', email: `${id}@example.test`,
      status: registrationStatus, registered_at: registeredAt, created_at: registeredAt, updated_at: registeredAt,
      cancel_token: `token-${id}`, ...extra };
    const names = Object.keys(columns);
    env.DB.sqlite.prepare(`INSERT INTO registrations (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
      .run(...Object.values(columns));
  }

  function stornieren(token) {
    return worker.fetch(new Request('https://ptm.test/api/registrations/cancel-by-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    }), env);
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    env.DB.sqlite.exec(`INSERT INTO users (id, email, role, mail_enabled, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 1, 'salt', 'hash', '2026-09-01', '2026-09-01'),
             ('partner', 'partner@example.test', 'user', 1, 'salt', 'hash', '2026-09-01', '2026-09-01'),
             ('melder', 'melder@example.test', 'user', 1, 'salt', 'hash', '2026-09-01', '2026-09-01');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at,
        max_registrations, waitlist_enabled)
      VALUES ('t1', 'owner', 'Turnier', '2099-09-28', 'Ort', 'doublette', 'registration', 'public', '2026-09-01', '2026-09-01', 2, 1);`);
    anmeldung('a', 'confirmed', '2026-09-01T10:00:00.000Z');
    anmeldung('b', 'confirmed', '2026-09-01T11:00:00.000Z');
    anmeldung('w1', 'waitlist', '2026-09-02T10:00:00.000Z', { partner_first_name: 'Paula', partner_last_name: 'Partner',
      partner_email: 'partner@example.test', partner_user_id: 'partner', registrant_user_id: 'melder' });
    anmeldung('w2', 'waitlist', '2026-09-03T10:00:00.000Z');
  });

  it('bestätigt nach einem Storno den Ersten der Warteliste und informiert das ganze Team per Mail und Postbox', async () => {
    expect((await stornieren('token-a')).status).toBe(200);

    expect(status('w1')).toBe('confirmed');
    expect(status('w2')).toBe('waitlist');
    expect(mailsAn()).toEqual(expect.arrayContaining(['w1@example.test', 'partner@example.test']));
    const bestaetigung = env.MAIL_QUEUE.send.mock.calls.find(([message]) => message.to === 'partner@example.test')[0];
    expect(bestaetigung.subject).toContain('Von der Warteliste nachgerückt');
    expect(postbox('partner')).toEqual([expect.objectContaining({ status: 'confirmed', promoted: true, ownRegistration: true })]);
    expect(postbox('melder')).toEqual([expect.objectContaining({ promoted: true, ownRegistration: true })]);
    expect(postbox('owner')).toEqual(expect.arrayContaining([expect.objectContaining({ promoted: true, participant: 'w1 Team' })]));
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'waitlist_promoted'").get().n).toBe(1);
  });

  it('setzt den Nachrücker bei Turnieren mit Freigabe auf offen', async () => {
    env.DB.sqlite.prepare("UPDATE tournaments SET approval_required = 1 WHERE id = 't1'").run();

    await stornieren('token-a');

    expect(status('w1')).toBe('pending');
  });

  it('rückt nicht nach, wenn die Turnierleitung es abgeschaltet hat', async () => {
    env.DB.sqlite.prepare("UPDATE tournaments SET waitlist_auto_promote = 0 WHERE id = 't1'").run();

    await stornieren('token-a');

    expect(status('w1')).toBe('waitlist');
  });

  it('rückt nach Anmeldeschluss nach, aber nicht mehr nach dem Turnierstart', async () => {
    env.DB.sqlite.prepare("UPDATE tournaments SET registration_deadline = '2026-01-01T00:00:00.000Z' WHERE id = 't1'").run();
    env.DB.sqlite.prepare("UPDATE registrations SET status = 'cancelled' WHERE id = 'a'").run();
    expect((await promoteWaitlist(env, 't1')).map((row) => row.id)).toEqual(['w1']);

    env.DB.sqlite.prepare("UPDATE tournaments SET status = 'running' WHERE id = 't1'").run();
    env.DB.sqlite.prepare("UPDATE registrations SET status = 'cancelled' WHERE id = 'b'").run();
    expect(await promoteWaitlist(env, 't1')).toEqual([]);
    expect(status('w2')).toBe('waitlist');
  });

  it('füllt nur die freien Plätze und überbucht auch bei wiederholtem Aufruf nicht', async () => {
    env.DB.sqlite.prepare("UPDATE tournaments SET max_registrations = 3 WHERE id = 't1'").run();

    const [erster, zweiter] = await Promise.all([promoteWaitlist(env, 't1'), promoteWaitlist(env, 't1')]);

    expect([...erster, ...zweiter].map((row) => row.id)).toEqual(['w1']);
    expect(status('w2')).toBe('waitlist');
  });
});
