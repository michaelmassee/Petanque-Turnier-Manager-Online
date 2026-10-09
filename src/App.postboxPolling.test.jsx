import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';
import { queryClient } from './lib/query-client.js';

function jsonResponse(payload) {
  return { ok: true, json: () => Promise.resolve(payload) };
}

// Polling liest nur die Badge-Zahlen; Nachrichten und Empfängerliste (ganze users-Tabelle) erst bei geöffneter Postbox.
describe('Postbox-Polling', () => {
  beforeEach(() => {
    queryClient.clear();
    global.fetch = vi.fn((path) => {
      if (path === '/api/bootstrap') return Promise.resolve(jsonResponse({ needsSetup: false }));
      if (path === '/api/session') return Promise.resolve(jsonResponse({ user: { id: 'u1', firstName: 'Erste', lastName: 'Person', role: 'user' } }));
      if (path === '/api/tournaments') return Promise.resolve(jsonResponse({ tournaments: [] }));
      if (path === '/api/postbox/summary') return Promise.resolve(jsonResponse({ unreadCount: 0, todos: [] }));
      if (path === '/api/postbox') return Promise.resolve(jsonResponse({ messages: [{ id: 'm1', kind: 'direct', body: 'Hallo Postbox', mine: false, senderName: 'Absender', createdAt: '2026-01-01T00:00:00.000Z' }], unreadCount: 0, todos: [] }));
      if (path === '/api/postbox/recipients') return Promise.resolve(jsonResponse({ recipients: [], tournaments: [] }));
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  const aufgerufen = (path) => global.fetch.mock.calls.some(([requestPath]) => requestPath === path);

  it('lädt bei geschlossener Postbox nur die Zusammenfassung', async () => {
    render(<App />);
    await screen.findByLabelText('Postbox');
    await waitFor(() => expect(aufgerufen('/api/postbox/summary')).toBe(true));
    expect(aufgerufen('/api/postbox')).toBe(false);
    expect(aufgerufen('/api/postbox/recipients')).toBe(false);

    fireEvent.click(screen.getByLabelText('Postbox'));
    expect(await screen.findByText('Hallo Postbox')).toBeInTheDocument();
    expect(aufgerufen('/api/postbox/recipients')).toBe(true);
  });
});
