// Tägliche Cloudflare-Auslastung für die Admin-Statusmail: eine GraphQL-Abfrage pro Tag (nur im täglichen Cron),
// kein Einfluss auf Anfragepfade. Ohne Token oder bei API-Fehlern zeigt die Mail „nicht verfügbar“.
const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const TIMEOUT_MS = 10_000;

// Tagesgrenzen des Workers-Free-Plans; 0 = keine feste Grenze ausgewiesen.
export const FREE_PLAN_DAILY_LIMITS = {
  workerRequests: 100_000,
  d1RowsRead: 5_000_000,
  d1RowsWritten: 100_000,
  durableObjectRequests: 100_000,
  queueOperations: 10_000,
};

const USAGE_QUERY = `query($a:String!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){
 w:workersInvocationsAdaptive(limit:10000,filter:{date:$d}){sum{requests errors cpuTimeUs}}
 d:d1AnalyticsAdaptiveGroups(limit:10000,filter:{date:$d}){sum{rowsRead rowsWritten}}
 o:durableObjectsInvocationsAdaptiveGroups(limit:10000,filter:{date:$d}){sum{requests}}
 p:durableObjectsPeriodicGroups(limit:10000,filter:{date:$d}){sum{activeTime inboundWebsocketMsgCount outboundWebsocketMsgCount} max{activeWebsocketConnections}}
 q:queueMessageOperationsAdaptiveGroups(limit:10000,filter:{date:$d}){sum{billableOperations}}
}}}`;

const total = (groups, field, agg = 'sum') => (groups || []).reduce((all, group) => {
  const value = Number(group?.[agg]?.[field] || 0);
  return agg === 'max' ? Math.max(all, value) : all + value;
}, 0);

export async function fetchCloudflareUsage(env, day, fetchImpl = fetch) {
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) return null;
  const response = await fetchImpl(GRAPHQL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: USAGE_QUERY, variables: { a: env.CF_ACCOUNT_ID, d: day } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Cloudflare analytics HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(`Cloudflare analytics: ${payload.errors[0]?.message}`);
  const account = payload.data?.viewer?.accounts?.[0];
  if (!account) throw new Error('Cloudflare analytics: account not found');
  const workerRequests = total(account.w, 'requests');
  return {
    day,
    workerRequests,
    workerErrors: total(account.w, 'errors'),
    cpuMsPerRequest: workerRequests ? total(account.w, 'cpuTimeUs') / workerRequests / 1000 : 0,
    d1RowsRead: total(account.d, 'rowsRead'),
    d1RowsWritten: total(account.d, 'rowsWritten'),
    durableObjectRequests: total(account.o, 'requests'),
    durableObjectActiveSeconds: total(account.p, 'activeTime') / 1e6,
    websocketIn: total(account.p, 'inboundWebsocketMsgCount'),
    websocketOut: total(account.p, 'outboundWebsocketMsgCount'),
    websocketMax: total(account.p, 'activeWebsocketConnections', 'max'),
    queueOperations: total(account.q, 'billableOperations'),
  };
}
