import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api } from '../lib/api.js';
import { ensureBrowserPushSubscription, isPushSupported } from '../lib/push.js';
import { BoardPushToggle } from './BoardPushToggle.jsx';
import '../lib/i18next-config.js';

vi.mock('../lib/api.js', () => ({ api: vi.fn() }));
vi.mock('../lib/push.js', () => ({
  isPushSupported: vi.fn(() => true),
  ensureBrowserPushSubscription: vi.fn(),
}));

const SUBSCRIPTION = { endpoint: 'https://fcm.googleapis.com/fcm/send/1', toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/1', keys: { p256dh: 'k', auth: 'a' } }) };

describe('BoardPushToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('Notification', { permission: 'default' });
    isPushSupported.mockReturnValue(true);
    api.mockImplementation(async (path) => (path === '/api/live/push/public-key' ? { publicKey: 'pk' } : { ok: true }));
    ensureBrowserPushSubscription.mockImplementation(async (loadKey) => { await loadKey(); return { status: 'enabled', subscription: SUBSCRIPTION }; });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('zeigt nichts, wenn der Browser kein Push kann', () => {
    isPushSupported.mockReturnValue(false);
    const { container } = render(<BoardPushToggle tournamentId="t1" language="de" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt nichts, wenn der Server keinen Push anbietet', async () => {
    api.mockRejectedValue(new Error('Push-Benachrichtigungen sind nicht konfiguriert'));
    const { container } = render(<BoardPushToggle tournamentId="t1" language="de" />);
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/live/push/public-key'));
    expect(container).toBeEmptyDOMElement();
  });

  it('schaltet Push ein und blendet den Button danach aus', async () => {
    render(<BoardPushToggle tournamentId="t1" shareToken="geheim" language="fr" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Push einschalten' }));

    expect(await screen.findByText('Diese Seite aktualisiert sich jetzt bei jeder neuen Runde sofort.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const [path, options] = api.mock.calls.find(([url]) => url.includes('/schedule/push'));
    expect(path).toBe('/api/tournaments/t1/schedule/push?share=geheim');
    expect(JSON.parse(options.body)).toMatchObject({ endpoint: SUBSCRIPTION.endpoint, language: 'fr', url: window.location.href });
    expect(localStorage.getItem('ptm_board_push_t1')).toBe('1');
  });

  it('blendet die Bestätigung nach kurzer Zeit wieder aus', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<BoardPushToggle tournamentId="t1" language="de" />);
      fireEvent.click(await screen.findByRole('button', { name: 'Push einschalten' }));
      expect(await screen.findByText('Diese Seite aktualisiert sich jetzt bei jeder neuen Runde sofort.')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.queryByText('Diese Seite aktualisiert sich jetzt bei jeder neuen Runde sofort.')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['blocked', 'Benachrichtigungen sind im Browser blockiert. Bitte in den Browser-Einstellungen erlauben.'],
    ['denied', 'Benachrichtigungen wurden nicht erlaubt.'],
  ])('meldet verweigerte Benachrichtigungen (%s)', async (status, text) => {
    ensureBrowserPushSubscription.mockResolvedValue({ status });
    render(<BoardPushToggle tournamentId="t1" language="de" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Push einschalten' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('frischt ein eingeschaltetes Abo nach dem Neuladen auf und meldet dabei Fehler', async () => {
    localStorage.setItem('ptm_board_push_t1', '1');
    vi.stubGlobal('Notification', { permission: 'granted' });
    const { container, unmount } = render(<BoardPushToggle tournamentId="t1" language="de" />);
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/tournaments/t1/schedule/push', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    unmount();

    ensureBrowserPushSubscription.mockResolvedValue({ status: 'denied' });
    render(<BoardPushToggle tournamentId="t1" language="de" />);
    expect(await screen.findByText('Benachrichtigungen wurden nicht erlaubt.')).toBeInTheDocument();
  });

  it('übernimmt beim Turnierwechsel nicht das Abo des vorherigen Turniers', async () => {
    const { rerender } = render(<BoardPushToggle tournamentId="t1" language="de" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Push einschalten' }));
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());

    rerender(<BoardPushToggle tournamentId="t2" language="de" />);
    expect(await screen.findByRole('button', { name: 'Push einschalten' })).toBeInTheDocument();
    expect(screen.queryByText('Diese Seite aktualisiert sich jetzt bei jeder neuen Runde sofort.')).not.toBeInTheDocument();
  });

  it('funktioniert ohne lokalen Speicher', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('gesperrt'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('gesperrt'); });
    render(<BoardPushToggle tournamentId="t1" language="de" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Push einschalten' }));
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
    vi.restoreAllMocks();
  });
});
