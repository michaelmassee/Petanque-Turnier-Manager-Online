import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoundTable } from './RoundTable.jsx';

const player = (id, firstName) => ({ id, firstName, lastName: 'Test' });
const match = (id, extra) => ({ id, teamA: [player(`${id}a`, 'Anna')], teamB: [player(`${id}b`, 'Bert')], scoreA: null, scoreB: null, noShow: null, ...extra });

describe('RoundTable', () => {
  it('zeigt die Teamnummer wie in der Live-Ansicht vor dem Teamnamen', () => {
    render(<RoundTable round={{ roundNumber: 5, matches: [match('m1', { teamANumber: 1, teamBNumber: 16 })] }} />);
    const badges = screen.getAllByTitle(/Teamnummer/);
    expect(badges.map((badge) => badge.textContent)).toEqual(['1', '16']);
    expect(badges[0].closest('td')).toHaveTextContent('1Anna Test');
  });

  it('zeigt ohne Teamnummer und bei „nur Nr“ kein zusätzliches Badge', () => {
    render(<RoundTable round={{ roundNumber: 1, matches: [
      match('m1'),
      match('m2', { teamANumber: 3, teamBNumber: 4, teamALabel: '3', teamBLabel: '4' }),
    ] }} />);
    expect(screen.queryAllByTitle(/Teamnummer/)).toHaveLength(0);
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
