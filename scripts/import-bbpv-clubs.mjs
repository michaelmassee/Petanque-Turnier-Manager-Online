// Importiert die Mitgliedsvereine des Boule, Boccia und Pétanque Verbands Baden-Württemberg (BBPV) als Organisationen
// zur Moderation. Quelle: petanque-bw.de/service/vereinsregister/ bettet nur die DPV-Vereinskarte ein, deren Daten in
// VEREINE_URL liegen. Die Karte hat meist Breite und Länge vertauscht, Ort/Adresse in wechselnden Formaten und für
// mehrere Einträge eines Vereins dieselbe Koordinate – geprüfte Korrekturen stehen in PLACE_FIXES und EXTRA_PLACES.
// Vereine werden mit Owner = Admin und Status 'pending' angelegt.
//
//   node scripts/import-bbpv-clubs.mjs --local            # SQL erzeugen und anzeigen
//   node scripts/import-bbpv-clubs.mjs --local --apply    # zusätzlich ausführen
//   node scripts/import-bbpv-clubs.mjs --remote --apply   # Produktion
//
// Idempotent: vorhandene Vereine (gleicher Name) und Plätze (gleicher Name, Adresse, Typ) werden übersprungen.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VEREINE_URL = 'https://dpvserver.de/bbpv/web/vmap2/src/vereine.json';
const IMAGE_BASE = 'https://dpvserver.de/bbpv/';
const MEMBER_OF = ['Boule, Boccia und Pétanque Verband Baden-Württemberg'];
// Vorerst nicht importieren: Vinomna sitzt in Rankweil (Vorarlberg, Österreich); Vereine ohne Straßenangabe, deren
// Spielort nur als Ortsmitte bekannt ist; Vereine, deren Hauptsparte kein Boule ist und deren Mitgliedschaft erst geprüft wird.
const EXCLUDED = new Set([
  'club pétanque vinomna',
  // Nur Ortsmitte bekannt.
  'bte bönnigheim e.v.', 'bc sandhofen e.v.', 'tv 1900 oberhausen e.v.', 'pétanque club bâtard neckargerach e.v.',
  'tg laudenbach 1889 e.v.', 'club bouliste sigmaringen e.v.', 'sv hardt e.v.', 'vfb neuffen e.v.',
  'bc pfullinger leg- und schießgesellschaft e.v.', 'pétanque-club aalen e.v.', 'sport- und kulturverein erligheim e.v.',
  'boule-club öhringen e.v.', 'tv ersingen e.v.', 'bc 1991 boulin rouge straubenhardt-karlsbad e.v.',
  'boule für alle ötisheim e.v.', 'erster boule club karlsruhe e.v.', 'sv karlsruhe-beiertheim 1884/98 e.v.',
  'bc durmersheim e.v.', 'fv viktoria 1927 ubstadt e.v.', 'bc fessenbacchus offenburg e.v.',
  'boulefreunde mundelfingen e.v.', 'bbbc singen e.v.', 'tsv alemannia freiburg-zähringen e.v.',
  'badischer pétanque-verein freiburg e.v.', 'boule13waldkirch e.v.', 'bsg le cochonnet schopfheim e.v.',
  'psg friedrichshafen e.v.', 'terra libre ravensburg e.v.', 'bv grenzbach e.v.', 'boule club meßkirch ohne ehrgeiz e.v.',
  'latschari-boule gutach e.v.',
  // Hauptsparte kein Boule.
  'skiclub hockenheim e.v.', 'tennis-club st. leon 1971 e.v.', 'tc ludwigsburg e.v.', 'tc 88 hambrücken e.v.',
  'waldheimverein backnang e.v.', 'ttc-gnadental e.v.', 'naturbad sulz e.v.', 'schützenverein altheim e.v.',
  'karlsruher fussballverein e.v.', 'fv grünwinkel 1910 e.v.',
]);
// Tippfehler in Website-Adressen.
const URL_FIXES = { 'tgs-pfotzheim.de': 'tgs-pforzheim.de' };
// Tote, verkaufte oder fremde Websites.
const BAD_WEBSITES = ['bouleclub-plochingen.de'];
// Geprüfte Spielorte (Nominatim/Vereinswebsite) je Verein, wo Ort, Straße oder Kartenkoordinate falsch oder nur die
// Ortsmitte ist. Angegebene Felder ersetzen die Kartenwerte; null = Verein ohne Platz anlegen, weil der Spielort unklar ist.
const PLACE_FIXES = {
  // Hausnummer- bzw. Vereinstreffer per Nominatim, Kartenkoordinate war Orts- oder Stadtteilmitte.
  'psg mannheim e.v.': { latitude: 49.4473549, longitude: 8.4724165 },
  'tsv badenia feudenheim': { latitude: 49.4849692, longitude: 8.5162493 },
  'sportclub blumenau e.v.': { latitude: 49.5620757, longitude: 8.4785258 },
  'tv 1877 ma-waldhof e.v.': { latitude: 49.5347095, longitude: 8.4803648 },
  'allstars rhein-neckar schwetzingen e.v.': { latitude: 49.3884522, longitude: 8.5706947 },
  'tsv 1898 wiesental e.v.': { latitude: 49.2300332, longitude: 8.5263816 },
  'wagbach-bouler altlußheim 2020 e.v.': { latitude: 49.2871875, longitude: 8.4963473 },
  'tsg rohrbach e.v': { latitude: 49.3760319, longitude: 8.6770696 },
  'les boulevardiers e.v.': { latitude: 49.3484834, longitude: 8.7534221 },
  'sc käfertal e.v.': { latitude: 49.5148276, longitude: 8.5049137 },
  'bc stahlbad weinheim e.v.': { latitude: 49.5441384, longitude: 8.6505672 },
  'zbb weinheim e.v.': { latitude: 49.5286395, longitude: 8.6432799 },
  'tsv stuttgart-münster e.v.': { latitude: 48.8173161, longitude: 9.2226261 },
  'bc leinfelden-echterdingen e.v.': { latitude: 48.688304, longitude: 9.1387469 },
  'vfl sindelfingen 1862 e.v.': { latitude: 48.714459, longitude: 8.9862409 },
  'psg kdiav 1995 e.v. steinenbronn': { latitude: 48.6569848, longitude: 9.1124198 },
  'boulefreunde waiblingen e.v.': { latitude: 48.823211, longitude: 9.3321792 },
  'fsv waiblingen e.v.': { latitude: 48.823211, longitude: 9.3321792 },
  'sportverein weilheim e.v.': { latitude: 48.4896399, longitude: 9.0317794 },
  'lfj tübingen e.v.': { latitude: 48.5121626, longitude: 9.078315 },
  'pétanque club burggarten horb e.v.': { latitude: 48.4477916, longitude: 8.6701042 },
  'wolpertinger sport- und freizeitclub e.v. gönningen': { latitude: 48.4048701, longitude: 9.1844593 },
  'bc plochingen le cochonnet e.v.': { latitude: 48.7195749, longitude: 9.4022135 },
  'tv hochdorf 1889 e.v.': { street: 'Jahnstraße 8', postcode: '73269', city: 'Hochdorf', latitude: 48.6945928, longitude: 9.4674565 },
  'pc kugelhupf ellwangen e.v.': { latitude: 48.9611881, longitude: 10.1346985 },
  '1. bc happy metal heubach e.v.': { latitude: 48.7861724, longitude: 9.9439059 },
  'boule-sport-club sattelbach e.v.': { latitude: 49.4120079, longitude: 9.1737481 },
  'bsc neunkirchen e.v.': { street: 'Am Kriegwald', latitude: 49.3977141, longitude: 9.0077942 },
  'tgs pforzheim 1895 e.v.': { latitude: 48.9058277, longitude: 8.7160314 },
  'tv 1880 brötzingen e.v.': { latitude: 48.8881837, longitude: 8.6627932 },
  '1. fc steinegg bietbouler e.v.': { latitude: 48.8162239, longitude: 8.7966188 },
  'tsv grünwinkel 1862 e.v.': { city: 'Karlsruhe', latitude: 49.0003588, longitude: 8.3518322 },
  'tus neureut e.v.': { latitude: 49.0421295, longitude: 8.3661303 },
  'tus 1874 rüppur e.v.': { latitude: 48.9738282, longitude: 8.4173855 },
  'sg rüppurr e.v.': { latitude: 48.9689474, longitude: 8.3897376 },
  'tv ettlingenweier e.v.': { latitude: 48.9262774, longitude: 8.3802822 },
  'bsg wilde 13 stutensee e.v.': { latitude: 49.0680322, longitude: 8.4790265 },
  'boule-club rastatt e.v.': { latitude: 48.8339203, longitude: 8.1970238 },
  'vfr rheinsheim 1945 e.v.': { latitude: 49.2288535, longitude: 8.4011856 },
  'bühler boule-club e.v.': { latitude: 48.6887207, longitude: 8.1253824 },
  'pc gottmadingen 2015 e.v.': { latitude: 47.7392194, longitude: 8.7801909 },
  'deutsch-französischer club radolfzell e.v.': { latitude: 47.7528309, longitude: 8.9276515 },
  'bc cochonnet tuttlingen e.v.': { city: 'Tuttlingen', latitude: 47.9804967, longitude: 8.800518 },
  'tsv rottweil-bühlingen': { latitude: 48.1455005, longitude: 8.624796 },
  'bouleclub zimmern e.v.': { latitude: 48.16867, longitude: 8.574815 },
  'sportbund sonnland e.v.': { latitude: 48.0056381, longitude: 7.8082718 },
  'boule 95 denzlingen e.v.': { latitude: 48.0638746, longitude: 7.9089939 },
  'p&bc march e.v.': { latitude: 48.0593109, longitude: 7.7823162 },
  'djk feldkirch e.v.': { latitude: 47.9325958, longitude: 7.6525518 },
  'turnerbund emmendingen 1844 e.v.': { latitude: 48.120642, longitude: 7.8383247 },
  'boulefreunde rheinhausen 2010 e.v.': { latitude: 48.2399444, longitude: 7.7108669 },
  'boule-club friedrichshafen e.v.': { latitude: 47.6663313, longitude: 9.4526756 },
  'tsv lindau von 1850 e.v.': { latitude: 47.570758, longitude: 9.676262 },
  'bc weingarten e.v.': { latitude: 47.79613, longitude: 9.6348736 },
  'petanque club biberach e.v.': { latitude: 48.0994479, longitude: 9.7819293 },
  'boule freaks überlingen e.v.': { latitude: 47.7606829, longitude: 9.1980772 },
  'ssv neureut 1982 e.v.': { latitude: 49.0635346, longitude: 8.3810252 },
  // Einzeln geprüft (Vereinswebsite, OSM-Bouleplatz, Straßentreffer).
  'die nebenbouler aus nußloch e.v.': { street: 'Freizeitgelände Am WiesenTreff', latitude: 49.3191132, longitude: 8.6873791 },
  'boule-club stuttgart e.v.': { street: 'Schlossplatz', postcode: '70173', city: 'Stuttgart', latitude: 48.7775803, longitude: 9.1800535 },
  'sv perouse 1963 e.v.': { latitude: 48.8110883, longitude: 8.896105 },
  '1. pc rugeler reutlingen e.v.': { street: 'Rudolf-Harbig-Straße 10', latitude: 48.4727961, longitude: 9.1914514 },
  'ortsgemeinschaft großdeinbach e.v.': { street: 'Albert-Schweitzer-Straße', city: 'Schwäbisch Gmünd-Großdeinbach', latitude: 48.817669, longitude: 9.757109 },
  'cp l7p schorndorf e.v.': { street: 'Heinkelstraße', latitude: 48.807975, longitude: 9.5358104 },
  'stadtpark bouler welzheim e.v.': { latitude: 48.8631776, longitude: 9.6345655 },
  'pétanque-club meckesheim e.v.': { street: 'Lagerhausstraße', latitude: 49.318416, longitude: 8.817951 },
  '1. bc eggenstein e.v.': { street: 'Am Hardtwald 6', city: 'Eggenstein-Leopoldshafen', latitude: 49.075517, longitude: 8.408722 },
  'boule-club rheinau 1998 e.v.': { street: 'Sportplatz Honau', latitude: 48.642202, longitude: 7.863832 },
  'sg wiehre freiburg e.v.': { latitude: 47.983001, longitude: 7.853962 },
  'boule-club lindenberg e.v': { latitude: 47.596739, longitude: 9.881662 },
  'ssv ulm 1846 e.v.': { street: 'Stadionstraße', postcode: '89073', city: 'Ulm', latitude: 48.402363, longitude: 10.009337 },
  'kdrei e.v. frickenhausen': { street: 'Gartenstraße 12', latitude: 48.593963, longitude: 9.362256 },
  'naturboulefreunde ruit e.v.': { street: 'Kirchheimer Straße 123', latitude: 48.7264875, longitude: 9.2628248 },
  // Nur Postfach und Stadtmitte bekannt.
  'bffl stuttgart e.v.': null,
  'djk villingen e.v.': null,
  // Nur Ort/PLZ falsch oder unvollständig, Koordinate passt.
  'heidelberger boule-spieler e.v.': { city: 'Heidelberg' },
  'boule freunde wiesloch e.v.': { city: 'Wiesloch' },
  'bouleclub weisweil e.v.': { city: 'Weisweil' },
  'sportfreunde friechrichshafen e.v.': { city: 'Friedrichshafen' },
};
// Weitere Spielorte eines Vereins (index = Karteneintrag innerhalb des Vereins). Halle → Indoor-Platz des Vereins,
// anderes Gelände → eigenständiger Platz. Alle übrigen Mehrfacheinträge werden zum Hauptplatz zusammengeführt.
const EXTRA_PLACES = {
  'boule-club stuttgart e.v.': [{
    index: 2, venueType: 'indoor',
    fix: { street: 'Lohäckerstraße 11/1', postcode: '70567', city: 'Stuttgart', latitude: 48.718437, longitude: 9.146854 },
  }],
  'naturboulefreunde ruit e.v.': [{
    index: 0, independent: true, name: 'Naturboulefreunde Ruit – Turnierplatz Scharnhauser Park',
    fix: { street: 'Gerhard-Koch-Straße / Reinachweg', latitude: 48.7227, longitude: 9.2716 },
  }],
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
  // Doppelte Schemata ("http://https://…") auf das letzte kürzen; manche Vereinsseiten laufen nur über http.
  const raw = clean(value).replace(/^(?:https?:\/\/)+(https?:\/\/)/i, '$1');
  if (!raw) return null;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    parsed.hostname = URL_FIXES[parsed.hostname] ?? parsed.hostname;
    const host = parsed.hostname.replace(/^www\./, '');
    if (!['http:', 'https:'].includes(parsed.protocol) || !host.includes('.') || BAD_WEBSITES.includes(host)) return null;
    return parsed.href;
  } catch { return null; }
}

