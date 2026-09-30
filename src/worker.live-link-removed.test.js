// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import worker, { executeSyncWrite, upsertDocumentRegistration } from './worker.js';

const ONLINE_ID = '44444444-4444-4444-8444-444444444444';
const LOKALE_ID = '55555555-5555-4555-8555-555555555555';

describe('Check-in ohne Live-Link-E-Mail (E-09)', () => {
  let env;
  const turnier = () => env.DB.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const postbox = () => env.DB.sqlite.prepare('SELECT recipient_id, event_type FROM postbox_messages').all();

  function einchecken(revision) {
    const request = syncAnfrage('PUT', `/api/sync/tournaments/t1/registrations/${LOKALE_ID}`, {
      onlineRegistrationId: ONLINE_ID, expectedExecutionRevision: revision, participation: 'active',
    });
    return executeSyncWrite(request, env.DB, turnier(), () => upsertDocumentRegistration(request, env, turnier(), LOKALE_ID));
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    env.DB.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01'),
             ('u2', 'spielerin@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    env.DB.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility,
        created_at, updated_at, document_managed, desktop_execution)
      VALUES ('t1', 'u1', 'Turnier', '2026-09-28', 'Ort', 'tete', 'running', 'public', '2026-09-01', '2026-09-01', 1, 1)`).run();
    env.DB.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation,
        registered_at, created_at, updated_at, execution_revision, user_id)
      VALUES (?, 't1', 'Maria', 'Bieder', 'spielerin@example.test', 'confirmed', 'inactive', '2026-09-01', '2026-09-01',
        '2026-09-01', 1, 'u2')`).run(ONLINE_ID);
    bindeDokument(env.DB.sqlite, 't1');
  });

  it('benachrichtigt das verknüpfte Konto einmalig per Postfach und verschickt keine E-Mail', async () => {
    await einchecken(1);
    env.DB.sqlite.prepare("UPDATE registrations SET participation = 'inactive' WHERE id = ?").run(ONLINE_ID);
    await einchecken(2);

    expect(postbox()).toEqual([{ recipient_id: 'u2', event_type: 'live_view_available' }]);
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalledWith(expect.objectContaining({ to: 'spielerin@example.test' }));
  });

  it('kennt keinen Live-Link per Token mehr', async () => {
    const antwort = await worker.fetch(new Request('https://ptm.test/api/live/token/abc'), env);

    expect(antwort.status).toBe(404);
  });
});
