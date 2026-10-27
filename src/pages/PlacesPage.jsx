import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { useTranslation } from 'react-i18next';
import { api, authenticatedApi } from '../lib/api.js';
import { clubLogoImageUrl, withPersonalPlaceMarks, formatLocationAddress, googleMapsUrl, distanceKm, translatedOptions, labelFor } from '../lib/domain.js';
import { RADIUS_OPTIONS } from '../lib/constants.js';
import { Feedback, Button, ClubBadge, DistanceBadge, SelectField, CloseButton, ShareLinkButton, EditDialog, TextArea } from '../components/ui.jsx';
import { LocationAutocomplete } from '../components/LocationAutocomplete.jsx';
import { RichText } from '../components/RichText.jsx';
import { InfiniteListLoadMore } from '../components/InfiniteListLoadMore.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';
import { POSTBOX_ADMIN_RECIPIENT_ID } from '../postbox-core.js';
import { TileFallbackMap, FitToBounds, ReportMapBounds } from '../components/TileFallbackMap.jsx';

const FALLBACK_CENTER = [51.1, 10.4];
const marker = new L.Icon({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });
const clubMarker = L.divIcon({
  className: 'club-marker-icon',
  html: `<img class="club-marker-pin" src="${markerIcon}" width="25" height="41" /><span class="club-marker-flag" aria-hidden="true">🏛</span>`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
const groupMarker = L.divIcon({
  className: 'club-marker-icon group-marker-icon',
  html: `<img class="club-marker-pin" src="${markerIcon}" width="25" height="41" /><span class="club-marker-flag" aria-hidden="true">👥</span>`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
const facilityLabels = { toilet: 'Toilette', shelter: 'Unterstand', clubhouse: 'Vereinsheim', lighting: 'Beleuchtung', parking: 'Parkplatz', catering: 'Gastronomie', drinking_water: 'Trinkwasser', accessible: 'Barrierefrei' };

function hasClub(place) {
  return Boolean(place.clubId || place.clubName);
}

function clubKey(place) {
  return place.clubId || String(place.clubName || '').trim().toLocaleLowerCase();
}

function SharePlaceButton({ name, placeId, organizationId }) {
  const url = new URL('/plaetze', window.location.origin);
  if (organizationId) url.searchParams.set('verein', organizationId);
  else url.hash = encodeURIComponent(placeId);
  return <ShareLinkButton title={name} url={url.href} />;
}

function FocusOnPlace({ focus, markerRefs }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 15));
    markerRefs.current[focus.id]?.openPopup();
  }, [focus, map, markerRefs]);
  return null;
}

// Spielorte desselben Vereins an derselben Adresse teilen sich einen Marker. Das
// vermeidet überlagerte Pins und macht sichtbar, dass Platz und Halle zu einer
// Organisation gehören.
export function groupMapPlaces(places) {
  const groups = new Map();
  for (const place of places) {
    const addressKey = String(place.address || '').trim().toLocaleLowerCase();
    const clubKey = place.clubId || String(place.clubName || '').trim().toLocaleLowerCase();
    const key = hasClub(place) ? `club:${clubKey}:${addressKey}` : `place:${place.id}`;
    const group = groups.get(key);
    if (group) {
      group.places.push(place);
    } else {
      groups.set(key, { id: key, place, places: [place] });
    }
  }
  return [...groups.values()];
}

export function filterPlaces(places, { placeId = '', organizationId = '', favoritesOnly = false, clubsOnly = false, indoorOnly = false } = {}) {
  return places.filter((place) => (!placeId || place.id === placeId)
    && (!organizationId || clubKey(place) === organizationId)
    && (!favoritesOnly || place.favorited)
    && (!clubsOnly || hasClub(place))
    && (!indoorOnly || place.venueType === 'indoor'));
}

export function groupPlacesByOrganization(places) {
  const groups = new Map();
  for (const place of places) {
    const clubKey = place.clubId || String(place.clubName || '').trim().toLocaleLowerCase();
    const key = hasClub(place) ? `club:${clubKey}` : `place:${place.id}`;
    const group = groups.get(key);
    if (group) {
      group.places.push(place);
    } else {
      groups.set(key, { id: key, clubName: place.clubName || null, clubKind: place.clubKind || 'club', clubDescription: place.clubDescription || null, places: [place] });
    }
  }
  return [...groups.values()];
}

