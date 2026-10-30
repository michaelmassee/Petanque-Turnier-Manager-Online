// Cloudflare-Auslastung (Worker-Requests, D1 gelesene/geschriebene Zeilen) für das Admin-Dashboard.
// Quelle ist die GraphQL-Analytics-API; dafür braucht der Worker die Secrets CF_ANALYTICS_API_TOKEN
// (Recht „Account Analytics: Read“) und CF_ACCOUNT_ID. Cloudflare erlaubt höchstens 32 Tage Zeitspanne.

const ANALYTICS_URL = 'https://api.cloudflare.com/client/v4/graphql';
const DAY_MS = 24 * 60 * 60 * 1000;

export const CLOUDFLARE_USAGE_RANGES = [7, 14, 30];

// Tageslimits des Free-Plans, Reset um 00:00 UTC.
export const CLOUDFLARE_FREE_LIMITS = { requests: 100000, rowsRead: 5000000, rowsWritten: 100000 };
// Weitere Tagesgrenzen für die tägliche Admin-Statusmail.
export const CLOUDFLARE_FREE_SUMMARY_LIMITS = {
  workerRequests: CLOUDFLARE_FREE_LIMITS.requests, d1RowsRead: CLOUDFLARE_FREE_LIMITS.rowsRead,
  d1RowsWritten: CLOUDFLARE_FREE_LIMITS.rowsWritten, durableObjectRequests: 100000, queueOperations: 10000,
};

const TOP_QUERY_LIMIT = 10;

export function isCloudflareUsageConfigured(env) {
  return Boolean(env.CF_ANALYTICS_API_TOKEN && env.CF_ACCOUNT_ID);
}

function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

