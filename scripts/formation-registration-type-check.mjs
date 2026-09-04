// Business-rule check for the Formation / Anmeldetyp / Turniersystem matrix:
// - Formation "tete" only combines with registrationType "forme".
// - registrationType "supermelee" only combines with formation "doublette"/"triplette"
//   and is fixed to the "rangliste" tournament type (teams are redrawn every round,
//   incompatible with systems that require permanently fixed teams).
// - Partner fields are only expected for registrationType "forme" (drawn team types
//   never take partner input, regardless of formation).
import { normalizeTournamentInput, assertPartnerCountMatchesFormation } from '../src/worker.js';

const BASE_BODY = {
  name: 'Testturnier',
  date: '2026-06-01',
  location: 'Musterstadt',
};

let failures = 0;

function expectValid(label, overrides) {
  try {
    normalizeTournamentInput({ ...BASE_BODY, ...overrides });
    console.log(`ok   ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}: expected valid, got error "${error.message}"`);
  }
}

function expectInvalid(label, overrides, expectedMessage) {
  try {
    normalizeTournamentInput({ ...BASE_BODY, ...overrides });
    failures += 1;
    console.error(`FAIL ${label}: expected error "${expectedMessage}", but input was accepted`);
  } catch (error) {
    if (error.message !== expectedMessage) {
      failures += 1;
      console.error(`FAIL ${label}: expected error "${expectedMessage}", got "${error.message}"`);
    } else {
      console.log(`ok   ${label}`);
    }
  }
}

function expectPartnerRule(label, tournament, registration, shouldThrow) {
  try {
    assertPartnerCountMatchesFormation(tournament, registration);
    if (shouldThrow) {
      failures += 1;
      console.error(`FAIL ${label}: expected partner-count error, none was thrown`);
    } else {
      console.log(`ok   ${label}`);
    }
  } catch (error) {
    if (shouldThrow) {
      console.log(`ok   ${label}`);
    } else {
      failures += 1;
      console.error(`FAIL ${label}: unexpected partner-count error "${error.message}"`);
    }
  }
}

// --- Tête: only combinable with Formée, any tournament system ---
expectValid('tete + forme + schweizer', { formation: 'tete', registrationType: 'forme', type: 'schweizer' });
expectInvalid(
  'tete + melee rejected',
  { formation: 'tete', registrationType: 'melee', type: 'schweizer' },
  'Formation Tête ist nur mit dem Anmeldetyp Formée möglich',
);
expectInvalid(
  'tete + supermelee rejected',
  { formation: 'tete', registrationType: 'supermelee', type: 'rangliste' },
  'Formation Tête ist nur mit dem Anmeldetyp Formée möglich',
);

// --- Doublette/Triplette + Formée/Mêlée: any tournament system ---
expectValid('doublette + forme + ko', { formation: 'doublette', registrationType: 'forme', type: 'ko' });
expectValid('triplette + melee + liga', { formation: 'triplette', registrationType: 'melee', type: 'liga' });

// --- Supermêlée: only Doublette/Triplette, fixed to Turniersystem "rangliste" ---
expectValid('triplette + supermelee + rangliste', { formation: 'triplette', registrationType: 'supermelee', type: 'rangliste' });
expectInvalid(
  'doublette + supermelee + schweizer rejected (needs rangliste)',
  { formation: 'doublette', registrationType: 'supermelee', type: 'schweizer' },
  'Supermêlée erfordert das Turniersystem Rangliste',
);

// --- Old "supermelee" tournament-system value is gone ---
expectInvalid('type=supermelee no longer a valid Turniersystem', { formation: 'tete', registrationType: 'forme', type: 'supermelee' }, 'Ungültiges Turniersystem');

// --- Partner fields: only expected for registrationType "forme" ---
const partnerRegistration = { partnerFirstName: 'Max', partnerLastName: 'Muster' };
const noPartnerRegistration = {};

expectPartnerRule(
  'forme + doublette requires partner',
  { registration_type: 'forme', formation: 'doublette' },
  noPartnerRegistration,
  true,
);
expectPartnerRule(
  'forme + doublette + partner ok',
  { registration_type: 'forme', formation: 'doublette' },
  partnerRegistration,
  false,
);
expectPartnerRule(
  'melee + doublette rejects partner (drawn team)',
  { registration_type: 'melee', formation: 'doublette' },
  partnerRegistration,
  true,
);
expectPartnerRule(
  'supermelee + triplette rejects partner (drawn team)',
  { registration_type: 'supermelee', formation: 'triplette' },
  partnerRegistration,
  true,
);
expectPartnerRule(
  'supermelee + triplette without partner ok',
  { registration_type: 'supermelee', formation: 'triplette' },
  noPartnerRegistration,
  false,
);

if (failures > 0) {
  console.error(`\nformation/registrationType check failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('\nformation/registrationType check passed.');
