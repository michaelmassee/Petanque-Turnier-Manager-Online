import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button, TextField, TextArea, EditDialog } from '../components/ui.jsx';
import { RichTextEditor } from '../components/RichTextEditor.jsx';
import { BoulePlaceFields } from '../components/BoulePlaceFields.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';

const EMPTY_CLUB_FORM = { name: '', description: '', websiteUrl: '', logoUrl: '', contactName: '', contactEmail: '', contactPhone: '' };
const EMPTY_PLACE_FORM = { name: '', address: '', latitude: null, longitude: null, locationConfirmed: false, courtCount: '', description: '', accessible: false, facilities: '', separateFromClub: false };

function statusLabel(status, t) {
  if (status === 'published') return t('Veröffentlicht');
  if (status === 'rejected') return t('Abgelehnt');
  return t('In Prüfung');
}

function placeToForm(place) {
  return {
    name: place.name, address: place.address, latitude: place.latitude, longitude: place.longitude, locationConfirmed: true,
    courtCount: String(place.courtCount ?? ''), description: place.description || '', accessible: Boolean(place.accessible), facilities: place.facilities || '', separateFromClub: Boolean(place.separateFromClub),
  };
}

function clubToForm(club) {
  return {
    name: club.name, description: club.description || '', websiteUrl: club.websiteUrl || '', logoUrl: club.logoUrl || '',
    contactName: club.contactName || '', contactEmail: club.contactEmail || '', contactPhone: club.contactPhone || '',
  };
}

