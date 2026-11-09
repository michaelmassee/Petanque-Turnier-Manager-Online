// Mêlée: lose Einzelanmeldungen werden vor der ersten Runde einmalig zu festen Teams gemischt, die danach wie
// Formée-Teams gespielt werden. Regeln wie im Hauptprojekt (MeleeAnmeldungTeamBildner):
// - Team-Größe aus der Formation (Doublette 2, Triplette 3), alle Teams gleich groß.
// - Geht die Spielerzahl nicht auf, bleiben die zuletzt angemeldeten Spieler ohne Team.
// - Spieler mit gleicher Setzposition > 0 (z. B. ein Verein) kommen nicht ins selbe Team; ist das nach
//   MAX_SHUFFLE_ATTEMPTS Mischungen nicht erfüllbar, gilt die letzte Mischung (die Auslosung scheitert nie hart).
// - Das Team erhält die niedrigste Setzposition > 0 seiner Mitglieder.
// Modus „ohne Freilos“ (Hauptprojekt MeleeAnmeldungModus DOUBLETTE_/TRIPLETTE_OHNE_FREILOS): gemischte 2er- und
// 3er-Teams nach der Supermêlée-Aufteilung, dadurch immer eine gerade Teamzahl; Doubletten zuerst.
import { computeGameSizes, splitGameSize } from './supermelee.js';

const MAX_SHUFFLE_ATTEMPTS = 200;

/** Art der Team-Bildung (Turnieroption, Werte wie MeleeAnmeldungModus im Hauptprojekt). */
export const MELEE_TEAM_MODES = ['EINFACH', 'DOUBLETTE_OHNE_FREILOS', 'TRIPLETTE_OHNE_FREILOS'];

export function isMixedMeleeMode(mode) {
  return mode === 'DOUBLETTE_OHNE_FREILOS' || mode === 'TRIPLETTE_OHNE_FREILOS';
}

/** Teamgrößen ohne Freilos für genau playerCount Spieler, aufsteigend; null wenn nicht aufteilbar (unter 4, genau 7). */
function teamSizesWithoutBye(playerCount, mode) {
  const games = computeGameSizes(playerCount, mode === 'DOUBLETTE_OHNE_FREILOS' ? 'doublette' : 'triplette');
  return games ? games.flatMap(splitGameSize).sort((a, b) => a - b) : null;
}

/** Größte Spielerzahl ≤ playerCount, die sich ohne Freilos aufteilen lässt (anzahlVerwendbarOhneFreilos), sonst 0. */
export function usablePlayersWithoutBye(playerCount) {
  if (playerCount < 4) return 0;
  return computeGameSizes(playerCount, 'triplette') ? playerCount : playerCount - 1;
}

/** Anmeldearten, die online mit festen Teams gespielt werden (Mêlée nach der Auslosung). */
export const FIXED_TEAM_REGISTRATION_TYPES = ['forme', 'melee'];

export function meleeTeamSize(formation) {
  if (formation === 'doublette') return 2;
  if (formation === 'triplette') return 3;
  return null;
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function cutIntoTeams(players, teamSizes) {
  const teams = [];
  let index = 0;
  for (const size of teamSizes) {
    const members = players.slice(index, index + size);
    index += size;
    const seeded = members.map((player) => player.seedPosition).filter((position) => position > 0);
    teams.push({ members: members.map((player) => player.id), seedPositions: seeded, seedPosition: seeded.length ? Math.min(...seeded) : 0 });
  }
  return teams;
}

// Zufällig auf die Teamgrößen verteilen, Setzpositionen beachten (Hauptprojekt MeleeAnmeldungTeamBildner.verteile).
function distribute(players, teamSizes, random) {
  let teams = [];
  for (let attempt = 0; attempt < MAX_SHUFFLE_ATTEMPTS; attempt += 1) {
    teams = cutIntoTeams(shuffle(players, random), teamSizes);
    if (teams.every(keepsSeedsApart)) break;
  }
  return teams.map(({ members, seedPosition }) => ({ members, seedPosition }));
}

const keepsSeedsApart = (team) => new Set(team.seedPositions).size === team.seedPositions.length;

/**
 * @param players Spieler in Anmeldereihenfolge: [{ id, seedPosition }]
 * @returns Teams [{ members: [ids], seedPosition }]; leer, wenn kein ganzes Team zustande kommt
 */
export function buildMeleeTeams(players, teamSize, random = Math.random) {
  const teamCount = Math.floor(players.length / teamSize);
  if (teamCount === 0) return [];
  return distribute(players.slice(0, teamCount * teamSize), Array(teamCount).fill(teamSize), random);
}

/**
 * Gemischte Doubletten/Triplettes ohne Freilos (bildeTeamsOhneFreilos): Geht die Zahl nicht auf, bleiben wie im
 * Hauptprojekt die zuletzt angemeldeten Spieler ohne Team.
 */
export function buildMeleeTeamsWithoutBye(players, mode, random = Math.random) {
  const usable = usablePlayersWithoutBye(players.length);
  if (!usable) return [];
  return distribute(players.slice(0, usable), teamSizesWithoutBye(usable, mode), random);
}

/** Namensschlüssel wie MeleeNeuAuslosungPlan.namensSchluessel: getrimmt, ohne Groß-/Kleinschreibung. */
export function meleeNameKey(firstName, lastName) {
  return `${String(firstName || '').trim().toLowerCase()}\u0000${String(lastName || '').trim().toLowerCase()}`;
}

/**
 * Doppelte Namen vor der Auslosung (Hauptprojekt MeleeDoppelteNamen): mehrfach vorhandene Namen unter den aktiven
 * Spielern, sofern mindestens einer davon jetzt ausgelost wird. players: [{ firstName, lastName, open }].
 * @returns angezeigte Namen („Vorname Nachname“), je Name einmal
 */
export function duplicateMeleeNames(players) {
  const byKey = new Map();
  for (const player of players) {
    if (!String(player.firstName || '').trim() && !String(player.lastName || '').trim()) continue;
    const key = meleeNameKey(player.firstName, player.lastName);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(player);
  }
  return [...byKey.values()]
    .filter((group) => group.length > 1 && group.some((player) => player.open))
    .map((group) => [group[0].firstName, group[0].lastName].map((part) => String(part || '').trim()).filter(Boolean).join(' '));
}
