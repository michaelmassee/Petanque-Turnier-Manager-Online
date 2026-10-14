import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, authenticatedApi } from '../lib/api.js';
import { TextField, Button, Feedback } from '../components/ui.jsx';
import { TournamentPicker } from '../components/TournamentPicker.jsx';
import { checkRoundRequirements, getSupportedSystemLabels, isOnlinePlayable } from '../lib/pairing/index.js';
import { FORMATIONS, PARTICIPATIONS, REGISTRATION_TYPES, TOURNAMENT_TYPES } from '../lib/constants.js';
import { isCalendarEntry, labelFor, translatedOptions } from '../lib/domain.js';
import { InfiniteListLoadMore, useInfiniteList } from '../components/InfiniteListLoadMore.jsx';

// Rendert ein Anforderungs-Objekt aus checkRoundRequirements() generisch, ohne
// Systemwissen: 'minPlayers' trägt die Mindestanzahl als Zahl statt fest im Satz
// eingebacken zu sein (verschiedene Systeme/Formationen können unterschiedliche
// Mindestanzahlen haben), 'message' ist ein fertiger, übersetzbarer Freitext für
// alles, was sich nicht in ein generisches Muster fassen lässt.
function requirementText(requirement, t) {
  if (requirement.type === 'minPlayers') {
    return `${t('Es werden mindestens')} ${requirement.min} ${t('bestätigte Meldungen benötigt.')}`;
  }
  return t(requirement.text);
}

// Baut "Schweizer-System und Supermêlée" (bzw. bei künftig mehr Systemen automatisch
// mit Kommas + finalem "und") aus PAIRING_STRATEGIES statt die Namen an jeder
// Hinweistext-Stelle hart zu verdrahten - Intl.ListFormat übernimmt dabei auch die
// sprachabhängige Aufzählungsform (z. B. "and" statt "und" auf Englisch).
function supportedSystemsList(locale) {
  const formatter = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });
  return formatter.format(getSupportedSystemLabels());
}

function playerLabel(player) {
  if (player.teamLabel) return player.teamLabel;
  return [player.firstName, player.lastName].filter(Boolean).join(' ') || player.id;
}

function teamLabel(team) {
  return team.map(playerLabel).join(' + ');
}

function sanitizeScore(value) {
  const digitsOnly = value.replace(/\D/g, '').slice(0, 2);
  if (digitsOnly === '') {
    return '';
  }
  return String(Math.min(Number(digitsOnly), 13));
}

function isRoundComplete(round) {
  return round.matches.every((match) => match.scoreA != null || match.scoreB != null || match.noShow);
}

function MatchRow({ match, draft, onChange, onSave, busy, isNewReport }) {
  const { t } = useTranslation();
  const scoreA = draft?.scoreA ?? String(match.scoreA ?? '');
  const scoreB = draft?.scoreB ?? String(match.scoreB ?? '');
  const decided = match.scoreA != null || match.scoreB != null || match.noShow;
  const isDraw = scoreA !== '' && scoreB !== '' && scoreA === scoreB;

  return (
    <article className={`play-match${match.reportedBy ? ' is-player-reported' : ''}${isNewReport ? ' is-new-report' : ''}`}>
      {match.stageLabel && <div className="play-match-stage" data-i18n-skip>{match.stageLabel}</div>}
      {match.reportedBy && (
        <p className="play-report-badge">
          {isNewReport && <span className="play-report-new">{t('Neu')}</span>}
          <span>{t('Ergebnis gemeldet von')} <strong data-i18n-skip>{playerLabel(match.reportedBy)}</strong></span>
        </p>
      )}
      <div className="play-match-teams">
        <div className="play-team" data-i18n-skip>{teamLabel(match.teamA)}</div>
        <div className="play-vs">{t('gegen')}</div>
        <div className="play-team is-second" data-i18n-skip>{teamLabel(match.teamB)}</div>
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

function RoundResults({ round, onSave, onSaveAll, onRefresh, busy, refreshing, newReportIds = [], onReportsSeen }) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState({});
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
  const newReports = round.matches.filter((match) => match.reportedBy && newReportIds.includes(match.id)).length;
  return (
    <>
      {newReports > 0 && (
        <div className="play-report-banner" role="status">
          <span>{t('Neue Ergebnismeldungen von Teams: {{count}}', { count: newReports })}</span>
          <Button variant="secondary" onClick={onReportsSeen}>{t('Gesehen')}</Button>
        </div>
      )}
      <div className="play-round-buttons" role="group" aria-label={t('Rundenaktionen')}>
        <Button disabled={busy || refreshing || !changes.length || invalid} loading={busy} onClick={async () => {
          const cleared = await onSaveAll(round, changes);
          setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !cleared.includes(id))));
        }}>{t('Alle speichern')}</Button>
        {onRefresh && <Button variant="secondary" disabled={busy} loading={refreshing} onClick={onRefresh}>{t('Aktualisieren')}</Button>}
      </div>
      <div className="play-match-list">
        {round.matches.map((match) => <MatchRow key={match.id} match={match} draft={drafts[match.id]} onChange={(draft) => changeDraft(match.id, draft)} onSave={onSave} busy={busy} isNewReport={newReportIds.includes(match.id)} />)}
      </div>
    </>
  );
}

