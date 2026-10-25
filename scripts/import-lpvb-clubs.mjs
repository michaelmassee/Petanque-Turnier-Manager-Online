// Importiert die Mitgliedsvereine des Landes-Pétanque-Verbands Berlin (LPVB) als Organisationen. Quelle ist die Liste
// auf petanque-berlin.de/home/mitgliedsvereine (Stand 31.07.2026). Sie nennt Spielorte nur im Fließtext und als
// Anschrift oft c/o-Adressen von Privatpersonen; die geprüften Spielorte stehen darum in CLUBS (Pétanque-Aktuell-Karte,
// Nominatim, Vereinswebsites; Stand 2026-10-25). Das Skript bricht ab, wenn ein Verein nicht mehr auf der Liste steht.
// Vereine werden mit Owner = Admin und Status 'pending' angelegt, mit --publish gleich freigegeben.
//
//   node scripts/import-lpvb-clubs.mjs --local                       # SQL erzeugen und anzeigen
//   node scripts/import-lpvb-clubs.mjs --local --apply               # zusätzlich ausführen
//   node scripts/import-lpvb-clubs.mjs --remote --apply --publish    # Produktion, gleich freigegeben
//
// Idempotent: vorhandene Vereine (gleicher Name) und Plätze (gleicher Name, Adresse, Typ) werden übersprungen.
// Vorerst nicht importiert, weil die Liste keinen Spielort nennt: CHABOULI, Roter Stern Berlin 2012 e.V.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LIST_URL = 'https://petanque-berlin.de/home/mitgliedsvereine';
const MEMBER_OF = ['Landes-Pétanque-Verband Berlin'];
const SAME_GROUND_AS_BCK = 'Spielt auf dem Gelände des 1. BC Kreuzberg am Paul-Lincke-Ufer (Höhe Hausnr. 13), 10999 Berlin.';
// listName: Schreibweise auf der Verbandsseite (zur Prüfung); places: Spielorte (outdoor/indoor), leer = Verein ohne eigenen Platz.
const CLUBS = [
  {
    name: '1. BC Kreuzberg e.V.', listName: '1. BC Kreuzberg', website: 'https://boule-am-ufer.de/vereine/bck/',
    places: [{ street: 'Paul-Lincke-Ufer (Höhe Hausnr. 13)', postcode: '10999', city: 'Berlin-Kreuzberg', latitude: 52.49296, longitude: 13.4325,
      description: 'Offen zugänglicher Platz, gespielt wird täglich ab mittags. Während der Saison freitags abends Supermêlée (offen für alle).' }],
  },
  {
    name: 'Club Bouliste de Berlin e.V.', listName: 'Club Bouliste de Berlin', website: 'https://club-bouliste.de/',
    places: [
      { street: 'Rue Doret 8', postcode: '13405', city: 'Berlin-Tegel', latitude: 52.5689101, longitude: 13.2998887,
        description: 'Privates Gelände, größter Bouleplatz von Berlin. Täglich geöffnet außer montags; samstags ab 14:15 Uhr Doublette Choisie (außer an Turnier- und Ligatagen).' },
      { venueType: 'indoor', street: 'Rue Doret 8', postcode: '13405', city: 'Berlin-Tegel', latitude: 52.5689101, longitude: 13.2998887,
        description: 'Beheizte Halle; im Winter freitags ab 18:30 Uhr Supermêlée.' },
    ],
  },
  {
    name: 'Petanquistan e.V.', listName: 'Petanquistan', website: 'https://www.petanquistan.de/',
    places: [{ street: 'Mauerpark, Terrain libre (nahe Max-Schmeling-Halle)', postcode: '10437', city: 'Berlin-Prenzlauer Berg', latitude: 52.54472, longitude: 13.40236,
      description: 'Bei gutem Wetter täglich, unter der Woche ab ca. 16:30 Uhr, samstags ab ca. 15:30 Uhr, sonntags Supermêlée ab 14:30 Uhr.' }],
  },
  {
    name: 'Saunafreunde Berlin Familiensportverein e.V.', listName: 'Saunafreunde Berlin', website: 'https://saunafreunde-berlin.de/',
    places: [{ street: 'Süderholmer Steig 3', postcode: '13503', city: 'Berlin-Heiligensee', latitude: 52.6064162, longitude: 13.2206955,
      description: 'Vereinsgelände mit 5 Bahnen, in der Regel täglich ab 14 Uhr. Nudistenverein; für Gäste ist eine Tageskarte für die Geländenutzung nötig.' }],
  },
  {
    name: 'au fer Schöneberg e.V.', listName: 'au fer Schöneberg', website: 'http://www.au-fer.de/',
    places: [{ street: 'Naumannpark', postcode: '10829', city: 'Berlin-Schöneberg', latitude: 52.4863, longitude: 13.36267,
      description: 'Offene Gelände. Weitere Spielorte: Rudolph-Wilde-Park (am Goldenen Hirsch) und Park am Gleisdreieck (vor dem TorEins-Parkcafé), dort mittwochs ab ca. 15 Uhr.' }],
  },
  {
    name: 'Zehlendorfer Turn- und Sportverein von 1888 e.V.', listName: 'Zehlendorfer Turn-und Sportverein von 1888', website: 'https://zehlendorf88.de/Boule_News',
    places: [{ street: 'Sven-Hedin-Straße 85', postcode: '14163', city: 'Berlin-Zehlendorf', latitude: 52.44512, longitude: 13.24955 }],
  },
  {
    name: 'Boule-Freunde-Reinickendorf e.V.', listName: 'Boule-Freunde-Reinickendorf', website: 'https://www.boule-freunde-reinickendorf.de/',
    places: [{ street: 'Am Rathauspark 1 (am Rathaus Reinickendorf)', postcode: '13437', city: 'Berlin-Wittenau', latitude: 52.58946, longitude: 13.32341,
      description: 'Gespielt wird bei fast jedem Wetter ab 14 Uhr.' }],
  },
  { name: 'Internationaler Pétanque Club Kreuzberg e.V.', listName: 'Internationaler Pétanque Club Kreuzberg', website: 'https://boule-am-ufer.de/vereine/inter-kreuzberg/', description: SAME_GROUND_AS_BCK, places: [] },
  {
    name: 'boule devant berlin e.V.', listName: 'boule devant berlin', website: 'https://www.boule-devant-berlin.de/',
    places: [{ street: 'Zillestraße 114 (Vereinsgelände „bdb_la place“)', postcode: '10585', city: 'Berlin-Charlottenburg', latitude: 52.5138, longitude: 13.29795,
      description: 'Privates Gelände, kein öffentlicher Bouleplatz; Gäste können zum Kennenlernen mitspielen. Im Sommer täglich ab dem späten Nachmittag.' }],
  },
  { name: 'Boule 36 e.V.', listName: 'Boule 36', website: 'https://boule-am-ufer.de/vereine/boule-36', description: SAME_GROUND_AS_BCK, places: [] },
  {
    name: 'kreativ e.V.', listName: 'kreativ e. V.', website: 'https://www.kreativ-ev.de/',
    places: [{ street: 'Dorfstraße 7', postcode: '14621', city: 'Schönwalde-Glien', latitude: 52.61659, longitude: 13.12572,
      description: 'Privates Gelände mit 6 Bahnen. Training donnerstags ab 14 Uhr.' }],
  },
  {
    name: 'SSC Inkognito 12 Berlin e.V.', listName: 'SSC Inkognito 12 Berlin', website: 'https://inkognito12.jimdofree.com/',
    places: [{ street: 'Stadion Buschallee (Eingang Gierstraße)', postcode: '13053', city: 'Berlin-Weißensee', latitude: 52.554321, longitude: 13.4856515,
      description: 'Training mittwochs um 17 Uhr; nach Absprache auch donnerstags im Wröhmännerpark in Spandau.' }],
  },
  {
    name: 'Sportvereinigung der Senatsverwaltungen e.V.', listName: 'Sportvereinigung der Senatsverwaltungen', website: 'https://sv-senat-e-v-2.jimdosite.com/',
    places: [{ street: 'Köllnischer Park (Eingang gegenüber Am Köllnischen Park 3)', postcode: '10179', city: 'Berlin-Mitte', latitude: 52.5127, longitude: 13.41548,
      description: 'Mittwochs 16–19 Uhr; Interessierte können gerne mitspielen.' }],
  },
  { name: 'Madagasikara Sozialsportverein Deutschland -MSD- e.V.', listName: 'Madagasikara Sozialsportverein', website: null, description: SAME_GROUND_AS_BCK, places: [] },
  {
    name: 'SV Grün-Weiss Brieselang e.V.', listName: 'SV Grün-Weiss Brieselang', website: 'http://sv-gruen-weiss-brieselang.de/',
    places: [{ street: 'Karl-Marx-Straße 198', postcode: '14656', city: 'Brieselang', latitude: 52.5936093, longitude: 12.9890499 }],
  },
];

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
const key = (name) => clean(name).toLowerCase();
const quote = (value) => (value === null || value === undefined || value === '' ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);

