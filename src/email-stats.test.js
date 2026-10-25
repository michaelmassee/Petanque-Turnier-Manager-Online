// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectEmailStats, recordEmailSent } from './email-stats.js';
import worker, { sendTransactionalEmail } from './worker.js';
import { d1MitSchema } from './test-support/d1.js';

const smtp = vi.hoisted(() => ({ send: vi.fn(), close: vi.fn(), connect: vi.fn() }));
vi.mock('worker-mailer', () => ({ WorkerMailer: { connect: smtp.connect } }));

describe('E-Mail-Versandstatistik', () => {
  let db;
  const now = new Date('2026-10-25T12:00:00Z');
  beforeEach(() => {
    db = d1MitSchema();
    db.sqlite.prepare('UPDATE email_delivery_tracking SET started_at = ?').run('2026-10-01T09:00:00.000Z');
  });
  afterEach(() => db.sqlite.close());

  it('zählt atomar pro Anbieter und UTC-Tag, ohne Empfänger oder Inhalte zu speichern', async () => {
    await Promise.all(Array.from({ length: 40 }, (_, index) => recordEmailSent(db, index % 2 ? 'strato' : 'resend', now)));
    await recordEmailSent(db, 'strato', new Date('2026-10-26T01:00:00+02:00'));
    expect(db.sqlite.prepare('SELECT * FROM email_delivery_daily').all()).toEqual([
      { day: '2026-10-25', strato: 21, resend: 20 },
    ]);
    await expect(recordEmailSent(db, 'unknown', now)).rejects.toThrow('Unknown email provider');
  });

  it('liefert heute, Kalenderwoche ab Montag, Zeitraum und Gesamtstand unabhängig voneinander', async () => {
    for (const [day, provider] of [['2026-09-01', 'strato'], ['2026-10-18', 'resend'],
      ['2026-10-19', 'strato'], ['2026-10-24', 'resend'], ['2026-10-25', 'resend'], ['2026-10-26', 'strato']]) {
      await recordEmailSent(db, provider, new Date(`${day}T12:00:00Z`));
    }
    const result = await collectEmailStats(db, 7, now);
    expect(result.days).toHaveLength(7);
    expect(result.days[0]).toEqual({ day: '2026-10-19', strato: 1, resend: 0, total: 1 });
    expect(result.days[1]).toEqual({ day: '2026-10-20', strato: 0, resend: 0, total: 0 });
    expect(result.trackingSince).toBe('2026-10-01T09:00:00.000Z');
    expect(result.totals).toEqual({
      today: { strato: 0, resend: 1, total: 1 },
      week: { strato: 1, resend: 2, total: 3 },
      range: { strato: 1, resend: 2, total: 3 },
      allTime: { strato: 2, resend: 3, total: 5 },
    });
    const monday = await collectEmailStats(db, 30, new Date('2026-10-26T00:00:00Z'));
    expect(monday.totals.week).toEqual({ strato: 1, resend: 0, total: 1 });
  });

  it('zeigt auch ohne Versand den Erfassungsbeginn und begrenzt die Zeiträume', async () => {
    const result = await collectEmailStats(db, 9999, now);
    expect(result.range).toBe(30);
    expect(result.days).toHaveLength(30);
    expect(result.totals.allTime.total).toBe(0);
    expect(result.trackingSince).toBe('2026-10-01T09:00:00.000Z');
    expect((await collectEmailStats(db, 365, now)).days).toHaveLength(365);
  });

  it('schützt die Statistik vor anonymen Aufrufen und normalen Benutzern', async () => {
    for (const role of ['user', 'admin']) {
      db.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, 's', 'h', '2026-10-01', '2026-10-01')`).run(role, `${role}@example.test`, role);
      db.sqlite.prepare(`INSERT INTO sessions (id, user_id, expires_at, created_at)
        VALUES (?, ?, '2099-01-01', '2026-10-01')`).run(role, role);
    }
    for (const [session, status] of [[null, 401], ['user', 403], ['admin', 200]]) {
      const response = await worker.fetch(new Request('https://ptmonline.org/api/admin/email-stats?days=7', {
        headers: session ? { Cookie: `ptm_session=${session}` } : {},
      }), { DB: db });
      expect(response.status).toBe(status);
      if (status === 200) expect(await response.json()).toMatchObject({ range: 7, totals: { allTime: { total: 0 } } });
    }
  });
});

describe('Zählung im tatsächlichen Mailversand', () => {
  let env;
  let fetchMock;
  const mail = { to: 'person@example.test', subject: 'Test', text: 'Hallo!', failureContext: 'test' };
  const counts = () => env.DB.sqlite.prepare('SELECT COALESCE(SUM(strato), 0) AS strato, COALESCE(SUM(resend), 0) AS resend FROM email_delivery_daily').get();
  beforeEach(() => {
    env = { DB: d1MitSchema(), RESEND_API_KEY: 'test', MAIL_FROM: 'noreply@example.test',
      STRATO_SMTP_USER: 'test', STRATO_SMTP_PASSWORD: 'test' };
    smtp.send.mockReset().mockResolvedValue(undefined);
    smtp.close.mockReset().mockResolvedValue(undefined);
    smtp.connect.mockReset().mockResolvedValue(smtp);
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    env.DB.sqlite.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('erfasst direkte Mails für beide Anbieter und zählt wiederholte Sendungen separat', async () => {
    await sendTransactionalEmail(env, mail);
    await sendTransactionalEmail(env, mail);
    await sendTransactionalEmail(env, { ...mail, to: 'person@gmail.com' });
    expect(counts()).toEqual({ strato: 2, resend: 1 });
    expect(smtp.send).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(['strato', 'resend'])('zählt bei Fehler von %s nur den erfolgreichen Fallback', async (provider) => {
    if (provider === 'strato') smtp.send.mockRejectedValueOnce(new Error('SMTP failed'));
    else fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    await sendTransactionalEmail(env, { ...mail, to: provider === 'resend' ? 'person@gmail.com' : mail.to });
    expect(counts()).toEqual(provider === 'strato' ? { strato: 0, resend: 1 } : { strato: 1, resend: 0 });
  });

  it('erfasst weder vollständige Fehlversuche noch lokalen Log-Fallback', async () => {
    smtp.send.mockRejectedValue(new Error('SMTP failed'));
    fetchMock.mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(sendTransactionalEmail(env, mail)).rejects.toMatchObject({ status: 503 });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendTransactionalEmail({ DB: env.DB }, { ...mail, allowLogFallback: true });
    expect(counts()).toEqual({ strato: 0, resend: 0 });
  });

  it('löst bei einem Statistikfehler weder Anbieter-Fallback noch Queue-Retry aus', async () => {
    env.DB.sqlite.exec('DROP TABLE email_delivery_daily');
    const message = { body: mail, ack: vi.fn(), retry: vi.fn() };
    vi.useFakeTimers();
    const sending = worker.queue({ messages: [message] }, env);
    await vi.runAllTimersAsync();
    await sending;
    expect(smtp.send).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Email delivery statistics could not be recorded', expect.any(Error));
  });

  it('zählt Queue-Mails erst bei Erfolg, ohne Push-Nachrichten mitzuzählen', async () => {
    const email = { body: mail, ack: vi.fn(), retry: vi.fn() };
    const push = { body: { kind: 'live_push', items: [] }, ack: vi.fn(), retry: vi.fn() };
    vi.useFakeTimers();
    const sending = worker.queue({ messages: [email, push] }, env);
    await vi.runAllTimersAsync();
    await sending;
    expect(email.ack).toHaveBeenCalledOnce();
    expect(push.ack).toHaveBeenCalledOnce();
    expect(counts()).toEqual({ strato: 1, resend: 0 });
  });

  it('wiederholt und zählt eine Mail nicht doppelt, wenn nur der SMTP-Verbindungsabbau scheitert', async () => {
    smtp.close.mockRejectedValueOnce(new Error('close failed'));
    await sendTransactionalEmail(env, mail);
    expect(counts()).toEqual({ strato: 1, resend: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
