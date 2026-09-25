import { describe, expect, it } from 'vitest';
import { assertPartnerCountMatchesFormation, isNewlyPublicTournament, isTournamentRoundNumberConflict, readBodyWithLimit, normalizePlayerListingPosition, initialParticipation, isCalendarEntry, normalizeTournamentInput, parseParticipation, playerListingMatchesPosition, registrationOpenStatus, tournamentMatchesSavedSearch, validateMatchScore, workerDistanceKm } from './worker-core.js';

const base = { name: 'Testturnier', date: '2026-06-01', location: 'Musterstadt' };

describe('Worker-Fachlogik', () => {
  it('erkennt Kalendereinträge am abgeschalteten Anmeldeverfahren', () => {
    expect(isCalendarEntry({ registration_enabled: 0 })).toBe(true);
    expect(isCalendarEntry({ registration_enabled: 1 })).toBe(false);
    expect(isCalendarEntry({})).toBe(false);
  });

  it('checkt neue Meldungen nur bei laufender Online-Durchführung und Bestätigung direkt ein', () => {
    expect(initialParticipation({ status: 'registration' }, 'confirmed')).toBe('inactive');
    expect(initialParticipation({ status: 'running' }, 'confirmed')).toBe('active');
    expect(initialParticipation({ status: 'running' }, 'pending')).toBe('inactive');
    expect(initialParticipation({ status: 'running', desktop_execution: 1 }, 'confirmed')).toBe('inactive');
  });

  it('übernimmt bei Sync-Nachmeldungen den Teilnahme-Status aus dem Turnierdokument', () => {
    const desktopTournament = { status: 'running', desktop_execution: 1 };
    expect(initialParticipation(desktopTournament, 'confirmed', 'active', true)).toBe('active');
    expect(initialParticipation(desktopTournament, 'confirmed', 'withdrawn', true)).toBe('withdrawn');
    expect(() => initialParticipation(desktopTournament, 'confirmed', 'confirmed', true)).toThrow('Ungültige Teilnahme');
  });

  it('akzeptiert nur die drei Teilnahme-Zustände und keinen Anmeldestatus', () => {
    expect(parseParticipation('inactive')).toBe('inactive');
    expect(parseParticipation('active')).toBe('active');
    expect(parseParticipation('withdrawn')).toBe('withdrawn');
    expect(() => parseParticipation('confirmed')).toThrow('Ungültige Teilnahme');
    expect(() => parseParticipation(undefined, 'Ungültige Teilnahme für Anmeldung r1')).toThrow('Anmeldung r1');
  });

  it('normalisiert Spielpositionen und lässt flexible Gesuche bei jeder Positionssuche zu', () => {
    expect(normalizePlayerListingPosition()).toBe('egal');
    expect(normalizePlayerListingPosition('milieu')).toBe('milieu');
    expect(() => normalizePlayerListingPosition('melee')).toThrow('Spielposition');
    expect(playerListingMatchesPosition({ playing_position: 'egal' }, 'leger')).toBe(true);
    expect(playerListingMatchesPosition({ playing_position: 'milieu' }, 'leger')).toBe(false);
  });

  it('normalisiert ein vollständiges Turnier', () => {
    expect(normalizeTournamentInput({ ...base, formation: 'triplette', registrationType: 'supermelee', type: 'rangliste', visibility: 'public', latitude: '50', longitude: '8', contactEmail: 'a@b.de' })).toMatchObject({ currency: 'EUR', waitlistEnabled: true, registrationEnabled: true, approvalRequired: false, latitude: 50, longitude: 8 });
  });

  it('übernimmt die beim Anlegen aktivierte Anmeldeprüfung', () => {
    expect(normalizeTournamentInput({ ...base, approvalRequired: true })).toMatchObject({ approvalRequired: true });
  });

  it('akzeptiert nur die kleine, versionierte Turnierbeschreibung', () => {
    const description = 'ptm-richtext:v1:{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Wichtig","marks":[{"type":"bold"},{"type":"underline"}]}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Punkt","marks":[{"type":"strike"}]}]},{"type":"orderedList","attrs":{"start":1,"type":null},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Unterpunkt","marks":[{"type":"italic"}]}]}]}]}]}]}]}';
    expect(normalizeTournamentInput({ ...base, description }).description).toBe(description);
    expect(normalizeTournamentInput({ ...base, description: '<strong>Bestehender Klartext</strong>' }).description).toBe('<strong>Bestehender Klartext</strong>');
    expect(() => normalizeTournamentInput({ ...base, description: 'ptm-richtext:v1:{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Nicht erlaubt"}]}]}' })).toThrow('Turnierbeschreibung');
    expect(() => normalizeTournamentInput({ ...base, description: 'ptm-richtext:v1:{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Kein Link","marks":[{"type":"link","attrs":{"href":"https://example.test"}}]}]}]}' })).toThrow('Turnierbeschreibung');
    expect(() => normalizeTournamentInput({ ...base, description: 'ptm-richtext:v1:not-json' })).toThrow('Turnierbeschreibung');
  });

  it('normalisiert ermäßigte Startgeld-Tarife und weist ungültige Tarife ab', () => {
    expect(normalizeTournamentInput({ ...base, feeTiers: [{ id: 'youth', name: 'Jugend', amountCents: 300 }] }).feeTiers).toEqual([
      { id: 'youth', name: 'Jugend', amountCents: 300, active: true },
    ]);
    expect(() => normalizeTournamentInput({ ...base, feeTiers: [{ id: 'x', name: 'x', amountCents: 1 }] })).toThrow('Startgeld-Tarife');
    expect(() => normalizeTournamentInput({ ...base, feeTiers: [{ id: 'legacy-standard', name: 'Normal', amountCents: 1 }] })).toThrow('Startgeld-Tarife');
    expect(() => normalizeTournamentInput({ ...base, feeTiers: Array.from({ length: 11 }, (_, index) => ({ id: `tier${index}`, name: `Tarif ${index}`, amountCents: 100 })) })).toThrow('Startgeld-Tarife');
  });

  it('normalisiert bis zu zehn freiwillige Teilnehmerfragen', () => {
    expect(normalizeTournamentInput({ ...base, registrationQuestions: [{ id: 'lunch', label: 'Vegetarisches Essen?' }] }).registrationQuestions).toEqual([
      { id: 'lunch', label: 'Vegetarisches Essen?' },
    ]);
    expect(() => normalizeTournamentInput({ ...base, registrationQuestions: [{ id: 'x', label: 'x' }] })).toThrow('Teilnehmerfragen');
    expect(() => normalizeTournamentInput({ ...base, registrationQuestions: Array.from({ length: 11 }, (_, index) => ({ id: `q${index}`, label: `Frage ${index}` })) })).toThrow('Teilnehmerfragen');
  });

  it('respektiert registrationEnabled für Kalendereinträge', () => {
    expect(normalizeTournamentInput({ ...base, registrationEnabled: false })).toMatchObject({ registrationEnabled: false });
    expect(registrationOpenStatus({ visibility: 'public', status: 'registration', registration_enabled: 0 })).toBe('closed');
  });

  it('mappt Formation "andere" auf tete + formationOther, ohne den DB-CHECK zu verletzen', () => {
    expect(normalizeTournamentInput({ ...base, formation: 'andere' })).toMatchObject({ formation: 'tete', formationOther: true, registrationType: 'forme' });
    expect(normalizeTournamentInput({ ...base, formation: 'doublette' })).toMatchObject({ formation: 'doublette', formationOther: false });
  });

  it('erlaubt bei Formation "andere" jeden Anmeldetyp (nur echtes Tête ist auf Formée beschränkt)', () => {
    expect(normalizeTournamentInput({ ...base, formation: 'andere', registrationType: 'melee' })).toMatchObject({ formation: 'tete', formationOther: true, registrationType: 'melee' });
    expect(normalizeTournamentInput({ ...base, formation: 'andere', registrationType: 'supermelee', type: 'rangliste' })).toMatchObject({ formation: 'tete', formationOther: true, registrationType: 'supermelee' });
    expect(() => normalizeTournamentInput({ ...base, formation: 'andere', registrationType: 'supermelee' })).toThrow('Rangliste');
    expect(() => normalizeTournamentInput({ ...base, formation: 'tete', registrationType: 'melee' })).toThrow('Formée');
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

  it('erkennt ausschließlich den parallelen Rundenzähler-Konflikt als Bedienkonflikt', () => {
    expect(isTournamentRoundNumberConflict(new Error('D1_ERROR: UNIQUE constraint failed: tournament_rounds.tournament_id, tournament_rounds.round_number: SQLITE_CONSTRAINT'))).toBe(true);
    expect(isTournamentRoundNumberConflict('UNIQUE constraint failed: tournament_rounds.tournament_id, tournament_rounds.round_number')).toBe(true);
    expect(isTournamentRoundNumberConflict()).toBe(false);
    expect(isTournamentRoundNumberConflict(new Error('UNIQUE constraint failed: registrations.tournament_id, registrations.email'))).toBe(false);
  });

  it('erkennt die erste und erneute Veröffentlichung eines Turniers', () => {
    const published = { visibility: 'public', status: 'registration' };
    expect(isNewlyPublicTournament({ visibility: 'private', status: 'registration' }, published)).toBe(true);
    expect(isNewlyPublicTournament({ visibility: 'public', status: 'draft' }, published)).toBe(true);
    expect(isNewlyPublicTournament(published, { ...published, name: 'Nur bearbeitet' })).toBe(false);
    expect(isNewlyPublicTournament(published, { visibility: 'private', status: 'registration' })).toBe(false);
  });

  it('gleicht gespeicherte Suchen mit öffentlichen Turnieren und dem Umkreis ab', () => {
    const tournament = {
      name: 'Herbstpokal', location: 'Linden', type: 'rangliste', date: '2026-09-20', visibility: 'public', status: 'registration',
      formation: 'doublette', formation_other: 0, registration_type: 'forme', latitude: 50.52, longitude: 8.58,
    };
    const matchingSearch = { query: 'herbst', filter_month: '09', filter_formation: 'doublette', filter_registration_type: 'forme', filter_type: 'rangliste', filter_open_only: 0, origin_lat: 50.51, origin_lng: 8.57, radius_km: '25' };

    expect(workerDistanceKm(50.51, 8.57, 50.52, 8.58)).toBeLessThan(2);
    expect(tournamentMatchesSavedSearch(tournament, matchingSearch)).toBe(true);
    expect(tournamentMatchesSavedSearch({ ...tournament, visibility: 'private' }, matchingSearch)).toBe(false);
    expect(tournamentMatchesSavedSearch({ ...tournament, status: 'draft' }, matchingSearch)).toBe(false);
    expect(tournamentMatchesSavedSearch(tournament, { ...matchingSearch, filter_month: '10' })).toBe(false);
    expect(tournamentMatchesSavedSearch({ ...tournament, formation_other: 1 }, matchingSearch)).toBe(false);
    expect(tournamentMatchesSavedSearch(tournament, { ...matchingSearch, filter_formation: 'andere' })).toBe(false);
    expect(tournamentMatchesSavedSearch({ ...tournament, formation_other: 1 }, { ...matchingSearch, filter_formation: 'andere' })).toBe(true);
    expect(tournamentMatchesSavedSearch(tournament, { ...matchingSearch, filter_registration_type: 'melee' })).toBe(false);
    expect(tournamentMatchesSavedSearch(tournament, { ...matchingSearch, filter_type: 'ko' })).toBe(false);
    expect(tournamentMatchesSavedSearch({ ...tournament, status: 'running' }, { ...matchingSearch, filter_open_only: 1 })).toBe(false);
    expect(tournamentMatchesSavedSearch({ ...tournament, registration_opens_at: '2099-01-01T00:00:00.000Z' }, { ...matchingSearch, filter_open_only: 1 })).toBe(false);
    expect(tournamentMatchesSavedSearch({ ...tournament, registration_deadline: '2000-01-01T00:00:00.000Z' }, { ...matchingSearch, filter_open_only: 1 })).toBe(false);
    expect(tournamentMatchesSavedSearch(tournament, { ...matchingSearch, filter_open_only: 1 })).toBe(true);
    const onlineRegistrationSearch = { ...matchingSearch, filter_online_registration_only: 1 };
    expect(tournamentMatchesSavedSearch({ ...tournament, registration_enabled: 1, max_registrations: 16, active_registrations: 15, waitlist_enabled: 0 }, onlineRegistrationSearch)).toBe(true);
    expect(tournamentMatchesSavedSearch({ ...tournament, registration_enabled: 0 }, onlineRegistrationSearch)).toBe(false);
    expect(tournamentMatchesSavedSearch({ ...tournament, status: 'running' }, onlineRegistrationSearch)).toBe(false);
    expect(tournamentMatchesSavedSearch({ ...tournament, registration_opens_at: '2099-01-01T00:00:00.000Z' }, onlineRegistrationSearch)).toBe(false);
    expect(tournamentMatchesSavedSearch({ ...tournament, registration_deadline: '2000-01-01T00:00:00.000Z' }, onlineRegistrationSearch)).toBe(false);
    expect(tournamentMatchesSavedSearch({ ...tournament, max_registrations: 16, active_registrations: 16, waitlist_enabled: 0 }, onlineRegistrationSearch)).toBe(false);
    expect(tournamentMatchesSavedSearch({ ...tournament, max_registrations: 16, active_registrations: 16, waitlist_enabled: 1 }, onlineRegistrationSearch)).toBe(true);
    expect(tournamentMatchesSavedSearch(tournament, { ...matchingSearch, query: 'unbekannt' })).toBe(false);
    expect(tournamentMatchesSavedSearch({ ...tournament, latitude: null }, matchingSearch)).toBe(false);
    expect(tournamentMatchesSavedSearch(tournament, { ...matchingSearch, origin_lat: null, origin_lng: null })).toBe(true);
    expect(tournamentMatchesSavedSearch(tournament, { ...matchingSearch, radius_km: '0.1' })).toBe(false);
  });
});

describe('readBodyWithLimit', () => {
  const chunkedResponse = (chunks) => new Response(new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(new Uint8Array(chunk)));
      controller.close();
    },
  }));

  it('liefert Bodies innerhalb der Grenze vollständig zurück', async () => {
    const bytes = await readBodyWithLimit(chunkedResponse([4, 4]), 8);
    expect(bytes.byteLength).toBe(8);
  });

  it('lehnt eine zu große Content-Length ohne Lesen mit 413 ab', async () => {
    const request = new Request('https://example.test', { method: 'POST', body: 'x', headers: { 'Content-Length': '999' } });
    await expect(readBodyWithLimit(request, 10)).rejects.toMatchObject({ status: 413 });
  });

  it('bricht Streams ohne Content-Length beim Überschreiten mit 413 ab', async () => {
    await expect(readBodyWithLimit(chunkedResponse([6, 6]), 10, 'Bild zu groß'))
      .rejects.toMatchObject({ status: 413, message: 'Bild zu groß' });
  });

  it('liefert für fehlenden Body ein leeres Array', async () => {
    const bytes = await readBodyWithLimit(new Response(null), 10);
    expect(bytes.byteLength).toBe(0);
  });
});
