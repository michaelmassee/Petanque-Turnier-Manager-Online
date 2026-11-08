// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { createRegistration, syncGetRegistrations } from './worker.js';

// Auswahlfrage (Issue #33): bei der Selbstanmeldung Pflicht, für die Turnierleitung nicht.
describe('Auswahlfrage bei der Anmeldung', () => {
  let env;
  const turnier = () => env.DB.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const antworten = () => env.DB.sqlite.prepare("SELECT registration_answers FROM registrations WHERE tournament_id = 't1'").all().map((row) => JSON.parse(row.registration_answers));
  const QUESTIONS = [
    { id: 'essen', label: 'Essen', type: 'choice', options: [{ id: 'schinken', label: 'Schinken-Salami' }, { id: 'veggie', label: 'Vegetarisch' }, { id: 'nichts', label: 'Nichts' }] },
    { id: 'shirt', label: 'T-Shirt?' },
  ];

  function anmelden(body = {}, optionen = {}) {
    const request = new Request('https://ptm.test/api/tournaments/t1/registrations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Anna', lastName: 'Adler', playerEmail: 'anna@example.test', partnerFirstName: 'Bert', partnerLastName: 'Berg',
        publicationNoticeAccepted: true, personsConsentAccepted: true, feeSelections: [], registrationAnswers: [], ...body }),
    });
    return createRegistration(request, env, turnier(), optionen);
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    env.DB.sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01');
      INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('owner-session', 'owner', '2199-01-01', '2026-09-01');`);
    env.DB.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, registration_type, status, visibility, registration_questions, created_at, updated_at)
      VALUES ('t1', 'owner', 'Turnier', '2099-09-28', 'Ort', 'doublette', 'forme', 'registration', 'public', ?, '2026-09-01', '2026-09-01')`).run(JSON.stringify(QUESTIONS));
  });

  it('verlangt bei der Selbstanmeldung von jedem Spieler eine Auswahl', async () => {
    await expect(anmelden()).rejects.toMatchObject({ status: 400, details: { code: 'registration_choice_required' } });
    await expect(anmelden({ registrationAnswers: [{ participant: 'primary', questionId: 'essen', optionId: 'veggie' }] }))
      .rejects.toMatchObject({ status: 400, details: { code: 'registration_choice_required' } });

    const response = await anmelden({ registrationAnswers: [
      { participant: 'primary', questionId: 'essen', optionId: 'veggie' },
      { participant: 'partner', questionId: 'essen', optionId: 'nichts' },
      { participant: 'partner', questionId: 'shirt', checked: true },
    ] });
    expect(response.status).toBe(201);
    expect(antworten()).toEqual([[
      { participant: 'primary', questionId: 'essen', optionId: 'veggie' },
      { participant: 'partner', questionId: 'essen', optionId: 'nichts' },
      { participant: 'partner', questionId: 'shirt', checked: true },
    ]]);
  });

  it('lehnt unbekannte Einträge ab', async () => {
    await expect(anmelden({ registrationAnswers: [
      { participant: 'primary', questionId: 'essen', optionId: 'pizza' },
      { participant: 'partner', questionId: 'essen', optionId: 'nichts' },
    ] })).rejects.toMatchObject({ status: 400 });
  });

  it('lässt die Turnierleitung ohne Auswahl eintragen', async () => {
    const response = await anmelden({}, { session: { user: { id: 'owner', role: 'user' } } });
    expect(response.status).toBe(201);
    expect(antworten()).toEqual([[]]);
  });

  it('verwirft Antworten auf einen entfernten Eintrag', async () => {
    await anmelden({ registrationAnswers: [
      { participant: 'primary', questionId: 'essen', optionId: 'veggie' },
      { participant: 'partner', questionId: 'essen', optionId: 'nichts' },
    ] });
    const ohneNichts = [{ ...QUESTIONS[0], options: QUESTIONS[0].options.filter((option) => option.id !== 'nichts') }, QUESTIONS[1]];
    const response = await worker.fetch(new Request('https://ptm.test/api/tournaments/t1', {
      method: 'PUT', headers: { Cookie: 'ptm_session=owner-session', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Turnier', date: '2099-09-28', location: 'Ort', latitude: 52.52, longitude: 13.405, formation: 'doublette',
        registrationType: 'forme', status: 'registration', visibility: 'public', registrationQuestions: ohneNichts }),
    }), env);

    expect(response.status).toBe(200);
    expect(antworten()).toEqual([[{ participant: 'primary', questionId: 'essen', optionId: 'veggie' }]]);
  });

  it('liefert Auswahl-Antworten dem Turnierdokument als „Frage: Eintrag“', async () => {
    await anmelden({ registrationAnswers: [
      { participant: 'primary', questionId: 'essen', optionId: 'veggie' },
      { participant: 'partner', questionId: 'essen', optionId: 'nichts' },
      { participant: 'primary', questionId: 'shirt', checked: true },
    ] });
    const body = await (await syncGetRegistrations(env.DB, turnier(), new URL('https://ptm.test/api/sync/tournaments/t1/registrations'))).json();

    expect(body.registrations[0].registrationAnswers).toEqual([
      { participant: 'primary', questionId: 'essen', optionId: 'veggie', checked: true, optionLabel: 'Vegetarisch', questionLabel: 'Essen: Vegetarisch' },
      { participant: 'partner', questionId: 'essen', optionId: 'nichts', checked: true, optionLabel: 'Nichts', questionLabel: 'Essen: Nichts' },
      { participant: 'primary', questionId: 'shirt', checked: true, questionLabel: 'T-Shirt?' },
    ]);
  });
});
