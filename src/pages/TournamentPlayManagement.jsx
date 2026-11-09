import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, authenticatedApi } from '../lib/api.js';
import { TextField, Button, Feedback, AccountBadge, EditIcon, QrIcon, ParticipationIcon, SelectField } from '../components/ui.jsx';
import { RegistrationEditDialog } from '../components/RegistrationEditDialog.jsx';
import { LiveQrDialog } from '../components/LiveQrDialog.jsx';
import { tournamentBoardPath } from '../lib/routing.js';
import { TournamentPicker } from '../components/TournamentPicker.jsx';
import { ACTIVE_REGISTRATION_STATUSES, normalizePlayerName, registrationUnit } from '../registration-core.js';
import { NotOnlinePlayableNotice } from '../components/NotOnlinePlayableNotice.jsx';
import { checkRoundRequirements, isMeleeTeamTournament, isOnlinePlayable, minimumTeams } from '../lib/pairing/index.js';
import { FORMATIONS, PARTICIPATIONS, REGISTRATION_TYPES, TOURNAMENT_TYPES } from '../lib/constants.js';
import { isCalendarEntry, isDocumentBound, labelFor, sanitizeScore, translatedOptions } from '../lib/domain.js';
import { AnnouncementEditor } from '../components/TournamentAnnouncement.jsx';
import { DEFAULT_TOURNAMENT_OPTIONS, TournamentOptionsPanel } from '../components/TournamentOptionsPanel.jsx';
import { CourtLabel } from '../components/CourtLabel.jsx';
import { normalizeRanking } from '../lib/live-ranking.js';
import { RankingTable } from '../components/RankingTable.jsx';
import { formatTournamentDateTime } from '../lib/format.js';
import { meleeTeamSize } from '../lib/pairing/melee.js';
import { RegistrationPlayerPicker } from '../components/RegistrationPlayerPicker.jsx';
import { InfiniteListLoadMore, useInfiniteList } from '../components/InfiniteListLoadMore.jsx';
import { PHONE_QUERY, useMediaQuery, useTournamentLiveSocket } from '../lib/hooks.js';
import { QrImageShare } from '../components/TournamentQrPanel.jsx';
import { RoundTable, pairingNumbers } from '../components/RoundTable.jsx';
import { DEFAULT_QR_DESIGN } from '../lib/qr-design.js';

// Rendert ein Anforderungs-Objekt aus checkRoundRequirements() generisch, ohne
// Systemwissen: 'minPlayers' trägt die Mindestanzahl als Zahl statt fest im Satz
// eingebacken zu sein (verschiedene Systeme/Formationen können unterschiedliche
// Mindestanzahlen haben), 'message' ist ein fertiger, übersetzbarer Freitext für
// alles, was sich nicht in ein generisches Muster fassen lässt.
// count: aktuelle Zahl (aktive Meldungen bzw. ausgeloste Mêlée-Teams), damit klar ist, wie viele fehlen.
function requirementText(requirement, t, { teams = false, count = 0 } = {}) {
  if (requirement.type === 'minPlayers') {
    if (teams) return t('Es werden mindestens {{min}} Teams benötigt, ausgelost sind {{count}}.', { min: requirement.min, count });
    return t('Es werden mindestens {{min}} aktive Meldungen benötigt, aktiv sind {{count}}.', { min: requirement.min, count });
  }
  return t(requirement.text);
}

const isNotOnlinePlayable = (tournament) => !isOnlinePlayable(tournament);

const EMPTY_QUICK_PLAYER = {
  firstName: '', lastName: '', licenseNr: '',
  partnerFirstName: '', partnerLastName: '', partnerLicenseNr: '',
  partner2FirstName: '', partner2LastName: '', partner2LicenseNr: '',
  playerSelections: {},
};

// Personen einer Nachmeldung nach der Anmeldeeinheit (registrationUnit): einzeln bei Tête, Mêlée und Supermêlée, sonst
// ein Team – Doublette mit Partner, Triplette mit Partner und optional Partner 2 (Team mit 2 Personen ist zulässig).
function quickPlayerSlots(tournament) {
  const unit = registrationUnit(tournament);
  if (unit.kind === 'single') return [{ prefix: '', label: null, required: true }];
  return [
    { prefix: '', label: 'Spieler', required: true },
    { prefix: 'partner', label: 'Partner', required: true },
    ...(unit.max >= 3 ? [{ prefix: 'partner2', label: 'Partner 2', required: false }] : []),
  ];
}

const quickPlayerKey = (prefix, field) => (prefix ? `${prefix}${field[0].toUpperCase()}${field.slice(1)}` : field);

// Nachmeldung schon vorhanden? Namen normalisiert wie in registrationConflicts, gegen alle Personen aktiver Meldungen
// (auch Warteliste und nicht aktive Teilnehmer). Gleichnamige Personen gibt es, daher nur eine Rückfrage.
function alreadyRegisteredNames(registrations, quickPlayer, slots) {
  const registered = new Set(registrations
    .filter((registration) => ACTIVE_REGISTRATION_STATUSES.includes(registration.status))
    .flatMap((registration) => ['', 'partner', 'partner2'].map((prefix) => normalizePlayerName(
      registration[quickPlayerKey(prefix, 'firstName')], registration[quickPlayerKey(prefix, 'lastName')])))
    .filter(Boolean));
  return slots
    .map(({ prefix }) => [quickPlayer[quickPlayerKey(prefix, 'firstName')], quickPlayer[quickPlayerKey(prefix, 'lastName')]])
    .filter(([first, last]) => registered.has(normalizePlayerName(first, last)))
    .map(([first, last]) => `${first.trim()} ${last.trim()}`);
}

// Spieler aus Runden tragen ihre fertige Bezeichnung (teamLabel). Meldungen der Teilnehmerliste bestehen bei
// Doublette/Triplette (Formée) aus einer Meldung mit Partnerfeldern: alle Spieler nennen, ein Teamname steht davor.
function playerLabel(player) {
  if (player.teamLabel) return player.teamLabel;
  const names = [[player.firstName, player.lastName], [player.partnerFirstName, player.partnerLastName], [player.partner2FirstName, player.partner2LastName]]
    .map((parts) => parts.filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' + ');
  const label = names || player.id;
  return player.teamName ? `${player.teamName} (${label})` : label;
}

function teamLabel(team) {
  return team.map(playerLabel).join(' + ');
}

