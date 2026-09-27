import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { matchTournamentRoute, usePath } from './routing.js';

function NavigationHarness() {
  const [path, navigate] = usePath();
  const target = '/turniere/t1/spielplan?share=private-token';

  return (
    <>
      <button type="button" onClick={() => navigate(target)}>Zum Spielplan</button>
      <output data-testid="path">{path}</output>
    </>
  );
}

describe('usePath', () => {
  it('hält Query-Parameter in der URL, aber nicht im Routenpfad', () => {
    window.history.replaceState({}, '', '/turniere/t1/info?share=private-token');
    render(<NavigationHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Zum Spielplan' }));

    expect(window.location.pathname).toBe('/turniere/t1/spielplan');
    expect(window.location.search).toBe('?share=private-token');
    expect(screen.getByTestId('path')).toHaveTextContent('/turniere/t1/spielplan');
    expect(matchTournamentRoute(screen.getByTestId('path').textContent)).toMatchObject({ id: 't1', view: 'spielplan' });
  });
});
