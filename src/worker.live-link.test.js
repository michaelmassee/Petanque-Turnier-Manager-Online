// @vitest-environment node
// Live-Ansicht über den persönlichen Link (E-21): ohne Konto für jedes Turnier verfügbar.
// Der Link kommt mit der Anmeldebestätigung; beim Check-in gibt es weder E-Mail noch Postbox-Nachricht (E-09).
// Gespeichert werden der Hash und (mit LIVE_LINK_KEY) der verschlüsselte Link; "Live-Link erneut senden" schickt den
// bestehenden Link, nur ein nicht wiederherstellbarer alter Link wird auf Wunsch ersetzt (EW-02).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import worker, {
  createRegistration, executeSyncWrite, listMyLiveRegistrations, liveLinkForQr, resendLiveLink, upsertDocumentRegistration,
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

  it('meldet ohne Freischaltung nur den Status, ohne Runden, und nimmt kein Push-Abo an', async () => {
    sql("UPDATE tournaments SET live_view_enabled = 0 WHERE id = 't1'");
    const antwort = await liveAbrufen(TOKEN);
    expect(antwort.status).toBe(200);
    const daten = await antwort.json();
    expect(daten.tournament).toMatchObject({ id: 't1', name: 'Turnier', liveViewEnabled: false });
    expect(daten.registration).toMatchObject({ id: ONLINE_ID, label: expect.any(String) });
    expect(daten.live).toBeNull();

    const abo = await worker.fetch(new Request(`https://ptm.test/api/live/token/${TOKEN}/push`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'k', auth: 'a' } }),
    }), env);
    expect(abo.status).toBe(409);
    expect(zeile('SELECT COUNT(*) AS anzahl FROM live_push_subscriptions').anzahl).toBe(0);

    sql("UPDATE tournaments SET live_view_enabled = 1 WHERE id = 't1'");
    const frei = await (await liveAbrufen(TOKEN)).json();
    expect(frei.tournament.liveViewEnabled).toBe(true);
    expect(frei.live).not.toBeNull();
  });

  it('gilt nicht für unbekannte, stornierte oder abgelehnte Anmeldungen', async () => {
    expect((await liveAbrufen('b'.repeat(64))).status).toBe(404);

    sql("UPDATE tournaments SET live_view_enabled = 0 WHERE id = 't1'");
    expect((await liveAbrufen(TOKEN)).status).toBe(200);

    sql("UPDATE registrations SET status = 'cancelled' WHERE id = ?", ONLINE_ID);
    expect((await liveAbrufen(TOKEN)).status).toBe(404);

    sql("UPDATE registrations SET status = 'rejected' WHERE id = ?", ONLINE_ID);
    expect((await liveAbrufen(TOKEN)).status).toBe(404);
  });

  it.each(['pending', 'waitlist'])('zeigt die persönliche Anmeldung auch mit Status %s vor dem Check-in', async (status) => {
    sql('UPDATE registrations SET status = ?, participation = ? WHERE id = ?', status, 'inactive', ONLINE_ID);

    const response = await liveAbrufen(TOKEN);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      registration: { id: ONLINE_ID, status, participation: 'inactive' },
      live: { currentMatch: null, lastRoundNumber: null },
    });
  });

  it('zeigt die Anmeldung unter „Live“ nur verknüpften Konten, nicht dem Melder über die E-Mail (E-21)', async () => {
    const melder = await (await listMyLiveRegistrations(env.DB, { id: 'melder', email: 'melder@example.test' })).json();
    expect(melder.registrations).toEqual([]);

    sql('UPDATE registrations SET user_id = ? WHERE id = ?', 'melder', ONLINE_ID);
    const verknuepft = await (await listMyLiveRegistrations(env.DB, { id: 'melder', email: 'melder@example.test' })).json();
    expect(verknuepft.registrations.map((entry) => entry.id)).toEqual([ONLINE_ID]);

    sql("UPDATE tournaments SET live_view_enabled = 0 WHERE id = 't1'");
    const auchOhneAltesFlag = await (await listMyLiveRegistrations(env.DB, { id: 'melder', email: 'melder@example.test' })).json();
    expect(auchOhneAltesFlag.registrations.map((entry) => entry.id)).toEqual([ONLINE_ID]);
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

  it('schickt den Live-Link mit jeder Anmeldebestätigung', async () => {
    sql("UPDATE tournaments SET contact_email = 'kontakt@example.test' WHERE id = 't1'");
    await anmelden();
    const token = linkAusMail('neu@example.test');
    const confirmationMail = gesendeteTexte().find((mail) => mail.to === 'neu@example.test');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(confirmationMail.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Turnier ansehen', icon: '▣' }),
      expect.objectContaining({ label: 'Anfahrt planen', icon: '⌖' }),
      expect.objectContaining({ label: 'Live-Ansicht öffnen', icon: '▶' }),
      expect.objectContaining({ label: 'Anmeldung stornieren', icon: '×', tone: 'danger' }),
      expect.objectContaining({ label: 'Nachricht an Turnierleitung', icon: '✉' }),
    ]));
    // Nur der Hash liegt in der Datenbank, nie der Link selbst.
    expect(zeile("SELECT live_token_hash FROM registrations WHERE email = 'neu@example.test'").live_token_hash)
      .toBe(await sha256Hex(token));
    expect((await liveAbrufen(token)).status).toBe(200);

    sql("UPDATE tournaments SET live_view_enabled = 0 WHERE id = 't1'");
    env.MAIL_QUEUE.send.mockClear();
    sql("DELETE FROM registrations WHERE email = 'neu@example.test'");
    await anmelden();
    expect(gesendeteTexte().find((mail) => mail.to === 'neu@example.test').text).toContain('/live/');
  });

  it('ersetzt einen nicht wiederherstellbaren Link nur auf ausdrücklichen Wunsch; der alte wird dann ungültig', async () => {
    const registration = zeile('SELECT * FROM registrations WHERE id = ?', ONLINE_ID);
    await expect(resendLiveLink(env, registration, { id: 'u1', role: 'user' }, 'https://ptm.test'))
      .rejects.toMatchObject({ status: 409, details: { code: 'live_link_not_recoverable' } });
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
    expect((await liveAbrufen(TOKEN)).status).toBe(200);

    const antwort = await resendLiveLink(env, registration, { id: 'u1', role: 'user' }, 'https://ptm.test', { renew: true });

    expect(await antwort.json()).toEqual({ sent: 1 });
    const neu = linkAusMail('maria@example.test');
    expect(neu).not.toBe(TOKEN);
    expect(gesendeteTexte().find((mail) => mail.to === 'maria@example.test').actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Turnier ansehen', icon: '▣' }),
      expect.objectContaining({ label: 'Anfahrt planen', icon: '⌖' }),
      expect.objectContaining({ label: 'Live-Ansicht öffnen', icon: '▶' }),
    ]));
    expect((await liveAbrufen(neu)).status).toBe(200);
    expect((await liveAbrufen(TOKEN)).status).toBe(404);
    expect(zeile("SELECT action FROM audit_log WHERE action = 'live_link_reissued'")).toBeTruthy();
  });

  it('sendet keinen neuen Link für nicht bestätigte Anmeldungen', async () => {
    sql("UPDATE tournaments SET live_view_enabled = 0 WHERE id = 't1'");
    const registration = zeile('SELECT * FROM registrations WHERE id = ?', ONLINE_ID);
    await expect(resendLiveLink(env, registration, { id: 'u1' }, 'https://ptm.test', { renew: true })).resolves.toMatchObject({ status: 200 });

    env.MAIL_QUEUE.send.mockClear();
    await expect(resendLiveLink(env, { ...registration, status: 'waitlist' }, { id: 'u1' }, 'https://ptm.test'))
      .rejects.toMatchObject({ status: 409 });
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
    expect((await liveAbrufen(TOKEN)).status).toBe(404);
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

describe('QR-Code Live-Ansicht in der Anmeldeverwaltung', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const zeile = (statement, ...params) => env.DB.sqlite.prepare(statement).get(...params);
  const meldung = () => zeile('SELECT * FROM registrations WHERE id = ?', ONLINE_ID);
  const liveAbrufen = (token) => worker.fetch(new Request(`https://ptm.test/api/live/token/${token}`), env);
  const leitung = { id: 'u1', role: 'user' };
  const tokenAus = (url) => url.match(/\/live\/t\/([0-9a-f]{64})$/)?.[1];
  const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, index) => index + 1)));

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() }, LIVE_LINK_KEY: KEY };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at, mail_enabled)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01', 1)`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at,
        live_view_enabled)
      VALUES ('t1', 'u1', 'Turnier', '2099-09-28', 'Ort', 'tete', 'registration', 'public', '2026-09-01', '2026-09-01', 1)`);
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation,
        registered_at, created_at, updated_at, execution_revision, player_email)
      VALUES (?, 't1', 'Maria', 'Bieder', '', 'confirmed', 'inactive', '2026-09-01', '2026-09-01', '2026-09-01', 1, NULL)`, ONLINE_ID);
  });

  it('legt für eine Meldung ohne Link (z. B. ohne E-Mail) einen an und zeigt danach immer denselben', async () => {
    const erster = await liveLinkForQr(env, meldung(), leitung, 'https://ptm.test');
    const token = tokenAus(erster.url);
    expect(token).toBeTruthy();
    expect(meldung().live_token_enc).toBeTruthy();
    expect(meldung().live_token_enc).not.toContain(token);
    expect(await liveLinkForQr(env, meldung(), leitung, 'https://ptm.test')).toEqual(erster);
    expect((await liveAbrufen(token)).status).toBe(200);
    expect(zeile("SELECT details_json FROM audit_log WHERE action = 'live_link_issued'").details_json).toContain('qr');
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
  });

  it('liefert bei gleichzeitigen ersten Abrufen allen denselben gültigen Link', async () => {
    const zuvor = meldung();
    const [erster, zweiter] = await Promise.all([
      liveLinkForQr(env, zuvor, leitung, 'https://ptm.test'),
      liveLinkForQr(env, zuvor, leitung, 'https://ptm.test'),
    ]);
    expect(zweiter).toEqual(erster);
    expect((await liveAbrufen(tokenAus(erster.url))).status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS anzahl FROM audit_log WHERE action = 'live_link_issued'").get().anzahl).toBe(1);
  });

  it('zeigt den Link aus der Bestätigungsmail, ohne ihn ungültig zu machen', async () => {
    sql("UPDATE registrations SET email = 'maria@example.test', player_email = 'maria@example.test' WHERE id = ?", ONLINE_ID);
    await resendLiveLink(env, meldung(), leitung, 'https://ptm.test');
    const ausMail = env.MAIL_QUEUE.send.mock.calls.at(-1)[0].text.match(/\/live\/t\/([0-9a-f]{64})/)[1];
    expect(tokenAus((await liveLinkForQr(env, meldung(), leitung, 'https://ptm.test')).url)).toBe(ausMail);
    expect((await liveAbrufen(ausMail)).status).toBe(200);
  });

  it('meldet einen nur als Hash gespeicherten Link als nicht wiederherstellbar; erneuern ersetzt ihn', async () => {
    sql("UPDATE registrations SET live_token_hash = 'alt' WHERE id = ?", ONLINE_ID);
    await expect(liveLinkForQr(env, meldung(), leitung, 'https://ptm.test'))
      .rejects.toMatchObject({ status: 409, details: { code: 'live_link_not_recoverable' } });
    const neu = await liveLinkForQr(env, meldung(), leitung, 'https://ptm.test', { renew: true });
    expect(meldung().live_token_hash).not.toBe('alt');
    expect(await liveLinkForQr(env, meldung(), leitung, 'https://ptm.test')).toEqual(neu);
    expect(zeile("SELECT action FROM audit_log WHERE action = 'live_link_reissued'")).toBeTruthy();
  });

  it('gibt es nur bei freigeschalteter Live-Ansicht und für bestätigte Meldungen', async () => {
    sql("UPDATE tournaments SET live_view_enabled = 0 WHERE id = 't1'");
    await expect(liveLinkForQr(env, meldung(), leitung, 'https://ptm.test')).rejects.toMatchObject({ status: 409 });
    sql("UPDATE tournaments SET live_view_enabled = 1 WHERE id = 't1'");
    sql("UPDATE registrations SET status = 'pending' WHERE id = ?", ONLINE_ID);
    await expect(liveLinkForQr(env, meldung(), leitung, 'https://ptm.test')).rejects.toMatchObject({ status: 409 });
    expect(meldung().live_token_hash).toBeNull();
  });

  it('funktioniert ohne Schlüssel weiter, der Link ist dann nur einmal sichtbar', async () => {
    delete env.LIVE_LINK_KEY;
    const erster = await liveLinkForQr(env, meldung(), leitung, 'https://ptm.test');
    expect(meldung().live_token_enc).toBeNull();
    expect((await liveAbrufen(tokenAus(erster.url))).status).toBe(200);
    await expect(liveLinkForQr(env, meldung(), leitung, 'https://ptm.test'))
      .rejects.toMatchObject({ details: { code: 'live_link_not_recoverable' } });
  });

  it('lässt nur die Turnierleitung an den Endpunkt', async () => {
    const antwort = await worker.fetch(new Request(`https://ptm.test/api/registrations/${ONLINE_ID}/live-link/qr`), env);
    expect(antwort.status).toBe(401);
  });

  const mitEmail = () => sql("UPDATE registrations SET email = 'maria@example.test', player_email = 'maria@example.test' WHERE id = ?", ONLINE_ID);
  const tokenAusMail = () => env.MAIL_QUEUE.send.mock.calls.at(-1)[0].text.match(/\/live\/t\/([0-9a-f]{64})/)[1];

  it('schickt beim erneuten Senden den bestehenden Link; QR-Code und Teamlink bleiben gültig', async () => {
    mitEmail();
    const gezeigt = tokenAus((await liveLinkForQr(env, meldung(), leitung, 'https://ptm.test')).url);
    await resendLiveLink(env, meldung(), leitung, 'https://ptm.test');

    expect(tokenAusMail()).toBe(gezeigt);
    expect(env.MAIL_QUEUE.send.mock.calls.at(-1)[0].text).not.toContain('ungültig');
    expect((await liveAbrufen(gezeigt)).status).toBe(200);
    expect(zeile("SELECT action FROM audit_log WHERE action = 'live_link_resent'")).toBeTruthy();
    expect(zeile("SELECT action FROM audit_log WHERE action = 'live_link_reissued'")).toBeUndefined();
  });

  it('verlangt für einen nur als Hash gespeicherten Link die Bestätigung, bevor ein neuer verschickt wird', async () => {
    mitEmail();
    sql("UPDATE registrations SET live_token_hash = 'alt' WHERE id = ?", ONLINE_ID);
    await expect(resendLiveLink(env, meldung(), leitung, 'https://ptm.test'))
      .rejects.toMatchObject({ status: 409, details: { code: 'live_link_not_recoverable' } });
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();

    await resendLiveLink(env, meldung(), leitung, 'https://ptm.test', { renew: true });
    const neu = tokenAusMail();
    expect(env.MAIL_QUEUE.send.mock.calls.at(-1)[0].text).toContain('Ein früher verschickter Live-Link ist damit ungültig.');
    expect(tokenAus((await liveLinkForQr(env, meldung(), leitung, 'https://ptm.test')).url)).toBe(neu);
    expect(zeile("SELECT action FROM audit_log WHERE action = 'live_link_reissued'")).toBeTruthy();
  });

  it('verwendet in einer späteren Anmeldebestätigung den bestehenden Link wieder', async () => {
    mitEmail();
    const gezeigt = tokenAus((await liveLinkForQr(env, meldung(), leitung, 'https://ptm.test')).url);
    sql("UPDATE registrations SET status = 'pending' WHERE id = ?", ONLINE_ID);
    sql("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s-leitung', 'u1', '2199-01-01', '2026-09-01')");
    const antwort = await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/registrations/confirm-pending', {
      method: 'POST', headers: { Cookie: 'ptm_session=s-leitung' },
    }), env);

    expect(antwort.status).toBe(200);
    expect(tokenAusMail()).toBe(gezeigt);
    expect((await liveAbrufen(gezeigt)).status).toBe(200);
  });

  it('nimmt renew über den Endpunkt nur als ausdrückliches true an', async () => {
    mitEmail();
    sql("UPDATE registrations SET live_token_hash = 'alt' WHERE id = ?", ONLINE_ID);
    sql("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s-leitung', 'u1', '2199-01-01', '2026-09-01')");
    const senden = (body) => worker.fetch(new Request(`https://ptm.test/api/registrations/${ONLINE_ID}/live-link`, {
      method: 'POST', headers: { Cookie: 'ptm_session=s-leitung', 'Content-Type': 'application/json' }, body,
    }), env);

    expect((await senden(undefined)).status).toBe(409);
    expect((await senden(JSON.stringify({ renew: 'ja' }))).status).toBe(409);
    expect((await senden(JSON.stringify({ renew: true }))).status).toBe(200);
  });
});
