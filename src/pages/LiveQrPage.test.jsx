import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../lib/i18next-config.js';
import { LiveQrPage, liveLinkFor } from './LiveQrPage.jsx';
import { readRememberedTeams } from './PlayerLivePage.jsx';

vi.mock('qr-code-styling', () => ({ default: class { append() {} } }));
vi.mock('../lib/qr-style.js', async (importOriginal) => ({ ...(await importOriginal()), loadQrLogo: () => Promise.resolve('/icons/logo.png') }));

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderPage(token = 'tok1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><LiveQrPage token={token} /></QueryClientProvider>);
}

describe('QR-Seite der Live-Ansicht', () => {
  afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

  it('zeigt Team, Turnier und den Link, den der QR-Code kodiert', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      tournament: { id: 't1', name: 'Sommerturnier' }, registration: { id: 'r1', label: 'Anna Muster' }, live: null,
    }));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Anna Muster' })).toBeTruthy();
    expect(screen.getByText('Sommerturnier')).toBeTruthy();
    expect(screen.getByText(liveLinkFor(window.location.origin, 'tok1'))).toBeTruthy();
    expect(screen.getByRole('img', { name: 'QR-Code Live-Ansicht' })).toBeTruthy();
  });

  // Das Gerät gehört der Turnierleitung: Der Link darf dort nicht als „eigenes Team“ gemerkt werden.
  it('merkt sich den Link nicht auf dem Gerät', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      tournament: { id: 't1', name: 'Sommerturnier' }, registration: { id: 'r1', label: 'Anna Muster' }, live: null,
    }));
    renderPage();

    await screen.findByRole('heading', { name: 'Anna Muster' });
    expect(readRememberedTeams()).toEqual([]);
  });

  it('meldet einen ungültigen Link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'Anmeldung nicht gefunden' }, 404));
    renderPage();

    expect(await screen.findByText('Für diese Anmeldung gibt es keine Live-Ansicht.')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'QR-Code Live-Ansicht' })).toBeNull();
  });

  it('kodiert den Token im Link', () => {
    expect(liveLinkFor('https://ptm.test', 'a/b')).toBe('https://ptm.test/live/t/a%2Fb');
  });
});
