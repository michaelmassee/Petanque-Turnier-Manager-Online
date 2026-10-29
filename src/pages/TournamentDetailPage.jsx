import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TournamentEntryList } from '../components/TournamentEntryList.jsx';
import { useQuery } from '@tanstack/react-query';
import { FORMATIONS, REGISTRATION_STATUSES, REGISTRATION_TYPES, TOURNAMENT_TYPES, EMPTY_REGISTRATION_FORM } from '../lib/constants.js';
import { api, authenticatedApi } from '../lib/api.js';
import { DISPLAY_FIT_QUERY, useAutoScroll, useLivePushRefresh, useMediaQuery, useRoutedTournament } from '../lib/hooks.js';
import { isOnlinePlayable } from '../lib/pairing/index.js';
import { DISPLAY_LOCALES, REGISTRATION_OPENS_TEMPLATES, TIMEZONE_HINT_TEMPLATES, detectViewerTimeZone, formatDate, formatTournamentDateTime, formatMoney, formatWeekdayShort } from '../lib/format.js';
import { isCalendarEntry, isDocumentBound, isUpcoming, labelFor, formationLabel, hasOpenRegistration, registrationStatusKind, registrationStatusLabel, registrationStatusReason, formatTournamentStartTime, formatLocationAddress, googleMapsUrl, tournamentImageUrl, calendarEventLink } from '../lib/domain.js';
import { AccountBadge, Button, ClockIcon, Feedback, NumberIcon, RequiredMark, SearchIcon, ShareIcon, SortAlphaIcon, StarIcon } from '../components/ui.jsx';
import { loadParticipantListPrefs, nextVipFilter, saveParticipantListPrefs } from '../lib/participantListPrefs.js';
import { RichText, handleOwnLinkClick } from '../components/RichText.jsx';
import { formatUserName } from '../lib/userLabel.js';
import { StandalonePageHeader } from '../components/layout.jsx';
import { TournamentPlayerListings } from '../components/TournamentPlayerListings.jsx';
import { PublicRegistrationPanel } from '../App.jsx';
import { RegistrationOpeningReminder, TournamentRegistrationAction } from '../components/TournamentRegistrationAction.jsx';
import { CourtLabel } from '../components/CourtLabel.jsx';
import { TournamentQrPanel } from '../components/TournamentQrPanel.jsx';
import { RankingTable } from '../components/RankingTable.jsx';
import { FinalRankingView } from '../components/FinalRankingView.jsx';

