// Maastrichter System nach Hauptprojekt-Referenz (turniersysteme/04_Maastrichter.md,
// maastrichter/finalrunde/MaastrichterFinalrundeSheet.java): Schweizer Vorrunden, danach Aufteilung der
// Vorrunden-Rangliste in Finalgruppen A, B, C … und je Gruppe ein K.O.-Baum mit Cadrage.
// Die Gruppenzuordnung (bracketGroup) und der Setzrang in der Gruppe (koSeed) werden beim Übergang einmal
// gespeichert (worker.js, assignMaastrichterFinalGroups) und bleiben danach fest.
import { assignGroups, checkRequirements as checkKoRequirements, generateRound as generateKoRound, groupRoundCount } from './ko.js';
import { generateRound as generateSchweizerRound, MIN_TEAMS as SCHWEIZER_MIN_TEAMS } from './schweizer.js';

export const MIN_TEAMS = SCHWEIZER_MIN_TEAMS;
export const DEFAULT_PRELIMINARY_ROUNDS = 3;
export const MIN_PRELIMINARY_ROUNDS = 1;
export const MAX_PRELIMINARY_ROUNDS = 10;
export const GROUP_MODES = ['NACH_GROESSE', 'NACH_SIEGEN'];
export const DEFAULT_GROUP_MODE = 'NACH_GROESSE';

// Feste Teams wie K.O. (Formée oder vor der ersten Runde ausgeloste Mêlée-Teams). Das Rundenende hängt von den beim
// Übergang gebildeten Finalgruppen ab; der Client kennt sie nicht, der Server liefert es als allRoundsPlayed mit
// (worker.js, loadTournamentRounds → maastrichterTotalRounds).
// Mindestzahl je Phase: Vorrunden wie Schweizer (6 Teams), ab der Finalrunde wie K.O. (2). Ausgeschiedene setzt die
// Turnierleitung oft inaktiv; die Finalgruppen stehen dann ohnehin fest. preliminaryRounds liefert der Server mit
// (Einstellungen in eigener Tabelle); ohne Angabe gilt vorsichtshalber die Vorrunden-Mindestzahl.
export function checkRequirements(confirmedCount, { registrationType, roundsPlayed = 0, preliminaryRounds = null, allRoundsPlayed = false } = {}) {
  if (allRoundsPlayed) return [{ type: 'message', text: 'Alle Runden wurden bereits gespielt.' }];
  const finalStage = preliminaryRounds != null && roundsPlayed >= preliminaryRounds;
  if (!finalStage && confirmedCount < MIN_TEAMS) return [{ type: 'minPlayers', min: MIN_TEAMS }];
  return checkKoRequirements(confirmedCount, { registrationType });
}

// Gesamtzahl der Runden: Vorrunden + Runden der längsten Finalgruppe (Gruppen spielen parallel). Ohne Finalgruppen
// (Übergang noch nicht erfolgt) null – dann folgt nach den Vorrunden sicher noch eine Finalrunde.
export function totalRounds(preliminaryRounds, groupSizes) {
  const sizes = groupSizes.filter((size) => size >= 2);
  if (!sizes.length) return null;
  return preliminaryRounds + Math.max(...sizes.map(groupRoundCount));
}

// Runden ab preliminaryRounds + 1 gehören zur Finalrunde (K.O.).
export function isPreliminaryRound(roundNumber, preliminaryRounds) {
  return roundNumber <= preliminaryRounds;
}

export function preliminaryRoundsPlayed(history, preliminaryRounds) {
  const rounds = new Set(history.map((match) => match.roundNumber).filter((round) => round != null && isPreliminaryRound(round, preliminaryRounds)));
  return rounds.size;
}

