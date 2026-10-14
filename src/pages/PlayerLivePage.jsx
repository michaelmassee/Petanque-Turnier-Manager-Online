import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, authenticatedApi } from '../lib/api.js';
import { formatDate, formatWeekdayShort, DISPLAY_LOCALES } from '../lib/format.js';
import { REGISTRATION_STATUSES } from '../lib/constants.js';
import { labelFor } from '../lib/domain.js';
import { Button, Feedback } from '../components/ui.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';
import { CourtLabel } from '../components/CourtLabel.jsx';
import { RankingTable } from '../components/RankingTable.jsx';
import { isIosSafari } from '../lib/hooks.js';
import { currentBrowserPushSubscription, ensureBrowserPushSubscription, isPushSupported } from '../lib/push.js';

// 60 Sekunden reichen: Beim Zurückkehren zur App wird sofort neu geladen (staleTime 0), und eine
// neue Runde kündigt zusätzlich der Push an.
const LIVE_REFRESH_MS = 60_000;

function pushFlagKey(registrationId) {
  return `ptm_live_push_${registrationId}`;
}

function readPushFlag(registrationId) {
  try {
    return localStorage.getItem(pushFlagKey(registrationId));
  } catch {
    return null;
  }
}

function writePushFlag(registrationId, enabled) {
  try {
    if (enabled) localStorage.setItem(pushFlagKey(registrationId), '1');
    else localStorage.setItem(pushFlagKey(registrationId), '0');
  } catch {
    // Merker ist nur Komfort; ohne Speicher zeigt der Button wieder "aktivieren".
  }
}

// Auf diesem Gerät geöffnete persönliche Live-Links, damit man am Turniertag ohne Mail und ohne Login zurückfindet.
const REMEMBERED_TEAMS_KEY = 'ptm_live_teams';

