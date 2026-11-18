import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RankingWithKoWinners } from './KoWinnersTable.jsx';

describe('RankingWithKoWinners', () => {
  it('teilt die Endrangliste in die Sieger der KO-Runden und die Vorrunde', () => {
    render(<RankingWithKoWinners winners={[{ label: 'A-Finale', registrationIds: ['r1'], team: 'Anna + Bert' }]}>
      <p>Vorrundentabelle</p>
    </RankingWithKoWinners>);
    expect(screen.getByRole('heading', { name: 'Sieger der KO-Runden' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vorrunde' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /A-Finale.*Anna \+ Bert/ })).toBeInTheDocument();
    expect(screen.getByText('Vorrundentabelle')).toBeInTheDocument();
  });

  it('zeigt ohne KO-Sieger nur die Rangliste', () => {
    render(<RankingWithKoWinners winners={[]}><p>Vorrundentabelle</p></RankingWithKoWinners>);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Vorrundentabelle')).toBeInTheDocument();
  });
});
