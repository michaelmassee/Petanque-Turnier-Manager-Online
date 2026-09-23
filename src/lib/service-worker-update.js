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

export function resetServiceWorkerUpdateForTest() {
  updateAvailable = false;
}
