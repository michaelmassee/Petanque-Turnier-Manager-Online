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

const MONTHS = [
  { value: '01', label: 'Januar' },
  { value: '02', label: 'Februar' },
  { value: '03', label: 'März' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Dezember' },
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
  participantsPublic: false,
};

const EMPTY_TOURNAMENT_TIP_FORM = {
  name: '',
  date: '',
  startTime: '',
  location: '',
  formation: 'doublette',
  info: '',
  externalLink: '',
  flyerLink: '',
  submitterName: '',
  submitterEmail: '',
  consent: false,
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
  const [authView, setAuthView] = useState('home');
  const [activeTab, setActiveTab] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [homeQuery, setHomeQuery] = useState('');
  const [homeOnlyMine, setHomeOnlyMine] = useState(false);
  const [homeVisibleCount, setHomeVisibleCount] = useState(10);
  const [homeFilterOpen, setHomeFilterOpen] = useState(false);
  const [homeFilterMonth, setHomeFilterMonth] = useState('');
  const [homeFilterFormation, setHomeFilterFormation] = useState('');
  const [homeFilterOpenOnly, setHomeFilterOpenOnly] = useState(false);
  const [path, navigate] = usePath();
  const [tournamentTips, setTournamentTips] = useState([]);
  const [pendingTips, setPendingTips] = useState([]);
  const [tournamentTipForm, setTournamentTipForm] = useState(EMPTY_TOURNAMENT_TIP_FORM);
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

  const homeHeading = 'Öffentliche Turniere';

  const filteredHomeTournaments = useMemo(() => {
    const query = homeQuery.trim().toLowerCase();
    return tournaments.filter((tournament) => {
      if (tournament.visibility !== 'public' || !isUpcoming(tournament)) {
        return false;
      }
      if (homeOnlyMine && !isOwnTournament(tournament, currentUser)) {
        return false;
      }
      if (homeFilterMonth && tournament.date.slice(5, 7) !== homeFilterMonth) {
        return false;
      }
      if (homeFilterFormation && tournament.formation !== homeFilterFormation) {
        return false;
      }
      if (homeFilterOpenOnly && !hasOpenRegistration(tournament)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [tournament.name, tournament.location, labelFor(TOURNAMENT_TYPES, tournament.type)].some((value) =>
        (value || '').toLowerCase().includes(query),
      );
    });
  }, [
    tournaments,
    homeQuery,
    homeOnlyMine,
    currentUser,
    homeFilterMonth,
    homeFilterFormation,
    homeFilterOpenOnly,
  ]);

  const visibleHomeTournaments = filteredHomeTournaments.slice(0, homeVisibleCount);
  const hasMoreHomeTournaments = filteredHomeTournaments.length > homeVisibleCount;

  useEffect(() => {
    setHomeVisibleCount(10);
  }, [homeQuery, homeOnlyMine, homeFilterMonth, homeFilterFormation, homeFilterOpenOnly]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset_token');
    const verifyToken = params.get('verify_token');
    const tipVerifyToken = params.get('tip_verify_token');
    if (resetToken) {
      setAuthView('reset');
      setAuthForm((previous) => ({ ...previous, token: resetToken }));
    } else if (verifyToken) {
      setAuthView('verify');
      setAuthForm((previous) => ({ ...previous, token: verifyToken }));
    } else if (tipVerifyToken) {
      verifyTournamentTipToken(tipVerifyToken);
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
      loadPendingTournamentTips();
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
      await loadApprovedTournamentTips();

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

  async function loadApprovedTournamentTips() {
    try {
      const data = await api('/api/tournament-tips/approved');
      setTournamentTips(data.tips);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function loadPendingTournamentTips() {
    try {
      const data = await api('/api/tournament-tips/pending');
      setPendingTips(data.tips);
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

  async function verifyTournamentTipToken(token) {
    setError('');
    setMessage('');

    try {
      await api('/api/tournament-tips/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      window.history.replaceState({}, '', window.location.pathname);
      setMessage('Deine Turniermeldung wurde bestätigt und wartet nun auf Freigabe.');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleSubmitTournamentTip(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const data = await api('/api/tournament-tips', {
        method: 'POST',
        body: JSON.stringify({ ...tournamentTipForm, language }),
      });
      setTournamentTipForm(EMPTY_TOURNAMENT_TIP_FORM);
      setMessage(data.verificationUrl ? `${data.message} ${data.verificationUrl}` : data.message);
      navigate('/');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleModerateTournamentTip(tip, status) {
    setError('');
    setMessage('');

    try {
      await api(`/api/tournament-tips/${tip.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      setMessage(status === 'approved' ? 'Turniermeldung wurde freigegeben.' : 'Turniermeldung wurde abgelehnt.');
      await loadPendingTournamentTips();
      await loadApprovedTournamentTips();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleDeleteTournamentTip(tip) {
    setError('');
    setMessage('');

    try {
      await api(`/api/tournament-tips/${tip.id}`, { method: 'DELETE' });
      setMessage('Turniermeldung wurde gelöscht.');
      await loadPendingTournamentTips();
      await loadApprovedTournamentTips();
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
    setAuthView('home');
    setActiveTab('home');
    setHomeOnlyMine(false);
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
      setAuthView('home');
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
      participantsPublic: Boolean(tournament.participantsPublic),
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

  function resetHomeFilters() {
    setHomeFilterMonth('');
    setHomeFilterFormation('');
    setHomeFilterOpenOnly(false);
  }

  const roleLabel = useMemo(() => roleName(currentUser?.role), [currentUser]);

  if (loading) {
    return <AuthShell title="Pétanque Turnier Manager Online" subtitle="App wird geladen." language={language} setLanguage={setLanguage} />;
  }

  const tournamentRoute = matchTournamentRoute(path);

  if (!needsSetup && tournamentRoute) {
    return (
      <TournamentDetailPage
        route={tournamentRoute}
        tournaments={tournaments}
        currentUser={currentUser}
        language={language}
        setLanguage={setLanguage}
        navigate={navigate}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        registrationForm={registrationForm}
        setRegistrationForm={setRegistrationForm}
        onSubmitRegistration={handleRegistrationSubmit}
        message={message}
        error={error}
        onLogout={handleLogout}
      />
    );
  }

  if (!needsSetup && path === '/turnier-melden') {
    return (
      <SubmitTournamentTipPage
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        form={tournamentTipForm}
        setForm={setTournamentTipForm}
        onSubmit={handleSubmitTournamentTip}
        message={message}
        error={error}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    );
  }

  if (!currentUser) {
    if (needsSetup) {
      return (
        <AuthShell title={authTitle(needsSetup, authView)} subtitle={authSubtitle(needsSetup, authView)} language={language} setLanguage={setLanguage}>
          <SetupForm form={authForm} setForm={setAuthForm} onSubmit={handleSetup} />
          <Feedback message={message} error={error} />
        </AuthShell>
      );
    }

    const closeAuthModal = () => {
      setAuthView('home');
      clearFeedback();
    };

    return (
      <main className="app-shell">
        <AppHeader
          heading="Turniere"
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((open) => !open)}
          onCloseMenu={() => setMenuOpen(false)}
        >
          <button
            className="drawer-link"
            type="button"
            onClick={() => {
              setAuthView('login');
              setMenuOpen(false);
              clearFeedback();
            }}
          >
            Anmelden
          </button>
          <button
            className="drawer-link"
            type="button"
            onClick={() => {
              setAuthView('register');
              setMenuOpen(false);
              clearFeedback();
            }}
          >
            Neu registrieren
          </button>
        </AppHeader>

        <Feedback message={message} error={error} />

        <HomeTournaments
          heading={homeHeading}
          language={language}
          query={homeQuery}
          setQuery={setHomeQuery}
          showMineFilter={false}
          onlyMine={false}
          setOnlyMine={() => {}}
          filterOpen={homeFilterOpen}
          setFilterOpen={setHomeFilterOpen}
          filterMonth={homeFilterMonth}
          setFilterMonth={setHomeFilterMonth}
          filterFormation={homeFilterFormation}
          setFilterFormation={setHomeFilterFormation}
          filterOpenOnly={homeFilterOpenOnly}
          setFilterOpenOnly={setHomeFilterOpenOnly}
          onResetFilters={resetHomeFilters}
          tournaments={visibleHomeTournaments}
          total={filteredHomeTournaments.length}
          hasMore={hasMoreHomeTournaments}
          onLoadMore={() => setHomeVisibleCount((count) => count + 10)}
          onOpenTournament={(tournament) => navigate(`/turniere/${tournament.id}`)}
          tips={tournamentTips}
          navigate={navigate}
          onRegister={(tournament) => {
            setSelectedTournamentId(tournament.id);
            setRegistrationForm({ ...EMPTY_REGISTRATION_FORM, tournamentId: tournament.id });
            setAuthView('publicRegistration');
            clearFeedback();
          }}
        />

        {authView !== 'home' && (
          <AuthModal title={authTitle(needsSetup, authView)} subtitle={authSubtitle(needsSetup, authView)} onClose={closeAuthModal}>
            {authView === 'login' && (
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

            {authView === 'register' && (
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

            {authView === 'forgot' && (
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

            {authView === 'reset' && (
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

            {authView === 'verify' && (
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

            {authView === 'publicRegistration' && selectedTournament && (
              <PublicRegistrationPanel
                tournament={selectedTournament}
                form={registrationForm}
                setForm={setRegistrationForm}
                onSubmit={handleRegistrationSubmit}
                onCancel={closeAuthModal}
              />
            )}
          </AuthModal>
        )}
      </main>
    );
  }

  const activeTabHeading =
    activeTab === 'users'
      ? 'Benutzerverwaltung'
      : activeTab === 'tips'
        ? 'Turnier-Vorschläge'
        : activeTab === 'registrations'
          ? 'Anmeldungen'
          : activeTab === 'tournaments'
            ? 'Turnierverwaltung'
            : homeHeading;

  return (
    <main className="app-shell">
      <AppHeader
        heading={activeTabHeading}
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onCloseMenu={() => setMenuOpen(false)}
      >
        <div className="drawer-user">
          <span>{currentUser.name}</span>
          <strong>{roleLabel}</strong>
        </div>
        <button
          className={`drawer-link ${activeTab === 'home' ? 'active' : ''}`}
          type="button"
          onClick={() => {
            setActiveTab('home');
            setMenuOpen(false);
          }}
        >
          Startseite
        </button>
        {canManageTournaments && (
          <button
            className={`drawer-link ${activeTab === 'tournaments' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setActiveTab('tournaments');
              setMenuOpen(false);
            }}
          >
            Turnierverwaltung
          </button>
        )}
        <button
          className={`drawer-link ${activeTab === 'registrations' ? 'active' : ''}`}
          type="button"
          onClick={() => {
            setActiveTab('registrations');
            setMenuOpen(false);
          }}
        >
          Anmeldungen
        </button>
        {isAdmin && (
          <button
            className={`drawer-link ${activeTab === 'users' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setActiveTab('users');
              setMenuOpen(false);
            }}
          >
            Benutzer
          </button>
        )}
        {isAdmin && (
          <button
            className={`drawer-link ${activeTab === 'tips' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setActiveTab('tips');
              setMenuOpen(false);
            }}
          >
            Turnier-Vorschläge
          </button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setMenuOpen(false);
            handleLogout();
          }}
        >
          Abmelden
        </Button>
      </AppHeader>

      <Feedback message={message} error={error} />

      {activeTab === 'home' && (
        <HomeTournaments
          heading={homeHeading}
          language={language}
          query={homeQuery}
          setQuery={setHomeQuery}
          showMineFilter={canManageTournaments}
          onlyMine={homeOnlyMine}
          setOnlyMine={setHomeOnlyMine}
          filterOpen={homeFilterOpen}
          setFilterOpen={setHomeFilterOpen}
          filterMonth={homeFilterMonth}
          setFilterMonth={setHomeFilterMonth}
          filterFormation={homeFilterFormation}
          setFilterFormation={setHomeFilterFormation}
          filterOpenOnly={homeFilterOpenOnly}
          setFilterOpenOnly={setHomeFilterOpenOnly}
          onResetFilters={resetHomeFilters}
          tournaments={visibleHomeTournaments}
          total={filteredHomeTournaments.length}
          hasMore={hasMoreHomeTournaments}
          onLoadMore={() => setHomeVisibleCount((count) => count + 10)}
          onOpenTournament={(tournament) => navigate(`/turniere/${tournament.id}`)}
          tips={tournamentTips}
          navigate={navigate}
          onRegister={(tournament) => {
            setSelectedTournamentId(tournament.id);
            setRegistrationForm({ ...EMPTY_REGISTRATION_FORM, tournamentId: tournament.id });
            setAuthView('publicRegistration');
            clearFeedback();
          }}
        />
      )}

      {authView === 'publicRegistration' && selectedTournament && (
        <AuthModal
          title={authTitle(needsSetup, authView)}
          subtitle={authSubtitle(needsSetup, authView)}
          onClose={() => {
            setAuthView('home');
            clearFeedback();
          }}
        >
          <PublicRegistrationPanel
            tournament={selectedTournament}
            form={registrationForm}
            setForm={setRegistrationForm}
            onSubmit={handleRegistrationSubmit}
            onCancel={() => {
              setAuthView('home');
              clearFeedback();
            }}
          />
        </AuthModal>
      )}

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

      {activeTab === 'tips' && isAdmin && (
        <section className="single-column">
          <TournamentTipModeration
            tips={pendingTips}
            onApprove={(tip) => handleModerateTournamentTip(tip, 'approved')}
            onReject={(tip) => handleModerateTournamentTip(tip, 'rejected')}
            onDelete={handleDeleteTournamentTip}
          />
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
          <InstallAppButton />
          <LanguageSelect language={language} setLanguage={setLanguage} />
        </div>
        <img src="/icons/logo.png" alt="Pétanque Turnier Manager Online" className="app-icon" />
        <p className="eyebrow">Pétanque Turnier Manager Online</p>
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

function AppHeader({ heading, language, setLanguage, menuOpen, onToggleMenu, onCloseMenu, children }) {
  return (
    <header className="topbar">
      <div className="brand">
        <img src="/icons/logo.png" alt="Pétanque Turnier Manager Online" className="brand-logo" />
        <div>
          <p className="eyebrow">Pétanque Turnier Manager Online</p>
          <h1>{heading}</h1>
        </div>
      </div>
      <button
        className="hamburger-btn"
        type="button"
        aria-label="Menü öffnen"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <span className="hamburger-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      {menuOpen && (
        <>
          <div className="nav-drawer-backdrop" onClick={onCloseMenu} />
          <nav className="nav-drawer" aria-label="Hauptmenü">
            <InstallAppButton />
            <LanguageSelect language={language} setLanguage={setLanguage} />
            {children}
          </nav>
        </>
      )}
    </header>
  );
}

function AuthModal({ title, subtitle, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Schließen">
          ×
        </button>
        <h2 id="modal-title">{title}</h2>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function StandalonePageHeader({ heading, language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, onLogout }) {
  return (
    <AppHeader
      heading={heading}
      language={language}
      setLanguage={setLanguage}
      menuOpen={menuOpen}
      onToggleMenu={() => setMenuOpen((open) => !open)}
      onCloseMenu={() => setMenuOpen(false)}
    >
      <button
        className="drawer-link"
        type="button"
        onClick={() => {
          setMenuOpen(false);
          navigate('/');
        }}
      >
        Zur Startseite
      </button>
      {currentUser && (
        <Button
          variant="secondary"
          onClick={() => {
            setMenuOpen(false);
            onLogout();
          }}
        >
          Abmelden
        </Button>
      )}
    </AppHeader>
  );
}

function useRoutedTournament(id, tournaments) {
  const [fetched, setFetched] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const existing = tournaments.find((tournament) => tournament.id === id) || null;

  useEffect(() => {
    if (existing) {
      setFetched(null);
      setNotFound(false);
      return;
    }

    let cancelled = false;
    setNotFound(false);
    api(`/api/tournaments/${id}`)
      .then((data) => {
        if (!cancelled) {
          setFetched(data.tournament);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotFound(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, existing]);

  return { tournament: existing || fetched, notFound: notFound && !existing };
}

function TournamentDetailPage({
  route,
  tournaments,
  currentUser,
  language,
  setLanguage,
  navigate,
  menuOpen,
  setMenuOpen,
  registrationForm,
  setRegistrationForm,
  onSubmitRegistration,
  message,
  error,
  onLogout,
}) {
  const { tournament, notFound } = useRoutedTournament(route.id, tournaments);

  if (notFound) {
    return (
      <main className="app-shell">
        <StandalonePageHeader
          heading="Turnier nicht gefunden"
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          onLogout={onLogout}
        />
        <section className="home-tournaments">
          <p className="muted">Dieses Turnier existiert nicht oder ist nicht öffentlich sichtbar.</p>
          <button className="link-button" type="button" onClick={() => navigate('/')}>
            Zur Startseite
          </button>
        </section>
      </main>
    );
  }

  if (!tournament) {
    return (
      <main className="app-shell">
        <StandalonePageHeader
          heading="Turnier wird geladen…"
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          onLogout={onLogout}
        />
      </main>
    );
  }

  const canRegister = tournament.status === 'registration' && tournament.visibility === 'public';
  const canShowParticipants = tournament.participantsPublic || tournament.canManage;

  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={tournament.name}
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <Feedback message={message} error={error} />

      <section className="tournament-detail-page">
        <nav className="tournament-detail-tabs" aria-label="Turnierdetails">
          <button
            className={`tournament-detail-tab ${route.view === 'info' ? 'active' : ''}`}
            type="button"
            onClick={() => navigate(`/turniere/${tournament.id}/info`)}
          >
            Info
          </button>
          {canRegister && (
            <button
              className={`tournament-detail-tab ${route.view === 'anmelden' ? 'active' : ''}`}
              type="button"
              onClick={() => navigate(`/turniere/${tournament.id}/anmelden`)}
            >
              Anmelden
            </button>
          )}
          {canShowParticipants && (
            <button
              className={`tournament-detail-tab ${route.view === 'teilnehmer' ? 'active' : ''}`}
              type="button"
              onClick={() => navigate(`/turniere/${tournament.id}/teilnehmer`)}
            >
              Teilnehmer
            </button>
          )}
        </nav>

        <div className="tournament-detail-content">
          {route.view === 'info' && <TournamentInfo tournament={tournament} />}

          {route.view === 'anmelden' && canRegister && (
            <PublicRegistrationPanel
              tournament={tournament}
              form={registrationForm}
              setForm={setRegistrationForm}
              onSubmit={onSubmitRegistration}
              onCancel={() => navigate(`/turniere/${tournament.id}/info`)}
            />
          )}

          {route.view === 'teilnehmer' && canShowParticipants && <TournamentParticipants tournamentId={tournament.id} />}
        </div>
      </section>
    </main>
  );
}

function TournamentInfo({ tournament }) {
  return (
    <div className="panel">
      <p>
        <strong>Datum</strong>: {formatDate(tournament.date)} {tournament.startTime || ''}
      </p>
      <p>
        <strong>Ort</strong>: {tournament.location}
      </p>
      <p>
        <strong>Turniersystem</strong>: {labelFor(TOURNAMENT_TYPES, tournament.type)}
      </p>
      <p>
        <strong>Formation</strong>: {labelFor(FORMATIONS, tournament.formation)}
      </p>
      {tournament.description && <p>{tournament.description}</p>}
      {Boolean(tournament.entryFeeCents) && (
        <p>
          <strong>Startgeld</strong>: {centsToEuro(tournament.entryFeeCents)} €
        </p>
      )}
      {tournament.registrationDeadline && (
        <p>
          <strong>Meldefrist</strong>: {new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(tournament.registrationDeadline))}
        </p>
      )}
      <p>
        <strong>Max. Meldungen</strong>: {tournament.maxRegistrations || '∞'}
      </p>
      {(tournament.contactName || tournament.contactEmail || tournament.contactPhone) && (
        <p>
          <strong>Kontakt</strong>: {[tournament.contactName, tournament.contactEmail, tournament.contactPhone].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

function TournamentParticipants({ tournamentId }) {
  const [participants, setParticipants] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setForbidden(false);
    api(`/api/tournaments/${tournamentId}/participants`)
      .then((data) => {
        if (!cancelled) {
          setParticipants(data.participants);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setForbidden(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  if (forbidden) {
    return <p className="muted">Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.</p>;
  }

  if (!participants) {
    return <p className="muted">Teilnehmerliste wird geladen…</p>;
  }

  if (!participants.length) {
    return <p className="muted">Noch keine Anmeldungen.</p>;
  }

  return (
    <div className="participants-list">
      {participants.map((participant, index) => (
        <article className="data-row participants-row" key={`${participant.firstName}-${participant.lastName}-${index}`}>
          <div>
            <strong>
              {participant.firstName} {participant.lastName}
            </strong>
            <span>{participant.club}</span>
          </div>
          {(participant.partnerFirstName || participant.partnerLastName) && (
            <div>
              <strong>
                {participant.partnerFirstName} {participant.partnerLastName}
              </strong>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function SubmitTournamentTipPage({ language, setLanguage, menuOpen, setMenuOpen, navigate, form, setForm, onSubmit, message, error, currentUser, onLogout }) {
  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading="Turnier melden"
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <Feedback message={message} error={error} />

      <section className="submit-tip-page">
        <div className="submit-tip-intro">
          <div>
            <p className="eyebrow">Kalendereintrag für externe Anmeldung</p>
            <h2>Turnier einreichen</h2>
            <p className="subtitle">
              Euer Turnier ist noch nicht bei uns angelegt? Meldet es hier als Kalendereintrag mit Link zur externen Anmeldung.
            </p>
          </div>
          <button className="link-button" type="button" onClick={() => navigate('/')}>
            Zur Startseite
          </button>
        </div>

        <div className="panel submit-tip-panel">
          <p className="muted">
            Wir veröffentlichen bestätigte Meldungen nach kurzer Prüfung in der öffentlichen Turniersuche.
          </p>
          <form className="form dense" onSubmit={onSubmit}>
            <fieldset className="form-section">
              <legend>Turnierdaten</legend>
              <TextField label="Turniername" value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
              <div className="form-grid">
                <TextField label="Datum" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} required />
                <TextField label="Startzeit" type="time" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} />
              </div>
              <TextField label="Ort" value={form.location} onChange={(location) => setForm({ ...form, location })} />
              <SelectField label="Formation" value={form.formation} onChange={(formation) => setForm({ ...form, formation })} options={FORMATIONS} />
              <TextArea label="Weitere Infos" value={form.info} onChange={(info) => setForm({ ...form, info })} />
            </fieldset>

            <fieldset className="form-section">
              <legend>Anmeldelink</legend>
              <TextField
                label="Link zur Website"
                type="url"
                value={form.externalLink}
                onChange={(externalLink) => setForm({ ...form, externalLink })}
                required
              />
              <TextField label="Flyer-Link (PDF)" type="url" value={form.flyerLink} onChange={(flyerLink) => setForm({ ...form, flyerLink })} />
            </fieldset>

            <fieldset className="form-section">
              <legend>Kontakt für Rückfragen</legend>
              <div className="form-grid">
                <TextField label="Dein Name" value={form.submitterName} onChange={(submitterName) => setForm({ ...form, submitterName })} required minLength={2} />
                <TextField
                  label="Deine E-Mail"
                  type="email"
                  value={form.submitterEmail}
                  onChange={(submitterEmail) => setForm({ ...form, submitterEmail })}
                  required
                />
              </div>
            </fieldset>

            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(event) => setForm({ ...form, consent: event.target.checked })}
                required
              />
              Ich habe die Datenschutzerklärung gelesen und akzeptiere sie.
            </label>
            <Button type="submit">Turnier melden</Button>
          </form>
        </div>
      </section>
    </main>
  );
}

function TournamentTipModeration({ tips, onApprove, onReject, onDelete }) {
  return (
    <div className="panel">
      <div className="section-title">
        <h2>Turnier-Vorschläge</h2>
        <span className="counter">{tips.length}</span>
      </div>
      {!tips.length && <p className="muted">Keine offenen Vorschläge.</p>}
      <div className="user-list">
        {tips.map((tip) => (
          <article className="data-row tip-moderation-row" key={tip.id}>
            <div>
              <strong>{tip.name}</strong>
              <span>{formatDate(tip.date)} {tip.startTime || ''} · {tip.location || ''}</span>
              <small>
                {labelFor(FORMATIONS, tip.formation)} · {tip.submitterName} ({tip.submitterEmail})
              </small>
            </div>
            <div className="row-actions">
              <Button variant="secondary" onClick={() => onApprove(tip)}>
                Freigeben
              </Button>
              <Button variant="danger" onClick={() => onReject(tip)}>
                Ablehnen
              </Button>
              <Button variant="danger" onClick={() => onDelete(tip)}>
                Löschen
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function HomeTournaments({
  heading,
  language,
  query,
  setQuery,
  showMineFilter,
  onlyMine,
  setOnlyMine,
  filterOpen,
  setFilterOpen,
  filterMonth,
  setFilterMonth,
  filterFormation,
  setFilterFormation,
  filterOpenOnly,
  setFilterOpenOnly,
  onResetFilters,
  tournaments,
  total,
  hasMore,
  onLoadMore,
  onRegister,
  onOpenTournament,
  tips,
  navigate,
}) {
  const activeFilterCount = [
    showMineFilter && onlyMine,
    filterMonth,
    filterFormation,
    filterOpenOnly,
  ].filter(Boolean).length;
  const nextTournament = tournaments[0] || null;

  return (
    <section className="home-tournaments">
      <div className="home-finder">
        <div className="home-finder-copy">
          <p className="eyebrow">Pétanque Turnier Manager Online</p>
          <h2>Finde dein nächstes Pétanque-Turnier</h2>
          <p className="subtitle">Suche nach Ort, Verein oder Turniersystem und melde dich direkt online an.</p>
        </div>
        <div className="home-finder-stats" aria-label="Turniersuche Übersicht">
          <div>
            <strong>{total}</strong>
            <span>Gefundene Turniere</span>
          </div>
          <div>
            <strong>{nextTournament ? formatDate(nextTournament.date) : 'keiner'}</strong>
            <span>Nächster Termin</span>
          </div>
          <div>
            <strong>{activeFilterCount > 0 ? 'Filter aktiv' : 'Keine Filter aktiv'}</strong>
            <span>Finder</span>
          </div>
        </div>
      </div>

      <div className="home-search-panel">
        <label className="home-search-field">
          Turnier suchen
          <input
            type="search"
            placeholder="Name, Ort oder Turniersystem"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="home-search-actions">
          {showMineFilter && (
            <label className="checkbox-field">
              <input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)} />
              Nur meine Turniere
            </label>
          )}
          <Button variant="secondary" onClick={() => setFilterOpen((open) => !open)}>
            {filterOpen ? 'Filter ausblenden' : 'Filter anzeigen'}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/turnier-melden')}>
            Turnier melden
          </Button>
        </div>

        {filterOpen && (
          <div className="filter-panel">
            <div className="filter-grid">
              <SelectField
                label="Monat"
                value={filterMonth}
                onChange={setFilterMonth}
                options={[{ value: '', label: 'Alle Monate' }, ...MONTHS]}
              />
              <SelectField
                label="Formation"
                value={filterFormation}
                onChange={setFilterFormation}
                options={[{ value: '', label: 'Alle Formationen' }, ...FORMATIONS]}
              />
            </div>
            <label className="checkbox-field">
              <input type="checkbox" checked={filterOpenOnly} onChange={(event) => setFilterOpenOnly(event.target.checked)} />
              Anmeldung möglich
            </label>
            <div className="filter-actions">
              <button className="link-button" type="button" onClick={onResetFilters}>
                Zurücksetzen
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="section-title home-results-title">
        <div>
          <p className="eyebrow">Alle passenden Turniere</p>
          <h2>{heading}</h2>
        </div>
        <span className="counter">{total}</span>
      </div>

      {!tournaments.length && (
        <div className="empty-state">
          <strong>Keine Turniere gefunden.</strong>
          <p className="muted">Passe die Suche an oder melde ein Turnier, das im Kalender fehlt.</p>
          <Button variant="secondary" onClick={() => navigate('/turnier-melden')}>
            Turnier melden
          </Button>
        </div>
      )}

      <div className="tournament-card-list">
        {tournaments.map((tournament) => (
          <article className="tournament-card" key={tournament.id}>
            <button className="tournament-card-main" type="button" onClick={() => onOpenTournament(tournament)}>
              <span className="tournament-card-date">
                <strong>{formatDate(tournament.date)}</strong>
                <small>{tournament.startTime || 'Ganztägig'}</small>
              </span>
              <span className="tournament-card-copy">
                <strong>{tournament.name}</strong>
                <span>{tournament.location}</span>
                <small>
                  {labelFor(TOURNAMENT_TYPES, tournament.type)} · {labelFor(FORMATIONS, tournament.formation)}
                </small>
              </span>
            </button>
            <div className="tournament-card-meta">
              <span className={`status status-${tournament.status}`}>{registrationStatusLabel(tournament, language)}</span>
              <Button
                variant="secondary"
                onClick={() => onRegister(tournament)}
                disabled={tournament.status !== 'registration' || tournament.visibility !== 'public'}
              >
                Anmelden
              </Button>
            </div>
          </article>
        ))}
      </div>

      {hasMore && (
        <div className="load-more-wrap">
          <Button variant="secondary" onClick={onLoadMore}>
            Weitere Turniere laden
          </Button>
        </div>
      )}

      {tips.length > 0 && (
        <div className="tip-list">
          <div className="section-title">
            <div>
              <p className="eyebrow">Extern gemeldet</p>
              <h2>Vorgeschlagene Turniere</h2>
            </div>
            <span className="counter">{tips.length}</span>
          </div>
          <p className="muted">Kalendereinträge von Vereinen mit Anmeldung auf deren eigener Seite.</p>
          <div className="tournament-card-list compact">
            {tips.map((tip) => (
              <article className="tournament-card tip-card" key={tip.id}>
                <div className="tournament-card-main">
                  <span className="tournament-card-date">
                    <strong>{formatDate(tip.date)}</strong>
                    <small>{tip.startTime || 'Ganztägig'}</small>
                  </span>
                  <span className="tournament-card-copy">
                    <strong>{tip.name}</strong>
                    <span>{tip.location || ''}</span>
                    <small>{labelFor(FORMATIONS, tip.formation)}</small>
                  </span>
                </div>
                <a className="button button-secondary" href={tip.externalLink} target="_blank" rel="noreferrer">
                  Zur Anmeldung
                </a>
              </article>
            ))}
          </div>
        </div>
      )}
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
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.participantsPublic}
          onChange={(event) => setForm({ ...form, participantsPublic: event.target.checked })}
        />
        Teilnehmerliste öffentlich sichtbar
      </label>
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

function usePath() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    function onPopState() {
      setPath(window.location.pathname);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigate(next) {
    if (next !== window.location.pathname) {
      window.history.pushState({}, '', next);
    }
    setPath(next);
  }

  return [path, navigate];
}

function matchTournamentRoute(path) {
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== 'turniere' || !segments[1]) {
    return null;
  }

  const id = decodeURIComponent(segments[1]);
  const sub = segments[2] || 'info';
  if (!['info', 'anmelden', 'teilnehmer'].includes(sub)) {
    return null;
  }

  return { id, view: sub };
}

function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true,
  );

  useEffect(() => {
    function onBeforeInstall(event) {
      event.preventDefault();
      setDeferredPrompt(event);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return { canInstall: Boolean(deferredPrompt), installed, promptInstall };
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  return isIos && isSafari;
}

function InstallAppButton({ variant = 'secondary' }) {
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [showIosHint, setShowIosHint] = useState(false);

  if (installed) {
    return null;
  }

  if (canInstall) {
    return (
      <Button variant={variant} onClick={promptInstall}>
        App installieren
      </Button>
    );
  }

  if (isIosSafari()) {
    return (
      <div className="install-hint">
        <Button variant={variant} onClick={() => setShowIosHint((prev) => !prev)}>
          App installieren
        </Button>
        {showIosHint && (
          <p className="install-hint-text">
            Tippe unten auf <strong>Teilen</strong> und dann auf <strong>„Zum Home-Bildschirm“</strong>.
          </p>
        )}
      </div>
    );
  }

  return null;
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
    participantsPublic: Boolean(form.participantsPublic),
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

function isOwnTournament(tournament, user) {
  return Boolean(user) && (tournament.createdBy === user.id || tournament.managerId === user.id);
}

function isUpcoming(tournament) {
  if (tournament.status === 'finished') {
    return false;
  }
  const today = new Date().toISOString().slice(0, 10);
  return tournament.date >= today;
}

function hasOpenRegistration(tournament) {
  if (tournament.status !== 'registration') {
    return false;
  }
  if (tournament.registrationDeadline && new Date(tournament.registrationDeadline).getTime() < Date.now()) {
    return false;
  }
  if (!tournament.maxRegistrations) {
    return true;
  }
  return tournament.activeRegistrations < tournament.maxRegistrations || tournament.waitlistRegistrations > 0;
}

const SLOTS_FREE_TEMPLATES = {
  de: (free, max) => `${free} von ${max} Plätzen frei`,
  nl: (free, max) => `${free} van ${max} plaatsen vrij`,
  en: (free, max) => `${free} of ${max} spots free`,
  es: (free, max) => `${free} de ${max} plazas libres`,
  fr: (free, max) => `${free} sur ${max} places libres`,
};

function registrationStatusLabel(tournament, language) {
  const deadlinePassed = tournament.registrationDeadline && new Date(tournament.registrationDeadline).getTime() < Date.now();
  const isFull = Boolean(tournament.maxRegistrations) && tournament.activeRegistrations >= tournament.maxRegistrations;
  const registrationOpen = tournament.status === 'registration' && !deadlinePassed;

  if (!registrationOpen || isFull) {
    if (isFull && tournament.waitlistRegistrations > 0) {
      return translateText('Anmeldung Warteliste möglich', language);
    }
    return translateText('Anmeldung nicht mehr möglich', language);
  }

  if (!tournament.maxRegistrations) {
    return translateText('Anmeldung läuft', language);
  }

  const free = tournament.maxRegistrations - tournament.activeRegistrations;
  return (SLOTS_FREE_TEMPLATES[language] || SLOTS_FREE_TEMPLATES.de)(free, tournament.maxRegistrations);
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
    'Doublette gemischt': 'Doublette gemengd',
    'Triplette gemischt': 'Triplette gemengd',
    Januar: 'Januari',
    Februar: 'Februari',
    März: 'Maart',
    April: 'April',
    Mai: 'Mei',
    Juni: 'Juni',
    Juli: 'Juli',
    August: 'Augustus',
    September: 'September',
    Oktober: 'Oktober',
    November: 'November',
    Dezember: 'December',
    'Keine Angabe': 'Geen opgave',
    'Teilnehmerliste öffentlich sichtbar': 'Deelnemerslijst openbaar zichtbaar',
    'Nur meine Turniere': 'Alleen mijn toernooien',
    'Turnier suchen': 'Toernooi zoeken',
    'Name, Ort oder Turniersystem': 'Naam, plaats of toernooisysteem',
    'Filter ausblenden': 'Filter verbergen',
    'Filter anzeigen': 'Filter tonen',
    'Turnier melden': 'Toernooi melden',
    'Finde dein nächstes Pétanque-Turnier': 'Vind je volgende pétanquetoernooi',
    'Suche nach Ort, Verein oder Turniersystem und melde dich direkt online an.':
      'Zoek op plaats, vereniging of toernooisysteem en schrijf je direct online in.',
    'Gefundene Turniere': 'Gevonden toernooien',
    keiner: 'geen',
    'Nächster Termin': 'Volgende datum',
    'Filter aktiv': 'Filter actief',
    'Keine Filter aktiv': 'Geen filter actief',
    Finder: 'Zoeker',
    'Alle passenden Turniere': 'Alle passende toernooien',
    'Keine Turniere gefunden.': 'Geen toernooien gevonden.',
    'Passe die Suche an oder melde ein Turnier, das im Kalender fehlt.':
      'Pas de zoekopdracht aan of meld een toernooi dat in de kalender ontbreekt.',
    Ganztägig: 'Hele dag',
    'Weitere Turniere laden': 'Meer toernooien laden',
    'Extern gemeldet': 'Extern gemeld',
    'Kalendereinträge von Vereinen mit Anmeldung auf deren eigener Seite.':
      'Kalendervermeldingen van verenigingen met inschrijving op hun eigen website.',
    Monat: 'Maand',
    'Alle Monate': 'Alle maanden',
    'Alle Formationen': 'Alle formaties',
    'Anmeldung möglich': 'Inschrijving mogelijk',
    Zurücksetzen: 'Resetten',
    'Vorgeschlagene Turniere': 'Voorgestelde toernooien',
    'Von Vereinen gemeldete Turniere ohne Online-Anmeldung bei uns — Anmeldung erfolgt extern.':
      'Door verenigingen gemelde toernooien zonder online inschrijving bij ons — inschrijving verloopt extern.',
    'Zur Anmeldung': 'Naar inschrijving',
    'Anmeldung Warteliste möglich': 'Inschrijving wachtlijst mogelijk',
    'Anmeldung nicht mehr möglich': 'Inschrijving niet meer mogelijk',
    'Anmeldung läuft': 'Inschrijving loopt',
    'Zur Startseite': 'Naar startpagina',
    Startseite: 'Startpagina',
    'Turnier nicht gefunden': 'Toernooi niet gevonden',
    'Dieses Turnier existiert nicht oder ist nicht öffentlich sichtbar.': 'Dit toernooi bestaat niet of is niet openbaar zichtbaar.',
    'Turnier wird geladen…': 'Toernooi wordt geladen…',
    Info: 'Info',
    Teilnehmer: 'Deelnemers',
    Startgeld: 'Inschrijfgeld',
    Kontakt: 'Contact',
    'Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.': 'De deelnemerslijst is voor dit toernooi niet openbaar.',
    'Teilnehmerliste wird geladen…': 'Deelnemerslijst wordt geladen…',
    'Noch keine Anmeldungen.': 'Nog geen inschrijvingen.',
    'Kalendereintrag für externe Anmeldung': 'Kalendervermelding voor externe inschrijving',
    'Turnier einreichen': 'Toernooi indienen',
    'Euer Turnier ist noch nicht bei uns angelegt? Meldet es hier als Kalendereintrag mit Link zur externen Anmeldung.':
      'Staat jullie toernooi nog niet bij ons? Meld het hier aan als kalendervermelding met link naar externe inschrijving.',
    'Wir veröffentlichen bestätigte Meldungen nach kurzer Prüfung in der öffentlichen Turniersuche.':
      'We publiceren bevestigde meldingen na een korte controle in de openbare toernooizoekfunctie.',
    Turnierdaten: 'Toernooigegevens',
    Anmeldelink: 'Inschrijflink',
    'Kontakt für Rückfragen': 'Contact voor vragen',
    Turniername: 'Toernooinaam',
    'Weitere Infos': 'Meer info',
    'Link zur Website': 'Link naar website',
    'Flyer-Link (PDF)': 'Flyer-link (PDF)',
    'Dein Name': 'Jouw naam',
    'Deine E-Mail': 'Jouw e-mail',
    'Ich habe die Datenschutzerklärung gelesen und akzeptiere sie.': 'Ik heb het privacybeleid gelezen en ga ermee akkoord.',
    'Turnier-Vorschläge': 'Toernooivoorstellen',
    'Keine offenen Vorschläge.': 'Geen openstaande voorstellen.',
    Freigeben: 'Vrijgeven',
    Ablehnen: 'Afwijzen',
    'Turniermeldung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.':
      'Toernooimelding opgeslagen. Bevestig je e-mailadres via de link in de e-mail.',
    'Deine Turniermeldung wurde bestätigt und wartet nun auf Freigabe.': 'Je toernooimelding is bevestigd en wacht nu op goedkeuring.',
    'Turniermeldung wurde freigegeben.': 'Toernooimelding is vrijgegeven.',
    'Turniermeldung wurde abgelehnt.': 'Toernooimelding is afgewezen.',
    'Turniermeldung wurde gelöscht.': 'Toernooimelding is verwijderd.',
    'A valid external link is required': 'Een geldige link is verplicht',
    'Submitter name must contain at least 2 characters': 'Naam moet minstens 2 tekens bevatten',
    'A valid submitter email is required': 'Een geldig e-mailadres is verplicht',
    'Invalid status': 'Ongeldige status',
    'Tournament tip not found or not pending review': 'Toernooimelding niet gevonden of niet in afwachting',
    'Tournament tip not found': 'Toernooimelding niet gevonden',
    'Invalid formation': 'Ongeldige formatie',
    'A valid tournament date is required': 'Een geldige datum is verplicht',
    'Tournament name must contain at least 2 characters': 'Toernooinaam moet minstens 2 tekens bevatten',
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
    'Doublette gemischt': 'Doublette mixed',
    'Triplette gemischt': 'Triplette mixed',
    Januar: 'January',
    Februar: 'February',
    März: 'March',
    April: 'April',
    Mai: 'May',
    Juni: 'June',
    Juli: 'July',
    August: 'August',
    September: 'September',
    Oktober: 'October',
    November: 'November',
    Dezember: 'December',
    'Keine Angabe': 'Not specified',
    'Teilnehmerliste öffentlich sichtbar': 'Participant list publicly visible',
    'Nur meine Turniere': 'Only my tournaments',
    'Turnier suchen': 'Search tournament',
    'Name, Ort oder Turniersystem': 'Name, location or tournament system',
    'Filter ausblenden': 'Hide filter',
    'Filter anzeigen': 'Show filter',
    'Turnier melden': 'Submit tournament',
    'Finde dein nächstes Pétanque-Turnier': 'Find your next pétanque tournament',
    'Suche nach Ort, Verein oder Turniersystem und melde dich direkt online an.':
      'Search by location, club or tournament system and register online.',
    'Gefundene Turniere': 'Found tournaments',
    keiner: 'none',
    'Nächster Termin': 'Next date',
    'Filter aktiv': 'Filter active',
    'Keine Filter aktiv': 'No filter active',
    Finder: 'Finder',
    'Alle passenden Turniere': 'All matching tournaments',
    'Keine Turniere gefunden.': 'No tournaments found.',
    'Passe die Suche an oder melde ein Turnier, das im Kalender fehlt.':
      'Adjust the search or submit a tournament that is missing from the calendar.',
    Ganztägig: 'All day',
    'Weitere Turniere laden': 'Load more tournaments',
    'Extern gemeldet': 'Submitted externally',
    'Kalendereinträge von Vereinen mit Anmeldung auf deren eigener Seite.':
      'Calendar entries from clubs with registration on their own website.',
    Monat: 'Month',
    'Alle Monate': 'All months',
    'Alle Formationen': 'All formations',
    'Anmeldung möglich': 'Registration possible',
    Zurücksetzen: 'Reset',
    'Vorgeschlagene Turniere': 'Suggested tournaments',
    'Von Vereinen gemeldete Turniere ohne Online-Anmeldung bei uns — Anmeldung erfolgt extern.':
      'Tournaments submitted by clubs without online registration with us — registration happens externally.',
    'Zur Anmeldung': 'To registration',
    'Anmeldung Warteliste möglich': 'Registration waitlist possible',
    'Anmeldung nicht mehr möglich': 'Registration no longer possible',
    'Anmeldung läuft': 'Registration open',
    'Zur Startseite': 'To home page',
    Startseite: 'Home',
    'Turnier nicht gefunden': 'Tournament not found',
    'Dieses Turnier existiert nicht oder ist nicht öffentlich sichtbar.': 'This tournament does not exist or is not publicly visible.',
    'Turnier wird geladen…': 'Loading tournament…',
    Info: 'Info',
    Teilnehmer: 'Participants',
    Startgeld: 'Entry fee',
    Kontakt: 'Contact',
    'Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.': 'The participant list is not public for this tournament.',
    'Teilnehmerliste wird geladen…': 'Loading participant list…',
    'Noch keine Anmeldungen.': 'No registrations yet.',
    'Kalendereintrag für externe Anmeldung': 'Calendar entry for external registration',
    'Turnier einreichen': 'Submit tournament',
    'Euer Turnier ist noch nicht bei uns angelegt? Meldet es hier als Kalendereintrag mit Link zur externen Anmeldung.':
      'Is your tournament not yet listed with us? Submit it here as a calendar entry with a link to external registration.',
    'Wir veröffentlichen bestätigte Meldungen nach kurzer Prüfung in der öffentlichen Turniersuche.':
      'We publish confirmed submissions in the public tournament search after a short review.',
    Turnierdaten: 'Tournament details',
    Anmeldelink: 'Registration link',
    'Kontakt für Rückfragen': 'Contact for questions',
    Turniername: 'Tournament name',
    'Weitere Infos': 'More info',
    'Link zur Website': 'Link to website',
    'Flyer-Link (PDF)': 'Flyer link (PDF)',
    'Dein Name': 'Your name',
    'Deine E-Mail': 'Your email',
    'Ich habe die Datenschutzerklärung gelesen und akzeptiere sie.': 'I have read the privacy policy and accept it.',
    'Turnier-Vorschläge': 'Tournament suggestions',
    'Keine offenen Vorschläge.': 'No pending suggestions.',
    Freigeben: 'Approve',
    Ablehnen: 'Reject',
    'Turniermeldung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.':
      'Tournament submission saved. Please confirm your email address using the link in the email.',
    'Deine Turniermeldung wurde bestätigt und wartet nun auf Freigabe.':
      'Your tournament submission has been confirmed and is now awaiting approval.',
    'Turniermeldung wurde freigegeben.': 'Tournament submission has been approved.',
    'Turniermeldung wurde abgelehnt.': 'Tournament submission has been rejected.',
    'Turniermeldung wurde gelöscht.': 'Tournament submission has been deleted.',
    'A valid external link is required': 'A valid external link is required',
    'Submitter name must contain at least 2 characters': 'Submitter name must contain at least 2 characters',
    'A valid submitter email is required': 'A valid submitter email is required',
    'Invalid status': 'Invalid status',
    'Tournament tip not found or not pending review': 'Tournament tip not found or not pending review',
    'Tournament tip not found': 'Tournament tip not found',
    'Invalid formation': 'Invalid formation',
    'A valid tournament date is required': 'A valid tournament date is required',
    'Tournament name must contain at least 2 characters': 'Tournament name must contain at least 2 characters',
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
    'Doublette gemischt': 'Doublette mixto',
    'Triplette gemischt': 'Triplette mixto',
    Januar: 'Enero',
    Februar: 'Febrero',
    März: 'Marzo',
    April: 'Abril',
    Mai: 'Mayo',
    Juni: 'Junio',
    Juli: 'Julio',
    August: 'Agosto',
    September: 'Septiembre',
    Oktober: 'Octubre',
    November: 'Noviembre',
    Dezember: 'Diciembre',
    'Keine Angabe': 'Sin especificar',
    'Teilnehmerliste öffentlich sichtbar': 'Lista de participantes visible públicamente',
    'Nur meine Turniere': 'Solo mis torneos',
    'Turnier suchen': 'Buscar torneo',
    'Name, Ort oder Turniersystem': 'Nombre, lugar o sistema',
    'Filter ausblenden': 'Ocultar filtro',
    'Filter anzeigen': 'Mostrar filtro',
    'Turnier melden': 'Notificar torneo',
    'Finde dein nächstes Pétanque-Turnier': 'Encuentra tu próximo torneo de petanca',
    'Suche nach Ort, Verein oder Turniersystem und melde dich direkt online an.':
      'Busca por lugar, club o sistema de torneo e inscríbete online.',
    'Gefundene Turniere': 'Torneos encontrados',
    keiner: 'ninguno',
    'Nächster Termin': 'Próxima fecha',
    'Filter aktiv': 'Filtro activo',
    'Keine Filter aktiv': 'Sin filtro activo',
    Finder: 'Buscador',
    'Alle passenden Turniere': 'Todos los torneos coincidentes',
    'Keine Turniere gefunden.': 'No se encontraron torneos.',
    'Passe die Suche an oder melde ein Turnier, das im Kalender fehlt.':
      'Ajusta la búsqueda o notifica un torneo que falte en el calendario.',
    Ganztägig: 'Todo el día',
    'Weitere Turniere laden': 'Cargar más torneos',
    'Extern gemeldet': 'Notificado externamente',
    'Kalendereinträge von Vereinen mit Anmeldung auf deren eigener Seite.':
      'Entradas de calendario de clubes con inscripción en su propia web.',
    Monat: 'Mes',
    'Alle Monate': 'Todos los meses',
    'Alle Formationen': 'Todas las formaciones',
    'Anmeldung möglich': 'Inscripción posible',
    Zurücksetzen: 'Restablecer',
    'Vorgeschlagene Turniere': 'Torneos sugeridos',
    'Von Vereinen gemeldete Turniere ohne Online-Anmeldung bei uns — Anmeldung erfolgt extern.':
      'Torneos notificados por clubes sin inscripción online con nosotros — la inscripción se realiza externamente.',
    'Zur Anmeldung': 'Ir a la inscripción',
    'Anmeldung Warteliste möglich': 'Inscripción en lista de espera posible',
    'Anmeldung nicht mehr möglich': 'Inscripción ya no es posible',
    'Anmeldung läuft': 'Inscripción abierta',
    'Zur Startseite': 'A la página de inicio',
    Startseite: 'Inicio',
    'Turnier nicht gefunden': 'Torneo no encontrado',
    'Dieses Turnier existiert nicht oder ist nicht öffentlich sichtbar.': 'Este torneo no existe o no es visible públicamente.',
    'Turnier wird geladen…': 'Cargando torneo…',
    Info: 'Info',
    Teilnehmer: 'Participantes',
    Startgeld: 'Cuota',
    Kontakt: 'Contacto',
    'Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.': 'La lista de participantes no es pública para este torneo.',
    'Teilnehmerliste wird geladen…': 'Cargando lista de participantes…',
    'Noch keine Anmeldungen.': 'Aún no hay inscripciones.',
    'Kalendereintrag für externe Anmeldung': 'Entrada de calendario para inscripción externa',
    'Turnier einreichen': 'Enviar torneo',
    'Euer Turnier ist noch nicht bei uns angelegt? Meldet es hier als Kalendereintrag mit Link zur externen Anmeldung.':
      '¿Vuestro torneo aún no está en nuestro calendario? Notificadlo aquí como entrada con enlace a la inscripción externa.',
    'Wir veröffentlichen bestätigte Meldungen nach kurzer Prüfung in der öffentlichen Turniersuche.':
      'Publicamos avisos confirmados en la búsqueda pública de torneos tras una breve revisión.',
    Turnierdaten: 'Datos del torneo',
    Anmeldelink: 'Enlace de inscripción',
    'Kontakt für Rückfragen': 'Contacto para preguntas',
    Turniername: 'Nombre del torneo',
    'Weitere Infos': 'Más información',
    'Link zur Website': 'Enlace al sitio web',
    'Flyer-Link (PDF)': 'Enlace al folleto (PDF)',
    'Dein Name': 'Tu nombre',
    'Deine E-Mail': 'Tu correo',
    'Ich habe die Datenschutzerklärung gelesen und akzeptiere sie.': 'He leído la política de privacidad y la acepto.',
    'Turnier-Vorschläge': 'Propuestas de torneos',
    'Keine offenen Vorschläge.': 'No hay propuestas pendientes.',
    Freigeben: 'Aprobar',
    Ablehnen: 'Rechazar',
    'Turniermeldung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.':
      'Aviso de torneo guardado. Confirma tu correo con el enlace del email.',
    'Deine Turniermeldung wurde bestätigt und wartet nun auf Freigabe.': 'Tu aviso de torneo ha sido confirmado y ahora espera aprobación.',
    'Turniermeldung wurde freigegeben.': 'El aviso de torneo ha sido aprobado.',
    'Turniermeldung wurde abgelehnt.': 'El aviso de torneo ha sido rechazado.',
    'Turniermeldung wurde gelöscht.': 'El aviso de torneo ha sido eliminado.',
    'A valid external link is required': 'Se requiere un enlace válido',
    'Submitter name must contain at least 2 characters': 'El nombre debe tener al menos 2 caracteres',
    'A valid submitter email is required': 'Se requiere un correo válido',
    'Invalid status': 'Estado no válido',
    'Tournament tip not found or not pending review': 'Aviso de torneo no encontrado o no pendiente de revisión',
    'Tournament tip not found': 'Aviso de torneo no encontrado',
    'Invalid formation': 'Formación no válida',
    'A valid tournament date is required': 'Se requiere una fecha válida',
    'Tournament name must contain at least 2 characters': 'El nombre del torneo debe tener al menos 2 caracteres',
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
    'Doublette gemischt': 'Doublette mixte',
    'Triplette gemischt': 'Triplette mixte',
    Januar: 'Janvier',
    Februar: 'Février',
    März: 'Mars',
    April: 'Avril',
    Mai: 'Mai',
    Juni: 'Juin',
    Juli: 'Juillet',
    August: 'Août',
    September: 'Septembre',
    Oktober: 'Octobre',
    November: 'Novembre',
    Dezember: 'Décembre',
    'Keine Angabe': 'Non précisé',
    'Teilnehmerliste öffentlich sichtbar': 'Liste des participants visible publiquement',
    'Nur meine Turniere': 'Seulement mes tournois',
    'Turnier suchen': 'Rechercher un tournoi',
    'Name, Ort oder Turniersystem': 'Nom, lieu ou système',
    'Filter ausblenden': 'Masquer le filtre',
    'Filter anzeigen': 'Afficher le filtre',
    'Turnier melden': 'Signaler un tournoi',
    'Finde dein nächstes Pétanque-Turnier': 'Trouve ton prochain tournoi de pétanque',
    'Suche nach Ort, Verein oder Turniersystem und melde dich direkt online an.':
      'Recherche par lieu, club ou système de tournoi et inscris-toi directement en ligne.',
    'Gefundene Turniere': 'Tournois trouvés',
    keiner: 'aucun',
    'Nächster Termin': 'Prochaine date',
    'Filter aktiv': 'Filtre actif',
    'Keine Filter aktiv': 'Aucun filtre actif',
    Finder: 'Recherche',
    'Alle passenden Turniere': 'Tous les tournois correspondants',
    'Keine Turniere gefunden.': 'Aucun tournoi trouvé.',
    'Passe die Suche an oder melde ein Turnier, das im Kalender fehlt.':
      'Ajuste la recherche ou signale un tournoi absent du calendrier.',
    Ganztägig: 'Toute la journée',
    'Weitere Turniere laden': 'Charger plus de tournois',
    'Extern gemeldet': 'Signalé en externe',
    'Kalendereinträge von Vereinen mit Anmeldung auf deren eigener Seite.':
      'Entrées de calendrier de clubs avec inscription sur leur propre site.',
    Monat: 'Mois',
    'Alle Monate': 'Tous les mois',
    'Alle Formationen': 'Toutes les formations',
    'Anmeldung möglich': 'Inscription possible',
    Zurücksetzen: 'Réinitialiser',
    'Vorgeschlagene Turniere': 'Tournois proposés',
    'Von Vereinen gemeldete Turniere ohne Online-Anmeldung bei uns — Anmeldung erfolgt extern.':
      'Tournois signalés par des clubs sans inscription en ligne chez nous — l’inscription se fait en externe.',
    'Zur Anmeldung': 'Vers l’inscription',
    'Anmeldung Warteliste möglich': 'Inscription en liste d’attente possible',
    'Anmeldung nicht mehr möglich': 'Inscription plus possible',
    'Anmeldung läuft': 'Inscription en cours',
    'Zur Startseite': 'Vers la page d’accueil',
    Startseite: 'Accueil',
    'Turnier nicht gefunden': 'Tournoi introuvable',
    'Dieses Turnier existiert nicht oder ist nicht öffentlich sichtbar.': 'Ce tournoi n’existe pas ou n’est pas visible publiquement.',
    'Turnier wird geladen…': 'Chargement du tournoi…',
    Info: 'Infos',
    Teilnehmer: 'Participants',
    Startgeld: 'Frais d’inscription',
    Kontakt: 'Contact',
    'Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.': 'La liste des participants n’est pas publique pour ce tournoi.',
    'Teilnehmerliste wird geladen…': 'Chargement de la liste des participants…',
    'Noch keine Anmeldungen.': 'Pas encore d’inscriptions.',
    'Kalendereintrag für externe Anmeldung': 'Entrée de calendrier pour inscription externe',
    'Turnier einreichen': 'Soumettre un tournoi',
    'Euer Turnier ist noch nicht bei uns angelegt? Meldet es hier als Kalendereintrag mit Link zur externen Anmeldung.':
      'Votre tournoi n’est pas encore chez nous ? Signalez-le ici comme entrée de calendrier avec un lien vers l’inscription externe.',
    'Wir veröffentlichen bestätigte Meldungen nach kurzer Prüfung in der öffentlichen Turniersuche.':
      'Nous publions les signalements confirmés dans la recherche publique de tournois après une courte vérification.',
    Turnierdaten: 'Données du tournoi',
    Anmeldelink: 'Lien d’inscription',
    'Kontakt für Rückfragen': 'Contact pour questions',
    Turniername: 'Nom du tournoi',
    'Weitere Infos': 'Plus d’infos',
    'Link zur Website': 'Lien vers le site web',
    'Flyer-Link (PDF)': 'Lien du flyer (PDF)',
    'Dein Name': 'Ton nom',
    'Deine E-Mail': 'Ton e-mail',
    'Ich habe die Datenschutzerklärung gelesen und akzeptiere sie.': 'J’ai lu la politique de confidentialité et je l’accepte.',
    'Turnier-Vorschläge': 'Propositions de tournois',
    'Keine offenen Vorschläge.': 'Aucune proposition en attente.',
    Freigeben: 'Approuver',
    Ablehnen: 'Rejeter',
    'Turniermeldung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.':
      'Signalement du tournoi enregistré. Confirme ton adresse e-mail via le lien dans l’e-mail.',
    'Deine Turniermeldung wurde bestätigt und wartet nun auf Freigabe.':
      'Ton signalement de tournoi a été confirmé et attend désormais l’approbation.',
    'Turniermeldung wurde freigegeben.': 'Le signalement du tournoi a été approuvé.',
    'Turniermeldung wurde abgelehnt.': 'Le signalement du tournoi a été rejeté.',
    'Turniermeldung wurde gelöscht.': 'Le signalement du tournoi a été supprimé.',
    'A valid external link is required': 'Un lien valide est requis',
    'Submitter name must contain at least 2 characters': 'Le nom doit contenir au moins 2 caractères',
    'A valid submitter email is required': 'Une adresse e-mail valide est requise',
    'Invalid status': 'Statut invalide',
    'Tournament tip not found or not pending review': 'Signalement introuvable ou non en attente de validation',
    'Tournament tip not found': 'Signalement de tournoi introuvable',
    'Invalid formation': 'Formation invalide',
    'A valid tournament date is required': 'Une date valide est requise',
    'Tournament name must contain at least 2 characters': 'Le nom du tournoi doit contenir au moins 2 caractères',
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
    const cached = ORIGINAL_TEXT.get(node);
    const currentValue = node.nodeValue;
    if (!cached || (currentValue !== cached.original && currentValue !== cached.translated)) {
      ORIGINAL_TEXT.set(node, { original: currentValue });
    }
    const entry = ORIGINAL_TEXT.get(node);
    const source = entry.original.trim();
    const translated = entry.original.replace(source, translateText(source, language));
    entry.translated = translated;
    node.nodeValue = translated;
  }

  for (const element of root.querySelectorAll('[placeholder]')) {
    const cached = ORIGINAL_TEXT.get(element);
    const currentValue = element.getAttribute('placeholder');
    if (!cached || (currentValue !== cached.original && currentValue !== cached.translated)) {
      ORIGINAL_TEXT.set(element, { original: currentValue });
    }
    const entry = ORIGINAL_TEXT.get(element);
    const translated = translateText(entry.original, language);
    entry.translated = translated;
    element.setAttribute('placeholder', translated);
  }
}

function translateText(source, language) {
  if (language === 'de') {
    return source;
  }
  return TRANSLATIONS[language]?.[source] || source;
}
