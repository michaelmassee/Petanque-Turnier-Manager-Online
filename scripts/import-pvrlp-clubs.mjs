// Importiert die Mitgliedsvereine des Pétanque-Verbands Rheinland-Pfalz (PVRLP) als Organisationen zur Moderation.
// Maßgeblich ist die Mitgliederliste auf pvrlp.com (MEMBERS_URL: Vereinsnummer, Name, Ort, Website). Platz, Logo,
// Kontakt-E-Mail und Beschreibung kommen aus der DPV-Vereinskarte des Verbands (VEREINE_URL), deren Koordinaten
// teils vertauscht, in Grad/Minuten oder falsch sind – geprüfte Korrekturen stehen in PLACE_FIXES.
// Vereine werden mit Owner = Admin und Status 'pending' angelegt.
//
//   node scripts/import-pvrlp-clubs.mjs --local            # SQL erzeugen und anzeigen
//   node scripts/import-pvrlp-clubs.mjs --local --apply    # zusätzlich ausführen
//   node scripts/import-pvrlp-clubs.mjs --remote --apply   # Produktion
//
// Idempotent: vorhandene Vereine (gleicher Name) und Plätze (gleicher Name, Adresse, Typ) werden übersprungen.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MEMBERS_URL = 'https://pvrlp.com/elementor-295/';
const VEREINE_URL = 'https://dpvserver.de/pvrlp/web/vmap/src/vereine.json';
const IMAGE_BASE = 'https://dpvserver.de/pvrlp/';
const MEMBER_OF = ['Pétanque-Verband Rheinland-Pfalz'];
// Nicht importieren: Tricolore und SV 1911 teilen sich Gelände und Website mit ASV 1898 bzw. Boule Club Bad Dürkheim
// 2023; SV Feldkirchen hat Postfach, Koordinate in Österreich und die Website von TV-Feldkirchen.
const EXCLUDED = new Set(['09-029', '09-074', '09-083']);
// Geprüfte Spielorte (Nominatim/Vereinswebsite), wo die Kartenkoordinate falsch oder nur die Ortsmitte ist.
// null = Verein ohne Platz anlegen, weil der Spielort unklar ist.
const PLACE_FIXES = {
  '09-001': { latitude: 49.619933, longitude: 7.8444277 },
  '09-008': { street: 'Maximilianstraße 9', latitude: 49.4810322, longitude: 7.7108561 },
  '09-046': { latitude: 49.6244275, longitude: 8.357677 },
  '09-049': { street: 'Westpfalzhalle', latitude: 49.576925, longitude: 7.6822978 },
  '09-055': { latitude: 49.6525016, longitude: 8.219985 },
  '09-066': null,
  '09-084': { latitude: 50.0022504, longitude: 8.2063659 },
  '09-085': { latitude: 49.5812705, longitude: 8.1587481 },
  '09-086': { street: 'Am Stadion 32 A', latitude: 49.4670765, longitude: 8.1897322 },
};
// Tote, gekaperte oder fremde Websites.
const BAD_WEBSITES = ['asv-lu.de', 'bc-essingen.de', 'la-boule.de', 'sv-meckenbach.de', 'tsv1908freckenfeld.jimdo.com'];

const args = new Set(process.argv.slice(2));
const target = args.has('--remote') ? '--remote' : args.has('--local') ? '--local' : null;
if (!target) {
  console.error('Bitte --local oder --remote angeben.');
  process.exit(1);
}

function query(sql) {
  const output = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', target, '--json', '--command', sql], { encoding: 'utf8' });
  return JSON.parse(output)[0].results;
}

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const multiline = (value) => String(value ?? '').split('\n').map(clean).filter(Boolean).join('\n');
const key = (name) => clean(name).toLowerCase();
const nameKey = (name) => key(name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const quote = (value) => (value === null || value === undefined || value === '' ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);
const decodeHtml = (value) => value.replace(/<[^>]+>/g, '').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&nbsp;', ' ');

function url(value) {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = parsed.hostname.replace(/^www\./, '');
    if (!['http:', 'https:'].includes(parsed.protocol) || !host.includes('.') || BAD_WEBSITES.includes(host)) return null;
    return parsed.href;
  } catch { return null; }
}

function logo(picture) {
  const path = clean(picture).replace(/^(\.\.\/)+/, '');
  return path.startsWith('Image/') && /\.(png|jpe?g|gif)$/i.test(path) ? new URL(path, IMAGE_BASE).href : null;
}

// Die Karte kennt Dezimalgrad (auch mit Komma), Grad/Minuten/Sekunden und Grad + Dezimalminuten.
function degrees(value) {
  const text = clean(value).replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(' ').map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] + parts[1] / 60 + parts[2] / 3600;
  if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] + parts[1] / 60;
  return NaN;
}

// Alle PVRLP-Vereine liegen in Rheinland-Pfalz. Einige Quelleinträge haben Breite und Länge vertauscht.
const inRlp = (latitude, longitude) => latitude >= 48.9 && latitude <= 51 && longitude >= 6 && longitude <= 8.6;

function coordinates(location) {
  const latitude = degrees(location?.latitude); const longitude = degrees(location?.longitude);
  if (inRlp(latitude, longitude)) return { latitude, longitude };
  if (inRlp(longitude, latitude)) return { latitude: longitude, longitude: latitude };
  return { latitude: null, longitude: null };
}

