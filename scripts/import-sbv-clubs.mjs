// Importiert die Mitgliedsvereine des Saarländischen Boule-Verbands (SBV) als Organisationen. Quelle ist die
// Vereinsliste auf petanque-sbv.de (LIST_URL) mit je einer Vereinsseite (Vereinskennzahl, Sportanlage, Website). Die
// Sportanlage steht dort nur als Beschreibung („Kirchstr. / Nähe Schule“); jeder Verein hat darum in PLACES einen
// geprüften Spielort (Pétanque-Aktuell-Karte, Nominatim; Stand 2026-10-25). Vereinsanschriften sind Privatpersonen und
// werden nicht übernommen. Vereine werden mit Owner = Admin und Status 'pending' angelegt, mit --publish gleich freigegeben.
//
//   node scripts/import-sbv-clubs.mjs --local                       # SQL erzeugen und anzeigen
//   node scripts/import-sbv-clubs.mjs --local --apply               # zusätzlich ausführen
//   node scripts/import-sbv-clubs.mjs --remote --apply --publish    # Produktion, gleich freigegeben
//
// Idempotent: vorhandene Vereine (gleicher Name) und Plätze (gleicher Name, Adresse, Typ) werden übersprungen.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LIST_URL = 'https://www.petanque-sbv.de/content/unser-verband/vereine/';
const MEMBER_OF = ['Saarländischer Boule-Verband'];
// Vorerst nicht importieren: Der Verband nennt keine Sportanlage (später mit geprüftem Spielort nachholen). Die
// Boule-Freunde Überherrn gibt es schon als „Boulefreunde Überherrn e.V.“ (von Hand angelegt).
const EXCLUDED = new Set([
  'boule-club hirzweiler "aufer" 2011 e.v.', 'boule-freunde perl-besch e.v.', 'kewelsberg bouler - vfb. tünsdorf 1954 e.v.',
  'boule-freunde überherrn e.v.',
]);
// Vereinswebsites aus der Pétanque-Aktuell-Karte, wo die Vereinsseite des Verbands keine nennt.
const WEBSITES = {
  'boule-club 1966 saarlouis e.v.': 'https://www.boulesaarlouis.de/',
  'boule-club 1987 saarlouis-picard e.v.': 'https://www.boule-club-picard.de/',
  'tsv ford saarlouis-steinrausch fraulautern 1878 e.v.': 'https://www.tsv-ford-steinrausch.de/',
  'rohrer boulefreunde reimsbach e.v.': 'https://www.boulefreundereimsbach.de/',
  'pétanque-club "messidor" saarbrücken e.v.': 'https://www.pc-messidor.de/',
};
// Geprüfter Spielort je Verein (Schlüssel = Vereinsname klein): Pin der Pétanque-Aktuell-Karte, wo er zum Verein und
// zur Verbandsangabe passt, sonst Nominatim-Treffer der Verbandsangabe (Nunkirchen BSG, Rodenhof, Senioren-SG,
// St. Wendel, Hühnerfeld). Dirmingen spielt in der Boulehalle.
const PLACES = {
  'bouchon neunkirchen e.v.': { street: 'Kirkeler Straße (Campingplatz Prießnitz-Kneippverein)', postcode: '66538', city: 'Neunkirchen-Oberstadt', latitude: 49.3266762, longitude: 7.1948889 },
  'boule kg sitterswald': { street: 'Nauwieser Straße (Wanderparkplatz Blies-Grenz-Weg)', postcode: '66271', city: 'Kleinblittersdorf-Sitterswald', latitude: 49.1311797, longitude: 7.0707269 },
  'boule verein dirmingen': { street: 'Hierscheider Straße 2b', postcode: '66571', city: 'Eppelborn-Dirmingen', latitude: 49.4165021, longitude: 7.0106684, venueType: 'indoor' },
  'boule-club 1966 saarlouis e.v.': { street: 'Holtzendorffer Straße / Stadtgarten (Nähe Hallenbad)', postcode: '66740', city: 'Saarlouis', latitude: 49.3194441, longitude: 6.744211 },
  'boule-club 1984 völklingen-fenne': { street: 'Gehlenbrunnenstraße / Am Wasserturm (Gaststätte Tennisplatz)', postcode: '66333', city: 'Völklingen-Wehrden', latitude: 49.2411741, longitude: 6.8172593 },
  'boule-club 1986 großrosseln': { street: 'Kirchstraße / Wilhelm-Heinrich-Weg (Nähe Schule)', postcode: '66352', city: 'Großrosseln', latitude: 49.205933, longitude: 6.8366685 },
  'boule-club 1987 saarlouis-picard e.v.': { street: 'Dorfstraße / Taffingsweg (Dorfplatz)', postcode: '66740', city: 'Saarlouis-Picard', latitude: 49.2987384, longitude: 6.7297492 },
  'boule-club 1994 wemmetsweiler e.v.': { street: 'Kirchhofstraße (Nähe Sportplatz „Lange Gewann“)', postcode: '66589', city: 'Merchweiler-Wemmetsweiler', latitude: 49.3778378, longitude: 7.0864492 },
  'boule-club 1995 hierscheid e.v.': { street: 'Florianweg (Sportplatz)', postcode: '66571', city: 'Eppelborn-Hierscheid', latitude: 49.3976123, longitude: 6.9887494 },
  'boule-club 1995 hüttigweiler e.v.': { street: 'Kiefernweg (oberhalb der Tennisanlage)', postcode: '66557', city: 'Illingen-Hüttigweiler', latitude: 49.393652, longitude: 7.059789 },
  'boule-club asi 1992 merzig e.v.': { street: 'Waldstraße (Nähe Kreisturnhalle)', postcode: '66663', city: 'Merzig', latitude: 49.4552611, longitude: 6.6372909 },
  'boule-club bliesen-winterbach e.v.': { street: 'Im Schuleck (Nähe Mehrzweckhalle)', postcode: '66606', city: 'St. Wendel-Winterbach', latitude: 49.4748792, longitude: 7.0989486 },
  'boule-club lebach e.v.': { street: 'Dillinger Straße / Schlesierallee', postcode: '66822', city: 'Lebach', latitude: 49.4054627, longitude: 6.8968139 },
  'boule-club rehlingen e.v.': { street: 'Neustraße (Nähe Kulturhalle)', postcode: '66780', city: 'Rehlingen', latitude: 49.3765628, longitude: 6.6845165 },
  'boule-club saarwellingen e.v.': { street: 'Im Weidenbruch (Nähe Sportplatz)', postcode: '66793', city: 'Saarwellingen', latitude: 49.3517616, longitude: 6.8011408 },
  'boule-club schiffweiler': { street: 'Krämerbergstraße (Nähe Schützenhaus)', postcode: '66578', city: 'Schiffweiler', latitude: 49.3638207, longitude: 7.1412025 },
  'boule-club siersburg': { street: 'Am Hautzenbuckel (Nähe Stadion)', postcode: '66780', city: 'Rehlingen-Siersburg', latitude: 49.3669569, longitude: 6.6763222 },
  'boule-freunde "schwarze 13" faha e.v.': { street: 'Zur Niederhaardt (Sportplatz)', postcode: '66693', city: 'Mettlach-Faha', latitude: 49.5220782, longitude: 6.4862842 },
  'boule-freunde 1991 schwarzenholz e.v.': { street: 'Forststraße (alter Schulhof, Nähe Schulturnhalle)', postcode: '66793', city: 'Saarwellingen-Schwarzenholz', latitude: 49.3370161, longitude: 6.8682606 },
  'boule-freunde 1997 wustweiler e.v.': { street: 'Lebacher Straße (Nähe Bahnhof)', postcode: '66557', city: 'Illingen-Wustweiler', latitude: 49.3992656, longitude: 7.0349692 },
  'boule-freunde brotdorf e.v.': { street: 'Am alten Bahnhof', postcode: '66663', city: 'Merzig-Brotdorf', latitude: 49.4668193, longitude: 6.6794112 },
  'boule-freunde dudweiler e.v.': { street: 'Rehbachpfad 9 (Heimat- und Kulturverein Dudweiler-Nord)', postcode: '66125', city: 'Saarbrücken-Dudweiler', latitude: 49.28499, longitude: 7.041 },
  'boule-freunde honzrath e.v.': { street: 'Zur Hellwies (Sportzentrum)', postcode: '66701', city: 'Beckingen-Honzrath', latitude: 49.4295548, longitude: 6.7385436 },
  'boule-freunde überherrn e.v.': { street: 'Clasenweg (Richtung Waldstadion)', postcode: '66802', city: 'Überherrn', latitude: 49.236479, longitude: 6.692405 },
  'boule-gemeinschaft homburg': { street: 'Untere Allee (Schulhof des Gymnasiums)', postcode: '66424', city: 'Homburg', latitude: 49.3163756, longitude: 7.3482577 },
  'boule-spielgemeinschaft 1992 nunkirchen e.v.': { street: 'Kleinbahnstraße', postcode: '66687', city: 'Wadern-Nunkirchen', latitude: 49.4916018, longitude: 6.8340367 },
  'boule-spielgemeinschaft eschberg': { street: 'Eschberger Hofplatz', postcode: '66121', city: 'Saarbrücken-Eschberg', latitude: 49.2351341, longitude: 7.0424265 },
  'boule-spielgemeinschaft st. wendel e.v.': { street: 'Auf Dilgeshöh', postcode: '66606', city: 'St. Wendel-Marth', latitude: 49.4724681, longitude: 7.25901 },
  'club bocce 1977 saarlouis e.v.': { street: 'Von-Lettow-Vorbeck-Straße', postcode: '66740', city: 'Saarlouis', latitude: 49.3158732, longitude: 6.7584993 },
  'die outdoor`er st. ingbert e.v.': { street: 'Sportplatzstraße (SKM-Sportplatz)', postcode: '66386', city: 'St. Ingbert-Rohrbach', latitude: 49.2868006, longitude: 7.167418 },
  'djk hühnerfeld e.v. abteilung boule': { street: 'Mellinweg', postcode: '66280', city: 'Sulzbach-Hühnerfeld', latitude: 49.3041812, longitude: 7.0612897 },
  'fußballverein 1907 diefflen e.v.': { street: 'Friedhofsweg (Nähe Stadion „Babelsberg“)', postcode: '66763', city: 'Dillingen-Diefflen', latitude: 49.3723025, longitude: 6.7560442 },
  'gruppo bocce 1998 dillingen': { street: 'Werderstraße 203 (Nähe Stadion „Weißes Kreuz“)', postcode: '66763', city: 'Dillingen', latitude: 49.3615852, longitude: 6.7386198 },
  'hokuta bous e.v. sparte boule': { street: 'oberhalb des Marktplatzes, hinter der Marie-Curie-Schule', postcode: '66359', city: 'Bous', latitude: 49.277932, longitude: 6.7938766 },
  'kraftsportverein 1907 gersweiler e.v.': { street: 'Krughütter Straße (Sportzentrum)', postcode: '66128', city: 'Saarbrücken-Gersweiler', latitude: 49.2311411, longitude: 6.9211047 },
  'pétanque-club "messidor" saarbrücken e.v.': { street: 'Hafenstraße (Bürgerpark)', postcode: '66111', city: 'Saarbrücken-St. Johann', latitude: 49.2381532, longitude: 6.9845723 },
  'pétanque-club 1985 schwalbach e.v.': { street: 'Jahnstraße', postcode: '66773', city: 'Schwalbach', latitude: 49.2952946, longitude: 6.7963022 },
  'pétanque-club 1994 oberthal': { street: 'Schulstraße (Nähe Dorfgemeinschaftshaus)', postcode: '66649', city: 'Oberthal-Gronig', latitude: 49.5105134, longitude: 7.0744751 },
  'pétanque-club hanweiler': { street: 'Am Sportplatz', postcode: '66271', city: 'Kleinblittersdorf-Hanweiler', latitude: 49.1201676, longitude: 7.0490746 },
  'pétanque-club rodenhof saarbrücken': { street: 'Lebacher Straße / Eifelstraße', postcode: '66113', city: 'Saarbrücken-Malstatt', latitude: 49.2534534, longitude: 6.965221 },
  'pétanque-freunde nunkirchen e.v.': { street: 'Weißkircher Straße (Nähe Sportplatz)', postcode: '66687', city: 'Wadern-Nunkirchen', latitude: 49.4923761, longitude: 6.8375918 },
  'pétanque-freunde saarbrücken e.v.': { street: 'Von-der-Heydt-Straße (Nähe Sportplatz)', postcode: '66115', city: 'Saarbrücken-Burbach', latitude: 49.244676, longitude: 6.9539909 },
  'rasenkraftsportverein ensdorf e.v.': { street: 'Im Sportzentrum (Nähe Schwimmbad)', postcode: '66806', city: 'Ensdorf', latitude: 49.3112669, longitude: 6.7868604 },
  'rohrer boulefreunde reimsbach e.v.': { street: 'Zur Plätsch (Nähe Grundschule)', postcode: '66701', city: 'Beckingen-Reimsbach', latitude: 49.4511541, longitude: 6.7645211 },
  'senioren-sportgemeinschaft saarbrücken': { street: 'Provinzialstraße 186 (Schwimmbad-Restaurant)', postcode: '66130', city: 'Saarbrücken-Fechingen', latitude: 49.1909554, longitude: 7.0710593 },
  'ski- und wanderverein kirrberg e.v.': { street: 'L 214 Richtung Zweibrücken (Nähe Ski- und Wanderhütte)', postcode: '66424', city: 'Homburg-Kirrberg', latitude: 49.2841343, longitude: 7.3728064 },
  'sport- und spielvereinigung "eintracht" überherrn e.v.': { street: 'Clasenweg (Parkgelände Waldstadion)', postcode: '66802', city: 'Überherrn', latitude: 49.236479, longitude: 6.692405 },
  'sportverein hülzweiler e.v.': { street: 'Walter-Becker-Weg (Sportzentrum Schachen)', postcode: '66773', city: 'Schwalbach-Hülzweiler', latitude: 49.315538, longitude: 6.8290884 },
  'tc oberlinxweiler': { street: 'Am Tennisplatz', postcode: '66606', city: 'St. Wendel-Oberlinxweiler', latitude: 49.4597742, longitude: 7.1568717 },
  'tennisfreunde 1980 oppen e.v.': { street: 'Kopperweg (Nähe Sportanlagen)', postcode: '66701', city: 'Beckingen-Oppen', latitude: 49.4581353, longitude: 6.7797105 },
  'tsv ford saarlouis-steinrausch fraulautern 1878 e.v.': { street: 'Schwimmbadstraße 56', postcode: '66740', city: 'Saarlouis-Roden', latitude: 49.3333888, longitude: 6.7591052 },
  'turn- und spielverein ottenhausen 1899 e.v.': { street: 'Hauptstraße 200 (hinter Gaststätte „Dersim“)', postcode: '66128', city: 'Saarbrücken-Gersweiler', latitude: 49.2403185, longitude: 6.9150792 },
  'turnverein 1892 schaffhausen e.v.': { street: 'Kreuzgartenstraße (Nähe Sportplatz)', postcode: '66787', city: 'Wadgassen-Schaffhausen', latitude: 49.2584136, longitude: 6.8043997 },
  'turnverein 1901 saarlouis-beaumarais e.v.': { street: 'Bruchwiesenstraße (Nähe Grundschule)', postcode: '66740', city: 'Saarlouis-Beaumarais', latitude: 49.3132259, longitude: 6.7240419 },
  'turnverein niedersalbach e.v.': { street: 'Wolpershofer Straße (Festplatz St. Barbara-Hütte)', postcode: '66265', city: 'Heusweiler-Niedersalbach', latitude: 49.3336623, longitude: 6.9122104 },
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
const key = (name) => clean(name).toLowerCase();
const quote = (value) => (value === null || value === undefined || value === '' ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);


const decode = (value) => String(value ?? '').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replaceAll('&nbsp;', ' ').replaceAll('&quot;', '"').replaceAll('&#039;', "'").replaceAll('&amp;', '&');
const text = (value) => clean(decode(String(value ?? '').replace(/<[^>]*>/g, ' ')));

async function fetchText(source) {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  return response.text();
}

// Vereinsliste: Links auf die Vereinsseiten; dort Website und Vereinskennzahl.
const listHtml = await fetchText(LIST_URL);
const links = [...new Map([...listHtml.matchAll(/<a[^>]+href="([^"]+\.html)"[^>]*>(.*?)<\/a>/gs)]
  .map(([, href, label]) => [text(label), new URL(href, LIST_URL).href])
  .filter(([name, href]) => name && href.includes('/vereine/'))).entries()];
if (links.length < 40) throw new Error(`Vereinsliste unvollständig (${links.length} Vereine) – Seitenaufbau geändert?`);
const clubs = [];
for (const [name, href] of links) {
  if (EXCLUDED.has(key(name))) continue;
  const page = text((await fetchText(href)).replace(/<(script|style)[^>]*>.*?<\/\1>/gs, ' '));
  const website = page.match(/Website:\s*(https?:\/\/\S+)/)?.[1] ?? WEBSITES[key(name)] ?? null;
  clubs.push({ name, website });
}
const unchecked = clubs.filter((club) => !PLACES[key(club.name)]).map((club) => club.name);
if (unchecked.length) throw new Error(`Neue Vereine ohne geprüften Spielort (PLACES ergänzen): ${unchecked.join('; ')}`);

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

for (const entry of clubs) {
  const { name } = entry;
  if (existing.has(key(name))) {
    skipped.push(name);
    continue;
  }
  const clubId = crypto.randomUUID();
  statements.push(
    'INSERT OR IGNORE INTO clubs (id, name, kind, description, website_url, logo_url, social_links, member_of, contact_name, contact_email, contact_phone, status, owner_id, created_at, updated_at) '
    + `VALUES (${quote(clubId)}, ${quote(name)}, 'club', NULL, ${quote(entry.website)}, NULL, '{}', ${quote(JSON.stringify(MEMBER_OF))}, NULL, NULL, NULL, ${quote(status)}, ${quote(owner.id)}, ${quote(now)}, ${quote(now)});`,
  );

  const { street, postcode, city, latitude, longitude, venueType = 'outdoor' } = PLACES[key(name)];
  const address = [street, [postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  checklist.push([name, address, latitude, longitude].join(' | '));
  // Vereinsplätze nur anlegen, wenn der Verein in diesem Lauf wirklich neu entstanden ist (kein verwaister Platz).
  statements.push(
    'INSERT INTO boule_places (id, club_id, club_name, name, address, latitude, longitude, venue_type, court_count, description, accessible, facility_codes, status, reported_by_user_id, address_unverified, created_at, updated_at) '
    + `SELECT ${quote(crypto.randomUUID())}, ${quote(clubId)}, NULL, ${quote(name)}, ${quote(address)}, ${latitude}, ${longitude}, ${quote(venueType)}, 0, NULL, 0, '[]', ${quote(status)}, NULL, 1, ${quote(now)}, ${quote(now)} `
    + `WHERE EXISTS (SELECT 1 FROM clubs WHERE id = ${quote(clubId)}) AND NOT EXISTS (SELECT 1 FROM boule_places WHERE lower(trim(name)) = lower(trim(${quote(name)})) AND lower(trim(address)) = lower(trim(${quote(address)})) AND venue_type = ${quote(venueType)});`,
  );
  placeCount += 1;
}

console.log(`${links.length} Vereine im Verband, ${clubs.length} importierbar: ${clubs.length - skipped.length} neu, ${placeCount} Plätze, ${skipped.length} übersprungen, ${EXCLUDED.size} zurückgestellt.`);
if (skipped.length) console.log(`Übersprungen (bereits vorhanden): ${skipped.join('; ')}`);
if (statements.length === 0) process.exit(0);
if (args.has('--checklist')) console.log(checklist.join('\n'));

const file = join(mkdtempSync(join(tmpdir(), 'ptm-sbv-clubs-')), 'import.sql');
writeFileSync(file, `${statements.join('\n')}\n`);
console.log(`SQL: ${file}`);
console.log(statements.slice(0, 2).join('\n'));

if (args.has('--apply')) {
  const counts = () => query("SELECT (SELECT COUNT(*) FROM clubs) AS clubs, (SELECT COUNT(*) FROM boule_places) AS places, (SELECT COUNT(*) FROM tournaments) AS tournaments")[0];
  const before = counts();
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', target, '--yes', '--file', file], { stdio: 'inherit' });
  const after = counts();
  console.log(`Vorher: ${JSON.stringify(before)}`);
  console.log(`Nachher: ${JSON.stringify(after)}`);
  if (after.tournaments !== before.tournaments) process.exit(1);
}
