import { useEffect, useMemo, useState } from 'react';

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
  { value: 'turnierleiter', label: 'Turnierleiter' },
];

const TOURNAMENT_TYPES = [
  { value: 'formule_x', label: 'Formule X' },
  { value: 'jeder_gegen_jeden', label: 'Jeder gegen Jeden' },
  { value: 'ko', label: 'K.O.' },
  { value: 'kaskaden', label: 'Kaskaden-KO' },
  { value: 'liga', label: 'Liga' },
  { value: 'maastrichter', label: 'Maastrichter' },
  { value: 'poule_ab', label: 'Poule A/B' },
  { value: 'schweizer', label: 'Schweizer' },
  { value: 'supermelee', label: 'Supermêlée' },
  { value: 'trip_tete', label: 'Trip-Tête' },
];

const FORMATIONS = [
  { value: 'tete', label: 'Tête' },
  { value: 'doublette', label: 'Doublette' },
  { value: 'triplette', label: 'Triplette' },
];

const TOURNAMENT_STATUSES = [
  { value: 'draft', label: 'Entwurf' },
  { value: 'registration', label: 'Anmeldung offen' },
  { value: 'running', label: 'Läuft' },
  { value: 'finished', label: 'Abgeschlossen' },
];

const VISIBILITIES = [
  { value: 'public', label: 'Öffentlich' },
  { value: 'private', label: 'Privat' },
];

const REGISTRATION_STATUSES = [
  { value: 'pending', label: 'Offen' },
  { value: 'confirmed', label: 'Bestätigt' },
  { value: 'waitlist', label: 'Warteliste' },
  { value: 'cancelled', label: 'Storniert' },
];

const EMPTY_USER_FORM = {
  id: '',
  name: '',
  email: '',
  role: 'user',
  password: '',
};

const EMPTY_AUTH_FORM = {
  name: '',
  email: '',
  password: '',
  passwordConfirm: '',
  token: '',
};

const EMPTY_TOURNAMENT_FORM = {
  id: '',
  name: '',
  date: '',
  startTime: '',
  location: '',
  description: '',
  type: 'supermelee',
  formation: 'doublette',
  status: 'draft',
  maxRegistrations: 0,
  registrationDeadline: '',
  entryFeeEuro: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  visibility: 'private',
  internalNotes: '',
};

const EMPTY_REGISTRATION_FORM = {
  id: '',
  tournamentId: '',
  firstName: '',
  lastName: '',
  email: '',
  club: '',
  licenseNr: '',
  partnerFirstName: '',
  partnerLastName: '',
  partnerEmail: '',
  partner2FirstName: '',
  partner2LastName: '',
  partner2Email: '',
  teamName: '',
  seedingPosition: '',
  status: 'pending',
};

