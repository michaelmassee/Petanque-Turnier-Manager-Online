import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
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
import { PlayerListingFields } from '../components/PlayerListingFields.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';

const FALLBACK_CENTER = [51.1, 10.4];
const marker = new L.Icon({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });
const EMPTY_LISTING_FORM = { type: 'tournament', title: '', description: '', locationName: '', latitude: null, longitude: null, locationConfirmed: false, eventDate: '' };
const TYPE_FILTER_OPTIONS = [{ value: '', label: 'Alle Typen' }, { value: 'tournament', label: 'Turnier' }, { value: 'training', label: 'Training' }];

function listingToForm(listing) {
  return {
    type: listing.type, title: listing.title, description: listing.description || '',
    locationName: listing.locationName, latitude: listing.latitude, longitude: listing.longitude,
    locationConfirmed: true, eventDate: listing.eventDate || '',
  };
}

function FitToMarkers({ listings }) {
  const map = useMap();
  useEffect(() => {
    if (listings.length === 0) return;
    if (listings.length === 1) {
      map.setView([listings[0].latitude, listings[0].longitude], 11);
      return;
    }
    map.fitBounds(L.latLngBounds(listings.map((listing) => [listing.latitude, listing.longitude])), { padding: [32, 32], maxZoom: 12 });
  }, [map, listings]);
  return null;
}

