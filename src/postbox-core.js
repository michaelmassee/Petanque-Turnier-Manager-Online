const PUSH_ENDPOINT_HOSTS = new Set([
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'updates-autopush.mozilla.org',
  'push.services.mozilla.com',
  'web.push.apple.com',
]);

export function isAllowedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (PUSH_ENDPOINT_HOSTS.has(host) || host.endsWith('.push.apple.com'));
  } catch {
    return false;
  }
}

export function unreadPostboxCount(row) {
  return Number(row?.count || 0);
}
