// @vitest-environment node
// Sperrliste nach Turniernamen für den Pétanque-Aktuell-Import (app_settings).
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { readPetanqueAktuellBlacklist, updatePetanqueAktuellBlacklist } from './worker.js';

describe('Pétanque-Aktuell-Sperrliste', () => {
  let db;
  const admin = { id: 'admin-1' };
  const speichern = (patterns) => updatePetanqueAktuellBlacklist(new Request('https://ptmonline.org/api/admin/petanque-aktuell/blacklist', {
    method: 'PUT', body: JSON.stringify({ patterns }),
  }), db, admin);

  beforeEach(() => {
    db = d1MitSchema();
  });

  it('ist ohne Einstellung leer und speichert bereinigte Muster mit Audit-Eintrag', async () => {
    expect(await readPetanqueAktuellBlacklist(db)).toEqual([]);
    const response = await speichern([' *Liga* ', '*Liga*', '', '/meisterschaft/']);
    expect(await response.json()).toEqual({ blacklist: ['*Liga*', '/meisterschaft/'] });
    expect(await readPetanqueAktuellBlacklist(db)).toEqual(['*Liga*', '/meisterschaft/']);
    expect(db.sqlite.prepare("SELECT action, target FROM audit_log WHERE action = 'setting_changed'").all())
      .toEqual([{ action: 'setting_changed', target: 'petanque_aktuell_name_blacklist' }]);
  });

  it('lehnt ungültige Muster, zu viele Muster und Nicht-Listen ab', async () => {
    await expect(speichern(['/(/'])).rejects.toMatchObject({ status: 400 });
    await expect(speichern(['*'])).rejects.toMatchObject({ status: 400 });
    await expect(speichern(Array.from({ length: 201 }, (_, index) => `Turnier ${index}`))).rejects.toMatchObject({ status: 400 });
    await expect(speichern('Liga')).rejects.toMatchObject({ status: 400 });
    expect(await readPetanqueAktuellBlacklist(db)).toEqual([]);
  });

  it('liest eine beschädigte Einstellung als leere Liste', async () => {
    db.sqlite.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('petanque_aktuell_name_blacklist', 'kein json', '2026-10-15')").run();
    expect(await readPetanqueAktuellBlacklist(db)).toEqual([]);
  });
});
