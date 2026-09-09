// Guards the "Pflichtfelder mit * markieren" convention across the src/ frontend files:
// - TextField/TextArea/SelectField must still render a RequiredMark exactly when their
//   `required` prop is truthy (the single point that covers almost every form field).
// - Any hand-rolled <label>...</label> block outside those components (e.g. the
//   consent checkbox in PublicRegistrationPanel) must carry a RequiredMark if and only
//   if it contains a `required` input/textarea/select - so required and optional fields
//   never drift out of sync with their marker.
// - No literal "*" may be hardcoded into JSX text/label strings elsewhere - it must
//   always go through <RequiredMark />, both for a single visual convention and because
//   a literal "*" merged into a label's text node breaks the translateDom() i18n lookup
//   (see lib/i18n.js translateDom - it matches by exact trimmed text-node content).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const srcDir = new URL('../src/', import.meta.url);

function collectJsxFiles(dir) {
  const entries = readdirSync(dir);
  let files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files = files.concat(collectJsxFiles(full));
    } else if (entry.endsWith('.jsx') && !entry.endsWith('.test.jsx')) {
      files.push(full);
    }
  }
  return files;
}

const files = collectJsxFiles(new URL(srcDir).pathname).sort();
const fileSources = files.map((file) => ({ file, src: readFileSync(file, 'utf8') }));

let failures = 0;

function ok(label) {
  console.log(`ok   ${label}`);
}

function fail(label, detail) {
  failures += 1;
  console.error(`FAIL ${label}${detail ? `: ${detail}` : ''}`);
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function findFunctionRange(src, name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) return null;

  let depth = 0;
  let i = start + marker.length - 1;
  for (; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  const bodyStart = src.indexOf('{', i);
  let braceDepth = 0;
  let j = bodyStart;
  for (; j < src.length; j += 1) {
    if (src[j] === '{') braceDepth += 1;
    else if (src[j] === '}') {
      braceDepth -= 1;
      if (braceDepth === 0) break;
    }
  }
  return [start, j + 1];
}

function findFunctionAcrossFiles(name) {
  for (const { file, src } of fileSources) {
    const range = findFunctionRange(src, name);
    if (range) return { file, src, range };
  }
  return null;
}

const SHARED_COMPONENTS = ['RequiredMark', 'TextField', 'TextArea', 'SelectField'];
const componentHits = SHARED_COMPONENTS.map((name) => {
  const hit = findFunctionAcrossFiles(name);
  if (!hit) fail(`${name} gefunden`, 'Funktionsdefinition in keiner src/**/*.jsx-Datei gefunden');
  else ok(`${name} gefunden (${path.relative(new URL(srcDir).pathname, hit.file)})`);
  return hit;
}).filter(Boolean);

// --- 1. Die drei Shared-Form-Komponenten müssen required weiterhin auf den Marker abbilden ---
// (jeder <label>-Zweig einzeln - TextField hat zwei Render-Zweige (Passwort/normal),
// die beide unabhängig voneinander die Marker-Logik brauchen)
const EXPECTED_LABEL_BRANCHES = { TextField: 2, TextArea: 1, SelectField: 1 };
for (const [name, expectedBranches] of Object.entries(EXPECTED_LABEL_BRANCHES)) {
  const hit = findFunctionAcrossFiles(name);
  if (!hit) continue;
  const body = hit.src.slice(hit.range[0], hit.range[1]);
  const branches = body.match(/<label\b[\s\S]*?<\/label>/g) || [];
  if (branches.length !== expectedBranches) {
    fail(`${name} hat ${expectedBranches} <label>-Zweig(e)`, `${branches.length} gefunden - Struktur hat sich geändert, Check muss angepasst werden`);
    continue;
  }
  const missing = branches.filter((branch) => !/required\s*\?\s*<RequiredMark\s*\/>\s*:\s*null/.test(branch));
  if (missing.length === 0) {
    ok(`${name} rendert RequiredMark in jedem Zweig abhängig von required`);
  } else {
    fail(`${name} rendert RequiredMark in jedem Zweig abhängig von required`, `${missing.length} von ${branches.length} Zweig(en) ohne "required ? <RequiredMark /> : null"`);
  }
}

// --- 2. Alle <label>-Blöcke (Shared-Komponenten + hand-verdrahtete Felder wie die
//        Zustimmungs-Checkbox): required-Feld und RequiredMark müssen zusammen auftreten ---
for (const { file, src } of fileSources) {
  const labelPattern = /<label\b[\s\S]*?<\/label>/g;
  let match;
  while ((match = labelPattern.exec(src))) {
    const block = match[0];
    const hasRequiredControl = /\brequired\b/.test(block);
    const hasMark = /<RequiredMark\s*\/>/.test(block);
    const label = `${path.relative(new URL(srcDir).pathname, file)} Zeile ${lineOf(src, match.index)}`;
    if (hasRequiredControl === hasMark) {
      ok(`<label>-Block ${label}: required und RequiredMark stimmen überein`);
    } else if (hasRequiredControl) {
      fail(`<label>-Block ${label}`, 'enthält ein required-Feld, aber keinen <RequiredMark /> im Label');
    } else {
      fail(`<label>-Block ${label}`, 'enthält <RequiredMark />, aber kein required-Feld (Nichtpflichtfeld darf kein * zeigen)');
    }
  }
}

// --- 3. Kein hartkodiertes "*" außerhalb von RequiredMark selbst ---
const requiredMarkHit = findFunctionAcrossFiles('RequiredMark');
const operatorLike = /\*\*|[\w)]\s*\*\s*[\w(]/;
for (const { file, src } of fileSources) {
  src.split('\n').forEach((line, idx) => {
    if (!line.includes('*')) return;
    const lineStart = src.split('\n').slice(0, idx).join('\n').length + (idx > 0 ? 1 : 0);
    if (requiredMarkHit && requiredMarkHit.file === file && lineStart >= requiredMarkHit.range[0] && lineStart < requiredMarkHit.range[1]) return;
    if (operatorLike.test(line)) return;
    fail(`${path.relative(new URL(srcDir).pathname, file)} Zeile ${idx + 1}: kein hartkodiertes "*"`, `Pflichtfeld-Markierung muss über <RequiredMark /> laufen: "${line.trim()}"`);
  });
}

if (failures > 0) {
  console.error(`\n${failures} Fehler beim Pflichtfeld-Markierungs-Check.`);
  process.exit(1);
}
console.log('\nrequired fields check passed.');
