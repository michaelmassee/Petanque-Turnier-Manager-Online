import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_DEBUG_ENTRIES, clearDebugLog, debugDeviceInfo, debugLog, debugPath, debugReport, getDebugLog, initDebugFromUrl,
  installDebugListeners, isDebugEnabled, resetDebugForTest, setDebugEnabled, subscribeDebugLog,
} from './debug-log.js';

const PREFIX = 'ptm_debug_log:';
const storedKeys = () => Object.keys(localStorage).filter((key) => key.startsWith(PREFIX)).sort();
const storedMessages = () => storedKeys().map((key) => JSON.parse(localStorage.getItem(key)).m);
const messages = () => getDebugLog().map((entry) => entry.m);

describe('Diagnose-Schalter (?debug=1)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetDebugForTest();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetDebugForTest();
  });

  const history = () => ({ state: { a: 1 }, replaceState: vi.fn() });

  it('schaltet per URL ein und aus, merkt sich das und entfernt den Parameter', () => {
    const on = history();
    initDebugFromUrl({ href: 'https://ptmonline.org/turniere?x=1&debug=1#info' }, on);
    expect(isDebugEnabled()).toBe(true);
    expect(localStorage.getItem('ptm_debug')).toBe('1');
    expect(on.replaceState).toHaveBeenCalledWith({ a: 1 }, '', '/turniere?x=1#info');

    resetDebugForTest();
    expect(isDebugEnabled()).toBe(true);
    debugLog('sw', 'Eintrag');
    initDebugFromUrl({ href: 'https://ptmonline.org/?debug=0' }, history());
    expect(isDebugEnabled()).toBe(false);
    expect(storedKeys()).toEqual([]);
    expect(getDebugLog()).toEqual([]);
  });

  it('lässt andere Werte und URLs ohne Parameter unverändert', () => {
    const untouched = history();
    initDebugFromUrl({ href: 'https://ptmonline.org/?debug=ja' }, untouched);
    initDebugFromUrl({ href: 'kaputt' }, untouched);
    expect(isDebugEnabled()).toBe(false);
    expect(untouched.replaceState).not.toHaveBeenCalled();
  });

  it('protokolliert ohne Schalter nichts, mit Schalter fortlaufend über Neuladen hinweg', () => {
    debugLog('sw', 'ignoriert');
    expect(getDebugLog()).toEqual([]);
    expect(storedKeys()).toEqual([]);

    setDebugEnabled(true);
    const listener = vi.fn();
    subscribeDebugLog(listener);
    debugLog('sw', 'erster');
    expect(listener).toHaveBeenCalled();
    resetDebugForTest();
    debugLog('api', 'zweiter');
    expect(getDebugLog().map((entry) => `${entry.c}:${entry.m}`)).toEqual(['sw:erster', 'api:zweiter']);
    expect(getDebugLog()[0].t).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Je Eintrag ein eigener Schlüssel.
    expect(storedKeys()).toHaveLength(2);

    clearDebugLog();
    expect(getDebugLog()).toEqual([]);
    expect(storedKeys()).toEqual([]);
    expect(isDebugEnabled()).toBe(true);
  });

  it('begrenzt das Protokoll auf die neuesten Einträge', () => {
    setDebugEnabled(true);
    for (let index = 0; index < MAX_DEBUG_ENTRIES + 5; index += 1) debugLog('x', `#${index}`);
    const entries = getDebugLog();
    expect(entries).toHaveLength(MAX_DEBUG_ENTRIES);
    expect(entries[0].m).toBe('#5');
    expect(entries.at(-1).m).toBe(`#${MAX_DEBUG_ENTRIES + 4}`);
    expect(storedKeys()).toHaveLength(MAX_DEBUG_ENTRIES);
  });

  it('überspringt kaputte Einträge und protokolliert bei vollem Speicher im Tab weiter', () => {
    localStorage.setItem('ptm_debug', '1');
    localStorage.setItem(`${PREFIX}000000000-kaputt-00000`, '{kein json');
    localStorage.setItem(`${PREFIX}000000001-kaputt-00000`, 'null');
    debugLog('sw', 'gespeichert');
    expect(messages()).toEqual(['gespeichert']);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('voll', 'QuotaExceededError'); });
    expect(() => debugLog('sw', 'trotzdem')).not.toThrow();
    debugLog('sw', 'weiter');
    // Bisherige Einträge bleiben sichtbar, neue kommen im Arbeitsspeicher dazu.
    expect(messages()).toEqual(['gespeichert', 'trotzdem', 'weiter']);
    expect(isDebugEnabled()).toBe(true);
  });

  describe('ohne nutzbaren localStorage (Befund: Zugriff wirft SecurityError oder liefert null)', () => {
    it.each([
      ['SecurityError beim Zugriff', () => { throw new DOMException('verweigert', 'SecurityError'); }],
      ['kein localStorage', () => null],
    ])('%s: Schalter und Protokoll bleiben im Tab erhalten', (label, getter) => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(getter);
      expect(isDebugEnabled()).toBe(false);
      setDebugEnabled(true);
      debugLog('sw', 'eins');
      debugLog('sw', 'zwei');
      expect(isDebugEnabled()).toBe(true);
      expect(messages()).toEqual(['eins', 'zwei']);

      // Fremde storage-Events ändern den Tab-Zustand nicht.
      window.dispatchEvent(new StorageEvent('storage', { key: 'ptm_debug' }));
      expect(messages()).toEqual(['eins', 'zwei']);

      clearDebugLog();
      expect(getDebugLog()).toEqual([]);
      debugLog('sw', 'drei');
      expect(messages()).toEqual(['drei']);
      setDebugEnabled(false);
      expect(isDebugEnabled()).toBe(false);
      debugLog('sw', 'aus');
      expect(getDebugLog()).toEqual([]);
    });

    it('protokolliert ohne in diesem Tab gesetzten Schalter nichts', () => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('verweigert', 'SecurityError'); });
      debugLog('sw', 'ignoriert');
      expect(getDebugLog()).toEqual([]);
      expect(isDebugEnabled()).toBe(false);
    });
  });

  it('kürzt Pfade um Query und lange Kennungen', () => {
    expect(debugPath('/api/registrations/cancel/abcdefghijklmnopqrstuvwxyz0123456789abcdefg?token=geheim')).toBe('/api/registrations/cancel/…');
    expect(debugPath('/api/tournaments/t1/rounds')).toBe('/api/tournaments/t1/rounds');
  });

  it('liefert Gerätedaten und den Kopiertext', () => {
    setDebugEnabled(true);
    debugLog('sw', 'controllerchange');
    const script = document.createElement('script');
    script.type = 'module';
    script.setAttribute('src', '/assets/index-ABC.js');
    document.head.append(script);
    const win = { navigator: { userAgent: 'iPhone CriOS/131', language: 'de', serviceWorker: {}, standalone: false }, matchMedia: () => ({ matches: true }) };
    expect(debugDeviceInfo(win, document)).toEqual([
      'UA: iPhone CriOS/131', 'Standalone: ja · SW: ja · Sprache: de', 'App: /assets/index-ABC.js',
    ]);
    expect(debugReport(win, document)).toMatch(/UA: iPhone CriOS\/131[\s\S]*\[sw\] controllerchange$/);
    script.remove();
    expect(debugDeviceInfo({ navigator: {}, matchMedia: () => { throw new Error('x'); } }, document))
      .toEqual(['UA: –', 'Standalone: nein · SW: nein · Sprache: –', 'App: –']);
  });

  it('hängt globale Listener nur bei aktivem Schalter an und protokolliert Fehler, Netz und Back-Forward-Cache', () => {
    const quiet = new EventTarget();
    quiet.addEventListener = vi.fn();
    installDebugListeners(quiet);
    expect(quiet.addEventListener).not.toHaveBeenCalled();

    setDebugEnabled(true);
    const win = new EventTarget();
    win.location = { pathname: '/turniere', origin: 'https://ptmonline.org' };
    installDebugListeners(win);
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    win.dispatchEvent(new Event('offline'));
    win.dispatchEvent(new Event('online'));
    win.dispatchEvent(Object.assign(new Event('error'), { message: 'Boom', filename: 'https://ptmonline.org/assets/index-ABC.js', lineno: 7 }));
    win.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('weg') }));
    expect(getDebugLog().map((entry) => `${entry.c}:${entry.m}`)).toEqual([
      'app:Seite geöffnet: /turniere',
      'app:pageshow (aus Back-Forward-Cache: ja)',
      'net:offline',
      'net:online',
      'error:Boom (/assets/index-ABC.js:7)',
      'error:unhandledrejection: weg',
    ]);
  });

  describe('mehrere Tabs desselben Geräts', () => {
    // Anderer Tab: schreibt direkt in den gemeinsamen localStorage, der Browser meldet das per storage-Event.
    const otherTabEntry = (message, time = Date.now()) => {
      const key = `${PREFIX}${time.toString(36).padStart(9, '0')}-tabbbb-00001`;
      localStorage.setItem(key, JSON.stringify({ t: new Date(time).toISOString(), c: 'sw', m: message }));
      return key;
    };
    const otherTabStop = () => {
      localStorage.removeItem('ptm_debug');
      storedKeys().forEach((key) => localStorage.removeItem(key));
    };

    it('verliert keinen Eintrag, wenn ein anderer Tab genau zwischen Prüfung und Schreiben schreibt', () => {
      setDebugEnabled(true);
      debugLog('sw', 'Tab A 1');
      // Verschachtelt: Tab B schreibt, nachdem Tab A den Schalter geprüft hat und bevor dessen Eintrag gespeichert ist.
      const originalSetItem = Storage.prototype.setItem;
      let interleaved = false;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
        if (!interleaved && key.startsWith(PREFIX)) {
          interleaved = true;
          originalSetItem.call(this, `${PREFIX}${Date.now().toString(36).padStart(9, '0')}-tabbbb-00001`, JSON.stringify({ t: new Date().toISOString(), c: 'sw', m: 'Tab B 1' }));
        }
        return originalSetItem.call(this, key, value);
      });
      debugLog('sw', 'Tab A 2');
      expect(interleaved).toBe(true);
      expect(storedMessages().sort()).toEqual(['Tab A 1', 'Tab A 2', 'Tab B 1']);
      expect(messages().sort()).toEqual(['Tab A 1', 'Tab A 2', 'Tab B 1']);
    });

    it('lässt kein durch „Beenden“ gelöschtes Protokoll wieder entstehen, auch bei Beenden zwischen Prüfung und Schreiben', () => {
      setDebugEnabled(true);
      debugLog('sw', 'vorher');
      const originalSetItem = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
        // Verschachtelt: Tab B beendet, nachdem Tab A den Schalter als „an“ gelesen hat.
        if (key.startsWith(PREFIX)) otherTabStop();
        return originalSetItem.call(this, key, value);
      });
      debugLog('sw', 'zu spät');
      expect(storedKeys()).toEqual([]);
      expect(localStorage.getItem('ptm_debug')).toBeNull();
      expect(isDebugEnabled()).toBe(false);
      expect(getDebugLog()).toEqual([]);
    });

    it('übernimmt „Beenden“ aus einem anderen Tab per storage-Event und beim nächsten Eintrag', () => {
      setDebugEnabled(true);
      debugLog('sw', 'vorher');
      const listener = vi.fn();
      subscribeDebugLog(listener);

      otherTabStop();
      window.dispatchEvent(new StorageEvent('storage', { key: 'ptm_debug' }));
      expect(listener).toHaveBeenCalled();
      expect(isDebugEnabled()).toBe(false);
      expect(getDebugLog()).toEqual([]);

      debugLog('sw', 'nachher');
      expect(storedKeys()).toEqual([]);
    });

    it('beendet auch ohne storage-Event: der nächste Eintrag prüft den gemeinsamen Schalter', () => {
      setDebugEnabled(true);
      const listener = vi.fn();
      subscribeDebugLog(listener);
      localStorage.removeItem('ptm_debug');
      debugLog('sw', 'ignoriert');
      expect(isDebugEnabled()).toBe(false);
      expect(storedKeys()).toEqual([]);
      expect(listener).toHaveBeenCalledTimes(1);
      debugLog('sw', 'wieder ignoriert');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('übernimmt Einschalten, neue Einträge und Leeren aus einem anderen Tab', () => {
      localStorage.setItem('ptm_debug', '1');
      window.dispatchEvent(new StorageEvent('storage', { key: 'ptm_debug' }));
      expect(isDebugEnabled()).toBe(true);
      const key = otherTabEntry('aus Tab B');
      window.dispatchEvent(new StorageEvent('storage', { key }));
      expect(messages()).toEqual(['aus Tab B']);
      localStorage.removeItem(key);
      window.dispatchEvent(new StorageEvent('storage', { key }));
      expect(getDebugLog()).toEqual([]);
    });

    it('ignoriert fremde Schlüssel; localStorage.clear() in einem anderen Tab beendet', () => {
      setDebugEnabled(true);
      debugLog('sw', 'bleibt');
      const listener = vi.fn();
      subscribeDebugLog(listener);
      localStorage.setItem('anderer_schluessel', 'x');
      window.dispatchEvent(new StorageEvent('storage', { key: 'anderer_schluessel' }));
      expect(listener).not.toHaveBeenCalled();

      localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
      expect(isDebugEnabled()).toBe(false);
      expect(getDebugLog()).toEqual([]);
    });
  });
});
