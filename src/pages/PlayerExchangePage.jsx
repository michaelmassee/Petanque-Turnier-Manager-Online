import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { useTranslation } from 'react-i18next';
import { api, authenticatedApi } from '../lib/api.js';
import { distanceKm, labelFor, translatedOptions } from '../lib/domain.js';
import { RADIUS_OPTIONS } from '../lib/constants.js';
import { Button, TextArea, SelectField, DistanceBadge, EditDialog } from '../components/ui.jsx';
import { LocationAutocomplete } from '../components/LocationAutocomplete.jsx';
import { RichText } from '../components/RichText.jsx';
import { InfiniteListLoadMore } from '../components/InfiniteListLoadMore.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';
import { TileFallbackMap, FitToBounds } from '../components/TileFallbackMap.jsx';

const FALLBACK_CENTER = [51.1, 10.4];
const marker = new L.Icon({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });
const TYPE_FILTER_OPTIONS = [{ value: '', label: 'Alle Typen' }, { value: 'tournament', label: 'Turnier' }, { value: 'training', label: 'Training' }];
const PLAYING_POSITION_FILTER_OPTIONS = [{ value: '', label: 'Alle Spielpositionen' }, { value: 'leger', label: 'Leger' }, { value: 'milieu', label: 'Milieu' }, { value: 'schiesser', label: 'Schießer' }, { value: 'egal', label: 'Egal' }];

function ContactDialog({ listing, onClose }) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError(''); setSending(true);
    try {
      await authenticatedApi('/api/postbox/messages', { method: 'POST', body: JSON.stringify({ recipientId: listing.userId, body }) });
      setSent(true);
    } catch (err) { setError(err.message); } finally { setSending(false); }
  }

  return (
    <EditDialog open title={`${t('Nachricht an')} ${listing.ownerName || ''}`} error={error} onClose={onClose}>
      {sent ? (
        <p className="feedback success">{t('Nachricht gesendet.')}</p>
      ) : (
        <form className="form" onSubmit={submit}>
          <TextArea label={t('Nachricht')} value={body} onChange={setBody} maxLength={250} />
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={onClose}>{t('Abbrechen')}</Button>
            <Button type="submit" disabled={!body.trim()} loading={sending}>{t('Senden')}</Button>
          </div>
        </form>
      )}
    </EditDialog>
  );
}

function PlayerExchangeSearchMenu({
  open,
  onToggle,
  onClose,
  query,
  setQuery,
  typeFilter,
  setTypeFilter,
  playingPositionFilter,
  setPlayingPositionFilter,
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
              {t('Nach Titel, Beschreibung oder Ort suchen')}
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Nach Titel, Beschreibung oder Ort suchen')} />
            </label>
            <SelectField label={t('Typ filtern')} value={typeFilter} onChange={setTypeFilter} options={TYPE_FILTER_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))} />
            <SelectField label={t('Spielposition filtern')} value={playingPositionFilter} onChange={setPlayingPositionFilter} options={PLAYING_POSITION_FILTER_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))} />

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