function logo(picture) {
  const path = clean(picture).replace(/^(\.\.\/)+/, '');
  return path.startsWith('Image/') && /\.(png|jpe?g|gif)$/i.test(path) ? new URL(path, IMAGE_BASE).href : null;
}

// Ort-Feld: "(68766) Hockenheim", "68259 Mannheim", "/4357 Bönnigheim", "69121", "Aichelberg" oder mit Zusatz nach
// Komma/Schrägstrich ("73760 Ostfildern, Kirchheimerstr. 123"). Der Zusatz dient als Straße, wenn address leer ist.
function location(entry) {
  const [, postcode = '', city = '', extra = ''] = clean(entry.Ort).match(/^[(/]?(\d{5})?\)?\s*([^,/]*?)\s*(?:[,/]\s*(.*))?$/) ?? [];
  // address enthält teils schon "Straße, PLZ Ort".
  const street = clean(entry.address).replace(/,?\s*\d{5}\s+[^,]*$/, '') || extra;
  return { street, postcode, city };
}

// Alle BBPV-Vereine liegen in Baden-Württemberg bzw. im angrenzenden Allgäu. Die meisten Quelleinträge haben Breite und
// Länge vertauscht.
const inBw = (latitude, longitude) => latitude >= 47.4 && latitude <= 49.9 && longitude >= 7.4 && longitude <= 10.6;

