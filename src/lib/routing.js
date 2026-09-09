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
  if (!['info', 'anmelden', 'teilnehmer'].includes(sub)) {
    return null;
  }

  return { id, view: sub };
}
