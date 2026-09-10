import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { translateText } from '../lib/i18n.js';
import { SelectField, Button, Feedback } from '../components/ui.jsx';

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

function MatchRow({ match, onSave, busy, language }) {
  const [scoreA, setScoreA] = useState(match.scoreA ?? '');
  const [scoreB, setScoreB] = useState(match.scoreB ?? '');
  const decided = match.scoreA != null || match.scoreB != null || match.noShow;
  const isDraw = scoreA !== '' && scoreB !== '' && scoreA === scoreB;

  return (
    <article className="data-row supermelee-match-row">
      <div>
        <strong>{teamLabel(match.teamA)}</strong>
        <span>{translateText('gegen', language)}</span>
        <strong>{teamLabel(match.teamB)}</strong>
      </div>
      <div className="supermelee-match-result">
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
        <span>:</span>
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
        {isDraw && <span className="feedback error">{translateText('Unentschieden ist nicht möglich', language)}</span>}
        <Button
          variant="secondary"
          disabled={busy || scoreA === '' || scoreB === '' || isDraw}
          onClick={() => onSave(match.id, { scoreA: Number(scoreA), scoreB: Number(scoreB) })}
        >
          {decided ? translateText('Ergebnis ändern', language) : translateText('Ergebnis speichern', language)}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onSave(match.id, { noShow: 'a' })}>
          {translateText('Team A nicht angetreten', language)}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onSave(match.id, { noShow: 'b' })}>
          {translateText('Team B nicht angetreten', language)}
        </Button>
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
  const currentRoundOpen = currentRound ? currentRound.matches.some((match) => match.scoreA == null && match.scoreB == null && !match.noShow) : false;
  const canGenerateRound = selectedTournament?.status === 'running' && !currentRoundOpen;

  return (
    <div className="panel">
      <SelectField
        label="Turnier"
        value={selectedTournamentId}
        onChange={setSelectedTournamentId}
        options={tournaments.map((tournament) => ({ value: tournament.id, label: tournament.name }))}
      />

      <Feedback message={message} error={error} />

      {selectedTournament && selectedTournament.status !== 'running' && (
        <p className="hint">{translateText('Setze den Turnierstatus auf "Läuft", um Runden zu starten.', language)}</p>
      )}

      <Button disabled={busy || !selectedTournamentId || !canGenerateRound} onClick={handleNewRound}>
        {translateText('Neue Runde starten', language)}
      </Button>

      {rounds.map((round) => (
        <section key={round.id}>
          <h3>
            {translateText('Runde', language)} {round.roundNumber}
          </h3>
          {round.matches.map((match) => (
            <MatchRow key={match.id} match={match} onSave={handleSaveResult} busy={busy} language={language} />
          ))}
        </section>
      ))}

      {Boolean(ranking.length) && (
        <section>
          <h3>{translateText('Rangliste', language)}</h3>
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
        </section>
      )}
    </div>
  );
}
