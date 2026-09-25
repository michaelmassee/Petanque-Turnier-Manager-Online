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
    if (next !== window.location.pathname) {
      window.history.pushState({}, '', next);
    }
    setPath(next);
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
