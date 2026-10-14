import { describe, expect, it, afterEach, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentPlayManagement from './TournamentPlayManagement.jsx';

function render(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const TOURNAMENT = {
  id: 't1',
  name: 'Clubabend Supermêlée',
  registrationType: 'supermelee',
  type: 'rangliste',
  formation: 'triplette',
  status: 'running',
};

const ROUND_1 = {
  id: 'r1',
  roundNumber: 1,
  matches: [
    {
      id: 'm1',
      teamA: [{ id: 'p1', firstName: 'Anna', lastName: 'Muster' }, { id: 'p2', firstName: 'Bert', lastName: 'Beispiel' }, { id: 'p3', firstName: 'Clara', lastName: 'Test' }],
      teamB: [{ id: 'p4', firstName: 'Dirk', lastName: 'Demo' }, { id: 'p5', firstName: 'Eva', lastName: 'Muster' }, { id: 'p6', firstName: 'Finn', lastName: 'Test' }],
      scoreA: null,
      scoreB: null,
      noShow: null,
    },
  ],
};

function jsonResponse(payload) {
  return { ok: true, json: () => Promise.resolve(payload) };
}

function errorResponse(error, status = 409) {
  return { ok: false, status, headers: { get: () => null }, json: () => Promise.resolve({ error }) };
}

const CONFIRMED_REGISTRATIONS = [
  { id: 'p1', firstName: 'Anna', lastName: 'Muster' },
  { id: 'p2', firstName: 'Bert', lastName: 'Beispiel' },
  { id: 'p3', firstName: 'Clara', lastName: 'Test' },
  { id: 'p4', firstName: 'Dirk', lastName: 'Demo' },
  { id: 'p5', firstName: 'Eva', lastName: 'Muster' },
  { id: 'p6', firstName: 'Finn', lastName: 'Test' },
].map((registration) => ({ ...registration, status: 'confirmed', participation: 'active' }));

function installFetchMock(calls, { rounds = [ROUND_1], ranking = [], registrations = CONFIRMED_REGISTRATIONS } = {}) {
  global.fetch = vi.fn((path, options = {}) => {
    calls.push(path);
    if (path === '/api/tournaments/t1/rounds' && (!options.method || options.method === 'GET')) {
      return Promise.resolve(jsonResponse({ rounds }));
    }
    if (path === '/api/tournaments/t1/ranking') {
      return Promise.resolve(jsonResponse({ ranking }));
    }
    if (path === '/api/tournaments/t1/registrations' && (!options.method || options.method === 'GET')) {
      return Promise.resolve(jsonResponse({ registrations }));
    }
    if (path === '/api/tournaments/t1/registrations' && options.method === 'POST') {
      return Promise.resolve(jsonResponse({ registration: { firstName: 'Gina', lastName: 'Neu' } }));
    }
    if (path === '/api/tournaments/t1/start' && options.method === 'POST') {
      return Promise.resolve(jsonResponse({ tournament: { id: 't1', status: 'running' } }));
    }
    if (path === '/api/tournaments/t1/rounds' && options.method === 'POST') {
      return Promise.resolve(jsonResponse({
        rounds: [...rounds, { id: 'r2', roundNumber: 2, matches: [] }],
        registration: { firstName: 'Gina', lastName: 'Neu' },
      }));
    }
    if (path === '/api/tournaments/t1/matches/m1/result' && options.method === 'PUT') {
      const updated = { ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 13, scoreB: 7 }] };
      return Promise.resolve(jsonResponse({ rounds: [updated] }));
    }
    if (path === '/api/tournaments/t1/teams/draw' && options.method === 'POST') {
      return Promise.resolve(jsonResponse({ teams: Array.from({ length: 6 }, (_, index) => ({ id: `team-${index}` })) }));
    }
    if (/^\/api\/registrations\/.+\/participation$/.test(path) && options.method === 'PUT') {
      return Promise.resolve(jsonResponse({ registration: {} }));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

describe('TournamentPlayManagement', () => {
  afterEach(() => {
    focusManager.setFocused(undefined);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('zeigt einen Hinweis, wenn kein online durchführbares Turnier vorhanden ist', () => {
    render(<TournamentPlayManagement tournaments={[]} language="de" />);
    expect(screen.getByText('Keine Turniere mit Online-Durchführung verfügbar.')).toBeInTheDocument();
  });

  it('bietet Kalendereinträge nicht zur Online-Durchführung an', () => {
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, registrationEnabled: false }]} language="de" />);
    expect(screen.getByText('Keine Turniere mit Online-Durchführung verfügbar.')).toBeInTheDocument();
    expect(screen.queryByText('Clubabend Supermêlée')).not.toBeInTheDocument();
  });

  it('bietet in der Turnierauswahl auch über Favoriten und Verlauf nur online startbare Turniere an', async () => {
    installFetchMock([]);
    const desktop = { ...TOURNAMENT, id: 't2', name: 'Desktop-Turnier', desktopExecution: true };
    const liga = { ...TOURNAMENT, id: 't3', name: 'Liga ohne Online-Durchführung', registrationType: 'forme', type: 'liga' };
    // Favoriten und Verlauf stammen ggf. von der Meldungsseite und enthalten dort erlaubte, hier aber nicht startbare Turniere.
    localStorage.setItem('ptm_tournament_favorites_user-1', JSON.stringify(['t2', 't3']));
    localStorage.setItem('ptm_tournament_recents_user-1', JSON.stringify(['t3', 't2']));

    render(<TournamentPlayManagement tournaments={[TOURNAMENT, desktop, liga]} currentUserId="user-1" language="de" />);
    fireEvent.focus(screen.getByRole('combobox'));

    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toHaveLength(1);
    expect(options[0]).toContain('Clubabend Supermêlée');
    expect(screen.queryByText('Favoriten')).not.toBeInTheDocument();
    localStorage.clear();
  });

  it('lädt die aktuelle Runde und die Rangliste für das ausgewählte Turnier', async () => {
    const calls = [];
    installFetchMock(calls, { ranking: [{ rank: 1, playerId: 'p1', firstName: 'Anna', lastName: 'Muster', wins: 1, gameDiff: 1, pointsFor: 13, pointsAgainst: 7 }] });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);

    expect(await screen.findByText('Anna Muster + Bert Beispiel + Clara Test')).toBeInTheDocument();
    expect(screen.getByText('Dirk Demo + Eva Muster + Finn Test')).toBeInTheDocument();
    expect((await screen.findAllByText('Anna Muster')).length).toBeGreaterThan(0);

    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/rounds'));
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking'));
  });

  it('klappt die Teilnehmerverwaltung standardmäßig ein', async () => {
    const calls = [];
    installFetchMock(calls);

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');

    expect(screen.getByText('Teilnehmer').closest('details')).not.toHaveAttribute('open');
  });

  it('erstellt über den Button eine neue Runde, sobald alle Ergebnisse der aktuellen Runde feststehen', async () => {
    const calls = [];
    const decidedRound = { ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 13, scoreB: 7 }] };
    installFetchMock(calls, { rounds: [decidedRound] });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');

    fireEvent.click(screen.getByRole('button', { name: 'Nächste Runde starten' }));

    await screen.findByText('Neue Runde wurde erstellt.');
    expect(calls.filter((path) => path === '/api/tournaments/t1/rounds').length).toBeGreaterThan(1);
  });

  it('startet ein angemeldetes Turnier und schaltet danach die Rundenverwaltung frei', async () => {
    const calls = [];
    installFetchMock(calls, { rounds: [] });
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, status: 'registration' }]} language="de" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Turnier starten' }));

    expect(await screen.findByText('Turnier wurde gestartet.')).toBeInTheDocument();
    expect(calls).toContain('/api/tournaments/t1/start');
    expect(screen.getByRole('button', { name: 'Erste Runde starten' })).toBeInTheDocument();
  });

  it('zeigt einen Fehler, wenn der Turnierstart vom Server abgelehnt wird', async () => {
    const calls = [];
    installFetchMock(calls, { rounds: [] });
    global.fetch.mockImplementation((path, options = {}) => {
      calls.push(path);
      if (path === '/api/tournaments/t1/start' && options.method === 'POST') return Promise.resolve(errorResponse('Das Turnier läuft bereits.'));
      if (path === '/api/tournaments/t1/rounds') return Promise.resolve(jsonResponse({ rounds: [] }));
      if (path === '/api/tournaments/t1/ranking') return Promise.resolve(jsonResponse({ ranking: [] }));
      if (path === '/api/tournaments/t1/registrations') return Promise.resolve(jsonResponse({ registrations: CONFIRMED_REGISTRATIONS }));
      return Promise.resolve(jsonResponse({}));
    });
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, status: 'registration' }]} language="de" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Turnier starten' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Das Turnier läuft bereits.');
    expect(screen.getByRole('button', { name: 'Turnier starten' })).toBeInTheDocument();
  });

  it('erstellt die erste Runde für ein bereits laufendes Turnier', async () => {
    const calls = [];
    installFetchMock(calls, { rounds: [] });
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, type: 'formule_x', registrationType: 'forme', formation: 'tete' }]} language="de" />);

    await screen.findByRole('button', { name: 'Erste Runde starten' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Erste Runde starten' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Erste Runde starten' }));

    expect(await screen.findByText('Neue Runde wurde erstellt.')).toBeInTheDocument();
    expect(calls).toContain('/api/tournaments/t1/rounds');
  });

  it('lost vor der ersten Runde die Teams eines Schweizer-Mêlée aus', async () => {
    const calls = [];
    const registrations = Array.from({ length: 12 }, (_, index) => ({ id: `p${index}`, firstName: `Spieler ${index}`, status: 'confirmed', participation: 'active' }));
    installFetchMock(calls, {
      rounds: [], registrations,
    });
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, type: 'schweizer', registrationType: 'melee', formation: 'doublette' }]} language="de" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Mêlée-Teams auslosen' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Mêlée-Teams auslosen' }));

    expect(await screen.findByText('Mêlée-Teams wurden ausgelost: 6')).toBeInTheDocument();
    expect(calls).toContain('/api/tournaments/t1/teams/draw');
  });

  it('zeigt fehlende Voraussetzungen und deaktiviert den Button bei zu wenigen bestätigten Meldungen', async () => {
    const calls = [];
    installFetchMock(calls, {
      rounds: [],
      registrations: [
        { id: 'p1', status: 'confirmed', participation: 'active' },
        { id: 'p2', status: 'pending', participation: 'active' },
      ],
    });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);

    expect(await screen.findByText('Bestätigte Meldungen · Supermêlée · Rangliste · Triplette: 1 (1 aktiv)')).toBeInTheDocument();
    expect(screen.getByText('Es werden mindestens 4 bestätigte Meldungen benötigt.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erste Runde starten' })).toBeDisabled();
  });

  it('schließt inaktive Teilnehmer von der Mindestanzahl-Prüfung aus und erlaubt das Reaktivieren', async () => {
    const calls = [];
    const registrations = [
      { id: 'p1', firstName: 'Anna', lastName: 'Muster', status: 'confirmed', participation: 'active' },
      { id: 'p2', firstName: 'Bert', lastName: 'Beispiel', status: 'confirmed', participation: 'active' },
      { id: 'p3', firstName: 'Clara', lastName: 'Test', status: 'confirmed', participation: 'active' },
      { id: 'p4', firstName: 'Dirk', lastName: 'Demo', status: 'confirmed', participation: 'withdrawn' },
    ];
    installFetchMock(calls, { rounds: [], registrations });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);

    expect(await screen.findByText('Bestätigte Meldungen · Supermêlée · Rangliste · Triplette: 4 (3 aktiv)')).toBeInTheDocument();
    expect(screen.getByText('Es werden mindestens 4 bestätigte Meldungen benötigt.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Teilnehmer'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Teilnahme: Dirk Demo' }), { target: { value: 'active' } });

    await waitFor(() => expect(calls).toContain('/api/registrations/p4/participation'));
    expect(await screen.findByText('Bestätigte Meldungen · Supermêlée · Rangliste · Triplette: 4 (4 aktiv)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erste Runde starten' })).not.toBeDisabled();
  });

  it('speichert ein Ergebnis über die Eingabefelder', async () => {
    const calls = [];
    installFetchMock(calls);

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');

    fireEvent.change(screen.getByLabelText('Punkte Team A'), { target: { value: '13' } });
    fireEvent.change(screen.getByLabelText('Punkte Team B'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ergebnis speichern' }));

    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/matches/m1/result'));
  });

  it.each([true, false])('überschreibt vorhandene Ergebnisse nur nach Bestätigung (%s)', async (confirmed) => {
    const calls = [];
    const existing = { ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 13, scoreB: 5 }] };
    installFetchMock(calls, { rounds: [existing] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(confirmed);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} />);
    await screen.findByLabelText('Punkte Team A');
    fireEvent.change(screen.getByLabelText('Punkte Team B'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ergebnis ändern' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('13:5'));
    if (confirmed) {
      await waitFor(() => expect(calls).toContain('/api/tournaments/t1/matches/m1/result'));
      const [, options] = global.fetch.mock.calls.find(([path]) => path.endsWith('/result'));
      expect(JSON.parse(options.body)).toMatchObject({ scoreA: 13, scoreB: 7, confirmOverwrite: true, expectedResult: { scoreA: 13, scoreB: 5, noShow: null } });
    } else {
      expect(calls.some((path) => path.endsWith('/result'))).toBe(false);
      expect(screen.getByLabelText('Punkte Team B')).toHaveValue('7');
    }
  });

  it.each([true, false])('warnt auch bei einer zwischenzeitlichen Teammeldung (%s)', async (confirmed) => {
    installFetchMock([]);
    const fetchOriginal = global.fetch;
    let writes = 0;
    global.fetch = vi.fn((path, options = {}) => {
      if (path.endsWith('/result') && ++writes === 1) {
        return Promise.resolve({ ...errorResponse('Bitte bestätige das Überschreiben.'), json: async () => ({
          error: 'Bitte bestätige das Überschreiben.',
          details: { code: 'result_confirmation_required', currentResult: { scoreA: 6, scoreB: 13, noShow: null } },
        }) });
      }
      return fetchOriginal(path, options);
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(confirmed);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} />);
    await screen.findByLabelText('Punkte Team A');
    fireEvent.change(screen.getByLabelText('Punkte Team A'), { target: { value: '13' } });
    fireEvent.change(screen.getByLabelText('Punkte Team B'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ergebnis speichern' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining('6:13')));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ergebnis ändern' })).toBeEnabled());
    expect(writes).toBe(confirmed ? 2 : 1);
    if (confirmed) {
      const [, options] = global.fetch.mock.calls.filter(([path]) => path.endsWith('/result'))[1];
      expect(JSON.parse(options.body)).toMatchObject({ scoreA: 13, scoreB: 7, confirmOverwrite: true, expectedResult: { scoreA: 6, scoreB: 13, noShow: null } });
    } else {
      expect(screen.getByLabelText('Punkte Team A')).toHaveValue('6');
      expect(screen.getByLabelText('Punkte Team B')).toHaveValue('13');
    }
  });

  it('übernimmt Spielermeldungen beim Aktualisieren in Ergebnisfelder, Rangliste und Rundenfreigabe', async () => {
    const calls = [];
    installFetchMock(calls);
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, playerResultReportingEnabled: true }]} />);
    await screen.findByLabelText('Punkte Team A');
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking'));
    expect(screen.getByRole('button', { name: 'Nächste Runde starten' })).toBeDisabled();

    installFetchMock(calls, {
      rounds: [{ ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 7, scoreB: 13 }] }],
      ranking: [{ rank: 1, playerId: 'p4', firstName: 'Dirk', lastName: 'Demo', wins: 1, gameDiff: 1, pointsFor: 13, pointsAgainst: 7 }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }));

    await waitFor(() => expect(screen.getByLabelText('Punkte Team A')).toHaveValue('7'));
    await waitFor(() => expect(screen.getByText('Rangliste').closest('details')).toHaveTextContent('Dirk Demo'));
    expect(screen.getByLabelText('Punkte Team B')).toHaveValue('13');
    expect(screen.getByRole('button', { name: 'Ergebnis ändern' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Nächste Runde starten' })).toBeEnabled();
    expect(screen.getByText('Rangliste').closest('details')).toHaveTextContent('Dirk Demo');
    expect(calls.filter((path) => path.endsWith('/ranking'))).toHaveLength(2);
    expect(calls.filter((path) => path.endsWith('/registrations'))).toHaveLength(1);

  });

  it('bewahrt Entwürfe bei unveränderten Ergebnissen und lädt keine Rangliste oder Teilnehmer erneut', async () => {
    const calls = [];
    installFetchMock(calls);
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, playerResultReportingEnabled: true }]} />);
    await screen.findByLabelText('Punkte Team A');
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking'));
    fireEvent.change(screen.getByLabelText('Punkte Team A'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }));
    expect(screen.getByLabelText('Punkte Team A')).toHaveValue('12');
    await waitFor(() => expect(calls.filter((path) => path.endsWith('/rounds'))).toHaveLength(2));
    expect(calls.filter((path) => path.endsWith('/ranking'))).toHaveLength(1);
    expect(calls.filter((path) => path.endsWith('/registrations'))).toHaveLength(1);
  });

  it('überschreibt beim Aktualisieren keine gerade getippten Ergebnisse', async () => {
    const calls = [];
    installFetchMock(calls);
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, playerResultReportingEnabled: true }]} />);
    await screen.findByLabelText('Punkte Team A');
    fireEvent.change(screen.getByLabelText('Punkte Team A'), { target: { value: '12' } });
    installFetchMock(calls, { rounds: [{ ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 7, scoreB: 13 }] }] });
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }));

    await waitFor(() => expect(screen.getByLabelText('Punkte Team B')).toHaveValue('13'));
    expect(screen.getByLabelText('Punkte Team A')).toHaveValue('12');
  });

  it('lädt Spielermeldungen beim Zurückkehren in den Tab', async () => {
    const calls = [];
    installFetchMock(calls);
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, playerResultReportingEnabled: true }]} />);
    await screen.findByLabelText('Punkte Team A');
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking'));
    installFetchMock(calls, { rounds: [{ ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 13, scoreB: 6 }] }] });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 31_000);
    act(() => { focusManager.setFocused(false); });
    act(() => { focusManager.setFocused(true); });
    await waitFor(() => expect(screen.getByLabelText('Punkte Team A')).toHaveValue('13'));
    expect(screen.getByLabelText('Punkte Team B')).toHaveValue('6');
    expect(calls.filter((path) => path.endsWith('/registrations'))).toHaveLength(1);
  });

  it('verursacht auch bei erlaubten Spielermeldungen keine regelmäßigen Lesezugriffe', async () => {
    const calls = [];
    installFetchMock(calls);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const view = render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, playerResultReportingEnabled: true }]} />);
    await screen.findByLabelText('Punkte Team A');
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking'));
    const count = calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(calls).toHaveLength(count);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(calls).toHaveLength(count);
  });

  it('erlaubt in den Ergebnisfeldern nur Ziffern, begrenzt auf maximal 13', async () => {
    const calls = [];
    installFetchMock(calls);

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');

    const inputA = screen.getByLabelText('Punkte Team A');
    fireEvent.change(inputA, { target: { value: 'ab99' } });
    expect(inputA.value).toBe('13');
  });

  it('verhindert das Speichern eines Unentschiedens', async () => {
    const calls = [];
    installFetchMock(calls);

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');

    fireEvent.change(screen.getByLabelText('Punkte Team A'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Punkte Team B'), { target: { value: '7' } });

    expect(screen.getByText('Unentschieden ist nicht möglich')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ergebnis speichern' })).toBeDisabled();
  });

  it('fügt einen Spieler direkt für die nächste Runde hinzu', async () => {
    const calls = [];
    installFetchMock(calls);

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');

    fireEvent.click(screen.getByText('Teilnehmer'));
    const [firstName, lastName] = screen.getAllByRole('textbox');
    fireEvent.change(firstName, { target: { value: 'Gina' } });
    fireEvent.change(lastName, { target: { value: 'Neu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spieler hinzufügen' }));

    await screen.findByText('Spieler hinzugefügt: Gina Neu');
    const addCall = global.fetch.mock.calls.find(([path, options]) => path === '/api/tournaments/t1/registrations' && options.method === 'POST');
    expect(JSON.parse(addCall[1].body)).toMatchObject({ firstName: 'Gina', lastName: 'Neu', noEmail: true, confirmImmediately: true });
  });
});
