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

export function swissStats(teams, history, mode = 'mit_buchholz') {
  const stats = new Map(teams.map((team) => [team.id, { teamId: team.id, wins: 0, pointsFor: 0, pointsAgainst: 0, opponents: [] }]));
  for (const match of history) {
    const a = match.teamA?.[0]; const b = match.teamB?.[0];
    if (!a || !stats.has(a)) continue;
    const entryA = stats.get(a);
    // Freilos: Hauptprojekt-Default Freispielpunkte 13:7 (Diff 6), siehe
    // SchweizerAbstractSpielrundeSheet.leseRundeEin() – sonst weicht die Punktedifferenz
    // von der Rangliste ab und die Setzliste der naechsten Runde wird bei Freilos falsch sortiert.
    if (!b) { entryA.wins++; entryA.pointsFor += 13; entryA.pointsAgainst += 7; continue; }
    const scoreA = match.noShow === 'a' ? 0 : match.noShow === 'b' ? 13 : match.scoreA;
    const scoreB = match.noShow === 'b' ? 0 : match.noShow === 'a' ? 13 : match.scoreB;
    if (scoreA == null || scoreB == null) continue;
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
  const byId = new Map(teams.map((team) => [team.id, team]));
  let ordered = ranked.map((entry) => byId.get(entry.teamId)); const matches = [];
  if (ordered.length % 2) {
    const bye = [...ordered].reverse().find((team) => !hadBye.has(team.id)) || ordered[ordered.length - 1];
    ordered = ordered.filter((team) => team.id !== bye.id); matches.push({ teamA: [bye.id], teamB: [] });
  }
  // Sieggruppen mit Float nach unten ergeben genau die Ranglistenreihenfolge (Hauptprojekt:
  // baueSiegeGruppen() hängt das Float-Team vorne an die nächste Gruppe), daher direkt gesamt paaren.
  matches.push(...pairOrdered(ordered, (a, b) => played.has(pairKey(a.id, b.id))));
  return { matches };
}
