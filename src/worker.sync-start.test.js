// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { startTournamentFromSync } from './worker.js';


describe('Turnierstart aus dem Turnierdokument bei bereits laufendem Online-Turnier', () => {
  let env;
  const user = { id: 'u1', role: 'user' };
  const turnier = () => env.DB.sqlite.prepare('SELECT * FROM tournaments WHERE id = ?').get('t1');

  beforeEach(() => {
    env = { DB: d1MitSchema() };
    env.DB.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    env.DB.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at,
        document_managed, sync_document_id, desktop_execution)
      VALUES ('t1', 'u1', 'Turnier', '2026-09-28', 'Ort', 'doublette', 'running', 'public', '2026-09-01', '2026-09-01', 1, 'doc-1', 0)`).run();
  });

  it('übernimmt die Durchführung, solange online noch keine Runde ausgelost wurde', async () => {
    const response = await startTournamentFromSync(env, turnier(), user);

    expect(response.status).toBe(200);
    expect(turnier()).toMatchObject({ status: 'running', desktop_execution: 1 });
  });

  it('lehnt die Übernahme ab, wenn das Turnier online mit Runden durchgeführt wird', async () => {
    env.DB.sqlite.prepare(`INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at)
      VALUES ('r1', 't1', 1, '2026-09-28')`).run();

    await expect(startTournamentFromSync(env, turnier(), user)).rejects.toMatchObject({ status: 409 });
    expect(turnier().desktop_execution).toBe(0);
  });

  it('bleibt bei bereits übernommener Desktop-Durchführung trotz Runden idempotent', async () => {
    env.DB.sqlite.prepare('UPDATE tournaments SET desktop_execution = 1 WHERE id = ?').run('t1');
    env.DB.sqlite.prepare(`INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at)
      VALUES ('r1', 't1', 1, '2026-09-28')`).run();

    const response = await startTournamentFromSync(env, turnier(), user);

    expect(response.status).toBe(200);
    expect(turnier().desktop_execution).toBe(1);
  });
});
