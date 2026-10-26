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

const LIVE_PUSH_SECOND_REFRESH_MS = 20_000;

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
    let timer = 0;
    const onMessage = (event) => {
      if (event.data?.type !== 'live-update' || event.data.tournamentId !== tournamentId) return;
      refreshRef.current?.();
      // Der Server hält die Turnier-Sicht 15 s im Cache je Rechenzentrum und löscht sie beim Schreiben nur dort, wo die
      // Turnierleitung arbeitet. Ein zweiter Abruf danach holt die neue Runde sicher, statt bis zum Polling zu warten.
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refreshRef.current?.(), LIVE_PUSH_SECOND_REFRESH_MS);
    };
    serviceWorker.addEventListener('message', onMessage);
    return () => {
      window.clearTimeout(timer);
      serviceWorker.removeEventListener('message', onMessage);
    };
  }, [tournamentId]);
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
