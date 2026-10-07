// Importiert die Mitgliedsvereine des Hessischen Petanque Verbands (HPV) als Organisationen zur Moderation.
// Quelle: hessenpetanque.de/verband/mitgliedsvereine/ bettet nur die DPV-Vereinskarte ein, deren Daten liegen in
// VEREINE_URL. Vereine werden mit Owner = Admin und Status 'pending' angelegt, Plätze mit den Koordinaten der Quelle.
//
//   node scripts/import-hpv-clubs.mjs --local            # SQL erzeugen und anzeigen
//   node scripts/import-hpv-clubs.mjs --local --apply    # zusätzlich ausführen
//   node scripts/import-hpv-clubs.mjs --remote --apply   # Produktion
//
// Idempotent: vorhandene Vereine (gleicher Name) und Plätze (gleicher Name, Adresse, Typ) werden übersprungen.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VEREINE_URL = 'https://dpvserver.de/hpv/web/vmap/src/vereine.json';
const IMAGE_BASE = 'https://dpvserver.de/hpv/';
const MEMBER_OF = ['Hessischer Petanque Verband'];
// Bereits unter anderer Schreibweise vorhandene Vereine.
const ALIASES = { '1.pétanque club petterweil von 1986 e.v.': '1.pc-petterweil von 1986 e.v.' };
// Zweite Einträge desselben Vereins: Halle → indoor, gleicher Ort → zusammenführen, sonst eigenständiger Platz.
const SECOND_PLACE = {
  'sg rumkugler kassel e. v.': { venueType: 'indoor' },
  'turngemeinde 1925 bobstadt e.v.': { merge: true },
  'boule club linden e.v.': { merge: true },
  'bornheim boules e.v.': { independent: true, name: 'Günthersburgpark' },
};

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
const quote = (value) => (value === null || value === undefined || value === '' ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);

function url(value) {
  const raw = clean(value).replace(/^(https?:\/\/)+/i, 'https://');
  if (!raw) return null;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.includes('.') ? parsed.href : null;
  } catch { return null; }
}

function logo(picture) {
  const path = clean(picture).replace(/^(\.\.\/)+/, '');
  return path.startsWith('Image/') ? new URL(path, IMAGE_BASE).href : null;
}

function address(entry) {
  const city = clean(entry.Ort).replace(/^\((\d{5})\)/, '$1');
  return [clean(entry.address), city].filter(Boolean).join(', ');
}

function coordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 && number >= min && number <= max ? number : null;
}

function placeDescription(entries) {
  const parts = [...new Set(entries.map((entry) => multiline(entry.about)).filter(Boolean))];
  const training = [...new Set(entries.map((entry) => multiline(entry.Trainingszeiten)).filter(Boolean))];
  if (training.length) parts.push(`Trainingszeiten: ${training.join('\n')}`);
  return parts.join('\n\n') || null;
}

const response = await fetch(VEREINE_URL);
if (!response.ok) throw new Error(`${VEREINE_URL}: HTTP ${response.status}`);
const entries = JSON.parse((await response.text()).replace(/^﻿/, ''));

const groups = new Map();
for (const entry of entries) {
  const name = clean(entry.name);
  if (!groups.has(key(name))) groups.set(key(name), { name, entries: [] });
  groups.get(key(name)).entries.push(entry);
}

const [owner] = query("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
if (!owner) throw new Error('Kein Admin-Konto als Owner gefunden.');
const existing = new Set(query('SELECT lower(trim(name)) AS name FROM clubs').map((row) => row.name));

const now = new Date().toISOString();
const statements = [];
const skipped = [];
let placeCount = 0;

function insertPlace({ clubId, clubName, name, entry, venueType = 'outdoor', description }) {
  const place = {
    id: crypto.randomUUID(), clubId, clubName, name, address: address(entry), venueType, description,
    latitude: coordinate(entry.location?.latitude, -90, 90), longitude: coordinate(entry.location?.longitude, -180, 180),
  };
  // Vereinsplätze nur anlegen, wenn der Verein in diesem Lauf wirklich neu entstanden ist (kein verwaister Platz).
  const clubCondition = clubId ? `EXISTS (SELECT 1 FROM clubs WHERE id = ${quote(clubId)})` : '1';
  statements.push(
    `INSERT INTO boule_places (id, club_id, club_name, name, address, latitude, longitude, venue_type, court_count, description, accessible, facility_codes, status, reported_by_user_id, created_at, updated_at) `
    + `SELECT ${quote(place.id)}, ${quote(clubId)}, ${quote(clubName)}, ${quote(name)}, ${quote(place.address)}, ${place.latitude ?? 'NULL'}, ${place.longitude ?? 'NULL'}, ${quote(venueType)}, 0, ${quote(description)}, 0, '[]', 'pending', ${clubId ? 'NULL' : quote(owner.id)}, ${quote(now)}, ${quote(now)} `
    + `WHERE ${clubCondition} AND NOT EXISTS (SELECT 1 FROM boule_places WHERE lower(trim(name)) = lower(trim(${quote(name)})) AND lower(trim(address)) = lower(trim(${quote(place.address)})) AND venue_type = ${quote(venueType)});`,
  );
  placeCount += 1;
}

for (const [groupKey, group] of groups) {
  if (existing.has(groupKey) || existing.has(ALIASES[groupKey])) {
    skipped.push(group.name);
    continue;
  }
  const [first, ...rest] = group.entries;
  const second = SECOND_PLACE[groupKey] || {};
  if (rest.length > 1 || (rest.length && !Object.keys(second).length)) throw new Error(`Unerwartete Mehrfacheinträge für ${group.name}`);
  const clubId = crypto.randomUUID();
  const description = multiline(group.entries.map((entry) => entry.Beschreibung).find((text) => clean(text)));
  const contactEmail = clean(group.entries.map((entry) => entry.email).find((email) => clean(email)));
  const websiteUrl = group.entries.map((entry) => url(entry.Homepage)).find(Boolean) || null;
  const logoUrl = group.entries.map((entry) => logo(entry.picture)).find(Boolean) || null;
  statements.push(
    'INSERT OR IGNORE INTO clubs (id, name, kind, description, website_url, logo_url, social_links, member_of, contact_name, contact_email, contact_phone, status, owner_id, created_at, updated_at) '
    + `VALUES (${quote(clubId)}, ${quote(group.name)}, 'club', ${quote(description)}, ${quote(websiteUrl)}, ${quote(logoUrl)}, '{}', ${quote(JSON.stringify(MEMBER_OF))}, NULL, ${quote(contactEmail)}, NULL, 'pending', ${quote(owner.id)}, ${quote(now)}, ${quote(now)});`,
  );
  const placeEntries = second.merge ? group.entries : [first];
  insertPlace({ clubId, clubName: null, name: group.name, entry: first, description: placeDescription(placeEntries) });
  if (rest.length && !second.merge) {
    const [entry] = rest;
    if (second.independent) insertPlace({ clubId: null, clubName: group.name, name: second.name, entry, description: placeDescription([entry]) });
    else insertPlace({ clubId, clubName: null, name: group.name, entry, venueType: second.venueType, description: placeDescription([entry]) });
  }
}

const newClubs = groups.size - skipped.length;
console.log(`${entries.length} Einträge, ${groups.size} Vereine: ${newClubs} neu, ${placeCount} Plätze, ${skipped.length} übersprungen.`);
if (skipped.length) console.log(`Übersprungen (bereits vorhanden): ${skipped.join('; ')}`);
if (statements.length === 0) process.exit(0);

const file = join(mkdtempSync(join(tmpdir(), 'ptm-hpv-clubs-')), 'import.sql');
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
