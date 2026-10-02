// @vitest-environment node
// Turnieranmeldung Stufe 2 und 3 (Spezifikation turnieranmeldung-ptmonline.md): Konflikte, Besetzung, Mêlée-Teams,
// Löschnachweis, Check-in-Nachricht, Live-Ansicht und Datenschutz.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import {
  buildLiveResponse, createRegistration, deleteTournament, executeSyncWrite, findMyLiveRegistration, getSyncTournament,
  listRegistrations, purgeExpiredPersonalData, syncGetRegistrations, syncPostDecisions, syncPutMeleeTeams,
  syncPutRegistrationClosed, updateTournamentPublication, upsertDocumentRegistration,
} from './worker.js';

const LOKAL = '55555555-5555-4555-8555-555555555555';
const TEAM_1 = '77777777-7777-4777-8777-777777777777';
const AUFTRAG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Turnieranmeldung Stufe 2 und 3', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const zeile = (statement, ...params) => env.DB.sqlite.prepare(statement).get(...params);
  const zeilen = (statement, ...params) => env.DB.sqlite.prepare(statement).all(...params);
  const turnier = () => zeile("SELECT * FROM tournaments WHERE id = 't1'");

  function konto(id, email) {
    sql(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, created_at, updated_at, email_verified_at)
      VALUES (?, ?, ?, 'Konto', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01', '2026-01-01')`, id, email, id);
  }

  function anmeldung(id, { status = 'confirmed', personen = [['Anna', 'Adler']], userIds = [], participation = 'inactive' } = {}) {
    const [a = [], b = [], c = []] = personen;
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, player_email, partner_first_name,
        partner_last_name, partner_email, partner2_first_name, partner2_last_name, status, participation, registered_at,
        created_at, updated_at, user_id, partner_user_id, partner2_user_id, fee_selections, registration_answers)
      VALUES (?, 't1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-09-01', '2026-09-01', '2026-09-01', ?, ?, ?, '[{"x":1}]', '[{"y":1}]')`,
    id, a[0], a[1], `kontakt-${id}@example.test`, a[2] || null, b[0] || null, b[1] || null, b[2] || null, c[0] || null,
    c[1] || null, status, participation, userIds[0] || null, userIds[1] || null, userIds[2] || null);
  }

  function setzeTurnier(werte) {
    for (const [spalte, wert] of Object.entries(werte)) sql(`UPDATE tournaments SET ${spalte} = ? WHERE id = 't1'`, wert);
  }

  function oeffentlichAnmelden(body, session = null) {
    const request = new Request('https://ptm.test/api/tournaments/t1/registrations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerEmail: 'spieler1@example.test', publicationNoticeAccepted: true, personsConsentAccepted: true,
        feeSelections: [], registrationAnswers: [], ...body }),
    });
    return createRegistration(request, env, turnier(), { session });
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    konto('owner', 'leitung@example.test');
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, registration_type, status, visibility,
        created_at, updated_at, live_view_enabled)
      VALUES ('t1', 'owner', 'Herbstpokal', '2099-09-28', 'Ort', 'doublette', 'forme', 'registration', 'public', '2026-09-01', '2026-09-01', 1)`);
  });

  describe('Anmeldung und Konten (E-20, E-22, KP-06)', () => {
    it('speichert Verein und Lizenznummer für jede Person einer Triplette', async () => {
      setzeTurnier({ formation: 'triplette', license_required: 1 });

      const response = await oeffentlichAnmelden({
        firstName: 'Anna', lastName: 'Adler', club: 'BC A', licenseNr: 'A-1',
        partnerFirstName: 'Ben', partnerLastName: 'Berg', partnerClub: 'BC B', partnerLicenseNr: 'B-2',
        partner2FirstName: 'Clara', partner2LastName: 'Cramer', partner2Club: 'BC C', partner2LicenseNr: 'C-3',
      });

      expect(response.status).toBe(201);
      expect(zeile('SELECT club, license_nr, partner_club, partner_license_nr, partner2_club, partner2_license_nr FROM registrations'))
        .toEqual({ club: 'BC A', license_nr: 'A-1', partner_club: 'BC B', partner_license_nr: 'B-2', partner2_club: 'BC C', partner2_license_nr: 'C-3' });
      expect((await response.json()).registration).toMatchObject({ partnerClub: 'BC B', partnerLicenseNr: 'B-2', partner2Club: 'BC C', partner2LicenseNr: 'C-3' });
    });

    it('fordert bei Lizenzturnieren die Lizenznummer jeder eingetragenen Person', async () => {
      setzeTurnier({ formation: 'triplette', license_required: 1 });

      await expect(oeffentlichAnmelden({
        firstName: 'Anna', lastName: 'Adler', licenseNr: 'A-1',
        partnerFirstName: 'Ben', partnerLastName: 'Berg', partnerLicenseNr: 'B-2',
        partner2FirstName: 'Clara', partner2LastName: 'Cramer',
      })).rejects.toMatchObject({ status: 400, message: 'Lizenznummer für Partner 2 ist erforderlich' });
    });

    it('nimmt eine Triplette mit 2 Personen als unvollständig an und lehnt 1 Person ab (P-51)', async () => {
      setzeTurnier({ formation: 'triplette' });
      await expect(oeffentlichAnmelden({ firstName: 'Solo', lastName: 'Spieler' })).rejects.toMatchObject({ status: 400 });
      const antwort = await oeffentlichAnmelden({ firstName: 'Anna', lastName: 'Adler', partnerFirstName: 'Ben', partnerLastName: 'Berg' });
      expect(antwort.status).toBe(201);

      const liste = await (await listRegistrations(env.DB, turnier())).json();
      expect(liste.registrations[0]).toMatchObject({ incomplete: true, accountConflict: false });
    });

    it('lehnt bei Mêlée eine Anmeldung mit zwei Personen ab (P-52)', async () => {
      setzeTurnier({ registration_type: 'melee' });
      await expect(oeffentlichAnmelden({ firstName: 'Anna', lastName: 'Adler', partnerFirstName: 'Ben', partnerLastName: 'Berg' }))
        .rejects.toMatchObject({ status: 400 });
    });

    it('verlangt das Einverständnis der eingetragenen Personen (DS-01)', async () => {
      await expect(oeffentlichAnmelden({ firstName: 'Anna', lastName: 'Adler', partnerFirstName: 'Ben', partnerLastName: 'Berg',
        personsConsentAccepted: false })).rejects.toMatchObject({ status: 400 });
    });

    it('verknüpft Slots nur über Slot-E-Mails; das absendende Konto bekommt keinen Slot (P-59)', async () => {
      konto('verein', 'absender@example.test');
      konto('ben', 'ben@example.test');
      const antwort = await oeffentlichAnmelden({
        firstName: 'Anna', lastName: 'Adler', partnerFirstName: 'Ben', partnerLastName: 'Berg', partnerEmail: 'ben@example.test',
      }, { user: { id: 'verein', role: 'user', email: 'absender@example.test' } });

      const body = await antwort.json();
      expect(JSON.stringify(body)).not.toMatch(/accountConnected|userId|partner_user_id/);
      expect(zeile("SELECT user_id, partner_user_id FROM registrations")).toEqual({ user_id: null, partner_user_id: 'ben' });
      // Keine Verknüpfungsnachricht mehr: Die Live-Ansicht hängt am persönlichen Link (E-21).
      expect(zeilen("SELECT recipient_id FROM postbox_messages WHERE event_type = 'registration_slot_linked'")).toEqual([]);
    });

    it('nimmt eine zweite Anmeldung desselben Kontos an und markiert beide als Konflikt (P-29, P-68)', async () => {
      konto('x', 'x@example.test');
      anmeldung('r1', { personen: [['Xaver', 'Xander', 'x@example.test'], ['Ben', 'Berg']], userIds: ['x'] });

      const antwort = await oeffentlichAnmelden({
        firstName: 'Xaver', lastName: 'Xander', playerEmail: 'x@example.test', partnerFirstName: 'Dora', partnerLastName: 'Dahl',
      });
      expect(antwort.status).toBe(201);

      const liste = (await (await listRegistrations(env.DB, turnier())).json()).registrations;
      expect(liste.every((entry) => entry.accountConflict)).toBe(true);
      expect(zeilen("SELECT event_type FROM postbox_messages WHERE recipient_id = 'x'").map((row) => row.event_type))
        .toContain('registration_account_conflict');
    });

    it('nimmt gleichnamige Gäste an und kennzeichnet sie nur als mögliche Dublette (P-29)', async () => {
      anmeldung('r1', { personen: [['Max', 'Muster'], ['Ben', 'Berg']] });
      await oeffentlichAnmelden({ firstName: 'Max', lastName: 'Muster', partnerFirstName: 'Uli', partnerLastName: 'Ulm' });

      const liste = (await (await listRegistrations(env.DB, turnier())).json()).registrations;
      expect(liste.map((entry) => [entry.possibleDuplicate, entry.accountConflict])).toEqual([[true, false], [true, false]]);
    });
  });

  describe('Abgleich mit dem Turnierdokument (T-17, T-18, KP-18)', () => {
    const ONLINE = '44444444-4444-4444-8444-444444444444';
    const dokumentSchreiben = (body, plan) => {
      const request = syncAnfrage('PUT', `/api/sync/tournaments/t1/registrations/${LOKAL}`, body);
      return executeSyncWrite(request, env.DB, turnier(), plan ? () => plan(request) : () => upsertDocumentRegistration(request, env, turnier(), LOKAL));
    };

    beforeEach(() => {
      konto('x', 'x@example.test');
      anmeldung(ONLINE, { personen: [['Anna', 'Adler'], ['Xaver', 'Xander', 'x@example.test']], userIds: [null, 'x'] });
      bindeDokument(env.DB.sqlite, 't1');
    });

    it('liefert Personen mit Benutzer-ID und die Konfliktliste', async () => {
      const antwort = await (await syncGetRegistrations(env.DB, turnier(), new URL('https://ptm.test/x'))).json();
      expect(antwort.registrations[0].persons).toEqual([
        { slot: 1, firstName: 'Anna', lastName: 'Adler', licenseNr: null, userId: null },
        { slot: 2, firstName: 'Xaver', lastName: 'Xander', licenseNr: null, userId: 'x' },
      ]);
      expect(antwort.conflicts).toEqual({ accountConflicts: [], possibleDuplicates: [] });
    });

    it('ersetzt X durch Y ohne Benutzer-ID: Verknüpfung und Slot-E-Mail entfallen (P-45)', async () => {
      const antwort = await dokumentSchreiben({
        documentMaster: true, onlineRegistrationId: ONLINE, expectedExecutionRevision: 1,
        persons: [{ firstName: 'Anna', lastName: 'Adler' }, { firstName: 'Yvonne', lastName: 'Ypsilon', userId: null }],
      });
      expect(antwort.status).toBe(200);
      expect(zeile('SELECT partner_first_name, partner_user_id, partner_email FROM registrations WHERE id = ?', ONLINE))
        .toEqual({ partner_first_name: 'Yvonne', partner_user_id: null, partner_email: null });
      expect(zeile("SELECT action FROM audit_log WHERE action = 'account_unlinked'")).toBeTruthy();
    });

    it('behält die Benutzer-ID bei einer Umsortierung und lehnt fremde Benutzer-IDs ab (T-17)', async () => {
      await dokumentSchreiben({
        documentMaster: true, onlineRegistrationId: ONLINE, expectedExecutionRevision: 1,
        persons: [{ firstName: 'Xaver', lastName: 'Xander', userId: 'x' }, { firstName: 'Anna', lastName: 'Adler' }],
      });
      expect(zeile('SELECT user_id, player_email, partner_user_id FROM registrations WHERE id = ?', ONLINE))
        .toEqual({ user_id: 'x', player_email: 'x@example.test', partner_user_id: null });

      konto('fremd', 'fremd@example.test');
      await expect(dokumentSchreiben({
        documentMaster: true, onlineRegistrationId: ONLINE, expectedExecutionRevision: 2,
        persons: [{ firstName: 'Anna', lastName: 'Adler', userId: 'fremd' }, { firstName: 'Ben', lastName: 'Berg' }],
      })).rejects.toMatchObject({ status: 409, details: { code: 'user_id_invalid' } });
    });

    it('lehnt mehr Personen als die Formationsstärke ab (P-51)', async () => {
      await expect(dokumentSchreiben({
        documentMaster: true, onlineRegistrationId: ONLINE, expectedExecutionRevision: 1,
        persons: [{ firstName: 'A', lastName: 'A' }, { firstName: 'B', lastName: 'B' }, { firstName: 'C', lastName: 'C' }],
      })).rejects.toMatchObject({ status: 400, details: { code: 'unit_invalid' } });
    });

    it('überträgt die Mêlée-Teamzuordnung und zeigt sie in der Live-Ansicht (P-41)', async () => {
      setzeTurnier({ registration_type: 'melee', formation: 'doublette', status: 'running' });
      sql('DELETE FROM registrations');
      anmeldung('m1', { personen: [['Anna', 'Adler']], userIds: ['x'], participation: 'active' });
      anmeldung('m2', { personen: [['Ben', 'Berg']], participation: 'active' });
      anmeldung('m3', { personen: [['Cleo', 'Cramer']], participation: 'active' });

      const request = syncAnfrage('PUT', '/api/sync/tournaments/t1/melee-teams', { teams: [{ teamUuid: TEAM_1, registrationIds: ['m1', 'm2'] }] });
      const antwort = await executeSyncWrite(request, env.DB, turnier(), (db) => syncPutMeleeTeams(request, db, turnier()));
      expect(await antwort.json()).toEqual({ teamCount: 1, assignedCount: 2 });
      expect(zeile("SELECT COUNT(*) AS anzahl FROM registrations").anzahl).toBe(3);

      const registration = await findMyLiveRegistration(env.DB, { id: 'x' }, 'm1');
      const live = await (await buildLiveResponse(new Request('https://ptm.test/api/live/registrations/m1'), env.DB, registration)).json();
      expect(live.registration).toMatchObject({ meleeTeammates: ['Ben Berg'], unit: 'single', participation: 'active' });
      expect(live.dataAsOf).toEqual(expect.any(String));
    });

    it('lehnt eine Mêlée-Teamzuordnung mit fremder Anmeldung ab', async () => {
      setzeTurnier({ registration_type: 'melee' });
      const request = syncAnfrage('PUT', '/api/sync/tournaments/t1/melee-teams', { teams: [{ teamUuid: TEAM_1, registrationIds: ['fremd'] }] });
      await expect(executeSyncWrite(request, env.DB, turnier(), (db) => syncPutMeleeTeams(request, db, turnier())))
        .rejects.toMatchObject({ status: 400 });
    });

    it('protokolliert Entscheidungen der Turnierleitung (T-14, KP-14)', async () => {
      const request = syncAnfrage('POST', '/api/sync/tournaments/t1/decisions',
        { decisions: [{ decision: 'keep_despite_online_status', onlineRegistrationId: ONLINE, localRegistrationUuid: LOKAL }] });
      const antwort = await executeSyncWrite(request, env.DB, turnier(), (db) => syncPostDecisions(request, db, turnier(), { id: 'owner' }));
      expect(await antwort.json()).toEqual({ recorded: 1 });
      expect(zeile("SELECT action, registration_id, target FROM audit_log WHERE action LIKE 'decision_%'"))
        .toEqual({ action: 'decision_keep_despite_online_status', registration_id: ONLINE, target: `local:${LOKAL}` });
    });

    it('schließt die Online-Anmeldung aus dem Dokument und meldet das Turnierdatum (KP-05, Vorbeugung)', async () => {
      const schliessen = (body) => {
        const request = syncAnfrage('PUT', '/api/sync/tournaments/t1/registration-closed', body);
        return executeSyncWrite(request, env.DB, turnier(), (db) => syncPutRegistrationClosed(request, db, turnier(), { id: 'owner' }));
      };
      await expect(schliessen({ closed: 'ja' })).rejects.toMatchObject({ status: 400 });

      const antwort = await schliessen({ closed: true });

      expect(await antwort.json()).toEqual({ registrationClosed: true });
      expect(turnier().registration_closed).toBe(1);
      expect(zeile("SELECT actor_role, action FROM audit_log WHERE action = 'registration_closed'"))
        .toEqual({ actor_role: 'document', action: 'registration_closed' });
      const stand = await (await syncGetRegistrations(env.DB, turnier(), new URL('https://ptm.test/x'))).json();
      expect(stand.tournament).toMatchObject({ registrationClosed: true, date: '2099-09-28' });
    });

    it('überträgt keine Stornierung einer bereits ausgelosten Meldung (KP-15)', async () => {
      setzeTurnier({ status: 'running' });
      sql(`INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES ('rd1', 't1', 1, '2026-09-28')`);
      sql(`INSERT INTO tournament_matches (id, tournament_id, round_id, team_a_registration_ids, team_b_registration_ids, created_at, updated_at)
        VALUES ('m1', 't1', 'rd1', ?, '[]', '2026-09-28', '2026-09-28')`, JSON.stringify([ONLINE]));
      await expect(dokumentSchreiben({ status: 'cancelled', onlineRegistrationId: ONLINE, expectedExecutionRevision: 1 }))
        .rejects.toMatchObject({ status: 409, details: { code: 'registration_drawn' } });
    });
  });

  describe('Löschen, Check-in und Zustandswechsel', () => {
    it('hinterlässt beim Löschen einen Löschnachweis für PTM und die Live-Ansicht (KP-07, P-31)', async () => {
      konto('x', 'x@example.test');
      konto('editor', 'editor@example.test');
      anmeldung('r1', { userIds: ['x'] });

      await deleteTournament(env, turnier(), { id: 'editor', role: 'admin' });

      await expect(getSyncTournament(env.DB, 't1')).rejects.toMatchObject({ status: 410, details: { code: 'tournament_deleted' } });
      await expect(getSyncTournament(env.DB, 'unbekannt')).rejects.toMatchObject({ status: 404 });
      await expect(findMyLiveRegistration(env.DB, { id: 'x' }, 'r1')).rejects.toMatchObject({ status: 410 });
      await expect(findMyLiveRegistration(env.DB, { id: 'fremd' }, 'r1')).rejects.toMatchObject({ status: 404 });
      // T-22: Der Turnierersteller erfährt, dass ein anderes Konto gelöscht hat.
      expect(zeile("SELECT event_type FROM postbox_messages WHERE recipient_id = 'owner'").event_type).toBe('tournament_admin_action');
    });

    it('lehnt die Rückkehr zu Entwurf mit Anmeldungen ab und nennt die Anzahl (P-21)', async () => {
      anmeldung('r1');
      anmeldung('r2');
      const request = new Request('https://ptm.test/x', { method: 'PUT', body: JSON.stringify({ status: 'draft', visibility: 'public' }) });
      await expect(updateTournamentPublication(request, env, turnier(), { id: 'owner' }))
        .rejects.toMatchObject({ status: 409, details: { code: 'registrations_exist', count: 2 } });
    });

    it('zeigt vor dem Check-in Anmeldestatus und Besetzung in der Live-Ansicht (KP-12)', async () => {
      konto('a', 'a@example.test');
      setzeTurnier({ formation: 'triplette' });
      anmeldung('r1', { status: 'pending', personen: [['Anna', 'Adler'], ['Ben', 'Berg']], userIds: ['a'] });

      const registration = await findMyLiveRegistration(env.DB, { id: 'a' }, 'r1');
      const live = await (await buildLiveResponse(new Request('https://ptm.test/x'), env.DB, registration)).json();
      expect(live.registration).toMatchObject({ status: 'pending', participation: 'inactive', incomplete: true, persons: ['Anna Adler', 'Ben Berg'] });
      expect(JSON.stringify(live)).not.toMatch(/@example\.test/);
    });
  });

  describe('Datenschutz (DS-04, DS-05)', () => {
    it('löscht nach der Frist Kontaktdaten und pseudonymisiert das Protokoll', async () => {
      setzeTurnier({ status: 'finished', date: '2025-01-10' });
      anmeldung('r1', { personen: [['Anna', 'Adler', 'anna@example.test']], userIds: ['owner'] });
      sql(`INSERT INTO audit_log (id, tournament_id, registration_id, actor_user_id, actor_role, action, target, details_json, created_at)
        VALUES ('l1', 't1', 'r1', 'owner', 'owner', 'contact_email_changed', 'registration', ?, '2025-01-01')`,
      JSON.stringify({ from: 'alt@example.test', to: 'neu@example.test' }));

      expect(await purgeExpiredPersonalData(env.DB, new Date('2025-12-01T00:00:00Z'))).toBe(0);
      expect(await purgeExpiredPersonalData(env.DB, new Date('2026-02-01T00:00:00Z'))).toBe(1);

      expect(zeile("SELECT first_name, email, player_email, fee_selections, registration_answers FROM registrations WHERE id = 'r1'"))
        .toEqual({ first_name: 'Anna', email: expect.stringMatching(/@ohne-email\.invalid$/), player_email: null, fee_selections: '[]', registration_answers: '[]' });
      const log = zeile("SELECT actor_user_id, details_json, pseudonymized_at FROM audit_log WHERE id = 'l1'");
      expect(log.actor_user_id).toMatch(/^pseudo-/);
      expect(log.details_json).not.toMatch(/@/);
      expect(log.pseudonymized_at).toBeTruthy();
      expect(await purgeExpiredPersonalData(env.DB, new Date('2026-03-01T00:00:00Z'))).toBe(0);
    });
  });
});
