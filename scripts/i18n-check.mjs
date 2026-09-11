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

function extractKeys(source) {
  const keys = new Set();
  // Only matches literal single-quoted t('...') calls; dynamic keys like
  // t(option.label) or t(requirement.text) can't be checked statically and
  // are intentionally skipped here.
  const regex = /\bt\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
  let match;
  while ((match = regex.exec(source))) {
    keys.add(match[1].replace(/\\'/g, "'"));
  }
  return keys;
}

function main() {
  const files = walk(SRC_DIR);
  const allKeys = new Set();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const key of extractKeys(source)) {
      allKeys.add(key);
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
      "\nEvery literal t('...') string needs a translation for every language: add the missing key(s) to src/locales/{nl,en,es,fr}.json.",
    );
    process.exit(1);
  }

  console.log(`i18n check passed: ${allKeys.size} literal t() keys, all present and translated in [${LANGUAGES.join(', ')}].`);
}

main();
