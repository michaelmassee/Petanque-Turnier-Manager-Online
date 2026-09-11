// i18n quality gate for the react-i18next setup: every literal string passed
// to t('...') in the source must have a translation for every supported
// language in src/locales/*.json. German is the implicit source language
// (the literal key itself) and does not need its own locales/de.json entry
// unless the German text differs from the key (rare, legacy postbox strings).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(ROOT, '..', 'src');
const LOCALES_DIR = join(SRC_DIR, 'locales');
const LANGUAGES = ['nl', 'en', 'es', 'fr'];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'locales' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (/\.jsx?$/.test(entry) && !/\.test\.jsx?$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function extractLiteralKeys(source) {
  const keys = new Set();
  // Matches literal single-quoted t('...') calls.
  const regex = /\bt\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
  let match;
  while ((match = regex.exec(source))) {
    keys.add(match[1].replace(/\\'/g, "'"));
  }
  return keys;
}

function extractConstDeclarations(source, constants) {
  // export const SOME_CONST = 'literal text';
  const regex = /export const ([A-Za-z_][A-Za-z0-9_]*)\s*=\s*'((?:[^'\\]|\\.)*)'\s*;/g;
  let match;
  while ((match = regex.exec(source))) {
    constants.set(match[1], match[2].replace(/\\'/g, "'"));
  }
}

function extractConstReferences(source) {
  // t(SOME_CONST) - references a module-level string constant by name,
  // resolved against extractConstDeclarations() below. Covers the common
  // "translated message constant" pattern (see lib/constants.js,
  // lib/format.js) without needing to check the identifier at every call
  // site by hand. Object/array field access (t(option.label),
  // t(requirement.text)) and anything else non-trivial is NOT resolved -
  // those stay a manual-audit responsibility, see i18next-migration memory.
  const keys = new Set();
  const regex = /\bt\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;
  let match;
  while ((match = regex.exec(source))) {
    keys.add(match[1]);
  }
  return keys;
}

function main() {
  const files = walk(SRC_DIR);
  const allKeys = new Set();
  const constants = new Map();
  const constRefsByFile = new Map();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const key of extractLiteralKeys(source)) {
      allKeys.add(key);
    }
    extractConstDeclarations(source, constants);
    constRefsByFile.set(file, extractConstReferences(source));
  }

  const unresolvedConstRefs = new Set();
  for (const refs of constRefsByFile.values()) {
    for (const name of refs) {
      if (constants.has(name)) {
        allKeys.add(constants.get(name));
      } else {
        unresolvedConstRefs.add(name);
      }
    }
  }

  const locales = {};
  for (const language of LANGUAGES) {
    locales[language] = JSON.parse(readFileSync(join(LOCALES_DIR, `${language}.json`), 'utf8'));
  }

  const errors = [];
  for (const key of allKeys) {
    for (const language of LANGUAGES) {
      const value = locales[language][key];
      if (value === undefined) {
        errors.push(`Key missing in ${language}.json: ${JSON.stringify(key)}`);
      } else if (typeof value !== 'string' || value.trim() === '') {
        errors.push(`Empty translation for "${language}" -> ${JSON.stringify(key)}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`i18n check failed with ${errors.length} issue(s):\n`);
    for (const message of errors) {
      console.error(`  - ${message}`);
    }
    console.error(
      "\nEvery literal t('...') string, and every t(SOME_CONST) referencing an 'export const SOME_CONST = \\'...\\'' string, needs a translation for every language: add the missing key(s) to src/locales/{nl,en,es,fr}.json.",
    );
    process.exit(1);
  }

  console.log(`i18n check passed: ${allKeys.size} t() keys (literal + resolved const references), all present and translated in [${LANGUAGES.join(', ')}].`);
  if (unresolvedConstRefs.size > 0) {
    console.log(
      `Note: ${unresolvedConstRefs.size} t(...) call(s) use a non-literal argument this check cannot resolve statically ` +
        `(e.g. t(option.label), t(requirement.text)) and were skipped: ${[...unresolvedConstRefs].sort().join(', ')}. ` +
        'Verify these by hand whenever the underlying data (constants arrays, API-provided text) changes.',
    );
  }
}

main();
