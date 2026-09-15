import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button, EditDialog } from '../components/ui.jsx';
import { BoulePlaceFields } from '../components/BoulePlaceFields.jsx';

const EMPTY_PLACE_FORM = { name: '', address: '', latitude: null, longitude: null, locationConfirmed: false, courtCount: '', description: '', accessible: false, facilities: '' };

function placeToForm(place) {
  return {
    name: place.name, address: place.address, latitude: place.latitude, longitude: place.longitude, locationConfirmed: true,
    courtCount: String(place.courtCount ?? ''), description: place.description || '', accessible: Boolean(place.accessible), facilities: place.facilities || '',
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editPlaceId, setEditPlaceId] = useState(null);
  const [editPlaceForm, setEditPlaceForm] = useState(EMPTY_PLACE_FORM);
  const [editPlaceSaving, setEditPlaceSaving] = useState(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const [requestsData, placesData, placeReportsData] = await Promise.all([
        authenticatedApi('/api/admin/club-editor-requests'),
        authenticatedApi('/api/admin/pending-places'),
        authenticatedApi('/api/admin/place-reports'),
      ]);
      setRequests(requestsData.requests || []);
      setPlaces(placesData.places || []);
      setPlaceReports(placeReportsData.places || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function approveRequest(request) {
    setError(''); setMessage('');
    try {
      await authenticatedApi(`/api/admin/clubs/${request.club_id}/editors/${request.user_id}`, { method: 'POST' });
      setMessage(t('Verein freigegeben.'));
      await load();
    } catch (err) { setError(err.message); }
  }

  async function publishPlace(place) {
    setError(''); setMessage('');
    try {
      await authenticatedApi(`/api/admin/places/${place.id}/publish`, { method: 'POST' });
      setMessage(t('Bouleplatz freigegeben.'));
      await load();
    } catch (err) { setError(err.message); }
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
      setMessage(t('Bouleplatz aktualisiert.'));
      await load();
    } catch (err) { setError(err.message); } finally { setEditPlaceSaving(false); }
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
      {loading ? <p className="muted">{t('Lädt …')}</p> : (
        <>
          <div className="panel user-list-panel">
            <div className="section-title">
              <h2>{t('Offene Vereinsanfragen')}</h2>
              <span className="counter">{requests.length}</span>
            </div>
            <div className="user-list">
              {requests.length === 0 && <p className="muted">{t('Keine offenen Vereinsanfragen.')}</p>}
              {requests.map((request) => (
                <article className="data-row" key={`${request.club_id}-${request.user_id}`}>
                  <div>
                    <strong data-i18n-skip>{request.club_name}</strong>
                    <span data-i18n-skip>{request.first_name} {request.last_name} ({request.email})</span>
                  </div>
                  <div className="row-actions">
                    <Button onClick={() => approveRequest(request)}>{t('Freigeben')}</Button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="panel user-list-panel">
            <div className="section-title">
              <h2>{t('Offene Bouleplätze')}</h2>
              <span className="counter">{places.length}</span>
            </div>
            <div className="user-list">
              {places.length === 0 && <p className="muted">{t('Keine offenen Bouleplätze.')}</p>}
              {places.map((place) => (
                <article className="data-row" key={place.id}>
                  <div>
                    <strong data-i18n-skip>{place.name}</strong>
                    <span data-i18n-skip>{place.clubName} · {place.address}</span>
                  </div>
                  <div className="row-actions">
                    <Button onClick={() => publishPlace(place)}>{t('Freigeben')}</Button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="panel user-list-panel">
            <div className="section-title">
              <h2>{t('Gemeldete Bouleplätze (ohne Verein)')}</h2>
              <span className="counter">{placeReports.length}</span>
            </div>
            <div className="user-list">
              {placeReports.length === 0 && <p className="muted">{t('Keine gemeldeten Bouleplätze.')}</p>}
              {placeReports.map((place) => (
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
        </>
      )}

      <EditDialog open={Boolean(editPlaceId)} title={t('Bouleplatz bearbeiten')} onClose={() => setEditPlaceId(null)}>
        <form className="form" onSubmit={submitEditPlace}>
          <BoulePlaceFields form={editPlaceForm} setForm={setEditPlaceForm} language={language} />
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setEditPlaceId(null)}>{t('Abbrechen')}</Button>
            <Button type="submit" loading={editPlaceSaving}>{t('Speichern')}</Button>
          </div>
        </form>
      </EditDialog>
    </section>
  );
}

export default ClubModerationPanel;
