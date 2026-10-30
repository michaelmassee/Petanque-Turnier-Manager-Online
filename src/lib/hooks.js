import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true,
  );

  useEffect(() => {
    function onBeforeInstall(event) {
      event.preventDefault();
      setDeferredPrompt(event);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return { canInstall: Boolean(deferredPrompt), installed, promptInstall };
}

export function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  return isIos && isSafari;
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    function goOnline() {
      setOnline(true);
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

export function useRoutedTournament(id, tournaments, shareToken = '') {
  const [fetched, setFetched] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const existing = tournaments.find((tournament) => tournament.id === id) || null;

  useEffect(() => {
    if (existing) {
      setFetched(null);
      setNotFound(false);
      return;
    }

    // Ohne ID (z. B. unbekannter fester QR-Link /q/…) gibt es nichts zu laden.
    if (!id) {
      setFetched(null);
      setNotFound(true);
      return;
    }

    let cancelled = false;
    setNotFound(false);
    api(`/api/tournaments/${id}${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ''}`)
      .then((data) => {
        if (!cancelled) {
          setFetched(data.tournament);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotFound(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, existing, shareToken]);

  return { tournament: existing || fetched, notFound: notFound && !existing };
}

const LIVE_SECOND_REFRESH_MS = 20_000;

// Der Server hält die Turnier-Sicht 15 s im Cache je Rechenzentrum und löscht sie beim Schreiben nur dort, wo die
// Turnierleitung arbeitet. Nach dem ersten Abruf holt ein zweiter den neuen Stand sicher, statt bis zum Polling zu warten.
function createRefreshWithFollowUp(refresh) {
  let followUp = 0;
  return {
    trigger() {
      refresh();
      window.clearTimeout(followUp);
      followUp = window.setTimeout(refresh, LIVE_SECOND_REFRESH_MS);
    },
    cancel() { window.clearTimeout(followUp); },
  };
}

/**
 * Lädt sofort neu, wenn ein Live-Push (neue Runde, Ankündigung) für dieses Turnier eintrifft, statt bis zum
 * nächsten Abruf zu warten. Der Service Worker reicht ihn als Nachricht "live-update" an offene Fenster weiter.
 */
export function useLivePushRefresh(tournamentId, refresh) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const serviceWorker = typeof navigator === 'undefined' ? null : navigator.serviceWorker;
    if (!tournamentId || typeof serviceWorker?.addEventListener !== 'function') return undefined;
    const refresher = createRefreshWithFollowUp(() => refreshRef.current?.());
    const onMessage = (event) => {
      if (event.data?.type !== 'live-update' || event.data.tournamentId !== tournamentId) return;
      refresher.trigger();
    };
    serviceWorker.addEventListener('message', onMessage);
    return () => {
      refresher.cancel();
      serviceWorker.removeEventListener('message', onMessage);
    };
  }, [tournamentId]);
}

export const LIVE_SOCKET_PING_MS = 50_000;
const LIVE_SOCKET_RETRY_MIN_MS = 2_000;
const LIVE_SOCKET_RETRY_MAX_MS = 60_000;
// Ohne je verbunden gewesen zu sein (z. B. kein Zugriff, Server ohne Socket) nach so vielen Versuchen beim Polling bleiben.
const LIVE_SOCKET_MAX_FAILED_ATTEMPTS = 5;
// Streuung, damit nicht alle offenen Seiten im selben Moment nachladen und Serien-Eingaben zu einem Abruf werden.
const LIVE_SOCKET_REFRESH_DELAY_MIN_MS = 300;
const LIVE_SOCKET_REFRESH_DELAY_MAX_MS = 1500;

// Eine Verbindung je Pfad, auch wenn Turnierseite und eingebetteter Spielplan beide zuhören.
const liveSocketChannels = new Map();

function liveSocketUrl(path) {
  return `${window.location.origin.replace(/^http/, 'ws')}${path}`;
}

function createLiveSocketChannel(path) {
  const channel = { listeners: new Set(), connected: false };
  let socket = null;
  let stopped = false;
  let everConnected = false;
  let failedAttempts = 0;
  let retryMs = LIVE_SOCKET_RETRY_MIN_MS;
  let retryTimer = 0;
  let pingTimer = 0;
  let refreshTimer = 0;
  const emit = (type) => channel.listeners.forEach((listener) => listener(type));
  const setConnected = (connected) => {
    if (channel.connected === connected) return;
    channel.connected = connected;
    emit('status');
  };
  const scheduleRefresh = () => {
    if (refreshTimer) return;
    const delay = LIVE_SOCKET_REFRESH_DELAY_MIN_MS + Math.random() * (LIVE_SOCKET_REFRESH_DELAY_MAX_MS - LIVE_SOCKET_REFRESH_DELAY_MIN_MS);
    refreshTimer = window.setTimeout(() => { refreshTimer = 0; emit('refresh'); }, delay);
  };
  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const scheduleReconnect = () => {
    if (stopped || hidden() || (!everConnected && failedAttempts >= LIVE_SOCKET_MAX_FAILED_ATTEMPTS)) return;
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(connect, retryMs * (0.75 + Math.random() * 0.5));
    retryMs = Math.min(retryMs * 2, LIVE_SOCKET_RETRY_MAX_MS);
  };
  function connect() {
    if (stopped || socket || hidden()) return;
    let current;
    try {
      current = new WebSocket(liveSocketUrl(path));
    } catch {
      failedAttempts += 1;
      scheduleReconnect();
      return;
    }
    socket = current;
    let opened = false;
    current.onopen = () => {
      opened = true;
      everConnected = true;
      failedAttempts = 0;
      retryMs = LIVE_SOCKET_RETRY_MIN_MS;
      setConnected(true);
      window.clearInterval(pingTimer);
      pingTimer = window.setInterval(() => { try { current.send('ping'); } catch { /* schließt gleich */ } }, LIVE_SOCKET_PING_MS);
      // Zwischen dem letzten Abruf und dem (Wieder-)Verbinden kann eine Änderung verpasst worden sein - auch beim ersten
      // Verbinden kurz nach dem Laden der Seite. Einmal nachladen; unverändert kostet das nur ein 304.
      emit('resync');
    };
    current.onmessage = (event) => {
      let type = '';
      try { type = JSON.parse(event.data)?.type || ''; } catch { type = ''; }
      if (type === 'changed') scheduleRefresh();
    };
    current.onclose = (event) => {
      if (socket !== current) return;
      socket = null;
      window.clearInterval(pingTimer);
      setConnected(false);
      if (stopped) return;
      if (!opened) failedAttempts += 1;
      // 1013: zu viele Verbindungen für dieses Turnier, die Seite bleibt beim regelmäßigen Abruf.
      if (event.code === 1013) return;
      scheduleReconnect();
    };
  }
  const close = () => {
    window.clearTimeout(retryTimer);
    window.clearInterval(pingTimer);
    const current = socket;
    socket = null;
    if (current) {
      try { current.close(1000); } catch { /* bereits zu */ }
    }
    setConnected(false);
  };
  // Im Hintergrund kein Socket (Handys trennen ihn ohnehin); beim Zurückkehren lädt React Query selbst neu.
  const onVisibility = () => {
    if (hidden()) close();
    else {
      retryMs = LIVE_SOCKET_RETRY_MIN_MS;
      connect();
    }
  };
  channel.start = () => {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    connect();
  };
  channel.stop = () => {
    stopped = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    window.clearTimeout(refreshTimer);
    close();
  };
  return channel;
}

/**
 * Sofort-Aktualisierung über einen WebSocket (TournamentLiveHub): Der Server meldet nur "changed", die Seite lädt
 * dann leicht gestreut über den gewohnten Abruf (ETag) neu. path null schließt die Verbindung. Liefert, ob der Socket
 * gerade verbunden ist – dann reicht seltenes Polling als Sicherheitsnetz.
 */
export function useTournamentLiveSocket(path, refresh) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!path || typeof WebSocket !== 'function') return undefined;
    let channel = liveSocketChannels.get(path);
    if (!channel) {
      channel = createLiveSocketChannel(path);
      liveSocketChannels.set(path, channel);
      channel.start();
    }
    const refresher = createRefreshWithFollowUp(() => refreshRef.current?.());
    const listener = (type) => {
      if (type === 'status') setConnected(channel.connected);
      else if (type === 'refresh') refresher.trigger();
      else if (type === 'resync') refreshRef.current?.();
    };
    channel.listeners.add(listener);
    setConnected(channel.connected);
    return () => {
      refresher.cancel();
      channel.listeners.delete(listener);
      setConnected(false);
      if (!channel.listeners.size) {
        channel.stop();
        liveSocketChannels.delete(path);
      }
    };
  }, [path]);
  return connected;
}