export function TournamentInfo({ tournament, language, onShare, showTitle = true, shareToken = '', onNavigate, currentUser = null }) {
  const { t } = useTranslation();
  const isCalendarEntry = tournament.registrationEnabled === false;
  const mapsUrl = googleMapsUrl(tournament);
  const calendarLink = calendarEventLink(tournament, { shareToken, origin: window.location.origin,
    userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
  const placePath = `/plaetze#${encodeURIComponent(tournament.boulePlaceId || '')}`;
  const viewerTimeZone = detectViewerTimeZone();
  const tournamentTimeZone = tournament.timezone || 'UTC';
  const showTimezoneHint = Boolean(viewerTimeZone && viewerTimeZone !== tournamentTimeZone);
  const freeSlots = tournament.maxRegistrations
    ? Math.max(tournament.maxRegistrations - tournament.activeRegistrations, 0)
    : null;

  return (
    <div className="panel tournament-info-panel">
      <div className="tournament-info-top">
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
          <a
            className="icon-bar-button"
            href={calendarLink.href}
            {...(calendarLink.download ? { download: '' } : {})}
            {...(calendarLink.external ? { target: '_blank', rel: 'noreferrer' } : {})}
            title={t('Kalendereintrag erstellen')}
            aria-label={t('Kalendereintrag erstellen')}
          >
            <span aria-hidden="true">📅</span>
          </a>
          {tournament.websiteUrl && (
            <a
              className="icon-bar-button"
              href={tournament.websiteUrl}
              target="_blank"
              rel="noreferrer"
              title={tournament.websiteIsOriginalClubSite ? t('Original-Vereinswebseite öffnen') : t('Website öffnen')}
              aria-label={tournament.websiteIsOriginalClubSite ? t('Original-Vereinswebseite öffnen') : t('Website öffnen')}
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
          {tournament.contactEmail && (
            <a
              className="icon-bar-button"
              href={`mailto:${encodeURIComponent(tournament.contactEmail)}?subject=${encodeURIComponent(tournament.name)}`}
              title={t('E-Mail an die Turnierleitung')}
              aria-label={t('E-Mail an die Turnierleitung')}
            >
              <span aria-hidden="true">✉️</span>
            </a>
          )}
        </div>
      </div>
      {showTimezoneHint && <p className="hint">{(TIMEZONE_HINT_TEMPLATES[language] || TIMEZONE_HINT_TEMPLATES.de)(tournamentTimeZone)}</p>}
      {showTitle && <h2 data-i18n-skip>{tournament.name}</h2>}
      <p>
        <strong>{t('Datum')}</strong>: {formatWeekdayShort(tournament.date, language)}, {formatDate(tournament.date, language)} {formatTournamentStartTime(tournament, language)}
      </p>
      {tournament.club && (
        <p>
          <strong>{t('Verein')}</strong>: <span data-i18n-skip>{tournament.club}</span>
        </p>
      )}
      <p>
        <strong>{t('Ort')}</strong>: <span data-i18n-skip>{formatLocationAddress(tournament.location)}</span>
      </p>
      {tournament.boulePlaceId && (
        <p>
          <strong>{t('Bouleplatz')}</strong>: <a href={placePath} onClick={(event) => handleOwnLinkClick(event, placePath, onNavigate)}>{t('Bouleplatz ansehen')}</a>
        </p>
      )}
      <p>
        <strong>{t('Lizenz')}</strong>: {t(tournament.licenseRequired ? 'Ja' : 'Nein')}
      </p>
      {!isCalendarEntry && (
        <>
          {tournament.approvalRequired && <p className="hint">{t('Anmeldungen müssen vom Turnierersteller bestätigt werden.')}</p>}
          <p>
            <strong>{t('Formation')}</strong>: {formationLabel(tournament)}
          </p>
          <p>
            <strong>{t('Anmeldetyp')}</strong>: {labelFor(REGISTRATION_TYPES, tournament.registrationType)}
          </p>
          <p>
            <strong>{t('Turniersystem')}</strong>: {labelFor(TOURNAMENT_TYPES, tournament.type)}
          </p>
        </>
      )}
      {!isCalendarEntry && (
        <>
          {(tournament.feeTiers || []).map((tier) => tier.active !== false && (
            <p key={tier.id}>
              <strong>{tier.id === 'legacy-standard' ? t('Startgeld') : `${t('Startgeld')} ${tier.name}`}</strong>: {formatMoney(tier.amountCents, tournament.currency, language)}
            </p>
          ))}
          {!(tournament.feeTiers || []).length && Boolean(tournament.entryFeeCents) && (
            <p><strong>{t('Startgeld')}</strong>: {formatMoney(tournament.entryFeeCents, tournament.currency, language)}</p>
          )}
          {tournament.paymentInfo && (
            <div className="payment-info">
              <strong>{t('Zahlungshinweise')}</strong>:
              <p className="payment-info-text" data-i18n-skip>{tournament.paymentInfo}</p>
            </div>
          )}
          {tournament.registrationOpensAt && (
            <div className="tournament-info-row">
              <span><strong>{t('Anmeldung möglich ab')}</strong>: {formatTournamentDateTime(tournament.registrationOpensAt, language, tournament.timezone)}</span>
              <RegistrationOpeningReminder tournament={tournament} currentUser={currentUser} />
            </div>
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
        </>
      )}
      {(tournament.contactName || tournament.contactEmail || tournament.contactPhone) && (
        <p>
          <strong>{t('Kontakt')}</strong>: {[tournament.contactName, tournament.contactEmail, tournament.contactPhone].filter(Boolean).join(' · ')}
        </p>
      )}
      {tournament.createdBy && (
        <p>
          <strong>{t('Turnier wurde erstellt von')}</strong>: <span data-i18n-skip>{formatUserName(tournament.createdBy)}{tournament.createdBy.username && <span className="user-handle"> @{tournament.createdBy.username}</span>}</span>
        </p>
      )}
      {tournament.description && <RichText value={tournament.description} onNavigate={onNavigate} />}
    </div>
  );
}

const foldText = (value) => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function participantSearchText(participant) {
  return foldText([
    participant.teamName,
    participant.firstName, participant.lastName, participant.club,
    participant.partnerFirstName, participant.partnerLastName, participant.partnerClub,
    participant.partner2FirstName, participant.partner2LastName, participant.partner2Club,
  ].filter(Boolean).join(' '));
}

function compareByLastName(a, b) {
  const options = { sensitivity: 'base' };
  return String(a.lastName || '').localeCompare(String(b.lastName || ''), 'de', options)
    || String(a.firstName || '').localeCompare(String(b.firstName || ''), 'de', options)
    || a.number - b.number;
}

function TournamentParticipants({ tournamentId, language, timeZone, onMessage, onError }) {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState(loadParticipantListPrefs);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef(null);
  const [participants, setParticipants] = useState(null);
  const [waitlist, setWaitlist] = useState([]);
  const [pending, setPending] = useState([]);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [cancellingRegistrationId, setCancellingRegistrationId] = useState('');

  useEffect(() => {
    let cancelled = false;
    setForbidden(false);
    api(`/api/tournaments/${tournamentId}/participants`)
      .then((data) => {
        if (!cancelled) {
          setParticipants(data.participants);
          setWaitlist(data.waitlist || []);
          setPending(data.pending || []);
          setApprovalRequired(Boolean(data.approvalRequired));
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

  useEffect(() => {
    if (filterOpen) searchInputRef.current?.focus();
  }, [filterOpen]);

  function updatePrefs(changes) {
    setPrefs((current) => {
      const next = { ...current, ...changes };
      saveParticipantListPrefs(next);
      return next;
    });
  }

  function toggleFilter() {
    setFilterOpen((open) => !open);
    setQuery('');
  }

  async function handleCancelOwnRegistration(participant) {
    const label = [participant.firstName, participant.lastName].filter(Boolean).join(' ');
    if (!window.confirm(`Anmeldung "${label}" wirklich absagen?`)) {
      return;
    }
    onError?.('');
    onMessage?.('');
    setCancellingRegistrationId(participant.registrationId);
    try {
      await authenticatedApi(`/api/registrations/${participant.registrationId}/cancel`, { method: 'POST' });
      onMessage?.(t('Anmeldung wurde abgesagt.'));
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      onError?.(requestError.message);
    } finally {
      setCancellingRegistrationId('');
    }
  }

  if (forbidden) {
    return (
      <>
        <p className="muted">{t('Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.')}</p>
      </>
    );
  }

  if (!participants) {
    return (
      <>
        <p className="muted">{t('Teilnehmerliste wird geladen…')}</p>
      </>
    );
  }

  if (!participants.length && !waitlist.length && !pending.length) {
    return (
      <>
        <p className="muted">{t('Noch keine Anmeldungen.')}</p>
      </>
    );
  }

  // Lfd.-Nr. = Position in der Meldereihenfolge (API sortiert nach registered_at), unabhängig von Filter und Sortierung.
  const numberedParticipants = participants.map((participant, index) => ({ ...participant, number: index + 1 }));
  const numberedWaitlist = waitlist.map((participant, index) => ({ ...participant, number: index + 1 }));
  const numberedPending = pending.map((participant, index) => ({ ...participant, number: index + 1 }));
  const hasVip = [...participants, ...waitlist, ...pending].some((participant) => participant.isVip);
  const vipFilter = hasVip ? prefs.vip : 'all';
  const foldedQuery = foldText(query.trim());
  const visibleEntries = (list) => {
    const filtered = list.filter((participant) => (vipFilter === 'all' || (vipFilter === 'only') === Boolean(participant.isVip))
      && (!foldedQuery || participantSearchText(participant).includes(foldedQuery)));
    return prefs.sortByLastName ? [...filtered].sort(compareByLastName) : filtered;
  };
  const visibleParticipants = visibleEntries(numberedParticipants);
  const visibleWaitlist = visibleEntries(numberedWaitlist);
  const visiblePending = visibleEntries(numberedPending);
  const filtering = vipFilter !== 'all' || Boolean(foldedQuery);
  // Den Offen-Badge nur bei Bestätigungspflicht oder vorhandenen offenen Meldungen; sonst wäre er stets 0.
  const summaryItems = [
    ...(approvalRequired || pending.length > 0 ? [['pending', pending.length, t('Wartet auf Bestätigung')]] : []),
    ['confirmed', participants.length, labelFor(REGISTRATION_STATUSES, 'confirmed')],
    ['waitlist', waitlist.length, labelFor(REGISTRATION_STATUSES, 'waitlist')],
  ];
  const vipLabels = { all: t('VIP: alle'), only: t('Nur VIP'), without: t('Ohne VIP') };

  const renderParticipantRow = (participant, index) => (
    <article className={`data-row participants-row${participant.isVip ? ' participants-row-vip' : ''}${prefs.numbers && participant.number ? ' participants-row-numbered' : ''}`} key={`${participant.firstName}-${participant.lastName}-${index}`}>
      {prefs.numbers && participant.number && <span className="participant-number" aria-label={`${t('Lfd.-Nr.')} ${participant.number}`}>{participant.number}</span>}
      <div data-i18n-skip>
        <strong>
          {participant.firstName} {participant.lastName}
          {participant.accountConnected && <AccountBadge />}
        </strong>
        <span>{participant.club}</span>
        {participant.overCapacity && <small className="muted">{t('Nachmeldung der Turnierleitung')}</small>}
        {prefs.registeredAt && participant.registeredAt && (
          <small className="muted participant-registered-at">{t('Gemeldet am')} {formatTournamentDateTime(participant.registeredAt, language, timeZone)}</small>
        )}
      </div>
      {(participant.partnerFirstName || participant.partnerLastName) && (
        <div data-i18n-skip>
          <strong>
            {participant.partnerFirstName} {participant.partnerLastName}
            {participant.partnerAccountConnected && <AccountBadge />}
          </strong>
          <span>{participant.partnerClub}</span>
        </div>
      )}
      {(participant.partner2FirstName || participant.partner2LastName) && (
        <div data-i18n-skip>
          <strong>
            {participant.partner2FirstName} {participant.partner2LastName}
            {participant.partner2AccountConnected && <AccountBadge />}
          </strong>
          <span>{participant.partner2Club}</span>
        </div>
      )}
      {participant.isVip && (
        <span className="participant-vip-status">
          <span className="vip-badge">{t('VIP')}</span>
        </span>
      )}
      {participant.registrationId && (
        <Button variant="secondary" loading={cancellingRegistrationId === participant.registrationId} onClick={() => handleCancelOwnRegistration(participant)}>
          {t('Absagen')}
        </Button>
      )}
    </article>
  );

  const toolbarButton = (label, pressed, onClick, icon) => (
    <button type="button" className="participants-toolbar-button" aria-pressed={pressed} aria-label={label} title={label} onClick={onClick}>
      {icon}<span>{label}</span>
    </button>
  );

  return (
    <>
      {(participants.length > 0 || waitlist.length > 0 || pending.length > 0) && (
        <>
          <div className="participants-toolbar" role="toolbar" aria-label={t('Ansicht der Meldeliste')}>
            {toolbarButton(t('Lfd.-Nr.'), prefs.numbers, () => updatePrefs({ numbers: !prefs.numbers }), <NumberIcon />)}
            {hasVip && toolbarButton(vipLabels[vipFilter], vipFilter !== 'all', () => updatePrefs({ vip: nextVipFilter(vipFilter) }), <StarIcon crossed={vipFilter === 'without'} />)}
            {toolbarButton(t('Meldezeit'), prefs.registeredAt, () => updatePrefs({ registeredAt: !prefs.registeredAt }), <ClockIcon />)}
            {toolbarButton(t('Filter'), filterOpen, toggleFilter, <SearchIcon />)}
            {toolbarButton(t('Nach Nachname sortieren'), prefs.sortByLastName, () => updatePrefs({ sortByLastName: !prefs.sortByLastName }), <SortAlphaIcon />)}
          </div>
          {filterOpen && (
            <label className="participants-search">
              {t('Meldeliste durchsuchen')}
              <input ref={searchInputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          )}
        </>
      )}
      {filtering && !visibleParticipants.length && !visibleWaitlist.length && !visiblePending.length ? (
        <p className="muted">{t('Keine Anmeldungen passen zum Filter.')}</p>
      ) : (
        <div className="participants-list">
          {visibleParticipants.map(renderParticipantRow)}
        </div>
      )}
      {visibleWaitlist.length > 0 && (
        <>
          <h3>{t('Warteliste')}</h3>
          <div className="participants-list">
            {visibleWaitlist.map(renderParticipantRow)}
          </div>
        </>
      )}
      {visiblePending.length > 0 && (
        <>
          <h3>{t('Wartet auf Bestätigung')}</h3>
          <div className="participants-list">
            {visiblePending.map(renderParticipantRow)}
          </div>
        </>
      )}
      <div className="registration-summary" aria-label={t('Zusammenfassung')}>
        {summaryItems.map(([status, count, label]) => (
          <span key={status} className={`status registration-${status} registration-summary-item`}>
            <strong>{count}</strong> {label}
          </span>
        ))}
        <span className="registration-summary-item registration-summary-total">
          <strong>{summaryItems.reduce((sum, [, count]) => sum + count, 0)}</strong> {t('Gesamt')}
        </span>
      </div>
    </>
  );
}

function playerLabel(player) {
  if (player.teamLabel) return player.teamLabel;
  return [player.firstName, player.lastName].filter(Boolean).join(' ') || player.id;
}

/** Partien einer Runde, gruppiert nach Stufe (Poule, Turnierbaum-Runde, Gruppe) in der übertragenen Reihenfolge. */
function matchesByStage(matches) {
  const groups = new Map();
  for (const match of matches) {
    const stage = match.stageLabel || '';
    if (!groups.has(stage)) groups.set(stage, []);
    groups.get(stage).push(match);
  }
  return [...groups.entries()];
}

/**
 * Öffentlicher Spielplan: aktuelle Runde und Rangliste – für online durchgeführte Turniere wie für Turniere, die ein
 * verbundenes Turnierdokument führt (dann mit Bahn, Stufe und Rangliste aus dem Dokument).
 */
// Ganzes Turnier zum aktuellen Stand für alle (die Live-Ansicht zeigt nur das eigene Team). Lädt alle 2 Minuten neu,
// solange das Turnier läuft; unverändert antwortet der Server mit 304.
const SCHEDULE_REFRESH_MS = 120_000;
const SCHEDULE_GONE_STATUSES = [403, 404];

// Eine tagelang offene Anzeige soll nicht endlos weiter abfragen: Schluss, wenn der Spielplan nicht mehr sichtbar ist
// (privat gestellt, gelöscht) oder 8 Stunden nach Turnierbeginn (pollUntil vom Server). Neuladen holt den Stand einmal.
function isSchedulePollingPaused({ error, data }, now = Date.now()) {
  if (SCHEDULE_GONE_STATUSES.includes(error?.status)) return true;
  const pollUntil = Date.parse(data?.pollUntil || '');
  return Number.isFinite(pollUntil) && now >= pollUntil;
}

function formatClock(timestamp, language) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(DISPLAY_LOCALES[language] || DISPLAY_LOCALES.de, { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

function formatCountdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Countdown bis zum nächsten automatischen Spielplan-Abruf (useScheduleQuery), damit Zuschauer und der Bildschirm vor
 * Ort sehen, dass sich die Seite selbst aktualisiert. Nach Turnierende wird nicht mehr abgefragt, dann nichts anzeigen;
 * pausiert (siehe isSchedulePollingPaused) nur ein Hinweis zum Neuladen.
 */
export function ScheduleRefreshCountdown({ query }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const finished = query.data?.status === 'finished';
  const paused = !finished && isSchedulePollingPaused(query, now);
  const active = Boolean(query.dataUpdatedAt) && !finished && !paused;
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  if (paused) {
    return (
      <span className="schedule-refresh-countdown">
        {t('Anzeige pausiert')} – <button type="button" className="link-button" onClick={() => window.location.reload()}>{t('neu laden')}</button>
      </span>
    );
  }
  if (!active) return null;
  if (query.isFetching) return <span className="schedule-refresh-countdown">{t('wird aktualisiert …')}</span>;
  const remaining = query.dataUpdatedAt + SCHEDULE_REFRESH_MS - now;
  return (
    <span className="schedule-refresh-countdown">
      {t('nächste Aktualisierung in {{time}}', { time: formatCountdown(remaining) })}
    </span>
  );
}

// Spielplan-Abruf mit Polling und Live-Push. Die Antwort enthält auch den aktuellen Turnierstatus; die Turnierseite
// nutzt ihn (gleicher Query-Key, also kein zusätzlicher Abruf), um nach dem Start von selbst umzuschalten.
export function useScheduleQuery(tournamentId, shareToken = '', enabled = true) {
  const query = useQuery({
    queryKey: ['schedule', tournamentId, shareToken],
    queryFn: () => api(`/api/tournaments/${tournamentId}/schedule${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ''}`),
    refetchInterval: (current) => (current.state.data?.status === 'finished' || isSchedulePollingPaused(current.state) ? false : SCHEDULE_REFRESH_MS),
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: false,
    enabled: Boolean(tournamentId) && enabled,
  });
  // Turnierseite und eingebetteter Spielplan hören beide auf den Push: Ein laufender Abruf wird mitbenutzt statt
  // abgebrochen und neu gestartet, sonst gingen pro Push zwei Anfragen raus.
  useLivePushRefresh(enabled ? tournamentId : null, () => query.refetch({ cancelRefetch: false }));
  return query;
}

// display: reine Anzeige für einen Bildschirm vor Ort – ohne Bedienelemente, aktualisiert sich über Polling und Live-Push.
// Veranstalter mit Vereinslogo im Kopf von Turnierdetails und Turnierseite; gleiche Logik wie in der Turnierliste.
export function TournamentClub({ tournament, shareToken = '' }) {
  // Merkt sich die fehlgeschlagene Logo-URL, damit beim Wechsel zu einem anderen Turnier dessen Logo wieder versucht wird.
  const [brokenClubLogo, setBrokenClubLogo] = useState('');
  if (!tournament.club) return null;
  const logoUrl = tournamentImageUrl(tournament.id, 'logo', shareToken);
  return (
    <span className="tournament-detail-club">
      {tournament.logoUrl && brokenClubLogo !== logoUrl && (
        <img className="tournament-detail-club-logo" src={logoUrl} alt="" onError={(event) => setBrokenClubLogo(event.currentTarget.getAttribute('src'))} />
      )}
      {tournament.club}
    </span>
  );
}

// Ort im Turnierkopf. Schnellstart-Turniere tragen den Profilverein auch als Ort ein; steht dort nur der Vereinsname,
// zeigt die Vereinszeile (mit Logo) ihn schon und der Ort entfällt.
export function TournamentLocation({ tournament }) {
  const location = formatLocationAddress(tournament.location);
  const sameAsClub = (value) => String(value || '').trim().toLowerCase();
  if (!location || (tournament.club && sameAsClub(location) === sameAsClub(tournament.club))) return null;
  return <span>{location}</span>;
}

export function TournamentSchedule({ tournamentId, tournament, language, shareToken = '', onAnnouncement, display = false }) {
  const { t } = useTranslation();
  const query = useScheduleQuery(tournamentId, shareToken);
  // Bildschirm vor Ort im Querformat: Die Anzeige füllt den Bildschirm, Runde und Rangliste scrollen von selbst durch.
  const fitsScreen = useMediaQuery(DISPLAY_FIT_QUERY);
  const autoScroll = display && fitsScreen;
  const roundScrollRef = useAutoScroll(autoScroll);
  const rankingScrollRef = useAutoScroll(autoScroll);
  const announcement = query.data?.announcement;
  useEffect(() => {
    if (query.data) onAnnouncement?.(announcement || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcement?.text, announcement?.at, Boolean(query.data)]);

  if (query.isPending) {
    return <p className="muted">{t('Wird geladen…')}</p>;
  }
  const rounds = query.data?.rounds || [];
  const ranking = query.data?.ranking || [];
  const dataAsOf = query.data?.dataAsOf || null;
  const refresh = (
    <div className="live-refresh">
      <span className="muted">
        {t('Stand')}: {formatClock(query.dataUpdatedAt, language)}
        {dataAsOf && <> · {t('Turnierdaten vom')} {formatTournamentDateTime(dataAsOf, language, tournament?.timezone)}</>}
        {query.data?.status !== 'finished' && <>{' · '}<ScheduleRefreshCountdown query={query} /></>}
      </span>
      {!display && <Button variant="secondary" loading={query.isFetching} onClick={() => query.refetch()}>{t('Aktualisieren')}</Button>}
    </div>
  );

  if (!rounds.length) {
    return (
      <div className={`play-schedule${display ? ' is-display' : ''}`}>
        <Feedback error={query.error?.message} />
        {refresh}
        <p className="muted">{t(query.data?.status === 'running' || query.data?.status === 'finished'
          ? 'Noch keine Runde gestartet.' : 'Das Turnier hat noch nicht begonnen. Spielplan und Rangliste erscheinen hier nach dem Start.')}</p>
        {display && query.data?.status !== 'finished' && Array.isArray(query.data?.entries)
          && <TournamentEntryList entries={query.data.entries} scrollRef={roundScrollRef} />}
      </div>
    );
  }

  const currentRound = rounds[rounds.length - 1];
  const showRanking = ranking.length > 0 && tournament?.type !== 'ko';
  // Bildschirm vor Ort nach Turnierende: statt der letzten Runde nur noch die komplette Rangliste über die volle Breite.
  const finalStanding = display && showRanking && query.data?.status === 'finished';

  if (finalStanding) {
    return (
      <div className="play-schedule is-display">
        <Feedback error={query.error?.message} />
        {refresh}
        <div className="display-columns">
          <section className="display-ranking">
            <h2>{t('Endrangliste')}</h2>
            <div className="display-scroll" ref={rankingScrollRef}>
              <div className="table-scroll">
                <RankingTable tournament={tournament} entries={ranking} />
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // Turnierseite und Bildschirm-Anzeige zeigen nur die aktuelle Runde und die Rangliste. Das Layout passt sich der
  // Breite an: Partien als Kartenraster, auf breiten Bildschirmen Runde und Rangliste nebeneinander.
  return (
    <div className={`play-schedule${display ? ' is-display' : ''}`}>
      <Feedback error={query.error?.message} />
      {/* Oben, damit auch der Bildschirm vor Ort ohne Scrollen zeigt, wie aktuell er ist und wann er neu lädt. */}
      {refresh}
      <div className={`display-columns${showRanking ? ' has-ranking' : ''}`}>
        <section className="display-current-round">
          <h2>{t('Runde')} {currentRound.roundNumber}</h2>
          <div className="display-scroll" ref={roundScrollRef}>
            <ScheduleRoundMatches round={currentRound} />
          </div>
        </section>
        {showRanking && (
          <section className="display-ranking">
            <h2>{t('Rangliste')}</h2>
            <div className="display-scroll" ref={rankingScrollRef}>
              <div className="table-scroll">
                <RankingTable tournament={tournament} entries={ranking} />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ScheduleRoundMatches({ round }) {
  const { t } = useTranslation();
  return matchesByStage(round.matches).map(([stage, matches]) => (
    <section key={stage || 'ohne-stufe'} className="schedule-stage">
      {stage && <h3 data-i18n-skip>{stage}</h3>}
      <div className="schedule-match-grid">
        {matches.map((match) => (
          <article className="data-row" key={match.id}>
            <div>
              <CourtLabel court={match.court} className="play-schedule-court" />
              <strong>{match.teamA.map(playerLabel).join(' + ')}</strong>
              <span>{match.teamB.length ? t('gegen') : t('Freilos')}</span>
              <strong>{match.teamB.map(playerLabel).join(' + ')}</strong>
            </div>
            <div>{match.noShow ? t('Nicht angetreten') : match.scoreA != null ? `${match.scoreA}:${match.scoreB}` : t('Offen')}</div>
          </article>
        ))}
      </div>
    </section>
  ));
}

export function TournamentDetailPage({
  turnstileSiteKey,
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
  registrationSaving,
  message,
  error,
  registrationInvalidField,
  setMessage,
  setError,
  isAdmin,
  onSelectAdminDashboard,
  onLogout,
  drawerContent,
  postboxControl,
}) {
  const { t } = useTranslation();
  const shareToken = new URLSearchParams(window.location.search).get('share') || '';
  const shareSuffix = shareToken ? `?share=${encodeURIComponent(shareToken)}` : '';
  const detailPath = (view) => `/turniere/${route.id}/${view}${shareSuffix}`;
  const { tournament, notFound } = useRoutedTournament(route.id, tournaments, shareToken);

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
          isAdmin={isAdmin}
          onSelectAdminDashboard={onSelectAdminDashboard}
          onLogout={onLogout}
          drawerContent={drawerContent}
          postboxControl={postboxControl}
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
          isAdmin={isAdmin}
          onSelectAdminDashboard={onSelectAdminDashboard}
          onLogout={onLogout}
          drawerContent={drawerContent}
          postboxControl={postboxControl}
        />
      </main>
    );
  }

  const canRegister = (tournament.visibility === 'public' || Boolean(shareToken)) && tournament.registrationEnabled !== false && hasOpenRegistration(tournament);
  const canShowParticipants = (tournament.participantsPublic || tournament.canManage) && tournament.registrationEnabled !== false;
  // Der letzte Reiter wechselt mit dem Status – vor dem Start Mitspielgesuche, nach dem Veröffentlichen die
  // Endrangliste. Spielplan und Ankündigungen stehen auf der eigenen Turnierseite (/turnierseite/<id>).
  const started = tournament.status === 'running' || tournament.status === 'finished';
  // Mitspieler suchen lohnt nur, solange man noch mitspielen kann: bei Online-Anmeldung, solange sie möglich ist;
  // bei Kalendereinträgen (Anmeldung außerhalb) bis zum Turniertag.
  const registrationKind = registrationStatusKind(tournament);
  const canShowPlayerListings = tournament.visibility === 'public'
    && (['open', 'waitlist', 'upcoming'].includes(registrationKind) || (registrationKind === 'calendar' && !started && isUpcoming(tournament)));
  // Mit verbundenem Turnierdokument auch für Systeme ohne Online-Durchführung (Poule, Kaskade, …).
  const rankingPublished = Boolean(tournament.rankingPublishedAt);
  const availableViews = {
    info: true,
    anmelden: canRegister,
    teilnehmer: canShowParticipants,
    mitspieler: canShowPlayerListings,
    // Veröffentlichte Endrangliste: öffentlich, auch ohne „Teilnehmer öffentlich“.
    rangliste: rankingPublished,
  };
  // Alte Links (z. B. /mitspieler nach dem Start) landen auf Info statt auf einer leeren Seite.
  const view = availableViews[route.view] ? route.view : 'info';
  // Wer über den Anmelde-/QR-Link kommt, obwohl gerade keine Anmeldung möglich ist, landet auf Info – mit Grund.
  const registrationUnavailable = route.view === 'anmelden' && view !== 'anmelden';

  async function handleShare() {
    setError('');
    setMessage('');
    let shareUrl = window.location.href;
    // Verwalter teilen den festen Link /q/<qr_token> (derselbe wie im QR-Code), der sich nie ändert; bei privaten
    // Turnieren aktiviert das zugleich den Freigabe-Link. Öffentliche Entwürfe sind noch nicht teilbar.
    if (tournament.canManage && (tournament.status !== 'draft' || tournament.visibility === 'private')) {
      try {
        shareUrl = (await authenticatedApi(`/api/tournaments/${tournament.id}/share-link`, { method: 'POST' })).shareUrl;
      } catch (shareError) {
        setError(shareError.message);
        return;
      }
    }
    const shareText = `${tournament.name}\n${shareUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: tournament.name, text: shareText });
      } catch (shareError) {
        if (shareError.name !== 'AbortError') {
          setError(shareError.message);
        }
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setMessage(t('Link kopiert'));
    } catch {
      setError(t('Teilen wird von diesem Gerät nicht unterstützt'));
    }
  }

  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={t('Turnierdetails')}
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

      <Feedback message={message} error={error} />

      <section className="tournament-detail-page">
        <header className="tournament-detail-heading">
          <p className="eyebrow">{t('Turnierdetails')}</p>
          <h1 data-i18n-skip>{tournament.name}</h1>
          <p className="tournament-detail-meta" data-i18n-skip>
            <span>{formatWeekdayShort(tournament.date, language)}, {formatDate(tournament.date, language)} {formatTournamentStartTime(tournament, language)}</span>
            <TournamentClub tournament={tournament} shareToken={shareToken} />
            <TournamentLocation tournament={tournament} />
          </p>
        </header>
        <nav className="tournament-detail-tabs" aria-label={t('Turnierdetails')}>
          {[
            ['info', t('Info')],
            ['anmelden', t('Anmeldung')],
            ['teilnehmer', t('Teilnehmer')],
            ['mitspieler', t('Mitspieler')],
            ['rangliste', t('Rangliste')],
          ].filter(([key]) => availableViews[key]).map(([key, label]) => (
            <button
              key={key}
              className={`tournament-detail-tab ${view === key ? 'active' : ''}`}
              type="button"
              aria-current={view === key ? 'page' : undefined}
              onClick={() => navigate(detailPath(key))}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="tournament-detail-content">
          {registrationUnavailable && (
            <p className="feedback offline registration-unavailable">
              {tournament.registrationEnabled === false
                ? t('Für dieses Turnier gibt es keine Online-Anmeldung.')
                : `${t('Eine Online-Anmeldung ist derzeit nicht möglich:')} ${registrationStatusLabel(tournament, language)}${registrationStatusReason(tournament, language) ? ` (${registrationStatusReason(tournament, language)})` : ''}`}
            </p>
          )}
          {view === 'info' && <TournamentInfo tournament={tournament} language={language} onShare={handleShare} showTitle={false} shareToken={shareToken} onNavigate={navigate} currentUser={currentUser} />}
          {/* Eigenes Panel unter der Beschreibung; Kalendereinträge haben keine Anmeldung, auf die der feste Link führt. */}
          {view === 'info' && !isCalendarEntry(tournament) && <TournamentQrPanel tournament={tournament} shareToken={shareToken} />}
          {/* Angemeldete erreichen die Erinnerung als Glocke hinter „Anmeldung möglich ab“, hier nur noch der Anmelden-Knopf. */}
          {view === 'info' && tournament.registrationOpeningPending && !currentUser && <TournamentRegistrationAction tournament={tournament} currentUser={currentUser} onRegister={() => navigate(detailPath('anmelden'))} />}

          {view === 'anmelden' && (
            <PublicRegistrationPanel
              turnstileSiteKey={turnstileSiteKey}
              shareToken={shareToken}
              tournament={tournament}
              form={registrationForm}
              setForm={setRegistrationForm}
              onSubmit={(event) => onSubmitRegistration(event, shareToken)}
              saving={registrationSaving}
              onCancel={() => navigate(detailPath('info'))}
              navigate={navigate}
              language={language}
              currentUser={currentUser}
              invalidField={registrationInvalidField}
            />
          )}

          {view === 'teilnehmer' && (
            <>
              <p className="hint">
                {t('Diese Teilnehmerliste ist öffentlich sichtbar und ohne Anmeldung einsehbar. Wer hier nicht aufgeführt werden möchte, wende sich bitte direkt an den Veranstalter dieses Turniers.')}
              </p>
              <TournamentParticipants tournamentId={tournament.id} language={language} timeZone={tournament.timezone} onMessage={setMessage} onError={setError} />
            </>
          )}

          {view === 'mitspieler' && <TournamentPlayerListings tournament={tournament} currentUser={currentUser} navigate={navigate} />}

          {view === 'rangliste' && <FinalRankingView tournament={tournament} language={language} shareToken={shareToken} />}
        </div>
      </section>
    </main>
  );
}

export default TournamentDetailPage;
