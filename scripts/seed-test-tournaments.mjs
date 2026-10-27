// Legt in der lokalen Dev-D1 für manuelle Tests je ein Testturnier pro online durchführbarem System an:
// komplett angemeldet (bestätigte Meldungen), Datum heute, sofort startbar, Live-Ansicht und Ergebnismeldung
// durch Spieler freigegeben. Das Testkonto ptm-user@example.test ist in jedem Turnier mit Meldung 1 verknüpft.
//
//   npm run db:seed:testturniere
//
// Beliebig oft ausführbar: löscht vorher nur die Turniere mit ID-Präfix `testturnier-` (Meldungen, Runden,
// Partien und Teams per ON DELETE CASCADE) und legt sie im Anmeldestatus neu an. Nur lokal, nie --remote.
// Die Daten selbst erzeugt scripts/lib/test-tournament-data.mjs (auch von den E2E-Tests genutzt).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ORGANIZER_EMAIL, PLAYER_EMAIL, TEST_USERS_SQL, TOURNAMENTS, berlinToday, localD1, seedStatements,
} from './lib/test-tournament-data.mjs';

if (process.argv.includes('--remote')) {
  console.error('Testturniere werden nur in der lokalen D1 angelegt.');
  process.exit(1);
}

const d1 = localD1();

// Die Testkonten liegen gitignoriert im Repo (Upsert, daher gefahrlos wiederholbar).
if (existsSync(TEST_USERS_SQL)) d1.file(TEST_USERS_SQL);

const accounts = new Map(d1.query(`SELECT id, email, first_name, last_name FROM users
  WHERE email IN ('${ORGANIZER_EMAIL}', '${PLAYER_EMAIL}')`).map((row) => [row.email, row]));
const organizer = accounts.get(ORGANIZER_EMAIL);
const player = accounts.get(PLAYER_EMAIL);
if (!organizer || !player) {
  console.error(`Testkonten ${ORGANIZER_EMAIL} und ${PLAYER_EMAIL} fehlen in der lokalen D1 (${TEST_USERS_SQL}).`);
  process.exit(1);
}

const today = berlinToday();
const statements = seedStatements({ tournaments: TOURNAMENTS, idPrefix: 'testturnier-', organizer, accounts: { 1: player }, today });

mkdirSync('.wrangler/tmp', { recursive: true });
const file = join('.wrangler/tmp', 'seed-test-tournaments.sql');
writeFileSync(file, `${statements.join('\n')}\n`);
d1.file(file);

const counts = new Map(d1.query(`SELECT tournament_id, COUNT(*) AS count FROM registrations
  WHERE tournament_id LIKE 'testturnier-%' GROUP BY tournament_id`).map((row) => [row.tournament_id, row.count]));
console.log(`\nTestturniere für ${today} angelegt:`);
for (const tournament of TOURNAMENTS) {
  console.log(`  ${tournament.name.padEnd(34)} ${String(counts.get(tournament.id) || 0).padStart(3)} Meldungen  http://localhost:8787/turniere/${tournament.id}`);
}
console.log(`
Turnierleitung: ${ORGANIZER_EMAIL}, Spieler mit Live-Ansicht: ${PLAYER_EMAIL} (Passwort: .dev.vars.test-users.md)
Ablauf: Turnier starten → bei Mêlée Teams auslosen → Runde erzeugen → als ${PLAYER_EMAIL} unter /live Ergebnis melden.
Erneut ausführen setzt alle Testturniere zurück.`);
