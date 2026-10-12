// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { fetchCloudflareUsageDay, fetchCloudflareUsageDays } from './cloudflare-usage-core.js';
import { getCloudflareUsage } from './worker.js';

const env = { CF_ANALYTICS_API_TOKEN: 'token', CF_ACCOUNT_ID: 'account' };
const now = new Date('2026-10-12T09:00:00Z');
const antwort = (account) => vi.fn(async () => new Response(JSON.stringify({ data: { viewer: { accounts: [account] } }, errors: null })));

describe('Cloudflare-Auslastung', () => {
  it('liefert lückenlose Tage und zählt mehrere Gruppen je Tag zusammen', async () => {
    const fetchImpl = antwort({
      workers: [{ dimensions: { date: '2026-10-11' }, sum: { requests: 7000 } }, { dimensions: { date: '2026-10-11' }, sum: { requests: 409 } }],
      d1: [{ dimensions: { date: '2026-10-11' }, sum: { rowsRead: 203730, rowsWritten: 1261 } }, { dimensions: { date: '2026-09-01' }, sum: { rowsRead: 1, rowsWritten: 1 } }],
    });
    const result = await fetchCloudflareUsageDays(env, 7, { now, fetchImpl });

    expect(result.days.map((entry) => entry.day)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
    expect(result.days[5]).toEqual({ day: '2026-10-11', requests: 7409, rowsRead: 203730, rowsWritten: 1261 });
    expect(result.days[6]).toEqual({ day: '2026-10-12', requests: 0, rowsRead: 0, rowsWritten: 0 });
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(request.variables).toEqual({ account: 'account', from: '2026-10-06', to: '2026-10-12' });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });

  it('nimmt nur die angebotenen Zeiträume, Cloudflare erlaubt höchstens 32 Tage', async () => {
    const result = await fetchCloudflareUsageDays(env, 365, { now, fetchImpl: antwort({ workers: [], d1: [] }) });
    expect(result.range).toBe(7);
  });

  it('liefert Stundenverlauf und teuerste Abfragen eines Tages', async () => {
    const fetchImpl = antwort({
      workers: [{ dimensions: { datetimeHour: '2026-10-11T18:00:00Z' }, sum: { requests: 900 } }],
      d1: [{ dimensions: { datetimeHour: '2026-10-11T18:00:00Z' }, sum: { rowsRead: 25691, rowsWritten: 3 } }],
      queries: [{ count: 356, sum: { rowsRead: 54832, rowsWritten: 0 }, dimensions: { query: 'SELECT  *\n   FROM tournaments' } }],
    });
    const result = await fetchCloudflareUsageDay(env, '2026-10-11', { now, fetchImpl });

    expect(result.hours).toHaveLength(24);
    expect(result.hours[18]).toEqual({ hour: 18, requests: 900, rowsRead: 25691, rowsWritten: 3 });
    expect(result.topQueries).toEqual([{ query: 'SELECT * FROM tournaments', count: 356, rowsRead: 54832, rowsWritten: 0 }]);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).variables).toMatchObject({ start: '2026-10-11T00:00:00Z', end: '2026-10-12T00:00:00Z' });
  });

  it('lehnt Tage außerhalb des abrufbaren Zeitraums ab, ohne Cloudflare zu fragen', async () => {
    const fetchImpl = vi.fn();
    expect(await fetchCloudflareUsageDay(env, '2026-08-01', { now, fetchImpl })).toBeNull();
    expect(await fetchCloudflareUsageDay(env, '2026-10-13', { now, fetchImpl })).toBeNull();
    expect(await fetchCloudflareUsageDay(env, 'gestern', { now, fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('meldet fehlende Einrichtung statt eines Fehlers und Analytics-Fehler als 502', async () => {
    const url = new URL('https://ptm.test/api/admin/cloudflare-usage?days=7');
    expect(await (await getCloudflareUsage(new Request(url), {}, url, { now })).json()).toEqual({ configured: false });

    const failing = vi.fn(async () => new Response(JSON.stringify({ data: null, errors: [{ message: 'quota' }] })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(getCloudflareUsage(new Request(url), env, url, { now, fetchImpl: failing })).rejects.toMatchObject({ status: 502 });
  });
});
