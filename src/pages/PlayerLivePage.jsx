import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, authenticatedApi } from '../lib/api.js';
import { formatDate, DISPLAY_LOCALES } from '../lib/format.js';
import { Button, Feedback } from '../components/ui.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';

const LIVE_REFRESH_MS = 30_000;

function formatClock(iso, language) {
  if (!iso) return '';
  return new Intl.DateTimeFormat(DISPLAY_LOCALES[language] || DISPLAY_LOCALES.de, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function scoreLabel(entry, t) {
  if (entry.noShow) return t('Nicht angetreten');
  if (entry.ownScore === null || entry.opponentScore === null) return t('läuft');
  return `${entry.ownScore}:${entry.opponentScore}`;
}

function CurrentMatchCard({ live }) {
  const { t } = useTranslation();
  const match = live.currentMatch;
  return (
    <section className="panel live-card live-current" aria-label={t('Aktuelle Partie')}>
      <div className="live-card-head">
        <h2>{t('Aktuelle Partie')}</h2>
        {live.lastRoundNumber !== null && <span className="live-round">{t('Runde')} {match?.roundNumber ?? live.lastRoundNumber}</span>}
      </div>
      {live.lastRoundNumber === null && <p className="muted">{t('Noch keine Runde gestartet.')}</p>}
      {live.lastRoundNumber !== null && !match && <p className="muted">{t('Du bist in der aktuellen Runde nicht eingeteilt.')}</p>}
      {match && (
        <>
          {match.stageLabel && <p className="live-stage" data-i18n-skip>{match.stageLabel}</p>}
          {match.court && (
            <p className="live-court">
              {t('Bahn')} <strong data-i18n-skip>{match.court}</strong>
            </p>
          )}
          {match.bye ? (
            <p className="live-versus"><strong>{t('Freilos')}</strong></p>
          ) : (
            <div className="live-versus">
              <span className="live-team own" data-i18n-skip>{match.teamLabel}</span>
              <span className="live-vs">{t('gegen')}</span>
              <span className="live-team" data-i18n-skip>{match.opponentLabel}</span>
            </div>
          )}
          <p className={`live-score live-${match.outcome}`}>{scoreLabel(match, t)}</p>
        </>
      )}
    </section>
  );
}

function RankingCard({ live }) {
  const { t } = useTranslation();
  if (!live.ranking.length) return null;
  return (
    <section className="panel live-card" aria-label={t('Mein Platz')}>
      <div className="live-card-head">
        <h2>{t('Mein Platz')}</h2>
        {live.rankingPlace !== null && (
          <span className="live-place">
            <strong>{live.rankingPlace}</strong> / {live.rankingSize}
          </span>
        )}
      </div>
      <p className="muted">
        {t('Bilanz')}: {live.summary.wins} {t('Siege')} · {live.summary.losses} {t('Niederlagen')} · {t('Punkte')} {live.summary.pointsFor}:{live.summary.pointsAgainst}
      </p>
      <details className="live-ranking">
        <summary>{t('Rangliste anzeigen')}</summary>
        <div className="table-scroll">
          <table className="ranking-table">
            <thead>
              <tr>
                <th>{t('Platz')}</th>
                <th>{t('Team')}</th>
                <th>{t('Siege')}</th>
                <th>{t('Δ')}</th>
              </tr>
            </thead>
            <tbody>
              {live.ranking.map((entry) => (
                <tr key={entry.registrationIds.join('-')} className={entry.own ? 'live-own-row' : undefined}>
                  <td>{entry.rank}</td>
                  <td data-i18n-skip>{entry.label}</td>
                  <td>{entry.wins ?? ''}</td>
                  <td>{entry.pointsDiff ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function HistoryCard({ live }) {
  const { t } = useTranslation();
  if (!live.history.length) return null;
  return (
    <section className="panel live-card" aria-label={t('Meine Partien')}>
      <h2>{t('Meine Partien')}</h2>
      <ul className="live-history">
        {live.history.map((entry) => (
          <li key={entry.matchId} className={`live-${entry.outcome}`}>
            <span className="live-history-round">{t('Runde')} {entry.roundNumber}</span>
            <span className="live-history-opponent" data-i18n-skip>{entry.bye ? t('Freilos') : entry.opponentLabel}</span>
            <span className="live-history-score">
              {scoreLabel(entry, t)}
              {entry.outcome !== 'open' && <small> · {entry.outcome === 'won' ? t('Sieg') : t('Niederlage')}</small>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LiveDetail({ queryKey, path, useSession, language }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey,
    queryFn: () => (useSession ? authenticatedApi(path) : api(path)),
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const data = query.data;

  if (query.isPending) return <p className="muted">{t('Wird geladen…')}</p>;
  if (!data) return <Feedback error={query.error?.message || t('Die Live-Ansicht konnte nicht geladen werden.')} />;

  const { tournament, registration, live } = data;
  return (
    <div className="live-view">
      <header className="live-header">
        <h2 data-i18n-skip>{tournament.name}</h2>
        <p className="muted">
          {formatDate(tournament.date, language)}
          {tournament.location ? <> · <span data-i18n-skip>{tournament.location}</span></> : null}
        </p>
        <p className="live-player" data-i18n-skip>{registration.label}</p>
      </header>
      {tournament.status === 'finished' && <p className="hint">{t('Das Turnier ist beendet.')}</p>}
      {tournament.status !== 'running' && tournament.status !== 'finished' && <p className="hint">{t('Das Turnier hat noch nicht begonnen.')}</p>}
      {query.error && <Feedback error={query.error.message} />}
      <CurrentMatchCard live={live} />
      <RankingCard live={live} />
      <HistoryCard live={live} />
      <div className="live-refresh">
        <span className="muted">{t('Stand')}: {formatClock(data.updatedAt, language)}</span>
        <Button variant="secondary" loading={query.isFetching} onClick={() => query.refetch()}>{t('Aktualisieren')}</Button>
      </div>
    </div>
  );
}

function MyLiveList({ navigate, language }) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['live', 'me'], queryFn: () => authenticatedApi('/api/live/me'), retry: false });

  if (query.isPending) return <p className="muted">{t('Wird geladen…')}</p>;
  if (query.error) return <Feedback error={query.error.message} />;

  const registrations = query.data.registrations;
  if (!registrations.length) {
    return <p className="muted">{t('Du bist aktuell in keinem laufenden Turnier gemeldet.')}</p>;
  }
  return (
    <div className="live-list">
      {registrations.map((entry) => (
        <button key={entry.id} type="button" className="panel live-list-item" onClick={() => navigate(`/live/${encodeURIComponent(entry.id)}`)}>
          <strong data-i18n-skip>{entry.tournament.name}</strong>
          <span className="muted">
            {formatDate(entry.tournament.date, language)}
            {entry.tournament.location ? <> · <span data-i18n-skip>{entry.tournament.location}</span></> : null}
          </span>
          <span data-i18n-skip>{entry.label}</span>
          {entry.tournament.status === 'finished' && <span className="muted">{t('Beendet')}</span>}
        </button>
      ))}
    </div>
  );
}

export function PlayerLivePage({ route, language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, isAdmin, onSelectAdminDashboard, onLogout, onLogin, drawerContent, postboxControl }) {
  const { t } = useTranslation();

  let content;
  if (route.token) {
    content = <LiveDetail queryKey={['live', 'token', route.token]} path={`/api/live/token/${encodeURIComponent(route.token)}`} language={language} />;
  } else if (route.registrationId && currentUser) {
    content = <LiveDetail queryKey={['live', 'registration', route.registrationId]} path={`/api/live/registrations/${encodeURIComponent(route.registrationId)}`} useSession language={language} />;
  } else if (currentUser) {
    content = <MyLiveList navigate={navigate} language={language} />;
  } else {
    content = (
      <section className="panel live-card">
        <p>{t('Melde dich an, um deine laufenden Turniere live zu verfolgen.')}</p>
        <p className="muted">{t('Du hast nach dem Check-in einen Link per E-Mail bekommen? Öffne ihn einfach – dafür ist keine Anmeldung nötig.')}</p>
        <Button onClick={onLogin}>{t('Anmelden')}</Button>
      </section>
    );
  }

  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={t('Live')}
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        currentUser={currentUser}
        isAdmin={isAdmin}
        onSelectAdminDashboard={onSelectAdminDashboard}
        onLogout={onLogout}
        drawerContent={drawerContent}
        postboxControl={postboxControl}
      />
      <section className="single-column live-page">
        {route.registrationId && currentUser && (
          <button type="button" className="drawer-link live-back" onClick={() => navigate('/live')}>← {t('Meine Turniere')}</button>
        )}
        {content}
      </section>
    </main>
  );
}

export default PlayerLivePage;
