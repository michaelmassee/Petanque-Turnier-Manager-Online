import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { useTranslation } from 'react-i18next';
import { api, authenticatedApi } from '../lib/api.js';
import { clubLogoImageUrl, formatLocationAddress, googleMapsUrl, distanceKm, translatedOptions, labelFor } from '../lib/domain.js';
import { RADIUS_OPTIONS } from '../lib/constants.js';
import { Button, ClubBadge, DistanceBadge, SelectField } from '../components/ui.jsx';
import { LocationAutocomplete } from '../components/LocationAutocomplete.jsx';
import { RichText } from '../components/RichText.jsx';
import { InfiniteListLoadMore } from '../components/InfiniteListLoadMore.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';
import { TileFallbackMap, FitToBounds } from '../components/TileFallbackMap.jsx';

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

export function filterPlaces(places, { favoritesOnly = false, clubsOnly = false, indoorOnly = false } = {}) {
  return places.filter((place) => (!favoritesOnly || place.favorited)
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

function OrganizationLinks({ place, t }) {
  return <div className="place-actions">
    {place.clubWebsiteUrl && <a className="button button-secondary" href={place.clubWebsiteUrl} target="_blank" rel="noreferrer">{t('Website')}</a>}
    {place.clubSocialLinks?.facebook && <a className="button button-secondary" href={place.clubSocialLinks.facebook} target="_blank" rel="noreferrer">Facebook</a>}
    {place.clubSocialLinks?.instagram && <a className="button button-secondary" href={place.clubSocialLinks.instagram} target="_blank" rel="noreferrer">Instagram</a>}
    {place.clubSocialLinks?.x && <a className="button button-secondary" href={place.clubSocialLinks.x} target="_blank" rel="noreferrer">X</a>}
    {place.clubSocialLinks?.youtube && <a className="button button-secondary" href={place.clubSocialLinks.youtube} target="_blank" rel="noreferrer">YouTube</a>}
  </div>;
}

function PlaceDetails({ place, t, onToggleLike, onToggleFavorite, heading = 'h2' }) {
  const Heading = heading;
  return <details className="panel place-card place-card-details">
    <summary className="place-card-summary">
      <span className="place-card-summary-title">
        <Heading data-i18n-skip>{place.name}</Heading>
        <span className="muted">{t(place.venueType === 'indoor' ? 'Boulehalle' : 'Bouleplatz')}</span>
      </span>
      <span className="place-card-summary-facts">
        <span>{place.courtCount > 0 ? `${place.courtCount} ${t('Plätze')}` : t('Platzanzahl nicht angegeben')}</span>
        {place.accessible && <span>{t('Barrierefrei')}</span>}
        <DistanceBadge distanceKm={place.distanceKm} />
      </span>
    </summary>
    <div className="place-card-content">
      <p className="muted" data-i18n-skip>{formatLocationAddress(place.address)}</p>
      {place.description && <RichText value={place.description} />}
      {place.facilities && <p>{t('Ausstattung:')} {place.facilities}</p>}
      {place.facilityCodes?.length > 0 && <p className="muted">{place.facilityCodes.map((code) => t(facilityLabels[code])).join(' · ')}</p>}
      <div className="place-actions">
        <a className="button button-secondary" href={googleMapsUrl(place)} target="_blank" rel="noreferrer">{t('Anfahrt')}</a>
        <Button variant={place.liked ? 'primary' : 'secondary'} onClick={() => onToggleLike(place)}>{place.liked ? '♥' : '♡'} {place.likeCount}</Button>
        <Button variant={place.favorited ? 'primary' : 'secondary'} onClick={() => onToggleFavorite(place)}>{place.favorited ? '★' : '☆'} {t('Favorit')}</Button>
      </div>
    </div>
  </details>;
}

function PlacesMap({ places, center, maptilerApiKey }) {
  const { t } = useTranslation();
  const positions = useMemo(() => places.map((place) => [place.latitude, place.longitude]), [places]);
  const markerGroups = useMemo(() => groupMapPlaces(places), [places]);
  return (
    <TileFallbackMap center={center} maptilerApiKey={maptilerApiKey}>
      <FitToBounds positions={positions} />
      {markerGroups.map(({ id, place, places: groupedPlaces }) => (
        <Marker
          key={id}
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
            <a href={googleMapsUrl(place)} target="_blank" rel="noreferrer">{t('Anfahrt')}</a>
          </Popup>
        </Marker>
      ))}
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
  const resultsRef = useRef(null);

  const [searchOrigin, setSearchOrigin] = useState(null);
  const [searchOriginQuery, setSearchOriginQuery] = useState('');
  const [searchRadiusKm, setSearchRadiusKm] = useState('25');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);

  async function load() {
    setLoading(true); setError('');
    try { const data = await api(`/api/places?q=${encodeURIComponent(query)}`); setPlaces(data.places || []); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer); }, [query]);

  const visiblePlaces = useMemo(() => {
    let results = filterPlaces(places, { favoritesOnly, clubsOnly, indoorOnly });
    if (searchOrigin) {
      const radius = Number(searchRadiusKm);
      results = results
        .filter((place) => place.latitude !== null && place.longitude !== null)
        .map((place) => ({ ...place, distanceKm: distanceKm(searchOrigin.lat, searchOrigin.lng, place.latitude, place.longitude) }))
        .filter((place) => place.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }
    return results;
  }, [places, favoritesOnly, clubsOnly, indoorOnly, searchOrigin, searchRadiusKm]);

  useEffect(() => {
    setVisibleCount(10);
  }, [query, favoritesOnly, clubsOnly, indoorOnly, searchOrigin, searchRadiusKm, places]);

  const placeGroups = useMemo(() => groupPlacesByOrganization(visiblePlaces), [visiblePlaces]);
  const displayedPlaceGroups = placeGroups.slice(0, visibleCount);

  const mapped = useMemo(() => visiblePlaces.filter((place) => place.latitude !== null && place.longitude !== null), [visiblePlaces]);
  const center = mapped.length ? [mapped[0].latitude, mapped[0].longitude] : FALLBACK_CENTER;

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
  const activeFilterCount = [query, favoritesOnly, clubsOnly, indoorOnly].filter(Boolean).length;

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
          <button type="button" onClick={() => setSearchMenuOpen(true)} aria-label={`${activeFilterCount > 0 ? t('Filter aktiv') : t('Keine Filter aktiv')} ${t('– Filter öffnen')}`}>
            <strong>{activeFilterCount > 0 ? t('Filter aktiv') : t('Keine Filter aktiv')}</strong>
            <span>{t('Finder')}</span>
          </button>
          <button type="button" onClick={() => setSearchMenuOpen(true)} aria-label={t('Umkreissuche öffnen')}>
            <strong>{searchOrigin ? <>{radiusLabel} {t('Umkreis')}</> : t('Umkreissuche aus')}</strong>
            <span>{searchOrigin ? <>{t('Ausgangspunkt:')} {searchOrigin.label}</> : t('Umkreis')}</span>
          </button>
        </div>
      </div>

      {error && <p className="feedback error">{error}</p>}
      {mapped.length > 0 && (
        <div className="panel">
          <PlacesMap places={mapped} center={center} maptilerApiKey={maptilerApiKey} />
        </div>
      )}

      <div className="section-title home-results-title" ref={resultsRef}>
        <p className="eyebrow">{t('Alle passenden Bouleplätze')}</p>
        <span className="counter">{visiblePlaces.length}</span>
      </div>

      {loading ? <p className="muted">{t('Lädt …')}</p> : visiblePlaces.length === 0 ? (
        <div className="empty-state">
          <strong>{t('Noch keine veröffentlichten Bouleplätze gefunden.')}</strong>
        </div>
      ) : (
        <div className="places-list">
          {displayedPlaceGroups.map((group) => group.clubName ? (
            <details className="panel place-group" key={group.id}>
              <summary className="place-group-summary">
                <span className="place-group-title">
                  {group.places[0].clubLogoUrl && (
                    <img
                      className="place-group-logo"
                      src={clubLogoImageUrl(group.places[0].id)}
                      alt=""
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <ClubBadge clubName={group.clubName} clubKind={group.clubKind} />
                  <h2 data-i18n-skip>{group.clubName}</h2>
                </span>
                <span className="place-group-count">{group.places.length} {t(group.places.length === 1 ? 'Bouleplatz' : 'Bouleplätze')}</span>
              </summary>
              <div className="place-group-content">
                <OrganizationLinks place={group.places[0]} t={t} />
                {group.clubDescription && <RichText value={group.clubDescription} />}
                <div className="place-group-places">
                  {group.places.map((place) => (
                    <PlaceDetails place={place} t={t} onToggleLike={toggleLike} onToggleFavorite={toggleFavorite} heading="h3" key={place.id} />
                  ))}
                </div>
              </div>
            </details>
          ) : (
            <PlaceDetails place={group.places[0]} t={t} onToggleLike={toggleLike} onToggleFavorite={toggleFavorite} key={group.id} />
          ))}
        </div>
      )}
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
            {geoError && <p className="feedback error">{geoError}</p>}
          </div>
        </>
      )}
    </div>
  );
}
