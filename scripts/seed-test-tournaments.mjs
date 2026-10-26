// Legt in der lokalen Dev-D1 für manuelle Tests je ein Testturnier pro online durchführbarem System an:
// komplett angemeldet (bestätigte Meldungen), Datum heute, sofort startbar, Live-Ansicht und Ergebnismeldung
// durch Spieler freigegeben. Das Testkonto ptm-user@example.test ist in jedem Turnier mit Meldung 1 verknüpft.
//
//   npm run db:seed:testturniere
//
// Beliebig oft ausführbar: löscht vorher nur die Turniere mit ID-Präfix `testturnier-` (Meldungen, Runden,
// Partien und Teams per ON DELETE CASCADE) und legt sie im Anmeldestatus neu an. Nur lokal, nie --remote.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

if (process.argv.includes('--remote')) {
  console.error('Testturniere werden nur in der lokalen D1 angelegt.');
  process.exit(1);
}

const TEST_USERS_SQL = '.dev.vars.test-users.sql';
const ORGANIZER_EMAIL = 'ptm-turnierleiter@example.test';
const PLAYER_EMAIL = 'ptm-user@example.test';

function wrangler(...args) {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', ...args], { encoding: 'utf8' });
}

function query(sql) {
  return JSON.parse(wrangler('--json', '--command', sql))[0].results;
}

// Die Testkonten liegen gitignoriert im Repo (Upsert, daher gefahrlos wiederholbar).
if (existsSync(TEST_USERS_SQL)) wrangler('--yes', '--file', TEST_USERS_SQL);

const accounts = new Map(query(`SELECT id, email, first_name, last_name FROM users
  WHERE email IN ('${ORGANIZER_EMAIL}', '${PLAYER_EMAIL}')`).map((row) => [row.email, row]));
const organizer = accounts.get(ORGANIZER_EMAIL);
const player = accounts.get(PLAYER_EMAIL);
if (!organizer || !player) {
  console.error(`Testkonten ${ORGANIZER_EMAIL} und ${PLAYER_EMAIL} fehlen in der lokalen D1 (${TEST_USERS_SQL}).`);
  process.exit(1);
}

const TOURNAMENTS = [
  { id: 'testturnier-schweizer', name: 'TEST Schweizer Doublette', type: 'schweizer', formation: 'doublette', registrationType: 'forme', count: 70 },
  { id: 'testturnier-formule-x', name: 'TEST Formule X Triplette', type: 'formule_x', formation: 'triplette', registrationType: 'forme', count: 70 },
  { id: 'testturnier-ko', name: 'TEST KO Tête', type: 'ko', formation: 'tete', registrationType: 'forme', count: 70 },
  { id: 'testturnier-jgj', name: 'TEST Jeder gegen jeden Doublette', type: 'jeder_gegen_jeden', formation: 'doublette', registrationType: 'forme', count: 8 },
  { id: 'testturnier-melee', name: 'TEST Mêlée Schweizer Doublette', type: 'schweizer', formation: 'doublette', registrationType: 'melee', count: 70 },
  { id: 'testturnier-supermelee', name: 'TEST Supermêlée Triplette', type: 'rangliste', formation: 'triplette', registrationType: 'supermelee', count: 70 },
];

const FIRST_NAMES = ['Anna', 'Bernd', 'Claire', 'Dieter', 'Elif', 'Frank', 'Gisela', 'Hans', 'Ines', 'Jean', 'Karin', 'Lukas',
  'Marie', 'Nico', 'Olga', 'Pierre', 'Rita', 'Stefan', 'Tanja', 'Uwe', 'Vera', 'Walter', 'Yvonne', 'Zeynep'];
const LAST_NAMES = ['Adler', 'Becker', 'Dubois', 'Engel', 'Fischer', 'Garnier', 'Hoffmann', 'Jansen', 'Keller', 'Lambert',
  'Meyer', 'Neumann', 'Peters', 'Richter', 'Schulz', 'Thomas', 'Vogel', 'Wagner', 'Yilmaz', 'Zimmermann', 'Martin'];
const CLUBS = ['Boule Club Musterstadt', 'Pétanque Freunde Nord', 'BC Rheinufer', 'Club Bouliste Süd', 'PC Am Park'];

const quote = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
const now = new Date().toISOString();

