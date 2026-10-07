// Sperrliste für Benutzernamen (de/en/fr/es/nl). Kuratierte Auswahl, angelehnt an „List of Dirty, Naughty, Obscene,
// and Otherwise Bad Words“ (LDNOOBW, CC-BY-4.0, https://github.com/LDNOOBW), ergänzt um rassistische und
// rechtsextreme Begriffe. Die Originallisten enthalten viele harmlose Wörter und Vornamen (z. B. „anita“) und
// werden deshalb nicht ungefiltert übernommen.

// Lange, eindeutige Begriffe: Treffer auch als Teil des Namens („xxhurensohnxx“).
const SUBSTRING_WORDS = [
  // de
  'arschloch', 'arschficker', 'arschlecker', 'hurensohn', 'schwanzlutscher', 'schwuchtel', 'schlampe', 'missgeburt',
  'wichser', 'fotze', 'kanake', 'kanacke', 'zigeuner', 'untermensch', 'judensau', 'gaskammer', 'neonazi',
  'kackbratze', 'hackfresse', 'spasti',
  // en
  'fuck', 'nigger', 'nigga', 'faggot', 'asshole', 'bitch', 'whore', 'pussy', 'dildo', 'wanker', 'retard', 'tranny',
  'wetback', 'porno', 'penis', 'blowjob', 'cocksucker', 'motherf',
  // fr
  'connard', 'connasse', 'salope', 'encule', 'putain', 'branleur', 'bougnoul', 'youpin', 'merde', 'filsdepute',
  // es
  'hijoputa', 'hijodeputa', 'gilipollas', 'chupapollas', 'soplapollas', 'maricon', 'pendejo', 'mierda', 'cabron',
  // nl
  'kankerlijer', 'teringlijer', 'klootzak', 'godverdomme', 'flikker', 'mongool', 'neuken', 'kutwijf',
  // Rechtsextremismus
  'hitler', 'siegheil', 'heilhitler', 'whitepower', 'whitepride', 'kukluxklan', 'nsdap', 'waffenss', 'auschwitz',
  'holocaust', 'zyklonb',
];

// Kurze oder mehrdeutige Begriffe: Treffer nur als ganzes Wort („cock“ ja, „cockburn“ nein). Bewusst nicht
// enthalten, weil echte Namen oder Abkürzungen: dick, mof, hh (Hamburg), cum, bite, 88/18 (Geburtsjahre).
const TOKEN_WORDS = [
  'fick', 'ficken', 'ficker', 'arsch', 'hure', 'nutte', 'neger', 'nazi', 'nazis', 'spast',
  'cunt', 'shit', 'cock', 'slut', 'rape', 'rapist', 'kike', 'chink', 'spic', 'wank', 'porn', 'sex',
  'pute', 'negre', 'pede', 'batard', 'salaud', 'con', 'conne', 'cul',
  'puta', 'puto', 'cono', 'polla', 'verga', 'culo',
  'kut', 'lul', 'hoer', 'kanker', 'tering',
  'kkk', 'zog', 'wpww',
];

// Szene-Codes, die nur ohne Leetspeak-Umwandlung erkannt werden (sonst würde aus „1488“ „ia88“).
const RAW_CODES = ['1488', 'hh88', '88hh', 'heil88', 'sieg88', '14words'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

function deLeet(value) {
  return value.replace(/[013457@$]/g, (char) => LEET[char]);
}

function collapseRepeats(value) {
  return value.replace(/(.)\1+/g, '$1');
}

const COLLAPSED_SUBSTRING_WORDS = SUBSTRING_WORDS.map(collapseRepeats);
const TOKEN_SET = new Set(TOKEN_WORDS);

export function isOffensiveUsername(name) {
  const raw = String(name ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!raw) return false;
  const compactRaw = raw.replace(/[^a-z0-9@$]/g, '');
  if (RAW_CODES.some((code) => compactRaw.includes(code))) return true;

  // Lange Begriffe auch über Trennzeichen hinweg („f.u.c.k“ bleibt außen vor, „hu.ren.sohn“ nicht). Kürzere nur
  // innerhalb eines Wortteils, sonst schlägt z. B. „hammer.devries“ wegen „merde“ an.
  const compact = deLeet(compactRaw);
  if (containsWord(compact, collapseRepeats(compact), (word) => word.length >= 7)) return true;

  // Wortgrenzen: Trennzeichen sowie Wechsel zwischen Buchstaben und Ziffern („nazi88“ → nazi, 88).
  const tokens = raw.split(/[^a-z0-9@$]+/).filter(Boolean);
  const candidates = new Set();
  for (const token of tokens) {
    const plain = deLeet(token);
    if (containsWord(plain, collapseRepeats(plain), () => true)) return true;
    candidates.add(plain);
    candidates.add(collapseRepeats(plain));
    for (const part of token.split(/(?<=\d)(?=[a-z])|(?<=[a-z])(?=\d)/)) candidates.add(part);
  }
  return [...candidates].some((token) => TOKEN_SET.has(token));
}

function containsWord(value, collapsed, filter) {
  return SUBSTRING_WORDS.some((word, index) => filter(word)
    && (value.includes(word) || collapsed.includes(COLLAPSED_SUBSTRING_WORDS[index])));
}
