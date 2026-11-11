import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../lib/i18next-config.js';
import { FinalRankingQrPanel, TournamentQrPanel } from './TournamentQrPanel.jsx';

const qrImage = vi.hoisted(() => ({
  createQrBitmap: vi.fn(async () => ({})),
  canvasToBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  saveBlob: vi.fn(),
  shareQrPng: vi.fn(async () => 'shared'),
}));
vi.mock('../lib/qr-image.js', () => qrImage);
vi.mock('../lib/qr-style.js', async (original) => ({ ...(await original()), drawQrImage: vi.fn() }));

const TOURNAMENT = { id: 't1', name: 'Frühlingsturnier' };
const QR_URL = 'https://ptmonline.org/q/abcdefghijklmnop';

function respond(status, body) {
  global.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('QR-Panel der Turnierseite', () => {
  afterEach(() => vi.clearAllMocks());

  it('zeigt den festen Link und teilt das QR-Bild samt Link', async () => {
    respond(200, { qrUrl: QR_URL, design: { header: 'Jetzt anmelden!' } });
    render(<TournamentQrPanel tournament={TOURNAMENT} shareToken="geheim" />);

    expect(await screen.findByText(QR_URL)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/tournaments/t1/qr?share=geheim', expect.anything());
    const share = screen.getByRole('button', { name: /Teilen/ });
    await waitFor(() => expect(share).toBeEnabled());
    fireEvent.click(share);
    await waitFor(() => expect(qrImage.shareQrPng).toHaveBeenCalledWith(expect.objectContaining({
      blob: expect.any(Blob), title: 'Frühlingsturnier', text: `Frühlingsturnier\n${QR_URL}`,
    })));
    expect(qrImage.createQrBitmap).toHaveBeenCalledWith(expect.objectContaining({ header: 'Jetzt anmelden!' }), QR_URL);
  });

  it('setzt ohne eigenen Header-Text den Turniernamen als Überschrift ins Standard-Design', async () => {
    respond(200, { qrUrl: QR_URL, design: null });
    render(<TournamentQrPanel tournament={TOURNAMENT} />);
    await waitFor(() => expect(qrImage.createQrBitmap).toHaveBeenCalledWith(
      expect.objectContaining({ header: 'Frühlingsturnier', fgColor: '#1677ff', cornerColor: '#000000', dotType: 'dots', cornerType: 'dot' }), QR_URL,
    ));
  });

  it('meldet, wenn das Bild statt geteilt in die Zwischenablage kopiert wurde', async () => {
    respond(200, { qrUrl: QR_URL, design: null });
    qrImage.shareQrPng.mockResolvedValueOnce('copied');
    render(<TournamentQrPanel tournament={TOURNAMENT} />);
    const share = await screen.findByRole('button', { name: /Teilen/ });
    await waitFor(() => expect(share).toBeEnabled());
    fireEvent.click(share);
    expect(await screen.findByText('Bild in die Zwischenablage kopiert')).toBeInTheDocument();
  });

  it('bietet bei privaten Turnieren ohne aktive Freigabe statt des Codes die ausdrückliche Freigabe an', async () => {
    global.fetch = vi.fn(async (path, options = {}) => new Response(JSON.stringify(options.method === 'POST'
      ? { shareUrl: QR_URL, shareToken: 'neu' }
      : { qrUrl: QR_URL, design: null, shareActive: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<TournamentQrPanel tournament={TOURNAMENT} />);

    expect(await screen.findByText(/Freigabe-Link ist nicht aktiv/)).toBeInTheDocument();
    expect(screen.queryByText(QR_URL)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Teilen/ })).not.toBeInTheDocument();
    expect(qrImage.createQrBitmap).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Freigabe-Link aktivieren' }));
    expect(await screen.findByText('Freigabe-Link aktiviert')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/tournaments/t1/share-link', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByText(QR_URL)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Teilen/ })).toBeEnabled());
  });

  it('bleibt ohne Link (z. B. Entwurf, kein Zugriff) unsichtbar', async () => {
    respond(404, { error: 'Turnier nicht gefunden' });
    const { container } = render(<TournamentQrPanel tournament={TOURNAMENT} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('QR-Panel der Endrangliste', () => {
  afterEach(() => vi.clearAllMocks());

  function route({ shareActive = true } = {}) {
    global.fetch = vi.fn(async (path, options = {}) => new Response(JSON.stringify(options.method === 'POST'
      ? { shareUrl: QR_URL, shareToken: 'geheim' }
      : { qrUrl: QR_URL, design: { header: 'Jetzt anmelden!' }, shareActive }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  const rankingUrl = (query = '') => `${window.location.origin}/turniere/t1/rangliste${query}`;

  it('verlinkt direkt die Endrangliste, mit „Endrangliste“ als Überschrift statt des Design-Texts', async () => {
    route();
    render(<FinalRankingQrPanel tournament={TOURNAMENT} />);

    expect(await screen.findByText(rankingUrl())).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'QR-Code zur Endrangliste' })).toBeInTheDocument();
    await waitFor(() => expect(qrImage.createQrBitmap).toHaveBeenCalledWith(expect.objectContaining({ header: 'Endrangliste: Frühlingsturnier' }), rankingUrl()));
    expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    expect(screen.getByRole('button', { name: /Teilen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PNG herunterladen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link kopieren' })).toBeInTheDocument();
  });

  it('hängt bei privaten Turnieren mit aktiver Freigabe den Schlüssel an', async () => {
    route();
    render(<FinalRankingQrPanel tournament={{ ...TOURNAMENT, visibility: 'private' }} />);
    expect(await screen.findByText(rankingUrl('?share=geheim'))).toBeInTheDocument();
  });

  it('aktiviert bei privaten Turnieren eine inaktive Freigabe erst auf Klick', async () => {
    route({ shareActive: false });
    render(<FinalRankingQrPanel tournament={{ ...TOURNAMENT, visibility: 'private' }} />);

    const activate = await screen.findByRole('button', { name: 'Freigabe-Link aktivieren' });
    expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    fireEvent.click(activate);
    expect(await screen.findByText(rankingUrl('?share=geheim'))).toBeInTheDocument();
    expect(screen.getByText('Freigabe-Link aktiviert')).toBeInTheDocument();
  });
});