// Link zur Turnierseite (Spielplan, Rangliste, Ankündigungen) zum Teilen mit Spielern und Zuschauern. Er trägt den
// Anzeige-Schlüssel des Turniers: Die Seite öffnet sich ohne Anmeldung und ohne veröffentlichte Teilnehmerliste, auch
// die Bildschirm-Anzeige, z. B. auf einem Rechner vor Ort. Den Schlüssel bekommt nur die Turnierleitung.
function TournamentBoardShare({ tournament }) {
  const { t } = useTranslation();
  // Am Handy zugeklappt, damit Runden und Ergebnisse oben stehen; am PC offen.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(!isPhone);
  const [displayUrl, setDisplayUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [displayBusy, setDisplayBusy] = useState(false);
  const [displayError, setDisplayError] = useState('');
  const path = tournamentBoardPath(tournament.id);
  async function resolveDisplayUrl() {
    const { displayToken } = await authenticatedApi(`/api/tournaments/${tournament.id}/display-link`, { method: 'POST' });
    const url = new URL(path, window.location.origin);
    url.searchParams.set('share', displayToken);
    return url.href;
  }
  // QR-Code erst beim Aufklappen: Der Link braucht den Schlüssel vom Server.
  useEffect(() => {
    setDisplayUrl('');
    if (!open) return undefined;
    let cancelled = false;
    setDisplayError('');
    setQrLoading(true);
    resolveDisplayUrl()
      .then((url) => { if (!cancelled) setDisplayUrl(url); })
      .catch((err) => { if (!cancelled) setDisplayError(err.message); })
      .finally(() => { if (!cancelled) setQrLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- neu laden nur bei anderem Turnier oder Aufklappen
  }, [tournament.id, open]);
  async function openDisplay() {
    // Fenster sofort im Klick öffnen, sonst blockt der Popup-Blocker; die Adresse folgt, sobald der Schlüssel da ist.
    const displayWindow = window.open('', '_blank');
    setDisplayError('');
    setDisplayBusy(true);
    try {
      const url = displayUrl || await resolveDisplayUrl();
      if (displayWindow) {
        displayWindow.opener = null;
        displayWindow.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (err) {
      displayWindow?.close();
      setDisplayError(err.message);
    } finally {
      setDisplayBusy(false);
    }
  }
  return (
    <details className="panel tournament-board-share" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{t('Turnierseite und Anzeige')}</summary>
      <p>
        <Button variant="secondary" loading={displayBusy} onClick={openDisplay}>{t('Anzeige für Bildschirm')}</Button>
        {' '}<span className="muted">{t('Ohne Menü, z. B. für einen zweiten Bildschirm vor Ort; aktualisiert sich selbst.')}</span>
      </p>
      <p className="hint">
        {t('Anzeige und geteilter Link öffnen Spielplan und Rangliste ohne Anmeldung, auch wenn die Teilnehmerliste nicht veröffentlicht ist. Gib den Link nur weiter, wenn die Teilnehmer ihn sehen dürfen.')}
      </p>
      <Feedback error={displayError} />
      {/* Wie das QR-Panel der Turnierseite (Info): Bild mit Turniername, Teilen, PNG, Link kopieren. */}
      <div className="tournament-qr-panel tournament-board-qr">
        {qrLoading && <p className="muted">{t('Wird geladen…')}</p>}
        {displayUrl && <QrImageShare url={displayUrl} design={DEFAULT_QR_DESIGN} title={tournament.name} label={t('QR-Code zur Turnierseite')} />}
      </div>
    </details>
  );
}

function isMatchDecided(match) {
  return match.scoreA != null || match.scoreB != null || match.noShow;
}

function isRoundComplete(round) {
  return round.matches.every(isMatchDecided);
}

// Bahn der Partie: bei Spielbahn „Leer“ (L) händisch eintragen, gespeichert beim Verlassen des Felds; sonst Anzeige der
// Bahn bzw. ohne Bahn der laufenden Paarungsnummer wie im Hauptprojekt („Nur laufende Nr“).
function MatchCourt({ match, number, manual, duplicate = false, onSaveCourt }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(match.court || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setValue(match.court || ''), [match.court]);
  if (!manual) {
    if (match.court) return <CourtLabel court={match.court} className="play-match-court" as="div" />;
    return number ? <div className="play-match-court" data-i18n-skip><strong>#{number}</strong></div> : null;
  }
  if (!match.teamB?.length) return null;
  async function save() {
    if (value.trim() === (match.court || '')) return;
    setError('');
    setSaving(true);
    try {
      await onSaveCourt(match.id, value.trim());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="play-match-court">
      <label>
        {t('Bahn')}
        <input type="text" className={`court-input${duplicate ? ' is-duplicate' : ''}`} value={value} maxLength={40} disabled={saving} aria-busy={saving}
          aria-invalid={duplicate || undefined} title={duplicate ? t('Bahn doppelt vergeben') : undefined}
          onChange={(event) => setValue(event.target.value)} onBlur={save}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
      </label>
      {duplicate && <span className="court-duplicate-hint">{t('Bahn doppelt vergeben')}</span>}
      <Feedback error={error} />
    </div>
  );
}

function MatchRow({ match, number, draft, onChange, onSave, busy, isNewReport, manualCourt = false, duplicateCourt = false, onSaveCourt }) {
  const { t } = useTranslation();
  const scoreA = draft?.scoreA ?? String(match.scoreA ?? '');
  const scoreB = draft?.scoreB ?? String(match.scoreB ?? '');
  const decided = isMatchDecided(match);
  const isDraw = scoreA !== '' && scoreB !== '' && scoreA === scoreB;

  return (
    <article className={`play-match${match.reportedBy ? ' is-player-reported' : ''}${isNewReport ? ' is-new-report' : ''}`}>
      {match.stageLabel && <div className="play-match-stage" data-i18n-skip>{match.stageLabel}</div>}
      <MatchCourt match={match} number={number} manual={manualCourt} duplicate={duplicateCourt} onSaveCourt={onSaveCourt} />
      {match.reportedBy && (
        <p className="play-report-badge">
          {isNewReport && <span className="play-report-new">{t('Neu')}</span>}
          <span>{t('Ergebnis gemeldet von')} <strong data-i18n-skip>{playerLabel(match.reportedBy)}</strong></span>
        </p>
      )}
      <div className="play-match-teams">
        <div className="play-team" data-i18n-skip>{match.teamALabel ?? teamLabel(match.teamA)}</div>
        <div className="play-vs">{t('gegen')}</div>
        <div className="play-team is-second" data-i18n-skip>{match.teamBLabel ?? teamLabel(match.teamB)}</div>
      </div>

      <div className="play-result-row">
        <input
          className="score-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{0,2}"
          maxLength={2}
          value={scoreA}
          disabled={busy}
          onChange={(event) => onChange({ scoreA: sanitizeScore(event.target.value) })}
          aria-label={t('Punkte Team A')}
        />
        <span className="play-score-sep">:</span>
        <input
          className="score-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{0,2}"
          maxLength={2}
          value={scoreB}
          disabled={busy}
          onChange={(event) => onChange({ scoreB: sanitizeScore(event.target.value) })}
          aria-label={t('Punkte Team B')}
        />
        <Button
          disabled={busy || scoreA === '' || scoreB === '' || isDraw}
          loading={busy}
          onClick={async () => {
            const keptResult = await onSave(match.id, { scoreA: Number(scoreA), scoreB: Number(scoreB) });
            if (keptResult) {
              onChange(null);
            }
          }}
        >
          {decided ? t('Ergebnis ändern') : t('Ergebnis speichern')}
        </Button>
      </div>

      <Feedback error={isDraw ? t('Unentschieden ist nicht möglich') : ''} />
    </article>
  );
}

// Sortierung der Partien in den Runden-Panels, auf dem Gerät gemerkt: Bahn-Nr. (ohne Bahn die Begegnungsnummer) oder
// Nachname von Spieler 1 des ersten Teams, damit die Turnierleitung ein Team schnell findet.
const ROUND_SORT_KEY = 'ptm_round_sort';
const ROUND_SORT_OPTIONS = [{ value: 'court', label: 'Bahn-Nr.' }, { value: 'name', label: 'Nachname Spieler 1' }];

function readRoundSort() {
  try {
    return localStorage.getItem(ROUND_SORT_KEY) === 'name' ? 'name' : 'court';
  } catch {
    return 'court';
  }
}

function sortRoundMatches(matches, numbers, sortBy) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const byNumber = (a, b) => (numbers.get(a.id) ?? Infinity) - (numbers.get(b.id) ?? Infinity);
  if (sortBy === 'name') {
    const key = (match) => [match.teamA?.[0]?.lastName, match.teamA?.[0]?.firstName].filter(Boolean).join(' ');
    return [...matches].sort((a, b) => collator.compare(key(a), key(b)) || byNumber(a, b));
  }
  // Bahnen natürlich sortiert (2 vor 10), Partien ohne Bahn (Freilos) dahinter.
  const court = (match) => (match.court || '').trim();
  return [...matches].sort((a, b) => (Boolean(court(b)) - Boolean(court(a))) || collator.compare(court(a), court(b)) || byNumber(a, b));
}

// collapseDecided (laufende Runde): Partien mit gespeichertem Ergebnis wandern in ein zugeklapptes Panel, damit oben nur
// noch die offenen stehen. Neue Spielermeldungen bleiben sichtbar, bis die Turnierleitung sie als gesehen markiert.
function RoundResults({ round, onSave, onSaveAll, onRefresh, busy, refreshing, onConfirmReports, confirmingReports = false, collapseDecided = false, manualCourt = false, onSaveCourt }) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState({});
  const [sortBy, setSortBy] = useState(readRoundSort);
  function changeSort(value) {
    setSortBy(value);
    try {
      localStorage.setItem(ROUND_SORT_KEY, value);
    } catch {
      // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
    }
  }
  const changes = round.matches.filter((match) => drafts[match.id]).map((match) => ({
    matchId: match.id,
    scoreA: drafts[match.id].scoreA ?? String(match.scoreA ?? ''),
    scoreB: drafts[match.id].scoreB ?? String(match.scoreB ?? ''),
  })).filter((draft) => {
    const match = round.matches.find((entry) => entry.id === draft.matchId);
    return draft.scoreA !== String(match.scoreA ?? '') || draft.scoreB !== String(match.scoreB ?? '');
  });
  const invalid = changes.some((draft) => draft.scoreA === '' || draft.scoreB === '' || draft.scoreA === draft.scoreB);
  function changeDraft(matchId, draft) {
    setDrafts((current) => {
      const next = { ...current };
      if (draft) next[matchId] = { ...current[matchId], ...draft };
      else delete next[matchId];
      return next;
    });
  }
  // Unbestätigte Spielermeldungen (Server-Kennzeichen): erst nach „Gesehen“ öffentlich (E-27).
  const newReports = round.matches.filter((match) => match.reportPending).length;
  const isCollapsed = (match) => isMatchDecided(match) && !match.reportPending;
  const numbers = new Map(pairingNumbers(round.matches).map((number, index) => [round.matches[index].id, number]));
  const sortedMatches = sortRoundMatches(round.matches, numbers, sortBy);
  const openMatches = sortedMatches.filter((match) => !isCollapsed(match));
  const decidedMatches = sortedMatches.filter(isCollapsed);
  // Wie die Duplikat-Prüfung im Hauptprojekt (COUNTIF > 1 auf nicht leeren Bahnzellen): doppelte Bahn rot markieren.
  const courtKey = (match) => (match.court || '').trim().toLowerCase();
  const courtCounts = round.matches.reduce((counts, match) => (courtKey(match) ? counts.set(courtKey(match), (counts.get(courtKey(match)) || 0) + 1) : counts), new Map());
  const matchRow = (match) => <MatchRow key={match.id} match={match} number={numbers.get(match.id)} draft={drafts[match.id]} onChange={(draft) => changeDraft(match.id, draft)} onSave={onSave} busy={busy} isNewReport={match.reportPending} manualCourt={manualCourt} duplicateCourt={(courtCounts.get(courtKey(match)) || 0) > 1} onSaveCourt={onSaveCourt} />;
  return (
    <>
      {newReports > 0 && (
        <div className="play-report-banner" role="status">
          <span>
            {t('Neue Ergebnismeldungen von Teams: {{count}}', { count: newReports })}
            <small className="play-report-banner-hint">{t('Turnierseite und Rangliste zeigen sie erst nach „Gesehen“.')}</small>
          </span>
          <Button variant="secondary" disabled={busy} loading={confirmingReports} onClick={onConfirmReports}>{t('Gesehen')}</Button>
        </div>
      )}
      <div className="play-round-buttons" role="group" aria-label={t('Rundenaktionen')}>
        <Button disabled={busy || refreshing || !changes.length || invalid} loading={busy} onClick={async () => {
          const cleared = await onSaveAll(round, changes);
          setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !cleared.includes(id))));
        }}>{t('Alle speichern')}</Button>
        {onRefresh && <Button variant="secondary" disabled={busy} loading={refreshing} onClick={onRefresh}>{t('Aktualisieren')}</Button>}
        <label className="play-round-sort">
          {t('Sortieren nach')}
          <select value={sortBy} onChange={(event) => changeSort(event.target.value)}>
            {ROUND_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
          </select>
        </label>
      </div>
      {collapseDecided ? (
        <>
          {openMatches.length > 0
            ? <div className="play-match-list">{openMatches.map(matchRow)}</div>
            : <p className="hint play-all-decided">{t('Alle Ergebnisse dieser Runde sind erfasst.')}</p>}
          {decidedMatches.length > 0 && (
            <details className="play-decided-matches">
              <summary className="play-round-summary"><span>{t('Erfasste Ergebnisse')}</span><span className="counter">{decidedMatches.length}</span></summary>
              <div className="play-match-list">{decidedMatches.map(matchRow)}</div>
            </details>
          )}
        </>
      ) : <div className="play-match-list">{sortedMatches.map(matchRow)}</div>}
    </>
  );
}

/**
 * Endrangliste nach Turnierende einfrieren und öffentlich machen, auf Wunsch mit Mail-Link, Postfach und Push an alle
 * bestätigten Teilnehmer. Ein erneuter Versand muss ausdrücklich bestätigt werden.
 */
// Nach Turnierende klappt die Rangliste zum Veröffentlichen auf. Danach schließt nur der Nutzer sie wieder – sonst
// verschwände die Erfolgsmeldung des Veröffentlichens im zugeklappten Panel.
function RankingPanel({ openInitially, children }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(openInitially);
  useEffect(() => {
    if (openInitially) setOpen(true);
  }, [openInitially]);
  return (
    <details className="panel ranking-panel" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="play-round-summary"><span>{t('Rangliste')}</span></summary>
      {children}
    </details>
  );
}

export function FinalRankingPublisher({ tournament, onPublished }) {
  const { t, i18n } = useTranslation();
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const sharesPrivately = tournament.visibility === 'private';

  if (tournament.type === 'ko' || isDocumentBound(tournament)) return null;
  if (tournament.status !== 'finished') {
    return <p className="muted">{t('Nach Turnierende kannst du hier die Endrangliste veröffentlichen.')}</p>;
  }

  async function publish(resend = false) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      // Der Versand an die Teilnehmer ist ein Teilen: bei privaten Turnieren wie beim Teilen-Button den Freigabe-Link
      // aktivieren (der Hinweis unter der Checkbox sagt das), sonst lehnt der Server den Versand ab.
      if (notify && sharesPrivately) await authenticatedApi(`/api/tournaments/${tournament.id}/share-link`, { method: 'POST' });
      await authenticatedApi(`/api/tournaments/${tournament.id}/ranking/publish`, { method: 'POST', body: JSON.stringify({ notify, resend }) });
      setMessage(notify ? t('Endrangliste veröffentlicht und an die Teilnehmer gesendet.') : t('Endrangliste veröffentlicht.'));
      await onPublished?.();
    } catch (requestError) {
      if (requestError.payload?.details?.code === 'ranking_already_mailed') {
        if (window.confirm(t('Die Endrangliste wurde bereits an die Teilnehmer gesendet. Noch einmal senden?'))) await publish(true);
        return;
      }
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="final-ranking-publish">
      {tournament.rankingPublishedAt && (
        <p className="muted">
          {t('Veröffentlicht am')} {formatTournamentDateTime(tournament.rankingPublishedAt, i18n.language, tournament.timezone)}
          {' · '}
          <a href={`/turniere/${encodeURIComponent(tournament.id)}/rangliste`}>{t('Endrangliste ansehen')}</a>
        </p>
      )}
      <label className="checkbox-field">
        <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
        {t('An alle bestätigten Teilnehmer senden (E-Mail, Postfach, Push)')}
      </label>
      {notify && sharesPrivately && (
        <p className="hint">{t('Privates Turnier: Der Versand aktiviert den Freigabe-Link, damit die Teilnehmer die Endrangliste ohne Anmeldung öffnen können.')}</p>
      )}
      <Feedback message={message} />
      <Feedback error={error} />
      <Button disabled={busy} loading={busy} onClick={() => publish()}>
        {tournament.rankingPublishedAt ? t('Endrangliste erneut veröffentlichen') : t('Endrangliste veröffentlichen')}
      </Button>
    </div>
  );
}

export default function TournamentPlayManagement({ tournaments: managedTournaments, currentUserId, currentUser, turnstileSiteKey, focus = null }) {
  const { t, i18n } = useTranslation();
  // Kalendereinträge sind reine Termine ohne Teilnehmer und tauchen hier gar nicht auf.
  const allTournaments = managedTournaments.filter((tournament) => !isCalendarEntry(tournament));
  // Nur Turniere mit implementiertem Paarungssystem sind online spielbar (siehe isOnlinePlayable). Die übrigen stehen
  // trotzdem in der Auswahl – rot als „nicht online durchführbar“ markiert, mit Grund statt Start-Button.
  // Mit einem Turnierdokument verbundene Turniere führt das Dokument – schon ab dem Verbinden, nicht erst ab seinem
  // Start.
  const tournaments = allTournaments.filter((tournament) => isOnlinePlayable(tournament) && !isDocumentBound(tournament));
  const nonPlayableTournaments = allTournaments.filter((tournament) => !isOnlinePlayable(tournament));
  const desktopExecutionTournaments = allTournaments.filter((tournament) => isOnlinePlayable(tournament) && isDocumentBound(tournament));
  const pickerTournaments = [...tournaments, ...nonPlayableTournaments];
  const [selectedTournamentId, setSelectedTournamentId] = useState((tournaments[0] || nonPlayableTournaments[0])?.id || '');
  // Aus einer Push-Benachrichtigung gewähltes Turnier übernehmen, sobald es in der Liste ist.
  const focusTournamentId = focus?.tournamentId || '';
  const focusAvailable = tournaments.some((tournament) => tournament.id === focusTournamentId);
  useEffect(() => {
    if (focusAvailable) setSelectedTournamentId(focusTournamentId);
  }, [focus, focusTournamentId, focusAvailable]);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [redrawing, setRedrawing] = useState(false);
  const [bulkParticipation, setBulkParticipation] = useState('');
  const [participationBusyId, setParticipationBusyId] = useState('');
  const [editRegistrationId, setEditRegistrationId] = useState('');
  const [liveQrRegistration, setLiveQrRegistration] = useState(null);
  const [quickPlayer, setQuickPlayer] = useState(EMPTY_QUICK_PLAYER);
  // Eine Auswahl aus der Namenssuche gilt nur für das Turnier, für das sie geladen wurde.
  useEffect(() => setQuickPlayer(EMPTY_QUICK_PLAYER), [selectedTournamentId]);
  const participantsRef = useRef(null);
  // Der `tournaments`-Prop kommt vom Elternteil und wird nicht sofort neu geladen,
  // nachdem hier der Status auf "Läuft" gesetzt wurde - deshalb lokal vormerken,
  // welche Turniere in dieser Sitzung bereits gestartet wurden.
  const [startedTournamentIds, setStartedTournamentIds] = useState(() => new Set());
  // Gespeicherte Turnieroptionen je Turnier – aus demselben Grund lokal nachgeführt.
  const [savedOptions, setSavedOptions] = useState({});

  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedTournamentId) || null;
  const selectedNonPlayable = nonPlayableTournaments.find((tournament) => tournament.id === selectedTournamentId) || null;
  const quickSlots = selectedTournament ? quickPlayerSlots(selectedTournament) : [];
  const isTeamQuickAdd = quickSlots.length > 1;
  const selectedTournamentStatus = selectedTournament
    ? (startedTournamentIds.has(selectedTournament.id) ? 'running' : selectedTournament.status)
    : null;
  const tournamentOptions = useMemo(() => {
    if (!selectedTournament) return DEFAULT_TOURNAMENT_OPTIONS;
    const fromTournament = Object.fromEntries(Object.keys(DEFAULT_TOURNAMENT_OPTIONS)
      .filter((key) => selectedTournament[key] !== undefined).map((key) => [key, selectedTournament[key]]));
    return { ...DEFAULT_TOURNAMENT_OPTIONS, ...fromTournament, ...savedOptions[selectedTournament.id] };
  }, [selectedTournament, savedOptions]);
  const courtMode = tournamentOptions.courtMode;

  const queryKey = ['tournament-play', selectedTournamentId];
  const roundsQuery = useQuery({
    queryKey: [...queryKey, 'rounds'],
    queryFn: ({ signal }) => api(`/api/tournaments/${selectedTournamentId}/rounds`, { signal }),
    enabled: Boolean(selectedTournament),
    refetchOnWindowFocus: !busy,
    staleTime: 30_000,
  });
  const rounds = roundsQuery.data?.rounds || [];
  const [confirmingReports, setConfirmingReports] = useState(false);
  const swissTeams = roundsQuery.data?.teams || [];
  // Teamnummer wie bei der Team-Anzeige „Teamnummer“: Reihenfolge der festen Teams (Formée ab der ersten Runde,
  // Mêlée ab der Auslosung). Vorher gibt es noch keine feste Nummer.
  // Teamnummer: bei Formée die feste Nummer der Meldung (ab Anmeldung), bei Mêlée die des ausgelosten Teams.
  const teamNumberByRegistration = new Map(swissTeams.flatMap((team, index) => (team.members || []).map((id) => [id, team.number ?? index + 1])));
  const teamNumberOf = (registration) => registration.teamNumber ?? teamNumberByRegistration.get(registration.id);
  const rankingQuery = useQuery({
    // Structural query keys keep the ranking cached when a refresh changes no results.
    queryKey: [...queryKey, 'ranking', roundsQuery.data?.rounds],
    // live=1: auch nach dem Veröffentlichen der Endrangliste den aktuellen Stand zeigen (Korrekturen sichtbar).
    queryFn: ({ signal }) => authenticatedApi(`/api/tournaments/${selectedTournamentId}/ranking?live=1`, { signal }),
    enabled: Boolean(selectedTournament) && roundsQuery.isSuccess && !busy,
    refetchOnWindowFocus: false,
    // Alte Rangliste stehen lassen, bis die neue da ist - sonst flackert die Tabelle nach jedem Ergebnis.
    placeholderData: keepPreviousData,
  });
  const registrationsQuery = useQuery({
    queryKey: [...queryKey, 'registrations'],
    queryFn: ({ signal }) => authenticatedApi(`/api/tournaments/${selectedTournamentId}/registrations`, { signal }),
    enabled: Boolean(selectedTournament),
    refetchOnWindowFocus: false,
  });
  const ranking = rankingQuery.data?.ranking || [];
  const confirmedRegistrations = (registrationsQuery.data?.registrations || [])
    .filter((registration) => registration.status === 'confirmed');
  const registrationsById = new Map((registrationsQuery.data?.registrations || []).map((registration) => [registration.id, registration]));
  const editRegistration = registrationsById.get(editRegistrationId) || null;
  const visibleConfirmedRegistrations = useInfiniteList(confirmedRegistrations);
  const queryError = roundsQuery.error || rankingQuery.error || registrationsQuery.error;

  useEffect(() => {
    setMessage('');
    setError('');
  }, [selectedTournamentId]);

  useEffect(() => {
    if (!navigator.serviceWorker) return;
    // Push "Ergebnis gemeldet": nur dann einmal nachladen - kein Polling.
    const refreshReported = (event) => {
      if (event.data?.type !== 'tournament-result-reported' || event.data.tournamentId !== selectedTournamentId) return;
      queryClient.invalidateQueries({ queryKey: ['tournament-play', selectedTournamentId, 'rounds'] }, { cancelRefetch: false });
    };
    navigator.serviceWorker.addEventListener('message', refreshReported);
    return () => navigator.serviceWorker.removeEventListener('message', refreshReported);
  }, [queryClient, selectedTournamentId]);
  // Sofort-Aktualisierung: Spielermeldungen (und Eingaben anderer Geräte) erscheinen ohne Push-Abo und ohne Polling.
  useTournamentLiveSocket(
    selectedTournamentId && selectedTournamentStatus === 'running' ? `/api/tournaments/${encodeURIComponent(selectedTournamentId)}/schedule/socket` : null,
    () => queryClient.invalidateQueries({ queryKey: ['tournament-play', selectedTournamentId, 'rounds'] }, { cancelRefetch: false }),
  );

  async function loadData(tournamentId) {
    await queryClient.invalidateQueries({ queryKey: ['tournament-play', tournamentId] });
  }

  // Ein abgeschlossenes Turnier lässt sich wieder aufnehmen (z. B. zu früh abgeschlossen); der Server zieht dabei eine
  // veröffentlichte Endrangliste zurück. Deshalb nur nach Rückfrage.
  async function handleStartTournament() {
    const resume = selectedTournamentStatus === 'finished';
    if (resume && !window.confirm(t('Turnier wieder aufnehmen? Eine veröffentlichte Endrangliste wird zurückgezogen, bis du das Turnier erneut abschließt.'))) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await authenticatedApi(`/api/tournaments/${selectedTournamentId}/start`, { method: 'POST' });
      setStartedTournamentIds((current) => new Set(current).add(selectedTournamentId));
      // Der Start checkt alle noch inaktiven bestätigten Meldungen ein; ohne Neuladen stünden sie hier weiter auf "Inaktiv".
      await queryClient.invalidateQueries({ queryKey: [...queryKey, 'registrations'] });
      if (resume) await queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      setMessage(resume ? t('Turnier wurde wieder aufgenommen.') : t('Turnier wurde gestartet.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleParticipationChange(registrationId, participation) {
    setBusy(true);
    setParticipationBusyId(registrationId);
    setError('');
    try {
      await authenticatedApi(`/api/registrations/${registrationId}/participation`, {
        method: 'PUT',
        body: JSON.stringify({ participation }),
      });
      queryClient.setQueryData([...queryKey, 'registrations'], (current) => ({
        ...current,
        registrations: current.registrations.map((registration) => (registration.id === registrationId ? { ...registration, participation } : registration)),
      }));
      // Vor der ersten Runde löst der Server das Mêlée-Team eines nicht mehr aktiven Spielers auf.
      if (canEditMeleeTeams && swissTeams.length) await queryClient.invalidateQueries({ queryKey: [...queryKey, 'rounds'] });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setParticipationBusyId('');
    }
  }

  async function handleRegistrationSaved(savedMessage) {
    setEditRegistrationId('');
    setMessage(savedMessage);
    await queryClient.invalidateQueries({ queryKey: [...queryKey, 'registrations'] });
    // Mêlée-Teams zeigen die Spielernamen; nach einer Namenskorrektur auch die Teams neu laden.
    if (isMelee) await queryClient.invalidateQueries({ queryKey: [...queryKey, 'rounds'] });
  }

  // Alle bestätigten Meldungen auf einmal (de)aktivieren; ausgesetzte bleiben ausgesetzt.
  async function handleAllParticipation(participation) {
    setBusy(true);
    setBulkParticipation(participation);
    setError('');
    try {
      await authenticatedApi(`/api/tournaments/${selectedTournamentId}/participation`, {
        method: 'PUT',
        body: JSON.stringify({ participation }),
      });
      queryClient.setQueryData([...queryKey, 'registrations'], (current) => ({
        ...current,
        registrations: current.registrations.map((registration) => (
          registration.status === 'confirmed' && registration.participation !== 'withdrawn' ? { ...registration, participation } : registration
        )),
      }));
      if (canEditMeleeTeams && swissTeams.length) await queryClient.invalidateQueries({ queryKey: [...queryKey, 'rounds'] });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setBulkParticipation('');
    }
  }

  async function handleQuickPlayerSubmit(event) {
    event.preventDefault();
    if (!selectedTournamentId) return;
    const duplicates = alreadyRegisteredNames(registrationsQuery.data?.registrations || [], quickPlayer, quickSlots);
    if (duplicates.length && !window.confirm(t('Bereits angemeldet: {{names}}. Trotzdem hinzufügen?', { names: duplicates.join(', ') }))) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api(`/api/tournaments/${selectedTournamentId}/registrations`, {
        method: 'POST',
        body: JSON.stringify({
          // Über die Namenssuche ausgewählte Konten wie in der Anmeldeverwaltung (registrationPayload).
          ...(Object.keys(quickPlayer.playerSelections).length ? { playerSelections: quickPlayer.playerSelections } : {}),
          firstName: quickPlayer.firstName,
          lastName: quickPlayer.lastName,
          licenseNr: quickPlayer.licenseNr || null,
          ...(isTeamQuickAdd ? {
            partnerFirstName: quickPlayer.partnerFirstName,
            partnerLastName: quickPlayer.partnerLastName,
            partnerLicenseNr: quickPlayer.partnerLicenseNr || null,
            partner2FirstName: quickPlayer.partner2FirstName || null,
            partner2LastName: quickPlayer.partner2LastName || null,
            partner2LicenseNr: quickPlayer.partner2LicenseNr || null,
          } : {}),
          noEmail: true,
          confirmImmediately: true,
          language: i18n.language,
          // Ohne diese beiden Felder lehnt resolveFeeSelections()/resolveRegistrationAnswers()
          // in worker.js die Neuanlage ab ("Ungültige Startgeld-Auswahl"/"Ungültige
          // Teilnehmerantworten") - bei einer Neuanmeldung (kein existing) verlangen beide
          // zwingend ein Array, auch ein leeres.
          feeSelections: [],
          registrationAnswers: [],
        }),
      });
      setQuickPlayer(EMPTY_QUICK_PLAYER);
      const added = result.registration;
      setMessage(isTeamQuickAdd
        ? `${t('Team hinzugefügt:')} ${[[added.firstName, added.lastName], [added.partnerFirstName, added.partnerLastName], [added.partner2FirstName, added.partner2LastName]]
          .filter(([first]) => first).map((name) => name.join(' ')).join(' + ')}`
        : `${t('Spieler hinzugefügt:')} ${added.firstName} ${added.lastName}`);
      await loadData(selectedTournamentId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleNewRound() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await queryClient.cancelQueries({ queryKey: [...queryKey, 'rounds'] });
      const data = await authenticatedApi(`/api/tournaments/${selectedTournamentId}/rounds`, { method: 'POST' });
      queryClient.setQueryData([...queryKey, 'rounds'], (current) => ({ ...current, rounds: data.rounds }));
      if (participantsRef.current) participantsRef.current.open = false;
      setMessage(t('Neue Runde wurde erstellt.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Aktuelle Runde neu auslosen, solange noch kein Ergebnis eingetragen ist (z. B. ein Spieler fehlt doch).
  async function handleRedrawRound() {
    if (!window.confirm(t('Runde {{round}} neu auslosen? Die bisherige Einteilung wird ersetzt.', { round: currentRound.roundNumber }))) return;
    setRedrawing(true);
    setError('');
    setMessage('');
    try {
      await queryClient.cancelQueries({ queryKey: [...queryKey, 'rounds'] });
      const data = await authenticatedApi(`/api/tournaments/${selectedTournamentId}/rounds/redraw`, { method: 'POST' });
      queryClient.setQueryData([...queryKey, 'rounds'], (current) => ({ ...current, rounds: data.rounds, teams: data.teams ?? current?.teams }));
      // Mêlée: Passen die Teams nicht mehr zu den aktiven Spielern, nimmt der Server die erste Runde zurück.
      setMessage(data.roundWithdrawn
        ? t('Runde 1 wurde zurückgenommen, weil die Mêlée-Teams nicht mehr zu den aktiven Spielern passen. Bitte Teams auslosen und Runde 1 neu starten.')
        : t('Runde {{round}} wurde neu ausgelost.', { round: currentRound.roundNumber }));
    } catch (err) {
      setError(err.message);
    } finally {
      setRedrawing(false);
    }
  }

  // Abschließen ist auch mit offener aktueller Runde möglich (z. B. Zeitlimit); deren Spiele ohne Ergebnis zählen
  // nicht für die Rangliste. Nutzt denselben Statuswechsel wie die Turnierverwaltung (inkl. Statusmeldungen).
  async function handleFinishTournament() {
    const question = currentRoundOpen
      ? t('In der aktuellen Runde fehlen noch Ergebnisse. Diese Spiele zählen nicht für die Rangliste. Turnier trotzdem abschließen?')
      : t('Turnier abschließen? Danach können keine weiteren Runden gestartet werden.');
    if (!window.confirm(question)) return;
    setFinishing(true);
    setError('');
    setMessage('');
    try {
      await authenticatedApi(`/api/tournaments/${selectedTournamentId}/publication`, {
        method: 'PUT', body: JSON.stringify({ status: 'finished', visibility: selectedTournament.visibility }),
      });
      await queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      setMessage(t('Turnier abgeschlossen. Im Bereich „Rangliste“ kannst du jetzt die Endrangliste veröffentlichen.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setFinishing(false);
    }
  }

  // Rückfragen wie die Mêlée-Übernahme im Hauptprojekt: doppelte Namen und – ohne Freilos – Neu-Auslosen aller Teams,
  // wenn ein Nachzügler sonst kein eigenes Team bekäme. Der Server meldet beides als 409 mit code.
  async function handleDrawMeleeTeams() {
    setBusy(true); setError(''); setMessage('');
    try {
      await queryClient.cancelQueries({ queryKey: [...queryKey, 'rounds'] });
      const options = {};
      let data = null;
      while (!data) {
        try {
          data = await authenticatedApi(`/api/tournaments/${selectedTournamentId}/teams/draw`, { method: 'POST', body: JSON.stringify(options) });
        } catch (err) {
          const details = err.payload?.details;
          if (err.status === 409 && details?.code === 'melee_duplicate_names' && !options.allowDuplicateNames) {
            if (!window.confirm(t('Doppelte Namen: {{names}}. Trotzdem auslosen?', { names: details.names.join(', ') }))) return;
            options.allowDuplicateNames = true;
          } else if (err.status === 409 && details?.code === 'melee_redraw_required' && !options.confirmRedraw) {
            if (!window.confirm(t('Neue Spieler: {{players}} – ohne Freilos ist daraus kein eigenes Team möglich. Die {{teams}} bisherigen Mêlée-Teams werden deshalb zusammen mit den neuen Spielern komplett neu ausgelost, die Teamzusammensetzung ändert sich. Fortfahren?', {
              players: details.newPlayers, teams: details.teams,
            }))) return;
            options.confirmRedraw = true;
          } else {
            throw err;
          }
        }
      }
      queryClient.setQueryData([...queryKey, 'rounds'], (current) => ({ ...current, teams: data.teams || [] }));
      setMessage(t(data.redrawn
        ? 'Alle Mêlée-Teams wurden neu ausgelost: {{total}} Teams. {{open}} aktive Spieler ohne Team.'
        : '{{drawn}} Mêlée-Teams ausgelost, insgesamt {{total}} Teams. {{open}} aktive Spieler ohne Team.', {
        drawn: data.drawnCount, total: data.teams.length, open: data.unassignedCount,
      }));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function handleResetMeleeTeams() {
    if (!window.confirm(t('Alle ausgelosten Mêlée-Teams auflösen? Alle Spieler sind danach wieder ohne Team.'))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await queryClient.cancelQueries({ queryKey: [...queryKey, 'rounds'] });
      await authenticatedApi(`/api/tournaments/${selectedTournamentId}/teams`, { method: 'DELETE' });
      queryClient.setQueryData([...queryKey, 'rounds'], (current) => ({ ...current, teams: [] }));
      setMessage(t('Mêlée-Teams wurden aufgelöst.'));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  function confirmResultOverwrite(result, match) {
    const existing = result.noShow ? t('Nicht angetreten') : `${result.scoreA}:${result.scoreB}`;
    const matchup = match ? `${match.teamALabel ?? teamLabel(match.teamA)} ${t('gegen')} ${match.teamBLabel ?? teamLabel(match.teamB)}\n` : '';
    return window.confirm(matchup + t('Für diese Partie liegt bereits ein Ergebnis vor: {{result}}. Möchtest du es wirklich überschreiben?', { result: existing }));
  }

  // Händische Bahn (Spielbahn „Leer“). Fehler zeigt die Partie selbst an.
  async function handleSaveCourt(matchId, court) {
    const data = await authenticatedApi(`/api/tournaments/${selectedTournamentId}/matches/${matchId}/court`, {
      method: 'PUT', body: JSON.stringify({ court }),
    });
    queryClient.setQueryData([...queryKey, 'rounds'], (current) => ({ ...current, rounds: data.rounds }));
  }

  async function handleSaveResult(matchId, result) {
    const match = rounds.flatMap((round) => round.matches).find((entry) => entry.id === matchId);
    let expectedResult = { scoreA: match?.scoreA ?? null, scoreB: match?.scoreB ?? null, noShow: match?.noShow ?? null };
    let confirmOverwrite = expectedResult.scoreA != null || expectedResult.scoreB != null || Boolean(expectedResult.noShow);
    if (confirmOverwrite && !confirmResultOverwrite(expectedResult, match)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await queryClient.cancelQueries({ queryKey: [...queryKey, 'rounds'] });
      const save = () => authenticatedApi(`/api/tournaments/${selectedTournamentId}/matches/${matchId}/result`, {
        method: 'PUT', body: JSON.stringify({ ...result, expectedResult, confirmOverwrite }),
      });
      let data;
      try {
        data = await save();
      } catch (err) {
        const details = err.payload?.details;
        if (err.status !== 409 || details?.code !== 'result_confirmation_required' || !details.currentResult) throw err;
        expectedResult = details.currentResult;
        queryClient.setQueryData([...queryKey, 'rounds'], (current) => ({
          ...current,
          rounds: current.rounds.map((round) => ({ ...round, matches: round.matches.map((entry) => entry.id === matchId ? { ...entry, ...expectedResult } : entry) })),
        }));
        // Abgelehnt: Die Zeile zeigt danach das tatsächlich gespeicherte Ergebnis statt der Eingabe.
        if (!confirmResultOverwrite(expectedResult, match)) return expectedResult;
        confirmOverwrite = true;
        data = await save();
      }
      queryClient.setQueryData([...queryKey, 'rounds'], (current) => ({ ...current, rounds: data.rounds }));
      return { ...result, noShow: null };
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // „Gesehen“: bestätigt alle offenen Spielermeldungen, erst dann erscheinen sie auf Turnierseite und Rangliste.
  async function handleConfirmReports() {
    setConfirmingReports(true);
    setError('');
    setMessage('');
    try {
      // Nur die angezeigten Meldungen: Eine inzwischen eingegangene bleibt bis zum nächsten „Gesehen“ offen.
      const matchIds = rounds.flatMap((round) => round.matches).filter((match) => match.reportPending).map((match) => match.id);
      const data = await authenticatedApi(`/api/tournaments/${selectedTournamentId}/result-reports/confirm`, {
        method: 'POST', body: JSON.stringify({ matchIds }),
      });
      queryClient.setQueryData([...queryKey, 'rounds'], (current) => ({ ...current, rounds: data.rounds }));
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmingReports(false);
    }
  }

  async function handleSaveAll(round, changes) {
    const cleared = [];
    let savedCount = 0;
    let failed = false;
    const pending = [];
    for (const change of changes) {
      const match = round.matches.find((entry) => entry.id === change.matchId);
      const expectedResult = { scoreA: match.scoreA ?? null, scoreB: match.scoreB ?? null, noShow: match.noShow ?? null };
      const confirmOverwrite = expectedResult.scoreA != null || expectedResult.scoreB != null || Boolean(expectedResult.noShow);
      if (confirmOverwrite && !confirmResultOverwrite(expectedResult, match)) continue;
      pending.push({ matchId: match.id, scoreA: Number(change.scoreA), scoreB: Number(change.scoreB), expectedResult, confirmOverwrite });
    }
    if (!pending.length) return cleared;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await queryClient.cancelQueries({ queryKey: [...queryKey, 'rounds'] });
      const saveBatch = async (results) => {
        const data = await authenticatedApi(`/api/tournaments/${selectedTournamentId}/rounds/${round.id}/results`, {
          method: 'PUT', body: JSON.stringify({ results }),
        });
        queryClient.setQueryData([...queryKey, 'rounds'], (current) => ({ ...current, rounds: data.rounds }));
        cleared.push(...data.savedMatchIds);
        savedCount += data.savedMatchIds.length;
        return data;
      };
      for (let index = 0; index < pending.length; index += 25) {
        const batch = pending.slice(index, index + 25);
        const data = await saveBatch(batch);
        const retry = [];
        for (const conflict of data.conflicts) {
          if (!conflict.currentResult) throw new Error(t('Spiel nicht gefunden'));
          if (!confirmResultOverwrite(conflict.currentResult, round.matches.find((entry) => entry.id === conflict.matchId))) {
            cleared.push(conflict.matchId);
            continue;
          }
          retry.push({ ...batch.find((entry) => entry.matchId === conflict.matchId), expectedResult: conflict.currentResult, confirmOverwrite: true });
        }
        if (retry.length) {
          const retried = await saveBatch(retry);
          if (retried.conflicts.length) throw new Error(t('Für diese Partie liegt bereits ein anderes Ergebnis vor. Bitte bestätige das Überschreiben.'));
        }
      }
    } catch (err) {
      failed = true;
      const progress = savedCount ? `${t('Gespeicherte Ergebnisse: {{count}}.', { count: savedCount })} ` : '';
      setError(progress + err.message);
    } finally {
      if (savedCount && !failed) setMessage(t('Gespeicherte Ergebnisse: {{count}}.', { count: savedCount }));
      setBusy(false);
    }
    return cleared;
  }

  if (!pickerTournaments.length) {
    return (
      <div className="panel">
        <p className="muted">{t('Keine Turniere mit Online-Durchführung verfügbar.')}</p>
        {desktopExecutionTournaments.length > 0 && (
          <p className="hint">{t('Dieses Turnier wird nicht online durchgeführt. Der Spielplan wird im Turnierdokument geführt.')}</p>
        )}
      </div>
    );
  }

  const currentRound = rounds[rounds.length - 1] || null;
  const currentRoundOpen = currentRound ? !isRoundComplete(currentRound) : false;
  // Freilose tragen ihr Ergebnis automatisch und zählen nicht als eingetragenes Ergebnis.
  const currentRoundHasResults = Boolean(currentRound?.matches.some((match) => match.teamB?.length && isMatchDecided(match)));
  const activeConfirmedCount = confirmedRegistrations.filter((registration) => registration.participation === 'active').length;
  const inactiveConfirmedCount = confirmedRegistrations.filter((registration) => registration.participation === 'inactive').length;
  // Mêlée: aktive Spieler werden schrittweise zu festen Teams ausgelost (wie die Mêlée-Übernahme im Hauptprojekt).
  const isMelee = Boolean(selectedTournament) && isMeleeTeamTournament(selectedTournament);
  const meleeSize = meleeTeamSize(selectedTournament?.formation) || 2;
  const assignedPlayerIds = new Set(swissTeams.flatMap((team) => team.members || []));
  const openMeleePlayers = confirmedRegistrations.filter((registration) => registration.participation === 'active' && !assignedPlayerIds.has(registration.id)).length;
  const requiredMeleePlayers = meleeSize * (selectedTournament ? minimumTeams(selectedTournament) : 0);
  const canEditMeleeTeams = isMelee && !rounds.length;
  // Nach Turnierstart wie im Hauptprojekt nur noch neue Teams anhängen – in Systemen, die jede Runde neu paaren.
  const canDrawLateMeleeTeams = isMelee && rounds.length > 0 && ['schweizer', 'formule_x'].includes(selectedTournament?.type);
  const mixedMelee = ['DOUBLETTE_OHNE_FREILOS', 'TRIPLETTE_OHNE_FREILOS'].includes(tournamentOptions.meleeTeamMode);
  // Ohne Freilos braucht ein neues Team mindestens 4 Spieler; vor Runde 1 reicht ein Nachzügler (Neu-Auslosen aller Teams).
  const minOpenForDraw = mixedMelee ? (canEditMeleeTeams && swissTeams.length ? 1 : 4) : meleeSize;
  const canDrawMeleeTeams = (canEditMeleeTeams || canDrawLateMeleeTeams) && openMeleePlayers >= minOpenForDraw;
  const missingMeleeDraw = isMelee && swissTeams.length === 0;

  // Voraussetzungen für "Neue Runde starten" proaktiv prüfen, damit der Turniersteller
  // sofort sieht, was fehlt, statt es erst nach einem Fehlschlag zu erfahren. Die
  // eigentlichen Regeln (Mindestspielerzahl, gültige Teamaufteilung, ...) stammen aus
  // checkRoundRequirements() - system-spezifisch je nach PAIRING_STRATEGIES-Eintrag,
  // hier bleibt der Check bewusst generisch, damit künftige Online-Turniersysteme
  // keine Anpassung an dieser Stelle brauchen. Nur aktive Meldungen zählen, analog zum
  // Hauptprojekt (nur Meldungen mit Spieltag-Status "JA" gehen in die Rundenauslosung ein).
  const strategyRequirementGaps = selectedTournament && selectedTournamentStatus === 'running' && !missingMeleeDraw
    ? checkRoundRequirements(selectedTournament, isMelee ? swissTeams.length : activeConfirmedCount, rounds.length, { teamCount: swissTeams.length })
    : [];
  const openResultCount = currentRound ? currentRound.matches.filter((match) => !isMatchDecided(match)).length : 0;
  const missingRequirements = [
    ...strategyRequirementGaps.map((requirement) => requirementText(requirement, t, { teams: isMelee, count: isMelee ? swissTeams.length : activeConfirmedCount })),
    // Häufigste Ursache: bestätigte Meldungen, die (noch) nicht aktiv sind, zählen für die Auslosung nicht mit.
    ...(strategyRequirementGaps.length && !isMelee && inactiveConfirmedCount
      ? [t('{{count}} bestätigte Meldungen sind inaktiv und zählen nicht mit – unter „Teilnehmer“ aktivieren.', { count: inactiveConfirmedCount })]
      : []),
    ...(selectedTournamentStatus === 'running' && currentRoundOpen
      ? [t('Bitte zuerst alle Ergebnisse der aktuellen Runde eintragen ({{count}} offen).', { count: openResultCount })]
      : []),
    ...(missingMeleeDraw ? [t('Bitte zuerst Mêlée-Teams auslosen')] : []),
  ];

  const canGenerateRound = selectedTournamentStatus === 'running' && !currentRoundOpen && strategyRequirementGaps.length === 0 && !missingMeleeDraw;
  const olderRoundsNewestFirst = rounds.slice(0, -1).reverse();
  const showRoundAction = selectedTournamentStatus === 'running';

  function RoundAction() {
    if (!showRoundAction) return null;
    return (
      <div className="play-round-action">
        {missingRequirements.length > 0 && (
          <div className="round-requirements">
            <strong>{t('Die Runde kann noch nicht gestartet werden:')}</strong>
            <ul>
              {missingRequirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
            </ul>
          </div>
        )}
        <Button disabled={busy || finishing || redrawing || !selectedTournamentId || !canGenerateRound} loading={busy} onClick={handleNewRound}>
          {currentRound ? t('Nächste Runde starten') : t('Erste Runde starten')}
        </Button>
        {currentRound && !currentRoundHasResults && (
          <Button variant="secondary" disabled={busy || finishing || redrawing} loading={redrawing} onClick={handleRedrawRound}>
            {t('Aktuelle Runde neu auslosen')}
          </Button>
        )}
        {currentRound && (
          <Button variant="secondary" disabled={busy || finishing || redrawing} loading={finishing} onClick={handleFinishTournament}>
            {t('Turnier abschließen')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="play-manage">
      <div className="panel play-toolbar">
        <TournamentPicker
          label={t('Turnier')}
          tournaments={pickerTournaments}
          isUnavailable={isNotOnlinePlayable}
          value={selectedTournamentId}
          onChange={setSelectedTournamentId}
          currentUserId={currentUserId}
        />
        {selectedTournament && selectedTournamentStatus !== 'running' && (
          <div className="play-toolbar-actions">

            <Button disabled={busy || !selectedTournamentId} loading={busy} onClick={handleStartTournament}>
              {selectedTournamentStatus === 'finished' ? t('Turnier wieder aufnehmen') : t('Turnier starten')}
            </Button>
          </div>
        )}
        {selectedTournamentStatus === 'running' && (
          <div className="play-toolbar-actions">
            <p className="hint">
              {t('Bestätigte Meldungen')} · {labelFor(REGISTRATION_TYPES, selectedTournament.registrationType)} · {labelFor(TOURNAMENT_TYPES, selectedTournament.type)} · {labelFor(FORMATIONS, selectedTournament.formation)}: {confirmedRegistrations.length} ({activeConfirmedCount} {t('aktiv')})
              {selectedTournament.type === 'schweizer' && ` · ${t(selectedTournament.schweizerRankingMode === 'ohne_buchholz' ? 'Ohne Buchholz' : 'Mit Buchholz und Feinbuchholz')}`}
            </p>
            {(canEditMeleeTeams || canDrawLateMeleeTeams) && (
              <>
                <Button variant="secondary" disabled={busy || !canDrawMeleeTeams} loading={busy} onClick={handleDrawMeleeTeams}>{t('Mêlée-Teams auslosen')}</Button>
                {canEditMeleeTeams && swissTeams.length > 0 && <Button variant="secondary" disabled={busy} loading={busy} onClick={handleResetMeleeTeams}>{t('Auslosung zurücksetzen')}</Button>}
              </>
            )}
          </div>
        )}
      </div>

      {selectedNonPlayable && (
        <NotOnlinePlayableNotice
          title={t('{{name}} kann nicht online durchgeführt werden.', { name: selectedNonPlayable.name })}
          system={labelFor(TOURNAMENT_TYPES, selectedNonPlayable.type)}
        />
      )}
      {!tournaments.length && desktopExecutionTournaments.length > 0 && (
        <p className="hint">{t('Dieses Turnier wird nicht online durchgeführt. Der Spielplan wird im Turnierdokument geführt.')}</p>
      )}

      <Feedback message={message} error={error || queryError?.message} />

      {selectedTournament && <TournamentBoardShare tournament={selectedTournament} />}
      {/* Ankündigungen schon vor dem Turnierstart, damit der Veranstalter vorab informieren kann. */}
      {selectedTournament && selectedTournamentStatus !== 'finished' && <AnnouncementEditor tournament={selectedTournament} />}
      {selectedTournament && selectedTournamentStatus !== 'finished' && (
        <TournamentOptionsPanel tournament={selectedTournament} options={tournamentOptions}
          onSaved={(options) => {
            setSavedOptions((current) => ({ ...current, [selectedTournament.id]: options }));
            // Optionen wirken sofort (Bahnen, Team-Anzeige, Freilos-Punkte): Runden und Rangliste neu laden.
            queryClient.invalidateQueries({ queryKey });
          }} />
      )}

      {canEditMeleeTeams && selectedTournamentStatus === 'running' && (
        <p className="hint">
          {t('Mêlée: {{teams}} Teams ausgelost, {{open}} aktive Spieler ohne Team. Für die erste Runde werden mindestens {{required}} Spieler in Teams benötigt.', {
            teams: swissTeams.length, open: openMeleePlayers, required: requiredMeleePlayers,
          })}
        </p>
      )}
      {canEditMeleeTeams && selectedTournamentStatus === 'running' && swissTeams.length > 0 && (
        <details className="panel round-participants melee-teams">
          <summary className="play-round-summary"><span>{t('Ausgeloste Mêlée-Teams')}</span><span className="counter">{swissTeams.length}</span></summary>
          <div className="round-participant-list">
            {swissTeams.map((team, index) => (
              <div className="round-participant-row" key={team.id}>
                <span className="muted">{t('Team')} {index + 1}</span>
                <span data-i18n-skip>{team.members.map((id) => playerLabel(registrationsById.get(id) || { id: '?' })).join(' + ')}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {selectedTournamentStatus === 'running' && (
        <details key={`participants:${selectedTournamentId}`} ref={participantsRef} className="panel round-participants" open={focus?.openParticipants && focusTournamentId === selectedTournamentId}>
          <summary className="play-round-summary"><span>{t('Teilnehmer')}</span><span className="counter">{activeConfirmedCount}</span></summary>
          <form className={`quick-player-form${isTeamQuickAdd ? ' is-team' : ''}`} onSubmit={handleQuickPlayerSubmit}>
            {quickSlots.map(({ prefix, label, required }) => {
              const value = (field) => quickPlayer[quickPlayerKey(prefix, field)];
              const set = (field) => (next) => setQuickPlayer({ ...quickPlayer, [quickPlayerKey(prefix, field)]: next });
              // Partner 2 ist optional; wer dort etwas einträgt, muss den Namen aber vollständig angeben.
              const needed = required || Boolean(value('firstName') || value('lastName'));
              const caption = (field) => (label ? `${t(label)}: ${t(field)}` : t(field));
              const slot = prefix || 'primary';
              const selections = quickPlayer.playerSelections;
              return (
                <div className="quick-player-person" key={prefix || 'player'}>
                  {currentUserId ? (
                    <RegistrationPlayerPicker
                      key={`${selectedTournamentId}:${slot}`} tournamentId={selectedTournamentId} siteKey={turnstileSiteKey}
                      selected={selections[slot]} excludedIds={Object.values(selections).map((selection) => selection.userId)}
                      currentUserId={currentUserId} currentUser={currentUser}
                      firstName={value('firstName')} lastName={value('lastName')} firstRequired={needed} lastRequired={needed}
                      firstLabel={caption('Vorname')} lastLabel={caption('Nachname')}
                      onNameChange={(field, next) => setQuickPlayer((current) => ({ ...current, [quickPlayerKey(prefix, field)]: next }))}
                      onSelect={(player) => setQuickPlayer((current) => ({
                        ...current,
                        [quickPlayerKey(prefix, 'firstName')]: player.firstName, [quickPlayerKey(prefix, 'lastName')]: player.lastName,
                        [quickPlayerKey(prefix, 'licenseNr')]: player.licenseNr || current[quickPlayerKey(prefix, 'licenseNr')],
                        playerSelections: { ...current.playerSelections, [slot]: { userId: player.id, proof: player.proof, licenseNr: player.licenseNr } },
                      }))}
                      onClear={() => setQuickPlayer((current) => ({
                        ...current, playerSelections: Object.fromEntries(Object.entries(current.playerSelections).filter(([key]) => key !== slot)),
                      }))} />
                  ) : (
                    <>
                      <TextField label={caption('Vorname')} value={value('firstName')} onChange={set('firstName')} required={needed} minLength={2} />
                      <TextField label={caption('Nachname')} value={value('lastName')} onChange={set('lastName')} required={needed} minLength={2} />
                    </>
                  )}
                  {selectedTournament?.licenseRequired && <TextField label={caption('Lizenznummer')} value={value('licenseNr')} onChange={set('licenseNr')} required={needed} />}
                </div>
              );
            })}
            <Button type="submit" disabled={busy} loading={busy}>{t(isTeamQuickAdd ? 'Team hinzufügen' : 'Spieler hinzufügen')}</Button>
          </form>
          <p className="hint">
            {!isMelee && t('Neue Spieler sind sofort für die nächste Runde aktiv.')}
            {isMelee && canEditMeleeTeams && t('Neue Spieler spielen erst mit, wenn sie per „Mêlée-Teams auslosen“ einem Team zugeteilt sind.')}
            {isMelee && canDrawLateMeleeTeams && t('Die bisherigen Mêlée-Teams stehen seit der ersten Runde fest. Neue Spieler spielen ab der nächsten Runde mit, wenn sie per „Mêlée-Teams auslosen“ einem neuen Team zugeteilt sind.')}
            {isMelee && !canEditMeleeTeams && !canDrawLateMeleeTeams && t('Die Mêlée-Teams stehen seit der ersten Runde fest. Neue Spieler werden keinem Team mehr zugeteilt und spielen nicht mit.')}
          </p>
          <div className="row-actions round-participant-bulk">
            <Button variant="secondary" disabled={busy || !inactiveConfirmedCount} loading={bulkParticipation === 'active'} onClick={() => handleAllParticipation('active')}>{t('Alle aktivieren')}</Button>
            <Button variant="secondary" disabled={busy || !activeConfirmedCount} loading={bulkParticipation === 'inactive'} onClick={() => handleAllParticipation('inactive')}>{t('Alle deaktivieren')}</Button>
          </div>
          <div className="round-participant-list">
            {visibleConfirmedRegistrations.items.map((registration) => (
              <div className="round-participant-row" key={registration.id}>
                <span className={`round-participant-name${registration.participation === 'active' ? '' : ' muted'}`}>
                  {teamNumberOf(registration) != null && (
                    <span className="round-participant-number" title={t('Teamnummer')} data-i18n-skip>{teamNumberOf(registration)}</span>
                  )}
                  <span data-i18n-skip>{playerLabel(registration)}</span>
                  {registration.accountConnected && <AccountBadge />}
                  {registration.participation === 'withdrawn' && <span className="participation-withdrawn">{t('Ausgesetzt')}</span>}
                </span>
                {/* Am Handy nur Symbole: Bearbeiten, Live-QR, Teilnahme. „Ausgesetzt“ gibt es nur im Bearbeiten-Dialog. */}
                <span className="round-participant-actions">
                  <Button className="button button-secondary icon-action" disabled={busy}
                    aria-label={t('{{name}} bearbeiten', { name: playerLabel(registration) })} title={t('Bearbeiten')}
                    onClick={() => { setError(''); setMessage(''); setEditRegistrationId(registration.id); }}>
                    <EditIcon />
                  </Button>
                  {selectedTournament?.liveViewEnabled && (
                    <Button className="button button-secondary icon-action" aria-label={`${t('QR-Code Live-Ansicht')}: ${playerLabel(registration)}`}
                      title={t('QR-Code Live-Ansicht')} onClick={() => setLiveQrRegistration(registration)}>
                      <QrIcon />
                    </Button>
                  )}
                  <Button className={`button button-secondary icon-action participation-toggle${registration.participation === 'active' ? ' is-active' : ''}`}
                    disabled={busy} loading={participationBusyId === registration.id} aria-pressed={registration.participation === 'active'}
                    aria-label={`${t('Aktiv')}: ${playerLabel(registration)}`}
                    title={registration.participation === 'active' ? t('Aktiv') : labelFor(PARTICIPATIONS, registration.participation)}
                    onClick={() => handleParticipationChange(registration.id, registration.participation === 'active' ? 'inactive' : 'active')}>
                    <ParticipationIcon active={registration.participation === 'active'} />
                  </Button>
                </span>
              </div>
            ))}
          </div>
          <InfiniteListLoadMore hasMore={visibleConfirmedRegistrations.hasMore} onLoadMore={visibleConfirmedRegistrations.loadMore} label={t('Weitere Einträge laden')} />
        </details>
      )}

      {selectedTournamentStatus === 'finished' && rounds.length > 0 && (
        <section className="play-rounds">
          <h2>{t('Runden')}</h2>
          {[...rounds].reverse().map((round) => (
            <details key={`${selectedTournamentId}:${round.id}`} className="panel play-round">
              <summary className="play-round-summary"><span>{t('Runde')} {round.roundNumber}</span><span className="counter">{round.matches.length}</span></summary>
              <RoundTable round={round} />
            </details>
          ))}
        </section>
      )}

      {selectedTournamentStatus !== 'finished' && currentRound && (
        <section className="panel play-current-round">
          <div className="section-title"><h2>{t('Runde')} {currentRound.roundNumber}</h2><span className={`status ${currentRoundOpen ? 'status-running' : 'registration-confirmed'}`}>{currentRoundOpen ? t('Offen') : t('Abgeschlossen')}</span></div>
          <RoundResults key={`${selectedTournamentId}:${currentRound.id}`} round={currentRound} collapseDecided onSave={handleSaveResult} onSaveAll={handleSaveAll} onRefresh={() => roundsQuery.refetch()} busy={busy} refreshing={roundsQuery.isFetching} onConfirmReports={handleConfirmReports} confirmingReports={confirmingReports} manualCourt={courtMode === 'L'} onSaveCourt={handleSaveCourt} />
          <RoundAction />
        </section>
      )}

      {!currentRound && <RoundAction />}

      {selectedTournamentStatus !== 'finished' && Boolean(olderRoundsNewestFirst.length) && (
        <section className="play-rounds">
          <h2>{t('Vergangene Runden')}</h2>
          {olderRoundsNewestFirst.map((round) => (
            <details key={`${selectedTournamentId}:${round.id}`} className="panel play-round">
              <summary className="play-round-summary"><span>{t('Runde')} {round.roundNumber}</span><span className="status registration-confirmed">{t('Abgeschlossen')}</span></summary>
              <RoundResults round={round} onSave={handleSaveResult} onSaveAll={handleSaveAll} busy={busy} onConfirmReports={handleConfirmReports} confirmingReports={confirmingReports} />
            </details>
          ))}
        </section>
      )}

      {Boolean(ranking.length) && (
        <RankingPanel key={`ranking:${selectedTournamentId}`} openInitially={selectedTournamentStatus === 'finished' && !selectedTournament?.rankingPublishedAt}>
          <div className="table-scroll">
            <RankingTable tournament={selectedTournament} entries={normalizeRanking(ranking)} />
          </div>
          <FinalRankingPublisher
            tournament={selectedTournament}
            onPublished={() => queryClient.invalidateQueries({ queryKey: ['tournaments'] })}
          />
        </RankingPanel>
      )}

      <RegistrationEditDialog
        registration={editRegistration}
        tournament={selectedTournament}
        tournaments={tournaments}
        language={i18n.language}
        turnstileSiteKey={turnstileSiteKey}
        currentUserId={currentUserId}
        onClose={() => setEditRegistrationId('')}
        onChanged={() => queryClient.invalidateQueries({ queryKey: [...queryKey, 'registrations'] })}
        onSaved={handleRegistrationSaved}
      >
        {/* Außerhalb des Formulars und sofort wirksam wie der Schalter in der Liste; einziger Weg zu „Ausgesetzt“. */}
        {editRegistration && (
          <section className="relink-accounts" aria-label={t('Teilnahme')}>
            <h3>{t('Teilnahme')}</h3>
            <Feedback error={error} />
            <SelectField label={t('Teilnahme')} value={editRegistration.participation} disabled={busy}
              options={translatedOptions(PARTICIPATIONS)} onChange={(participation) => handleParticipationChange(editRegistration.id, participation)} />
          </section>
        )}
      </RegistrationEditDialog>
      <LiveQrDialog registration={liveQrRegistration} onClose={() => setLiveQrRegistration(null)} />
    </div>
  );
}
