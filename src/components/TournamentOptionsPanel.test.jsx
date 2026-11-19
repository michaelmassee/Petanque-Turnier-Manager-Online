import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../lib/i18next-config.js';
import { authenticatedApi } from '../lib/api.js';
import { DEFAULT_TOURNAMENT_OPTIONS, TournamentOptionsPanel } from './TournamentOptionsPanel.jsx';

vi.mock('../lib/api.js', () => ({ authenticatedApi: vi.fn() }));

const SCHWEIZER = { id: 't1', type: 'schweizer', registrationType: 'forme' };

// Wie die Spielverwaltung: der gespeicherte Stand kommt als neues options-Objekt zurück.
// Ein QueryClient je Seite: Die Maastrichter-Einstellungen lädt das Panel selbst nach.
function Page(props) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={queryClient}><PanelPage {...props} /></QueryClientProvider>;
}

function PanelPage({ tournament = SCHWEIZER, onSaved = vi.fn() }) {
  const [options, setOptions] = useState(DEFAULT_TOURNAMENT_OPTIONS);
  return <TournamentOptionsPanel tournament={tournament} options={{ ...options }} onSaved={(next) => { onSaved(next); setOptions(next); }} />;
}

describe('TournamentOptionsPanel', () => {
  afterEach(() => vi.clearAllMocks());

  it('bietet die vier Spielbahn-Varianten an und speichert nur die Optionen des Systems', async () => {
    authenticatedApi.mockImplementation(async (path, { body }) => ({ ...DEFAULT_TOURNAMENT_OPTIONS, ...JSON.parse(body) }));
    const onSaved = vi.fn();
    render(<Page onSaved={onSaved} />);

    const select = screen.getByLabelText('Spielbahn');
    expect([...select.options].map((option) => option.value)).toEqual(['X', 'L', 'N', 'R']);
    const save = screen.getByRole('button', { name: 'Speichern' });
    expect(save).toBeDisabled();

    fireEvent.change(select, { target: { value: 'R' } });
    fireEvent.change(screen.getByLabelText('Pluspunkte'), { target: { value: '13' } });
    fireEvent.change(screen.getByLabelText('Minuspunkte'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Team-Anzeige in der Rangliste'), { target: { value: 'NR' } });
    fireEvent.click(save);

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(JSON.parse(authenticatedApi.mock.calls[0][1].body)).toEqual({
      courtMode: 'R', byePointsFor: 13, byePointsAgainst: 5, teamDisplayRound: 'NAME', teamDisplayRanking: 'NR', byeBuchholz: 'null',
    });
    expect(await screen.findByText('Turnieroptionen gespeichert.')).toBeInTheDocument();
    expect(select).toHaveValue('R');
    expect(save).toBeDisabled();
  });

  it('zeigt je Turniersystem nur dessen Optionen', () => {
    const { unmount } = render(<Page tournament={{ id: 'k', type: 'ko', registrationType: 'forme' }} />);
    expect(screen.getByLabelText('Maximale Teams pro Gruppe')).toHaveValue('16');
    expect(screen.getByLabelText('Mindestgröße der letzten Gruppe')).toHaveValue('4');
    expect(screen.getByLabelText('Spiel um Platz 3 austragen')).toBeChecked();
    expect(screen.getByLabelText('Bahn nur in Runde 1 (bei Cadrage die Cadrage-Runde)')).toBeChecked();
    expect(screen.queryByLabelText('Team-Anzeige in der Rangliste')).toBeNull();
    expect(screen.queryByText('Freilos')).toBeNull();
    unmount();

    const supermelee = render(<Page tournament={{ id: 's', type: 'schweizer', registrationType: 'supermelee' }} />);
    expect(screen.getByText('Nicht gespielte Runde')).toBeInTheDocument();
    expect(screen.getByLabelText('Minuspunkte')).toHaveValue('13');
    expect(screen.queryByLabelText('Team-Anzeige in der Spielrunde')).toBeNull();
    supermelee.unmount();

    const roundRobin = render(<Page tournament={{ id: 'j', type: 'jeder_gegen_jeden', registrationType: 'forme' }} />);
    expect(screen.getByLabelText('Rückrunde spielen (Hin- und Rückrunde mit getauschten Seiten)')).not.toBeChecked();
    expect(screen.getByText('Freilos')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mêlée-Teams')).toBeNull();
    roundRobin.unmount();

    render(<Page tournament={{ id: 'm', type: 'schweizer', registrationType: 'melee' }} />);
    expect([...screen.getByLabelText('Mêlée-Teams').options].map((option) => option.value)).toEqual(['EINFACH', 'DOUBLETTE_OHNE_FREILOS', 'TRIPLETTE_OHNE_FREILOS']);
  });

  it('bietet die Buchholz-Wertung des Freiloses nur im Schweizer System mit Buchholz an', async () => {
    authenticatedApi.mockImplementation(async (path, { body }) => ({ ...DEFAULT_TOURNAMENT_OPTIONS, ...JSON.parse(body) }));
    const { unmount } = render(<Page />);
    const select = screen.getByLabelText('Buchholz-Wertung des Freiloses');
    expect([...select.options].map((option) => option.value)).toEqual(['null', 'neutral']);
    fireEvent.change(select, { target: { value: 'neutral' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(authenticatedApi).toHaveBeenCalled());
    expect(JSON.parse(authenticatedApi.mock.calls[0][1].body)).toMatchObject({ byeBuchholz: 'neutral' });
    unmount();

    render(<Page tournament={{ ...SCHWEIZER, id: 't3', schweizerRankingMode: 'ohne_buchholz' }} />);
    expect(screen.queryByLabelText('Buchholz-Wertung des Freiloses')).toBeNull();
  });

  it('verwirft den ungespeicherten Entwurf beim Turnierwechsel, auch bei gleichen gespeicherten Optionen', () => {
    const { rerender } = render(<Page tournament={SCHWEIZER} />);
    fireEvent.change(screen.getByLabelText('Spielbahn'), { target: { value: 'R' } });
    expect(screen.getByLabelText('Spielbahn')).toHaveValue('R');
    rerender(<Page tournament={{ ...SCHWEIZER, id: 't2' }} />);
    expect(screen.getByLabelText('Spielbahn')).toHaveValue('X');
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('Maastrichter: lädt Vorrunden und Finalgruppen nach und speichert sie mit Spiel um Platz 3', async () => {
    const state = { preliminaryRounds: 3, groupMode: 'NACH_GROESSE', roundsDrawn: 1, finalStarted: false };
    authenticatedApi.mockImplementation(async (path, init) => {
      if (path.endsWith('/maastrichter-settings')) return state;
      const body = JSON.parse(init.body);
      return { ...DEFAULT_TOURNAMENT_OPTIONS, ...body, maastrichter: { ...state, preliminaryRounds: body.maastrichterPreliminaryRounds, groupMode: body.maastrichterGroupMode } };
    });
    const onSaved = vi.fn();
    render(<Page tournament={{ id: 'ma', type: 'maastrichter', registrationType: 'forme' }} onSaved={onSaved} />);

    const rounds = screen.getByLabelText('Anzahl Vorrunden (Schweizer System)');
    await waitFor(() => expect(rounds).toHaveDisplayValue('3'));
    fireEvent.change(rounds, { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Finalgruppen bilden'), { target: { value: 'NACH_SIEGEN' } });
    fireEvent.click(screen.getByLabelText('Spiel um Platz 3 austragen'));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const sent = JSON.parse(authenticatedApi.mock.calls.find(([path]) => path.endsWith('/options'))[1].body);
    expect(sent).toMatchObject({ koPlatz3: false, maastrichterPreliminaryRounds: 4, maastrichterGroupMode: 'NACH_SIEGEN' });
    // Der Maastrichter-Stand geht nicht in die Turnieroptionen der Seite.
    expect(onSaved.mock.calls[0][0]).not.toHaveProperty('maastrichter');
    expect(await screen.findByText('Turnieroptionen gespeichert.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('Maastrichter: sperrt Vorrunden und Finalgruppen nach Beginn der Finalrunde und schickt sie nicht mit', async () => {
    authenticatedApi.mockImplementation(async (path, init) => (path.endsWith('/maastrichter-settings')
      ? { preliminaryRounds: 2, groupMode: 'NACH_GROESSE', roundsDrawn: 3, finalStarted: true }
      : { ...DEFAULT_TOURNAMENT_OPTIONS, ...JSON.parse(init.body) }));
    const onSaved = vi.fn();
    render(<Page tournament={{ id: 'mb', type: 'maastrichter', registrationType: 'forme' }} onSaved={onSaved} />);
    expect(await screen.findByText('Die Finalrunde läuft bereits; Vorrunden und Finalgruppen stehen fest.')).toBeInTheDocument();
    expect(screen.getByLabelText('Anzahl Vorrunden (Schweizer System)')).toBeDisabled();
    expect(screen.getByLabelText('Finalgruppen bilden')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Spiel um Platz 3 austragen'));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const sent = JSON.parse(authenticatedApi.mock.calls.find(([path]) => path.endsWith('/options'))[1].body);
    expect(sent).not.toHaveProperty('maastrichterPreliminaryRounds');
    expect(sent.koPlatz3).toBe(false);
  });

  it('zeigt Fehler beim Speichern an', async () => {
    authenticatedApi.mockRejectedValue(new Error('Beim Freilos müssen die Pluspunkte größer als die Minuspunkte sein.'));
    render(<Page />);
    fireEvent.change(screen.getByLabelText('Minuspunkte'), { target: { value: '13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Beim Freilos müssen die Pluspunkte größer als die Minuspunkte sein.');
  });
});
