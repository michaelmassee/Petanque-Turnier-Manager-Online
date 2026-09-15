import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button } from '../components/ui.jsx';

export function ClubModerationPanel() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [requestsData, placesData] = await Promise.all([
        authenticatedApi('/api/admin/club-editor-requests'),
        authenticatedApi('/api/admin/pending-places'),
      ]);
      setRequests(requestsData.requests || []);
      setPlaces(placesData.places || []);
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
        </>
      )}
    </section>
  );
}

export default ClubModerationPanel;
