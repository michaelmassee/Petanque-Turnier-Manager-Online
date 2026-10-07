// Vergibt Bestandskonten ohne Benutzernamen einen Namen nach derselben Logik wie Registrierung/OAuth
// (src/lib/username.js). Ältere Konten zuerst, damit sie bei Namensgleichheit den Namen ohne Zahl erhalten.
// Die Namen gelten als unbestätigt (username_confirmed_at bleibt NULL), die Nutzer sehen einen Hinweis.
//
//   node scripts/backfill-usernames.mjs --local            # SQL erzeugen und anzeigen
//   node scripts/backfill-usernames.mjs --local --apply    # zusätzlich ausführen
//   node scripts/backfill-usernames.mjs --remote --apply   # Produktion; läuft automatisch in `npm run deploy`
//
// Idempotent: berührt nur Konten ohne Benutzernamen. Mit --apply endet es mit Fehlercode, wenn danach noch Konten
// ohne Benutzernamen übrig sind – `npm run deploy` bricht dann ab.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firstFreeUsername, usernameCandidates } from '../src/lib/username.js';

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

const SYSTEM_USERNAMES = { 'system-tournament-reports': 'ptm.system' };

const users = query('SELECT id, first_name, last_name FROM users WHERE username IS NULL ORDER BY created_at, id');
const taken = new Set([
  ...query('SELECT username FROM users WHERE username IS NOT NULL').map((row) => row.username),
  ...query('SELECT username FROM blocked_usernames').map((row) => row.username),
]);

function pick(user) {
  // Reservierte Namen sind für normale Konten gesperrt; der System-User erhält einen festen.
  if (SYSTEM_USERNAMES[user.id] && !taken.has(SYSTEM_USERNAMES[user.id])) return SYSTEM_USERNAMES[user.id];
  const username = firstFreeUsername(usernameCandidates(user.first_name, user.last_name), taken);
  if (!username) throw new Error(`Kein freier Benutzername für ${user.id}`);
  return username;
}

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const statements = users.map((user) => {
  const username = pick(user);
  taken.add(username);
  return `UPDATE users SET username = ${quote(username)} WHERE id = ${quote(user.id)} AND username IS NULL;`;
});

if (statements.length === 0) {
  console.log('Alle Konten haben bereits einen Benutzernamen.');
  process.exit(0);
}

const file = join(mkdtempSync(join(tmpdir(), 'ptm-usernames-')), 'backfill.sql');
writeFileSync(file, `${statements.join('\n')}\n`);
console.log(`${statements.length} Konten ohne Benutzernamen, SQL: ${file}`);
console.log(statements.slice(0, 20).join('\n'));

if (args.has('--apply')) {
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', target, '--yes', '--file', file], { stdio: 'inherit' });
  const [rest] = query('SELECT COUNT(*) AS count FROM users WHERE username IS NULL');
  console.log(`Ohne Benutzernamen danach: ${rest.count}`);
  if (rest.count !== 0) process.exit(1);
}
