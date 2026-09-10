import { generateRound as generateSupermeleeRound } from './supermelee.js';

export const PAIRING_STRATEGIES = {
  supermelee: { generateRound: generateSupermeleeRound },
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
