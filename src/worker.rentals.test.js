// @vitest-environment node
// Platz mieten: Verein bietet Bahnen stundenweise an, Benutzer fragen an, der Verein bestätigt oder lehnt ab.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

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
    clubId: 'c1', placeId: 'p1', title: 'Boulehalle', laneCount: 4, priceMinor: 1000, currency: 'EUR', priceNote: 'pro Bahn und Stunde',
    minHours: 1, maxHours: 3, bookingHorizonDays: 30,
    openingHours: [{ weekday: 1, openHour: 10, closeHour: 20 }, { weekday: 6, openHour: 9, closeHour: 13 }],
  };
  const createOffer = async () => (await (await call('POST', '/api/rentals/offers', { body: offerBody, headers: VEREIN })).json()).offer;
  const reserve = (offerId, body, headers = MIETER) => call('POST', `/api/rentals/${offerId}/reservations`, {
    body: { date: '2026-10-24', startHour: 10, hours: 2, lanes: 2, ...body }, headers,
  });
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
      INSERT INTO clubs (id, name, status, owner_id, created_at, updated_at) VALUES ('c1', 'BC Test', 'published', 'u1', '2026-10-01', '2026-10-01');
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

    await call('PUT', `/api/rentals/offers/${offer.id}`, { body: { ...offerBody, status: 'inactive' }, headers: VEREIN });
    expect((await (await call('GET', '/api/rentals')).json()).offers).toEqual([]);
    expect((await call('GET', `/api/rentals/${offer.id}`)).status).toBe(404);
    expect((await call('GET', `/api/rentals/${offer.id}`, { headers: VEREIN })).status).toBe(200);
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

  it('schickt die Mails über die Queue an den Verein und an den Mieter', async () => {
    const send = vi.fn(async () => {});
    env.MAIL_QUEUE = { send };
    const offer = await createOffer();
    const reservation = (await (await reserve(offer.id, { note: 'Bitte Licht an' })).json()).reservation;
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      to: 'verein@example.test', subject: 'Reservierungsanfrage: Boulehalle', messageBox: 'Bitte Licht an',
      actions: [expect.objectContaining({ url: 'https://ptm.test/platz-mieten/verwalten' })],
    }));
    await call('POST', `/api/rentals/reservations/${reservation.id}/decision`, { body: { decision: 'confirm' }, headers: VEREIN });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      to: 'mieter@example.test', subject: 'Reservierung bestätigt: Boulehalle',
      text: expect.stringContaining('24.10.2026 10:00–12:00, 2 Bahn(en)'),
    }));
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
    for (const startHour of [10, 11, 12, 13, 14]) {
      expect((await reserve(offer.id, { date: '2026-10-26', startHour, hours: 1, lanes: 1 })).status).toBe(201);
    }
    expect((await reserve(offer.id, { date: '2026-10-26', startHour: 15, hours: 1, lanes: 1 })).status).toBe(409);
  });
});
