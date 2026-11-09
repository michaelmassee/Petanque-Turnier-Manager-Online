import { debugLog } from './debug-log.js';

// Merkt sich, dass ein neuer Service Worker die offene Seite übernommen hat.
// Die Seite lädt dann nicht mehr von selbst neu, damit ungespeicherte Eingaben
// erhalten bleiben; stattdessen zeigt ServiceWorkerUpdateBanner einen Hinweis.
const listeners = new Set();
let updateAvailable = false;

export function markServiceWorkerUpdateAvailable() {
  if (updateAvailable) return;
  updateAvailable = true;
  listeners.forEach((listener) => listener());
}

export function isServiceWorkerUpdateAvailable() {
  return updateAvailable;
}

export function subscribeServiceWorkerUpdate(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Der Browser sucht nur beim Laden der Seite nach einem neuen Service Worker. Eine PWA, die aus dem Hintergrund
// zurückkommt, oder ein lange offener Tab liefe sonst unbegrenzt mit altem Code.
export function checkForUpdateWhenVisible(registration, doc = document) {
  doc.addEventListener('visibilitychange', () => {
    debugLog('sw', `visibilitychange: ${doc.visibilityState}`);
    if (doc.visibilityState !== 'visible') return;
    registration.update()
      .then(() => debugLog('sw', 'update() nach Sichtbarwerden: fertig'))
      .catch((error) => debugLog('sw', `update() nach Sichtbarwerden: Fehler ${error?.message || error}`));
  });
}

function describeWorker(worker) {
  return worker ? `${worker.state} (${worker.scriptURL ? new URL(worker.scriptURL).pathname : '?'})` : 'keiner';
}

// Bei der Diagnose (?debug=1) jeden Zustandswechsel eines neu installierten Workers protokollieren – je Worker einmal,
// auch wenn er sowohl direkt nach register() als auch über updatefound auftaucht.
const watchedWorkers = new WeakSet();
function watchWorker(worker, label) {
  if (!worker || watchedWorkers.has(worker)) return;
  watchedWorkers.add(worker);
  debugLog('sw', `${label}: ${describeWorker(worker)}`);
  worker.addEventListener?.('statechange', () => debugLog('sw', `${label} statechange: ${worker.state}`));
}

/**
 * Registriert den Service Worker. Ohne bisherigen Controller ist es die Erstinstallation: die Seite ist bereits
 * aktuell. Sonst nicht selbst neu laden (ungespeicherte Eingaben gingen verloren), sondern einen Hinweis zeigen und
 * den Zeitpunkt dem Nutzer überlassen. Alle Schritte landen bei aktiver Diagnose im Protokoll.
 */
export function registerServiceWorker(win = window, doc = document) {
  const container = win.navigator?.serviceWorker;
  if (!container) {
    debugLog('sw', 'Service Worker nicht unterstützt');
    return;
  }
  const hadController = Boolean(container.controller);
  debugLog('sw', `Start: Controller ${describeWorker(container.controller)}`);
  container.addEventListener('controllerchange', () => {
    debugLog('sw', `controllerchange: neu ${describeWorker(container.controller)}${hadController ? ' → Hinweis' : ' (Erstinstallation, kein Hinweis)'}`);
    if (hadController) markServiceWorkerUpdateAvailable();
  });
  container.addEventListener('message', (event) => {
    if (event.data?.type === 'sw-debug') debugLog('sw', `Worker meldet ${event.data.event} (${event.data.cache})`);
  });
  // Mit addEventListener (statt onmessage) startet die Nachrichten-Warteschlange nicht von selbst.
  container.startMessages?.();
  win.addEventListener('load', () => {
    debugLog('sw', 'load → register()');
    container.register('/service-worker.js')
      .then((registration) => {
        debugLog('sw', `registriert: active ${describeWorker(registration.active)}, waiting ${describeWorker(registration.waiting)}, installing ${describeWorker(registration.installing)}`);
        watchWorker(registration.installing, 'installing');
        registration.addEventListener?.('updatefound', () => {
          debugLog('sw', 'updatefound');
          watchWorker(registration.installing, 'neuer Worker');
        });
        checkForUpdateWhenVisible(registration, doc);
        return registration.update().then(() => debugLog('sw', 'update() beim Start: fertig'));
      })
      .catch((error) => {
        debugLog('sw', `Registrierung/Update fehlgeschlagen: ${error?.message || error}`);
        console.error('Service worker registration failed', error);
      });
  });
}

export function resetServiceWorkerUpdateForTest() {
  updateAvailable = false;
}
