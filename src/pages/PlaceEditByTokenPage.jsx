import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { Button, Feedback } from '../components/ui.jsx';
import { BoulePlaceFields } from '../components/BoulePlaceFields.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';

const EMPTY_FORM = { name: '', address: '', latitude: null, longitude: null, locationConfirmed: false, courtCount: '', description: '', accessible: false, facilities: '' };

export function PlaceEditByTokenPage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, onLogout }) {
  const { t } = useTranslation();
  const [token] = useState(() => new URLSearchParams(window.location.search).get('edit_token') || '');
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    (async () => {
      try {
        const place = await api(`/api/place-reports/by-token/${encodeURIComponent(token)}`);
        setForm({
          name: place.name, address: place.address, latitude: null, longitude: null, locationConfirmed: true,
          courtCount: String(place.courtCount ?? ''), description: place.description || '', accessible: place.accessible, facilities: place.facilities || '',
        });
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage(''); setError(''); setSaving(true);
    try {
      await api(`/api/place-reports/by-token/${encodeURIComponent(token)}`, {
        method: 'PUT',
        body: JSON.stringify({ ...form, courtCount: form.courtCount === '' ? 0 : Number(form.courtCount) }),
      });
      setSaved(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={t('Bouleplatz bearbeiten')}
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
          {loading ? (
            <p className="muted">{t('Lädt …')}</p>
          ) : notFound ? (
            <Feedback error={t('Dieser Bearbeitungslink ist ungültig.')} />
          ) : saved ? (
            <Feedback message={t('Deine Änderungen wurden gespeichert. Ein Admin prüft sie kurz, bevor sie sichtbar werden.')} />
          ) : (
            <>
              <p className="subtitle">{t('Hier kannst du die Angaben zu deinem gemeldeten Bouleplatz jederzeit aktualisieren.')}</p>
              <form className="form dense" onSubmit={handleSubmit}>
                <BoulePlaceFields form={form} setForm={setForm} language={language} />
                <div className="dialog-actions">
                  <Button type="submit" loading={saving}>{t('Speichern')}</Button>
                </div>
              </form>
              <Feedback message={message} error={error} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default PlaceEditByTokenPage;