let personCounter = 0;
function person(tournamentId) {
  const index = personCounter++;
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  return { first, last, email: `testspieler-${tournamentId.replace('testturnier-', '')}-${index + 1}@example.test`, club: CLUBS[index % CLUBS.length] };
}

function registration(tournament, number) {
  personCounter = (number - 1) * 3;
  const own = number === 1
    ? { first: player.first_name, last: player.last_name, email: player.email, club: CLUBS[0] }
    : person(tournament.id);
  const partners = tournament.registrationType !== 'forme' ? 0 : { tete: 0, doublette: 1, triplette: 2 }[tournament.formation];
  const partner = partners >= 1 ? person(tournament.id) : null;
  const partner2 = partners >= 2 ? person(tournament.id) : null;
  // Aufsteigende Anmeldezeit hält die Meldeliste in Nummernreihenfolge.
  const registeredAt = new Date(Date.parse(now) - (tournament.count - number + 1) * 60_000).toISOString();
  const values = {
    id: `${tournament.id}-r${String(number).padStart(3, '0')}`,
    tournament_id: tournament.id,
    first_name: own.first,
    last_name: own.last,
    email: own.email,
    player_email: own.email,
    club: own.club,
    partner_first_name: partner?.first,
    partner_last_name: partner?.last,
    partner_email: partner?.email,
    partner_club: partner?.club,
    partner2_first_name: partner2?.first,
    partner2_last_name: partner2?.last,
    partner2_email: partner2?.email,
    partner2_club: partner2?.club,
    status: 'confirmed',
    registered_at: registeredAt,
    confirmed_at: registeredAt,
    created_at: registeredAt,
    updated_at: registeredAt,
    cancel_token: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''),
    user_id: number === 1 ? player.id : null,
    registrant_user_id: number === 1 ? player.id : null,
  };
  return `INSERT INTO registrations (${Object.keys(values).join(', ')}) VALUES (${Object.values(values).map(quote).join(', ')});`;
}

function tournamentInsert(tournament) {
  const values = {
    id: tournament.id,
    owner_id: organizer.id,
    creator_id: organizer.id,
    name: tournament.name,
    date: today,
    start_time: '10:00',
    location: 'Musterstadt',
    description: 'Lokales Testturnier, angelegt von scripts/seed-test-tournaments.mjs',
    type: tournament.type,
    formation: tournament.formation,
    registration_type: tournament.registrationType,
    status: 'registration',
    visibility: 'public',
    participants_public: 1,
    live_view_enabled: 1,
    player_result_reporting_enabled: 1,
    created_at: now,
    updated_at: now,
  };
  return `INSERT INTO tournaments (${Object.keys(values).join(', ')}) VALUES (${Object.values(values).map(quote).join(', ')});`;
}

const statements = [
  "DELETE FROM tournaments WHERE id LIKE 'testturnier-%';",
  ...TOURNAMENTS.flatMap((tournament) => [
    tournamentInsert(tournament),
    ...Array.from({ length: tournament.count }, (_, index) => registration(tournament, index + 1)),
  ]),
];

mkdirSync('.wrangler/tmp', { recursive: true });
const file = join('.wrangler/tmp', 'seed-test-tournaments.sql');
writeFileSync(file, `${statements.join('\n')}\n`);
wrangler('--yes', '--file', file);

const counts = new Map(query(`SELECT tournament_id, COUNT(*) AS count FROM registrations
  WHERE tournament_id LIKE 'testturnier-%' GROUP BY tournament_id`).map((row) => [row.tournament_id, row.count]));
console.log(`\nTestturniere für ${today} angelegt:`);
for (const tournament of TOURNAMENTS) {
  console.log(`  ${tournament.name.padEnd(34)} ${String(counts.get(tournament.id) || 0).padStart(3)} Meldungen  http://localhost:8787/turniere/${tournament.id}`);
}
console.log(`
Turnierleitung: ${ORGANIZER_EMAIL}, Spieler mit Live-Ansicht: ${PLAYER_EMAIL} (Passwort: .dev.vars.test-users.md)
Ablauf: Turnier starten → bei Mêlée Teams auslosen → Runde erzeugen → als ${PLAYER_EMAIL} unter /live Ergebnis melden.
Erneut ausführen setzt alle Testturniere zurück.`);
