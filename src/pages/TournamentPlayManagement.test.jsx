import { describe, expect, it, afterEach, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentPlayManagement from './TournamentPlayManagement.jsx';

// Turnstile für die Namenssuche läuft in jsdom nicht; die Prüfung selbst testet RegistrationPlayerPicker.test.jsx.
vi.mock('../lib/player-search-turnstile.js', () => ({ playerSearchTurnstileToken: vi.fn(() => Promise.resolve('turnstile-token')) }));

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

function installFetchMock(calls, { rounds = [ROUND_1], ranking = [], registrations = CONFIRMED_REGISTRATIONS, teams } = {}) {
  global.fetch = vi.fn((path, options = {}) => {
    calls.push(path);
    if (path === '/api/tournaments/t1/rounds' && (!options.method || options.method === 'GET')) {
      return Promise.resolve(jsonResponse({ rounds, teams }));
    }
    if (path === '/api/tournaments/t1/ranking?live=1') {
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
    if (path === '/api/tournaments/t1/rounds/redraw' && options.method === 'POST') {
      const redrawn = { ...ROUND_1, id: 'r1-neu', matches: [{ ...ROUND_1.matches[0], id: 'm1-neu', teamB: ROUND_1.matches[0].teamB.slice().reverse() }] };
      return Promise.resolve(jsonResponse({ rounds: [...rounds.slice(0, -1), redrawn] }));
    }
    if (path === '/api/tournaments/t1/matches/m1/result' && options.method === 'PUT') {
      const updated = { ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 13, scoreB: 7 }] };
      return Promise.resolve(jsonResponse({ rounds: [updated] }));
    }
    if (path === '/api/tournaments/t1/teams/draw' && options.method === 'POST') {
      const teams = Array.from({ length: 6 }, (_, index) => ({ id: `team-${index}`, members: [`p${index * 2}`, `p${index * 2 + 1}`] }));
      return Promise.resolve(jsonResponse({ teams, drawnCount: 6, unassignedCount: 1 }));
    }
    if (path === '/api/tournaments/t1/teams' && options.method === 'DELETE') {
      return Promise.resolve(jsonResponse({ teams: [] }));
    }
    if (path === '/api/tournaments/t1/participation' && options.method === 'PUT') {
      return Promise.resolve(jsonResponse({ updatedCount: 1 }));
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

  it('zeigt nicht online durchführbare Turniere rot markiert in der Auswahl, Desktop-Turniere gar nicht', async () => {
    installFetchMock([]);
    const desktop = { ...TOURNAMENT, id: 't2', name: 'Desktop-Turnier', desktopExecution: true };
    const liga = { ...TOURNAMENT, id: 't3', name: 'Liga ohne Online-Durchführung', registrationType: 'forme', type: 'liga' };
    // Favoriten und Verlauf stammen ggf. von der Meldungsseite; das Desktop-Turnier darf auch darüber nicht auftauchen.
    localStorage.setItem('ptm_tournament_favorites_user-1', JSON.stringify(['t2']));
    localStorage.setItem('ptm_tournament_recents_user-1', JSON.stringify(['t2']));

    render(<TournamentPlayManagement tournaments={[liga, TOURNAMENT, desktop]} currentUserId="user-1" language="de" />);
    // Vorausgewählt ist das erste durchführbare Turnier, nicht das gesperrte.
    expect(await screen.findByRole('link', { name: 'Anzeige für Bildschirm' })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    fireEvent.focus(screen.getByRole('combobox', { name: 'Turnier' }));

    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('Clubabend Supermêlée'),
      expect.stringContaining('Liga ohne Online-Durchführung'),
    ]);
    expect(options[1]).toHaveClass('is-unavailable');
    expect(options[1]).toHaveTextContent('Nicht online durchführbar');
    expect(options[0]).not.toHaveClass('is-unavailable');
    expect(screen.queryByText('Favoriten')).not.toBeInTheDocument();
    localStorage.clear();
  });

  it('zeigt für ein nicht online durchführbares Turnier einen roten Hinweis mit PTM Desktop statt „Turnier starten“', async () => {
    const calls = [];
    installFetchMock(calls);
    const liga = { ...TOURNAMENT, id: 't3', name: 'Ligaspieltag', registrationType: 'forme', type: 'liga' };

    render(<TournamentPlayManagement tournaments={[liga]} language="de" />);

    const notice = await screen.findByRole('note');
    expect(notice).toHaveClass('notice-danger');
    expect(notice).toHaveTextContent('Ligaspieltag kann nicht online durchgeführt werden.');
    expect(notice).toHaveTextContent('Turniersystem Liga');
    expect(notice).toHaveTextContent('PTM Desktop unterstützt dieses Turniersystem');
    expect(within(notice).getByRole('link', { name: 'PTM Desktop entdecken' })).toHaveAttribute('href', expect.stringContaining('Petanque-Turnier-Manager'));
    expect(screen.queryByRole('button', { name: 'Turnier starten' })).not.toBeInTheDocument();
    expect(screen.queryByText('Anzeige für Bildschirm')).not.toBeInTheDocument();
    expect(calls.some((path) => String(path).includes('/api/tournaments/t3/'))).toBe(false);
  });

  it('verlinkt nur noch die Turnierseite als Anzeige, z. B. für einen zweiten Bildschirm', async () => {
    installFetchMock([]);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    const link = await screen.findByRole('link', { name: 'Anzeige für Bildschirm' });
    expect(link).toHaveAttribute('href', `/turnierseite/${TOURNAMENT.id}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(within(link.closest('.tournament-board-share')).getAllByRole('link')).toHaveLength(1);
  });

  it('zeigt die Ankündigung schon vor dem Turnierstart', async () => {
    installFetchMock([]);
    const { unmount } = render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, status: 'registration' }]} language="de" />);
    expect(await screen.findByRole('button', { name: 'Turnier starten' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Mitteilung an alle Teilnehmer/)).toBeInTheDocument();
    unmount();

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    expect(await screen.findByLabelText(/Mitteilung an alle Teilnehmer/)).toBeInTheDocument();
  });

  it('bietet nach der Auswahl die Turnierseite zum Teilen an, direkt vor der Ankündigung', async () => {
    installFetchMock([]);
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, visibility: 'public', participantsPublic: true }]} language="de" />);

    const open = await screen.findByRole('link', { name: 'Anzeige für Bildschirm' });
    expect(open).toHaveAttribute('href', '/turnierseite/t1');
    const share = within(open.closest('.tournament-board-share')).getByRole('button', { name: /Teilen/ });
    const editor = screen.getByLabelText(/Mitteilung an alle Teilnehmer/).closest('.announcement-editor');
    expect(share.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('teilt bei einem privaten Turnier die Turnierseite mit dem Freigabe-Token', async () => {
    const calls = [];
    installFetchMock(calls);
    const fetchMock = global.fetch;
    global.fetch = vi.fn((path, options = {}) => (path === '/api/tournaments/t1/share-link' && options.method === 'POST'
      ? Promise.resolve(jsonResponse({ shareUrl: 'https://ptm.test/q/festerQrSchluessel1234', shareToken: 'geheim' }))
      : fetchMock(path, options)));
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, visibility: 'private', participantsPublic: true }]} language="de" />);
      fireEvent.click(await within(await screen.findByRole('button', { name: 'Anzeige für Bildschirm' }).then((el) => el.closest('.tournament-board-share'))).findByRole('button', { name: /Teilen/ }));
      await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${window.location.origin}/turnierseite/t1?share=geheim` })));
    } finally {
      delete navigator.share;
    }
  });

  it('öffnet bei einem privaten Turnier die Bildschirm-Anzeige mit dem Freigabe-Token', async () => {
    const calls = [];
    installFetchMock(calls);
    const fetchMock = global.fetch;
    global.fetch = vi.fn((path, options = {}) => (path === '/api/tournaments/t1/share-link' && options.method === 'POST'
      ? Promise.resolve(jsonResponse({ shareUrl: 'https://ptm.test/q/festerQrSchluessel1234', shareToken: 'geheim' }))
      : fetchMock(path, options)));
    const displayWindow = { opener: 'app', location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(displayWindow);

    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, visibility: 'private', participantsPublic: true }]} language="de" />);
    expect(await screen.findByText(/Wer den Link hat, sieht Spielplan und Rangliste/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Anzeige für Bildschirm' }));

    await waitFor(() => expect(displayWindow.location.href).toBe(`${window.location.origin}/turnierseite/t1?share=geheim`));
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(displayWindow.opener).toBeNull();
  });

  it('weist darauf hin, wenn die Teilnehmerliste nicht veröffentlicht ist', async () => {
    installFetchMock([]);
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, participantsPublic: false }]} language="de" />);

    expect(await screen.findByText(/wenn die Teilnehmerliste veröffentlicht wird/)).toBeInTheDocument();
    expect(within(document.querySelector('.tournament-board-share')).queryByRole('button', { name: /Teilen/ })).not.toBeInTheDocument();
  });

  it('bietet „Turnier abschließen“ direkt nach „Nächste Runde starten“ an, auch bei offenen Ergebnissen', async () => {
    const calls = [];
    installFetchMock(calls);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, visibility: 'public' }]} language="de" />);

    await screen.findByRole('button', { name: 'Turnier abschließen' });
    // RoundAction wird bei jedem Rendern neu eingehängt: erst nach dem Laden aller Daten frisch abfragen.
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/registrations'));
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking?live=1'));
    const finish = screen.getByRole('button', { name: 'Turnier abschließen' });
    const next = screen.getByRole('button', { name: 'Nächste Runde starten' });
    expect(next).toBeDisabled();
    expect(finish).toBeEnabled();
    expect(next.compareDocumentPosition(finish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(finish);

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('In der aktuellen Runde fehlen noch Ergebnisse'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/tournaments/t1/publication', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ status: 'finished', visibility: 'public' }),
    })));
    expect(await screen.findByText(/Turnier abgeschlossen\./)).toBeInTheDocument();
  });

  it('schließt ohne Bestätigung nicht ab', async () => {
    const calls = [];
    installFetchMock(calls);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);

    await screen.findByRole('button', { name: 'Turnier abschließen' });
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking?live=1'));
    fireEvent.click(screen.getByRole('button', { name: 'Turnier abschließen' }));

    expect(confirm).toHaveBeenCalled();

    expect(global.fetch).not.toHaveBeenCalledWith('/api/tournaments/t1/publication', expect.anything());
  });

  it('lädt die aktuelle Runde und die Rangliste für das ausgewählte Turnier', async () => {
    const calls = [];
    installFetchMock(calls, { ranking: [{ rank: 1, playerId: 'p1', firstName: 'Anna', lastName: 'Muster', wins: 1, gameDiff: 1, pointsFor: 13, pointsAgainst: 7 }] });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);

    expect(await screen.findByText('Anna Muster + Bert Beispiel + Clara Test')).toBeInTheDocument();
    expect(screen.getByText('Dirk Demo + Eva Muster + Finn Test')).toBeInTheDocument();
    expect((await screen.findAllByText('Anna Muster')).length).toBeGreaterThan(0);

    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/rounds'));
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking?live=1'));
  });

  it('zeigt nach einem Turnierwechsel genau ein Teilnehmer-Panel (Teilnehmer und Rangliste mit eigenem Key)', async () => {
    const ranking = [{ rank: 1, playerId: 'p1', firstName: 'Anna', lastName: 'Muster', wins: 1, gameDiff: 1, pointsFor: 13, pointsAgainst: 7 }];
    global.fetch = vi.fn((path) => {
      if (path.endsWith('/rounds')) return Promise.resolve(jsonResponse({ rounds: [ROUND_1] }));
      if (path.endsWith('/ranking?live=1')) return Promise.resolve(jsonResponse({ ranking }));
      if (path.endsWith('/registrations')) return Promise.resolve(jsonResponse({ registrations: CONFIRMED_REGISTRATIONS }));
      return Promise.resolve(jsonResponse({}));
    });
    const tournaments = [TOURNAMENT, { ...TOURNAMENT, id: 't2', name: 'Zweites Turnier' }];
    const panels = () => document.querySelectorAll('details.round-participants:not(.melee-teams)');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const page = (tournamentId) => <QueryClientProvider client={client}><TournamentPlayManagement tournaments={tournaments} focus={{ tournamentId }} language="de" /></QueryClientProvider>;
    const { rerender } = rtlRender(page('t1'));
    await waitFor(() => expect(screen.getAllByText('Rangliste').length).toBeGreaterThan(0));

    rerender(page('t2'));
    await waitFor(() => expect(global.fetch.mock.calls.map(([path]) => path)).toContain('/api/tournaments/t2/ranking?live=1'));
    await waitFor(() => expect(screen.getAllByText('Rangliste').length).toBeGreaterThan(0));
    expect(panels()).toHaveLength(1);
  });

  it('klappt die Teilnehmerverwaltung standardmäßig ein', async () => {
    const calls = [];
    installFetchMock(calls);

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');

    expect(screen.getByText('Teilnehmer').closest('details')).not.toHaveAttribute('open');
  });

  it('zeigt das Kontosymbol nur bei verknüpften Teilnehmern, auch wenn sie inaktiv sind', async () => {
    const calls = [];
    installFetchMock(calls, { rounds: [], registrations: [
      { ...CONFIRMED_REGISTRATIONS[0], accountConnected: true },
      { ...CONFIRMED_REGISTRATIONS[1], accountConnected: true, participation: 'inactive' },
      { ...CONFIRMED_REGISTRATIONS[2], accountConnected: false },
      CONFIRMED_REGISTRATIONS[3],
    ] });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster');
    fireEvent.click(screen.getByText('Teilnehmer'));

    for (const name of ['Anna Muster', 'Bert Beispiel']) {
      const row = screen.getByRole('button', { name: `Aktiv: ${name}` }).closest('.round-participant-row');
      expect(within(row).getByLabelText('Mit Benutzerkonto verbunden')).toHaveTextContent('👤');
    }
    for (const name of ['Clara Test', 'Dirk Demo']) {
      const row = screen.getByRole('button', { name: `Aktiv: ${name}` }).closest('.round-participant-row');
      expect(within(row).queryByLabelText('Mit Benutzerkonto verbunden')).not.toBeInTheDocument();
    }
    expect(calls.filter((path) => path === '/api/tournaments/t1/registrations')).toHaveLength(1);
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

  it('lost die aktuelle Runde nach Rückfrage neu aus, solange kein Ergebnis eingetragen ist', async () => {
    const calls = [];
    installFetchMock(calls);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);

    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');
    fireEvent.click(screen.getByRole('button', { name: 'Aktuelle Runde neu auslosen' }));

    expect(await screen.findByText('Runde 1 wurde neu ausgelost.')).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith('Runde 1 neu auslosen? Die bisherige Einteilung wird ersetzt.');
    expect(calls).toContain('/api/tournaments/t1/rounds/redraw');
    expect(await screen.findByText('Finn Test + Eva Muster + Dirk Demo')).toBeInTheDocument();
  });

  it('meldet, wenn der Server die erste Mêlée-Runde wegen geänderter Teams zurücknimmt', async () => {
    const calls = [];
    installFetchMock(calls);
    const baseFetch = global.fetch;
    global.fetch = vi.fn((path, options = {}) => (path === '/api/tournaments/t1/rounds/redraw'
      ? Promise.resolve(jsonResponse({ rounds: [], teams: [], roundWithdrawn: true }))
      : baseFetch(path, options)));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');

    fireEvent.click(screen.getByRole('button', { name: 'Aktuelle Runde neu auslosen' }));

    expect(await screen.findByText('Runde 1 wurde zurückgenommen, weil die Mêlée-Teams nicht mehr zu den aktiven Spielern passen. Bitte Teams auslosen und Runde 1 neu starten.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erste Runde starten' })).toBeInTheDocument();
  });

  it('bietet Neu auslosen nicht an, wenn schon ein Ergebnis eingetragen ist, und nichts ohne Bestätigung', async () => {
    const calls = [];
    installFetchMock(calls, { rounds: [{ ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 13, scoreB: 4 }] }] });
    const { unmount } = render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');
    expect(screen.queryByRole('button', { name: 'Aktuelle Runde neu auslosen' })).not.toBeInTheDocument();
    unmount();

    installFetchMock(calls);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');
    fireEvent.click(screen.getByRole('button', { name: 'Aktuelle Runde neu auslosen' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(calls).not.toContain('/api/tournaments/t1/rounds/redraw');
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

  it('lädt nach dem Start die Meldungen neu, weil der Server alle inaktiven eincheckt', async () => {
    const calls = [];
    const inactive = CONFIRMED_REGISTRATIONS.map((registration) => ({ ...registration, participation: 'inactive' }));
    installFetchMock(calls, { rounds: [], registrations: inactive });
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, status: 'registration' }]} language="de" />);

    installFetchMock(calls, { rounds: [] });
    fireEvent.click(await screen.findByRole('button', { name: 'Turnier starten' }));

    expect(await screen.findByText('Turnier wurde gestartet.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Teilnehmer'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aktiv: Anna Muster' })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('zeigt einen Fehler, wenn der Turnierstart vom Server abgelehnt wird', async () => {
    const calls = [];
    installFetchMock(calls, { rounds: [] });
    global.fetch.mockImplementation((path, options = {}) => {
      calls.push(path);
      if (path === '/api/tournaments/t1/start' && options.method === 'POST') return Promise.resolve(errorResponse('Das Turnier läuft bereits.'));
      if (path === '/api/tournaments/t1/rounds') return Promise.resolve(jsonResponse({ rounds: [] }));
      if (path === '/api/tournaments/t1/ranking?live=1') return Promise.resolve(jsonResponse({ ranking: [] }));
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

  it.each([['schweizer'], ['formule_x'], ['jeder_gegen_jeden'], ['ko']])('lost vor der ersten Runde die Mêlée-Teams aus (%s)', async (type) => {
    const calls = [];
    const registrations = Array.from({ length: 13 }, (_, index) => ({ id: `p${index}`, firstName: `Spieler ${index}`, status: 'confirmed', participation: 'active' }));
    installFetchMock(calls, {
      rounds: [], registrations,
    });
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, type, registrationType: 'melee', formation: 'doublette' }]} language="de" />);

    expect(await screen.findByText('Bitte zuerst Mêlée-Teams auslosen')).toBeInTheDocument();
    expect(screen.getByText('Neue Spieler spielen erst mit, wenn sie per „Mêlée-Teams auslosen“ einem Team zugeteilt sind.')).toBeInTheDocument();
    expect(screen.queryByText('Neue Spieler sind sofort für die nächste Runde aktiv.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erste Runde starten' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mêlée-Teams auslosen' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Mêlée-Teams auslosen' }));

    expect(await screen.findByText('6 Mêlée-Teams ausgelost, insgesamt 6 Teams. 1 aktive Spieler ohne Team.')).toBeInTheDocument();
    expect(calls).toContain('/api/tournaments/t1/teams/draw');
    expect(screen.getByText('Ausgeloste Mêlée-Teams')).toBeInTheDocument();
    expect(screen.getByText('Spieler 0 + Spieler 1')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Erste Runde starten' })).not.toBeDisabled());
    expect(screen.getByRole('button', { name: 'Mêlée-Teams auslosen' })).toBeDisabled();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Auslosung zurücksetzen' }));
    expect(await screen.findByText('Mêlée-Teams wurden aufgelöst.')).toBeInTheDocument();
    expect(screen.queryByText('Ausgeloste Mêlée-Teams')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erste Runde starten' })).toBeDisabled();
  });

  it('weist bei Mêlée nach der ersten Runde darauf hin, dass neue Spieler nicht mehr mitspielen', async () => {
    installFetchMock([]);
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, type: 'schweizer', registrationType: 'melee', formation: 'doublette' }]} language="de" />);

    expect(await screen.findByText('Die Mêlée-Teams stehen seit der ersten Runde fest. Neue Spieler werden keinem Team mehr zugeteilt und spielen nicht mit.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mêlée-Teams auslosen' })).not.toBeInTheDocument();
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
    expect(screen.getByText('Die Runde kann noch nicht gestartet werden:')).toBeInTheDocument();
    expect(screen.getByText('Es werden mindestens 4 aktive Meldungen benötigt, aktiv sind 1.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erste Runde starten' })).toBeDisabled();
  });

  it('nennt die Zahl der offenen Ergebnisse, solange die aktuelle Runde nicht abgeschlossen ist', async () => {
    const calls = [];
    installFetchMock(calls);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);

    // RoundAction wird bei jedem Rendern neu eingehängt: gegen den aktuellen DOM prüfen, nicht gegen ein gefundenes Element.
    await waitFor(() => expect(screen.getByText('Bitte zuerst alle Ergebnisse der aktuellen Runde eintragen (1 offen).')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Nächste Runde starten' })).toBeDisabled();
  });

  it('nennt bei 7 aktiven Supermêlée-Spielern den Grund und weist auf inaktive Meldungen hin', async () => {
    const calls = [];
    const registrations = Array.from({ length: 9 }, (_, index) => ({
      id: `p${index}`, firstName: `Spieler ${index}`, status: 'confirmed', participation: index < 7 ? 'active' : 'inactive',
    }));
    installFetchMock(calls, { rounds: [], registrations });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);

    await waitFor(() => expect(screen.getByText(/^Mit 7 aktiven Spielern ist keine Supermêlée-Runde möglich/)).toBeInTheDocument());
    expect(screen.getByText('2 bestätigte Meldungen sind inaktiv und zählen nicht mit – unter „Teilnehmer“ aktivieren.')).toBeInTheDocument();
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
    expect(screen.getByText('Es werden mindestens 4 aktive Meldungen benötigt, aktiv sind 3.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Teilnehmer'));
    // Ausgesetzt → ein Tipp auf den Schalter macht die Meldung wieder aktiv.
    fireEvent.click(screen.getByRole('button', { name: 'Aktiv: Dirk Demo' }));

    await waitFor(() => expect(calls).toContain('/api/registrations/p4/participation'));
    expect(await screen.findByText('Bestätigte Meldungen · Supermêlée · Rangliste · Triplette: 4 (4 aktiv)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erste Runde starten' })).not.toBeDisabled();
  });

  it('deaktiviert und aktiviert alle bestätigten Teilnehmer, ausgesetzte bleiben ausgesetzt', async () => {
    const calls = [];
    const registrations = [
      { id: 'p1', firstName: 'Anna', lastName: 'Muster', status: 'confirmed', participation: 'active' },
      { id: 'p2', firstName: 'Bert', lastName: 'Beispiel', status: 'confirmed', participation: 'inactive' },
      { id: 'p3', firstName: 'Clara', lastName: 'Test', status: 'confirmed', participation: 'withdrawn' },
    ];
    installFetchMock(calls, { rounds: [], registrations });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    expect(await screen.findByText('Bestätigte Meldungen · Supermêlée · Rangliste · Triplette: 3 (1 aktiv)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Teilnehmer'));

    fireEvent.click(screen.getByRole('button', { name: 'Alle deaktivieren' }));
    expect(await screen.findByText('Bestätigte Meldungen · Supermêlée · Rangliste · Triplette: 3 (0 aktiv)')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/tournaments/t1/participation', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ participation: 'inactive' }) }));
    expect(screen.getByRole('button', { name: 'Alle deaktivieren' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Alle aktivieren' }));
    expect(await screen.findByText('Bestätigte Meldungen · Supermêlée · Rangliste · Triplette: 3 (2 aktiv)')).toBeInTheDocument();
    const clara = screen.getByRole('button', { name: 'Aktiv: Clara Test' });
    expect(clara).toHaveAttribute('aria-pressed', 'false');
    expect(within(clara.closest('.round-participant-row')).getByText('Ausgesetzt')).toBeInTheDocument();
  });

  it('schaltet einen Teilnehmer per Symbol-Button aktiv/inaktiv', async () => {
    const calls = [];
    installFetchMock(calls, { rounds: [] });
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster');
    fireEvent.click(screen.getByText('Teilnehmer'));

    const toggle = screen.getByRole('button', { name: 'Aktiv: Anna Muster' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).not.toHaveTextContent('Aktiv');
    fireEvent.click(toggle);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/registrations/p1/participation', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ participation: 'inactive' }) })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aktiv: Anna Muster' })).toHaveAttribute('aria-pressed', 'false'));
  });

  it('bietet den QR-Code zur Live-Ansicht nur bei freigeschalteter Live-Ansicht an', async () => {
    const calls = [];
    installFetchMock(calls, { rounds: [] });
    const { unmount } = render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster');
    fireEvent.click(screen.getByText('Teilnehmer'));
    expect(screen.queryByRole('button', { name: 'QR-Code Live-Ansicht: Anna Muster' })).not.toBeInTheDocument();
    unmount();

    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, liveViewEnabled: true }]} language="de" />);
    await screen.findByText('Anna Muster');
    fireEvent.click(screen.getByText('Teilnehmer'));
    fireEvent.click(screen.getByRole('button', { name: 'QR-Code Live-Ansicht: Anna Muster' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('QR-Code Live-Ansicht');
    await waitFor(() => expect(calls).toContain('/api/registrations/p1/live-link/qr'));
  });

  it('bearbeitet eine Meldung im Anmeldeformular und setzt dort „Ausgesetzt“', async () => {
    const calls = [];
    // Wie vom Server (toPublicRegistration): mit Turnier-ID, damit das Formular die Felder des Turniers zeigt.
    const registrations = CONFIRMED_REGISTRATIONS.map((registration) => ({ ...registration, tournamentId: 't1', playerEmail: `${registration.id}@example.test` }));
    installFetchMock(calls, { rounds: [], registrations });
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster');
    fireEvent.click(screen.getByText('Teilnehmer'));
    fireEvent.click(screen.getByRole('button', { name: 'Anna Muster bearbeiten' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Anmeldung bearbeiten')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Muster')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Teilnahme' }), { target: { value: 'withdrawn' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/registrations/p1/participation', expect.objectContaining({ body: JSON.stringify({ participation: 'withdrawn' }) })));

    fireEvent.change(within(dialog).getByDisplayValue('Muster'), { target: { value: 'Mustermann' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anmeldung speichern' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/registrations/p1', expect.objectContaining({ method: 'PUT' })));
    const [, options] = global.fetch.mock.calls.find(([path, init]) => path === '/api/registrations/p1' && init?.method === 'PUT');
    expect(JSON.parse(options.body)).toMatchObject({ firstName: 'Anna', lastName: 'Mustermann' });
    expect(await screen.findByText('Anmeldung wurde aktualisiert.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

  function installBulkMock(rounds, onBatch = null) {
    const calls = [];
    installFetchMock(calls, { rounds });
    const original = global.fetch;
    global.fetch = vi.fn((path, options = {}) => {
      if (path.endsWith('/results') && options.method === 'PUT') {
        const results = JSON.parse(options.body).results;
        if (onBatch) return Promise.resolve(jsonResponse(onBatch(results)));
        rounds = rounds.map((round) => ({ ...round, matches: round.matches.map((match) => {
          const result = results.find((entry) => entry.matchId === match.id);
          return result ? { ...match, scoreA: result.scoreA, scoreB: result.scoreB } : match;
        }) }));
        return Promise.resolve(jsonResponse({ rounds, savedMatchIds: results.map((entry) => entry.matchId), conflicts: [] }));
      }
      return original(path, options);
    });
    return calls;
  }

  it('speichert nur geänderte Ergebnisse gemeinsam und lädt die Rangliste genau einmal neu', async () => {
    const matches = [ROUND_1.matches[0], { ...ROUND_1.matches[0], id: 'm2', scoreA: 13, scoreB: 5 }, { ...ROUND_1.matches[0], id: 'm3' }];
    const calls = installBulkMock([{ ...ROUND_1, matches }]);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} />);
    await screen.findByRole('button', { name: 'Alle speichern' });
    await waitFor(() => expect(calls.filter((path) => path.endsWith('/ranking?live=1'))).toHaveLength(1));
    fireEvent.change(screen.getAllByLabelText('Punkte Team A')[0], { target: { value: '13' } });
    fireEvent.change(screen.getAllByLabelText('Punkte Team B')[0], { target: { value: '7' } });
    // m2 hat schon ein Ergebnis und steht im zugeklappten Bereich „Erfasste Ergebnisse“ unter den offenen Partien.
    fireEvent.change(screen.getAllByLabelText('Punkte Team A')[1], { target: { value: '6' } });
    fireEvent.change(screen.getAllByLabelText('Punkte Team B')[1], { target: { value: '13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Alle speichern' }));
    await screen.findByText(/Gespeicherte Ergebnisse:/);
    await waitFor(() => expect(calls.filter((path) => path.endsWith('/ranking?live=1'))).toHaveLength(2));
    const writes = global.fetch.mock.calls.filter(([path]) => path.endsWith('/results'));
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1].body).results.map((entry) => entry.matchId)).toEqual(['m1', 'm3']);
    expect(calls.filter((path) => path.endsWith('/rounds'))).toHaveLength(1);
    expect(calls.filter((path) => path.endsWith('/registrations'))).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Alle speichern' })).toBeDisabled();
  });

  it('klappt in der laufenden Runde Partien mit gespeichertem Ergebnis weg', async () => {
    const matches = [ROUND_1.matches[0], { ...ROUND_1.matches[0], id: 'm2', scoreA: 13, scoreB: 5 }, { ...ROUND_1.matches[0], id: 'm3' }];
    installBulkMock([{ ...ROUND_1, matches }]);
    const { container } = render(<TournamentPlayManagement tournaments={[TOURNAMENT]} />);
    const summary = await screen.findByText('Erfasste Ergebnisse');
    const decided = summary.closest('details');
    expect(decided).not.toHaveAttribute('open');
    expect(within(decided).getAllByLabelText('Punkte Team A').map((input) => input.value)).toEqual(['13']);
    expect(within(decided).getByRole('button', { name: 'Ergebnis ändern', hidden: true })).toBeInTheDocument();
    const open = container.querySelector('.play-current-round > .play-match-list');
    expect(within(open).getAllByLabelText('Punkte Team A')).toHaveLength(2);
  });

  it('begrenzt große Runden auf Sammelanfragen und erhält nach Teilfehlern nur die ungespeicherten Eingaben', async () => {
    let rounds = [{ ...ROUND_1, matches: Array.from({ length: 26 }, (_, index) => ({ ...ROUND_1.matches[0], id: `m${index}` })) }];
    const calls = installBulkMock(rounds, (results) => {
      rounds = rounds.map((round) => ({ ...round, matches: round.matches.map((match) => {
        const saved = results.find((result) => result.matchId === match.id);
        return saved ? { ...match, scoreA: saved.scoreA, scoreB: saved.scoreB } : match;
      }) }));
      return { rounds, savedMatchIds: results.map((entry) => entry.matchId), conflicts: [] };
    });
    const original = global.fetch;
    let attempts = 0;
    global.fetch = vi.fn((path, options = {}) => path.endsWith('/results') && ++attempts === 2
      ? Promise.resolve(errorResponse('Speichern fehlgeschlagen', 500)) : original(path, options));
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} />);
    await screen.findByRole('button', { name: 'Alle speichern' });
    await waitFor(() => expect(calls.filter((path) => path.endsWith('/ranking?live=1'))).toHaveLength(1));
    screen.getAllByLabelText('Punkte Team A').forEach((input) => fireEvent.change(input, { target: { value: '13' } }));
    screen.getAllByLabelText('Punkte Team B').forEach((input) => fireEvent.change(input, { target: { value: '7' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Alle speichern' }));
    await screen.findByText(/Speichern fehlgeschlagen/);
    expect(screen.getByRole('alert')).toHaveTextContent('Gespeicherte Ergebnisse: 25.');
    expect(screen.getByRole('button', { name: 'Alle speichern' })).toBeEnabled();
    expect(screen.getAllByLabelText('Punkte Team B')[25]).toHaveValue('7');
    await waitFor(() => expect(calls.filter((path) => path.endsWith('/ranking?live=1'))).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Alle speichern' }));
    await screen.findByText('Gespeicherte Ergebnisse: 1.');
    const writes = global.fetch.mock.calls.filter(([path]) => path.endsWith('/results'));
    expect(writes.map(([, options]) => JSON.parse(options.body).results.length)).toEqual([25, 1, 1]);
    expect(JSON.parse(writes[2][1].body).results[0].matchId).toBe('m25');
    expect(calls.filter((path) => path.endsWith('/registrations'))).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Alle speichern' })).toBeDisabled();
  });

  it('holt über die Aktion direkt an der Runde gemeldete Ergebnisse ohne zusätzliche Teilnehmerabfrage ab', async () => {
    const calls = [];
    installFetchMock(calls);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} />);
    const group = await screen.findByRole('group', { name: 'Rundenaktionen' });
    installFetchMock(calls, { rounds: [{ ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 7, scoreB: 13 }] }] });
    fireEvent.click(within(group).getByRole('button', { name: 'Aktualisieren' }));
    await waitFor(() => expect(screen.getByLabelText('Punkte Team A')).toHaveValue('7'));
    expect(screen.getByLabelText('Punkte Team B')).toHaveValue('13');
    expect(calls.filter((path) => path.endsWith('/rounds'))).toHaveLength(2);
    expect(calls.filter((path) => path.endsWith('/registrations'))).toHaveLength(1);
  });

  it('verhindert gemeinsames Speichern bei unvollständigen Eingaben oder Unentschieden', async () => {
    installBulkMock([ROUND_1]);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} />);
    const button = await screen.findByRole('button', { name: 'Alle speichern' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Punkte Team A'), { target: { value: '7' } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Punkte Team B'), { target: { value: '7' } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Punkte Team B'), { target: { value: '13' } });
    expect(button).toBeEnabled();
  });

  it.each([true, false])('bestätigt vorhandene Ergebnisse auch beim gemeinsamen Speichern (%s)', async (confirmed) => {
    installBulkMock([{ ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 13, scoreB: 5 }] }]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(confirmed);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} />);
    await screen.findByLabelText('Punkte Team B');
    fireEvent.change(screen.getByLabelText('Punkte Team B'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Alle speichern' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('13:5'));
    if (confirmed) await screen.findByText(/Gespeicherte Ergebnisse:/);
    const writes = global.fetch.mock.calls.filter(([path]) => path.endsWith('/results'));
    expect(writes).toHaveLength(confirmed ? 1 : 0);
    if (confirmed) expect(JSON.parse(writes[0][1].body).results[0]).toMatchObject({ confirmOverwrite: true, expectedResult: { scoreA: 13, scoreB: 5, noShow: null } });
  });

  it.each([true, false])('warnt beim gemeinsamen Speichern vor zwischenzeitlichen Spielermeldungen (%s)', async (confirmed) => {
    let attempts = 0;
    const existing = { ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 6, scoreB: 13 }] };
    installBulkMock([ROUND_1], (results) => ++attempts === 1
      ? { rounds: [existing], savedMatchIds: [], conflicts: [{ matchId: 'm1', currentResult: { scoreA: 6, scoreB: 13, noShow: null } }] }
      : { rounds: [{ ...ROUND_1, matches: [{ ...ROUND_1.matches[0], ...results[0] }] }], savedMatchIds: ['m1'], conflicts: [] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(confirmed);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} />);
    await screen.findByLabelText('Punkte Team A');
    fireEvent.change(screen.getByLabelText('Punkte Team A'), { target: { value: '13' } });
    fireEvent.change(screen.getByLabelText('Punkte Team B'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Alle speichern' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining('6:13')));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Alle speichern' })).toBeDisabled());
    expect(attempts).toBe(confirmed ? 2 : 1);
    if (!confirmed) expect(screen.getByLabelText('Punkte Team A')).toHaveValue('6');
  });

  it('bietet Aktionen bei jeder Runde an und speichert nur die ausgewählte Runde', async () => {
    const past = { ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 13, scoreB: 5 }] };
    const latest = { ...ROUND_1, id: 'r2', roundNumber: 2, matches: [{ ...ROUND_1.matches[0], id: 'm2' }] };
    installBulkMock([past, latest]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} />);
    await screen.findByText('Runde 2');
    fireEvent.click(screen.getByText('Runde 1'));
    const old = screen.getByText('Runde 1').closest('details');
    fireEvent.change(within(old).getByLabelText('Punkte Team B'), { target: { value: '7' } });
    fireEvent.click(within(old).getByRole('button', { name: 'Alle speichern' }));
    await screen.findByText(/Gespeicherte Ergebnisse:/);
    expect(global.fetch.mock.calls.find(([path]) => path.endsWith('/results'))[0]).toBe('/api/tournaments/t1/rounds/r1/results');
    expect(screen.getAllByRole('group', { name: 'Rundenaktionen' })).toHaveLength(2);
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
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking?live=1'));
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
    expect(calls.filter((path) => path.endsWith('/ranking?live=1'))).toHaveLength(2);
    expect(calls.filter((path) => path.endsWith('/registrations'))).toHaveLength(1);

  });

  it('bewahrt Entwürfe bei unveränderten Ergebnissen und lädt keine Rangliste oder Teilnehmer erneut', async () => {
    const calls = [];
    installFetchMock(calls);
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, playerResultReportingEnabled: true }]} />);
    await screen.findByLabelText('Punkte Team A');
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking?live=1'));
    fireEvent.change(screen.getByLabelText('Punkte Team A'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }));
    expect(screen.getByLabelText('Punkte Team A')).toHaveValue('12');
    await waitFor(() => expect(calls.filter((path) => path.endsWith('/rounds'))).toHaveLength(2));
    expect(calls.filter((path) => path.endsWith('/ranking?live=1'))).toHaveLength(1);
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

  it('kennzeichnet Teammeldungen und hebt neu eingegangene Meldungen hervor', async () => {
    const calls = [];
    const reporter = { id: 'p4', firstName: 'Dirk', lastName: 'Demo' };
    const second = { ...ROUND_1.matches[0], id: 'm2', scoreA: 13, scoreB: 2, reportedBy: { id: 'p1', firstName: 'Anna', lastName: 'Muster' } };
    installFetchMock(calls, { rounds: [{ ...ROUND_1, matches: [ROUND_1.matches[0], second] }] });
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, playerResultReportingEnabled: true }]} />);

    expect(await screen.findByText('Anna Muster', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByText('Neu')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    installFetchMock(calls, { rounds: [{ ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 7, scoreB: 13, reportedBy: reporter }, second] }] });
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }));

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('Neue Ergebnismeldungen von Teams: 1');
    expect(screen.getByText('Neu').closest('article')).toHaveClass('is-new-report', 'is-player-reported');
    expect(screen.getByText('Neu').closest('article')).toHaveTextContent('Ergebnis gemeldet von Dirk Demo');

    fireEvent.click(screen.getByRole('button', { name: 'Gesehen' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Neu')).not.toBeInTheDocument();
    expect(screen.getByText('Dirk Demo', { selector: 'strong' }).closest('article')).toHaveClass('is-player-reported');
  });

  function installServiceWorkerMessages() {
    const target = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', { value: target, configurable: true });
    return {
      send: (data) => act(() => { target.dispatchEvent(new MessageEvent('message', { data })); }),
      remove: () => { delete navigator.serviceWorker; },
    };
  }

  it('lädt die Runden nach einem Push „Ergebnis gemeldet“ einmal nach, ohne zu pollen', async () => {
    const serviceWorker = installServiceWorkerMessages();
    let view;
    try {
      const calls = [];
      installFetchMock(calls);
      view = render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, playerResultReportingEnabled: true }]} />);
      await screen.findByLabelText('Punkte Team A');
      const roundLoads = () => calls.filter((path) => path === '/api/tournaments/t1/rounds').length;
      expect(roundLoads()).toBe(1);

      installFetchMock(calls, { rounds: [{ ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 7, scoreB: 13, reportedBy: { id: 'p4', firstName: 'Dirk', lastName: 'Demo' } }] }] });
      serviceWorker.send({ type: 'tournament-result-reported', tournamentId: 'anderes-turnier' });
      serviceWorker.send({ type: 'tournament-result-reported', tournamentId: 't1' });

      expect(await screen.findByText('Neu')).toBeInTheDocument();
      expect(roundLoads()).toBe(2);
    } finally {
      view?.unmount();
      serviceWorker.remove();
    }
  });

  it('wählt das Turnier aus einer Push-Benachrichtigung aus', async () => {
    const calls = [];
    installFetchMock(calls);
    const second = { ...TOURNAMENT, id: 't2', name: 'Zweites Turnier' };
    render(<TournamentPlayManagement tournaments={[TOURNAMENT, second]} focus={{ tournamentId: 't2' }} />);

    await waitFor(() => expect(calls).toContain('/api/tournaments/t2/rounds'));
  });

  it('lädt Spielermeldungen beim Zurückkehren in den Tab', async () => {
    const calls = [];
    installFetchMock(calls);
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, playerResultReportingEnabled: true }]} />);
    await screen.findByLabelText('Punkte Team A');
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking?live=1'));
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
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking?live=1'));
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
    fireEvent.change(screen.getByRole('textbox', { name: /Vorname/ }), { target: { value: 'Gina' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Nachname/ }), { target: { value: 'Neu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spieler hinzufügen' }));

    await screen.findByText('Spieler hinzugefügt: Gina Neu');
    const addCall = global.fetch.mock.calls.find(([path, options]) => path === '/api/tournaments/t1/registrations' && options.method === 'POST');
    expect(JSON.parse(addCall[1].body)).toMatchObject({ firstName: 'Gina', lastName: 'Neu', noEmail: true, confirmImmediately: true });
    expect(JSON.parse(addCall[1].body)).not.toHaveProperty('partnerFirstName');
  });

  it('übernimmt beim Hinzufügen einen Spieler aus der Namenssuche mit seinem Konto', async () => {
    installFetchMock([]);
    const fetchMock = global.fetch;
    global.fetch = vi.fn((path, options = {}) => {
      if (path === '/api/postbox/recipients') return Promise.resolve(jsonResponse({ recipients: [{ id: 'u9', firstName: 'Gina', lastName: 'Neu', username: 'gina', role: 'user' }] }));
      if (path === '/api/tournaments/t1/registration-players/details') {
        return Promise.resolve(jsonResponse({ player: { id: 'u9', firstName: 'Gina', lastName: 'Neu', email: 'gina@example.test', licenseNr: null, proof: 'beweis' } }));
      }
      return fetchMock(path, options);
    });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} currentUserId="me" turnstileSiteKey="site-key" language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');
    fireEvent.click(screen.getByText('Teilnehmer'));
    const firstName = screen.getByRole('combobox', { name: /Vorname/ });
    fireEvent.focus(firstName);
    fireEvent.change(firstName, { target: { value: 'Gin' } });
    fireEvent.click(await screen.findByRole('option', { name: /Gina Neu/ }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Nachname/ })).toHaveValue('Neu'));
    fireEvent.click(screen.getByRole('button', { name: 'Spieler hinzufügen' }));

    await screen.findByText(/^Spieler hinzugefügt:/);
    const addCall = global.fetch.mock.calls.find(([path, options]) => path === '/api/tournaments/t1/registrations' && options?.method === 'POST');
    expect(JSON.parse(addCall[1].body)).toMatchObject({
      firstName: 'Gina', lastName: 'Neu', playerSelections: { primary: { userId: 'u9', proof: 'beweis' } },
    });
  });

  it('fragt nach, bevor ein bereits angemeldeter Spieler noch einmal hinzugefügt wird', async () => {
    installFetchMock([], { registrations: [
      ...CONFIRMED_REGISTRATIONS,
      { id: 'w1', firstName: 'Wilma', lastName: 'Warte', status: 'waitlist', participation: 'active' },
      { id: 'x1', firstName: 'Xaver', lastName: 'Abgesagt', status: 'cancelled', participation: 'active' },
    ] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const addCalls = () => global.fetch.mock.calls.filter(([path, options]) => path === '/api/tournaments/t1/registrations' && options?.method === 'POST');
    const add = (firstName, lastName) => {
      fireEvent.change(screen.getByRole('textbox', { name: /Vorname/ }), { target: { value: firstName } });
      fireEvent.change(screen.getByRole('textbox', { name: /Nachname/ }), { target: { value: lastName } });
      fireEvent.click(screen.getByRole('button', { name: 'Spieler hinzufügen' }));
    };

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');
    fireEvent.click(screen.getByText('Teilnehmer'));

    // Groß-/Kleinschreibung, Akzente und Leerzeichen spielen keine Rolle.
    add('anna', ' Müster ');
    expect(confirm).toHaveBeenCalledWith('Bereits angemeldet: anna Müster. Trotzdem hinzufügen?');
    expect(addCalls()).toHaveLength(0);

    add('Wilma', 'Warte');
    expect(confirm).toHaveBeenLastCalledWith('Bereits angemeldet: Wilma Warte. Trotzdem hinzufügen?');
    confirm.mockReturnValue(true);
    add('Wilma', 'Warte');
    await waitFor(() => expect(addCalls()).toHaveLength(1));

    // Abgesagte Meldungen zählen nicht.
    confirm.mockClear();
    await screen.findByText('Spieler hinzugefügt: Gina Neu');
    add('Xaver', 'Abgesagt');
    await waitFor(() => expect(addCalls()).toHaveLength(2));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('meldet bei Doublette ein ganzes Team nach, nicht nur einen Spieler', async () => {
    installFetchMock([]);
    const doublette = { ...TOURNAMENT, name: 'Doublette formée', registrationType: 'forme', type: 'schweizer', formation: 'doublette' };

    render(<TournamentPlayManagement tournaments={[doublette]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');
    fireEvent.click(screen.getByText('Teilnehmer'));

    expect(screen.queryByRole('textbox', { name: 'Partner 2: Vorname' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Spieler: Vorname' }), { target: { value: 'Gina' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Spieler: Nachname' }), { target: { value: 'Neu' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Partner: Vorname' }), { target: { value: 'Hans' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Partner: Nachname' }), { target: { value: 'Mit' } });
    expect(screen.getByRole('textbox', { name: 'Partner: Vorname' })).toBeRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Team hinzufügen' }));

    await screen.findByText(/^Team hinzugefügt:/);
    const addCall = global.fetch.mock.calls.find(([path, options]) => path === '/api/tournaments/t1/registrations' && options.method === 'POST');
    expect(JSON.parse(addCall[1].body)).toMatchObject({ firstName: 'Gina', lastName: 'Neu', partnerFirstName: 'Hans', partnerLastName: 'Mit', partner2FirstName: null });
  });

  it('bietet bei Triplette Partner 2 optional an, verlangt aber den vollständigen Namen, sobald etwas eingetragen ist', async () => {
    installFetchMock([]);
    const triplette = { ...TOURNAMENT, name: 'Triplette formée', registrationType: 'forme', type: 'schweizer', formation: 'triplette' };

    render(<TournamentPlayManagement tournaments={[triplette]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');
    fireEvent.click(screen.getByText('Teilnehmer'));

    const partner2First = screen.getByRole('textbox', { name: 'Partner 2: Vorname' });
    expect(partner2First).not.toBeRequired();
    fireEvent.change(partner2First, { target: { value: 'Ida' } });
    expect(screen.getByRole('textbox', { name: 'Partner 2: Nachname' })).toBeRequired();
  });
  it('nimmt ein abgeschlossenes Turnier nur nach Rückfrage wieder auf', async () => {
    const calls = [];
    installFetchMock(calls, { ranking: [{ playerId: 'p1', id: 'p1', rank: 1, wins: 1, firstName: 'Anna', lastName: 'Muster' }] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<TournamentPlayManagement tournaments={[{ ...TOURNAMENT, status: 'finished' }]} language="de" />);

    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking?live=1'));
    expect(screen.queryByRole('button', { name: 'Turnier starten' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Turnier wieder aufnehmen' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Endrangliste wird zurückgezogen'));
    expect(calls).not.toContain('/api/tournaments/t1/start');

    // Der Button bleibt bis zum Ende des (asynchronen) Handlers gesperrt.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Turnier wieder aufnehmen' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Turnier wieder aufnehmen' }));
    expect(await screen.findByText('Turnier wurde wieder aufgenommen.')).toBeInTheDocument();
    expect(calls).toContain('/api/tournaments/t1/start');
  });

  it('sperrt nach dem K.O.-Finale die nächste Runde, auch wenn Ausgeschiedene inaktiv sind', async () => {
    const calls = [];
    const ko = { ...TOURNAMENT, registrationType: 'forme', type: 'ko', formation: 'tete' };
    const decided = (id, roundNumber) => ({ id, roundNumber, matches: [{ ...ROUND_1.matches[0], id: `m${id}`, scoreA: 13, scoreB: 5 }] });
    const teams = Array.from({ length: 4 }, (_, index) => ({ id: `team-${index}`, members: [`p${index + 1}`] }));
    // Vier feste Teams: Halbfinale und Finale; nach dem Halbfinale sind die Verlierer inaktiv.
    const registrations = CONFIRMED_REGISTRATIONS.map((registration, index) => ({ ...registration, participation: index < 2 ? 'active' : 'inactive' }));
    installFetchMock(calls, { rounds: [decided('r1', 1), decided('r2', 2)], teams, registrations });
    render(<TournamentPlayManagement tournaments={[ko]} language="de" />);

    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/registrations'));
    await screen.findByRole('button', { name: 'Nächste Runde starten' });
    await waitFor(() => expect(screen.getByText('Alle Runden wurden bereits gespielt.', { selector: '.round-requirements li' })).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByRole('button', { name: 'Nächste Runde starten' })).toBeDisabled();
  });

  it('lässt die Rangliste nach dem Veröffentlichen aufgeklappt, damit die Erfolgsmeldung sichtbar bleibt', async () => {
    const calls = [];
    installFetchMock(calls, { ranking: [{ playerId: 'p1', id: 'p1', rank: 1, wins: 1, firstName: 'Anna', lastName: 'Muster' }] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const finished = { ...TOURNAMENT, status: 'finished' };
    const { rerender } = rtlRender(<TournamentPlayManagement tournaments={[finished]} language="de" />, { wrapper });

    fireEvent.click(await screen.findByRole('button', { name: 'Endrangliste veröffentlichen' }));
    expect(await screen.findByText(/Endrangliste veröffentlicht/)).toBeInTheDocument();
    // Die neu geladene Turnierliste trägt jetzt den Veröffentlichungszeitpunkt.
    rerender(<TournamentPlayManagement tournaments={[{ ...finished, rankingPublishedAt: '2026-10-27T12:00:00.000Z' }]} language="de" />);

    expect(document.querySelector('.ranking-panel').open).toBe(true);
    expect(screen.getByText(/Endrangliste veröffentlicht/)).toBeInTheDocument();
  });
});