function OrganizationLinks({ place, t, onRequestTakeover }) {
  return <div className="place-actions">
    {onRequestTakeover && <Button variant="secondary" onClick={() => onRequestTakeover(place)}>{t('Verein übernehmen?')}</Button>}
    <SharePlaceButton name={place.clubName} organizationId={clubKey(place)} />
    {place.clubWebsiteUrl && <a className="button button-secondary" href={place.clubWebsiteUrl} target="_blank" rel="noreferrer">{t('Website')}</a>}
    {place.clubSocialLinks?.facebook && <a className="button button-secondary" href={place.clubSocialLinks.facebook} target="_blank" rel="noreferrer">Facebook</a>}
    {place.clubSocialLinks?.instagram && <a className="button button-secondary" href={place.clubSocialLinks.instagram} target="_blank" rel="noreferrer">Instagram</a>}
    {place.clubSocialLinks?.x && <a className="button button-secondary" href={place.clubSocialLinks.x} target="_blank" rel="noreferrer">X</a>}
    {place.clubSocialLinks?.youtube && <a className="button button-secondary" href={place.clubSocialLinks.youtube} target="_blank" rel="noreferrer">YouTube</a>}
  </div>;
}

// Vereine, die einem Admin gehören (z. B. aus Verbandsimporten), überträgt ein Admin im Moderationsbereich. Die Anfrage
// geht als Postfach-Nachricht an alle Admins (Empfänger „Admin“); die Antwort kommt ebenfalls über die Postbox.
function ClubTakeoverDialog({ place, onClose }) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => t('Ich bin für den Verein „{{name}}“ zuständig und möchte ihn übernehmen.', { name: place.clubName }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function send(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await authenticatedApi('/api/postbox/messages', { method: 'POST', body: JSON.stringify({ recipientId: POSTBOX_ADMIN_RECIPIENT_ID, body: text.trim() }) });
      setMessage(t('Deine Anfrage ist an alle Admins gegangen. Die Antwort bekommst du in deiner Postbox.'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <EditDialog title={t('Verein übernehmen')} subtitle={place.clubName} error={error} message={message} onClose={onClose}>
      <form className="form" onSubmit={send}>
        <p className="muted">{t('Dieser Verein wird derzeit von den Admins verwaltet. Schreib ihnen, warum du ihn übernehmen möchtest, z. B. deine Funktion im Verein.')}</p>
        <TextArea label={t('Nachricht an Admin')} value={text} maxLength={500} required onChange={setText} />
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onClose}>{t('Schließen')}</Button>
          <Button type="submit" disabled={!text.trim() || Boolean(message)} loading={busy}>{t('Senden')}</Button>
        </div>
      </form>
    </EditDialog>
  );
}

// Adresse aus einer Verbandsliste übernommen, aber noch von niemandem bestätigt: kann die Postanschrift des Vereins sein.
function AddressCorrectionDialog({ place, onClose }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function send(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await authenticatedApi(`/api/places/${place.id}/address-correction`, { method: 'POST', body: JSON.stringify({ body: text.trim() }) });
      setText('');
      setMessage(t('Danke! Deine Korrektur ist an die Verantwortlichen des Spielorts gegangen.'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <EditDialog title={t('Korrektur melden')} subtitle={place.name} error={error} message={message} onClose={onClose}>
      <form className="form" onSubmit={send}>
        <p className="muted" data-i18n-skip>{formatLocationAddress(place.address)}</p>
        <TextArea label={t('Wo liegt der Spielort tatsächlich?')} value={text} maxLength={500} required onChange={setText} />
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onClose}>{t('Schließen')}</Button>
          <Button type="submit" disabled={!text.trim()} loading={busy}>{t('Senden')}</Button>
        </div>
      </form>
    </EditDialog>
  );
}

function AddressUnverifiedHint({ place, t, onReportAddress }) {
  if (!place.addressUnverified) return null;
  return <p className="hint place-address-unverified">
    ⚠ {t('Adresse ungeprüft: aus der Vereinsliste des Landesverbands übernommen, möglicherweise die Postanschrift des Vereins.')}
    {onReportAddress && <> <button className="link-button" type="button" onClick={() => onReportAddress(place)}>{t('Korrektur melden')}</button></>}
  </p>;
}

function PlaceDetails({ place, t, onFocus, onToggleLike, onToggleFavorite, onReportAddress, onNavigate, heading = 'h2', forceOpen = false, detailRef }) {
  const Heading = heading;
  return <details className="panel place-card place-card-details" open={forceOpen || undefined} ref={detailRef}>
    <summary className="place-card-summary">
      <span className="place-card-summary-title">
        <Heading data-i18n-skip>{place.name}</Heading>
        <span className="muted">{t(place.venueType === 'indoor' ? 'Boulehalle' : 'Bouleplatz')}</span>
      </span>
      <span className="place-card-summary-facts">
        {place.courtCount !== 1 && <span>{place.courtCount > 1 ? `${place.courtCount} ${t('Plätze')}` : t('Platzanzahl nicht angegeben')}</span>}
        {place.accessible && <span>{t('Barrierefrei')}</span>}
        <DistanceBadge distanceKm={place.distanceKm} />
      </span>
    </summary>
    <div className="place-card-content">
      <p className="muted" data-i18n-skip>{formatLocationAddress(place.address)}</p>
      <AddressUnverifiedHint place={place} t={t} onReportAddress={onReportAddress} />
      {place.description && <RichText value={place.description} onNavigate={onNavigate} />}
      {place.facilities && <p>{t('Ausstattung:')} {place.facilities}</p>}
      {place.facilityCodes?.length > 0 && <p className="muted">{place.facilityCodes.map((code) => t(facilityLabels[code])).join(' · ')}</p>}
      <div className="place-actions">
        <SharePlaceButton name={place.name} placeId={place.id} />
        <Button variant="secondary" onClick={() => onFocus(place)} disabled={place.latitude === null || place.longitude === null}>{t('Karte')}</Button>
        <a className="button button-secondary" href={googleMapsUrl(place)} target="_blank" rel="noreferrer">{t('Anfahrt')}</a>
        <Button variant={place.liked ? 'primary' : 'secondary'} onClick={() => onToggleLike(place)}>{place.liked ? '♥' : '♡'} {place.likeCount}</Button>
        <Button variant={place.favorited ? 'primary' : 'secondary'} onClick={() => onToggleFavorite(place)}>{place.favorited ? '★' : '☆'} {t('Favorit')}</Button>
      </div>
    </div>
  </details>;
}

function PlacesMap({ places, center, maptilerApiKey, focus, onBoundsChange, onShowDetails, onOnlyThis }) {
  const { t } = useTranslation();
  const markerRefs = useRef({});
  const positions = useMemo(() => places.map((place) => [place.latitude, place.longitude]), [places]);
  const markerGroups = useMemo(() => groupMapPlaces(places), [places]);
  return (
    <TileFallbackMap center={center} maptilerApiKey={maptilerApiKey}>
      <FitToBounds positions={positions} />
      <ReportMapBounds onChange={onBoundsChange} />
      {markerGroups.map(({ id, place, places: groupedPlaces }) => (
        <Marker
          key={id}
          ref={(instance) => { groupedPlaces.forEach((groupedPlace) => { markerRefs.current[groupedPlace.id] = instance; }); }}
          icon={hasClub(place) ? (place.clubKind === 'group' ? groupMarker : clubMarker) : marker}
          position={[place.latitude, place.longitude]}
        >
          <Popup>
            {place.clubName ? (
              <>
                <div className="map-popup-heading">
                  {place.clubLogoUrl && (
                    <img
                      className="map-popup-logo"
                      src={clubLogoImageUrl(place.id)}
                      alt=""
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <ClubBadge clubName={place.clubName} clubKind={place.clubKind} />
                  <strong data-i18n-skip>{place.clubName}</strong>
                </div>
                <ul className="map-popup-venues">
                  {groupedPlaces.map((groupedPlace) => <li key={groupedPlace.id} data-i18n-skip>{groupedPlace.name} ({t(groupedPlace.venueType === 'indoor' ? 'Boulehalle' : 'Bouleplatz')})</li>)}
                </ul>
              </>
            ) : <strong data-i18n-skip>{place.name}</strong>}
            <span data-i18n-skip className="map-popup-address">{formatLocationAddress(place.address)}</span>
            {place.addressUnverified && <span className="map-popup-address muted">⚠ {t('Adresse ungeprüft')}</span>}
            <div className="map-popup-actions">
              <a className="button button-secondary" href={googleMapsUrl(place)} target="_blank" rel="noreferrer">{t('Anfahrt')}</a>
              <Button variant="secondary" onClick={() => onShowDetails(place)}>{t('Details')}</Button>
              <Button variant="secondary" onClick={() => onOnlyThis(place)}>{t('Nur diesen Treffer')}</Button>
            </div>
          </Popup>
        </Marker>
      ))}
      {/* Nach den Markern, damit sie beim ersten Rendern (Link mit #placeId) schon auf der Karte liegen und openPopup greift. */}
      <FocusOnPlace focus={focus} markerRefs={markerRefs} />
    </TileFallbackMap>
  );
}

export default function PlacesPage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, isAdmin, onSelectAdminDashboard, onLogout, maptilerApiKey, drawerContent, postboxControl }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [clubsOnly, setClubsOnly] = useState(false);
  const [indoorOnly, setIndoorOnly] = useState(false);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const [searchTab, setSearchTab] = useState('filters');
  const resultsRef = useRef(null);
  const mapSectionRef = useRef(null);
  const [focusPlace, setFocusPlace] = useState(null);
  const [correctionPlace, setCorrectionPlace] = useState(null);
  const [takeoverPlace, setTakeoverPlace] = useState(null);

  function handleFocusPlace(place, scrollToMap = true) {
    if (place.latitude === null || place.longitude === null) return;
    setFocusPlace({ id: place.id, lat: place.latitude, lng: place.longitude, scrollToMap });
  }

  // Erst nach dem Rendern und den Karteneffekten scrollen, damit das Öffnen
  // des Markers die Scrollbewegung nicht durch eine weitere Aktualisierung stört.
  useEffect(() => {
    if (focusPlace?.scrollToMap) {
      mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusPlace]);

  const [searchOrigin, setSearchOrigin] = useState(null);
  const [searchOriginQuery, setSearchOriginQuery] = useState('');
  const [searchRadiusKm, setSearchRadiusKm] = useState('25');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);
  const [mapBounds, setMapBounds] = useState(null);
  const [detailsRequest, setDetailsRequest] = useState(null);
  const detailsTargetRef = useRef(null);
  const [viewportOnly, setViewportOnly] = useState(true);

  async function load() {
    setLoading(true); setError('');
    try {
      // Ohne Suchbegriff kommt die Liste für alle aus dem Edge-Cache; Likes/Favoriten/Bearbeitungsrechte separat.
      const personal = currentUser && !query.trim();
      const [data, marks] = await Promise.all([
        api(`/api/places?q=${encodeURIComponent(query)}`),
        personal ? authenticatedApi('/api/places/personal') : null,
      ]);
      setPlaces(withPersonalPlaceMarks(data.places || [], marks));
    }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer); }, [query, currentUser?.id]);

  // Link aus den Turnierdetails: nur diesen Platz in Liste und Karte anzeigen.
  const [linkedPlaceId, setLinkedPlaceId] = useState(() => decodeURIComponent(window.location.hash.slice(1)));
  const [linkedOrganizationId, setLinkedOrganizationId] = useState(() => new URLSearchParams(window.location.search).get('verein') || '');
  const linkedPlaceRef = useRef(null);
  const linkedPlaceScrolledRef = useRef(false);

  function clearLinkedPlaceFilter() {
    setLinkedPlaceId('');
    setLinkedOrganizationId('');
    const params = new URLSearchParams(window.location.search);
    params.delete('verein');
    setFocusPlace(null);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
  }

  // Aus dem Kartenpopup: Liste/Karte wie bei einem geteilten Link auf diesen Verein bzw. Platz beschränken.
  function showOnlyPlace(place) {
    linkedPlaceScrolledRef.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete('verein');
    url.hash = '';
    if (hasClub(place)) {
      setLinkedPlaceId('');
      setLinkedOrganizationId(clubKey(place));
      url.searchParams.set('verein', clubKey(place));
    } else {
      setLinkedOrganizationId('');
      setLinkedPlaceId(place.id);
      url.hash = encodeURIComponent(place.id);
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  const visiblePlaces = useMemo(() => {
    let results = filterPlaces(places, { placeId: linkedPlaceId, organizationId: linkedOrganizationId, favoritesOnly, clubsOnly, indoorOnly });
    if (searchOrigin) {
      const radius = Number(searchRadiusKm);
      results = results
        .filter((place) => place.latitude !== null && place.longitude !== null)
        .map((place) => ({ ...place, distanceKm: distanceKm(searchOrigin.lat, searchOrigin.lng, place.latitude, place.longitude) }))
        .filter((place) => place.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }
    return results;
  }, [places, linkedPlaceId, linkedOrganizationId, favoritesOnly, clubsOnly, indoorOnly, searchOrigin, searchRadiusKm]);

  const mapped = useMemo(() => visiblePlaces.filter((place) => place.latitude !== null && place.longitude !== null), [visiblePlaces]);
  const center = mapped.length ? [mapped[0].latitude, mapped[0].longitude] : FALLBACK_CENTER;

  // Die Karte zeigt immer alle Treffer; nur die Liste folgt dem sichtbaren Ausschnitt.
  // Ohne Karte (keine Koordinaten) wären die Bounds veraltet, dann bleibt die Liste ungefiltert.
  const viewportFilterActive = viewportOnly && Boolean(mapBounds) && mapped.length > 0;
  const listPlaces = useMemo(() => (viewportFilterActive
    ? mapped.filter((place) => mapBounds.contains([place.latitude, place.longitude]))
    : visiblePlaces), [viewportFilterActive, mapped, mapBounds, visiblePlaces]);

  useEffect(() => {
    setVisibleCount(10);
  }, [query, linkedPlaceId, linkedOrganizationId, favoritesOnly, clubsOnly, indoorOnly, searchOrigin, searchRadiusKm, places, viewportOnly, mapBounds]);

  const placeGroups = useMemo(() => groupPlacesByOrganization(listPlaces), [listPlaces]);
  const displayedPlaceGroups = useMemo(() => placeGroups.slice(0, visibleCount), [placeGroups, visibleCount]);

  // „Details“ im Kartenpopup: Listeneintrag nachladen, aufklappen und hinscrollen.
  function showPlaceDetails(place) {
    const index = placeGroups.findIndex((group) => group.places.some((entry) => entry.id === place.id));
    if (index === -1) return;
    setVisibleCount((count) => Math.max(count, index + 1));
    setDetailsRequest({ id: place.id });
  }

  useEffect(() => {
    if (!detailsRequest || !detailsTargetRef.current) return;
    detailsTargetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [detailsRequest, displayedPlaceGroups]);

  useEffect(() => {
    if (!linkedPlaceId || loading) return;
    const place = places.find((entry) => entry.id === linkedPlaceId);
    if (place) handleFocusPlace(place, false);
  }, [linkedPlaceId, loading, places]);

  useEffect(() => {
    if ((!linkedPlaceId && !linkedOrganizationId) || loading || !linkedPlaceRef.current || linkedPlaceScrolledRef.current) return;
    linkedPlaceScrolledRef.current = true;
    linkedPlaceRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [linkedPlaceId, linkedOrganizationId, loading, displayedPlaceGroups]);

  async function toggleLike(place) {
    if (!currentUser) { navigate('/'); return; }
    try {
      const data = await authenticatedApi(`/api/places/${place.id}/like`, { method: 'POST' });
      setPlaces((current) => current.map((entry) => entry.id === place.id ? { ...entry, liked: data.liked, likeCount: data.likeCount } : entry));
    } catch (err) { setError(err.message); }
  }

  async function toggleFavorite(place) {
    if (!currentUser) { navigate('/'); return; }
    try {
      const data = await authenticatedApi(`/api/places/${place.id}/favorite`, { method: 'POST' });
      setPlaces((current) => current.map((entry) => entry.id === place.id ? { ...entry, favorited: data.favorited } : entry));
    } catch (err) { setError(err.message); }
  }

  function reportAddress(place) {
    if (!currentUser) { navigate('/'); return; }
    setCorrectionPlace(place);
  }

  function handleUseMyLocation() {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError(t('Geolocation wird von diesem Browser nicht unterstützt.'));
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSearchOrigin({ lat: position.coords.latitude, lng: position.coords.longitude, label: t('Mein Standort') });
        setSearchOriginQuery('');
        setGeoLoading(false);
      },
      (geoErr) => {
        setGeoError(
          geoErr.code === geoErr.PERMISSION_DENIED
            ? t('Standort-Zugriff wurde verweigert. Bitte erlaube den Zugriff in den Einstellungen deines Geräts unter Datenschutz > Ortungsdienste.')
            : t('Standort konnte nicht ermittelt werden.'),
        );
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function handleSearchOriginSubmit(event) {
    event.preventDefault();
    const trimmed = searchOriginQuery.trim();
    if (!trimmed) { setSearchOrigin(null); return; }
    setGeoError(''); setGeoLoading(true);
    try {
      const data = await api('/api/geocode', { method: 'POST', body: JSON.stringify({ query: trimmed }) });
      if (data.lat === null || data.lng === null) {
        setSearchOrigin(null);
        setGeoError(t('Kein Ort gefunden.'));
      } else {
        setSearchOrigin({ lat: data.lat, lng: data.lng, label: data.displayName || trimmed });
      }
    } catch (requestError) { setGeoError(requestError.message); } finally { setGeoLoading(false); }
  }

  function handleSearchOriginSelect(candidate) {
    setSearchOrigin({ lat: candidate.lat, lng: candidate.lng, label: candidate.displayName });
    setSearchOriginQuery('');
    setGeoError('');
  }

  function handleClearSearchOrigin() {
    setSearchOrigin(null);
    setSearchOriginQuery('');
    setGeoError('');
  }

  const radiusLabel = labelFor(RADIUS_OPTIONS, searchRadiusKm);
  const linkedPlaceLabel = places.find((place) => place.id === linkedPlaceId)?.name || linkedPlaceId;
  const linkedOrganizationLabel = places.find((place) => clubKey(place) === linkedOrganizationId)?.clubName || linkedOrganizationId;
  const activeFilterCount = [query, linkedPlaceId, linkedOrganizationId, favoritesOnly, clubsOnly, indoorOnly].filter(Boolean).length;

  return <main className="app-shell">
    <StandalonePageHeader
      heading={t('Boule-Plätze / Vereine')}
      language={language}
      setLanguage={setLanguage}
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      navigate={navigate}
      currentUser={currentUser}
      isAdmin={isAdmin}
      onSelectAdminDashboard={onSelectAdminDashboard}
      onLogout={onLogout}
      drawerContent={drawerContent}
      postboxControl={postboxControl}
      searchControl={
        <PlacesSearchMenu
          open={searchMenuOpen}
          onToggle={() => setSearchMenuOpen((open) => !open)}
          onClose={() => setSearchMenuOpen(false)}
          activeTab={searchTab}
          setActiveTab={setSearchTab}
          query={query}
          setQuery={setQuery}
          currentUser={currentUser}
          favoritesOnly={favoritesOnly}
          setFavoritesOnly={setFavoritesOnly}
          clubsOnly={clubsOnly}
          setClubsOnly={setClubsOnly}
          indoorOnly={indoorOnly}
          setIndoorOnly={setIndoorOnly}
          searchOrigin={searchOrigin}
          searchOriginQuery={searchOriginQuery}
          setSearchOriginQuery={setSearchOriginQuery}
          onSearchOriginSubmit={handleSearchOriginSubmit}
          onSearchOriginSelect={handleSearchOriginSelect}
          onUseMyLocation={handleUseMyLocation}
          onClearSearchOrigin={handleClearSearchOrigin}
          searchRadiusKm={searchRadiusKm}
          setSearchRadiusKm={setSearchRadiusKm}
          geoLoading={geoLoading}
          geoError={geoError}
        />
      }
    />
    <section className="home-tournaments">
      <div className="home-finder">
        <div className="home-finder-copy">
          <p className="eyebrow">Pétanque Turnier Manager Online</p>
          <h2>{t('Boule-Plätze / Vereine')}</h2>
          <p className="subtitle">{t('Finde Bouleplätze und Vereine in deiner Nähe.')}</p>
        </div>
        <div className="home-finder-stats" aria-label={t('Bouleplatzsuche Übersicht')}>
          <button
            type="button"
            onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            aria-label={`${visiblePlaces.length} ${t('gefundene Bouleplätze – zur Liste springen')}`}
          >
            <strong>{visiblePlaces.length}</strong>
            <span>{t('Gefundene Plätze')}</span>
          </button>
          <button type="button" onClick={() => { setSearchTab('filters'); setSearchMenuOpen(true); }} aria-label={`${activeFilterCount > 0 ? t('Filter aktiv') : t('Keine Filter aktiv')} ${t('– Filter öffnen')}`}>
            <strong>{activeFilterCount > 0 ? t('Filter aktiv') : t('Keine Filter aktiv')}</strong>
            <span>{t('Finder')}</span>
          </button>
          <button type="button" onClick={() => { setSearchTab('radius'); setSearchMenuOpen(true); }} aria-label={t('Umkreissuche öffnen')}>
            <strong>{searchOrigin ? <>{radiusLabel} {t('Umkreis')}</> : t('Umkreissuche aus')}</strong>
            <span>{searchOrigin ? <>{t('Ausgangspunkt:')} {searchOrigin.label}</> : t('Umkreis')}</span>
          </button>
        </div>
      </div>

      {(query || linkedPlaceId || linkedOrganizationId || favoritesOnly || clubsOnly || indoorOnly || searchOrigin) && <div className="active-search-badges" aria-label={t('Filter aktiv')}>
        {linkedOrganizationId && <button type="button" className="active-search-badge" onClick={clearLinkedPlaceFilter} aria-label={`${t('Entfernen')}: ${linkedOrganizationLabel}`}><span data-i18n-skip>{linkedOrganizationLabel}</span><span aria-hidden="true">×</span></button>}
        {linkedPlaceId && <button type="button" className="active-search-badge" onClick={clearLinkedPlaceFilter} aria-label={`${t('Entfernen')}: ${linkedPlaceLabel}`}><span data-i18n-skip>{linkedPlaceLabel}</span><span aria-hidden="true">×</span></button>}
        {query && <button type="button" className="active-search-badge" onClick={() => setQuery('')} aria-label={`${t('Entfernen')}: ${query}`}><span>{query}</span><span aria-hidden="true">×</span></button>}
        {favoritesOnly && <button type="button" className="active-search-badge" onClick={() => setFavoritesOnly(false)} aria-label={`${t('Entfernen')}: ${t('Nur meine Favoriten')}`}><span>{t('Nur meine Favoriten')}</span><span aria-hidden="true">×</span></button>}
        {clubsOnly && <button type="button" className="active-search-badge" onClick={() => setClubsOnly(false)} aria-label={`${t('Entfernen')}: ${t('Nur Vereine')}`}><span>{t('Nur Vereine')}</span><span aria-hidden="true">×</span></button>}
        {indoorOnly && <button type="button" className="active-search-badge" onClick={() => setIndoorOnly(false)} aria-label={`${t('Entfernen')}: ${t('Nur Boulehallen')}`}><span>{t('Nur Boulehallen')}</span><span aria-hidden="true">×</span></button>}
        {searchOrigin && <button type="button" className="active-search-badge" onClick={handleClearSearchOrigin} aria-label={`${t('Entfernen')}: ${radiusLabel} ${searchOrigin.label}`}><span>{radiusLabel} · {searchOrigin.label}</span><span aria-hidden="true">×</span></button>}
      </div>}

      <Feedback error={error} />
      {mapped.length > 0 && (
        <div className="panel places-map-panel" ref={mapSectionRef}>
          <PlacesMap
            places={mapped}
            center={center}
            maptilerApiKey={maptilerApiKey}
            focus={focusPlace}
            onBoundsChange={setMapBounds}
            onShowDetails={showPlaceDetails}
            onOnlyThis={showOnlyPlace}
          />
        </div>
      )}

      <div className="section-title home-results-title" ref={resultsRef}>
        <p className="eyebrow">{t('Alle passenden Bouleplätze')}</p>
        <span className="counter">{listPlaces.length}</span>
      </div>
      {mapped.length > 0 && (
        <label className="checkbox-field places-viewport-toggle">
          <input type="checkbox" checked={viewportOnly} onChange={(event) => setViewportOnly(event.target.checked)} />
          {t('Nur Plätze im Kartenausschnitt')}
        </label>
      )}

      {loading ? <p className="muted">{t('Lädt …')}</p> : listPlaces.length === 0 ? (
        <div className="empty-state">
          <strong>{visiblePlaces.length > 0 ? t('Keine Bouleplätze im Kartenausschnitt. Verschiebe oder verkleinere die Karte.') : t('Noch keine veröffentlichten Bouleplätze gefunden.')}</strong>
        </div>
      ) : (
        <div className="places-list">
          {displayedPlaceGroups.map((group) => group.clubName ? (
            <details className="panel place-group" key={group.id} ref={linkedOrganizationId && clubKey(group.places[0]) === linkedOrganizationId ? linkedPlaceRef : group.places.some((place) => place.id === detailsRequest?.id) ? detailsTargetRef : undefined} open={Boolean(linkedOrganizationId) || group.places.some((place) => place.id === linkedPlaceId || place.id === detailsRequest?.id) || undefined}>
              <summary className="place-group-summary">
                <span className="place-group-badge"><ClubBadge clubName={group.clubName} clubKind={group.clubKind} /></span>
                <span className="place-group-title">
                  {group.places[0].clubLogoUrl && (
                    <img
                      className="place-group-logo"
                      src={clubLogoImageUrl(group.places[0].id)}
                      alt=""
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <h2 data-i18n-skip>{group.clubName}</h2>
                </span>
                <span className="place-group-count">{group.places.length} {t(group.places.length === 1 ? 'Bouleplatz' : 'Bouleplätze')}</span>
              </summary>
              <div className="place-group-content">
                <OrganizationLinks
                  place={group.places[0]}
                  t={t}
                  onRequestTakeover={currentUser && !isAdmin && group.places[0].clubOwnedByAdmin && !group.places[0].canEdit ? setTakeoverPlace : null}
                />
                {group.clubDescription && <RichText value={group.clubDescription} onNavigate={navigate} />}
                <div className="place-group-places">
                  {group.places.map((place) => (
                    <PlaceDetails onNavigate={navigate} place={place} t={t} onFocus={handleFocusPlace} onToggleLike={toggleLike} onToggleFavorite={toggleFavorite} onReportAddress={reportAddress} heading="h3" forceOpen={place.id === linkedPlaceId || place.id === detailsRequest?.id} detailRef={place.id === linkedPlaceId ? linkedPlaceRef : undefined} key={place.id} />
                  ))}
                </div>
              </div>
            </details>
          ) : (
            <PlaceDetails onNavigate={navigate} place={group.places[0]} t={t} onFocus={handleFocusPlace} onToggleLike={toggleLike} onToggleFavorite={toggleFavorite} onReportAddress={reportAddress} forceOpen={group.places[0].id === linkedPlaceId || group.places[0].id === detailsRequest?.id} detailRef={group.places[0].id === linkedPlaceId ? linkedPlaceRef : group.places[0].id === detailsRequest?.id ? detailsTargetRef : undefined} key={group.id} />
          ))}
        </div>
      )}
      {correctionPlace && <AddressCorrectionDialog place={correctionPlace} onClose={() => setCorrectionPlace(null)} />}
      {takeoverPlace && <ClubTakeoverDialog place={takeoverPlace} onClose={() => setTakeoverPlace(null)} />}
      <InfiniteListLoadMore
        hasMore={placeGroups.length > visibleCount}
        onLoadMore={() => setVisibleCount((count) => count + 10)}
        label={t('Weitere Bouleplätze laden')}
      />
    </section>
  </main>;
}

function PlacesSearchMenu({
  open,
  onToggle,
  onClose,
  activeTab,
  setActiveTab,
  query,
  setQuery,
  currentUser,
  favoritesOnly,
  setFavoritesOnly,
  clubsOnly,
  setClubsOnly,
  indoorOnly,
  setIndoorOnly,
  searchOrigin,
  searchOriginQuery,
  setSearchOriginQuery,
  onSearchOriginSubmit,
  onSearchOriginSelect,
  onUseMyLocation,
  onClearSearchOrigin,
  searchRadiusKm,
  setSearchRadiusKm,
  geoLoading,
  geoError,
}) {
  const { t } = useTranslation();
  return (
    <div className="search-menu">
      <button
        className="search-menu-btn"
        type="button"
        aria-label={open ? t('Suche schließen') : t('Suche öffnen')}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="search-icon" aria-hidden="true" />
      </button>
      {open && (
        <>
          <div className="search-menu-backdrop" onClick={onClose} />
          <div className="search-menu-panel" role="search">
            <div className="section-title"><h2>{t('Suche')}</h2><CloseButton onClick={onClose} /></div>
            <div className="search-tabs" role="tablist" aria-label={t('Suche')}>
              <button type="button" role="tab" aria-selected={activeTab === 'filters'} className={activeTab === 'filters' ? 'active' : ''} onClick={() => setActiveTab('filters')}>{t('Filter')}</button>
              <button type="button" role="tab" aria-selected={activeTab === 'radius'} className={activeTab === 'radius' ? 'active' : ''} onClick={() => setActiveTab('radius')}>{t('Umkreissuche')}</button>
            </div>
            {activeTab === 'filters' ? <div className="filter-panel">
            <label className="home-search-field">
              {t('Nach Platz, Verein oder Ort suchen')}
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Nach Platz, Verein oder Ort suchen')} />
            </label>
            {currentUser && (
              <div className="home-search-actions">
                <label className="checkbox-field">
                  <input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />
                  {t('Nur meine Favoriten')}
                </label>
              </div>
            )}
            <div className="home-search-actions">
              <label className="checkbox-field">
                <input type="checkbox" checked={clubsOnly} onChange={(event) => setClubsOnly(event.target.checked)} />
                {t('Nur Vereine')}
              </label>
              <label className="checkbox-field">
                <input type="checkbox" checked={indoorOnly} onChange={(event) => setIndoorOnly(event.target.checked)} />
                {t('Nur Boulehallen')}
              </label>
            </div>
            </div> : <>
            <form className="home-radius-search" onSubmit={onSearchOriginSubmit}>
              <LocationAutocomplete
                label={t('Umkreissuche: Von diesem Ort aus suchen')}
                value={searchOriginQuery}
                onChange={setSearchOriginQuery}
                onSelect={onSearchOriginSelect}
                disabled={geoLoading}
              />
              <Button type="submit" variant="secondary" disabled={geoLoading} loading={geoLoading}>{t('Suchen')}</Button>
              <Button type="button" variant="secondary" onClick={onUseMyLocation} disabled={geoLoading} loading={geoLoading}>{t('Meinen Standort verwenden')}</Button>
              {searchOrigin && (
                <>
                  <SelectField label={t('Umkreis')} value={searchRadiusKm} onChange={setSearchRadiusKm} options={translatedOptions(RADIUS_OPTIONS)} />
                  <span className="search-origin-label">{t('Ausgangspunkt:')} {searchOrigin.label}</span>
                  <button className="link-button" type="button" onClick={onClearSearchOrigin}>{t('Umkreissuche beenden')}</button>
                </>
              )}
            </form>
            <Feedback error={geoError} />
            </>}
          </div>
        </>
      )}
    </div>
  );
}
