function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Ein "Spiel" besteht aus zwei Teams (Größe 2 oder 3). Gültige Spielgrößen sind
// 4 (2v2), 5 (3v2) und 6 (3v3). Wir suchen die Kombination von Spielgrößen, die
// alle n Spieler verbraucht, mit möglichst wenigen "Ausnahme-Spielen" (4er/5er
// bei Triplette-Turnieren bzw. 5er/6er bei Doublette-Turnieren).
export function computeGameSizes(playerCount, formation) {
  if (playerCount < 4) {
    return null;
  }
  const preferSix = formation !== 'doublette';
  const combos = [];
  for (let sixes = 0; sixes * 6 <= playerCount; sixes++) {
    const afterSixes = playerCount - sixes * 6;
    for (let fives = 0; fives * 5 <= afterSixes; fives++) {
      const remainder = afterSixes - fives * 5;
      if (remainder % 4 === 0) {
        combos.push({ fours: remainder / 4, fives, sixes });
      }
    }
  }
  if (!combos.length) {
    return null;
  }
  // Ausnahme-Spiele weichen von der Basisgröße des Hauptmodus ab (siehe Hauptprojekt,
  // turniersysteme/07_Supermelee.md, Abschnitt 3): bei Triplette (Basis 6) sind 4er/5er
  // die Ausnahme, bei Doublette (Basis 4) sind 5er/6er die Ausnahme. Wer welches Muster
  // bevorzugt, entscheidet preferSix - nicht pauschal fours+fives.
  combos.sort((a, b) => {
    const exceptionsA = preferSix ? a.fours + a.fives : a.fives + a.sixes;
    const exceptionsB = preferSix ? b.fours + b.fives : b.fives + b.sixes;
    if (exceptionsA !== exceptionsB) {
      return exceptionsA - exceptionsB;
    }
    return preferSix ? b.sixes - a.sixes : b.fours - a.fours;
  });
  const best = combos[0];
  const sizes = [];
  for (let i = 0; i < best.sixes; i++) sizes.push(6);
  for (let i = 0; i < best.fives; i++) sizes.push(5);
  for (let i = 0; i < best.fours; i++) sizes.push(4);
  return sizes;
}

function splitGameSize(gameSize) {
  if (gameSize === 4) return [2, 2];
  if (gameSize === 6) return [3, 3];
  return [3, 2];
}

// history: flaches Array bisheriger Matches dieses Turniers, je { teamA: [ids], teamB: [ids] }
export function buildHistoryIndex(history) {
  const teammatePairs = new Set();
  const opponentPairs = new Set();
  const exceptionCounts = {};

  for (const match of history || []) {
    const teamA = match.teamA || [];
    const teamB = match.teamB || [];
    for (const team of [teamA, teamB]) {
      if (team.length !== 3) {
        for (const playerId of team) {
          exceptionCounts[playerId] = (exceptionCounts[playerId] || 0) + 1;
        }
      }
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          teammatePairs.add(pairKey(team[i], team[j]));
        }
      }
    }
    for (const a of teamA) {
      for (const b of teamB) {
        opponentPairs.add(pairKey(a, b));
      }
    }
  }

  return { teammatePairs, opponentPairs, exceptionCounts };
}

function pickTeam(pool, assigned, size, teammatePairs) {
  const team = [];
  for (const candidate of pool) {
    if (assigned.has(candidate)) continue;
    const conflicts = team.some((member) => teammatePairs.has(pairKey(member, candidate)));
    if (conflicts) continue;
    team.push(candidate);
    assigned.add(candidate);
    if (team.length === size) break;
  }
  if (team.length < size) {
    for (const candidate of pool) {
      if (assigned.has(candidate) || team.includes(candidate)) continue;
      team.push(candidate);
      assigned.add(candidate);
      if (team.length === size) break;
    }
  }
  return team;
}

function countConflicts(matches, teammatePairs, opponentPairs) {
  let conflicts = 0;
  for (const { teamA, teamB } of matches) {
    for (const team of [teamA, teamB]) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          if (teammatePairs.has(pairKey(team[i], team[j]))) conflicts += 1000;
        }
      }
    }
    for (const a of teamA) {
      for (const b of teamB) {
        if (opponentPairs.has(pairKey(a, b))) conflicts += 1;
      }
    }
  }
  return conflicts;
}

export function generateRound(players, history, { formation, attempts = 20 } = {}) {
  const playerIds = players.map((player) => player.id ?? player);
  if (playerIds.length < 4) {
    throw new Error('Für eine Runde werden mindestens 4 Spieler benötigt.');
  }

  const gameSizes = computeGameSizes(playerIds.length, formation);
  if (!gameSizes) {
    throw new Error('Für diese Spieleranzahl ist keine gültige Rundenaufteilung möglich.');
  }

  const { teammatePairs, opponentPairs, exceptionCounts } = buildHistoryIndex(history || []);

  const gamesBySize = gameSizes.map((size) => ({ size, teamSizes: splitGameSize(size) }));
  gamesBySize.sort((a, b) => a.size - b.size);

  let best = null;
  let bestConflicts = Infinity;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const fairnessOrder = shuffle(playerIds).sort((a, b) => (exceptionCounts[a] || 0) - (exceptionCounts[b] || 0));
    const randomOrder = shuffle(playerIds);
    const assigned = new Set();
    const matches = [];

    for (const game of gamesBySize) {
      const isExceptionGame = game.size !== 6;
      const pool = isExceptionGame ? fairnessOrder : randomOrder;
      const teamA = pickTeam(pool, assigned, game.teamSizes[0], teammatePairs);
      const teamB = pickTeam(pool, assigned, game.teamSizes[1], teammatePairs);
      matches.push({ teamA, teamB });
    }

    const conflicts = countConflicts(matches, teammatePairs, opponentPairs);
    if (conflicts === 0) {
      return { matches };
    }
    if (conflicts < bestConflicts) {
      bestConflicts = conflicts;
      best = matches;
    }
  }

  return { matches: best };
}
