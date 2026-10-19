import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError, authenticatedApi } from '../lib/api.js';
import { FinalRankingPublisher } from './TournamentPlayManagement.jsx';

vi.mock('../lib/api.js', async (importOriginal) => ({ ...(await importOriginal()), authenticatedApi: vi.fn() }));

const FINISHED = { id: 't1', name: 'Herbstturnier', type: 'schweizer', status: 'finished', timezone: 'Europe/Berlin' };

describe('Endrangliste veröffentlichen (Spielverwaltung)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('weist vor Turnierende nur auf die Möglichkeit hin und blendet sich bei K.O. aus', () => {
    const { rerender } = render(<FinalRankingPublisher tournament={{ ...FINISHED, status: 'running' }} />);
    expect(screen.getByText('Nach Turnierende kannst du hier die Endrangliste veröffentlichen.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<FinalRankingPublisher tournament={{ ...FINISHED, type: 'ko' }} />);
    expect(screen.queryByText(/Endrangliste/)).not.toBeInTheDocument();
  });

  it('veröffentlicht mit Versand und meldet den Erfolg', async () => {
    let resolve;
    authenticatedApi.mockReturnValue(new Promise((done) => { resolve = done; }));
    const onPublished = vi.fn();
    render(<FinalRankingPublisher tournament={FINISHED} onPublished={onPublished} />);

    fireEvent.click(screen.getByRole('button', { name: 'Endrangliste veröffentlichen' }));
    expect(screen.getByRole('button', { name: /Endrangliste veröffentlichen/ })).toBeDisabled();
    expect(authenticatedApi).toHaveBeenCalledWith('/api/tournaments/t1/ranking/publish', { method: 'POST', body: JSON.stringify({ notify: true, resend: false }) });

    resolve({});
    expect(await screen.findByText('Endrangliste veröffentlicht und an die Teilnehmer gesendet.')).toBeInTheDocument();
    expect(onPublished).toHaveBeenCalled();
  });

  it('veröffentlicht ohne Versand, wenn die Checkbox aus ist', async () => {
    authenticatedApi.mockResolvedValue({});
    render(<FinalRankingPublisher tournament={{ ...FINISHED, rankingPublishedAt: '2026-10-14T18:00:00.000Z' }} />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Endrangliste erneut veröffentlichen' }));

    expect(await screen.findByText('Endrangliste veröffentlicht.')).toBeInTheDocument();
    expect(JSON.parse(authenticatedApi.mock.calls[0][1].body)).toEqual({ notify: false, resend: false });
    expect(screen.getByRole('link', { name: 'Endrangliste ansehen' })).toHaveAttribute('href', '/turniere/t1/rangliste');
  });

  it('sendet erst nach Bestätigung erneut', async () => {
    authenticatedApi
      .mockRejectedValueOnce(new ApiError('bereits gesendet', { status: 409, payload: { details: { code: 'ranking_already_mailed' } } }))
      .mockResolvedValueOnce({});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<FinalRankingPublisher tournament={FINISHED} />);

    fireEvent.click(screen.getByRole('button', { name: 'Endrangliste veröffentlichen' }));

    await waitFor(() => expect(authenticatedApi).toHaveBeenCalledTimes(2));
    expect(confirm).toHaveBeenCalled();
    expect(JSON.parse(authenticatedApi.mock.calls[1][1].body)).toEqual({ notify: true, resend: true });
  });

  it('zeigt andere Fehler an', async () => {
    authenticatedApi.mockRejectedValue(new ApiError('Es gibt noch keine Rangliste', { status: 409 }));
    render(<FinalRankingPublisher tournament={FINISHED} />);

    fireEvent.click(screen.getByRole('button', { name: 'Endrangliste veröffentlichen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Es gibt noch keine Rangliste');
  });
});
