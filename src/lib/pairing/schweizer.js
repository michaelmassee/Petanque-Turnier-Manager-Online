// Schweizer Regeln entsprechend dem Hauptprojekt: freie gesetzte Erstrunde,
// danach Sieggruppen, Float, Rematch-Vermeidung und Freilos-Rotation.
import { pairOrdered } from './matching.js';

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

function opponentPairs(history) {
  return new Set(history.filter((match) => match.teamA?.length && match.teamB?.length).map((match) => pairKey(match.teamA[0], match.teamB[0])));
}

export const MIN_TEAMS = 6;

export function checkRequirements(confirmedCount) {
  return confirmedCount < MIN_TEAMS ? [{ type: 'minPlayers', min: MIN_TEAMS }] : [];
}

// Wertbares Ergebnis einer Partie ({ scoreA, scoreB }) oder null, solange es fehlt.
// Freilos: konfigurierte Freispielpunkte (Turnieroption, gespeichert in der Freilos-Partie; Standard 13:7), siehe
// SchweizerAbstractSpielrundeSheet.leseRundeEin() – sonst weicht die Punktedifferenz
// von der Rangliste ab und die Setzliste der naechsten Runde wird bei Freilos falsch sortiert.
function matchScores(match) {
  if (!match.teamB?.length) return { scoreA: match.scoreA ?? 13, scoreB: match.scoreB ?? 7 };
  const scoreA = match.noShow === 'a' ? 0 : match.noShow === 'b' ? 13 : match.scoreA;
  const scoreB = match.noShow === 'b' ? 0 : match.noShow === 'a' ? 13 : match.scoreB;
  return scoreA == null || scoreB == null ? null : { scoreA, scoreB };
}

export function swissStats(teams, history, mode = 'mit_buchholz') {
  const stats = new Map(teams.map((team) => [team.id, { teamId: team.id, wins: 0, pointsFor: 0, pointsAgainst: 0, opponents: [] }]));
  for (const match of history) {
    const a = match.teamA?.[0]; const b = match.teamB?.[0];
    if (!a || !stats.has(a)) continue;
    const entryA = stats.get(a);
    const scores = matchScores(match);
    if (!b) { entryA.wins++; entryA.pointsFor += scores.scoreA; entryA.pointsAgainst += scores.scoreB; continue; }
    if (!scores) continue;
    const { scoreA, scoreB } = scores;
    const entryB = stats.get(b); if (!entryB) continue;
    entryA.pointsFor += scoreA; entryA.pointsAgainst += scoreB;
    entryB.pointsFor += scoreB; entryB.pointsAgainst += scoreA;
    entryA.opponents.push(b); entryB.opponents.push(a);
    if (scoreA > scoreB) entryA.wins++; else if (scoreB > scoreA) entryB.wins++;
  }
  const wins = (id) => stats.get(id)?.wins || 0;
  const bhz = (entry) => entry.opponents.reduce((sum, id) => sum + wins(id), 0);
  const fbhz = (entry) => entry.opponents.reduce((sum, id) => sum + bhz(stats.get(id)), 0);
  return [...stats.values()].map((entry) => ({ ...entry, pointsDiff: entry.pointsFor - entry.pointsAgainst, bhz: bhz(entry), fbhz: fbhz(entry), mode }));
}

// Runden, in denen ein Team heruntergelost wurde (wie HerunterlosChronik im Hauptprojekt): Ein Team gilt in Runde r
// als heruntergelost, wenn sein Gegner vor Runde r weniger Siege hatte. Maßgeblich ist die Paarung, nicht das
// Ergebnis. Ein Freilos zählt wie eine Herunterlosung (Issue #38): Das Freilos-Team steht mangels Gegner (BHZ/FBHZ 0)
// am Ende seiner Sieggruppe und würde sonst in der Folgerunde bevorzugt heruntergelost. Partien ohne roundNumber
// liefern keine Historie.
export function downfloatRounds(history) {
  const rounds = new Map();
  for (const match of history) {
    if (match.roundNumber == null) continue;
    rounds.set(match.roundNumber, [...(rounds.get(match.roundNumber) || []), match]);
  }
  const wins = new Map(); const result = new Map();
  const note = (teamId, round) => result.set(teamId, [...(result.get(teamId) || []), round]);
  for (const [round, matches] of [...rounds].sort(([a], [b]) => a - b)) {
    for (const match of matches) {
      const a = match.teamA?.[0]; const b = match.teamB?.[0];
      if (!a) continue;
      if (!b) { note(a, round); continue; }
      const winsA = wins.get(a) || 0; const winsB = wins.get(b) || 0;
      if (winsA > winsB) note(a, round); else if (winsB > winsA) note(b, round);
    }
    for (const match of matches) {
      const scores = matchScores(match);
      if (!scores || scores.scoreA === scores.scoreB) continue;
      const winner = scores.scoreA > scores.scoreB ? match.teamA?.[0] : match.teamB?.[0];
      if (winner) wins.set(winner, (wins.get(winner) || 0) + 1);
    }
  }
  return result;
}

