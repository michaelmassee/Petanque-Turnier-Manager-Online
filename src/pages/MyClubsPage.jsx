import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button, TextField, TextArea, EditDialog } from '../components/ui.jsx';
import { LocationAutocomplete } from '../components/LocationAutocomplete.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';

const EMPTY_CLUB_FORM = { name: '', description: '', websiteUrl: '', contactName: '', contactEmail: '', contactPhone: '' };
const EMPTY_PLACE_FORM = { name: '', address: '', latitude: null, longitude: null, locationConfirmed: false, courtCount: '', description: '', accessible: false, facilities: '' };

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
