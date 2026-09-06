import { describe, expect, it } from 'vitest';
import { filterRegistrations, filterTournaments, filterUsers } from './App.jsx';

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
});

describe('filterUsers', () => {
  it('liefert alle Benutzer bei leerer Suche und ohne Filter', () => {
    expect(filterUsers(users, '', '', '')).toEqual(users);
  });

  it('filtert per Teilstring über Name/E-Mail', () => {
    expect(filterUsers(users, 'bea@example.com', '', '')).toEqual([users[1]]);
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
