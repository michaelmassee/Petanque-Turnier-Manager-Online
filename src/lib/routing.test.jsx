import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { areaForPath, matchRentalRoute, matchTournamentBoardRoute, matchTournamentRoute, tournamentBoardPath, usePath } from './routing.js';

function NavigationHarness() {
  const [path, navigate] = usePath();
  const target = '/turniere/t1/teilnehmer?share=private-token';

  return (
    <>
      <button type="button" onClick={() => navigate(target)}>Zu den Teilnehmern</button>
      <output data-testid="path">{path}</output>
    </>
  );
}

describe('usePath', () => {
  it('hält Query-Parameter in der URL, aber nicht im Routenpfad', () => {
    window.history.replaceState({}, '', '/turniere/t1/info?share=private-token');
    render(<NavigationHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Zu den Teilnehmern' }));

    expect(window.location.pathname).toBe('/turniere/t1/teilnehmer');
    expect(window.location.search).toBe('?share=private-token');
    expect(screen.getByTestId('path')).toHaveTextContent('/turniere/t1/teilnehmer');
    expect(matchTournamentRoute(screen.getByTestId('path').textContent)).toMatchObject({ id: 't1', view: 'teilnehmer' });
  });
});

describe('matchTournamentBoardRoute', () => {
  it('erkennt die Turnierseite und leitet den früheren Spielplan-Reiter dorthin um', () => {
    expect(tournamentBoardPath('t 1')).toBe('/turnierseite/t%201');
    expect(matchTournamentBoardRoute('/turnierseite/t%201')).toEqual({ id: 't 1', legacy: false });
    expect(matchTournamentBoardRoute('/turniere/t1/spielplan')).toEqual({ id: 't1', legacy: true });
    expect(matchTournamentRoute('/turniere/t1/spielplan')).toBeNull();
    expect(matchTournamentBoardRoute('/turniere/t1/info')).toBeNull();
    expect(areaForPath('/turnierseite/t1')).toBe('turniere');
  });
});

describe('matchRentalRoute', () => {
  it('erkennt Liste, eigene Reservierungen, Verwaltung und Angebote', () => {
    expect(matchRentalRoute('/platz-mieten')).toEqual({ view: 'list' });
    expect(matchRentalRoute('/platz-mieten/meine')).toEqual({ view: 'mine' });
    expect(matchRentalRoute('/platz-mieten/verwalten')).toEqual({ view: 'manage' });
    expect(matchRentalRoute('/platz-mieten/o%201')).toEqual({ view: 'offer', id: 'o 1' });
    expect(matchRentalRoute('/platz-mieten/a/b')).toBeNull();
    expect(matchRentalRoute('/plaetze')).toBeNull();
  });
});

describe('areaForPath', () => {
  it.each([
    ['/turniere/t1', 'turniere'], ['/turniere/t1/rangliste', 'turniere'], ['/turnier-melden', 'turniere'],
    ['/plaetze', 'bouleplaetze'], ['/platz-melden', 'bouleplaetze'], ['/platz-bearbeiten', 'bouleplaetze'], ['/vereine', 'bouleplaetze'],
    ['/platz-mieten', 'platzmieten'], ['/platz-mieten/verwalten', 'platzmieten'],
    ['/live', 'live'], ['/live/r1', 'live'],
    ['/spielerboerse', 'spielerboerse'], ['/meine-anzeigen', 'spielerboerse'],
    ['/', null], ['/impressum', null], ['/datenschutz', null],
  ])('ordnet %s dem Bereich %s zu', (path, area) => {
    expect(areaForPath(path)).toBe(area);
  });
});
