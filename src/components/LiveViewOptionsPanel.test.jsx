import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../lib/i18next-config.js';
import { authenticatedApi } from '../lib/api.js';
import { LiveViewOptionsPanel } from './LiveViewOptionsPanel.jsx';

vi.mock('../lib/api.js', () => ({ authenticatedApi: vi.fn() }));

const ONLINE = { id: 't1', type: 'schweizer', registrationType: 'forme', liveViewEnabled: false, playerResultReportingEnabled: false };

// Wie die Spielverwaltung: der gespeicherte Stand fließt ins Turnierobjekt zurück.
function Page({ tournament = ONLINE, onSaved = vi.fn() }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [state, setState] = useState({});
  return (
    <QueryClientProvider client={queryClient}>
      <LiveViewOptionsPanel tournament={{ ...tournament, ...state }} onSaved={(next) => { onSaved(next); setState(next); }} />
    </QueryClientProvider>
  );
}

const sentBody = () => JSON.parse(authenticatedApi.mock.calls.find(([path]) => path.endsWith('/options'))[1].body);

describe('LiveViewOptionsPanel', () => {
  afterEach(() => vi.clearAllMocks());

  it('koppelt Ergebnismeldung und Bestätigung an die Live-Ansicht und speichert alle drei', async () => {
    authenticatedApi.mockImplementation(async (path, init) => {
      if (path.endsWith('/settings')) return { resultReportConfirmationRequired: false };
      const body = JSON.parse(init.body);
      return { liveViewEnabled: body.liveViewEnabled, playerResultReportingEnabled: body.playerResultReportingEnabled, ...body };
    });
    const onSaved = vi.fn();
    render(<Page onSaved={onSaved} />);

    const liveView = screen.getByRole('checkbox', { name: 'Live-Ansicht freischalten' });
    const reporting = screen.getByRole('checkbox', { name: /Spieler dürfen Ergebnisse/ });
    expect(reporting).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
    fireEvent.click(liveView);
    fireEvent.click(reporting);
    const confirmation = await screen.findByRole('checkbox', { name: /erst nach Bestätigung/ });
    await waitFor(() => expect(confirmation).toBeEnabled());
    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ liveViewEnabled: true, playerResultReportingEnabled: true }));
    expect(sentBody()).toEqual({ liveViewEnabled: true, playerResultReportingEnabled: true, resultReportConfirmationRequired: true });
    expect(await screen.findByText('Einstellungen gespeichert.')).toBeInTheDocument();
  });

  it('schaltet mit der Live-Ansicht auch die Ergebnismeldung ab', async () => {
    authenticatedApi.mockImplementation(async (path, init) => (path.endsWith('/settings')
      ? { resultReportConfirmationRequired: true }
      : { liveViewEnabled: false, playerResultReportingEnabled: false, ...JSON.parse(init.body) }));
    render(<Page tournament={{ ...ONLINE, liveViewEnabled: true, playerResultReportingEnabled: true }} />);
    // Gespeicherten Stand abwarten (der Entwurf übernimmt ihn beim Laden).
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /erst nach Bestätigung/ })).toBeChecked());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Live-Ansicht freischalten' }));
    expect(screen.getByRole('checkbox', { name: /Spieler dürfen Ergebnisse/ })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /erst nach Bestätigung/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(sentBody()).toEqual({ liveViewEnabled: false, playerResultReportingEnabled: false, resultReportConfirmationRequired: false }));
  });

  it('Desktop-Turnier: nur Anzeige, eingestellt wird im Turnierdokument', () => {
    render(<Page tournament={{ ...ONLINE, desktopExecution: true, liveViewEnabled: true, playerResultReportingEnabled: true }} />);
    expect(screen.getByRole('checkbox', { name: 'Live-Ansicht freischalten' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Live-Ansicht freischalten' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Spieler dürfen Ergebnisse/ })).toBeDisabled();
    expect(screen.queryByRole('checkbox', { name: /erst nach Bestätigung/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument();
    expect(screen.getByText(/stellt die Turnierleitung Live-Ansicht und Ergebnismeldung im Turnierdokument ein/)).toBeInTheDocument();
    // Kein Nachladen der Online-Einstellung
    expect(authenticatedApi).not.toHaveBeenCalled();
  });

  it('Trip-Tête: keine Ergebnismeldung', () => {
    authenticatedApi.mockResolvedValue({ resultReportConfirmationRequired: false });
    render(<Page tournament={{ ...ONLINE, type: 'trip_tete', liveViewEnabled: true }} />);
    expect(screen.getByRole('checkbox', { name: /Spieler dürfen Ergebnisse/ })).toBeDisabled();
    expect(screen.getByText(/Bei Trip-Tête melden Spieler keine Ergebnisse/)).toBeInTheDocument();
  });

  it('zeigt Fehler beim Speichern an', async () => {
    authenticatedApi.mockImplementation(async (path) => {
      if (path.endsWith('/settings')) return { resultReportConfirmationRequired: false };
      throw new Error('Das Turnier ist beendet.');
    });
    render(<Page />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Live-Ansicht freischalten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Das Turnier ist beendet.');
  });
});