function placeDescription(entry) {
  const parts = [multiline(entry.about)].filter(Boolean);
  if (clean(entry.Trainingszeiten)) parts.push(`Trainingszeiten: ${multiline(entry.Trainingszeiten)}`);
  return parts.join('\n\n') || null;
}

async function fetchText(source) {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  return (await response.text()).replace(/^﻿/, '');
}

// Tabellenzeilen: Ver.Nr | Verein | Zusatz | PLZ | Ort | Verein Web | Abteilung Web
const members = [...(await fetchText(MEMBERS_URL)).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
  .map(([, row]) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(([, cell]) => clean(decodeHtml(cell))))
  .filter((cells) => /^09-\d{3}$/.test(cells[0]))
  .map(([number, name, , postcode, city, clubWeb, departmentWeb]) => ({ number, name, postcode, city, website: url(departmentWeb) || url(clubWeb) }));
if (members.length < 50) throw new Error(`Mitgliederliste unvollständig (${members.length} Vereine) – Seitenaufbau geändert?`);

// Karteneinträge über den Namen oder die Vereinsnummer im Logo-Pfad zuordnen.
const mapEntries = JSON.parse(await fetchText(VEREINE_URL));
function mapEntry(member) {
  return mapEntries.find((entry) => nameKey(entry.name) === nameKey(member.name))
    || mapEntries.find((entry) => clean(entry.picture).includes(`/${member.number}_`));
}

const [owner] = query("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
if (!owner) throw new Error('Kein Admin-Konto als Owner gefunden.');
const existing = new Set(query('SELECT lower(trim(name)) AS name FROM clubs').map((row) => row.name));

const now = new Date().toISOString();
const statements = [];
const skipped = [];
const withoutPlace = [];
let placeCount = 0;

for (const member of members) {
  if (EXCLUDED.has(member.number)) continue;
  if (existing.has(key(member.name))) {
    skipped.push(member.name);
    continue;
  }
  const entry = mapEntry(member);
  const clubId = crypto.randomUUID();
  statements.push(
    'INSERT OR IGNORE INTO clubs (id, name, kind, description, website_url, logo_url, social_links, member_of, contact_name, contact_email, contact_phone, status, owner_id, created_at, updated_at) '
    + `VALUES (${quote(clubId)}, ${quote(member.name)}, 'club', ${quote(multiline(entry?.Beschreibung))}, ${quote(member.website)}, ${quote(logo(entry?.picture))}, '{}', ${quote(JSON.stringify(MEMBER_OF))}, NULL, ${quote(clean(entry?.email))}, NULL, 'pending', ${quote(owner.id)}, ${quote(now)}, ${quote(now)});`,
  );

  const fix = PLACE_FIXES[member.number];
  if (!entry || fix === null) {
    withoutPlace.push(member.name);
    continue;
  }
  const street = fix?.street ?? clean(entry.adresse);
  const address = [street, `${member.postcode} ${member.city}`].filter(Boolean).join(', ');
  const { latitude, longitude } = fix ?? coordinates(entry.location);
  // Platz nur anlegen, wenn der Verein in diesem Lauf wirklich neu entstanden ist (kein verwaister Platz).
  statements.push(
    'INSERT INTO boule_places (id, club_id, club_name, name, address, latitude, longitude, venue_type, court_count, description, accessible, facility_codes, status, reported_by_user_id, created_at, updated_at) '
    + `SELECT ${quote(crypto.randomUUID())}, ${quote(clubId)}, NULL, ${quote(member.name)}, ${quote(address)}, ${latitude ?? 'NULL'}, ${longitude ?? 'NULL'}, 'outdoor', 0, ${quote(placeDescription(entry))}, 0, '[]', 'pending', NULL, ${quote(now)}, ${quote(now)} `
    + `WHERE EXISTS (SELECT 1 FROM clubs WHERE id = ${quote(clubId)}) AND NOT EXISTS (SELECT 1 FROM boule_places WHERE lower(trim(name)) = lower(trim(${quote(member.name)})) AND lower(trim(address)) = lower(trim(${quote(address)})) AND venue_type = 'outdoor');`,
  );
  placeCount += 1;
}

const newClubs = members.length - EXCLUDED.size - skipped.length;
console.log(`${members.length} Mitgliedsvereine, ${EXCLUDED.size} ausgeschlossen: ${newClubs} neu, ${placeCount} Plätze, ${skipped.length} übersprungen.`);
if (withoutPlace.length) console.log(`Ohne Platz: ${withoutPlace.join('; ')}`);
if (skipped.length) console.log(`Übersprungen (bereits vorhanden): ${skipped.join('; ')}`);
if (statements.length === 0) process.exit(0);

const file = join(mkdtempSync(join(tmpdir(), 'ptm-pvrlp-clubs-')), 'import.sql');
writeFileSync(file, `${statements.join('\n')}\n`);
console.log(`SQL: ${file}`);
console.log(statements.slice(0, 4).join('\n'));

if (args.has('--apply')) {
  const counts = () => query("SELECT (SELECT COUNT(*) FROM clubs) AS clubs, (SELECT COUNT(*) FROM boule_places) AS places, (SELECT COUNT(*) FROM tournaments) AS tournaments")[0];
  const before = counts();
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', target, '--yes', '--file', file], { stdio: 'inherit' });
  const after = counts();
  console.log(`Vorher: ${JSON.stringify(before)}`);
  console.log(`Nachher: ${JSON.stringify(after)}`);
  if (after.tournaments !== before.tournaments) process.exit(1);
}
