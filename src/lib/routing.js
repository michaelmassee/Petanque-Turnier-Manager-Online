import { useEffect, useState } from 'react';

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    function onPopState() {
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
    // become part of the final route segment (e.g. "spielplan?share=…").
    setPath(target.pathname);
    window.scrollTo(0, 0);
  }

  return [path, navigate];
}

export function matchTournamentRoute(path) {
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== 'turniere' || !segments[1]) {
    return null;
  }

  const id = decodeURIComponent(segments[1]);
  const sub = segments[2] || 'info';
  if (!['info', 'anmelden', 'teilnehmer', 'spielplan'].includes(sub)) {
    return null;
  }

  return { id, view: sub };
}

// Bereich "Live": /live (eigene Turniere), /live/:registrationId (eingeloggt),
// /live/t/:token (persönlicher Link aus der Check-in-Mail, ohne Login).
export function matchLiveRoute(path) {
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== 'live') return null;
  if (segments.length === 1) return {};
  if (segments[1] === 't' && segments[2] && segments.length === 3) return { token: decodeURIComponent(segments[2]) };
  if (segments.length === 2) return { registrationId: decodeURIComponent(segments[1]) };
  return null;
}
