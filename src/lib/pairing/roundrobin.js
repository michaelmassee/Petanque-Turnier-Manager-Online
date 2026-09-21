// Circle-Method ("Schema F") 1:1 nach Hauptprojekt-Referenz portiert:
// algorithmen/liga/JederGegenJeden.java. Feste Teams (eine Meldung = ein Team
// über alle Runden), bei ungerader Teamzahl rotiert ein Freilos durch.

export function totalRounds(teamCount) {
  return teamCount % 2 === 1 ? teamCount : teamCount - 1;
}

export function pairingsPerRound(teamCount) {
  const freiSpiel = teamCount % 2 === 1;
  const letzteMeldungNr = freiSpiel ? teamCount + 1 : teamCount;
  return Math.floor(letzteMeldungNr / 2);
}

export function checkRequirements(confirmedCount, { registrationType, roundsPlayed = 0 } = {}) {
  if (confirmedCount < 3) {
    return [{ type: 'minPlayers', min: 3 }];
  }
  if (registrationType && registrationType !== 'forme') {
    return [{ type: 'message', text: 'Jeder gegen Jeden ist online nur mit Anmeldeart "Formée" (feste Teams) spielbar.' }];
  }
  if (roundsPlayed >= totalRounds(confirmedCount)) {
    return [{ type: 'message', text: 'Alle Runden wurden bereits gespielt.' }];
  }
  return [];
}

// Erzeugt genau die Paarungen einer Runde (1-basiert) nach der Circle-Method.
// teams: in fester Reihenfolge (wie tournament_teams, sortiert nach created_at/id).
function generateRoundPairings(teams, rundenCntr) {
  const anzMeldungen = teams.length;
  const freiSpiel = anzMeldungen % 2 === 1;
  const anzRndn = totalRounds(anzMeldungen);
  const letzteMeldungNr = freiSpiel ? anzMeldungen + 1 : anzMeldungen;
  const anzPaarungen = pairingsPerRound(anzMeldungen);

  function newPaarung(idxA, idxB) {
    const teamA = teams[idxA];
    const teamB = (freiSpiel && idxB >= anzMeldungen) ? null : teams[idxB];
    return teamB ? { teamA: [teamA.id], teamB: [teamB.id] } : { teamA: [teamA.id], teamB: [] };
  }

  const runde = [];
  // Erste Paarung nach Schema F. Heim/Gast wird je nach Rundenparität getauscht,
  // außer bei Freilos-Modus (dort bleibt die Reihenfolge stabil) - siehe Original.
  if (rundenCntr % 2 === 1 || freiSpiel) {
    runde.push(newPaarung(rundenCntr - 1, letzteMeldungNr - 1));
  } else {
    runde.push(newPaarung(letzteMeldungNr - 1, rundenCntr - 1));
  }

  for (let teamPaarungCntr = 1; teamPaarungCntr < anzPaarungen; teamPaarungCntr++) {
    const moduloA = (rundenCntr + teamPaarungCntr) % anzRndn;
    const idxMeldungA = (moduloA < 1) ? anzRndn + moduloA : moduloA;
    const moduloB = (rundenCntr - teamPaarungCntr) % anzRndn;
    const idxMeldungB = (moduloB < 1) ? anzRndn + moduloB : moduloB;
    runde.push(newPaarung(idxMeldungA - 1, idxMeldungB - 1));
  }

  return runde;
}

// history: bisherige Matches dieses Turniers ({ teamA: [teamId], teamB: [teamId] }).
// Da der Algorithmus rein deterministisch pro Rundennummer ist (nicht wie beim
// Schweizer-System ergebnisabhängig), wird die nächste Rundennummer aus der Anzahl
// bereits erzeugter Matches abgeleitet: jede Runde erzeugt konstant
// pairingsPerRound(teamCount) Paarungen (Freilos eingeschlossen).
export function generateRound(teams, history) {
  if (teams.length < 3) {
    throw new Error('Für eine Runde werden mindestens 3 Teams benötigt.');
  }
  const perRound = pairingsPerRound(teams.length);
  const roundsPlayed = Math.floor((history?.length || 0) / perRound);
  if (roundsPlayed >= totalRounds(teams.length)) {
    throw new Error('Alle Runden wurden bereits gespielt.');
  }
  return { matches: generateRoundPairings(teams, roundsPlayed + 1) };
}
