import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from 'react-i18next';

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>';
const MAPTILER_ATTRIBUTION = '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>';

export function FitToBounds({ positions, maxZoom = 13, singleZoom = 13 }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], singleZoom);
      return;
    }
    map.fitBounds(L.latLngBounds(positions), { padding: [32, 32], maxZoom });
  }, [map, positions]);
  return null;
}

function KeepMapSized() {
  const map = useMap();

  useEffect(() => {
    const resize = () => map.invalidateSize({ pan: false, debounceMoveend: true });
    const firstFrame = requestAnimationFrame(resize);
    const secondFrame = requestAnimationFrame(() => requestAnimationFrame(resize));
    const timer = window.setTimeout(resize, 250);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(timer);
      window.removeEventListener('resize', resize);
    };
  }, [map]);

  return null;
}

// Leaflet-Karte mit automatischem Fallback von MapTiler auf OpenStreetMap,
// Lade-/Fehleranzeige und Retry-Button (z.B. wenn ein Kartenanbieter ausfällt).
export function TileFallbackMap({ center, maptilerApiKey, children, className = 'places-map' }) {
  const { t } = useTranslation();
  // provider ist null, solange MapTiler noch geprüft wird (kein Layer gerendert,
  // um kurzzeitig sichtbare kaputte Kacheln/unnötige Requests zu vermeiden).
  const [provider, setProvider] = useState(maptilerApiKey ? null : 'openstreetmap');
  const [loadingTiles, setLoadingTiles] = useState(true);
  const [tileError, setTileError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoadingTiles(true);
    setTileError(false);

    if (!maptilerApiKey) {
      setProvider('openstreetmap');
      return undefined;
    }

    // MapTiler antwortet bei ungültigem/gesperrtem Key mit einer gültigen
    // Platzhaltergrafik (HTTP 403), die von <img> als erfolgreich geladen gilt -
    // das Kachel-'error'-Event greift dann nicht. Deshalb vorab per fetch prüfen.
    setProvider(null);
    let cancelled = false;
    const probeTimeout = window.setTimeout(() => {
      if (!cancelled) setProvider('openstreetmap');
    }, 5000);
    fetch(`https://api.maptiler.com/maps/streets-v2/0/0/0.png?key=${maptilerApiKey}`)
      .then((res) => {
        if (cancelled) return;
        window.clearTimeout(probeTimeout);
        setProvider(res.ok ? 'maptiler' : 'openstreetmap');
      })
      .catch(() => {
        if (cancelled) return;
        window.clearTimeout(probeTimeout);
        setProvider('openstreetmap');
      });
    return () => {
      cancelled = true;
      window.clearTimeout(probeTimeout);
    };
  }, [maptilerApiKey, reloadKey]);

  useEffect(() => {
    if (!loadingTiles || !provider) return undefined;
    const timeout = window.setTimeout(() => {
      if (provider === 'maptiler') {
        setProvider('openstreetmap');
      } else {
        setLoadingTiles(false);
        setTileError(true);
      }
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [loadingTiles, provider]);

  const usingFallback = provider === 'openstreetmap' && Boolean(maptilerApiKey);
  const tileUrl = provider === 'maptiler'
    ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}{r}.png?key=${maptilerApiKey}`
    : OSM_TILE_URL;

  function handleTileError() {
    if (provider === 'maptiler') {
      setProvider('openstreetmap');
      setLoadingTiles(true);
      return;
    }
    setLoadingTiles(false);
    setTileError(true);
  }

  function retry() {
    setReloadKey((current) => current + 1);
  }

  return (
    <div className={className} aria-busy={loadingTiles}>
      <MapContainer key={reloadKey} center={center} zoom={7} scrollWheelZoom={false}>
        {provider && (
          <TileLayer
            key={provider}
            attribution={provider === 'maptiler' ? MAPTILER_ATTRIBUTION : OSM_ATTRIBUTION}
            url={tileUrl}
            maxZoom={20}
            eventHandlers={{ load: () => setLoadingTiles(false), tileerror: handleTileError }}
          />
        )}
        <KeepMapSized />
        {children}
      </MapContainer>
      {loadingTiles && <p className="places-map-status" role="status">{usingFallback ? t('Ersatzkarte wird geladen …') : t('Karte wird geladen …')}</p>}
      {usingFallback && !loadingTiles && !tileError && <p className="places-map-status places-map-notice" role="status">{t('Ersatzkarte aktiv, weil der primäre Kartenanbieter nicht erreichbar ist.')}</p>}
      {tileError && <div className="places-map-status places-map-error" role="alert"><span>{t('Karte konnte nicht geladen werden.')}</span><button type="button" onClick={retry}>{t('Karte erneut laden')}</button></div>}
    </div>
  );
}
