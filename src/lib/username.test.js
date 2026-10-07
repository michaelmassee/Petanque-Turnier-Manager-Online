import { describe, expect, it } from 'vitest';
import { normalizeUsername, suggestUsername, usernameCandidates, usernameProblem, withUsernameSuffix } from './username.js';
import { isOffensiveUsername } from './usernameBlocklist.js';
import { formatUserLabel, formatUserMeta, formatUserName } from './userLabel.js';

describe('Benutzername', () => {
  it('normalisiert Eingaben auf Kleinschreibung ohne führendes @', () => {
    expect(normalizeUsername('  @Anna.Schmidt ')).toBe('anna.schmidt');
  });

  it('prüft Format und reservierte Wortteile', () => {
    expect(usernameProblem('anna.schmidt')).toBe('');
    expect(usernameProblem('a_b-c')).toBe('');
    expect(usernameProblem('ab')).toBe('invalid');
    expect(usernameProblem('x'.repeat(31))).toBe('invalid');
    expect(usernameProblem('.anna')).toBe('invalid');
    expect(usernameProblem('anna.')).toBe('invalid');
    expect(usernameProblem('anna..schmidt')).toBe('invalid');
    expect(usernameProblem('anna schmidt')).toBe('invalid');
    expect(usernameProblem('ptm.admin')).toBe('reserved');
    expect(usernameProblem('support')).toBe('reserved');
    expect(usernameProblem('badminton.fan')).toBe('');
    expect(usernameProblem('hurensohn99')).toBe('offensive');
  });

  it('schlägt vorname.nachname mit Umlauten und Akzenten vor', () => {
    expect(suggestUsername('Jürgen', 'Groß')).toBe('juergen.gross');
    expect(suggestUsername('Anna Maria', 'Schmidt')).toBe('anna-maria.schmidt');
    expect(suggestUsername('François', "D'Éste")).toBe('francois.d-este');
    expect(suggestUsername('Bartholomäus-Maximilian', 'Hohenzollern-Sigmaringen')).toHaveLength(30);
    expect(suggestUsername('', '')).toBe('spieler');
    expect(suggestUsername('Al', '')).toBe('spieler');
  });

  it('weicht bei anstößigem Vorschlag auf vorname.n bzw. spieler aus', () => {
    expect(usernameCandidates('Anna', 'Hitler')).toEqual(['anna.h', 'anna', 'spieler']);
  });

  it('hängt eine Zahl an und kürzt dafür den Namen', () => {
    expect(withUsernameSuffix('anna.schmidt', 2)).toBe('anna.schmidt2');
    expect(withUsernameSuffix('a'.repeat(30), 12)).toBe(`${'a'.repeat(28)}12`);
    expect(withUsernameSuffix(`${'a'.repeat(28)}.b`, 7)).toBe(`${'a'.repeat(28)}7`);
  });
});

describe('Sperrliste', () => {
  it.each([
    'hurensohn', 'xx.arschloch.xx', 'fuck.you', 'fuck3r', 'fuuuck', 'n1gger', 'h1tler', 'sieg.heil', 'anna.1488',
    'hh88', 'nazi88', 'max.nazi', 'kut', 'pute', 'gilipollas', 'klootzak', 'enculé', 'salope', 'wh0re',
  ])('sperrt „%s“', (name) => {
    expect(isOffensiveUsername(name)).toBe(true);
  });

  // Gängige Namen und Wörter, die Teilwörter der Liste enthalten, dürfen nicht anschlagen.
  it.each([
    'michael.massee', 'hancock', 'dickmann', 'peter.dick', 'schwanitz', 'scunthorpe', 'anita', 'johny', 'fickert',
    'fickenscher', 'cassandra', 'hammer.devries', 'connelly', 'bitterlich', 'therapist', 'thomas88', 'conrad',
    'pedersen', 'puteaux', 'spickermann', 'cockburn', 'kuttner', 'lulu', 'hoerner', 'nazir', 'consuela', 'culotte',
    'sexton', 'shitara', 'koch.hh.nord', 'jan.mof',
  ])('lässt „%s“ zu', (name) => {
    expect(isOffensiveUsername(name)).toBe(false);
  });
});

describe('Personenanzeige', () => {
  const anna = { firstName: 'Anna', lastName: 'Schmidt', username: 'anna.schmidt', club: 'BC Linden' };

  it('setzt Name, Benutzername und Verein zusammen', () => {
    expect(formatUserName(anna)).toBe('Anna Schmidt');
    expect(formatUserMeta(anna)).toBe('@anna.schmidt · BC Linden');
    expect(formatUserMeta(anna, { withClub: false })).toBe('@anna.schmidt');
    expect(formatUserLabel(anna)).toBe('Anna Schmidt (@anna.schmidt · BC Linden)');
    expect(formatUserLabel({ firstName: 'Anna', lastName: 'Schmidt' })).toBe('Anna Schmidt');
  });
});
