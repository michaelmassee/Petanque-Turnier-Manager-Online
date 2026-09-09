import { useEffect, useState } from 'react';
import { EMPTY_TOURNAMENT_REPORT_FORM, FORMATIONS } from '../lib/constants.js';
import { translateText } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { RequiredMark, TextField, TextArea, SelectField, Button, Feedback } from '../components/ui.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';

function TournamentReportForm({ form, setForm, onSubmit, navigate, turnstileSiteKey }) {
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
      <TextField label="Verein" value={form.club} onChange={(club) => setForm({ ...form, club })} required minLength={2} />
      <TextField label="Turnier-Informationen" value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      <TextField label="Ort" value={form.location} onChange={(location) => setForm({ ...form, location })} required minLength={2} />
      <div className="form-grid">
        <TextField label="Datum" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} required />
        <TextField label="Startzeit" type="time" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} />
      </div>
      <SelectField label="Formation" value={form.formation} onChange={(formation) => setForm({ ...form, formation })} options={FORMATIONS} required />
      <TextArea label="Weitere Infos" value={form.description} onChange={(description) => setForm({ ...form, description })} />
      <TextField
        label="Quelle / Webseite"
        type="url"
        placeholder="https://…"
        value={form.websiteUrl}
        onChange={(websiteUrl) => setForm({ ...form, websiteUrl })}
        required
      />
      <div className="form-grid">
        <TextField label="Name (Kontakt)" value={form.contactName} onChange={(contactName) => setForm({ ...form, contactName })} required minLength={2} />
        <TextField label="E-Mail (Kontakt)" type="email" value={form.contactEmail} onChange={(contactEmail) => setForm({ ...form, contactEmail })} required />
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
          Ich habe die{' '}
          <button className="link-button" type="button" onClick={() => navigate('/datenschutz')}>
            Datenschutzerklärung
          </button>{' '}
          gelesen und stimme der Verarbeitung meiner Daten zu.
          <RequiredMark />
        </span>
      </label>
      {turnstileSiteKey && <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />}
      <div className="dialog-actions">
        <Button type="submit">Turnier melden</Button>
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
        heading="Turnier melden"
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
            <Feedback message="Deine Turniermeldung wurde bestätigt und ist jetzt im öffentlichen Kalender sichtbar." />
          )}
          {verifyStatus === 'error' && <Feedback error="Der Bestätigungslink ist ungültig oder abgelaufen." />}

          {submitted ? (
            <Feedback message="Danke für deine Meldung! Bitte bestätige sie über den Link, den wir dir per E-Mail geschickt haben. Erst danach erscheint sie im öffentlichen Kalender." />
          ) : (
            <>
              <p className="subtitle">
                Melde ein Petanque-Turnier oder eine Veranstaltung für den öffentlichen Kalender. Der Eintrag wird sichtbar, sobald du die Bestätigungs-E-Mail bestätigt hast.
              </p>
              <TournamentReportForm
                form={form}
                setForm={setForm}
                onSubmit={handleSubmit}
                navigate={navigate}
                turnstileSiteKey={turnstileSiteKey}
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