// rankedTeams: Vorrunden-Rangliste (bester zuerst) als { teamId, wins }, nur Teams, die K.O. spielen.
// Ergebnis: { teamId, group, koSeed }[]; Teams einer Gruppe mit weniger als 2 Teams fehlen (kein K.O.-Spiel),
// die Buchstaben werden nur an Gruppen mit mindestens 2 Teams vergeben, damit A immer belegt ist.
export function assignFinalGroups(rankedTeams, { groupMode = DEFAULT_GROUP_MODE, preliminaryRounds = DEFAULT_PRELIMINARY_ROUNDS, maxGroupSize = 16, minLastGroupSize = 4 } = {}) {
  const blocks = groupMode === 'NACH_SIEGEN'
    ? splitByWins(rankedTeams, preliminaryRounds)
    : splitBySize(rankedTeams, maxGroupSize, minLastGroupSize);
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const result = [];
  let next = 0;
  for (const block of blocks) {
    if (block.length < 2) continue;
    const group = letters[next] || `G${next + 1}`;
    next++;
    block.forEach((team, index) => result.push({ teamId: team.teamId, group, koSeed: index + 1 }));
  }
  return result;
}

// teileNachSiegen: A = max. Siege (= Zahl der Vorrunden), B = eine weniger, …; leere Stufen entfallen.
function splitByWins(rankedTeams, preliminaryRounds) {
  const byWins = new Map();
  for (const team of rankedTeams) byWins.set(team.wins, [...(byWins.get(team.wins) || []), team]);
  const maxWins = Math.max(preliminaryRounds, ...rankedTeams.map((team) => team.wins));
  const blocks = [];
  for (let wins = maxWins; wins >= 0; wins--) {
    if (byWins.get(wins)?.length) blocks.push(byWins.get(wins));
  }
  return blocks;
}

// teileNachGroesse: Blöcke à maxGroupSize nach Rang, eine zu kleine letzte Gruppe wird gefaltet (wie bei K.O.).
function splitBySize(rankedTeams, maxGroupSize, minLastGroupSize) {
  const byId = new Map(rankedTeams.map((team) => [team.teamId, team]));
  const blocks = new Map();
  for (const { teamId, group } of assignGroups(rankedTeams.map((team) => team.teamId), { maxGroupSize, minLastGroupSize })) {
    blocks.set(group, [...(blocks.get(group) || []), byId.get(teamId)]);
  }
  return [...blocks.values()];
}

// teams: { id, seedPosition, bracketGroup, koSeed }[]; history mit roundNumber/matchIndex.
// Vorrunden: Schweizer (nur Vorrunden-Partien als Vorgeschichte). Danach K.O. je Finalgruppe; der Worker übergibt
// dann nur die Teams mit Gruppe und hat die Gruppen vorher zugewiesen.
export function generateRound(teams, history, { preliminaryRounds = DEFAULT_PRELIMINARY_ROUNDS, mode, byeBuchholz, platz3 = true } = {}) {
  const preliminaryHistory = history.filter((match) => isPreliminaryRound(match.roundNumber, preliminaryRounds));
  const played = preliminaryRoundsPlayed(history, preliminaryRounds);
  if (played < preliminaryRounds) {
    return { ...generateSchweizerRound(teams, preliminaryHistory, { mode, byeBuchholz }), phase: 'preliminary' };
  }
  // Nach Gruppe sortiert, damit die Partien in der Reihenfolge A, B, C … erscheinen; innerhalb der Gruppe zählt nur der
  // Setzrang (ko.js sortiert stabil danach), die Baum-Rekonstruktion bleibt also unberührt.
  const koTeams = teams.filter((team) => team.bracketGroup)
    .map((team) => ({ ...team, seedPosition: team.koSeed || 0 }))
    .sort((a, b) => a.bracketGroup.localeCompare(b.bracketGroup) || a.seedPosition - b.seedPosition);
  if (koTeams.length < 2) throw new Error('Für die Finalrunde fehlen die Finalgruppen.');
  const koHistory = history.filter((match) => !isPreliminaryRound(match.roundNumber, preliminaryRounds));
  const { matches } = generateKoRound(koTeams, koHistory, { platz3 });
  // Auch eine einzelne Finalgruppe trägt ihren Buchstaben, damit die Finalrunde von der Vorrunde unterscheidbar ist.
  const groups = new Set(koTeams.map((team) => team.bracketGroup));
  const labelled = groups.size > 1 ? matches : matches.map((match) => ({ ...match, label: `${match.label} – Gruppe ${[...groups][0]}` }));
  return { matches: labelled, phase: 'final' };
}
