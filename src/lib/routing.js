import { useEffect, useRef, useState } from 'react';

// Hat das letzte popstate den Pfad gewechselt (Zurück von einer Route) statt nur einen App-Eintrag (Dialog, Tab)
// zu verlassen? Der Listener in usePath läuft vor später registrierten (App) und hält den Wert für sie bereit.
// Deren eigener Pfadvergleich käme zu spät: popstate ist für React ein diskretes Ereignis, nach diesem Listener
// rendert React samt Effekten sofort neu.
let lastPopStateChangedPath = false;

export function popStateChangedPath() {
  return lastPopStateChangedPath;
}

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname);
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    function onPopState() {
      lastPopStateChangedPath = window.location.pathname !== pathRef.current;
      setPath(window.location.pathname);
      window.scrollTo(0, 0);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigate(next) {
    const target = new URL(next, window.location.origin);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.pushState({}, '', next);
    }
    // The route matcher receives only a pathname. Query parameters such as a
    // private tournament share token stay in the address bar, but must not
    // become part of the final route segment (e.g. "teilnehmer?share=…").
    setPath(target.pathname);
    window.scrollTo(0, 0);
  }

  return [path, navigate];
}

export function matchTournamentRoute(path) {
  const segments = path.split('/').filter(Boolean);
  // Fester Anmelde-/Teilen-Link /q/<qr_token>: Bekannte Schlüssel leitet der Worker weiter; landet die App hier,
  // gibt es das Turnier nicht (mehr) → Seite „Turnier nicht gefunden“.
  if (segments[0] === 'q' && segments.length === 2) {
    return { id: '', view: 'info' };
  }
  if (segments[0] !== 'turniere' || !segments[1]) {
    return null;
  }

  const id = decodeURIComponent(segments[1]);
  const sub = segments[2] || 'info';
  if (!['info', 'anmelden', 'teilnehmer', 'mitspieler', 'rangliste'].includes(sub)) {
    return null;
  }

  return { id, view: sub };
}

// Bereich "Live": /live (eigene Turniere), /live/:registrationId (nur eingeloggt).
export function matchLiveRoute(path) {
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== 'live') return null;
  if (segments.length === 1) return {};
  if (segments.length === 2) return { registrationId: decodeURIComponent(segments[1]) };
  // Persönlicher Live-Link aus der Anmeldebestätigung (E-21), ohne Login.
  if (segments.length === 3 && segments[1] === 't') return { token: decodeURIComponent(segments[2]) };
  return null;
}

// Bereich „Platz mieten“: Angebotsliste, eigene Reservierungen, Vereinsverwaltung und einzelnes Angebot.
export function matchRentalRoute(path) {
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== 'platz-mieten' || segments.length > 2) return null;
  if (segments.length === 1) return { view: 'list' };
  if (segments[1] === 'meine') return { view: 'mine' };
  if (segments[1] === 'verwalten') return { view: 'manage' };
  return { view: 'offer', id: decodeURIComponent(segments[1]) };
}

const PATH_AREAS = {
  '/turnier-melden': 'turniere',
  '/plaetze': 'bouleplaetze', '/platz-melden': 'bouleplaetze', '/platz-bearbeiten': 'bouleplaetze', '/vereine': 'bouleplaetze',
  '/spielerboerse': 'spielerboerse', '/meine-anzeigen': 'spielerboerse',
};

// Turnierseite als reine Anzeige (Ankündigung, Spielplan, Rangliste). Der frühere Reiter /turniere/<id>/spielplan
// und die frühere eigene Bildschirm-Anzeige /turnierseite/<id>/anzeige (auch in gespeicherten Push-Abos) führen
// ebenfalls hierher, damit alte Links weiter funktionieren.
export function tournamentBoardPath(tournamentId) {
  return `/turnierseite/${encodeURIComponent(tournamentId)}`;
}

export function matchTournamentBoardRoute(path) {
  const segments = path.split('/').filter(Boolean);
  if (segments[0] === 'turnierseite' && segments.length === 2) return { id: decodeURIComponent(segments[1]), legacy: false };
  if (segments[0] === 'turnierseite' && segments.length === 3 && segments[2] === 'anzeige') return { id: decodeURIComponent(segments[1]), legacy: true };
  if (segments[0] === 'turniere' && segments.length === 3 && segments[2] === 'spielplan') return { id: decodeURIComponent(segments[1]), legacy: true };
  return null;
}

// Menübereich einer Seite; null für Seiten ohne eigenen Bereich (Startseite mit Tabs, Impressum, Datenschutz),
// die den Bereich übernehmen, aus dem man kommt.
export function areaForPath(path) {
  if (matchTournamentRoute(path) || matchTournamentBoardRoute(path)) return 'turniere';
  if (matchRentalRoute(path)) return 'platzmieten';
  if (matchLiveRoute(path)) return 'live';
  return PATH_AREAS[path] || null;
}
