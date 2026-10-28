// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

const SHORT = 'https://maps.app.goo.gl/WrGuVDaSh5nC47SK6';
const POINT = 'https://www.google.com/maps/place/Punkt/@50.5003813,8.417934,574m/data=!3d50.5000636!4d8.4206376';

describe('Google-Maps-Kurzlinks im Worker auflösen', () => {
  let env;
  const resolve = (url = SHORT) => worker.fetch(new Request('https://ptm.test/api/locations/google-maps', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify({ url }),
  }), env);
  const attempts = () => env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM geocode_attempts').get().count;

  beforeEach(() => {
    env = { DB: d1MitSchema() };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { Location: POINT } })));
  });
  afterEach(() => { env.DB.sqlite.close(); vi.unstubAllGlobals(); });

  it('löst den Beispielkurzlink mit HEAD auf und liest nur den markierten Punkt', async () => {
    const response = await resolve();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ latitude: 50.5000636, longitude: 8.4206376 });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(SHORT, expect.objectContaining({ method: 'HEAD', redirect: 'manual', signal: expect.any(AbortSignal) }));
    expect(attempts()).toBe(1);
  });

  it('liest lange Links ohne Fetch oder D1-Zugriff zur Anfragebegrenzung', async () => {
    const response = await resolve(POINT);
    expect(response.status).toBe(200);
    expect(attempts()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lehnt fremde URLs vor dem ersten Fetch ab', async () => {
    expect((await resolve('https://evil.test/maps')).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(attempts()).toBe(0);
  });

  it.each(['http://127.0.0.1/maps', 'https://google.com.evil.test/maps', 'https://www.google.com/url?url=https://evil.test'])('folgt keinem fremden Weiterleitungsziel: %s', async (target) => {
    fetch.mockResolvedValue(new Response(null, { status: 302, headers: { Location: target } }));
    expect((await resolve()).status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('löst relative Weiterleitungen innerhalb erlaubter Hosts auf', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/second' } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: POINT } }));
    expect((await resolve()).status).toBe(200);
    expect(fetch.mock.calls[1][0]).toBe('https://maps.app.goo.gl/second');
    expect(fetch.mock.calls[1][1].signal).toBe(fetch.mock.calls[0][1].signal);
  });

  it('begrenzt Schleifen auf drei Weiterleitungen', async () => {
    fetch.mockResolvedValue(new Response(null, { status: 302, headers: { Location: SHORT } }));
    expect((await resolve()).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('meldet Netzwerkfehler verständlich', async () => {
    fetch.mockRejectedValue(new DOMException('Timeout', 'TimeoutError'));
    const response = await resolve();
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('Google-Maps-Link');
  });

  it('liest keine HTML-Seite, wenn keine Weiterleitung vorliegt', async () => {
    fetch.mockResolvedValue(new Response('<html>Kein Link</html>'));
    expect((await resolve()).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('weist eine reine Kartenansicht zurück', async () => {
    fetch.mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://www.google.com/maps/@50,8,12z' } }));
    const response = await resolve();
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('einzelnen Punkt');
  });

  it('nutzt die vorhandene Geocoding-Begrenzung ohne weitere Google-Anfrage', async () => {
    const insert = env.DB.sqlite.prepare('INSERT INTO geocode_attempts (id, ip, created_at) VALUES (?, ?, ?)');
    for (let i = 0; i < 30; i += 1) insert.run(`a${i}`, '192.0.2.1', new Date().toISOString());
    expect((await resolve()).status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });
});
