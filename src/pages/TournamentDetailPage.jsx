import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FORMATIONS, REGISTRATION_TYPES, TOURNAMENT_TYPES, EMPTY_REGISTRATION_FORM } from '../lib/constants.js';
import { api } from '../lib/api.js';
import { useRoutedTournament } from '../lib/hooks.js';
import { isOnlinePlayable } from '../lib/pairing/index.js';
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
  const { t } = useTranslation();
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
          title={t('Turnier teilen')}
          aria-label={t('Turnier teilen')}
          onClick={onShare}
        >
          <ShareIcon />
        </button>
        <a
          className="icon-bar-button"
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          title={t('Spielort in Google Maps öffnen')}
          aria-label={t('Spielort in Google Maps öffnen')}
        >
          📍
        </a>
        {tournament.websiteUrl && (
          <a
            className="icon-bar-button"
            href={tournament.websiteUrl}
            target="_blank"
            rel="noreferrer"
            title={t('Website öffnen')}
            aria-label={t('Website öffnen')}
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
            title={t('Flyer öffnen')}
            aria-label={t('Flyer öffnen')}
          >
            📄
          </a>
        )}
      </div>
      {showTimezoneHint && <p className="hint">{(TIMEZONE_HINT_TEMPLATES[language] || TIMEZONE_HINT_TEMPLATES.de)(tournamentTimeZone)}</p>}
      <p>
        <strong>{t('Datum')}</strong>: {formatDate(tournament.date, language)} {formatTournamentStartTime(tournament, language)}
      </p>
      <p>
        <strong>{t('Ort')}</strong>: <span data-i18n-skip>{tournament.location}</span>
      </p>
      {!isCalendarEntry && (
        <>
          <p>
            <strong>{t('Formation')}</strong>: {formationLabel(tournament)}
          </p>
          <p>
            <strong>{t('Anmeldetyp')}</strong>: {labelFor(REGISTRATION_TYPES, tournament.registrationType)}
          </p>
          <p>
            <strong>{t('Turniersystem')}</strong>: {labelFor(TOURNAMENT_TYPES, tournament.type)}
          </p>
          <p>
            <strong>{t('Lizenz')}</strong>: {t(tournament.licenseRequired ? 'Ja' : 'Nein')}
          </p>
        </>
      )}
      {tournament.description && <p>{tournament.description}</p>}
      {!isCalendarEntry && (
        <>
          {Boolean(tournament.entryFeeCents) && (
            <p>
              <strong>{t('Startgeld')}</strong>: {formatMoney(tournament.entryFeeCents, tournament.currency, language)}
            </p>
          )}
          {tournament.registrationOpensAt && (
            <p>
              <strong>{t('Anmeldung möglich ab')}</strong>: {formatTournamentDateTime(tournament.registrationOpensAt, language, tournament.timezone)}
            </p>
          )}
          {tournament.registrationDeadline && (
            <p>
              <strong>{t('Meldefrist')}</strong>: {formatTournamentDateTime(tournament.registrationDeadline, language, tournament.timezone)}
            </p>
          )}
          <p>
            <strong>{t('Max. Meldungen')}</strong>: {tournament.maxRegistrations || '∞'}
          </p>
          {freeSlots === null ? (
            <p>
              <strong>{t('Angemeldet')}</strong>: {tournament.activeRegistrations || 0}
            </p>
          ) : (
            <p>
              <strong>{t('Noch frei')}</strong>: {freeSlots}
            </p>
          )}
          <p>
            <strong>{t('Warteliste')}</strong>: {tournament.waitlistRegistrations || 0}
          </p>
          {(tournament.contactName || tournament.contactEmail || tournament.contactPhone) && (
            <p>
              <strong>{t('Kontakt')}</strong>: {[tournament.contactName, tournament.contactEmail, tournament.contactPhone].filter(Boolean).join(' · ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function TournamentParticipants({ tournamentId, logoUrl, onMessage, onError }) {
  const { t } = useTranslation();
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
      onMessage?.(t('Anmeldung wurde abgesagt.'));
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      onError?.(requestError.message);
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
        <p className="muted">{t('Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.')}</p>
      </>
    );
  }

  if (!participants) {
    return (
      <>
        {logo}
        <p className="muted">{t('Teilnehmerliste wird geladen…')}</p>
      </>
    );
  }

  if (!participants.length) {
    return (
      <>
        {logo}
        <p className="muted">{t('Noch keine Anmeldungen.')}</p>
      </>
    );
  }

  return (
    <div className="participants-list">
      {logo}
      {participants.map((participant, index) => (
        <article className="data-row participants-row" key={`${participant.firstName}-${participant.lastName}-${index}`}>
          <div data-i18n-skip>
            <strong>
              {participant.isVip && <span className="vip-badge" title="VIP">★</span>}
              {participant.firstName} {participant.lastName}
            </strong>
            <span>{participant.club}</span>
          </div>
          {(participant.partnerFirstName || participant.partnerLastName) && (
            <div data-i18n-skip>
              <strong>
                {participant.partnerFirstName} {participant.partnerLastName}
              </strong>
            </div>
          )}
          {participant.registrationId && (
            <Button variant="secondary" onClick={() => handleCancelOwnRegistration(participant)}>
              {t('Absagen')}
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}

function playerLabel(player) {
  return [player.firstName, player.lastName].filter(Boolean).join(' ') || player.id;
}

export function TournamentSchedule({ tournamentId, tournament }) {
  const { t } = useTranslation();
  const [rounds, setRounds] = useState(null);
  const [ranking, setRanking] = useState([]);
  const isSchweizer = tournament?.type === 'schweizer';
  const isSchweizerWithBuchholz = isSchweizer && tournament?.schweizerRankingMode !== 'ohne_buchholz';

  useEffect(() => {
    let cancelled = false;
    Promise.all([api(`/api/tournaments/${tournamentId}/rounds`), api(`/api/tournaments/${tournamentId}/ranking`)])
      .then(([roundsData, rankingData]) => {
        if (!cancelled) {
          setRounds(roundsData.rounds);
          setRanking(rankingData.ranking);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRounds([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  if (!rounds) {
    return <p className="muted">{t('Wird geladen…')}</p>;
  }

  if (!rounds.length) {
    return <p className="muted">{t('Noch keine Runde gestartet.')}</p>;
  }

  const currentRound = rounds[rounds.length - 1];

  return (
    <div className="supermelee-schedule">
      <h3>
        {t('Runde')} {currentRound.roundNumber}
      </h3>
      {currentRound.matches.map((match) => (
        <article className="data-row" key={match.id}>
          <div>
            <strong>{match.teamA.map(playerLabel).join(' + ')}</strong>
            <span>{t('gegen')}</span>
            <strong>{match.teamB.map(playerLabel).join(' + ')}</strong>
          </div>
          <div>{match.noShow ? t('Nicht angetreten') : match.scoreA != null ? `${match.scoreA}:${match.scoreB}` : t('Offen')}</div>
        </article>
      ))}

      {Boolean(ranking.length) && (
        <>
          <h3>{t('Rangliste')}</h3>
          <div className="table-scroll">
            <table className="ranking-table">
              <thead>
                {isSchweizer ? (
                  <>
                    <tr>
                      <th rowSpan={2}>{t('Platz')}</th>
                      <th rowSpan={2}>{t('Team')}</th>
                      <th rowSpan={2}>{t('Siege')}</th>
                      {isSchweizerWithBuchholz && <><th rowSpan={2}>{t('BHZ')}</th><th rowSpan={2}>{t('FBHZ')}</th></>}
                      <th colSpan={3}>{t('Punkte')}</th>
                    </tr>
                    <tr>
                      <th>+</th>
                      <th>-</th>
                      <th>{t('Δ')}</th>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <th rowSpan={2}>{t('Platz')}</th>
                      <th rowSpan={2}>{t('Spieler')}</th>
                      <th colSpan={3}>{t('Spiele')}</th>
                      <th colSpan={3}>{t('Punkte')}</th>
                    </tr>
                    <tr>
                      <th>+</th>
                      <th>-</th>
                      <th>{t('Δ')}</th>
                      <th>+</th>
                      <th>-</th>
                      <th>{t('Δ')}</th>
                    </tr>
                  </>
                )}
              </thead>
              <tbody>
                {ranking.map((entry) => (
                  <tr key={entry.teamId || entry.playerId}>
                    <td>{entry.rank}</td>
                    <td data-i18n-skip>{entry.members ? entry.members.map(playerLabel).join(' + ') : playerLabel(entry)}</td>
                    {isSchweizer ? (
                      <>
                        <td>{entry.wins}</td>
                        {isSchweizerWithBuchholz && <><td>{entry.bhz}</td><td>{entry.fbhz}</td></>}
                        <td>{entry.pointsFor}</td>
                        <td>{entry.pointsAgainst}</td>
                        <td>{entry.pointsDiff}</td>
                      </>
                    ) : (
                      <>
                        <td>{entry.wins}</td>
                        <td>{entry.wins - entry.gameDiff}</td>
                        <td>{entry.gameDiff}</td>
                        <td>{entry.pointsFor}</td>
                        <td>{entry.pointsAgainst}</td>
                        <td>{entry.pointsDiff}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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
  registrationInvalidField,
  setMessage,
  setError,
  onLogout,
}) {
  const { t } = useTranslation();
  const { tournament, notFound } = useRoutedTournament(route.id, tournaments);

  if (notFound) {
    return (
      <main className="app-shell">
        <StandalonePageHeader
          heading={t('Turnier nicht gefunden')}
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          onLogout={onLogout}
        />
        <section className="home-tournaments">
          <p className="muted">{t('Dieses Turnier existiert nicht oder ist nicht öffentlich sichtbar.')}</p>
          <button className="link-button" type="button" onClick={() => navigate('/')}>
            {t('Zur Startseite')}
          </button>
        </section>
      </main>
    );
  }

  if (!tournament) {
    return (
      <main className="app-shell">
        <StandalonePageHeader
          heading={t('Turnier wird geladen…')}
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
  const canShowSchedule = canShowParticipants && isOnlinePlayable(tournament);

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
      setMessage(t('Link kopiert'));
    } catch {
      setError(t('Teilen wird von diesem Gerät nicht unterstützt'));
    }
  }

  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={tournament.name}
        headingNoTranslate
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
        <nav className="tournament-detail-tabs" aria-label={t('Turnierdetails')}>
          <button
            className={`tournament-detail-tab ${route.view === 'info' ? 'active' : ''}`}
            type="button"
            onClick={() => navigate(`/turniere/${tournament.id}/info`)}
          >
            {t('Info')}
          </button>
          {canRegister && (
            <button
              className={`tournament-detail-tab ${route.view === 'anmelden' ? 'active' : ''}`}
              type="button"
              onClick={() => navigate(`/turniere/${tournament.id}/anmelden`)}
            >
              {t('Anmelden')}
            </button>
          )}
          {canShowParticipants && (
            <button
              className={`tournament-detail-tab ${route.view === 'teilnehmer' ? 'active' : ''}`}
              type="button"
              onClick={() => navigate(`/turniere/${tournament.id}/teilnehmer`)}
            >
              {t('Teilnehmer')}
            </button>
          )}
          {canShowSchedule && (
            <button
              className={`tournament-detail-tab ${route.view === 'spielplan' ? 'active' : ''}`}
              type="button"
              onClick={() => navigate(`/turniere/${tournament.id}/spielplan`)}
            >
              {t('Spielplan')}
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
              invalidField={registrationInvalidField}
            />
          )}

          {route.view === 'teilnehmer' && canShowParticipants && (
            <>
              <p className="hint">
                {t('Diese Teilnehmerliste ist öffentlich sichtbar und ohne Anmeldung einsehbar. Wer hier nicht aufgeführt werden möchte, wende sich bitte direkt an den Veranstalter dieses Turniers.')}
              </p>
              <TournamentParticipants tournamentId={tournament.id} logoUrl={tournament.logoUrl} onMessage={setMessage} onError={setError} />
            </>
          )}

          {route.view === 'spielplan' && canShowSchedule && <TournamentSchedule tournamentId={tournament.id} tournament={tournament} />}
        </div>
      </section>
    </main>
  );
}

export default TournamentDetailPage;
