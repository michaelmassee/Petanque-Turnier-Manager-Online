import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LiveDetail, MyLiveBackLink, MyLiveList } from './PlayerLivePage.jsx';
import { matchLiveRoute } from '../lib/routing.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

function livePayload(overrides = {}) {
  return {
    tournament: { id: 't1', name: 'Sommer-Supermêlée', date: '2026-09-25', location: 'Linden', status: 'running' },
    registration: { id: 'r1', label: 'Anna Muster' },
    live: {
      lastRoundNumber: 2,
      currentMatch: { roundNumber: 2, matchId: 'm2', court: null, teamLabel: 'Anna Muster', opponentLabel: 'Bert Beispiel', bye: false, ownScore: null, opponentScore: null, noShow: null, outcome: 'open' },
      history: [
        { roundNumber: 2, matchId: 'm2', opponentLabel: 'Bert Beispiel', bye: false, ownScore: null, opponentScore: null, outcome: 'open' },
        { roundNumber: 1, matchId: 'm1', teammates: ['Dora Partner', 'Emil Partner'], opponentLabel: 'Carla Test', bye: false, ownScore: 13, opponentScore: 5, outcome: 'won' },
      ],
      summary: { played: 1, wins: 1, losses: 0, pointsFor: 13, pointsAgainst: 5 },
      rankingPlace: 1,
      rankingSize: 2,
      ranking: [
        { rank: 1, registrationIds: ['r1'], label: 'Anna Muster', wins: 1, pointsDiff: 8, own: true },
        { rank: 2, registrationIds: ['r3'], label: 'Carla Test', wins: 0, pointsDiff: -8, own: false },
      ],
      ...overrides,
    },
  };
}

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LiveDetail queryKey={['live', 'token', 'abc']} path="/api/live/token/abc" language="de" />
    </QueryClientProvider>,
  );
}

function renderList(navigate = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MyLiveList navigate={navigate} language="de" />
    </QueryClientProvider>,
  );
}

function renderBackLink() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MyLiveBackLink navigate={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('Live-Ansicht für Spieler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('zeigt aktuelle Partie, Platz und Historie ohne Bahn, wenn keine vorhanden ist', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(livePayload())));
    renderDetail();

    expect(await screen.findByText('Sommer-Supermêlée')).toBeInTheDocument();
    expect(screen.getByText(/25\.9\.2026 Fr/)).toBeInTheDocument();
    expect(screen.getAllByText('Bert Beispiel').length).toBeGreaterThan(0);
    expect(screen.getByText('Carla Test', { selector: '.live-history-match span' })).toBeInTheDocument();
    expect(screen.getByText('Dora Partner + Emil Partner')).toBeInTheDocument();
    expect(screen.getByText('Dora Partner + Emil Partner').closest('.live-history-teammates')).toHaveTextContent('mit Dora Partner + Emil Partner');
    expect(screen.queryByText('Bahn')).not.toBeInTheDocument();
    expect(screen.getByText('13:5')).toBeInTheDocument();
  });

  it('zeigt die Bahn, wenn das Turnierdokument sie liefert', async () => {
    const payload = livePayload();
    payload.live.currentMatch.court = '12';
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(payload)));
    renderDetail();

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('Bahn')).toBeInTheDocument();
  });

  it('zeigt einen pausierten Spieler als pausiert statt als nicht eingeteilt', async () => {
    const payload = livePayload({ currentMatch: null });
    payload.registration.participation = 'withdrawn';
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(payload)));
    renderDetail();

    expect(await screen.findByText('Pausiert')).toBeInTheDocument();
    expect(screen.getByText('Du pausierst gerade. Für neue Runden wirst du nicht ausgelost.')).toBeInTheDocument();
    expect(screen.getByText('Du wirst erst wieder eingeteilt, wenn die Turnierleitung dich aktiv setzt.')).toBeInTheDocument();
    expect(screen.queryByText('Du bist in der aktuellen Runde nicht eingeteilt.')).not.toBeInTheDocument();
  });

  it('meldet einen ungültigen Link sichtbar', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ error: 'Dieser Live-Link ist ungültig oder abgelaufen' }, 404)));
    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent('Dieser Live-Link ist ungültig oder abgelaufen');
  });

  it('fordert bei mehreren laufenden Turnieren zur Auswahl auf', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      registrations: [
        { id: 'r1', label: 'Anna Muster', participation: 'active', tournament: { name: 'Sommer-Supermêlée', date: '2026-09-25', location: 'Linden', status: 'running' } },
        { id: 'r2', label: 'Bert Beispiel', participation: 'active', tournament: { name: 'Herbst-Supermêlée', date: '2026-09-26', location: 'Linden', status: 'running' } },
      ],
    })));
    renderList();

    expect(await screen.findByText('Wähle ein Turnier aus, um die Live-Ansicht zu öffnen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sommer-Supermêlée/ })).toBeInTheDocument();
  });

  it('öffnet das einzige laufende Turnier direkt', async () => {
    const navigate = vi.fn();
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      registrations: [
        { id: 'r1', label: 'Anna Muster', participation: 'active', tournament: { name: 'Sommer-Supermêlée', date: '2026-09-25', location: 'Linden', status: 'running' } },
      ],
    })));
    renderList(navigate);

    await screen.findByText('Sommer-Supermêlée');
    expect(navigate).toHaveBeenCalledWith('/live/r1');
  });

  it('blendet den Rückweg bei nur einem laufenden Turnier aus', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      registrations: [
        { id: 'r1', tournament: { status: 'running' } },
        { id: 'r2', tournament: { status: 'finished' } },
      ],
    })));
    renderBackLink();

    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Meine Turniere/ })).not.toBeInTheDocument();
  });

  it('zeigt den Rückweg bei mehreren laufenden Turnieren', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      registrations: [
        { id: 'r1', tournament: { status: 'running' } },
        { id: 'r2', tournament: { status: 'running' } },
      ],
    })));
    renderBackLink();

    expect(await screen.findByRole('button', { name: /Meine Turniere/ })).toBeInTheDocument();
  });
});

describe('Live-Routen', () => {
  it('unterscheidet Übersicht, eigene Meldung und persönlichen Link', () => {
    expect(matchLiveRoute('/live')).toEqual({});
    expect(matchLiveRoute('/live/r1')).toEqual({ registrationId: 'r1' });
    expect(matchLiveRoute('/live/t/abc')).toEqual({ token: 'abc' });
    expect(matchLiveRoute('/live/t')).toEqual({ registrationId: 't' });
    expect(matchLiveRoute('/live/a/b/c')).toBeNull();
    expect(matchLiveRoute('/turniere')).toBeNull();
  });
});
