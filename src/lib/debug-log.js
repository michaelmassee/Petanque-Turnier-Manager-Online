// Diagnose-Schalter für Nutzergeräte ohne Entwicklerwerkzeuge: `?debug=1` schaltet ein, `?debug=0` aus. Der Schalter
// und ein begrenztes Ereignisprotokoll liegen nur im localStorage des Geräts; es wird nichts an den Server geschickt.
// Die Anzeige (components/DebugPanel.jsx) zeigt das Protokoll fortlaufend über mehrere Ladevorgänge. Keine
// personenbezogenen Daten protokollieren (keine Namen, E-Mails, Request-Bodies, Tokens).

const ENABLED_KEY = 'ptm_debug';
// Jeder Eintrag liegt unter einem eigenen Schlüssel und wird nur angelegt, nie überschrieben. localStorage kennt keine
// Sperren; ein gemeinsames Array müsste gelesen, geändert und zurückgeschrieben werden, und gleichzeitig schreibende
// Tabs verlören dabei Einträge. Der Schlüssel ist sortierbar: Zeit (Basis 36, feste Breite), Tab-Kennung, Zähler.
const ENTRY_PREFIX = 'ptm_debug_log:';
export const MAX_DEBUG_ENTRIES = 300;

const listeners = new Set();
const tabId = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
let sequence = 0;
// Die Zwischenspeicher dienen nur als stabiler Schnappschuss für React (useSyncExternalStore). Schreibvorgänge prüfen
// den Schalter frisch, Änderungen aus anderen Tabs (storage-Event) verwerfen die Zwischenspeicher.
let enabledCache = null;
let entriesCache = null;
// Ohne nutzbaren localStorage (SecurityError beim Zugriff, kein localStorage, voller Speicher) führt dieser Tab
// Schalter und Protokoll nur im Arbeitsspeicher weiter.
let memoryOnly = false;
let memoryEntries = [];

/** localStorage oder Fehler: Ein fehlender oder gesperrter Speicher wird wie ein Schreibfehler behandelt. */
function store() {
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  if (!storage) throw new Error('localStorage nicht verfügbar');
  return storage;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function entryKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(ENTRY_PREFIX)) keys.push(key);
  }
  return keys.sort();
}

function readStoredEntries() {
  const storage = store();
  return entryKeys(storage).flatMap((key) => {
    try {
      const entry = JSON.parse(storage.getItem(key));
      return entry && typeof entry === 'object' ? [entry] : [];
    } catch {
      return [];
    }
  });
}

function removeAllEntries(storage) {
  entryKeys(storage).forEach((key) => storage.removeItem(key));
}

function readEntries() {
  if (!entriesCache) {
    try {
      entriesCache = memoryOnly ? memoryEntries : readStoredEntries();
    } catch {
      entriesCache = memoryEntries;
    }
  }
  return entriesCache;
}

function switchToMemory(entry) {
  if (!memoryOnly) {
    // Bisherige Einträge mitnehmen, soweit noch lesbar; danach nur noch im Arbeitsspeicher.
    try {
      memoryEntries = readStoredEntries();
    } catch {
      memoryEntries = [];
    }
    memoryOnly = true;
  }
  if (entry) memoryEntries = [...memoryEntries, entry].slice(-MAX_DEBUG_ENTRIES);
  entriesCache = memoryEntries;
  notify();
}

export function isDebugEnabled() {
  if (enabledCache === null) {
    try {
      enabledCache = store().getItem(ENABLED_KEY) === '1';
    } catch {
      enabledCache = false;
    }
  }
  return enabledCache;
}

export function setDebugEnabled(enabled) {
  enabledCache = Boolean(enabled);
  memoryEntries = [];
  try {
    const storage = store();
    if (enabled) storage.setItem(ENABLED_KEY, '1');
    else {
      // Erst den Schalter, dann die Einträge entfernen: Ein gleichzeitig schreibender Tab prüft den Schalter nach
      // seinem Eintrag erneut und entfernt ihn dann selbst (siehe debugLog).
      storage.removeItem(ENABLED_KEY);
      removeAllEntries(storage);
    }
    memoryOnly = false;
  } catch {
    // Ohne Speicher gilt der Schalter nur für diesen Tab.
    memoryOnly = Boolean(enabled);
  }
  entriesCache = null;
  notify();
}

// Änderungen aus anderen Tabs desselben Geräts übernehmen (Einschalten, Beenden, neue Einträge, Leeren).
export function handleDebugStorageEvent(event) {
  if (memoryOnly) return;
  if (event.key !== null && event.key !== ENABLED_KEY && !event.key.startsWith(ENTRY_PREFIX)) return;
  enabledCache = null;
  entriesCache = null;
  notify();
}

if (typeof window !== 'undefined') window.addEventListener('storage', handleDebugStorageEvent);

