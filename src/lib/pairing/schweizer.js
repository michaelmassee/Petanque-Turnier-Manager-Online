// Schweizer Regeln entsprechend dem Hauptprojekt: freie gesetzte Erstrunde,
// danach Sieggruppen, Float, Rematch-Vermeidung und Freilos-Rotation.
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

export function checkRequirements(confirmedCount) {
  return confirmedCount < 6 ? [{ type: 'minPlayers', min: 6 }] : [];
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

function pairOrdered(ordered, played) {
  const result = [];
  for (let index = 0; index < ordered.length; index += 2) {
    const a = ordered[index]; let candidate = index + 1;
    while (candidate < ordered.length && played.has(pairKey(a.id, ordered[candidate].id))) candidate++;
    if (candidate >= ordered.length) candidate = index + 1; // Hauptprojekt-Fallback: Rematch nur wenn unvermeidbar.
    const b = ordered[candidate];
    ordered.splice(candidate, 1); ordered.splice(index, 1);
    result.push({ teamA: [a.id], teamB: [b.id] }); index -= 2;
  }
  return result;
}

export function generateRound(teams, history, { mode = 'mit_buchholz' } = {}) {
  if (teams.length < 6) throw new Error('Für eine Runde werden mindestens 6 Teams benötigt.');
  const played = opponentPairs(history);
  const hadBye = new Set(history.filter((match) => !match.teamB?.length).map((match) => match.teamA[0]));
  if (!history.length) {
    const seeded = shuffle(teams).sort((a, b) => (a.seedPosition || 0) - (b.seedPosition || 0));
    const half = Math.ceil(seeded.length / 2); const first = seeded.slice(0, half); const second = seeded.slice(half);
    return { matches: first.map((team, index) => second.length > index ? ({ teamA: [team.id], teamB: [second[second.length - index - 1].id] }) : ({ teamA: [team.id], teamB: [] })) };
  }
  const ranked = sortSwiss(swissStats(teams, history, mode), mode);
  const byId = new Map(teams.map((team) => [team.id, team]));
  let ordered = ranked.map((entry) => byId.get(entry.teamId)); const matches = [];
  if (ordered.length % 2) {
    const bye = [...ordered].reverse().find((team) => !hadBye.has(team.id)) || ordered[ordered.length - 1];
    ordered = ordered.filter((team) => team.id !== bye.id); matches.push({ teamA: [bye.id], teamB: [] });
  }
  const groups = new Map();
  for (const team of ordered) { const wins = ranked.find((entry) => entry.teamId === team.id).wins; groups.set(wins, [...(groups.get(wins) || []), team]); }
  let floating = null;
  for (const group of [...groups.values()]) {
    if (floating) group.unshift(floating);
    floating = group.length % 2 ? group.pop() : null;
    matches.push(...pairOrdered([...group], played));
  }
  if (floating) matches.push({ teamA: [floating.id], teamB: [] });
  return { matches };
}
