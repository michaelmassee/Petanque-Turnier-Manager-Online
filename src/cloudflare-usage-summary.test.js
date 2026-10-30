// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCloudflareUsageSummary } from './cloudflare-usage-core.js';
import { buildAdminStatusEmail, collectAdminStatus, sendAdminStatusEmails } from './admin-status-email.js';
import { d1MitSchema } from './test-support/d1.js';

const env = { CF_ANALYTICS_API_TOKEN: 'analytics-read', CF_ACCOUNT_ID: 'account-1' };
const answer = (data, ok = true, status = 200) => vi.fn().mockResolvedValue({ ok, status, json: async () => data });
const accountData = {
  workers: [{ sum: { requests: 8000, errors: 2, cpuTimeUs: 20_000_000 } }, { sum: { requests: 2000, errors: 0, cpuTimeUs: 10_000_000 } }],
  d1: [{ sum: { rowsRead: 4_100_000, rowsWritten: 2221 } }],
  objects: [{ sum: { requests: 16 } }],
  objectPeriods: [{ sum: { activeTime: 7_800_000, inboundWebsocketMsgCount: 4, outboundWebsocketMsgCount: 138 }, max: { activeWebsocketConnections: 3 } },
    { sum: { activeTime: 0, inboundWebsocketMsgCount: 0, outboundWebsocketMsgCount: 0 }, max: { activeWebsocketConnections: 1 } }],
  queue: [{ sum: { billableOperations: 27 } }],
};

describe('Cloudflare-Auslastung für die Admin-Statusmail', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fragt den Tag einmal ab und summiert alle Gruppen', async () => {
    const fetchImpl = answer({ data: { viewer: { accounts: [accountData] } } });
    const usage = await fetchCloudflareUsageSummary(env, '2026-10-29', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/graphql');
    expect(init.headers.Authorization).toBe('Bearer analytics-read');
    expect(JSON.parse(init.body).variables).toEqual({ account: 'account-1', date: '2026-10-29' });
    expect(usage).toEqual({
      day: '2026-10-29', workerRequests: 10_000, workerErrors: 2, cpuMsPerRequest: 3,
      d1RowsRead: 4_100_000, d1RowsWritten: 2221, durableObjectRequests: 16, durableObjectActiveSeconds: 7.8,
      websocketIn: 4, websocketOut: 138, websocketMax: 3, queueOperations: 27,
    });
  });

  it('fragt ohne Token oder Konto nichts ab', async () => {
    const fetchImpl = vi.fn();
    expect(await fetchCloudflareUsageSummary({ CF_ACCOUNT_ID: 'account-1' }, '2026-10-29', { fetchImpl })).toBeNull();
    expect(await fetchCloudflareUsageSummary({ CF_ANALYTICS_API_TOKEN: 'x' }, '2026-10-29', { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('meldet HTTP-, GraphQL- und Kontofehler', async () => {
    await expect(fetchCloudflareUsageSummary(env, '2026-10-29', { fetchImpl: answer({}, false, 403) })).rejects.toThrow('HTTP 403');
    await expect(fetchCloudflareUsageSummary(env, '2026-10-29', { fetchImpl: answer({ errors: [{ message: 'not authorized' }] }) })).rejects.toThrow('not authorized');
    await expect(fetchCloudflareUsageSummary(env, '2026-10-29', { fetchImpl: answer({ data: { viewer: { accounts: [] } } }) })).rejects.toThrow('Konto nicht gefunden');
  });

  it('rechnet ohne Worker-Aufrufe keine CPU durch null', async () => {
    const usage = await fetchCloudflareUsageSummary(env, '2026-10-29', { fetchImpl: answer({ data: { viewer: { accounts: [{}] } } }) });
    expect(usage).toMatchObject({ workerRequests: 0, cpuMsPerRequest: 0, websocketMax: 0 });
  });

  it('zeigt Anteile an den Free-Plan-Grenzen und warnt ab 80 %', async () => {
    const usage = await fetchCloudflareUsageSummary(env, '2026-10-29', { fetchImpl: answer({ data: { viewer: { accounts: [accountData] } } }) });
    const stats = { ...(await collectAdminStatus(d1MitSchema(), '2026-10-29T01:00:00.000Z', '2026-10-30T01:00:00.000Z', 'system')), cloudflareUsage: usage };
    const de = buildAdminStatusEmail(stats, [], '2026-10-29T01:00:00.000Z', '2026-10-30T01:00:00.000Z', 'de').text.replace(/[\u00a0\u202f]/g, ' ');
    expect(de).toContain('Cloudflare-Auslastung am vorherigen UTC-Kalendertag (Anteil an der Free-Plan-Tagesgrenze) (2026-10-29)');
    expect(de).toContain('Worker-Aufrufe: 10.000 von 100.000 (10 %); Fehler: 2');
    expect(de).toContain('CPU je Aufruf (Durchschnitt): 3 ms');
    expect(de).toContain('D1 gelesene Zeilen: 4.100.000 von 5.000.000 (82 %) – Achtung: nahe an der Tagesgrenze');
    expect(de).toContain('D1 geschriebene Zeilen: 2.221 von 100.000 (2,2 %)\n');
    expect(de).toContain('Durable-Object-Aufrufe: 16 von 100.000 (0 %); aktiv: 7,8 s');
    expect(de).toContain('WebSocket-Nachrichten empfangen / gesendet: 4 / 138; höchstens gleichzeitig verbunden: 3');
    expect(de).toContain('Queue-Operationen: 27 von 10.000 (0,3 %)');
    const en = buildAdminStatusEmail(stats, [], '2026-10-29T01:00:00.000Z', '2026-10-30T01:00:00.000Z', 'en').text;
    expect(en).toContain('D1 rows read: 4,100,000 of 5,000,000 (82%) – Warning: close to the daily limit');
  });

  it('sendet den Bericht mit „nicht verfügbar“, wenn die Abfrage fehlschlägt', async () => {
    const db = d1MitSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, email_verified_at, language, password_salt, password_hash, created_at, updated_at)
      VALUES ('admin', 'admin@example.test', 'admin', '2026-10-01', 'de', 'salt', 'hash', '2026-10-01', '2026-10-01')`).run();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const queue = { send: vi.fn().mockResolvedValue(undefined) };
    await sendAdminStatusEmails({ ...env, DB: db, MAIL_QUEUE: queue }, [], Date.parse('2026-10-30T01:00:00.000Z'), 'system');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(queue.send.mock.calls[0][0].text).toContain('Cloudflare-Auslastung am vorherigen UTC-Kalendertag (Anteil an der Free-Plan-Tagesgrenze): Nicht verfügbar');
  });
});
