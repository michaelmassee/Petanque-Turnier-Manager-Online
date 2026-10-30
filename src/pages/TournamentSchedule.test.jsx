import { describe, expect, it, afterEach, vi } from 'vitest';
import { act, render as renderBase, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { normalizeRanking } from '../lib/live-ranking.js';
import { TournamentSchedule } from './TournamentDetailPage.jsx';
import { installFakeWebSocket, latestSocket, uninstallFakeWebSocket } from '../test-support/fake-websocket.js';

function jsonResponse(payload) {
  return { ok: true, json: () => Promise.resolve(payload) };
}

function render(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderBase(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// Ein Abruf liefert Runden und die serverseitig aufbereitete Rangliste (wie der Live-Snapshot).
function mockSchedule({ rounds = [], ranking = [], ...rest }) {
  global.fetch = vi.fn((path) => (path === '/api/tournaments/t1/schedule'
    ? Promise.resolve(jsonResponse({ status: 'running', rounds, ranking: normalizeRanking(ranking), dataAsOf: null, announcement: null, ...rest }))
    : Promise.resolve(jsonResponse({}))));
}

const anna = { id: 'p1', firstName: 'Anna', lastName: 'Muster' };
const bert = { id: 'p2', firstName: 'Bert', lastName: 'Beispiel' };
const clara = { id: 'p3', firstName: 'Clara', lastName: 'Klar' };
const dieter = { id: 'p4', firstName: 'Dieter', lastName: 'Damm' };

describe('TournamentSchedule (öffentliche Ansicht)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('zeigt einen Hinweis, solange noch keine Runde existiert', async () => {
    mockSchedule({});

    render(<TournamentSchedule tournamentId="t1" language="de" />);

    expect(await screen.findByText('Noch keine Runde gestartet.')).toBeInTheDocument();
  });

  it('lädt Runden und Rangliste in einem Abruf über den Spielplan-Endpunkt', async () => {
    mockSchedule({});

    render(<TournamentSchedule tournamentId="t1" language="de" />);

    await screen.findByText('Noch keine Runde gestartet.');
    expect(global.fetch.mock.calls.map(([path]) => path)).toEqual(['/api/tournaments/t1/schedule']);
  });

  it('zeigt bei einem verbundenen Turnierdokument Bahn, Stufe und dessen Rangliste wie online', async () => {
    mockSchedule({
      dataAsOf: '2026-10-14T10:00:00.000Z',
      rounds: [{
        id: 'r1',
        roundNumber: 1,
        matches: [
          { id: 'm1', court: 'A3', stageLabel: 'Poule A', teamA: [anna], teamB: [bert], scoreA: 13, scoreB: 7, noShow: null },
          { id: 'm2', court: '4', stageLabel: 'Poule B', teamA: [clara], teamB: [dieter], scoreA: null, scoreB: null, noShow: null },
        ],
      }],
      ranking: [{ rank: 1, registrationIds: ['p1'], members: [anna], wins: 1, losses: 0, gameDiff: 1, pointsFor: 13, pointsAgainst: 7, pointsDiff: 6 }],
    });

    render(<TournamentSchedule tournamentId="t1" language="de" tournament={{ type: 'jeder_gegen_jeden', desktopExecution: true, documentManaged: true }} />);

    expect(await screen.findByRole('heading', { name: 'Poule A' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Poule B' })).toBeInTheDocument();
    expect(screen.getByText('A3')).toBeInTheDocument();
    expect(screen.getByText(/Turnierdaten vom/)).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent))
      .toEqual(['Platz', 'Team', 'Spiele', 'Punkte', '+', 'Δ', '+', '−', 'Δ']);
    expect(screen.getByRole('columnheader', { name: 'Punkte Δ' })).toBeInTheDocument();
    const row = screen.getAllByRole('cell', { name: 'Anna Muster' }).at(-1).closest('tr');
    expect(row).toHaveTextContent('+6');
  });

  it('zeigt die aktuelle Runde und die Rangliste rein lesend an, nur mit „Aktualisieren“', async () => {
    mockSchedule({
      rounds: [{ id: 'r1', roundNumber: 1, matches: [{ id: 'm1', teamA: [anna], teamB: [bert], scoreA: 13, scoreB: 7, noShow: null }] }],
      ranking: [{ rank: 1, playerId: 'p1', firstName: 'Anna', lastName: 'Muster', wins: 1, gameDiff: 1, pointsFor: 13, pointsAgainst: 7 }],
    });

    render(<TournamentSchedule tournamentId="t1" language="de" />);

    expect(await screen.findByText('13:7')).toBeInTheDocument();
    const ranglisteRow = (await screen.findAllByRole('cell', { name: 'Anna Muster' })).at(-1).closest('tr');
    expect(ranglisteRow).toHaveTextContent('13');
    expect(ranglisteRow).toHaveTextContent('7');
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Aktualisieren']);
    expect(screen.getByText(/Stand:/)).toBeInTheDocument();
  });

  it('zeigt als reine Anzeige nur aktuelle Runde und Rangliste ohne Bedienelemente', async () => {
    mockSchedule({
      rounds: [
        { id: 'r1', roundNumber: 1, matches: [{ id: 'm1', teamA: [anna], teamB: [clara], scoreA: 13, scoreB: 11, noShow: null }] },
        { id: 'r2', roundNumber: 2, matches: [{ id: 'm2', teamA: [anna], teamB: [bert], scoreA: null, scoreB: null, noShow: null }] },
      ],
      ranking: [{ rank: 1, playerId: 'p1', firstName: 'Anna', lastName: 'Muster', wins: 1, gameDiff: 1, pointsFor: 13, pointsAgainst: 11 }],
    });

    render(<TournamentSchedule tournamentId="t1" language="de" display />);

    expect(await screen.findByRole('heading', { name: 'Runde 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rangliste' })).toBeInTheDocument();
    // Kein Turnierverlauf: vergangene Runden gehören nicht auf die Anzeige.
    expect(screen.queryByRole('heading', { name: 'Turnierverlauf' })).not.toBeInTheDocument();
    expect(screen.queryByText('13:11')).not.toBeInTheDocument();
    expect(document.querySelector('details')).toBeNull();
    // Runde und Rangliste je in einem eigenen Scrollbereich (Auto-Scroll auf dem Bildschirm vor Ort).
    expect(document.querySelectorAll('.display-scroll')).toHaveLength(2);
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.getByText(/Stand:/)).toBeInTheDocument();
  });

  it('zeigt als reine Anzeige nach Turnierende nur noch die komplette Rangliste', async () => {
    mockSchedule({
      status: 'finished',
      rounds: [{ id: 'r1', roundNumber: 1, matches: [{ id: 'm1', teamA: [anna], teamB: [clara], scoreA: 13, scoreB: 11, noShow: null }] }],
      ranking: [
        { rank: 1, playerId: 'p1', firstName: 'Anna', lastName: 'Muster', wins: 1, gameDiff: 2, pointsFor: 13, pointsAgainst: 11 },
        { rank: 2, playerId: 'p3', firstName: 'Clara', lastName: 'Muster', wins: 0, gameDiff: -2, pointsFor: 11, pointsAgainst: 13 },
      ],
    });

    render(<TournamentSchedule tournamentId="t1" language="de" display />);

    expect(await screen.findByRole('heading', { name: 'Endrangliste' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Runde 1' })).not.toBeInTheDocument();
    // Zwei Kopfzeilen (Spiele/Punkte mit +, − und Δ) und die beiden Einträge.
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(document.querySelectorAll('.display-scroll')).toHaveLength(1);
    expect(document.querySelector('.display-columns.has-ranking')).toBeNull();
  });

  it('zeigt nur die aktuelle Runde ohne vergangene Runden und kennzeichnet offene sowie nicht angetretene Partien', async () => {
    mockSchedule({
      rounds: [
        { id: 'r1', roundNumber: 1, matches: [{ id: 'm1', teamA: [anna], teamB: [clara], scoreA: 13, scoreB: 11, noShow: null }] },
        {
          id: 'r2',
          roundNumber: 2,
          matches: [
            { id: 'm2', teamA: [anna], teamB: [bert], scoreA: null, scoreB: null, noShow: null },
            { id: 'm3', teamA: [clara], teamB: [dieter], scoreA: null, scoreB: null, noShow: 'b' },
          ],
        },
      ],
    });

    render(<TournamentSchedule tournamentId="t1" language="de" />);

    expect(await screen.findByRole('heading', { name: 'Runde 2' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Runde 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Vergangene Runden' })).not.toBeInTheDocument();
    expect(screen.queryByText('13:11')).not.toBeInTheDocument();
    expect(screen.getByText('Offen')).toBeInTheDocument();
    expect(screen.getByText('Nicht angetreten')).toBeInTheDocument();
  });

  it('lädt sofort neu, wenn der WebSocket eine Änderung meldet, und zeigt „Live“', async () => {
    mockSchedule({});
    installFakeWebSocket();
    try {
      render(<TournamentSchedule tournamentId="t1" language="de" />);
      await screen.findByText('Noch keine Runde gestartet.');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const socket = latestSocket();
      expect(socket.url).toBe(`${window.location.origin.replace(/^http/, 'ws')}/api/tournaments/t1/schedule/socket`);
      act(() => socket.open());
      expect(await screen.findByText('Live – aktualisiert sich sofort')).toBeInTheDocument();

      // Mehrere Änderungen kurz hintereinander (Serien-Eingabe) werden zu einem Abruf.
      act(() => { socket.receive({ type: 'changed' }); socket.receive({ type: 'changed' }); socket.receive('pong'); });
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2), { timeout: 3000 });
      await new Promise((resolve) => { setTimeout(resolve, 1600); });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      uninstallFakeWebSocket();
    }
  });

  it('fragt 8 Stunden nach Turnierbeginn nicht mehr von selbst ab und bietet Neuladen an', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockSchedule({ pollUntil: new Date(Date.now() + 60_000).toISOString() });
      render(<TournamentSchedule tournamentId="t1" language="de" />);
      expect(await screen.findByText(/^nächste Aktualisierung in/)).toBeInTheDocument();

      await act(async () => { vi.advanceTimersByTime(120_000); });
      expect(await screen.findByText(/Anzeige pausiert/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'neu laden' })).toBeInTheDocument();
      const calls = global.fetch.mock.calls.length;
      await act(async () => { vi.advanceTimersByTime(600_000); });
      expect(global.fetch).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it('zeigt auch nach der Abfrage-Pause die Endrangliste, sobald der WebSocket das Turnierende meldet', async () => {
    const ranking = [{ rank: 1, playerId: 'p1', firstName: 'Anna', lastName: 'Muster', wins: 1, gameDiff: 2, pointsFor: 13, pointsAgainst: 11 }];
    const rounds = [{ id: 'r1', roundNumber: 1, matches: [{ id: 'm1', teamA: [anna], teamB: [clara], scoreA: 13, scoreB: 11, noShow: null }] }];
    mockSchedule({ rounds, ranking, pollUntil: '2000-01-01T00:00:00.000Z' });
    installFakeWebSocket();
    try {
      render(<TournamentSchedule tournamentId="t1" language="de" display />);
      expect(await screen.findByText(/Anzeige pausiert/)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Runde 1' })).toBeInTheDocument();
      const socket = latestSocket();
      act(() => socket.open());

      mockSchedule({ status: 'finished', rounds, ranking, pollUntil: '2000-01-01T00:00:00.000Z' });
      act(() => socket.receive({ type: 'changed' }));

      expect(await screen.findByRole('heading', { name: 'Endrangliste' }, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.queryByText(/Anzeige pausiert/)).not.toBeInTheDocument();
      // Nach Turnierende kommt nichts mehr: Verbindung schließen.
      expect(socket.readyState).toBe(3);
    } finally {
      uninstallFakeWebSocket();
    }
  });

  it('fragt nicht weiter ab, wenn der Spielplan nicht mehr sichtbar ist', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockSchedule({});
      render(<TournamentSchedule tournamentId="t1" language="de" />);
      await screen.findByText('Noch keine Runde gestartet.');
      global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 403, headers: new Headers(), json: () => Promise.resolve({ error: 'Zugriff verweigert' }) }));

      await act(async () => { vi.advanceTimersByTime(120_000); });
      expect(await screen.findByText(/Anzeige pausiert/)).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      await act(async () => { vi.advanceTimersByTime(600_000); });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lädt nach einer WebSocket-Änderung nach 20 Sekunden noch einmal, falls der Server-Cache noch den alten Stand hatte', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSchedule({});
    installFakeWebSocket();
    try {
      render(<TournamentSchedule tournamentId="t1" language="de" />);
      await screen.findByText('Noch keine Runde gestartet.');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const socket = latestSocket();
      act(() => socket.open());

      act(() => socket.receive({ type: 'changed' }));
      await act(async () => { vi.advanceTimersByTime(1500); });
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

      await act(async () => { vi.advanceTimersByTime(20_000); });
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    } finally {
      uninstallFakeWebSocket();
      vi.useRealTimers();
    }
  });

  it('meldet die aktuelle Ankündigung an die Turnierseite weiter', async () => {
    mockSchedule({ announcement: { text: 'Mittagspause bis 13 Uhr', at: '2026-10-21T11:00:00.000Z' } });
    const onAnnouncement = vi.fn();

    render(<TournamentSchedule tournamentId="t1" language="de" onAnnouncement={onAnnouncement} />);

    await screen.findByText('Noch keine Runde gestartet.');
    expect(onAnnouncement).toHaveBeenCalledWith({ text: 'Mittagspause bis 13 Uhr', at: '2026-10-21T11:00:00.000Z' });
  });

  it.each([
    ['mit Buchholz', 'mit_buchholz', true],
    ['ohne Buchholz', 'ohne_buchholz', false],
  ])('zeigt die Schweizer Rangliste %s korrekt an', async (_label, schweizerRankingMode, expectsBuchholz) => {
    mockSchedule({
      rounds: [{ id: 'r1', roundNumber: 1, matches: [] }],
      ranking: [{
        rank: 1,
        teamId: 'team-anna-bert',
        members: [anna, bert],
        wins: 3,
        bhz: 11,
        fbhz: 27,
        pointsFor: 39,
        pointsAgainst: 18,
        pointsDiff: 21,
      }],
    });

    render(<TournamentSchedule tournamentId="t1" tournament={{ type: 'schweizer', schweizerRankingMode }} />);

    const row = (await screen.findByRole('cell', { name: 'Anna Muster + Bert Beispiel' })).closest('tr');
    expect(row).toHaveTextContent('3');
    expect(row).toHaveTextContent('39');
    expect(row).toHaveTextContent('18');
    expect(row).toHaveTextContent('21');
    expect(screen.queryByRole('columnheader', { name: 'BHZ' })).toBe(expectsBuchholz ? screen.getByRole('columnheader', { name: 'BHZ' }) : null);
    expect(screen.queryByRole('columnheader', { name: 'FBHZ' })).toBe(expectsBuchholz ? screen.getByRole('columnheader', { name: 'FBHZ' }) : null);
    if (expectsBuchholz) {
      expect(row).toHaveTextContent('11');
      expect(row).toHaveTextContent('27');
    }
  });
});
