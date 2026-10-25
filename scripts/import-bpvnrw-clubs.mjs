// Importiert die Mitgliedsvereine des Boule und Pétanque Verbands Nordrhein-Westfalen (BPV NRW) als Organisationen
// zur Moderation. Quellen: die Vereinskarte des Verbands (Google My Maps auf boule-nrw.de/vereine, KML_URL) mit
// Vereinskennzahl, Platzadresse und am Platz gesetzter Koordinate; die Vereinsliste derselben Seite (LIST_URL) für
// Website und öffentliche E-Mail; die DPV-Vereinskarte (LOGOS_URL) nur für Logos, deren Dateinamen die
// Vereinskennzahl tragen. Vereine werden mit Owner = Admin und Status 'pending' angelegt, mit --publish gleich
// freigegeben (wie die Admin-Freigabe: Verein und Plätze 'published').
//
//   node scripts/import-bpvnrw-clubs.mjs --local            # SQL erzeugen und anzeigen
//   node scripts/import-bpvnrw-clubs.mjs --local --apply    # zusätzlich ausführen
//   node scripts/import-bpvnrw-clubs.mjs --remote --apply   # Produktion
//   node scripts/import-bpvnrw-clubs.mjs --remote --apply --publish   # Produktion, gleich freigegeben
//
// Idempotent: vorhandene Vereine (gleicher Name) und Plätze (gleicher Name, Adresse, Typ) werden übersprungen.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LIST_URL = 'https://www.boule-nrw.de/vereine/';
const KML_URL = 'https://www.google.com/maps/d/kml?mid=1lvIu9sZyJ1q5NNUNdBV6ivb_frBxT4De&forcekml=1';
const LOGOS_URL = 'https://dpvserver.de/nrw/web/vmap/src/vereine.json';
const IMAGE_BASE = 'https://dpvserver.de/nrw/';
const MEMBER_OF = ['Boule und Pétanque Verband Nordrhein-Westfalen'];
// Schreibfehler in der Vereinsliste (Apostroph fehlt).
const NAME_FIXES = { '002': "Boule d'Aix-la-Chapelle e.V." };
// Tote oder falsch verlinkte Vereinsseiten (geprüft 2026-10-25); null = keine Website.
const WEBSITE_FIXES = {
  105: 'https://www.buergerverein-wuelfer-bexten.de/',
  109: null,
  155: 'https://www.esv-wuppertal-west.de/',
  '053': 'https://tve-luenern.de/',
};
// Geprüfte Korrekturen (Nominatim/Pétanque-Aktuell-Karte) an den Kartenfeldern; null = Verein ohne Platz anlegen.
const PLACE_FIXES = {
  185: { street: 'Kitzenhausweg 15' },
  109: { city: 'Hagen' },
  // Karte weicht von der Vereinsliste ab; die Liste passt zu Pin bzw. Ort.
  162: { street: 'An der Vulkeskuhle 8' },
  175: { street: 'Liemker Str. 22' },
  177: { street: 'Paderborner Str. 5 (Bürmsche Wiese)' },
  189: { postcode: '32423' },
  180: { street: 'Ruhrstraße 12 (Kettenschmiedemuseum)' },
  // Platzangaben der Vereinswebsites (geprüft 2026-10-25); Koordinaten nur dort, wo der Verein selbst welche nennt.
  '091': { street: 'Im Auel 32' },
  '011': { street: 'Borkener Straße 23 (Pictorius-Berufskolleg)' },
  '044': { street: 'Gerhard-Boeden-Straße (Alfred-Engel-Sportanlage)' },
  '057': { street: 'Buscher Straße (Sportanlage Breitscheid)', latitude: 50.859263, longitude: 7.304406 },
  '061': { street: 'Heinrich-Pachl-Platz (Ecke Mauenheimer Straße / Niehler Kirchweg)' },
  '077': { street: 'Hollich 156B (Bagnoquadrat)', latitude: 52.13919, longitude: 7.35807 },
  176: { street: 'Grenzlandstadion, hinter der Haupttribüne' },
  // Der zweite Platz Van-den-Bergh-Str. 51a ist die Anlage des BV DJK Kellen (VKZ 172).
  102: { street: 'Flutstraße 1a' },
  // Laut Verband „Kein Boule-Platz, nur Ortskennzeichnung“.
  120: null,
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

const decodeEntities = (value) => String(value ?? '')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replaceAll('&nbsp;', ' ').replaceAll('&quot;', '"').replaceAll('&#039;', "'").replaceAll('&amp;', '&');
const clean = (value) => decodeEntities(String(value ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const key = (name) => clean(name).toLowerCase();
const quote = (value) => (value === null || value === undefined || value === '' ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);

function url(value) {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.includes('.') ? parsed.href : null;
  } catch { return null; }
}

async function fetchText(source, encoding = 'utf-8') {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  return new TextDecoder(encoding).decode(await response.arrayBuffer()).replace(/^﻿/, '');
}

// Vereinsliste: je Verein eine Kopfzeile (Ort | Name mit Website-Link | öffentliche E-Mail), gefolgt von Zeilen
// „Vereinskennzahl“, „Vereinskurzname“, „Bouleplatz“.
function parseList(html) {
  const clubs = new Map();
  let current = null;
  for (const [, row] of html.matchAll(/<tr>(.*?)<\/tr>/gs)) {
    const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((match) => match[1]);
    if (cells.length >= 3 && row.includes('bigschrift0')) {
      current = {
        name: clean(cells[1]),
        website: cells[1].match(/href="(https?:\/\/[^"]+)"/)?.[1] ?? null,
        email: row.match(/mailto:([^"]+)"/)?.[1] ?? null,
      };
    } else if (current && cells.length >= 3 && clean(cells[1]) === 'Vereinskennzahl:') {
      clubs.set(clean(cells[2]), current);
    }
  }
  return clubs;
}

// KML-Beschreibung: „VKZ: 002<br>Verein: …<br>PLZ: …<br>Ort: …<br>Bouleplatz: …<br>Koordinaten: …<br>Bezirk: …“.
function parseKml(kml) {
  const pins = new Map();
  for (const [, placemark] of kml.matchAll(/<Placemark>(.*?)<\/Placemark>/gs)) {
    const description = placemark.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s)?.[1] ?? '';
    const fields = Object.fromEntries(description.split(/<br\s*\/?>/).map((part) => {
      const [label, ...rest] = part.split(':');
      return [clean(label), clean(rest.join(':'))];
    }));
    const [longitude, latitude] = (placemark.match(/<coordinates>\s*([^<]+?)\s*<\/coordinates>/)?.[1] ?? '').split(',').map(Number);
    if (fields.VKZ) pins.set(fields.VKZ, { street: fields.Bouleplatz, postcode: fields.PLZ, city: fields.Ort, latitude, longitude });
  }
  return pins;
}

// Logos liegen als ligalogos/…/08-<VKZ>_k.<ext>; nur Bildformate übernehmen (manche Einträge sind PDF/DOCX).
function parseLogos(json) {
  const logos = new Map();
  for (const entry of JSON.parse(json)) {
    const path = clean(entry.picture).replace(/^(\.\.\/)+/, '');
    const vkz = path.match(/08-(\d{3})_k\.(png|jpe?g|gif)$/i)?.[1];
    if (vkz && path.startsWith('Image/')) logos.set(vkz, new URL(path, IMAGE_BASE).href);
  }
  return logos;
}

const list = parseList(await fetchText(LIST_URL, 'windows-1252'));
const pins = parseKml(await fetchText(KML_URL));
const logos = parseLogos(await fetchText(LOGOS_URL));
if (list.size < 100 || pins.size < 100) throw new Error(`Vereinsliste/-karte unvollständig (${list.size}/${pins.size} Vereine) – Seitenaufbau geändert?`);

const [owner] = query("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
if (!owner) throw new Error('Kein Admin-Konto als Owner gefunden.');
// In JS normalisieren: SQLites lower() lässt Umlaute wie Ö groß.
const existing = new Set(query('SELECT name FROM clubs').map((row) => key(row.name)));

const status = args.has('--publish') ? 'published' : 'pending';
const now = new Date().toISOString();
const statements = [];
const skipped = [];
const withoutPlace = [];
const checklist = [];
let placeCount = 0;

for (const [vkz, club] of list) {
  const name = NAME_FIXES[vkz] ?? club.name;
  if (existing.has(key(name))) {
    skipped.push(name);
    continue;
  }
  const clubId = crypto.randomUUID();
  const websiteUrl = vkz in WEBSITE_FIXES ? WEBSITE_FIXES[vkz] : url(club.website);
  statements.push(
    'INSERT OR IGNORE INTO clubs (id, name, kind, description, website_url, logo_url, social_links, member_of, contact_name, contact_email, contact_phone, status, owner_id, created_at, updated_at) '
    + `VALUES (${quote(clubId)}, ${quote(name)}, 'club', NULL, ${quote(websiteUrl)}, ${quote(logos.get(vkz))}, '{}', ${quote(JSON.stringify(MEMBER_OF))}, NULL, ${quote(club.email)}, NULL, ${quote(status)}, ${quote(owner.id)}, ${quote(now)}, ${quote(now)});`,
  );

  // Ohne Kartenpin (Platz „folgt“) oder ausdrücklich ohne Platz: Verein ohne Platz anlegen.
  if (PLACE_FIXES[vkz] === null || !pins.has(vkz)) {
    withoutPlace.push(name);
    continue;
  }
  const { street, postcode, city, latitude, longitude } = { ...pins.get(vkz), ...PLACE_FIXES[vkz] };
  const address = [street, [postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  checklist.push([vkz, name, address, latitude, longitude].join(' | '));
  // Vereinsplätze nur anlegen, wenn der Verein in diesem Lauf wirklich neu entstanden ist (kein verwaister Platz).
  statements.push(
    'INSERT INTO boule_places (id, club_id, club_name, name, address, latitude, longitude, venue_type, court_count, description, accessible, facility_codes, status, reported_by_user_id, address_unverified, created_at, updated_at) '
    + `SELECT ${quote(crypto.randomUUID())}, ${quote(clubId)}, NULL, ${quote(name)}, ${quote(address)}, ${latitude}, ${longitude}, 'outdoor', 0, NULL, 0, '[]', ${quote(status)}, NULL, 1, ${quote(now)}, ${quote(now)} `
    + `WHERE EXISTS (SELECT 1 FROM clubs WHERE id = ${quote(clubId)}) AND NOT EXISTS (SELECT 1 FROM boule_places WHERE lower(trim(name)) = lower(trim(${quote(name)})) AND lower(trim(address)) = lower(trim(${quote(address)})) AND venue_type = 'outdoor');`,
  );
  placeCount += 1;
}

const newClubs = list.size - skipped.length;
console.log(`${list.size} Vereine, ${pins.size} Kartenpins, ${logos.size} Logos: ${newClubs} neu, ${placeCount} Plätze, ${skipped.length} übersprungen.`);
if (withoutPlace.length) console.log(`Ohne Platz: ${withoutPlace.join('; ')}`);
if (skipped.length) console.log(`Übersprungen (bereits vorhanden): ${skipped.join('; ')}`);
if (statements.length === 0) process.exit(0);
if (args.has('--checklist')) console.log(checklist.join('\n'));

const file = join(mkdtempSync(join(tmpdir(), 'ptm-bpvnrw-clubs-')), 'import.sql');
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
