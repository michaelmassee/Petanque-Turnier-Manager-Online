import { generateRound as generateSupermeleeRound, checkRequirements as checkSupermeleeRequirements } from './supermelee.js';
import { generateRound as generateSchweizerRound, checkRequirements as checkSchweizerRequirements } from './schweizer.js';
import { generateRound as generateRoundRobinRound, checkRequirements as checkRoundRobinRequirements } from './roundrobin.js';

export const PAIRING_STRATEGIES = {
  schweizer: { label: 'Schweizer-System', generateRound: generateSchweizerRound, checkRequirements: checkSchweizerRequirements },
  supermelee: { label: 'Supermêlée', generateRound: generateSupermeleeRound, checkRequirements: checkSupermeleeRequirements },
  jeder_gegen_jeden: { label: 'Jeder gegen Jeden', generateRound: generateRoundRobinRound, checkRequirements: checkRoundRobinRequirements },
};

// Supermêlée ist über registrationType codiert, alle anderen Systeme über type
// (z.B. 'schweizer', 'jeder_gegen_jeden'). Neue Systeme müssen hier und in
// PAIRING_STRATEGIES ergänzt werden - sonst nirgendwo.
export function getPlaySystemKey(tournament) {
  const registrationType = tournament.registrationType ?? tournament.registration_type;
  if (registrationType === 'supermelee') {
    return 'supermelee';
  }
  return tournament.type;
}

export function isOnlinePlayable(tournament) {
  return Boolean(PAIRING_STRATEGIES[getPlaySystemKey(tournament)]);
}

// Für UI-Hinweistexte ("nur X und Y werden unterstützt") - zieht die Namen direkt
// aus PAIRING_STRATEGIES, damit ein künftig ergänztes System nicht zusätzlich an
// jeder Hinweistext-Stelle nachgepflegt werden muss.
export function getSupportedSystemLabels() {
  return Object.values(PAIRING_STRATEGIES).map((strategy) => strategy.label);
}

export function getPairingStrategy(tournament) {
  return PAIRING_STRATEGIES[getPlaySystemKey(tournament)] || null;
}

// Fragt die Mindestvoraussetzungen für eine Runde generisch beim jeweiligen
// System ab (checkRequirements ist Teil des PAIRING_STRATEGIES-Vertrags, siehe
// supermelee.js) - UI-Code muss dadurch nicht wissen, welches System aktuell
// online spielbar ist bzw. welche Regeln dafür gelten. roundsPlayed wird nur von
// Systemen mit natürlichem Ende (Jeder gegen Jeden) ausgewertet, andere ignorieren
// es.
export function checkRoundRequirements(tournament, confirmedCount, roundsPlayed = 0) {
  const strategy = getPairingStrategy(tournament);
  if (!strategy?.checkRequirements) {
    return [];
  }
  const registrationType = tournament.registrationType ?? tournament.registration_type;
  return strategy.checkRequirements(confirmedCount, { formation: tournament.formation, registrationType, roundsPlayed });
}
