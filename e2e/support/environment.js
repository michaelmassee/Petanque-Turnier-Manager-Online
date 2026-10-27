// Isolierte E2E-Umgebung unter .wrangler/e2e/: eigene Wrangler-Konfiguration, eigenes dist/ und eigener D1-State.
// So bleiben der Dev-Server des Entwicklers (Port 8787, dist/) und seine lokale D1 unberührt.
import { readFileSync, writeFileSync } from 'node:fs';
import { localD1 } from '../../scripts/lib/test-tournament-data.mjs';

export const PORT = 8788;
export const BASE_URL = `http://localhost:${PORT}`;
export const E2E_DIR = '.wrangler/e2e';
export const CONFIG = `${E2E_DIR}/wrangler.json`;
export const STATE = `${E2E_DIR}/state`;
export const DIST = `${E2E_DIR}/dist`;
export const ENV_FILE = `${E2E_DIR}/e2e.env`;
export const LOG = `${E2E_DIR}/wrangler.log`;

// Variablen, die nie in den E2E-Worker gelangen dürfen: Mit ihnen gingen echte Mails an die Testadressen.
export const FORBIDDEN_VARS = ['RESEND_API_KEY', 'STRATO_SMTP_USER', 'STRATO_SMTP_PASSWORD', 'TURNSTILE_SECRET_KEY'];

export const d1 = localD1({ config: CONFIG, persistTo: STATE });

// Kopie von wrangler.jsonc mit Pfaden relativ zu .wrangler/e2e/. Ohne die Custom-Domain-Route schreibt
// wrangler dev den Host nicht auf ptmonline.org um, Links in Antworten zeigen also auf localhost.
export function writeWranglerConfig() {
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  delete config.$schema;
  delete config.routes;
  config.main = '../../src/worker.js';
  config.assets = { ...config.assets, directory: './dist' };
  config.d1_databases = config.d1_databases.map((database) => ({ ...database, migrations_dir: '../../migrations' }));
  writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
}

// --env-file ersetzt .dev.vars vollständig; damit fehlen Mail- und Turnstile-Schlüssel (Mails landen nur im Log).
export function writeEnvFile() {
  writeFileSync(ENV_FILE, 'E2E=1\n');
}
