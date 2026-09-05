// Regression check for the Abmelde-Link (cancel_token link) in registration emails:
// every email that leaves a team still registered (confirmation, reminder, waitlist
// notice) must contain the cancel link so recipients can withdraw themselves. This
// guards against templates being added/edited without wiring the cancelLink param
// through (happened once for REGISTRATION_DISPLACED_EMAILS.textWaitlisted).
import {
  REGISTRATION_CONFIRMATION_EMAILS,
  REGISTRATION_DISPLACED_EMAILS,
  TOURNAMENT_REMINDER_EMAILS,
  buildCancelLink,
} from '../src/worker.js';

let failures = 0;

function expectContainsCancelLink(label, text, cancelLink) {
  if (typeof text === 'string' && text.includes(cancelLink)) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}: cancel link "${cancelLink}" missing from:\n${text}`);
}

const LANGUAGES = ['de', 'nl', 'en', 'es', 'fr'];
const cancelLink = buildCancelLink('https://ptmonline.org', 'test-token-123');
const link = 'https://ptmonline.org/turniere/1/info';

for (const language of LANGUAGES) {
  expectContainsCancelLink(
    `Anmeldebestätigung enthält Abmelde-Link (${language})`,
    REGISTRATION_CONFIRMATION_EMAILS[language].text('Vorname', 'Turnier', 'Termin', 'Ort', link, cancelLink),
    cancelLink,
  );
  expectContainsCancelLink(
    `Erinnerungsmail enthält Abmelde-Link (${language})`,
    TOURNAMENT_REMINDER_EMAILS[language].text('Vorname', 'Turnier', 'Termin', 'Ort', link, cancelLink),
    cancelLink,
  );
  expectContainsCancelLink(
    `Wartelisten-Benachrichtigung enthält Abmelde-Link (${language})`,
    REGISTRATION_DISPLACED_EMAILS[language].textWaitlisted('Vorname', 'Turnier', link, cancelLink),
    cancelLink,
  );
}

if (failures > 0) process.exit(1);
console.log('\nemail cancel-link check passed.');
