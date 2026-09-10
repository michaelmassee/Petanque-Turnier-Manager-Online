import { useEffect, useState } from 'react';
import { EMPTY_TOURNAMENT_REPORT_FORM, FORMATIONS } from '../lib/constants.js';
import { translateText } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { RequiredMark, TextField, TextArea, SelectField, Button, Feedback } from '../components/ui.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';

function TournamentReportForm({ form, setForm, onSubmit, navigate, turnstileSiteKey, language }) {
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
      <TextField label={translateText('Verein', language)} value={form.club} onChange={(club) => setForm({ ...form, club })} required minLength={2} />
      <TextField label={translateText('Turnier-Informationen', language)} value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      <TextField label={translateText('Ort', language)} value={form.location} onChange={(location) => setForm({ ...form, location })} required minLength={2} />
      <div className="form-grid">
        <TextField label={translateText('Datum', language)} type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} required />
        <TextField label={translateText('Startzeit', language)} type="time" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} />
      </div>
      <SelectField
        label={translateText('Formation', language)}
        value={form.formation}
        onChange={(formation) => setForm({ ...form, formation })}
        options={FORMATIONS.map((option) => ({ ...option, label: translateText(option.label, language) }))}
        required
      />
      <TextArea label={translateText('Weitere Infos', language)} value={form.description} onChange={(description) => setForm({ ...form, description })} />
      <TextField
        label={translateText('Quelle / Webseite', language)}
        type="url"
        placeholder="https://…"
        value={form.websiteUrl}
        onChange={(websiteUrl) => setForm({ ...form, websiteUrl })}
        required
      />
      <div className="form-grid">
        <TextField label={translateText('Name (Kontakt)', language)} value={form.contactName} onChange={(contactName) => setForm({ ...form, contactName })} required minLength={2} />
        <TextField label={translateText('E-Mail (Kontakt)', language)} type="email" value={form.contactEmail} onChange={(contactEmail) => setForm({ ...form, contactEmail })} required />
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
          {translateText('Ich habe die', language)}{' '}
          <button className="link-button" type="button" onClick={() => navigate('/datenschutz')}>
            {translateText('Datenschutzerklärung', language)}
          </button>{' '}
          {translateText('gelesen und stimme der Verarbeitung meiner Daten zu.', language)}
          <RequiredMark />
        </span>
      </label>
      {turnstileSiteKey && <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />}
      <div className="dialog-actions">
        <Button type="submit">{translateText('Turnier melden', language)}</Button>
      </div>
    </form>
  );
}

export function TournamentReportPage({
  language,
  setLanguage,
  menuOpen,
  setMenuOpen,
  navigate,
  currentUser,
  onLogout,
  turnstileSiteKey,
  verifyStatus,
}) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_TOURNAMENT_REPORT_FORM,
    contactName: currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : '',
    contactEmail: currentUser?.email || '',
  }));
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      const turnstileToken =
        turnstileSiteKey && typeof window !== 'undefined' && window.turnstile ? window.turnstile.getResponse() : undefined;
      await api('/api/tournament-reports', {
        method: 'POST',
        body: JSON.stringify({ ...form, language, turnstileToken }),
      });
      setSubmitted(true);
    } catch (requestError) {
      setError(translateText(requestError.message, language));
    }
  }

  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={translateText('Turnier melden', language)}
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
          {verifyStatus === 'success' && (
            <Feedback message={translateText('Deine Turniermeldung wurde bestätigt und ist jetzt im öffentlichen Kalender sichtbar.', language)} />
          )}
          {verifyStatus === 'error' && <Feedback error={translateText('Der Bestätigungslink ist ungültig oder abgelaufen.', language)} />}

          {submitted ? (
            <Feedback message={translateText('Danke für deine Meldung! Bitte bestätige sie über den Link, den wir dir per E-Mail geschickt haben. Erst danach erscheint sie im öffentlichen Kalender.', language)} />
          ) : (
            <>
              <p className="subtitle">
                {translateText('Melde ein Petanque-Turnier oder eine Veranstaltung für den öffentlichen Kalender. Der Eintrag wird sichtbar, sobald du die Bestätigungs-E-Mail bestätigt hast.', language)}
              </p>
              <TournamentReportForm
                form={form}
                setForm={setForm}
                onSubmit={handleSubmit}
                navigate={navigate}
                turnstileSiteKey={turnstileSiteKey}
                language={language}
              />
              <Feedback message={message} error={error} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default TournamentReportPage;
