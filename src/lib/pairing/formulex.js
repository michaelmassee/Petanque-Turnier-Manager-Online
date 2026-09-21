// Formule X Regeln entsprechend dem Hauptprojekt (algorithmen/formulex/FormuleX.java,
// FormuleXRanglisteRechner.java, algorithmen/liga/Direktvergleich.java): freie Losung in
// Runde 1, danach Paarung nach Wertungspunkten mit Swap-Rematch-Vermeidung, Freilos an
// das schlechtest platzierte Team ohne bisheriges Freilos.
const NO_SHOW_SCORE = { winner: 13, loser: 0 };

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

// Siegaufschlag hängt von den BISHER GESPIELTEN Runden ab, nicht von der konfigurierten
// Gesamtrundenzahl - er wird bei jeder Neuberechnung frisch bestimmt und rückwirkend auf
// die gesamte Historie angewendet (siehe FormuleXRanglisteSheet.leseAlleRunden).
export function getSiegaufschlag(roundsPlayed) {
  if (roundsPlayed <= 4) return 100;
  if (roundsPlayed <= 8) return 200;
  return 300;
}

export function pairingsPerRound(teamCount) {
  const freiSpiel = teamCount % 2 === 1;
  const letzteMeldungNr = freiSpiel ? teamCount + 1 : teamCount;
  return Math.floor(letzteMeldungNr / 2);
}

export function checkRequirements(confirmedCount, { registrationType, roundsPlayed = 0, formuleXRounds = 4 } = {}) {
  if (confirmedCount < 4) {
    return [{ type: 'minPlayers', min: 4 }];
  }
  if (registrationType && registrationType !== 'forme') {
    return [{ type: 'message', text: 'Formule X ist online nur mit Anmeldeart "Formée" (feste Teams) spielbar.' }];
  }
  if (roundsPlayed >= formuleXRounds) {
    return [{ type: 'message', text: 'Alle Runden wurden bereits gespielt.' }];
  }
  return [];
}

// Aggregiert die Historie pro Team (1:1 nach FormuleXRanglisteSheet.leseRundeEin): Freilos
// zählt als Sieg mit fixer Wertung 126, ohne die Punkte-Summen zu berühren. Sieger bekommen
// Siegaufschlag + eigene Punkte + Differenz, Verlierer (und bei Unentschieden beide) nur die
// eigenen Punkte.
export function formuleXStats(teams, history, roundsPlayed) {
  const siegaufschlag = getSiegaufschlag(roundsPlayed);
  const stats = new Map(teams.map((team) => [team.id, {
    teamId: team.id, wins: 0, losses: 0, wertung: 0, pointsFor: 0, pointsAgainst: 0, hadBye: false, opponents: new Set(), gamesAgainst: new Map(),
  }]));

  for (const match of history) {
    const a = match.teamA?.[0]; const b = match.teamB?.[0];
    if (!a || !stats.has(a)) continue;
    const entryA = stats.get(a);
    if (!b) { entryA.wins++; entryA.wertung += 126; entryA.hadBye = true; continue; }
    const entryB = stats.get(b); if (!entryB) continue;

    const scoreA = match.noShow === 'a' ? NO_SHOW_SCORE.loser : match.noShow === 'b' ? NO_SHOW_SCORE.winner : match.scoreA;
    const scoreB = match.noShow === 'b' ? NO_SHOW_SCORE.loser : match.noShow === 'a' ? NO_SHOW_SCORE.winner : match.scoreB;
    if (scoreA == null || scoreB == null) continue;

    entryA.pointsFor += scoreA; entryA.pointsAgainst += scoreB;
    entryB.pointsFor += scoreB; entryB.pointsAgainst += scoreA;
    entryA.opponents.add(b); entryB.opponents.add(a);
    entryA.gamesAgainst.set(b, { ownScore: scoreA, oppScore: scoreB });
    entryB.gamesAgainst.set(a, { ownScore: scoreB, oppScore: scoreA });

    if (scoreA > scoreB) { entryA.wins++; entryB.losses++; entryA.wertung += siegaufschlag + scoreA + (scoreA - scoreB); entryB.wertung += scoreB; }
    else if (scoreB > scoreA) { entryB.wins++; entryA.losses++; entryB.wertung += siegaufschlag + scoreB + (scoreB - scoreA); entryA.wertung += scoreA; }
    else { entryA.wertung += scoreA; entryB.wertung += scoreB; }
  }

  // gameDiff (Siege minus Niederlagen) wird nur für die generische Ranglisten-Anzeige
  // (TournamentPlayManagement.jsx, Spalte "Spiele -": wins - gameDiff) benötigt - für die
  // Formule-X-eigene Sortierung/Wertung ist es ohne Bedeutung.
  return [...stats.values()].map((entry) => ({ ...entry, gameDiff: entry.wins - entry.losses, pointsDiff: entry.pointsFor - entry.pointsAgainst }));
}

function basisCompare(a, b) {
  return b.wins - a.wins || b.wertung - a.wertung || b.pointsDiff - a.pointsDiff || b.pointsFor - a.pointsFor || a.teamId.localeCompare(b.teamId);
}

// Direktvergleich (algorithmen/liga/Direktvergleich.java): Summe Siege im direkten Duell,
// dann Summe Spielpunkte im direkten Duell. Nur für exakt zwei gleichrangige Teams
// angewendet - bei 3+ (möglicher Zyklus) bleibt die Basissortierung nach Teamnummer.
function direktvergleich(a, b) {
  const gameA = a.gamesAgainst.get(b.teamId);
  const gameB = b.gamesAgainst.get(a.teamId);
  if (!gameA || !gameB) return 0;
  const winsA = gameA.ownScore > gameA.oppScore ? 1 : 0;
  const winsB = gameB.ownScore > gameB.oppScore ? 1 : 0;
  if (winsA !== winsB) return winsB - winsA;
  return gameB.ownScore - gameA.ownScore;
}

