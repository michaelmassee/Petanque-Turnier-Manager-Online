// Importiert die Mitgliedsvereine des Pétanque Verbands Nord (PV Nord: Hamburg, Schleswig-Holstein,
// Mecklenburg-Vorpommern) als Organisationen. Quelle: petanque-nord.de/verband/mitglieder bettet die DPV-Vereinskarte ein
// (VEREINE_URL). Deren Koordinaten sind teils vertauscht, Ortsmitte oder Kontaktadressen; jeder Verein hat darum in PLACES
// einen geprüften Spielort (Pétanque-Aktuell-Karte, Nominatim, Platzbeschreibung der Karte, Vereinswebsites; Stand
// 2026-10-26). Logos kommen aus der Karte. Vereine werden mit Owner = Admin und Status 'pending' angelegt, mit --publish
// gleich freigegeben.
//
//   node scripts/import-lvnord-clubs.mjs --local                       # SQL erzeugen und anzeigen
//   node scripts/import-lvnord-clubs.mjs --local --apply               # zusätzlich ausführen
//   node scripts/import-lvnord-clubs.mjs --remote --apply --publish    # Produktion, gleich freigegeben
//
// Idempotent: vorhandene Vereine (gleicher Name) und Plätze (gleicher Name, Adresse, Typ) werden übersprungen.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VEREINE_URL = 'https://dpvserver.de/lvnord/web/vmap/src/vereine.json';
const IMAGE_BASE = 'https://dpvserver.de/lvnord/';
const MEMBER_OF = ['Pétanque Verband Nord'];
// Vorerst nicht importieren: Spielort nicht bestimmbar – Kartenadresse ist ein Wohnhaus (Kontaktadresse), nur die
// Ortsmitte oder fehlt ganz; Elbe Pétanque Club ist kein eingetragener Verein. Später mit geprüftem Spielort nachholen.
const EXCLUDED = new Set([
  'boule apostel',
  'bsg chausette rougette',
  'elbe pétanque club n.e.v.',
  'bim bam boule altona',
  'belle boule ahrensburg',
  'norderstedter sport- und freizeitverein e.v.',
  'sg motor boizenburg e.v.',
  'sg boulerei horst',
  'sg hamburger bouletten',
  'ts einfeld',
]);
// Tote oder umgezogene Vereinsseiten (geprüft 2026-10-26), nach Hostname; null = keine Website.
const WEBSITE_FIXES = {
  'wrister-tennisclub.de': null,
  'energie-eimsbuettel.de': null, // leitet auf eine nicht mehr erreichbare GMX-Homepage weiter
  'xn--thegang-travemnde-g3b.de': 'https://www.thegang-travemuende.de/',
};
// Logos, die die Karte nennt, die aber nicht (mehr) existieren.
const BAD_LOGOS = new Set(['https://dpvserver.de/lvnord/Image/ligalogos/gross/11-053_k.jpg']);
// Geprüfter Spielort je Verein (Schlüssel = Vereinsname klein); noPlace = kein eigener Platz, Hinweis als Vereinsbeschreibung.
const PLACES = {
  // Pin der Pétanque-Aktuell-Karte (gleicher Verein; Reverse-Geokodierung: Platz/Park/Sportanlage).
  'a.p.b.c. schwerin': { street: 'Alter Garten', postcode: '19055', city: 'Schwerin', latitude: 53.6262, longitude: 11.41676 },
  'altonaer boule club hamburg e.v.': { street: 'Platz der Republik', postcode: '22765', city: 'Hamburg', latitude: 53.5491039, longitude: 9.9355694 },
  'betriebssportverband von 1952 e.v. lübeck': { street: 'Parkstraße 22 (Stadtpark, Eingang Adolfplatz)', postcode: '23568', city: 'Lübeck', latitude: 53.8784335, longitude: 10.7030597 },
  'bin park bergedorf': { street: 'Bergedorfer Schlosspark (Treffpunkt Bismarckdenkmal, Chrysanderstraße)', postcode: '21029', city: 'Hamburg-Bergedorf', latitude: 53.4894658, longitude: 10.2149976 },
  'compagnie de boule e.v.': { street: 'Falkenstraße / Hüxterdamm', postcode: '23568', city: 'Lübeck', latitude: 53.86521, longitude: 10.69739 },
  'der hamburger boule club': { street: 'Lohsepark (Am Hannoverschen Bahnhof)', postcode: '20457', city: 'Hamburg-HafenCity', latitude: 53.5412181, longitude: 10.0064814 },
  'energie eimsbüttel': { street: 'Lindenpark (Bellealliancestraße / Marthastraße)', postcode: '20259', city: 'Hamburg-Eimsbüttel', latitude: 53.5658163, longitude: 9.9599416 },
  'fsv harburg-rönneburg e.v.': { street: 'Wasmerstraße 9', postcode: '21079', city: 'Hamburg-Rönneburg', latitude: 53.4451807, longitude: 10.0003509 },
  'heider rindsbouleunion': { street: 'Am Stadtpark (Boulodrom im Stadtpark)', postcode: '25746', city: 'Heide', latitude: 54.2033093, longitude: 9.1087021 },
  'idstedter pétanque club 1992 e.v.': { street: 'Dorfstraße 35a', postcode: '24879', city: 'Idstedt', latitude: 54.5841929, longitude: 9.5098341 },
  'karlshofer boule club zu lübeck': { street: 'Parkgelände zwischen Dornierstraße und Eckenerstraße', postcode: '23568', city: 'Lübeck', latitude: 53.889715, longitude: 10.7147687 },
  'lemsahler sv': { street: 'Eichelhäherkamp 3 (Boulodrom am Sportplatz)', postcode: '22397', city: 'Hamburg-Lemsahl', latitude: 53.68231, longitude: 10.10035 },
  'lübecker boule club e.v.': { street: 'Wallstraße (Bouleplatz)', postcode: '23560', city: 'Lübeck', latitude: 53.8652068, longitude: 10.6796141 },
  'mtv dänischenhagen von 1913 e.v.': { street: 'Schulstraße (C-Platz)', postcode: '24229', city: 'Dänischenhagen', latitude: 54.4265643, longitude: 10.1242658 },
  'nordboules pc kiel e.v.': { street: 'Goethestraße', postcode: '24116', city: 'Kiel', latitude: 54.3287139, longitude: 10.125667 },
  'pfif ottensen': { street: 'Bernadottestraße', postcode: '22763', city: 'Hamburg-Ottensen', latitude: 53.5472352, longitude: 9.9214171 },
  'pétanque club up´n swutsch': { street: 'Schulstraße 11', postcode: '25873', city: 'Oldersbek', latitude: 54.4495463, longitude: 9.1697548 },
  'pétanque kronshagen': { street: 'Fußsteigkoppel', postcode: '24119', city: 'Kronshagen', latitude: 54.3412668, longitude: 10.0883524 },
  'pétanque verein red boule e.v.': { street: 'Winklersgang', postcode: '23795', city: 'Bad Segeberg', latitude: 53.9388552, longitude: 10.3142957 },
  'schloss-park-boule husum': { street: 'Schlosspark (Erichsenweg)', postcode: '25813', city: 'Husum', latitude: 54.4817188, longitude: 9.0513653 },
  'sg boulevard wilhelmsburg': { street: 'Industriestraße 125 (an der Honigfabrik)', postcode: '21107', city: 'Hamburg-Wilhelmsburg', latitude: 53.5160784, longitude: 9.9825942 },
  'ssv brammer': { street: 'Waldweg (Sportplatz)', postcode: '24793', city: 'Brammer', latitude: 54.1938677, longitude: 9.7606988 },
  'sv boostedt v. 1922 e.v.': { street: 'Bahnhofstraße 56', postcode: '24598', city: 'Boostedt', latitude: 54.0153713, longitude: 10.0213052 },
  'tarup uf pétanque': { street: 'Taruper Hauptstraße (Stichstraße zwischen Nr. 51 und 53)', postcode: '24943', city: 'Flensburg', latitude: 54.7820719, longitude: 9.4762035 },
  'tsv neuenkirchen': { street: 'Dorfstraße (Sportplatz)', postcode: '25569', city: 'Bahrenfleth', latitude: 53.8649373, longitude: 9.433523 },
  'tsv neustadt': { street: 'Am Gogenkrog (Sportplatz)', postcode: '23730', city: 'Neustadt in Holstein', latitude: 54.1070605, longitude: 10.804207 },
  'tus lübeck 93': { street: 'Schlutuper Straße 37 (Boulodrome)', postcode: '23566', city: 'Lübeck', latitude: 53.866879, longitude: 10.7314491 },
  // Kartenkoordinate genau (Platz/Sportanlage an der angegebenen Straße).
  'bc boulezvous blankenese': { street: 'Sibbertstraße (Sportfeld)', postcode: '22587', city: 'Hamburg-Blankenese', latitude: 53.5637401, longitude: 9.8065886 },
  'blau-weiss wittorf neumünster e.v. von 1912': { street: 'Kälberweg 38 (Boulodrome)', postcode: '24539', city: 'Neumünster', latitude: 54.0488734, longitude: 9.9689648 },
  'boule & the gang travemünde': { street: 'Brügmanngarten', postcode: '23570', city: 'Lübeck-Travemünde', latitude: 53.9636288, longitude: 10.8816623 },
  'boule sv stolpe': { street: 'Seestraße', postcode: '24601', city: 'Stolpe', latitude: 54.1279648, longitude: 10.2256346 },
  'boulefreunde fehmarn e.v.': { street: 'Kaestnerstraße 2', postcode: '23769', city: 'Fehmarn', latitude: 54.4422797, longitude: 11.1926488 },
  'eimsbütteler bouledoxx': { street: 'Steinwiesenweg (Sportanlage)', postcode: '22527', city: 'Hamburg-Eidelstedt', latitude: 53.605, longitude: 9.9161 },
  'geest-bouler': { street: 'Sönnebüller Weg (Sportplatz Germania Breklum)', postcode: '25821', city: 'Breklum', latitude: 54.6114321, longitude: 8.996896 },
  'oelixdorfer schützen': { street: 'Unterstraße 23a', postcode: '25524', city: 'Oelixdorf', latitude: 53.9254647, longitude: 9.5711728 },
  'sv blau-weiß löwenstedt': { street: 'Kapellenweg', postcode: '25864', city: 'Löwenstedt', latitude: 54.6198296, longitude: 9.1770512 },
  'wrister-tennis-club e.v.': { street: 'Quarnstedter Straße 28', postcode: '25563', city: 'Wrist', latitude: 53.9365986, longitude: 9.7595841 },
  // Hausnummerngenauer Nominatim-Treffer der Kartenadresse.
  'marner tv v. 1862 e.v.': { street: 'Bei den Buchen 11', postcode: '25709', city: 'Marne', latitude: 53.9540961, longitude: 8.9980999 },
  'tsv pellworm': { street: 'Kaydeich 15a (neben der Minigolfanlage)', postcode: '25849', city: 'Pellworm', latitude: 54.5024422, longitude: 8.6545471 },
  // Einzeln geprüft (Platzbeschreibung der Karte, Vereinswebsite).
  'hamburger rugby club von 1950 e.v.': { street: 'Saarlandstraße 71 (Rugbystadion im Stadtpark)', postcode: '22303', city: 'Hamburg', latitude: 53.5974753, longitude: 10.0307388 },
  'sv st. georg von 1895 e.v.': { street: 'Hammer Steindamm 130 (Clubhausgelände)', postcode: '20535', city: 'Hamburg-Hamm', latitude: 53.5588376, longitude: 10.0539183 },
  'sv weiß-blau allianz': { street: 'Stadtpark (am Brunnen neben Sierichs Biergarten)', postcode: '22303', city: 'Hamburg', latitude: 53.5918448, longitude: 10.028596 },
  'torpedo rote sau': { street: 'Rencks Park', postcode: '24534', city: 'Neumünster', latitude: 54.0735758, longitude: 9.9888133 },
  // Nur Straße bekannt.
  'fc union tornesch': { street: 'Großer Moorweg 30 (Torneum)', postcode: '25436', city: 'Tornesch', latitude: 53.7028931, longitude: 9.7340027 },
  'sv bliestorf von 1967 e.v.': { street: 'Lübecker Straße (alter Tennisplatz)', postcode: '23847', city: 'Bliestorf', latitude: 53.775322, longitude: 10.6144512 },
  'tsv wattenbek': { street: 'Schulstraße 6 (Sportplatz)', postcode: '24582', city: 'Wattenbek', latitude: 54.1667416, longitude: 10.0539469 },
  // Kein eigener Platz: spielt auf der Anlage eines anderen Vereins (Hinweis in der Vereinsbeschreibung).
  'fc st. pauli von 1910 e.v.': { noPlace: 'Spielt am Platz der Republik in Hamburg-Altona (Bouleplatz des Altonaer Boule Clubs).' },
  'sg druckpétanqueung': { noPlace: 'Spielt auf dem kleinen öffentlichen Platz an der Honigfabrik, Industriestraße 125, 21107 Hamburg-Wilhelmsburg (wie SG Boulevard Wilhelmsburg).' },
};
// Zusätzliche Hallen (Winterbetrieb) je Verein.
const INDOOR = {
  'boulefreunde fehmarn e.v.': { street: 'Grüner Weg (Halle)', postcode: '23769', city: 'Fehmarn', latitude: 54.4274432, longitude: 11.196334, description: 'Im Winter dienstags 19 Uhr und samstags 15 Uhr.' },
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
  // „https//host“ (fehlender Doppelpunkt) reparieren.
  const raw = clean(value).split(/[;\s]+/)[0].replace(/^(https?)\/\//i, '$1://');
  if (!raw) return null;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host in WEBSITE_FIXES) return WEBSITE_FIXES[host];
    return ['http:', 'https:'].includes(parsed.protocol) && host.includes('.') ? parsed.href : null;
  } catch { return null; }
}

