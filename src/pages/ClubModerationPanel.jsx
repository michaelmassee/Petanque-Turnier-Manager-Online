import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button, EditDialog, ListToolbar, SelectField, TextArea, TextField } from '../components/ui.jsx';
import { RichTextEditor } from '../components/RichTextEditor.jsx';
import { BoulePlaceFields } from '../components/BoulePlaceFields.jsx';
import { InfiniteListLoadMore, useInfiniteList } from '../components/InfiniteListLoadMore.jsx';

const EMPTY_PLACE_FORM = { name: '', address: '', latitude: null, longitude: null, locationConfirmed: false, courtCount: '', description: '', accessible: false, facilities: '' };
const EMPTY_CLUB_FORM = { name: '', description: '', websiteUrl: '', logoUrl: '', contactName: '', contactEmail: '', contactPhone: '' };

function placeToForm(place) {
  return {
    name: place.name, address: place.address, latitude: place.latitude, longitude: place.longitude, locationConfirmed: true,
    courtCount: String(place.courtCount ?? ''), description: place.description || '', accessible: Boolean(place.accessible), facilities: place.facilities || '',
  };
}

function clubToForm(club) {
  return {
    name: club.name, description: club.description || '', websiteUrl: club.websiteUrl || '', logoUrl: club.logoUrl || '',
    contactName: club.contactName || '', contactEmail: club.contactEmail || '', contactPhone: club.contactPhone || '',
  };
}

function statusLabel(status, t) {
  if (status === 'published') return t('Veröffentlicht');
  if (status === 'rejected') return t('Abgelehnt');
  return t('In Prüfung');
}