export function sameFormuleXRankingPlace(a, b) {
  return a.wins === b.wins && a.wertung === b.wertung && a.pointsDiff === b.pointsDiff && a.pointsFor === b.pointsFor;
}

export function sortFormuleX(stats) {
  const sorted = [...stats].sort(basisCompare);
  let start = 0;
  while (start < sorted.length) {
    let end = start + 1;
    while (end < sorted.length && sameFormuleXRankingPlace(sorted[start], sorted[end])) end++;
    if (end - start === 2) {
      const cmp = direktvergleich(sorted[start], sorted[end - 1]);
      if (cmp > 0) [sorted[start], sorted[end - 1]] = [sorted[end - 1], sorted[start]];
    }
    start = end;
  }
  return sorted;
}

// Ermittelt das Freilos-Team (findeByeTeam): rückwärts durch die sortierte Rangliste
// (schlechtest platziert zuerst) das erste Team ohne bisheriges Freilos, sonst Fallback
// letztes Team.
export function findByeTeam(ordered, statsById) {
  for (let index = ordered.length - 1; index >= 0; index--) {
    if (!statsById.get(ordered[index].id).hadBye) return ordered[index];
  }
  return ordered[ordered.length - 1];
}

// Paart linear nach Rangliste mit Swap-Backtracking bei Rematch (paareLinearMitSwap):
// 1vs2, 3vs4, ...; bei Rematch wird mit dem nächsten unverbrauchten Paar getauscht (zwei
// Varianten), sonst wird das Rematch als Fail-Safe akzeptiert.
export function pairLinearWithSwap(ordered, statsById) {
  const played = (teamA, teamB) => statsById.get(teamA.id).opponents.has(teamB.id);
  const matches = [];
  const processed = new Set();

  for (let i = 0; i < ordered.length - 1; i += 2) {
    if (processed.has(i)) continue;
    const teamA = ordered[i]; const teamB = ordered[i + 1];

    if (!played(teamA, teamB)) {
      matches.push({ teamA: [teamA.id], teamB: [teamB.id] });
      continue;
    }

    let swapped = false;
    for (let j = i + 2; j + 1 < ordered.length; j += 2) {
      if (processed.has(j)) continue;
      const teamC = ordered[j]; const teamD = ordered[j + 1];

      if (!played(teamA, teamC) && !played(teamB, teamD)) {
        matches.push({ teamA: [teamA.id], teamB: [teamC.id] });
        matches.push({ teamA: [teamB.id], teamB: [teamD.id] });
        processed.add(j); swapped = true; break;
      }
      if (!played(teamA, teamD) && !played(teamC, teamB)) {
        matches.push({ teamA: [teamA.id], teamB: [teamD.id] });
        matches.push({ teamA: [teamC.id], teamB: [teamB.id] });
        processed.add(j); swapped = true; break;
      }
    }
    if (!swapped) {
      matches.push({ teamA: [teamA.id], teamB: [teamB.id] });
    }
  }
  return matches;
}

// Runde 1 (ersteRunde): Teams zufällig mischen, in zwei Hälften teilen, paarweise gegeneinander;
// bei ungerader Zahl bleibt ein Team ohne Partner (Freilos).
function firstRound(teams) {
  const perRound = pairingsPerRound(teams.length);
  const shuffled = shuffle(teams);
  const listA = shuffled.slice(0, perRound);
  const listB = shuffled.slice(perRound);
  const matches = [];
  for (let i = 0; i < perRound; i++) {
    const teamA = listA[i];
    const teamB = (perRound - i) <= listB.length ? listB[perRound - i - 1] : null;
    matches.push(teamB ? { teamA: [teamA.id], teamB: [teamB.id] } : { teamA: [teamA.id], teamB: [] });
  }
  // Freilos ans Ende (kosmetisch, wie im Hauptprojekt-Sortierschritt von ersteRunde).
  return [...matches.filter((match) => match.teamB.length), ...matches.filter((match) => !match.teamB.length)];
}

// history: bisherige Matches dieses Turniers ({ teamA: [teamId], teamB: [teamId], scoreA, scoreB, noShow }).
export function generateRound(teams, history, { formuleXRounds = 4 } = {}) {
  if (teams.length < 2) {
    throw new Error('Für eine Runde werden mindestens 2 Teams benötigt.');
  }
  const perRound = pairingsPerRound(teams.length);
  const roundsPlayed = Math.floor((history?.length || 0) / perRound);
  if (roundsPlayed >= formuleXRounds) {
    throw new Error('Alle Runden wurden bereits gespielt.');
  }

  if (!history?.length) {
    return { matches: firstRound(teams) };
  }

  const stats = formuleXStats(teams, history, roundsPlayed);
  const statsById = new Map(stats.map((entry) => [entry.teamId, entry]));
  const byId = new Map(teams.map((team) => [team.id, team]));
  let ordered = sortFormuleX(stats).map((entry) => byId.get(entry.teamId));

  let byeMatch = null;
  if (ordered.length % 2) {
    const byeTeam = findByeTeam(ordered, statsById);
    ordered = ordered.filter((team) => team.id !== byeTeam.id);
    byeMatch = { teamA: [byeTeam.id], teamB: [] };
  }

  const matches = pairLinearWithSwap(ordered, statsById);
  if (byeMatch) matches.push(byeMatch);
  return { matches };
}
