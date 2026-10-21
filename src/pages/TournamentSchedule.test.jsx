import { describe, expect, it, afterEach, vi } from 'vitest';
import { render as renderBase, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { normalizeRanking } from '../lib/live-ranking.js';
import { TournamentSchedule } from './TournamentDetailPage.jsx';

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
      .toEqual(['Platz', 'Team', 'Siege', 'Niederlagen', 'Spieldifferenz', 'Punkte+', 'Punkte−', 'Δ']);
    const row = screen.getAllByRole('cell', { name: 'Anna Muster' }).at(-1).closest('tr');
    expect(row).toHaveTextContent('6');
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

  it('zeigt die aktuelle Runde oben, vergangene Runden eingeklappt, und kennzeichnet offene sowie nicht angetretene Partien', async () => {
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
    expect(screen.getByRole('heading', { name: 'Vergangene Runden' })).toBeInTheDocument();
    expect(screen.getByText('Runde 1').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('13:11')).toBeInTheDocument();
    expect(screen.getByText('Offen')).toBeInTheDocument();
    expect(screen.getByText('Nicht angetreten')).toBeInTheDocument();
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