function MyListingsPanel({ language, onChanged }) {
  const { t } = useTranslation();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_LISTING_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await authenticatedApi('/api/player-listings/mine');
      setListings(data.listings || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_LISTING_FORM);
    setDialogOpen(true);
  }

  function openEdit(listing) {
    setEditId(listing.id);
    setForm(listingToForm(listing));
    setDialogOpen(true);
  }

  async function submit(event) {
    event.preventDefault();
    setError(''); setMessage(''); setSaving(true);
    try {
      if (editId) {
        await authenticatedApi(`/api/player-listings/${editId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMessage(t('Anzeige aktualisiert.'));
      } else {
        await authenticatedApi('/api/player-listings', { method: 'POST', body: JSON.stringify(form) });
        setMessage(t('Anzeige veröffentlicht.'));
      }
      setDialogOpen(false);
      await load();
      onChanged?.();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function remove(listing) {
    if (!window.confirm(`${t('Anzeige')} "${listing.title}" ${t('wirklich löschen?')}`)) return;
    setError('');
    try {
      await authenticatedApi(`/api/player-listings/${listing.id}`, { method: 'DELETE' });
      await load();
      onChanged?.();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="panel">
      <div className="section-title">
        <h2>{t('Meine Anzeigen')}</h2>
        <Button onClick={openCreate}>{t('Anzeige erstellen')}</Button>
      </div>
      {message && <p className="feedback success">{message}</p>}
      {error && <p className="feedback error">{error}</p>}
      {loading ? <p className="muted">{t('Lädt …')}</p> : listings.length === 0 ? (
        <p className="muted">{t('Du hast noch keine Anzeige veröffentlicht.')}</p>
      ) : (
        <div className="user-list">
          {listings.map((listing) => (
            <article className="data-row" key={listing.id}>
              <div>
                <strong data-i18n-skip>{listing.title}</strong>
                <span data-i18n-skip>
                  {listing.type === 'tournament' ? t('Turnier') : t('Training')} · {listing.locationName}
                  {listing.eventDate ? ` · ${listing.eventDate}` : ''}
                </span>
              </div>
              <div className="row-actions">
                <Button variant="secondary" onClick={() => openEdit(listing)}>{t('Bearbeiten')}</Button>
                <Button variant="danger" onClick={() => remove(listing)}>{t('Löschen')}</Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <EditDialog open={dialogOpen} title={editId ? t('Anzeige bearbeiten') : t('Anzeige erstellen')} onClose={() => setDialogOpen(false)}>
        <form className="form" onSubmit={submit}>
          <PlayerListingFields form={form} setForm={setForm} language={language} />
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setDialogOpen(false)}>{t('Abbrechen')}</Button>
            <Button type="submit" loading={saving}>{editId ? t('Speichern') : t('Veröffentlichen')}</Button>
          </div>
        </form>
      </EditDialog>
    </div>
  );
}

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

export default function PlayerExchangePage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, onLogout, maptilerApiKey }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contactListing, setContactListing] = useState(null);

  const [searchOrigin, setSearchOrigin] = useState(null);
  const [searchOriginQuery, setSearchOriginQuery] = useState('');
  const [searchRadiusKm, setSearchRadiusKm] = useState('25');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ q: query, type: typeFilter });
      const data = await authenticatedApi(`/api/player-listings?${params.toString()}`);
      setListings(data.listings || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer); }, [query, typeFilter]);

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

  const center = visibleListings.length ? [visibleListings[0].latitude, visibleListings[0].longitude] : FALLBACK_CENTER;

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

  if (!currentUser) return null;

  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={t('Spielerbörse')}
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        currentUser={currentUser}
        onLogout={onLogout}
      />
      <section className="single-column">
        <div className="panel">
          <div className="section-title">
            <h2>{t('Spielerbörse')}</h2>
            <span className="counter">{visibleListings.length}</span>
          </div>
          <p className="muted">{t('Finde Spieler für Turniere oder regelmäßiges Training.')}</p>
          <label className="home-search-field">
            {t('Nach Titel, Beschreibung oder Ort suchen')}
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Nach Titel, Beschreibung oder Ort suchen')} />
          </label>
          <SelectField label={t('Typ filtern')} value={typeFilter} onChange={setTypeFilter} options={TYPE_FILTER_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))} />
          <form className="home-radius-search" onSubmit={handleSearchOriginSubmit}>
            <LocationAutocomplete
              label={t('Umkreissuche: Von diesem Ort aus suchen')}
              value={searchOriginQuery}
              onChange={setSearchOriginQuery}
              onSelect={handleSearchOriginSelect}
              disabled={geoLoading}
            />
            <Button type="submit" variant="secondary" disabled={geoLoading}>{t('Suchen')}</Button>
            <Button type="button" variant="secondary" onClick={handleUseMyLocation} disabled={geoLoading}>{t('Meinen Standort verwenden')}</Button>
            {searchOrigin && (
              <>
                <SelectField label={t('Umkreis')} value={searchRadiusKm} onChange={setSearchRadiusKm} options={translatedOptions(RADIUS_OPTIONS)} />
                <span className="search-origin-label">{t('Ausgangspunkt:')} {searchOrigin.label}</span>
                <button className="link-button" type="button" onClick={handleClearSearchOrigin}>{t('Umkreissuche beenden')}</button>
              </>
            )}
          </form>
          {geoError && <p className="feedback error">{geoError}</p>}
        </div>

        {error && <p className="feedback error">{error}</p>}

        {visibleListings.length > 0 && maptilerApiKey && (
          <div className="panel">
            <div className="places-map">
              <MapContainer center={center} zoom={7} scrollWheelZoom={false}>
                <TileLayer
                  attribution={'&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>'}
                  url={`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}{r}.png?key=${maptilerApiKey}`}
                  maxZoom={20}
                />
                <FitToMarkers listings={visibleListings} />
                {visibleListings.map((listing) => (
                  <Marker key={listing.id} icon={marker} position={[listing.latitude, listing.longitude]}>
                    <Popup><strong>{listing.title}</strong><br />{listing.locationName}</Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>
        )}

        {loading ? <p className="muted">{t('Lädt …')}</p> : visibleListings.length === 0 ? (
          <div className="empty-state">
            <strong>{t('Keine Anzeigen gefunden.')}</strong>
          </div>
        ) : (
          <div className="places-list">
            {visibleListings.map((listing) => (
              <article className="panel place-card" key={listing.id}>
                <div><h2 data-i18n-skip>{listing.title}</h2><p className="muted" data-i18n-skip>{listing.type === 'tournament' ? t('Turnier') : t('Training')} · {listing.locationName}{listing.eventDate ? ` · ${listing.eventDate}` : ''}</p></div>
                {listing.description && <p data-i18n-skip>{listing.description}</p>}
                <p className="muted">{t('Von')} {listing.ownerName}</p>
                <DistanceBadge distanceKm={listing.distanceKm} />
                <div className="place-actions">
                  <Button onClick={() => setContactListing(listing)} disabled={listing.userId === currentUser.id}>{t('Nachricht senden')}</Button>
                </div>
              </article>
            ))}
          </div>
        )}

        <MyListingsPanel language={language} onChanged={load} />
      </section>

      {contactListing && <ContactDialog listing={contactListing} onClose={() => setContactListing(null)} />}
    </main>
  );
}
