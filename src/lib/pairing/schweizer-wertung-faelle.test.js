// @vitest-environment node
// Gemeinsame Testfälle mit dem Hauptprojekt (SchweizerWertungFaelleTest, identische Kopie der JSON-Datei): Siege,
// BHZ/FBHZ inkl. Freilos-Buchholz, Sortierung, geteilte Plätze und die Reihenfolge innerhalb eines geteilten Platzes (Teamnummer, keine Wertung). Beide Projekte
// müssen für dieselben Runden dieselbe Rangliste liefern.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sameSwissRankingPlace, sortSwiss, swissStats } from './schweizer.js';
import faelleJson from './schweizer-wertung-faelle.json';

// Vitest läuft im Projektverzeichnis; das Hauptprojekt liegt bei der lokalen Entwicklung daneben.
const HAUPTPROJEKT_KOPIE = resolve(process.cwd(),
  '../Petanque-Turnier-Manager/src/test/resources/de/petanqueturniermanager/schweizer/schweizer-wertung-faelle.json');

// Partie [teamA, teamB, punkteA, punkteB]; Freilos [teamA, null] (13:7); ohne Ergebnis [teamA, teamB, null, null]
function history(runden) {
  return runden.flatMap((runde, index) => runde.map(([a, b, pa, pb]) => (b == null
    ? { roundNumber: index + 1, teamA: [`t${a}`], teamB: [], scoreA: 13, scoreB: 7 }
    : { roundNumber: index + 1, teamA: [`t${a}`], teamB: [`t${b}`], scoreA: pa, scoreB: pb })));
}

describe('Schweizer Wertung: gemeinsame Testfälle mit dem Hauptprojekt', () => {
  it.each(faelleJson.faelle.map((fall) => [fall.name, fall]))('%s', (_name, fall) => {
    const mode = fall.rankingModus.toLowerCase();
    const teams = fall.teams.map((nr) => ({ id: `t${nr}`, teamNumber: nr }));
    const sorted = sortSwiss(swissStats(teams, history(fall.runden), mode, { byeBuchholz: fall.freilosBuchholz.toLowerCase() }), mode);
    let platz = 0;
    const actual = sorted.map((entry, index) => {
      if (index === 0 || !sameSwissRankingPlace(sorted[index - 1], entry, mode)) platz = index + 1;
      return [platz, entry.teamNumber, entry.wins, entry.bhz, entry.fbhz, entry.pointsDiff, entry.pointsFor];
    });
    expect(actual).toEqual(fall.erwartet);
  });

  // Liegt das Hauptprojekt daneben (lokale Entwicklung), muss die Kopie identisch sein.
  it.skipIf(!existsSync(HAUPTPROJEKT_KOPIE))('ist eine identische Kopie der Datei im Hauptprojekt', () => {
    expect(JSON.parse(readFileSync(HAUPTPROJEKT_KOPIE, 'utf8'))).toEqual(faelleJson);
  });
});
