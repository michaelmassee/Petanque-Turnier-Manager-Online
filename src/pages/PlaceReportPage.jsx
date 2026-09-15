import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EMPTY_PLACE_REPORT_FORM } from '../lib/constants.js';
import { api } from '../lib/api.js';
import { RequiredMark, TextField, TextArea, Button, Feedback } from '../components/ui.jsx';
import { LocationAutocomplete } from '../components/LocationAutocomplete.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';

function PlaceReportForm({ form, setForm, onSubmit, navigate, language, turnstileSiteKey, saving }) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!turnstileSiteKey || document.querySelector('script[data-turnstile]')) {
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = 'true';
    document.head.appendChild(script);
  }, [turnstileSiteKey]);

  return (
    <form className="form dense" onSubmit={onSubmit}>
      <TextField label={t('Name')} value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      <LocationAutocomplete
        label={t('Adresse')}
        value={form.address}
        onChange={(address) => setForm({ ...form, address, locationConfirmed: false })}
        onSelect={(candidate) => setForm({
          ...form,
          address: candidate.displayName,
          latitude: candidate.lat,
          longitude: candidate.lng,
          locationConfirmed: true,
        })}
        confirmed={form.locationConfirmed}
        required
        minLength={5}
        language={language}
      />
      <TextField label={t('Verein')} value={form.clubName} onChange={(clubName) => setForm({ ...form, clubName })} placeholder={t('Optional, falls vorhanden')} />
      <TextField label={t('Platzanzahl')} type="number" min={0} value={form.courtCount} onChange={(courtCount) => setForm({ ...form, courtCount })} />
      <TextArea label={t('Weitere Infos')} value={form.description} onChange={(description) => setForm({ ...form, description })} />
      <TextField label={t('Ausstattung')} value={form.facilities} onChange={(facilities) => setForm({ ...form, facilities })} />
      <label className="checkbox-field">
        <input type="checkbox" checked={form.accessible} onChange={(event) => setForm({ ...form, accessible: event.target.checked })} />
        {t('Barrierefrei')}
      </label>
      <div className="form-grid">
        <TextField label={t('Name (Kontakt)')} value={form.contactName} onChange={(contactName) => setForm({ ...form, contactName })} required minLength={2} />
        <TextField label={t('E-Mail (Kontakt)')} type="email" value={form.contactEmail} onChange={(contactEmail) => setForm({ ...form, contactEmail })} required />
      </div>
      <label className="website-field" aria-hidden="true">
        Website
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(event) => setForm({ ...form, website: event.target.value })}
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.consentAccepted}
          onChange={(event) => setForm({ ...form, consentAccepted: event.target.checked })}
          required
        />
        <span>
          {t('Ich habe die')}{' '}
          <button className="link-button" type="button" onClick={() => navigate('/datenschutz')}>
            {t('Datenschutzerklärung')}
          </button>{' '}
          {t('gelesen und stimme der Verarbeitung meiner Daten zu.')}
          <RequiredMark />
        </span>
      </label>
      {turnstileSiteKey && <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />}
      <div className="dialog-actions">
        <Button type="submit" loading={saving}>{t('Bouleplatz melden')}</Button>
      </div>
    </form>
  );
}

export function PlaceReportPage({
  language,
  setLanguage,
  menuOpen,
  setMenuOpen,
  navigate,
  currentUser,
  onLogout,
  turnstileSiteKey,
  verifyStatus,
  drawerContent,
  postboxControl,
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => ({
    ...EMPTY_PLACE_REPORT_FORM,
    contactName: currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : '',
    contactEmail: currentUser?.email || '',
  }));
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);
    try {
      const turnstileToken =
        turnstileSiteKey && typeof window !== 'undefined' && window.turnstile ? window.turnstile.getResponse() : undefined;
      await api('/api/place-reports', {
        method: 'POST',
        body: JSON.stringify({ ...form, courtCount: form.courtCount === '' ? 0 : Number(form.courtCount), language, turnstileToken }),
      });
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={t('Bouleplatz melden')}
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        currentUser={currentUser}
        onLogout={onLogout}
        drawerContent={drawerContent}
        postboxControl={postboxControl}
      />

      <section className="single-column">
        <div className="panel">
          {verifyStatus === 'success' && (
            <Feedback message={t('Deine Bouleplatz-Meldung wurde bestätigt und ist jetzt öffentlich sichtbar.')} />
          )}
          {verifyStatus === 'error' && <Feedback error={t('Der Bestätigungslink ist ungültig oder abgelaufen.')} />}

          {submitted ? (
            <Feedback message={t('Danke für deine Meldung! Bitte bestätige sie über den Link, den wir dir per E-Mail geschickt haben. Erst danach erscheint sie öffentlich.')} />
          ) : (
            <>
              <p className="subtitle">
                {t('Melde einen Bouleplatz, auch ohne eigenen Verein. Der Eintrag wird sichtbar, sobald du die Bestätigungs-E-Mail bestätigt hast.')}
              </p>
              <PlaceReportForm
                form={form}
                setForm={setForm}
                onSubmit={handleSubmit}
                navigate={navigate}
                language={language}
                turnstileSiteKey={turnstileSiteKey}
                saving={saving}
              />
              <Feedback message={message} error={error} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default PlaceReportPage;
