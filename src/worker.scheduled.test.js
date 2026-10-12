// @vitest-environment node
// Der Stunden-Cron schließt nur tatsächlich vergessene, laufende Turniere.
import { beforeEach, describe, expect, it } from 'vitest';
import worker from './worker.js';
import { d1MitSchema } from './test-support/d1.js';

describe('Stündlicher Turnierabschluss', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const row = (statement, ...params) => env.DB.sqlite.prepare(statement).get(...params);

  beforeEach(() => {
    env = { DB: d1MitSchema() };
    // Der Stunden-Cron bereinigt auch unbestätigte Altkonten. Die Turnierleitung
    // muss deshalb als verifiziert angelegt sein, damit dieser Test nur den
    // Turnierabschluss prüft und nicht den separaten Kontobereinigungsjob.
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, email_verified_at, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01', '2026-01-01')`);
  });

  async function runHourlyCron() {
    let work;
    await worker.scheduled({ cron: '0 * * * *' }, env, { waitUntil: (promise) => { work = promise; } });
    await work;
  }

  it('schließt ein seit mehr als 48 Stunden laufendes Turnier und informiert nur die Leitung', async () => {
    sql(`INSERT INTO tournaments (id, owner_id, name, date, start_time, location, formation, status, visibility, created_at, updated_at)
      VALUES ('old', 'owner', 'Vergessenes Turnier', '2000-01-01', '10:00', 'Ort', 'tete', 'running', 'public', '2000-01-01', '2000-01-01')`);

    await runHourlyCron();

    expect(row("SELECT status FROM tournaments WHERE id = 'old'").status).toBe('finished');
    const notification = row("SELECT recipient_id, event_type, event_data FROM postbox_messages WHERE recipient_id = 'owner'");
    expect(notification).toMatchObject({ recipient_id: 'owner', event_type: 'tournament_status_changed' });
    expect(JSON.parse(notification.event_data)).toMatchObject({ tournamentId: 'old', status: 'finished', automatic: true });
  });

  it('lässt nicht laufende und noch aktuelle Turniere unverändert', async () => {
    sql(`INSERT INTO tournaments (id, owner_id, name, date, start_time, location, formation, status, visibility, created_at, updated_at)
      VALUES ('registration', 'owner', 'Anmeldung offen', '2000-01-01', '10:00', 'Ort', 'tete', 'registration', 'public', '2000-01-01', '2000-01-01'),
             ('future', 'owner', 'Zukünftiges Turnier', '2099-01-01', '10:00', 'Ort', 'tete', 'running', 'public', '2099-01-01', '2099-01-01')`);

    await runHourlyCron();

    expect(row("SELECT status FROM tournaments WHERE id = 'registration'").status).toBe('registration');
    expect(row("SELECT status FROM tournaments WHERE id = 'future'").status).toBe('running');
    expect(row('SELECT COUNT(*) AS count FROM postbox_messages').count).toBe(0);
  });
});
