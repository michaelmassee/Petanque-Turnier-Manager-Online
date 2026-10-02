// @vitest-environment node
// Löschen eines Kontos: Turniere, die dabei mitgelöscht werden, hinterlassen wie beim direkten Löschen einen
// Löschnachweis (KP-07) – ein verbundenes PTM-Dokument erhält tournament_deleted, verknüpfte Konten den Löschhinweis.
// Die Admin-Löschung läuft atomar.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument } from './test-support/sync.js';
import { deleteOwnAccount, deleteUser, findMyLiveRegistration, getSyncTournament } from './worker.js';

describe('Konto löschen', () => {
  let db;
  const sql = (statement, ...params) => db.sqlite.prepare(statement).run(...params);
  const zeile = (statement, ...params) => db.sqlite.prepare(statement).get(...params);
  const zeilen = (statement, ...params) => db.sqlite.prepare(statement).all(...params);

  function konto(id, role = 'user') {
    sql(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, created_at, updated_at, email_verified_at)
      VALUES (?, ?, ?, 'Konto', ?, 'salt', 'hash', '2026-01-01', '2026-01-01', '2026-01-01')`, id, `${id}@example.test`, id, role);
  }

  function turnier(id, ownerId) {
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES (?, ?, ?, '2099-01-01', 'Ort', 'doublette', 'registration', 'public', '2026-01-01', '2026-01-01')`, id, ownerId, `Turnier ${id}`);
  }

  function anmeldung(id, tournamentId, userId = null) {
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, registered_at, created_at, updated_at, user_id)
      VALUES (?, ?, 'Anna', 'Adler', 'kontakt@example.test', 'confirmed', '2026-01-01', '2026-01-01', '2026-01-01', ?)`, id, tournamentId, userId);
  }

  beforeEach(() => {
    db = d1MitSchema();
    konto('admin', 'admin');
    konto('leitung');
    konto('spieler');
    konto('andere');
    turnier('t-eigen', 'leitung');
    turnier('t-fremd', 'andere');
    anmeldung('r1', 't-eigen', 'spieler');
    anmeldung('r2', 't-fremd', 'spieler');
    // Die Leitung verwaltet das fremde Turnier nur mit – es darf nicht mitgelöscht werden.
    sql("INSERT INTO tournament_editors (tournament_id, user_id, created_at) VALUES ('t-fremd', 'leitung', '2026-01-01')");
    bindeDokument(db.sqlite, 't-eigen');
  });

  it('Admin-Löschung mit Turnieren hinterlässt Löschnachweis und Protokoll (KP-07)', async () => {
    await expect(deleteUser(db, 'leitung', 'admin', true)).resolves.toMatchObject({ status: 200 });

    await expect(getSyncTournament(db, 't-eigen')).rejects.toMatchObject({ status: 410, details: { code: 'tournament_deleted' } });
    await expect(findMyLiveRegistration(db, { id: 'spieler' }, 'r1')).rejects.toMatchObject({ status: 410 });
    expect(zeile("SELECT deleted_by_user_id FROM tournament_tombstones WHERE tournament_id = 't-eigen'").deleted_by_user_id)
      .toBe('admin');
    expect(JSON.parse(zeile("SELECT details_json FROM audit_log WHERE tournament_id = 't-eigen' AND action = 'tournament_deleted'")
      .details_json)).toEqual({ status: 'registration', documentBound: true, reason: 'account_deleted' });
    expect(zeilen("SELECT id FROM registrations WHERE tournament_id = 't-eigen'")).toEqual([]);
    expect(zeile("SELECT owner_id FROM tournaments WHERE id = 't-fremd'").owner_id).toBe('andere');
    expect(zeile("SELECT id FROM registrations WHERE id = 'r2'")).toBeTruthy();
    expect(zeile("SELECT id FROM users WHERE id = 'leitung'")).toBeUndefined();
  });

  it('Admin-Löschung ohne Turniere übergibt sie dem löschenden Admin, ohne Löschnachweis', async () => {
    await deleteUser(db, 'leitung', 'admin', false);

    expect(zeile("SELECT owner_id FROM tournaments WHERE id = 't-eigen'").owner_id).toBe('admin');
    expect(zeile("SELECT id FROM registrations WHERE id = 'r1'")).toBeTruthy();
    expect(zeilen('SELECT tournament_id FROM tournament_tombstones')).toEqual([]);
  });

  it('Admin-Löschung ist atomar: scheitert ein Schritt, bleibt alles unverändert', async () => {
    sql("INSERT INTO clubs (id, name, owner_id, created_at, updated_at) VALUES ('c1', 'Verein', 'leitung', '2026-01-01', '2026-01-01')");
    sql("CREATE TRIGGER users_loeschen_scheitert BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'Testfehler'); END");

    await expect(deleteUser(db, 'leitung', 'admin', true)).rejects.toThrow();

    expect(zeile("SELECT owner_id FROM clubs WHERE id = 'c1'").owner_id).toBe('leitung');
    expect(zeile("SELECT owner_id FROM tournaments WHERE id = 't-eigen'").owner_id).toBe('leitung');
    expect(zeilen('SELECT tournament_id FROM tournament_tombstones')).toEqual([]);
    expect(zeilen("SELECT id FROM audit_log WHERE action = 'tournament_deleted'")).toEqual([]);
  });

  it('meldet einen unbekannten Benutzer als nicht gefunden', async () => {
    await expect(deleteUser(db, 'unbekannt', 'admin', true)).rejects.toMatchObject({ status: 404 });
  });

  it('Selbstlöschung hinterlässt für die eigenen Turniere ebenfalls einen Löschnachweis', async () => {
    // Google-Konto: bestätigt wird mit der E-Mail-Adresse.
    sql(`INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email, created_at, updated_at)
      VALUES ('o1', 'leitung', 'google', 'g1', 'leitung@example.test', '2026-01-01', '2026-01-01')`);
    const request = new Request('https://example.test/api/me', {
      method: 'DELETE', body: JSON.stringify({ confirmation: 'leitung@example.test' }),
    });

    await expect(deleteOwnAccount(request, db, new URL(request.url), 'leitung')).resolves.toMatchObject({ status: 200 });

    await expect(getSyncTournament(db, 't-eigen')).rejects.toMatchObject({ status: 410, details: { code: 'tournament_deleted' } });
    expect(zeile("SELECT actor_role FROM audit_log WHERE tournament_id = 't-eigen' AND action = 'tournament_deleted'").actor_role)
      .toBe('owner');
    expect(zeile("SELECT owner_id FROM tournaments WHERE id = 't-fremd'").owner_id).toBe('andere');
  });
});
