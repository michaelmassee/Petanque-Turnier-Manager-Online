import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';
import { queryClient } from './lib/query-client.js';

function response(payload) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Abmeldung über persönlichen Link', () => {
  beforeEach(() => {
    queryClient.clear();
    window.history.replaceState({}, '', '/?cancel_token=cancel-token');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    queryClient.clear();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('storniert ohne Anmeldung ausschließlich mit dem Token aus dem Link', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options = {}) => {
      if (path === '/api/tournaments') return response({ tournaments: [] });
      if (path === '/api/bootstrap') return response({ needsSetup: false });
      if (path === '/api/session') return response({ user: null });
      if (path === '/api/registrations/cancel-by-token') return response({ registration: { id: 'r1', status: 'cancelled' } });
      throw new Error(`Unerwartete Anfrage: ${path} ${options.method || 'GET'}`);
    });

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Anmeldung stornieren' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/registrations/cancel-by-token', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ token: 'cancel-token' }),
    })));
    expect(await screen.findByText('Deine Anmeldung wurde storniert.')).toBeInTheDocument();
  });
});
