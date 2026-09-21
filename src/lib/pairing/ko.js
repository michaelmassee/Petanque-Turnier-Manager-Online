// K.O.-System 1:1 nach Hauptprojekt-Referenz portiert:
// algorithmen/common/CadrageRechner.java (Cadrage statt Freilos), algorithmen/common/
// GruppenAufteilungRechner.java (Gruppenaufteilung bei großen Feldern), ko/KoTurnierbaumSheet.java
// (Setzliste, Winner-Advance, Spiel um Platz 3). Feste Teams (Formée), keine
// Ergebnis-abhängige Neupaarung innerhalb eines Baums - nur Sieger rücken vor.

// Größte Zweierpotenz <= n (Integer.highestOneBit, ohne Schleife/Obergrenze im Original;
// hier über einen einfachen Verdopplungs-Loop, weil JS kein Bit-Intrinsic dafür hat).
export function highestPowerOfTwo(n) {
  if (n < 1) return 0;
  let power = 1;
  while (power * 2 <= n) power *= 2;
  return power;
}

// Rekursives Standard-Sportbracket-Seeding (KoTurnierbaumSheet.berechneSetzliste):
// Seed 1 und Seed 2 treffen sich garantiert erst im Finale. n muss eine Zweierpotenz sein.
export function berechneSetzliste(n) {
  if (n === 1) return [1];
  const prev = berechneSetzliste(n / 2);
  const result = new Array(n);
  for (let i = 0; i < n / 2; i++) {
    result[2 * i] = prev[i];
    result[2 * i + 1] = n + 1 - prev[i];
  }
  return result;
}

// Cadrage-Parameter (CadrageRechner): kein Freilos - bei Nicht-Zweierpotenz spielen die
// schlechtest gesetzten Teams eine Vorrunde, die bestgesetzten starten direkt in Runde 1.
export function planBracket(teamCount) {
  const bracketSize = highestPowerOfTwo(teamCount);
  const numRounds = Math.log2(bracketSize);
  const cadrageCount = (teamCount - bracketSize) * 2; // gerade Zahl oder 0
  const ohneCadrage = bracketSize - cadrageCount / 2;
  return { bracketSize, numRounds, cadrageCount, ohneCadrage };
}

// Rundentitel dynamisch aus der verbleibenden Rundenzahl abgeleitet (KoTurnierbaumSheet.
// berechnRundenTitel), kein hartkodiertes Namens-Mapping für "Achtelfinale" etc.
export function roundTitle(localRoundIndex, numRounds) {
  if (localRoundIndex === numRounds) return 'Finale';
  if (localRoundIndex === numRounds - 1) return 'Halbfinale';
  const teamsInRound = 1 << (numRounds - localRoundIndex + 1);
  return `1/${teamsInRound / 2}-Finale`;
}

// Setzrang-Reihenfolge (Meldeliste-"RNG"): gesetzte Teams aufsteigend nach seedPosition,
// unseeded (0/fehlend) danach in ihrer bestehenden Reihenfolge - automatischer Fallback für
// die im Hauptprojekt interaktive "Rang durchnummerieren"-Dialogfunktion, die es online nicht gibt.
export function orderBySeed(teams) {
  const seeded = teams.filter((team) => team.seedPosition > 0).sort((a, b) => a.seedPosition - b.seedPosition);
  const unseeded = teams.filter((team) => !(team.seedPosition > 0));
  return [...seeded, ...unseeded];
}

// Gruppenaufteilung bei großen Feldern (GruppenAufteilungRechner): Blockbildung à
// maxGroupSize, eine zu kleine letzte Gruppe wird in die vorherige gefaltet (deren eigene
// Cadrage gleicht das dann wieder auf Zweierpotenz aus). orderedTeamIds muss bereits nach
// Setzrang sortiert sein (siehe orderBySeed).
export function assignGroups(orderedTeamIds, { maxGroupSize = 16, minLastGroupSize = 4 } = {}) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (orderedTeamIds.length <= maxGroupSize) {
    return orderedTeamIds.map((teamId) => ({ teamId, group: 'A' }));
  }
  const blocks = [];
  for (let start = 0; start < orderedTeamIds.length; start += maxGroupSize) {
    blocks.push(orderedTeamIds.slice(start, start + maxGroupSize));
  }
  if (blocks.length > 1 && blocks[blocks.length - 1].length < minLastGroupSize) {
    const last = blocks.pop();
    blocks[blocks.length - 1] = [...blocks[blocks.length - 1], ...last];
  }
  const result = [];
  blocks.forEach((block, index) => {
    const group = letters[index] || `G${index + 1}`;
    for (const teamId of block) result.push({ teamId, group });
  });
  return result;
}

