// @vitest-environment node
// Eigenes E-Mail-Gateway je Konto (Zusatzoption): Ist es aktiv, gehen die Turnier-Mails des Kontos ausschließlich
// darüber – ohne Ausweichen auf Strato/Resend, auch wenn der Plattform-Mailversand des Kontos gesperrt ist.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { buildSystemNotificationPushBody, sendTransactionalEmail } from './worker.js';
import { isAllowedSmtpHost, normalizeMailGatewayInput, STARTTLS_MISSING_MESSAGE } from './mail-gateway.js';

const smtp = vi.hoisted(() => ({ send: vi.fn(), close: vi.fn(), connect: vi.fn() }));
// Nachbildung von WorkerMailer mit den internen Methoden, die das eigene Gateway für die TLS-Pflicht nutzt
// (die echte Bibliothek prüft src/mail-gateway.smtp.test.js). smtp.connect protokolliert die Verbindungsoptionen.
vi.mock('worker-mailer', () => ({
  WorkerMailer: class {
    constructor(options) { this.options = options; this.secure = Boolean(options.secure); }
    async initializeSmtpSession() {
      await smtp.connect(this.options);
      if (this.options.startTls) await this.tls();
      await this.auth();
    }
    async tls() {}
    async auth() {}
    async start() {}
    send(mail) { return smtp.send(mail); }
    close() { return smtp.close(); }
  },
}));

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, index) => index + 1)));
const LEITUNG = { Cookie: 'ptm_session=s1' };
const smtpBody = {
  provider: 'smtp', smtpHost: 'smtp.verein.example', smtpPort: 587, smtpSecurity: 'starttls', smtpUser: 'turniere@verein.example',
  secret: 'geheim-123', fromEmail: 'turniere@verein.example', fromName: 'BC Verein', replyTo: 'leitung@verein.example',
};

