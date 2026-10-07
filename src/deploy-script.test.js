// @vitest-environment node
// Release-Ablauf: Bestandskonten brauchen einen Benutzernamen. Der Backfill läuft nach der Migration und noch einmal
// nach dem Deploy (Konten, die der alte Worker zwischenzeitlich ohne Namen angelegt hat).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
const steps = (script) => script.split('&&').map((step) => step.trim());

describe('Deploy-Ablauf', () => {
  it('führt Migration, Backfill, Deploy und erneut Backfill in dieser Reihenfolge aus', () => {
    const deploy = steps(scripts.deploy);
    const migrate = deploy.indexOf('npm run db:migrate:remote');
    const firstBackfill = deploy.indexOf('npm run db:backfill:remote');
    const release = deploy.indexOf('wrangler deploy');
    const lastBackfill = deploy.lastIndexOf('npm run db:backfill:remote');

    expect(migrate).toBeGreaterThan(-1);
    expect(firstBackfill).toBeGreaterThan(migrate);
    expect(release).toBeGreaterThan(firstBackfill);
    expect(lastBackfill).toBeGreaterThan(release);
    expect(scripts['db:backfill:remote']).toContain('backfill-usernames.mjs --remote --apply');
  });

  it('vergibt auch lokal nach der Migration fehlende Benutzernamen', () => {
    const dev = steps(scripts.dev);
    expect(dev.indexOf('npm run db:backfill:local')).toBeGreaterThan(dev.indexOf('npm run db:migrate:local'));
    expect(scripts['db:backfill:local']).toContain('backfill-usernames.mjs --local --apply');
  });
});
