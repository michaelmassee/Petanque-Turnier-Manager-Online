// @vitest-environment node
// Teilnehmer-Limit pro Turnier (Missbrauchsschutz, 2026-10-30): höchstens so viele Meldungen (pending, confirmed,
// waitlist), wie der Besitzer des Turniers darf; Admins sind ausgenommen. Gilt für alle Anmeldewege.
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import worker, { createRegistration, executeSyncWrite, getRegistrationWithTournament, updateRegistration, upsertDocumentRegistration } from './worker.js';

const LOKALE_ID = '55555555-5555-4555-8555-555555555555';
const LIMIT_ERREICHT = { status: 409, details: { code: 'participant_limit_reached' } };

describe('Teilnehmer-Limit pro Turnier', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const turnier = () => env.DB.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const anzahl = () => env.DB.sqlite.prepare("SELECT COUNT(*) AS count FROM registrations WHERE tournament_id = 't1'").get().count;

  function vorhanden(id, status) {
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, registered_at, created_at, updated_at)
      VALUES (?, 't1', ?, 'Vorhanden', ?, ?, '2026-09-01', '2026-09-01', '2026-09-01')`, id, id, `${id}@example.test`, status);
  }

  let laufendeNummer = 0;
  function anmelden(optionen = {}) {
    laufendeNummer += 1;
    const request = new Request('https://ptm.test/api/tournaments/t1/registrations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: `Neu${laufendeNummer}`, lastName: 'Anmeldung', playerEmail: `neu${laufendeNummer}@example.test`,
        publicationNoticeAccepted: true, personsConsentAccepted: true, feeSelections: [], registrationAnswers: [] }),
    });
    return createRegistration(request, env, turnier(), optionen);
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, participant_limit, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', 2, '2026-09-01', '2026-09-01'),
             ('admin', 'admin@example.test', 'admin', 'salt', 'hash', 2, '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES
      ('u1-session', 'u1', '2099-01-01T00:00:00.000Z', '2026-09-01'),
      ('admin-session', 'admin', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at,
        max_registrations, waitlist_enabled)
      VALUES ('t1', 'u1', 'Turnier', '2099-09-28', 'Ort', 'tete', 'registration', 'public', '2026-09-01', '2026-09-01', 0, 1)`);
  });

  it('nimmt neue Benutzer standardmäßig mit 70 an', () => {
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('neu', 'neu@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    expect(env.DB.sqlite.prepare("SELECT participant_limit FROM users WHERE id = 'neu'").get().participant_limit).toBe(70);
  });

  it('lehnt über der Grenze ab, auch statt der Warteliste; abgesagte Meldungen zählen nicht', async () => {
    vorhanden('a', 'confirmed');
    vorhanden('b', 'cancelled');
    vorhanden('c', 'rejected');
    expect((await anmelden()).status).toBe(201);
    expect(anzahl()).toBe(4);

    await expect(anmelden()).rejects.toMatchObject(LIMIT_ERREICHT);
    expect(anzahl()).toBe(4);
  });

  it('rechnet die Warteliste an', async () => {
    vorhanden('a', 'confirmed');
    vorhanden('b', 'waitlist');
    await expect(anmelden()).rejects.toMatchObject(LIMIT_ERREICHT);
  });

  it('gilt auch für die Turnierleitung', async () => {
    vorhanden('a', 'confirmed');
    vorhanden('b', 'pending');
    await expect(anmelden({ isManager: true, session: { user: { id: 'u1', role: 'user' } } })).rejects.toMatchObject(LIMIT_ERREICHT);
  });

  it('lässt Turniere eines Admins unbegrenzt', async () => {
    sql("UPDATE tournaments SET owner_id = 'admin' WHERE id = 't1'");
    vorhanden('a', 'confirmed');
    vorhanden('b', 'confirmed');
    expect((await anmelden()).status).toBe(201);
  });

  it('lehnt das Wiederaufnehmen einer abgesagten Meldung über der Grenze ab', async () => {
    vorhanden('a', 'confirmed');
    vorhanden('b', 'confirmed');
    vorhanden('alt', 'cancelled');
    const existing = await getRegistrationWithTournament(env.DB, 'alt');
    const request = new Request('https://ptm.test/api/registrations/alt', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'alt', lastName: 'Vorhanden', email: 'alt@example.test', playerEmail: 'alt@example.test', status: 'confirmed' }),
    });
    await expect(updateRegistration(request, env, existing, { id: 'u1', role: 'user' })).rejects.toMatchObject(LIMIT_ERREICHT);
    expect(env.DB.sqlite.prepare("SELECT status FROM registrations WHERE id = 'alt'").get().status).toBe('cancelled');
  });

  it('gilt auch für die Nachmeldung aus dem Turnierdokument', async () => {
    bindeDokument(env.DB.sqlite, 't1');
    vorhanden('a', 'confirmed');
    vorhanden('b', 'confirmed');
    const request = syncAnfrage('PUT', `/api/sync/tournaments/t1/registrations/${LOKALE_ID}`,
      { firstName: 'Lokal', lastName: 'Nachmeldung', participation: 'active', feeSelections: [], registrationAnswers: [] });
    const antwort = await executeSyncWrite(request, env.DB, turnier(), () => upsertDocumentRegistration(request, env, turnier(), LOKALE_ID));

    expect(antwort.status).toBe(409);
    expect((await antwort.json()).details).toEqual({ code: 'participant_limit_reached' });
    expect(anzahl()).toBe(2);
  });

  // Ein INSERT … SELECT ohne Treffer rollt den Batch nicht zurück: Die Verdrängung darf nur zusammen mit der Anmeldung
  // gelingen, sonst stünde ein Teilnehmer ohne Grund auf der Warteliste.
  it('verdrängt bei erreichter Grenze niemanden für eine abgelehnte VIP-Anmeldung', async () => {
    sql("UPDATE tournaments SET max_registrations = 2 WHERE id = 't1'");
    vorhanden('a', 'confirmed');
    vorhanden('b', 'confirmed');
    const request = new Request('https://ptm.test/api/tournaments/t1/registrations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Vip', lastName: 'Gast', playerEmail: 'vip@example.test', isVip: true,
        publicationNoticeAccepted: true, personsConsentAccepted: true, feeSelections: [], registrationAnswers: [] }),
    });
    await expect(createRegistration(request, env, turnier(), { isManager: true, session: { user: { id: 'u1', role: 'user' } } }))
      .rejects.toMatchObject(LIMIT_ERREICHT);
    expect(env.DB.sqlite.prepare("SELECT id, status FROM registrations ORDER BY id").all())
      .toEqual([{ id: 'a', status: 'confirmed' }, { id: 'b', status: 'confirmed' }]);
  });

  it('lässt bei gleichzeitigen Wiederaufnahmen nur so viele zu, wie Platz ist', async () => {
    vorhanden('a', 'confirmed');
    vorhanden('alt1', 'cancelled');
    vorhanden('alt2', 'cancelled');
    const wiederaufnehmen = async (id) => {
      const existing = await getRegistrationWithTournament(env.DB, id);
      const request = new Request(`https://ptm.test/api/registrations/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: id, lastName: 'Vorhanden', email: `${id}@example.test`, playerEmail: `${id}@example.test`, status: 'confirmed' }),
      });
      return updateRegistration(request, env, existing, { id: 'u1', role: 'user' });
    };
    const ergebnisse = await Promise.allSettled([wiederaufnehmen('alt1'), wiederaufnehmen('alt2')]);

    expect(ergebnisse.map((ergebnis) => ergebnis.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(ergebnisse.find((ergebnis) => ergebnis.status === 'rejected').reason).toMatchObject(LIMIT_ERREICHT);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS count FROM registrations WHERE status = 'confirmed'").get().count).toBe(2);
  });

  // Die Bearbeitung liest „confirmed“; während sie läuft, wird storniert und der Platz neu vergeben. Das UPDATE darf sich
  // nicht auf den alten Status verlassen.
  it('prüft beim Speichern den aktuellen Status, nicht den beim Öffnen gelesenen', async () => {
    vorhanden('a', 'confirmed');
    vorhanden('x', 'confirmed');
    const veraltet = await getRegistrationWithTournament(env.DB, 'x');
    sql("UPDATE registrations SET status = 'cancelled' WHERE id = 'x'");
    vorhanden('nachruecker', 'confirmed');

    const request = new Request('https://ptm.test/api/registrations/x', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Xaver', lastName: 'Vorhanden', email: 'x@example.test', playerEmail: 'x@example.test', status: 'confirmed' }),
    });
    await expect(updateRegistration(request, env, veraltet, { id: 'u1', role: 'user' })).rejects.toMatchObject(LIMIT_ERREICHT);
    expect(env.DB.sqlite.prepare("SELECT status FROM registrations WHERE id = 'x'").get().status).toBe('cancelled');
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS count FROM registrations WHERE status = 'confirmed'").get().count).toBe(2);
  });

  it('lässt eine bestätigte Meldung bei erreichter Grenze normal bearbeiten', async () => {
    vorhanden('a', 'confirmed');
    vorhanden('x', 'confirmed');
    const request = new Request('https://ptm.test/api/registrations/x', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Xaver', lastName: 'Vorhanden', email: 'x@example.test', playerEmail: 'x@example.test', status: 'confirmed' }),
    });
    expect((await updateRegistration(request, env, await getRegistrationWithTournament(env.DB, 'x'), { id: 'u1', role: 'user' })).status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT first_name FROM registrations WHERE id = 'x'").get().first_name).toBe('Xaver');
  });

  it('lässt auch das Turnierdokument eine abgesagte Meldung nicht über die Grenze wieder aufnehmen', async () => {
    const ONLINE_ID = '66666666-6666-4666-8666-666666666666';
    bindeDokument(env.DB.sqlite, 't1');
    vorhanden('a', 'confirmed');
    vorhanden('b', 'confirmed');
    vorhanden(ONLINE_ID, 'cancelled');
    const request = syncAnfrage('PUT', `/api/sync/tournaments/t1/registrations/${LOKALE_ID}`,
      { onlineRegistrationId: ONLINE_ID, expectedExecutionRevision: 1, status: 'confirmed' });
    const antwort = await executeSyncWrite(request, env.DB, turnier(), () => upsertDocumentRegistration(request, env, turnier(), LOKALE_ID));

    expect(antwort.status).toBe(409);
    expect((await antwort.json()).details).toEqual({ code: 'participant_limit_reached' });
    expect(env.DB.sqlite.prepare('SELECT status FROM registrations WHERE id = ?').get(ONLINE_ID).status).toBe('cancelled');
  });

  describe('Statusübernahme aus dem Dokument (POST /api/sync/tournaments/:id/results)', () => {
    let zugang;
    const uebernehmen = (registrations, protocol) => {
      const request = syncAnfrage('POST', '/api/sync/tournaments/t1/results', { registrations },
        protocol === 2 ? { counter: 1, requestId: crypto.randomUUID() } : {});
      request.headers.set('Authorization', `Bearer ${zugang}`);
      return worker.fetch(request, env);
    };

    beforeEach(() => {
      zugang = `ptm-api-${crypto.randomUUID()}`;
      sql(`INSERT INTO api_keys (id, user_id, key_hash, label, status, requested_at, approved_at, created_at, updated_at)
        VALUES ('key1', 'u1', ?, 'PTM', 'approved', '2026-01-01', '2026-01-01', '2026-01-01', '2026-01-01')`,
      createHash('sha256').update(zugang).digest('hex'));
    });

    // Ein Auftrag mit einer blockierten Wiederaufnahme speichert nichts halb (Trigger rollt den ganzen Batch zurück).
    it.each([1, 2])('lehnt eine Wiederaufnahme über der Grenze ab und speichert auch den Rest nicht (Protokoll %i)', async (protocol) => {
      bindeDokument(env.DB.sqlite, 't1', { protocol });
      const hubCalls = [];
      env.TOURNAMENT_LIVE_HUB = { idFromName: (name) => name, get: (id) => ({ fetch: async () => { hubCalls.push(id); return new Response(null, { status: 204 }); } }) };
      vorhanden('a', 'confirmed');
      vorhanden('b', 'confirmed');
      vorhanden('alt', 'cancelled');
      const vorher = env.DB.sqlite.prepare("SELECT participation, seeding_position, execution_revision FROM registrations WHERE id = 'a'").get();

      const antwort = await uebernehmen([
        { id: 'a', participation: 'active', seedingPosition: 3 },
        { id: 'alt', status: 'confirmed' },
      ], protocol);

      expect(antwort.status).toBe(409);
      expect((await antwort.json()).details).toEqual({ code: 'participant_limit_reached' });
      expect(env.DB.sqlite.prepare("SELECT status FROM registrations WHERE id = 'alt'").get().status).toBe('cancelled');
      expect(env.DB.sqlite.prepare("SELECT participation, seeding_position, execution_revision FROM registrations WHERE id = 'a'").get()).toEqual(vorher);
      expect(hubCalls).toEqual([]);
    });

    // D1 erlaubt höchstens 100 gebundene Parameter; die ID-Listen gehen deshalb als JSON in die Abfragen.
    it.each([1, 2])('verarbeitet einen Auftrag mit 60 Statusübernahmen (Protokoll %i)', async (protocol) => {
      bindeDokument(env.DB.sqlite, 't1', { protocol });
      sql("UPDATE users SET participant_limit = 70 WHERE id = 'u1'");
      const ids = Array.from({ length: 60 }, (_, index) => `m${index}`);
      ids.forEach((id) => vorhanden(id, 'confirmed'));

      const antwort = await uebernehmen(ids.map((id) => ({ id, status: 'confirmed', participation: 'active', expectedExecutionRevision: 1 })), protocol);

      expect(antwort.status).toBe(200);
      expect((await antwort.json()).updatedCount).toBe(60);
    });
  });

  // Das Token steht im Body; offene Anzeigen sollen die Abmeldung trotzdem sofort sehen.
  it('meldet eine Abmeldung per Link offenen Seiten (Snapshot und WebSocket-Hub)', async () => {
    const hubCalls = [];
    env.TOURNAMENT_LIVE_HUB = { idFromName: (name) => name, get: (id) => ({ fetch: async () => { hubCalls.push(id); return new Response(null, { status: 204 }); } }) };
    vorhanden('a', 'confirmed');
    const abmeldeLink = `abmelde-${crypto.randomUUID()}`;
    sql("UPDATE registrations SET cancel_token = ? WHERE id = 'a'", abmeldeLink);
    const antwort = await worker.fetch(new Request('https://ptm.test/api/registrations/cancel-by-token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: abmeldeLink }),
    }), env);

    expect(antwort.status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT status FROM registrations WHERE id = 'a'").get().status).toBe('cancelled');
    expect(hubCalls).toEqual(['t1']);
  });

  describe('„Max. Meldungen“ im Turnier', () => {
    const bearbeiten = (maxRegistrations, session = 'u1-session') => worker.fetch(new Request('https://ptm.test/api/tournaments/t1', {
      method: 'PUT', headers: { Cookie: `ptm_session=${session}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Turnier', date: '2099-09-28', location: 'Ort', formation: 'tete', type: 'schweizer',
        registrationType: 'forme', status: 'registration', visibility: 'public', maxRegistrations }),
    }), env);

    it('darf das Limit des Besitzers nicht übersteigen, 0 (unbegrenzt) bleibt erlaubt', async () => {
      const zuViel = await bearbeiten(3);
      expect(zuViel.status).toBe(400);
      expect((await zuViel.json()).details).toEqual({ code: 'participant_limit_exceeded', limit: 2 });
      expect((await bearbeiten(2)).status).toBe(200);
      expect((await bearbeiten(0)).status).toBe(200);
    });

    it('prüft das Limit des Besitzers, auch wenn ein Admin bearbeitet', async () => {
      expect((await bearbeiten(3, 'admin-session')).status).toBe(400);
    });
  });

  describe('Benutzerverwaltung', () => {
    const speichern = (method, path, body) => worker.fetch(new Request(`https://ptm.test${path}`, {
      method, headers: { Cookie: 'ptm_session=admin-session', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), env);
    const benutzer = { firstName: 'Neu', lastName: 'Konto', email: 'konto@example.test', role: 'user', password: `Test-${crypto.randomUUID()}` };

    it('speichert das Teilnehmer-Limit beim Anlegen und Bearbeiten und lehnt ungültige Werte ab', async () => {
      const angelegt = await speichern('POST', '/api/users', { ...benutzer, participantLimit: 120 });
      expect(angelegt.status).toBe(201);
      const { user } = await angelegt.json();
      expect(user.participantLimit).toBe(120);

      const geaendert = await speichern('PUT', `/api/users/${user.id}`, { ...benutzer, participantLimit: 30 });
      expect(geaendert.status).toBe(200);
      expect((await geaendert.json()).user.participantLimit).toBe(30);

      expect((await speichern('PUT', `/api/users/${user.id}`, { ...benutzer, participantLimit: -1 })).status).toBe(400);
      expect((await speichern('POST', '/api/users', { ...benutzer, email: 'x@example.test', participantLimit: 'viel' })).status).toBe(400);
    });
  });
});
