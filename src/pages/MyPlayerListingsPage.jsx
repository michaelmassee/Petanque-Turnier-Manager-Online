import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, authenticatedApi } from '../lib/api.js';
import { formatLocationAddress, isUpcoming } from '../lib/domain.js';
import { Feedback, Button, ListToolbar, EditDialog } from '../components/ui.jsx';
import { PlayerListingFields, applyTournamentToListingForm } from '../components/PlayerListingFields.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';
import { InfiniteListLoadMore, useInfiniteList } from '../components/InfiniteListLoadMore.jsx';

const EMPTY_LISTING_FORM = { type: 'tournament', title: '', description: '', playingPosition: 'egal', locationName: '', latitude: null, longitude: null, locationConfirmed: false, venueId: '', eventDate: '', tournamentId: '', deleteWhenTournamentFinished: true };

function listingToForm(listing) {
  return {
    type: listing.type, title: listing.title, description: listing.description || '', playingPosition: listing.playingPosition || 'egal',
    locationName: listing.locationName, latitude: listing.latitude, longitude: listing.longitude,
    locationConfirmed: true, venueId: '', eventDate: listing.eventDate || '', tournamentId: listing.tournamentId || '',
    deleteWhenTournamentFinished: listing.deleteWhenTournamentFinished !== false,
  };
}

