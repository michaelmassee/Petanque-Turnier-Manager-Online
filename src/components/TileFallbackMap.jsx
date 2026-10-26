import { useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from 'react-i18next';
import { Button, Feedback } from './ui.jsx';

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

// Meldet den sichtbaren Kartenausschnitt (L.LatLngBounds) nach jedem Verschieben/Zoomen,
// z. B. um eine Liste auf die gerade sichtbaren Treffer zu beschränken.
// Der Listener bleibt pro Karte registriert (onChange über eine Ref): useMapEvents würde ihn
// bei jedem Rendern ab- und wieder anmelden, und ein synchrones moveend aus FitToBounds
// (großer Zoomsprung ohne Animation) fiele genau in diese Lücke.
export function ReportMapBounds({ onChange }) {
  const map = useMap();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const report = () => onChangeRef.current(map.getBounds());
    map.on('moveend', report);
    map.whenReady(report);
    return () => { map.off('moveend', report); };
  }, [map]);
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

// Zentriert die Karte auf den Gerätestandort und markiert ihn. Liegt außerhalb des
// Leaflet-Containers, damit Klicks nicht als Karten-Klick/Doppelklick-Zoom ankommen.
function LocateButton({ map, onLocated }) {
  const { t } = useTranslation();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  function locate() {
    setError('');
    if (!navigator.geolocation) {
      setError(t('Geolocation wird von diesem Browser nicht unterstützt.'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latLng = [position.coords.latitude, position.coords.longitude];
        onLocated(latLng);
        map?.flyTo(latLng, Math.max(map.getZoom(), 13));
        setLocating(false);
      },
      (geoErr) => {
        setError(
          geoErr.code === geoErr.PERMISSION_DENIED
            ? t('Standort-Zugriff wurde verweigert. Bitte erlaube den Zugriff in den Einstellungen deines Geräts unter Datenschutz > Ortungsdienste.')
            : t('Standort konnte nicht ermittelt werden.'),
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <>
      <Button className="button button-secondary map-locate-button" disabled={!map} loading={locating} onClick={locate} title={t('Mein Standort')} aria-label={t('Mein Standort')}>
        {!locating && <span className="map-locate-icon" aria-hidden="true">⌖</span>}
        <span className="map-locate-label">{t('Mein Standort')}</span>
      </Button>
      {error && <div className="map-locate-feedback"><Feedback error={error} /></div>}
    </>
  );
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
  const [map, setMap] = useState(null);
  const [ownPosition, setOwnPosition] = useState(null);

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
      <MapContainer key={reloadKey} ref={setMap} center={center} zoom={7} scrollWheelZoom={false}>
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
        {ownPosition && <CircleMarker center={ownPosition} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }} />}
      </MapContainer>
      <LocateButton map={map} onLocated={setOwnPosition} />
      {loadingTiles && <p className="places-map-status" role="status">{usingFallback ? t('Ersatzkarte wird geladen …') : t('Karte wird geladen …')}</p>}
      {usingFallback && !loadingTiles && !tileError && <p className="places-map-status places-map-notice" role="status">{t('Ersatzkarte aktiv, weil der primäre Kartenanbieter nicht erreichbar ist.')}</p>}
      {tileError && <div className="places-map-status places-map-error" role="alert"><span>{t('Karte konnte nicht geladen werden.')}</span><button type="button" onClick={retry}>{t('Karte erneut laden')}</button></div>}
    </div>
  );
}
