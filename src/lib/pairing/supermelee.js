// Supermêlée: jede Runde neue Teams, Einzelwertung. Teambildung wie im Hauptprojekt
// (SuperMeleePaarungenV2, turniersysteme/supermelee-fallback.md), für den Worker vereinfacht:
// - Hart: keine zwei Spieler, die schon zusammen im Team waren oder dieselbe Setzposition > 0 haben.
// - Weich: Spieler, die schon in derselben Partie standen, möglichst nicht ins selbe Team (Pass 1 vor Pass 2).
// - Fairness: Ausnahme-Teams (abweichend von der Basisgröße) bekommen die Spieler, die am seltensten darin waren.
// - Gegner-Wiederholungen werden bei der Paarung der Teams zu Partien minimiert.
// Die Suche ist per Knotenbudget begrenzt; findet keine Stufe eine Lösung, werden die Bedingungen schrittweise
// gelockert bis zur Runde ohne Bedingungen (die Auslosung scheitert nie an den Bedingungen).

// CPU-Budget: der Worker läuft im Free-Plan mit 10 ms CPU je Anfrage. Gezählt werden Arbeitsschritte der inneren
// Schleifen (Teams je Suchknoten, Kostenberechnungen, Tauschbewertungen), damit die Auslosung unabhängig von der
// Feldgröße begrenzt bleibt (gemessen: auch bei 100 Spielern wenige Millisekunden). Ist das Suchbudget verbraucht,
// geht es direkt zur Tauschsuche, die ein eigenes Budget hat und immer ein Ergebnis liefert.
const TEAM_NODE_BUDGET = 1500;
const SEARCH_WORK_BUDGET = 150000;
const SWAP_WORK_BUDGET = 60000;
// Suchknoten je Paarung der Teams zu Partien, nachdem die Greedy-Lösung steht.
const PAIRING_NODE_BUDGET = 150;
const SHUFFLES = 6;
const OPPONENT_REPEAT_WEIGHT = 10000;
const CROSSOVER_WEIGHT = 1;
// Nur in der letzten Stufe (Tauschsuche) relevant: Setzpositions-Konflikte wiegen schwerer als Partner-Wiederholungen.
const SAME_SEED_PENALTY = 1000;
const TEAMMATE_REPEAT_PENALTY = 1;
const SWAP_PASSES = 20;

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function shuffle(list, random) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Basis-Teamgröße der Formation: 2 bei Doublette (Basisspiel 2v2 = 4), sonst 3
// (Basisspiel 3v3 = 6). "Ausnahme-Spiele"/"Ausnahme-Teams" sind alle, die von
// dieser Basisgröße abweichen (siehe computeGameSizes, buildHistoryIndex,
// generateRound - alle drei müssen dieselbe Basisgröße verwenden).
function baseTeamSize(formation) {
  return formation === 'doublette' ? 2 : 3;
}

// Ein "Spiel" besteht aus zwei Teams (Größe 2 oder 3). Gültige Spielgrößen sind
// 4 (2v2), 5 (3v2) und 6 (3v3). Wir suchen die Kombination von Spielgrößen, die
// alle n Spieler verbraucht, mit möglichst wenigen "Ausnahme-Spielen" (4er/5er
// bei Triplette-Turnieren bzw. 5er/6er bei Doublette-Turnieren).
export function computeGameSizes(playerCount, formation) {
  if (playerCount < 4) {
    return null;
  }
  const preferSix = baseTeamSize(formation) === 3;
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
// gamePairs: Paare, die schon in derselben Partie standen (Mitspieler oder Gegner, warImSpielMit im Hauptprojekt).
export function buildHistoryIndex(history, formation) {
  const teammatePairs = new Set();
  const opponentPairs = new Set();
  const gamePairs = new Set();
  const exceptionCounts = {};
  const base = baseTeamSize(formation);

  for (const match of history || []) {
    const teamA = match.teamA || [];
    const teamB = match.teamB || [];
    for (const team of [teamA, teamB]) {
      if (team.length !== base) {
        for (const playerId of team) {
          exceptionCounts[playerId] = (exceptionCounts[playerId] || 0) + 1;
        }
      }
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          teammatePairs.add(pairKey(team[i], team[j]));
          gamePairs.add(pairKey(team[i], team[j]));
        }
      }
    }
    for (const a of teamA) {
      for (const b of teamB) {
        opponentPairs.add(pairKey(a, b));
        gamePairs.add(pairKey(a, b));
      }
    }
  }

  return { teammatePairs, opponentPairs, gamePairs, exceptionCounts };
}

export const MIN_PLAYERS = 4;

