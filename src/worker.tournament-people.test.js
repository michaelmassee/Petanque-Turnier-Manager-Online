// @vitest-environment node
// Personenangaben am Turnier: Owner nur für die Verwaltung, Ersteller öffentlich (nicht bei Kalendereinträgen),
// in der öffentlichen Meldeliste nur ob ein Teammitglied mit einem Konto verknüpft ist.
import { describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { canCancelOwnRegistration, getTournamentById, listPublicParticipants, toPublicTournament } from './worker.js';

describe('Owner des Turniers', () => {
  it('liefert den Owner nicht zusätzlich als Bearbeiter', async () => {
    const db = d1MitSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, first_name, last_name, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'Lea', 'Leitung', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'u1', 'Turnier', '2099-09-28', 'Ort', 'doublette', 'registration', 'public', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournament_editors (id, tournament_id, user_id, created_at)
      VALUES ('e1', 't1', 'u1', '2026-09-01')`).run();

    const row = await getTournamentById(db, 't1');
    expect(toPublicTournament(row, { id: 'u1', role: 'user' }).editors).toEqual([]);
  });

  it('liefert Name und Benutzername nur an die Turnierverwaltung', async () => {
    const db = d1MitSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, first_name, last_name, username, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'Lea', 'Leitung', 'lea', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'u1', 'Turnier', '2099-09-28', 'Ort', 'doublette', 'registration', 'public', '2026-09-01', '2026-09-01')`).run();
    const row = await getTournamentById(db, 't1');

    expect(toPublicTournament(row, { id: 'u1', role: 'user' }).owner).toEqual({ id: 'u1', firstName: 'Lea', lastName: 'Leitung', username: 'lea' });
    expect(toPublicTournament(row, { id: 'admin', role: 'admin' }).owner).toMatchObject({ username: 'lea' });
    expect(toPublicTournament(row, { id: 'u2', role: 'user' }).owner).toBeUndefined();
    expect(toPublicTournament(row, null).owner).toBeUndefined();
  });

  it('zeigt den Ersteller öffentlich, aber nicht bei Kalendereinträgen', async () => {
    const db = d1MitSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, first_name, last_name, username, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'ersteller@example.test', 'user', 'Eva', 'Ersteller', 'eva', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, creator_id, name, date, location, formation, status, visibility, registration_enabled, created_at, updated_at)
      VALUES ('t1', 'u1', 'u1', 'Turnier', '2099-09-28', 'Ort', 'doublette', 'registration', 'public', 1, '2026-09-01', '2026-09-01'),
             ('k1', 'u1', 'u1', 'Kalender', '2099-09-28', 'Ort', 'doublette', 'registration', 'public', 0, '2026-09-01', '2026-09-01')`).run();

    expect(toPublicTournament(await getTournamentById(db, 't1'), null).createdBy).toEqual({ firstName: 'Eva', lastName: 'Ersteller', username: 'eva' });
    expect(toPublicTournament(await getTournamentById(db, 'k1'), null).createdBy).toBeNull();
  });
});

describe('Öffentliche Meldeliste', () => {
  it('verrät nur, ob ein Teammitglied mit einem Konto verknüpft ist', async () => {
    const db = d1MitSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, first_name, last_name, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'maria@example.test', 'user', 'Maria', 'Bieder', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'u1', 'Turnier', '2099-09-28', 'Ort', 'doublette', 'registration', 'public', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, user_id, partner_first_name, partner_email, status,
        participation, registered_at, created_at, updated_at, execution_revision, language)
      VALUES ('r1', 't1', 'Maria', 'Bieder', 'maria@example.test', 'u1', 'Paul', 'paul@example.test', 'confirmed', 'inactive',
        '2026-09-01', '2026-09-01', '2026-09-01', 1, 'de')`).run();

    const { participants: [participant] } = await (await listPublicParticipants(db, 't1', null)).json();
    expect(participant).toMatchObject({ accountConnected: true, partnerAccountConnected: false, partner2AccountConnected: false });
    expect(JSON.stringify(participant)).not.toContain('u1');
  });

  it('zeigt unbestätigte Meldungen ausschließlich dem zugehörigen Konto', async () => {
    const db = d1MitSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, first_name, last_name, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'maria@example.test', 'user', 'Maria', 'Bieder', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'u1', 'Turnier', '2099-09-28', 'Ort', 'doublette', 'registration', 'public', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, user_id, status,
        participation, registered_at, created_at, updated_at, execution_revision, language)
      VALUES ('pending', 't1', 'Maria', 'Bieder', 'maria@example.test', 'u1', 'pending', 'inactive',
        '2026-09-01', '2026-09-01', '2026-09-01', 1, 'de')`).run();

    const anonymous = await (await listPublicParticipants(db, 't1')).json();
    expect(anonymous).toEqual({ participants: [], ownUnconfirmed: [] });

    const mine = await (await listPublicParticipants(db, 't1', { id: 'u1', email: 'maria@example.test' })).json();
    expect(mine.participants).toEqual([]);
    expect(mine.ownUnconfirmed).toEqual([expect.objectContaining({ registrationId: 'pending', status: 'pending' })]);
  });

  it('gibt dem anmeldenden Konto die Storno-ID, nicht aber einem bloß verknüpften Teammitglied', async () => {
    const db = d1MitSchema();
    db.sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('creator', 'creator@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01'),
             ('player', 'player@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'creator', 'Turnier', '2099-09-28', 'Ort', 'doublette', 'registration', 'public', '2026-09-01', '2026-09-01');
      INSERT INTO registrations (id, tournament_id, first_name, last_name, email, user_id, registrant_user_id, status,
        participation, registered_at, created_at, updated_at, execution_revision, language)
      VALUES ('r1', 't1', 'Anna', 'Adler', 'contact@example.test', 'player', 'creator', 'confirmed', 'inactive',
        '2026-09-01', '2026-09-01', '2026-09-01', 1, 'de');`);

    const creator = await (await listPublicParticipants(db, 't1', { id: 'creator', email: 'creator@example.test' })).json();
    const player = await (await listPublicParticipants(db, 't1', { id: 'player', email: 'player@example.test' })).json();
    expect(creator.participants[0].registrationId).toBe('r1');
    expect(player.participants[0].registrationId).toBeNull();
  });

  it('erlaubt die Stornierung nur dem Anmeldekonto und weiterhin dem alten Kontaktkonto', () => {
    const registration = {
      email: 'contact@example.test', user_id: 'player', registrant_user_id: 'creator',
      partner_email: null, partner2_email: null,
    };
    expect(canCancelOwnRegistration(registration, { id: 'creator', email: 'creator@example.test' })).toBe(true);
    expect(canCancelOwnRegistration(registration, { id: 'contact', email: 'contact@example.test' })).toBe(true);
    expect(canCancelOwnRegistration(registration, { id: 'player', email: 'player@example.test' })).toBe(false);
  });
});
