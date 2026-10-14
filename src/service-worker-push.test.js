// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');

function loadServiceWorker(windows = []) {
  const listeners = {};
  const self = {
    location: { origin: 'https://ptm.test' },
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
    addEventListener: (type, listener) => { listeners[type] = listener; },
  };
  const clients = { matchAll: vi.fn().mockResolvedValue(windows), openWindow: vi.fn().mockResolvedValue(null) };
  runInNewContext(source, { self, clients, caches: {}, URL, Response, fetch: vi.fn(), console });
  const dispatch = async (type, event) => {
    let pending = Promise.resolve();
    listeners[type]({ ...event, waitUntil: (promise) => { pending = promise; } });
    await pending;
  };
  return { self, clients, dispatch };
}

const resultPayload = {
  title: 'Ergebnis gemeldet',
  body: 'Turnier: Bert B meldet 13:7',
  tag: 'result-m1',
  url: 'https://ptm.test/?tab=play&tournament=t1',
  eventType: 'tournament_result_reported',
  tournamentId: 't1',
};

describe('Service Worker: Push „Ergebnis gemeldet“', () => {
  it('zeigt die Meldung an und lässt offene Fenster die Runden einmal nachladen', async () => {
    const client = { postMessage: vi.fn() };
    const { self, dispatch } = loadServiceWorker([client]);

    await dispatch('push', { data: { json: () => resultPayload } });

    expect(self.registration.showNotification).toHaveBeenCalledWith('Ergebnis gemeldet', expect.objectContaining({
      body: 'Turnier: Bert B meldet 13:7',
      tag: 'result-m1',
      data: { url: resultPayload.url, eventType: 'tournament_result_reported', tournamentId: 't1' },
    }));
    expect(client.postMessage).toHaveBeenCalledWith({ type: 'tournament-result-reported', tournamentId: 't1' });
  });

  it('wechselt beim Klick in einer offenen App zur Rundenverwaltung, ohne neu zu laden', async () => {
    const client = { postMessage: vi.fn(), focus: vi.fn().mockResolvedValue(undefined), navigate: vi.fn() };
    const { dispatch } = loadServiceWorker([client]);
    const notification = { close: vi.fn(), data: { url: resultPayload.url, eventType: 'tournament_result_reported', tournamentId: 't1' } };

    await dispatch('notificationclick', { notification });

    expect(client.postMessage).toHaveBeenCalledWith({ type: 'open-tournament-play', tournamentId: 't1' });
    expect(client.focus).toHaveBeenCalled();
    expect(client.navigate).not.toHaveBeenCalled();
  });

  it('öffnet ohne offene App direkt den Link zur Rundenverwaltung', async () => {
    const { clients, dispatch } = loadServiceWorker([]);
    const notification = { close: vi.fn(), data: { url: resultPayload.url, eventType: 'tournament_result_reported', tournamentId: 't1' } };

    await dispatch('notificationclick', { notification });

    expect(clients.openWindow).toHaveBeenCalledWith(resultPayload.url);
  });
});
