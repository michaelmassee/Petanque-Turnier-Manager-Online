// Guards the "Fehler-/Erfolgsmeldungen immer sichtbar" convention across the src/ frontend files:
// - The shared <Feedback> component (src/components/ui.jsx) must scroll a new message into
//   view and announce it (role="alert" for errors, role="status" for success). Otherwise a
//   click on a button far below the message (long dialogs on phones) seems to do nothing.
// - No other file may hand-roll <p className="feedback error|success">; it must use
//   <Feedback error={...} /> / <Feedback message={...} /> so it gets that behaviour.
//   Static hints with `feedback offline` are allowed, they must not scroll.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const srcDir = new URL('../src/', import.meta.url).pathname;
const uiFile = path.join(srcDir, 'components', 'ui.jsx');

function collectJsxFiles(dir) {
  let files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files = files.concat(collectJsxFiles(full));
    else if (entry.endsWith('.jsx') && !entry.endsWith('.test.jsx')) files.push(full);
  }
  return files;
}

let failures = 0;

function ok(label) {
  console.log(`ok   ${label}`);
}

function fail(label, detail) {
  failures += 1;
  console.error(`FAIL ${label}${detail ? `: ${detail}` : ''}`);
}

const uiSrc = readFileSync(uiFile, 'utf8');
const feedbackStart = uiSrc.indexOf('export function Feedback(');
const feedbackEnd = uiSrc.indexOf('\nexport function', feedbackStart + 1);
const feedbackSrc = feedbackStart === -1 ? '' : uiSrc.slice(feedbackStart, feedbackEnd === -1 ? undefined : feedbackEnd);

if (!feedbackSrc) {
  fail('Feedback-Komponente', 'export function Feedback( nicht in src/components/ui.jsx gefunden');
} else {
  if (/scrollIntoView/.test(feedbackSrc) && /useEffect\(/.test(feedbackSrc)) ok('Feedback scrollt neue Meldungen ins Blickfeld');
  else fail('Feedback scrollt neue Meldungen ins Blickfeld', 'useEffect + scrollIntoView fehlt');

  if (/role=\{error \? 'alert' : 'status'\}/.test(feedbackSrc)) ok('Feedback setzt role alert/status');
  else fail('Feedback setzt role alert/status', "role={error ? 'alert' : 'status'} fehlt");
}

const handRolled = /className=\{?["'`][^"'`]*\bfeedback\b[^"'`]*\b(error|success)\b/;
for (const file of collectJsxFiles(srcDir).sort()) {
  if (file === uiFile) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    if (handRolled.test(line)) {
      fail('handgeschriebene Meldung', `${path.relative(process.cwd(), file)}:${index + 1} – <Feedback error/message> statt className="feedback …" verwenden`);
    }
  });
}

if (failures > 0) {
  console.error(`\n${failures} Verstoß/Verstöße gegen die Feedback-Sichtbarkeitsregel.`);
  process.exit(1);
}
ok('keine handgeschriebenen Fehler-/Erfolgsmeldungen');
