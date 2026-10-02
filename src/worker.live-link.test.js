// @vitest-environment node
// Live-Ansicht über den persönlichen Link (E-21): ohne Konto, nur bei eingeschalteter Turnier-Option „Live-Ansicht“.
// Der Link kommt mit der Anmeldebestätigung; beim Check-in gibt es weder E-Mail noch Postbox-Nachricht (E-09).
// Gespeichert wird nur der Hash des Links; "Live-Link neu senden" macht den bisherigen ungültig (EW-02).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import worker, {
  createRegistration, executeSyncWrite, listMyLiveRegistrations, resendLiveLink, upsertDocumentRegistration,
} from './worker.js';

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const ONLINE_ID = '44444444-4444-4444-8444-444444444444';
const LOKALE_ID = '55555555-5555-4555-8555-555555555555';
const TOKEN = 'a'.repeat(64);

describe('Persönlicher Live-Link (E-21)', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const zeile = (statement, ...params) => env.DB.sqlite.prepare(statement).get(...params);
  const turnier = () => zeile("SELECT * FROM tournaments WHERE id = 't1'");
  const liveAbrufen = (token) => worker.fetch(new Request(`https://ptm.test/api/live/token/${token}`), env);
  const gesendeteTexte = () => env.MAIL_QUEUE.send.mock.calls.map(([nachricht]) => nachricht);

  const linkAusMail = (to) => gesendeteTexte().filter((mail) => mail.to === to).at(-1)?.text.match(/\/live\/t\/([0-9a-f]{64})/)?.[1];

  beforeEach(async () => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at, mail_enabled)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01', 1),
             ('melder', 'melder@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01', 0)`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at,
        live_view_enabled)
      VALUES ('t1', 'u1', 'Turnier', '2099-09-28', 'Ort', 'tete', 'registration', 'public', '2026-09-01', '2026-09-01', 1)`);
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation,
        registered_at, created_at, updated_at, execution_revision, player_email, live_token_hash)
      VALUES (?, 't1', 'Maria', 'Bieder', 'maria@example.test', 'confirmed', 'inactive', '2026-09-01', '2026-09-01',
        '2026-09-01', 1, 'maria@example.test', ?)`, ONLINE_ID, await sha256Hex(TOKEN));
  });

  it('zeigt die Team-Ansicht ohne Login', async () => {
    const antwort = await liveAbrufen(TOKEN);

    expect(antwort.status).toBe(200);
    expect((await antwort.json()).registration).toMatchObject({ id: ONLINE_ID, persons: ['Maria Bieder'] });
  });

  it('gilt nicht für unbekannte, stornierte oder Turniere ohne Live-Ansicht', async () => {
    expect((await liveAbrufen('b'.repeat(64))).status).toBe(404);

    sql("UPDATE tournaments SET live_view_enabled = 0 WHERE id = 't1'");
    expect((await liveAbrufen(TOKEN)).status).toBe(404);

    sql("UPDATE tournaments SET live_view_enabled = 1 WHERE id = 't1'");
    sql("UPDATE registrations SET status = 'cancelled' WHERE id = ?", ONLINE_ID);
    expect((await liveAbrufen(TOKEN)).status).toBe(404);
  });

  it('zeigt die Anmeldung unter „Live“ nur verknüpften Konten, nicht dem Melder über die E-Mail (E-21)', async () => {
    const melder = await (await listMyLiveRegistrations(env.DB, { id: 'melder', email: 'melder@example.test' })).json();
    expect(melder.registrations).toEqual([]);

    sql('UPDATE registrations SET user_id = ? WHERE id = ?', 'melder', ONLINE_ID);
    const verknuepft = await (await listMyLiveRegistrations(env.DB, { id: 'melder', email: 'melder@example.test' })).json();
    expect(verknuepft.registrations.map((entry) => entry.id)).toEqual([ONLINE_ID]);

    sql("UPDATE tournaments SET live_view_enabled = 0 WHERE id = 't1'");
    const ohneLive = await (await listMyLiveRegistrations(env.DB, { id: 'melder', email: 'melder@example.test' })).json();
    expect(ohneLive.registrations).toEqual([]);
  });

  it('verlangt die E-Mail von Spieler 1; eine eigene Kontakt-E-Mail gibt es nicht mehr', async () => {
    const request = new Request('https://ptm.test/api/tournaments/t1/registrations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'kontakt@example.test', firstName: 'Nina', lastName: 'Neu', publicationNoticeAccepted: true,
        personsConsentAccepted: true, feeSelections: [], registrationAnswers: [] }),
    });
    await expect(createRegistration(request, env, turnier())).rejects.toMatchObject({ status: 400 });
  });

  function anmelden() {
    const request = new Request('https://ptm.test/api/tournaments/t1/registrations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerEmail: 'neu@example.test', firstName: 'Nina', lastName: 'Neu', publicationNoticeAccepted: true,
        personsConsentAccepted: true, feeSelections: [], registrationAnswers: [] }),
    });
    return createRegistration(request, env, turnier());
  }

  it('schickt den Link mit der Anmeldebestätigung, nur bei eingeschalteter Live-Ansicht', async () => {
    await anmelden();
    const token = linkAusMail('neu@example.test');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    // Nur der Hash liegt in der Datenbank, nie der Link selbst.
    expect(zeile("SELECT live_token_hash FROM registrations WHERE email = 'neu@example.test'").live_token_hash)
      .toBe(await sha256Hex(token));
    expect((await liveAbrufen(token)).status).toBe(200);

    sql("UPDATE tournaments SET live_view_enabled = 0 WHERE id = 't1'");
    env.MAIL_QUEUE.send.mockClear();
    sql("DELETE FROM registrations WHERE email = 'neu@example.test'");
    await anmelden();
    expect(gesendeteTexte().find((mail) => mail.to === 'neu@example.test').text).not.toContain('/live/');
  });

  it('sendet auf Wunsch der Turnierleitung einen neuen Link; der alte wird ungültig', async () => {
    const registration = zeile('SELECT * FROM registrations WHERE id = ?', ONLINE_ID);
    const antwort = await resendLiveLink(env, registration, { id: 'u1', role: 'user' }, 'https://ptm.test');

    expect(await antwort.json()).toEqual({ sent: 1 });
    const neu = linkAusMail('maria@example.test');
    expect(neu).not.toBe(TOKEN);
    expect((await liveAbrufen(neu)).status).toBe(200);
    expect((await liveAbrufen(TOKEN)).status).toBe(404);
    expect(zeile("SELECT action FROM audit_log WHERE action = 'live_link_reissued'")).toBeTruthy();
  });

  it('sendet keinen neuen Link ohne Live-Ansicht oder für nicht bestätigte Anmeldungen', async () => {
    sql("UPDATE tournaments SET live_view_enabled = 0 WHERE id = 't1'");
    const registration = zeile('SELECT * FROM registrations WHERE id = ?', ONLINE_ID);
    await expect(resendLiveLink(env, registration, { id: 'u1' }, 'https://ptm.test')).rejects.toMatchObject({ status: 409 });

    sql("UPDATE tournaments SET live_view_enabled = 1 WHERE id = 't1'");
    await expect(resendLiveLink(env, { ...registration, status: 'waitlist' }, { id: 'u1' }, 'https://ptm.test'))
      .rejects.toMatchObject({ status: 409 });
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
    expect((await liveAbrufen(TOKEN)).status).toBe(200);
  });

  it('meldet den Check-in weder per E-Mail noch per Postfach (E-09)', async () => {
    sql("UPDATE tournaments SET status = 'running', document_managed = 1, desktop_execution = 1 WHERE id = 't1'");
    bindeDokument(env.DB.sqlite, 't1');
    const request = syncAnfrage('PUT', `/api/sync/tournaments/t1/registrations/${LOKALE_ID}`, {
      onlineRegistrationId: ONLINE_ID, expectedExecutionRevision: 1, participation: 'active',
    });
    await executeSyncWrite(request, env.DB, turnier(), () => upsertDocumentRegistration(request, env, turnier(), LOKALE_ID));

    expect(zeile("SELECT participation FROM registrations WHERE id = ?", ONLINE_ID).participation).toBe('active');
    expect(zeile('SELECT COUNT(*) AS anzahl FROM postbox_messages').anzahl).toBe(0);
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
  });
});
