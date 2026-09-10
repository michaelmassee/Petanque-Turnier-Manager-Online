import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TournamentPlayManagement from './TournamentPlayManagement.jsx';

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

const CONFIRMED_REGISTRATIONS = [
  { id: 'p1', firstName: 'Anna', lastName: 'Muster' },
  { id: 'p2', firstName: 'Bert', lastName: 'Beispiel' },
  { id: 'p3', firstName: 'Clara', lastName: 'Test' },
  { id: 'p4', firstName: 'Dirk', lastName: 'Demo' },
  { id: 'p5', firstName: 'Eva', lastName: 'Muster' },
  { id: 'p6', firstName: 'Finn', lastName: 'Test' },
].map((registration) => ({ ...registration, status: 'confirmed', active: true }));

function installFetchMock(calls, { rounds = [ROUND_1], ranking = [], registrations = CONFIRMED_REGISTRATIONS } = {}) {
  global.fetch = vi.fn((path, options = {}) => {
    calls.push(path);
    if (path === '/api/tournaments/t1/rounds' && (!options.method || options.method === 'GET')) {
      return Promise.resolve(jsonResponse({ rounds }));
    }
    if (path === '/api/tournaments/t1/ranking') {
      return Promise.resolve(jsonResponse({ ranking }));
    }
    if (path === '/api/tournaments/t1/registrations') {
      return Promise.resolve(jsonResponse({ registrations }));
    }
    if (path === '/api/tournaments/t1/rounds' && options.method === 'POST') {
      return Promise.resolve(jsonResponse({ rounds: [...rounds, { id: 'r2', roundNumber: 2, matches: [] }] }));
    }
    if (path === '/api/tournaments/t1/matches/m1/result' && options.method === 'PUT') {
      const updated = { ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 13, scoreB: 7 }] };
      return Promise.resolve(jsonResponse({ rounds: [updated] }));
    }
    if (/^\/api\/registrations\/.+\/active$/.test(path) && options.method === 'PUT') {
      return Promise.resolve(jsonResponse({ registration: {} }));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

describe('TournamentPlayManagement', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('zeigt einen Hinweis, wenn kein online durchführbares Turnier vorhanden ist', () => {
    render(<TournamentPlayManagement tournaments={[]} language="de" />);
    expect(screen.getByText('Keine Turniere mit Online-Durchführung verfügbar.')).toBeInTheDocument();
  });

  it('lädt die aktuelle Runde und die Rangliste für das ausgewählte Turnier', async () => {
    const calls = [];
    installFetchMock(calls, { ranking: [{ rank: 1, playerId: 'p1', firstName: 'Anna', lastName: 'Muster', wins: 1, gameDiff: 1, pointsFor: 13, pointsAgainst: 7 }] });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);

    expect(await screen.findByText('Anna Muster + Bert Beispiel + Clara Test')).toBeInTheDocument();
    expect(screen.getByText('Dirk Demo + Eva Muster + Finn Test')).toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: 'Anna Muster' })).toBeInTheDocument();

    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/rounds'));
    await waitFor(() => expect(calls).toContain('/api/tournaments/t1/ranking'));
  });

  it('erstellt über den Button eine neue Runde, sobald alle Ergebnisse der aktuellen Runde feststehen', async () => {
    const calls = [];
    const decidedRound = { ...ROUND_1, matches: [{ ...ROUND_1.matches[0], scoreA: 13, scoreB: 7 }] };
    installFetchMock(calls, { rounds: [decidedRound] });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);
    await screen.findByText('Anna Muster + Bert Beispiel + Clara Test');

    fireEvent.click(screen.getByRole('button', { name: 'Neue Runde starten' }));

    await screen.findByText('Neue Runde wurde erstellt.');
    expect(calls.filter((path) => path === '/api/tournaments/t1/rounds').length).toBeGreaterThan(1);
  });

  it('zeigt fehlende Voraussetzungen und deaktiviert den Button bei zu wenigen bestätigten Meldungen', async () => {
    const calls = [];
    installFetchMock(calls, {
      rounds: [],
      registrations: [
        { id: 'p1', status: 'confirmed', active: true },
        { id: 'p2', status: 'pending', active: true },
      ],
    });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);

    expect(await screen.findByText('Bestätigte Meldungen: 1 (1 aktiv)')).toBeInTheDocument();
    expect(screen.getByText('Es werden mindestens 4 bestätigte Meldungen benötigt.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neue Runde starten' })).toBeDisabled();
  });

  it('schließt inaktive Teilnehmer von der Mindestanzahl-Prüfung aus und erlaubt das Reaktivieren', async () => {
    const calls = [];
    const registrations = [
      { id: 'p1', firstName: 'Anna', lastName: 'Muster', status: 'confirmed', active: true },
      { id: 'p2', firstName: 'Bert', lastName: 'Beispiel', status: 'confirmed', active: true },
      { id: 'p3', firstName: 'Clara', lastName: 'Test', status: 'confirmed', active: true },
      { id: 'p4', firstName: 'Dirk', lastName: 'Demo', status: 'confirmed', active: false },
    ];
    installFetchMock(calls, { rounds: [], registrations });

    render(<TournamentPlayManagement tournaments={[TOURNAMENT]} language="de" />);

    expect(await screen.findByText('Bestätigte Meldungen: 4 (3 aktiv)')).toBeInTheDocument();
    expect(screen.getByText('Es werden mindestens 4 bestätigte Meldungen benötigt.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Auf aktiv setzen' }));

    await waitFor(() => expect(calls).toContain('/api/registrations/p4/active'));
    expect(await screen.findByText('Bestätigte Meldungen: 4 (4 aktiv)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neue Runde starten' })).not.toBeDisabled();
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
});