export function checkRequirements(confirmedCount, { registrationType } = {}) {
  if (confirmedCount < 2) {
    return [{ type: 'minPlayers', min: 2 }];
  }
  if (registrationType && registrationType !== 'forme') {
    return [{ type: 'message', text: 'K.O. ist online nur mit Anmeldeart "Formée" (feste Teams) spielbar.' }];
  }
  return [];
}

function scoreOutcome(match) {
  if (match.noShow === 'a') return 'b';
  if (match.noShow === 'b') return 'a';
  if (match.scoreA == null || match.scoreB == null || match.scoreA === match.scoreB) return null;
  return match.scoreA > match.scoreB ? 'a' : 'b';
}

function winnerId(match) {
  const outcome = scoreOutcome(match);
  return outcome === 'a' ? match.teamA[0] : outcome === 'b' ? match.teamB[0] : null;
}

function loserId(match) {
  const outcome = scoreOutcome(match);
  return outcome === 'a' ? match.teamB[0] : outcome === 'b' ? match.teamA[0] : null;
}

// Plant die Stufenfolge eines einzelnen (Teil-)Baums: optionale Cadrage, dann Hauptrunden
// 1..numRounds, wobei die letzte Stufe (Finale) bei aktiviertem Platz3 ein zusätzliches Match
// enthält (siehe KoTurnierbaumSheet.schreibePlatz3Match: nur ab numRounds >= 2 möglich).
function groupStagePlan(groupSize, platz3) {
  const { bracketSize, numRounds, cadrageCount, ohneCadrage } = planBracket(groupSize);
  const stages = [];
  if (cadrageCount > 0) {
    stages.push({ kind: 'cadrage', round: 0, count: cadrageCount / 2 });
  }
  for (let round = 1; round <= numRounds; round++) {
    const isFinal = round === numRounds;
    const hasPlatz3 = isFinal && platz3 && numRounds >= 2;
    stages.push({ kind: 'main', round, count: bracketSize / (2 ** round) + (hasPlatz3 ? 1 : 0), hasPlatz3 });
  }
  // start = Anzahl bereits davor erzeugter Matches dieser Gruppe (kumulativ) - erlaubt
  // buildStage(), die Matches der jeweiligen Vorrunde per Index-Slice zu finden, ohne die
  // Summe bei jedem Aufruf neu herzuleiten.
  let cumulative = 0;
  for (const stage of stages) {
    stage.start = cumulative;
    cumulative += stage.count;
  }
  return { bracketSize, numRounds, cadrageCount, ohneCadrage, stages };
}

// Matches eines Teams innerhalb dieser Gruppe, in der Reihenfolge, in der sie erzeugt wurden
// (roundNumber, matchIndex aufsteigend) - das entspricht exakt der Stufenreihenfolge
// (Cadrage, Runde 1, Runde 2, ...), da jede generateRound()-Runde immer nur die jeweils
// nächste vollständige Stufe erzeugt.
function historyForGroup(history, groupTeamIds) {
  const ids = new Set(groupTeamIds);
  return history
    .filter((match) => ids.has(match.teamA?.[0]) || ids.has(match.teamB?.[0]))
    .slice()
    .sort((a, b) => (a.roundNumber - b.roundNumber) || (a.matchIndex - b.matchIndex));
}

function pairOf(teamAId, teamBId, label) {
  return { teamA: [teamAId], teamB: [teamBId], label };
}

// Erzeugt die Matches der nächsten noch fehlenden Stufe für eine Gruppe, oder null wenn die
// Gruppe bereits fertig ist (Finale + ggf. Platz3 entschieden).
function buildGroupRound(groupTeamIds, groupHistory, plan) {
  let consumed = 0;
  for (const stage of plan.stages) {
    if (groupHistory.length < consumed + stage.count) {
      if (groupHistory.length !== consumed) {
        throw new Error('Unerwarteter Turnierzustand: eine K.O.-Stufe ist nur teilweise entschieden.');
      }
      return buildStage(stage, groupTeamIds, groupHistory, plan);
    }
    consumed += stage.count;
  }
  return null;
}

