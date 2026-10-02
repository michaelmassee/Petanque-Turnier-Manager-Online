// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { updateTournamentPublication } from './worker.js';


function anfrage(body) {
  return new Request('https://ptm.test/api/tournaments/t1/publication', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('Status und Sichtbarkeit eines Turniers mit verbundenem Turnierdokument', () => {
  let env;
  const user = { id: 'u1', role: 'user' };
  const turnier = () => env.DB.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();

  beforeEach(() => {
    env = { DB: d1MitSchema() };
    env.DB.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    env.DB.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility,
        created_at, updated_at, document_managed, sync_document_id)
      VALUES ('t1', 'u1', 'Turnier', '2026-10-04', 'Ort', 'triplette', 'draft', 'private', '2026-09-01', '2026-09-01', 1, 'doc-1')`).run();
  });

  it('öffnet die Anmeldung eines verbundenen Entwurfs', async () => {
    const response = await updateTournamentPublication(anfrage({ status: 'registration', visibility: 'private' }),
      env, turnier(), user);

    expect(response.status).toBe(200);
    expect(turnier()).toMatchObject({ status: 'registration', visibility: 'private', document_managed: 1 });
  });

  it('setzt "Läuft" nicht, das bleibt dem Turnierstart vorbehalten', async () => {
    await expect(updateTournamentPublication(anfrage({ status: 'running', visibility: 'private' }), env, turnier(), user))
      .rejects.toMatchObject({ status: 400 });
    expect(turnier().status).toBe('draft');
  });

  it('schließt ein laufendes Turnier nur ab', async () => {
    env.DB.sqlite.prepare("UPDATE tournaments SET status = 'running' WHERE id = 't1'").run();

    await expect(updateTournamentPublication(anfrage({ status: 'registration', visibility: 'private' }), env, turnier(), user))
      .rejects.toMatchObject({ status: 409 });
    await updateTournamentPublication(anfrage({ status: 'finished', visibility: 'private' }), env, turnier(), user);
    expect(turnier().status).toBe('finished');
  });

  it('lehnt eine ungültige Sichtbarkeit ab', async () => {
    await expect(updateTournamentPublication(anfrage({ status: 'draft', visibility: 'geheim' }), env, turnier(), user))
      .rejects.toMatchObject({ status: 400 });
  });
});
