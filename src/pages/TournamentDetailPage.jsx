import { useState, useEffect } from 'react';
import { FORMATIONS, REGISTRATION_TYPES, TOURNAMENT_TYPES, EMPTY_REGISTRATION_FORM } from '../lib/constants.js';
import { translateText } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { useRoutedTournament } from '../lib/hooks.js';
import { REGISTRATION_OPENS_TEMPLATES, TIMEZONE_HINT_TEMPLATES, detectViewerTimeZone, formatDate, formatTournamentDateTime, formatMoney } from '../lib/format.js';
import { labelFor, formationLabel, registrationNotYetOpen, formatTournamentStartTime, googleMapsUrl, tournamentImageUrl } from '../lib/domain.js';
import { Button, Feedback, RequiredMark } from '../components/ui.jsx';
import { StandalonePageHeader, OfflineNotice } from '../components/layout.jsx';
import { PublicRegistrationPanel } from '../App.jsx';

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
    </svg>
  );
}

export function TournamentInfo({ tournament, language, onShare }) {
  const isCalendarEntry = tournament.registrationEnabled === false;
  const mapsUrl = googleMapsUrl(tournament);
  const viewerTimeZone = detectViewerTimeZone();
  const tournamentTimeZone = tournament.timezone || 'UTC';
  const showTimezoneHint = Boolean(viewerTimeZone && viewerTimeZone !== tournamentTimeZone);
  const freeSlots = tournament.maxRegistrations
    ? Math.max(tournament.maxRegistrations - tournament.activeRegistrations, 0)
    : null;

  return (
    <div className="panel">
      <div className="tournament-icon-bar">
        <button
          type="button"
          className="icon-bar-button"
          title={translateText('Turnier teilen', language)}
          aria-label={translateText('Turnier teilen', language)}
          onClick={onShare}
        >
          <ShareIcon />
        </button>
        <a
          className="icon-bar-button"
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          title={translateText('Spielort in Google Maps öffnen', language)}
          aria-label={translateText('Spielort in Google Maps öffnen', language)}
        >
          📍
        </a>
        {tournament.websiteUrl && (
          <a
            className="icon-bar-button"
            href={tournament.websiteUrl}
            target="_blank"
            rel="noreferrer"
            title={translateText('Website öffnen', language)}
            aria-label={translateText('Website öffnen', language)}
          >
            🌐
          </a>
        )}
        {tournament.flyerUrl && (
          <a
            className="icon-bar-button"
            href={tournament.flyerUrl}
            target="_blank"
            rel="noreferrer"
            title={translateText('Flyer öffnen', language)}
            aria-label={translateText('Flyer öffnen', language)}
          >
            📄
          </a>
        )}
      </div>
      {showTimezoneHint && <p className="hint">{(TIMEZONE_HINT_TEMPLATES[language] || TIMEZONE_HINT_TEMPLATES.de)(tournamentTimeZone)}</p>}
      <p>
        <strong>{translateText('Datum', language)}</strong>: {formatDate(tournament.date, language)} {formatTournamentStartTime(tournament, language)}
      </p>
      <p>
        <strong>Ort</strong>: {tournament.location}
      </p>
      {!isCalendarEntry && (
        <>
          <p>
            <strong>Formation</strong>: {formationLabel(tournament)}
          </p>
          <p>
            <strong>Anmeldetyp</strong>: {labelFor(REGISTRATION_TYPES, tournament.registrationType)}
          </p>
          <p>
            <strong>Turniersystem</strong>: {labelFor(TOURNAMENT_TYPES, tournament.type)}
          </p>
          <p>
            <strong>{translateText('Lizenz', language)}</strong>: {translateText(tournament.licenseRequired ? 'Ja' : 'Nein', language)}
          </p>
        </>
      )}
      {tournament.description && <p>{tournament.description}</p>}
      {!isCalendarEntry && (
        <>
          {Boolean(tournament.entryFeeCents) && (
            <p>
              <strong>{translateText('Startgeld', language)}</strong>: {formatMoney(tournament.entryFeeCents, tournament.currency, language)}
            </p>
          )}
          {tournament.registrationOpensAt && (
            <p>
              <strong>{translateText('Anmeldung möglich ab', language)}</strong>: {formatTournamentDateTime(tournament.registrationOpensAt, language, tournament.timezone)}
            </p>
          )}
          {tournament.registrationDeadline && (
            <p>
              <strong>{translateText('Meldefrist', language)}</strong>: {formatTournamentDateTime(tournament.registrationDeadline, language, tournament.timezone)}
            </p>
          )}
          <p>
            <strong>{translateText('Max. Meldungen', language)}</strong>: {tournament.maxRegistrations || '∞'}
          </p>
          {freeSlots === null ? (
            <p>
              <strong>{translateText('Angemeldet', language)}</strong>: {tournament.activeRegistrations || 0}
            </p>
          ) : (
            <p>
              <strong>{translateText('Noch frei', language)}</strong>: {freeSlots}
            </p>
          )}
          <p>
            <strong>{translateText('Warteliste', language)}</strong>: {tournament.waitlistRegistrations || 0}
          </p>
          {(tournament.contactName || tournament.contactEmail || tournament.contactPhone) && (
            <p>
              <strong>Kontakt</strong>: {[tournament.contactName, tournament.contactEmail, tournament.contactPhone].filter(Boolean).join(' · ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TournamentParticipants({ tournamentId, logoUrl, onMessage, onError, language }) {
  const [participants, setParticipants] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setForbidden(false);
    api(`/api/tournaments/${tournamentId}/participants`)
      .then((data) => {
        if (!cancelled) {
          setParticipants(data.participants);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setForbidden(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId, reloadKey]);

  async function handleCancelOwnRegistration(participant) {
    const label = [participant.firstName, participant.lastName].filter(Boolean).join(' ');
    if (!window.confirm(`Anmeldung "${label}" wirklich absagen?`)) {
      return;
    }
    onError?.('');
    onMessage?.('');
    try {
      await api(`/api/registrations/${participant.registrationId}/cancel`, { method: 'POST' });
      onMessage?.('Anmeldung wurde abgesagt.');
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      onError?.(translateText(requestError.message, language));
    }
  }

  const logo = logoUrl && (
    <img
      className="tournament-logo"
      src={tournamentImageUrl(tournamentId, 'logo')}
      alt=""
      onError={(event) => {
        event.target.style.display = 'none';
      }}
    />
  );

  if (forbidden) {
    return (
      <>
        {logo}
        <p className="muted">Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.</p>
      </>
    );
  }

  if (!participants) {
    return (
      <>
        {logo}
        <p className="muted">Teilnehmerliste wird geladen…</p>
      </>
    );
  }

  if (!participants.length) {
    return (
      <>
        {logo}
        <p className="muted">Noch keine Anmeldungen.</p>
      </>
    );
  }

  return (
    <div className="participants-list">
      {logo}
      {participants.map((participant, index) => (
        <article className="data-row participants-row" key={`${participant.firstName}-${participant.lastName}-${index}`}>
          <div>
            <strong>
              {participant.isVip && <span className="vip-badge" title="VIP">★</span>}
              {participant.firstName} {participant.lastName}
            </strong>
            <span>{participant.club}</span>
          </div>
          {(participant.partnerFirstName || participant.partnerLastName) && (
            <div>
              <strong>
                {participant.partnerFirstName} {participant.partnerLastName}
              </strong>
            </div>
          )}
          {participant.registrationId && (
            <Button variant="secondary" onClick={() => handleCancelOwnRegistration(participant)}>
              Absagen
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}

export function TournamentDetailPage({
  route,
  tournaments,
  currentUser,
  language,
  setLanguage,
  navigate,
  menuOpen,
  setMenuOpen,
  registrationForm,
  setRegistrationForm,
  onSubmitRegistration,
  message,
  error,
  setMessage,
  setError,
  onLogout,
}) {
  const { tournament, notFound } = useRoutedTournament(route.id, tournaments);

  if (notFound) {
    return (
      <main className="app-shell">
        <StandalonePageHeader
          heading="Turnier nicht gefunden"
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          onLogout={onLogout}
        />
        <section className="home-tournaments">
          <p className="muted">Dieses Turnier existiert nicht oder ist nicht öffentlich sichtbar.</p>
          <button className="link-button" type="button" onClick={() => navigate('/')}>
            Zur Startseite
          </button>
        </section>
      </main>
    );
  }

  if (!tournament) {
    return (
      <main className="app-shell">
        <StandalonePageHeader
          heading="Turnier wird geladen…"
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          onLogout={onLogout}
        />
      </main>
    );
  }

  const canRegister = tournament.status === 'registration' && tournament.visibility === 'public' && tournament.registrationEnabled !== false;
  const canShowParticipants = (tournament.participantsPublic || tournament.canManage) && tournament.registrationEnabled !== false;

  async function handleShare() {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: tournament.name, url: shareUrl });
      } catch (shareError) {
        if (shareError.name !== 'AbortError') {
          setError(shareError.message);
        }
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage(translateText('Link kopiert', language));
    } catch {
      setError(translateText('Teilen wird von diesem Gerät nicht unterstützt', language));
    }
  }

  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={tournament.name}
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <OfflineNotice language={language} />
      <Feedback message={message} error={error} />

      <section className="tournament-detail-page">
        <nav className="tournament-detail-tabs" aria-label="Turnierdetails">
          <button
            className={`tournament-detail-tab ${route.view === 'info' ? 'active' : ''}`}
            type="button"
            onClick={() => navigate(`/turniere/${tournament.id}/info`)}
          >
            Info
          </button>
          {canRegister && (
            <button
              className={`tournament-detail-tab ${route.view === 'anmelden' ? 'active' : ''}`}
              type="button"
              onClick={() => navigate(`/turniere/${tournament.id}/anmelden`)}
            >
              Anmelden
            </button>
          )}
          {canShowParticipants && (
            <button
              className={`tournament-detail-tab ${route.view === 'teilnehmer' ? 'active' : ''}`}
              type="button"
              onClick={() => navigate(`/turniere/${tournament.id}/teilnehmer`)}
            >
              Teilnehmer
            </button>
          )}
        </nav>

        <div className="tournament-detail-content">
          {route.view === 'info' && <TournamentInfo tournament={tournament} language={language} onShare={handleShare} />}

          {route.view === 'anmelden' && canRegister && (
            <PublicRegistrationPanel
              tournament={tournament}
              form={registrationForm}
              setForm={setRegistrationForm}
              onSubmit={onSubmitRegistration}
              onCancel={() => navigate(`/turniere/${tournament.id}/info`)}
              navigate={navigate}
              language={language}
              currentUser={currentUser}
            />
          )}

          {route.view === 'teilnehmer' && canShowParticipants && (
            <>
              <p className="hint">
                Diese Teilnehmerliste ist öffentlich sichtbar und ohne Anmeldung einsehbar. Wer hier nicht aufgeführt werden möchte, wende sich bitte direkt an den Veranstalter dieses Turniers.
              </p>
              <TournamentParticipants tournamentId={tournament.id} logoUrl={tournament.logoUrl} onMessage={setMessage} onError={setError} language={language} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default TournamentDetailPage;