// Partien haben 4, 5 oder 6 Spieler; daraus lässt sich jede Zahl ab 4 außer 7 zusammensetzen (computeGameSizes).
// Deshalb nennt die Meldung die 7 und die Abhilfe konkret, statt nur „keine gültige Rundenaufteilung“.
export const SEVEN_PLAYERS_MESSAGE = 'Mit 7 aktiven Spielern ist keine Supermêlée-Runde möglich, weil jede Partie 4, 5 oder 6 Spieler hat. Bitte einen Spieler aktivieren bzw. nachmelden oder einen deaktivieren.';

// Prüft, ob genug bestätigte Meldungen für eine gültige Rundenaufteilung vorliegen,
// ohne (wie generateRound) tatsächlich eine Runde auszulosen. Gibt eine Liste
// generischer, UI-seitig renderbarer Anforderungs-Objekte zurück (leer = alle
// Voraussetzungen erfüllt) - damit proaktiv angezeigt werden kann, was fehlt,
// statt es erst nach einem Fehlschlag von generateRound zu erfahren.
//
// { type: 'minPlayers', min } statt eines fertigen Satzes mit eingebackener Zahl,
// damit die Mindestanzahl je System/Formation unterschiedlich sein kann, ohne dass
// UI oder i18n-Wörterbuch etwas Systemspezifisches wissen müssen (siehe
// lib/pairing/index.js#checkRoundRequirements).
export function checkRequirements(confirmedCount, { formation } = {}) {
  if (confirmedCount < MIN_PLAYERS) {
    return [{ type: 'minPlayers', min: MIN_PLAYERS }];
  }
  if (!computeGameSizes(confirmedCount, formation)) {
    return [{ type: 'message', text: SEVEN_PLAYERS_MESSAGE }];
  }
  return [];
}

class BudgetExceeded extends Error {}

// Backtracking: verteilt die Spieler (am stärksten eingeschränkte zuerst) auf die Teams. Leere Teams gleicher Größe
// sind austauschbar, daher wird je Größe nur das erste leere Team probiert. Liefert null, wenn keine Verteilung
// existiert oder das Budget erschöpft ist. Spieler und Teams sind Indizes, blocked eine n×n-Matrix; allowed(player,
// size) legt fest, ob ein Spieler in ein Team dieser Größe darf (Fairness der Ausnahme-Teams).
function buildTeams(order, sizes, blocked, n, allowed, work) {
  const teams = sizes.map(() => []);
  let nodes = 0;
  const place = (index) => {
    if (index === order.length) return true;
    nodes += 1;
    work.search += teams.length;
    if (nodes > TEAM_NODE_BUDGET || work.search > SEARCH_WORK_BUDGET) throw new BudgetExceeded();
    const player = order[index];
    let triedEmptyTwo = false;
    let triedEmptyThree = false;
    for (let t = 0; t < teams.length; t++) {
      const team = teams[t];
      if (team.length === sizes[t] || !allowed(player, sizes[t])) continue;
      if (!team.length) {
        if (sizes[t] === 2 ? triedEmptyTwo : triedEmptyThree) continue;
        if (sizes[t] === 2) triedEmptyTwo = true; else triedEmptyThree = true;
      }
      if (team.some((member) => blocked[member * n + player])) continue;
      team.push(player);
      if (place(index + 1)) return true;
      team.pop();
    }
    return false;
  };
  try {
    return place(0) ? teams : null;
  } catch (error) {
    if (error instanceof BudgetExceeded) return null;
    throw error;
  }
}

// Letzte Stufe, wenn kein Backtracking eine konfliktfreie Verteilung findet: zufällig verteilen und dann Spieler
// zwischen gleichartigen Teams tauschen, solange das Setzpositions-Konflikte und Partner-Wiederholungen senkt.
function buildTeamsBySwaps(groups, n, penalty, work) {
  const teams = [];
  for (const { players, sizes } of groups) {
    let offset = 0;
    const groupTeams = sizes.map((size) => { const team = players.slice(offset, offset + size); offset += size; return team; });
    // Kostenänderung, wenn x (Team a) und y (Team b) die Plätze tauschen.
    const delta = (teamA, x, teamB, y) => {
      work.swaps += teamA.length + teamB.length;
      let change = 0;
      for (const member of teamA) if (member !== x) change += penalty[member * n + y] - penalty[member * n + x];
      for (const member of teamB) if (member !== y) change += penalty[member * n + x] - penalty[member * n + y];
      return change;
    };
    for (let pass = 0; pass < SWAP_PASSES && work.swaps < SWAP_WORK_BUDGET; pass++) {
      let improved = false;
      for (let a = 0; a < groupTeams.length; a++) {
        for (let b = a + 1; b < groupTeams.length; b++) {
          const teamA = groupTeams[a];
          const teamB = groupTeams[b];
          for (let i = 0; i < teamA.length; i++) {
            for (let j = 0; j < teamB.length; j++) {
              if (delta(teamA, teamA[i], teamB, teamB[j]) < 0) {
                [teamA[i], teamB[j]] = [teamB[j], teamA[i]];
                improved = true;
              }
            }
          }
        }
      }
      if (!improved) break;
    }
    teams.push(...groupTeams);
  }
  return teams;
}

