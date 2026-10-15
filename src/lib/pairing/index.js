import { generateRound as generateSupermeleeRound, checkRequirements as checkSupermeleeRequirements } from './supermelee.js';
import { generateRound as generateSchweizerRound, checkRequirements as checkSchweizerRequirements, MIN_TEAMS as SCHWEIZER_MIN_TEAMS } from './schweizer.js';
import { generateRound as generateRoundRobinRound, checkRequirements as checkRoundRobinRequirements, MIN_TEAMS as ROUND_ROBIN_MIN_TEAMS } from './roundrobin.js';
import { generateRound as generateFormuleXRound, checkRequirements as checkFormuleXRequirements, MIN_TEAMS as FORMULE_X_MIN_TEAMS } from './formulex.js';
import { generateRound as generateKoRound, checkRequirements as checkKoRequirements, MIN_TEAMS as KO_MIN_TEAMS } from './ko.js';

export const PAIRING_STRATEGIES = {
  schweizer: { label: 'Schweizer-System', generateRound: generateSchweizerRound, checkRequirements: checkSchweizerRequirements, minTeams: SCHWEIZER_MIN_TEAMS },
  supermelee: { label: 'Supermêlée', generateRound: generateSupermeleeRound, checkRequirements: checkSupermeleeRequirements },
  jeder_gegen_jeden: { label: 'Jeder gegen Jeden', generateRound: generateRoundRobinRound, checkRequirements: checkRoundRobinRequirements, minTeams: ROUND_ROBIN_MIN_TEAMS },
  formule_x: { label: 'Formule X', generateRound: generateFormuleXRound, checkRequirements: checkFormuleXRequirements, minTeams: FORMULE_X_MIN_TEAMS },
  ko: { label: 'K.O.', generateRound: generateKoRound, checkRequirements: checkKoRequirements, minTeams: KO_MIN_TEAMS },
};

// Supermêlée ist über registrationType codiert, alle anderen Systeme über type
// (z.B. 'schweizer', 'jeder_gegen_jeden', 'formule_x'). Neue Systeme müssen hier und
// in PAIRING_STRATEGIES ergänzt werden - sonst nirgendwo.
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

// Mêlée-Turniere werden in jedem Online-System mit fest ausgelosten Teams gespielt (Supermêlée hat ein eigenes System).
export function isMeleeTeamTournament(tournament) {
  return (tournament.registrationType ?? tournament.registration_type) === 'melee' && isOnlinePlayable(tournament);
}

// Mindestzahl Teams für eine Runde; die Mêlée-Auslosung braucht entsprechend viele Spieler.
export function minimumTeams(tournament) {
  return getPairingStrategy(tournament)?.minTeams ?? 0;
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
  const formuleXRounds = tournament.formuleXRounds ?? tournament.formule_x_rounds ?? 4;
  return strategy.checkRequirements(confirmedCount, { formation: tournament.formation, registrationType, roundsPlayed, formuleXRounds });
}

// Die UI zeigt diese Texte vorab, der Worker verwendet sie ebenfalls für direkte
// API-Aufrufe. So bleiben fachliche Regeln keine reine Client-Absicherung.
// Bei Mêlée zählen die ausgelosten Teams (teams: true), sonst die bestätigten Meldungen.
export function roundRequirementMessage(requirement, { teams = false } = {}) {
  if (requirement.type === 'minPlayers') {
    return teams
      ? `Für eine Runde werden mindestens ${requirement.min} Teams benötigt.`
      : `Für eine Runde werden mindestens ${requirement.min} bestätigte Meldungen benötigt.`;
  }
  return requirement.text;
}
