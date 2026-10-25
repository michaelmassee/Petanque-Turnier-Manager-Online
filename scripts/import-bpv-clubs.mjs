// Importiert die Mitgliedsvereine des Bayerischen Pétanque-Verbands (BPV) als Organisationen. Quelle:
// petanque-bayern.de/vereine.html bettet die DPV-Vereinskarte ein (VEREINE_URL). Deren Koordinaten liegen trotz vieler
// Nachkommastellen oft nicht am Platz (Wohnhaus, Parkplatz, Ortsmitte); jeder Verein hat darum in PLACES einen geprüften
// Spielort (Pétanque-Aktuell-Karte, Nominatim, Ortsbeschreibung der Karte, Vereinswebsites; Stand 2026-10-25). Logos
// kommen aus der Karte. Vereine werden mit Owner = Admin und Status 'pending' angelegt, mit --publish gleich freigegeben.
//
//   node scripts/import-bpv-clubs.mjs --local                       # SQL erzeugen und anzeigen
//   node scripts/import-bpv-clubs.mjs --local --apply               # zusätzlich ausführen
//   node scripts/import-bpv-clubs.mjs --remote --apply --publish    # Produktion, gleich freigegeben
//
// Idempotent: vorhandene Vereine (gleicher Name) und Plätze (gleicher Name, Adresse, Typ) werden übersprungen.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VEREINE_URL = 'https://dpvserver.de/bpv/web/vmap/src/vereine.json';
const IMAGE_BASE = 'https://dpvserver.de/bpv/';
const MEMBER_OF = ['Bayerischer Pétanque-Verband'];
// Vorerst nicht importieren: Spielort weder aus Karte, Website noch anderen Karten bestimmbar (nur Ortsmitte,
// Wohnadresse oder keine Adresse) – später mit geprüftem Spielort nachholen. TSV Lindau ist schon über den BBPV-Import
// (als „TSV Lindau von 1850 e.V.“) angelegt.
const EXCLUDED = new Set([
  'sg bouba bayreuth', 'schweinfurter kugelleger e.v.', 'boule freunde kleeblatt fürth', 'lauf offene boulegruppe',
  'ts jahn münchen e. v.', 'boupa münchen', 'münchen mesdames', 'toyboyz', 'boule freunde nürnberg e.v.', 'kgb nürnberg',
  'bc zwanglos zwinger nürnberg', 'bc oettingen', 'pétanque freunde', 'tsv lindau 1850 e.v.',
]);
// Unbrauchbare Website-Angaben der Karte, nach Hostname; null = keine Website.
const WEBSITE_FIXES = { '---': null };
// Geprüfter Spielort je Verein (Schlüssel = Vereinsname klein).
const PLACES = {
  // Pin der Pétanque-Aktuell-Karte (gleicher Verein; Reverse-Geokodierung: Platz/Sportanlage).
  '1. bc germering': { street: 'Max-Reger-Str. 11', postcode: '82110', city: 'Germering', latitude: 48.1343355, longitude: 11.3740593 },
  '1. bcp aschaffenburg': { street: 'Deschstrasse', postcode: '63739', city: 'Aschaffenburg', latitude: 49.9771867, longitude: 9.1589284 },
  '1. boule-club mechenhard': { street: 'Ebertsweg (Mechenhard)', postcode: '63906', city: 'Erlenbach am Main', latitude: 49.8084522, longitude: 9.2125965 },
  '1. münchner kugelwurfunion e.v.': { street: 'Hofgarten (Odeonsplatz)', postcode: '80539', city: 'München', latitude: 48.142315, longitude: 11.5795556 },
  '1. pc goggolori weilheim e.v.': { street: 'Kanalstraße 2', postcode: '82362', city: 'Weilheim in Oberbayern', latitude: 47.8456135, longitude: 11.1352805 },
  'asv sindelsdorf e.v.': { street: 'Im Seestall 3', postcode: '82404', city: 'Sindelsdorf', latitude: 47.7230542, longitude: 11.3221378 },
  'bf niedernberg e. v.': { street: 'Stückerweg 50', postcode: '63843', city: 'Niedernberg', latitude: 49.9215582, longitude: 9.1401173 },
  'boule-club würzburg e.v.': { street: 'Husarenstraße', postcode: '97082', city: 'Würzburg', latitude: 49.7940285, longitude: 9.9414272 },
  'bouleover landsberg e.v.': { street: 'Lechstraße (städtischer Bouleplatz)', postcode: '86899', city: 'Landsberg am Lech', latitude: 48.0527686, longitude: 10.8751769 },
  'bssv kaufbeuren e.v.': { street: 'Honoldstraße 20 (Tänzelfestplatz)', postcode: '87600', city: 'Kaufbeuren', latitude: 47.8900668, longitude: 10.6304126 },
  'bürgstadter kies bouler': { street: 'Josef-Ullrich-Straße', postcode: '63927', city: 'Bürgstadt', latitude: 49.7113957, longitude: 9.2644631 },
  'c.s.p viehhausen': { street: 'Jurastraße 57 (oberhalb des Fußballplatzes)', postcode: '93161', city: 'Viehhausen', latitude: 48.9829623, longitude: 11.9475286 },
  'fc tegernheim e.v.': { street: 'Am Hohen Sand 10', postcode: '93105', city: 'Tegernheim', latitude: 49.0290362, longitude: 12.166678 },
  'ft freie turnerschaft hof e.v': { street: 'Alte Plauener Straße 32', postcode: '95028', city: 'Hof', latitude: 50.33069, longitude: 11.923337 },
  'pc furth im wald e.v.': { street: 'Eschlkamer Str. 15', postcode: '93437', city: 'Furth im Wald', latitude: 49.3061467, longitude: 12.8494448 },
  'pc ingolstadt': { street: 'Josef-Strobl-Platz (vor dem Sozialen Rathaus)', postcode: '85049', city: 'Ingolstadt', latitude: 48.7664037, longitude: 11.4251953 },
  'pc neuburg': { street: 'Amalienstraße (Karlsplatz)', postcode: '86633', city: 'Neuburg an der Donau', latitude: 48.7374939, longitude: 11.1784616 },
  'pc nymphenburg e.v.': { street: 'Stievestraße 15', postcode: '80638', city: 'München', latitude: 48.160629, longitude: 11.5136962 },
  'pc straubing e.v.': { street: 'Wundermühlweg 45', postcode: '94315', city: 'Straubing', latitude: 48.8932105, longitude: 12.5736471 },
  'pcnc nürnberg e.v.': { street: 'Freudenpark', postcode: '90425', city: 'Nürnberg', latitude: 49.4741591, longitude: 11.0824795 },
  'psg trostberg sg': { street: 'Jahnstraße', postcode: '83308', city: 'Trostberg', latitude: 48.0257306, longitude: 12.5500753 },
  'pétanque club burgthann e.v.': { street: 'Mimberger Str. 101', postcode: '90559', city: 'Burgthann', latitude: 49.35068, longitude: 11.2912184 },
  'pétanque cooperative sauerlach e.v.': { street: 'Hofoldingerstr. 48', postcode: '82054', city: 'Sauerlach', latitude: 47.9708901, longitude: 11.6710886 },
  'pétanque lohr am main': { street: 'Heinz-Paulisch-Straße', postcode: '97816', city: 'Lohr am Main', latitude: 50.0044324, longitude: 9.5793544 },
  'rieser pétanque club dornstadt': { street: 'Dorfstraße 34', postcode: '86736', city: 'Auhausen-Dornstadt', latitude: 49.0028028, longitude: 10.582784 },
  'schwabmünchner park-bouler e.v.': { street: 'Riedstraße', postcode: '86830', city: 'Schwabmünchen', latitude: 48.1835169, longitude: 10.7475203 },
  'sportbund helios augsburg-kissing e.v.': { street: 'Lechauenstr. 24', postcode: '86438', city: 'Kissing', latitude: 48.3008223, longitude: 10.9537422 },
  'spvgg ansbach e. v.': { street: 'Am Stadion 3', postcode: '91522', city: 'Ansbach', latitude: 49.305533, longitude: 10.5562119 },
  'sv germering': { street: 'Max-Reger-Str. 11', postcode: '82110', city: 'Germering', latitude: 48.1343355, longitude: 11.3740593 },
  'sv kochel am see': { street: 'Triministraße 6', postcode: '82431', city: 'Kochel am See', latitude: 47.657983, longitude: 11.3573673 },
  'tsg 1885 augsburg-lechhausen e.v.': { street: 'Schillstraße 109', postcode: '86169', city: 'Augsburg', latitude: 48.3897762, longitude: 10.9016332 },
  'tsv 1899 röthenbach': { street: 'Sulzbacher Str. 12', postcode: '90552', city: 'Röthenbach an der Pegnitz', latitude: 49.4909853, longitude: 11.2523674 },
  'tsv ringheim': { street: 'Südring 1', postcode: '63762', city: 'Großostheim', latitude: 49.9297287, longitude: 9.0442976 },
  'tv 1912 etterzhausen e.v.': { street: 'Ebenwieser Straße', postcode: '93152', city: 'Nittendorf-Etterzhausen', latitude: 49.0349237, longitude: 11.9922418 },
  'tv fürth 1860 e.v': { street: 'Am Europakanal 50', postcode: '90768', city: 'Fürth', latitude: 49.4620006, longitude: 10.9621324 },
  // Hausnummerngenauer Nominatim-Treffer der BPV-Adresse.
  '1. bc-uff-eisen marktheidenfeld e.v.': { street: 'An den Birken 19', postcode: '97828', city: 'Marktheidenfeld', latitude: 49.8399656, longitude: 9.599726 },
  'bf nabburg e.v.': { street: 'Turnhallenweg 16', postcode: '92507', city: 'Nabburg', latitude: 49.4500636, longitude: 12.1842595 },
  'boule club ratisbonne e.v.': { street: 'Wittelsbacherstr. 6b', postcode: '93049', city: 'Regensburg', latitude: 49.0171248, longitude: 12.086355 },
  'boule-ensemble bamberg': { street: 'Holzgartenstr. 31', postcode: '96050', city: 'Bamberg', latitude: 49.8918895, longitude: 10.9077015 },
  'cp 03 schweinfurt e.v.': { street: 'Franz-Schubert-Str. 26', postcode: '97422', city: 'Schweinfurt', latitude: 50.0509271, longitude: 10.2156451 },
  'djk sc neuses': { street: 'Pfarrer-Starostzik-Straße 1', postcode: '91330', city: 'Eggolsheim', latitude: 49.7727345, longitude: 11.0283145 },
  'djk sv berg e. v.': { street: 'Am Meilenhofener Weg 2', postcode: '92348', city: 'Berg', latitude: 49.3384834, longitude: 11.4379425 },
  'ruhige kugel bamberg-bug': { street: 'Am Sportplatz 1', postcode: '96049', city: 'Bamberg', latitude: 49.8672045, longitude: 10.9108824 },
  'sgp nürnberg': { street: 'Marquardsenstr. 21', postcode: '91054', city: 'Erlangen', latitude: 49.5977395, longitude: 11.0148586 },
  'sv puch e.v.': { street: 'Zur Kaisersäule 6', postcode: '82256', city: 'Fürstenfeldbruck', latitude: 48.1864515, longitude: 11.2251745 },
  'tsv dachau 1865 e.v.': { street: 'Jahnstraße 23-25', postcode: '85221', city: 'Dachau', latitude: 48.2530649, longitude: 11.4506732 },
  'tsv roßtal e. v.': { street: 'Buchschwabacherstraße 32', postcode: '90574', city: 'Roßtal', latitude: 49.3866406, longitude: 10.8848562 },
  // Kartenkoordinate genau (liegt an der angegebenen Straße/Anlage).
  'bc ammersee eching sg': { street: 'Erholungsgebiet 1', postcode: '82279', city: 'Eching am Ammersee', latitude: 48.0851395, longitude: 11.1146101 },
  'bci röthenbach e.v.': { street: 'Norisstrasse 5a', postcode: '90552', city: 'Röthenbach', latitude: 49.483002, longitude: 11.2412 },
  'bf lenting': { street: 'Mozartstraße / Am Kalkbrenner', postcode: '85101', city: 'Lenting', latitude: 48.8123, longitude: 11.4484265 },
  'bibert bouler zirndorf sg': { street: 'Bahnhofstraße', postcode: '90513', city: 'Zirndorf', latitude: 49.4429054, longitude: 10.9610368 },
  'pétanque münchen': { street: 'Volpinistr 63', postcode: '80638', city: 'München', latitude: 48.1595, longitude: 11.4932 },
  'sg elf münchen': { street: 'Hofgarten (Odeonsplatz)', postcode: '80539', city: 'München', latitude: 48.1434636, longitude: 11.5779133 },
  'sg raspaille eichstätt': { street: 'Ostenstraße 24', postcode: '85072', city: 'Eichstätt', latitude: 48.8898548, longitude: 11.1885366 },
  'sv 1971 schnackenwerth': { street: 'Bergrheinfelder Weg', postcode: '97440', city: 'Schnackenwerth', latitude: 50.012764, longitude: 10.1306163 },
  'vital-sportverein kemnath e.v.': { street: 'Badstrasse', postcode: '95478', city: 'Kemnath', latitude: 49.8725185, longitude: 11.8836365 },
  // Einzeln geprüft (Vereinswebsite, Ortsbeschreibung der Karte).
  'augsburger bc e.v.': { street: 'Pfarrer-Bogner-Straße (unter der B17-Brücke beim Taubenturm)', postcode: '86199', city: 'Augsburg', latitude: 48.3482085, longitude: 10.8671734 },
  'bc bad kissingen': { street: 'Jörgentorpark', postcode: '97702', city: 'Münnerstadt', latitude: 50.2504718, longitude: 10.1981193 },
  'bc-heiße kugel ansbach': { street: 'Hofgarten (bei der Orangerie)', postcode: '91522', city: 'Ansbach', latitude: 49.300588, longitude: 10.5823725 },
  'boule freunde füssen e.v.': { street: 'Morisse (Boulodrom)', postcode: '87629', city: 'Füssen', latitude: 47.5668651, longitude: 10.6944632 },
  'bouligans nördlingen': { street: 'Berger Tor / An der Bergmauer 8', postcode: '86720', city: 'Nördlingen', latitude: 48.8489437, longitude: 10.4837223 },
  'deaf in boule': { street: 'Piuspark', postcode: '85057', city: 'Ingolstadt', latitude: 48.7845726, longitude: 11.3890146 },
  'pétanque sg passau': { street: 'Badstraße 4', postcode: '94124', city: 'Büchlberg', latitude: 48.6651476, longitude: 13.5135658 },
  'sv heiligkreuz e.v. 1946': { street: 'Herrenstraße 1 (Hofgarten, Orangerie)', postcode: '87439', city: 'Kempten', latitude: 47.7296441, longitude: 10.3135819 },
  // Nur Straße bzw. Ortslage bekannt.
  'bf vaterstetten': { street: 'Fasanenstraße / Dohlenweg', postcode: '85598', city: 'Vaterstetten', latitude: 48.1116065, longitude: 11.7723689 },
  'boule freunde ornbau': { street: 'An der Altmühlbrücke', postcode: '91737', city: 'Ornbau', latitude: 49.1762, longitude: 10.658 },
  'pétanque sg ostbayern': { street: 'Kubinstr. 1', postcode: '94060', city: 'Pocking', latitude: 48.4005812, longitude: 13.3062219 },
  'tsv 1896 freilassing': { street: 'Prielweg 5', postcode: '83395', city: 'Freilassing', latitude: 47.8440101, longitude: 12.9867864 },
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
  return path.startsWith('Image/') && !path.includes('vereinslogox') && /\.(png|jpe?g|gif)$/i.test(path) ? new URL(path, IMAGE_BASE).href : null;
}