export default function TournamentPlayManagement({ tournaments: managedTournaments, currentUserId, focus = null }) {
  const { t, i18n } = useTranslation();
  // Kalendereinträge sind reine Termine ohne Teilnehmer und tauchen hier gar nicht auf.
  const allTournaments = managedTournaments.filter((tournament) => !isCalendarEntry(tournament));
  // Nur Turniere mit implementiertem Paarungssystem (Schweizer, Supermêlée) sind
  // online spielbar (siehe isOnlinePlayable) - alle anderen Typen werden unten im
  // Leerzustand mit Grund aufgelistet, statt kommentarlos aus der Auswahl zu
  // verschwinden.
  const tournaments = allTournaments.filter((tournament) => isOnlinePlayable(tournament) && !tournament.desktopExecution);
  const nonPlayableTournaments = allTournaments.filter((tournament) => !isOnlinePlayable(tournament));
  const desktopExecutionTournaments = allTournaments.filter((tournament) => isOnlinePlayable(tournament) && tournament.desktopExecution);
  const [selectedTournamentId, setSelectedTournamentId] = useState(tournaments[0]?.id || '');
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
  const [quickPlayer, setQuickPlayer] = useState({ firstName: '', lastName: '', licenseNr: '' });
  // Der `tournaments`-Prop kommt vom Elternteil und wird nicht sofort neu geladen,
  // nachdem hier der Status auf "Läuft" gesetzt wurde - deshalb lokal vormerken,
  // welche Turniere in dieser Sitzung bereits gestartet wurden.
  const [startedTournamentIds, setStartedTournamentIds] = useState(() => new Set());

  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedTournamentId) || null;
  const selectedTournamentStatus = selectedTournament
    ? (startedTournamentIds.has(selectedTournament.id) ? 'running' : selectedTournament.status)
    : null;

  const queryKey = ['tournament-play', selectedTournamentId];
  const roundsQuery = useQuery({
    queryKey: [...queryKey, 'rounds'],
    queryFn: ({ signal }) => api(`/api/tournaments/${selectedTournamentId}/rounds`, { signal }),
    enabled: Boolean(selectedTournament),
    refetchOnWindowFocus: !busy,
    staleTime: 30_000,
  });
  const rounds = roundsQuery.data?.rounds || [];
  // Neue Spielermeldungen nur im Browser erkennen: kein Polling, keine zusätzlichen Schreibzugriffe.
  const knownReports = useRef({ tournamentId: null, ids: new Set() });
  const [newReportIds, setNewReportIds] = useState([]);
  useEffect(() => {
    if (!roundsQuery.data) return;
    const reported = new Set(roundsQuery.data.rounds.flatMap((round) => round.matches).filter((match) => match.reportedBy).map((match) => match.id));
    const known = knownReports.current;
    const firstLoad = known.tournamentId !== selectedTournamentId;
    knownReports.current = { tournamentId: selectedTournamentId, ids: reported };
    setNewReportIds((current) => {
      const kept = firstLoad ? [] : current.filter((id) => reported.has(id));
      const added = firstLoad ? [] : [...reported].filter((id) => !known.ids.has(id) && !kept.includes(id));
      return added.length || kept.length !== current.length ? [...kept, ...added] : current;
    });
  }, [roundsQuery.data, selectedTournamentId]);
  const swissTeams = roundsQuery.data?.teams || [];
  const rankingQuery = useQuery({
    // Structural query keys keep the ranking cached when a refresh changes no results.
    queryKey: [...queryKey, 'ranking', roundsQuery.data?.rounds],
    queryFn: ({ signal }) => api(`/api/tournaments/${selectedTournamentId}/ranking`, { signal }),
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

  async function loadData(tournamentId) {
    await queryClient.invalidateQueries({ queryKey: ['tournament-play', tournamentId] });
  }

  async function handleStartTournament() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await authenticatedApi(`/api/tournaments/${selectedTournamentId}/start`, { method: 'POST' });
      setStartedTournamentIds((current) => new Set(current).add(selectedTournamentId));
      setMessage(t('Turnier wurde gestartet.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleParticipationChange(registrationId, participation) {
    setBusy(true);
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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickPlayerSubmit(event) {
    event.preventDefault();
    if (!selectedTournamentId) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api(`/api/tournaments/${selectedTournamentId}/registrations`, {
        method: 'POST',
        body: JSON.stringify({
          firstName: quickPlayer.firstName,
          lastName: quickPlayer.lastName,
          licenseNr: quickPlayer.licenseNr || null,
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
      setQuickPlayer({ firstName: '', lastName: '', licenseNr: '' });
      setMessage(`${t('Spieler hinzugefügt:')} ${result.registration.firstName} ${result.registration.lastName}`);
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
      setMessage(t('Neue Runde wurde erstellt.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDrawMeleeTeams() {
    setBusy(true); setError(''); setMessage('');
    try {
      await queryClient.cancelQueries({ queryKey: [...queryKey, 'rounds'] });
      const data = await authenticatedApi(`/api/tournaments/${selectedTournamentId}/teams/draw`, { method: 'POST' });
      queryClient.setQueryData([...queryKey, 'rounds'], (current) => ({ ...current, teams: data.teams || [] }));
      setMessage(`${t('Mêlée-Teams wurden ausgelost:')} ${data.teams.length}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  function confirmResultOverwrite(result, match) {
    const existing = result.noShow ? t('Nicht angetreten') : `${result.scoreA}:${result.scoreB}`;
    const matchup = match ? `${teamLabel(match.teamA)} ${t('gegen')} ${teamLabel(match.teamB)}\n` : '';
    return window.confirm(matchup + t('Für diese Partie liegt bereits ein Ergebnis vor: {{result}}. Möchtest du es wirklich überschreiben?', { result: existing }));
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

  if (!tournaments.length) {
    return (
      <div className="panel">
        <p className="muted">{t('Keine Turniere mit Online-Durchführung verfügbar.')}</p>
        {desktopExecutionTournaments.length > 0 && (
          <p className="hint">{t('Dieses Turnier wird nicht online durchgeführt. Der Spielplan wird im Turnierdokument geführt.')}</p>
        )}
        {nonPlayableTournaments.length > 0 && (
          <div className="hint">
            <p>{t('Folgende Turniere unterstützen keine Online-Rundenverwaltung, da ihr Turniertyp dafür nicht implementiert ist.')} {t('Unterstützt werden nur:')} {supportedSystemsList(i18n.language)}.</p>
            <ul>
              {nonPlayableTournaments.map((tournament) => (
                <li key={tournament.id} data-i18n-skip>
                  {tournament.name} ({labelFor(TOURNAMENT_TYPES, tournament.type)})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const currentRound = rounds[rounds.length - 1] || null;
  const currentRoundOpen = currentRound ? !isRoundComplete(currentRound) : false;
  const activeConfirmedCount = confirmedRegistrations.filter((registration) => registration.participation === 'active').length;
  const isSchweizerMelee = selectedTournament?.type === 'schweizer' && selectedTournament?.registrationType === 'melee';
  const isSchweizerWithBuchholz = selectedTournament?.type === 'schweizer' && selectedTournament?.schweizerRankingMode !== 'ohne_buchholz';
  const requiredMeleePlayers = selectedTournament?.formation === 'triplette' ? 18 : 12;
  const canDrawMeleeTeams = isSchweizerMelee && !rounds.length && activeConfirmedCount >= requiredMeleePlayers;
  const missingMeleeDraw = isSchweizerMelee && swissTeams.length < 6;

  // Voraussetzungen für "Neue Runde starten" proaktiv prüfen, damit der Turniersteller
  // sofort sieht, was fehlt, statt es erst nach einem Fehlschlag zu erfahren. Die
  // eigentlichen Regeln (Mindestspielerzahl, gültige Teamaufteilung, ...) stammen aus
  // checkRoundRequirements() - system-spezifisch je nach PAIRING_STRATEGIES-Eintrag,
  // hier bleibt der Check bewusst generisch, damit künftige Online-Turniersysteme
  // keine Anpassung an dieser Stelle brauchen. Nur aktive Meldungen zählen, analog zum
  // Hauptprojekt (nur Meldungen mit Spieltag-Status "JA" gehen in die Rundenauslosung ein).
  const strategyRequirementGaps = selectedTournament && selectedTournamentStatus === 'running'
    ? checkRoundRequirements(selectedTournament, activeConfirmedCount, rounds.length)
    : [];
  const missingRequirements = [
    ...strategyRequirementGaps.map((requirement) => requirementText(requirement, t)),
    ...(selectedTournamentStatus === 'running' && currentRoundOpen
      ? [t('Bitte zuerst alle Ergebnisse der aktuellen Runde eintragen.')]
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
            {missingRequirements.map((requirement) => <p className="hint" key={requirement}>{requirement}</p>)}
          </div>
        )}
        <Button disabled={busy || !selectedTournamentId || !canGenerateRound} loading={busy} onClick={handleNewRound}>
          {currentRound ? t('Nächste Runde starten') : t('Erste Runde starten')}
        </Button>
      </div>
    );
  }

  return (
    <div className="play-manage">
      <div className="panel play-toolbar">
        <TournamentPicker
          label={t('Turnier')}
          tournaments={tournaments}
          value={selectedTournamentId}
          onChange={setSelectedTournamentId}
          currentUserId={currentUserId}
        />
        {selectedTournament && selectedTournamentStatus !== 'running' && (
          <div className="play-toolbar-actions">
            {isSchweizerMelee && !rounds.length && (
              <Button variant="secondary" disabled={busy || !selectedTournamentId || !canDrawMeleeTeams} loading={busy} onClick={handleDrawMeleeTeams}>{t('Mêlée-Teams auslosen')}</Button>
            )}
            <Button disabled={busy || !selectedTournamentId} loading={busy} onClick={handleStartTournament}>{t('Turnier starten')}</Button>
          </div>
        )}
        {selectedTournamentStatus === 'running' && (
          <div className="play-toolbar-actions">
            <p className="hint">
              {t('Bestätigte Meldungen')} · {labelFor(REGISTRATION_TYPES, selectedTournament.registrationType)} · {labelFor(TOURNAMENT_TYPES, selectedTournament.type)} · {labelFor(FORMATIONS, selectedTournament.formation)}: {confirmedRegistrations.length} ({activeConfirmedCount} {t('aktiv')})
              {selectedTournament.type === 'schweizer' && ` · ${t(selectedTournament.schweizerRankingMode === 'ohne_buchholz' ? 'Ohne Buchholz' : 'Mit Buchholz und Feinbuchholz')}`}
            </p>
            {isSchweizerMelee && !rounds.length && (
              <Button variant="secondary" disabled={busy || !canDrawMeleeTeams} loading={busy} onClick={handleDrawMeleeTeams}>{t('Mêlée-Teams auslosen')}</Button>
            )}
          </div>
        )}
      </div>

      {nonPlayableTournaments.length > 0 && (
        <p className="hint">
          {t('Nicht in der Auswahl:')} {nonPlayableTournaments.map((tournament) => `${tournament.name} (${labelFor(TOURNAMENT_TYPES, tournament.type)})`).join(', ')}
          {' – '}
          {t('diese Turniertypen unterstützen keine Online-Rundenverwaltung.')} {t('Unterstützt werden nur:')} {supportedSystemsList(i18n.language)}.
        </p>
      )}

      <Feedback message={message} error={error || queryError?.message} />

      {isSchweizerMelee && !rounds.length && activeConfirmedCount < requiredMeleePlayers && (
        <p className="hint">{t('Für die Mêlée-Auslosung werden mindestens')} {requiredMeleePlayers} {t('aktive bestätigte Meldungen benötigt.')}</p>
      )}

      {selectedTournamentStatus === 'running' && (
        <details className="panel round-participants">
          <summary className="play-round-summary"><span>{t('Teilnehmer')}</span><span className="counter">{activeConfirmedCount}</span></summary>
          <form className="quick-player-form" onSubmit={handleQuickPlayerSubmit}>
            <TextField label={t('Vorname')} value={quickPlayer.firstName} onChange={(firstName) => setQuickPlayer({ ...quickPlayer, firstName })} required minLength={2} />
            <TextField label={t('Nachname')} value={quickPlayer.lastName} onChange={(lastName) => setQuickPlayer({ ...quickPlayer, lastName })} required minLength={2} />
            {selectedTournament?.licenseRequired && <TextField label={t('Lizenznummer')} value={quickPlayer.licenseNr} onChange={(licenseNr) => setQuickPlayer({ ...quickPlayer, licenseNr })} required />}
            <Button type="submit" disabled={busy} loading={busy}>{t('Spieler hinzufügen')}</Button>
          </form>
          <p className="hint">{t('Neue Spieler sind sofort für die nächste Runde aktiv.')}</p>
          <div className="round-participant-list">
            {visibleConfirmedRegistrations.items.map((registration) => (
              <div className="round-participant-row" key={registration.id}>
                <span className={registration.participation === 'active' ? '' : 'muted'} data-i18n-skip>{playerLabel(registration)}</span>
                <select aria-label={`${t('Teilnahme')}: ${playerLabel(registration)}`} value={registration.participation} disabled={busy} onChange={(event) => handleParticipationChange(registration.id, event.target.value)}>
                  {translatedOptions(PARTICIPATIONS).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          <InfiniteListLoadMore hasMore={visibleConfirmedRegistrations.hasMore} onLoadMore={visibleConfirmedRegistrations.loadMore} label={t('Weitere Einträge laden')} />
        </details>
      )}

      {currentRound && (
        <section className="panel play-current-round">
          <div className="section-title"><h2>{t('Runde')} {currentRound.roundNumber}</h2><span className={`status ${currentRoundOpen ? 'status-running' : 'registration-confirmed'}`}>{currentRoundOpen ? t('Offen') : t('Abgeschlossen')}</span></div>
          <RoundResults key={`${selectedTournamentId}:${currentRound.id}`} round={currentRound} onSave={handleSaveResult} onSaveAll={handleSaveAll} onRefresh={() => roundsQuery.refetch()} busy={busy} refreshing={roundsQuery.isFetching} newReportIds={newReportIds} onReportsSeen={() => setNewReportIds([])} />
          <RoundAction />
        </section>
      )}

      {!currentRound && <RoundAction />}

      {Boolean(olderRoundsNewestFirst.length) && (
        <section className="play-rounds">
          <h2>{t('Vergangene Runden')}</h2>
          {olderRoundsNewestFirst.map((round) => (
            <details key={`${selectedTournamentId}:${round.id}`} className="panel play-round">
              <summary className="play-round-summary"><span>{t('Runde')} {round.roundNumber}</span><span className="status registration-confirmed">{t('Abgeschlossen')}</span></summary>
              <RoundResults round={round} onSave={handleSaveResult} onSaveAll={handleSaveAll} busy={busy} newReportIds={newReportIds} onReportsSeen={() => setNewReportIds([])} />
            </details>
          ))}
        </section>
      )}

      {Boolean(ranking.length) && (
        <details className="panel ranking-panel">
          <summary className="play-round-summary"><span>{t('Rangliste')}</span></summary>
          <div className="table-scroll">
            {// Spalten/Überschriften wie im Hauptprojekt: Schweizer-Rangliste (Platz, Team, Siege,
            // BHZ/FBHZ, Punkte +/-/Delta) bzw. JGJ-/Supermêlée-Rangliste (Platz, Spieler, Spiele
            // +/-/Delta, Punkte +/-/Delta), siehe SchweizerRanglisteSheet/JGJRanglisteSheet im Hauptprojekt.
            null}
            <table className="ranking-table">
              <thead>
                {selectedTournament?.type === 'schweizer' ? (
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
                    {selectedTournament?.type === 'schweizer' ? (
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
        </details>
      )}
    </div>
  );
}
