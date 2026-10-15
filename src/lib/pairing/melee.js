// Mêlée: lose Einzelanmeldungen werden vor der ersten Runde einmalig zu festen Teams gemischt, die danach wie
// Formée-Teams gespielt werden. Regeln wie im Hauptprojekt (MeleeAnmeldungTeamBildner):
// - Team-Größe aus der Formation (Doublette 2, Triplette 3), alle Teams gleich groß.
// - Geht die Spielerzahl nicht auf, bleiben die zuletzt angemeldeten Spieler ohne Team.
// - Spieler mit gleicher Setzposition > 0 (z. B. ein Verein) kommen nicht ins selbe Team; ist das nach
//   MAX_SHUFFLE_ATTEMPTS Mischungen nicht erfüllbar, gilt die letzte Mischung (die Auslosung scheitert nie hart).
// - Das Team erhält die niedrigste Setzposition > 0 seiner Mitglieder.
const MAX_SHUFFLE_ATTEMPTS = 200;

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

function cutIntoTeams(players, teamSize) {
  const teams = [];
  for (let index = 0; index < players.length; index += teamSize) {
    const members = players.slice(index, index + teamSize);
    const seeded = members.map((player) => player.seedPosition).filter((position) => position > 0);
    teams.push({ members: members.map((player) => player.id), seedPositions: seeded, seedPosition: seeded.length ? Math.min(...seeded) : 0 });
  }
  return teams;
}

const keepsSeedsApart = (team) => new Set(team.seedPositions).size === team.seedPositions.length;

/**
 * @param players Spieler in Anmeldereihenfolge: [{ id, seedPosition }]
 * @returns Teams [{ members: [ids], seedPosition }]; leer, wenn kein ganzes Team zustande kommt
 */
export function buildMeleeTeams(players, teamSize, random = Math.random) {
  const teamCount = Math.floor(players.length / teamSize);
  if (teamCount === 0) return [];
  const assigned = players.slice(0, teamCount * teamSize);
  let teams = [];
  for (let attempt = 0; attempt < MAX_SHUFFLE_ATTEMPTS; attempt += 1) {
    teams = cutIntoTeams(shuffle(assigned, random), teamSize);
    if (teams.every(keepsSeedsApart)) break;
  }
  return teams.map(({ members, seedPosition }) => ({ members, seedPosition }));
}
