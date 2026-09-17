import { useState } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18next from './lib/i18next-config.js';
import { EditDialog, ProfilePanel, PublicRegistrationPanel } from './App.jsx';
import { DistanceBadge } from './components/ui.jsx';
import { AppHeader } from './components/layout.jsx';
import { EMPTY_REGISTRATION_FORM, EMPTY_TOURNAMENT_FORM } from './lib/constants.js';
import { TournamentForm, TournamentList } from './pages/TournamentManagement.jsx';
import { RegistrationForm, RegistrationsPanel } from './pages/RegistrationsManagement.jsx';
import { UserManagementPanel } from './pages/UserManagementPanel.jsx';
import { ClubModerationPanel } from './pages/ClubModerationPanel.jsx';
import { TournamentInfo } from './pages/TournamentDetailPage.jsx';
import { TournamentDescription } from './components/TournamentDescription.jsx';
import { TournamentReportPage } from './pages/TournamentReportPage.jsx';
import { hasOnlineRegistrationAvailable, registrationStatusLabel, tournamentPayload } from './lib/domain.js';

describe('Turnier-Payload', () => {
  it('behält den Verein eines bearbeiteten Kalendereintrags bei', () => {
    expect(tournamentPayload({ ...EMPTY_TOURNAMENT_FORM, club: 'BC Linden' }).club).toBe('BC Linden');
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

  it('verlinkt die Wiki zwischen Boule-Treff und Admin-Dashboard in der Bereichsleiste', () => {
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

    const wikiLink = screen.getByRole('link', { name: 'Wiki' });
    expect(wikiLink).toHaveAttribute('href', 'https://github.com/michaelmassee/Petanque-Turnier-Manager-Online/wiki');
    expect(wikiLink).toHaveAttribute('target', '_blank');
    expect(wikiLink).toHaveAttribute('rel', 'noreferrer');

    const menuItems = Array.from(wikiLink.closest('.left-panel').children);
    expect(menuItems.indexOf(screen.getByRole('button', { name: 'Boule-Treff' }))).toBeLessThan(menuItems.indexOf(wikiLink));
    expect(menuItems.indexOf(wikiLink)).toBeLessThan(menuItems.indexOf(screen.getByRole('button', { name: 'Admin Dashboard' })));
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
    expect(screen.getByRole('button', { name: 'Report tournament' })).toBeInTheDocument();
  });
});

describe('Öffentliche Turnierdetailseite', () => {
  it('zeigt formatierte Turnierbeschreibungen sicher an und lässt bisherigen Klartext unverändert', () => {
    const { rerender } = render(<TournamentDescription description={'ptm-richtext:v1:{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Wichtig","marks":[{"type":"bold"},{"type":"underline"}]}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Punkt","marks":[{"type":"strike"}]}]}]}]}]}'} />);

    expect(screen.getByText('Wichtig').tagName).toBe('STRONG');
    expect(screen.getByText('Wichtig').closest('h2')).toBeInTheDocument();
    expect(screen.getByText('Wichtig').closest('u')).toBeInTheDocument();
    expect(screen.getByText('Punkt').closest('s')).toBeInTheDocument();
    expect(screen.getByText('Punkt').closest('ul')).toBeInTheDocument();
    rerender(<TournamentDescription description={'<strong>Bestehender Klartext</strong>'} />);
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
    expect(screen.queryByText('Kontakt')).not.toBeInTheDocument();
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
});

function TournamentPageHarness({ onSubmit }) {
  const [tournamentMode, setTournamentMode] = useState('create');
  const [tournamentForm, setTournamentForm] = useState(EMPTY_TOURNAMENT_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const tournaments = [
    { id: 't1', name: 'Sommerturnier', location: 'Musterstadt', date: '2026-06-01', formation: 'doublette', registrationType: 'forme', type: 'ko', status: 'registration', visibility: 'private', activeRegistrations: 0, maxRegistrations: 16, waitlistRegistrations: 0, canManage: true },
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
        onResetFilters={() => {
          setQuery('');
          setStatusFilter('');
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

describe('Turniere-Seite: Liste + Dialog', () => {
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
    setRegistrationForm({ ...EMPTY_REGISTRATION_FORM, id: registration.id, firstName: registration.firstName, lastName: registration.lastName, email: registration.email });
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
  it('öffnet den Dialog vorausgefüllt bei Bearbeiten, Abbrechen schließt ohne Submit, Speichern schließt mit Submit', () => {
    const onSubmit = vi.fn();
    render(<RegistrationsPageHarness onSubmit={onSubmit} />);

    expect(screen.getByText('Bitte ohne Mittagessen einplanen.')).toBeInTheDocument();
    expect(screen.getByText('Vegetarisches Essen?')).toBeInTheDocument();
    expect(screen.queryByText('Anmeldung bearbeiten')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Bearbeiten'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Anmeldung bearbeiten')).toBeInTheDocument();
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

    expect(screen.getByLabelText(/^Vorname\b/)).not.toHaveClass('field-invalid');
    expect(screen.getByLabelText(/^Teamname\b/)).not.toHaveClass('field-invalid');

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

    expect(screen.getByLabelText(/^Vorname\b/)).toHaveClass('field-invalid');
    expect(screen.getByLabelText(/^Nachname\b/)).toHaveClass('field-invalid');
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

    expect(screen.getByLabelText(/^Vorname\b/)).not.toHaveClass('field-invalid');
    expect(screen.getByLabelText(/^Teamname\b/)).toHaveClass('field-invalid');
  });
});
