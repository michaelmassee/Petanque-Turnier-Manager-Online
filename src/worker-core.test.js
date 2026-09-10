import { describe, expect, it } from 'vitest';
import { assertPartnerCountMatchesFormation, normalizeTournamentInput, registrationOpenStatus, validateMatchScore } from './worker-core.js';

const base = { name: 'Testturnier', date: '2026-06-01', location: 'Musterstadt' };

describe('Worker-Fachlogik', () => {
  it('normalisiert ein vollständiges Turnier', () => {
    expect(normalizeTournamentInput({ ...base, formation: 'triplette', registrationType: 'supermelee', type: 'rangliste', visibility: 'public', latitude: '50', longitude: '8', contactEmail: 'a@b.de' })).toMatchObject({ currency: 'EUR', waitlistEnabled: true, registrationEnabled: true, approvalRequired: false, latitude: 50, longitude: 8 });
  });

  it('übernimmt die beim Anlegen aktivierte Anmeldeprüfung', () => {
    expect(normalizeTournamentInput({ ...base, approvalRequired: true })).toMatchObject({ approvalRequired: true });
  });

  it('respektiert registrationEnabled für Kalendereinträge', () => {
    expect(normalizeTournamentInput({ ...base, registrationEnabled: false })).toMatchObject({ registrationEnabled: false });
    expect(registrationOpenStatus({ visibility: 'public', status: 'registration', registration_enabled: 0 })).toBe('closed');
  });

  it('mappt Formation "andere" auf tete + formationOther, ohne den DB-CHECK zu verletzen', () => {
    expect(normalizeTournamentInput({ ...base, formation: 'andere' })).toMatchObject({ formation: 'tete', formationOther: true, registrationType: 'forme' });
    expect(normalizeTournamentInput({ ...base, formation: 'doublette' })).toMatchObject({ formation: 'doublette', formationOther: false });
    expect(() => normalizeTournamentInput({ ...base, formation: 'andere', registrationType: 'supermelee' })).toThrow('Formée');
  });

  it.each([
    [{ ...base, name: 'x' }, 'Turniername'], [{ ...base, date: 'x' }, 'Turnierdatum'], [{ ...base, startTime: '2:00' }, 'Startzeit'], [{ ...base, location: 'x' }, 'Ort'],
    [{ ...base, type: 'x' }, 'Turniersystem'], [{ ...base, formation: 'x' }, 'Formation'], [{ ...base, registrationType: 'x' }, 'Anmeldetyp'],
    [{ ...base, formation: 'tete', registrationType: 'melee' }, 'Tête'], [{ ...base, formation: 'doublette', registrationType: 'supermelee', type: 'ko' }, 'Rangliste'],
    [{ ...base, status: 'x' }, 'Turnierstatus'], [{ ...base, visibility: 'x' }, 'Sichtbarkeit'], [{ ...base, contactEmail: 'x' }, 'Kontakt-E-Mail'],
    [{ ...base, latitude: 50 }, 'Breiten- und Längengrad'], [{ ...base, latitude: 100, longitude: 8 }, 'Koordinate'], [{ ...base, currency: 'XXX' }, 'Währung'],
    [{ ...base, registrationOpensAt: '2026-06-03T10:00', registrationDeadline: '2026-06-02T10:00' }, 'darf nicht nach'],
  ])('lehnt ungültige Eingaben ab', (body, message) => expect(() => normalizeTournamentInput(body)).toThrow(message));

  it('akzeptiert Legacy-UTC und wendet alle Partnerregeln an', () => {
    expect(normalizeTournamentInput({ ...base, registrationDeadline: '2026-06-02T10:00:00.000Z' }, { legacyRegistrationTimes: true }).registrationDeadline).toContain('2026');
    expect(() => assertPartnerCountMatchesFormation({ formation: 'tete' }, { partnerFirstName: 'A', partnerLastName: 'B' })).toThrow('keinen Partner');
    expect(() => assertPartnerCountMatchesFormation({ formation: 'doublette' }, {})).toThrow('genau einen Partner');
    expect(() => assertPartnerCountMatchesFormation({ formation: 'doublette' }, { partnerFirstName: 'A', partnerLastName: 'B', partner2FirstName: 'C', partner2LastName: 'D' })).toThrow('nur einen Partner');
    expect(() => assertPartnerCountMatchesFormation({ formation: 'triplette' }, { partnerFirstName: 'A', partnerLastName: 'B' })).toThrow('genau zwei Partner');
    expect(() => assertPartnerCountMatchesFormation({ formation: 'triplette' }, { partnerFirstName: 'A', partnerLastName: 'B', partner2FirstName: 'C', partner2LastName: 'D' })).not.toThrow();
  });

  it('liefert alle Öffnungszustände', () => {
    const tournament = { visibility: 'public', status: 'registration', registration_opens_at: '2026-06-02T10:00:00Z', registration_deadline: '2026-06-03T10:00:00Z' };
    expect(registrationOpenStatus({ ...tournament, visibility: 'private' })).toBe('closed');
    expect(registrationOpenStatus(tournament, new Date('2026-06-02T09:00:00Z'))).toBe('not_yet_open');
    expect(registrationOpenStatus(tournament, new Date('2026-06-02T12:00:00Z'))).toBe('open');
    expect(registrationOpenStatus(tournament, new Date('2026-06-04T12:00:00Z'))).toBe('deadline_passed');
  });

  it('akzeptiert nur Ergebniswerte von 0 bis 13', () => {
    expect(validateMatchScore(13)).toBe(13);
    expect(validateMatchScore('0')).toBe(0);
    for (const value of [-1, 14, 99, '', null, '13.5']) {
      expect(() => validateMatchScore(value)).toThrow('Ungültiges Ergebnis');
    }
  });
});