async function analyticsQuery(env, query, variables, fetchImpl) {
  const response = await fetchImpl(ANALYTICS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_ANALYTICS_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { account: env.CF_ACCOUNT_ID, ...variables } }),
  });
  if (!response.ok) throw new Error(`Cloudflare Analytics HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(`Cloudflare Analytics: ${payload.errors[0].message}`);
  const account = payload.data?.viewer?.accounts?.[0];
  if (!account) throw new Error('Cloudflare Analytics: Konto nicht gefunden');
  return account;
}

// Mehrere Gruppen je Schlüssel (z. B. mehrere Worker oder Datenbanken) zusammenzählen.
function addGroups(target, groups, keyOf, fields) {
  for (const group of groups || []) {
    const entry = target.get(keyOf(group));
    if (!entry) continue;
    for (const [field, source] of fields) entry[field] += Number(group.sum?.[source]) || 0;
  }
}

/** Verbrauch je UTC-Tag der letzten `requestedDays` Tage einschließlich heute, lückenlos. */
export async function fetchCloudflareUsageDays(env, requestedDays, { now = new Date(), fetchImpl = fetch } = {}) {
  const range = CLOUDFLARE_USAGE_RANGES.includes(requestedDays) ? requestedDays : CLOUDFLARE_USAGE_RANGES[0];
  const today = utcDay(now);
  const from = utcDay(new Date(now.getTime() - (range - 1) * DAY_MS));
  const account = await analyticsQuery(env, `query($account: String!, $from: Date!, $to: Date!) { viewer { accounts(filter: { accountTag: $account }) {
    workers: workersInvocationsAdaptive(limit: 10000, filter: { date_geq: $from, date_leq: $to }) { sum { requests } dimensions { date } }
    d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $from, date_leq: $to }) { sum { rowsRead rowsWritten } dimensions { date } }
  } } }`, { from, to: today }, fetchImpl);

  const byDay = new Map();
  for (let index = 0; index < range; index += 1) {
    const day = utcDay(new Date(new Date(`${from}T00:00:00Z`).getTime() + index * DAY_MS));
    byDay.set(day, { day, requests: 0, rowsRead: 0, rowsWritten: 0 });
  }
  const dayOf = (group) => group.dimensions?.date;
  addGroups(byDay, account.workers, dayOf, [['requests', 'requests']]);
  addGroups(byDay, account.d1, dayOf, [['rowsRead', 'rowsRead'], ['rowsWritten', 'rowsWritten']]);
  return { configured: true, range, today, limits: CLOUDFLARE_FREE_LIMITS, days: [...byDay.values()] };
}

/** Stundenverlauf und teuerste D1-Abfragen (nach gelesenen Zeilen) eines UTC-Tages. */
export async function fetchCloudflareUsageDay(env, date, { now = new Date(), fetchImpl = fetch } = {}) {
  const oldest = utcDay(new Date(now.getTime() - (CLOUDFLARE_USAGE_RANGES.at(-1) - 1) * DAY_MS));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || date < oldest || date > utcDay(now)) {
    return null;
  }
  const start = `${date}T00:00:00Z`;
  const end = new Date(Date.parse(start) + DAY_MS).toISOString().replace('.000Z', 'Z');
  const account = await analyticsQuery(env, `query($account: String!, $start: Time!, $end: Time!) { viewer { accounts(filter: { accountTag: $account }) {
    workers: workersInvocationsAdaptive(limit: 10000, filter: { datetimeHour_geq: $start, datetimeHour_lt: $end }) { sum { requests } dimensions { datetimeHour } }
    d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { datetimeHour_geq: $start, datetimeHour_lt: $end }) { sum { rowsRead rowsWritten } dimensions { datetimeHour } }
    queries: d1QueriesAdaptiveGroups(limit: ${TOP_QUERY_LIMIT}, filter: { datetime_geq: $start, datetime_lt: $end }, orderBy: [sum_rowsRead_DESC]) {
      count sum { rowsRead rowsWritten } dimensions { query }
    }
  } } }`, { start, end }, fetchImpl);

  const byHour = new Map();
  for (let hour = 0; hour < 24; hour += 1) byHour.set(hour, { hour, requests: 0, rowsRead: 0, rowsWritten: 0 });
  const hourOf = (group) => new Date(group.dimensions?.datetimeHour).getUTCHours();
  addGroups(byHour, account.workers, hourOf, [['requests', 'requests']]);
  addGroups(byHour, account.d1, hourOf, [['rowsRead', 'rowsRead'], ['rowsWritten', 'rowsWritten']]);
  return {
    date,
    hours: [...byHour.values()],
    topQueries: (account.queries || []).map((group) => ({
      query: String(group.dimensions?.query || '').replace(/\s+/g, ' ').trim(),
      count: Number(group.count) || 0,
      rowsRead: Number(group.sum?.rowsRead) || 0,
      rowsWritten: Number(group.sum?.rowsWritten) || 0,
    })),
  };
}

const sumOf = (groups, field, agg = 'sum') => (groups || []).reduce((all, group) => {
  const value = Number(group?.[agg]?.[field]) || 0;
  return agg === 'max' ? Math.max(all, value) : all + value;
}, 0);

/** Tagesübersicht für die Admin-Statusmail: eine Abfrage, auch Durable Object, WebSockets und Queue. */
export async function fetchCloudflareUsageSummary(env, date, { fetchImpl = fetch } = {}) {
  if (!isCloudflareUsageConfigured(env)) return null;
  const account = await analyticsQuery(env, `query($account: String!, $date: Date!) { viewer { accounts(filter: { accountTag: $account }) {
    workers: workersInvocationsAdaptive(limit: 10000, filter: { date: $date }) { sum { requests errors cpuTimeUs } }
    d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date: $date }) { sum { rowsRead rowsWritten } }
    objects: durableObjectsInvocationsAdaptiveGroups(limit: 10000, filter: { date: $date }) { sum { requests } }
    objectPeriods: durableObjectsPeriodicGroups(limit: 10000, filter: { date: $date }) {
      sum { activeTime inboundWebsocketMsgCount outboundWebsocketMsgCount } max { activeWebsocketConnections }
    }
    queue: queueMessageOperationsAdaptiveGroups(limit: 10000, filter: { date: $date }) { sum { billableOperations } }
  } } }`, { date }, fetchImpl);
  const workerRequests = sumOf(account.workers, 'requests');
  return {
    day: date,
    workerRequests,
    workerErrors: sumOf(account.workers, 'errors'),
    cpuMsPerRequest: workerRequests ? sumOf(account.workers, 'cpuTimeUs') / workerRequests / 1000 : 0,
    d1RowsRead: sumOf(account.d1, 'rowsRead'),
    d1RowsWritten: sumOf(account.d1, 'rowsWritten'),
    durableObjectRequests: sumOf(account.objects, 'requests'),
    durableObjectActiveSeconds: sumOf(account.objectPeriods, 'activeTime') / 1e6,
    websocketIn: sumOf(account.objectPeriods, 'inboundWebsocketMsgCount'),
    websocketOut: sumOf(account.objectPeriods, 'outboundWebsocketMsgCount'),
    websocketMax: sumOf(account.objectPeriods, 'activeWebsocketConnections', 'max'),
    queueOperations: sumOf(account.queue, 'billableOperations'),
  };
}