function coordinates(entry) {
  const latitude = Number(entry.location?.latitude); const longitude = Number(entry.location?.longitude);
  if (inBw(latitude, longitude)) return { latitude, longitude };
  if (inBw(longitude, latitude)) return { latitude: longitude, longitude: latitude };
  return { latitude: null, longitude: null };
}

function placeDescription(entries) {
  const parts = [...new Set(entries.map((entry) => multiline(entry.about)).filter(Boolean))];
  const training = [...new Set(entries.map((entry) => multiline(entry.Trainingszeiten)).filter(Boolean))];
  if (training.length) parts.push(`Trainingszeiten: ${training.join('\n')}`);
  return parts.join('\n\n') || null;
}

const response = await fetch(VEREINE_URL);
if (!response.ok) throw new Error(`${VEREINE_URL}: HTTP ${response.status}`);
const entries = JSON.parse((await response.text()).replace(/^﻿/, ''))
  .filter((entry) => !EXCLUDED.has(key(entry.name)));

const groups = new Map();
for (const entry of entries) {
  const name = clean(entry.name);
  if (!groups.has(key(name))) groups.set(key(name), { name, entries: [] });
  groups.get(key(name)).entries.push(entry);
}
if (groups.size < 100) throw new Error(`Vereinskarte unvollständig (${groups.size} Vereine) – Datenaufbau geändert?`);

