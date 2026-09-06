import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  EditDialog,
  EMPTY_REGISTRATION_FORM,
  EMPTY_TOURNAMENT_FORM,
  EMPTY_USER_FORM,
  RegistrationForm,
  RegistrationsPanel,
  TournamentForm,
  TournamentList,
  UserManagementPanel,
} from './App.jsx';

function UserManagementHarness({ onSubmit }) {
  const [userMode, setUserMode] = useState('create');
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('');
  const users = [
    { id: 'u1', firstName: 'Anna', lastName: 'Admin', email: 'anna@example.com', role: 'admin', emailVerifiedAt: '2024-01-01', passwordChangeRequired: false, tournamentLimit: 5 },
  ];

  function editUser(user) {
    setUserMode('edit');
    setUserForm({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      password: '',
      emailVerified: Boolean(user.emailVerifiedAt),
      passwordChangeRequired: Boolean(user.passwordChangeRequired),
      tournamentLimit: user.tournamentLimit,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setUserMode('create');
    setUserForm(EMPTY_USER_FORM);
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(userForm);
    closeDialog();
  }

  return (
    <UserManagementPanel
      users={users}
      stats={{ total: 1, admins: 1, unverified: 0, passwordChangeRequired: 0 }}
      totalUsers={1}
      userMode={userMode}
      currentUser={{ id: 'me' }}
      userForm={userForm}
      setUserForm={setUserForm}
      userQuery={userQuery}
      setUserQuery={setUserQuery}
      userRoleFilter={userRoleFilter}
      setUserRoleFilter={setUserRoleFilter}
      userStatusFilter={userStatusFilter}
      setUserStatusFilter={setUserStatusFilter}
      dialogOpen={dialogOpen}
      onCloseDialog={closeDialog}
      onCreateUser={() => {
        setUserMode('create');
        setUserForm(EMPTY_USER_FORM);
        setDialogOpen(true);
      }}
      onSubmitUser={handleSubmit}
      onEditUser={editUser}
      onDeleteUser={() => {}}
    />
  );
}

describe('Benutzer-Seite: Liste + Dialog', () => {
  it('öffnet den Dialog vorausgefüllt bei Bearbeiten, Abbrechen schließt ohne Submit, Speichern schließt mit Submit', () => {
    const onSubmit = vi.fn();
    render(<UserManagementHarness onSubmit={onSubmit} />);

    expect(screen.queryByText('Benutzer bearbeiten')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Bearbeiten'));

    expect(screen.getByText('Benutzer bearbeiten')).toBeInTheDocument();
    expect(screen.getByLabelText('Vorname')).toHaveValue('Anna');
    expect(screen.getByLabelText('Nachname')).toHaveValue('Admin');

    fireEvent.click(screen.getByText('Abbrechen'));
    expect(screen.queryByText('Benutzer bearbeiten')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Bearbeiten'));
    fireEvent.click(screen.getByText('Speichern'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Benutzer bearbeiten')).not.toBeInTheDocument();
  });
});

function TournamentPageHarness({ onSubmit }) {
  const [tournamentMode, setTournamentMode] = useState('create');
  const [tournamentForm, setTournamentForm] = useState(EMPTY_TOURNAMENT_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const tournaments = [
    { id: 't1', name: 'Sommerturnier', location: 'Musterstadt', date: '2026-06-01', formation: 'doublette', registrationType: 'forme', type: 'ko', status: 'registration', activeRegistrations: 0, maxRegistrations: 16, waitlistRegistrations: 0, canManage: true },
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
          users={[]}
          language="de"
        />
      </EditDialog>
    </>
  );
}

describe('Turniere-Seite: Liste + Dialog', () => {
  it('öffnet den Dialog vorausgefüllt bei Bearbeiten, Abbrechen schließt ohne Submit, Speichern schließt mit Submit', () => {
    const onSubmit = vi.fn();
    render(<TournamentPageHarness onSubmit={onSubmit} />);

    expect(screen.queryByText('Turnier bearbeiten')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Bearbeiten'));

    expect(screen.getByText('Turnier bearbeiten')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Sommerturnier');

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
  const tournament = { id: 'tour1', name: 'Sommerturnier', formation: 'tete', registrationType: 'forme', canManage: true };
  const registrations = [
    { id: 'r1', firstName: 'Anna', lastName: 'Muster', email: 'anna@example.com', teamName: 'Team A', status: 'pending', isVip: false },
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

    expect(screen.queryByText('Anmeldung bearbeiten')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Bearbeiten'));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Anmeldung bearbeiten')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Vorname')).toHaveValue('Anna');

    fireEvent.click(within(dialog).getByText('Abbrechen'));
    expect(screen.queryByText('Anmeldung bearbeiten')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Bearbeiten'));
    fireEvent.click(screen.getByText('Anmeldung speichern'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Anmeldung bearbeiten')).not.toBeInTheDocument();
  });
});
