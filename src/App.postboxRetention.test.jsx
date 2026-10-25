import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';
import { queryClient } from './lib/query-client.js';
import i18next from './lib/i18next-config.js';

const user = { id: 'alice', firstName: 'Alice', lastName: 'Beispiel', email: 'alice@example.test', role: 'user',
  emailVerifiedAt: '2026-10-01', postboxReadRetentionDays: 7 };
const message = (id, mine = false) => ({ id, kind: 'direct', body: `Nachricht ${id}`, mine, senderName: 'Sender',
  createdAt: '2026-10-20T10:00:00.000Z', readAt: null });
const response = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('Profil und Gelesen-Markierung der Postbox', () => {
  let fetchMock;
  let loadMessages;
  let markRead;
  beforeEach(() => {
    queryClient.clear();
    window.history.replaceState({}, '', '/');
    loadMessages = async () => response({ messages: [message('received'), message('sent', true)], unreadCount: 1, todos: [] });
    markRead = async () => response({ ok: true, readAt: '2026-10-25T12:00:00.000Z' });
    fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options = {}) => {
      if (path === '/api/bootstrap') return response({ needsSetup: false });
      if (path === '/api/session') return response({ user });
      if (path === '/api/tournaments') return response({ tournaments: [] });
      if (path === '/api/clubs') return response({ clubs: [] });
      if (path === '/api/api-keys') return response({ apiKeys: [] });
      if (path === '/api/postbox/summary') return response({ unreadCount: 1, todos: [] });
      if (path === '/api/postbox') return loadMessages();
      if (path === '/api/postbox/read-all') return markRead(options);
      if (path === '/api/postbox/recipients') return response({ recipients: [], tournaments: [] });
      if (path === '/api/me') return response({ user: { ...user, ...JSON.parse(options.body) } });
      return response({});
    });
  });
  afterEach(async () => {
    queryClient.clear();
    vi.restoreAllMocks();
    await i18next.changeLanguage('de');
  });

  it('markiert erst geladene Nachrichten einschließlich gesendeter Kopien und fragt die Postbox dafür nicht erneut ab', async () => {
    let resolveMessages;
    loadMessages = () => new Promise((resolve) => { resolveMessages = resolve; });
    render(<App />);
    fireEvent.click(await screen.findByLabelText('Postbox'));
    await waitFor(() => expect(resolveMessages).toBeTypeOf('function'));
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/postbox/read-all')).toBe(false);
    await act(async () => resolveMessages(response({ messages: [message('received'), message('sent', true)], unreadCount: 1, todos: [] })));
    expect(await screen.findByText('Nachricht received')).toBeInTheDocument();
    await waitFor(() => expect(queryClient.getQueryData(['postbox', 'alice']).messages.every((entry) => entry.readAt)).toBe(true));
    const calls = fetchMock.mock.calls.filter(([path]) => path === '/api/postbox/read-all');
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0][1].body)).toEqual({ messageIds: ['received', 'sent'] });
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/postbox')).toHaveLength(1);
    expect(queryClient.getQueryData(['postbox', 'alice']).unreadCount).toBe(0);
  });

  it('verarbeitet neue Nachrichten während einer laufenden Gelesen-Markierung ohne die erste Antwort zu verlieren', async () => {
    const resolvers = [];
    markRead = () => new Promise((resolve) => resolvers.push(resolve));
    render(<App />);
    fireEvent.click(await screen.findByLabelText('Postbox'));
    await screen.findByText('Nachricht received');
    await waitFor(() => expect(resolvers).toHaveLength(1));
    await act(async () => queryClient.setQueryData(['postbox', 'alice'], {
      messages: [message('new'), message('received'), message('sent', true)], unreadCount: 2, todos: [],
    }));
    await waitFor(() => expect(resolvers).toHaveLength(2));
    await act(async () => resolvers[0](response({ ok: true, readAt: '2026-10-25T12:00:00.000Z' })));
    await act(async () => resolvers[1](response({ ok: true, readAt: '2026-10-25T12:01:00.000Z' })));
    await waitFor(() => expect(queryClient.getQueryData(['postbox', 'alice']).messages.every((entry) => entry.readAt)).toBe(true));
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/postbox/read-all')).toHaveLength(2);
  });

  it('zeigt Standard und Mengenlimit im Profil und speichert die frei gewählte Frist als Zahl', async () => {
    render(<App />);
    fireEvent.click(await screen.findByLabelText('Menü öffnen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Mein Profil' }));
    const input = await screen.findByRole('spinbutton', { name: /Gelesene Nachrichten löschen nach/ });
    expect(input).toHaveValue(7);
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '365');
    expect(screen.getByText(/Maximal 25 Nachrichten bleiben gespeichert/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '14' } });
    fireEvent.submit(input.closest('form'));
    await waitFor(() => expect(fetchMock.mock.calls.some(([path]) => path === '/api/me')).toBe(true));
    expect(JSON.parse(fetchMock.mock.calls.find(([path]) => path === '/api/me')[1].body).postboxReadRetentionDays).toBe(14);
    await screen.findByText('Deine Daten wurden gespeichert.');
    expect(input).toHaveValue(14);
  });
});
