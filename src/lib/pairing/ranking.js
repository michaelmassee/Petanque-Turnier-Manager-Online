const NO_SHOW_SCORE = { winner: 13, loser: 0 };

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
export function computeRanking(matches) {
  const stats = new Map();

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
