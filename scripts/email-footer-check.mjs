// Every transactional email must end with the marketing footer (app description +
// desktop app link), regardless of language. sendTransactionalEmail appends it via
// appendEmailFooter - this guards that wiring against regressions.
import { appendEmailFooter, emailAction, renderTransactionalEmailHtml } from '../src/worker.js';

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
expectContains('Footer-Fallback auf Deutsch bei unbekannter Sprache', appendEmailFooter('x', 'xx'), 'Entdecke Pétanqueturniere in deiner Nähe');

for (const language of LANGUAGES) {
  const html = renderTransactionalEmailHtml('Betreff', 'Hallo!\n\nhttps://ptmonline.org/test', language);
  expectContains(`HTML-Mail enthält Marken-Kopf (${language})`, html, 'Pétanque Turnier Manager Online');
  expectContains(`HTML-Mail enthält Link (${language})`, html, 'href="https://ptmonline.org/test"');
  expectContains(`HTML-Mail enthält Klartext-Fallback-Inhalt (${language})`, html, 'Hallo!');
}

const actionUrls = {
  tournament: 'https://example.test/turniere/1/info',
  directions: 'https://example.test/route',
  live: 'https://example.test/live',
  cancel: 'https://example.test/cancel',
};
const actionHtml = renderTransactionalEmailHtml(
  'Betreff',
  `Infos\n\n${actionUrls.tournament}\n\n${actionUrls.directions}\n\n${actionUrls.live}\n\n${actionUrls.cancel}`,
  'de',
  null,
  '',
  Object.entries(actionUrls).map(([kind, url]) => emailAction(kind, url, 'de')),
);
for (const [label, icon, url] of [
  ['Turnier ansehen', '▣', actionUrls.tournament],
  ['Anfahrt planen', '⌖', actionUrls.directions],
  ['Live-Ansicht öffnen', '▶', actionUrls.live],
  ['Anmeldung stornieren', '×', actionUrls.cancel],
]) {
  expectContains(`Aktionsbutton ${label}`, actionHtml, `${icon}</span>${label}</a>`);
  expectContains(`Aktionsbutton ${label} hat Ziel`, actionHtml, `href="${url}"`);
}
const allActionKinds = [
  ['tournament', 'Turnier ansehen', '▣'],
  ['directions', 'Anfahrt planen', '⌖'],
  ['live', 'Live-Ansicht öffnen', '▶'],
  ['cancel', 'Anmeldung stornieren', '×'],
  ['whatsapp', 'WhatsApp-Gruppe öffnen', '◉'],
  ['confirm', 'Bestätigen', '✓'],
  ['edit', 'Bouleplatz bearbeiten', '✎'],
  ['reset', 'Passwort zurücksetzen', '↻'],
];
const actionOnlyHtml = renderTransactionalEmailHtml(
  'Betreff',
  'Eine Nachricht ohne URL im Text.',
  'de',
  null,
  '',
  allActionKinds.map(([kind], index) => emailAction(kind, `https://example.test/${index}`, 'de')),
);
for (const [kind, label, icon] of allActionKinds) {
  expectContains(`Aktion ohne Text-URL erscheint als Button (${kind})`, actionOnlyHtml, `${icon}</span>${label}</a>`);
}
if (actionHtml.includes(`>${actionUrls.tournament}</a>`) || actionHtml.includes(`>${actionUrls.cancel}</p>`)) {
  failures += 1;
  console.error('FAIL Aktionslinks werden im HTML als sichtbare URL ausgegeben');
} else {
  console.log('ok   Aktionslinks erscheinen nicht als sichtbare URL');
}
expectContains('Footer enthält Desktop-App-Button', actionHtml, '↗</span>Desktop-App öffnen</a>');
expectContains('Footer enthält Impressum-Button', actionHtml, '§</span>Impressum</a>');
expectContains('Footer enthält Datenschutz-Button', actionHtml, '◌</span>Datenschutz</a>');
if (actionHtml.includes(`>${DESKTOP_APP_URL}<`)) {
  failures += 1;
  console.error('FAIL Footer zeigt die Desktop-App-URL sichtbar an');
} else {
  console.log('ok   Footer zeigt keine Desktop-App-URL sichtbar an');
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
