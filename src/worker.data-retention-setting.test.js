// @vitest-environment node
// Admin-Schalter für die automatische Löschung personenbezogener Daten (DS-04): standardmäßig aus, damit ein Deploy
// nicht ungeprüft historische Turnierdaten pseudonymisiert.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import {
  getDataRetentionSettings, isAutomaticPurgeEnabled, purgeExpiredPersonalDataWennAktiviert, updateDataRetentionSettings,
} from './worker.js';

describe('Schalter automatische Datenlöschung', () => {
  let db;
  const sql = (statement, ...params) => db.sqlite.prepare(statement).run(...params);
  const zeile = (statement, ...params) => db.sqlite.prepare(statement).get(...params);
  const admin = { id: 'admin', role: 'admin' };
  const jetzt = new Date('2026-10-02T00:00:00Z');

  function schalten(automaticPurgeEnabled) {
    return updateDataRetentionSettings(new Request('https://ptm.test/api/admin/settings/data-retention', {
      method: 'PUT', body: JSON.stringify({ automaticPurgeEnabled }),
    }), db, admin);
  }

  beforeEach(() => {
    db = d1MitSchema();
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('admin', 'admin@example.test', 'admin', 'salt', 'hash', '2026-01-01', '2026-01-01')`);
    // Beendet und älter als 12 Monate: fällig. Beendet, aber jung: nicht fällig.
    for (const [id, datum] of [['alt', '2025-01-10'], ['jung', '2026-09-01']]) {
      sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
        VALUES (?, 'admin', ?, ?, 'Ort', 'doublette', 'finished', 'public', '2025-01-01', '2025-01-01')`, id, id, datum);
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, registered_at, created_at, updated_at)
        VALUES (?, ?, 'Anna', 'Adler', 'anna@example.test', 'confirmed', '2025-01-01', '2025-01-01', '2025-01-01')`, `r-${id}`, id);
    }
  });

  it('ist ohne Einstellung aus und löscht nichts', async () => {
    expect(await isAutomaticPurgeEnabled(db)).toBe(false);

    await purgeExpiredPersonalDataWennAktiviert(db, jetzt);

    expect(zeile("SELECT email FROM registrations WHERE id = 'r-alt'").email).toBe('anna@example.test');
    expect(zeile("SELECT personal_data_purged_at FROM tournaments WHERE id = 'alt'").personal_data_purged_at).toBeNull();
  });

  it('nennt vor dem Einschalten die Zahl der fälligen Turniere', async () => {
    const antwort = await (await getDataRetentionSettings(db, jetzt)).json();

    expect(antwort).toEqual({ automaticPurgeEnabled: false, dueTournaments: 1 });
  });

  it('löscht erst nach dem Einschalten und protokolliert den Wechsel', async () => {
    const antwort = await (await schalten(true)).json();

    expect(antwort.automaticPurgeEnabled).toBe(true);
    expect(JSON.parse(zeile("SELECT details_json FROM audit_log WHERE action = 'setting_changed'").details_json))
      .toEqual({ enabled: true });

    await purgeExpiredPersonalDataWennAktiviert(db, jetzt);

    expect(zeile("SELECT email FROM registrations WHERE id = 'r-alt'").email).toMatch(/@ohne-email\.invalid$/);
    expect(zeile("SELECT email FROM registrations WHERE id = 'r-jung'").email).toBe('anna@example.test');
  });

  it('lässt sich wieder ausschalten', async () => {
    await schalten(true);
    await schalten(false);

    await purgeExpiredPersonalDataWennAktiviert(db, jetzt);

    expect(await isAutomaticPurgeEnabled(db)).toBe(false);
    expect(zeile("SELECT email FROM registrations WHERE id = 'r-alt'").email).toBe('anna@example.test');
  });

  it('lehnt einen Wert ab, der kein Wahrheitswert ist', async () => {
    await expect(schalten('ja')).rejects.toMatchObject({ status: 400 });
  });
});
