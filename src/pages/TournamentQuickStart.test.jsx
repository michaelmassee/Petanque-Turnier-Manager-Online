import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../lib/i18next-config.js';
import { authenticatedApi } from '../lib/api.js';
import TournamentQuickStart from './TournamentQuickStart.jsx';

vi.mock('../lib/api.js', async (importOriginal) => ({ ...(await importOriginal()), authenticatedApi: vi.fn() }));

const user = { id: 'u1', firstName: 'Erste', lastName: 'Person', email: 'erste@example.org', club: 'BC Linden' };

describe('Schnellstart', () => {
  afterEach(() => vi.resetAllMocks());

  it('legt das private Turnier an, startet es und meldet die ID weiter', async () => {
    let finishStart;
    authenticatedApi.mockImplementation((path) => {
      if (path === '/api/tournaments') return Promise.resolve({ tournament: { id: 't9' } });
      return new Promise((resolve) => { finishStart = () => resolve({ tournament: { id: 't9', status: 'running' } }); });
    });
    const onStarted = vi.fn();
    render(<TournamentQuickStart currentUser={user} onStarted={onStarted} />);

    const button = screen.getByRole('button', { name: 'Supermêlée' });
    fireEvent.click(button);

    await waitFor(() => expect(authenticatedApi).toHaveBeenCalledTimes(2));
    expect(button).toBeDisabled();
    expect(button.querySelector('.button-spinner')).not.toBeNull();
    const [createPath, createOptions] = authenticatedApi.mock.calls[0];
    expect(createPath).toBe('/api/tournaments');
    expect(JSON.parse(createOptions.body)).toMatchObject({ visibility: 'private', registrationType: 'supermelee', type: 'rangliste', formation: 'doublette', location: 'BC Linden' });
    expect(screen.getByRole('radio', { name: 'Triplette' })).toBeDisabled();
    expect(authenticatedApi.mock.calls[1]).toEqual(['/api/tournaments/t9/start', { method: 'POST' }]);

    finishStart();
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('t9'));
  });

  it('legt das Turnier in der gewählten Formation an und blendet Supermêlée bei Tête aus', async () => {
    authenticatedApi.mockResolvedValue({ tournament: { id: 't3' } });
    render(<TournamentQuickStart currentUser={user} onStarted={vi.fn()} />);

    expect(screen.getByRole('radio', { name: 'Doublette' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Tête' }));
    expect(screen.queryByRole('button', { name: 'Supermêlée' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Jeder gegen Jeden' }));

    await waitFor(() => expect(authenticatedApi).toHaveBeenCalledTimes(2));
    expect(JSON.parse(authenticatedApi.mock.calls[0][1].body)).toMatchObject({ type: 'jeder_gegen_jeden', formation: 'tete', registrationType: 'forme', name: expect.stringMatching(/^Jeder gegen Jeden Tête \d{4}-\d{2}-\d{2}$/) });
  });

  it('zeigt einen Fehler beim Anlegen sichtbar an', async () => {
    authenticatedApi.mockRejectedValue(new Error('Turnier-Limit erreicht.'));
    const onStarted = vi.fn();
    render(<TournamentQuickStart currentUser={user} onStarted={onStarted} />);

    fireEvent.click(screen.getByRole('button', { name: 'K.O.' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Turnier-Limit erreicht.');
    expect(onStarted).not.toHaveBeenCalled();
  });

  it('weist darauf hin, wenn nur der Start scheitert, und lädt die Turniere neu', async () => {
    authenticatedApi.mockImplementation((path) => (path === '/api/tournaments'
      ? Promise.resolve({ tournament: { id: 't9' } })
      : Promise.reject(new Error('Kaputt'))));
    const onCreated = vi.fn();
    render(<TournamentQuickStart currentUser={user} onStarted={vi.fn()} onCreated={onCreated} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schweizer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Das Turnier wurde angelegt, konnte aber nicht gestartet werden.');
    expect(onCreated).toHaveBeenCalled();
  });
});