// Ab hier füllt die Bildschirm-Anzeige genau den Bildschirm (siehe styles.css); darunter normaler Seitenfluss.
export const DISPLAY_FIT_QUERY = '(min-width: 900px) and (orientation: landscape)';

/** true, solange die Media-Query passt; reagiert auf Drehen und Größenänderungen. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => Boolean(window.matchMedia?.(query).matches));
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return undefined;
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener?.('change', update);
    return () => list.removeEventListener?.('change', update);
  }, [query]);
  return matches;
}

const AUTO_SCROLL_PAUSE_MS = 4000;
const AUTO_SCROLL_USER_IDLE_MS = 20000;
const AUTO_SCROLL_STEP_MS = 8000;
const AUTO_SCROLL_EM_PER_SECOND = 1.5;

/**
 * Scrollt einen Container, der mehr Inhalt hat als hineinpasst, langsam von selbst durch – für Anzeigen ohne Bedienung
 * (Bildschirm vor Ort): Pause oben, langsam nach unten, Pause unten, zurück nach oben. Nach einer Eingabe im Container
 * (Mausrad, Klick, Touch, Taste) ruht er eine Weile. Bei „Bewegung reduzieren“ springt er stattdessen seitenweise.
 * Gibt einen Callback-Ref für den Container zurück.
 */