const [owner] = query("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
if (!owner) throw new Error('Kein Admin-Konto als Owner gefunden.');
// In JS normalisieren: SQLites lower() lässt Umlaute wie Ö groß.
const existing = new Set(query('SELECT name FROM clubs').map((row) => key(row.name)));

const now = new Date().toISOString();
const statements = [];
const skipped = [];
const withoutPlace = [];
const checklist = [];
let placeCount = 0;

// Spielort aus Karteneinträgen und Korrektur: Straße aus dem ersten Eintrag, der eine hat.
function place(placeEntries, fix = {}) {
  const parsed = placeEntries.map(location);
  const { street, postcode, city } = { ...(parsed.find((item) => item.street) ?? parsed[0]), ...fix };
  const address = [street, [postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const { latitude, longitude } = fix.latitude !== undefined ? fix : coordinates(placeEntries[0]);
  return { address, latitude, longitude };
}

function insertPlace({ clubId, clubName, name, venueType = 'outdoor', placeEntries, fix }) {
  const { address, latitude, longitude } = place(placeEntries, fix);
  checklist.push([name, venueType, address, latitude, longitude].join(' | '));
  // Vereinsplätze nur anlegen, wenn der Verein in diesem Lauf wirklich neu entstanden ist (kein verwaister Platz).
  const clubCondition = `EXISTS (SELECT 1 FROM clubs WHERE id = ${quote(clubId)})`;
  statements.push(
    'INSERT INTO boule_places (id, club_id, club_name, name, address, latitude, longitude, venue_type, court_count, description, accessible, facility_codes, status, reported_by_user_id, address_unverified, created_at, updated_at) '
    + `SELECT ${quote(crypto.randomUUID())}, ${clubName ? 'NULL' : quote(clubId)}, ${quote(clubName)}, ${quote(name)}, ${quote(address)}, ${latitude ?? 'NULL'}, ${longitude ?? 'NULL'}, ${quote(venueType)}, 0, ${quote(placeDescription(placeEntries))}, 0, '[]', 'pending', ${clubName ? quote(owner.id) : 'NULL'}, 1, ${quote(now)}, ${quote(now)} `
    + `WHERE ${clubCondition} AND NOT EXISTS (SELECT 1 FROM boule_places WHERE lower(trim(name)) = lower(trim(${quote(name)})) AND lower(trim(address)) = lower(trim(${quote(address)})) AND venue_type = ${quote(venueType)});`,
  );
  placeCount += 1;
}

for (const [groupKey, group] of groups) {
  if (existing.has(groupKey)) {
    skipped.push(group.name);
    continue;
  }
  const clubId = crypto.randomUUID();
  const description = multiline(group.entries.map((entry) => entry.Beschreibung).find((text) => clean(text)));
  const contactEmail = clean(group.entries.map((entry) => entry.email).find((email) => clean(email)));
  const websiteUrl = group.entries.map((entry) => url(entry.Homepage)).find(Boolean) || null;
  const logoUrl = group.entries.map((entry) => logo(entry.picture)).find(Boolean) || null;
  statements.push(
    'INSERT OR IGNORE INTO clubs (id, name, kind, description, website_url, logo_url, social_links, member_of, contact_name, contact_email, contact_phone, status, owner_id, created_at, updated_at) '
    + `VALUES (${quote(clubId)}, ${quote(group.name)}, 'club', ${quote(description)}, ${quote(websiteUrl)}, ${quote(logoUrl)}, '{}', ${quote(JSON.stringify(MEMBER_OF))}, NULL, ${quote(contactEmail)}, NULL, 'pending', ${quote(owner.id)}, ${quote(now)}, ${quote(now)});`,
  );

  const extras = EXTRA_PLACES[groupKey] ?? [];
  const extraEntries = extras.map((extra) => group.entries[extra.index]);
  if (PLACE_FIXES[groupKey] === null) withoutPlace.push(group.name);
  else insertPlace({ clubId, name: group.name, placeEntries: group.entries.filter((entry) => !extraEntries.includes(entry)), fix: PLACE_FIXES[groupKey] });
  extras.forEach((extra, position) => insertPlace({
    clubId,
    clubName: extra.independent ? group.name : null,
    name: extra.name ?? group.name,
    venueType: extra.venueType,
    placeEntries: [extraEntries[position]],
    fix: extra.fix,
  }));
}

const newClubs = groups.size - skipped.length;
console.log(`${entries.length} Karteneinträge, ${groups.size} Vereine: ${newClubs} neu, ${placeCount} Plätze, ${skipped.length} übersprungen.`);
if (withoutPlace.length) console.log(`Ohne Platz: ${withoutPlace.join('; ')}`);
if (skipped.length) console.log(`Übersprungen (bereits vorhanden): ${skipped.join('; ')}`);
if (statements.length === 0) process.exit(0);
if (args.has('--checklist')) console.log(checklist.join('\n'));

const file = join(mkdtempSync(join(tmpdir(), 'ptm-bbpv-clubs-')), 'import.sql');
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
