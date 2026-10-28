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

// Paarung von oben nach unten wie SchweizerSystem.paareGruppen() im Hauptprojekt: jedes Team bekommt den
// ersten Gegner in Ranglistenreihenfolge (eigene Sieggruppe zuerst, sonst Float nach unten), mit dem die
// kleinstmögliche Zahl an Gegnerwiederholungen erreichbar bleibt. Statt Backtracking mit Suchbudget (ein
// erschöpftes Budget ist kein Beweis für Unlösbarkeit und kostet im Worker zu viel CPU) prüft ein maximales
// Matching über die noch nicht gespielten Paare (Edmonds) exakt, ob ein Kandidat zur besten Lösung führt.

// Sucht vom freien Knoten root einen augmentierenden Pfad (Edmonds-Blüten) und erweitert match entlang dessen.
function augment(root, allowed, match, alive) {
  const n = match.length;
  const used = new Array(n).fill(false); const parent = new Array(n).fill(-1);
  const base = Array.from({ length: n }, (_, index) => index);
  const lca = (a, b) => {
    const seen = new Array(n).fill(false);
    for (;;) { a = base[a]; seen[a] = true; if (match[a] < 0) break; a = parent[match[a]]; }
    for (;;) { b = base[b]; if (seen[b]) return b; b = parent[match[b]]; }
  };
  const markPath = (v, b, child, blossom) => {
    while (base[v] !== b) {
      blossom[base[v]] = blossom[base[match[v]]] = true;
      parent[v] = child; child = match[v]; v = parent[match[v]];
    }
  };
  used[root] = true; const queue = [root];
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    for (let to = 0; to < n; to++) {
      if (!alive[to] || !allowed[v][to] || base[v] === base[to] || match[v] === to) continue;
      if (to === root || (match[to] >= 0 && parent[match[to]] >= 0)) {
        const blossomBase = lca(v, to); const blossom = new Array(n).fill(false);
        markPath(v, blossomBase, to, blossom); markPath(to, blossomBase, v, blossom);
        for (let index = 0; index < n; index++) {
          if (!alive[index] || !blossom[base[index]]) continue;
          base[index] = blossomBase;
          if (!used[index]) { used[index] = true; queue.push(index); }
        }
      } else if (parent[to] < 0) {
        parent[to] = v;
        if (match[to] < 0) {
          for (let u = to; u >= 0;) { const pv = parent[u]; const next = match[pv]; match[u] = pv; match[pv] = u; u = next; }
          return true;
        }
        used[match[to]] = true; queue.push(match[to]);
      }
    }
  }
  return false;
}

function pairOrdered(ordered, played) {
  const n = ordered.length;
  const allowed = ordered.map((a) => ordered.map((b) => a !== b && !played.has(pairKey(a.id, b.id))));
  const alive = new Array(n).fill(true);
  let match = new Array(n).fill(-1); let size = 0;
  // Gieriger Start in Ranglistenreihenfolge: meist ist der gesuchte Gegner dann schon Matching-Partner und die
  // Prüfung kommt ohne Augmentierung aus.
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n && match[a] < 0; b++) if (match[b] < 0 && allowed[a][b]) { match[a] = b; match[b] = a; size++; }
  }
  for (let index = 0; index < n; index++) if (match[index] < 0 && augment(index, allowed, match, alive)) size++;
  const result = [];
  for (let team = 0; team < n; team++) {
    if (!alive[team]) continue;
    alive[team] = false;
    for (let opponent = team + 1; opponent < n; opponent++) {
      if (!alive[opponent]) continue;
      // Maximales Matching ohne team und opponent; mehr als size minus (team, opponent) ist nicht möglich.
      const next = [...match]; let nextSize = size;
      const target = size - (allowed[team][opponent] ? 1 : 0);
      alive[opponent] = false;
      for (const removed of [team, opponent]) {
        if (next[removed] < 0) continue;
        next[next[removed]] = -1; next[removed] = -1; nextSize--;
      }
      for (let free = 0; free < n && nextSize < target; free++) {
        if (alive[free] && next[free] < 0 && augment(free, allowed, next, alive)) nextSize++;
      }
      if (nextSize === target) {
        match = next; size = nextSize;
        result.push({ teamA: [ordered[team].id], teamB: [ordered[opponent].id] });
        break;
      }
      alive[opponent] = true;
    }
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
  // Sieggruppen mit Float nach unten ergeben genau die Ranglistenreihenfolge (Hauptprojekt:
  // baueSiegeGruppen() hängt das Float-Team vorne an die nächste Gruppe), daher direkt gesamt paaren.
  matches.push(...pairOrdered(ordered, played));
  return { matches };
}
