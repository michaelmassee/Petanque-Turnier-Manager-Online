import '@testing-library/jest-dom/vitest';

// Seiten öffnen sonst echte WebSockets zur Sofort-Aktualisierung; Hook-Tests setzen ihren eigenen Fake.
globalThis.WebSocket = undefined;

// Tests fragen nie echte externe Dienste an (Geocoder, Mail-Anbieter, …): langsam, vom Netz abhängig und gegen die
// Nutzungsregeln etwa von Nominatim. Anfragen an fremde Hosts scheitern sofort wie ein nicht erreichbarer Dienst;
// Tests, die eine Antwort brauchen, ersetzen global.fetch selbst. Relative Pfade und Test-Hosts bleiben unberührt.
{
  const originalFetch = globalThis.fetch;
  const LOCAL_HOST = /^https?:\/\/(?:[^/]+\.test|localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/;
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (/^https?:\/\//.test(url) && !LOCAL_HOST.test(url)) {
      return Promise.reject(new TypeError(`Externe Anfrage im Test blockiert: ${url.split('?')[0]}`));
    }
    return originalFetch(input, init);
  };
}
