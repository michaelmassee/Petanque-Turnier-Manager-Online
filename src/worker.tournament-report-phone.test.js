// @vitest-environment node
// „Turnier melden“: optionale Kontakt-Telefonnummer wird geprüft und als Turnierkontakt gespeichert.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { createTournamentReport } from './worker.js';

const url = new URL('http://localhost/api/tournament-reports');
const meldung = (felder) => new Request(url, { method: 'POST', body: JSON.stringify({
  club: 'BC Linden', name: 'Sommerturnier', location: 'Berlin', date: '2027-06-01', formation: 'doublette',
  websiteUrl: 'https://example.org/turnier', contactName: 'Anna Schmidt', contactEmail: 'anna@example.test',
  consentAccepted: true, language: 'de', ...felder,
}) });

describe('Turnier melden: Kontakt-Telefon', () => {
  let db;
  const env = () => ({ DB: db });

  beforeEach(() => {
    db = d1MitSchema();
    db.sqlite.exec(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('admin', 'admin@example.test', 'Ada', 'Admin', 'admin', 's', 'h', '2026-01-01', '2026-01-01')`);
    // Geokodierung des Orts ohne Netz: kein Treffer.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { headers: { 'Content-Type': 'application/json' } }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('speichert die Nummer als Turnierkontakt', async () => {
    await createTournamentReport(meldung({ contactPhone: '+49 171 1234567' }), env(), url);
    expect(db.sqlite.prepare("SELECT contact_name, contact_email, contact_phone FROM tournaments WHERE name = 'Sommerturnier'").get())
      .toEqual({ contact_name: 'Anna Schmidt', contact_email: 'anna@example.test', contact_phone: '+49 171 1234567' });
  });

  it('bleibt ohne Nummer leer und lehnt ungültige Nummern ab', async () => {
    await createTournamentReport(meldung({}), env(), url);
    expect(db.sqlite.prepare("SELECT contact_phone FROM tournaments WHERE name = 'Sommerturnier'").get().contact_phone).toBeNull();

    await expect(createTournamentReport(meldung({ name: 'Anderes Turnier', contactPhone: 'abc' }), env(), url)).rejects.toMatchObject({ status: 400 });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM tournaments WHERE name = 'Anderes Turnier'").get().n).toBe(0);
  });
});
