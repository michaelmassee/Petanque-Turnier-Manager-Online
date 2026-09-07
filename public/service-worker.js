const CACHE_NAME = 'ptm-online-v4';
const API_CACHE_NAME = 'ptm-online-api-v1';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-icon-192.png',
  '/icons/maskable-icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon.ico',
];

// Turnier-Stammdaten, die ein Teilnehmer nach der Anmeldung offline nachschlagen
// können soll (Ort, Zeit, Status). Bewusst kein anderer /api/-Traffic (Login,
// Anmeldungen verwalten etc.) - das bleibt online-only.
const CACHEABLE_API_PATTERNS = [/^\/api\/tournaments$/, /^\/api\/tournaments\/[^/]+$/];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (CACHEABLE_API_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(API_CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => caches.match(request)),
      );
    }
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Neue Nachricht', actor: '' };
  try { payload = event.data?.json() || payload; } catch { /* use safe fallback */ }
  event.waitUntil(self.registration.showNotification(payload.title || 'Neue Nachricht', {
    body: payload.actor ? `Von ${payload.actor}` : 'In deiner Postbox wartet ein neuer Eintrag.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `postbox-${payload.messageId || 'new'}`,
    data: { url: '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows[0];
    return existing ? existing.focus() : clients.openWindow(event.notification.data?.url || '/');
  }));
});
