// Gemeinsamer Browser-Teil für Web-Push (Postfach und Live-Ansicht): Erlaubnis einholen und ein
// Push-Abo mit dem aktuellen VAPID-Schlüssel sicherstellen. Das Speichern auf dem Server
// übernimmt der Aufrufer, weil Postfach (Konto) und Live-Ansicht (Meldung) verschieden binden.

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function base64urlToUint8Array(value) {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function sameBytes(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Liefert { status: 'enabled', subscription } oder { status: 'unsupported' | 'blocked' | 'denied' }. */
export async function ensureBrowserPushSubscription(loadPublicKey) {
  if (!isPushSupported()) return { status: 'unsupported' };
  if (Notification.permission === 'denied') return { status: 'blocked' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { status: 'denied' };
  const publicKey = await loadPublicKey();
  const registration = await navigator.serviceWorker.ready;
  const applicationServerKey = base64urlToUint8Array(publicKey);
  const existing = await registration.pushManager.getSubscription();
  const existingKey = existing?.options?.applicationServerKey;
  const keyChanged = existingKey && !sameBytes(new Uint8Array(existingKey), applicationServerKey);
  if (existing && keyChanged) await existing.unsubscribe();
  const subscription = existing && !keyChanged
    ? existing
    : await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  return { status: 'enabled', subscription };
}

export async function currentBrowserPushSubscription() {
  if (!isPushSupported() || Notification.permission !== 'granted') return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}
