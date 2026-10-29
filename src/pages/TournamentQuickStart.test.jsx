import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(JSON.parse(createOptions.body)).toMatchObject({
      visibility: 'private', registrationType: 'supermelee', type: 'rangliste', formation: 'doublette', location: 'BC Linden',
      liveViewEnabled: true, playerResultReportingEnabled: true, quickStart: true,
    });
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

  it.each([
    [undefined, 5],
    [null, 5],
    [2, 2],
    [0, 0],
  ])('sperrt den Schnellstart beim Turnier-Limit %s', (tournamentLimit, count) => {
    const tournaments = Array.from({ length: count }, (_, index) => ({
      id: `t${index}`, ownerId: user.id, registrationEnabled: true,
    }));
    render(<TournamentQuickStart currentUser={{ ...user, tournamentLimit }} tournaments={tournaments} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Turnier-Limit erreicht. Lösche alte Turniere oder kontaktiere einen Admin für mehr Turniere.');
    expect(screen.getByRole('alert')).toHaveClass('feedback', 'error');
    expect(screen.getByText(`Turnier-Limit: ${count} / ${count}`)).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Supermêlée' }));
    expect(authenticatedApi).not.toHaveBeenCalled();
  });

  it('zählt nur eigene Turniere mit Anmeldung, auch abgeschlossene, und reagiert auf Löschungen', async () => {
    const tournaments = [
      { id: 'own', ownerId: user.id, registrationEnabled: true, status: 'finished' },
      { id: 'calendar', ownerId: user.id, registrationEnabled: false },
      { id: 'shared', ownerId: 'other', registrationEnabled: true, canManage: true },
    ];
    const currentUser = { ...user, tournamentLimit: 1 };
    const { rerender } = render(<TournamentQuickStart currentUser={currentUser} tournaments={tournaments} />);

    expect(screen.getByRole('button', { name: 'Supermêlée' })).toBeDisabled();
    expect(screen.getByText('Turnier-Limit: 1 / 1')).toBeInTheDocument();

    rerender(<TournamentQuickStart currentUser={currentUser} tournaments={tournaments.slice(1)} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Turnier-Limit: 0 / 1')).toBeInTheDocument();
    authenticatedApi.mockResolvedValue({ tournament: { id: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Supermêlée' }));
    await waitFor(() => expect(authenticatedApi).toHaveBeenCalledTimes(2));
  });

  it('begrenzt Admins nicht durch ihr gespeichertes Turnier-Limit', async () => {
    authenticatedApi.mockResolvedValue({ tournament: { id: 'new' } });
    render(<TournamentQuickStart currentUser={{ ...user, role: 'admin', tournamentLimit: 0 }} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Supermêlée' }));
    await waitFor(() => expect(authenticatedApi).toHaveBeenCalledTimes(2));
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

  it('listet nur eigene Schnellstart-Turniere mit Status, neueste zuerst, und öffnet sie per Klick', () => {
    const onOpen = vi.fn();
    const tournaments = [
      { id: 'alt', name: 'Schweizer Doublette 2026-10-01', date: '2026-10-01', status: 'finished', ownerId: 'u1', quickStart: true },
      { id: 'neu', name: 'Supermêlée Doublette 2026-10-29', date: '2026-10-29', status: 'running', ownerId: 'u1', quickStart: true },
      { id: 'normal', name: 'Vereinsmeisterschaft', date: '2026-10-30', status: 'registration', ownerId: 'u1' },
      { id: 'fremd', name: 'Formule X Triplette 2026-10-28', date: '2026-10-28', status: 'running', ownerId: 'u2', quickStart: true },
    ];
    render(<TournamentQuickStart currentUser={user} tournaments={tournaments} onOpen={onOpen} />);

    const list = screen.getByRole('region', { name: 'Meine Schnellstart-Turniere' });
    const entries = within(list).getAllByRole('button');
    expect(entries.map((entry) => entry.textContent)).toEqual([
      'Supermêlée Doublette 2026-10-29Läuft',
      'Schweizer Doublette 2026-10-01Abgeschlossen',
    ]);
    fireEvent.click(entries[1]);
    expect(onOpen).toHaveBeenCalledWith('alt');
  });

  it('blendet die Liste ohne Schnellstart-Turniere aus', () => {
    render(<TournamentQuickStart currentUser={user} tournaments={[{ id: 'normal', name: 'Pokal', status: 'draft', ownerId: 'u1' }]} />);
    expect(screen.queryByRole('region', { name: 'Meine Schnellstart-Turniere' })).not.toBeInTheDocument();
  });
});
