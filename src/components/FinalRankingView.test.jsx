import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FinalRankingView } from './FinalRankingView.jsx';

vi.mock('../lib/ranking-pdf.js', () => ({
  buildRankingPages: vi.fn(async () => { throw new Error('satori'); }),
  rankingFileName: () => 'rangliste.pdf', renderRankingSvg: () => '', RANKING_PAGE: { width: 210, height: 297 },
}));
vi.mock('../lib/flyer-typesetter.js', () => ({ typesetFlyerText: vi.fn() }));

const RANKING = { ranking: [{ rank: 1, teamId: 'a', wins: 1, members: [{ id: 'p1', firstName: 'Anna', lastName: 'Test' }] }], publishedAt: '2026-10-14T18:00:00.000Z' };
const response = (payload, ok = true) => ({ ok, status: ok ? 200 : 403, headers: new Headers(), json: () => Promise.resolve(payload) });

describe('Veröffentlichte Endrangliste', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lädt private Turniere mit dem Freigabe-Link und zeigt das Vereinslogo', async () => {
    global.fetch = vi.fn(() => Promise.resolve(response(RANKING)));
    render(<FinalRankingView tournament={{ id: 't1', name: 'Herbstturnier', date: '2026-10-14', logoUrl: 'https://example.test/logo.png' }} language="de" shareToken="geheim" />);

    expect(await screen.findByText('Anna Test')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/tournaments/t1/ranking?share=geheim', expect.anything());
    expect(screen.getByRole('img', { name: 'Vereinslogo' })).toHaveAttribute('src', '/api/tournaments/t1/image?field=logo&share=geheim');
    expect(screen.getByText(/Veröffentlicht am/)).toBeInTheDocument();
  });

  it('meldet, wenn das PDF nicht erstellt werden kann', async () => {
    global.fetch = vi.fn(() => Promise.resolve(response(RANKING)));
    render(<FinalRankingView tournament={{ id: 't1', name: 'Herbstturnier', date: '2026-10-14' }} language="de" />);

    fireEvent.click(await screen.findByRole('button', { name: 'PDF herunterladen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Das PDF konnte nicht erstellt werden.');
  });

  it('zeigt auf dem Bildschirm vor Ort die Tabelle im Scrollbereich und keinen PDF-Button', async () => {
    global.fetch = vi.fn(() => Promise.resolve(response(RANKING)));
    render(<FinalRankingView tournament={{ id: 't1', name: 'Herbstturnier', date: '2026-10-14' }} language="de" display />);

    expect(await screen.findByText('Anna Test')).toBeInTheDocument();
    expect(document.querySelector('.final-ranking.is-display .display-scroll .ranking-table')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'PDF herunterladen' })).not.toBeInTheDocument();
  });

  it('zeigt einen Ladefehler an', async () => {
    global.fetch = vi.fn(() => Promise.resolve(response({ error: 'Zugriff verweigert' }, false)));
    render(<FinalRankingView tournament={{ id: 't1', name: 'Herbstturnier', date: '2026-10-14' }} language="de" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Zugriff verweigert');
  });
});
