// Anzahl Paarungen pro Runde bei fester Teamzahl (Freilos bei ungerader Anzahl eingeschlossen).
export function pairingsPerRound(teamCount) {
  const freiSpiel = teamCount % 2 === 1;
  const letzteMeldungNr = freiSpiel ? teamCount + 1 : teamCount;
  return Math.floor(letzteMeldungNr / 2);
}