export function readRememberedTeams() {
  try {
    const entries = JSON.parse(localStorage.getItem(REMEMBERED_TEAMS_KEY) || '[]');
    if (!Array.isArray(entries)) return [];
    const seen = new Set();
    return entries.filter((entry) => {
      if (!entry?.token) return false;
      const key = entry.registrationId || entry.token;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

function writeRememberedTeams(entries) {
  try {
    localStorage.setItem(REMEMBERED_TEAMS_KEY, JSON.stringify(entries));
  } catch {
    // Merker ist nur Komfort; ohne Speicher bleibt der Link aus der Mail der Weg zurück.
  }
}

function rememberTeam(token, data) {
  const entry = {
    token,
    registrationId: data.registration.id,
    tournamentName: data.tournament.name,
    date: data.tournament.date,
    location: data.tournament.location || null,
    label: data.registration.label,
  };
  const others = readRememberedTeams().filter((item) => item.token !== token);
  const current = readRememberedTeams().find((item) => item.token === token);
  if (current && JSON.stringify(current) === JSON.stringify(entry)) return;
  writeRememberedTeams([entry, ...others]);
}

function forgetTeam(token) {
  const entries = readRememberedTeams();
  const registrationId = entries.find((entry) => entry.token === token)?.registrationId;
  writeRememberedTeams(entries.filter((item) => item.token !== token && (!registrationId || item.registrationId !== registrationId)));
}

function LivePushToggle({ path, registrationId }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const supported = isPushSupported();
  const request = authenticatedApi;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function activateDefault() {
      if (!supported || Notification.permission !== 'granted' || readPushFlag(registrationId) === '0') return;
      setBusy(true);
      try {
        const existing = await currentBrowserPushSubscription();
        if (cancelled) return;
        if (existing) {
          // Mit vorhandenem Abo nie automatisch anmelden: Ältere Versionen haben beim Ausschalten
          // den Merker gelöscht, ein fehlender Merker kann also "ausgeschaltet" bedeuten.
          if (readPushFlag(registrationId) === '1') setEnabled(true);
          return;
        }
        const result = await ensureBrowserPushSubscription(async () => (await api('/api/live/push/public-key', { signal: controller.signal })).publicKey);
        if (cancelled || result.status !== 'enabled') return;
        await authenticatedApi(`${path}/push`, { method: 'POST', signal: controller.signal, body: JSON.stringify(result.subscription.toJSON()) });
        if (!cancelled) {
          writePushFlag(registrationId, true);
          setEnabled(true);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    activateDefault();
    return () => { cancelled = true; controller.abort(); };
  }, [path, registrationId, supported]);

  if (!supported) {
    return isIosSafari()
      ? <p className="hint">{t('Benachrichtigungen bei neuer Runde: Füge die App auf dem iPhone zuerst zum Home-Bildschirm hinzu und öffne den Link dort.')}</p>
      : null;
  }

  async function enable() {
    setError(''); setMessage(''); setBusy(true);
    try {
      const result = await ensureBrowserPushSubscription(async () => (await api('/api/live/push/public-key')).publicKey);
      if (result.status === 'blocked') throw new Error(t('Benachrichtigungen sind im Browser blockiert. Bitte in den Browser-Einstellungen erlauben.'));
      if (result.status !== 'enabled') throw new Error(t('Benachrichtigungen wurden nicht erlaubt.'));
      await request(`${path}/push`, { method: 'POST', body: JSON.stringify(result.subscription.toJSON()) });
      writePushFlag(registrationId, true);
      setEnabled(true);
      setMessage(t('Du wirst bei jeder neuen Runde benachrichtigt.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError(''); setMessage(''); setBusy(true);
    try {
      const subscription = await currentBrowserPushSubscription();
      if (subscription) await request(`${path}/push`, { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
      writePushFlag(registrationId, false);
      setEnabled(false);
      setMessage(t('Benachrichtigungen bei neuer Runde sind ausgeschaltet.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="live-push">
      {enabled
        ? <Button variant="secondary" loading={busy} onClick={disable}>{t('Benachrichtigungen ausschalten')}</Button>
        : <Button loading={busy} onClick={enable}>{t('Benachrichtigungen für neue Runden aktivieren')}</Button>}
      <Feedback error={error} />
      <Feedback message={message} />
    </div>
  );
}

// Zeitpunkt des letzten erfolgreichen Abrufs - auch bei 304 (unverändert) aktuell.
function formatClock(timestamp, language) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(DISPLAY_LOCALES[language] || DISPLAY_LOCALES.de, { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

function scoreLabel(entry, t) {
  if (entry.noShow) return t('Nicht angetreten');
  if (entry.ownScore === null || entry.opponentScore === null) return t('läuft');
  return `${entry.ownScore}:${entry.opponentScore}`;
}

function PlayerResultReport({ path, onSaved }) {
  const { t } = useTranslation();
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const invalid = scoreA === '' || scoreB === '' || Number(scoreA) === Number(scoreB);

  async function submit(event) {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      const updated = await authenticatedApi(`${path}/result`, { method: 'POST', body: JSON.stringify({ ownScore: Number(scoreA), opponentScore: Number(scoreB) }) });
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="live-result-report" onSubmit={submit}>
      <p className="hint">{t('Ergebnis dieser Partie melden')}</p>
      <div className="play-result-row">
        <input className="score-input" type="number" inputMode="numeric" min="0" max="13" value={scoreA} onChange={(event) => setScoreA(event.target.value)} aria-label={t('Eigene Punkte')} />
        <span className="play-score-sep">:</span>
        <input className="score-input" type="number" inputMode="numeric" min="0" max="13" value={scoreB} onChange={(event) => setScoreB(event.target.value)} aria-label={t('Gegnerische Punkte')} />
        <Button type="submit" disabled={invalid || busy} loading={busy}>{t('Ergebnis melden')}</Button>
      </div>
      <Feedback error={error || (scoreA !== '' && scoreB !== '' && Number(scoreA) === Number(scoreB) ? t('Unentschieden ist nicht möglich') : '')} />
    </form>
  );
}

function CurrentMatchCard({ live, participation, canReportResult, reportingDisabled, path, onResultSaved }) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const match = live.currentMatch;
  function resultSaved(updated) {
    setMessage(t('Ergebnis gemeldet.'));
    onResultSaved(updated);
  }
  return (
    <section className="panel live-card live-current" aria-label={t('Aktuelle Partie')}>
      <div className="live-card-head">
        <h2>{t('Aktuelle Partie')}</h2>
        {live.lastRoundNumber !== null && <span className="live-round">{t('Runde')} {match?.roundNumber ?? live.lastRoundNumber}</span>}
      </div>
      {live.lastRoundNumber === null && <p className="muted">{t('Noch keine Runde gestartet.')}</p>}
      {live.lastRoundNumber !== null && !match && participation !== 'withdrawn' && <p className="muted">{t('Du bist in der aktuellen Runde nicht eingeteilt.')}</p>}
      {!match && participation === 'withdrawn' && <p className="muted">{t('Du wirst erst wieder eingeteilt, wenn die Turnierleitung dich aktiv setzt.')}</p>}
      {match && (
        <>
          {match.stageLabel && <p className="live-stage" data-i18n-skip>{match.stageLabel}</p>}
          <CourtLabel court={match.court} className="live-court" as="p" />
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
          {canReportResult && !match.bye && match.outcome === 'open' && <PlayerResultReport path={path} onSaved={resultSaved} />}
          {reportingDisabled && !match.bye && match.outcome === 'open' && <p className="hint">{t('Die Ergebnismeldung über die Live-Ansicht ist abgeschaltet. Bitte melde dein Ergebnis direkt bei der Turnierleitung.')}</p>}
          <Feedback message={message} />
        </>
      )}
    </section>
  );
}

function RankingCard({ live, tournament }) {
  const { t } = useTranslation();
  if (!live.ranking.length || tournament.type === 'ko') return null;
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
          <RankingTable tournament={tournament} entries={live.ranking} />
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
            <span className="live-history-round">{t('Runde')} {entry.roundNumber}<CourtLabel court={entry.court} className="live-history-court" /></span>
            <span className="live-history-match">
              {entry.teammates?.length > 0 && (
                <span className="live-history-teammates">{t('mit')} <span data-i18n-skip>{entry.teammates.join(' + ')}</span></span>
              )}
              {entry.bye
                ? <span>{t('Freilos')}</span>
                : <span>{t('gegen')} <span data-i18n-skip>{entry.opponentLabel}</span></span>}
            </span>
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

// Phase der Anmeldung vor der Auslosung (KP-12): Anmeldestatus, Check-in und Teambildung.
function RegistrationPhase({ registration, tournament }) {
  const { t } = useTranslation();
  const lines = [];
  if (registration.status !== 'confirmed') {
    lines.push(`${t('Anmeldestatus')}: ${labelFor(REGISTRATION_STATUSES, registration.status)}`);
  }
  if (registration.participation === 'inactive') lines.push(t('Noch nicht eingecheckt.'));
  if (registration.participation === 'active') lines.push(t('Eingecheckt.'));
  if (registration.incomplete) lines.push(t('Team noch unvollständig.'));
  if (registration.registrationType === 'melee' && registration.meleeTeammates === null && tournament.status !== 'finished') {
    lines.push(t('Dein Team wird kurz vor Turnierstart gebildet.'));
  }
  if (registration.registrationType === 'supermelee') lines.push(t('Dein Team wird bei jeder Auslosung neu gebildet.'));
  return (
    <section className="panel live-card" aria-label={t('Meine Anmeldung')}>
      <h2>{t('Meine Anmeldung')}</h2>
      {lines.map((line) => <p key={line} className="live-phase">{line}</p>)}
      {registration.unit === 'team' && registration.persons?.length > 0 && (
        <p className="muted">{t('Besetzung')}: <span data-i18n-skip>{registration.persons.join(' + ')}</span></p>
      )}
      {registration.meleeTeammates?.length > 0 && (
        <p className="muted">{t('Dein Team')}: <span data-i18n-skip>{registration.meleeTeammates.join(' + ')}</span></p>
      )}
    </section>
  );
}

export function LiveDetail({ queryKey, path, language, navigate = () => {}, token = null, canReportResult = false }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: () => authenticatedApi(path),
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: false,
    // Beim Zurückkehren zur App immer sofort neu laden - unverändert kostet das nur ein 304.
    staleTime: 0,
    retry: false,
  });
  const data = query.data;
  const notFound = query.error?.status === 404;
  useEffect(() => {
    if (!token) return;
    if (data) rememberTeam(token, data);
    // Ungültiger oder stornierter Link: nicht weiter auf diesem Gerät anbieten.
    else if (notFound) forgetTeam(token);
  }, [token, data, notFound]);
  // Ohne Zugriff (storniert, Live-Ansicht abgeschaltet oder aus der Anmeldung entfernt) ist ein noch
  // zwischengespeicherter Stand veraltet: nicht mehr anzeigen.
  async function zurUebersicht() {
    await queryClient.invalidateQueries({ queryKey: ['live', 'me'] });
    navigate('/live');
    queryClient.removeQueries({ queryKey });
  }

  if (query.isPending) return <p className="muted">{t('Wird geladen…')}</p>;
  if (!data && query.error?.payload?.details?.code === 'tournament_deleted') {
    return (
      <section className="panel live-card">
        <h2 data-i18n-skip>{query.error.payload.details.tournamentName}</h2>
        <p className="hint">{t('Das Turnier wurde vom Veranstalter gelöscht.')}</p>
      </section>
    );
  }
  if (notFound) {
    return (
      <section className="panel live-card">
        <Feedback error={query.error.message} />
        <p className="hint">{t('Für diese Anmeldung gibt es keine Live-Ansicht.')}</p>
        <Button variant="secondary" onClick={zurUebersicht}>{t('Zu meinen Live-Turnieren')}</Button>
      </section>
    );
  }
  if (!data) return <Feedback error={query.error?.message || t('Die Live-Ansicht konnte nicht geladen werden.')} />;

  const { tournament, registration, live, dataAsOf } = data;
  const drawn = live.lastRoundNumber !== null;
  return (
    <div className="live-view">
      <header className="live-header">
        <h2 data-i18n-skip>{tournament.name}</h2>
        <p className="muted">
          {formatDate(tournament.date, language)} {formatWeekdayShort(tournament.date, language)}
          {tournament.location ? <> · <span data-i18n-skip>{tournament.location}</span></> : null}
        </p>
        <p className="live-player"><span data-i18n-skip>{registration.label}</span>{registration.participation === 'withdrawn' && <span className="live-paused">{t('Pausiert')}</span>}</p>
      </header>
      {tournament.status === 'finished' && <p className="hint">{t('Das Turnier ist beendet.')}</p>}
      {tournament.status !== 'running' && tournament.status !== 'finished' && <p className="hint">{t('Das Turnier hat noch nicht begonnen.')}</p>}
      {query.error && <Feedback error={query.error.message} />}
      {registration.participation === 'withdrawn' && <p className="hint">{t('Du pausierst gerade. Für neue Runden wirst du nicht ausgelost.')}</p>}
      {!drawn && <RegistrationPhase registration={registration} tournament={tournament} />}
      {drawn && registration.participation === 'inactive' && <p className="hint">{t('Du bist noch nicht eingecheckt.')}</p>}
      {(drawn || tournament.status === 'running') && <CurrentMatchCard key={live.currentMatch?.matchId || 'no-current-match'} live={live} participation={registration.participation}
        canReportResult={canReportResult && tournament.playerResultReportingEnabled && !tournament.documentBound && tournament.status === 'running'}
        reportingDisabled={tournament.status === 'running' && (!tournament.playerResultReportingEnabled || tournament.documentBound || tournament.desktopExecution)} path={path}
        onResultSaved={(updated) => queryClient.setQueryData(queryKey, updated)} />}
      <RankingCard live={live} tournament={tournament} />
      <HistoryCard live={live} />
      {tournament.status === 'running' && <LivePushToggle path={path} registrationId={registration.id} />}
      <div className="live-refresh">
        <span className="muted">
          {t('Stand')}: {formatClock(query.dataUpdatedAt, language)}
          {dataAsOf && <> · {t('Turnierdaten vom')} {formatClock(dataAsOf, language)}</>}
        </span>
        <Button variant="secondary" loading={query.isFetching} onClick={() => query.refetch()}>{t('Aktualisieren')}</Button>
      </div>
    </div>
  );
}

export function MyLiveList({ navigate, language, hasRemembered = false }) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['live', 'me'], queryFn: () => authenticatedApi('/api/live/me'), retry: false });
  const [rememberedEntries, setRememberedEntries] = useState(readRememberedTeams);
  // Ältere, zwischengespeicherte Antworten können noch Löschhinweise enthalten.
  // Sie dürfen in der Live-Auswahl niemals als auswählbares Turnier erscheinen.
  const registrations = (query.data?.registrations || []).filter((entry) => !entry.deleted && !entry.tournament?.deleted);

  // Prefer account access for the same registration: it also permits result reporting.
  const accountIds = new Set((query.data?.registrations || []).map((entry) => entry.id));
  const additionalRemembered = rememberedEntries.filter((entry) => !accountIds.has(entry.registrationId));

  useEffect(() => {
    if (!hasRemembered && !additionalRemembered.length && registrations.length === 1 && registrations[0].tournament.status === 'running') {
      navigate(`/live/${encodeURIComponent(registrations[0].id)}`);
    }
  }, [hasRemembered, additionalRemembered.length, navigate, registrations]);

  if (query.isPending) return <p className="muted">{t('Wird geladen…')}</p>;
  if (query.error) return <>
    <RememberedTeams navigate={navigate} language={language} entries={rememberedEntries} onChange={setRememberedEntries} />
    <Feedback error={query.error.message} />
  </>;

  if (!registrations.length) {
    // Gemerkte Links bleiben auch ohne eigene Konto-Anmeldungen erreichbar.
    return additionalRemembered.length ? <RememberedTeams navigate={navigate} language={language} entries={additionalRemembered} onChange={setRememberedEntries} />
      : hasRemembered ? null : <p className="muted">{t('Du bist aktuell in keinem Turnier gemeldet.')}</p>;
  }
  return (
    <div className="live-list">
      <RememberedTeams navigate={navigate} language={language} entries={additionalRemembered} onChange={setRememberedEntries} />
      <p className="hint live-list-hint">{t('Wähle ein Turnier aus, um die Live-Ansicht zu öffnen.')}</p>
      {registrations.map((entry) => (
        <button key={entry.id} type="button" className="panel live-list-item" onClick={() => navigate(`/live/${encodeURIComponent(entry.id)}`)}>
          <strong data-i18n-skip>{entry.tournament.name}</strong>
          {entry.deleted ? <span className="muted">{t('Das Turnier wurde vom Veranstalter gelöscht.')}</span> : (
            <span className="muted">
              {formatDate(entry.tournament.date, language)} {formatWeekdayShort(entry.tournament.date, language)}
              {entry.tournament.location ? <> · <span data-i18n-skip>{entry.tournament.location}</span></> : null}
            </span>
          )}
          {entry.label && <span data-i18n-skip>{entry.label}</span>}
          {entry.status && entry.status !== 'confirmed' && <span className="muted">{labelFor(REGISTRATION_STATUSES, entry.status)}</span>}
          {entry.participation === 'withdrawn' && <span className="live-paused">{t('Pausiert')}</span>}
          {entry.tournament.status === 'finished' && <span className="muted">{t('Beendet')}</span>}
        </button>
      ))}
    </div>
  );
}

export function RememberedTeams({ navigate, language, entries: providedEntries, onChange }) {
  const { t } = useTranslation();
  const [localEntries, setEntries] = useState(readRememberedTeams);
  const entries = providedEntries || localEntries;
  if (!entries.length) return null;
  return (
    <div className="live-list">
      <p className="hint live-list-hint">{t('Auf diesem Gerät gemerkt')}</p>
      {entries.map((entry) => (
        <div key={entry.token} className="panel live-list-item live-remembered">
          <button type="button" className="live-remembered-open" onClick={() => navigate(`/live/t/${encodeURIComponent(entry.token)}`)}>
            <strong data-i18n-skip>{entry.tournamentName}</strong>
            <span className="muted">
              {formatDate(entry.date, language)} {formatWeekdayShort(entry.date, language)}
              {entry.location ? <> · <span data-i18n-skip>{entry.location}</span></> : null}
            </span>
            {entry.label && <span data-i18n-skip>{entry.label}</span>}
          </button>
          <Button variant="secondary" onClick={() => { forgetTeam(entry.token); const remaining = readRememberedTeams(); setEntries(remaining); onChange?.(remaining); }}>{t('Vergessen')}</Button>
        </div>
      ))}
    </div>
  );
}

export function MyLiveBackLink({ navigate }) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['live', 'me'], queryFn: () => authenticatedApi('/api/live/me'), retry: false });
  const runningRegistrations = (query.data?.registrations || []).filter((entry) => entry.tournament.status === 'running');

  if (runningRegistrations.length <= 1) return null;

  return (
    <button type="button" className="drawer-link live-back" onClick={() => navigate('/live')}>← {t('Meine Turniere')}</button>
  );
}

export function PlayerLivePage({ route, language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, isAdmin, onSelectAdminDashboard, onLogout, onLogin, drawerContent, postboxControl }) {
  const { t } = useTranslation();

  // Push-Nachrichten verweisen auf /live/<Meldungs-ID>, weil der Link nur gehasht gespeichert ist: Ein auf diesem Gerät
  // gemerkter Link öffnet die Ansicht auch ohne Login.
  // Ein gemerkter Link ist der Login-freie Fallback für Push-Links. Ist der Spieler
  // angemeldet, muss /live/<Meldung> aber bewusst über sein Konto laden: Nur dieser
  // Zugriff darf eine von der Turnierleitung freigegebene Ergebnismeldung anbieten.
  const token = route.token
    || (!currentUser && route.registrationId ? readRememberedTeams().find((entry) => entry.registrationId === route.registrationId)?.token : null);
  let content;
  if (token) {
    content = <LiveDetail queryKey={['live', 'token', token]} path={`/api/live/token/${encodeURIComponent(token)}`} language={language} navigate={navigate} token={token} />;
  } else if (route.registrationId && currentUser) {
    content = <LiveDetail queryKey={['live', 'registration', route.registrationId]} path={`/api/live/registrations/${encodeURIComponent(route.registrationId)}`} language={language} navigate={navigate} canReportResult />;
  } else {
    content = currentUser ? <MyLiveList navigate={navigate} language={language} /> : (
      <>
        <RememberedTeams navigate={navigate} language={language} />
        <section className="panel live-card">
          <p>{t('Öffne den persönlichen Live-Link aus deiner Anmeldebestätigung. Mit Konto findest du deine Turniere auch hier.')}</p>
          <Button onClick={onLogin}>{t('Anmelden')}</Button>
        </section>
      </>
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
        {route.registrationId && currentUser && !token && (
          <MyLiveBackLink navigate={navigate} />
        )}
        {token && (
          <button type="button" className="drawer-link live-back" onClick={() => navigate('/live')}>← {t('Live')}</button>
        )}
        {content}
      </section>
    </main>
  );
}

export default PlayerLivePage;
