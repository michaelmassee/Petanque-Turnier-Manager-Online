// @vitest-environment node
// Änderungshistorie der Meldeliste (T-14): Protokolleinträge aller Meldungs-Vorgänge und deren Anzeige für die Turnierleitung.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { getRegistrationWithTournament, updateRegistration } from './worker.js';

const NOW = '2026-09-01T10:00:00.000Z';

describe('Protokoll der Meldeliste', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const protokoll = () => env.DB.sqlite.prepare('SELECT registration_id, actor_user_id, actor_role, action, details_json FROM audit_log ORDER BY created_at, rowid').all()
    .map((row) => ({ ...row, details: row.details_json ? JSON.parse(row.details_json) : null }));

  function anmeldung(id, status, extra = {}) {
    const columns = { id, tournament_id: 't1', first_name: id, last_name: 'Team', email: `${id}@example.test`, status,
      partner_first_name: 'Paula', partner_last_name: 'Partner', registered_at: NOW, created_at: NOW, updated_at: NOW,
      cancel_token: `token-${id}`, ...extra };
    const names = Object.keys(columns);
    sql(`INSERT INTO registrations (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`, ...Object.values(columns));
  }

  function anfrage(path, { method = 'GET', user = 'owner', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (user) {
      sql("INSERT OR IGNORE INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, '2099-01-01T00:00:00.000Z', ?)", user, user, NOW);
      headers.Cookie = `ptm_session=${user}`;
    }
    return worker.fetch(new Request(`https://ptm.test${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
  }

  async function eintraege(user = 'owner') {
    const response = await anfrage('/api/tournaments/t1/registration-log', { user });
    expect(response.status).toBe(200);
    return (await response.json()).entries;
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    env.DB.sqlite.exec(`INSERT INTO users (id, email, role, first_name, last_name, mail_enabled, email_verified_at, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'Lea', 'Leitung', 1, '2026-01-01', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('fremd', 'fremd@example.test', 'user', 'Fritz', 'Fremd', 1, '2026-01-01', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('linked', 'linked@example.test', 'user', 'Lina', 'Konto', 1, '2026-01-01', 'salt', 'hash', '2026-01-01', '2026-01-01');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at, approval_required)
      VALUES ('t1', 'owner', 'Turnier', '2099-09-28', 'Ort', 'doublette', 'registration', 'public', '2026-01-01', '2026-01-01', 1);`);
  });

  it('protokolliert die Absage per Abmelde-Link als Spieler', async () => {
    anmeldung('a', 'confirmed');
    const response = await anfrage('/api/registrations/cancel-by-token', { method: 'POST', user: null, body: { token: 'token-a' } });
    expect(response.status).toBe(200);

    expect(protokoll()).toEqual([expect.objectContaining({ registration_id: 'a', actor_role: 'player', action: 'status_changed',
      details: { from: 'confirmed', to: 'cancelled' } })]);
  });

  it('protokolliert „Alle bestätigen“ je Meldung mit der handelnden Turnierleitung', async () => {
    anmeldung('a', 'pending');
    anmeldung('b', 'pending');
    const response = await anfrage('/api/tournaments/t1/registrations/confirm-pending', { method: 'POST' });
    expect(response.status).toBe(200);

    expect(protokoll().map(({ registration_id, actor_user_id, actor_role, details }) => ({ registration_id, actor_user_id, actor_role, details })))
      .toEqual(['a', 'b'].map((id) => ({ registration_id: id, actor_user_id: 'owner', actor_role: 'owner',
        details: { from: 'pending', to: 'confirmed', bulk: true } })));
  });

  it('protokolliert Teamname und VIP-Stufe beim Bearbeiten', async () => {
    anmeldung('a', 'confirmed', { first_name: 'Anna', player_email: 'a@example.test' });
    const existing = await getRegistrationWithTournament(env.DB, 'a');
    const request = new Request('https://ptm.test/api/registrations/a', { method: 'PUT', body: JSON.stringify({
      firstName: 'Anna', lastName: 'Team', email: 'a@example.test', playerEmail: 'a@example.test', status: 'confirmed', teamName: 'Les Boulistes', vipLevel: 2,
      partnerFirstName: 'Paula', partnerLastName: 'Partner',
    }) });
    expect((await updateRegistration(request, env, existing, { id: 'owner', role: 'user' })).status).toBe(200);

    expect(protokoll().map(({ action, details }) => ({ action, details }))).toEqual([
      { action: 'team_name_changed', details: { from: '', to: 'Les Boulistes' } },
      { action: 'vip_changed', details: { from: 0, to: 2 } },
    ]);
  });

  it('protokolliert Verein, Lizenznummer, Telefon und Setzposition beim Bearbeiten', async () => {
    anmeldung('a', 'confirmed', { first_name: 'Anna', player_email: 'a@example.test', club: 'BC Alt', phone: '+49 1' });
    const existing = await getRegistrationWithTournament(env.DB, 'a');
    const request = new Request('https://ptm.test/api/registrations/a', { method: 'PUT', body: JSON.stringify({
      firstName: 'Anna', lastName: 'Team', email: 'a@example.test', playerEmail: 'a@example.test', status: 'confirmed',
      club: 'BC Neu', licenseNr: '123', phone: '', seedingPosition: 3, partnerFirstName: 'Paula', partnerLastName: 'Partner',
    }) });
    expect((await updateRegistration(request, env, existing, { id: 'owner', role: 'user' })).status).toBe(200);

    expect(protokoll().map(({ action, details, actor_role: role }) => ({ action, details, role }))).toEqual([
      { action: 'club_changed', details: { from: 'BC Alt', to: 'BC Neu' }, role: 'owner' },
      { action: 'license_changed', details: { from: '', to: '123' }, role: 'owner' },
      { action: 'seeding_changed', details: { from: null, to: 3 }, role: 'owner' },
      { action: 'phone_changed', details: { from: '+49 1', to: '' }, role: 'owner' },
    ]);
  });

  it('protokolliert die Teilnahme einzeln und für alle mit der handelnden Turnierleitung', async () => {
    sql("UPDATE tournaments SET status = 'running' WHERE id = 't1'");
    anmeldung('a', 'confirmed', { participation: 'inactive' });
    anmeldung('b', 'confirmed', { participation: 'active' });
    expect((await anfrage('/api/registrations/a/participation', { method: 'PUT', body: { participation: 'withdrawn' } })).status).toBe(200);
    expect((await anfrage('/api/tournaments/t1/participation', { method: 'PUT', body: { participation: 'inactive' } })).status).toBe(200);

    expect(protokoll().map(({ registration_id: id, actor_user_id: actor, action, details }) => ({ id, actor, action, details }))).toEqual([
      { id: 'a', actor: 'owner', action: 'participation_changed', details: { from: 'inactive', to: 'withdrawn' } },
      { id: 'b', actor: 'owner', action: 'participation_changed', details: { from: 'active', to: 'inactive', bulk: true } },
    ]);
  });

  it('protokolliert den automatischen Check-in beim Turnierstart mit der startenden Turnierleitung', async () => {
    anmeldung('a', 'confirmed', { participation: 'inactive' });
    anmeldung('b', 'confirmed', { participation: 'withdrawn' });
    const response = await anfrage('/api/tournaments/t1/start', { method: 'POST', body: {} });
    expect(response.status).toBe(200);

    expect(protokoll().filter((row) => row.action === 'participation_changed')
      .map(({ registration_id: id, actor_user_id: actor, actor_role: role, details }) => ({ id, actor, role, details }))).toEqual([
      { id: 'a', actor: 'owner', role: 'owner', details: { from: 'inactive', to: 'active', tournamentStart: true } },
    ]);
  });

  it('behält eine gelöschte Meldung mit Namen im Protokoll', async () => {
    anmeldung('a', 'confirmed', { team_name: 'Les Boulistes' });
    const response = await anfrage('/api/registrations/a', { method: 'DELETE' });
    expect(response.status).toBe(200);

    const [entry] = await eintraege();
    expect(entry).toMatchObject({ action: 'registration_deleted', participant: 'Les Boulistes (a Team + Paula Partner)',
      registrationDeleted: true, actorRole: 'owner', actorName: 'Lea Leitung', details: { status: 'confirmed' } });
  });

  it('protokolliert eine neue Online-Anmeldung über das Formular', async () => {
    const response = await anfrage('/api/tournaments/t1/registrations', { method: 'POST', user: null, body: {
      firstName: 'Neu', lastName: 'Melder', email: 'neu@example.test', playerEmail: 'neu@example.test', partnerFirstName: 'Pia', partnerLastName: 'Partner',
      publicationNoticeAccepted: true, personsConsentAccepted: true, feeSelections: [], registrationAnswers: [],
    } });
    expect(response.status).toBe(201);
    const { registration } = await response.json();

    expect(protokoll()).toEqual([expect.objectContaining({ registration_id: registration.id, actor_role: 'registrant',
      action: 'registration_created', details: { status: 'pending', participant: 'Neu Melder + Pia Partner' } })]);
  });

  it('zeigt das Protokoll nur der Turnierleitung, neueste zuerst und ohne Konto-IDs', async () => {
    anmeldung('a', 'confirmed');
    sql(`INSERT INTO audit_log (id, tournament_id, registration_id, actor_role, action, target, details_json, created_at)
      VALUES ('l1', 't1', 'a', 'registrant', 'account_linked', 'slot:1', '{"userId":"linked","reason":"slot_email"}', '2026-09-01T10:00:00.000Z'),
             ('l2', 't1', 'a', 'system', 'waitlist_promoted', 'registration', '{"status":"confirmed"}', '2026-09-02T10:00:00.000Z'),
             ('l3', 't1', NULL, 'owner', 'running_reset', 'tournament', NULL, '2026-09-03T10:00:00.000Z')`);

    const entries = await eintraege();
    expect(entries.map((entry) => entry.id)).toEqual(['l2', 'l1']);
    expect(entries[1]).toMatchObject({ participant: 'a Team + Paula Partner', registrationDeleted: false, details: { reason: 'slot_email' } });
    expect(JSON.stringify(entries)).not.toContain('userId');
    expect(JSON.stringify(entries)).not.toContain('"linked"');

    expect((await anfrage('/api/tournaments/t1/registration-log', { user: 'fremd' })).status).toBe(403);
    expect((await anfrage('/api/tournaments/t1/registration-log', { user: null })).status).toBe(401);
  });
});
