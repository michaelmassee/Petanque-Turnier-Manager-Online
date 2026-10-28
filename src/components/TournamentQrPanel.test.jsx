import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../lib/i18next-config.js';
import { TournamentQrPanel } from './TournamentQrPanel.jsx';

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

  it('meldet, wenn das Bild statt geteilt in die Zwischenablage kopiert wurde', async () => {
    respond(200, { qrUrl: QR_URL, design: null });
    qrImage.shareQrPng.mockResolvedValueOnce('copied');
    render(<TournamentQrPanel tournament={TOURNAMENT} />);
    const share = await screen.findByRole('button', { name: /Teilen/ });
    await waitFor(() => expect(share).toBeEnabled());
    fireEvent.click(share);
    expect(await screen.findByText('Bild in die Zwischenablage kopiert')).toBeInTheDocument();
  });

  it('bleibt ohne Link (z. B. Entwurf, kein Zugriff) unsichtbar', async () => {
    respond(404, { error: 'Turnier nicht gefunden' });
    const { container } = render(<TournamentQrPanel tournament={TOURNAMENT} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
