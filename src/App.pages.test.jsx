import { useState } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18next from './lib/i18next-config.js';
import { EditDialog, HomeTournaments, nextTournamentInfoCardIndex, ProfilePanel, PublicRegistrationPanel } from './App.jsx';
import { ClubBadge, DistanceBadge } from './components/ui.jsx';
import { AppHeader, SavedSearchesControl, SearchMenuControl } from './components/layout.jsx';
import { EMPTY_REGISTRATION_FORM, EMPTY_TOURNAMENT_FORM } from './lib/constants.js';
import { TournamentForm, TournamentList } from './pages/TournamentManagement.jsx';
import { RegistrationForm, RegistrationsPanel } from './pages/RegistrationsManagement.jsx';
import { UserManagementPanel } from './pages/UserManagementPanel.jsx';
import { ClubModerationPanel } from './pages/ClubModerationPanel.jsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.jsx';
import { TournamentInfo } from './pages/TournamentDetailPage.jsx';
import { RichText } from './components/RichText.jsx';
import { TournamentReportPage } from './pages/TournamentReportPage.jsx';
import { clubLogoImageUrl, clubMatchesTournament, formatLocationAddress, hasOnlineRegistrationAvailable, registrationStatusLabel, tournamentPayload } from './lib/domain.js';

describe('Turnier-Payload', () => {
  it('behält den Verein eines bearbeiteten Kalendereintrags bei', () => {
    expect(tournamentPayload({ ...EMPTY_TOURNAMENT_FORM, club: 'BC Linden' }).club).toBe('BC Linden');
  });

  it('schlägt beim Bearbeiten eines Kalendereintrags Vereine aus der DB vor', () => {
    const { container } = render(
      <TournamentForm
        form={{ ...EMPTY_TOURNAMENT_FORM, id: 't1', registrationEnabled: false, club: '' }}
        setForm={() => {}}
        onSubmit={(event) => event.preventDefault()}
        onCancel={() => {}}
        mode="edit"
        language="de"
        clubNames={['BC Linden']}
      />,
    );

    const listId = screen.getByLabelText(/^Verein/).getAttribute('list');
    expect(container.querySelector(`datalist[id="${listId}"] option`).value).toBe('BC Linden');
  });

  it('zeigt in der Turnierverwaltung den Owner in der Liste', () => {
    const noop = () => {};
    render(
      <TournamentList
        tournaments={[{ id: 't1', name: 'Herbstturnier', date: '2026-10-10', location: 'Ort', registrationEnabled: true, status: 'registration', canManage: true,
          owner: { id: 'u1', firstName: 'Lea', lastName: 'Leitung', username: 'lea' } }]}
        totalTournaments={1} selectedId="" onSelect={noop} onEdit={noop} onDelete={noop} isAdmin={false} language="de" onCreate={noop}
        query="" onQueryChange={noop} statusFilter="" onStatusFilterChange={noop} hideCalendarEntries={false} onHideCalendarEntriesChange={noop} onResetFilters={noop}
      />,
    );

    expect(screen.getByText('Owner:').closest('small')).toHaveTextContent('Owner: Lea Leitung @lea');
  });

  it('zeigt beim Bearbeiten den Owner oben in der Bearbeiterliste', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ editors: [{ id: 'u2', firstName: 'Ed', lastName: 'Editor' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(
      <TournamentForm
        form={{ ...EMPTY_TOURNAMENT_FORM, id: 't1', ownerId: 'u1' }}
        setForm={() => {}}
        onSubmit={(event) => event.preventDefault()}
        onCancel={() => {}}
        mode="edit"
        language="de"
        currentUser={{ id: 'u1' }}
        owner={{ id: 'u1', firstName: 'Lea', lastName: 'Leitung', username: 'lea' }}
        editorCandidates={[]}
      />,
    );

    expect(await screen.findByText('Ed Editor')).toBeInTheDocument();
    const ownerEntry = screen.getByText('Lea Leitung').closest('li');
    expect(within(ownerEntry).getByText('Owner')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('erfasst Teilnehmerfragen in einer mehrzeiligen Textbox', () => {
    render(
      <TournamentForm
        form={{ ...EMPTY_TOURNAMENT_FORM, registrationEnabled: true, registrationQuestions: [{ id: 'q1', label: 'Mittagessen?' }] }}
        setForm={() => {}}
        onSubmit={(event) => event.preventDefault()}
        onCancel={() => {}}
        mode="create"
        language="de"
      />,
    );

    const field = screen.getByLabelText(/^Frage 1/);
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveValue('Mittagessen?');
    expect(field).toHaveAttribute('maxLength', '250');
    expect(screen.getByText(/Frage 1 \(12\/250\)/)).toBeInTheDocument();
  });

  it('kennzeichnet Kalendereinträge unabhängig vom Turnierstatus als Kalendereintrag', () => {
    expect(registrationStatusLabel({ status: 'running', registrationEnabled: false }, 'de')).toBe('Kalendereintrag');
    expect(registrationStatusLabel({ status: 'registration', registrationEnabled: false }, 'de')).toBe('Kalendereintrag');
  });

  it('zeigt in der Übersicht den laufenden Turnierstatus statt einer Anmelde-Meldung', () => {
    expect(registrationStatusLabel({ status: 'running', registrationEnabled: true }, 'de')).toBe('Läuft');
    expect(registrationStatusLabel({ status: 'running', registrationEnabled: true }, 'en')).toBe('Running');
  });

  it('erkennt nur verfügbare öffentliche Online-Anmeldungen', () => {
    const tournament = { visibility: 'public', registrationEnabled: true, status: 'registration', maxRegistrations: 16, activeRegistrations: 15, waitlistEnabled: false };
    expect(hasOnlineRegistrationAvailable(tournament)).toBe(true);
    expect(hasOnlineRegistrationAvailable({ ...tournament, registrationEnabled: false })).toBe(false);
    expect(hasOnlineRegistrationAvailable({ ...tournament, visibility: 'private' })).toBe(false);
    expect(hasOnlineRegistrationAvailable({ ...tournament, activeRegistrations: 16 })).toBe(false);
    expect(hasOnlineRegistrationAvailable({ ...tournament, activeRegistrations: 16, waitlistEnabled: true })).toBe(true);
  });
});

describe('Vereinsfilter', () => {
  it('findet Turniere über identische Koordinaten eines Vereins-Spielorts', () => {
    const club = { locations: [{ latitude: 50.52, longitude: 8.58 }] };
    expect(clubMatchesTournament(club, { latitude: 50.52, longitude: 8.58 })).toBe(true);
    expect(clubMatchesTournament(club, { latitude: 50.5201, longitude: 8.58 })).toBe(false);
  });
});

describe('Entfernungs-Badge', () => {
  it('zeigt bei berechneter Entfernung eine hervorgehobene, gerundete Angabe', () => {
    render(<DistanceBadge distanceKm={12.6} />);

    expect(screen.getByText('13 km entfernt')).toBeInTheDocument();
    expect(document.querySelector('.distance-badge')).toBeInTheDocument();
  });

  it('bleibt ohne aktive Umkreissuche unsichtbar', () => {
    const { container } = render(<DistanceBadge distanceKm={undefined} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('Turnier-Finder', () => {
  const finderProps = {
    language: 'de', query: '', showMineFilter: false, onlyMine: false,
    filterMonth: '', filterFormation: '', filterRegistrationType: '', filterType: '', filterClub: '',
    filterOpenOnly: false, filterOnlineRegistrationOnly: false, searchOrigin: null, searchRadiusKm: '25',
    total: 5, hasMore: false, onLoadMore: () => {}, onRegister: () => {}, onOpenTournament: () => {}, onOpenFilters: () => {}, onOpenRadiusSearch: () => {},
  };
  const finderTournaments = Array.from({ length: 5 }, (_, index) => ({
    id: `finder-${index}`, name: `Turnier ${index + 1}`, location: 'Linden', date: '2026-10-20', formation: 'doublette', registrationType: 'forme', type: 'ko', status: 'registration', visibility: 'public', activeRegistrations: 0, maxRegistrations: 16,
  }));

  it('setzt die hervorgehobene Infokarte nach das vierte Turnier', () => {
    sessionStorage.setItem('ptm_tournament_info_card_index', '3');
    const { container } = render(<HomeTournaments {...finderProps} tournaments={finderTournaments} />);

    const list = container.querySelector('.tournament-card-list');
    expect(list.children).toHaveLength(6);
    expect(list.children[4]).toHaveClass('tournament-info-card');
    expect(within(list.children[4]).getByRole('link', { name: 'PTM Desktop entdecken' })).toHaveAttribute('href', 'https://michaelmassee.github.io/Petanque-Turnier-Manager/');

    render(<HomeTournaments {...finderProps} tournaments={finderTournaments.slice(0, 3)} total={3} />);
    expect(screen.getAllByLabelText('Entdecke PTM Online')).toHaveLength(1);
  });

  it('blendet die Infokarte bei Suche oder Umkreissuche aus', () => {
    const { container, rerender } = render(<HomeTournaments {...finderProps} query="Linden" tournaments={finderTournaments} />);
    expect(container.querySelector('.tournament-info-card')).not.toBeInTheDocument();

    rerender(<HomeTournaments {...finderProps} searchOrigin={{ label: 'Linden' }} tournaments={finderTournaments} />);
    expect(container.querySelector('.tournament-info-card')).not.toBeInTheDocument();

    rerender(<HomeTournaments {...finderProps} filterMonth="2026-10" tournaments={finderTournaments} />);
    expect(container.querySelector('.tournament-info-card')).not.toBeInTheDocument();
  });

  it('rotiert die Infokarten robust über den Sitzungsspeicher', () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };

    expect(nextTournamentInfoCardIndex(storage)).toBe(0);
    expect(nextTournamentInfoCardIndex(storage)).toBe(1);
    values.set('ptm_tournament_info_card_index', 'invalid');
    expect(nextTournamentInfoCardIndex(storage)).toBe(0);
    expect(nextTournamentInfoCardIndex({ getItem: () => { throw new Error('Speicher gesperrt'); } })).toBe(0);
  });

  it('kennzeichnet einen Suchtext als aktiven Filter', () => {
    render(
      <HomeTournaments
        language="de"
        query="Linden"
        showMineFilter={false}
        onlyMine={false}
        filterMonth=""
        filterFormation=""
        filterRegistrationType=""
        filterType=""
        filterClub=""
        filterOpenOnly={false}
        filterOnlineRegistrationOnly={false}
        searchOrigin={null}
        searchRadiusKm="25"
        tournaments={[]}
        total={0}
        hasMore={false}
        onLoadMore={() => {}}
        onRegister={() => {}}
        onOpenTournament={() => {}}
        onOpenFilters={() => {}}
        onOpenRadiusSearch={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: /Filter aktiv/ })).toBeInTheDocument();
  });

  it('entfernt einen aktiven Suchtext direkt über sein Badge', () => {
    const onClearQuery = vi.fn();
    render(
      <HomeTournaments
        language="de" query="Linden" showMineFilter={false} onlyMine={false}
        filterMonth="" filterFormation="" filterRegistrationType="" filterType="" filterOpenOnly={false} filterOnlineRegistrationOnly={false}
        filterClub=""
        searchOrigin={null} searchRadiusKm="25" onClearQuery={onClearQuery}
        tournaments={[]} total={0} hasMore={false} onLoadMore={() => {}} onRegister={() => {}} onOpenTournament={() => {}} onOpenFilters={() => {}} onOpenRadiusSearch={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Entfernen: Linden' }));
    expect(onClearQuery).toHaveBeenCalledTimes(1);
  });

  it('trennt Filter und Umkreissuche in zugängliche Tabs', () => {
    const setActiveTab = vi.fn();
    render(
      <SearchMenuControl
        open onToggle={() => {}} onClose={() => {}} activeTab="filters" setActiveTab={setActiveTab}
        query="" setQuery={() => {}} showMineFilter={false} onlyMine={false} setOnlyMine={() => {}}
        filterMonth="" setFilterMonth={() => {}} filterFormation="" setFilterFormation={() => {}} filterRegistrationType="" setFilterRegistrationType={() => {}} filterType="" setFilterType={() => {}}
        filterClub="" setFilterClub={() => {}} clubs={[]}
        filterOpenOnly={false} setFilterOpenOnly={() => {}} filterOnlineRegistrationOnly={false} setFilterOnlineRegistrationOnly={() => {}} onResetFilters={() => {}}
        searchOrigin={null} searchOriginQuery="" setSearchOriginQuery={() => {}} onSearchOriginSubmit={(event) => event.preventDefault()} onSearchOriginSelect={() => {}} onUseMyLocation={() => {}} onClearSearchOrigin={() => {}}
        searchRadiusKm="25" setSearchRadiusKm={() => {}} geoLoading={false} geoError="" canSaveSearch={false}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Umkreissuche' }));
    expect(setActiveTab).toHaveBeenCalledWith('radius');
  });

  it('gleicht den Suchdialog mit Schließen und Button-Aktionen an Postbox und Bookmarks an', () => {
    const onClose = vi.fn();
    const onResetFilters = vi.fn();
    const onSaveSearch = vi.fn();
    render(
      <SearchMenuControl
        open onToggle={() => {}} onClose={onClose} activeTab="filters" setActiveTab={() => {}}
        query="" setQuery={() => {}} showMineFilter={false} onlyMine={false} setOnlyMine={() => {}}
        filterMonth="" setFilterMonth={() => {}} filterFormation="" setFilterFormation={() => {}} filterRegistrationType="" setFilterRegistrationType={() => {}} filterType="" setFilterType={() => {}}
        filterClub="" setFilterClub={() => {}} clubs={[]}
        filterOpenOnly={false} setFilterOpenOnly={() => {}} filterOnlineRegistrationOnly={false} setFilterOnlineRegistrationOnly={() => {}} onResetFilters={onResetFilters}
        searchOrigin={null} searchOriginQuery="" setSearchOriginQuery={() => {}} onSearchOriginSubmit={(event) => event.preventDefault()} onSearchOriginSelect={() => {}} onUseMyLocation={() => {}} onClearSearchOrigin={() => {}}
        searchRadiusKm="25" setSearchRadiusKm={() => {}} geoLoading={false} geoError="" canSaveSearch onSaveSearch={onSaveSearch}
      />,
    );

    const searchDialog = screen.getByRole('search');
    expect(within(searchDialog).getByRole('heading', { name: 'Suche' })).toBeInTheDocument();
    fireEvent.click(within(searchDialog).getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    const resetButton = within(searchDialog).getByRole('button', { name: 'Zurücksetzen' });
    expect(resetButton).toHaveClass('button');
    fireEvent.click(resetButton);
    expect(onResetFilters).toHaveBeenCalledTimes(1);
    fireEvent.click(within(searchDialog).getByRole('button', { name: 'Diese Suche speichern' }));
    expect(onSaveSearch).toHaveBeenCalledTimes(1);
  });

  it('filtert nach einem Verein über die durchsuchbare Kombobox', () => {
    const setFilterClub = vi.fn();
    render(
      <SearchMenuControl
        open onToggle={() => {}} onClose={() => {}} activeTab="filters" setActiveTab={() => {}}
        query="" setQuery={() => {}} showMineFilter={false} onlyMine={false} setOnlyMine={() => {}}
        filterMonth="" setFilterMonth={() => {}} filterFormation="" setFilterFormation={() => {}} filterRegistrationType="" setFilterRegistrationType={() => {}} filterType="" setFilterType={() => {}}
        filterClub="" setFilterClub={setFilterClub} clubs={[{ id: 'club-1', name: 'BC Linden' }]} currentUserId="user-1"
        filterOpenOnly={false} setFilterOpenOnly={() => {}} filterOnlineRegistrationOnly={false} setFilterOnlineRegistrationOnly={() => {}} onResetFilters={() => {}}
        searchOrigin={null} searchOriginQuery="" setSearchOriginQuery={() => {}} onSearchOriginSubmit={(event) => event.preventDefault()} onSearchOriginSelect={() => {}} onUseMyLocation={() => {}} onClearSearchOrigin={() => {}}
        searchRadiusKm="25" setSearchRadiusKm={() => {}} geoLoading={false} geoError="" canSaveSearch={false}
      />,
    );

    fireEvent.focus(screen.getByRole('combobox', { name: 'Verein' }));
    fireEvent.click(screen.getByRole('button', { name: 'Als Favorit markieren/entfernen' }));
    expect(screen.getByRole('button', { name: 'Als Favorit markieren/entfernen' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('option', { name: 'BC Linden' }));
    expect(setFilterClub).toHaveBeenCalledWith('club-1');
  });
});

describe('Ortsadresse', () => {
  it('ordnet eine von Nominatim getrennt gelieferte Hausnummer hinter die Straße ein', () => {
    expect(formatLocationAddress('Clubhaus, 18, Großgasse, Okarben')).toBe('Clubhaus, Großgasse 18, Okarben');
    expect(formatLocationAddress('Boules Brothers, 10-12, Limesstraße, Ostheim')).toBe('Boules Brothers, Limesstraße 10-12, Ostheim');
    expect(formatLocationAddress('Musterweg 7, Linden')).toBe('Musterweg 7, Linden');
  });
});

describe('Vereinslogo', () => {
  it('lädt Vereinslogos über den Same-Origin-Proxy', () => {
    expect(clubLogoImageUrl('place-1')).toBe('/api/places/place-1/club-logo');
  });
});

describe('Spielort-Zuordnung', () => {
  it('kennzeichnet Verein, Gruppe und unabhängigen Bouleplatz unterschiedlich', () => {
    const { rerender } = render(<ClubBadge clubName="BC Linden" clubKind="club" />);
    expect(screen.getByText('Verein')).toBeInTheDocument();

    rerender(<ClubBadge clubName="Boulefreunde" clubKind="group" />);
    expect(screen.getByText('Gruppe')).toBeInTheDocument();

    rerender(<ClubBadge />);
    expect(screen.getByText('Bouleplatz ohne Verein/Gruppe')).toBeInTheDocument();
  });
});

describe('Admin-Dashboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('zeigt offene Vereinsanfragen bei Vereinen und nicht bei Bouleplätzen', async () => {
    vi.spyOn(await import('./lib/api.js'), 'authenticatedApi').mockImplementation((path) => {
      if (path === '/api/admin/dashboard-stats') return Promise.resolve({
        users: 0,
        pendingApiKeys: 0,
        pendingClubRequests: 1,
        pendingPlaces: 0,
        playerListings: 0,
      });
      if (path === '/api/admin/petanque-aktuell/tournaments') return Promise.resolve({
        tournaments: [{ externalKey: 'imported', imported: true }, { externalKey: 'new', imported: false }],
      });
      if (path === '/api/admin/settings/data-retention') return Promise.resolve({ automaticPurgeEnabled: false, dueTournaments: 0 });
      throw new Error(`unerwarteter API-Aufruf: ${path}`);
    });

    render(<AdminDashboardPage onSelectTab={() => {}} onNavigate={() => {}} tournamentsCount={0} registrationsCount={0} />);

    expect(await within(screen.getByRole('button', { name: /Vereine/ })).findByText('1')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Bouleplätze/ })).getByText('0')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Pétanque Aktuell importieren/ })).getByText('1')).toBeInTheDocument();
  });
});

describe('Kopfzeile', () => {
  it('zeigt die Sprachumschaltung dauerhaft in der oberen Leiste', () => {
    const setLanguage = vi.fn();
    render(
      <AppHeader
        heading="Turniere"
        language="de"
        setLanguage={setLanguage}
        menuOpen={false}
        onToggleMenu={() => {}}
        onCloseMenu={() => {}}
      />,
    );

    expect(screen.getByRole('group', { name: 'Sprache' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'English' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sprache: Deutsch' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'English' }));
    expect(setLanguage).toHaveBeenCalledWith('en');
    expect(screen.queryByRole('menu', { name: 'Sprache' })).not.toBeInTheDocument();
  });

  it('gruppiert optionale Controls in einer mobilen scrollbaren Icon-Leiste', () => {
    const { container } = render(
      <AppHeader
        heading="Turniere"
        language="de"
        setLanguage={() => {}}
        menuOpen={false}
        onToggleMenu={() => {}}
        onCloseMenu={() => {}}
        searchControl={<button type="button">Suche</button>}
        savedSearchesControl={<button type="button">Gespeicherte Suchen</button>}
        postboxControl={<button type="button">Postfach</button>}
      />,
    );

    const scrollArea = container.querySelector('.topbar-actions-scroll');
    expect(scrollArea).toContainElement(screen.getByRole('button', { name: 'Suche' }));
    expect(scrollArea).toContainElement(screen.getByRole('button', { name: 'Gespeicherte Suchen' }));
    expect(scrollArea).toContainElement(screen.getByRole('button', { name: 'Postfach' }));
    expect(scrollArea).toContainElement(screen.getByRole('button', { name: 'Menü öffnen' }));
  });

  it('zeigt den angemeldeten Benutzer im Hamburger-Menü unabhängig vom Bereich', () => {
    render(
      <AppHeader
        heading="Boule-Treff"
        language="de"
        setLanguage={() => {}}
        menuOpen
        onToggleMenu={() => {}}
        onCloseMenu={() => {}}
        currentUser={{ firstName: 'Marie', lastName: 'Curie', role: 'user' }}
      />,
    );

    const drawer = screen.getByRole('navigation', { name: 'Hauptmenü' });
    expect(within(drawer).getByText('Marie Curie')).toBeInTheDocument();
    expect(within(drawer).getByText('User')).toBeInTheDocument();
  });

  it('ordnet die Aktionen einer gespeicherten Suche in einer eigenen Kartenfußzeile an', () => {
    const onApply = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <SavedSearchesControl
        open
        savedSearches={[{ id: 'saved-1', name: 'Linden', notifyEnabled: true, searchOrigin: { label: 'Linden' }, radiusKm: '50' }]}
        onToggle={() => {}}
        onClose={() => {}}
        onApply={onApply}
        onToggleNotify={() => {}}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    const card = screen.getByText('Linden').closest('.saved-search-card');
    expect(card).not.toBeNull();
    expect(within(card).getByRole('checkbox', { name: 'Bei neuen Treffern benachrichtigen' })).toBeChecked();
    const actions = card.querySelector('.saved-search-actions');
    expect(actions).toContainElement(within(card).getByRole('button', { name: 'Anwenden' }));
    expect(actions).toContainElement(within(card).getByRole('button', { name: 'Bearbeiten' }));
    expect(actions).toContainElement(within(card).getByRole('button', { name: 'Löschen' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Anwenden' }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: 'saved-1' }));
  });

  it('verlinkt die Anleitung zwischen Boule-Treff und Admin-Dashboard in der Bereichsleiste', () => {
    render(
      <AppHeader
        heading="Turniere"
        language="de"
        setLanguage={() => {}}
        menuOpen={false}
        onToggleMenu={() => {}}
        onCloseMenu={() => {}}
        isAdmin
        onSelectAdminDashboard={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bereiche öffnen' }));

    const wikiLink = screen.getByRole('link', { name: 'Anleitung' });
    expect(wikiLink).toHaveAttribute('href', 'https://github.com/michaelmassee/Petanque-Turnier-Manager-Online/wiki');
    expect(wikiLink).toHaveAttribute('target', '_blank');
    expect(wikiLink).toHaveAttribute('rel', 'noreferrer');

    const menuItems = Array.from(wikiLink.closest('.left-panel').children);
    expect(menuItems.indexOf(screen.getByRole('button', { name: 'Boule-Treff' }))).toBeLessThan(menuItems.indexOf(wikiLink));
    expect(menuItems.indexOf(wikiLink)).toBeLessThan(menuItems.indexOf(screen.getByRole('button', { name: 'Admin Dashboard' })));
  });

  it('zeigt die Unterstützung als letzten Eintrag in der Bereichsleiste statt im Hamburger-Menü', () => {
    render(
      <AppHeader
        heading="Turniere"
        language="de"
        setLanguage={() => {}}
        menuOpen
        onToggleMenu={() => {}}
        onCloseMenu={() => {}}
        isAdmin
        onSelectAdminDashboard={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bereiche öffnen' }));

    const supportLink = screen.getByRole('link', { name: /Unterstützung/ });
    const leftPanel = supportLink.closest('.left-panel');
    expect(leftPanel).not.toBeNull();
    // Saisonale Deko (aria-hidden) zählt nicht als Eintrag.
    const entries = [...leftPanel.children].filter((child) => child.getAttribute('aria-hidden') !== 'true');
    expect(entries.at(-1)).toBe(supportLink);
    expect(within(screen.getByRole('navigation', { name: 'Hauptmenü' })).queryByRole('link', { name: /Unterstützung/ })).not.toBeInTheDocument();
  });
});

describe('Turnier melden', () => {
  afterEach(() => {
    i18next.changeLanguage('de');
  });

  it('rendert die öffentliche Meldeseite in der ausgewählten Sprache', () => {
    i18next.changeLanguage('en');
    render(
      <TournamentReportPage
        language="en"
        setLanguage={() => {}}
        menuOpen={false}
        setMenuOpen={() => {}}
        navigate={() => {}}
        currentUser={null}
        onLogout={() => {}}
        turnstileSiteKey={null}
        verifyStatus=""
      />,
    );

    expect(screen.getByRole('heading', { name: 'Report tournament' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Tournament information/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Other (see description)' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Logo image link/)).not.toBeRequired();
    expect(screen.getByLabelText(/^Flyer image link/)).not.toBeRequired();
    expect(screen.getByRole('button', { name: 'Report tournament' })).toBeInTheDocument();
  });

  it('schlägt im Vereinsfeld die Vereine aus der DB vor', () => {
    const { container } = render(
      <TournamentReportPage
        language="de"
        setLanguage={() => {}}
        menuOpen={false}
        setMenuOpen={() => {}}
        navigate={() => {}}
        currentUser={null}
        onLogout={() => {}}
        turnstileSiteKey={null}
        verifyStatus=""
        clubNames={['BC Linden', 'Boule Club Hamburg']}
      />,
    );

    const listId = screen.getByLabelText(/^Verein/).getAttribute('list');
    expect(listId).toBeTruthy();
    expect([...container.querySelectorAll(`datalist[id="${listId}"] option`)].map((option) => option.value)).toEqual(['BC Linden', 'Boule Club Hamburg']);
  });

  it('belegt Name, E-Mail und Telefon des angemeldeten Nutzers als Kontakt vor', () => {
    render(
      <TournamentReportPage
        language="de"
        setLanguage={() => {}}
        menuOpen={false}
        setMenuOpen={() => {}}
        navigate={() => {}}
        currentUser={{ id: 'u1', firstName: 'Anna', lastName: 'Schmidt', email: 'anna@example.test', phone: '+49 171 1234567', role: 'user' }}
        onLogout={() => {}}
        turnstileSiteKey={null}
        verifyStatus=""
      />,
    );

    expect(screen.getByLabelText(/^Name \(Kontakt\)/)).toHaveValue('Anna Schmidt');
    expect(screen.getByLabelText(/^E-Mail \(Kontakt\)/)).toHaveValue('anna@example.test');
    expect(screen.getByLabelText(/^Telefon \(Kontakt\)/)).toHaveValue('+49 171 1234567');
    expect(screen.getByLabelText(/^Telefon \(Kontakt\)/)).not.toBeRequired();
  });
});

describe('Öffentliche Turnierdetailseite', () => {
  it('zeigt formatierte Turnierbeschreibungen sicher an und lässt bisherigen Klartext unverändert', () => {
    const { rerender } = render(<RichText value={'ptm-richtext:v1:{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Wichtig","marks":[{"type":"bold"},{"type":"underline"}]}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Punkt","marks":[{"type":"strike"}]}]}]}]}]}'} />);

    expect(screen.getByText('Wichtig').tagName).toBe('STRONG');
    expect(screen.getByText('Wichtig').closest('h2')).toBeInTheDocument();
    expect(screen.getByText('Wichtig').closest('u')).toBeInTheDocument();
    expect(screen.getByText('Punkt').closest('s')).toBeInTheDocument();
    expect(screen.getByText('Punkt').closest('ul')).toBeInTheDocument();
    rerender(<RichText value={'<strong>Bestehender Klartext</strong>'} />);
    expect(screen.getByText('<strong>Bestehender Klartext</strong>')).toBeInTheDocument();
    expect(document.querySelector('strong')).toBeNull();
  });

  it('bietet eine auf 250 Zeichen begrenzte private Nachricht an die Turnierleitung an', () => {
    function RegistrationHarness() {
      const [form, setForm] = useState({ ...EMPTY_REGISTRATION_FORM, tournamentId: 'open-1' });
      return (
        <PublicRegistrationPanel
          language="de"
          tournament={{ id: 'open-1', name: 'Offenes Turnier', status: 'registration', visibility: 'public', maxRegistrations: 0, activeRegistrations: 0 }}
          form={form}
          setForm={setForm}
          onSubmit={(event) => event.preventDefault()}
          onCancel={() => {}}
          navigate={() => {}}
        />
      );
    }

    render(<RegistrationHarness />);

    const message = screen.getByLabelText(/^Nachricht an die Turnierleitung/);
    expect(message).toHaveAttribute('maxlength', '250');
    fireEvent.change(message, { target: { value: 'Bitte ohne Mittagessen einplanen.' } });
    expect(screen.getByLabelText(/^Nachricht an die Turnierleitung/)).toHaveValue('Bitte ohne Mittagessen einplanen.');
    expect(screen.getByText('Nachricht an die Turnierleitung (33/250)')).toBeInTheDocument();
  });

  it('gliedert Team- und Teilnehmerangaben in klar beschriftete Bereiche', () => {
    render(
      <PublicRegistrationPanel
        language="de"
        tournament={{ id: 'team-1', name: 'Teamturnier', status: 'registration', visibility: 'public', maxRegistrations: 0, activeRegistrations: 0, formation: 'triplette', registrationType: 'forme', teamNameEnabled: true, licenseRequired: true }}
        form={{ ...EMPTY_REGISTRATION_FORM, tournamentId: 'team-1' }}
        setForm={() => {}}
        onSubmit={(event) => event.preventDefault()}
        onCancel={() => {}}
        navigate={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Team und Spielweise', level: 3 }).closest('.registration-section')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Spieler 1', level: 3 }).closest('.registration-section')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Spieler 2', level: 3 }).closest('.registration-section')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Spieler 3', level: 3 }).closest('.registration-section')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hinweise und Einverständnis', level: 3 }).closest('.registration-section')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Verein')).toHaveLength(3);
    expect(screen.getAllByLabelText(/^Lizenznummer\b/)).toHaveLength(3);
    expect(screen.getAllByLabelText(/^Lizenznummer\b/).every((field) => field.required)).toBe(true);
  });

  it('bietet nur bei einer möglichen Anmeldung Eingabefelder an', () => {
    render(
      <PublicRegistrationPanel
        language="de"
        tournament={{
          id: 'full-1',
          name: 'Ausgebuchtes Turnier',
          status: 'registration',
          visibility: 'public',
          maxRegistrations: 16,
          activeRegistrations: 16,
          waitlistEnabled: false,
        }}
        form={{ ...EMPTY_REGISTRATION_FORM, tournamentId: 'full-1' }}
        setForm={() => {}}
        onSubmit={(event) => event.preventDefault()}
        onCancel={() => {}}
        navigate={() => {}}
      />,
    );

    expect(screen.getByText('Anmeldung nicht mehr möglich')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anmeldung senden' })).not.toBeInTheDocument();
  });

  it('zeigt für Kalendereinträge keine turnier- oder anmeldespezifischen Daten', () => {
    const { container } = render(
      <TournamentInfo
        language="de"
        onShare={() => {}}
        tournament={{
          id: 'calendar-1',
          name: 'Vereinsabend',
          date: '2026-09-10',
          location: 'Bouleplatz',
          logoUrl: 'https://example.test/logo.png',
          description: 'Gemeinsames Spielen.',
          registrationEnabled: false,
          formation: 'triplette',
          registrationType: 'supermelee',
          type: 'rangliste',
          licenseRequired: true,
          entryFeeCents: 500,
          currency: 'EUR',
          maxRegistrations: 32,
          activeRegistrations: 8,
          waitlistRegistrations: 2,
          contactEmail: 'kontakt@example.test',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Vereinsabend' })).toBeInTheDocument();
    expect(container.querySelector('.tournament-info-logo')).toHaveAttribute('src', '/api/tournaments/calendar-1/image?field=logo');
    expect(screen.getByText('Gemeinsames Spielen.')).toBeInTheDocument();
    expect(screen.queryByText('Formation')).not.toBeInTheDocument();
    expect(screen.queryByText('Anmeldetyp')).not.toBeInTheDocument();
    expect(screen.queryByText('Turniersystem')).not.toBeInTheDocument();
    expect(screen.queryByText('Max. Meldungen')).not.toBeInTheDocument();
    expect(screen.queryByText('Warteliste')).not.toBeInTheDocument();
    expect(screen.getByText('Kontakt')).toBeInTheDocument();
    expect(screen.getByText(/kontakt@example.test/)).toBeInTheDocument();
  });

  it('weist auf die notwendige Freigabe durch den Turnierersteller hin', () => {
    render(
      <TournamentInfo
        language="de"
        onShare={() => {}}
        tournament={{
          id: 'approval-1',
          name: 'Herbstturnier',
          date: '2026-10-10',
          location: 'Bouleplatz',
          registrationEnabled: true,
          approvalRequired: true,
          formation: 'doublette',
          registrationType: 'forme',
          type: 'formule_x',
        }}
      />,
    );

    expect(screen.getByText('Anmeldungen müssen vom Turnierersteller bestätigt werden.')).toBeInTheDocument();
  });

  it('zeigt den Ersteller zwischen den Turnierdaten und der Beschreibung', () => {
    render(
      <TournamentInfo
        language="de"
        onShare={() => {}}
        tournament={{
          id: 'c-1', name: 'Herbstturnier', date: '2026-10-10', location: 'Bouleplatz', formation: 'doublette', registrationType: 'forme', type: 'formule_x',
          contactName: 'Kai Kontakt', description: 'Beschreibungstext', createdBy: { firstName: 'Eva', lastName: 'Ersteller', username: 'eva' },
        }}
      />,
    );

    const createdBy = screen.getByText('Turnier wurde erstellt von').closest('p');
    expect(createdBy).toHaveTextContent('Turnier wurde erstellt von: Eva Ersteller @eva');
    const contact = screen.getByText('Kontakt').closest('p');
    const description = screen.getByText('Beschreibungstext');
    expect(contact.compareDocumentPosition(createdBy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(createdBy.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('navigiert bei eigenen Links in der Beschreibung ohne Neuladen, externe Links öffnen normal', () => {
    const onNavigate = vi.fn();
    render(
      <TournamentInfo
        language="de"
        onShare={() => {}}
        onNavigate={onNavigate}
        tournament={{
          id: 'link-1', name: 'Herbstturnier', date: '2026-10-10', location: 'Bouleplatz', formation: 'doublette', registrationType: 'forme', type: 'formule_x',
          description: 'Vorrunde: https://ptmonline.org/turniere/t2/info Flyer: https://example.org/flyer.pdf',
        }}
      />,
    );

    expect(fireEvent.click(screen.getByRole('link', { name: 'https://ptmonline.org/turniere/t2/info' }))).toBe(false);
    expect(onNavigate).toHaveBeenCalledWith('/turniere/t2/info');
    const external = screen.getByRole('link', { name: 'https://example.org/flyer.pdf' });
    expect(external).toHaveAttribute('target', '_blank');
    expect(fireEvent.click(external)).toBe(true);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

describe('Mein Profil', () => {
  it('rendert das Profilformular für einen angemeldeten Benutzer', () => {
    render(
      <ProfilePanel
        currentUser={{ pendingEmail: null }}
        form={{ firstName: 'Anna', lastName: 'Muster', email: 'anna@example.com', club: '', licenseNr: '', currentPassword: '', newPassword: '', newPasswordConfirm: '' }}
        setForm={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Mein Profil' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('anna@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
  });

  it('schlägt im Vereinsfeld die Vereine aus der DB vor', () => {
    const { container } = render(
      <ProfilePanel
        currentUser={{ pendingEmail: null }}
        form={{ firstName: 'Anna', lastName: 'Muster', email: 'anna@example.com', club: '', licenseNr: '', currentPassword: '', newPassword: '', newPasswordConfirm: '' }}
        setForm={() => {}}
        onSubmit={() => {}}
        clubNames={['BC Linden', 'Boule Club Hamburg']}
      />,
    );

    const verein = screen.getByLabelText(/^Verein/);
    const listId = verein.getAttribute('list');
    expect(listId).toBeTruthy();
    expect([...container.querySelectorAll(`datalist[id="${listId}"] option`)].map((option) => option.value)).toEqual(['BC Linden', 'Boule Club Hamburg']);
  });

  it('löscht das Konto erst nach Eingabe der Bestätigung über ein eigenes Formular', () => {
    const onDeleteAccount = vi.fn();
    const onSubmit = vi.fn();
    render(
      <ProfilePanel
        currentUser={{ pendingEmail: null }}
        form={{ firstName: 'Anna', lastName: 'Muster', email: 'anna@example.com', club: '', licenseNr: '', currentPassword: '', newPassword: '', newPasswordConfirm: '' }}
        setForm={() => {}}
        onSubmit={onSubmit}
        onDeleteAccount={onDeleteAccount}
      />,
    );

    const deleteButton = screen.getByRole('button', { name: 'Konto löschen' });
    expect(deleteButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Google-Anmeldung/, { selector: 'input' }), { target: { value: 'Geheim123!' } });
    expect(deleteButton).toBeEnabled();
    fireEvent.click(deleteButton);

    expect(onDeleteAccount).toHaveBeenCalledWith('Geheim123!');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('Benutzer-Seite: Liste + Dialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('öffnet den Dialog vorausgefüllt bei Bearbeiten, Abbrechen schließt ohne Submit, Speichern speichert und schließt', async () => {
    const usersResponse = { users: [
      { id: 'u1', firstName: 'Anna', lastName: 'Admin', email: 'anna@example.com', role: 'admin', emailVerifiedAt: '2024-01-01', passwordChangeRequired: false, tournamentLimit: 5 },
    ] };
    const authenticatedApi = vi.spyOn(await import('./lib/api.js'), 'authenticatedApi').mockImplementation((path, options = {}) => {
      if (path === '/api/users' && (!options.method || options.method === 'GET')) return Promise.resolve(usersResponse);
      if (path === '/api/users/u1' && options.method === 'PUT') return Promise.resolve({ ok: true });
      throw new Error(`unerwarteter API-Aufruf: ${options.method || 'GET'} ${path}`);
    });

    render(<UserManagementPanel currentUser={{ id: 'me' }} tournaments={[]} />);

    await screen.findByText('Anna Admin');
    expect(screen.queryByText('Benutzer bearbeiten')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Bearbeiten'));

    expect(screen.getByText('Benutzer bearbeiten')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Vorname\b/)).toHaveValue('Anna');
    expect(screen.getByLabelText(/^Nachname\b/)).toHaveValue('Admin');

    fireEvent.click(screen.getByText('Abbrechen'));
    expect(screen.queryByText('Benutzer bearbeiten')).not.toBeInTheDocument();
    expect(authenticatedApi).not.toHaveBeenCalledWith('/api/users/u1', expect.objectContaining({ method: 'PUT' }));

    fireEvent.click(screen.getByText('Bearbeiten'));
    fireEvent.click(screen.getByText('Speichern'));

    await screen.findByText('Benutzer wurde aktualisiert.');
    expect(authenticatedApi).toHaveBeenCalledWith('/api/users/u1', expect.objectContaining({ method: 'PUT' }));
    expect(screen.queryByText('Benutzer bearbeiten')).not.toBeInTheDocument();
  });

  it('sperrt Bearbeiten und Löschen für den technischen Turniermelde-Account', async () => {
    vi.spyOn(await import('./lib/api.js'), 'authenticatedApi').mockResolvedValue({
      users: [{ id: 'system-tournament-reports', firstName: 'Turnier', lastName: 'Meldungen (System)', email: 'system-tournament-reports@ptmonline.internal', role: 'user', emailVerifiedAt: '2026-01-01', passwordChangeRequired: false, mailEnabled: false }],
    });

    render(<UserManagementPanel currentUser={{ id: 'admin' }} tournaments={[]} />);

    await screen.findByText('Turnier Meldungen (System)');
    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeDisabled();
  });

  it('lässt einen aktiven Rollenfilter zurücksetzen, auch wenn er alle Benutzer trifft', async () => {
    vi.spyOn(await import('./lib/api.js'), 'authenticatedApi').mockResolvedValue({
      users: [{ id: 'u1', firstName: 'Anna', lastName: 'Admin', email: 'anna@example.com', role: 'admin', emailVerifiedAt: '2024-01-01', passwordChangeRequired: false }],
    });

    render(<UserManagementPanel currentUser={{ id: 'me' }} tournaments={[]} />);

    await screen.findByText('Anna Admin');
    fireEvent.change(screen.getByLabelText('Rolle filtern'), { target: { value: 'admin' } });

    expect(screen.getByRole('button', { name: 'Filter zurücksetzen' })).toBeEnabled();
  });
});

describe('Vereinsmoderation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ermöglicht dem Admin, einen Verein direkt zu bearbeiten', async () => {
    const club = {
      id: 'club-1', name: 'BC Linden', description: 'Boule im Park', websiteUrl: 'https://bc-linden.example',
      contactName: 'Anna Admin', contactEmail: 'anna@example.com', contactPhone: '0123', status: 'published',
      ownerId: 'owner-1', ownerName: 'Anna Admin', ownerEmail: 'anna@example.com', placeCount: 1, editorCount: 1,
    };
    const authenticatedApi = vi.spyOn(await import('./lib/api.js'), 'authenticatedApi').mockImplementation((path, options = {}) => {
      if (path === '/api/admin/club-editor-requests') return Promise.resolve({ requests: [] });
      if (path === '/api/admin/pending-places') return Promise.resolve({ places: [] });
      if (path === '/api/admin/place-reports') return Promise.resolve({ places: [] });
      if (path === '/api/admin/places') return Promise.resolve({ places: [] });
      if (path === '/api/admin/clubs') return Promise.resolve({ clubs: [club] });
      if (path === '/api/users') return Promise.resolve({ users: [] });
      if (path === '/api/admin/clubs/club-1' && options.method === 'PUT') return Promise.resolve({ ok: true });
      throw new Error(`unerwarteter API-Aufruf: ${options.method || 'GET'} ${path}`);
    });

    render(<ClubModerationPanel language="de" />);

    await screen.findByText('BC Linden');
    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));

    expect(screen.getByText('Verein bearbeiten')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name\b/)).toHaveValue('BC Linden');
    expect(screen.getByLabelText(/^Kontakt-E-Mail/)).toHaveValue('anna@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await screen.findByText('Verein aktualisiert.');
    expect(authenticatedApi).toHaveBeenCalledWith('/api/admin/clubs/club-1', expect.objectContaining({ method: 'PUT' }));
  });

  it('listet neue Organisationen unter den offenen Vereinsanfragen und gibt sie dort frei', async () => {
    const pending = { id: 'club-2', name: 'KSG Bönstadt', status: 'pending', ownerName: 'Ada Admin', ownerEmail: 'ada@example.com', placeCount: 1, editorCount: 0 };
    const published = { id: 'club-1', name: 'BC Linden', status: 'published', ownerName: 'Anna Admin', ownerEmail: 'anna@example.com', placeCount: 1, editorCount: 1 };
    const authenticatedApi = vi.spyOn(await import('./lib/api.js'), 'authenticatedApi').mockImplementation((path, options = {}) => {
      if (path === '/api/admin/club-editor-requests') return Promise.resolve({ requests: [] });
      if (path === '/api/admin/pending-places') return Promise.resolve({ places: [] });
      if (path === '/api/admin/place-reports') return Promise.resolve({ places: [] });
      if (path === '/api/admin/places') return Promise.resolve({ places: [] });
      if (path === '/api/admin/clubs') return Promise.resolve({ clubs: [pending, published] });
      if (path === '/api/users') return Promise.resolve({ users: [] });
      if (path === '/api/admin/clubs/club-2/status' && options.method === 'PUT') return Promise.resolve({ ok: true });
      throw new Error(`unerwarteter API-Aufruf: ${options.method || 'GET'} ${path}`);
    });

    render(<ClubModerationPanel language="de" />);

    const offen = (await screen.findByRole('heading', { name: 'Offene Vereinsanfragen' })).closest('.panel');
    expect(within(offen).getByText('1')).toBeInTheDocument();
    expect(within(offen).getByText('KSG Bönstadt')).toBeInTheDocument();
    expect(within(offen).queryByText('BC Linden')).not.toBeInTheDocument();
    fireEvent.click(within(offen).getByRole('button', { name: 'Freigeben' }));

    await screen.findByText('Vereinsstatus aktualisiert.');
    expect(authenticatedApi).toHaveBeenCalledWith('/api/admin/clubs/club-2/status', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ status: 'published' }) }));
  });

  it('ordnet einen Bouleplatz einer Organisation zu', async () => {
    const club = { id: 'club-1', name: 'BC Linden', kind: 'club', status: 'published', ownerName: 'Anna Admin', ownerEmail: 'anna@example.com', placeCount: 0, editorCount: 1 };
    const place = { id: 'place-1', name: 'Boulepark', address: 'Parkweg 1, Linden', venueType: 'outdoor', status: 'published', clubId: null, clubName: null };
    const authenticatedApi = vi.spyOn(await import('./lib/api.js'), 'authenticatedApi').mockImplementation((path, options = {}) => {
      if (path === '/api/admin/club-editor-requests') return Promise.resolve({ requests: [] });
      if (path === '/api/admin/pending-places') return Promise.resolve({ places: [] });
      if (path === '/api/admin/place-reports') return Promise.resolve({ places: [] });
      if (path === '/api/admin/places') return Promise.resolve({ places: [place] });
      if (path === '/api/admin/clubs') return Promise.resolve({ clubs: [club] });
      if (path === '/api/users') return Promise.resolve({ users: [] });
      if (path === '/api/admin/places/place-1/club' && options.method === 'PUT') return Promise.resolve({ ok: true });
      throw new Error(`unerwarteter API-Aufruf: ${options.method || 'GET'} ${path}`);
    });

    render(<ClubModerationPanel language="de" section="places" />);

    await screen.findByText('Boulepark');
    fireEvent.click(screen.getByRole('button', { name: 'Verein zuordnen' }));
    fireEvent.change(screen.getByLabelText('Verein'), { target: { value: 'club-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await screen.findByText('Vereinszuordnung aktualisiert.');
    expect(authenticatedApi).toHaveBeenCalledWith('/api/admin/places/place-1/club', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ clubId: 'club-1' }) }));
  });

  it('zeigt die Bouleplätze eines Vereins direkt in der Vereinsverwaltung', async () => {
    const club = { id: 'club-1', name: 'BC Linden', status: 'published', ownerName: 'Anna Admin', ownerEmail: 'anna@example.com', placeCount: 1, editorCount: 1 };
    const place = { id: 'place-1', name: 'Boulepark', address: 'Parkweg 1, Linden', venueType: 'outdoor', status: 'published', clubId: 'club-1', clubName: 'BC Linden' };
    const authenticatedApi = vi.spyOn(await import('./lib/api.js'), 'authenticatedApi').mockImplementation((path, options = {}) => {
      if (path === '/api/admin/club-editor-requests') return Promise.resolve({ requests: [] });
      if (path === '/api/admin/pending-places') return Promise.resolve({ places: [] });
      if (path === '/api/admin/place-reports') return Promise.resolve({ places: [] });
      if (path === '/api/admin/places') return Promise.resolve({ places: [place] });
      if (path === '/api/admin/clubs') return Promise.resolve({ clubs: [club] });
      if (path === '/api/users') return Promise.resolve({ users: [] });
      if (path === '/api/admin/places/place-1/club' && options.method === 'PUT') return Promise.resolve({ ok: true });
      throw new Error(`unerwarteter API-Aufruf: ${path}`);
    });

    render(<ClubModerationPanel language="de" />);

    await screen.findByText('BC Linden');
    fireEvent.click(screen.getByRole('button', { name: 'Bouleplätze verwalten' }));

    expect(await screen.findByText('Bouleplätze von BC Linden')).toBeInTheDocument();
    expect(screen.getByText('Boulepark')).toBeInTheDocument();
    expect(screen.getByText(/Parkweg 1, Linden/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vereinszuordnung entfernen' }));

    await screen.findByText('Vereinszuordnung entfernt.');
    expect(authenticatedApi).toHaveBeenCalledWith('/api/admin/places/place-1/club', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ clubId: null }) }));
  });
});

function TournamentPageHarness({ onSubmit, visibility = 'private', status = 'registration', includeCalendar = false }) {
  const [tournamentMode, setTournamentMode] = useState('create');
  const [tournamentForm, setTournamentForm] = useState(EMPTY_TOURNAMENT_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hideCalendarEntries, setHideCalendarEntries] = useState(false);
  const tournaments = [
    { id: 't1', name: 'Sommerturnier', location: 'Musterstadt', date: '2026-06-01', formation: 'doublette', registrationType: 'forme', type: 'ko', status, visibility, activeRegistrations: 0, maxRegistrations: 16, waitlistRegistrations: 0, canManage: true },
    ...(includeCalendar ? [{ id: 'calendar-1', name: 'Boulefest', location: 'Musterstadt', date: '2026-06-02', status: 'draft', visibility: 'public', registrationEnabled: false, canManage: true }] : []),
  ];

  function editTournament(tournament) {
    setTournamentMode('edit');
    setTournamentForm({ ...EMPTY_TOURNAMENT_FORM, id: tournament.id, name: tournament.name, location: tournament.location, date: tournament.date });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setTournamentMode('create');
    setTournamentForm(EMPTY_TOURNAMENT_FORM);
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(tournamentForm);
    closeDialog();
  }

  return (
    <>
      <TournamentList
        tournaments={tournaments}
        totalTournaments={tournaments.length}
        selectedId=""
        onSelect={() => {}}
        onEdit={editTournament}
        onDelete={() => {}}
        isAdmin={false}
        language="de"
        onCreate={() => setDialogOpen(true)}
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        hideCalendarEntries={hideCalendarEntries}
        onHideCalendarEntriesChange={setHideCalendarEntries}
        onResetFilters={() => {
          setQuery('');
          setStatusFilter('');
          setHideCalendarEntries(false);
        }}
      />
      <EditDialog open={dialogOpen} wide title={tournamentMode === 'edit' ? 'Turnier bearbeiten' : 'Turnier anlegen'} onClose={closeDialog}>
        <TournamentForm
          form={tournamentForm}
          setForm={setTournamentForm}
          onSubmit={handleSubmit}
          onCancel={closeDialog}
          mode={tournamentMode}
          isAdmin={false}
          language="de"
        />
      </EditDialog>
    </>
  );
}

describe('Turniere-Seite: Trennen vom Turnierdokument', () => {
  const basis = { location: 'Musterstadt', date: '2026-06-01', formation: 'doublette', registrationType: 'forme', type: 'ko', status: 'running', visibility: 'public', activeRegistrations: 0, maxRegistrations: 16, waitlistRegistrations: 0, canManage: true };

  it('bietet das Trennen für verbundene und aus dem Dokument gestartete Turniere an', () => {
    const onDisconnect = vi.fn();
    render(
      <TournamentList
        tournaments={[
          { ...basis, id: 'online', name: 'Online-Turnier' },
          { ...basis, id: 'verbunden', name: 'Verbundenes Turnier', documentManaged: true },
          { ...basis, id: 'gestartet', name: 'Aus Dokument gestartet', desktopExecution: true },
        ]}
        totalTournaments={3}
        selectedId=""
        onSelect={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onDuplicate={() => {}}
        onDisconnect={onDisconnect}
        isAdmin={false}
        language="de"
        onCreate={() => {}}
        query=""
        onQueryChange={() => {}}
        statusFilter=""
        onStatusFilterChange={() => {}}
        onResetFilters={() => {}}
      />,
    );

    const trennen = screen.getAllByRole('button', { name: 'Vom Turnierdokument trennen' });
    expect(trennen).toHaveLength(2);

    fireEvent.click(trennen[1]);
    expect(onDisconnect).toHaveBeenCalledWith(expect.objectContaining({ id: 'gestartet' }));
  });
});

describe('Turniere-Seite: Liste + Dialog', () => {
  it('bestätigt sichtbar, wenn ein Turnierlink in die Zwischenablage kopiert wurde', async () => {
    const share = navigator.share;
    const clipboard = navigator.clipboard;
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    // Geteilt wird der feste Link /q/<qr_token> vom Server – auch bei öffentlichen Turnieren.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ shareUrl: 'https://ptmonline.org/q/fester-link-0001' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    try {
      render(<TournamentPageHarness onSubmit={() => {}} visibility="public" />);
      fireEvent.click(screen.getByRole('button', { name: 'Turnier teilen' }));

      expect(await screen.findByRole('status')).toHaveTextContent('Link kopiert');
      expect(fetchMock).toHaveBeenCalledWith('/api/tournaments/t1/share-link', expect.objectContaining({ method: 'POST' }));
      expect(writeText).toHaveBeenCalledWith('https://ptmonline.org/q/fester-link-0001');
    } finally {
      fetchMock.mockRestore();
      Object.defineProperty(navigator, 'share', { configurable: true, value: share });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    }
  });

  it('lässt aktive Filter zurücksetzen, auch wenn sie alle Turniere treffen', () => {
    render(<TournamentPageHarness onSubmit={() => {}} />);

    fireEvent.change(screen.getByLabelText('Status filtern'), { target: { value: 'registration' } });

    expect(screen.getByRole('button', { name: 'Filter zurücksetzen' })).toBeEnabled();
  });

  it('kann Kalendereinträge in der Turnierverwaltung ausblenden', () => {
    render(<TournamentPageHarness onSubmit={() => {}} includeCalendar />);

    expect(screen.getByText('Boulefest')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Kalendereinträge ausblenden'));

    expect(screen.queryByText('Boulefest')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter zurücksetzen' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(screen.getByText('Boulefest')).toBeInTheDocument();
  });

  it('zeigt beim Bearbeiten die Formatierungs-Toolbar der Turnierbeschreibung', () => {
    render(
      <TournamentForm
        form={{ ...EMPTY_TOURNAMENT_FORM, name: 'Sommerturnier', date: '2026-06-01', location: 'Musterstadt' }}
        setForm={() => {}}
        onSubmit={(event) => event.preventDefault()}
        onCancel={() => {}}
        mode="edit"
        isAdmin={false}
        language="de"
      />,
    );

    expect(screen.getByRole('toolbar', { name: 'Beschreibung' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fett' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kursiv' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unterstrichen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Durchgestrichen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aufzählung' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nummerierte Liste' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Überschrift' })).toBeInTheDocument();
  });

  it('bietet die Live-Ansicht als Turnier-Option an, beim Anlegen ausgeschaltet', () => {
    function LiveOptionHarness() {
      const [form, setForm] = useState({ ...EMPTY_TOURNAMENT_FORM, name: 'Sommerturnier', date: '2026-06-01', location: 'Musterstadt' });
      return <TournamentForm form={form} setForm={setForm} onSubmit={(event) => event.preventDefault()} onCancel={() => {}} mode="create" isAdmin={false} language="de" />;
    }
    render(<LiveOptionHarness />);

    const option = screen.getByRole('checkbox', { name: /^Live-Ansicht für Teilnehmer/ });
    expect(option).not.toBeChecked();
    fireEvent.click(option);
    expect(option).toBeChecked();
  });

  it('bietet beim Bearbeiten eines Kalendereintrags Logo- und Flyer-Bildlink an', () => {
    render(
      <TournamentForm
        form={{ ...EMPTY_TOURNAMENT_FORM, name: 'Stadtmeisterschaft', date: '2026-06-01', location: 'Musterstadt', club: 'BC Linden', registrationEnabled: false }}
        setForm={() => {}}
        onSubmit={(event) => event.preventDefault()}
        onCancel={() => {}}
        mode="edit"
        isAdmin={false}
        language="de"
      />,
    );

    expect(screen.getByLabelText(/^Flyer-Bildlink/)).not.toBeRequired();
    expect(screen.getByLabelText(/^Logo-Bildlink/)).not.toBeRequired();
  });

  it('entfernt einen optionalen Startgeld-Tarif aus dem Turnierformular', () => {
    function FeeTierHarness() {
      const [form, setForm] = useState({
        ...EMPTY_TOURNAMENT_FORM,
        name: 'Sommerturnier',
        date: '2026-06-01',
        location: 'Musterstadt',
        feeTiers: [{ id: 'youth', name: 'Jugend', amount: '3,00', active: true }],
      });
      return <TournamentForm form={form} setForm={setForm} onSubmit={(event) => event.preventDefault()} onCancel={() => {}} mode="edit" isAdmin={false} language="de" />;
    }

    render(<FeeTierHarness />);

    expect(screen.getByDisplayValue('Jugend')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tarif entfernen' }));
    expect(screen.queryByDisplayValue('Jugend')).not.toBeInTheDocument();
  });

  it('bietet bei Turnieren mit verbundenem Dokument statt Bearbeiten die Status-Änderung an', () => {
    const onEditPublication = vi.fn();
    const tournament = { id: 't1', name: 'Dokumentturnier', location: 'Musterstadt', date: '2026-06-01', formation: 'triplette', registrationType: 'supermelee', type: 'rangliste', status: 'draft', visibility: 'private', activeRegistrations: 0, maxRegistrations: 0, waitlistRegistrations: 0, canManage: true, documentManaged: true };
    render(
      <TournamentList tournaments={[tournament]} totalTournaments={1} selectedId="" onSelect={() => {}} onEdit={() => {}} onDelete={() => {}}
        onEditPublication={onEditPublication} isAdmin={false} language="de" onCreate={() => {}} query="" onQueryChange={() => {}}
        statusFilter="" onStatusFilterChange={() => {}} onResetFilters={() => {}} />,
    );

    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Status ändern' }));
    expect(onEditPublication).toHaveBeenCalledWith(tournament);
  });

  it('bietet Teilen auch für private Entwürfe an, nicht aber für öffentliche', () => {
    const { unmount } = render(<TournamentPageHarness onSubmit={vi.fn()} status="draft" />);
    expect(screen.getByRole('button', { name: 'Turnier teilen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Freigabe-Link deaktivieren' })).toBeInTheDocument();
    unmount();

    render(<TournamentPageHarness onSubmit={vi.fn()} status="draft" visibility="public" />);
    expect(screen.queryByRole('button', { name: 'Turnier teilen' })).not.toBeInTheDocument();
  });

  it('öffnet den Dialog vorausgefüllt bei Bearbeiten, Abbrechen schließt ohne Submit, Speichern schließt mit Submit', () => {
    const onSubmit = vi.fn();
    render(<TournamentPageHarness onSubmit={onSubmit} />);

    expect(screen.queryByText('Turnier bearbeiten')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turnier teilen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Freigabe-Link deaktivieren' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Bearbeiten'));

    expect(screen.getByText('Turnier bearbeiten')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name\b/)).toHaveValue('Sommerturnier');

    fireEvent.click(screen.getByText('Abbrechen'));
    expect(screen.queryByText('Turnier bearbeiten')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Bearbeiten'));
    fireEvent.click(screen.getByText('Turnier speichern'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Turnier bearbeiten')).not.toBeInTheDocument();
  });
});

function RegistrationsPageHarness({ onSubmit }) {
  const [registrationMode, setRegistrationMode] = useState('create');
  const [registrationForm, setRegistrationForm] = useState(EMPTY_REGISTRATION_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const tournament = { id: 'tour1', name: 'Sommerturnier', formation: 'tete', registrationType: 'forme', registrationQuestions: [{ id: 'meal', label: 'Vegetarisches Essen?' }], canManage: true };
  const registrations = [
    { id: 'r1', firstName: 'Anna', lastName: 'Muster', email: 'anna@example.com', teamName: 'Team A', organizerMessage: 'Bitte ohne Mittagessen einplanen.', registrationAnswers: [{ participant: 'primary', questionId: 'meal', checked: true }], status: 'pending', isVip: false },
  ];

  function editRegistration(registration) {
    setRegistrationMode('edit');
    setRegistrationForm({ ...EMPTY_REGISTRATION_FORM, id: registration.id, firstName: registration.firstName, lastName: registration.lastName, playerEmail: registration.email });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setRegistrationMode('create');
    setRegistrationForm(EMPTY_REGISTRATION_FORM);
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(registrationForm);
    closeDialog();
  }

  return (
    <>
      <RegistrationsPanel
        tournament={tournament}
        registrations={registrations}
        filteredRegistrations={registrations}
        tournaments={[tournament]}
        onTournamentChange={() => {}}
        onCreate={() => setDialogOpen(true)}
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onResetFilters={() => {
          setQuery('');
          setStatusFilter('');
        }}
        onEdit={editRegistration}
        onDelete={() => {}}
      />
      <EditDialog open={dialogOpen} wide title={registrationMode === 'edit' ? 'Anmeldung bearbeiten' : 'Anmeldung erfassen'} onClose={closeDialog}>
        <RegistrationForm
          form={registrationForm}
          setForm={setRegistrationForm}
          onSubmit={handleSubmit}
          onCancel={closeDialog}
          tournaments={[tournament]}
          selectedTournamentId={tournament.id}
          manageMode
        />
      </EditDialog>
    </>
  );
}

describe('Anmeldungen-Seite: Liste + Dialog', () => {
  it('lässt aktive Filter zurücksetzen, auch wenn sie alle Anmeldungen treffen', () => {
    render(<RegistrationsPageHarness onSubmit={() => {}} />);

    fireEvent.change(screen.getByLabelText('Status filtern'), { target: { value: 'pending' } });

    expect(screen.getByRole('button', { name: 'Filter zurücksetzen' })).toBeEnabled();
  });

  it('öffnet den Dialog vorausgefüllt bei Bearbeiten, Abbrechen schließt ohne Submit, Speichern schließt mit Submit', () => {
    const onSubmit = vi.fn();
    render(<RegistrationsPageHarness onSubmit={onSubmit} />);

    expect(screen.getByText('Bitte ohne Mittagessen einplanen.')).toBeInTheDocument();
    expect(screen.getAllByText('Vegetarisches Essen?')).toHaveLength(2);
    expect(screen.queryByText('Anmeldung bearbeiten')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Bearbeiten'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Anmeldung bearbeiten')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Spieler 1', level: 3 }).closest('.registration-section')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Organisation', level: 3 }).closest('.registration-section')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Vorname\b/)).toHaveValue('Anna');

    fireEvent.click(within(dialog).getByText('Abbrechen'));
    expect(screen.queryByText('Anmeldung bearbeiten')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Bearbeiten'));
    fireEvent.click(screen.getByText('Anmeldung speichern'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Anmeldung bearbeiten')).not.toBeInTheDocument();
  });

  it('markiert das betroffene Feld rot, wenn der Server eine Mehrfachanmeldung meldet', () => {
    const tournament = { id: 'tour1', name: 'Sommerturnier', formation: 'doublette', registrationType: 'forme', teamNameEnabled: true, canManage: true };

    const { rerender } = render(
      <RegistrationForm
        form={EMPTY_REGISTRATION_FORM}
        setForm={() => {}}
        onSubmit={(event) => event.preventDefault()}
        tournaments={[tournament]}
        selectedTournamentId={tournament.id}
        manageMode
      />,
    );

    const player1 = screen.getByRole('heading', { name: 'Spieler 1', level: 3 }).closest('.registration-section');
    expect(within(player1).getByLabelText(/^Vorname\b/)).not.toHaveClass('field-invalid');
    expect(screen.getByLabelText(/^Teamname\b/)).not.toHaveClass('field-invalid');
    expect(player1).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Spieler 2', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Organisation', level: 3 })).toBeInTheDocument();

    rerender(
      <RegistrationForm
        form={EMPTY_REGISTRATION_FORM}
        setForm={() => {}}
        onSubmit={(event) => event.preventDefault()}
        tournaments={[tournament]}
        selectedTournamentId={tournament.id}
        manageMode
        invalidField="firstName"
      />,
    );

    expect(within(player1).getByLabelText(/^Vorname\b/)).toHaveClass('field-invalid');
    expect(within(player1).getByLabelText(/^Nachname\b/)).toHaveClass('field-invalid');
    expect(screen.getByLabelText(/^Teamname\b/)).not.toHaveClass('field-invalid');

    rerender(
      <RegistrationForm
        form={EMPTY_REGISTRATION_FORM}
        setForm={() => {}}
        onSubmit={(event) => event.preventDefault()}
        tournaments={[tournament]}
        selectedTournamentId={tournament.id}
        manageMode
        invalidField="teamName"
      />,
    );

    expect(within(player1).getByLabelText(/^Vorname\b/)).not.toHaveClass('field-invalid');
    expect(screen.getByLabelText(/^Teamname\b/)).toHaveClass('field-invalid');
  });
});