export default function PlayerExchangePage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, isAdmin, onSelectAdminDashboard, onLogout, maptilerApiKey, drawerContent, postboxControl }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [playingPositionFilter, setPlayingPositionFilter] = useState('');
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contactListing, setContactListing] = useState(null);
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
    try {
      const params = new URLSearchParams({ q: query, type: typeFilter, playingPosition: playingPositionFilter });
      const data = await api(`/api/player-listings?${params.toString()}`);
      setListings(data.listings || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer); }, [query, typeFilter, playingPositionFilter]);

  const visibleListings = useMemo(() => {
    let results = listings;
    if (searchOrigin) {
      const radius = Number(searchRadiusKm);
      results = results
        .map((listing) => ({ ...listing, distanceKm: distanceKm(searchOrigin.lat, searchOrigin.lng, listing.latitude, listing.longitude) }))
        .filter((listing) => listing.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }
    return results;
  }, [listings, searchOrigin, searchRadiusKm]);

  useEffect(() => {
    setVisibleCount(10);
  }, [query, typeFilter, playingPositionFilter, searchOrigin, searchRadiusKm, listings]);

  const displayedListings = visibleListings.slice(0, visibleCount);

  const mapped = useMemo(() => visibleListings.filter((listing) => listing.latitude !== null && listing.longitude !== null), [visibleListings]);
  const center = mapped.length ? [mapped[0].latitude, mapped[0].longitude] : FALLBACK_CENTER;

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
  const typeFilterLabel = typeFilter ? t(labelFor(TYPE_FILTER_OPTIONS, typeFilter)) : null;
  const playingPositionFilterLabel = playingPositionFilter ? t(labelFor(PLAYING_POSITION_FILTER_OPTIONS, playingPositionFilter)) : null;
  const activeFilterCount = [query, typeFilter, playingPositionFilter].filter(Boolean).length;

  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={t('Boule-Treff')}
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
          <PlayerExchangeSearchMenu
            open={searchMenuOpen}
            onToggle={() => setSearchMenuOpen((value) => !value)}
            onClose={() => setSearchMenuOpen(false)}
            query={query}
            setQuery={setQuery}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            playingPositionFilter={playingPositionFilter}
            setPlayingPositionFilter={setPlayingPositionFilter}
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
            <h2>{t('Boule-Treff')}</h2>
            <p className="subtitle">{t('Finde Spieler für Turniere oder regelmäßiges Training.')}</p>
          </div>
          <div className="home-finder-stats" aria-label={t('Boule-Treff Übersicht')}>
            <button
              type="button"
              onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              aria-label={`${visibleListings.length} ${t('gefundene Mitspielgesuche – zur Liste springen')}`}
            >
              <strong>{visibleListings.length}</strong>
              <span>{t('Gefundene Mitspielgesuche')}</span>
            </button>
            <button type="button" onClick={() => setSearchMenuOpen(true)} aria-label={`${activeFilterCount > 0 ? t('Filter aktiv') : t('Keine Filter aktiv')} ${t('– Filter öffnen')}`}>
              <strong>{activeFilterCount > 0 ? t('Filter aktiv') : t('Keine Filter aktiv')}</strong>
              <span>{playingPositionFilterLabel || typeFilterLabel || t('Finder')}</span>
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
            <TileFallbackMap center={center} maptilerApiKey={maptilerApiKey}>
              <FitToBounds positions={mapped.map((listing) => [listing.latitude, listing.longitude])} maxZoom={12} singleZoom={11} />
              {mapped.map((listing) => (
                <Marker key={listing.id} icon={marker} position={[listing.latitude, listing.longitude]}>
                  <Popup><strong>{listing.title}</strong><br />{listing.locationName}</Popup>
                </Marker>
              ))}
            </TileFallbackMap>
          </div>
        )}

        <div className="section-title home-results-title" ref={resultsRef}>
          <p className="eyebrow">{t('Alle passenden Mitspielgesuche')}</p>
          <span className="counter">{visibleListings.length}</span>
        </div>

        {loading ? <p className="muted">{t('Lädt …')}</p> : visibleListings.length === 0 ? (
          <div className="empty-state">
            <strong>{t('Keine Mitspielgesuche gefunden.')}</strong>
          </div>
        ) : (
          <div className="places-list">
            {displayedListings.map((listing) => (
              <article className="panel place-card" key={listing.id}>
                <div><h2 data-i18n-skip>{listing.title}</h2><p className="muted" data-i18n-skip>{listing.type === 'tournament' ? t('Turnier') : t('Training')} · {t(listing.playingPosition === 'leger' ? 'Leger' : listing.playingPosition === 'milieu' ? 'Milieu' : listing.playingPosition === 'schiesser' ? 'Schießer' : 'Egal')} · {listing.locationName}{listing.eventDate ? ` · ${listing.eventDate}` : ''}</p></div>
                {listing.description && <RichText value={listing.description} />}
                {listing.ownerName && <p className="muted">{t('Von')} {listing.ownerName}</p>}
                <DistanceBadge distanceKm={listing.distanceKm} />
                {currentUser && (
                  <div className="place-actions">
                    <Button onClick={() => setContactListing(listing)} disabled={listing.userId === currentUser.id}>{t('Nachricht senden')}</Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <InfiniteListLoadMore
          hasMore={visibleListings.length > visibleCount}
          onLoadMore={() => setVisibleCount((count) => count + 10)}
          label={t('Weitere Mitspielgesuche laden')}
        />

      </section>

      {contactListing && <ContactDialog listing={contactListing} onClose={() => setContactListing(null)} />}
    </main>
  );
}
