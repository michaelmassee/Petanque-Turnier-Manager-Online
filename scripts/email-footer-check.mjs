// Every transactional email must end with the marketing footer (app description +
// desktop app link), regardless of language. sendTransactionalEmail appends it via
// appendEmailFooter - this guards that wiring against regressions.
import { appendEmailFooter, renderTransactionalEmailHtml } from '../src/worker.js';

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

for (const language of LANGUAGES) {
  const html = renderTransactionalEmailHtml('Betreff', 'Hallo!\n\nhttps://ptmonline.org/test', language);
  expectContains(`HTML-Mail enthält Marken-Kopf (${language})`, html, 'Pétanque Turnier Manager Online');
  expectContains(`HTML-Mail enthält Link (${language})`, html, 'href="https://ptmonline.org/test"');
  expectContains(`HTML-Mail enthält Klartext-Fallback-Inhalt (${language})`, html, 'Hallo!');
}

const escapedHtml = renderTransactionalEmailHtml('<script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'de');
if (!escapedHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;') || escapedHtml.includes('<script>alert(1)</script>') || escapedHtml.includes('<img src=x onerror=alert(1)>')) {
  failures += 1;
  console.error('FAIL HTML-Mail escaped dynamic content unsafely');
} else {
  console.log('ok   HTML-Mail escaped dynamic content');
}

const queryLinkHtml = renderTransactionalEmailHtml('Betreff', 'https://ptmonline.org/?token=a&next=b', 'de');
expectContains('HTML-Mail erhält URL-Parameter', queryLinkHtml, 'href="https://ptmonline.org/?token=a&amp;next=b"');

if (failures > 0) process.exit(1);
console.log('\nemail footer check passed.');
