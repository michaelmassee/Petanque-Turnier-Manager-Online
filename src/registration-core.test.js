import { describe, expect, it } from 'vitest';
import {
  isIncompleteTeam, nextSlotUserId, registrationConflicts, registrationFlagsById, registrationSlots, registrationUnit,
} from './registration-core.js';

const anmeldung = (id, personen, status = 'confirmed') => {
  const [a = [], b = [], c = []] = personen;
  return {
    id, status,
    first_name: a[0], last_name: a[1], user_id: a[2] || null, player_email: a[3] || null,
    partner_first_name: b[0], partner_last_name: b[1], partner_user_id: b[2] || null, partner_email: b[3] || null,
    partner2_first_name: c[0], partner2_last_name: c[1], partner2_user_id: c[2] || null, partner2_email: c[3] || null,
  };
};

describe('Anmeldeeinheit (E-20)', () => {
  it('ist eine Person bei Mêlée, Supermêlée und Tête, sonst 2 bis Formationsstärke', () => {
    expect(registrationUnit({ registration_type: 'melee', formation: 'doublette' })).toEqual({ kind: 'single', min: 1, max: 1 });
    expect(registrationUnit({ registration_type: 'supermelee', formation: 'triplette' })).toMatchObject({ max: 1 });
    expect(registrationUnit({ registration_type: 'forme', formation: 'tete' })).toMatchObject({ max: 1 });
    expect(registrationUnit({ registration_type: 'forme', formation: 'doublette' })).toEqual({ kind: 'team', min: 2, max: 2 });
    expect(registrationUnit({ registrationType: 'forme', formation: 'triplette' })).toEqual({ kind: 'team', min: 2, max: 3 });
  });

  it('kennzeichnet eine Triplette mit zwei Personen als unvollständig (P-51)', () => {
    const triplette = { registration_type: 'forme', formation: 'triplette' };
    expect(isIncompleteTeam(triplette, anmeldung('r', [['A', 'A'], ['B', 'B']]))).toBe(true);
    expect(isIncompleteTeam(triplette, anmeldung('r', [['A', 'A'], ['B', 'B'], ['C', 'C']]))).toBe(false);
    expect(isIncompleteTeam({ registration_type: 'melee', formation: 'doublette' }, anmeldung('r', [['A', 'A']]))).toBe(false);
  });

  it('liefert nur belegte Personen-Slots', () => {
    expect(registrationSlots(anmeldung('r', [['Anna', 'Adler', 'u1', 'a@x.test'], ['Ben', 'Berg']])).map((slot) => [slot.slot, slot.userId]))
      .toEqual([[1, 'u1'], [2, null]]);
  });
});

describe('Doppelte Erfassung (KP-06)', () => {
  it('markiert dieselbe Benutzer-ID in zwei aktiven Anmeldungen als Konflikt, stornierte zählen nicht (P-29, P-30)', () => {
    const rows = [
      anmeldung('r1', [['Xaver', 'X', 'ux'], ['Ben', 'Berg']]),
      anmeldung('r2', [['Xaver', 'X', 'ux'], ['Dora', 'Dahl']], 'waitlist'),
      anmeldung('r3', [['Xaver', 'X', 'ux']], 'cancelled'),
    ];
    const { accountConflicts, possibleDuplicates } = registrationConflicts(rows);
    expect(accountConflicts).toEqual([{ userId: 'ux', registrationIds: ['r1', 'r2'] }]);
    // Der gleiche Name ist durch das Konto bereits sicher erkannt: kein zusätzlicher Hinweis.
    expect(possibleDuplicates).toEqual([]);
  });

  it('zeigt gleichnamige Gäste nur als mögliche Dublette ohne Konflikt (P-29 b\', P-44)', () => {
    const rows = [anmeldung('r1', [['Jean-Paul', 'Müller']]), anmeldung('r2', [['jean paul', 'muller']])];
    const flags = registrationFlagsById(rows);
    expect(flags('r1')).toEqual({ accountConflictWith: [], possibleDuplicateWith: ['r2'] });
    expect(registrationConflicts(rows).accountConflicts).toEqual([]);
  });

  it('erkennt mögliche Dubletten auch über gleiche Slot-E-Mails', () => {
    const rows = [anmeldung('r1', [['Anna', 'Adler', null, 'a@x.test']]), anmeldung('r2', [['Anne', 'Adler', null, 'A@X.test']])];
    expect(registrationConflicts(rows).possibleDuplicates).toEqual([{ kind: 'email', registrationIds: ['r1', 'r2'] }]);
  });
});

describe('Kontoverknüpfung eines Slots bei Änderungen (KP-11, KP-20)', () => {
  const existing = { firstName: 'Ben', lastName: 'Berg', userId: 'u2' };
  it('behält das Konto derselben Person und verknüpft eine neue Person über die Slot-E-Mail', () => {
    expect(nextSlotUserId({ existing, next: { firstName: 'ben', lastName: 'berg' }, resolvedUserId: 'u9' })).toBe('u2');
    expect(nextSlotUserId({ existing, next: { firstName: 'Dora', lastName: 'Dahl' }, resolvedUserId: 'u4' })).toBe('u4');
    expect(nextSlotUserId({ existing, next: { firstName: 'Dora', lastName: 'Dahl' }, resolvedUserId: null })).toBeNull();
    expect(nextSlotUserId({ existing, next: { firstName: '', lastName: '' }, resolvedUserId: 'u2' })).toBeNull();
  });
});
