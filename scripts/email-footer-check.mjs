// Every transactional email must end with the marketing footer (app description +
// desktop app link), regardless of language. sendTransactionalEmail appends it via
// appendEmailFooter - this guards that wiring against regressions.
import { appendEmailFooter } from '../src/worker.js';

let failures = 0;

function expectContains(label, text, needle) {
  if (text.includes(needle)) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}: expected to find "${needle}" in:\n${text}`);
}

const DESKTOP_APP_URL = 'https://michaelmassee.github.io/Petanque-Turnier-Manager/';
const LANGUAGES = ['de', 'nl', 'en', 'es', 'fr'];

for (const language of LANGUAGES) {
  const result = appendEmailFooter('E-Mail-Inhalt', language);
  expectContains(`Footer enthält Original-Text (${language})`, result, 'E-Mail-Inhalt');
  expectContains(`Footer enthält App-Namen (${language})`, result, 'Pétanque Turnier Manager Online');
  expectContains(`Footer enthält Desktop-App-Link (${language})`, result, DESKTOP_APP_URL);
}

// Unknown/missing language falls back to German rather than dropping the footer.
expectContains('Footer-Fallback auf Deutsch bei unbekannter Sprache', appendEmailFooter('x', 'xx'), 'Finde dein nächstes Turnier');

if (failures > 0) process.exit(1);
console.log('\nemail footer check passed.');
