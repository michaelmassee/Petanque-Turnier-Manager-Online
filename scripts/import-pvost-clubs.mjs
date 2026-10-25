// Importiert Mitgliedsvereine des Pétanqueverbands Ost (PV Ost: Sachsen, Sachsen-Anhalt, Thüringen) als Organisationen;
// Sachsen, Thüringen und Sachsen-Anhalt. Quelle ist pv-ost.de/verband („Vereine im PV Ost“), die nur Logos mit Link zur
// Vereinswebsite zeigt. Namen und Spielorte stammen darum von den Vereinswebsites, abgeglichen mit der
// Pétanque-Aktuell-Karte und Nominatim (Stand 2026-10-25); das Skript bricht ab, wenn die Verbandsseite einen Verein
// nicht mehr verlinkt. Vereine werden mit Owner = Admin und Status 'pending' angelegt, mit --publish gleich freigegeben.
//
//   node scripts/import-pvost-clubs.mjs --local                       # SQL erzeugen und anzeigen
//   node scripts/import-pvost-clubs.mjs --local --apply               # zusätzlich ausführen
//   node scripts/import-pvost-clubs.mjs --remote --apply --publish    # Produktion, gleich freigegeben
//
// Idempotent: vorhandene Vereine (gleicher Name) und Plätze (gleicher Name, Adresse, Typ) werden übersprungen.
// Vorerst nicht importiert: SV Horken Kittlitz (verlinkte Domain gehört inzwischen einem Online-Casino, Spielort unbekannt);
// Kahla (nur Logo) und Nordhausen (Link auf eine gelöschte Stadtnachricht) – Vereinsname und Spielort unbekannt.
// Die neue Abteilung der SG Fortuna in Rhönblick steht nicht auf der Verbandsseite.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LIST_URL = 'https://pv-ost.de/verband/';
const MEMBER_OF = ['Pétanqueverband Ost'];
// listLink: Domain, mit der die Verbandsseite den Verein verlinkt; places: Spielorte (outdoor/indoor).
const CLUBS = [
  {
    name: 'Leipziger Pétanque Club "Pastis 1996" e.V.', listLink: 'leipzigboule.de', website: 'https://www.leipzigboule.de/',
    places: [{ street: 'Max-Liebermann-Straße 184 (Turnier- und Ligaplatz)', postcode: '04157', city: 'Leipzig-Gohlis', latitude: 51.37498, longitude: 12.3813,
      description: 'Weitere Spielorte: Karl-Heine-Kanal (Industriestraße 89, im Sommer mittwochs), Park des Friedens (Linnéstraße, sonntags), Bouleplatz am Schachzentrum (Anton-Bruckner-Allee, meist montags).' }],
  },
  {
    name: '1. Chemnitzer Pétanque-Club e.V.', listLink: 'chemnitzboule.de', website: 'https://www.chemnitzboule.de/',
    places: [{ street: 'Eislebener Straße 33 (Boulodrôme)', postcode: '09126', city: 'Chemnitz-Bernsdorf', latitude: 50.80886, longitude: 12.94829 }],
  },
  {
    name: 'La Boule Rouge Dresden e.V.', listLink: 'labr-dresden.de', website: 'https://labrdresden.de/',
    places: [{ street: 'Meschwitzstraße 10 (Meschwitz-Arena)', postcode: '01099', city: 'Dresden-Albertstadt', latitude: 51.0839072, longitude: 13.7636003,
      description: 'Vereinsgelände, April bis Oktober; dienstags ab 17 Uhr, freitags ab 15 Uhr, oft auch sonntags ab 14 Uhr.' }],
  },
  {
    name: 'Bouleclub Leipziger Land e.V.', listLink: 'bcll.de', website: 'http://www.bcll.de/',
    places: [
      { street: 'Blumrodapark 8b (Boulezentrum Borna)', postcode: '04552', city: 'Borna', latitude: 51.08865, longitude: 12.4787,
        description: 'Weitere Trainingsorte: Am Breiten Teich 1 und Park Löscheranlagen in Borna.' },
      { venueType: 'indoor', street: 'Blumrodapark 8b (Boulehalle Borna)', postcode: '04552', city: 'Borna', latitude: 51.08865, longitude: 12.4787,
        description: 'Boulehalle, nur im Winter.' },
    ],
  },
  {
    name: 'Stahlball e.V.', listLink: 'stahlball.rocks', website: 'https://www.stahlball.rocks/',
    places: [{ street: 'Lene-Voigt-Park (Höhe Eilenburger Straße 16–17)', postcode: '04317', city: 'Leipzig-Reudnitz', latitude: 51.3330886, longitude: 12.4023241 }],
  },
  {
    name: 'Spielvereinigung Blau Weiß Chemnitz e.V.', listLink: 'blauweisschemnitz.net', website: 'https://www.blauweisschemnitz.net/abteilung-petanque/',
    places: [{ street: 'Clausstraße 87 (Boulodrom am Stadion Clausstraße)', postcode: '09126', city: 'Chemnitz', latitude: 50.8222292, longitude: 12.9430995,
      description: 'Abteilung Pétanque; Training montags und freitags ab 16:30 Uhr.' }],
  },
  {
    name: "Roter Stern Leipzig '99 e.V.", listLink: 'rotersternleipzig.de', website: 'https://rotersternleipzig.de/boule-selbstverstaendnis/',
    places: [{ street: 'Teichstraße (Sportplatz)', postcode: '04277', city: 'Leipzig-Connewitz', latitude: 51.3060445, longitude: 12.367816,
      description: 'Sektion Boule/Pétanque; ab Mai mittwochs ab 15:30 Uhr (Kinder/Jugend 15:30–18 Uhr, Erwachsene 16:30–19:30 Uhr).' }],
  },
  // Thüringen
  {
    name: 'Nebenbouler Jena e.V.', listLink: 'nebenbouler-jena.de', website: 'https://www.nebenbouler-jena.de/',
    places: [{ street: 'Bouleplatz im Paradies (Rasenmühleninsel)', postcode: '07745', city: 'Jena', latitude: 50.91982, longitude: 11.58209 }],
  },
  {
    name: 'Boule- und Pétanquefreunde Weimar', listLink: 'weimar-356843891078311', website: 'https://www.facebook.com/Boule-und-P%C3%A9tanquefreunde-Weimar-356843891078311/',
    places: [{ street: 'Ackerwand (am Park an der Ilm)', postcode: '99423', city: 'Weimar', latitude: 50.97663, longitude: 11.33104 }],
  },
  {
    // Hauptplatz laut Verein ist das „Brühlodrom“ (ohne Adresse); verortet im Brühler Garten.
    name: 'douze partout erfurt e.V.', listLink: 'douzepartout.de', website: 'https://www.douzepartout.de/',
    places: [{ street: 'Brühler Garten („Brühlodrom“)', postcode: '99084', city: 'Erfurt', latitude: 50.973629, longitude: 11.0198594,
      description: 'Weitere Spielorte: Am Umspanner, Stadtpark (am Hauptbahnhof), Gothaer Platz (Südeingang der ega), Petersberg, Zughafen.' }],
  },
  // Sachsen-Anhalt
  {
    name: 'Bamboule Halle e.V.', listLink: 'bamboule-halle.de', website: 'https://bamboule-halle.de/',
    places: [
      { street: 'Stadtpark (an der Gottesackermauer)', postcode: '06108', city: 'Halle (Saale)', latitude: 51.4828167, longitude: 11.9796548,
        description: 'Im Sommer montags ab 16 Uhr; freitags ab 18 Uhr an der Saalepromenade.' },
      // Navi-Empfehlung des Vereins: Nachbarhaus Oelsnitzer Str. 14.
      { venueType: 'indoor', street: 'Oelsnitzer Straße 18 (Glashaus)', postcode: '06116', city: 'Halle-Reideburg', latitude: 51.4888807, longitude: 12.0450607,
        description: 'Winterdomizil; im Winter freitags Supermêlée.' },
    ],
  },
  {
    name: 'Union 1861 Schönebeck e.V.', listLink: 'union1861.de', website: 'https://petanque.union1861.de/',
    places: [{ street: 'Barbarastraße (KT-Sportforum)', postcode: '39218', city: 'Schönebeck (Elbe)', latitude: 52.00944, longitude: 11.74778,
      description: 'Abteilung Pétanque; mittwochs ab 18 Uhr (hier oder auf dem Bouleplatz in Magdeburg-Buckau), sonntags ab Frühjahr ab 14 Uhr öffentliches Spiel im Kurpark Bad Salzelmen (Treffpunkt Café Parkidyll).' }],
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

// Die Verbandsseite muss jeden Verein noch verlinken (sonst ausgetreten oder Website geändert → CLUBS prüfen).
const response = await fetch(LIST_URL);
if (!response.ok) throw new Error(`${LIST_URL}: HTTP ${response.status}`);
const listHtml = (await response.text()).toLowerCase();
const missing = CLUBS.filter((club) => !listHtml.includes(club.listLink)).map((club) => club.name);
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

const file = join(mkdtempSync(join(tmpdir(), 'ptm-pvost-clubs-')), 'import.sql');
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
