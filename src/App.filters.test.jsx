import { describe, expect, it } from 'vitest';
import { filterApiKeys, filterRegistrations, filterTournaments, filterUsers } from './frontend-core.js';
import { currencyDecimals } from './currencies.js';

const tournaments = [
  { id: 't1', name: 'Sommerturnier', location: 'Musterstadt', status: 'registration' },
  { id: 't2', name: 'Winterpokal', location: 'Beispielhausen', status: 'draft' },
];

const registrations = [
  { id: 'r1', firstName: 'Anna', lastName: 'Muster', teamName: 'Team A', status: 'pending' },
  { id: 'r2', firstName: 'Bea', lastName: 'Beispiel', teamName: 'Team B', status: 'confirmed' },
];

const users = [
  { id: 'u1', firstName: 'Anna', lastName: 'Admin', email: 'anna@example.com', role: 'admin', emailVerifiedAt: '2024-01-01', passwordChangeRequired: false },
  { id: 'u2', firstName: 'Bea', lastName: 'User', email: 'bea@example.com', role: 'user', emailVerifiedAt: null, passwordChangeRequired: true },
];

describe('filterTournaments', () => {
  it('liefert alle Turniere bei leerer Suche und ohne Filter', () => {
    expect(filterTournaments(tournaments, '', '')).toEqual(tournaments);
  });

  it('filtert per Teilstring case-insensitive über Name/Ort', () => {
    expect(filterTournaments(tournaments, 'SOMMER', '')).toEqual([tournaments[0]]);
    expect(filterTournaments(tournaments, 'beispielhausen', '')).toEqual([tournaments[1]]);
  });

  it('filtert nach Status', () => {
    expect(filterTournaments(tournaments, '', 'draft')).toEqual([tournaments[1]]);
  });
});

describe('filterRegistrations', () => {
  it('liefert alle Anmeldungen bei leerer Suche und ohne Filter', () => {
    expect(filterRegistrations(registrations, '', '')).toEqual(registrations);
  });

  it('filtert per Teilstring über Name/Team', () => {
    expect(filterRegistrations(registrations, 'anna', '')).toEqual([registrations[0]]);
    expect(filterRegistrations(registrations, 'team b', '')).toEqual([registrations[1]]);
  });

  it('filtert nach Status', () => {
    expect(filterRegistrations(registrations, '', 'confirmed')).toEqual([registrations[1]]);
  });

  it('filtert Nachricht, positiv beantwortete Frage und Tarif gleichzeitig', () => {
    const detailedRegistrations = [
      { ...registrations[0], organizerMessage: 'Bitte früher da sein.', registrationAnswers: [{ questionId: 'meal', participant: 'primary', checked: true }], feeSelections: [{ tariffId: 'member', name: 'Mitglied' }] },
      { ...registrations[1], organizerMessage: '', registrationAnswers: [{ questionId: 'shirt', participant: 'primary', checked: true }], feeSelections: [{ tariffId: 'guest', name: 'Gast' }] },
    ];

    expect(filterRegistrations(detailedRegistrations, '', '', { organizerMessageFilter: 'with_message' })).toEqual([detailedRegistrations[0]]);
    expect(filterRegistrations(detailedRegistrations, '', '', { organizerMessageFilter: 'without_message' })).toEqual([detailedRegistrations[1]]);
    expect(filterRegistrations(detailedRegistrations, '', '', { questionFilter: 'meal' })).toEqual([detailedRegistrations[0]]);
    expect(filterRegistrations(detailedRegistrations, '', '', { feeFilter: 'guest' })).toEqual([detailedRegistrations[1]]);
    expect(filterRegistrations(detailedRegistrations, '', '', { organizerMessageFilter: 'with_message', questionFilter: 'meal', feeFilter: 'member' })).toEqual([detailedRegistrations[0]]);
    expect(filterRegistrations([...detailedRegistrations, { id: 'r3', firstName: null, lastName: '', teamName: null, status: 'pending', registrationAnswers: [{ questionId: 'meal', checked: false }]}], '', '', { questionFilter: 'meal' })).toEqual([detailedRegistrations[0]]);
    expect(filterRegistrations([...detailedRegistrations, { id: 'r3', firstName: null, lastName: '', teamName: null, status: 'pending' }], 'unbekannt', '', { organizerMessageFilter: 'unknown', questionFilter: 'unknown', feeFilter: 'unknown' })).toEqual([]);
  });
});

describe('filterUsers', () => {
  it('liefert alle Benutzer bei leerer Suche und ohne Filter', () => {
    expect(filterUsers(users, '', '', '')).toEqual(users);
  });

  it('filtert per Teilstring über Name/E-Mail', () => {
    expect(filterUsers(users, 'bea@example.com', '', '')).toEqual([users[1]]);
    expect(filterUsers([{ id: 'u3', firstName: '', lastName: null, email: 'ohne-namen@example.com', role: 'user' }], 'ohne-namen', '', '')).toHaveLength(1);
  });

  it('filtert nach Rolle', () => {
    expect(filterUsers(users, '', 'admin', '')).toEqual([users[0]]);
  });

  it('filtert nach E-Mail-Status', () => {
    expect(filterUsers(users, '', '', 'unverified')).toEqual([users[1]]);
    expect(filterUsers(users, '', '', 'verified')).toEqual([users[0]]);
  });

  it('filtert nach erzwungenem Passwortwechsel', () => {
    expect(filterUsers(users, '', '', 'password_change_required')).toEqual([users[1]]);
  });
});

const apiKeys = [
  { id: 'k1', label: 'Bürorechner', status: 'pending', userName: 'Anna Admin', userEmail: 'anna@example.com' },
  { id: 'k2', label: 'Laptop Turnierleitung', status: 'approved', userName: 'Bea User', userEmail: 'bea@example.com' },
  { id: 'k3', label: null, status: 'revoked', userName: 'Carl User', userEmail: 'carl@example.com' },
];

describe('filterApiKeys', () => {
  it('liefert alle Schlüssel bei leerer Suche und ohne Filter', () => {
    expect(filterApiKeys(apiKeys, '', '')).toEqual(apiKeys);
  });

  it('filtert per Teilstring über Bezeichnung/Name/E-Mail', () => {
    expect(filterApiKeys(apiKeys, 'bürorechner', '')).toEqual([apiKeys[0]]);
    expect(filterApiKeys(apiKeys, 'bea@example.com', '')).toEqual([apiKeys[1]]);
  });

  it('behandelt fehlende Bezeichnung als leeren String', () => {
    expect(filterApiKeys(apiKeys, 'carl@example.com', '')).toEqual([apiKeys[2]]);
  });

  it('filtert nach Status', () => {
    expect(filterApiKeys(apiKeys, '', 'approved')).toEqual([apiKeys[1]]);
  });
});

describe('currencyDecimals', () => {
  it('unterscheidet Null-, Drei- und Standard-Nachkommastellen', () => {
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('KWD')).toBe(3);
    expect(currencyDecimals('EUR')).toBe(2);
  });
});