export function useAutoScroll(enabled) {
  const [element, setElement] = useState(null);
  useEffect(() => {
    if (!enabled || !element) return undefined;
    const overflow = () => element.scrollHeight - element.clientHeight;
    let holdUntil = 0;
    const pauseForUser = () => { holdUntil = Date.now() + AUTO_SCROLL_USER_IDLE_MS; };
    const events = ['wheel', 'pointerdown', 'touchstart', 'keydown'];
    events.forEach((type) => element.addEventListener(type, pauseForUser, { passive: true }));
    const cleanupListeners = () => events.forEach((type) => element.removeEventListener(type, pauseForUser));

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const timer = window.setInterval(() => {
        const max = overflow();
        if (max <= 4 || Date.now() < holdUntil) return;
        element.scrollTop = element.scrollTop >= max - 1 ? 0 : Math.min(max, element.scrollTop + element.clientHeight * 0.9);
      }, AUTO_SCROLL_STEP_MS);
      return () => { window.clearInterval(timer); cleanupListeners(); };
    }

    let phase = 'wait-top';
    let phaseEnd = Date.now() + AUTO_SCROLL_PAUSE_MS;
    let position = null;
    let lastTime = null;
    let frame = 0;
    const step = (time) => {
      frame = window.requestAnimationFrame(step);
      const elapsed = lastTime == null ? 0 : time - lastTime;
      lastTime = time;
      const now = Date.now();
      const max = overflow();
      if (max <= 4) return;
      if (now < holdUntil) {
        // Nach der Nutzerpause ab der Position weiter, an die gescrollt wurde.
        position = null;
        phase = 'scroll';
        return;
      }
      if (phase !== 'scroll') {
        if (now < phaseEnd) return;
        if (phase === 'wait-bottom') {
          element.scrollTop = 0;
          position = 0;
          phase = 'wait-top';
          phaseEnd = now + AUTO_SCROLL_PAUSE_MS;
          return;
        }
        phase = 'scroll';
      }
      if (position == null) position = element.scrollTop;
      const pxPerMs = (parseFloat(window.getComputedStyle(element).fontSize) || 16) * AUTO_SCROLL_EM_PER_SECOND / 1000;
      // Eigene Position mitführen: scrollTop rundet auf ganze Pixel und bliebe bei kleinen Schritten stehen.
      position = Math.min(max, position + elapsed * pxPerMs);
      element.scrollTop = position;
      if (position >= max) {
        phase = 'wait-bottom';
        phaseEnd = now + AUTO_SCROLL_PAUSE_MS;
      }
    };
    frame = window.requestAnimationFrame(step);
    return () => { window.cancelAnimationFrame(frame); cleanupListeners(); };
  }, [enabled, element]);
  return setElement;
}
