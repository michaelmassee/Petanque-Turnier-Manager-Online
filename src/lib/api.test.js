import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, authenticatedApi, clearOfflineApiCache, AbortedError, ApiError, InvalidResponseError, NetworkError, OfflineMutationError, setSessionExpiredHandler } from './api.js';

describe('api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setSessionExpiredHandler(null);
  });

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

  it('blockiert Schreibzugriffe offline zentral, ohne eine Anfrage zu senden', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api('/api/places', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(OfflineMutationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('löscht beim Sitzungsende nur die API-Caches des Service Workers', async () => {
    const deleteMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['ptm-online-v9', 'ptm-online-api-v2']),
      delete: deleteMock,
    });

    await clearOfflineApiCache();

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith('ptm-online-api-v2');
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

  it('meldet einen 401 geschützter Aufrufe zentral und mit einer verständlichen Meldung', async () => {
    const onSessionExpired = vi.fn();
    setSessionExpiredHandler(onSessionExpired);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Anmeldung erforderlich' }), { status: 401 })));

    await expect(authenticatedApi('/api/users')).rejects.toEqual(expect.objectContaining({
      name: 'SessionExpiredError',
      status: 401,
      message: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
    }));
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('lässt öffentliche 401-Antworten beim jeweiligen Fachablauf', async () => {
    const onSessionExpired = vi.fn();
    setSessionExpiredHandler(onSessionExpired);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Ungültiger Token' }), { status: 401 })));

    await expect(api('/api/registrations/cancel-by-token')).rejects.toEqual(expect.objectContaining({
      name: 'ApiError',
      message: 'Ungültiger Token',
    }));
    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});
