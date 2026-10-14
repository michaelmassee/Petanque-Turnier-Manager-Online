import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  LiveDetail, MyLiveBackLink, MyLiveList, PlayerLivePage, readRememberedTeams, RememberedTeams,
} from './PlayerLivePage.jsx';
import { matchLiveRoute } from '../lib/routing.js';
import { TOURNAMENT_TYPES } from '../lib/constants.js';

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
      <LiveDetail queryKey={['live', 'registration', 'r1']} path="/api/live/registrations/r1" language="de" />
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

function renderPlayerLivePage(route, currentUser = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlayerLivePage
        route={route}
        language="de"
        setLanguage={() => {}}
        menuOpen={false}
        setMenuOpen={() => {}}
        navigate={() => {}}
        currentUser={currentUser}
        isAdmin={false}
        onSelectAdminDashboard={() => {}}
        onLogout={() => {}}
        onLogin={() => {}}
        drawerContent={null}
        postboxControl={null}
      />
    </QueryClientProvider>,
  );
}

describe('Live-Ansicht für Spieler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function installPushBrowser(permission = 'granted', hasSubscription = true) {
    const subscription = { endpoint: 'https://push.test/endpoint', toJSON: () => ({ endpoint: 'https://push.test/endpoint', keys: { p256dh: 'key', auth: 'auth' } }) };
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(hasSubscription ? subscription : null),
      subscribe: vi.fn().mockResolvedValue(subscription),
    };
    const registration = { pushManager };
    const requestPermission = vi.fn().mockResolvedValue(permission);
    vi.stubGlobal('Notification', { permission, requestPermission });
    vi.stubGlobal('PushManager', function PushManager() {});
    vi.stubGlobal('navigator', { onLine: true, userAgent: 'test', serviceWorker: {
      getRegistration: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration),
    } });
    global.fetch = vi.fn((path) => Promise.resolve(jsonResponse(path.endsWith('/push') ? {} : path.endsWith('/public-key') ? { publicKey: 'AQID' } : livePayload())));
    return { requestPermission, pushManager };
  }

  it('aktiviert Runden-Push bei vorhandener Browser-Erlaubnis ohne bestehendes Abo automatisch', async () => {
    const { requestPermission, pushManager } = installPushBrowser('granted', false);
    renderDetail();
    await screen.findByRole('button', { name: 'Benachrichtigungen ausschalten' });
    const writes = global.fetch.mock.calls.filter(([path, options]) => path.endsWith('/push') && options.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(localStorage.getItem('ptm_live_push_r1')).toBe('1');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
  });

  it('meldet bei bestehendem Abo ohne Merker nicht automatisch an (früher ausgeschaltet)', async () => {
    const { pushManager } = installPushBrowser('granted', true);
    renderDetail();
    await screen.findByRole('button', { name: 'Benachrichtigungen für neue Runden aktivieren' });
    expect(global.fetch.mock.calls.filter(([path]) => path.endsWith('/push'))).toHaveLength(0);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('registriert ein bereits aktiviertes Runden-Push-Abo beim erneuten Öffnen nicht erneut', async () => {
    installPushBrowser();
    localStorage.setItem('ptm_live_push_r1', '1');
    renderDetail();
    await screen.findByRole('button', { name: 'Benachrichtigungen ausschalten' });
    expect(global.fetch.mock.calls.filter(([path]) => path.endsWith('/push'))).toHaveLength(0);
  });

  it('respektiert eine ausdrücklich ausgeschaltete Runden-Benachrichtigung', async () => {
    installPushBrowser();
    localStorage.setItem('ptm_live_push_r1', '1');
    const view = renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'Benachrichtigungen ausschalten' }));
    await screen.findByRole('button', { name: 'Benachrichtigungen für neue Runden aktivieren' });
    expect(localStorage.getItem('ptm_live_push_r1')).toBe('0');
    view.unmount();
    renderDetail();
    await screen.findByRole('button', { name: 'Benachrichtigungen für neue Runden aktivieren' });
    expect(global.fetch.mock.calls.filter(([path, options]) => path.endsWith('/push') && options.method === 'POST')).toHaveLength(0);
  });

  it.each(['default', 'denied'])('fordert Push-Erlaubnis beim Öffnen nicht ungefragt an (%s)', async (permission) => {
    const { requestPermission } = installPushBrowser(permission);
    renderDetail();
    await screen.findByRole('button', { name: 'Benachrichtigungen für neue Runden aktivieren' });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(global.fetch.mock.calls.filter(([path]) => path.endsWith('/push'))).toHaveLength(0);
  });

  it.each([
    ['schweizer', 'forme', 'mit_buchholz', ['Platz', 'Team', 'Siege', 'BHZ', 'FBHZ', 'Punkte+', 'Punkte−', 'Δ'], ['1', 'Anna Muster', '1', '5', '12', '13', '5', '8']],
    ['schweizer', 'forme', 'ohne_buchholz', ['Platz', 'Team', 'Siege', 'Punkte+', 'Punkte−', 'Δ'], ['1', 'Anna Muster', '1', '13', '5', '8']],
    ['formule_x', 'forme', null, ['Platz', 'Team', 'Siege', 'Wertung', 'Niederlagen', 'Punkte+', 'Punkte−', 'Δ'], ['1', 'Anna Muster', '1', '121', '0', '13', '5', '8']],
    ['rangliste', 'supermelee', null, ['Platz', 'Spieler', 'Siege', 'Niederlagen', 'Spieldifferenz', 'Punkte+', 'Punkte−', 'Δ'], ['1', 'Anna Muster', '1', '0', '1', '13', '5', '8']],
    ['jeder_gegen_jeden', 'forme', null, ['Platz', 'Team', 'Siege', 'Niederlagen', 'Spieldifferenz', 'Punkte+', 'Punkte−', 'Δ'], ['1', 'Anna Muster', '1', '0', '1', '13', '5', '8']],
    ['maastrichter', 'forme', 'mit_buchholz', ['Platz', 'Team', 'Siege', 'BHZ', 'FBHZ', 'Punkte+', 'Punkte−', 'Δ'], ['1', 'Anna Muster', '1', '5', '12', '13', '5', '8']],
  ])('zeigt die passende Rangliste für %s / %s / %s', async (type, registrationType, schweizerRankingMode, headers, values) => {
    const payload = livePayload();
    Object.assign(payload.tournament, { type, registrationType, schweizerRankingMode });
    Object.assign(payload.live.ranking[0], { bhz: 5, fbhz: 12, wertung: 121, losses: 0, gameDiff: 1, pointsFor: 13, pointsAgainst: 5 });
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(payload));
    renderDetail();
    const table = await screen.findByRole('table', { hidden: true });
    fireEvent.click(screen.getByText('Rangliste anzeigen'));
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(headers);
    const own = table.querySelector('.live-own-row');
    expect(within(own).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(values);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('zeigt keine generische Rangliste für K.O.', async () => {
    const payload = livePayload();
    payload.tournament.type = 'ko';
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(payload));
    renderDetail();
    await screen.findByText('Sommer-Supermêlée');
    expect(screen.queryByText('Rangliste anzeigen')).not.toBeInTheDocument();
  });

  it('zeigt keinen Beta-Hinweis mehr', () => {
    render(
      <PlayerLivePage
        route={{}}
        language="de"
        setLanguage={() => {}}
        menuOpen={false}
        setMenuOpen={() => {}}
        navigate={() => {}}
        currentUser={null}
        isAdmin={false}
        onSelectAdminDashboard={() => {}}
        onLogout={() => {}}
        onLogin={() => {}}
        drawerContent={null}
      />,
    );

    expect(screen.queryByText('Beta – noch im Testbetrieb')).not.toBeInTheDocument();
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

  it('zeigt vor Turnierstart Status, Check-in und fehlende Auslosung der eigenen Anmeldung', async () => {
    const payload = livePayload({ lastRoundNumber: null, currentMatch: null, history: [], ranking: [], rankingPlace: null, rankingSize: 0 });
    payload.tournament.status = 'registration';
    Object.assign(payload.registration, { status: 'waitlist', participation: 'inactive', incomplete: true, registrationType: 'melee', meleeTeammates: null });
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(payload)));
    renderDetail();

    expect(await screen.findByText('Das Turnier hat noch nicht begonnen.')).toBeInTheDocument();
    expect(screen.getByText('Anmeldestatus: Warteliste')).toBeInTheDocument();
    expect(screen.getByText('Noch nicht eingecheckt.')).toBeInTheDocument();
    expect(screen.getByText('Team noch unvollständig.')).toBeInTheDocument();
    expect(screen.getByText('Dein Team wird kurz vor Turnierstart gebildet.')).toBeInTheDocument();
    expect(screen.queryByText('Noch keine Runde gestartet.')).not.toBeInTheDocument();
  });

  it('kennzeichnet die Live-Ansicht nach Turnierende, ohne persönliche Ergebnisse zu erlauben', async () => {
    const payload = livePayload();
    payload.tournament.status = 'finished';
    payload.tournament.playerResultReportingEnabled = true;
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(payload)));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LiveDetail queryKey={['live', 'registration', 'r1']} path="/api/live/registrations/r1" language="de" canReportResult />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Das Turnier ist beendet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Eigene Punkte')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ergebnis melden' })).not.toBeInTheDocument();
  });

  it.each(TOURNAMENT_TYPES)('meldet das Ergebnis für $label aus eigener Sicht', async ({ value: type }) => {
    const initial = livePayload();
    initial.tournament.type = type;
    initial.tournament.playerResultReportingEnabled = true;
    const updated = livePayload();
    updated.tournament.type = type;
    updated.tournament.playerResultReportingEnabled = true;
    updated.live.currentMatch.ownScore = 13;
    updated.live.currentMatch.opponentScore = 7;
    updated.live.currentMatch.outcome = 'won';
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(initial))
      .mockResolvedValueOnce(jsonResponse(updated));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LiveDetail queryKey={['live', 'registration', 'r1']} path="/api/live/registrations/r1" language="de" canReportResult />
      </QueryClientProvider>,
    );

    await screen.findByLabelText('Eigene Punkte');
    fireEvent.change(screen.getByLabelText('Eigene Punkte'), { target: { value: '13' } });
    fireEvent.change(screen.getByLabelText('Gegnerische Punkte'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ergebnis melden' }));

    expect(await screen.findByText('Ergebnis gemeldet.')).toHaveAttribute('role', 'status');
    expect(global.fetch).toHaveBeenLastCalledWith('/api/live/registrations/r1/result', expect.objectContaining({ method: 'POST' }));

    const nextRound = livePayload();
    nextRound.tournament.playerResultReportingEnabled = true;
    nextRound.live.lastRoundNumber = 3;
    nextRound.live.currentMatch = { ...nextRound.live.currentMatch, matchId: 'm3', roundNumber: 3 };
    client.setQueryData(['live', 'registration', 'r1'], nextRound);
    await waitFor(() => expect(screen.queryByText('Ergebnis gemeldet.')).not.toBeInTheDocument());
  });

  it.each([
    ['die Turnierleitung die Meldung nicht freigibt', (payload) => { payload.tournament.playerResultReportingEnabled = false; }],
    ['das Turnier beendet ist', (payload) => { payload.tournament.playerResultReportingEnabled = true; payload.tournament.status = 'finished'; }],
  ])('blendet die Ergebnismeldung aus, wenn %s', async (_reason, changePayload) => {
    const payload = livePayload();
    changePayload(payload);
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(payload)));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LiveDetail queryKey={['live', 'registration', 'r1']} path="/api/live/registrations/r1" language="de" canReportResult />
      </QueryClientProvider>,
    );

    await screen.findByText('Sommer-Supermêlée');
    expect(screen.queryByLabelText('Eigene Punkte')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ergebnis melden' })).not.toBeInTheDocument();
  });

  it.each([
    ['abgeschalteter Meldung', (payload) => { payload.tournament.playerResultReportingEnabled = false; }, true],
    ['Desktop-Durchführung', (payload) => { payload.tournament.playerResultReportingEnabled = true; payload.tournament.desktopExecution = true; }, true],
    ['freigegebener Meldung', (payload) => { payload.tournament.playerResultReportingEnabled = true; }, false],
    ['beendetem Turnier', (payload) => { payload.tournament.status = 'finished'; }, false],
  ])('zeigt den Turnierleitungs-Hinweis passend bei %s', async (_reason, changePayload, shown) => {
    const payload = livePayload();
    changePayload(payload);
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(payload)));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LiveDetail queryKey={['live', 'registration', 'r1']} path="/api/live/registrations/r1" language="de" canReportResult />
      </QueryClientProvider>,
    );

    await screen.findByText('Sommer-Supermêlée');
    const hint = screen.queryByText('Die Ergebnismeldung über die Live-Ansicht ist abgeschaltet. Bitte melde dein Ergebnis direkt bei der Turnierleitung.');
    if (shown) expect(hint).toBeInTheDocument();
    else expect(hint).not.toBeInTheDocument();
  });

  it('sperrt die Ergebnismeldung während des Speicherns gegen Doppelklicks', async () => {
    const initial = livePayload();
    initial.tournament.playerResultReportingEnabled = true;
    let finish;
    const saving = new Promise((resolve) => { finish = resolve; });
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(initial))
      .mockReturnValueOnce(saving);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LiveDetail queryKey={['live', 'registration', 'r1']} path="/api/live/registrations/r1" language="de" canReportResult />
      </QueryClientProvider>,
    );

    await screen.findByLabelText('Eigene Punkte');
    fireEvent.change(screen.getByLabelText('Eigene Punkte'), { target: { value: '13' } });
    fireEvent.change(screen.getByLabelText('Gegnerische Punkte'), { target: { value: '7' } });
    const button = screen.getByRole('button', { name: 'Ergebnis melden' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    finish(jsonResponse(livePayload()));
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('zeigt einen Fehler beim Speichern eines Spielergebnisses und lässt eine Korrektur zu', async () => {
    const initial = livePayload();
    initial.tournament.playerResultReportingEnabled = true;
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(initial))
      .mockResolvedValueOnce(jsonResponse({ error: 'Das Ergebnis wurde inzwischen geändert.' }, 409));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LiveDetail queryKey={['live', 'registration', 'r1']} path="/api/live/registrations/r1" language="de" canReportResult />
      </QueryClientProvider>,
    );

    const ownScore = await screen.findByLabelText('Eigene Punkte');
    fireEvent.change(ownScore, { target: { value: '13' } });
    fireEvent.change(screen.getByLabelText('Gegnerische Punkte'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ergebnis melden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Das Ergebnis wurde inzwischen geändert.');
    expect(ownScore).toHaveValue(13);
    expect(screen.getByRole('button', { name: 'Ergebnis melden' })).not.toBeDisabled();
  });

  it('meldet einen ungültigen Link sichtbar', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ error: 'Diese Meldung gehört nicht zu deinem Konto' }, 404)));
    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent('Diese Meldung gehört nicht zu deinem Konto');
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

  it('zeigt gelöschte Turniere nicht in der Live-Auswahl', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      registrations: [
        { id: 'r1', label: 'Anna Muster', tournament: { name: 'Aktives Turnier', date: '2026-09-25', status: 'running' } },
        { id: 'r2', deleted: true, label: 'Bert Beispiel', tournament: { name: 'Gelöschtes Turnier', deleted: true } },
      ],
    })));
    renderList();

    expect(await screen.findByText('Aktives Turnier')).toBeInTheDocument();
    expect(screen.queryByText('Gelöschtes Turnier')).not.toBeInTheDocument();
    expect(screen.queryByText('Das Turnier wurde vom Veranstalter gelöscht.')).not.toBeInTheDocument();
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

  it('zeigt ohne Zugriff keinen zwischengespeicherten Stand mehr, sondern den Weg zur eigenen Liste', async () => {
    const payload = livePayload();
    payload.tournament.status = 'registration';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ error: 'Anmeldung nicht gefunden' }, 404));
    const navigate = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['live', 'registration', 'r1'], payload);
    render(
      <QueryClientProvider client={client}>
        <LiveDetail queryKey={['live', 'registration', 'r1']} path="/api/live/registrations/r1" language="de"
          navigate={navigate} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Für diese Anmeldung gibt es keine Live-Ansicht.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Anmeldung nicht gefunden');
    expect(screen.queryByText(/Anna Muster/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zu meinen Live-Turnieren' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/live'));
  });

  it('merkt sich einen geöffneten persönlichen Link auf dem Gerät und vergisst ihn wieder', async () => {
    localStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(livePayload()));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <LiveDetail queryKey={['live', 'token', 'tok1']} path="/api/live/token/tok1" language="de" token="tok1" />
      </QueryClientProvider>,
    );
    await screen.findAllByText('Bert Beispiel');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/live/token/tok1', expect.anything());
    expect(screen.queryByRole('button', { name: 'Das bin ich nicht' })).not.toBeInTheDocument();
    await waitFor(() => expect(readRememberedTeams()).toEqual([
      { token: 'tok1', registrationId: 'r1', tournamentName: 'Sommer-Supermêlée', date: '2026-09-25', location: 'Linden', label: 'Anna Muster' },
    ]));
    unmount();

    const navigate = vi.fn();
    render(<RememberedTeams navigate={navigate} language="de" />);
    fireEvent.click(screen.getByRole('button', { name: /Sommer-Supermêlée/ }));
    expect(navigate).toHaveBeenCalledWith('/live/t/tok1');
    fireEvent.click(screen.getByRole('button', { name: 'Vergessen' }));
    expect(readRememberedTeams()).toEqual([]);
    expect(screen.queryByText('Auf diesem Gerät gemerkt')).not.toBeInTheDocument();
  });

  it('öffnet einen Push-Link auf /live/<Meldung> über den auf dem Gerät gemerkten Link, ohne Login', async () => {
    localStorage.setItem('ptm_live_teams', JSON.stringify([{ token: 'tok1', registrationId: 'r1', tournamentName: 'Sommer-Supermêlée', date: '2026-09-25' }]));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(livePayload()));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PlayerLivePage route={matchLiveRoute('/live/r1')} language="de" setLanguage={() => {}} menuOpen={false} setMenuOpen={() => {}}
          navigate={() => {}} currentUser={null} isAdmin={false} onSelectAdminDashboard={() => {}} onLogout={() => {}} onLogin={() => {}}
          drawerContent={null} postboxControl={null} />
      </QueryClientProvider>,
    );

    await screen.findAllByText('Bert Beispiel');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/live/token/tok1', expect.anything());
  });

  it('lädt einen persönlichen Live-Link auch mit Konto ausschließlich über den Link', async () => {
    localStorage.clear();
    const payload = livePayload();
    payload.tournament.playerResultReportingEnabled = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(payload));
    renderPlayerLivePage(matchLiveRoute('/live/t/tok1'), { id: 'player' });

    await screen.findAllByText('Bert Beispiel');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/live/token/tok1', expect.anything());
    expect(screen.queryByLabelText('Eigene Punkte')).not.toBeInTheDocument();
  });

  it('lädt die eigene Meldung mit Konto über den Nutzerzugriff, auch wenn ein Link gemerkt ist', async () => {
    localStorage.setItem('ptm_live_teams', JSON.stringify([{ token: 'tok1', registrationId: 'r1', tournamentName: 'Sommer-Supermêlée', date: '2026-09-25' }]));
    const payload = livePayload();
    payload.tournament.playerResultReportingEnabled = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(payload));
    renderPlayerLivePage(matchLiveRoute('/live/r1'), { id: 'player' });

    expect(await screen.findByLabelText('Eigene Punkte')).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/live/registrations/r1', expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/live/token/tok1', expect.anything());
  });

  it('vergisst einen ungültigen persönlichen Link', async () => {
    localStorage.setItem('ptm_live_teams', JSON.stringify([{ token: 'alt', tournamentName: 'Alt', date: '2026-09-25' }]));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ error: 'Dieser Live-Link ist ungültig oder abgelaufen' }, 404));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LiveDetail queryKey={['live', 'token', 'alt']} path="/api/live/token/alt" language="de" token="alt" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Für diese Anmeldung gibt es keine Live-Ansicht.')).toBeInTheDocument();
    await waitFor(() => expect(readRememberedTeams()).toEqual([]));
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
