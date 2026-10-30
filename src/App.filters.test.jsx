import { describe, expect, it } from 'vitest';
import { filterApiKeys, filterRegistrations, filterTournaments, filterUsers, sortUsers } from './frontend-core.js';
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

  it('filtert nach VIP', () => {
    const vipRegistrations = [{ ...registrations[0], isVip: true }, { ...registrations[1], isVip: false }, { ...registrations[1], id: 'r3' }];

    expect(filterRegistrations(vipRegistrations, '', '', { vipFilter: 'vip' })).toEqual([vipRegistrations[0]]);
    expect(filterRegistrations(vipRegistrations, '', '', { vipFilter: 'not_vip' })).toEqual([vipRegistrations[1], vipRegistrations[2]]);
    expect(filterRegistrations(vipRegistrations, '', '', { vipFilter: 'unknown' })).toEqual([]);
  });
});

describe('sortUsers', () => {
  const users = [
    { id: 'zoe', firstName: 'Zoe', lastName: 'Adler', club: 'BC Linden', lastSeenAt: '2026-10-20T10:00:00.000Z' },
    { id: 'anna-b', firstName: 'anna', lastName: 'Bauer', club: null, lastSeenAt: null },
    { id: 'anna-a', firstName: 'Anna', lastName: 'Adler', club: 'Ärzte Boule', lastSeenAt: '2026-10-27T08:00:00.000Z' },
    { id: 'max', firstName: 'Max', lastName: 'Müller', club: 'bc linden', lastSeenAt: '2026-10-25T08:00:00.000Z' },
  ];
  const ids = (sortBy) => sortUsers(users, sortBy).map((user) => user.id);

  it('sortiert nach Vorname, dann Nachname, ohne Groß-/Kleinschreibung (Standard)', () => {
    expect(ids()).toEqual(['anna-a', 'anna-b', 'max', 'zoe']);
    expect(ids('unbekannt')).toEqual(['anna-a', 'anna-b', 'max', 'zoe']);
  });

  it('sortiert nach „zuletzt online“, nie Gesehene am Ende', () => {
    expect(ids('lastSeen')).toEqual(['anna-a', 'max', 'zoe', 'anna-b']);
  });

  it('sortiert nach Verein, Umlaute richtig, ohne Verein am Ende, innerhalb des Vereins nach Name', () => {
    expect(ids('club')).toEqual(['anna-a', 'max', 'zoe', 'anna-b']);
  });

  it('sortiert bei Gleichstand und fehlenden Namensteilen stabil nach Name', () => {
    const ties = [
      { id: 'ohne-nachname', firstName: 'Ida', club: null, lastSeenAt: null },
      { id: 'ohne-vorname', lastName: 'Kranz', club: null, lastSeenAt: null },
      { id: 'ida-a', firstName: 'Ida', lastName: 'Adler', club: null, lastSeenAt: null },
    ];
    expect(sortUsers(ties, 'lastSeen').map((user) => user.id)).toEqual(['ohne-vorname', 'ohne-nachname', 'ida-a']);
    expect(sortUsers(ties, 'club').map((user) => user.id)).toEqual(['ohne-vorname', 'ohne-nachname', 'ida-a']);
  });

  it('verändert die übergebene Liste nicht', () => {
    sortUsers(users, 'club');
    expect(users.map((user) => user.id)).toEqual(['zoe', 'anna-b', 'anna-a', 'max']);
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

  const configuredUsers = [
    { ...users[0], tournamentLimit: 0, mailEnabled: false },
    { ...users[1], tournamentLimit: 0, mailEnabled: false },
    { id: 'default', role: 'user', firstName: 'Standard' },
    { id: 'custom', role: 'user', firstName: 'Mehr', tournamentLimit: 10, mailEnabled: true, emailVerifiedAt: '2026-10-23' },
    { id: 'legacy', role: 'user', firstName: 'Altbestand', tournamentLimit: null, mailEnabled: null },
  ];

  it.each([
    ['0', ['u2']], ['5', ['default', 'legacy']], ['10', ['custom']], ['unlimited', ['u1']], ['99', []],
  ])('filtert nach effektivem Turnier-Limit %s, einschließlich Null und unbegrenzten Admins', (tournamentLimitFilter, ids) => {
    expect(filterUsers(configuredUsers, '', '', '', { tournamentLimitFilter }).map((user) => user.id)).toEqual(ids);
  });

  it.each([
    ['enabled', ['u1', 'default', 'custom', 'legacy']], ['disabled', ['u2']],
  ])('filtert E-Mail-Versand %s nach den effektiven Rechten', (mailFilter, ids) => {
    expect(filterUsers(configuredUsers, '', '', '', { mailFilter }).map((user) => user.id)).toEqual(ids);
  });

  it.each([
    ['70', ['default', 'legacy']], ['120', ['custom']], ['unlimited', ['u1']], ['5', []],
  ])('filtert nach effektivem Teilnehmer-Limit %s (Standard 70, Admins unbegrenzt)', (participantLimitFilter, ids) => {
    const withLimits = configuredUsers.map((user) => (user.id === 'custom' ? { ...user, participantLimit: 120 }
      : user.id === 'u2' ? { ...user, participantLimit: 0 } : user));
    expect(filterUsers(withLimits, '', '', '', { participantLimitFilter }).map((user) => user.id)).toEqual(ids);
  });

  it('kombiniert beide neuen Filter mit Suche, Rolle und Kontostatus', () => {
    expect(filterUsers(configuredUsers, 'Mehr', 'user', 'verified', { tournamentLimitFilter: '10', mailFilter: 'enabled' })).toEqual([configuredUsers[3]]);
    expect(filterUsers(configuredUsers, '', '', '', { tournamentLimitFilter: '10', mailFilter: 'disabled' })).toEqual([]);
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