describe('Eigenes E-Mail-Gateway', () => {
  let env;
  let fetchMock;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const row = () => env.DB.sqlite.prepare("SELECT * FROM user_mail_gateways WHERE user_id = 'u1'").get();
  const call = (method, path, body, headers = LEITUNG) => worker.fetch(new Request(`https://ptm.test${path}`, {
    method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  }), env);
  const saveGateway = (body = smtpBody) => call('PUT', '/api/me/mail-gateway', body);
  const publishRanking = () => call('POST', '/api/tournaments/t1/ranking/publish', { notify: true });
  const queued = () => env.MAIL_QUEUE.send.mock.calls.map(([payload]) => payload).filter((payload) => payload.to);
  const deliver = async (payload) => {
    const message = { body: payload, ack: vi.fn(), retry: vi.fn() };
    // Die Queue drosselt per setTimeout (2 s je Mail); im Test sofort weiter.
    const timeout = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => { setImmediate(callback); return 0; });
    try {
      await worker.queue({ messages: [message] }, env);
    } finally {
      timeout.mockRestore();
    }
    return message;
  };
  const platformCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('resend.com')).length;

  beforeEach(() => {
    env = {
      DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(async () => {}) }, MAIL_GATEWAY_KEY: KEY,
      RESEND_API_KEY: 'pf-key', MAIL_FROM: 'noreply@ptmonline.example',
    };
    smtp.send.mockReset().mockResolvedValue(undefined);
    smtp.close.mockReset().mockResolvedValue(undefined);
    smtp.connect.mockReset().mockResolvedValue(smtp);
    fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    env.DB.sqlite.exec(`
      INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, mail_enabled, created_at, updated_at)
        VALUES ('u1', 'leitung@example.test', 'Lea', 'Leitung', 'user', 'salt', 'hash', 0, '2026-10-14', '2026-10-14'),
               ('u2', 'fremd@example.test', 'Fritz', 'Fremd', 'user', 'salt', 'hash', 1, '2026-10-14', '2026-10-14');
      INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s1', 'u1', '2099-01-01T00:00:00.000Z', '2026-10-14'),
        ('s2', 'u2', '2099-01-01T00:00:00.000Z', '2026-10-14');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, type, registration_type, status, visibility, participants_public, created_at, updated_at)
        VALUES ('t1', 'u1', 'Herbstturnier', '2026-10-14', 'Ort', 'tete', 'schweizer', 'forme', 'finished', 'public', 0, '2026-10-14', '2026-10-14');
      INSERT INTO registrations (id, tournament_id, user_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
        VALUES ('p1', 't1', NULL, 'Anna', 'Test', 'anna@example.test', 'confirmed', 'active', '2026-10-14', '2026-10-14', '2026-10-14');
      INSERT INTO tournament_teams (id, tournament_id, member_registration_ids, created_at) VALUES ('a', 't1', '["p1"]', '2026-10-14');
    `);
  });

  afterEach(() => {
    env.DB.sqlite.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Eingabeprüfung', () => {
    it('lässt nur öffentliche Hostnamen und Mail-Ports zu', () => {
      expect(isAllowedSmtpHost('smtp.strato.de')).toBe(true);
      for (const host of ['127.0.0.1', 'localhost', 'mail.local', 'smtp.intern.internal', '[::1]', 'smtp']) expect(isAllowedSmtpHost(host)).toBe(false);
      expect(() => normalizeMailGatewayInput({ ...smtpBody, smtpPort: 22 })).toThrow('Ungültiger SMTP-Port');
      expect(() => normalizeMailGatewayInput({ ...smtpBody, smtpHost: '10.0.0.1' })).toThrow('SMTP-Server');
      expect(() => normalizeMailGatewayInput({ ...smtpBody, fromEmail: 'kein' })).toThrow('Absenderadresse');
    });

    it('verlangt beim ersten Speichern und beim Anbieterwechsel ein neues Geheimnis', () => {
      expect(() => normalizeMailGatewayInput({ ...smtpBody, secret: '' })).toThrow('Passwort');
      expect(normalizeMailGatewayInput({ ...smtpBody, secret: '' }, { hasStoredSecret: true, storedProvider: 'smtp' }).secret).toBeNull();
      expect(() => normalizeMailGatewayInput({ provider: 'resend', fromEmail: 'a@b.example' }, { hasStoredSecret: true, storedProvider: 'smtp' }))
        .toThrow('API-Key');
    });
  });

  describe('Profil-API', () => {
    it('speichert verschlüsselt und gibt das Geheimnis nie zurück', async () => {
      const response = await saveGateway();
      expect(response.status).toBe(200);
      const { gateway } = await response.json();
      expect(gateway).toMatchObject({ configured: true, enabled: true, provider: 'smtp', smtpHost: 'smtp.verein.example', hasSecret: true, status: 'untested' });
      expect(JSON.stringify(gateway)).not.toContain('geheim-123');
      expect(row().secret_enc).not.toContain('geheim-123');

      const loaded = await (await call('GET', '/api/me/mail-gateway')).json();
      expect(JSON.stringify(loaded)).not.toContain('geheim-123');
      expect(loaded.gateway.fromName).toBe('BC Verein');
    });

    it('behält das Passwort, wenn das Feld leer bleibt', async () => {
      await saveGateway();
      const before = row().secret_enc;
      expect((await saveGateway({ ...smtpBody, secret: '', fromName: 'Neu' })).status).toBe(200);
      expect(row()).toMatchObject({ secret_enc: before, from_name: 'Neu' });
    });

    it('lehnt das Speichern ohne Server-Schlüssel ab und meldet die Option als nicht verfügbar', async () => {
      delete env.MAIL_GATEWAY_KEY;
      expect((await saveGateway()).status).toBe(503);
      expect((await (await call('GET', '/api/me/mail-gateway')).json()).gateway).toEqual({ available: false, configured: false });
    });

    it('zeigt das aktive Gateway in der Sitzung und entfernt es wieder', async () => {
      await saveGateway();
      expect((await (await call('GET', '/api/session')).json()).user.ownMailGateway).toBe(true);
      expect((await call('DELETE', '/api/me/mail-gateway')).status).toBe(200);
      expect(row()).toBeUndefined();
      expect((await (await call('GET', '/api/session')).json()).user.ownMailGateway).toBe(false);
    });

    it('sendet eine Test-Mail über das Gateway an die eigene Adresse, gedrosselt', async () => {
      await saveGateway();
      const response = await call('POST', '/api/me/mail-gateway/test');
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ sent: true, to: 'leitung@example.test', gateway: { status: 'ok' } });
      expect(smtp.connect).toHaveBeenCalledWith(expect.objectContaining({
        host: 'smtp.verein.example', port: 587, secure: false, startTls: true,
        credentials: { username: 'turniere@verein.example', password: 'geheim-123' },
      }));
      expect(smtp.send).toHaveBeenCalledWith(expect.objectContaining({
        to: 'leitung@example.test', from: { name: 'BC Verein', email: 'turniere@verein.example' }, reply: 'leitung@verein.example',
      }));
      expect(platformCalls()).toBe(0);
      expect((await call('POST', '/api/me/mail-gateway/test')).status).toBe(429);
    });

    it('zeigt einen fehlgeschlagenen Test direkt an, ohne Passwort im Fehlertext und ohne Postfach-Nachricht', async () => {
      await saveGateway();
      smtp.connect.mockRejectedValueOnce(new Error('535 Authentication failed for geheim-123'));
      const response = await call('POST', '/api/me/mail-gateway/test');
      expect(response.status).toBe(502);
      const result = await response.json();
      expect(result).toMatchObject({ sent: false, gateway: { status: 'error' } });
      expect(result.error).toContain('535 Authentication failed');
      expect(result.error).not.toContain('geheim-123');
      expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM postbox_messages').get().n).toBe(0);
    });
  });

  describe('Versand von Turnier-Mails', () => {
    it('schickt ohne eigenes Gateway bei gesperrtem Konto weiterhin keine Turnier-Mails', async () => {
      expect((await (await publishRanking()).json()).mailCount).toBeNull();
      expect(queued()).toEqual([]);
    });

    it('erlaubt gesperrten Konten mit eigenem Gateway Turnier-Mails – ausschließlich über dieses Gateway', async () => {
      await saveGateway();
      expect((await (await publishRanking()).json()).mailCount).toBe(1);
      const [payload] = queued();
      expect(payload).toMatchObject({ to: 'anna@example.test', gatewayUserId: 'u1' });
      expect(JSON.stringify(payload)).not.toContain('geheim-123');

      const message = await deliver(payload);
      expect(message.ack).toHaveBeenCalledOnce();
      expect(smtp.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'anna@example.test', from: { name: 'BC Verein', email: 'turniere@verein.example' } }));
      expect(platformCalls()).toBe(0);
      expect(row().status).toBe('ok');
      expect(env.DB.sqlite.prepare('SELECT organizer FROM email_delivery_daily').get().organizer).toBe(1);
    });

    it('nimmt das eigene Gateway auch bei freigeschaltetem Konto', async () => {
      sql("UPDATE users SET mail_enabled = 1 WHERE id = 'u1'");
      await saveGateway();
      await publishRanking();
      expect(queued()[0].gatewayUserId).toBe('u1');
    });

    it('nutzt bei deaktiviertem Gateway wieder den bisherigen Weg', async () => {
      sql("UPDATE users SET mail_enabled = 1 WHERE id = 'u1'");
      await saveGateway({ ...smtpBody, enabled: false });
      await publishRanking();
      expect(queued()[0].gatewayUserId).toBeNull();
      expect((await (await call('GET', '/api/session')).json()).user.ownMailGateway).toBe(false);
    });

    it('weicht bei einem Fehler nie auf die Plattform aus und meldet den Fehler genau einmal im Postfach', async () => {
      await saveGateway();
      await publishRanking();
      const [payload] = queued();
      smtp.send.mockRejectedValue(new Error('550 relay denied'));

      const first = await deliver(payload);
      const second = await deliver(payload);
      expect(first.retry).toHaveBeenCalledOnce();
      expect(second.retry).toHaveBeenCalledOnce();
      expect(platformCalls()).toBe(0);
      expect(row()).toMatchObject({ status: 'error', last_error: '550 relay denied' });
      expect(env.DB.sqlite.prepare("SELECT recipient_id, event_type, event_data FROM postbox_messages WHERE event_type = 'mail_gateway_failed'").all())
        .toEqual([{ recipient_id: 'u1', event_type: 'mail_gateway_failed', event_data: JSON.stringify({ error: '550 relay denied' }) }]);
    });

    it('holt die Postfachwarnung nach, wenn ihr Speichern an einem vorübergehenden DB-Fehler scheiterte', async () => {
      await saveGateway();
      await publishRanking();
      const [payload] = queued();
      smtp.send.mockRejectedValue(new Error('550 relay denied'));
      const warnings = () => env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM postbox_messages WHERE event_type = 'mail_gateway_failed'").get().n;

      sql(`CREATE TEMP TRIGGER postbox_down BEFORE INSERT ON postbox_messages BEGIN SELECT RAISE(ABORT, 'D1_ERROR: database unavailable'); END`);
      expect((await deliver(payload)).retry).toHaveBeenCalledOnce();
      expect(warnings()).toBe(0);
      expect(row()).toMatchObject({ status: 'error', failure_notified_at: null });

      sql('DROP TRIGGER postbox_down');
      await deliver(payload);
      await deliver(payload);
      expect(warnings()).toBe(1);
      expect(row().failure_notified_at).not.toBeNull();
    });

    it('übersetzt den Push-Text eines festen Gateway-Fehlers in die Sprache des Kontos', () => {
      expect(buildSystemNotificationPushBody('mail_gateway_failed', { error: STARTTLS_MISSING_MESSAGE }, 'en'))
        .toContain('The SMTP server does not offer STARTTLS');
      expect(buildSystemNotificationPushBody('mail_gateway_failed', { error: '550 relay denied' }, 'en')).toContain('550 relay denied');
    });

    it('warnt im Postfach auch dann, wenn vorher schon eine Test-Mail fehlgeschlagen war', async () => {
      await saveGateway();
      smtp.connect.mockRejectedValueOnce(new Error('535 Authentication failed'));
      expect((await call('POST', '/api/me/mail-gateway/test')).status).toBe(502);
      expect(row().status).toBe('error');

      await publishRanking();
      smtp.send.mockRejectedValue(new Error('550 relay denied'));
      await deliver(queued()[0]);
      await deliver(queued()[0]);
      const warnings = () => env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM postbox_messages WHERE event_type = 'mail_gateway_failed'").get().n;
      expect(warnings()).toBe(1);

      // Nach einem Erfolg darf ein erneuter Ausfall wieder genau einmal warnen.
      smtp.send.mockResolvedValue(undefined);
      await deliver(queued()[0]);
      expect(row()).toMatchObject({ status: 'ok', failure_notified_at: null });
      smtp.send.mockRejectedValue(new Error('550 relay denied'));
      await deliver(queued()[0]);
      expect(warnings()).toBe(2);
    });

    it('bindet Erfolg und Fehler an die Konfiguration, mit der der Versand lief', async () => {
      await saveGateway();
      await publishRanking();
      const [payload] = queued();
      // Während des laufenden Versands werden neue Zugangsdaten gespeichert.
      smtp.send.mockImplementation(async () => {
        await saveGateway({ ...smtpBody, secret: 'pw-neu', smtpUser: 'neu@verein.example' });
      });
      await deliver(payload);
      expect(row()).toMatchObject({ smtp_user: 'neu@verein.example', status: 'untested', last_success_at: null });

      smtp.send.mockImplementation(async () => {
        await saveGateway({ ...smtpBody, secret: 'pw-drei' });
        throw new Error('535 Authentication failed');
      });
      await deliver(payload);
      expect(row()).toMatchObject({ status: 'untested', last_error: null, failure_notified_at: null });
      expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM postbox_messages WHERE event_type = 'mail_gateway_failed'").get().n).toBe(0);
    });

    it('verschickt eingereihte Mails eines gesperrten Kontos nicht über die Plattform, wenn das Gateway inzwischen entfernt wurde', async () => {
      await saveGateway();
      await publishRanking();
      await call('DELETE', '/api/me/mail-gateway');
      const message = await deliver(queued()[0]);
      expect(message.ack).toHaveBeenCalledOnce();
      expect(smtp.send).not.toHaveBeenCalled();
      expect(platformCalls()).toBe(0);
    });

    it('sendet über einen eigenen Resend-API-Key mit eigenem Absender', async () => {
      await saveGateway({ provider: 'resend', secret: 're_eigen', fromEmail: 'turniere@verein.example', fromName: 'BC Verein' });
      await sendTransactionalEmail(env, { to: 'anna@example.test', subject: 'Hallo', text: 'Test', failureContext: 'test', gatewayUserId: 'u1' });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.resend.com/emails');
      expect(init.headers.Authorization).toBe('Bearer re_eigen');
      expect(JSON.parse(init.body)).toMatchObject({ from: 'BC Verein <turniere@verein.example>', to: 'anna@example.test' });
    });

    it('lässt Konto-Mails ohne gatewayUserId auf der Plattform', async () => {
      await saveGateway();
      await sendTransactionalEmail(env, { to: 'leitung@example.test', subject: 'Passwort', text: 'Reset', failureContext: 'reset' });
      expect(smtp.send).not.toHaveBeenCalled();
      expect(platformCalls()).toBe(1);
    });
  });
});