function placeDescription(entry) {
  const parts = [multiline(entry.about)].filter(Boolean);
  if (clean(entry.Trainingszeiten)) parts.push(`Trainingszeiten: ${multiline(entry.Trainingszeiten)}`);
  return parts.join('\n\n') || null;
}

const response = await fetch(VEREINE_URL);
if (!response.ok) throw new Error(`${VEREINE_URL}: HTTP ${response.status}`);
const entries = JSON.parse((await response.text()).replace(/^﻿/, ''));
if (entries.length < 60) throw new Error(`Vereinskarte unvollständig (${entries.length} Einträge) – Datenaufbau geändert?`);
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
  statements.push(
    'INSERT OR IGNORE INTO clubs (id, name, kind, description, website_url, logo_url, social_links, member_of, contact_name, contact_email, contact_phone, status, owner_id, created_at, updated_at) '
    + `VALUES (${quote(clubId)}, ${quote(name)}, 'club', ${quote(multiline(entry.Beschreibung))}, ${quote(url(entry.Homepage))}, ${quote(logo(entry.picture))}, '{}', ${quote(JSON.stringify(MEMBER_OF))}, NULL, ${quote(clean(entry.email))}, NULL, ${quote(status)}, ${quote(owner.id)}, ${quote(now)}, ${quote(now)});`,
  );

  const { street, postcode, city, latitude, longitude } = PLACES[key(name)];
  const address = [street, [postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  checklist.push([name, address, latitude, longitude].join(' | '));
  // Vereinsplätze nur anlegen, wenn der Verein in diesem Lauf wirklich neu entstanden ist (kein verwaister Platz).
  statements.push(
    'INSERT INTO boule_places (id, club_id, club_name, name, address, latitude, longitude, venue_type, court_count, description, accessible, facility_codes, status, reported_by_user_id, address_unverified, created_at, updated_at) '
    + `SELECT ${quote(crypto.randomUUID())}, ${quote(clubId)}, NULL, ${quote(name)}, ${quote(address)}, ${latitude}, ${longitude}, 'outdoor', 0, ${quote(placeDescription(entry))}, 0, '[]', ${quote(status)}, NULL, 1, ${quote(now)}, ${quote(now)} `
    + `WHERE EXISTS (SELECT 1 FROM clubs WHERE id = ${quote(clubId)}) AND NOT EXISTS (SELECT 1 FROM boule_places WHERE lower(trim(name)) = lower(trim(${quote(name)})) AND lower(trim(address)) = lower(trim(${quote(address)})) AND venue_type = 'outdoor');`,
  );
  placeCount += 1;
}

console.log(`${entries.length} Karteneinträge, ${clubs.length} Vereine: ${clubs.length - skipped.length} neu, ${placeCount} Plätze, ${skipped.length} übersprungen, ${EXCLUDED.size} zurückgestellt.`);
if (skipped.length) console.log(`Übersprungen (bereits vorhanden): ${skipped.join('; ')}`);
if (statements.length === 0) process.exit(0);
if (args.has('--checklist')) console.log(checklist.join('\n'));

const file = join(mkdtempSync(join(tmpdir(), 'ptm-bpv-clubs-')), 'import.sql');
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
