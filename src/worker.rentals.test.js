// @vitest-environment node
// Platz mieten: Verein bietet Bahnen stundenweise an, Benutzer fragen an, der Verein bestätigt oder lehnt ab.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { buildRentalIcs, renderTransactionalEmailHtml } from './worker.js';

describe('Platz mieten', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const VEREIN = { Cookie: 'ptm_session=s1' };
  const MIETER = { Cookie: 'ptm_session=s2' };
  const ANDERER = { Cookie: 'ptm_session=s3' };
  const call = (method, path, { body, headers = {} } = {}) => worker.fetch(new Request(`https://ptm.test${path}`, {
    method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  }), env);
  const offerBody = {
    clubId: 'c1', placeId: 'p1', title: 'Boulehalle', contactEmail: 'halle@bc-test.de', laneCount: 4, priceMinor: 1000, currency: 'EUR', priceNote: 'pro Bahn und Stunde',
    minHours: 1, maxHours: 3, bookingHorizonDays: 30,
    openingHours: [{ weekday: 1, openHour: 10, closeHour: 20 }, { weekday: 6, openHour: 9, closeHour: 13 }],
  };
  const createOffer = async () => (await (await call('POST', '/api/rentals/offers', { body: offerBody, headers: VEREIN })).json()).offer;
  const reserve = (offerId, body, headers = MIETER) => call('POST', `/api/rentals/${offerId}/reservations`, {
    body: { date: '2026-10-24', startHour: 10, hours: 2, lanes: 2, ...body }, headers,
  });
  // Schickt eine Queue-Nachricht wie der Consumer über Resend und liefert die tatsächlich versendete Mail.
  const sendQueued = async (payload) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await worker.queue({ messages: [{ body: payload, ack: vi.fn(), retry: vi.fn() }] }, { RESEND_API_KEY: 'test-key', MAIL_FROM: 'noreply@example.test' });
      return JSON.parse(fetchMock.mock.calls[0][1].body);
    } finally {
      vi.unstubAllGlobals();
    }
  };
  const postbox = () => env.DB.sqlite.prepare('SELECT recipient_id, event_type FROM postbox_messages ORDER BY created_at').all();

  beforeEach(() => {
    // Montag, 19.10.2026, 10:00 Uhr in Berlin.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T08:00:00Z'));
    env = { DB: d1MitSchema() };
    env.DB.sqlite.exec(`
      INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, created_at, updated_at)
        VALUES ('u1', 'verein@example.test', 'Vera', 'Verein', 'user', 'salt', 'hash', '2026-10-01', '2026-10-01'),
               ('u2', 'mieter@example.test', 'Max', 'Mieter', 'user', 'salt', 'hash', '2026-10-01', '2026-10-01'),
               ('u3', 'anders@example.test', 'Anna', 'Anders', 'user', 'salt', 'hash', '2026-10-01', '2026-10-01');
      INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s1', 'u1', '2099-01-01T00:00:00.000Z', '2026-10-01'),
        ('s2', 'u2', '2099-01-01T00:00:00.000Z', '2026-10-01'), ('s3', 'u3', '2099-01-01T00:00:00.000Z', '2026-10-01');
      INSERT INTO clubs (id, name, status, owner_id, contact_email, created_at, updated_at) VALUES ('c1', 'BC Test', 'published', 'u1', 'info@bc-test.de', '2026-10-01', '2026-10-01');
      INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, court_count, status, created_at, updated_at)
        VALUES ('p1', 'c1', 'Halle Nord', 'Berlin', 52.5, 13.4, 8, 'published', '2026-10-01', '2026-10-01');
    `);
  });

  afterEach(() => vi.useRealTimers());

  it('lässt nur Vereinsverwalter Angebote anlegen und zeigt aktive öffentlich', async () => {
    expect((await call('POST', '/api/rentals/offers', { body: offerBody, headers: MIETER })).status).toBe(403);
    expect((await call('POST', '/api/rentals/offers', { body: { ...offerBody, placeId: 'fremd' }, headers: VEREIN })).status).toBe(400);
    const offer = await createOffer();
    expect(offer).toMatchObject({ title: 'Boulehalle', timezone: 'Europe/Berlin', laneCount: 4, openingHours: [{ weekday: 1 }, { weekday: 6 }] });

    const list = await (await call('GET', '/api/rentals')).json();
    expect(list.offers.map((entry) => entry.title)).toEqual(['Boulehalle']);
    const detail = await (await call('GET', `/api/rentals/${offer.id}`)).json();
    expect(detail.offer.canManage).toBe(false);
    // Für „Nachricht an Vermieter“ (mailto): die Kontakt-E-Mail des Angebots, nie die Konto-E-Mail des Verwalters.
    expect(detail.offer.contactEmail).toBe('halle@bc-test.de');
    const invalid = await call('POST', '/api/rentals/offers', { body: { ...offerBody, contactEmail: 'keine-mail' }, headers: VEREIN });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe('Eine gültige Kontakt-E-Mail ist erforderlich');

    await call('PUT', `/api/rentals/offers/${offer.id}`, { body: { ...offerBody, status: 'inactive' }, headers: VEREIN });
    expect((await (await call('GET', '/api/rentals')).json()).offers).toEqual([]);
    expect((await call('GET', `/api/rentals/${offer.id}`)).status).toBe(404);
    expect((await call('GET', `/api/rentals/${offer.id}`, { headers: VEREIN })).status).toBe(200);
  });

  it('speichert die Beschreibung als Rich Text und lehnt ungültigen Rich Text ab', async () => {
    const description = `ptm-richtext:v1:${JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Halle mit Bar', marks: [{ type: 'bold' }] }] }] })}`;
    const response = await call('POST', '/api/rentals/offers', { body: { ...offerBody, description }, headers: VEREIN });
    expect(response.status).toBe(201);
    expect((await response.json()).offer.description).toBe(description);
    const invalid = await call('POST', '/api/rentals/offers', { body: { ...offerBody, description: 'ptm-richtext:v1:{"type":"doc","content":[{"type":"script"}]}' }, headers: VEREIN });
    expect(invalid.status).toBe(400);
  });

  it('liefert mit month den Tagesstatus für den Monatskalender', async () => {
    const offer = await createOffer();
    // Samstag 24.10.: 9–13 Uhr geöffnet, eine Reservierung belegt 10–12 Uhr zwei von vier Bahnen.
    await reserve(offer.id, { lanes: 2 });
    const response = await call('GET', `/api/rentals/${offer.id}/availability?month=2026-10`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ month: '2026-10', today: '2026-10-19', lastDate: '2026-11-18' });
    expect(data.days).toHaveLength(31);
    const status = Object.fromEntries(data.days.map((entry) => [entry.date, entry.status]));
    expect(status['2026-10-12']).toBe('unavailable');
    expect(status['2026-10-20']).toBe('closed');
    expect(status['2026-10-24']).toBe('partial');
    expect(status['2026-10-26']).toBe('free');
    const later = await (await call('GET', `/api/rentals/${offer.id}/availability?month=2026-12`)).json();
    expect(later.days.find((entry) => entry.date === '2026-12-05').status).toBe('unavailable');
    expect((await call('GET', `/api/rentals/${offer.id}/availability?month=2026-13`)).status).toBe(400);
    // Ohne month bleibt die Wochenantwort mit Stunden unverändert.
    const week = await (await call('GET', `/api/rentals/${offer.id}/availability?from=2026-10-24`)).json();
    expect(week.days).toHaveLength(7);
    expect(week.days[0].slots.length).toBeGreaterThan(0);
  });

  it('braucht keine Kontakt-E-Mail des Vereins, nur eine je Angebot', async () => {
    await createOffer();
    // Der Verein darf seine Kontakt-E-Mail auch mit Mietangeboten entfernen; die Angebote haben ihre eigene.
    expect((await call('PUT', '/api/clubs/c1', { body: { name: 'BC Test', contactEmail: '' }, headers: VEREIN })).status).toBe(200);
    const manage = await (await call('GET', '/api/rentals/manage?club=c1', { headers: VEREIN })).json();
    expect(manage.clubContactEmail).toBeNull();
    expect(manage.offers[0].contactEmail).toBe('halle@bc-test.de');
    expect((await call('POST', '/api/rentals/offers', { body: offerBody, headers: VEREIN })).status).toBe(201);
  });

  it('nimmt Anfragen bis zur Bahnanzahl an und benachrichtigt den Verein', async () => {
    const offer = await createOffer();
    expect((await reserve(offer.id, {}, {})).status).toBe(401);
    expect((await reserve(offer.id, {})).status).toBe(201);
    expect((await reserve(offer.id, { startHour: 11, hours: 1 }, ANDERER)).status).toBe(201);
    const full = await reserve(offer.id, { startHour: 11, hours: 1, lanes: 1 });
    expect(full.status).toBe(409);
    expect((await reserve(offer.id, { startHour: 12, hours: 1, lanes: 4 })).status).toBe(201);
    expect((await reserve(offer.id, { startHour: 13 })).status).toBe(400);

    const availability = await (await call('GET', `/api/rentals/${offer.id}/availability?from=2026-10-24`)).json();
    expect(availability.days[0].slots.slice(0, 4)).toEqual([
      { hour: 9, free: 4, bookable: true }, { hour: 10, free: 2, bookable: true },
      { hour: 11, free: 0, bookable: true }, { hour: 12, free: 0, bookable: true },
    ]);
    expect(postbox().filter((row) => row.recipient_id === 'u1').map((row) => row.event_type)).toEqual(['rental_requested', 'rental_requested', 'rental_requested']);
  });

  it('vermietet komplett: belegt alle Bahnen und nennt in der Mail die komplette Halle', async () => {
    const send = vi.fn(async () => {});
    env.MAIL_QUEUE = { send };
    sql("UPDATE boule_places SET venue_type = 'indoor' WHERE id = 'p1'");
    const created = await call('POST', '/api/rentals/offers', {
      body: { ...offerBody, rentalMode: 'both', wholePriceMinor: 3500, wholePriceNote: 'pro Stunde' }, headers: VEREIN,
    });
    const offer = (await created.json()).offer;
    expect(offer).toMatchObject({ rentalMode: 'both', wholePriceMinor: 3500, wholePriceNote: 'pro Stunde', venueType: 'indoor' });

    const booked = await reserve(offer.id, { whole: true, lanes: 1 });
    expect(booked.status).toBe(201);
    expect((await booked.json()).reservation).toMatchObject({ whole: true, lanes: 4 });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ to: 'halle@bc-test.de', text: expect.stringContaining('10:00–12:00, komplette Halle') }));
    expect((await reserve(offer.id, { lanes: 1 }, ANDERER)).status).toBe(409);
    // Komplett geht nur, wenn alle Bahnen frei sind.
    expect((await reserve(offer.id, { startHour: 12, hours: 1, lanes: 1 }, ANDERER)).status).toBe(201);
    expect((await reserve(offer.id, { startHour: 12, hours: 1, whole: true })).status).toBe(409);

    const mine = await (await call('GET', '/api/rentals/reservations/mine', { headers: MIETER })).json();
    expect(mine.reservations[0]).toMatchObject({ whole: true, venueType: 'indoor' });

    // Nur-komplett-Angebote: einzelne Bahnen sind nicht buchbar, Tage ohne komplett freie Stunde gelten als ausgebucht.
    await call('PUT', `/api/rentals/offers/${offer.id}`, { body: { ...offerBody, rentalMode: 'whole' }, headers: VEREIN });
    expect((await reserve(offer.id, { startHour: 9, hours: 1, lanes: 1 })).status).toBe(400);
    sql("UPDATE rental_opening_hours SET open_hour = 10, close_hour = 13 WHERE offer_id = ? AND weekday = 6", offer.id);
    const month = await (await call('GET', `/api/rentals/${offer.id}/availability?month=2026-10`)).json();
    expect(month.days.find((entry) => entry.date === '2026-10-24').status).toBe('full');
  });

  it('teilt die Kapazität eines Spielorts zwischen Angeboten und gibt sie nach Storno frei', async () => {
    const first = (await (await call('POST', '/api/rentals/offers', { body: { ...offerBody, laneCount: 8 }, headers: VEREIN })).json()).offer;
    const second = await createOffer();
    const reserved = (await (await reserve(first.id, { lanes: 6 })).json()).reservation;
    const availability = await (await call('GET', `/api/rentals/${second.id}/availability?from=2026-10-24`)).json();
    expect(availability.days[0].slots.find((slot) => slot.hour === 10).free).toBe(2);
    expect((await reserve(second.id, { lanes: 3 }, ANDERER)).status).toBe(409);
    expect((await reserve(second.id, { lanes: 2 }, ANDERER)).status).toBe(201);
    expect((await reserve(first.id, { lanes: 1 })).status).toBe(409);
    expect((await call('POST', `/api/rentals/reservations/${reserved.id}/cancel`, { headers: MIETER })).status).toBe(200);
    expect((await reserve(second.id, { lanes: 2 })).status).toBe(201);
    // Eigene Angebotsgrenze bleibt trotz weiterer freier Bahnen am Spielort erhalten.
    expect((await reserve(second.id, { lanes: 1 })).status).toBe(409);
    expect((await reserve(first.id, { lanes: 8, startHour: 12, hours: 1 })).status).toBe(201);
  });

  it('teilt bei unbekannter Gesamtzahl die größte angebotene Bahnanzahl', async () => {
    sql("UPDATE boule_places SET court_count = 0 WHERE id = 'p1'");
    const first = await createOffer();
    const second = await createOffer();
    expect((await reserve(first.id, { lanes: 4 })).status).toBe(201);
    expect((await reserve(second.id, { lanes: 1 }, ANDERER)).status).toBe(409);
    const availability = await (await call('GET', `/api/rentals/${second.id}/availability?from=2026-10-24`)).json();
    expect(availability.days[0].slots.find((slot) => slot.hour === 10).free).toBe(0);
  });

  it('bestätigt keine bereits überbuchten Altanfragen', async () => {
    const offer = await createOffer();
    const reservation = (await (await reserve(offer.id, { lanes: 4 })).json()).reservation;
    // Altbestand aus der Zeit vor der spielortübergreifenden Prüfung.
    sql(`INSERT INTO rental_reservations SELECT 'legacy', offer_id, 'u3', local_date, start_hour, hours, lanes,
      start_utc, end_utc, status, note, decision_note, decided_by, decided_at, created_at, updated_at, whole
      FROM rental_reservations WHERE id = ?`, reservation.id);
    const result = await call('POST', `/api/rentals/reservations/${reservation.id}/decision`, { body: { decision: 'confirm' }, headers: VEREIN });
    expect(result.status).toBe(409);
    expect(env.DB.sqlite.prepare('SELECT status FROM rental_reservations WHERE id = ?').get(reservation.id).status).toBe('requested');
  });

  it('lehnt mehr angebotene Bahnen als am Spielort vorhanden ab', async () => {
    expect((await call('POST', '/api/rentals/offers', { body: { ...offerBody, laneCount: 9 }, headers: VEREIN })).status).toBe(400);
    const offer = await createOffer();
    expect((await call('PUT', `/api/rentals/offers/${offer.id}`, { body: { ...offerBody, laneCount: 9 }, headers: VEREIN })).status).toBe(400);
  });

  it.each(['requested', 'confirmed'])('schützt Reservierungen (%s) vor weniger Bahnen und geänderten Öffnungszeiten', async (status) => {
    const offer = await createOffer();
    const reservation = (await (await reserve(offer.id, { lanes: 2 })).json()).reservation;
    if (status === 'confirmed') await call('POST', `/api/rentals/reservations/${reservation.id}/decision`, { body: { decision: 'confirm' }, headers: VEREIN });
    const update = (patch) => call('PUT', `/api/rentals/offers/${offer.id}`, { body: { ...offerBody, ...patch }, headers: VEREIN });
    for (const patch of [
      { laneCount: 1 },
      { openingHours: [{ weekday: 1, openHour: 10, closeHour: 20 }] },
      { openingHours: [{ weekday: 6, openHour: 11, closeHour: 13 }] },
    ]) expect((await update(patch)).status).toBe(409);
    const detail = await (await call('GET', `/api/rentals/${offer.id}`)).json();
    expect(detail.offer.laneCount).toBe(4);
    expect(detail.offer.openingHours).toEqual(offer.openingHours);
    // Mindest-/Höchstdauer gelten nur für neue Buchungen und bleiben änderbar.
    expect((await update({ minHours: 3, maxHours: 4 })).status).toBe(200);
    expect((await update({ minHours: 1, maxHours: 1 })).status).toBe(200);
    // Unkritische Bearbeitung, Pausieren und ausreichende Kapazitätsreduktion bleiben möglich.
    expect((await update({ title: 'Neuer Titel', status: 'inactive', laneCount: 2 })).status).toBe(200);
  });

  it('prüft die gemeinsame Spitzenbelegung beim Reduzieren der Bahnanzahl', async () => {
    const offer = await createOffer();
    await reserve(offer.id, { lanes: 2 });
    await reserve(offer.id, { lanes: 2 }, ANDERER);
    const result = await call('PUT', `/api/rentals/offers/${offer.id}`, { body: { ...offerBody, laneCount: 3 }, headers: VEREIN });
    expect(result.status).toBe(409);
  });

  it('verhindert einen Spielortwechsel bei bestehenden Reservierungen', async () => {
    sql(`INSERT INTO boule_places (id, club_id, name, address, latitude, longitude, venue_type, court_count, status, created_at, updated_at)
      VALUES ('p2', 'c1', 'Andere Halle', 'Berlin', 52.5, 13.4, 'indoor', 8, 'published', '2026-10-01', '2026-10-01')`);
    const offer = await createOffer();
    const reservation = (await (await reserve(offer.id, {})).json()).reservation;
    const update = () => call('PUT', `/api/rentals/offers/${offer.id}`, { body: { ...offerBody, placeId: 'p2' }, headers: VEREIN });
    expect((await update()).status).toBe(409);
    await call('POST', `/api/rentals/reservations/${reservation.id}/cancel`, { headers: MIETER });
    expect((await update()).status).toBe(200);
  });

  it('rollt Angebotsänderungen bei einer zwischenzeitlich eingegangenen Anfrage vollständig zurück', async () => {
    const offer = await createOffer();
    env.DB.vorBatch((sqlite) => {
      sqlite.prepare(`INSERT INTO rental_reservations
        (id, offer_id, user_id, local_date, start_hour, hours, lanes, start_utc, end_utc, status, created_at, updated_at)
        VALUES ('race', ?, 'u2', '2026-10-24', 10, 2, 4, '2026-10-24T08:00:00.000Z', '2026-10-24T10:00:00.000Z', 'requested', '2026-10-19', '2026-10-19')`).run(offer.id);
    });
    const result = await call('PUT', `/api/rentals/offers/${offer.id}`, { body: { ...offerBody, title: 'Darf nicht bleiben', laneCount: 1 }, headers: VEREIN });
    expect(result.status).toBe(409);
    expect(env.DB.sqlite.prepare('SELECT title, lane_count FROM rental_offers WHERE id = ?').get(offer.id)).toEqual({ title: offerBody.title, lane_count: 4 });
  });

  it('gibt Kapazität nach Ablehnung und Storno frei und benachrichtigt den Mieter', async () => {
    const offer = await createOffer();
    const first = (await (await reserve(offer.id, { lanes: 4 })).json()).reservation;
    expect((await reserve(offer.id, { lanes: 1 }, ANDERER)).status).toBe(409);

    expect((await call('POST', `/api/rentals/reservations/${first.id}/decision`, { body: { decision: 'reject' }, headers: ANDERER })).status).toBe(403);
    const rejected = await call('POST', `/api/rentals/reservations/${first.id}/decision`, { body: { decision: 'reject', note: 'Turnier' }, headers: VEREIN });
    expect((await rejected.json()).reservation).toMatchObject({ status: 'rejected', decisionNote: 'Turnier' });
    expect((await call('POST', `/api/rentals/reservations/${first.id}/decision`, { body: { decision: 'confirm' }, headers: VEREIN })).status).toBe(409);
    expect(postbox().filter((row) => row.recipient_id === 'u2').map((row) => row.event_type)).toEqual(['rental_decided']);

    const second = (await (await reserve(offer.id, { lanes: 4 }, ANDERER)).json()).reservation;
    await call('POST', `/api/rentals/reservations/${second.id}/decision`, { body: { decision: 'confirm' }, headers: VEREIN });
    expect((await call('POST', `/api/rentals/reservations/${second.id}/cancel`, { headers: MIETER })).status).toBe(404);
    expect((await call('POST', `/api/rentals/reservations/${second.id}/cancel`, { headers: ANDERER })).status).toBe(200);
    expect((await reserve(offer.id, { lanes: 4 })).status).toBe(201);

    const mine = await (await call('GET', '/api/rentals/reservations/mine', { headers: ANDERER })).json();
    expect(mine.reservations.map((entry) => entry.status)).toEqual(['cancelled']);
  });

  it('zeigt dem Verein offene Anfragen mit Mieterdaten', async () => {
    const offer = await createOffer();
    await reserve(offer.id, { note: 'Vereinstraining' });
    expect((await call('GET', '/api/rentals/manage?club=c1', { headers: MIETER })).status).toBe(403);
    const manage = await (await call('GET', '/api/rentals/manage?club=c1', { headers: VEREIN })).json();
    expect(manage.places).toEqual([expect.objectContaining({ id: 'p1', courtCount: 8 })]);
    expect(manage.reservations).toEqual([expect.objectContaining({ renterName: 'Max Mieter', renterEmail: 'mieter@example.test', note: 'Vereinstraining', status: 'requested' })]);
    expect((await call('DELETE', `/api/rentals/offers/${offer.id}`, { headers: VEREIN })).status).toBe(409);
  });

  it('blendet Angebote nicht freigegebener Vereine öffentlich aus und kennzeichnet sie in der Verwaltung', async () => {
    const offer = await createOffer();
    env.DB.sqlite.exec("UPDATE clubs SET status = 'pending' WHERE id = 'c1'");
    expect((await (await call('GET', '/api/rentals')).json()).offers).toEqual([]);
    const manage = await (await call('GET', '/api/rentals/manage?club=c1', { headers: VEREIN })).json();
    expect(manage.clubStatus).toBe('pending');
    expect(manage.offers).toEqual([expect.objectContaining({ id: offer.id, status: 'active', isPublic: false })]);
    const created = await call('POST', '/api/rentals/offers', { headers: VEREIN, body: offerBody });
    expect(created.status).toBe(409);
    const updated = await call('PUT', `/api/rentals/offers/${offer.id}`, { headers: VEREIN, body: offerBody });
    expect(updated.status).toBe(409);
  });

  it('lehnt Angebote an nicht freigegebenen Spielorten ab', async () => {
    env.DB.sqlite.exec("UPDATE boule_places SET status = 'pending' WHERE id = 'p1'");
    const created = await call('POST', '/api/rentals/offers', { headers: VEREIN, body: offerBody });
    expect(created.status).toBe(400);
    expect((await (await call('GET', '/api/rentals/manage?club=c1', { headers: VEREIN })).json()).places).toEqual([]);
  });

  it('schickt die Mails über die Queue an den Verein und an den Mieter', async () => {
    const send = vi.fn(async () => {});
    env.MAIL_QUEUE = { send };
    const offer = await createOffer();
    const reservation = (await (await reserve(offer.id, { note: 'Bitte Licht an' })).json()).reservation;
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      to: 'halle@bc-test.de', subject: 'Reservierungsanfrage: Boulehalle', messageBox: 'Bitte Licht an',
      actions: [expect.objectContaining({ url: 'https://ptm.test/platz-mieten/verwalten' })],
    }));
    await call('POST', `/api/rentals/reservations/${reservation.id}/decision`, { body: { decision: 'confirm' }, headers: VEREIN });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      to: 'mieter@example.test', subject: 'Reservierung bestätigt: Boulehalle',
      text: expect.stringContaining('24.10.2026 10:00–12:00, 2 Bahn(en)'),
    }));
    const mail = send.mock.lastCall[0];
    expect(mail.actions).toEqual([
      expect.objectContaining({ label: 'Meine Reservierungen', url: `https://ptm.test/platz-mieten/meine#reservierung-${reservation.id}` }),
      expect.objectContaining({ label: 'Angebot ansehen', url: `https://ptm.test/platz-mieten/${offer.id}` }),
      expect.objectContaining({ label: 'Anfahrt planen' }),
      expect.objectContaining({ label: 'Reservierung stornieren', tone: 'danger', url: `https://ptm.test/platz-mieten/meine#stornieren-${reservation.id}` }),
    ]);
    const html = renderTransactionalEmailHtml(mail.subject, mail.text, mail.language, mail.messageBox, mail.textAfterMessageBox, mail.actions);
    // Im HTML nur die Buttons, ohne zusätzliche „Beschriftung:“-Zeile darüber; ausgeschrieben nur im Reintext.
    const sent = await sendQueued(mail);
    for (const action of mail.actions) {
      expect(html).toContain(`>${action.label}</a>`);
      expect(html).not.toContain(`${action.label}:`);
      expect(sent.text).toContain(`${action.label}:\n${action.url}`);
    }
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].filename).toBe('termin.ics');
    const ics = Buffer.from(mail.attachments[0].content, 'base64').toString('utf8').replace(/\r\n /g, '');
    expect(ics).toContain(`UID:rental-${reservation.id}@ptmonline.org`);
    expect(ics).toContain('DTSTART:20261024T080000Z\r\nDTEND:20261024T100000Z');
    expect(ics).toContain('LOCATION:Halle Nord\\, Berlin');
    expect(ics).toContain('SUMMARY:Boulehalle');

    await call('POST', `/api/rentals/reservations/${reservation.id}/decision`, { body: { decision: 'cancel' }, headers: VEREIN });
    const cancellation = send.mock.lastCall[0];
    // Absage für denselben Termin, damit Kalender ihn entfernen.
    expect(cancellation.attachments).toHaveLength(1);
    const cancelIcs = Buffer.from(cancellation.attachments[0].content, 'base64').toString('utf8').replace(/\r\n /g, '');
    expect(cancelIcs).toContain(`UID:rental-${reservation.id}@ptmonline.org`);
    expect(cancelIcs).toContain('METHOD:CANCEL');
    expect(cancelIcs).toContain('STATUS:CANCELLED');
    expect(cancelIcs).toContain('SEQUENCE:1');
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics).toContain('SEQUENCE:0');
    expect(cancellation.actions.some((action) => action.label === 'Reservierung stornieren')).toBe(false);
  });

  it.each([
    ['nl', 'Reservering annuleren'], ['en', 'Cancel reservation'],
    ['es', 'Cancelar reserva'], ['fr', 'Annuler la réservation'],
  ])('übersetzt die Zusagebuttons in die Sprache des Mieters (%s)', async (language, label) => {
    env.MAIL_QUEUE = { send: vi.fn(async () => {}) };
    sql('UPDATE users SET language = ? WHERE id = ?', language, 'u2');
    const offer = await createOffer();
    const reservation = (await (await reserve(offer.id, {})).json()).reservation;
    await call('POST', `/api/rentals/reservations/${reservation.id}/decision`, { body: { decision: 'confirm' }, headers: VEREIN });
    expect(env.MAIL_QUEUE.send.mock.lastCall[0].actions).toContainEqual(expect.objectContaining({ label, tone: 'danger' }));
  });

  it('hängt bei einer Ablehnung keinen Termin und keinen Stornolink an', async () => {
    env.MAIL_QUEUE = { send: vi.fn(async () => {}) };
    const offer = await createOffer();
    const reservation = (await (await reserve(offer.id, {})).json()).reservation;
    await call('POST', `/api/rentals/reservations/${reservation.id}/decision`, { body: { decision: 'reject' }, headers: VEREIN });
    const mail = env.MAIL_QUEUE.send.mock.lastCall[0];
    expect(mail.attachments).toBeUndefined();
    expect(mail.actions).toHaveLength(3);
  });

  it('erhält UTC-Zeiten über Mitternacht und faltet und escaped Kalendertexte korrekt', () => {
    const ics = buildRentalIcs({ title: 'Boule; ' + 'ä'.repeat(80), place_name: 'Halle', place_address: 'Straße 1', club_name: 'BC Test' }, {
      id: 'r1', start_utc: '2026-10-25T22:00:00.000Z', end_utc: '2026-10-25T23:00:00.000Z',
      decision_note: 'Mitbringen: Kugeln, Tuch\r\nEND:VEVENT',
    }, 'https://ptm.test');
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('DTSTART:20261025T220000Z\r\nDTEND:20261025T230000Z');
    expect(unfolded).toContain('SUMMARY:Boule\\; ' + 'ä'.repeat(80));
    expect(unfolded).toContain('Kugeln\\, Tuch\\nEND:VEVENT');
    expect(unfolded.match(/\r\nEND:VEVENT/g)).toHaveLength(1);
    expect(unfolded).toContain('DTSTAMP:20261019T080000Z');
  });

  it('lässt Admins die Vermietung jedes Vereins verwalten', async () => {
    sql(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u4', 'admin@example.test', 'Ada', 'Admin', 'admin', 'salt', 'hash', '2026-10-01', '2026-10-01')`);
    sql("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s4', 'u4', '2099-01-01T00:00:00.000Z', '2026-10-01')");
    const ADMIN = { Cookie: 'ptm_session=s4' };
    const created = await call('POST', '/api/rentals/offers', { body: offerBody, headers: ADMIN });
    expect(created.status).toBe(201);
    const offer = (await created.json()).offer;
    const reservation = (await (await reserve(offer.id, {})).json()).reservation;

    expect((await call('GET', '/api/rentals/manage?club=c1', { headers: ADMIN })).status).toBe(200);
    expect((await (await call('GET', `/api/rentals/${offer.id}`, { headers: ADMIN })).json()).offer.canManage).toBe(true);
    const decided = await call('POST', `/api/rentals/reservations/${reservation.id}/decision`, { body: { decision: 'confirm' }, headers: ADMIN });
    expect((await decided.json()).reservation.status).toBe('confirmed');
  });

  it('begrenzt offene Anfragen je Benutzer und Angebot', async () => {
    const offer = await createOffer();
    // Montag 10–20 Uhr: zehn Anfragen sind erlaubt, die elfte nicht.
    for (let startHour = 10; startHour < 20; startHour += 1) {
      expect((await reserve(offer.id, { date: '2026-10-26', startHour, hours: 1, lanes: 1 })).status).toBe(201);
    }
    expect((await reserve(offer.id, { date: '2026-11-02', startHour: 10, hours: 1, lanes: 1 })).status).toBe(409);
  });
});