// Paart die Teams zu Partien der vorgegebenen Größen (3v3, 3v2, 2v2) mit möglichst wenigen Gegner-Wiederholungen.
// Tiefensuche mit Kandidaten nach Kosten sortiert: der erste vollständige Weg entspricht der Greedy-Lösung, danach
// wird im Budget mit Schranke weiter verbessert.
function pairTeams(teams, gameSizes, cost, work) {
  const remainingGames = { 6: 0, 5: 0, 4: 0 };
  for (const size of gameSizes) remainingGames[size] += 1;
  const ordered = [...teams].sort((a, b) => b.length - a.length);
  const used = new Array(ordered.length).fill(false);
  const current = [];
  let best = null;
  let bestCost = Infinity;
  let nodes = 0;
  const search = (costSoFar) => {
    // Der erste vollständige Weg (Greedy) wird immer zu Ende gerechnet, verbessert wird nur im Budget.
    if (costSoFar >= bestCost || (best && (nodes > PAIRING_NODE_BUDGET || work.search > SEARCH_WORK_BUDGET))) return;
    nodes += 1;
    const first = used.indexOf(false);
    if (first === -1) {
      best = [...current];
      bestCost = costSoFar;
      return;
    }
    used[first] = true;
    const candidates = [];
    for (let other = first + 1; other < ordered.length; other++) {
      if (used[other]) continue;
      const size = ordered[first].length + ordered[other].length;
      if (!remainingGames[size]) continue;
      work.search += ordered[first].length * ordered[other].length;
      candidates.push({ other, size, cost: cost(ordered[first], ordered[other]) });
    }
    candidates.sort((a, b) => a.cost - b.cost);
    for (const candidate of candidates) {
      used[candidate.other] = true;
      remainingGames[candidate.size] -= 1;
      current.push({ teamA: ordered[first], teamB: ordered[candidate.other] });
      search(costSoFar + candidate.cost);
      current.pop();
      remainingGames[candidate.size] += 1;
      used[candidate.other] = false;
    }
    used[first] = false;
  };
  search(0);
  return best && { matches: best, cost: bestCost };
}

/**
 * @param players [{ id, seedPosition }] oder IDs
 * @param history bisherige Partien [{ teamA: [ids], teamB: [ids] }]
 * @returns { matches: [{ teamA, teamB }] }
 */
