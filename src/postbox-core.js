const PUSH_ENDPOINT_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'updates-autopush.mozilla.org',
  'web.push.apple.com',
]);

export function isAllowedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_ENDPOINT_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function unreadPostboxCount(row) {
  return Number(row?.count || 0);
}
