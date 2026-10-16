const NO_SHOW_SCORE = { winner: 13, loser: 0 };
// Nicht gespielte Runde bei Supermêlée: Niederlage 0:13 wie der Standard im Hauptprojekt
// (KONFIG_PROP_RANGLISTE_NICHT_GESPIELTE_RND_PLUS/MINUS, SpieltagRanglisteSheet).
export const MISSED_ROUND_SCORE = { pointsFor: 0, pointsAgainst: 13 };

function applyResult(stats, playerId, won, pointsFor, pointsAgainst) {
  const entry = stats.get(playerId) || { playerId, wins: 0, gameDiff: 0, pointsFor: 0, pointsAgainst: 0 };
  entry.wins += won ? 1 : 0;
  entry.gameDiff += won ? 1 : -1;
  entry.pointsFor += pointsFor;
  entry.pointsAgainst += pointsAgainst;
  stats.set(playerId, entry);
}

// Gleich bewertete Einträge teilen sich den Platz; der nächste Platz entspricht
// weiterhin der Zeilennummer (1, 1, 3 statt 1, 1, 2). Das entspricht der
// Platz-Formel im Hauptprojekt.
export function competitionRanks(entries, samePlace) {
  let previous = null;
  return entries.map((entry, index) => {
    const rank = previous && samePlace(previous, entry) ? previous.rank : index + 1;
    const ranked = { ...entry, rank };
    previous = ranked;
    return ranked;
  });
}

export function sameStandardRankingPlace(a, b) {
  return a.wins === b.wins
    && a.gameDiff === b.gameDiff
    && a.pointsDiff === b.pointsDiff
    && a.pointsFor === b.pointsFor;
}

// matches: [{ teamA: [ids], teamB: [ids], scoreA, scoreB, noShow: 'a' | 'b' | null }]
// Sortierkriterien wie im Hauptprojekt (SpielerSpieltagErgebnis/SpielerEndranglisteErgebnis):
// Siege absteigend, dann Spieldifferenz, dann Punktedifferenz, dann erzielte Punkte.
// missedRounds: Spieler-IDs je nicht gespielter Runde (mehrfach für mehrere Runden), gewertet mit MISSED_ROUND_SCORE;
// participants: Spieler, die auch ohne gewertete Partie in der Rangliste stehen.
export function computeRanking(matches, { missedRounds = [], participants = [] } = {}) {
  const stats = new Map();
  for (const playerId of participants) {
    if (!stats.has(playerId)) stats.set(playerId, { playerId, wins: 0, gameDiff: 0, pointsFor: 0, pointsAgainst: 0 });
  }
  for (const playerId of missedRounds) {
    applyResult(stats, playerId, false, MISSED_ROUND_SCORE.pointsFor, MISSED_ROUND_SCORE.pointsAgainst);
  }

  for (const match of matches) {
    if (match.scoreA == null && match.scoreB == null && !match.noShow) continue;

    const scoreA = match.noShow === 'a' ? NO_SHOW_SCORE.loser : match.noShow === 'b' ? NO_SHOW_SCORE.winner : match.scoreA;
    const scoreB = match.noShow === 'b' ? NO_SHOW_SCORE.loser : match.noShow === 'a' ? NO_SHOW_SCORE.winner : match.scoreB;
    if (scoreA == null || scoreB == null || scoreA === scoreB) continue;

    const aWon = scoreA > scoreB;

    for (const playerId of match.teamA) {
      applyResult(stats, playerId, aWon, scoreA, scoreB);
    }
    for (const playerId of match.teamB) {
      applyResult(stats, playerId, !aWon, scoreB, scoreA);
    }
  }

  return [...stats.values()]
    .map((entry) => ({ ...entry, pointsDiff: entry.pointsFor - entry.pointsAgainst }))
    .sort((a, b) => b.wins - a.wins || b.gameDiff - a.gameDiff || b.pointsDiff - a.pointsDiff || b.pointsFor - a.pointsFor);
}

function hasResult(match) {
  return match.scoreA != null || match.scoreB != null || Boolean(match.noShow);
}

// Supermêlée-Rangliste: rounds = [[match, ...], ...] in Rundenreihenfolge, activePlayerIds = aktuell aktive Spieler.
// Teilnehmer sind alle, die schon gespielt haben, und alle aktiven Spieler. Wer in einer vollständig eingetragenen
// Runde fehlt (später gekommen, früher gegangen, ausgesetzt), bekommt dafür eine Niederlage 0:13.
export function computeSupermeleeRanking(rounds, activePlayerIds = []) {
  const participants = new Set(activePlayerIds);
  for (const round of rounds) for (const match of round) for (const playerId of [...match.teamA, ...match.teamB]) participants.add(playerId);
  const missedRounds = [];
  for (const round of rounds) {
    if (!round.length || !round.every(hasResult)) continue;
    const played = new Set(round.flatMap((match) => [...match.teamA, ...match.teamB]));
    for (const playerId of participants) if (!played.has(playerId)) missedRounds.push(playerId);
  }
  return computeRanking(rounds.flat(), { missedRounds, participants: [...participants] });
}