function logo(picture) {
  const path = clean(picture).replace(/^(\.\.\/)+/, '');
  const href = path.startsWith('Image/') && !path.includes('vereinslogox') && /\.(png|jpe?g|gif)$/i.test(path) ? new URL(path, IMAGE_BASE).href : null;
  return BAD_LOGOS.has(href) ? null : href;
}

function placeDescription(entry) {
  const parts = [multiline(entry.about)].filter(Boolean);
  if (clean(entry.Trainingszeiten)) parts.push(`Trainingszeiten: ${multiline(entry.Trainingszeiten)}`);
  return parts.join('\n\n') || null;
}

const response = await fetch(VEREINE_URL);
if (!response.ok) throw new Error(`${VEREINE_URL}: HTTP ${response.status}`);
const entries = JSON.parse((await response.text()).replace(/^﻿/, ''));
if (entries.length < 40) throw new Error(`Vereinskarte unvollständig (${entries.length} Einträge) – Datenaufbau geändert?`);
const clubs = entries.filter((entry) => !EXCLUDED.has(key(entry.name)));
const unchecked = clubs.filter((entry) => !PLACES[key(entry.name)]).map((entry) => clean(entry.name));
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
  const name = clean(entry.name);
  if (existing.has(key(name))) {
    skipped.push(name);
    continue;
  }
  const clubId = crypto.randomUUID();
  const place = PLACES[key(name)];
  statements.push(
    'INSERT OR IGNORE INTO clubs (id, name, kind, description, website_url, logo_url, social_links, member_of, contact_name, contact_email, contact_phone, status, owner_id, created_at, updated_at) '
    + `VALUES (${quote(clubId)}, ${quote(name)}, 'club', ${quote(place.noPlace ?? multiline(entry.Beschreibung))}, ${quote(url(entry.Homepage))}, ${quote(logo(entry.picture))}, '{}', ${quote(JSON.stringify(MEMBER_OF))}, NULL, ${quote(clean(entry.email))}, NULL, ${quote(status)}, ${quote(owner.id)}, ${quote(now)}, ${quote(now)});`,
  );
  const venues = [
    ...(place.noPlace ? [] : [{ ...place, venueType: 'outdoor', description: placeDescription(entry) }]),
    ...(INDOOR[key(name)] ? [{ ...INDOOR[key(name)], venueType: 'indoor' }] : []),
  ];
  for (const { street, postcode, city, latitude, longitude, venueType, description } of venues) {
    const address = [street, [postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    checklist.push([name, venueType, address, latitude, longitude].join(' | '));
    // Vereinsplätze nur anlegen, wenn der Verein in diesem Lauf wirklich neu entstanden ist (kein verwaister Platz).
    statements.push(
      'INSERT INTO boule_places (id, club_id, club_name, name, address, latitude, longitude, venue_type, court_count, description, accessible, facility_codes, status, reported_by_user_id, address_unverified, created_at, updated_at) '
      + `SELECT ${quote(crypto.randomUUID())}, ${quote(clubId)}, NULL, ${quote(name)}, ${quote(address)}, ${latitude}, ${longitude}, ${quote(venueType)}, 0, ${quote(description)}, 0, '[]', ${quote(status)}, NULL, 1, ${quote(now)}, ${quote(now)} `
      + `WHERE EXISTS (SELECT 1 FROM clubs WHERE id = ${quote(clubId)}) AND NOT EXISTS (SELECT 1 FROM boule_places WHERE lower(trim(name)) = lower(trim(${quote(name)})) AND lower(trim(address)) = lower(trim(${quote(address)})) AND venue_type = ${quote(venueType)});`,
    );
    placeCount += 1;
  }
}

console.log(`${entries.length} Karteneinträge, ${clubs.length} Vereine: ${clubs.length - skipped.length} neu, ${placeCount} Plätze, ${skipped.length} übersprungen, ${EXCLUDED.size} zurückgestellt.`);
if (skipped.length) console.log(`Übersprungen (bereits vorhanden): ${skipped.join('; ')}`);
if (statements.length === 0) process.exit(0);
if (args.has('--checklist')) console.log(checklist.join('\n'));

const file = join(mkdtempSync(join(tmpdir(), 'ptm-lvnord-clubs-')), 'import.sql');
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
