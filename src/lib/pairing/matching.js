// Paarung mit der kleinstmöglichen Zahl an Gegnerwiederholungen, wie WiederholungsarmePaarung im Hauptprojekt
// (genutzt von Schweizer und Formule X): von oben nach unten bekommt jedes Team den ersten Gegner in
// Ranglistenreihenfolge, mit dem die kleinstmögliche Zahl an Wiederholungen für die ganze Runde erreichbar bleibt.
// Statt Backtracking mit Suchbudget (ein erschöpftes Budget ist kein Beweis für Unlösbarkeit und kostet im Worker
// zu viel CPU) prüft ein maximales Matching über die noch nicht gespielten Paare (Edmonds) exakt, ob ein Kandidat
// zur besten Lösung führt. Ein reiner Tausch mit dem nächsten Paar reicht nicht: Er übersieht Lösungen, bei denen
// mehrere Paare umgestellt werden müssen oder das betroffene Paar ganz unten steht.

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

// ordered: Teams in Ranglistenreihenfolge (gerade Anzahl); played(a, b): ob zwei Teams schon gegeneinander gespielt
// haben. Liefert die Matches nach dem besser platzierten Team geordnet.
export function pairOrdered(ordered, played) {
  const n = ordered.length;
  const allowed = ordered.map((a) => ordered.map((b) => a !== b && !played(a, b) && !played(b, a)));
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
