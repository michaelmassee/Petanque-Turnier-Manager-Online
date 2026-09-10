import { generateRound as generateSupermeleeRound, checkRequirements as checkSupermeleeRequirements } from './supermelee.js';

export const PAIRING_STRATEGIES = {
  supermelee: { generateRound: generateSupermeleeRound, checkRequirements: checkSupermeleeRequirements },
};

// Supermêlée ist über registrationType codiert, alle anderen Systeme über type
// (z.B. künftig 'schweizer'). Neue Systeme müssen hier und in PAIRING_STRATEGIES
// ergänzt werden - sonst nirgendwo.
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

export function getPairingStrategy(tournament) {
  return PAIRING_STRATEGIES[getPlaySystemKey(tournament)] || null;
}

// Fragt die Mindestvoraussetzungen für eine Runde generisch beim jeweiligen
// System ab (checkRequirements ist Teil des PAIRING_STRATEGIES-Vertrags, siehe
// supermelee.js) - UI-Code muss dadurch nicht wissen, welches System aktuell
// online spielbar ist bzw. welche Regeln dafür gelten.
export function checkRoundRequirements(tournament, confirmedCount) {
  const strategy = getPairingStrategy(tournament);
  if (!strategy?.checkRequirements) {
    return [];
  }
  return strategy.checkRequirements(confirmedCount, { formation: tournament.formation });
}
