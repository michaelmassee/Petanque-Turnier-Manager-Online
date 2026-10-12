// @vitest-environment node
// Turnier-Option „WhatsApp-Gruppe“: Der Einladungslink steht in den Mails an Gemeldete/Teammitglieder,
// ist aber nur für die Turnierverwaltung sichtbar (sonst könnte jeder der Gruppe beitreten).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { buildDirectionsLink, createBroadcastPostboxMessage, directionsEmailBlock, resendLiveLink, toPublicTournament, whatsappGroupEmailBlock } from './worker.js';

const GRUPPE = 'https://chat.whatsapp.com/AbCdEf123';

describe('WhatsApp-Gruppe des Turniers', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const zeile = (statement, ...params) => env.DB.sqlite.prepare(statement).get(...params);
  const mails = () => env.MAIL_QUEUE.send.mock.calls.map(([nachricht]) => nachricht).filter((nachricht) => nachricht.to);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, first_name, last_name, password_salt, password_hash, created_at, updated_at, mail_enabled)
      VALUES ('u1', 'leitung@example.test', 'user', 'Lea', 'Leitung', 'salt', 'hash', '2026-09-01', '2026-09-01', 1)`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at,
        live_view_enabled, whatsapp_group_url)
      VALUES ('t1', 'u1', 'Turnier', '2099-09-28', 'Ort', 'doublette', 'registration', 'public', '2026-09-01', '2026-09-01', 1, ?)`, GRUPPE);
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, partner_first_name, partner_email, status,
        participation, registered_at, created_at, updated_at, execution_revision, language)
      VALUES ('r1', 't1', 'Maria', 'Bieder', 'maria@example.test', 'Paul', 'paul@example.test', 'confirmed', 'inactive',
        '2026-09-01', '2026-09-01', '2026-09-01', 1, 'de')`);
  });

  it('fügt den Link in die Mail an alle Teammitglieder ein', async () => {
    await resendLiveLink(env, zeile("SELECT * FROM registrations WHERE id = 'r1'"), { id: 'u1', role: 'user' }, 'https://ptm.test');

    expect(mails().map((mail) => mail.to).sort()).toEqual(['maria@example.test', 'paul@example.test']);
    for (const mail of mails()) {
      expect(mail.text).toContain(`Tritt der WhatsApp-Gruppe zum Turnier bei:\n${GRUPPE}`);
      expect(mail.text).toContain(buildDirectionsLink('Ort'));
      expect(mail.actions).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: 'Turnier ansehen', icon: '▣' }),
        expect.objectContaining({ label: 'Anfahrt planen', icon: '⌖' }),
        expect.objectContaining({ label: 'Live-Ansicht öffnen', icon: '▶' }),
        expect.objectContaining({ label: 'WhatsApp-Gruppe öffnen', icon: '◉' }),
      ]));
    }
  });

  it('hängt den Link bei Rundmails hinter die Nachricht', async () => {
    await createBroadcastPostboxMessage(env, {
      sender: { id: 'u1', email: 'leitung@example.test', firstName: 'Lea', lastName: 'Leitung' },
      tournament: zeile("SELECT * FROM tournaments WHERE id = 't1'"),
      body: 'Bitte pünktlich sein.',
    });

    expect(mails()).toHaveLength(2);
    expect(mails()[0].textAfterMessageBox).toContain(GRUPPE);
    expect(mails()[0].actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Anfahrt planen', icon: '⌖' }),
      expect.objectContaining({ label: 'WhatsApp-Gruppe öffnen', icon: '◉' }),
    ]));
  });

  it('lässt den Absatz ohne Gruppenlink weg und übersetzt ihn', async () => {
    expect(await whatsappGroupEmailBlock(env.DB, 't1', 'en')).toBe(`\n\nJoin the tournament WhatsApp group:\n${GRUPPE}`);
    sql("UPDATE tournaments SET whatsapp_group_url = NULL WHERE id = 't1'");
    expect(await whatsappGroupEmailBlock(env.DB, 't1', 'de')).toBe('');
  });

  it('erzeugt einen lokalisierten Anfahrts-Link nur mit vorhandenem Ziel', () => {
    const link = buildDirectionsLink('Bouleplatz, Großgasse 18, 61184 Okarben');
    expect(link).toBe('https://www.google.com/maps/dir/?api=1&destination=Bouleplatz%2C%20Gro%C3%9Fgasse%2018%2C%2061184%20Okarben');
    expect(directionsEmailBlock({ location: 'Bouleplatz, Großgasse 18, 61184 Okarben' }, 'en')).toBe(`\n\nDirections to the tournament:\n${link}`);
    expect(directionsEmailBlock({ location: '' }, 'de')).toBe('');
  });

  it('zeigt den Link nur der Turnierverwaltung', () => {
    const row = zeile("SELECT * FROM tournaments WHERE id = 't1'");
    expect(toPublicTournament(row, { id: 'u1', role: 'user' }).whatsappGroupUrl).toBe(GRUPPE);
    expect(toPublicTournament(row, null).whatsappGroupUrl).toBeUndefined();
  });
});