function buildStage(stage, groupTeamIds, groupHistory, plan) {
  const title = stage.kind === 'cadrage' ? 'Cadrage' : roundTitle(stage.round, plan.numRounds);

  if (stage.kind === 'cadrage') {
    const matches = [];
    for (let cadrageIdx = 0; cadrageIdx < stage.count; cadrageIdx++) {
      const slotSeed = plan.ohneCadrage + 1 + cadrageIdx;
      const opponentSeed = groupTeamIds.length - cadrageIdx;
      matches.push(pairOf(groupTeamIds[slotSeed - 1], groupTeamIds[opponentSeed - 1], title));
    }
    return matches;
  }

  if (stage.round === 1) {
    // Cadrage-Sieger füllen die Bracket-Slots > ohneCadrage, in Setzlisten-Reihenfolge
    // (schreibeCadrageMatch: slotSeed = ohneCadrage + 1 + cadrageIdx).
    const cadrageWinnersBySlot = new Map();
    if (plan.cadrageCount > 0) {
      const cadrageMatches = groupHistory.slice(0, plan.cadrageCount / 2);
      cadrageMatches.forEach((match, cadrageIdx) => {
        cadrageWinnersBySlot.set(plan.ohneCadrage + 1 + cadrageIdx, winnerId(match));
      });
    }
    const resolveSeed = (seed) => (seed <= plan.ohneCadrage ? groupTeamIds[seed - 1] : cadrageWinnersBySlot.get(seed));
    const setzliste = berechneSetzliste(plan.bracketSize);
    const matches = [];
    for (let m = 0; m < plan.bracketSize / 2; m++) {
      matches.push(pairOf(resolveSeed(setzliste[2 * m]), resolveSeed(setzliste[2 * m + 1]), title));
    }
    return matches;
  }

  // Runde r > 1: Sieger der benachbarten Matches der Vorrunde treten gegeneinander an
  // (reines Winner-Advance, kein Neuseeding).
  const previousStage = plan.stages.find((s) => s.round === stage.round - 1);
  const previousCount = plan.bracketSize / (2 ** (stage.round - 1));
  const previousMatches = groupHistory.slice(previousStage.start, previousStage.start + previousCount);
  const matches = [];
  for (let m = 0; m < previousCount / 2; m++) {
    matches.push(pairOf(winnerId(previousMatches[2 * m]), winnerId(previousMatches[2 * m + 1]), title));
  }
  if (stage.hasPlatz3) {
    matches.push(pairOf(loserId(previousMatches[0]), loserId(previousMatches[1]), 'Spiel um Platz 3'));
  }
  return matches;
}

// teams: { id, seedPosition, bracketGroup }[]. bracketGroup wird vom Aufrufer (worker.js,
// assignKoBracketGroups) einmalig vor der ersten Runde zugewiesen und bleibt danach fix.
// history: bisherige Matches inkl. roundNumber/matchIndex (siehe generateTournamentRound()).
export function generateRound(teams, history, { platz3 = true } = {}) {
  if (teams.length < 2) {
    throw new Error('Für eine Runde werden mindestens 2 Teams benötigt.');
  }
  const ordered = orderBySeed(teams);
  const groups = new Map();
  for (const team of ordered) {
    const group = team.bracketGroup || 'A';
    groups.set(group, [...(groups.get(group) || []), team.id]);
  }
  const multiGroup = groups.size > 1;

  const matches = [];
  for (const [group, groupTeamIds] of groups) {
    const plan = groupStagePlan(groupTeamIds.length, platz3);
    const groupHistory = historyForGroup(history, groupTeamIds);
    const groupMatches = buildGroupRound(groupTeamIds, groupHistory, plan);
    if (groupMatches) {
      matches.push(...groupMatches.map((match) => ({ ...match, label: multiGroup ? `${match.label} – Gruppe ${group}` : match.label })));
    }
  }

  if (!matches.length) {
    throw new Error('Alle Runden wurden bereits gespielt.');
  }
  return { matches };
}
