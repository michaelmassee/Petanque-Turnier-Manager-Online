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
    if (doc.visibilityState === 'visible') registration.update().catch(() => {});
  });
}

export function resetServiceWorkerUpdateForTest() {
  updateAvailable = false;
}