const REGISTER_SUCCESS = 'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.';
const VERIFY_SUCCESS = 'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState(() => localStorage.getItem('ptm_language') || 'de');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [authView, setAuthView] = useState('login');
  const [activeTab, setActiveTab] = useState('tournaments');
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM);
  const [tournamentForm, setTournamentForm] = useState(EMPTY_TOURNAMENT_FORM);
  const [registrationForm, setRegistrationForm] = useState(EMPTY_REGISTRATION_FORM);
  const [userMode, setUserMode] = useState('create');
  const [tournamentMode, setTournamentMode] = useState('create');
  const [registrationMode, setRegistrationMode] = useState('create');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isAdmin = currentUser?.role === 'admin';
  const canManageTournaments = currentUser && ['admin', 'turnierleiter'].includes(currentUser.role);
  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedTournamentId) || null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset_token');
    const verifyToken = params.get('verify_token');
    if (resetToken) {
      setAuthView('reset');
      setAuthForm((previous) => ({ ...previous, token: resetToken }));
    } else if (verifyToken) {
      setAuthView('verify');
      setAuthForm((previous) => ({ ...previous, token: verifyToken }));
    }
    initialize();
  }, []);

  useEffect(() => {
    localStorage.setItem('ptm_language', language);
    document.documentElement.lang = language;
    translateDom(language);
  });

  useEffect(() => {
    if (currentUser) {
      loadTournaments();
    }
  }, [currentUser]);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (selectedTournament?.canManage) {
      loadRegistrations(selectedTournament.id);
    } else {
      setRegistrations([]);
    }
  }, [selectedTournamentId, selectedTournament?.canManage]);

  async function initialize() {
    setLoading(true);
    setError('');

    try {
      const bootstrap = await api('/api/bootstrap');
      setNeedsSetup(bootstrap.needsSetup);
      await loadTournaments();

      if (!bootstrap.needsSetup) {
        try {
          const session = await api('/api/session');
          setCurrentUser(session.user);
        } catch {
          setCurrentUser(null);
        }
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const data = await api('/api/users');
      setUsers(data.users);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function loadTournaments() {
    try {
      const data = await api('/api/tournaments');
      setTournaments(data.tournaments);
      setSelectedTournamentId((previous) => previous || data.tournaments[0]?.id || '');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function loadRegistrations(tournamentId) {
    try {
      const data = await api(`/api/tournaments/${tournamentId}/registrations`);
      setRegistrations(data.registrations);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleSetup(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (authForm.password !== authForm.passwordConfirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    try {
      const data = await api('/api/setup', {
        method: 'POST',
        body: JSON.stringify(authForm),
      });
      setCurrentUser(data.user);
      setNeedsSetup(false);
      setAuthForm(EMPTY_AUTH_FORM);
      setMessage('Admin wurde angelegt.');
      await loadTournaments();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify(authForm),
      });
      setCurrentUser(data.user);
      setAuthForm(EMPTY_AUTH_FORM);
      setMessage('Angemeldet.');
      await loadTournaments();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (authForm.password !== authForm.passwordConfirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({ ...authForm, language }),
      });
      setAuthForm(EMPTY_AUTH_FORM);
      setAuthView('login');
      setMessage(data.verificationUrl ? `${translateText(REGISTER_SUCCESS, language)} ${data.verificationUrl}` : translateText(REGISTER_SUCCESS, language));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleVerifyEmail(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      await api('/api/email/verify', {
        method: 'POST',
        body: JSON.stringify({ token: authForm.token }),
      });
      window.history.replaceState({}, '', window.location.pathname);
      setAuthForm(EMPTY_AUTH_FORM);
      setAuthView('login');
      setMessage(translateText(VERIFY_SUCCESS, language));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const data = await api('/api/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email: authForm.email }),
      });
      setMessage(data.resetUrl ? `${data.message} ${data.resetUrl}` : data.message);
      setAuthForm(EMPTY_AUTH_FORM);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (authForm.password !== authForm.passwordConfirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    try {
      await api('/api/password/reset', {
        method: 'POST',
        body: JSON.stringify({
          token: authForm.token,
          password: authForm.password,
        }),
      });
      window.history.replaceState({}, '', window.location.pathname);
      setAuthForm(EMPTY_AUTH_FORM);
      setAuthView('login');
      setMessage('Passwort wurde geändert. Du kannst dich jetzt anmelden.');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleLogout() {
    await api('/api/logout', { method: 'POST' });
    setCurrentUser(null);
    setUsers([]);
    setRegistrations([]);
    setUserForm(EMPTY_USER_FORM);
    setTournamentForm(EMPTY_TOURNAMENT_FORM);
    setRegistrationForm(EMPTY_REGISTRATION_FORM);
    setUserMode('create');
    setTournamentMode('create');
    setRegistrationMode('create');
    setMessage('');
    setError('');
    await loadTournaments();
  }

  async function handleUserSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const payload = { ...userForm };
    if (userMode === 'edit' && !payload.password) {
      delete payload.password;
    }

    try {
      if (userMode === 'edit') {
        await api(`/api/users/${userForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMessage('Benutzer wurde aktualisiert.');
      } else {
        await api('/api/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMessage('Benutzer wurde angelegt.');
      }

      setUserForm(EMPTY_USER_FORM);
      setUserMode('create');
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleDeleteUser(user) {
    setError('');
    setMessage('');

    try {
      await api(`/api/users/${user.id}`, { method: 'DELETE' });
      setMessage('Benutzer wurde gelöscht.');
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleTournamentSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const payload = tournamentPayload(tournamentForm);

    try {
      const data =
        tournamentMode === 'edit'
          ? await api(`/api/tournaments/${tournamentForm.id}`, { method: 'PUT', body: JSON.stringify(payload) })
          : await api('/api/tournaments', { method: 'POST', body: JSON.stringify(payload) });

      setMessage(tournamentMode === 'edit' ? 'Turnier wurde aktualisiert.' : 'Turnier wurde angelegt.');
      setTournamentForm(EMPTY_TOURNAMENT_FORM);
      setTournamentMode('create');
      await loadTournaments();
      setSelectedTournamentId(data.tournament.id);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleDeleteTournament(tournament) {
    setError('');
    setMessage('');

    try {
      await api(`/api/tournaments/${tournament.id}`, { method: 'DELETE' });
      setMessage('Turnier wurde gelöscht.');
      setSelectedTournamentId('');
      setRegistrations([]);
      await loadTournaments();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleRegistrationSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const tournamentId = registrationForm.tournamentId || selectedTournamentId;
    const payload = registrationPayload({ ...registrationForm, tournamentId });

    try {
      if (registrationMode === 'edit') {
        await api(`/api/registrations/${registrationForm.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMessage('Anmeldung wurde aktualisiert.');
      } else {
        await api(`/api/tournaments/${tournamentId}/registrations`, { method: 'POST', body: JSON.stringify(payload) });
        setMessage('Anmeldung wurde gespeichert.');
      }

      setRegistrationForm(EMPTY_REGISTRATION_FORM);
      setRegistrationMode('create');
      await loadTournaments();
      if (selectedTournament?.canManage) {
        await loadRegistrations(selectedTournament.id);
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleDeleteRegistration(registration) {
    setError('');
    setMessage('');

    try {
      await api(`/api/registrations/${registration.id}`, { method: 'DELETE' });
      setMessage('Anmeldung wurde gelöscht.');
      await loadRegistrations(registration.tournamentId);
      await loadTournaments();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function editUser(user) {
    setUserMode('edit');
    setUserForm({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      password: '',
    });
    clearFeedback();
  }

  function editTournament(tournament) {
    setTournamentMode('edit');
    setTournamentForm({
      id: tournament.id,
      name: tournament.name || '',
      date: tournament.date || '',
      startTime: tournament.startTime || '',
      location: tournament.location || '',
      description: tournament.description || '',
      type: tournament.type || 'supermelee',
      formation: tournament.formation || 'doublette',
      status: tournament.status || 'draft',
      maxRegistrations: tournament.maxRegistrations || 0,
      registrationDeadline: tournament.registrationDeadline || '',
      entryFeeEuro: centsToEuro(tournament.entryFeeCents),
      contactName: tournament.contactName || '',
      contactEmail: tournament.contactEmail || '',
      contactPhone: tournament.contactPhone || '',
      visibility: tournament.visibility || 'private',
      internalNotes: tournament.internalNotes || '',
    });
    setActiveTab('tournaments');
    clearFeedback();
  }

  function editRegistration(registration) {
    setRegistrationMode('edit');
    setRegistrationForm({
      id: registration.id,
      tournamentId: registration.tournamentId,
      firstName: registration.firstName || '',
      lastName: registration.lastName || '',
      email: registration.email || '',
      club: registration.club || '',
      licenseNr: registration.licenseNr || '',
      partnerFirstName: registration.partnerFirstName || '',
      partnerLastName: registration.partnerLastName || '',
      partnerEmail: registration.partnerEmail || '',
      partner2FirstName: registration.partner2FirstName || '',
      partner2LastName: registration.partner2LastName || '',
      partner2Email: registration.partner2Email || '',
      teamName: registration.teamName || '',
      seedingPosition: registration.seedingPosition || '',
      status: registration.status || 'pending',
    });
    setActiveTab('registrations');
    clearFeedback();
  }

  function clearFeedback() {
    setError('');
    setMessage('');
  }

  const roleLabel = useMemo(() => roleName(currentUser?.role), [currentUser]);

  if (loading) {
    return <AuthShell title="Petanque Turnier Manager Online" subtitle="App wird geladen." language={language} setLanguage={setLanguage} />;
  }

  if (!currentUser) {
    return (
      <AuthShell title={authTitle(needsSetup, authView)} subtitle={authSubtitle(needsSetup, authView)} language={language} setLanguage={setLanguage}>
        {needsSetup && <SetupForm form={authForm} setForm={setAuthForm} onSubmit={handleSetup} />}

        {!needsSetup && authView === 'login' && (
          <LoginForm
            form={authForm}
            setForm={setAuthForm}
            onSubmit={handleLogin}
            onForgot={() => {
              setAuthView('forgot');
              clearFeedback();
            }}
            onRegister={() => {
              setAuthView('register');
              clearFeedback();
            }}
          />
        )}

        {!needsSetup && authView === 'register' && (
          <RegisterForm
            form={authForm}
            setForm={setAuthForm}
            onSubmit={handleRegister}
            onBack={() => {
              setAuthView('login');
              clearFeedback();
            }}
          />
        )}

        {!needsSetup && authView === 'forgot' && (
          <ForgotPasswordForm
            form={authForm}
            setForm={setAuthForm}
            onSubmit={handleForgotPassword}
            onBack={() => {
              setAuthView('login');
              clearFeedback();
            }}
          />
        )}

        {!needsSetup && authView === 'reset' && (
          <ResetPasswordForm
            form={authForm}
            setForm={setAuthForm}
            onSubmit={handleResetPassword}
            onBack={() => {
              setAuthView('login');
              clearFeedback();
            }}
          />
        )}

        {!needsSetup && authView === 'verify' && (
          <VerifyEmailForm
            form={authForm}
            setForm={setAuthForm}
            onSubmit={handleVerifyEmail}
            onBack={() => {
              setAuthView('login');
              clearFeedback();
            }}
          />
        )}

        <Feedback message={message} error={error} />
        <PublicTournamentList tournaments={tournaments} onRegister={(tournament) => {
          setSelectedTournamentId(tournament.id);
          setRegistrationForm({ ...EMPTY_REGISTRATION_FORM, tournamentId: tournament.id });
          setAuthView('publicRegistration');
        }} />
        {authView === 'publicRegistration' && selectedTournament && (
          <PublicRegistrationPanel
            tournament={selectedTournament}
            form={registrationForm}
            setForm={setRegistrationForm}
            onSubmit={handleRegistrationSubmit}
            onCancel={() => setAuthView('login')}
          />
        )}
      </AuthShell>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Petanque Turnier Manager Online</p>
          <h1>{activeTab === 'users' ? 'Benutzerverwaltung' : 'Turnierverwaltung'}</h1>
        </div>
        <div className="account">
          <LanguageSelect language={language} setLanguage={setLanguage} />
          <span>{currentUser.name}</span>
          <strong>{roleLabel}</strong>
          <Button variant="secondary" onClick={handleLogout}>
            Abmelden
          </Button>
        </div>
      </header>

      <nav className="tabs" aria-label="Bereiche">
        <button className={activeTab === 'tournaments' ? 'active' : ''} onClick={() => setActiveTab('tournaments')} type="button">
          Turniere
        </button>
        <button className={activeTab === 'registrations' ? 'active' : ''} onClick={() => setActiveTab('registrations')} type="button">
          Anmeldungen
        </button>
        {isAdmin && (
          <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')} type="button">
            Benutzer
          </button>
        )}
      </nav>

      <Feedback message={message} error={error} />

      {activeTab === 'tournaments' && (
        <section className={canManageTournaments ? 'admin-grid wide' : 'single-column'}>
          {canManageTournaments && (
            <div className="panel">
              <div className="section-title">
                <h2>{tournamentMode === 'edit' ? 'Turnier bearbeiten' : 'Turnier anlegen'}</h2>
                {tournamentMode === 'edit' && (
                  <Button variant="secondary" onClick={() => {
                    setTournamentMode('create');
                    setTournamentForm(EMPTY_TOURNAMENT_FORM);
                  }}>
                    Neu
                  </Button>
                )}
              </div>
              <TournamentForm form={tournamentForm} setForm={setTournamentForm} onSubmit={handleTournamentSubmit} mode={tournamentMode} />
            </div>
          )}

          <TournamentList
            tournaments={tournaments}
            selectedId={selectedTournamentId}
            onSelect={setSelectedTournamentId}
            onEdit={editTournament}
            onDelete={handleDeleteTournament}
          />
        </section>
      )}

      {activeTab === 'registrations' && (
        <section className="admin-grid wide">
          <div className="panel">
            <div className="section-title">
              <h2>{registrationMode === 'edit' ? 'Anmeldung bearbeiten' : 'Anmeldung erfassen'}</h2>
              {registrationMode === 'edit' && (
                <Button variant="secondary" onClick={() => {
                  setRegistrationMode('create');
                  setRegistrationForm(EMPTY_REGISTRATION_FORM);
                }}>
                  Neu
                </Button>
              )}
            </div>
            <RegistrationForm
              form={registrationForm}
              setForm={setRegistrationForm}
              onSubmit={handleRegistrationSubmit}
              tournaments={tournaments}
              selectedTournamentId={selectedTournamentId}
              manageMode={Boolean(selectedTournament?.canManage)}
            />
          </div>

          <RegistrationsPanel
            tournament={selectedTournament}
            registrations={registrations}
            onTournamentChange={setSelectedTournamentId}
            tournaments={tournaments}
            onEdit={editRegistration}
            onDelete={handleDeleteRegistration}
          />
        </section>
      )}

      {activeTab === 'users' && isAdmin && (
        <section className="admin-grid">
          <div className="panel">
            <div className="section-title">
              <h2>{userMode === 'edit' ? 'Benutzer bearbeiten' : 'Benutzer anlegen'}</h2>
              {userMode === 'edit' && (
                <Button variant="secondary" onClick={() => {
                  setUserMode('create');
                  setUserForm(EMPTY_USER_FORM);
                }}>
                  Neu
                </Button>
              )}
            </div>
            <UserEditorForm
              form={userForm}
              setForm={setUserForm}
              submitLabel={userMode === 'edit' ? 'Speichern' : 'Anlegen'}
              onSubmit={handleUserSubmit}
              passwordLabel={userMode === 'edit' ? 'Neues Passwort' : 'Passwort'}
              passwordRequired={userMode === 'create'}
            />
          </div>

          <div className="panel">
            <div className="section-title">
              <h2>Benutzer</h2>
              <span className="counter">{users.length}</span>
            </div>
            <div className="user-list">
              {users.map((user) => (
                <article className="data-row" key={user.id}>
                  <div>
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                  </div>
                  <div className="badges">
                    <span className={`role role-${user.role}`}>{roleName(user.role)}</span>
                    <span className={user.emailVerifiedAt ? 'status registration-confirmed' : 'status registration-pending'}>
                      {user.emailVerifiedAt ? 'E-Mail bestätigt' : 'E-Mail offen'}
                    </span>
                  </div>
                  <div className="row-actions">
                    <Button variant="secondary" onClick={() => editUser(user)}>
                      Bearbeiten
                    </Button>
                    <Button variant="danger" onClick={() => handleDeleteUser(user)} disabled={user.id === currentUser.id}>
                      Löschen
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function AuthShell({ title, subtitle, children, language, setLanguage }) {
  return (
    <main className="page">
      <section className="auth-panel" aria-labelledby="page-title">
        <div className="language-bar">
          <LanguageSelect language={language} setLanguage={setLanguage} />
        </div>
        <img src="/icons/icon.svg" alt="" className="app-icon" />
        <p className="eyebrow">Petanque Turnier Manager Online</p>
        <h1 id="page-title">{title}</h1>
        <p className="subtitle">{subtitle}</p>
        {children}
      </section>
    </main>
  );
}

function LanguageSelect({ language, setLanguage }) {
  return (
    <label className="language-select">
      Sprache
      <select value={language} onChange={(event) => setLanguage(event.target.value)}>
        <option value="de">DE</option>
        <option value="nl">NL</option>
        <option value="en">EN</option>
        <option value="es">ES</option>
        <option value="fr">FR</option>
      </select>
    </label>
  );
}

function SetupForm({ form, setForm, onSubmit }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label="Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <TextField label="Passwort bestätigen" type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <Button type="submit">Admin anlegen</Button>
    </form>
  );
}

function LoginForm({ form, setForm, onSubmit, onForgot, onRegister }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label="Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required />
      <Button type="submit">Anmelden</Button>
      <button className="link-button" type="button" onClick={onRegister}>
        Neu registrieren
      </button>
      <button className="link-button" type="button" onClick={onForgot}>
        Passwort vergessen?
      </button>
    </form>
  );
}

function RegisterForm({ form, setForm, onSubmit, onBack }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label="Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <TextField label="Passwort bestätigen" type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <Button type="submit">Registrieren</Button>
      <button className="link-button" type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </button>
    </form>
  );
}

function ForgotPasswordForm({ form, setForm, onSubmit, onBack }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <Button type="submit">Reset-Link anfordern</Button>
      <button className="link-button" type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </button>
    </form>
  );
}

function ResetPasswordForm({ form, setForm, onSubmit, onBack }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Reset-Token" value={form.token} onChange={(token) => setForm({ ...form, token })} required />
      <TextField label="Neues Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <TextField label="Passwort bestätigen" type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <Button type="submit">Passwort ändern</Button>
      <button className="link-button" type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </button>
    </form>
  );
}

function VerifyEmailForm({ form, setForm, onSubmit, onBack }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Bestätigungs-Token" value={form.token} onChange={(token) => setForm({ ...form, token })} required />
      <Button type="submit">E-Mail bestätigen</Button>
      <button className="link-button" type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </button>
    </form>
  );
}

function PublicTournamentList({ tournaments, onRegister }) {
  const publicTournaments = tournaments.filter((tournament) => tournament.visibility === 'public');
  if (!publicTournaments.length) {
    return null;
  }

  return (
    <section className="public-list">
      <h2>Öffentliche Turniere</h2>
      {publicTournaments.map((tournament) => (
        <article className="compact-tournament" key={tournament.id}>
          <div>
            <strong>{tournament.name}</strong>
            <span>{formatDate(tournament.date)} · {tournament.location}</span>
          </div>
          <Button variant="secondary" onClick={() => onRegister(tournament)} disabled={tournament.status !== 'registration'}>
            Anmelden
          </Button>
        </article>
      ))}
    </section>
  );
}

function PublicRegistrationPanel({ tournament, form, setForm, onSubmit, onCancel }) {
  return (
    <form className="public-registration" onSubmit={onSubmit}>
      <h2>Anmeldung: {tournament.name}</h2>
      <RegistrationFields form={form} setForm={setForm} showStatus={false} />
      <div className="row-actions stretch">
        <Button type="submit">Anmeldung senden</Button>
        <Button variant="secondary" onClick={onCancel}>Abbrechen</Button>
      </div>
    </form>
  );
}

function TournamentForm({ form, setForm, onSubmit, mode }) {
  return (
    <form className="form dense" onSubmit={onSubmit}>
      <TextField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      <div className="form-grid">
        <TextField label="Datum" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} required />
        <TextField label="Startzeit" type="time" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} />
      </div>
      <TextField label="Ort" value={form.location} onChange={(location) => setForm({ ...form, location })} required minLength={2} />
      <div className="form-grid">
        <SelectField label="Turniersystem" value={form.type} onChange={(type) => setForm({ ...form, type })} options={TOURNAMENT_TYPES} />
        <SelectField label="Formation" value={form.formation} onChange={(formation) => setForm({ ...form, formation })} options={FORMATIONS} />
      </div>
      <div className="form-grid">
        <SelectField label="Status" value={form.status} onChange={(status) => setForm({ ...form, status })} options={TOURNAMENT_STATUSES} />
        <SelectField label="Sichtbarkeit" value={form.visibility} onChange={(visibility) => setForm({ ...form, visibility })} options={VISIBILITIES} />
      </div>
      <div className="form-grid">
        <TextField label="Max. Meldungen" type="number" min="0" value={form.maxRegistrations} onChange={(maxRegistrations) => setForm({ ...form, maxRegistrations })} />
        <TextField label="Startgeld EUR" inputMode="decimal" value={form.entryFeeEuro} onChange={(entryFeeEuro) => setForm({ ...form, entryFeeEuro })} />
      </div>
      <TextField label="Meldefrist" type="datetime-local" value={form.registrationDeadline} onChange={(registrationDeadline) => setForm({ ...form, registrationDeadline })} />
      <div className="form-grid">
        <TextField label="Kontaktname" value={form.contactName} onChange={(contactName) => setForm({ ...form, contactName })} />
        <TextField label="Kontakt-E-Mail" type="email" value={form.contactEmail} onChange={(contactEmail) => setForm({ ...form, contactEmail })} />
      </div>
      <TextField label="Kontakt-Telefon" value={form.contactPhone} onChange={(contactPhone) => setForm({ ...form, contactPhone })} />
      <TextArea label="Beschreibung" value={form.description} onChange={(description) => setForm({ ...form, description })} />
      <TextArea label="Interne Notizen" value={form.internalNotes} onChange={(internalNotes) => setForm({ ...form, internalNotes })} />
      <Button type="submit">{mode === 'edit' ? 'Turnier speichern' : 'Turnier anlegen'}</Button>
    </form>
  );
}

function TournamentList({ tournaments, selectedId, onSelect, onEdit, onDelete }) {
  return (
    <div className="panel">
      <div className="section-title">
        <h2>Turniere</h2>
        <span className="counter">{tournaments.length}</span>
      </div>
      <div className="user-list">
        {tournaments.map((tournament) => (
          <article className={`data-row tournament-row ${selectedId === tournament.id ? 'selected' : ''}`} key={tournament.id}>
            <button className="row-main" type="button" onClick={() => onSelect(tournament.id)}>
              <strong>{tournament.name}</strong>
              <span>{formatDate(tournament.date)} {tournament.startTime || ''} · {tournament.location}</span>
              <small>{labelFor(TOURNAMENT_TYPES, tournament.type)} · {labelFor(FORMATIONS, tournament.formation)}</small>
            </button>
            <div className="badges">
              <span className={`status status-${tournament.status}`}>{labelFor(TOURNAMENT_STATUSES, tournament.status)}</span>
              <span className="role">{tournament.activeRegistrations}/{tournament.maxRegistrations || '∞'}</span>
              {tournament.waitlistRegistrations > 0 && <span className="role role-user">{tournament.waitlistRegistrations} Warteliste</span>}
            </div>
            {tournament.canManage && (
              <div className="row-actions">
                <Button variant="secondary" onClick={() => onEdit(tournament)}>Bearbeiten</Button>
                <Button variant="danger" onClick={() => onDelete(tournament)}>Löschen</Button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function RegistrationForm({ form, setForm, onSubmit, tournaments, selectedTournamentId, manageMode }) {
  const selectedValue = form.tournamentId || selectedTournamentId;
  const options = tournaments.map((tournament) => ({ value: tournament.id, label: tournament.name }));

  return (
    <form className="form dense" onSubmit={onSubmit}>
      <SelectField label="Turnier" value={selectedValue} onChange={(tournamentId) => setForm({ ...form, tournamentId })} options={options} />
      <RegistrationFields form={form} setForm={setForm} showStatus={manageMode} />
      <Button type="submit">{form.id ? 'Anmeldung speichern' : 'Anmeldung erfassen'}</Button>
    </form>
  );
}

function RegistrationFields({ form, setForm, showStatus }) {
  return (
    <>
      <div className="form-grid">
        <TextField label="Vorname" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
        <TextField label="Nachname" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
      </div>
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <div className="form-grid">
        <TextField label="Verein" value={form.club} onChange={(club) => setForm({ ...form, club })} />
        <TextField label="Lizenznummer" value={form.licenseNr} onChange={(licenseNr) => setForm({ ...form, licenseNr })} />
      </div>
      <TextField label="Teamname" value={form.teamName} onChange={(teamName) => setForm({ ...form, teamName })} />
      <div className="form-grid">
        <TextField label="Partner Vorname" value={form.partnerFirstName} onChange={(partnerFirstName) => setForm({ ...form, partnerFirstName })} />
        <TextField label="Partner Nachname" value={form.partnerLastName} onChange={(partnerLastName) => setForm({ ...form, partnerLastName })} />
      </div>
      <TextField label="Partner E-Mail" type="email" value={form.partnerEmail} onChange={(partnerEmail) => setForm({ ...form, partnerEmail })} />
      <div className="form-grid">
        <TextField label="Partner 2 Vorname" value={form.partner2FirstName} onChange={(partner2FirstName) => setForm({ ...form, partner2FirstName })} />
        <TextField label="Partner 2 Nachname" value={form.partner2LastName} onChange={(partner2LastName) => setForm({ ...form, partner2LastName })} />
      </div>
      <TextField label="Partner 2 E-Mail" type="email" value={form.partner2Email} onChange={(partner2Email) => setForm({ ...form, partner2Email })} />
      {showStatus && (
        <div className="form-grid">
          <TextField label="Setzposition" type="number" min="0" value={form.seedingPosition} onChange={(seedingPosition) => setForm({ ...form, seedingPosition })} />
          <SelectField label="Status" value={form.status} onChange={(status) => setForm({ ...form, status })} options={REGISTRATION_STATUSES} />
        </div>
      )}
    </>
  );
}

function RegistrationsPanel({ tournament, registrations, tournaments, onTournamentChange, onEdit, onDelete }) {
  return (
    <div className="panel">
      <div className="section-title">
        <h2>Anmeldungen</h2>
        <span className="counter">{registrations.length}</span>
      </div>
      <SelectField
        label="Turnier anzeigen"
        value={tournament?.id || ''}
        onChange={onTournamentChange}
        options={tournaments.map((item) => ({ value: item.id, label: item.name }))}
      />
      {!tournament?.canManage && <p className="muted">Für dieses Turnier sind Anmeldungen nur für Admins und zuständige Turnierleiter sichtbar.</p>}
      <div className="user-list">
        {registrations.map((registration) => (
          <article className="data-row" key={registration.id}>
            <div>
              <strong>{registration.firstName} {registration.lastName}</strong>
              <span>{registration.email}</span>
              {registration.teamName && <small>{registration.teamName}</small>}
            </div>
            <span className={`status registration-${registration.status}`}>{labelFor(REGISTRATION_STATUSES, registration.status)}</span>
            <div className="row-actions">
              <Button variant="secondary" onClick={() => onEdit(registration)}>Bearbeiten</Button>
              <Button variant="danger" onClick={() => onDelete(registration)}>Löschen</Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function UserEditorForm({ form, setForm, submitLabel, onSubmit, passwordLabel, passwordRequired }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <SelectField label="Rolle" value={form.role} onChange={(role) => setForm({ ...form, role })} options={ROLES} />
      <TextField
        label={passwordLabel}
        type="password"
        value={form.password}
        onChange={(password) => setForm({ ...form, password })}
        required={passwordRequired}
        minLength={passwordRequired ? 8 : undefined}
        placeholder={passwordRequired ? '' : 'Leer lassen, wenn unverändert'}
      />
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function TextField({ label, value, onChange, type = 'text', ...props }) {
  return (
    <label>
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  );
}

function TextArea({ label, value, onChange }) {
  return (
    <label>
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Button({ children, type = 'button', variant = 'primary', ...props }) {
  return (
    <button type={type} className={`button button-${variant}`} {...props}>
      {children}
    </button>
  );
}

function Feedback({ message, error }) {
  if (!message && !error) {
    return null;
  }

  return <p className={error ? 'feedback error' : 'feedback success'}>{error || message}</p>;
}

function authTitle(needsSetup, authView) {
  if (needsSetup) {
    return 'Ersten Admin anlegen';
  }
  if (authView === 'forgot') {
    return 'Passwort vergessen';
  }
  if (authView === 'register') {
    return 'Neu registrieren';
  }
  if (authView === 'reset') {
    return 'Passwort ändern';
  }
  if (authView === 'verify') {
    return 'E-Mail bestätigen';
  }
  if (authView === 'publicRegistration') {
    return 'Turnieranmeldung';
  }
  return 'Anmelden';
}

function authSubtitle(needsSetup, authView) {
  if (needsSetup) {
    return 'Lege den ersten Admin-Benutzer für dieses neue Projekt an.';
  }
  if (authView === 'forgot') {
    return 'Fordere einen Link zum Zurücksetzen deines Passworts an.';
  }
  if (authView === 'register') {
    return 'Registriere dein Benutzerkonto. Die Freischaltung erfolgt erst nach E-Mail-Bestätigung.';
  }
  if (authView === 'reset') {
    return 'Setze mit deinem Reset-Token ein neues Passwort.';
  }
  if (authView === 'verify') {
    return 'Bestätige deine E-Mail-Adresse, um dein Benutzerkonto freizuschalten.';
  }
  if (authView === 'publicRegistration') {
    return 'Melde dich für ein öffentliches Turnier an.';
  }
  return 'Melde dich mit deinem Benutzerkonto an.';
}

function tournamentPayload(form) {
  return {
    name: form.name,
    date: form.date,
    startTime: form.startTime || null,
    location: form.location,
    description: form.description || null,
    type: form.type,
    formation: form.formation,
    status: form.status,
    maxRegistrations: Number(form.maxRegistrations || 0),
    registrationDeadline: form.registrationDeadline || null,
    entryFeeCents: euroToCents(form.entryFeeEuro),
    contactName: form.contactName || null,
    contactEmail: form.contactEmail || null,
    contactPhone: form.contactPhone || null,
    visibility: form.visibility,
    internalNotes: form.internalNotes || null,
  };
}

function registrationPayload(form) {
  return {
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    club: form.club || null,
    licenseNr: form.licenseNr || null,
    partnerFirstName: form.partnerFirstName || null,
    partnerLastName: form.partnerLastName || null,
    partnerEmail: form.partnerEmail || null,
    partner2FirstName: form.partner2FirstName || null,
    partner2LastName: form.partner2LastName || null,
    partner2Email: form.partner2Email || null,
    teamName: form.teamName || null,
    seedingPosition: form.seedingPosition === '' ? null : Number(form.seedingPosition),
    status: form.status,
  };
}

function roleName(value) {
  return ROLES.find((role) => role.value === value)?.label || value;
}

function labelFor(options, value) {
  return options.find((option) => option.value === value)?.label || value;
}

function formatDate(value) {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T00:00:00`));
}

function centsToEuro(cents) {
  if (!cents) {
    return '';
  }
  return (Number(cents) / 100).toFixed(2).replace('.', ',');
}

function euroToCents(value) {
  if (!value) {
    return 0;
  }
  const normalized = String(value).replace(',', '.');
  return Math.round(Number(normalized) * 100);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(translateText(payload.error || 'Request failed', localStorage.getItem('ptm_language') || 'de'));
  }

  return payload;
}

const TRANSLATIONS = {
  nl: {
    'App wird geladen.': 'App wordt geladen.',
    'Ersten Admin anlegen': 'Eerste admin aanmaken',
    'Passwort vergessen': 'Wachtwoord vergeten',
    'Passwort ändern': 'Wachtwoord wijzigen',
    'Neu registrieren': 'Nieuw registreren',
    'E-Mail bestätigen': 'E-mail bevestigen',
    'Turnieranmeldung': 'Toernooi-inschrijving',
    Anmelden: 'Aanmelden',
    'Lege den ersten Admin-Benutzer für dieses neue Projekt an.': 'Maak de eerste admin-gebruiker voor dit nieuwe project aan.',
    'Fordere einen Link zum Zurücksetzen deines Passworts an.': 'Vraag een link aan om je wachtwoord opnieuw in te stellen.',
    'Registriere dein Benutzerkonto. Die Freischaltung erfolgt erst nach E-Mail-Bestätigung.': 'Registreer je gebruikersaccount. Vrijgave gebeurt pas na e-mailbevestiging.',
    'Setze mit deinem Reset-Token ein neues Passwort.': 'Stel met je reset-token een nieuw wachtwoord in.',
    'Bestätige deine E-Mail-Adresse, um dein Benutzerkonto freizuschalten.': 'Bevestig je e-mailadres om je gebruikersaccount vrij te geven.',
    'Melde dich für ein öffentliches Turnier an.': 'Schrijf je in voor een openbaar toernooi.',
    'Melde dich mit deinem Benutzerkonto an.': 'Meld je aan met je gebruikersaccount.',
    Sprache: 'Taal',
    Name: 'Naam',
    'E-Mail': 'E-mail',
    Passwort: 'Wachtwoord',
    'Passwort bestätigen': 'Wachtwoord bevestigen',
    'Admin anlegen': 'Admin aanmaken',
    'Passwort vergessen?': 'Wachtwoord vergeten?',
    'Reset-Link anfordern': 'Reset-link aanvragen',
    Registrieren: 'Registreren',
    'Zurück zur Anmeldung': 'Terug naar aanmelden',
    'Reset-Token': 'Reset-token',
    'Bestätigungs-Token': 'Bevestigingstoken',
    'E-Mail bestätigt': 'E-mail bevestigd',
    'E-Mail offen': 'E-mail open',
    'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.': 'E-mailadres is bevestigd. Je kunt je nu aanmelden.',
    'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.': 'Registratie opgeslagen. Bevestig je e-mailadres via de link in de e-mail.',
    'Bitte bestätige zuerst deine E-Mail-Adresse.': 'Bevestig eerst je e-mailadres.',
    'Bestätigungs-Token ist erforderlich': 'Bevestigingstoken is verplicht',
    'Bestätigungs-Link ist ungültig oder abgelaufen': 'Bevestigingslink is ongeldig of verlopen',
    'Die Passwörter stimmen nicht überein.': 'De wachtwoorden komen niet overeen.',
    'Email already exists': 'E-mail bestaat al',
    'Email and password are required': 'E-mail en wachtwoord zijn verplicht',
    'Invalid login': 'Ongeldige aanmelding',
    'Name must contain at least 2 characters': 'Naam moet minstens 2 tekens bevatten',
    'A valid email is required': 'Een geldig e-mailadres is verplicht',
    'Password must contain at least 8 characters': 'Wachtwoord moet minstens 8 tekens bevatten',
    'Request failed': 'Aanvraag mislukt',
    'Neues Passwort': 'Nieuw wachtwoord',
    'Öffentliche Turniere': 'Openbare toernooien',
    'Anmeldung senden': 'Inschrijving verzenden',
    Abbrechen: 'Annuleren',
    Turniere: 'Toernooien',
    Anmeldungen: 'Inschrijvingen',
    Benutzer: 'Gebruikers',
    Turnierverwaltung: 'Toernooibeheer',
    Benutzerverwaltung: 'Gebruikersbeheer',
    Abmelden: 'Afmelden',
    'Turnier bearbeiten': 'Toernooi bewerken',
    'Turnier anlegen': 'Toernooi aanmaken',
    Neu: 'Nieuw',
    Datum: 'Datum',
    Startzeit: 'Starttijd',
    Ort: 'Plaats',
    Turniersystem: 'Toernooisysteem',
    Formation: 'Formatie',
    Status: 'Status',
    Sichtbarkeit: 'Zichtbaarheid',
    'Max. Meldungen': 'Max. inschrijvingen',
    'Startgeld EUR': 'Inschrijfgeld EUR',
    Meldefrist: 'Inschrijfdeadline',
    Kontaktname: 'Contactnaam',
    'Kontakt-E-Mail': 'Contact-e-mail',
    'Kontakt-Telefon': 'Contacttelefoon',
    Beschreibung: 'Beschrijving',
    'Interne Notizen': 'Interne notities',
    'Turnier speichern': 'Toernooi opslaan',
    Bearbeiten: 'Bewerken',
    Löschen: 'Verwijderen',
    'Anmeldung bearbeiten': 'Inschrijving bewerken',
    'Anmeldung erfassen': 'Inschrijving invoeren',
    Turnier: 'Toernooi',
    Vorname: 'Voornaam',
    Nachname: 'Achternaam',
    Verein: 'Vereniging',
    Lizenznummer: 'Licentienummer',
    Teamname: 'Teamnaam',
    'Partner Vorname': 'Partner voornaam',
    'Partner Nachname': 'Partner achternaam',
    'Partner E-Mail': 'Partner e-mail',
    'Partner 2 Vorname': 'Partner 2 voornaam',
    'Partner 2 Nachname': 'Partner 2 achternaam',
    'Partner 2 E-Mail': 'Partner 2 e-mail',
    Setzposition: 'Plaatsingspositie',
    'Anmeldung speichern': 'Inschrijving opslaan',
    'Benutzer bearbeiten': 'Gebruiker bewerken',
    'Benutzer anlegen': 'Gebruiker aanmaken',
    Rolle: 'Rol',
    Speichern: 'Opslaan',
    Anlegen: 'Aanmaken',
    Admin: 'Admin',
    User: 'Gebruiker',
    Turnierleiter: 'Toernooileider',
    Entwurf: 'Concept',
    'Anmeldung offen': 'Inschrijving open',
    Läuft: 'Loopt',
    Abgeschlossen: 'Afgesloten',
    Öffentlich: 'Openbaar',
    Privat: 'Privé',
    Offen: 'Open',
    Bestätigt: 'Bevestigd',
    Warteliste: 'Wachtlijst',
    Storniert: 'Geannuleerd',
    'Leer lassen, wenn unverändert': 'Leeg laten als ongewijzigd',
  },
  en: {
    'App wird geladen.': 'App is loading.',
    'Ersten Admin anlegen': 'Create first admin',
    'Passwort vergessen': 'Forgot password',
    'Passwort ändern': 'Change password',
    'Neu registrieren': 'Register',
    'E-Mail bestätigen': 'Verify email',
    'Turnieranmeldung': 'Tournament registration',
    Anmelden: 'Sign in',
    'Lege den ersten Admin-Benutzer für dieses neue Projekt an.': 'Create the first admin user for this new project.',
    'Fordere einen Link zum Zurücksetzen deines Passworts an.': 'Request a link to reset your password.',
    'Registriere dein Benutzerkonto. Die Freischaltung erfolgt erst nach E-Mail-Bestätigung.': 'Register your user account. Access is enabled only after email verification.',
    'Setze mit deinem Reset-Token ein neues Passwort.': 'Set a new password with your reset token.',
    'Bestätige deine E-Mail-Adresse, um dein Benutzerkonto freizuschalten.': 'Verify your email address to enable your user account.',
    'Melde dich für ein öffentliches Turnier an.': 'Register for a public tournament.',
    'Melde dich mit deinem Benutzerkonto an.': 'Sign in with your user account.',
    Sprache: 'Language',
    Name: 'Name',
    'E-Mail': 'Email',
    Passwort: 'Password',
    'Passwort bestätigen': 'Confirm password',
    'Admin anlegen': 'Create admin',
    'Passwort vergessen?': 'Forgot password?',
    'Reset-Link anfordern': 'Request reset link',
    Registrieren: 'Register',
    'Zurück zur Anmeldung': 'Back to sign in',
    'Reset-Token': 'Reset token',
    'Bestätigungs-Token': 'Verification token',
    'E-Mail bestätigt': 'Email verified',
    'E-Mail offen': 'Email pending',
    'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.': 'Email address verified. You can sign in now.',
    'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.': 'Registration saved. Please verify your email address using the link in the email.',
    'Bitte bestätige zuerst deine E-Mail-Adresse.': 'Please verify your email address first.',
    'Bestätigungs-Token ist erforderlich': 'Verification token is required',
    'Bestätigungs-Link ist ungültig oder abgelaufen': 'Verification link is invalid or expired',
    'Die Passwörter stimmen nicht überein.': 'The passwords do not match.',
    'Email already exists': 'Email already exists',
    'Email and password are required': 'Email and password are required',
    'Invalid login': 'Invalid login',
    'Name must contain at least 2 characters': 'Name must contain at least 2 characters',
    'A valid email is required': 'A valid email is required',
    'Password must contain at least 8 characters': 'Password must contain at least 8 characters',
    'Request failed': 'Request failed',
    'Neues Passwort': 'New password',
    'Öffentliche Turniere': 'Public tournaments',
    'Anmeldung senden': 'Submit registration',
    Abbrechen: 'Cancel',
    Turniere: 'Tournaments',
    Anmeldungen: 'Registrations',
    Benutzer: 'Users',
    Turnierverwaltung: 'Tournament management',
    Benutzerverwaltung: 'User management',
    Abmelden: 'Sign out',
    'Turnier bearbeiten': 'Edit tournament',
    'Turnier anlegen': 'Create tournament',
    Neu: 'New',
    Datum: 'Date',
    Startzeit: 'Start time',
    Ort: 'Location',
    Turniersystem: 'Tournament system',
    Formation: 'Formation',
    Status: 'Status',
    Sichtbarkeit: 'Visibility',
    'Max. Meldungen': 'Max. registrations',
    'Startgeld EUR': 'Entry fee EUR',
    Meldefrist: 'Registration deadline',
    Kontaktname: 'Contact name',
    'Kontakt-E-Mail': 'Contact email',
    'Kontakt-Telefon': 'Contact phone',
    Beschreibung: 'Description',
    'Interne Notizen': 'Internal notes',
    'Turnier speichern': 'Save tournament',
    Bearbeiten: 'Edit',
    Löschen: 'Delete',
    'Anmeldung bearbeiten': 'Edit registration',
    'Anmeldung erfassen': 'Add registration',
    Turnier: 'Tournament',
    Vorname: 'First name',
    Nachname: 'Last name',
    Verein: 'Club',
    Lizenznummer: 'License number',
    Teamname: 'Team name',
    'Partner Vorname': 'Partner first name',
    'Partner Nachname': 'Partner last name',
    'Partner E-Mail': 'Partner email',
    'Partner 2 Vorname': 'Partner 2 first name',
    'Partner 2 Nachname': 'Partner 2 last name',
    'Partner 2 E-Mail': 'Partner 2 email',
    Setzposition: 'Seeding position',
    'Anmeldung speichern': 'Save registration',
    'Benutzer bearbeiten': 'Edit user',
    'Benutzer anlegen': 'Create user',
    Rolle: 'Role',
    Speichern: 'Save',
    Anlegen: 'Create',
    Admin: 'Admin',
    User: 'User',
    Turnierleiter: 'Tournament director',
    Entwurf: 'Draft',
    'Anmeldung offen': 'Registration open',
    Läuft: 'Running',
    Abgeschlossen: 'Finished',
    Öffentlich: 'Public',
    Privat: 'Private',
    Offen: 'Pending',
    Bestätigt: 'Confirmed',
    Warteliste: 'Waitlist',
    Storniert: 'Cancelled',
    'Leer lassen, wenn unverändert': 'Leave empty if unchanged',
  },
  es: {
    'App wird geladen.': 'La app se está cargando.',
    'Ersten Admin anlegen': 'Crear primer admin',
    'Passwort vergessen': 'Contraseña olvidada',
    'Passwort ändern': 'Cambiar contraseña',
    'Neu registrieren': 'Registrarse',
    'E-Mail bestätigen': 'Confirmar correo',
    'Turnieranmeldung': 'Inscripción al torneo',
    Anmelden: 'Iniciar sesión',
    'Lege den ersten Admin-Benutzer für dieses neue Projekt an.': 'Crea el primer usuario administrador para este nuevo proyecto.',
    'Fordere einen Link zum Zurücksetzen deines Passworts an.': 'Solicita un enlace para restablecer tu contraseña.',
    'Registriere dein Benutzerkonto. Die Freischaltung erfolgt erst nach E-Mail-Bestätigung.': 'Registra tu cuenta. El acceso se activa solo después de confirmar el correo.',
    'Setze mit deinem Reset-Token ein neues Passwort.': 'Define una nueva contraseña con tu token.',
    'Bestätige deine E-Mail-Adresse, um dein Benutzerkonto freizuschalten.': 'Confirma tu correo para activar tu cuenta.',
    'Melde dich für ein öffentliches Turnier an.': 'Inscríbete en un torneo público.',
    'Melde dich mit deinem Benutzerkonto an.': 'Inicia sesión con tu cuenta.',
    Sprache: 'Idioma',
    Name: 'Nombre',
    'E-Mail': 'Correo',
    Passwort: 'Contraseña',
    'Passwort bestätigen': 'Confirmar contraseña',
    'Admin anlegen': 'Crear admin',
    'Passwort vergessen?': '¿Contraseña olvidada?',
    'Reset-Link anfordern': 'Solicitar enlace',
    Registrieren: 'Registrarse',
    'Zurück zur Anmeldung': 'Volver al inicio',
    'Reset-Token': 'Token',
    'Bestätigungs-Token': 'Token de confirmación',
    'E-Mail bestätigt': 'Correo confirmado',
    'E-Mail offen': 'Correo pendiente',
    'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.': 'Correo confirmado. Ya puedes iniciar sesión.',
    'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.': 'Registro guardado. Confirma tu correo con el enlace del email.',
    'Bitte bestätige zuerst deine E-Mail-Adresse.': 'Confirma primero tu correo.',
    'Bestätigungs-Token ist erforderlich': 'El token de confirmación es obligatorio',
    'Bestätigungs-Link ist ungültig oder abgelaufen': 'El enlace de confirmación no es válido o ha caducado',
    'Die Passwörter stimmen nicht überein.': 'Las contraseñas no coinciden.',
    'Email already exists': 'El correo ya existe',
    'Email and password are required': 'Correo y contraseña son obligatorios',
    'Invalid login': 'Inicio de sesión no válido',
    'Name must contain at least 2 characters': 'El nombre debe tener al menos 2 caracteres',
    'A valid email is required': 'Se requiere un correo válido',
    'Password must contain at least 8 characters': 'La contraseña debe tener al menos 8 caracteres',
    'Request failed': 'La solicitud ha fallado',
    'Neues Passwort': 'Nueva contraseña',
    'Öffentliche Turniere': 'Torneos públicos',
    'Anmeldung senden': 'Enviar inscripción',
    Abbrechen: 'Cancelar',
    Turniere: 'Torneos',
    Anmeldungen: 'Inscripciones',
    Benutzer: 'Usuarios',
    Turnierverwaltung: 'Gestión de torneos',
    Benutzerverwaltung: 'Gestión de usuarios',
    Abmelden: 'Cerrar sesión',
    'Turnier bearbeiten': 'Editar torneo',
    'Turnier anlegen': 'Crear torneo',
    Neu: 'Nuevo',
    Datum: 'Fecha',
    Startzeit: 'Hora',
    Ort: 'Lugar',
    Turniersystem: 'Sistema',
    Formation: 'Formación',
    Status: 'Estado',
    Sichtbarkeit: 'Visibilidad',
    'Max. Meldungen': 'Máx. inscripciones',
    'Startgeld EUR': 'Cuota EUR',
    Meldefrist: 'Fecha límite',
    Kontaktname: 'Contacto',
    'Kontakt-E-Mail': 'Correo de contacto',
    'Kontakt-Telefon': 'Teléfono',
    Beschreibung: 'Descripción',
    'Interne Notizen': 'Notas internas',
    'Turnier speichern': 'Guardar torneo',
    Bearbeiten: 'Editar',
    Löschen: 'Eliminar',
    'Anmeldung bearbeiten': 'Editar inscripción',
    'Anmeldung erfassen': 'Añadir inscripción',
    Turnier: 'Torneo',
    Vorname: 'Nombre',
    Nachname: 'Apellido',
    Verein: 'Club',
    Lizenznummer: 'Licencia',
    Teamname: 'Equipo',
    'Partner Vorname': 'Nombre pareja',
    'Partner Nachname': 'Apellido pareja',
    'Partner E-Mail': 'Correo pareja',
    'Partner 2 Vorname': 'Nombre pareja 2',
    'Partner 2 Nachname': 'Apellido pareja 2',
    'Partner 2 E-Mail': 'Correo pareja 2',
    Setzposition: 'Cabeza de serie',
    'Anmeldung speichern': 'Guardar inscripción',
    'Benutzer bearbeiten': 'Editar usuario',
    'Benutzer anlegen': 'Crear usuario',
    Rolle: 'Rol',
    Speichern: 'Guardar',
    Anlegen: 'Crear',
    Admin: 'Admin',
    User: 'Usuario',
    Turnierleiter: 'Director',
    Entwurf: 'Borrador',
    'Anmeldung offen': 'Inscripción abierta',
    Läuft: 'En curso',
    Abgeschlossen: 'Finalizado',
    Öffentlich: 'Público',
    Privat: 'Privado',
    Offen: 'Pendiente',
    Bestätigt: 'Confirmado',
    Warteliste: 'Lista de espera',
    Storniert: 'Cancelado',
    'Leer lassen, wenn unverändert': 'Dejar vacío si no cambia',
  },
  fr: {
    'App wird geladen.': 'Chargement de l’application.',
    'Ersten Admin anlegen': 'Créer le premier admin',
    'Passwort vergessen': 'Mot de passe oublié',
    'Passwort ändern': 'Modifier le mot de passe',
    'Neu registrieren': 'Créer un compte',
    'E-Mail bestätigen': 'Confirmer l’e-mail',
    'Turnieranmeldung': 'Inscription au tournoi',
    Anmelden: 'Connexion',
    'Lege den ersten Admin-Benutzer für dieses neue Projekt an.': 'Crée le premier utilisateur administrateur pour ce nouveau projet.',
    'Fordere einen Link zum Zurücksetzen deines Passworts an.': 'Demande un lien de réinitialisation.',
    'Registriere dein Benutzerkonto. Die Freischaltung erfolgt erst nach E-Mail-Bestätigung.': 'Crée ton compte. L’accès est activé seulement après confirmation de l’e-mail.',
    'Setze mit deinem Reset-Token ein neues Passwort.': 'Définis un nouveau mot de passe avec ton jeton.',
    'Bestätige deine E-Mail-Adresse, um dein Benutzerkonto freizuschalten.': 'Confirme ton adresse e-mail pour activer ton compte.',
    'Melde dich für ein öffentliches Turnier an.': 'Inscris-toi à un tournoi public.',
    'Melde dich mit deinem Benutzerkonto an.': 'Connecte-toi avec ton compte.',
    Sprache: 'Langue',
    Name: 'Nom',
    'E-Mail': 'E-mail',
    Passwort: 'Mot de passe',
    'Passwort bestätigen': 'Confirmer le mot de passe',
    'Admin anlegen': 'Créer admin',
    'Passwort vergessen?': 'Mot de passe oublié ?',
    'Reset-Link anfordern': 'Demander le lien',
    Registrieren: 'Créer le compte',
    'Zurück zur Anmeldung': 'Retour à la connexion',
    'Reset-Token': 'Jeton',
    'Bestätigungs-Token': 'Jeton de confirmation',
    'E-Mail bestätigt': 'E-mail confirmé',
    'E-Mail offen': 'E-mail en attente',
    'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.': 'Adresse e-mail confirmée. Tu peux maintenant te connecter.',
    'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.': 'Compte créé. Confirme ton adresse e-mail avec le lien envoyé.',
    'Bitte bestätige zuerst deine E-Mail-Adresse.': 'Confirme d’abord ton adresse e-mail.',
    'Bestätigungs-Token ist erforderlich': 'Le jeton de confirmation est obligatoire',
    'Bestätigungs-Link ist ungültig oder abgelaufen': 'Le lien de confirmation est invalide ou expiré',
    'Die Passwörter stimmen nicht überein.': 'Les mots de passe ne correspondent pas.',
    'Email already exists': 'L’e-mail existe déjà',
    'Email and password are required': 'E-mail et mot de passe obligatoires',
    'Invalid login': 'Connexion invalide',
    'Name must contain at least 2 characters': 'Le nom doit contenir au moins 2 caractères',
    'A valid email is required': 'Une adresse e-mail valide est obligatoire',
    'Password must contain at least 8 characters': 'Le mot de passe doit contenir au moins 8 caractères',
    'Request failed': 'La demande a échoué',
    'Neues Passwort': 'Nouveau mot de passe',
    'Öffentliche Turniere': 'Tournois publics',
    'Anmeldung senden': 'Envoyer l’inscription',
    Abbrechen: 'Annuler',
    Turniere: 'Tournois',
    Anmeldungen: 'Inscriptions',
    Benutzer: 'Utilisateurs',
    Turnierverwaltung: 'Gestion des tournois',
    Benutzerverwaltung: 'Gestion des utilisateurs',
    Abmelden: 'Déconnexion',
    'Turnier bearbeiten': 'Modifier le tournoi',
    'Turnier anlegen': 'Créer un tournoi',
    Neu: 'Nouveau',
    Datum: 'Date',
    Startzeit: 'Heure',
    Ort: 'Lieu',
    Turniersystem: 'Système',
    Formation: 'Formation',
    Status: 'Statut',
    Sichtbarkeit: 'Visibilité',
    'Max. Meldungen': 'Max. inscriptions',
    'Startgeld EUR': 'Frais EUR',
    Meldefrist: 'Date limite',
    Kontaktname: 'Contact',
    'Kontakt-E-Mail': 'E-mail contact',
    'Kontakt-Telefon': 'Téléphone',
    Beschreibung: 'Description',
    'Interne Notizen': 'Notes internes',
    'Turnier speichern': 'Enregistrer',
    Bearbeiten: 'Modifier',
    Löschen: 'Supprimer',
    'Anmeldung bearbeiten': 'Modifier inscription',
    'Anmeldung erfassen': 'Ajouter inscription',
    Turnier: 'Tournoi',
    Vorname: 'Prénom',
    Nachname: 'Nom',
    Verein: 'Club',
    Lizenznummer: 'Licence',
    Teamname: 'Équipe',
    'Partner Vorname': 'Prénom partenaire',
    'Partner Nachname': 'Nom partenaire',
    'Partner E-Mail': 'E-mail partenaire',
    'Partner 2 Vorname': 'Prénom partenaire 2',
    'Partner 2 Nachname': 'Nom partenaire 2',
    'Partner 2 E-Mail': 'E-mail partenaire 2',
    Setzposition: 'Tête de série',
    'Anmeldung speichern': 'Enregistrer inscription',
    'Benutzer bearbeiten': 'Modifier utilisateur',
    'Benutzer anlegen': 'Créer utilisateur',
    Rolle: 'Rôle',
    Speichern: 'Enregistrer',
    Anlegen: 'Créer',
    Admin: 'Admin',
    User: 'Utilisateur',
    Turnierleiter: 'Directeur',
    Entwurf: 'Brouillon',
    'Anmeldung offen': 'Inscription ouverte',
    Läuft: 'En cours',
    Abgeschlossen: 'Terminé',
    Öffentlich: 'Public',
    Privat: 'Privé',
    Offen: 'En attente',
    Bestätigt: 'Confirmé',
    Warteliste: 'Liste d’attente',
    Storniert: 'Annulé',
    'Leer lassen, wenn unverändert': 'Laisser vide si inchangé',
  },
};

const ORIGINAL_TEXT = new WeakMap();

function translateDom(language) {
  const root = document.getElementById('root');
  if (!root) {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  for (const node of nodes) {
    if (!ORIGINAL_TEXT.has(node)) {
      ORIGINAL_TEXT.set(node, node.nodeValue);
    }
    const original = ORIGINAL_TEXT.get(node);
    const source = original.trim();
    const translated = translateText(source, language);
    node.nodeValue = original.replace(source, translated);
  }

  for (const element of root.querySelectorAll('[placeholder]')) {
    if (!ORIGINAL_TEXT.has(element)) {
      ORIGINAL_TEXT.set(element, element.getAttribute('placeholder'));
    }
    const source = ORIGINAL_TEXT.get(element);
    const translated = translateText(source, language);
    element.setAttribute('placeholder', translated);
  }
}

function translateText(source, language) {
  if (language === 'de') {
    return source;
  }
  return TRANSLATIONS[language]?.[source] || source;
}