export function generateRound(players, history, { formation, random = Math.random } = {}) {
  const playerIds = players.map((player) => player.id ?? player);
  if (playerIds.length < 4) {
    throw new Error('Für eine Runde werden mindestens 4 Spieler benötigt.');
  }

  const gameSizes = computeGameSizes(playerIds.length, formation);
  if (!gameSizes) {
    throw new Error(SEVEN_PLAYERS_MESSAGE);
  }

  // Paar-Eigenschaften als n×n-Matrizen über Spieler-Indizes, damit die Suche auch bei 100 Spielern im CPU-Budget
  // eines Workers bleibt.
  const n = playerIds.length;
  const indexById = new Map(playerIds.map((id, index) => [id, index]));
  const teammate = new Uint8Array(n * n);
  const opponent = new Uint8Array(n * n);
  const sameGame = new Uint8Array(n * n);
  const sameSeed = new Uint8Array(n * n);
  const mark = (matrix, a, b) => { matrix[a * n + b] = 1; matrix[b * n + a] = 1; };
  const exceptionCounts = new Array(n).fill(0);
  const base = baseTeamSize(formation);
  for (const match of history || []) {
    const teamA = (match.teamA || []).map((id) => indexById.get(id)).filter((index) => index !== undefined);
    const teamB = (match.teamB || []).map((id) => indexById.get(id)).filter((index) => index !== undefined);
    for (const [team, original] of [[teamA, match.teamA || []], [teamB, match.teamB || []]]) {
      if (original.length !== base) for (const index of team) exceptionCounts[index] += 1;
      for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) { mark(teammate, team[i], team[j]); mark(sameGame, team[i], team[j]); }
    }
    for (const a of teamA) for (const b of teamB) { mark(opponent, a, b); mark(sameGame, a, b); }
  }
  const seeds = players.map((player) => Number(player.seedPosition || 0));
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (seeds[a] > 0 && seeds[a] === seeds[b]) mark(sameSeed, a, b);
  const hard = teammate.map((value, index) => value | sameSeed[index]);
  const hardAndSoft = hard.map((value, index) => value | sameGame[index]);
  const swapPenalty = teammate.map((value, index) => value * TEAMMATE_REPEAT_PENALTY + sameSeed[index] * SAME_SEED_PENALTY);

  const teamSizes = gameSizes.flatMap(splitGameSize);
  const exceptionSizes = teamSizes.filter((size) => size !== base);
  const baseSizes = teamSizes.filter((size) => size === base);
  const exceptionSeats = exceptionSizes.reduce((sum, size) => sum + size, 0);

  const cost = (teamA, teamB) => {
    let total = 0;
    for (const a of teamA) {
      for (const b of teamB) {
        if (opponent[a * n + b]) total += OPPONENT_REPEAT_WEIGHT;
        else if (teammate[a * n + b]) total += CROSSOVER_WEIGHT;
      }
    }
    return total;
  };

  // Fairness der Ausnahme-Teams: Ideal sitzen die exceptionSeats am wenigsten belasteten Spieler in den
  // Ausnahme-Teams. Wer weniger belastet ist als der Grenzwert (Belastung des exceptionSeats-ten Spielers), muss in
  // ein Ausnahme-Team, wer stärker belastet ist, in ein Basis-Team; Spieler auf dem Grenzwert sind frei. slack lockert
  // das um ± slack, null schaltet die Fairness ab.
  const boundary = exceptionSeats ? [...exceptionCounts].sort((a, b) => a - b)[exceptionSeats - 1] : 0;
  const allowedFor = (slack) => (slack === null
    ? () => true
    : (player, size) => (size === base ? exceptionCounts[player] >= boundary - slack : exceptionCounts[player] <= boundary + slack));
  // Für die Tauschsuche: strikt getrennte Gruppen (am wenigsten Belastete in die Ausnahme-Teams, Gleichstände zufällig).
  const swapGroups = (fair) => {
    const shuffled = shuffle([...Array(n).keys()], random);
    if (!fair) return [{ players: shuffled, sizes: teamSizes }];
    const byLoad = shuffled.sort((a, b) => exceptionCounts[a] - exceptionCounts[b]);
    return [{ players: byLoad.slice(0, exceptionSeats), sizes: exceptionSizes }, { players: byLoad.slice(exceptionSeats), sizes: baseSizes }];
  };
  // Reihenfolge je Versuch: am stärksten eingeschränkte Spieler zuerst, bei Gleichstand zufällig.
  const degreeOrder = (blocked) => {
    const degree = new Array(n).fill(0);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) degree[a] += blocked[a * n + b];
    return () => shuffle([...Array(n).keys()], random).sort((a, b) => degree[b] - degree[a]);
  };

  // Stufen in der Reihenfolge des Hauptprojekts: faire Ausnahme-Teams (erst streng, dann um 1 gelockert) mit Pass 1
  // (auch keine Spieler derselben früheren Partie) und Pass 2, dann ohne Fairness, zuletzt die Tauschsuche, die immer
  // ein Ergebnis liefert.
  const slacks = exceptionSeats ? [0, 1, null] : [null];
  const stages = [
    ...slacks.flatMap((slack) => [{ slack, blocked: hardAndSoft }, { slack, blocked: hard }]),
    { swaps: true },
  ];

  const work = { search: 0, swaps: 0 };
  for (const stage of stages) {
    if (!stage.swaps && work.search > SEARCH_WORK_BUDGET) continue;
    const order = stage.swaps ? null : degreeOrder(stage.blocked);
    let best = null;
    for (let attempt = 0; attempt < SHUFFLES; attempt++) {
      if (attempt > 0 && (stage.swaps ? work.swaps >= SWAP_WORK_BUDGET : work.search > SEARCH_WORK_BUDGET)) break;
      const teams = stage.swaps
        ? buildTeamsBySwaps(swapGroups(exceptionSeats > 0), n, swapPenalty, work)
        : buildTeams(order(), teamSizes, stage.blocked, n, allowedFor(stage.slack), work);
      if (!teams) continue;
      const pairing = pairTeams(teams, gameSizes, cost, work);
      if (!pairing) continue;
      let conflicts = 0;
      if (stage.swaps) for (const team of teams) for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) conflicts += swapPenalty[team[i] * n + team[j]];
      const score = conflicts * OPPONENT_REPEAT_WEIGHT * 100 + pairing.cost;
      if (!best || score < best.score) best = { matches: pairing.matches, score };
      if (score === 0) break;
    }
    if (best) {
      const toIds = (team) => team.map((index) => playerIds[index]);
      return { matches: best.matches.map(({ teamA, teamB }) => ({ teamA: toIds(teamA), teamB: toIds(teamB) })) };
    }
  }
  throw new Error('Für diese Spieleranzahl ist keine gültige Rundenaufteilung möglich.');
}
