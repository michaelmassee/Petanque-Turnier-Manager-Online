import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { translateText } from '../lib/i18n.js';
import { SelectField, Button, Feedback } from '../components/ui.jsx';
import { PAIRING_STRATEGIES } from '../lib/pairing/index.js';
import { REGISTRATION_TYPES, TOURNAMENT_TYPES } from '../lib/constants.js';

const DESKTOP_APP_URL = 'https://michaelmassee.github.io/Petanque-Turnier-Manager/';

// Welche Turniersysteme online durchführbar sind, ergibt sich allein aus
// PAIRING_STRATEGIES (siehe lib/pairing/index.js) - kommen dort weitere Systeme
// dazu, taucht ihr Label hier automatisch auf, ohne dass diese Liste angepasst
// werden muss.
const ONLINE_SYSTEM_LABELS = [...REGISTRATION_TYPES, ...TOURNAMENT_TYPES]
  .filter((entry) => PAIRING_STRATEGIES[entry.value])
  .map((entry) => entry.label);

function OnlineSystemsHint({ language }) {
  return (
    <p className="hint">
      {translateText('Online durchführbar sind aktuell:', language)}{' '}
      {ONLINE_SYSTEM_LABELS.map((label) => translateText(label, language)).join(', ')}.{' '}
      {translateText('Alle anderen Turniersysteme können mit der Desktop-Version des Pétanque Turnier Managers durchgeführt werden:', language)}{' '}
      <a href={DESKTOP_APP_URL} target="_blank" rel="noreferrer">
        {translateText('Turniersoftware', language)}
      </a>
    </p>
  );
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

function MatchRow({ match, onSave, busy, language }) {
  const [scoreA, setScoreA] = useState(match.scoreA ?? '');
  const [scoreB, setScoreB] = useState(match.scoreB ?? '');
  const decided = match.scoreA != null || match.scoreB != null || match.noShow;
  const isDraw = scoreA !== '' && scoreB !== '' && scoreA === scoreB;

  return (
    <article className="supermelee-match">
      <div className="supermelee-match-teams">
        <div className="supermelee-team">{teamLabel(match.teamA)}</div>
        <div className="supermelee-vs">{translateText('gegen', language)}</div>
        <div className="supermelee-team is-second">{teamLabel(match.teamB)}</div>
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
          aria-label={translateText('Punkte Team A', language)}
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
          aria-label={translateText('Punkte Team B', language)}
        />
        <Button
          disabled={busy || scoreA === '' || scoreB === '' || isDraw}
          onClick={() => onSave(match.id, { scoreA: Number(scoreA), scoreB: Number(scoreB) })}
        >
          {decided ? translateText('Ergebnis ändern', language) : translateText('Ergebnis speichern', language)}
        </Button>
      </div>

      {isDraw && <p className="feedback error">{translateText('Unentschieden ist nicht möglich', language)}</p>}

      <div className="supermelee-noshow-row">
        <button className="link-button" type="button" disabled={busy} onClick={() => onSave(match.id, { noShow: 'a' })}>
          {translateText('Team A nicht angetreten', language)}
        </button>
        <button className="link-button" type="button" disabled={busy} onClick={() => onSave(match.id, { noShow: 'b' })}>
          {translateText('Team B nicht angetreten', language)}
        </button>
      </div>
    </article>
  );
}

export default function TournamentPlayManagement({ tournaments, language }) {
  const [selectedTournamentId, setSelectedTournamentId] = useState(tournaments[0]?.id || '');
  const [rounds, setRounds] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedTournamentId) || null;

  async function loadData(tournamentId) {
    if (!tournamentId) {
      setRounds([]);
      setRanking([]);
      return;
    }
    try {
      const [roundsData, rankingData] = await Promise.all([
        api(`/api/tournaments/${tournamentId}/rounds`),
        api(`/api/tournaments/${tournamentId}/ranking`),
      ]);
      setRounds(roundsData.rounds);
      setRanking(rankingData.ranking);
    } catch (err) {
      setError(translateText(err.message, language));
    }
  }

  useEffect(() => {
    setMessage('');
    setError('');
    loadData(selectedTournamentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournamentId]);

  async function handleNewRound() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api(`/api/tournaments/${selectedTournamentId}/rounds`, { method: 'POST' });
      setRounds(data.rounds);
      setMessage(translateText('Neue Runde wurde erstellt.', language));
    } catch (err) {
      setError(translateText(err.message, language));
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
      setError(translateText(err.message, language));
    } finally {
      setBusy(false);
    }
  }

  if (!tournaments.length) {
    return (
      <div className="panel">
        <p className="muted">{translateText('Keine Turniere mit Online-Durchführung verfügbar.', language)}</p>
      </div>
    );
  }

  const currentRound = rounds[rounds.length - 1] || null;
  const currentRoundOpen = currentRound ? !isRoundComplete(currentRound) : false;
  const canGenerateRound = selectedTournament?.status === 'running' && !currentRoundOpen;
  const roundsNewestFirst = [...rounds].reverse();

  return (
    <div className="supermelee-manage">
      <div className="panel supermelee-toolbar">
        <SelectField
          label="Turnier"
          value={selectedTournamentId}
          onChange={setSelectedTournamentId}
          options={tournaments.map((tournament) => ({ value: tournament.id, label: tournament.name }))}
        />
        <OnlineSystemsHint language={language} />

        <div className="supermelee-toolbar-actions">
          <Button disabled={busy || !selectedTournamentId || !canGenerateRound} onClick={handleNewRound}>
            {translateText('Neue Runde starten', language)}
          </Button>
          {selectedTournament && selectedTournament.status !== 'running' && (
            <p className="hint">{translateText('Setze den Turnierstatus auf "Läuft", um Runden zu starten.', language)}</p>
          )}
        </div>
      </div>

      <Feedback message={message} error={error} />

      {Boolean(roundsNewestFirst.length) && (
        <div className="supermelee-rounds">
          {roundsNewestFirst.map((round, index) => {
            const complete = isRoundComplete(round);
            return (
              <details key={round.id} className="panel supermelee-round" open={index === 0}>
                <summary className="supermelee-round-summary">
                  <span>
                    {translateText('Runde', language)} {round.roundNumber}
                  </span>
                  <span className={`status ${complete ? 'registration-confirmed' : 'status-running'}`}>
                    {complete ? translateText('Abgeschlossen', language) : translateText('Offen', language)}
                  </span>
                </summary>
                <div className="supermelee-match-list">
                  {round.matches.map((match) => (
                    <MatchRow key={match.id} match={match} onSave={handleSaveResult} busy={busy} language={language} />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {Boolean(ranking.length) && (
        <section className="panel">
          <h3>{translateText('Rangliste', language)}</h3>
          <div className="table-scroll">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{translateText('Spieler', language)}</th>
                  <th>{translateText('Siege', language)}</th>
                  <th>+/-</th>
                  <th>{translateText('Punkte', language)}</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((entry) => (
                  <tr key={entry.playerId}>
                    <td>{entry.rank}</td>
                    <td>{playerLabel(entry)}</td>
                    <td>{entry.wins}</td>
                    <td>{entry.gameDiff}</td>
                    <td>{entry.pointsFor}:{entry.pointsAgainst}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
