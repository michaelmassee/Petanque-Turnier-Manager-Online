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
});
