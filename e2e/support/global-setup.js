// Baut die App, legt eine frische E2E-D1 mit Testkonten und Testturnieren an und startet wrangler dev auf Port 8788.
// Die zurückgegebene Funktion beendet den Server wieder (Playwright ruft sie als globales Teardown auf).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ORGANIZER_EMAIL, TEST_USERS_SQL, berlinToday } from '../../scripts/lib/test-tournament-data.mjs';
import { e2eSeedStatements } from './data.js';
import {
  BASE_URL, CONFIG, DIST, E2E_DIR, ENV_FILE, FORBIDDEN_VARS, LOG, PORT, STATE, d1, writeEnvFile, writeWranglerConfig,
} from './environment.js';

const npx = (...args) => execFileSync('npx', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

async function isUp() {
  try {
    return (await fetch(`${BASE_URL}/api/tournaments`)).ok;
  } catch {
    return false;
  }
}

async function waitUntilUp(child, timeoutMs = 90_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`wrangler dev ist beendet (Exit ${child.exitCode}), siehe ${LOG}`);
    if (await isUp()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`wrangler dev antwortet nicht auf ${BASE_URL}, siehe ${LOG}`);
}

export default async function globalSetup() {
  if (await isUp()) throw new Error(`Port ${PORT} ist schon belegt – läuft noch ein E2E-Server?`);
  if (!existsSync(TEST_USERS_SQL)) throw new Error(`${TEST_USERS_SQL} fehlt (lokale Testkonten, siehe .dev.vars.test-users.md).`);

  mkdirSync(E2E_DIR, { recursive: true });
  rmSync(STATE, { recursive: true, force: true });
  writeWranglerConfig();
  writeEnvFile();

  npx('vite', 'build', '--outDir', DIST, '--emptyOutDir', '--logLevel', 'warn');
  npx('wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '-c', CONFIG, '--persist-to', STATE);
  d1.file(TEST_USERS_SQL);
  const [organizer] = d1.query(`SELECT id FROM users WHERE email = '${ORGANIZER_EMAIL}'`);
  const seedFile = `${E2E_DIR}/seed.sql`;
  writeFileSync(seedFile, `${e2eSeedStatements({ organizer, today: berlinToday() }).join('\n')}\n`);
  d1.file(seedFile);

  const log = openSync(LOG, 'w');
  // Eigene Prozessgruppe, damit das Teardown auch die workerd-Kindprozesse beendet.
  const child = spawn('npx', ['wrangler', 'dev', '-c', CONFIG, '--port', String(PORT), '--ip', '127.0.0.1',
    '--persist-to', STATE, '--env-file', ENV_FILE, '--show-interactive-dev-session=false'], { detached: true, stdio: ['ignore', log, log] });
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // schon beendet
    }
  };
  try {
    await waitUntilUp(child);
    const bindings = readFileSync(LOG, 'utf8');
    const leaked = FORBIDDEN_VARS.filter((name) => bindings.includes(`env.${name}`));
    if (leaked.length) throw new Error(`E2E-Worker hat geheime Variablen geladen: ${leaked.join(', ')}`);
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
