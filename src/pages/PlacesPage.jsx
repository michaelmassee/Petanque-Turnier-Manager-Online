import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { useTranslation } from 'react-i18next';
import { api, authenticatedApi } from '../lib/api.js';
import { googleMapsUrl, distanceKm, translatedOptions, labelFor } from '../lib/domain.js';
import { RADIUS_OPTIONS } from '../lib/constants.js';
import { Button, TextField, TextArea, SelectField, EditDialog } from '../components/ui.jsx';
import { LocationAutocomplete } from '../components/LocationAutocomplete.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';

const FALLBACK_CENTER = [51.1, 10.4];
const marker = new L.Icon({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });

function FitToMarkers({ places }) {
  const map = useMap();
  useEffect(() => {
    if (places.length === 0) return;
    if (places.length === 1) {
      map.setView([places[0].latitude, places[0].longitude], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(places.map((place) => [place.latitude, place.longitude])), { padding: [32, 32], maxZoom: 13 });
  }, [map, places]);
  return null;
}

const EMPTY_CLUB_FORM = { name: '', description: '', websiteUrl: '', contactName: '', contactEmail: '', contactPhone: '' };
const EMPTY_PLACE_FORM = { name: '', address: '', latitude: null, longitude: null, locationConfirmed: false, courtCount: '', description: '', accessible: false, facilities: '' };

export default function PlacesPage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, onLogout, maptilerApiKey }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const resultsRef = useRef(null);

  const [searchOrigin, setSearchOrigin] = useState(null);
  const [searchOriginQuery, setSearchOriginQuery] = useState('');
  const [searchRadiusKm, setSearchRadiusKm] = useState('25');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try { const data = await api(`/api/places?q=${encodeURIComponent(query)}`); setPlaces(data.places || []); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer); }, [query]);

  const visiblePlaces = useMemo(() => {
    let results = favoritesOnly ? places.filter((place) => place.favorited) : places;
    if (searchOrigin) {
      const radius = Number(searchRadiusKm);
      results = results
        .filter((place) => place.latitude !== null && place.longitude !== null)
        .map((place) => ({ ...place, distanceKm: distanceKm(searchOrigin.lat, searchOrigin.lng, place.latitude, place.longitude) }))
        .filter((place) => place.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }
    return results;
  }, [places, favoritesOnly, searchOrigin, searchRadiusKm]);

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
  const activeFilterCount = [query, favoritesOnly].filter(Boolean).length;

  return <main className="app-shell">
    <StandalonePageHeader
      heading={t('Boule-Plätze / Vereine')}
      language={language}
      setLanguage={setLanguage}
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      navigate={navigate}
      currentUser={currentUser}
      onLogout={onLogout}
      menuExtra={
        <button
          className="drawer-link"
          type="button"
          onClick={() => {
            setMenuOpen(false);
            navigate('/platz-melden');
          }}
        >
          {t('Bouleplatz melden')}
        </button>
      }
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
      {mapped.length > 0 && maptilerApiKey && (
        <div className="panel">
          <div className="places-map">
            <MapContainer center={center} zoom={7} scrollWheelZoom={false}>
              <TileLayer
                attribution={'&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>'}
                url={`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}{r}.png?key=${maptilerApiKey}`}
                maxZoom={20}
              />
              <FitToMarkers places={mapped} />
              {mapped.map((place) => (
                <Marker key={place.id} icon={marker} position={[place.latitude, place.longitude]}>
                  <Popup><strong>{place.name}</strong>{place.clubName && <><br />{place.clubName}</>}<br /><a href={googleMapsUrl(place)} target="_blank" rel="noreferrer">{t('Anfahrt')}</a></Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
      )}

      {currentUser && <MyClubsPanel language={language} />}

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
          {visiblePlaces.map((place) => (
            <article className="panel place-card" id={place.id} key={place.id}>
              <div><h2 data-i18n-skip>{place.name}</h2><p className="muted" data-i18n-skip>{place.clubName ? `${place.clubName} · ` : ''}{place.address}</p></div>
              {place.description && <p data-i18n-skip>{place.description}</p>}
              <p>{place.courtCount > 0 ? `${place.courtCount} ${t('Plätze')}` : t('Platzanzahl nicht angegeben')}{place.accessible ? ` · ${t('Barrierefrei')}` : ''}{place.facilities ? ` · ${place.facilities}` : ''}{typeof place.distanceKm === 'number' ? ` · ${place.distanceKm.toFixed(1)} km` : ''}</p>
              <div className="place-actions">
                <a className="button button-secondary" href={googleMapsUrl(place)} target="_blank" rel="noreferrer">{t('Anfahrt')}</a>
                <Button variant={place.liked ? 'primary' : 'secondary'} onClick={() => toggleLike(place)}>{place.liked ? '♥' : '♡'} {place.likeCount}</Button>
                <Button variant={place.favorited ? 'primary' : 'secondary'} onClick={() => toggleFavorite(place)}>{place.favorited ? '★' : '☆'} {t('Favorit')}</Button>
              </div>
            </article>
          ))}
        </div>
      )}
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

            <form className="home-radius-search" onSubmit={onSearchOriginSubmit}>
              <LocationAutocomplete
                label={t('Umkreissuche: Von diesem Ort aus suchen')}
                value={searchOriginQuery}
                onChange={setSearchOriginQuery}
                onSelect={onSearchOriginSelect}
                disabled={geoLoading}
              />
              <Button type="submit" variant="secondary" disabled={geoLoading}>{t('Suchen')}</Button>
              <Button type="button" variant="secondary" onClick={onUseMyLocation} disabled={geoLoading}>{t('Meinen Standort verwenden')}</Button>
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

function statusLabel(status, t) {
  if (status === 'published') return t('Veröffentlicht');
  if (status === 'rejected') return t('Abgelehnt');
  return t('In Prüfung');
}

function MyClubsPanel({ language }) {
  const { t } = useTranslation();
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [clubDialogOpen, setClubDialogOpen] = useState(false);
  const [clubForm, setClubForm] = useState(EMPTY_CLUB_FORM);
  const [clubSaving, setClubSaving] = useState(false);
  const [placeDialogClubId, setPlaceDialogClubId] = useState(null);
  const [placeForm, setPlaceForm] = useState(EMPTY_PLACE_FORM);
  const [placeSaving, setPlaceSaving] = useState(false);

  async function loadClubs() {
    setLoading(true);
    try { const data = await authenticatedApi('/api/clubs/mine'); setClubs(data.clubs || []); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { loadClubs(); }, []);

  async function submitClub(event) {
    event.preventDefault();
    setError(''); setMessage(''); setClubSaving(true);
    try {
      await authenticatedApi('/api/clubs', { method: 'POST', body: JSON.stringify(clubForm) });
      setClubDialogOpen(false);
      setClubForm(EMPTY_CLUB_FORM);
      setMessage(t('Verein eingereicht. Ein Admin muss ihn noch freigeben.'));
      await loadClubs();
    } catch (err) { setError(err.message); } finally { setClubSaving(false); }
  }

  async function submitPlace(event) {
    event.preventDefault();
    setError(''); setMessage(''); setPlaceSaving(true);
    try {
      await authenticatedApi(`/api/clubs/${placeDialogClubId}/places`, {
        method: 'POST',
        body: JSON.stringify({ ...placeForm, courtCount: placeForm.courtCount === '' ? 0 : Number(placeForm.courtCount) }),
      });
      setPlaceDialogClubId(null);
      setPlaceForm(EMPTY_PLACE_FORM);
      setMessage(t('Bouleplatz eingereicht. Ein Admin muss ihn noch freigeben.'));
    } catch (err) { setError(err.message); } finally { setPlaceSaving(false); }
  }

  return (
    <div className="panel">
      <div className="section-title">
        <h2>{t('Meine Vereine')}</h2>
        <Button onClick={() => setClubDialogOpen(true)}>{t('Verein anlegen')}</Button>
      </div>
      {message && <p className="feedback success">{message}</p>}
      {error && <p className="feedback error">{error}</p>}
      {loading ? <p className="muted">{t('Lädt …')}</p> : clubs.length === 0 ? (
        <p className="muted">{t('Du verwaltest noch keinen Verein.')}</p>
      ) : (
        <div className="user-list">
          {clubs.map((club) => (
            <article className="data-row" key={club.id}>
              <div>
                <strong data-i18n-skip>{club.name}</strong>
                <span className={club.status === 'published' ? 'status registration-confirmed' : 'status registration-pending'}>
                  {statusLabel(club.status, t)}
                </span>
              </div>
              <div className="row-actions">
                <Button variant="secondary" onClick={() => { setPlaceDialogClubId(club.id); setPlaceForm(EMPTY_PLACE_FORM); }}>
                  {t('Bouleplatz hinzufügen')}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <EditDialog open={clubDialogOpen} title={t('Verein anlegen')} onClose={() => setClubDialogOpen(false)}>
        <form className="form" onSubmit={submitClub}>
          <TextField label={t('Name')} value={clubForm.name} onChange={(name) => setClubForm({ ...clubForm, name })} required minLength={2} />
          <TextArea label={t('Beschreibung')} value={clubForm.description} onChange={(description) => setClubForm({ ...clubForm, description })} />
          <TextField label={t('Website')} value={clubForm.websiteUrl} onChange={(websiteUrl) => setClubForm({ ...clubForm, websiteUrl })} />
          <TextField label={t('Kontaktperson')} value={clubForm.contactName} onChange={(contactName) => setClubForm({ ...clubForm, contactName })} required minLength={2} />
          <TextField label={t('Kontakt-E-Mail')} type="email" value={clubForm.contactEmail} onChange={(contactEmail) => setClubForm({ ...clubForm, contactEmail })} required />
          <TextField label={t('Kontakt-Telefon')} value={clubForm.contactPhone} onChange={(contactPhone) => setClubForm({ ...clubForm, contactPhone })} />
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setClubDialogOpen(false)}>{t('Abbrechen')}</Button>
            <Button type="submit" loading={clubSaving}>{t('Anlegen')}</Button>
          </div>
        </form>
      </EditDialog>

      <EditDialog open={Boolean(placeDialogClubId)} title={t('Bouleplatz hinzufügen')} onClose={() => setPlaceDialogClubId(null)}>
        <form className="form" onSubmit={submitPlace}>
          <TextField label={t('Name')} value={placeForm.name} onChange={(name) => setPlaceForm({ ...placeForm, name })} required minLength={2} />
          <LocationAutocomplete
            label={t('Adresse')}
            value={placeForm.address}
            onChange={(address) => setPlaceForm({ ...placeForm, address, locationConfirmed: false })}
            onSelect={(candidate) => setPlaceForm({
              ...placeForm,
              address: candidate.displayName,
              latitude: candidate.lat,
              longitude: candidate.lng,
              locationConfirmed: true,
            })}
            confirmed={placeForm.locationConfirmed}
            required
            minLength={5}
            language={language}
          />
          <TextField label={t('Platzanzahl')} type="number" min={0} value={placeForm.courtCount} onChange={(courtCount) => setPlaceForm({ ...placeForm, courtCount })} />
          <TextArea label={t('Beschreibung')} value={placeForm.description} onChange={(description) => setPlaceForm({ ...placeForm, description })} />
          <TextField label={t('Ausstattung')} value={placeForm.facilities} onChange={(facilities) => setPlaceForm({ ...placeForm, facilities })} />
          <label className="checkbox-row">
            <input type="checkbox" checked={placeForm.accessible} onChange={(event) => setPlaceForm({ ...placeForm, accessible: event.target.checked })} />
            <span>{t('Barrierefrei')}</span>
          </label>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setPlaceDialogClubId(null)}>{t('Abbrechen')}</Button>
            <Button type="submit" loading={placeSaving}>{t('Anlegen')}</Button>
          </div>
        </form>
      </EditDialog>
    </div>
  );
}