export function ClubModerationPanel({ language }) {
  const { t } = useTranslation();
  const [requests, setRequests] = useState([]);
  const [places, setPlaces] = useState([]);
  const [placeReports, setPlaceReports] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editPlaceId, setEditPlaceId] = useState(null);
  const [editPlaceForm, setEditPlaceForm] = useState(EMPTY_PLACE_FORM);
  const [editPlaceSaving, setEditPlaceSaving] = useState(false);
  const [editClub, setEditClub] = useState(null);
  const [editClubForm, setEditClubForm] = useState(EMPTY_CLUB_FORM);
  const [editClubSaving, setEditClubSaving] = useState(false);
  const [invalidClubField, setInvalidClubField] = useState(null);
  const [ownerDialogClub, setOwnerDialogClub] = useState(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [ownerError, setOwnerError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [requestsData, placesData, placeReportsData, clubsData, usersData] = await Promise.all([
        authenticatedApi('/api/admin/club-editor-requests'),
        authenticatedApi('/api/admin/pending-places'),
        authenticatedApi('/api/admin/place-reports'),
        authenticatedApi('/api/admin/clubs'),
        authenticatedApi('/api/users'),
      ]);
      setRequests(requestsData.requests || []);
      setPlaces(placesData.places || []);
      setPlaceReports(placeReportsData.places || []);
      setClubs(clubsData.clubs || []);
      setUsers(usersData.users || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openChangeOwner(club) {
    setOwnerDialogClub(club);
    setSelectedOwnerId('');
    setOwnerError('');
  }

  async function submitChangeOwner(event) {
    event.preventDefault();
    if (!selectedOwnerId) return;
    setOwnerSaving(true); setOwnerError('');
    try {
      await authenticatedApi(`/api/admin/clubs/${ownerDialogClub.id}/owner`, { method: 'PUT', body: JSON.stringify({ userId: selectedOwnerId }) });
      setOwnerDialogClub(null);
      setMessage(t('Owner geändert.'));
      await load();
    } catch (err) { setOwnerError(err.message); } finally { setOwnerSaving(false); }
  }

  async function setClubStatus(club, status) {
    setError(''); setMessage('');
    const id = `club-status-${club.id}`;
    setBusyId(id);
    try {
      await authenticatedApi(`/api/admin/clubs/${club.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      setMessage(t('Vereinsstatus aktualisiert.'));
      await load();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  }

  async function deleteClub(club) {
    if (!window.confirm(t('Verein „{name}“ wirklich löschen? Alle zugehörigen Bouleplätze werden mitgelöscht.').replace('{name}', club.name))) return;
    setError(''); setMessage('');
    const id = `club-delete-${club.id}`;
    setBusyId(id);
    try {
      await authenticatedApi(`/api/admin/clubs/${club.id}`, { method: 'DELETE' });
      setMessage(t('Verein gelöscht.'));
      await load();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  }

  async function approveRequest(request) {
    setError(''); setMessage('');
    const id = `approve-${request.club_id}-${request.user_id}`;
    setBusyId(id);
    try {
      await authenticatedApi(`/api/admin/clubs/${request.club_id}/editors/${request.user_id}`, { method: 'POST' });
      setMessage(t('Verein freigegeben.'));
      await load();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  }

  async function publishPlace(place) {
    setError(''); setMessage('');
    const id = `publish-${place.id}`;
    setBusyId(id);
    try {
      await authenticatedApi(`/api/admin/places/${place.id}/publish`, { method: 'POST' });
      setMessage(t('Bouleplatz freigegeben.'));
      await load();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  }

  const term = query.trim().toLowerCase();
  const filteredRequests = term
    ? requests.filter((r) => `${r.club_name} ${r.first_name} ${r.last_name} ${r.email}`.toLowerCase().includes(term))
    : requests;
  const filteredPlaces = term
    ? places.filter((p) => `${p.name} ${p.clubName} ${p.address}`.toLowerCase().includes(term))
    : places;
  const filteredPlaceReports = term
    ? placeReports.filter((p) => `${p.name} ${p.address}`.toLowerCase().includes(term))
    : placeReports;
  const filteredClubs = term
    ? clubs.filter((c) => `${c.name} ${c.ownerName} ${c.ownerEmail}`.toLowerCase().includes(term))
    : clubs;
  const visibleRequests = useInfiniteList(filteredRequests);
  const visiblePlaces = useInfiniteList(filteredPlaces);
  const visiblePlaceReports = useInfiniteList(filteredPlaceReports);
  const visibleClubs = useInfiniteList(filteredClubs);

  async function submitEditPlace(event) {
    event.preventDefault();
    setError(''); setMessage(''); setEditPlaceSaving(true);
    try {
      await authenticatedApi(`/api/places/${editPlaceId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...editPlaceForm, courtCount: editPlaceForm.courtCount === '' ? 0 : Number(editPlaceForm.courtCount) }),
      });
      setEditPlaceId(null);
      setMessage(t('Bouleplatz aktualisiert.'));
      await load();
    } catch (err) { setError(err.message); } finally { setEditPlaceSaving(false); }
  }

  function openEditClub(club) {
    setEditClub(club);
    setEditClubForm(clubToForm(club));
    setInvalidClubField(null);
  }

  async function submitEditClub(event) {
    event.preventDefault();
    setError(''); setMessage(''); setInvalidClubField(null); setEditClubSaving(true);
    try {
      await authenticatedApi(`/api/admin/clubs/${editClub.id}`, { method: 'PUT', body: JSON.stringify(editClubForm) });
      setEditClub(null);
      setMessage(t('Verein aktualisiert.'));
      await load();
    } catch (err) {
      setError(err.message);
      setInvalidClubField(err.payload?.details?.field || null);
    } finally { setEditClubSaving(false); }
  }

  return (
    <section className="user-management">
      <div className="user-management-header">
        <div>
          <h2>{t('Vereine & Bouleplätze')}</h2>
          <p className="muted">{t('Neue Vereine und Bouleplätze freigeben, bevor sie öffentlich sichtbar werden.')}</p>
        </div>
      </div>
      {message && <p className="feedback success">{message}</p>}
      {error && <p className="feedback error">{error}</p>}
      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder={t('Nach Verein, Bouleplatz oder Person suchen')}
        onReset={() => setQuery('')}
        resetDisabled={!query.trim()}
      />
      {loading ? <p className="muted">{t('Lädt …')}</p> : (
        <>
          <div className="panel user-list-panel">
            <div className="section-title">
              <h2>{t('Offene Vereinsanfragen')}</h2>
              <span className="counter">{filteredRequests.length}</span>
            </div>
            <div className="user-list">
              {filteredRequests.length === 0 && <p className="muted">{t('Keine offenen Vereinsanfragen.')}</p>}
              {visibleRequests.items.map((request) => {
                const id = `approve-${request.club_id}-${request.user_id}`;
                return (
                  <article className="data-row" key={id}>
                    <div>
                      <strong data-i18n-skip>{request.club_name}</strong>
                      <span data-i18n-skip>{request.first_name} {request.last_name} ({request.email})</span>
                    </div>
                    <div className="row-actions">
                      <Button loading={busyId === id} onClick={() => approveRequest(request)}>{t('Freigeben')}</Button>
                    </div>
                  </article>
                );
              })}
              <InfiniteListLoadMore hasMore={visibleRequests.hasMore} onLoadMore={visibleRequests.loadMore} label={t('Weitere Einträge laden')} />
            </div>
          </div>

          <div className="panel user-list-panel">
            <div className="section-title">
              <h2>{t('Offene Bouleplätze')}</h2>
              <span className="counter">{filteredPlaces.length}</span>
            </div>
            <div className="user-list">
              {filteredPlaces.length === 0 && <p className="muted">{t('Keine offenen Bouleplätze.')}</p>}
              {visiblePlaces.items.map((place) => {
                const id = `publish-${place.id}`;
                return (
                  <article className="data-row" key={place.id}>
                    <div>
                      <strong data-i18n-skip>{place.name}</strong>
                      <span data-i18n-skip>{place.clubName} · {place.address}</span>
                    </div>
                    <div className="row-actions">
                      <Button loading={busyId === id} onClick={() => publishPlace(place)}>{t('Freigeben')}</Button>
                    </div>
                  </article>
                );
              })}
              <InfiniteListLoadMore hasMore={visiblePlaces.hasMore} onLoadMore={visiblePlaces.loadMore} label={t('Weitere Einträge laden')} />
            </div>
          </div>

          <div className="panel user-list-panel">
            <div className="section-title">
              <h2>{t('Gemeldete Bouleplätze (ohne Verein)')}</h2>
              <span className="counter">{filteredPlaceReports.length}</span>
            </div>
            <div className="user-list">
              {filteredPlaceReports.length === 0 && <p className="muted">{t('Keine gemeldeten Bouleplätze.')}</p>}
              {visiblePlaceReports.items.map((place) => (
                <article className="data-row" key={place.id}>
                  <div>
                    <strong data-i18n-skip>{place.name}</strong>
                    <span data-i18n-skip className={place.status === 'published' ? 'status registration-confirmed' : 'status registration-pending'}>
                      {statusLabel(place.status, t)} · {place.address}
                    </span>
                  </div>
                  <div className="row-actions">
                    <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => { setEditPlaceId(place.id); setEditPlaceForm(placeToForm(place)); }}>
                      {t('Bearbeiten')}
                    </Button>
                  </div>
                </article>
              ))}
              <InfiniteListLoadMore hasMore={visiblePlaceReports.hasMore} onLoadMore={visiblePlaceReports.loadMore} label={t('Weitere Einträge laden')} />
            </div>
          </div>

          <div className="panel user-list-panel">
            <div className="section-title">
              <h2>{t('Alle Vereine')}</h2>
              <span className="counter">{filteredClubs.length}</span>
            </div>
            <div className="user-list">
              {filteredClubs.length === 0 && <p className="muted">{t('Keine Vereine vorhanden.')}</p>}
              {visibleClubs.items.map((club) => {
                const statusId = `club-status-${club.id}`;
                const deleteId = `club-delete-${club.id}`;
                return (
                  <article className="data-row" key={club.id}>
                    <div>
                      <strong data-i18n-skip>{club.name}</strong>
                      <span data-i18n-skip className={club.status === 'published' ? 'status registration-confirmed' : club.status === 'rejected' ? 'status registration-cancelled' : 'status registration-pending'}>
                        {statusLabel(club.status, t)} · {club.ownerName} ({club.ownerEmail})
                      </span>
                      <small data-i18n-skip>{t('{count} Bouleplätze').replace('{count}', club.placeCount)} · {t('{count} Bearbeiter').replace('{count}', club.editorCount)}</small>
                    </div>
                    <div className="row-actions">
                      {club.status !== 'published' && <Button loading={busyId === statusId} disabled={Boolean(busyId)} onClick={() => setClubStatus(club, 'published')}>{t('Freigeben')}</Button>}
                      {club.status !== 'rejected' && <Button variant="secondary" loading={busyId === statusId} disabled={Boolean(busyId)} onClick={() => setClubStatus(club, 'rejected')}>{t('Ablehnen')}</Button>}
                      <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => openEditClub(club)}>{t('Bearbeiten')}</Button>
                      <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => openChangeOwner(club)}>{t('Owner ändern')}</Button>
                      <Button variant="danger" loading={busyId === deleteId} disabled={Boolean(busyId)} onClick={() => deleteClub(club)}>{t('Löschen')}</Button>
                    </div>
                  </article>
                );
              })}
              <InfiniteListLoadMore hasMore={visibleClubs.hasMore} onLoadMore={visibleClubs.loadMore} label={t('Weitere Einträge laden')} />
            </div>
          </div>
        </>
      )}

      <EditDialog open={Boolean(editPlaceId)} title={t('Bouleplatz bearbeiten')} error={error} onClose={() => setEditPlaceId(null)}>
        <form className="form" onSubmit={submitEditPlace}>
          <BoulePlaceFields form={editPlaceForm} setForm={setEditPlaceForm} language={language} />
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setEditPlaceId(null)}>{t('Abbrechen')}</Button>
            <Button type="submit" loading={editPlaceSaving}>{t('Speichern')}</Button>
          </div>
        </form>
      </EditDialog>

      <EditDialog open={Boolean(editClub)} title={t('Verein bearbeiten')} error={error} onClose={() => setEditClub(null)}>
        {editClub && (
          <form className="form" onSubmit={submitEditClub}>
            <TextField label={t('Name')} value={editClubForm.name} onChange={(name) => setEditClubForm({ ...editClubForm, name })} required minLength={2} invalid={invalidClubField === 'name'} />
            <RichTextEditor
              label={t('Beschreibung')}
              value={editClubForm.description}
              onChange={(description) => setEditClubForm({ ...editClubForm, description })}
              boldLabel={t('Fett')}
              italicLabel={t('Kursiv')}
              underlineLabel={t('Unterstrichen')}
              strikeLabel={t('Durchgestrichen')}
              bulletListLabel={t('Aufzählung')}
              orderedListLabel={t('Nummerierte Liste')}
              headingLabel={t('Überschrift')}
            />
            <TextField label={t('Website')} value={editClubForm.websiteUrl} onChange={(websiteUrl) => setEditClubForm({ ...editClubForm, websiteUrl })} invalid={invalidClubField === 'websiteUrl'} />
            <TextField label={t('Logo-Bildlink')} type="url" placeholder="https://…" value={editClubForm.logoUrl} onChange={(logoUrl) => setEditClubForm({ ...editClubForm, logoUrl })} invalid={invalidClubField === 'logoUrl'} />
            <TextField label={t('Kontaktperson')} value={editClubForm.contactName} onChange={(contactName) => setEditClubForm({ ...editClubForm, contactName })} required minLength={2} invalid={invalidClubField === 'contactName'} />
            <TextField label={t('Kontakt-E-Mail')} type="email" value={editClubForm.contactEmail} onChange={(contactEmail) => setEditClubForm({ ...editClubForm, contactEmail })} required invalid={invalidClubField === 'contactEmail'} />
            <TextField label={t('Kontakt-Telefon')} value={editClubForm.contactPhone} onChange={(contactPhone) => setEditClubForm({ ...editClubForm, contactPhone })} />
            <div className="dialog-actions">
              <Button variant="secondary" type="button" onClick={() => setEditClub(null)}>{t('Abbrechen')}</Button>
              <Button type="submit" loading={editClubSaving}>{t('Speichern')}</Button>
            </div>
          </form>
        )}
      </EditDialog>

      <EditDialog open={Boolean(ownerDialogClub)} title={ownerDialogClub ? t('Owner ändern für {name}').replace('{name}', ownerDialogClub.name) : ''} onClose={() => setOwnerDialogClub(null)}>
        {ownerDialogClub && (
          <form className="form" onSubmit={submitChangeOwner}>
            {ownerError && <p className="feedback error">{ownerError}</p>}
            <p className="muted">
              {t('Aktueller Owner:')} <span data-i18n-skip>{ownerDialogClub.ownerName} ({ownerDialogClub.ownerEmail})</span>
            </p>
            <SelectField
              label={t('Owner wechseln')}
              value={selectedOwnerId}
              onChange={setSelectedOwnerId}
              options={[
                { value: '', label: t('Bitte wählen') },
                ...users.filter((u) => u.id !== ownerDialogClub.ownerId).map((u) => ({ value: u.id, label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email })),
              ]}
            />
            <div className="dialog-actions">
              <Button variant="secondary" type="button" onClick={() => setOwnerDialogClub(null)}>{t('Abbrechen')}</Button>
              <Button type="submit" disabled={!selectedOwnerId} loading={ownerSaving}>{t('Übernehmen')}</Button>
            </div>
          </form>
        )}
      </EditDialog>
    </section>
  );
}

export default ClubModerationPanel;
