// @vitest-environment node
// "Nachricht an Team": Turnierleitung schreibt den Personen einer Anmeldung per E-Mail und Postbox, jeweils mit Turnierlink.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { sendTeamMessage } from './worker.js';
import { createPlaceholderEmail } from './lib/registration-email.js';

const LEITUNG = { id: 'u1', role: 'user', email: 'leitung@example.test', firstName: 'Lea', lastName: 'Leitung' };

describe('Nachricht an Team', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const zeile = (statement, ...params) => env.DB.sqlite.prepare(statement).get(...params);
  const alle = (statement, ...params) => env.DB.sqlite.prepare(statement).all(...params);
  const mails = () => env.MAIL_QUEUE.send.mock.calls.map(([nachricht]) => nachricht).filter((nachricht) => nachricht.to);
  const anmeldung = () => zeile("SELECT * FROM registrations WHERE id = 'r1'");

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, first_name, last_name, password_salt, password_hash, created_at, updated_at, mail_enabled)
      VALUES ('u1', 'leitung@example.test', 'user', 'Lea', 'Leitung', 'salt', 'hash', '2026-09-01', '2026-09-01', 1),
             ('u2', 'paul@example.test', 'user', 'Paul', 'Partner', 'salt', 'hash', '2026-09-01', '2026-09-01', 0)`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'u1', 'Herbstturnier', '2099-09-28', 'Ort', 'doublette', 'registration', 'public', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, partner_first_name, partner_email, partner_user_id, status,
        participation, registered_at, created_at, updated_at, execution_revision, language)
      VALUES ('r1', 't1', 'Maria', 'Bieder', 'maria@example.test', 'Paul', 'paul@example.test', 'u2', 'confirmed', 'inactive',
        '2026-09-01', '2026-09-01', '2026-09-01', 1, 'de')`);
  });

  it('schickt allen Teammitgliedern eine Mail mit Nachricht und Turnierlink', async () => {
    const response = await sendTeamMessage(env, anmeldung(), LEITUNG, 'Bitte Lizenz mitbringen.', 'https://ptm.test');

    expect(await response.json()).toEqual({ emailed: 2, postbox: 1 });
    expect(mails().map((mail) => mail.to).sort()).toEqual(['maria@example.test', 'paul@example.test']);
    for (const mail of mails()) {
      expect(mail.subject).toBe('Nachricht der Turnierleitung: Herbstturnier');
      expect(mail.messageBox).toBe('Bitte Lizenz mitbringen.');
      expect(mail.textAfterMessageBox).toContain('https://ptm.test/turniere/t1/info');
    }
  });

  it('legt die Nachricht mit Turnierlink in die Postbox verknüpfter Konten', async () => {
    await sendTeamMessage(env, anmeldung(), LEITUNG, 'Bitte Lizenz mitbringen.', 'https://ptm.test');

    const nachrichten = alle("SELECT * FROM postbox_messages WHERE recipient_id = 'u2'");
    expect(nachrichten).toHaveLength(1);
    expect(nachrichten[0].sender_id).toBe('u1');
    expect(nachrichten[0].body).toContain('Bitte Lizenz mitbringen.');
    expect(nachrichten[0].body).toContain('Herbstturnier: https://ptm.test/turniere/t1/info');
    expect(zeile("SELECT action FROM audit_log WHERE action = 'team_message_sent'")).toBeTruthy();
  });

  it('verschickt ohne Mailfreigabe nur in die Postbox', async () => {
    sql("UPDATE users SET mail_enabled = 0 WHERE id = 'u1'");
    const response = await sendTeamMessage(env, anmeldung(), LEITUNG, 'Hallo', 'https://ptm.test');

    expect(await response.json()).toEqual({ emailed: 0, postbox: 1 });
    expect(mails()).toHaveLength(0);
  });

  it('lehnt leere Nachrichten und Anmeldungen ohne Empfänger ab', async () => {
    await expect(sendTeamMessage(env, anmeldung(), LEITUNG, '', 'https://ptm.test')).rejects.toMatchObject({ status: 400 });
    sql("UPDATE registrations SET email = ?, partner_email = NULL, partner_user_id = NULL WHERE id = 'r1'", createPlaceholderEmail());
    await expect(sendTeamMessage(env, anmeldung(), LEITUNG, 'Hallo', 'https://ptm.test')).rejects.toMatchObject({ status: 409 });
  });
});