function MyPlayerListingsPanel({ language, currentUser }) {
  const { t } = useTranslation();
  const isAdmin = currentUser?.role === 'admin';
  const [listings, setListings] = useState([]);
  const [venues, setVenues] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [tournamentsLoaded, setTournamentsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_LISTING_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const typeOptions = [
    { value: '', label: t('Alle Typen') },
    { value: 'tournament', label: t('Turnier') },
    { value: 'training', label: t('Training') },
  ];

  async function load() {
    setLoading(true);
    try {
      const data = await authenticatedApi(isAdmin ? '/api/admin/player-listings' : '/api/player-listings/mine');
      setListings(data.listings || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [isAdmin]);
  useEffect(() => { authenticatedApi('/api/places').then((data) => setVenues(data.places || [])).catch(() => {}); }, []);
  useEffect(() => {
    api('/api/tournaments')
      .then((data) => setTournaments((data.tournaments || []).filter((tournament) => tournament.visibility === 'public' && tournament.status !== 'draft' && isUpcoming(tournament))))
      .catch(() => {})
      .finally(() => setTournamentsLoaded(true));
  }, []);

  // Einstieg von der Turnierseite: /meine-anzeigen?turnier=<id> öffnet direkt
  // ein neues, mit diesem Turnier vorbelegtes Mitspielgesuch.
  const requestedTournamentHandled = useRef(false);
  useEffect(() => {
    if (!tournamentsLoaded || requestedTournamentHandled.current) return;
    requestedTournamentHandled.current = true;
    const requestedId = new URLSearchParams(window.location.search).get('turnier');
    if (!requestedId) return;
    const tournament = tournaments.find((entry) => entry.id === requestedId);
    setEditId(null);
    setForm(applyTournamentToListingForm(EMPTY_LISTING_FORM, tournament));
    setDialogOpen(true);
  }, [tournamentsLoaded, tournaments]);

  // Einstieg von der Turnierseite: /meine-anzeigen?bearbeiten=<id> öffnet
  // direkt den Bearbeiten-Dialog des eigenen Gesuchs.
  const requestedEditHandled = useRef(false);
  useEffect(() => {
    if (loading || requestedEditHandled.current) return;
    requestedEditHandled.current = true;
    const requestedId = new URLSearchParams(window.location.search).get('bearbeiten');
    const listing = requestedId && listings.find((entry) => entry.id === requestedId);
    if (listing) openEdit(listing);
  }, [loading, listings]);

  const filtered = useMemo(() => listings.filter((listing) => {
    if (typeFilter && listing.type !== typeFilter) return false;
    if (!query.trim()) return true;
    const term = query.trim().toLowerCase();
    return listing.title.toLowerCase().includes(term)
      || listing.locationName.toLowerCase().includes(term)
      || (listing.ownerName || '').toLowerCase().includes(term);
  }), [listings, query, typeFilter]);

  function resetFilters() {
    setQuery('');
    setTypeFilter('');
  }

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
        setMessage(t('Mitspielgesuch aktualisiert.'));
      } else {
        await authenticatedApi('/api/player-listings', { method: 'POST', body: JSON.stringify(form) });
        setMessage(t('Mitspielgesuch veröffentlicht.'));
      }
      setDialogOpen(false);
      await load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function remove(listing) {
    if (!window.confirm(`${t('Mitspielgesuch')} "${listing.title}" ${t('wirklich löschen?')}`)) return;
    setError('');
    setDeletingId(listing.id);
    try {
      await authenticatedApi(`/api/player-listings/${listing.id}`, { method: 'DELETE' });
      await load();
    } catch (err) { setError(err.message); } finally { setDeletingId(null); }
  }

  const filterActive = Boolean(query.trim()) || Boolean(typeFilter);
  const visibleListings = useInfiniteList(filtered);

  return (
    <div className="panel">
      <div className="section-title">
        <h2>{t('Meine Mitspielgesuche')}</h2>
        <span className="counter">{filterActive ? `${filtered.length}/${listings.length}` : listings.length}</span>
        <Button onClick={openCreate}>{t('Neues Mitspielgesuch')}</Button>
      </div>
      <Feedback message={message} />
      <Feedback error={error} />
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder={isAdmin ? t('Titel, Ort oder Ersteller suchen') : t('Titel oder Ort suchen')}
        filters={[{ label: t('Typ filtern'), value: typeFilter, onChange: setTypeFilter, options: typeOptions }]}
        onReset={resetFilters}
        resetDisabled={!filterActive}
      />
      {loading ? <p className="muted">{t('Lädt …')}</p> : filtered.length === 0 ? (
        <p className="muted">{listings.length === 0 ? t('Du hast noch kein Mitspielgesuch veröffentlicht.') : t('Keine Mitspielgesuche gefunden.')}</p>
      ) : (
        <div className="user-list">
          {visibleListings.items.map((listing) => (
            <article className="data-row" key={listing.id}>
              <div>
                <strong data-i18n-skip>{listing.title}</strong>
                <span data-i18n-skip>
                  {listing.type === 'tournament' ? t('Turnier') : t('Training')} · {t(listing.playingPosition === 'leger' ? 'Leger' : listing.playingPosition === 'milieu' ? 'Milieu' : listing.playingPosition === 'schiesser' ? 'Schießer' : 'Egal')} · {formatLocationAddress(listing.locationName)}
                  {listing.eventDate ? ` · ${listing.eventDate}` : ''}
                  {listing.tournamentName ? ` · ${t('Turnier')}: ${listing.tournamentName}` : ''}
                  {isAdmin && listing.ownerName ? ` · ${t('Ersteller:')} ${listing.ownerName}` : ''}
                </span>
              </div>
              <div className="row-actions">
                <Button variant="secondary" disabled={deletingId === listing.id} onClick={() => openEdit(listing)}>{t('Bearbeiten')}</Button>
                <Button variant="danger" loading={deletingId === listing.id} onClick={() => remove(listing)}>{t('Löschen')}</Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <InfiniteListLoadMore hasMore={visibleListings.hasMore} onLoadMore={visibleListings.loadMore} label={t('Weitere Mitspielgesuche laden')} />

      <EditDialog open={dialogOpen} title={editId ? t('Mitspielgesuch bearbeiten') : t('Mitspielgesuch erstellen')} error={error} onClose={() => setDialogOpen(false)}>
        <form className="form" onSubmit={submit}>
          <PlayerListingFields form={form} setForm={setForm} language={language} venues={venues} tournaments={tournaments} />
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setDialogOpen(false)}>{t('Abbrechen')}</Button>
            <Button type="submit" loading={saving}>{editId ? t('Speichern') : t('Veröffentlichen')}</Button>
          </div>
        </form>
      </EditDialog>
    </div>
  );
}

export function MyPlayerListingsPage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, isAdmin, onSelectAdminDashboard, onLogout, drawerContent, postboxControl }) {
  const { t } = useTranslation();
  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={t('Meine Mitspielgesuche')}
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
      />
      <section className="single-column">
        <MyPlayerListingsPanel language={language} currentUser={currentUser} />
      </section>
    </main>
  );
}

export default MyPlayerListingsPage;
