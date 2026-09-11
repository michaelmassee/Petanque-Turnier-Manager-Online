import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, AbortedError, ApiError, InvalidResponseError, NetworkError } from './api.js';

describe('api', () => {
  afterEach(() => vi.restoreAllMocks());

  it('übersetzt einen Browser-Netzwerkfehler statt dessen Rohtext anzuzeigen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(api('/api/tournaments')).rejects.toEqual(expect.objectContaining({
      name: 'NetworkError',
      message: 'Keine Verbindung zum Server. Bitte versuche es erneut.',
    }));
  });

  it('behält fachliche API-Fehler und deren Payload bei', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Zugriff verweigert', details: { field: 'x' } }), { status: 403 })));

    await expect(api('/api/users')).rejects.toEqual(expect.objectContaining({
      name: 'ApiError',
      status: 403,
      payload: { error: 'Zugriff verweigert', details: { field: 'x' } },
    }));
  });

  it('unterscheidet Netzwerk- von HTTP-Fehlern', async () => {
    const error = new NetworkError();
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBeUndefined();
  });

  it('startet keine Anfrage mit einem bereits abgebrochenen Signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(api('/api/tournaments', { signal: controller.signal })).rejects.toBeInstanceOf(AbortedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('weist ungültige Erfolgsantworten zurück, statt sie als leeres Objekt zu behandeln', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{not-json', { status: 200 })));

    await expect(api('/api/tournaments')).rejects.toBeInstanceOf(InvalidResponseError);
  });
});