// Die Verbandsliste muss jeden Verein noch führen (sonst ausgetreten oder umbenannt → CLUBS prüfen).
const response = await fetch(LIST_URL);
if (!response.ok) throw new Error(`${LIST_URL}: HTTP ${response.status}`);
const listText = clean((await response.text()).replace(/<[^>]*>/g, ' ').replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&'));
const missing = CLUBS.filter((club) => !listText.includes(club.listName)).map((club) => club.name);
if (missing.length) throw new Error(`Nicht mehr auf der Verbandsliste: ${missing.join('; ')}`);

const [owner] = query("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
if (!owner) throw new Error('Kein Admin-Konto als Owner gefunden.');
// In JS normalisieren: SQLites lower() lässt Umlaute wie Ö groß.
const existing = new Set(query('SELECT name FROM clubs').map((row) => key(row.name)));

const status = args.has('--publish') ? 'published' : 'pending';
const now = new Date().toISOString();
const statements = [];
const skipped = [];
const checklist = [];
let placeCount = 0;

for (const club of CLUBS) {
  if (existing.has(key(club.name))) {
    skipped.push(club.name);
    continue;
  }
  const clubId = crypto.randomUUID();
  statements.push(
    'INSERT OR IGNORE INTO clubs (id, name, kind, description, website_url, logo_url, social_links, member_of, contact_name, contact_email, contact_phone, status, owner_id, created_at, updated_at) '
    + `VALUES (${quote(clubId)}, ${quote(club.name)}, 'club', ${quote(club.description)}, ${quote(club.website)}, NULL, '{}', ${quote(JSON.stringify(MEMBER_OF))}, NULL, NULL, NULL, ${quote(status)}, ${quote(owner.id)}, ${quote(now)}, ${quote(now)});`,
  );
  for (const { venueType = 'outdoor', street, postcode, city, latitude, longitude, description } of club.places) {
    const address = `${street}, ${postcode} ${city}`;
    checklist.push([club.name, venueType, address, latitude, longitude].join(' | '));
    // Vereinsplätze nur anlegen, wenn der Verein in diesem Lauf wirklich neu entstanden ist (kein verwaister Platz).
    statements.push(
      'INSERT INTO boule_places (id, club_id, club_name, name, address, latitude, longitude, venue_type, court_count, description, accessible, facility_codes, status, reported_by_user_id, address_unverified, created_at, updated_at) '
      + `SELECT ${quote(crypto.randomUUID())}, ${quote(clubId)}, NULL, ${quote(club.name)}, ${quote(address)}, ${latitude}, ${longitude}, ${quote(venueType)}, 0, ${quote(description)}, 0, '[]', ${quote(status)}, NULL, 1, ${quote(now)}, ${quote(now)} `
      + `WHERE EXISTS (SELECT 1 FROM clubs WHERE id = ${quote(clubId)}) AND NOT EXISTS (SELECT 1 FROM boule_places WHERE lower(trim(name)) = lower(trim(${quote(club.name)})) AND lower(trim(address)) = lower(trim(${quote(address)})) AND venue_type = ${quote(venueType)});`,
    );
    placeCount += 1;
  }
}

console.log(`${CLUBS.length} Vereine: ${CLUBS.length - skipped.length} neu, ${placeCount} Plätze, ${skipped.length} übersprungen.`);
if (skipped.length) console.log(`Übersprungen (bereits vorhanden): ${skipped.join('; ')}`);
if (statements.length === 0) process.exit(0);
if (args.has('--checklist')) console.log(checklist.join('\n'));

const file = join(mkdtempSync(join(tmpdir(), 'ptm-lpvb-clubs-')), 'import.sql');
writeFileSync(file, `${statements.join('\n')}\n`);
console.log(`SQL: ${file}`);

if (args.has('--apply')) {
  const counts = () => query("SELECT (SELECT COUNT(*) FROM clubs) AS clubs, (SELECT COUNT(*) FROM boule_places) AS places, (SELECT COUNT(*) FROM tournaments) AS tournaments")[0];
  const before = counts();
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', target, '--yes', '--file', file], { stdio: 'inherit' });
  const after = counts();
  console.log(`Vorher: ${JSON.stringify(before)}`);
  console.log(`Nachher: ${JSON.stringify(after)}`);
  if (after.tournaments !== before.tournaments) process.exit(1);
}
