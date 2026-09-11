import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { SelectField, TextField, Button, Feedback } from '../components/ui.jsx';
import { checkRoundRequirements } from '../lib/pairing/index.js';

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

function playerLabel(player) {
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

function MatchRow({ match, onSave, busy }) {
  const { t } = useTranslation();
  const [scoreA, setScoreA] = useState(match.scoreA ?? '');
  const [scoreB, setScoreB] = useState(match.scoreB ?? '');
  const decided = match.scoreA != null || match.scoreB != null || match.noShow;
  const isDraw = scoreA !== '' && scoreB !== '' && scoreA === scoreB;

  return (
    <article className="supermelee-match">
      <div className="supermelee-match-teams">
        <div className="supermelee-team" data-i18n-skip>{teamLabel(match.teamA)}</div>
        <div className="supermelee-vs">{t('gegen')}</div>
        <div className="supermelee-team is-second" data-i18n-skip>{teamLabel(match.teamB)}</div>
      </div>

      <div className="supermelee-result-row">
        <input
          className="score-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{0,2}"
          maxLength={2}
          value={scoreA}
          onChange={(event) => setScoreA(sanitizeScore(event.target.value))}
          aria-label={t('Punkte Team A')}
        />
        <span className="supermelee-score-sep">:</span>
        <input
          className="score-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{0,2}"
          maxLength={2}
          value={scoreB}
          onChange={(event) => setScoreB(sanitizeScore(event.target.value))}
          aria-label={t('Punkte Team B')}
        />
        <Button
          disabled={busy || scoreA === '' || scoreB === '' || isDraw}
          onClick={() => onSave(match.id, { scoreA: Number(scoreA), scoreB: Number(scoreB) })}
        >
          {decided ? t('Ergebnis ändern') : t('Ergebnis speichern')}
        </Button>
      </div>

      {isDraw && <p className="feedback error">{t('Unentschieden ist nicht möglich')}</p>}
    </article>
  );
}

export default function TournamentPlayManagement({ tournaments }) {
  const { t, i18n } = useTranslation();
  const [selectedTournamentId, setSelectedTournamentId] = useState(tournaments[0]?.id || '');
  const [rounds, setRounds] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [confirmedRegistrations, setConfirmedRegistrations] = useState([]);
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

  async function loadData(tournamentId) {
    if (!tournamentId) {
      setRounds([]);
      setRanking([]);
      setConfirmedRegistrations([]);
      return;
    }
    try {
      const [roundsData, rankingData, registrationsData] = await Promise.all([
        api(`/api/tournaments/${tournamentId}/rounds`),
        api(`/api/tournaments/${tournamentId}/ranking`),
        api(`/api/tournaments/${tournamentId}/registrations`),
      ]);
      setRounds(roundsData.rounds);
      setRanking(rankingData.ranking);
      setConfirmedRegistrations(registrationsData.registrations.filter((registration) => registration.status === 'confirmed'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    setMessage('');
    setError('');
    loadData(selectedTournamentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournamentId]);

  async function handleStartTournament() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/api/tournaments/${selectedTournamentId}/start`, { method: 'POST' });
      setStartedTournamentIds((current) => new Set(current).add(selectedTournamentId));
      setMessage(t('Turnier wurde gestartet.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(registrationId, nextActive) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/registrations/${registrationId}/active`, {
        method: 'PUT',
        body: JSON.stringify({ active: nextActive }),
      });
      setConfirmedRegistrations((current) =>
        current.map((registration) => (registration.id === registrationId ? { ...registration, active: nextActive } : registration)),
      );
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
      const data = await api(`/api/tournaments/${selectedTournamentId}/rounds`, { method: 'POST' });
      setRounds(data.rounds);
      setMessage(t('Neue Runde wurde erstellt.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveResult(matchId, result) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api(`/api/tournaments/${selectedTournamentId}/matches/${matchId}/result`, {
        method: 'PUT',
        body: JSON.stringify(result),
      });
      setRounds(data.rounds);
      const rankingData = await api(`/api/tournaments/${selectedTournamentId}/ranking`);
      setRanking(rankingData.ranking);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!tournaments.length) {
    return (
      <div className="panel">
        <p className="muted">{t('Keine Turniere mit Online-Durchführung verfügbar.')}</p>
      </div>
    );
  }

  const currentRound = rounds[rounds.length - 1] || null;
  const currentRoundOpen = currentRound ? !isRoundComplete(currentRound) : false;
  const activeConfirmedCount = confirmedRegistrations.filter((registration) => registration.active).length;

  // Voraussetzungen für "Neue Runde starten" proaktiv prüfen, damit der Turniersteller
  // sofort sieht, was fehlt, statt es erst nach einem Fehlschlag zu erfahren. Die
  // eigentlichen Regeln (Mindestspielerzahl, gültige Teamaufteilung, ...) stammen aus
  // checkRoundRequirements() - system-spezifisch je nach PAIRING_STRATEGIES-Eintrag,
  // hier bleibt der Check bewusst generisch, damit künftige Online-Turniersysteme
  // keine Anpassung an dieser Stelle brauchen. Nur aktive Meldungen zählen, analog zum
  // Hauptprojekt (nur Meldungen mit Spieltag-Status "JA" gehen in die Rundenauslosung ein).
  const strategyRequirementGaps = selectedTournament && selectedTournamentStatus === 'running'
    ? checkRoundRequirements(selectedTournament, activeConfirmedCount)
    : [];
  const missingRequirements = [
    ...strategyRequirementGaps.map((requirement) => requirementText(requirement, t)),
    ...(selectedTournamentStatus === 'running' && currentRoundOpen
      ? [t('Bitte zuerst alle Ergebnisse der aktuellen Runde eintragen.')]
      : []),
  ];

  const canGenerateRound = selectedTournamentStatus === 'running' && !currentRoundOpen && strategyRequirementGaps.length === 0;
  const olderRoundsNewestFirst = rounds.slice(0, -1).reverse();
  const showRoundAction = selectedTournamentStatus === 'running';

  function RoundAction() {
    if (!showRoundAction) return null;
    return (
      <div className="supermelee-round-action">
        {missingRequirements.length > 0 && (
          <div className="round-requirements">
            {missingRequirements.map((requirement) => <p className="hint" key={requirement}>{requirement}</p>)}
          </div>
        )}
        <Button disabled={busy || !selectedTournamentId || !canGenerateRound} onClick={handleNewRound}>
          {currentRound ? t('Nächste Runde starten') : t('Erste Runde starten')}
        </Button>
      </div>
    );
  }

  return (
    <div className="supermelee-manage">
      <div className="panel supermelee-toolbar">
        <SelectField
          label={t('Turnier')}
          value={selectedTournamentId}
          onChange={setSelectedTournamentId}
          options={tournaments.map((tournament) => ({ value: tournament.id, label: tournament.name }))}
        />
        {selectedTournament && selectedTournamentStatus !== 'running' && (
          <div className="supermelee-toolbar-actions">
            <Button disabled={busy || !selectedTournamentId} onClick={handleStartTournament}>{t('Turnier starten')}</Button>
          </div>
        )}
        {selectedTournamentStatus === 'running' && <p className="hint">{t('Bestätigte Meldungen')}: {confirmedRegistrations.length} ({activeConfirmedCount} {t('aktiv')})</p>}
      </div>

      <Feedback message={message} error={error} />

      {selectedTournamentStatus === 'running' && (
        <details className="panel round-participants">
          <summary className="supermelee-round-summary"><span>{t('Teilnehmer')}</span><span className="counter">{activeConfirmedCount}</span></summary>
          <form className="quick-player-form" onSubmit={handleQuickPlayerSubmit}>
            <TextField label={t('Vorname')} value={quickPlayer.firstName} onChange={(firstName) => setQuickPlayer({ ...quickPlayer, firstName })} required minLength={2} />
            <TextField label={t('Nachname')} value={quickPlayer.lastName} onChange={(lastName) => setQuickPlayer({ ...quickPlayer, lastName })} required minLength={2} />
            {selectedTournament?.licenseRequired && <TextField label={t('Lizenznummer')} value={quickPlayer.licenseNr} onChange={(licenseNr) => setQuickPlayer({ ...quickPlayer, licenseNr })} required />}
            <Button type="submit" disabled={busy}>{t('Spieler hinzufügen')}</Button>
          </form>
          <p className="hint">{t('Neue Spieler sind sofort für die nächste Runde aktiv.')}</p>
          <div className="round-participant-list">
            {confirmedRegistrations.map((registration) => (
              <label className="round-participant-row" key={registration.id}>
                <span className={registration.active ? '' : 'muted'} data-i18n-skip>{playerLabel(registration)}</span>
                <input type="checkbox" checked={registration.active} disabled={busy} onChange={(event) => handleToggleActive(registration.id, event.target.checked)} />
              </label>
            ))}
          </div>
        </details>
      )}

      {currentRound && (
        <section className="panel supermelee-current-round">
          <div className="section-title"><h2>{t('Runde')} {currentRound.roundNumber}</h2><span className={`status ${currentRoundOpen ? 'status-running' : 'registration-confirmed'}`}>{currentRoundOpen ? t('Offen') : t('Abgeschlossen')}</span></div>
          <div className="supermelee-match-list">
            {currentRound.matches.map((match) => <MatchRow key={match.id} match={match} onSave={handleSaveResult} busy={busy} />)}
          </div>
          <RoundAction />
        </section>
      )}

      {!currentRound && <RoundAction />}

      {Boolean(olderRoundsNewestFirst.length) && (
        <section className="supermelee-rounds">
          <h2>{t('Vergangene Runden')}</h2>
          {olderRoundsNewestFirst.map((round) => (
            <details key={round.id} className="panel supermelee-round">
              <summary className="supermelee-round-summary"><span>{t('Runde')} {round.roundNumber}</span><span className="status registration-confirmed">{t('Abgeschlossen')}</span></summary>
              <div className="supermelee-match-list">{round.matches.map((match) => <MatchRow key={match.id} match={match} onSave={handleSaveResult} busy={busy} />)}</div>
            </details>
          ))}
        </section>
      )}

      {Boolean(ranking.length) && (
        <details className="panel ranking-panel">
          <summary className="supermelee-round-summary"><span>{t('Rangliste')}</span></summary>
          <div className="table-scroll">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('Spieler')}</th>
                  <th>{t('Siege')}</th>
                  <th>+/-</th>
                  <th>{t('Punkte')}</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((entry) => (
                  <tr key={entry.playerId}>
                    <td>{entry.rank}</td>
                    <td data-i18n-skip>{playerLabel(entry)}</td>
                    <td>{entry.wins}</td>
                    <td>{entry.gameDiff}</td>
                    <td>{entry.pointsFor}:{entry.pointsAgainst}</td>
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
