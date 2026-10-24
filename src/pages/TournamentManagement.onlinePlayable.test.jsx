// Turniersysteme ohne Online-Durchführung: dicker roter Hinweis im Formular (mit Verweis auf PTM Desktop) und Badge in
// der Turnierliste, damit niemand ein Turnier anlegt und erst am Turniertag merkt, dass es online nicht startbar ist.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../lib/i18next-config.js';
import { TournamentManagementPage } from './TournamentManagement.jsx';

const jsonResponse = (payload) => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });

const base = {
  date: '2099-07-01', location: 'Ort', formation: 'doublette', registrationType: 'forme', status: 'registration',
  visibility: 'public', ownerId: 'u1', canManage: true, editors: [],
};
const NOTICE = 'Nicht online durchführbar';

describe('Hinweis für Turniersysteme ohne Online-Durchführung', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPage(tournaments) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
      if (path === '/api/postbox/recipients') return jsonResponse({ recipients: [], tournaments: [] });
      if (String(path).endsWith('/editors')) return jsonResponse({ editors: [] });
      return jsonResponse({});
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TournamentManagementPage tournaments={tournaments} currentUser={{ id: 'u1', firstName: 'Lea', lastName: 'Leitung', role: 'user', mailEnabled: true }}
          language="de" setSelectedTournamentId={() => {}} />
      </QueryClientProvider>,
    );
  }

  it('zeigt beim Anlegen erst bei einem nicht unterstützten Turniersystem den roten Hinweis mit PTM Desktop', async () => {
    renderPage([]);
    fireEvent.click(screen.getByRole('button', { name: 'Neues Turnier' }));

    const system = await screen.findByLabelText('Turniersystem');
    fireEvent.change(system, { target: { value: 'schweizer' } });
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();

    fireEvent.change(system, { target: { value: 'liga' } });
    const notice = screen.getByText(NOTICE).closest('.notice-danger');
    expect(notice).toHaveTextContent('Turniersystem Liga');
    expect(notice).toHaveTextContent('Online unterstützt:');
    expect(notice).toHaveTextContent('PTM Desktop unterstützt dieses Turniersystem');
    expect(within(notice).getByRole('link', { name: 'PTM Desktop entdecken' })).toHaveAttribute('target', '_blank');
  });

  it('markiert nicht online durchführbare Turniere in der Liste, Desktop-Turniere und Kalendereinträge nicht', () => {
    renderPage([
      { ...base, id: 't1', name: 'Ligaspieltag', type: 'liga' },
      { ...base, id: 't2', name: 'Schweizer Abend', type: 'schweizer' },
      { ...base, id: 't3', name: 'Poule im Dokument', type: 'poule_ab', desktopExecution: true },
      { ...base, id: 't4', name: 'Fremdes Turnier', type: 'maastrichter', registrationEnabled: false },
    ]);

    const badges = screen.getAllByText(NOTICE);
    expect(badges).toHaveLength(1);
    expect(badges[0].closest('.tournament-row')).toHaveTextContent('Ligaspieltag');
  });
});

describe('Erlaubte Kombinationen von Turniersystem, Anmeldetyp und Formation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function openNewForm() {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
      if (path === '/api/postbox/recipients') return jsonResponse({ recipients: [], tournaments: [] });
      return jsonResponse({});
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TournamentManagementPage tournaments={[]} currentUser={{ id: 'u1', firstName: 'Lea', lastName: 'Leitung', role: 'user', mailEnabled: true }}
          language="de" setSelectedTournamentId={() => {}} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Neues Turnier' }));
  }
  const optionValues = (select) => [...select.options].map((option) => option.value);

  it('bietet Rangliste nur bei Supermêlée an und setzt das System beim Wechsel weg von Supermêlée zurück', async () => {
    openNewForm();
    const system = await screen.findByLabelText('Turniersystem');
    expect(optionValues(system)).not.toContain('rangliste');

    fireEvent.change(screen.getByLabelText('Anmeldetyp'), { target: { value: 'supermelee' } });
    expect(screen.getByLabelText('Turniersystem')).toHaveValue('rangliste');

    fireEvent.change(screen.getByLabelText('Anmeldetyp'), { target: { value: 'forme' } });
    expect(screen.getByLabelText('Turniersystem')).toHaveValue('formule_x');
    expect(optionValues(screen.getByLabelText('Turniersystem'))).not.toContain('rangliste');
  });

  it('stellt bei Trip-Tête die Formation auf Triplette und bietet keine andere an', async () => {
    openNewForm();
    fireEvent.change(await screen.findByLabelText('Formation'), { target: { value: 'doublette' } });
    fireEvent.change(screen.getByLabelText('Turniersystem'), { target: { value: 'trip_tete' } });

    expect(screen.getByLabelText('Formation')).toHaveValue('triplette');
    expect(optionValues(screen.getByLabelText('Formation'))).toEqual(['triplette']);
  });
});