function MyClubsPanel({ language }) {
  const { t } = useTranslation();
  const [clubs, setClubs] = useState([]);
  const [clubPlaces, setClubPlaces] = useState({});
  const [myPlaces, setMyPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [clubDialogOpen, setClubDialogOpen] = useState(false);
  const [editClubId, setEditClubId] = useState(null);
  const [clubForm, setClubForm] = useState(EMPTY_CLUB_FORM);
  const [clubSaving, setClubSaving] = useState(false);
  const [invalidClubField, setInvalidClubField] = useState(null);
  const [deletingClubId, setDeletingClubId] = useState(null);
  const [placeDialogOpen, setPlaceDialogOpen] = useState(false);
  const [placeClubId, setPlaceClubId] = useState(null);
  const [editPlaceId, setEditPlaceId] = useState(null);
  const [placeForm, setPlaceForm] = useState(EMPTY_PLACE_FORM);
  const [placeSaving, setPlaceSaving] = useState(false);
  const [deletingPlaceId, setDeletingPlaceId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [clubsData, placesData] = await Promise.all([
        authenticatedApi('/api/clubs/mine'),
        authenticatedApi('/api/places/mine'),
      ]);
      const clubList = clubsData.clubs || [];
      setClubs(clubList);
      setMyPlaces(placesData.places || []);
      const detailEntries = await Promise.all(
        clubList.map((club) => authenticatedApi(`/api/clubs/${club.id}`).then((data) => [club.id, data.places || []])),
      );
      setClubPlaces(Object.fromEntries(detailEntries));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function removeClub(club) {
    if (!window.confirm(`${t('Verein')} "${club.name}" ${t('wirklich löschen?')}`)) return;
    setError(''); setMessage('');
    setDeletingClubId(club.id);
    try {
      await authenticatedApi(`/api/clubs/${club.id}`, { method: 'DELETE' });
      await load();
    } catch (err) { setError(err.message); } finally { setDeletingClubId(null); }
  }

  async function removePlace(place) {
    const placeLabel = place.clubId ? t('Vereins-Spielfläche') : t('Bouleplatz');
    if (!window.confirm(`${placeLabel} "${place.name}" ${t('wirklich löschen?')}`)) return;
    setError(''); setMessage('');
    setDeletingPlaceId(place.id);
    try {
      await authenticatedApi(`/api/places/${place.id}`, { method: 'DELETE' });
      await load();
    } catch (err) { setError(err.message); } finally { setDeletingPlaceId(null); }
  }

  function openCreateClub() {
    setEditClubId(null);
    setClubForm(EMPTY_CLUB_FORM);
    setInvalidClubField(null);
    setClubDialogOpen(true);
  }

  function openEditClub(club) {
    setEditClubId(club.id);
    setClubForm(clubToForm(club));
    setInvalidClubField(null);
    setClubDialogOpen(true);
  }

  async function submitClub(event) {
    event.preventDefault();
    setError(''); setMessage(''); setInvalidClubField(null); setClubSaving(true);
    try {
      if (editClubId) {
        await authenticatedApi(`/api/clubs/${editClubId}`, { method: 'PUT', body: JSON.stringify(clubForm) });
        setMessage(t('Verein aktualisiert. Ein Admin prüft die Änderung.'));
      } else {
        await authenticatedApi('/api/clubs', { method: 'POST', body: JSON.stringify(clubForm) });
        setMessage(t('Verein eingereicht. Ein Admin muss ihn noch freigeben.'));
      }
      setClubDialogOpen(false);
      setClubForm(EMPTY_CLUB_FORM);
      await load();
    } catch (err) {
      setError(err.message);
      setInvalidClubField(err.payload?.details?.field || null);
    } finally { setClubSaving(false); }
  }

  function openCreatePlace(club) {
    setEditPlaceId(null);
    setPlaceClubId(club.id);
    setPlaceForm(EMPTY_PLACE_FORM);
    setPlaceDialogOpen(true);
  }

  function openEditPlace(place) {
    setEditPlaceId(place.id);
    setPlaceClubId(place.clubId || null);
    setPlaceForm(placeToForm(place));
    setPlaceDialogOpen(true);
  }

  async function submitPlace(event) {
    event.preventDefault();
    setError(''); setMessage(''); setPlaceSaving(true);
    try {
      const body = JSON.stringify({ ...placeForm, courtCount: placeForm.courtCount === '' ? 0 : Number(placeForm.courtCount) });
      if (editPlaceId) {
        await authenticatedApi(`/api/places/${editPlaceId}`, { method: 'PUT', body });
        setMessage(placeClubId ? t('Vereins-Spielfläche aktualisiert. Ein Admin prüft die Änderung.') : t('Bouleplatz aktualisiert. Ein Admin prüft die Änderung.'));
      } else {
        await authenticatedApi(`/api/clubs/${placeClubId}/places`, { method: 'POST', body });
        setMessage(t('Vereins-Spielfläche eingereicht. Ein Admin muss sie noch freigeben.'));
      }
      setPlaceDialogOpen(false);
      await load();
    } catch (err) { setError(err.message); } finally { setPlaceSaving(false); }
  }

  return (
    <>
      <div className="panel">
        <div className="section-title">
          <h2>{t('Meine Vereine mit ihren Spielflächen')}</h2>
          <Button onClick={openCreateClub}>{t('Verein anlegen')}</Button>
        </div>
        {message && <p className="feedback success">{message}</p>}
        {error && <p className="feedback error">{error}</p>}
        {loading ? <p className="muted">{t('Lädt …')}</p> : clubs.length === 0 ? (
          <p className="muted">{t('Du verwaltest noch keinen Verein.')}</p>
        ) : (
          <div className="user-list">
            {clubs.map((club) => (
              <div key={club.id}>
                <article className="data-row">
                  <div>
                    <strong data-i18n-skip>{club.name}</strong>
                    <span className={club.status === 'published' ? 'status registration-confirmed' : 'status registration-pending'}>
                      {statusLabel(club.status, t)}
                    </span>
                  </div>
                  <div className="row-actions">
                    <Button variant="secondary" onClick={() => openCreatePlace(club)}>
                      {t('Vereins-Spielfläche für diesen Verein hinzufügen')}
                    </Button>
                    {club.canEdit && <Button variant="secondary" disabled={Boolean(deletingClubId)} onClick={() => openEditClub(club)}>{t('Bearbeiten')}</Button>}
                    {club.canEdit && <Button variant="danger" loading={deletingClubId === club.id} onClick={() => removeClub(club)}>{t('Löschen')}</Button>}
                  </div>
                </article>
                {(clubPlaces[club.id] || []).length > 0 && (
                  <div className="user-list club-places-list">
                    <h3>{t('Vereins-Spielflächen dieses Vereins')}</h3>
                    {clubPlaces[club.id].map((place) => (
                      <article className="data-row" key={place.id}>
                        <div>
                          <strong data-i18n-skip>{place.name}</strong>
                          <span data-i18n-skip className={place.status === 'published' ? 'status registration-confirmed' : 'status registration-pending'}>
                            {statusLabel(place.status, t)} · {place.address}
                          </span>
                        </div>
                        <div className="row-actions">
                          <Button variant="secondary" disabled={Boolean(deletingPlaceId)} onClick={() => openEditPlace(place)}>{t('Bearbeiten')}</Button>
                          <Button variant="danger" loading={deletingPlaceId === place.id} onClick={() => removePlace(place)}>{t('Löschen')}</Button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!loading && myPlaces.length > 0 && (
        <div className="panel">
          <div className="section-title">
            <h2>{t('Meine gemeldeten Bouleplätze')}</h2>
          </div>
          <div className="user-list">
            {myPlaces.map((place) => (
              <article className="data-row" key={place.id}>
                <div>
                  <strong data-i18n-skip>{place.name}</strong>
                  <span data-i18n-skip className={place.status === 'published' ? 'status registration-confirmed' : 'status registration-pending'}>
                    {statusLabel(place.status, t)} · {place.address}
                  </span>
                </div>
                <div className="row-actions">
                  <Button variant="secondary" disabled={Boolean(deletingPlaceId)} onClick={() => openEditPlace(place)}>
                    {t('Bearbeiten')}
                  </Button>
                  <Button variant="danger" loading={deletingPlaceId === place.id} onClick={() => removePlace(place)}>
                    {t('Löschen')}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      <EditDialog open={clubDialogOpen} title={editClubId ? t('Verein bearbeiten') : t('Verein anlegen')} error={error} onClose={() => setClubDialogOpen(false)}>
        <form className="form" onSubmit={submitClub}>
          <TextField label={t('Name')} value={clubForm.name} onChange={(name) => setClubForm({ ...clubForm, name })} required minLength={2} invalid={invalidClubField === 'name'} />
          <RichTextEditor
            label={t('Beschreibung')}
            value={clubForm.description}
            onChange={(description) => setClubForm({ ...clubForm, description })}
            boldLabel={t('Fett')}
            italicLabel={t('Kursiv')}
            underlineLabel={t('Unterstrichen')}
            strikeLabel={t('Durchgestrichen')}
            bulletListLabel={t('Aufzählung')}
            orderedListLabel={t('Nummerierte Liste')}
            headingLabel={t('Überschrift')}
          />
          <TextField label={t('Website')} value={clubForm.websiteUrl} onChange={(websiteUrl) => setClubForm({ ...clubForm, websiteUrl })} invalid={invalidClubField === 'websiteUrl'} />
          <TextField label={t('Logo-Bildlink')} type="url" placeholder="https://…" value={clubForm.logoUrl} onChange={(logoUrl) => setClubForm({ ...clubForm, logoUrl })} invalid={invalidClubField === 'logoUrl'} />
          <TextField label={t('Kontaktperson')} value={clubForm.contactName} onChange={(contactName) => setClubForm({ ...clubForm, contactName })} required minLength={2} invalid={invalidClubField === 'contactName'} />
          <TextField label={t('Kontakt-E-Mail')} type="email" value={clubForm.contactEmail} onChange={(contactEmail) => setClubForm({ ...clubForm, contactEmail })} required invalid={invalidClubField === 'contactEmail'} />
          <TextField label={t('Kontakt-Telefon')} value={clubForm.contactPhone} onChange={(contactPhone) => setClubForm({ ...clubForm, contactPhone })} />
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setClubDialogOpen(false)}>{t('Abbrechen')}</Button>
            <Button type="submit" loading={clubSaving}>{editClubId ? t('Speichern') : t('Anlegen')}</Button>
          </div>
        </form>
      </EditDialog>

      <EditDialog open={placeDialogOpen} title={editPlaceId ? (placeClubId ? t('Vereins-Spielfläche bearbeiten') : t('Bouleplatz bearbeiten')) : t('Vereins-Spielfläche für diesen Verein hinzufügen')} error={error} onClose={() => setPlaceDialogOpen(false)}>
        <form className="form" onSubmit={submitPlace}>
          <BoulePlaceFields form={placeForm} setForm={setPlaceForm} language={language} isClubPlayingArea={Boolean(placeClubId)} />
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setPlaceDialogOpen(false)}>{t('Abbrechen')}</Button>
            <Button type="submit" loading={placeSaving}>{editPlaceId ? t('Speichern') : t('Anlegen')}</Button>
          </div>
        </form>
      </EditDialog>
    </>
  );
}

export function MyClubsPage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, isAdmin, onSelectAdminDashboard, onLogout, drawerContent, postboxControl }) {
  const { t } = useTranslation();
  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={t('Meine Vereine mit ihren Spielflächen')}
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
        <MyClubsPanel language={language} />
      </section>
    </main>
  );
}

export default MyClubsPage;
