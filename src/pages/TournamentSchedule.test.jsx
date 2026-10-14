import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TournamentSchedule } from './TournamentDetailPage.jsx';

function jsonResponse(payload) {
  return { ok: true, json: () => Promise.resolve(payload) };
}

describe('TournamentSchedule (öffentliche Ansicht)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('zeigt einen Hinweis, solange noch keine Runde existiert', async () => {
    global.fetch = vi.fn((path) => {
      if (path === '/api/tournaments/t1/rounds') return Promise.resolve(jsonResponse({ rounds: [] }));
      if (path === '/api/tournaments/t1/ranking') return Promise.resolve(jsonResponse({ ranking: [] }));
      return Promise.resolve(jsonResponse({}));
    });

    render(<TournamentSchedule tournamentId="t1" language="de" />);

    expect(await screen.findByText('Noch keine Runde gestartet.')).toBeInTheDocument();
  });

  it('zeigt bei einem verbundenen Turnierdokument Bahn, Stufe und dessen Rangliste wie online', async () => {
    global.fetch = vi.fn((path) => {
      if (path === '/api/tournaments/t1/rounds') {
        return Promise.resolve(jsonResponse({
          rounds: [{
            id: 'r1',
            roundNumber: 1,
            matches: [
              { id: 'm1', court: 'A3', stageLabel: 'Poule A', teamA: [{ id: 'p1', firstName: 'Anna', lastName: 'Muster' }], teamB: [{ id: 'p2', firstName: 'Bert', lastName: 'Beispiel' }], scoreA: 13, scoreB: 7, noShow: null },
              { id: 'm2', court: '4', stageLabel: 'Poule B', teamA: [{ id: 'p3', firstName: 'Clara', lastName: 'Klar' }], teamB: [{ id: 'p4', firstName: 'Dieter', lastName: 'Damm' }], scoreA: null, scoreB: null, noShow: null },
            ],
          }],
        }));
      }
      if (path === '/api/tournaments/t1/ranking') {
        return Promise.resolve(jsonResponse({ ranking: [{
          rank: 1, registrationIds: ['p1'], members: [{ id: 'p1', firstName: 'Anna', lastName: 'Muster' }],
          wins: 1, losses: 0, gameDiff: 1, pointsFor: 13, pointsAgainst: 7, pointsDiff: 6,
        }] }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<TournamentSchedule tournamentId="t1" language="de"
      tournament={{ type: 'jeder_gegen_jeden', desktopExecution: true, documentManaged: true, documentDataAsOf: '2026-10-14T10:00:00.000Z' }} />);

    expect(await screen.findByRole('heading', { name: 'Poule A' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Poule B' })).toBeInTheDocument();
    expect(screen.getByText('A3')).toBeInTheDocument();
    expect(screen.getByText(/Turnierdaten vom/)).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent))
      .toEqual(['Platz', 'Team', 'Siege', 'Niederlagen', 'Spieldifferenz', 'Punkte+', 'Punkte−', 'Δ']);
    const row = screen.getAllByRole('cell', { name: 'Anna Muster' }).at(-1).closest('tr');
    expect(row).toHaveTextContent('6');
  });

  it('zeigt die aktuelle Runde und die Rangliste rein lesend an', async () => {
    global.fetch = vi.fn((path) => {
      if (path === '/api/tournaments/t1/rounds') {
        return Promise.resolve(
          jsonResponse({
            rounds: [
              {
                id: 'r1',
                roundNumber: 1,
                matches: [
                  {
                    id: 'm1',
                    teamA: [{ id: 'p1', firstName: 'Anna', lastName: 'Muster' }],
                    teamB: [{ id: 'p2', firstName: 'Bert', lastName: 'Beispiel' }],
                    scoreA: 13,
                    scoreB: 7,
                    noShow: null,
                  },
                ],
              },
            ],
          }),
        );
      }
      if (path === '/api/tournaments/t1/ranking') {
        return Promise.resolve(jsonResponse({ ranking: [{ rank: 1, playerId: 'p1', firstName: 'Anna', lastName: 'Muster', wins: 1, gameDiff: 1, pointsFor: 13, pointsAgainst: 7 }] }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<TournamentSchedule tournamentId="t1" language="de" />);

    expect(await screen.findByText('13:7')).toBeInTheDocument();
    const ranglisteRow = (await screen.findAllByRole('cell', { name: 'Anna Muster' })).at(-1).closest('tr');
    expect(ranglisteRow).toHaveTextContent('13');
    expect(ranglisteRow).toHaveTextContent('7');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('zeigt ausschließlich die letzte Runde und kennzeichnet offene sowie nicht angetretene Partien', async () => {
    global.fetch = vi.fn((path) => {
      if (path === '/api/tournaments/t1/rounds') {
        return Promise.resolve(jsonResponse({
          rounds: [
            { id: 'r1', roundNumber: 1, matches: [] },
            {
              id: 'r2',
              roundNumber: 2,
              matches: [
                {
                  id: 'm2',
                  teamA: [{ id: 'p1', firstName: 'Anna', lastName: 'Muster' }],
                  teamB: [{ id: 'p2', firstName: 'Bert', lastName: 'Beispiel' }],
                  scoreA: null,
                  scoreB: null,
                  noShow: null,
                },
                {
                  id: 'm3',
                  teamA: [{ id: 'p3', firstName: 'Clara', lastName: 'Klar' }],
                  teamB: [{ id: 'p4', firstName: 'Dieter', lastName: 'Damm' }],
                  scoreA: null,
                  scoreB: null,
                  noShow: 'b',
                },
              ],
            },
          ],
        }));
      }
      if (path === '/api/tournaments/t1/ranking') return Promise.resolve(jsonResponse({ ranking: [] }));
      return Promise.resolve(jsonResponse({}));
    });

    render(<TournamentSchedule tournamentId="t1" language="de" />);

    expect(await screen.findByRole('heading', { name: 'Runde 2' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Runde 1' })).not.toBeInTheDocument();
    expect(screen.getByText('Offen')).toBeInTheDocument();
    expect(screen.getByText('Nicht angetreten')).toBeInTheDocument();
  });

  it.each([
    ['mit Buchholz', 'mit_buchholz', true],
    ['ohne Buchholz', 'ohne_buchholz', false],
  ])('zeigt die Schweizer Rangliste %s korrekt an', async (_label, schweizerRankingMode, expectsBuchholz) => {
    global.fetch = vi.fn((path) => {
      if (path === '/api/tournaments/t1/rounds') {
        return Promise.resolve(jsonResponse({
          rounds: [{ id: 'r1', roundNumber: 1, matches: [] }],
        }));
      }
      if (path === '/api/tournaments/t1/ranking') {
        return Promise.resolve(jsonResponse({
          ranking: [{
            rank: 1,
            teamId: 'team-anna-bert',
            members: [
              { id: 'p1', firstName: 'Anna', lastName: 'Muster' },
              { id: 'p2', firstName: 'Bert', lastName: 'Beispiel' },
            ],
            wins: 3,
            bhz: 11,
            fbhz: 27,
            pointsFor: 39,
            pointsAgainst: 18,
            pointsDiff: 21,
          }],
        }));
      }
      return Promise.resolve(jsonResponse({}));
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