/** Liest `debug=1|0` aus der URL, merkt sich den Schalter und entfernt den Parameter aus der Adresszeile. */
export function initDebugFromUrl(location = window.location, history = window.history) {
  let url;
  try {
    url = new URL(location.href);
  } catch {
    return;
  }
  const value = url.searchParams.get('debug');
  if (value !== '1' && value !== '0') return;
  setDebugEnabled(value === '1');
  url.searchParams.delete('debug');
  try {
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Ohne replaceState bleibt der Parameter sichtbar; der Schalter wirkt trotzdem.
  }
}

/** Hängt einen Eintrag an das Protokoll an (No-op bei ausgeschaltetem Schalter). */
export function debugLog(category, message) {
  const entry = { t: new Date().toISOString(), c: String(category), m: String(message) };
  if (memoryOnly) {
    if (enabledCache) switchToMemory(entry);
    return;
  }
  try {
    const storage = store();
    // Frisch prüfen: Ein anderer Tab kann inzwischen beendet haben.
    if (storage.getItem(ENABLED_KEY) !== '1') {
      if (enabledCache !== false) {
        enabledCache = false;
        entriesCache = null;
        notify();
      }
      return;
    }
    enabledCache = true;
    sequence += 1;
    const key = `${ENTRY_PREFIX}${Date.now().toString(36).padStart(9, '0')}-${tabId}-${sequence.toString(36).padStart(5, '0')}`;
    storage.setItem(key, JSON.stringify(entry));
    if (storage.getItem(ENABLED_KEY) !== '1') {
      // Zwischen Prüfung und Schreiben beendet: eigenen Eintrag entfernen, damit kein gelöschtes Protokoll wieder entsteht.
      storage.removeItem(key);
      enabledCache = false;
    } else {
      // Älteste Einträge über der Obergrenze entfernen; doppeltes Entfernen durch zwei Tabs ist unschädlich.
      const keys = entryKeys(storage);
      keys.slice(0, Math.max(0, keys.length - MAX_DEBUG_ENTRIES)).forEach((old) => storage.removeItem(old));
    }
    entriesCache = null;
    notify();
  } catch {
    // Speicher nicht nutzbar (gesperrt, voll): im Arbeitsspeicher weiterprotokollieren. Gilt der Schalter, weil er
    // in diesem Tab gesetzt wurde, bleibt er an.
    if (enabledCache) switchToMemory(entry);
  }
}

export function getDebugLog() {
  return readEntries();
}

export function clearDebugLog() {
  if (memoryOnly) memoryEntries = [];
  else {
    try {
      removeAllEntries(store());
    } catch {
      memoryEntries = [];
    }
  }
  entriesCache = null;
  notify();
}

export function subscribeDebugLog(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Pfad ohne Query und ohne lange Kennungen (Tokens), damit das Protokoll nichts Geheimes enthält. */
export function debugPath(path) {
  return String(path || '').split('?')[0].split('/').map((part) => (part.length > 40 ? '…' : part)).join('/');
}

/** Gerätedaten für den Kopf der Anzeige und des Kopiertexts. */
export function debugDeviceInfo(win = window, doc = document) {
  const nav = win.navigator || {};
  let standalone = false;
  try {
    standalone = Boolean(win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone);
  } catch {
    standalone = Boolean(nav.standalone);
  }
  const script = doc.querySelector?.('script[type="module"][src]')?.getAttribute('src') || '–';
  return [
    `UA: ${nav.userAgent || '–'}`,
    `Standalone: ${standalone ? 'ja' : 'nein'} · SW: ${'serviceWorker' in nav ? 'ja' : 'nein'} · Sprache: ${nav.language || '–'}`,
    `App: ${script}`,
  ];
}

export function debugReport(win = window, doc = document) {
  const lines = getDebugLog().map((entry) => `${entry.t} [${entry.c}] ${entry.m}`);
  return [...debugDeviceInfo(win, doc), '', ...lines].join('\n');
}

/**
 * Globale Ereignisse bei aktiver Diagnose: Seitenstart, Back-Forward-Cache, Netz, ungefangene Fehler. Ohne Schalter
 * werden keine Listener angehängt.
 */
export function installDebugListeners(win = window) {
  if (!isDebugEnabled()) return;
  debugLog('app', `Seite geöffnet: ${debugPath(win.location?.pathname)}`);
  win.addEventListener('pageshow', (event) => debugLog('app', `pageshow (aus Back-Forward-Cache: ${event.persisted ? 'ja' : 'nein'})`));
  win.addEventListener('online', () => debugLog('net', 'online'));
  win.addEventListener('offline', () => debugLog('net', 'offline'));
  win.addEventListener('error', (event) => {
    const where = event.filename ? ` (${debugPath(event.filename.replace(win.location?.origin || '', ''))}:${event.lineno})` : '';
    debugLog('error', `${event.message || 'Fehler'}${where}`);
  });
  win.addEventListener('unhandledrejection', (event) => debugLog('error', `unhandledrejection: ${event.reason?.message || event.reason}`));
}

export function resetDebugForTest() {
  enabledCache = null;
  entriesCache = null;
  memoryOnly = false;
  memoryEntries = [];
  listeners.clear();
}