// Wählt das Team, das aus einer ungeraden Sieggruppe heruntergelost wird (wie SchweizerSystem.waehleFloater):
// nicht in der letzten, dann nicht in der vorletzten Runde heruntergelost, dann möglichst selten, dann das
// rangniedrigste Team. Optimierungskriterium, kein Verbot – es wird immer ein Team gewählt.
function chooseFloater(candidates, floats, round) {
  const key = (team, index) => {
    const rounds = floats.get(team.id) || [];
    return [rounds.includes(round - 1) ? 1 : 0, rounds.includes(round - 2) ? 1 : 0, rounds.length, -index];
  };
  const keys = candidates.map(key);
  let best = 0;
  for (let index = 1; index < candidates.length; index++) {
    const diff = keys[index].findIndex((value, part) => value !== keys[best][part]);
    if (diff >= 0 && keys[index][diff] < keys[best][diff]) best = index;
  }
  return candidates[best];
}

// Sieggruppen von oben nach unten; ist eine Gruppe ungerade, wird ein Team per chooseFloater heruntergelost und
// vorn in die nächste Gruppe gestellt (wie SchweizerSystem.baueSiegeGruppen). Ein in dieser Runde schon
// heruntergelostes Team wird nicht gleich weiter heruntergelost, außer es ist allein.
export function orderWithDownfloats(ordered, winsById, floats, round) {
  const groups = [];
  for (const team of ordered) {
    const last = groups[groups.length - 1];
    if (last && winsById.get(last[0].id) === winsById.get(team.id)) last.push(team); else groups.push([team]);
  }
  let incoming = false;
  for (let index = 0; index < groups.length - 1; index++) {
    const group = groups[index];
    const isOdd = group.length % 2 === 1;
    if (isOdd) {
      const candidates = incoming && group.length > 1 ? group.slice(1) : group;
      const floater = chooseFloater(candidates, floats, round);
      group.splice(group.indexOf(floater), 1);
      groups[index + 1].unshift(floater);
    }
    incoming = isOdd;
  }
  return groups.flat();
}

export function sortSwiss(stats, mode = 'mit_buchholz') {
  return [...stats].sort((a, b) => b.wins - a.wins
    || (mode === 'mit_buchholz' ? b.bhz - a.bhz || b.fbhz - a.fbhz : 0)
    || b.pointsDiff - a.pointsDiff || b.pointsFor - a.pointsFor || a.teamId.localeCompare(b.teamId));
}

export function sameSwissRankingPlace(a, b, mode = 'mit_buchholz') {
  return a.wins === b.wins
    && (mode !== 'mit_buchholz' || (a.bhz === b.bhz && a.fbhz === b.fbhz))
    && a.pointsDiff === b.pointsDiff
    && a.pointsFor === b.pointsFor;
}

// Erste Runde wie SchweizerSystem.ersteRunde() im Hauptprojekt: Freilos an ein zufälliges ungesetztes Team (nur
// ohne Ungesetzte an eines aus der größten Setzgruppe). Die übrigen stehen in einer Reihe – Ungesetzte, dann jede
// Setzgruppe als zusammenhängender Block in zufälliger Reihenfolge – und Platz i spielt gegen Platz i + n/2. Ein
// Block mit höchstens n/2 Teams enthält so kein Paar; gleiche Setzposition > 0 trifft nur aufeinander, wenn eine
// Gruppe mehr als die Hälfte stellt, und dann so selten wie möglich.
function firstRound(teams) {
  const shuffled = shuffle(teams);
  const unseeded = shuffled.filter((team) => !(team.seedPosition > 0));
  const seedGroups = new Map();
  for (const team of shuffled) if (team.seedPosition > 0) seedGroups.set(team.seedPosition, [...(seedGroups.get(team.seedPosition) || []), team]);
  const groups = [...seedGroups.values()];
  let bye = null;
  if (shuffled.length % 2) bye = unseeded.length ? unseeded.pop() : groups.reduce((largest, group) => (group.length > largest.length ? group : largest)).pop();
  const row = [...unseeded, ...groups.flat()];
  const half = row.length / 2;
  const matches = row.slice(0, half).map((team, index) => ({ teamA: [team.id], teamB: [row[index + half].id] }));
  if (bye) matches.push({ teamA: [bye.id], teamB: [] });
  return matches;
}

export function generateRound(teams, history, { mode = 'mit_buchholz' } = {}) {
  if (teams.length < 6) throw new Error('Für eine Runde werden mindestens 6 Teams benötigt.');
  const played = opponentPairs(history);
  const hadBye = new Set(history.filter((match) => !match.teamB?.length).map((match) => match.teamA[0]));
  if (!history.length) return { matches: firstRound(teams) };
  const ranked = sortSwiss(swissStats(teams, history, mode), mode);
  const winsById = new Map(ranked.map((entry) => [entry.teamId, entry.wins]));
  const byId = new Map(teams.map((team) => [team.id, team]));
  let ordered = ranked.map((entry) => byId.get(entry.teamId)); const matches = [];
  if (ordered.length % 2) {
    const bye = [...ordered].reverse().find((team) => !hadBye.has(team.id)) || ordered[ordered.length - 1];
    ordered = ordered.filter((team) => team.id !== bye.id); matches.push({ teamA: [bye.id], teamB: [] });
  }
  // Sieggruppen mit geschütztem Herunterlosen (Issue #36), danach gesamt wiederholungsarm paaren.
  const round = Math.max(0, ...history.map((match) => match.roundNumber ?? 0)) + 1;
  ordered = orderWithDownfloats(ordered, winsById, downfloatRounds(history), round);
  matches.push(...pairOrdered(ordered, (a, b) => played.has(pairKey(a.id, b.id))));
  return { matches };
}
