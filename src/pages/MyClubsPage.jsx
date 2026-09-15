import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button, TextField, TextArea, EditDialog } from '../components/ui.jsx';
import { BoulePlaceFields } from '../components/BoulePlaceFields.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';

const EMPTY_CLUB_FORM = { name: '', description: '', websiteUrl: '', contactName: '', contactEmail: '', contactPhone: '' };
const EMPTY_PLACE_FORM = { name: '', address: '', latitude: null, longitude: null, locationConfirmed: false, courtCount: '', description: '', accessible: false, facilities: '' };

function statusLabel(status, t) {
  if (status === 'published') return t('Veröffentlicht');
  if (status === 'rejected') return t('Abgelehnt');
  return t('In Prüfung');
}

function placeToForm(place) {
  return {
    name: place.name, address: place.address, latitude: place.latitude, longitude: place.longitude, locationConfirmed: true,
    courtCount: String(place.courtCount ?? ''), description: place.description || '', accessible: Boolean(place.accessible), facilities: place.facilities || '',
  };
}

function MyClubsPanel({ language }) {
  const { t } = useTranslation();
  const [clubs, setClubs] = useState([]);
  const [myPlaces, setMyPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [clubDialogOpen, setClubDialogOpen] = useState(false);
  const [clubForm, setClubForm] = useState(EMPTY_CLUB_FORM);
  const [clubSaving, setClubSaving] = useState(false);
  const [placeDialogClubId, setPlaceDialogClubId] = useState(null);
  const [placeForm, setPlaceForm] = useState(EMPTY_PLACE_FORM);
  const [placeSaving, setPlaceSaving] = useState(false);
  const [editPlaceId, setEditPlaceId] = useState(null);
  const [editPlaceForm, setEditPlaceForm] = useState(EMPTY_PLACE_FORM);
  const [editPlaceSaving, setEditPlaceSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [clubsData, placesData] = await Promise.all([
        authenticatedApi('/api/clubs/mine'),
        authenticatedApi('/api/places/mine'),
      ]);
      setClubs(clubsData.clubs || []);
      setMyPlaces(placesData.places || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function submitClub(event) {
    event.preventDefault();
    setError(''); setMessage(''); setClubSaving(true);
    try {
      await authenticatedApi('/api/clubs', { method: 'POST', body: JSON.stringify(clubForm) });
      setClubDialogOpen(false);
      setClubForm(EMPTY_CLUB_FORM);
      setMessage(t('Verein eingereicht. Ein Admin muss ihn noch freigeben.'));
      await load();
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

  async function submitEditPlace(event) {
    event.preventDefault();
    setError(''); setMessage(''); setEditPlaceSaving(true);
    try {
      await authenticatedApi(`/api/places/${editPlaceId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...editPlaceForm, courtCount: editPlaceForm.courtCount === '' ? 0 : Number(editPlaceForm.courtCount) }),
      });
      setEditPlaceId(null);
      setMessage(t('Bouleplatz aktualisiert. Ein Admin prüft die Änderung.'));
      await load();
    } catch (err) { setError(err.message); } finally { setEditPlaceSaving(false); }
  }

  return (
    <>
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
                  <Button variant="secondary" onClick={() => { setEditPlaceId(place.id); setEditPlaceForm(placeToForm(place)); }}>
                    {t('Bearbeiten')}
                  </Button>
                </div>
              </article>
            ))}
          </div>
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
          <BoulePlaceFields form={placeForm} setForm={setPlaceForm} language={language} />
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setPlaceDialogClubId(null)}>{t('Abbrechen')}</Button>
            <Button type="submit" loading={placeSaving}>{t('Anlegen')}</Button>
          </div>
        </form>
      </EditDialog>

      <EditDialog open={Boolean(editPlaceId)} title={t('Bouleplatz bearbeiten')} onClose={() => setEditPlaceId(null)}>
        <form className="form" onSubmit={submitEditPlace}>
          <BoulePlaceFields form={editPlaceForm} setForm={setEditPlaceForm} language={language} />
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setEditPlaceId(null)}>{t('Abbrechen')}</Button>
            <Button type="submit" loading={editPlaceSaving}>{t('Speichern')}</Button>
          </div>
        </form>
      </EditDialog>
    </>
  );
}

export function MyClubsPage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, onLogout }) {
  const { t } = useTranslation();
  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={t('Meine Vereine')}
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        currentUser={currentUser}
        onLogout={onLogout}
      />
      <section className="single-column">
        <MyClubsPanel language={language} />
      </section>
    </main>
  );
}

export default MyClubsPage;
