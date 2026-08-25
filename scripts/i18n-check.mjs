// i18n quality gate, mirrors the intent of the main project's
// I18nVollstaendigkeitTest (completeness) / I18nReferenzdateiTest (reference
// consistency): every translation key must exist, non-empty, in every
// supported language. German is the implicit source language (the literal
// JSX text) and is not itself a TRANSLATIONS entry.
import { readFileSync } from 'node:fs';

const APP_FILE = new URL('../src/App.jsx', import.meta.url);
const LANGUAGES = ['nl', 'en', 'es', 'fr'];

function extractTranslationsSource(source) {
  const startMarker = 'const TRANSLATIONS = {';
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error('Could not locate "const TRANSLATIONS = {" in src/App.jsx');
  }

  let depth = 0;
  let end = -1;
  for (let i = start + startMarker.length - 1; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) {
    throw new Error('Could not find the end of the TRANSLATIONS object in src/App.jsx');
  }

  return source.slice(start + 'const TRANSLATIONS = '.length, end);
}

function loadTranslations() {
  const source = readFileSync(APP_FILE, 'utf8');
  const objectSource = extractTranslationsSource(source);
  // eslint-disable-next-line no-new-func
  return new Function(`return (${objectSource});`)();
}

function main() {
  const translations = loadTranslations();
  const errors = [];

  for (const language of LANGUAGES) {
    if (!translations[language]) {
      errors.push(`Missing language block: ${language}`);
    }
  }

  const keysByLanguage = Object.fromEntries(
    LANGUAGES.map((language) => [language, new Set(Object.keys(translations[language] || {}))]),
  );

  const allKeys = new Set();
  for (const keys of Object.values(keysByLanguage)) {
    for (const key of keys) allKeys.add(key);
  }

  for (const key of allKeys) {
    const missingIn = LANGUAGES.filter((language) => !keysByLanguage[language].has(key));
    if (missingIn.length > 0) {
      errors.push(`Key missing in [${missingIn.join(', ')}]: ${JSON.stringify(key)}`);
    }
  }

  for (const language of LANGUAGES) {
    for (const [key, value] of Object.entries(translations[language] || {})) {
      if (typeof value !== 'string' || value.trim() === '') {
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
      '\nEvery UI string must be translatable: add the missing key(s) to TRANSLATIONS in src/App.jsx for every language (nl/en/es/fr).',
    );
    process.exit(1);
  }

  console.log(`i18n check passed: ${allKeys.size} keys, all present and translated in [${LANGUAGES.join(', ')}].`);
}

main();
