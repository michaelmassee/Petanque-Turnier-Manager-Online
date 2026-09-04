import { useEffect, useMemo, useRef, useState } from 'react';

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
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

const REGISTRATION_TYPES = [
  { value: 'melee', label: 'Mêlée' },
  { value: 'forme', label: 'Formé' },
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

const RADIUS_OPTIONS = [
  { value: '5', label: '5 km' },
  { value: '10', label: '10 km' },
  { value: '25', label: '25 km' },
  { value: '50', label: '50 km' },
  { value: '100', label: '100 km' },
  { value: '200', label: '200 km' },
  { value: '500', label: '500 km' },
];

const DEFAULT_TOURNAMENT_LIMIT = 5;

const EMPTY_USER_FORM = {
  id: '',
  firstName: '',
  lastName: '',
  email: '',
  role: 'user',
  password: '',
  emailVerified: true,
  passwordChangeRequired: false,
  tournamentLimit: DEFAULT_TOURNAMENT_LIMIT,
};

const EMPTY_PROFILE_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  club: '',
  licenseNr: '',
  currentPassword: '',
  newPassword: '',
  newPasswordConfirm: '',
};

const EMPTY_AUTH_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  passwordConfirm: '',
  token: '',
};

const EMPTY_TOURNAMENT_FORM = {
  id: '',
  managerId: '',
  name: '',
  date: '',
  startTime: '',
  location: '',
  latitude: '',
  longitude: '',
  overrideCoordinates: false,
  description: '',
  type: 'supermelee',
  formation: 'doublette',
  registrationType: 'melee',
  status: 'draft',
  maxRegistrations: 0,
  registrationDeadline: '',
  registrationOpensAt: '',
  entryFeeEuro: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  visibility: 'private',
  internalNotes: '',
  participantsPublic: false,
  licenseRequired: false,
  teamNameEnabled: false,
  waitlistEnabled: true,
  websiteUrl: '',
  logoUrl: '',
  flyerUrl: '',
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
  partnerLicenseNr: '',
  partner2FirstName: '',
  partner2LastName: '',
  partner2Email: '',
  partner2LicenseNr: '',
  teamName: '',
  seedingPosition: '',
  status: 'pending',
  isVip: false,
  publicationNoticeAccepted: false,
};

const REGISTER_SUCCESS = 'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.';
const VERIFY_SUCCESS = 'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.';
const PROFILE_UPDATE_SUCCESS = 'Deine Daten wurden gespeichert.';
const PROFILE_EMAIL_CHANGE_PENDING =
  'Deine Daten wurden gespeichert. Bitte bestätige deine neue E-Mail-Adresse über den Link, den wir dir zugeschickt haben.';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState(() => localStorage.getItem('ptm_language') || 'de');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [authView, setAuthView] = useState('home');
  const [activeTab, setActiveTab] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const [homeQuery, setHomeQuery] = useState('');
  const [homeOnlyMine, setHomeOnlyMine] = useState(false);
  const [homeVisibleCount, setHomeVisibleCount] = useState(10);
  const [homeFilterOpen, setHomeFilterOpen] = useState(false);
  const [homeFilterMonth, setHomeFilterMonth] = useState('');
  const [homeFilterFormation, setHomeFilterFormation] = useState('');
  const [homeFilterOpenOnly, setHomeFilterOpenOnly] = useState(false);
  const [searchOrigin, setSearchOrigin] = useState(null);
  const [searchOriginQuery, setSearchOriginQuery] = useState('');
  const [searchRadiusKm, setSearchRadiusKm] = useState('25');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('');
  const [path, navigate] = usePath();
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE_FORM);
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM);
  const [tournamentForm, setTournamentForm] = useState(EMPTY_TOURNAMENT_FORM);
  const [registrationForm, setRegistrationForm] = useState(EMPTY_REGISTRATION_FORM);
  const [userMode, setUserMode] = useState('create');
  const [tournamentMode, setTournamentMode] = useState('create');
  const [registrationMode, setRegistrationMode] = useState('create');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isAdmin = currentUser?.role === 'admin';
  const canManageTournaments = Boolean(currentUser);
  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedTournamentId) || null;

  const homeHeading = 'Öffentliche Turniere';

  const filteredHomeTournaments = useMemo(() => {
    const query = homeQuery.trim().toLowerCase();
    let results = tournaments.filter((tournament) => {
      if (tournament.visibility !== 'public' || tournament.status === 'draft' || !isUpcoming(tournament)) {
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

    if (searchOrigin) {
      const radius = Number(searchRadiusKm);
      results = results
        .filter((tournament) => tournament.latitude !== null && tournament.longitude !== null)
        .map((tournament) => ({
          ...tournament,
          distanceKm: distanceKm(searchOrigin.lat, searchOrigin.lng, tournament.latitude, tournament.longitude),
        }))
        .filter((tournament) => tournament.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }

    return results;
  }, [
    tournaments,
    homeQuery,
    homeOnlyMine,
    currentUser,
    homeFilterMonth,
    homeFilterFormation,
    homeFilterOpenOnly,
    searchOrigin,
    searchRadiusKm,
  ]);

  const visibleHomeTournaments = filteredHomeTournaments.slice(0, homeVisibleCount);
  const hasMoreHomeTournaments = filteredHomeTournaments.length > homeVisibleCount;

  const manageableTournaments = useMemo(
    () => tournaments.filter((tournament) => tournament.canManage),
    [tournaments],
  );

  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    return users.filter((user) => {
      if (query && ![user.firstName, user.lastName, user.email].some((value) => (value || '').toLowerCase().includes(query))) {
        return false;
      }
      if (userRoleFilter && user.role !== userRoleFilter) {
        return false;
      }
      if (userStatusFilter === 'verified' && !user.emailVerifiedAt) {
        return false;
      }
      if (userStatusFilter === 'unverified' && user.emailVerifiedAt) {
        return false;
      }
      if (userStatusFilter === 'password_change_required' && !user.passwordChangeRequired) {
        return false;
      }
      return true;
    });
  }, [users, userQuery, userRoleFilter, userStatusFilter]);

  const userStats = useMemo(
    () => ({
      total: users.length,
      admins: users.filter((user) => user.role === 'admin').length,
      unverified: users.filter((user) => !user.emailVerifiedAt).length,
      passwordChangeRequired: users.filter((user) => user.passwordChangeRequired).length,
    }),
    [users],
  );

  useEffect(() => {
    setHomeVisibleCount(10);
  }, [homeQuery, homeOnlyMine, homeFilterMonth, homeFilterFormation, homeFilterOpenOnly]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset_token');
    const verifyToken = params.get('verify_token');
    const authResult = params.get('auth');
    const authError = params.get('auth_error');
    let pendingAuthMessage = '';
    let pendingAuthError = '';
    if (resetToken) {
      setAuthView('reset');
      setAuthForm((previous) => ({ ...previous, token: resetToken }));
    } else if (verifyToken) {
      setAuthView('verify');
      setAuthForm((previous) => ({ ...previous, token: verifyToken }));
    } else if (authResult === 'google_success') {
      pendingAuthMessage = translateText('Mit Google angemeldet.', language);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (authResult === 'facebook_success') {
      pendingAuthMessage = translateText('Mit Facebook angemeldet.', language);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (authError) {
      setAuthView('login');
      pendingAuthError = translateText(authErrorMessage(authError), language);
      window.history.replaceState({}, '', window.location.pathname);
    }
    initialize().then(() => {
      if (pendingAuthMessage) {
        setMessage(pendingAuthMessage);
      }
      if (pendingAuthError) {
        setError(pendingAuthError);
      }
    });
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

    if (!isPasswordStrong(authForm.password)) {
      setError(PASSWORD_STRENGTH_ERROR);
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
      if (requestError.payload?.passwordChangeRequired && requestError.payload.resetToken) {
        setAuthForm({ ...EMPTY_AUTH_FORM, token: requestError.payload.resetToken });
        setAuthView('reset');
        setMessage(requestError.message);
        return;
      }
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

    if (!isPasswordStrong(authForm.password)) {
      setError(PASSWORD_STRENGTH_ERROR);
      return;
    }

    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({ ...authForm, language }),
      });
      setAuthForm(EMPTY_AUTH_FORM);
      setAuthView('registerSuccess');
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

  async function handleUpdateProfile(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (profileForm.newPassword && profileForm.newPassword !== profileForm.newPasswordConfirm) {
      setError(translateText('Die Passwörter stimmen nicht überein.', language));
      return;
    }

    if (profileForm.newPassword && !isPasswordStrong(profileForm.newPassword)) {
      setError(translateText(PASSWORD_STRENGTH_ERROR, language));
      return;
    }

    if (profileForm.newPassword && profileForm.newPassword === profileForm.currentPassword) {
      setError(translateText('Neues Passwort darf nicht mit dem aktuellen Passwort übereinstimmen', language));
      return;
    }

    try {
      const data = await api('/api/me', {
        method: 'PUT',
        body: JSON.stringify({
          firstName: profileForm.firstName,
          lastName: profileForm.lastName,
          email: profileForm.email,
          club: profileForm.club,
          licenseNr: profileForm.licenseNr,
          currentPassword: profileForm.currentPassword,
          newPassword: profileForm.newPassword,
          language,
        }),
      });
      setCurrentUser(data.user);
      setProfileForm({
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        email: data.user.pendingEmail || data.user.email,
        club: data.user.club || '',
        licenseNr: data.user.licenseNr || '',
        currentPassword: '',
        newPassword: '',
        newPasswordConfirm: '',
      });
      setMessage(
        data.user.pendingEmail
          ? translateText(PROFILE_EMAIL_CHANGE_PENDING, language) + (data.verificationUrl ? ` ${data.verificationUrl}` : '')
          : translateText(PROFILE_UPDATE_SUCCESS, language),
      );
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

  async function handleResendVerification(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const data = await api('/api/email/resend', {
        method: 'POST',
        body: JSON.stringify({ email: authForm.email, language }),
      });
      setMessage(data.verificationUrl ? `${data.message} ${data.verificationUrl}` : data.message);
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

    if (!isPasswordStrong(authForm.password)) {
      setError(PASSWORD_STRENGTH_ERROR);
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

    if (payload.password && !isPasswordStrong(payload.password)) {
      setError(PASSWORD_STRENGTH_ERROR);
      return;
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
    if (!window.confirm(`Benutzer "${user.firstName} ${user.lastName}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) {
      return;
    }

    const ownedTournaments = tournaments.filter((tournament) => tournament.createdBy === user.id || tournament.managerId === user.id);
    let deleteTournaments = false;
    if (ownedTournaments.length > 0) {
      deleteTournaments = window.confirm(
        `Dieser Benutzer besitzt ${ownedTournaments.length} Turnier(e). OK = diese Turniere ebenfalls löschen. Abbrechen = die Turniere werden dir als Admin zugewiesen und bleiben erhalten.`,
      );
    }

    setError('');
    setMessage('');

    try {
      await api(`/api/users/${user.id}${deleteTournaments ? '?deleteTournaments=true' : ''}`, { method: 'DELETE' });
      setMessage('Benutzer wurde gelöscht.');
      await loadUsers();
      await loadTournaments();
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

      await api(`/api/tournaments/${data.tournament.id}/presentation`, {
        method: 'PUT',
        body: JSON.stringify({
          websiteUrl: tournamentForm.websiteUrl,
          logoUrl: tournamentForm.logoUrl,
          flyerUrl: tournamentForm.flyerUrl,
        }),
      });

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
    if (
      !window.confirm(
        `Turnier "${tournament.name}" wirklich löschen? Alle Anmeldungen dieses Turniers werden mitgelöscht und das kann nicht rückgängig gemacht werden.`,
      )
    ) {
      return;
    }

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
    const payload = registrationPayload({ ...registrationForm, tournamentId }, language);

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
    const registrationLabel = [registration.firstName, registration.lastName].filter(Boolean).join(' ') || registration.teamName;
    if (!window.confirm(`Anmeldung "${registrationLabel}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) {
      return;
    }

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
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      password: '',
      emailVerified: Boolean(user.emailVerifiedAt),
      passwordChangeRequired: Boolean(user.passwordChangeRequired),
      tournamentLimit: user.tournamentLimit ?? DEFAULT_TOURNAMENT_LIMIT,
    });
    clearFeedback();
  }

  function editTournament(tournament) {
    setTournamentMode('edit');
    setTournamentForm({
      id: tournament.id,
      managerId: tournament.managerId || '',
      name: tournament.name || '',
      date: tournament.date || '',
      startTime: tournament.startTime || '',
      location: tournament.location || '',
      latitude: tournament.latitude ?? '',
      longitude: tournament.longitude ?? '',
      overrideCoordinates: false,
      description: tournament.description || '',
      type: tournament.type || 'supermelee',
      formation: tournament.type === 'supermelee' ? 'tete' : tournament.formation || 'doublette',
      registrationType: tournament.type === 'supermelee' ? 'melee' : tournament.registrationType || 'forme',
      status: tournament.status || 'draft',
      maxRegistrations: tournament.maxRegistrations || 0,
      registrationDeadline: tournament.registrationDeadline || '',
      registrationOpensAt: tournament.registrationOpensAt || '',
      entryFeeEuro: centsToEuro(tournament.entryFeeCents),
      contactName: tournament.contactName || '',
      contactEmail: tournament.contactEmail || '',
      contactPhone: tournament.contactPhone || '',
      visibility: tournament.visibility || 'private',
      internalNotes: tournament.internalNotes || '',
      participantsPublic: Boolean(tournament.participantsPublic),
      licenseRequired: Boolean(tournament.licenseRequired),
      teamNameEnabled: Boolean(tournament.teamNameEnabled),
      waitlistEnabled: tournament.waitlistEnabled === undefined ? true : Boolean(tournament.waitlistEnabled),
      websiteUrl: tournament.websiteUrl || '',
      logoUrl: tournament.logoUrl || '',
      flyerUrl: tournament.flyerUrl || '',
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
      partnerLicenseNr: registration.partnerLicenseNr || '',
      partner2FirstName: registration.partner2FirstName || '',
      partner2LastName: registration.partner2LastName || '',
      partner2Email: registration.partner2Email || '',
      partner2LicenseNr: registration.partner2LicenseNr || '',
      teamName: registration.teamName || '',
      seedingPosition: registration.seedingPosition || '',
      status: registration.status || 'pending',
      isVip: Boolean(registration.isVip),
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

  function handleUseMyLocation() {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError('Geolocation wird von diesem Browser nicht unterstützt.');
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSearchOrigin({ lat: position.coords.latitude, lng: position.coords.longitude, label: 'Mein Standort' });
        setSearchOriginQuery('');
        setGeoLoading(false);
      },
      (error) => {
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? 'Standort-Zugriff wurde verweigert. Bitte erlaube den Zugriff in den Einstellungen deines Geräts unter Datenschutz > Ortungsdienste.'
            : 'Standort konnte nicht ermittelt werden.',
        );
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function handleSearchOriginSubmit(event) {
    event.preventDefault();
    const query = searchOriginQuery.trim();
    if (!query) {
      setSearchOrigin(null);
      return;
    }

    setGeoError('');
    setGeoLoading(true);
    try {
      const data = await api('/api/geocode', { method: 'POST', body: JSON.stringify({ query }) });
      if (data.lat === null || data.lng === null) {
        setSearchOrigin(null);
        setGeoError('Kein Ort gefunden.');
      } else {
        setSearchOrigin({ lat: data.lat, lng: data.lng, label: data.displayName || query });
      }
    } catch (requestError) {
      setGeoError(requestError.message);
    } finally {
      setGeoLoading(false);
    }
  }

  function handleClearSearchOrigin() {
    setSearchOrigin(null);
    setSearchOriginQuery('');
    setGeoError('');
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
        setMessage={setMessage}
        setError={setError}
        onLogout={handleLogout}
      />
    );
  }

  if (!needsSetup && path === '/impressum') {
    return (
      <ImpressumPage
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    );
  }

  if (!needsSetup && path === '/datenschutz') {
    return (
      <DatenschutzPage
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
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
          onToggleMenu={() => {
            setSearchMenuOpen(false);
            setMenuOpen((open) => !open);
          }}
          onCloseMenu={() => setMenuOpen(false)}
          navigate={navigate}
          searchControl={
            <SearchMenuControl
              language={language}
              open={searchMenuOpen}
              onToggle={() => {
                setMenuOpen(false);
                setSearchMenuOpen((open) => !open);
              }}
              onClose={() => setSearchMenuOpen(false)}
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
              searchOrigin={searchOrigin}
              searchOriginQuery={searchOriginQuery}
              setSearchOriginQuery={setSearchOriginQuery}
              onSearchOriginSubmit={handleSearchOriginSubmit}
              onUseMyLocation={handleUseMyLocation}
              onClearSearchOrigin={handleClearSearchOrigin}
              searchRadiusKm={searchRadiusKm}
              setSearchRadiusKm={setSearchRadiusKm}
              geoLoading={geoLoading}
              geoError={geoError}
            />
          }
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
          <a
            className="drawer-link"
            href="https://michaelmassee.github.io/Petanque-Turnier-Manager/"
            target="_blank"
            rel="noreferrer"
          >
            Turniersoftware
          </a>
        </AppHeader>

        <Feedback message={message} error={error} />

        <HomeTournaments
          language={language}
          showMineFilter={false}
          onlyMine={false}
          filterMonth={homeFilterMonth}
          filterFormation={homeFilterFormation}
          filterOpenOnly={homeFilterOpenOnly}
          searchOrigin={searchOrigin}
          searchRadiusKm={searchRadiusKm}
          tournaments={visibleHomeTournaments}
          total={filteredHomeTournaments.length}
          hasMore={hasMoreHomeTournaments}
          onLoadMore={() => setHomeVisibleCount((count) => count + 10)}
          onOpenTournament={(tournament) => navigate(`/turniere/${tournament.id}`)}
          navigate={navigate}
          onRegister={(tournament) => {
            setSelectedTournamentId(tournament.id);
            setRegistrationForm({ ...EMPTY_REGISTRATION_FORM, tournamentId: tournament.id });
            setAuthView('publicRegistration');
            clearFeedback();
          }}
          onOpenFilters={() => {
            setSearchMenuOpen(true);
            setHomeFilterOpen(true);
          }}
          onOpenRadiusSearch={() => setSearchMenuOpen(true)}
        />

        {authView !== 'home' && (
          <AuthModal title={authTitle(needsSetup, authView)} subtitle={authSubtitle(needsSetup, authView)} message={message} error={error} onClose={closeAuthModal}>
            {authView === 'login' && (
              <LoginForm
                form={authForm}
                setForm={setAuthForm}
                onSubmit={handleLogin}
                onGoogleLogin={() => {
                  window.location.href = '/api/auth/google/start';
                }}
                onForgot={() => {
                  setAuthView('forgot');
                  clearFeedback();
                }}
                onRegister={() => {
                  setAuthView('register');
                  clearFeedback();
                }}
                onResendVerification={() => {
                  setAuthView('resendVerification');
                  clearFeedback();
                }}
              />
            )}

            {authView === 'register' && (
              <RegisterForm
                form={authForm}
                setForm={setAuthForm}
                onSubmit={handleRegister}
                navigate={navigate}
                onBack={() => {
                  setAuthView('login');
                  clearFeedback();
                }}
              />
            )}

            {authView === 'registerSuccess' && (
              <RegisterSuccessNotice
                onBack={() => {
                  setAuthView('login');
                  clearFeedback();
                }}
                onResendVerification={() => {
                  setAuthView('resendVerification');
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

            {authView === 'resendVerification' && (
              <ResendVerificationForm
                form={authForm}
                setForm={setAuthForm}
                onSubmit={handleResendVerification}
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
                navigate={navigate}
                currentUser={currentUser}
                embedded
              />
            )}
          </AuthModal>
        )}
      </main>
    );
  }

  const activeTabHeading =
    activeTab === 'profile'
      ? 'Mein Profil'
      : activeTab === 'users'
      ? 'Benutzerverwaltung'
      : activeTab === 'apikeys'
        ? 'API-Zugänge'
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
        onToggleMenu={() => {
          setSearchMenuOpen(false);
          setMenuOpen((open) => !open);
        }}
        onCloseMenu={() => setMenuOpen(false)}
        navigate={navigate}
        onLogoClick={() => setActiveTab('home')}
        searchControl={
          activeTab === 'home' ? (
            <SearchMenuControl
              language={language}
              open={searchMenuOpen}
              onToggle={() => {
                setMenuOpen(false);
                setSearchMenuOpen((open) => !open);
              }}
              onClose={() => setSearchMenuOpen(false)}
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
              searchOrigin={searchOrigin}
              searchOriginQuery={searchOriginQuery}
              setSearchOriginQuery={setSearchOriginQuery}
              onSearchOriginSubmit={handleSearchOriginSubmit}
              onUseMyLocation={handleUseMyLocation}
              onClearSearchOrigin={handleClearSearchOrigin}
              searchRadiusKm={searchRadiusKm}
              setSearchRadiusKm={setSearchRadiusKm}
              geoLoading={geoLoading}
              geoError={geoError}
            />
          ) : null
        }
      >
        <div className="drawer-user">
          <span>{currentUser.firstName} {currentUser.lastName}</span>
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
        {canManageTournaments && (
          <button
            className={`drawer-link ${activeTab === 'apikeys' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setActiveTab('apikeys');
              setMenuOpen(false);
            }}
          >
            API-Zugänge
          </button>
        )}
        <button
          className={`drawer-link ${activeTab === 'profile' ? 'active' : ''}`}
          type="button"
          onClick={() => {
            setProfileForm({
              firstName: currentUser.firstName,
              lastName: currentUser.lastName,
              email: currentUser.pendingEmail || currentUser.email,
              club: currentUser.club || '',
              licenseNr: currentUser.licenseNr || '',
              currentPassword: '',
              newPassword: '',
              newPasswordConfirm: '',
            });
            setActiveTab('profile');
            setMenuOpen(false);
            clearFeedback();
          }}
        >
          Mein Profil
        </button>
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
          language={language}
          showMineFilter={canManageTournaments}
          onlyMine={homeOnlyMine}
          filterMonth={homeFilterMonth}
          filterFormation={homeFilterFormation}
          filterOpenOnly={homeFilterOpenOnly}
          searchOrigin={searchOrigin}
          searchRadiusKm={searchRadiusKm}
          tournaments={visibleHomeTournaments}
          total={filteredHomeTournaments.length}
          hasMore={hasMoreHomeTournaments}
          onLoadMore={() => setHomeVisibleCount((count) => count + 10)}
          onOpenTournament={(tournament) => navigate(`/turniere/${tournament.id}`)}
          navigate={navigate}
          onRegister={(tournament) => {
            setSelectedTournamentId(tournament.id);
            setRegistrationForm({ ...EMPTY_REGISTRATION_FORM, tournamentId: tournament.id });
            setAuthView('publicRegistration');
            clearFeedback();
          }}
          onOpenFilters={() => {
            setSearchMenuOpen(true);
            setHomeFilterOpen(true);
          }}
          onOpenRadiusSearch={() => setSearchMenuOpen(true)}
        />
      )}

      {authView === 'publicRegistration' && selectedTournament && (
        <AuthModal
          title={authTitle(needsSetup, authView)}
          subtitle={authSubtitle(needsSetup, authView)}
          message={message}
          error={error}
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
            navigate={navigate}
            currentUser={currentUser}
            embedded
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
              <TournamentForm form={tournamentForm} setForm={setTournamentForm} onSubmit={handleTournamentSubmit} mode={tournamentMode} isAdmin={isAdmin} users={users} />
            </div>
          )}

          <TournamentList
            tournaments={manageableTournaments}
            selectedId={selectedTournamentId}
            onSelect={setSelectedTournamentId}
            onEdit={editTournament}
            onDelete={handleDeleteTournament}
            isAdmin={isAdmin}
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
              tournaments={manageableTournaments}
              selectedTournamentId={selectedTournamentId}
              manageMode={Boolean(selectedTournament?.canManage)}
            />
          </div>

          <RegistrationsPanel
            tournament={selectedTournament}
            registrations={registrations}
            onTournamentChange={setSelectedTournamentId}
            tournaments={manageableTournaments}
            onEdit={editRegistration}
            onDelete={handleDeleteRegistration}
          />
        </section>
      )}

      {activeTab === 'users' && isAdmin && (
        <UserManagementPanel
          users={filteredUsers}
          stats={userStats}
          totalUsers={users.length}
          userMode={userMode}
          currentUser={currentUser}
          userForm={userForm}
          setUserForm={setUserForm}
          setUserMode={setUserMode}
          userQuery={userQuery}
          setUserQuery={setUserQuery}
          userRoleFilter={userRoleFilter}
          setUserRoleFilter={setUserRoleFilter}
          userStatusFilter={userStatusFilter}
          setUserStatusFilter={setUserStatusFilter}
          onSubmitUser={handleUserSubmit}
          onEditUser={editUser}
          onDeleteUser={handleDeleteUser}
        />
      )}

      {activeTab === 'apikeys' && canManageTournaments && (
        <section className="single-column">
          <ApiKeysPanel isAdmin={isAdmin} />
        </section>
      )}

      {activeTab === 'profile' && (
        <section className="single-column">
          <ProfilePanel currentUser={currentUser} form={profileForm} setForm={setProfileForm} onSubmit={handleUpdateProfile} />
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
        <img src="/icons/logo.png" alt="Pétanque Turnier Manager Online" className="app-icon" />
        <p className="eyebrow">Pétanque Turnier Manager Online</p>
        <h1 id="page-title">{title}</h1>
        <p className="subtitle">{subtitle}</p>
        {children}
      </section>
    </main>
  );
}

const LANGUAGE_FLAGS = [
  { value: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { value: 'nl', flag: '🇳🇱', label: 'Nederlands' },
  { value: 'en', flag: '🇬🇧', label: 'English' },
  { value: 'es', flag: '🇪🇸', label: 'Español' },
  { value: 'fr', flag: '🇫🇷', label: 'Français' },
];

function LanguageSelect({ language, setLanguage }) {
  return (
    <div className="language-select" role="group" aria-label="Sprache">
      {LANGUAGE_FLAGS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`language-flag-button${option.value === language ? ' active' : ''}`}
          title={option.label}
          aria-label={option.label}
          aria-pressed={option.value === language}
          onClick={() => setLanguage(option.value)}
        >
          {option.flag}
        </button>
      ))}
    </div>
  );
}

function SetupForm({ form, setForm, onSubmit }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Vorname" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
      <TextField label="Nachname" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label="Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <TextField label="Passwort bestätigen" type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <Button type="submit">Admin anlegen</Button>
    </form>
  );
}

function LoginForm({ form, setForm, onSubmit, onGoogleLogin, onForgot, onRegister, onResendVerification }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label="Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required />
      <Button type="submit">Anmelden</Button>
      <button className="google-login-button" type="button" onClick={onGoogleLogin}>
        <span aria-hidden="true">G</span>
        Mit Google anmelden
      </button>
      <button className="link-button" type="button" onClick={onRegister}>
        Neu registrieren
      </button>
      <button className="link-button" type="button" onClick={onForgot}>
        Passwort vergessen?
      </button>
      <button className="link-button" type="button" onClick={onResendVerification}>
        Bestätigungs-E-Mail nicht erhalten?
      </button>
    </form>
  );
}

function RegisterForm({ form, setForm, onSubmit, onBack, navigate }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Vorname" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
      <TextField label="Nachname" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label="Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <p className="hint">{PASSWORD_STRENGTH_HINT}</p>
      <TextField label="Passwort bestätigen" type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <p className="hint">
        Mit der Registrierung stimmst du der Verarbeitung deiner Daten gemäß unserer Datenschutzerklärung zu.
      </p>
      <button className="link-button" type="button" onClick={() => navigate('/datenschutz')}>
        Datenschutzerklärung lesen
      </button>
      <Button type="submit">Registrieren</Button>
      <button className="link-button" type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </button>
    </form>
  );
}

function RegisterSuccessNotice({ onBack, onResendVerification }) {
  return (
    <div className="form">
      <p className="hint">
        {'Dein Benutzerkonto wurde angelegt. Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Bestätigungs-E-Mail. Danach kannst du dich anmelden und eigene Turniere erstellen.'}
      </p>
      <Button type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </Button>
      <button className="link-button" type="button" onClick={onResendVerification}>
        Bestätigungs-E-Mail nicht erhalten?
      </button>
    </div>
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

function ResendVerificationForm({ form, setForm, onSubmit, onBack }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <Button type="submit">Bestätigungslink erneut senden</Button>
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
      <p className="hint">{PASSWORD_STRENGTH_HINT}</p>
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

function AppHeader({ heading, language, setLanguage, menuOpen, onToggleMenu, onCloseMenu, navigate, onLogoClick, searchControl, children }) {
  return (
    <header className="topbar">
      <button
        className="brand brand-link"
        type="button"
        onClick={() => {
          onCloseMenu();
          if (onLogoClick) {
            onLogoClick();
          } else if (navigate) {
            navigate('/');
          }
        }}
      >
        <img src="/icons/logo.png" alt="Pétanque Turnier Manager Online" className="brand-logo" />
        <div className="brand-text">
          <p className="eyebrow">Pétanque Turnier Manager Online</p>
          <h1>{heading}</h1>
        </div>
      </button>
      <div className="topbar-actions">
        {searchControl}
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
      </div>
      {menuOpen && (
        <>
          <div className="nav-drawer-backdrop" onClick={onCloseMenu} />
          <nav className="nav-drawer" aria-label="Hauptmenü">
            <LanguageSelect language={language} setLanguage={setLanguage} />
            {children}
            <InstallAppButton />
            {navigate && (
              <div className="drawer-legal-links">
                <button
                  className="link-button"
                  type="button"
                  onClick={() => {
                    onCloseMenu();
                    navigate('/impressum');
                  }}
                >
                  Impressum
                </button>
                <button
                  className="link-button"
                  type="button"
                  onClick={() => {
                    onCloseMenu();
                    navigate('/datenschutz');
                  }}
                >
                  Datenschutz
                </button>
              </div>
            )}
          </nav>
        </>
      )}
    </header>
  );
}

function SearchMenuControl({
  language,
  open,
  onToggle,
  onClose,
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
  searchOrigin,
  searchOriginQuery,
  setSearchOriginQuery,
  onSearchOriginSubmit,
  onUseMyLocation,
  onClearSearchOrigin,
  searchRadiusKm,
  setSearchRadiusKm,
  geoLoading,
  geoError,
}) {
  return (
    <div className="search-menu">
      <button
        className="search-menu-btn"
        type="button"
        aria-label={translateText(open ? 'Suche schließen' : 'Suche öffnen', language)}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="search-icon" aria-hidden="true" />
      </button>
      {open && (
        <>
          <div className="search-menu-backdrop" onClick={onClose} />
          <div className="search-menu-panel" role="search">
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
              <Button variant="secondary" onClick={() => setFilterOpen((active) => !active)}>
                {filterOpen ? 'Filter ausblenden' : 'Filter anzeigen'}
              </Button>
            </div>

            <form className="home-radius-search" onSubmit={onSearchOriginSubmit}>
              <label className="home-search-field">
                Umkreissuche: Von diesem Ort aus suchen
                <input
                  type="search"
                  placeholder="Ort oder PLZ eingeben"
                  value={searchOriginQuery}
                  onChange={(event) => setSearchOriginQuery(event.target.value)}
                />
              </label>
              <Button type="submit" variant="secondary" disabled={geoLoading}>
                Suchen
              </Button>
              <Button type="button" variant="secondary" onClick={onUseMyLocation} disabled={geoLoading}>
                Meinen Standort verwenden
              </Button>
              {searchOrigin && (
                <>
                  <SelectField label="Umkreis" value={searchRadiusKm} onChange={setSearchRadiusKm} options={RADIUS_OPTIONS} />
                  <span className="search-origin-label">
                    {translateText('Ausgangspunkt:', language)} {searchOrigin.label}
                  </span>
                  <button className="link-button" type="button" onClick={onClearSearchOrigin}>
                    Umkreissuche beenden
                  </button>
                </>
              )}
            </form>
            {geoError && <p className="feedback error">{geoError}</p>}

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
        </>
      )}
    </div>
  );
}

function AuthModal({ title, subtitle, message, error, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Schließen">
          ×
        </button>
        <h2 id="modal-title">{title}</h2>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        <Feedback message={message} error={error} />
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
      navigate={navigate}
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
  setMessage,
  setError,
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

  async function handleShare() {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: tournament.name, url: shareUrl });
      } catch (shareError) {
        if (shareError.name !== 'AbortError') {
          setError(shareError.message);
        }
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage(translateText('Link kopiert', language));
    } catch {
      setError(translateText('Teilen wird von diesem Gerät nicht unterstützt', language));
    }
  }

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
          {route.view === 'info' && <TournamentInfo tournament={tournament} language={language} onShare={handleShare} />}

          {route.view === 'anmelden' && canRegister && (
            <PublicRegistrationPanel
              tournament={tournament}
              form={registrationForm}
              setForm={setRegistrationForm}
              onSubmit={onSubmitRegistration}
              onCancel={() => navigate(`/turniere/${tournament.id}/info`)}
              navigate={navigate}
              currentUser={currentUser}
            />
          )}

          {route.view === 'teilnehmer' && canShowParticipants && (
            <>
              <p className="hint">
                Diese Teilnehmerliste ist öffentlich sichtbar und ohne Anmeldung einsehbar. Wer hier nicht aufgeführt werden möchte, wende sich bitte direkt an den Veranstalter dieses Turniers.
              </p>
              <TournamentParticipants tournamentId={tournament.id} logoUrl={tournament.logoUrl} onMessage={setMessage} onError={setError} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
    </svg>
  );
}

function TournamentInfo({ tournament, language, onShare }) {
  const mapsUrl = googleMapsUrl(tournament);
  const freeSlots = tournament.maxRegistrations
    ? Math.max(tournament.maxRegistrations - tournament.activeRegistrations, 0)
    : null;

  return (
    <div className="panel">
      <div className="tournament-icon-bar">
        <button
          type="button"
          className="icon-bar-button"
          title={translateText('Turnier teilen', language)}
          aria-label={translateText('Turnier teilen', language)}
          onClick={onShare}
        >
          <ShareIcon />
        </button>
        <a
          className="icon-bar-button"
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          title={translateText('Spielort in Google Maps öffnen', language)}
          aria-label={translateText('Spielort in Google Maps öffnen', language)}
        >
          📍
        </a>
        {tournament.websiteUrl && (
          <a
            className="icon-bar-button"
            href={tournament.websiteUrl}
            target="_blank"
            rel="noreferrer"
            title={translateText('Website öffnen', language)}
            aria-label={translateText('Website öffnen', language)}
          >
            🌐
          </a>
        )}
        {tournament.flyerUrl && (
          <a
            className="icon-bar-button"
            href={tournament.flyerUrl}
            target="_blank"
            rel="noreferrer"
            title={translateText('Flyer öffnen', language)}
            aria-label={translateText('Flyer öffnen', language)}
          >
            📄
          </a>
        )}
      </div>
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
      <p>
        <strong>Anmeldetyp</strong>: {labelFor(REGISTRATION_TYPES, tournament.registrationType)}
      </p>
      <p>
        <strong>{translateText('Lizenz', language)}</strong>: {translateText(tournament.licenseRequired ? 'Ja' : 'Nein', language)}
      </p>
      {tournament.description && <p>{tournament.description}</p>}
      {Boolean(tournament.entryFeeCents) && (
        <p>
          <strong>Startgeld</strong>: {centsToEuro(tournament.entryFeeCents)} €
        </p>
      )}
      {tournament.registrationOpensAt && (
        <p>
          <strong>Anmeldung möglich ab</strong>: {new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(tournament.registrationOpensAt))}
        </p>
      )}
      {tournament.registrationDeadline && (
        <p>
          <strong>Meldefrist</strong>: {new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(tournament.registrationDeadline))}
        </p>
      )}
      <p>
        <strong>{translateText('Max. Meldungen', language)}</strong>: {tournament.maxRegistrations || '∞'}
      </p>
      <p>
        <strong>{translateText('Noch frei', language)}</strong>: {freeSlots === null ? '∞' : freeSlots}
      </p>
      <p>
        <strong>{translateText('Warteliste', language)}</strong>: {tournament.waitlistRegistrations || 0}
      </p>
      {(tournament.contactName || tournament.contactEmail || tournament.contactPhone) && (
        <p>
          <strong>Kontakt</strong>: {[tournament.contactName, tournament.contactEmail, tournament.contactPhone].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

function TournamentParticipants({ tournamentId, logoUrl, onMessage, onError }) {
  const [participants, setParticipants] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [tournamentId, reloadKey]);

  async function handleCancelOwnRegistration(participant) {
    const label = [participant.firstName, participant.lastName].filter(Boolean).join(' ');
    if (!window.confirm(`Anmeldung "${label}" wirklich absagen?`)) {
      return;
    }
    onError?.('');
    onMessage?.('');
    try {
      await api(`/api/registrations/${participant.registrationId}/cancel`, { method: 'POST' });
      onMessage?.('Anmeldung wurde abgesagt.');
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      onError?.(requestError.message);
    }
  }

  const logo = logoUrl && (
    <img
      className="tournament-logo"
      src={tournamentImageUrl(tournamentId, 'logo')}
      alt=""
      onError={(event) => {
        event.target.style.display = 'none';
      }}
    />
  );

  if (forbidden) {
    return (
      <>
        {logo}
        <p className="muted">Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.</p>
      </>
    );
  }

  if (!participants) {
    return (
      <>
        {logo}
        <p className="muted">Teilnehmerliste wird geladen…</p>
      </>
    );
  }

  if (!participants.length) {
    return (
      <>
        {logo}
        <p className="muted">Noch keine Anmeldungen.</p>
      </>
    );
  }

  return (
    <div className="participants-list">
      {logo}
      {participants.map((participant, index) => (
        <article className="data-row participants-row" key={`${participant.firstName}-${participant.lastName}-${index}`}>
          <div>
            <strong>
              {participant.isVip && <span className="vip-badge" title="VIP">★</span>}
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
          {participant.registrationId && (
            <Button variant="secondary" onClick={() => handleCancelOwnRegistration(participant)}>
              Absagen
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}

function ImpressumPage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, onLogout }) {
  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading="Impressum"
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <section className="single-column legal-page">
        <div className="panel">
          <h2>Angaben gemäß § 5 DDG</h2>
          <p>Michael Massee</p>
          <p>An der Ziegelei 21</p>
          <p>35440 Linden</p>
          <p>Deutschland</p>

          <h2>Kontakt</h2>
          <p>E-Mail: michael.massee@gmail.com</p>

          <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
          <p>Michael Massee (Anschrift wie oben)</p>

          <h2>Haftung für Inhalte</h2>
          <p>
            Turnierdaten, Anmeldungen und Turniermeldungen auf dieser Plattform werden von den jeweiligen Turnierleitern bzw. Nutzern eigenverantwortlich erstellt und gepflegt. Für die Richtigkeit, Vollständigkeit und Aktualität dieser Inhalte sind allein die jeweiligen Turnierleiter bzw. Einsender verantwortlich, nicht der Betreiber dieser Plattform.
          </p>
          <p>
            Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Bei Bekanntwerden entsprechender Rechtsverletzungen werden wir die betroffenen Inhalte umgehend entfernen.
          </p>

          <h2>Haftung für Links</h2>
          <p>
            Turniermeldungen können Links zu externen Websites Dritter enthalten, etwa zu Anmeldeseiten der jeweiligen Veranstalter, auf deren Inhalte wir keinen Einfluss haben. Für diese fremden Inhalte können wir daher keine Gewähr übernehmen; für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.
          </p>

          <h2>Hinweis</h2>
          <p>
            Dieses Angebot wird als nicht-kommerzielles Privatprojekt betrieben. Es werden keine Waren oder Dienstleistungen gegen Entgelt über diese Website angeboten oder abgewickelt.
          </p>

          <h2>Streitschlichtung</h2>
          <p>
            Als Privatperson bieten wir kein kommerzielles Angebot an und nehmen daher nicht an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil.
          </p>
        </div>
      </section>
    </main>
  );
}

function DatenschutzPage({ language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, onLogout }) {
  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading="Datenschutzerklärung"
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <section className="single-column legal-page">
        <div className="panel">
          <h2>1. Verantwortlicher</h2>
          <p>Verantwortlich für die Datenverarbeitung auf dieser Website ist:</p>
          <p>Michael Massee, An der Ziegelei 21, 35440 Linden, E-Mail: michael.massee@gmail.com</p>

          <h2>2. Allgemeines zur Datenverarbeitung</h2>
          <p>
            Wir verarbeiten personenbezogene Daten unserer Nutzer grundsätzlich nur, soweit dies zur Bereitstellung einer funktionsfähigen Website sowie unserer Inhalte und Leistungen erforderlich ist.
          </p>
          <p>
            Rechtsgrundlage ist, je nach Verarbeitungsvorgang, die Erfüllung eines Vertrags bzw. vorvertraglicher Maßnahmen (Art. 6 Abs. 1 lit. b DSGVO), eine erteilte Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) oder unser berechtigtes Interesse an einem sicheren und funktionsfähigen Betrieb der Website (Art. 6 Abs. 1 lit. f DSGVO).
          </p>

          <h2>3. Bereitstellung der Website und Hosting</h2>
          <p>
            Diese Website wird über Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA) als Hosting- und Content-Delivery-Anbieter bereitgestellt. Cloudflare verarbeitet dabei technisch notwendige Daten wie IP-Adresse, Datum und Uhrzeit der Anfrage sowie Browser-Informationen (Server-Logfiles), um die Website sicher und zuverlässig auszuliefern (Art. 6 Abs. 1 lit. f DSGVO).
          </p>
          <p>
            Da Cloudflare auch Server außerhalb der EU nutzen kann, erfolgt die Datenübermittlung auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.
          </p>

          <h2>4. Registrierung und Benutzerkonto</h2>
          <p>
            Wenn du dich registrierst, erheben wir Name, E-Mail-Adresse und ein sicher gehashtes Passwort. Diese Daten werden zur Bereitstellung deines Benutzerkontos und zur Verwaltung deiner Turniere verarbeitet (Art. 6 Abs. 1 lit. b DSGVO). Nach der Registrierung senden wir dir zur Bestätigung deiner E-Mail-Adresse eine E-Mail mit einem 24 Stunden gültigen Bestätigungslink.
          </p>
          <p>
            Wenn du die Google Anmeldung nutzt, erhalten wir von Google deine verifizierte E-Mail-Adresse, deinen Namen und eine technische Google-Konto-ID. Wir verwenden diese Daten nur, um dein Benutzerkonto anzulegen, dich anzumelden und dein Google-Konto deinem Benutzerkonto zuzuordnen.
          </p>
          <p>
            Wenn du die Facebook Anmeldung nutzt, erhalten wir von Facebook deine E-Mail-Adresse, deinen Namen und eine technische Facebook-Konto-ID. Wir verwenden diese Daten nur, um dein Benutzerkonto anzulegen, dich anzumelden und dein Facebook-Konto deinem Benutzerkonto zuzuordnen.
          </p>

          <h2>5. Turnieranmeldungen und öffentliche Teilnehmerlisten</h2>
          <p>
            Wenn du dich über diese Website für ein Turnier anmeldest, verarbeiten wir Vorname, Nachname, E-Mail-Adresse sowie je nach Turnier optional oder verpflichtend Verein, Lizenznummer und Angaben zu deinem Partner bzw. deinen Partnern (Doublette/Triplette). Diese Daten werden an den jeweiligen Turnierleiter zur Organisation des Turniers weitergegeben (Art. 6 Abs. 1 lit. b DSGVO).
          </p>
          <p>
            Turnierleiter können die Teilnehmerliste eines Turniers öffentlich sichtbar schalten. In diesem Fall werden Vorname, Nachname, Verein und die Namen deiner Partner für jeden Besucher der Turnierseite sichtbar, ohne dass eine Anmeldung erforderlich ist. Wenn du das nicht möchtest, wende dich bitte direkt an den Veranstalter (Turnierleiter) des jeweiligen Turniers, dessen Kontaktdaten auf der Turnierseite angegeben sind.
          </p>

          <h2>6. Turniermeldungen</h2>
          <p>
            Wenn du ein fremdes Turnier zur Veröffentlichung vorschlägst, verarbeiten wir deinen Namen und deine E-Mail-Adresse zur Rückfrage und Bestätigung sowie zur Moderation durch unsere Administratoren (Art. 6 Abs. 1 lit. a, lit. f DSGVO).
          </p>

          <h2>7. Cookies und lokaler Speicher</h2>
          <p>
            Diese Website verwendet ein technisch notwendiges Session-Cookie (ptm_session), um dich nach der Anmeldung für bis zu 14 Tage eingeloggt zu halten. Das Cookie ist HttpOnly, Secure und SameSite=Lax gesetzt und wird ausschließlich für den Login-Status verwendet. Da dieses Cookie technisch notwendig ist, ist gemäß § 25 Abs. 2 TTDSG keine Einwilligung erforderlich.
          </p>
          <p>
            Zusätzlich speichern wir deine gewählte Sprache in deinem Browser (localStorage), um sie bei deinem nächsten Besuch beizubehalten. Diese Daten verlassen dein Gerät nicht.
          </p>
          <p>Wir setzen keine Analyse-, Marketing- oder Tracking-Cookies ein.</p>

          <h2>8. Versand von E-Mails</h2>
          <p>
            Für den Versand von Bestätigungs-, Registrierungs- und Passwort-Zurücksetzen-E-Mails nutzen wir den Dienst Resend (Resend, Inc., USA). Hierbei werden die E-Mail-Adresse sowie der jeweilige E-Mail-Inhalt an Resend übermittelt (Art. 6 Abs. 1 lit. b DSGVO). Auch hier erfolgt die Übermittlung auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.
          </p>

          <h2>9. Speicherdauer</h2>
          <p>
            Bestätigungslinks für die E-Mail-Verifizierung und Turniermeldungen sind 24 Stunden gültig, Links zum Zurücksetzen des Passworts 30 Minuten. Danach werden die zugehörigen Token automatisch gelöscht. Benutzerkonten und Turnieranmeldungen speichern wir, solange dein Konto besteht bzw. das Turnier organisiert wird, oder bis du eine Löschung beantragst.
          </p>

          <h2>10. Deine Rechte</h2>
          <p>
            Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO) sowie Widerspruch gegen die Verarbeitung (Art. 21 DSGVO). Eine erteilte Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO).
          </p>
          <p>Bitte wende dich hierfür an: michael.massee@gmail.com</p>
          <p>
            Außerdem hast du das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, zum Beispiel beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit.
          </p>

          <h2>11. Stand</h2>
          <p>Diese Datenschutzerklärung wurde zuletzt am 26. August 2026 aktualisiert.</p>
        </div>
      </section>
    </main>
  );
}

function tournamentImageUrl(tournamentId, field) {
  return `/api/tournaments/${tournamentId}/image?field=${field}`;
}

function TournamentCard({ tournament, onOpenTournament, onRegister, language }) {
  const [logoBroken, setLogoBroken] = useState(false);
  const hasLogo = Boolean(tournament.logoUrl) && !logoBroken;

  return (
    <article className="tournament-card">
      <button
        className="tournament-card-main"
        type="button"
        onClick={() => onOpenTournament(tournament)}
      >
        <span className={`tournament-card-date${hasLogo ? ' has-logo' : ''}`}>
          <span className="tournament-card-date-text">
            <strong>{formatDate(tournament.date)}</strong>
            <small>{tournament.startTime || 'Ganztägig'}</small>
          </span>
          {hasLogo && (
            <img
              className="tournament-card-logo"
              src={tournamentImageUrl(tournament.id, 'logo')}
              alt=""
              onError={() => setLogoBroken(true)}
            />
          )}
        </span>
        <span className="tournament-card-copy">
          <strong>
            {tournament.licenseRequired && (
              <span className="license-badge" title={translateText('Lizenznummer erforderlich', language)}>🪪</span>
            )}
            {tournament.name}
          </strong>
          <span>{tournament.location}</span>
          <small>
            {labelFor(TOURNAMENT_TYPES, tournament.type)} · {labelFor(FORMATIONS, tournament.formation)}
            {typeof tournament.distanceKm === 'number' && (
              <>
                {' · '}
                {Math.round(tournament.distanceKm)}
                {' km entfernt'}
              </>
            )}
          </small>
        </span>
      </button>
      <div className="tournament-card-meta">
        <span className={`status status-${tournament.status}`}>{registrationStatusLabel(tournament, language)}</span>
        <Button
          variant="secondary"
          onClick={() => onRegister(tournament)}
          disabled={tournament.status !== 'registration' || tournament.visibility !== 'public' || registrationNotYetOpen(tournament)}
        >
          Anmelden
        </Button>
      </div>
    </article>
  );
}

function HomeTournaments({
  language,
  showMineFilter,
  onlyMine,
  filterMonth,
  filterFormation,
  filterOpenOnly,
  searchOrigin,
  searchRadiusKm,
  tournaments,
  total,
  hasMore,
  onLoadMore,
  onRegister,
  onOpenTournament,
  onOpenFilters,
  onOpenRadiusSearch,
}) {
  const activeFilterCount = [
    showMineFilter && onlyMine,
    filterMonth,
    filterFormation,
    filterOpenOnly,
  ].filter(Boolean).length;
  const nextTournament = tournaments[0] || null;
  const radiusLabel = labelFor(RADIUS_OPTIONS, searchRadiusKm);
  const resultsRef = useRef(null);

  return (
    <section className="home-tournaments">
      <div className="home-finder">
        <div className="home-finder-copy">
          <p className="eyebrow">Pétanque Turnier Manager Online</p>
          <h2>Finde dein nächstes Pétanque-Turnier</h2>
          <p className="subtitle">Suche nach Ort, Verein oder Turniersystem und melde dich direkt online an.</p>
        </div>
        <div className="home-finder-stats" aria-label="Turniersuche Übersicht">
          <button
            type="button"
            onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            aria-label={`${total} gefundene Turniere – zur Liste springen`}
          >
            <strong>{total}</strong>
            <span>Gefundene Turniere</span>
          </button>
          <button
            type="button"
            onClick={() => nextTournament && onOpenTournament(nextTournament)}
            disabled={!nextTournament}
            aria-label={
              nextTournament
                ? `Nächster Termin ${formatDate(nextTournament.date)} – Turnier öffnen`
                : 'Kein nächster Termin'
            }
          >
            <strong>{nextTournament ? formatDate(nextTournament.date) : 'keiner'}</strong>
            <span>Nächster Termin</span>
          </button>
          <button
            type="button"
            onClick={onOpenFilters}
            aria-label={`${activeFilterCount > 0 ? 'Filter aktiv' : 'Keine Filter aktiv'} – Filter öffnen`}
          >
            <strong>{activeFilterCount > 0 ? 'Filter aktiv' : 'Keine Filter aktiv'}</strong>
            <span>Finder</span>
          </button>
          <button type="button" onClick={onOpenRadiusSearch} aria-label="Umkreissuche öffnen">
            <strong>
              {searchOrigin ? (
                <>
                  {radiusLabel} {translateText('Umkreis', language)}
                </>
              ) : (
                'Umkreissuche aus'
              )}
            </strong>
            <span>
              {searchOrigin ? (
                <>
                  {translateText('Ausgangspunkt:', language)} {searchOrigin.label}
                </>
              ) : (
                'Umkreis'
              )}
            </span>
          </button>
        </div>
      </div>

      <div className="section-title home-results-title" ref={resultsRef}>
        <p className="eyebrow">Alle passenden Turniere</p>
        <span className="counter">{total}</span>
      </div>

      {!tournaments.length && (
        <div className="empty-state">
          <strong>Keine Turniere gefunden.</strong>
          <p className="muted">Passe die Suche an.</p>
        </div>
      )}

      <div className="tournament-card-list">
        {tournaments.map((tournament) => (
          <TournamentCard
            key={tournament.id}
            tournament={tournament}
            onOpenTournament={onOpenTournament}
            onRegister={onRegister}
            language={language}
          />
        ))}
      </div>

      {hasMore && (
        <div className="load-more-wrap">
          <Button variant="secondary" onClick={onLoadMore}>
            Weitere Turniere laden
          </Button>
        </div>
      )}

    </section>
  );
}

function PublicRegistrationPanel({ tournament, form, setForm, onSubmit, onCancel, navigate, embedded = false, currentUser = null }) {
  useEffect(() => {
    if (form.id || !currentUser) {
      return;
    }
    const updates = {};
    if (!form.firstName && !form.lastName && currentUser.firstName && currentUser.lastName) {
      updates.firstName = currentUser.firstName;
      updates.lastName = currentUser.lastName;
    }
    if (!form.email && currentUser.email) {
      updates.email = currentUser.email;
    }
    if (!form.club && currentUser.club) {
      updates.club = currentUser.club;
    }
    if (!form.licenseNr && currentUser.licenseNr) {
      updates.licenseNr = currentUser.licenseNr;
    }
    if (Object.keys(updates).length > 0) {
      setForm((current) => ({ ...current, ...updates }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id, currentUser]);

  const notYetOpen = registrationNotYetOpen(tournament);

  return (
    <form className={embedded ? 'public-registration public-registration--embedded' : 'public-registration'} onSubmit={onSubmit}>
      <h2>Anmeldung: {tournament.name}</h2>
      {notYetOpen ? (
        <>
          <p className="hint">
            Die Anmeldung für dieses Turnier ist ab {new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(tournament.registrationOpensAt))} möglich.
          </p>
          <div className="row-actions stretch">
            <Button variant="secondary" onClick={onCancel}>Abbrechen</Button>
          </div>
        </>
      ) : (
        <>
          <button className="link-button" type="button" onClick={() => navigate('/datenschutz')}>
            Datenschutzerklärung lesen
          </button>
          <RegistrationFields
            form={form}
            setForm={setForm}
            showStatus={false}
            formation={tournament.formation}
            registrationType={tournament.registrationType}
            licenseRequired={tournament.licenseRequired}
            teamNameEnabled={tournament.teamNameEnabled}
          />
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.publicationNoticeAccepted}
              onChange={(event) => setForm({ ...form, publicationNoticeAccepted: event.target.checked })}
              required
            />
            Ich habe verstanden, dass meine Anmeldedaten zur Turnierorganisation verarbeitet werden und mein Name sowie ggf. Verein, Teamname und Partnernamen auf der öffentlichen Turnierseite erscheinen können, wenn der Veranstalter die Teilnehmerliste öffentlich sichtbar schaltet.
          </label>
          <div className="row-actions stretch">
            <Button type="submit">Anmeldung senden</Button>
            <Button variant="secondary" onClick={onCancel}>Abbrechen</Button>
          </div>
        </>
      )}
    </form>
  );
}

function TournamentForm({ form, setForm, onSubmit, mode, isAdmin, users }) {
  const managerOptions = [
    { value: '', label: '(ich selbst)' },
    ...users.map((user) => ({ value: user.id, label: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email })),
  ];

  return (
    <form className="form dense" onSubmit={onSubmit}>
      <TextField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      {isAdmin && (
        <SelectField
          label="Turnierleiter"
          value={form.managerId}
          onChange={(managerId) => setForm({ ...form, managerId })}
          options={managerOptions}
        />
      )}
      <div className="form-grid">
        <TextField label="Datum" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} required />
        <TextField label="Startzeit" type="time" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} />
      </div>
      <TextField label="Ort" value={form.location} onChange={(location) => setForm({ ...form, location })} required minLength={2} />
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.overrideCoordinates}
          onChange={(event) => setForm({ ...form, overrideCoordinates: event.target.checked })}
        />
        Koordinaten manuell anpassen
      </label>
      {form.overrideCoordinates && (
        <div className="form-grid">
          <TextField
            label="Breitengrad"
            type="number"
            inputMode="decimal"
            value={form.latitude}
            onChange={(latitude) => setForm({ ...form, latitude })}
          />
          <TextField
            label="Längengrad"
            type="number"
            inputMode="decimal"
            value={form.longitude}
            onChange={(longitude) => setForm({ ...form, longitude })}
          />
        </div>
      )}
      <div className="form-grid">
        <SelectField
          label="Turniersystem"
          value={form.type}
          onChange={(type) => setForm({
            ...form,
            type,
            formation: type === 'supermelee' ? 'tete' : form.formation,
            registrationType: type === 'supermelee' ? 'melee' : (form.type === 'supermelee' ? 'forme' : form.registrationType),
          })}
          options={TOURNAMENT_TYPES}
        />
        <SelectField
          label="Formation"
          value={form.formation}
          onChange={(formation) => setForm({ ...form, formation })}
          options={form.type === 'supermelee' ? FORMATIONS.filter((option) => option.value === 'tete') : FORMATIONS}
          disabled={form.type === 'supermelee'}
        />
      </div>
      <div className="form-grid">
        <SelectField
          label="Anmeldetyp"
          value={form.registrationType}
          onChange={(registrationType) => setForm({ ...form, registrationType })}
          options={form.type === 'supermelee' ? REGISTRATION_TYPES.filter((option) => option.value === 'melee') : REGISTRATION_TYPES}
          disabled={form.type === 'supermelee'}
        />
        <SelectField label="Status" value={form.status} onChange={(status) => setForm({ ...form, status })} options={TOURNAMENT_STATUSES} />
      </div>
      <div className="form-grid">
        <SelectField label="Sichtbarkeit" value={form.visibility} onChange={(visibility) => setForm({ ...form, visibility })} options={VISIBILITIES} />
      </div>
      <div className="form-grid">
        <TextField label="Max. Meldungen" type="number" min="0" value={form.maxRegistrations} onChange={(maxRegistrations) => setForm({ ...form, maxRegistrations })} />
        <TextField label="Startgeld EUR" inputMode="decimal" value={form.entryFeeEuro} onChange={(entryFeeEuro) => setForm({ ...form, entryFeeEuro })} />
      </div>
      <div className="form-grid">
        <TextField label="Anmeldung möglich ab" type="datetime-local" value={form.registrationOpensAt} onChange={(registrationOpensAt) => setForm({ ...form, registrationOpensAt })} />
        <TextField label="Meldefrist" type="datetime-local" value={form.registrationDeadline} onChange={(registrationDeadline) => setForm({ ...form, registrationDeadline })} />
      </div>
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
          checked={form.licenseRequired}
          onChange={(event) => setForm({ ...form, licenseRequired: event.target.checked })}
        />
        Lizenznummer erforderlich
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.teamNameEnabled}
          onChange={(event) => setForm({ ...form, teamNameEnabled: event.target.checked })}
        />
        Teamname abfragen
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.waitlistEnabled}
          onChange={(event) => setForm({ ...form, waitlistEnabled: event.target.checked })}
        />
        Warteliste ermöglichen
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.participantsPublic}
          onChange={(event) => setForm({ ...form, participantsPublic: event.target.checked })}
        />
        Teilnehmerliste öffentlich sichtbar. Ich bestätige, dass ich als Turnierersteller für diese Veröffentlichung verantwortlich bin und die Teilnehmer ausdrücklich darauf hinweisen muss.
      </label>
      <TextField label="Website" type="url" placeholder="https://…" value={form.websiteUrl} onChange={(websiteUrl) => setForm({ ...form, websiteUrl })} />
      <TextField label="Logo-Bildlink" type="url" placeholder="https://…" value={form.logoUrl} onChange={(logoUrl) => setForm({ ...form, logoUrl })} />
      <TextField label="Flyer-Bildlink" type="url" placeholder="https://…" value={form.flyerUrl} onChange={(flyerUrl) => setForm({ ...form, flyerUrl })} />
      <Button type="submit">{mode === 'edit' ? 'Turnier speichern' : 'Turnier anlegen'}</Button>
    </form>
  );
}

function TournamentList({ tournaments, selectedId, onSelect, onEdit, onDelete, isAdmin }) {
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
              <small>{labelFor(TOURNAMENT_TYPES, tournament.type)} · {labelFor(FORMATIONS, tournament.formation)} · {labelFor(REGISTRATION_TYPES, tournament.registrationType)}</small>
              {isAdmin && tournament.managerName && <small>Turnierleiter: {tournament.managerName}</small>}
            </button>
            <div className="badges">
              <span className={`status status-${tournament.status}`}>{labelFor(TOURNAMENT_STATUSES, tournament.status)}</span>
              <span className="role">{tournament.activeRegistrations}/{tournament.maxRegistrations || '∞'}</span>
              {tournament.waitlistRegistrations > 0 && <span className="role role-user">{tournament.waitlistRegistrations} Warteliste</span>}
            </div>
            {tournament.canManage && (
              <div className="row-actions">
                {tournament.documentManaged ? (
                  <span className="muted">Eckdaten im Turnierdokument</span>
                ) : (
                  <Button variant="secondary" onClick={() => onEdit(tournament)}>Bearbeiten</Button>
                )}
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
  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedValue);

  return (
    <form className="form dense" onSubmit={onSubmit}>
      <SelectField label="Turnier" value={selectedValue} onChange={(tournamentId) => setForm({ ...form, tournamentId })} options={options} />
      <RegistrationFields
        form={form}
        setForm={setForm}
        showStatus={manageMode}
        formation={selectedTournament?.formation}
        registrationType={selectedTournament?.registrationType}
        licenseRequired={selectedTournament?.licenseRequired}
        teamNameEnabled={selectedTournament?.teamNameEnabled}
      />
      <Button type="submit">{form.id ? 'Anmeldung speichern' : 'Anmeldung erfassen'}</Button>
    </form>
  );
}

function RegistrationFields({ form, setForm, showStatus, formation, registrationType, licenseRequired, teamNameEnabled }) {
  const allowsPartner = registrationType === 'melee' ? false : (formation ? formation !== 'tete' : true);
  const allowsPartner2 = registrationType === 'melee' ? false : formation === 'triplette';
  const showMeleeNotice = registrationType === 'melee' && formation && formation !== 'tete';

  useEffect(() => {
    if (!allowsPartner && (form.partnerFirstName || form.partnerLastName || form.partnerEmail || form.partnerLicenseNr || form.partner2FirstName || form.partner2LastName || form.partner2Email || form.partner2LicenseNr)) {
      setForm((current) => ({ ...current, partnerFirstName: '', partnerLastName: '', partnerEmail: '', partnerLicenseNr: '', partner2FirstName: '', partner2LastName: '', partner2Email: '', partner2LicenseNr: '' }));
    } else if (allowsPartner && !allowsPartner2 && (form.partner2FirstName || form.partner2LastName || form.partner2Email || form.partner2LicenseNr)) {
      setForm((current) => ({ ...current, partner2FirstName: '', partner2LastName: '', partner2Email: '', partner2LicenseNr: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowsPartner, allowsPartner2]);

  useEffect(() => {
    if (!licenseRequired && (form.licenseNr || form.partnerLicenseNr || form.partner2LicenseNr)) {
      setForm((current) => ({ ...current, licenseNr: '', partnerLicenseNr: '', partner2LicenseNr: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseRequired]);

  return (
    <>
      <div className="form-grid">
        <TextField label="Vorname" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
        <TextField label="Nachname" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
      </div>
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <div className="form-grid">
        <TextField label="Verein" value={form.club} onChange={(club) => setForm({ ...form, club })} />
        {licenseRequired && (
          <TextField
            label="Lizenznummer"
            value={form.licenseNr}
            onChange={(licenseNr) => setForm({ ...form, licenseNr })}
            required
          />
        )}
      </div>
      {teamNameEnabled && <TextField label="Teamname" value={form.teamName} onChange={(teamName) => setForm({ ...form, teamName })} />}
      {showMeleeNotice && (
        <p className="muted">Dieses Turnier wird als Mêlée gespielt – Partner werden vor Ort ausgelost.</p>
      )}
      {allowsPartner && (
        <>
          <div className="form-grid">
            <TextField label="Partner Vorname" value={form.partnerFirstName} onChange={(partnerFirstName) => setForm({ ...form, partnerFirstName })} required minLength={2} />
            <TextField label="Partner Nachname" value={form.partnerLastName} onChange={(partnerLastName) => setForm({ ...form, partnerLastName })} required minLength={2} />
          </div>
          <div className="form-grid">
            <TextField label="Partner E-Mail" type="email" value={form.partnerEmail} onChange={(partnerEmail) => setForm({ ...form, partnerEmail })} />
            {licenseRequired && (
              <TextField
                label="Partner Lizenznummer"
                value={form.partnerLicenseNr}
                onChange={(partnerLicenseNr) => setForm({ ...form, partnerLicenseNr })}
                required
              />
            )}
          </div>
        </>
      )}
      {allowsPartner2 && (
        <>
          <div className="form-grid">
            <TextField label="Partner 2 Vorname" value={form.partner2FirstName} onChange={(partner2FirstName) => setForm({ ...form, partner2FirstName })} required minLength={2} />
            <TextField label="Partner 2 Nachname" value={form.partner2LastName} onChange={(partner2LastName) => setForm({ ...form, partner2LastName })} required minLength={2} />
          </div>
          <div className="form-grid">
            <TextField label="Partner 2 E-Mail" type="email" value={form.partner2Email} onChange={(partner2Email) => setForm({ ...form, partner2Email })} />
            {licenseRequired && (
              <TextField
                label="Partner 2 Lizenznummer"
                value={form.partner2LicenseNr}
                onChange={(partner2LicenseNr) => setForm({ ...form, partner2LicenseNr })}
                required
              />
            )}
          </div>
        </>
      )}
      {showStatus && (
        <>
          <div className="form-grid">
            <TextField label="Setzposition" type="number" min="0" value={form.seedingPosition} onChange={(seedingPosition) => setForm({ ...form, seedingPosition })} />
            <SelectField label="Status" value={form.status} onChange={(status) => setForm({ ...form, status })} options={REGISTRATION_STATUSES} />
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.isVip}
              onChange={(event) => setForm({ ...form, isVip: event.target.checked })}
            />
            VIP
          </label>
        </>
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
              <strong>
                {registration.isVip && <span className="vip-badge" title="VIP">★</span>}
                {registration.firstName} {registration.lastName}
              </strong>
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

const USER_STATUS_FILTERS = [
  { value: '', label: 'Alle Status' },
  { value: 'verified', label: 'E-Mail bestätigt' },
  { value: 'unverified', label: 'E-Mail offen' },
  { value: 'password_change_required', label: 'Passwortwechsel nötig' },
];

function ProfilePanel({ currentUser, form, setForm, onSubmit }) {
  return (
    <div className="panel">
      <div className="section-title">
        <h2>Mein Profil</h2>
      </div>
      <p className="muted">Bearbeite deinen Namen, deine E-Mail-Adresse und dein Passwort.</p>
      {currentUser.pendingEmail && (
        <p className="hint">
          {`Bestätigung ausstehend für ${currentUser.pendingEmail}. Bitte prüfe dein Postfach, um die Änderung abzuschließen.`}
        </p>
      )}
      <form className="form" onSubmit={onSubmit}>
        <TextField label="Vorname" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
        <TextField label="Nachname" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
        <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
        <TextField label="Verein" value={form.club} onChange={(club) => setForm({ ...form, club })} />
        <TextField
          label="Lizenznummer"
          value={form.licenseNr}
          onChange={(licenseNr) => setForm({ ...form, licenseNr })}
        />
        <TextField
          label="Aktuelles Passwort"
          type="password"
          value={form.currentPassword}
          onChange={(currentPassword) => setForm({ ...form, currentPassword })}
        />
        <p className="hint">Nur erforderlich, wenn du deine E-Mail-Adresse oder dein Passwort änderst.</p>
        <TextField
          label="Neues Passwort"
          type="password"
          value={form.newPassword}
          onChange={(newPassword) => setForm({ ...form, newPassword })}
          minLength={8}
        />
        <p className="hint">{PASSWORD_STRENGTH_HINT}</p>
        <TextField
          label="Passwort bestätigen"
          type="password"
          value={form.newPasswordConfirm}
          onChange={(newPasswordConfirm) => setForm({ ...form, newPasswordConfirm })}
          minLength={8}
        />
        <Button type="submit">Speichern</Button>
      </form>
    </div>
  );
}

function UserManagementPanel({
  users,
  stats,
  totalUsers,
  userMode,
  currentUser,
  userForm,
  setUserForm,
  setUserMode,
  userQuery,
  setUserQuery,
  userRoleFilter,
  setUserRoleFilter,
  userStatusFilter,
  setUserStatusFilter,
  onSubmitUser,
  onEditUser,
  onDeleteUser,
}) {
  const filtered = users.length !== totalUsers;
  const roleOptions = [{ value: '', label: 'Alle Rollen' }, ...ROLES];

  function resetUserFilters() {
    setUserQuery('');
    setUserRoleFilter('');
    setUserStatusFilter('');
  }

  return (
    <section className="user-management">
      <div className="user-management-header">
        <div>
          <h2>Benutzerverwaltung</h2>
          <p className="muted">Konten und Rollen zentral bearbeiten.</p>
        </div>
        <div className="user-stat-grid">
          <UserStat label="Benutzer" value={stats.total} />
          <UserStat label="Admins" value={stats.admins} />
          <UserStat label="E-Mail offen" value={stats.unverified} />
          <UserStat label="Passwortwechsel" value={stats.passwordChangeRequired} />
        </div>
      </div>

      <div className="user-management-grid">
        <div className="panel user-list-panel">
          <div className="section-title">
            <h2>Benutzer</h2>
            <span className="counter">{filtered ? `${users.length}/${totalUsers}` : totalUsers}</span>
          </div>
          <div className="user-toolbar">
            <input
              type="search"
              placeholder="Name oder E-Mail suchen"
              value={userQuery}
              onChange={(event) => setUserQuery(event.target.value)}
            />
            <SelectField label="Rolle filtern" value={userRoleFilter} onChange={setUserRoleFilter} options={roleOptions} />
            <SelectField label="Status filtern" value={userStatusFilter} onChange={setUserStatusFilter} options={USER_STATUS_FILTERS} />
            <Button variant="secondary" onClick={resetUserFilters} disabled={!filtered}>
              Filter zurücksetzen
            </Button>
          </div>
          <div className="user-list">
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                currentUser={currentUser}
                selected={userMode === 'edit' && user.id === userForm.id}
                onEdit={onEditUser}
                onDelete={onDeleteUser}
              />
            ))}
            {users.length === 0 && <p className="muted">Keine Benutzer gefunden.</p>}
          </div>
        </div>

        <div className="panel user-editor-panel">
          <div className="section-title">
            <h2>{userMode === 'edit' ? 'Benutzer bearbeiten' : 'Benutzer anlegen'}</h2>
            {userMode === 'edit' && (
              <Button
                variant="secondary"
                onClick={() => {
                  setUserMode('create');
                  setUserForm(EMPTY_USER_FORM);
                }}
              >
                Neu
              </Button>
            )}
          </div>
          <UserEditorForm
            form={userForm}
            setForm={setUserForm}
            submitLabel={userMode === 'edit' ? 'Speichern' : 'Anlegen'}
            onSubmit={onSubmitUser}
            passwordLabel={userMode === 'edit' ? 'Neues Passwort' : 'Passwort'}
            passwordRequired={userMode === 'create'}
          />
        </div>
      </div>
    </section>
  );
}

function UserStat({ label, value }) {
  return (
    <div className="user-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function UserRow({ user, currentUser, selected, onEdit, onDelete }) {
  return (
    <article className={`data-row user-row ${selected ? 'selected' : ''}`}>
      <div>
        <strong>{user.firstName} {user.lastName}</strong>
        <span>{user.email}</span>
      </div>
      <div className="badges">
        <span className={`role role-${user.role}`}>{roleName(user.role)}</span>
        <span className={user.emailVerifiedAt ? 'status registration-confirmed' : 'status registration-pending'}>
          {user.emailVerifiedAt ? 'E-Mail bestätigt' : 'E-Mail offen'}
        </span>
        {user.passwordChangeRequired && <span className="status registration-pending">Passwortwechsel nötig</span>}
        {user.role !== 'admin' && <span className="status">Turnier-Limit: {user.tournamentLimit ?? DEFAULT_TOURNAMENT_LIMIT}</span>}
      </div>
      <div className="row-actions">
        <Button variant="secondary" onClick={() => onEdit(user)}>
          Bearbeiten
        </Button>
        <Button variant="danger" onClick={() => onDelete(user)} disabled={user.id === currentUser.id}>
          Löschen
        </Button>
      </div>
    </article>
  );
}

function UserEditorForm({ form, setForm, submitLabel, onSubmit, passwordLabel, passwordRequired }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Vorname" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
      <TextField label="Nachname" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <SelectField label="Rolle" value={form.role} onChange={(role) => setForm({ ...form, role })} options={ROLES} />
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.emailVerified}
          onChange={(event) => setForm({ ...form, emailVerified: event.target.checked })}
        />
        <span>E-Mail bestätigt setzen</span>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.passwordChangeRequired}
          onChange={(event) => setForm({ ...form, passwordChangeRequired: event.target.checked })}
        />
        <span>Passwortänderung beim nächsten Login erzwingen</span>
      </label>
      <TextField
        label="Turnier-Limit"
        type="number"
        min={0}
        value={form.tournamentLimit}
        onChange={(value) => setForm({ ...form, tournamentLimit: value === '' ? '' : Number(value) })}
      />
      <p className="hint">Maximale Anzahl eigener Turniere, die dieser Nutzer anlegen darf (Admins sind unbegrenzt).</p>
      <TextField
        label={passwordLabel}
        type="password"
        value={form.password}
        onChange={(password) => setForm({ ...form, password })}
        required={passwordRequired}
        minLength={passwordRequired ? 8 : undefined}
        placeholder={passwordRequired ? '' : 'Leer lassen, wenn unverändert'}
      />
      <p className="hint">{PASSWORD_STRENGTH_HINT}</p>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function TextField({ label, value, onChange, type = 'text', ...props }) {
  const [passwordVisible, setPasswordVisible] = useState(false);

  if (type === 'password') {
    return (
      <label>
        {label}
        <div className="password-field">
          <input
            type={passwordVisible ? 'text' : 'password'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            {...props}
          />
          <button
            className="password-toggle"
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={passwordVisible ? 'Passwort verbergen' : 'Passwort anzeigen'}
          >
            {passwordVisible ? 'Verbergen' : 'Anzeigen'}
          </button>
        </div>
      </label>
    );
  }

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

function SelectField({ label, value, onChange, options, disabled }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
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

function InstallAppButton() {
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [showIosHint, setShowIosHint] = useState(false);

  if (installed) {
    return null;
  }

  if (canInstall) {
    return (
      <button className="drawer-link install-link" type="button" onClick={promptInstall}>
        App installieren
      </button>
    );
  }

  if (isIosSafari()) {
    return (
      <div className="install-hint">
        <button className="drawer-link install-link" type="button" onClick={() => setShowIosHint((prev) => !prev)}>
          App installieren
        </button>
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
  if (authView === 'registerSuccess') {
    return 'Registrierung gespeichert';
  }
  if (authView === 'reset') {
    return 'Passwort ändern';
  }
  if (authView === 'verify') {
    return 'E-Mail bestätigen';
  }
  if (authView === 'resendVerification') {
    return 'Bestätigungslink erneut anfordern';
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
    return 'Registriere dein Benutzerkonto. Nach der E-Mail-Bestätigung kannst du dich anmelden.';
  }
  if (authView === 'registerSuccess') {
    return 'Bitte bestätige deine E-Mail-Adresse.';
  }
  if (authView === 'reset') {
    return 'Setze mit deinem Reset-Token ein neues Passwort.';
  }
  if (authView === 'verify') {
    return 'Bestätige deine E-Mail-Adresse, um dein Benutzerkonto freizuschalten.';
  }
  if (authView === 'resendVerification') {
    return 'Fordere einen neuen Bestätigungslink für dein Benutzerkonto an.';
  }
  if (authView === 'publicRegistration') {
    return 'Melde dich für ein öffentliches Turnier an.';
  }
  return 'Melde dich mit deinem Benutzerkonto an.';
}

function authErrorMessage(code) {
  if (code === 'google_not_configured') {
    return 'Google Anmeldung ist nicht konfiguriert.';
  }
  if (code === 'facebook_not_configured') {
    return 'Facebook Anmeldung ist nicht konfiguriert.';
  }
  if (code === 'facebook_login_failed') {
    return 'Facebook Anmeldung fehlgeschlagen.';
  }
  return 'Google Anmeldung fehlgeschlagen.';
}

function googleMapsUrl(tournament) {
  if (typeof tournament.latitude === 'number' && typeof tournament.longitude === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tournament.latitude},${tournament.longitude}`)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tournament.location || '')}`;
}

function tournamentPayload(form) {
  return {
    managerId: form.managerId || null,
    name: form.name,
    date: form.date,
    startTime: form.startTime || null,
    location: form.location,
    latitude: form.overrideCoordinates && form.latitude !== '' ? Number(form.latitude) : undefined,
    longitude: form.overrideCoordinates && form.longitude !== '' ? Number(form.longitude) : undefined,
    description: form.description || null,
    type: form.type,
    formation: form.formation,
    registrationType: form.registrationType,
    status: form.status,
    maxRegistrations: Number(form.maxRegistrations || 0),
    registrationDeadline: form.registrationDeadline || null,
    registrationOpensAt: form.registrationOpensAt || null,
    entryFeeCents: euroToCents(form.entryFeeEuro),
    contactName: form.contactName || null,
    contactEmail: form.contactEmail || null,
    contactPhone: form.contactPhone || null,
    visibility: form.visibility,
    internalNotes: form.internalNotes || null,
    participantsPublic: Boolean(form.participantsPublic),
    licenseRequired: Boolean(form.licenseRequired),
    teamNameEnabled: Boolean(form.teamNameEnabled),
    waitlistEnabled: Boolean(form.waitlistEnabled),
  };
}

function registrationPayload(form, language) {
  return {
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    club: form.club || null,
    licenseNr: form.licenseNr || null,
    partnerFirstName: form.partnerFirstName || null,
    partnerLastName: form.partnerLastName || null,
    partnerEmail: form.partnerEmail || null,
    partnerLicenseNr: form.partnerLicenseNr || null,
    partner2FirstName: form.partner2FirstName || null,
    partner2LastName: form.partner2LastName || null,
    partner2Email: form.partner2Email || null,
    partner2LicenseNr: form.partner2LicenseNr || null,
    teamName: form.teamName || null,
    seedingPosition: form.seedingPosition === '' ? null : Number(form.seedingPosition),
    status: form.status,
    isVip: Boolean(form.isVip),
    publicationNoticeAccepted: Boolean(form.publicationNoticeAccepted),
    language,
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

function distanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function registrationNotYetOpen(tournament) {
  return Boolean(tournament.registrationOpensAt) && new Date(tournament.registrationOpensAt).getTime() > Date.now();
}

function hasOpenRegistration(tournament) {
  if (tournament.status !== 'registration') {
    return false;
  }
  if (registrationNotYetOpen(tournament)) {
    return false;
  }
  if (tournament.registrationDeadline && new Date(tournament.registrationDeadline).getTime() < Date.now()) {
    return false;
  }
  if (!tournament.maxRegistrations) {
    return true;
  }
  return tournament.activeRegistrations < tournament.maxRegistrations || Boolean(tournament.waitlistEnabled);
}

const SLOTS_FREE_TEMPLATES = {
  de: (free, max) => `${free} von ${max} Plätzen frei`,
  nl: (free, max) => `${free} van ${max} plaatsen vrij`,
  en: (free, max) => `${free} of ${max} spots free`,
  es: (free, max) => `${free} de ${max} plazas libres`,
  fr: (free, max) => `${free} sur ${max} places libres`,
};

function registrationStatusLabel(tournament, language) {
  if (tournament.status === 'registration' && registrationNotYetOpen(tournament)) {
    const opensAt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(tournament.registrationOpensAt));
    return `Anmeldung ab ${opensAt}`;
  }

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

const API_KEY_STATUS_LABELS = {
  pending: 'Ausstehend',
  approved: 'Freigeschaltet',
  revoked: 'Widerrufen',
};

function formatDateTime(value) {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function ApiKeysPanel({ isAdmin }) {
  const [apiKeys, setApiKeys] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [revealedSecret, setRevealedSecret] = useState(null);

  async function loadOwnKeys() {
    try {
      const data = await api('/api/api-keys');
      setApiKeys(data.apiKeys);
    } catch (err) {
      setPanelError(err.message);
    }
  }

  async function loadPendingRequests() {
    if (!isAdmin) {
      return;
    }
    try {
      const data = await api('/api/admin/api-keys?status=pending');
      setPendingRequests(data.apiKeys);
    } catch (err) {
      setPanelError(err.message);
    }
  }

  useEffect(() => {
    loadOwnKeys();
    loadPendingRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function handleRequest(event) {
    event.preventDefault();
    if (!label.trim()) {
      return;
    }
    setBusy(true);
    setPanelError('');
    try {
      await api('/api/api-keys/request', { method: 'POST', body: JSON.stringify({ label: label.trim() }) });
      setLabel('');
      await loadOwnKeys();
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevealSecret(id) {
    setPanelError('');
    try {
      const data = await api(`/api/api-keys/${id}/secret`);
      setRevealedSecret({ id, secret: data.secret });
      await loadOwnKeys();
    } catch (err) {
      setPanelError(err.message);
    }
  }

  async function handleRevoke(id) {
    if (!window.confirm('API-Schlüssel wirklich widerrufen?')) {
      return;
    }
    setPanelError('');
    try {
      await api(`/api/admin/api-keys/${id}/revoke`, { method: 'POST' });
      await loadOwnKeys();
    } catch (err) {
      setPanelError(err.message);
    }
  }

  async function handleApprove(id) {
    setPanelError('');
    try {
      await api(`/api/admin/api-keys/${id}/approve`, { method: 'POST' });
      await Promise.all([loadPendingRequests(), loadOwnKeys()]);
    } catch (err) {
      setPanelError(err.message);
    }
  }

  async function handleReject(id) {
    setPanelError('');
    try {
      await api(`/api/admin/api-keys/${id}/revoke`, { method: 'POST' });
      await loadPendingRequests();
    } catch (err) {
      setPanelError(err.message);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="section-title">
          <h2>API-Zugänge</h2>
        </div>
        <p className="hint">
          Externe Turnierleitungs-Software (z.B. das PTM-Hauptprogramm auf deinem Rechner) braucht einen
          freigeschalteten API-Schlüssel, um Turniere anzulegen und Anmeldungen abzugleichen. Ein Administrator muss
          jede Installation einzeln genehmigen.
        </p>

        <form className="form" onSubmit={handleRequest}>
          <input
            type="text"
            placeholder="Bezeichnung der Installation, z.B. Bürorechner"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Button type="submit" disabled={busy || !label.trim()}>
            Schlüssel beantragen
          </Button>
        </form>

        {panelError && <p className="feedback error">{panelError}</p>}

        {revealedSecret && (
          <div className="api-key-secret-box">
            <p>Speichere diesen Schlüssel jetzt sicher ab. Er wird nicht erneut angezeigt.</p>
            <code>{revealedSecret.secret}</code>
          </div>
        )}

        <table className="data-table">
          <thead>
            <tr>
              <th>Bezeichnung</th>
              <th>Status</th>
              <th>Beantragt am</th>
              <th>Zuletzt genutzt</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => (
              <tr key={key.id}>
                <td>{key.label}</td>
                <td>{API_KEY_STATUS_LABELS[key.status] || key.status}</td>
                <td>{formatDateTime(key.requestedAt)}</td>
                <td>{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : '–'}</td>
                <td>
                  {key.status === 'approved' && key.secretAvailable && (
                    <Button variant="secondary" onClick={() => handleRevealSecret(key.id)}>
                      Schlüssel abholen
                    </Button>
                  )}
                  {key.status === 'approved' && (
                    <Button variant="secondary" onClick={() => handleRevoke(key.id)}>
                      Widerrufen
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {apiKeys.length === 0 && (
              <tr>
                <td colSpan={5}>Noch keine API-Schlüssel beantragt.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="panel">
          <div className="section-title">
            <h2>Offene Freischaltungsanfragen</h2>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Turnierleiter</th>
                <th>Bezeichnung</th>
                <th>Beantragt am</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pendingRequests.map((key) => (
                <tr key={key.id}>
                  <td>
                    {key.userName} ({key.userEmail})
                  </td>
                  <td>{key.label}</td>
                  <td>{formatDateTime(key.requestedAt)}</td>
                  <td>
                    <Button onClick={() => handleApprove(key.id)}>Genehmigen</Button>
                    <Button variant="secondary" onClick={() => handleReject(key.id)}>
                      Ablehnen
                    </Button>
                  </td>
                </tr>
              ))}
              {pendingRequests.length === 0 && (
                <tr>
                  <td colSpan={4}>Keine offenen Anfragen.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
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

const PASSWORD_STRENGTH_ERROR =
  'Das Passwort muss mindestens 8 Zeichen lang sein und mindestens eine Zahl, einen Kleinbuchstaben, einen Großbuchstaben und ein Sonderzeichen enthalten';
const PASSWORD_STRENGTH_HINT = 'Mindestens 8 Zeichen, ein Groß- und Kleinbuchstabe, eine Zahl und ein Sonderzeichen.';

function isPasswordStrong(password) {
  return (
    password.length >= 8 &&
    /[0-9]/.test(password) &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
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
    const error = new Error(translateText(payload.error || 'Request failed', localStorage.getItem('ptm_language') || 'de'));
    error.payload = payload;
    throw error;
  }

  return payload;
}

const TRANSLATIONS = {
  nl: {
    'Eckdaten im Turnierdokument': 'Toernooigegevens in het toernooidocument',
    'App wird geladen.': 'App wordt geladen.',
    'Ersten Admin anlegen': 'Eerste admin aanmaken',
    'Passwort vergessen': 'Wachtwoord vergeten',
    'Passwort ändern': 'Wachtwoord wijzigen',
    'Neu registrieren': 'Nieuw registreren',
    'Turniersoftware': 'Toernooisoftware',
    'Registrierung gespeichert': 'Registratie opgeslagen',
    'E-Mail bestätigen': 'E-mail bevestigen',
    'Turnieranmeldung': 'Toernooi-inschrijving',
    Anmelden: 'Aanmelden',
    'Lege den ersten Admin-Benutzer für dieses neue Projekt an.': 'Maak de eerste admin-gebruiker voor dit nieuwe project aan.',
    'Fordere einen Link zum Zurücksetzen deines Passworts an.': 'Vraag een link aan om je wachtwoord opnieuw in te stellen.',
    'Registriere dein Benutzerkonto. Die Freischaltung erfolgt erst nach E-Mail-Bestätigung.': 'Registreer je gebruikersaccount. Vrijgave gebeurt pas na e-mailbevestiging.',
    'Registriere dein Benutzerkonto. Nach der E-Mail-Bestätigung kannst du dich anmelden.':
      'Registreer je gebruikersaccount. Na de e-mailbevestiging kun je je aanmelden.',
    'Setze mit deinem Reset-Token ein neues Passwort.': 'Stel met je reset-token een nieuw wachtwoord in.',
    'Bestätige deine E-Mail-Adresse, um dein Benutzerkonto freizuschalten.': 'Bevestig je e-mailadres om je gebruikersaccount vrij te geven.',
    'Melde dich für ein öffentliches Turnier an.': 'Schrijf je in voor een openbaar toernooi.',
    'Melde dich mit deinem Benutzerkonto an.': 'Meld je aan met je gebruikersaccount.',
    Sprache: 'Taal',
    Name: 'Naam',
    'E-Mail': 'E-mail',
    Passwort: 'Wachtwoord',
    Anzeigen: 'Tonen',
    Verbergen: 'Verbergen',
    'Passwort anzeigen': 'Wachtwoord tonen',
    'Passwort verbergen': 'Wachtwoord verbergen',
    'Passwort bestätigen': 'Wachtwoord bevestigen',
    'Verein oder kurze Begründung': 'Vereniging of korte reden',
    'Admin anlegen': 'Admin aanmaken',
    'Passwort vergessen?': 'Wachtwoord vergeten?',
    'Reset-Link anfordern': 'Reset-link aanvragen',
    Registrieren: 'Registreren',
    'Zurück zur Anmeldung': 'Terug naar aanmelden',
    'Reset-Token': 'Reset-token',
    'Bestätigungs-Token': 'Bevestigingstoken',
    'E-Mail bestätigt': 'E-mail bevestigd',
    'E-Mail offen': 'E-mail open',
    'E-Mail bestätigt setzen': 'E-mail als bevestigd markeren',
    'Passwortänderung beim nächsten Login erzwingen': 'Wachtwoordwijziging bij volgende aanmelding afdwingen',
    'Passwortwechsel nötig': 'Wachtwoordwijziging nodig',
    'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.': 'E-mailadres is bevestigd. Je kunt je nu aanmelden.',
    'Mit Google anmelden': 'Aanmelden met Google',
    'Mit Google angemeldet.': 'Aangemeld met Google.',
    'Google Anmeldung ist nicht konfiguriert.': 'Aanmelden met Google is niet geconfigureerd.',
    'Google Anmeldung fehlgeschlagen.': 'Aanmelden met Google is mislukt.',
    'Mit Facebook anmelden': 'Aanmelden met Facebook',
    'Mit Facebook angemeldet.': 'Aangemeld met Facebook.',
    'Facebook Anmeldung ist nicht konfiguriert.': 'Aanmelden met Facebook is niet geconfigureerd.',
    'Facebook Anmeldung fehlgeschlagen.': 'Aanmelden met Facebook is mislukt.',
    'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.': 'Registratie opgeslagen. Bevestig je e-mailadres via de link in de e-mail.',
    'Bitte bestätige zuerst deine E-Mail-Adresse.': 'Bevestig eerst je e-mailadres.',
    'Bitte ändere dein Passwort, bevor du fortfährst.': 'Wijzig je wachtwoord voordat je verdergaat.',
    'Bestätigungs-Token ist erforderlich': 'Bevestigingstoken is verplicht',
    'Bestätigungs-Link ist ungültig oder abgelaufen': 'Bevestigingslink is ongeldig of verlopen',
    'Bestätigungs-E-Mail nicht erhalten?': 'Geen bevestigingsmail ontvangen?',
    'Bestätigungslink erneut senden': 'Bevestigingslink opnieuw versturen',
    'Bestätigungslink erneut anfordern': 'Bevestigingslink opnieuw aanvragen',
    'Fordere einen neuen Bestätigungslink für dein Benutzerkonto an.': 'Vraag een nieuwe bevestigingslink voor je account aan.',
    'Wenn ein unbestätigtes Konto mit dieser E-Mail-Adresse existiert, wurde ein neuer Bestätigungslink gesendet.':
      'Als er een onbevestigd account met dit e-mailadres bestaat, is een nieuwe bevestigingslink verstuurd.',
    'Die Passwörter stimmen nicht überein.': 'De wachtwoorden komen niet overeen.',
    'Mein Profil': 'Mijn profiel',
    'Bearbeite deinen Namen, deine E-Mail-Adresse und dein Passwort.': 'Bewerk je naam, e-mailadres en wachtwoord.',
    'Aktuelles Passwort': 'Huidig wachtwoord',
    'Nur erforderlich, wenn du deine E-Mail-Adresse oder dein Passwort änderst.':
      'Alleen nodig als je je e-mailadres of wachtwoord wijzigt.',
    'Deine Daten wurden gespeichert.': 'Je gegevens zijn opgeslagen.',
    'Deine Daten wurden gespeichert. Bitte bestätige deine neue E-Mail-Adresse über den Link, den wir dir zugeschickt haben.':
      'Je gegevens zijn opgeslagen. Bevestig je nieuwe e-mailadres via de link die we je hebben gestuurd.',
    'Aktuelles Passwort ist erforderlich oder falsch': 'Huidig wachtwoord is vereist of onjuist',
    'Das Passwort muss mindestens 8 Zeichen lang sein und mindestens eine Zahl, einen Kleinbuchstaben, einen Großbuchstaben und ein Sonderzeichen enthalten':
      'Het wachtwoord moet minstens 8 tekens bevatten en minstens één cijfer, één kleine letter, één hoofdletter en één speciaal teken bevatten',
    'Mindestens 8 Zeichen, ein Groß- und Kleinbuchstabe, eine Zahl und ein Sonderzeichen.':
      'Minstens 8 tekens, een hoofdletter en kleine letter, een cijfer en een speciaal teken.',
    'Neues Passwort darf nicht mit dem aktuellen Passwort übereinstimmen':
      'Nieuw wachtwoord mag niet hetzelfde zijn als het huidige wachtwoord',
    'Email already exists': 'E-mail bestaat al',
    'Email and password are required': 'E-mail en wachtwoord zijn verplicht',
    'Invalid login': 'Ongeldige aanmelding',
    'Name must contain at least 2 characters': 'Naam moet minstens 2 tekens bevatten',
    'A valid email is required': 'Een geldig e-mailadres is verplicht',
    'Password must contain at least 8 characters': 'Wachtwoord moet minstens 8 tekens bevatten',
    'E-Mail-Versand ist nicht konfiguriert.': 'E-mailverzending is niet geconfigureerd.',
    'E-Mail konnte nicht versendet werden.': 'E-mail kon niet worden verzonden.',
    'Die Nachricht darf maximal 1000 Zeichen enthalten.': 'Het bericht mag maximaal 1000 tekens bevatten.',
    'Benutzer nicht gefunden.': 'Gebruiker niet gevonden.',
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
    'Konten, Rollen und Freischaltungen zentral bearbeiten.': 'Accounts, rollen en vrijgaven centraal beheren.',
    Admins: 'Admins',
    Passwortwechsel: 'Wachtwoordwijziging',
    Anfragen: 'Aanvragen',
    'Name oder E-Mail suchen': 'Naam of e-mail zoeken',
    'Rolle filtern': 'Rol filteren',
    'Status filtern': 'Status filteren',
    'Alle Rollen': 'Alle rollen',
    'Alle Status': 'Alle statussen',
    'Filter zurücksetzen': 'Filters resetten',
    'Keine Benutzer gefunden.': 'Geen gebruikers gevonden.',
    Abmelden: 'Afmelden',
    'Turnier bearbeiten': 'Toernooi bewerken',
    'Turnier anlegen': 'Toernooi aanmaken',
    Neu: 'Nieuw',
    Datum: 'Datum',
    Startzeit: 'Starttijd',
    Ort: 'Plaats',
    Turniersystem: 'Toernooisysteem',
    Formation: 'Formatie',
    Anmeldetyp: 'Inschrijftype',
    Mêlée: 'Mêlée',
    Formé: 'Formé',
    'Dieses Turnier wird als Mêlée gespielt – Partner werden vor Ort ausgelost.':
      'Dit toernooi wordt als mêlée gespeeld – partners worden ter plaatse geloot.',
    Status: 'Status',
    VIP: 'VIP',
    Sichtbarkeit: 'Zichtbaarheid',
    'Max. Meldungen': 'Max. inschrijvingen',
    'Noch frei': 'Nog vrij',
    'Startgeld EUR': 'Inschrijfgeld EUR',
    Meldefrist: 'Inschrijfdeadline',
    Kontaktname: 'Contactnaam',
    'Kontakt-E-Mail': 'Contact-e-mail',
    'Kontakt-Telefon': 'Contacttelefoon',
    Beschreibung: 'Beschrijving',
    'Interne Notizen': 'Interne notities',
    'Turnier speichern': 'Toernooi opslaan',
    'Lizenznummer erforderlich': 'Licentienummer verplicht',
    'Teamname abfragen': 'Teamnaam vragen',
    'Supermêlée ist nur mit der Formation Tête möglich': 'Supermêlée is alleen mogelijk met de formatie Tête',
    'Lizenznummer ist erforderlich': 'Licentienummer is verplicht',
    'Lizenznummer für Partner ist erforderlich': 'Licentienummer voor partner is verplicht',
    'Lizenznummer für Partner 2 ist erforderlich': 'Licentienummer voor partner 2 is verplicht',
    Bearbeiten: 'Bewerken',
    Löschen: 'Verwijderen',
    'Anmeldung bearbeiten': 'Inschrijving bewerken',
    'Anmeldung erfassen': 'Inschrijving invoeren',
    Turnier: 'Toernooi',
    Vorname: 'Voornaam',
    Nachname: 'Achternaam',
    Verein: 'Vereniging',
    Lizenznummer: 'Licentienummer',
    Lizenz: 'Licentie',
    Ja: 'Ja',
    Nein: 'Nee',
    'Turnier teilen': 'Toernooi delen',
    'Link kopiert': 'Link gekopieerd',
    'Teilen wird von diesem Gerät nicht unterstützt': 'Delen wordt niet ondersteund op dit apparaat',
    Teamname: 'Teamnaam',
    'Partner Vorname': 'Partner voornaam',
    'Partner Nachname': 'Partner achternaam',
    'Partner E-Mail': 'Partner e-mail',
    'Partner Lizenznummer': 'Partner licentienummer',
    'Partner 2 Vorname': 'Partner 2 voornaam',
    'Partner 2 Nachname': 'Partner 2 achternaam',
    'Partner 2 E-Mail': 'Partner 2 e-mail',
    'Partner 2 Lizenznummer': 'Partner 2 licentienummer',
    Setzposition: 'Plaatsingspositie',
    'Anmeldung speichern': 'Inschrijving opslaan',
    'Benutzer bearbeiten': 'Gebruiker bewerken',
    'Benutzer anlegen': 'Gebruiker aanmaken',
    Rolle: 'Rol',
    Speichern: 'Opslaan',
    Anlegen: 'Aanmaken',
    Admin: 'Admin',
    User: 'Gebruiker',
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
    'Teilnehmerliste öffentlich sichtbar. Ich bestätige, dass ich als Turnierersteller für diese Veröffentlichung verantwortlich bin und die Teilnehmer ausdrücklich darauf hinweisen muss.':
      'Deelnemerslijst openbaar zichtbaar. Ik bevestig dat ik als toernooimaker verantwoordelijk ben voor deze publicatie en de deelnemers hier uitdrukkelijk op moet wijzen.',
    'Nur meine Turniere': 'Alleen mijn toernooien',
    'Turnier suchen': 'Toernooi zoeken',
    'Name, Ort oder Turniersystem': 'Naam, plaats of toernooisysteem',
    'Suche öffnen': 'Zoeken openen',
    'Suche schließen': 'Zoeken sluiten',
    'Filter ausblenden': 'Filter verbergen',
    'Filter anzeigen': 'Filter tonen',
    'Finde dein nächstes Pétanque-Turnier': 'Vind je volgende pétanquetoernooi',
    'Suche nach Ort, Verein oder Turniersystem und melde dich direkt online an.':
      'Zoek op plaats, vereniging of toernooisysteem en schrijf je direct online in.',
    'Gefundene Turniere': 'Gevonden toernooien',
    keiner: 'geen',
    'Nächster Termin': 'Volgende datum',
    'Filter aktiv': 'Filter actief',
    'Keine Filter aktiv': 'Geen filter actief',
    Finder: 'Zoeker',
    'Umkreissuche aus': 'Straal zoeken uit',
    'Alle passenden Turniere': 'Alle passende toernooien',
    'Keine Turniere gefunden.': 'Geen toernooien gevonden.',
    Ganztägig: 'Hele dag',
    'Weitere Turniere laden': 'Meer toernooien laden',
    Monat: 'Maand',
    'Alle Monate': 'Alle maanden',
    'Alle Formationen': 'Alle formaties',
    'Anmeldung möglich': 'Inschrijving mogelijk',
    Zurücksetzen: 'Resetten',
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
    'Spielort in Google Maps öffnen': 'Speellocatie in Google Maps openen',
    Präsentation: 'Presentatie',
    'Website öffnen': 'Website openen',
    Website: 'Website',
    'Logo-Bildlink': 'Logo-afbeeldingslink',
    'Flyer-Bildlink': 'Flyer-afbeeldingslink',
    'Präsentation speichern': 'Presentatie opslaan',
    'Präsentation wurde gespeichert.': 'Presentatie is opgeslagen.',
    'Website, Logo und Flyer sind unabhängig von den Turnier-Eckdaten und können auch bei dokument-verwalteten Turnieren jederzeit hier gepflegt werden. Logo und Flyer werden als Link zu einem bereits online gehosteten Bild eingebunden, nicht hochgeladen.':
      'Website, logo en flyer staan los van de kerngegevens van het toernooi en kunnen ook bij document-beheerde toernooien altijd hier worden ingesteld. Logo en flyer worden als link naar een al online gehoste afbeelding ingebonden, niet geüpload.',
    'Eine gültige URL (http:// oder https://) ist erforderlich': 'Een geldige URL (http:// of https://) is verplicht',
    'Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.': 'De deelnemerslijst is voor dit toernooi niet openbaar.',
    'Teilnehmerliste wird geladen…': 'Deelnemerslijst wordt geladen…',
    'Noch keine Anmeldungen.': 'Nog geen inschrijvingen.',
    'Invalid formation': 'Ongeldige formatie',
    'Formation tete allows only a single participant, no partner': 'Formatie tete staat maar een deelnemer toe, geen partner',
    'Formation doublette requires exactly one partner': 'Formatie doublette vereist precies een partner',
    'Formation doublette allows only one partner': 'Formatie doublette staat maar een partner toe',
    'Formation triplette requires exactly two partners': 'Formatie triplette vereist precies twee partners',
    'A valid tournament date is required': 'Een geldige datum is verplicht',
    'Tournament name must contain at least 2 characters': 'Toernooinaam moet minstens 2 tekens bevatten',
    'API-Zugänge': 'API-toegangen',
    'Externe Turnierleitungs-Software (z.B. das PTM-Hauptprogramm auf deinem Rechner) braucht einen freigeschalteten API-Schlüssel, um Turniere anzulegen und Anmeldungen abzugleichen. Ein Administrator muss jede Installation einzeln genehmigen.':
      'Externe toernooisoftware (bijv. het PTM-hoofdprogramma op je computer) heeft een goedgekeurde API-sleutel nodig om toernooien aan te maken en inschrijvingen te synchroniseren. Een beheerder moet elke installatie apart goedkeuren.',
    'Bezeichnung der Installation, z.B. Bürorechner': 'Naam van de installatie, bijv. kantoorcomputer',
    'Schlüssel beantragen': 'Sleutel aanvragen',
    'Speichere diesen Schlüssel jetzt sicher ab. Er wird nicht erneut angezeigt.':
      'Bewaar deze sleutel nu veilig. Hij wordt niet opnieuw getoond.',
    Bezeichnung: 'Naam',
    'Beantragt am': 'Aangevraagd op',
    'Zuletzt genutzt': 'Laatst gebruikt',
    'Schlüssel abholen': 'Sleutel ophalen',
    Widerrufen: 'Intrekken',
    'Noch keine API-Schlüssel beantragt.': 'Nog geen API-sleutels aangevraagd.',
    'Offene Freischaltungsanfragen': 'Openstaande goedkeuringsverzoeken',
    Genehmigen: 'Goedkeuren',
    'Keine offenen Anfragen.': 'Geen openstaande verzoeken.',
    'API-Schlüssel wirklich widerrufen?': 'API-sleutel echt intrekken?',
    Ausstehend: 'In behandeling',
    Freigeschaltet: 'Goedgekeurd',
    Impressum: 'Colofon',
    Datenschutz: 'Privacy',
    'Diese Teilnehmerliste ist öffentlich sichtbar und ohne Anmeldung einsehbar. Wer hier nicht aufgeführt werden möchte, wende sich bitte direkt an den Veranstalter dieses Turniers.':
      'Deze deelnemerslijst is openbaar zichtbaar en kan zonder aanmelding worden bekeken. Wie hier niet vermeld wil worden, neemt contact op met de organisator van dit toernooi.',
    'Ich habe verstanden, dass meine Anmeldedaten zur Turnierorganisation verarbeitet werden und mein Name sowie ggf. Verein, Teamname und Partnernamen auf der öffentlichen Turnierseite erscheinen können, wenn der Veranstalter die Teilnehmerliste öffentlich sichtbar schaltet.':
      'Ik heb begrepen dat mijn inschrijfgegevens voor de organisatie van het toernooi worden verwerkt en dat mijn naam en eventueel vereniging, teamnaam en partnernamen op de openbare toernooipagina kunnen verschijnen als de organisator de deelnemerslijst openbaar zichtbaar maakt.',
    'Der Hinweis zur möglichen Veröffentlichung der Anmeldedaten muss bestätigt werden':
      'De informatie over de mogelijke publicatie van inschrijfgegevens moet worden bevestigd',
    'Datenschutzerklärung lesen': 'Privacybeleid lezen',
    'Mit der Registrierung stimmst du der Verarbeitung deiner Daten gemäß unserer Datenschutzerklärung zu.':
      'Met de registratie ga je akkoord met de verwerking van je gegevens conform ons privacybeleid.',
    'Angaben gemäß § 5 DDG': 'Gegevens conform § 5 DDG (Duitse wet digitale diensten)',
    Deutschland: 'Duitsland',
    'E-Mail: michael.massee@gmail.com': 'E-mail: michael.massee@gmail.com',
    'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV': 'Verantwoordelijk voor de inhoud conform § 18 lid 2 MStV (Duits mediastaatsverdrag)',
    'Michael Massee (Anschrift wie oben)': 'Michael Massee (adres zoals hierboven)',
    'Haftung für Inhalte': 'Aansprakelijkheid voor inhoud',
    'Turnierdaten, Anmeldungen und Turniermeldungen auf dieser Plattform werden von den jeweiligen Turnierleitern bzw. Nutzern eigenverantwortlich erstellt und gepflegt. Für die Richtigkeit, Vollständigkeit und Aktualität dieser Inhalte sind allein die jeweiligen Turnierleiter bzw. Einsender verantwortlich, nicht der Betreiber dieser Plattform.':
      'Toernooigegevens, inschrijvingen en toernooimeldingen op dit platform worden door de betreffende toernooileiders resp. gebruikers op eigen verantwoordelijkheid aangemaakt en onderhouden. Voor de juistheid, volledigheid en actualiteit van deze inhoud zijn uitsluitend de betreffende toernooileiders resp. inzenders verantwoordelijk, niet de beheerder van dit platform.',
    'Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Bei Bekanntwerden entsprechender Rechtsverletzungen werden wir die betroffenen Inhalte umgehend entfernen.':
      'Als dienstverlener zijn wij conform § 7 lid 1 DDG verantwoordelijk voor eigen inhoud op deze pagina\'s volgens de algemene wetten. Conform §§ 8 tot 10 DDG zijn wij echter niet verplicht om doorgegeven of opgeslagen informatie van derden te controleren of te onderzoeken op omstandigheden die op onrechtmatige activiteiten wijzen. Zodra wij kennis krijgen van dergelijke inbreuken, verwijderen wij de betreffende inhoud onmiddellijk.',
    'Haftung für Links': 'Aansprakelijkheid voor links',
    'Turniermeldungen können Links zu externen Websites Dritter enthalten, etwa zu Anmeldeseiten der jeweiligen Veranstalter, auf deren Inhalte wir keinen Einfluss haben. Für diese fremden Inhalte können wir daher keine Gewähr übernehmen; für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.':
      'Toernooimeldingen kunnen links naar externe websites van derden bevatten, bijvoorbeeld naar inschrijfpagina\'s van de betreffende organisatoren, waarop wij geen invloed hebben. Voor deze externe inhoud kunnen wij daarom geen garantie geven; voor de inhoud van de gelinkte pagina\'s is steeds de betreffende aanbieder of beheerder verantwoordelijk. Een permanente inhoudelijke controle van de gelinkte pagina\'s is zonder concrete aanwijzingen van een inbreuk niet redelijk. Zodra wij kennis krijgen van inbreuken, verwijderen wij dergelijke links onmiddellijk.',
    Hinweis: 'Let op',
    'Dieses Angebot wird als nicht-kommerzielles Privatprojekt betrieben. Es werden keine Waren oder Dienstleistungen gegen Entgelt über diese Website angeboten oder abgewickelt.':
      'Dit aanbod wordt als niet-commercieel privéproject beheerd. Er worden via deze website geen goederen of diensten tegen betaling aangeboden of afgehandeld.',
    Streitschlichtung: 'Geschillenbeslechting',
    'Als Privatperson bieten wir kein kommerzielles Angebot an und nehmen daher nicht an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil.':
      'Als privépersoon bieden wij geen commercieel aanbod aan en nemen wij daarom niet deel aan geschillenbeslechtingsprocedures voor een consumentengeschillencommissie.',
    Datenschutzerklärung: 'Privacybeleid',
    '1. Verantwortlicher': '1. Verwerkingsverantwoordelijke',
    'Verantwortlich für die Datenverarbeitung auf dieser Website ist:': 'Verantwoordelijk voor de gegevensverwerking op deze website is:',
    'Michael Massee, An der Ziegelei 21, 35440 Linden, E-Mail: michael.massee@gmail.com':
      'Michael Massee, An der Ziegelei 21, 35440 Linden, e-mail: michael.massee@gmail.com',
    '2. Allgemeines zur Datenverarbeitung': '2. Algemeen over gegevensverwerking',
    'Wir verarbeiten personenbezogene Daten unserer Nutzer grundsätzlich nur, soweit dies zur Bereitstellung einer funktionsfähigen Website sowie unserer Inhalte und Leistungen erforderlich ist.':
      'Wij verwerken persoonsgegevens van onze gebruikers in principe alleen voor zover dit nodig is om een functionerende website en onze inhoud en diensten aan te bieden.',
    'Rechtsgrundlage ist, je nach Verarbeitungsvorgang, die Erfüllung eines Vertrags bzw. vorvertraglicher Maßnahmen (Art. 6 Abs. 1 lit. b DSGVO), eine erteilte Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) oder unser berechtigtes Interesse an einem sicheren und funktionsfähigen Betrieb der Website (Art. 6 Abs. 1 lit. f DSGVO).':
      'Rechtsgrondslag is, afhankelijk van de verwerking, de uitvoering van een overeenkomst resp. precontractuele maatregelen (art. 6 lid 1 sub b AVG), een gegeven toestemming (art. 6 lid 1 sub a AVG) of ons gerechtvaardigd belang bij een veilige en functionerende werking van de website (art. 6 lid 1 sub f AVG).',
    '3. Bereitstellung der Website und Hosting': '3. Beschikbaarstelling van de website en hosting',
    'Diese Website wird über Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA) als Hosting- und Content-Delivery-Anbieter bereitgestellt. Cloudflare verarbeitet dabei technisch notwendige Daten wie IP-Adresse, Datum und Uhrzeit der Anfrage sowie Browser-Informationen (Server-Logfiles), um die Website sicher und zuverlässig auszuliefern (Art. 6 Abs. 1 lit. f DSGVO).':
      'Deze website wordt gehost via Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, VS) als hosting- en content-delivery-provider. Cloudflare verwerkt daarbij technisch noodzakelijke gegevens zoals IP-adres, datum en tijdstip van het verzoek en browserinformatie (serverlogbestanden), om de website veilig en betrouwbaar te leveren (art. 6 lid 1 sub f AVG).',
    'Da Cloudflare auch Server außerhalb der EU nutzen kann, erfolgt die Datenübermittlung auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.':
      'Omdat Cloudflare ook servers buiten de EU kan gebruiken, vindt de gegevensoverdracht plaats op basis van EU-standaardcontractbepalingen conform art. 46 AVG.',
    '4. Registrierung und Benutzerkonto': '4. Registratie en gebruikersaccount',
    'Wenn du dich registrierst, erheben wir Name, E-Mail-Adresse und ein sicher gehashtes Passwort. Diese Daten werden zur Bereitstellung deines Benutzerkontos und zur Verwaltung deiner Turniere verarbeitet (Art. 6 Abs. 1 lit. b DSGVO). Nach der Registrierung senden wir dir zur Bestätigung deiner E-Mail-Adresse eine E-Mail mit einem 24 Stunden gültigen Bestätigungslink.':
      'Wanneer je je als toernooileider of beheerder registreert, verzamelen wij naam, e-mailadres en een veilig gehasht wachtwoord. Deze gegevens worden verwerkt om je gebruikersaccount aan te bieden en je toernooien te beheren (art. 6 lid 1 sub b AVG). Na de registratie sturen we je ter bevestiging van je e-mailadres een e-mail met een 24 uur geldige bevestigingslink.',
    'Wenn du die Google Anmeldung nutzt, erhalten wir von Google deine verifizierte E-Mail-Adresse, deinen Namen und eine technische Google-Konto-ID. Wir verwenden diese Daten nur, um dein Benutzerkonto anzulegen, dich anzumelden und dein Google-Konto deinem Benutzerkonto zuzuordnen.':
      'Als je Google-login gebruikt, ontvangen wij van Google je geverifieerde e-mailadres, je naam en een technische Google-account-ID. Wij gebruiken deze gegevens alleen om je gebruikersaccount aan te maken, je aan te melden en je Google-account aan je gebruikersaccount te koppelen.',
    'Wenn du die Facebook Anmeldung nutzt, erhalten wir von Facebook deine E-Mail-Adresse, deinen Namen und eine technische Facebook-Konto-ID. Wir verwenden diese Daten nur, um dein Benutzerkonto anzulegen, dich anzumelden und dein Facebook-Konto deinem Benutzerkonto zuzuordnen.':
      'Als je Facebook-login gebruikt, ontvangen wij van Facebook je e-mailadres, je naam en een technische Facebook-account-ID. Wij gebruiken deze gegevens alleen om je gebruikersaccount aan te maken, je aan te melden en je Facebook-account aan je gebruikersaccount te koppelen.',
    '5. Turnieranmeldungen und öffentliche Teilnehmerlisten': '5. Toernooi-inschrijvingen en openbare deelnemerslijsten',
    'Wenn du dich über diese Website für ein Turnier anmeldest, verarbeiten wir Vorname, Nachname, E-Mail-Adresse sowie je nach Turnier optional oder verpflichtend Verein, Lizenznummer und Angaben zu deinem Partner bzw. deinen Partnern (Doublette/Triplette). Diese Daten werden an den jeweiligen Turnierleiter zur Organisation des Turniers weitergegeben (Art. 6 Abs. 1 lit. b DSGVO).':
      'Wanneer je je via deze website voor een toernooi inschrijft, verwerken wij voornaam, achternaam, e-mailadres en afhankelijk van het toernooi optioneel of verplicht vereniging, licentienummer en gegevens over je partner(s) (doublette/triplette). Deze gegevens worden doorgegeven aan de betreffende toernooileider voor de organisatie van het toernooi (art. 6 lid 1 sub b AVG).',
    'Turnierleiter können die Teilnehmerliste eines Turniers öffentlich sichtbar schalten. In diesem Fall werden Vorname, Nachname, Verein und die Namen deiner Partner für jeden Besucher der Turnierseite sichtbar, ohne dass eine Anmeldung erforderlich ist. Wenn du das nicht möchtest, wende dich bitte direkt an den Veranstalter (Turnierleiter) des jeweiligen Turniers, dessen Kontaktdaten auf der Turnierseite angegeben sind.':
      'Toernooileiders kunnen de deelnemerslijst van een toernooi openbaar zichtbaar maken. In dat geval zijn voornaam, achternaam, vereniging en de namen van je partner(s) zichtbaar voor elke bezoeker van de toernooipagina, zonder dat aanmelding vereist is. Als je dit niet wilt, neem dan rechtstreeks contact op met de organisator (toernooileider) van het betreffende toernooi, wiens contactgegevens op de toernooipagina staan vermeld.',
    '6. Turniermeldungen': '6. Toernooimeldingen',
    'Wenn du ein fremdes Turnier zur Veröffentlichung vorschlägst, verarbeiten wir deinen Namen und deine E-Mail-Adresse zur Rückfrage und Bestätigung sowie zur Moderation durch unsere Administratoren (Art. 6 Abs. 1 lit. a, lit. f DSGVO).':
      'Wanneer je een extern toernooi voordraagt voor publicatie, verwerken wij je naam en e-mailadres voor terugvragen en bevestiging, alsook voor moderatie door onze beheerders (art. 6 lid 1 sub a, sub f AVG).',
    '7. Cookies und lokaler Speicher': '7. Cookies en lokale opslag',
    'Diese Website verwendet ein technisch notwendiges Session-Cookie (ptm_session), um dich nach der Anmeldung für bis zu 14 Tage eingeloggt zu halten. Das Cookie ist HttpOnly, Secure und SameSite=Lax gesetzt und wird ausschließlich für den Login-Status verwendet. Da dieses Cookie technisch notwendig ist, ist gemäß § 25 Abs. 2 TTDSG keine Einwilligung erforderlich.':
      'Deze website gebruikt een technisch noodzakelijk sessiecookie (ptm_session) om je na het inloggen tot 14 dagen ingelogd te houden. Het cookie is HttpOnly, Secure en SameSite=Lax ingesteld en wordt uitsluitend gebruikt voor de inlogstatus. Omdat dit cookie technisch noodzakelijk is, is conform § 25 lid 2 TTDSG (Duitse telecommunicatie- en telemediagegevensbeschermingswet) geen toestemming vereist.',
    'Zusätzlich speichern wir deine gewählte Sprache in deinem Browser (localStorage), um sie bei deinem nächsten Besuch beizubehalten. Diese Daten verlassen dein Gerät nicht.':
      'Daarnaast slaan we je gekozen taal op in je browser (localStorage), zodat deze bij je volgende bezoek behouden blijft. Deze gegevens verlaten je apparaat niet.',
    'Wir setzen keine Analyse-, Marketing- oder Tracking-Cookies ein.': 'Wij gebruiken geen analyse-, marketing- of trackingcookies.',
    '8. Versand von E-Mails': '8. Verzending van e-mails',
    'Für den Versand von Bestätigungs-, Registrierungs- und Passwort-Zurücksetzen-E-Mails nutzen wir den Dienst Resend (Resend, Inc., USA). Hierbei werden die E-Mail-Adresse sowie der jeweilige E-Mail-Inhalt an Resend übermittelt (Art. 6 Abs. 1 lit. b DSGVO). Auch hier erfolgt die Übermittlung auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.':
      'Voor het verzenden van bevestigings-, registratie- en wachtwoord-resetmails gebruiken we de dienst Resend (Resend, Inc., VS). Hierbij worden het e-mailadres en de betreffende e-mailinhoud aan Resend doorgegeven (art. 6 lid 1 sub b AVG). Ook hier vindt de doorgifte plaats op basis van EU-standaardcontractbepalingen conform art. 46 AVG.',
    '9. Speicherdauer': '9. Bewaartermijn',
    'Bestätigungslinks für die E-Mail-Verifizierung und Turniermeldungen sind 24 Stunden gültig, Links zum Zurücksetzen des Passworts 30 Minuten. Danach werden die zugehörigen Token automatisch gelöscht. Benutzerkonten und Turnieranmeldungen speichern wir, solange dein Konto besteht bzw. das Turnier organisiert wird, oder bis du eine Löschung beantragst.':
      'Bevestigingslinks voor e-mailverificatie en toernooimeldingen zijn 24 uur geldig, links voor het resetten van je wachtwoord 30 minuten. Daarna worden de bijbehorende tokens automatisch verwijderd. Gebruikersaccounts en toernooi-inschrijvingen bewaren we zolang je account bestaat resp. het toernooi wordt georganiseerd, of totdat je verwijdering aanvraagt.',
    '10. Deine Rechte': '10. Jouw rechten',
    'Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO) sowie Widerspruch gegen die Verarbeitung (Art. 21 DSGVO). Eine erteilte Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO).':
      'Je hebt recht op inzage (art. 15 AVG), rectificatie (art. 16 AVG), verwijdering (art. 17 AVG), beperking van de verwerking (art. 18 AVG), gegevensoverdraagbaarheid (art. 20 AVG) en bezwaar tegen de verwerking (art. 21 AVG). Een gegeven toestemming kun je te allen tijde met werking voor de toekomst intrekken (art. 7 lid 3 AVG).',
    'Bitte wende dich hierfür an: michael.massee@gmail.com': 'Neem hiervoor contact op met: michael.massee@gmail.com',
    'Außerdem hast du das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, zum Beispiel beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit.':
      'Daarnaast heb je het recht om een klacht in te dienen bij een toezichthoudende autoriteit voor gegevensbescherming, bijvoorbeeld bij de Hessische functionaris voor gegevensbescherming en informatievrijheid.',
    '11. Stand': '11. Datum',
    'Diese Datenschutzerklärung wurde zuletzt am 26. August 2026 aktualisiert.': 'Dit privacybeleid is voor het laatst bijgewerkt op 26 augustus 2026.',
    'Koordinaten manuell anpassen': 'Coördinaten handmatig aanpassen',
    Breitengrad: 'Breedtegraad',
    Längengrad: 'Lengtegraad',
    'Umkreissuche: Von diesem Ort aus suchen': 'Straal zoeken: vanaf deze plaats zoeken',
    'Ort oder PLZ eingeben': 'Plaats of postcode invoeren',
    Suchen: 'Zoeken',
    'Meinen Standort verwenden': 'Mijn locatie gebruiken',
    Umkreis: 'Straal',
    'Ausgangspunkt:': 'Startpunt:',
    'Umkreissuche beenden': 'Straal zoeken beëindigen',
    'Mein Standort': 'Mijn locatie',
    'km entfernt': 'km verwijderd',
    'Geolocation wird von diesem Browser nicht unterstützt.': 'Geolocatie wordt niet ondersteund door deze browser.',
    'Standort konnte nicht ermittelt werden.': 'Locatie kon niet worden bepaald.',
    'Standort-Zugriff wurde verweigert. Bitte erlaube den Zugriff in den Einstellungen deines Geräts unter Datenschutz > Ortungsdienste.':
      'Locatietoegang is geweigerd. Sta toegang toe in de instellingen van je apparaat onder Privacy > Locatievoorzieningen.',
    'Kein Ort gefunden.': 'Geen plaats gevonden.',
    '5 km': '5 km',
    '10 km': '10 km',
    '25 km': '25 km',
    '50 km': '50 km',
    '100 km': '100 km',
  },
  en: {
    'Eckdaten im Turnierdokument': 'Tournament details in the tournament document',
    'App wird geladen.': 'App is loading.',
    'Ersten Admin anlegen': 'Create first admin',
    'Passwort vergessen': 'Forgot password',
    'Passwort ändern': 'Change password',
    'Neu registrieren': 'Register',
    'Turniersoftware': 'Tournament software',
    'Registrierung gespeichert': 'Registration saved',
    'E-Mail bestätigen': 'Verify email',
    'Turnieranmeldung': 'Tournament registration',
    Anmelden: 'Sign in',
    'Lege den ersten Admin-Benutzer für dieses neue Projekt an.': 'Create the first admin user for this new project.',
    'Fordere einen Link zum Zurücksetzen deines Passworts an.': 'Request a link to reset your password.',
    'Registriere dein Benutzerkonto. Die Freischaltung erfolgt erst nach E-Mail-Bestätigung.': 'Register your user account. Access is enabled only after email verification.',
    'Registriere dein Benutzerkonto. Nach der E-Mail-Bestätigung kannst du dich anmelden.':
      'Register your user account. You can sign in after email verification.',
    'Setze mit deinem Reset-Token ein neues Passwort.': 'Set a new password with your reset token.',
    'Bestätige deine E-Mail-Adresse, um dein Benutzerkonto freizuschalten.': 'Verify your email address to enable your user account.',
    'Melde dich für ein öffentliches Turnier an.': 'Register for a public tournament.',
    'Melde dich mit deinem Benutzerkonto an.': 'Sign in with your user account.',
    Sprache: 'Language',
    Name: 'Name',
    'E-Mail': 'Email',
    Passwort: 'Password',
    Anzeigen: 'Show',
    Verbergen: 'Hide',
    'Passwort anzeigen': 'Show password',
    'Passwort verbergen': 'Hide password',
    'Passwort bestätigen': 'Confirm password',
    'Verein oder kurze Begründung': 'Club or short reason',
    'Admin anlegen': 'Create admin',
    'Passwort vergessen?': 'Forgot password?',
    'Reset-Link anfordern': 'Request reset link',
    Registrieren: 'Register',
    'Zurück zur Anmeldung': 'Back to sign in',
    'Reset-Token': 'Reset token',
    'Bestätigungs-Token': 'Verification token',
    'E-Mail bestätigt': 'Email verified',
    'E-Mail offen': 'Email pending',
    'E-Mail bestätigt setzen': 'Mark email as verified',
    'Passwortänderung beim nächsten Login erzwingen': 'Require password change on next login',
    'Passwortwechsel nötig': 'Password change required',
    'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.': 'Email address verified. You can sign in now.',
    'Mit Google anmelden': 'Sign in with Google',
    'Mit Google angemeldet.': 'Signed in with Google.',
    'Google Anmeldung ist nicht konfiguriert.': 'Google sign-in is not configured.',
    'Google Anmeldung fehlgeschlagen.': 'Google sign-in failed.',
    'Mit Facebook anmelden': 'Sign in with Facebook',
    'Mit Facebook angemeldet.': 'Signed in with Facebook.',
    'Facebook Anmeldung ist nicht konfiguriert.': 'Facebook sign-in is not configured.',
    'Facebook Anmeldung fehlgeschlagen.': 'Facebook sign-in failed.',
    'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.': 'Registration saved. Please verify your email address using the link in the email.',
    'Bitte bestätige zuerst deine E-Mail-Adresse.': 'Please verify your email address first.',
    'Bitte ändere dein Passwort, bevor du fortfährst.': 'Please change your password before continuing.',
    'Bestätigungs-Token ist erforderlich': 'Verification token is required',
    'Bestätigungs-Link ist ungültig oder abgelaufen': 'Verification link is invalid or expired',
    'Bestätigungs-E-Mail nicht erhalten?': "Didn't receive the confirmation email?",
    'Bestätigungslink erneut senden': 'Resend verification link',
    'Bestätigungslink erneut anfordern': 'Request verification link again',
    'Fordere einen neuen Bestätigungslink für dein Benutzerkonto an.': 'Request a new verification link for your account.',
    'Wenn ein unbestätigtes Konto mit dieser E-Mail-Adresse existiert, wurde ein neuer Bestätigungslink gesendet.':
      'If an unverified account exists with this email address, a new verification link has been sent.',
    'Die Passwörter stimmen nicht überein.': 'The passwords do not match.',
    'Mein Profil': 'My profile',
    'Bearbeite deinen Namen, deine E-Mail-Adresse und dein Passwort.': 'Edit your name, email address and password.',
    'Aktuelles Passwort': 'Current password',
    'Nur erforderlich, wenn du deine E-Mail-Adresse oder dein Passwort änderst.':
      'Only required when you change your email address or password.',
    'Deine Daten wurden gespeichert.': 'Your data has been saved.',
    'Deine Daten wurden gespeichert. Bitte bestätige deine neue E-Mail-Adresse über den Link, den wir dir zugeschickt haben.':
      'Your data has been saved. Please confirm your new email address using the link we sent you.',
    'Aktuelles Passwort ist erforderlich oder falsch': 'Current password is required or incorrect',
    'Das Passwort muss mindestens 8 Zeichen lang sein und mindestens eine Zahl, einen Kleinbuchstaben, einen Großbuchstaben und ein Sonderzeichen enthalten':
      'The password must contain at least 8 characters, including one number, one lowercase letter, one uppercase letter and one special character',
    'Mindestens 8 Zeichen, ein Groß- und Kleinbuchstabe, eine Zahl und ein Sonderzeichen.':
      'At least 8 characters, one uppercase and lowercase letter, one number and one special character.',
    'Neues Passwort darf nicht mit dem aktuellen Passwort übereinstimmen':
      'New password must not match the current password',
    'Email already exists': 'Email already exists',
    'Email and password are required': 'Email and password are required',
    'Invalid login': 'Invalid login',
    'Name must contain at least 2 characters': 'Name must contain at least 2 characters',
    'A valid email is required': 'A valid email is required',
    'Password must contain at least 8 characters': 'Password must contain at least 8 characters',
    'E-Mail-Versand ist nicht konfiguriert.': 'Email delivery is not configured.',
    'E-Mail konnte nicht versendet werden.': 'Email could not be sent.',
    'Die Nachricht darf maximal 1000 Zeichen enthalten.': 'The message may contain at most 1000 characters.',
    'Benutzer nicht gefunden.': 'User not found.',
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
    'Konten, Rollen und Freischaltungen zentral bearbeiten.': 'Manage accounts, roles, and approvals in one place.',
    Admins: 'Admins',
    Passwortwechsel: 'Password changes',
    Anfragen: 'Requests',
    'Name oder E-Mail suchen': 'Search name or email',
    'Rolle filtern': 'Filter role',
    'Status filtern': 'Filter status',
    'Alle Rollen': 'All roles',
    'Alle Status': 'All statuses',
    'Filter zurücksetzen': 'Reset filters',
    'Keine Benutzer gefunden.': 'No users found.',
    Abmelden: 'Sign out',
    'Turnier bearbeiten': 'Edit tournament',
    'Turnier anlegen': 'Create tournament',
    Neu: 'New',
    Datum: 'Date',
    Startzeit: 'Start time',
    Ort: 'Location',
    Turniersystem: 'Tournament system',
    Formation: 'Formation',
    Anmeldetyp: 'Registration type',
    Mêlée: 'Mêlée',
    Formé: 'Formé',
    'Dieses Turnier wird als Mêlée gespielt – Partner werden vor Ort ausgelost.':
      'This tournament is played as mêlée – partners will be drawn on site.',
    Status: 'Status',
    VIP: 'VIP',
    Sichtbarkeit: 'Visibility',
    'Max. Meldungen': 'Max. registrations',
    'Noch frei': 'Spots free',
    'Startgeld EUR': 'Entry fee EUR',
    Meldefrist: 'Registration deadline',
    Kontaktname: 'Contact name',
    'Kontakt-E-Mail': 'Contact email',
    'Kontakt-Telefon': 'Contact phone',
    Beschreibung: 'Description',
    'Interne Notizen': 'Internal notes',
    'Turnier speichern': 'Save tournament',
    'Lizenznummer erforderlich': 'License number required',
    'Teamname abfragen': 'Ask for team name',
    'Supermêlée ist nur mit der Formation Tête möglich': 'Supermêlée is only possible with the Tête formation',
    'Lizenznummer ist erforderlich': 'License number is required',
    'Lizenznummer für Partner ist erforderlich': 'License number for partner is required',
    'Lizenznummer für Partner 2 ist erforderlich': 'License number for partner 2 is required',
    Bearbeiten: 'Edit',
    Löschen: 'Delete',
    'Anmeldung bearbeiten': 'Edit registration',
    'Anmeldung erfassen': 'Add registration',
    Turnier: 'Tournament',
    Vorname: 'First name',
    Nachname: 'Last name',
    Verein: 'Club',
    Lizenznummer: 'License number',
    Lizenz: 'License',
    Ja: 'Yes',
    Nein: 'No',
    'Turnier teilen': 'Share tournament',
    'Link kopiert': 'Link copied',
    'Teilen wird von diesem Gerät nicht unterstützt': 'Sharing is not supported on this device',
    Teamname: 'Team name',
    'Partner Vorname': 'Partner first name',
    'Partner Nachname': 'Partner last name',
    'Partner E-Mail': 'Partner email',
    'Partner Lizenznummer': 'Partner license number',
    'Partner 2 Vorname': 'Partner 2 first name',
    'Partner 2 Nachname': 'Partner 2 last name',
    'Partner 2 E-Mail': 'Partner 2 email',
    'Partner 2 Lizenznummer': 'Partner 2 license number',
    Setzposition: 'Seeding position',
    'Anmeldung speichern': 'Save registration',
    'Benutzer bearbeiten': 'Edit user',
    'Benutzer anlegen': 'Create user',
    Rolle: 'Role',
    Speichern: 'Save',
    Anlegen: 'Create',
    Admin: 'Admin',
    User: 'User',
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
    'Teilnehmerliste öffentlich sichtbar. Ich bestätige, dass ich als Turnierersteller für diese Veröffentlichung verantwortlich bin und die Teilnehmer ausdrücklich darauf hinweisen muss.':
      'Participant list publicly visible. I confirm that, as the tournament creator, I am responsible for this publication and must expressly inform the participants about it.',
    'Nur meine Turniere': 'Only my tournaments',
    'Turnier suchen': 'Search tournament',
    'Name, Ort oder Turniersystem': 'Name, location or tournament system',
    'Suche öffnen': 'Open search',
    'Suche schließen': 'Close search',
    'Filter ausblenden': 'Hide filter',
    'Filter anzeigen': 'Show filter',
    'Finde dein nächstes Pétanque-Turnier': 'Find your next pétanque tournament',
    'Suche nach Ort, Verein oder Turniersystem und melde dich direkt online an.':
      'Search by location, club or tournament system and register online.',
    'Gefundene Turniere': 'Found tournaments',
    keiner: 'none',
    'Nächster Termin': 'Next date',
    'Filter aktiv': 'Filter active',
    'Keine Filter aktiv': 'No filter active',
    Finder: 'Finder',
    'Umkreissuche aus': 'Radius search off',
    'Alle passenden Turniere': 'All matching tournaments',
    'Keine Turniere gefunden.': 'No tournaments found.',
    Ganztägig: 'All day',
    'Weitere Turniere laden': 'Load more tournaments',
    Monat: 'Month',
    'Alle Monate': 'All months',
    'Alle Formationen': 'All formations',
    'Anmeldung möglich': 'Registration possible',
    Zurücksetzen: 'Reset',
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
    'Spielort in Google Maps öffnen': 'Open venue in Google Maps',
    Präsentation: 'Presentation',
    'Website öffnen': 'Open website',
    Website: 'Website',
    'Logo-Bildlink': 'Logo image link',
    'Flyer-Bildlink': 'Flyer image link',
    'Präsentation speichern': 'Save presentation',
    'Präsentation wurde gespeichert.': 'Presentation was saved.',
    'Website, Logo und Flyer sind unabhängig von den Turnier-Eckdaten und können auch bei dokument-verwalteten Turnieren jederzeit hier gepflegt werden. Logo und Flyer werden als Link zu einem bereits online gehosteten Bild eingebunden, nicht hochgeladen.':
      'Website, logo and flyer are independent of the tournament core data and can always be managed here, even for document-managed tournaments. Logo and flyer are embedded as a link to an already hosted image, not uploaded.',
    'Eine gültige URL (http:// oder https://) ist erforderlich': 'A valid URL (http:// or https://) is required',
    'Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.': 'The participant list is not public for this tournament.',
    'Teilnehmerliste wird geladen…': 'Loading participant list…',
    'Noch keine Anmeldungen.': 'No registrations yet.',
    'Invalid formation': 'Invalid formation',
    'Formation tete allows only a single participant, no partner': 'Formation tete allows only a single participant, no partner',
    'Formation doublette requires exactly one partner': 'Formation doublette requires exactly one partner',
    'Formation doublette allows only one partner': 'Formation doublette allows only one partner',
    'Formation triplette requires exactly two partners': 'Formation triplette requires exactly two partners',
    'A valid tournament date is required': 'A valid tournament date is required',
    'Tournament name must contain at least 2 characters': 'Tournament name must contain at least 2 characters',
    'API-Zugänge': 'API access',
    'Externe Turnierleitungs-Software (z.B. das PTM-Hauptprogramm auf deinem Rechner) braucht einen freigeschalteten API-Schlüssel, um Turniere anzulegen und Anmeldungen abzugleichen. Ein Administrator muss jede Installation einzeln genehmigen.':
      'External tournament-management software (e.g. the PTM main program on your computer) needs an approved API key to create tournaments and sync registrations. An administrator must approve each installation individually.',
    'Bezeichnung der Installation, z.B. Bürorechner': 'Name of the installation, e.g. office computer',
    'Schlüssel beantragen': 'Request key',
    'Speichere diesen Schlüssel jetzt sicher ab. Er wird nicht erneut angezeigt.':
      'Save this key securely now. It will not be shown again.',
    Bezeichnung: 'Label',
    'Beantragt am': 'Requested on',
    'Zuletzt genutzt': 'Last used',
    'Schlüssel abholen': 'Retrieve key',
    Widerrufen: 'Revoke',
    'Noch keine API-Schlüssel beantragt.': 'No API keys requested yet.',
    'Offene Freischaltungsanfragen': 'Pending approval requests',
    Genehmigen: 'Approve',
    'Keine offenen Anfragen.': 'No pending requests.',
    'API-Schlüssel wirklich widerrufen?': 'Really revoke this API key?',
    Ausstehend: 'Pending',
    Freigeschaltet: 'Approved',
    Impressum: 'Legal Notice',
    Datenschutz: 'Privacy',
    'Diese Teilnehmerliste ist öffentlich sichtbar und ohne Anmeldung einsehbar. Wer hier nicht aufgeführt werden möchte, wende sich bitte direkt an den Veranstalter dieses Turniers.':
      'This participant list is publicly visible and can be viewed without logging in. If you do not want to be listed here, please contact the organizer of this tournament directly.',
    'Ich habe verstanden, dass meine Anmeldedaten zur Turnierorganisation verarbeitet werden und mein Name sowie ggf. Verein, Teamname und Partnernamen auf der öffentlichen Turnierseite erscheinen können, wenn der Veranstalter die Teilnehmerliste öffentlich sichtbar schaltet.':
      'I understand that my registration data will be processed for tournament organization and that my name and, where applicable, club, team name and partner names may appear on the public tournament page if the organizer makes the participant list publicly visible.',
    'Der Hinweis zur möglichen Veröffentlichung der Anmeldedaten muss bestätigt werden':
      'The notice about possible publication of registration data must be confirmed',
    'Datenschutzerklärung lesen': 'Read privacy policy',
    'Mit der Registrierung stimmst du der Verarbeitung deiner Daten gemäß unserer Datenschutzerklärung zu.':
      'By registering, you agree to the processing of your data in accordance with our privacy policy.',
    'Angaben gemäß § 5 DDG': 'Information according to § 5 DDG (German Digital Services Act)',
    Deutschland: 'Germany',
    'E-Mail: michael.massee@gmail.com': 'Email: michael.massee@gmail.com',
    'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV': 'Responsible for content according to § 18 (2) MStV (German Interstate Media Treaty)',
    'Michael Massee (Anschrift wie oben)': 'Michael Massee (address as above)',
    'Haftung für Inhalte': 'Liability for content',
    'Turnierdaten, Anmeldungen und Turniermeldungen auf dieser Plattform werden von den jeweiligen Turnierleitern bzw. Nutzern eigenverantwortlich erstellt und gepflegt. Für die Richtigkeit, Vollständigkeit und Aktualität dieser Inhalte sind allein die jeweiligen Turnierleiter bzw. Einsender verantwortlich, nicht der Betreiber dieser Plattform.':
      'Tournament data, registrations and tournament submissions on this platform are created and maintained independently by the respective tournament organizers or users. The respective tournament organizers or submitters, not the operator of this platform, are solely responsible for the accuracy, completeness and timeliness of this content.',
    'Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Bei Bekanntwerden entsprechender Rechtsverletzungen werden wir die betroffenen Inhalte umgehend entfernen.':
      'As a service provider, we are responsible for our own content on these pages under general law pursuant to § 7 (1) DDG. However, pursuant to §§ 8 to 10 DDG, we are not obligated to monitor transmitted or stored third-party information or to investigate circumstances that indicate unlawful activity. Upon becoming aware of any such infringements, we will remove the affected content immediately.',
    'Haftung für Links': 'Liability for links',
    'Turniermeldungen können Links zu externen Websites Dritter enthalten, etwa zu Anmeldeseiten der jeweiligen Veranstalter, auf deren Inhalte wir keinen Einfluss haben. Für diese fremden Inhalte können wir daher keine Gewähr übernehmen; für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.':
      'Tournament submissions may contain links to external third-party websites, such as registration pages of the respective organizers, over whose content we have no influence. We therefore cannot accept any liability for this third-party content; the respective provider or operator of the linked pages is always responsible for their content. Permanent monitoring of the content of linked pages is not reasonable without concrete evidence of an infringement. Upon becoming aware of any infringements, we will remove such links immediately.',
    Hinweis: 'Notice',
    'Dieses Angebot wird als nicht-kommerzielles Privatprojekt betrieben. Es werden keine Waren oder Dienstleistungen gegen Entgelt über diese Website angeboten oder abgewickelt.':
      'This offering is operated as a non-commercial private project. No goods or services are offered or processed for payment via this website.',
    Streitschlichtung: 'Dispute resolution',
    'Als Privatperson bieten wir kein kommerzielles Angebot an und nehmen daher nicht an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil.':
      'As a private individual, we do not offer any commercial services and therefore do not participate in dispute resolution proceedings before a consumer arbitration board.',
    Datenschutzerklärung: 'Privacy Policy',
    '1. Verantwortlicher': '1. Controller',
    'Verantwortlich für die Datenverarbeitung auf dieser Website ist:': 'The controller responsible for data processing on this website is:',
    'Michael Massee, An der Ziegelei 21, 35440 Linden, E-Mail: michael.massee@gmail.com':
      'Michael Massee, An der Ziegelei 21, 35440 Linden, Germany, email: michael.massee@gmail.com',
    '2. Allgemeines zur Datenverarbeitung': '2. General information on data processing',
    'Wir verarbeiten personenbezogene Daten unserer Nutzer grundsätzlich nur, soweit dies zur Bereitstellung einer funktionsfähigen Website sowie unserer Inhalte und Leistungen erforderlich ist.':
      "We generally only process our users' personal data to the extent necessary to provide a functional website and our content and services.",
    'Rechtsgrundlage ist, je nach Verarbeitungsvorgang, die Erfüllung eines Vertrags bzw. vorvertraglicher Maßnahmen (Art. 6 Abs. 1 lit. b DSGVO), eine erteilte Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) oder unser berechtigtes Interesse an einem sicheren und funktionsfähigen Betrieb der Website (Art. 6 Abs. 1 lit. f DSGVO).':
      'Depending on the processing operation, the legal basis is the performance of a contract or pre-contractual measures (Art. 6(1)(b) GDPR), consent given (Art. 6(1)(a) GDPR), or our legitimate interest in the secure and functional operation of the website (Art. 6(1)(f) GDPR).',
    '3. Bereitstellung der Website und Hosting': '3. Provision of the website and hosting',
    'Diese Website wird über Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA) als Hosting- und Content-Delivery-Anbieter bereitgestellt. Cloudflare verarbeitet dabei technisch notwendige Daten wie IP-Adresse, Datum und Uhrzeit der Anfrage sowie Browser-Informationen (Server-Logfiles), um die Website sicher und zuverlässig auszuliefern (Art. 6 Abs. 1 lit. f DSGVO).':
      'This website is provided via Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA) as our hosting and content delivery provider. Cloudflare processes technically necessary data such as IP address, date and time of the request, and browser information (server log files) in order to deliver the website securely and reliably (Art. 6(1)(f) GDPR).',
    'Da Cloudflare auch Server außerhalb der EU nutzen kann, erfolgt die Datenübermittlung auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.':
      'Since Cloudflare may also use servers outside the EU, data transfer takes place on the basis of EU Standard Contractual Clauses pursuant to Art. 46 GDPR.',
    '4. Registrierung und Benutzerkonto': '4. Registration and user account',
    'Wenn du dich registrierst, erheben wir Name, E-Mail-Adresse und ein sicher gehashtes Passwort. Diese Daten werden zur Bereitstellung deines Benutzerkontos und zur Verwaltung deiner Turniere verarbeitet (Art. 6 Abs. 1 lit. b DSGVO). Nach der Registrierung senden wir dir zur Bestätigung deiner E-Mail-Adresse eine E-Mail mit einem 24 Stunden gültigen Bestätigungslink.':
      'If you register as a tournament organizer or administrator, we collect your name, email address and a securely hashed password. This data is processed to provide your user account and to manage your tournaments (Art. 6(1)(b) GDPR). After registration, we send you an email with a confirmation link valid for 24 hours to verify your email address.',
    'Wenn du die Google Anmeldung nutzt, erhalten wir von Google deine verifizierte E-Mail-Adresse, deinen Namen und eine technische Google-Konto-ID. Wir verwenden diese Daten nur, um dein Benutzerkonto anzulegen, dich anzumelden und dein Google-Konto deinem Benutzerkonto zuzuordnen.':
      'If you use Google sign-in, we receive your verified email address, your name and a technical Google account ID from Google. We use this data only to create your user account, sign you in and link your Google account to your user account.',
    'Wenn du die Facebook Anmeldung nutzt, erhalten wir von Facebook deine E-Mail-Adresse, deinen Namen und eine technische Facebook-Konto-ID. Wir verwenden diese Daten nur, um dein Benutzerkonto anzulegen, dich anzumelden und dein Facebook-Konto deinem Benutzerkonto zuzuordnen.':
      'If you use Facebook sign-in, we receive your email address, your name and a technical Facebook account ID from Facebook. We use this data only to create your user account, sign you in and link your Facebook account to your user account.',
    '5. Turnieranmeldungen und öffentliche Teilnehmerlisten': '5. Tournament registrations and public participant lists',
    'Wenn du dich über diese Website für ein Turnier anmeldest, verarbeiten wir Vorname, Nachname, E-Mail-Adresse sowie je nach Turnier optional oder verpflichtend Verein, Lizenznummer und Angaben zu deinem Partner bzw. deinen Partnern (Doublette/Triplette). Diese Daten werden an den jeweiligen Turnierleiter zur Organisation des Turniers weitergegeben (Art. 6 Abs. 1 lit. b DSGVO).':
      'If you register for a tournament via this website, we process your first name, last name, email address, and depending on the tournament optionally or mandatorily club, license number, and details about your partner(s) (doublette/triplette). This data is passed on to the respective tournament organizer for the purpose of organizing the tournament (Art. 6(1)(b) GDPR).',
    'Turnierleiter können die Teilnehmerliste eines Turniers öffentlich sichtbar schalten. In diesem Fall werden Vorname, Nachname, Verein und die Namen deiner Partner für jeden Besucher der Turnierseite sichtbar, ohne dass eine Anmeldung erforderlich ist. Wenn du das nicht möchtest, wende dich bitte direkt an den Veranstalter (Turnierleiter) des jeweiligen Turniers, dessen Kontaktdaten auf der Turnierseite angegeben sind.':
      "Tournament organizers can make a tournament's participant list publicly visible. In this case, the first name, last name, club and the names of your partner(s) are visible to every visitor of the tournament page, without requiring login. If you do not want this, please contact the organizer (tournament director) of the respective tournament directly; their contact details are provided on the tournament page.",
    '6. Turniermeldungen': '6. Tournament submissions',
    'Wenn du ein fremdes Turnier zur Veröffentlichung vorschlägst, verarbeiten wir deinen Namen und deine E-Mail-Adresse zur Rückfrage und Bestätigung sowie zur Moderation durch unsere Administratoren (Art. 6 Abs. 1 lit. a, lit. f DSGVO).':
      'If you submit a third-party tournament for publication, we process your name and email address to follow up and confirm the submission, as well as for moderation by our administrators (Art. 6(1)(a), (f) GDPR).',
    '7. Cookies und lokaler Speicher': '7. Cookies and local storage',
    'Diese Website verwendet ein technisch notwendiges Session-Cookie (ptm_session), um dich nach der Anmeldung für bis zu 14 Tage eingeloggt zu halten. Das Cookie ist HttpOnly, Secure und SameSite=Lax gesetzt und wird ausschließlich für den Login-Status verwendet. Da dieses Cookie technisch notwendig ist, ist gemäß § 25 Abs. 2 TTDSG keine Einwilligung erforderlich.':
      'This website uses a technically necessary session cookie (ptm_session) to keep you logged in for up to 14 days after login. The cookie is set as HttpOnly, Secure and SameSite=Lax and is used exclusively for the login status. As this cookie is technically necessary, no consent is required pursuant to § 25(2) TTDSG (German Telecommunications and Telemedia Data Protection Act).',
    'Zusätzlich speichern wir deine gewählte Sprache in deinem Browser (localStorage), um sie bei deinem nächsten Besuch beizubehalten. Diese Daten verlassen dein Gerät nicht.':
      'In addition, we store your selected language in your browser (localStorage) so it is retained on your next visit. This data does not leave your device.',
    'Wir setzen keine Analyse-, Marketing- oder Tracking-Cookies ein.': 'We do not use any analytics, marketing or tracking cookies.',
    '8. Versand von E-Mails': '8. Sending emails',
    'Für den Versand von Bestätigungs-, Registrierungs- und Passwort-Zurücksetzen-E-Mails nutzen wir den Dienst Resend (Resend, Inc., USA). Hierbei werden die E-Mail-Adresse sowie der jeweilige E-Mail-Inhalt an Resend übermittelt (Art. 6 Abs. 1 lit. b DSGVO). Auch hier erfolgt die Übermittlung auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.':
      'We use the service Resend (Resend, Inc., USA) to send confirmation, registration and password-reset emails. In doing so, the email address and the respective email content are transmitted to Resend (Art. 6(1)(b) GDPR). Here too, transmission takes place on the basis of EU Standard Contractual Clauses pursuant to Art. 46 GDPR.',
    '9. Speicherdauer': '9. Storage period',
    'Bestätigungslinks für die E-Mail-Verifizierung und Turniermeldungen sind 24 Stunden gültig, Links zum Zurücksetzen des Passworts 30 Minuten. Danach werden die zugehörigen Token automatisch gelöscht. Benutzerkonten und Turnieranmeldungen speichern wir, solange dein Konto besteht bzw. das Turnier organisiert wird, oder bis du eine Löschung beantragst.':
      'Confirmation links for email verification and tournament submissions are valid for 24 hours, password reset links for 30 minutes. After that, the associated tokens are automatically deleted. We store user accounts and tournament registrations for as long as your account exists or the tournament is being organized, or until you request deletion.',
    '10. Deine Rechte': '10. Your rights',
    'Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO) sowie Widerspruch gegen die Verarbeitung (Art. 21 DSGVO). Eine erteilte Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO).':
      'You have the right to access (Art. 15 GDPR), rectification (Art. 16 GDPR), erasure (Art. 17 GDPR), restriction of processing (Art. 18 GDPR), data portability (Art. 20 GDPR), and objection to processing (Art. 21 GDPR). You can withdraw any consent given at any time with effect for the future (Art. 7(3) GDPR).',
    'Bitte wende dich hierfür an: michael.massee@gmail.com': 'Please contact us at: michael.massee@gmail.com',
    'Außerdem hast du das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, zum Beispiel beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit.':
      'You also have the right to lodge a complaint with a data protection supervisory authority, for example the Hessian Commissioner for Data Protection and Freedom of Information.',
    '11. Stand': '11. Last updated',
    'Diese Datenschutzerklärung wurde zuletzt am 26. August 2026 aktualisiert.': 'This privacy policy was last updated on 26 August 2026.',
    'Koordinaten manuell anpassen': 'Adjust coordinates manually',
    Breitengrad: 'Latitude',
    Längengrad: 'Longitude',
    'Umkreissuche: Von diesem Ort aus suchen': 'Radius search: search from this place',
    'Ort oder PLZ eingeben': 'Enter a place or postal code',
    Suchen: 'Search',
    'Meinen Standort verwenden': 'Use my location',
    Umkreis: 'Radius',
    'Ausgangspunkt:': 'Starting point:',
    'Umkreissuche beenden': 'Stop radius search',
    'Mein Standort': 'My location',
    'km entfernt': 'km away',
    'Geolocation wird von diesem Browser nicht unterstützt.': 'Geolocation is not supported by this browser.',
    'Standort konnte nicht ermittelt werden.': 'Could not determine your location.',
    'Standort-Zugriff wurde verweigert. Bitte erlaube den Zugriff in den Einstellungen deines Geräts unter Datenschutz > Ortungsdienste.':
      'Location access was denied. Please allow access in your device settings under Privacy > Location Services.',
    'Kein Ort gefunden.': 'No place found.',
    '5 km': '5 km',
    '10 km': '10 km',
    '25 km': '25 km',
    '50 km': '50 km',
    '100 km': '100 km',
  },
  es: {
    'Eckdaten im Turnierdokument': 'Datos del torneo en el documento del torneo',
    'App wird geladen.': 'La app se está cargando.',
    'Ersten Admin anlegen': 'Crear primer admin',
    'Passwort vergessen': 'Contraseña olvidada',
    'Passwort ändern': 'Cambiar contraseña',
    'Neu registrieren': 'Registrarse',
    'Turniersoftware': 'Software de torneos',
    'Registrierung gespeichert': 'Registro guardado',
    'E-Mail bestätigen': 'Confirmar correo',
    'Turnieranmeldung': 'Inscripción al torneo',
    Anmelden: 'Iniciar sesión',
    'Lege den ersten Admin-Benutzer für dieses neue Projekt an.': 'Crea el primer usuario administrador para este nuevo proyecto.',
    'Fordere einen Link zum Zurücksetzen deines Passworts an.': 'Solicita un enlace para restablecer tu contraseña.',
    'Registriere dein Benutzerkonto. Die Freischaltung erfolgt erst nach E-Mail-Bestätigung.': 'Registra tu cuenta. El acceso se activa solo después de confirmar el correo.',
    'Registriere dein Benutzerkonto. Nach der E-Mail-Bestätigung kannst du dich anmelden.':
      'Registra tu cuenta. Puedes iniciar sesión después de confirmar el correo.',
    'Setze mit deinem Reset-Token ein neues Passwort.': 'Define una nueva contraseña con tu token.',
    'Bestätige deine E-Mail-Adresse, um dein Benutzerkonto freizuschalten.': 'Confirma tu correo para activar tu cuenta.',
    'Melde dich für ein öffentliches Turnier an.': 'Inscríbete en un torneo público.',
    'Melde dich mit deinem Benutzerkonto an.': 'Inicia sesión con tu cuenta.',
    Sprache: 'Idioma',
    Name: 'Nombre',
    'E-Mail': 'Correo',
    Passwort: 'Contraseña',
    Anzeigen: 'Mostrar',
    Verbergen: 'Ocultar',
    'Passwort anzeigen': 'Mostrar contraseña',
    'Passwort verbergen': 'Ocultar contraseña',
    'Passwort bestätigen': 'Confirmar contraseña',
    'Verein oder kurze Begründung': 'Club o breve motivo',
    'Admin anlegen': 'Crear admin',
    'Passwort vergessen?': '¿Contraseña olvidada?',
    'Reset-Link anfordern': 'Solicitar enlace',
    Registrieren: 'Registrarse',
    'Zurück zur Anmeldung': 'Volver al inicio',
    'Reset-Token': 'Token',
    'Bestätigungs-Token': 'Token de confirmación',
    'E-Mail bestätigt': 'Correo confirmado',
    'E-Mail offen': 'Correo pendiente',
    'E-Mail bestätigt setzen': 'Marcar correo como confirmado',
    'Passwortänderung beim nächsten Login erzwingen': 'Exigir cambio de contraseña en el próximo inicio',
    'Passwortwechsel nötig': 'Cambio de contraseña necesario',
    'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.': 'Correo confirmado. Ya puedes iniciar sesión.',
    'Mit Google anmelden': 'Iniciar sesión con Google',
    'Mit Google angemeldet.': 'Sesión iniciada con Google.',
    'Google Anmeldung ist nicht konfiguriert.': 'El inicio de sesión con Google no está configurado.',
    'Google Anmeldung fehlgeschlagen.': 'Error al iniciar sesión con Google.',
    'Mit Facebook anmelden': 'Iniciar sesión con Facebook',
    'Mit Facebook angemeldet.': 'Sesión iniciada con Facebook.',
    'Facebook Anmeldung ist nicht konfiguriert.': 'El inicio de sesión con Facebook no está configurado.',
    'Facebook Anmeldung fehlgeschlagen.': 'Error al iniciar sesión con Facebook.',
    'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.': 'Registro guardado. Confirma tu correo con el enlace del email.',
    'Bitte bestätige zuerst deine E-Mail-Adresse.': 'Confirma primero tu correo.',
    'Bitte ändere dein Passwort, bevor du fortfährst.': 'Cambia tu contraseña antes de continuar.',
    'Bestätigungs-Token ist erforderlich': 'El token de confirmación es obligatorio',
    'Bestätigungs-Link ist ungültig oder abgelaufen': 'El enlace de confirmación no es válido o ha caducado',
    'Bestätigungs-E-Mail nicht erhalten?': '¿No recibiste el correo de confirmación?',
    'Bestätigungslink erneut senden': 'Reenviar enlace de confirmación',
    'Bestätigungslink erneut anfordern': 'Solicitar de nuevo el enlace de confirmación',
    'Fordere einen neuen Bestätigungslink für dein Benutzerkonto an.': 'Solicita un nuevo enlace de confirmación para tu cuenta.',
    'Wenn ein unbestätigtes Konto mit dieser E-Mail-Adresse existiert, wurde ein neuer Bestätigungslink gesendet.':
      'Si existe una cuenta no confirmada con esta dirección de correo, se ha enviado un nuevo enlace de confirmación.',
    'Die Passwörter stimmen nicht überein.': 'Las contraseñas no coinciden.',
    'Mein Profil': 'Mi perfil',
    'Bearbeite deinen Namen, deine E-Mail-Adresse und dein Passwort.': 'Edita tu nombre, tu correo electrónico y tu contraseña.',
    'Aktuelles Passwort': 'Contraseña actual',
    'Nur erforderlich, wenn du deine E-Mail-Adresse oder dein Passwort änderst.':
      'Solo es necesario si cambias tu correo electrónico o tu contraseña.',
    'Deine Daten wurden gespeichert.': 'Tus datos han sido guardados.',
    'Deine Daten wurden gespeichert. Bitte bestätige deine neue E-Mail-Adresse über den Link, den wir dir zugeschickt haben.':
      'Tus datos han sido guardados. Confirma tu nueva dirección de correo con el enlace que te hemos enviado.',
    'Aktuelles Passwort ist erforderlich oder falsch': 'La contraseña actual es obligatoria o incorrecta',
    'Das Passwort muss mindestens 8 Zeichen lang sein und mindestens eine Zahl, einen Kleinbuchstaben, einen Großbuchstaben und ein Sonderzeichen enthalten':
      'La contraseña debe tener al menos 8 caracteres e incluir al menos un número, una minúscula, una mayúscula y un carácter especial',
    'Mindestens 8 Zeichen, ein Groß- und Kleinbuchstabe, eine Zahl und ein Sonderzeichen.':
      'Al menos 8 caracteres, una mayúscula y una minúscula, un número y un carácter especial.',
    'Neues Passwort darf nicht mit dem aktuellen Passwort übereinstimmen':
      'La nueva contraseña no puede coincidir con la contraseña actual',
    'Email already exists': 'El correo ya existe',
    'Email and password are required': 'Correo y contraseña son obligatorios',
    'Invalid login': 'Inicio de sesión no válido',
    'Name must contain at least 2 characters': 'El nombre debe tener al menos 2 caracteres',
    'A valid email is required': 'Se requiere un correo válido',
    'Password must contain at least 8 characters': 'La contraseña debe tener al menos 8 caracteres',
    'E-Mail-Versand ist nicht konfiguriert.': 'El envío de correos no está configurado.',
    'E-Mail konnte nicht versendet werden.': 'No se pudo enviar el correo.',
    'Die Nachricht darf maximal 1000 Zeichen enthalten.': 'El mensaje puede tener como máximo 1000 caracteres.',
    'Benutzer nicht gefunden.': 'Usuario no encontrado.',
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
    'Konten, Rollen und Freischaltungen zentral bearbeiten.': 'Gestiona cuentas, roles y aprobaciones en un solo lugar.',
    Admins: 'Admins',
    Passwortwechsel: 'Cambios de contraseña',
    Anfragen: 'Solicitudes',
    'Name oder E-Mail suchen': 'Buscar nombre o correo',
    'Rolle filtern': 'Filtrar rol',
    'Status filtern': 'Filtrar estado',
    'Alle Rollen': 'Todos los roles',
    'Alle Status': 'Todos los estados',
    'Filter zurücksetzen': 'Restablecer filtros',
    'Keine Benutzer gefunden.': 'No se encontraron usuarios.',
    Abmelden: 'Cerrar sesión',
    'Turnier bearbeiten': 'Editar torneo',
    'Turnier anlegen': 'Crear torneo',
    Neu: 'Nuevo',
    Datum: 'Fecha',
    Startzeit: 'Hora',
    Ort: 'Lugar',
    Turniersystem: 'Sistema',
    Formation: 'Formación',
    Anmeldetyp: 'Tipo de inscripción',
    Mêlée: 'Mêlée',
    Formé: 'Formé',
    'Dieses Turnier wird als Mêlée gespielt – Partner werden vor Ort ausgelost.':
      'Este torneo se juega como mêlée – los compañeros se sortean in situ.',
    Status: 'Estado',
    VIP: 'VIP',
    Sichtbarkeit: 'Visibilidad',
    'Max. Meldungen': 'Máx. inscripciones',
    'Noch frei': 'Plazas libres',
    'Startgeld EUR': 'Cuota EUR',
    Meldefrist: 'Fecha límite',
    Kontaktname: 'Contacto',
    'Kontakt-E-Mail': 'Correo de contacto',
    'Kontakt-Telefon': 'Teléfono',
    Beschreibung: 'Descripción',
    'Interne Notizen': 'Notas internas',
    'Turnier speichern': 'Guardar torneo',
    'Lizenznummer erforderlich': 'Licencia obligatoria',
    'Teamname abfragen': 'Solicitar nombre de equipo',
    'Supermêlée ist nur mit der Formation Tête möglich': 'Supermêlée solo es posible con la formación Tête',
    'Lizenznummer ist erforderlich': 'La licencia es obligatoria',
    'Lizenznummer für Partner ist erforderlich': 'La licencia de la pareja es obligatoria',
    'Lizenznummer für Partner 2 ist erforderlich': 'La licencia de la pareja 2 es obligatoria',
    Bearbeiten: 'Editar',
    Löschen: 'Eliminar',
    'Anmeldung bearbeiten': 'Editar inscripción',
    'Anmeldung erfassen': 'Añadir inscripción',
    Turnier: 'Torneo',
    Vorname: 'Nombre',
    Nachname: 'Apellido',
    Verein: 'Club',
    Lizenznummer: 'Licencia',
    Lizenz: 'Licencia',
    Ja: 'Sí',
    Nein: 'No',
    'Turnier teilen': 'Compartir torneo',
    'Link kopiert': 'Enlace copiado',
    'Teilen wird von diesem Gerät nicht unterstützt': 'Este dispositivo no admite compartir',
    Teamname: 'Equipo',
    'Partner Vorname': 'Nombre pareja',
    'Partner Nachname': 'Apellido pareja',
    'Partner E-Mail': 'Correo pareja',
    'Partner Lizenznummer': 'Licencia pareja',
    'Partner 2 Vorname': 'Nombre pareja 2',
    'Partner 2 Nachname': 'Apellido pareja 2',
    'Partner 2 E-Mail': 'Correo pareja 2',
    'Partner 2 Lizenznummer': 'Licencia pareja 2',
    Setzposition: 'Cabeza de serie',
    'Anmeldung speichern': 'Guardar inscripción',
    'Benutzer bearbeiten': 'Editar usuario',
    'Benutzer anlegen': 'Crear usuario',
    Rolle: 'Rol',
    Speichern: 'Guardar',
    Anlegen: 'Crear',
    Admin: 'Admin',
    User: 'Usuario',
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
    'Teilnehmerliste öffentlich sichtbar. Ich bestätige, dass ich als Turnierersteller für diese Veröffentlichung verantwortlich bin und die Teilnehmer ausdrücklich darauf hinweisen muss.':
      'Lista de participantes visible públicamente. Confirmo que, como creador del torneo, soy responsable de esta publicación y debo informar expresamente de ello a los participantes.',
    'Nur meine Turniere': 'Solo mis torneos',
    'Turnier suchen': 'Buscar torneo',
    'Name, Ort oder Turniersystem': 'Nombre, lugar o sistema',
    'Suche öffnen': 'Abrir búsqueda',
    'Suche schließen': 'Cerrar búsqueda',
    'Filter ausblenden': 'Ocultar filtro',
    'Filter anzeigen': 'Mostrar filtro',
    'Finde dein nächstes Pétanque-Turnier': 'Encuentra tu próximo torneo de petanca',
    'Suche nach Ort, Verein oder Turniersystem und melde dich direkt online an.':
      'Busca por lugar, club o sistema de torneo e inscríbete online.',
    'Gefundene Turniere': 'Torneos encontrados',
    keiner: 'ninguno',
    'Nächster Termin': 'Próxima fecha',
    'Filter aktiv': 'Filtro activo',
    'Keine Filter aktiv': 'Sin filtro activo',
    Finder: 'Buscador',
    'Umkreissuche aus': 'Búsqueda por radio desactivada',
    'Alle passenden Turniere': 'Todos los torneos coincidentes',
    'Keine Turniere gefunden.': 'No se encontraron torneos.',
    Ganztägig: 'Todo el día',
    'Weitere Turniere laden': 'Cargar más torneos',
    Monat: 'Mes',
    'Alle Monate': 'Todos los meses',
    'Alle Formationen': 'Todas las formaciones',
    'Anmeldung möglich': 'Inscripción posible',
    Zurücksetzen: 'Restablecer',
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
    'Spielort in Google Maps öffnen': 'Abrir sede en Google Maps',
    Präsentation: 'Presentación',
    'Website öffnen': 'Abrir sitio web',
    Website: 'Sitio web',
    'Logo-Bildlink': 'Enlace de imagen del logo',
    'Flyer-Bildlink': 'Enlace de imagen del flyer',
    'Präsentation speichern': 'Guardar presentación',
    'Präsentation wurde gespeichert.': 'La presentación se ha guardado.',
    'Website, Logo und Flyer sind unabhängig von den Turnier-Eckdaten und können auch bei dokument-verwalteten Turnieren jederzeit hier gepflegt werden. Logo und Flyer werden als Link zu einem bereits online gehosteten Bild eingebunden, nicht hochgeladen.':
      'El sitio web, el logo y el flyer son independientes de los datos básicos del torneo y siempre se pueden gestionar aquí, incluso en torneos gestionados por documento. El logo y el flyer se insertan como enlace a una imagen ya alojada en línea, no se suben.',
    'Eine gültige URL (http:// oder https://) ist erforderlich': 'Se requiere una URL válida (http:// o https://)',
    'Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.': 'La lista de participantes no es pública para este torneo.',
    'Teilnehmerliste wird geladen…': 'Cargando lista de participantes…',
    'Noch keine Anmeldungen.': 'Aún no hay inscripciones.',
    'Invalid formation': 'Formación no válida',
    'Formation tete allows only a single participant, no partner': 'La formación tete solo admite un participante, sin pareja',
    'Formation doublette requires exactly one partner': 'La formación doublette requiere exactamente una pareja',
    'Formation doublette allows only one partner': 'La formación doublette solo admite una pareja',
    'Formation triplette requires exactly two partners': 'La formación triplette requiere exactamente dos parejas',
    'A valid tournament date is required': 'Se requiere una fecha válida',
    'Tournament name must contain at least 2 characters': 'El nombre del torneo debe tener al menos 2 caracteres',
    'API-Zugänge': 'Accesos API',
    'Externe Turnierleitungs-Software (z.B. das PTM-Hauptprogramm auf deinem Rechner) braucht einen freigeschalteten API-Schlüssel, um Turniere anzulegen und Anmeldungen abzugleichen. Ein Administrator muss jede Installation einzeln genehmigen.':
      'El software externo de gestión de torneos (p.ej. el programa principal PTM en tu ordenador) necesita una clave API aprobada para crear torneos y sincronizar inscripciones. Un administrador debe aprobar cada instalación individualmente.',
    'Bezeichnung der Installation, z.B. Bürorechner': 'Nombre de la instalación, p.ej. ordenador de oficina',
    'Schlüssel beantragen': 'Solicitar clave',
    'Speichere diesen Schlüssel jetzt sicher ab. Er wird nicht erneut angezeigt.':
      'Guarda esta clave de forma segura ahora. No se volverá a mostrar.',
    Bezeichnung: 'Nombre',
    'Beantragt am': 'Solicitado el',
    'Zuletzt genutzt': 'Ultimo uso',
    'Schlüssel abholen': 'Obtener clave',
    Widerrufen: 'Revocar',
    'Noch keine API-Schlüssel beantragt.': 'Aun no se han solicitado claves API.',
    'Offene Freischaltungsanfragen': 'Solicitudes de aprobacion pendientes',
    Genehmigen: 'Aprobar',
    'Keine offenen Anfragen.': 'No hay solicitudes pendientes.',
    'API-Schlüssel wirklich widerrufen?': 'Revocar realmente esta clave API?',
    Ausstehend: 'Pendiente',
    Freigeschaltet: 'Aprobada',
    Impressum: 'Aviso legal',
    Datenschutz: 'Privacidad',
    'Diese Teilnehmerliste ist öffentlich sichtbar und ohne Anmeldung einsehbar. Wer hier nicht aufgeführt werden möchte, wende sich bitte direkt an den Veranstalter dieses Turniers.':
      'Esta lista de participantes es visible públicamente y se puede consultar sin necesidad de iniciar sesión. Quien no desee aparecer aquí debe ponerse en contacto directamente con el organizador de este torneo.',
    'Ich habe verstanden, dass meine Anmeldedaten zur Turnierorganisation verarbeitet werden und mein Name sowie ggf. Verein, Teamname und Partnernamen auf der öffentlichen Turnierseite erscheinen können, wenn der Veranstalter die Teilnehmerliste öffentlich sichtbar schaltet.':
      'Entiendo que mis datos de inscripción se tratarán para la organización del torneo y que mi nombre y, en su caso, el club, el nombre del equipo y los nombres de mis compañeros pueden aparecer en la página pública del torneo si el organizador hace visible la lista de participantes.',
    'Der Hinweis zur möglichen Veröffentlichung der Anmeldedaten muss bestätigt werden':
      'Debe confirmarse el aviso sobre la posible publicación de los datos de inscripción',
    'Datenschutzerklärung lesen': 'Leer política de privacidad',
    'Mit der Registrierung stimmst du der Verarbeitung deiner Daten gemäß unserer Datenschutzerklärung zu.':
      'Al registrarte, aceptas el tratamiento de tus datos conforme a nuestra política de privacidad.',
    'Angaben gemäß § 5 DDG': 'Información conforme al § 5 DDG (Ley alemana de servicios digitales)',
    Deutschland: 'Alemania',
    'E-Mail: michael.massee@gmail.com': 'Correo electrónico: michael.massee@gmail.com',
    'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV': 'Responsable del contenido conforme al § 18, apartado 2 MStV (Tratado interestatal alemán de medios)',
    'Michael Massee (Anschrift wie oben)': 'Michael Massee (dirección como arriba)',
    'Haftung für Inhalte': 'Responsabilidad por el contenido',
    'Turnierdaten, Anmeldungen und Turniermeldungen auf dieser Plattform werden von den jeweiligen Turnierleitern bzw. Nutzern eigenverantwortlich erstellt und gepflegt. Für die Richtigkeit, Vollständigkeit und Aktualität dieser Inhalte sind allein die jeweiligen Turnierleiter bzw. Einsender verantwortlich, nicht der Betreiber dieser Plattform.':
      'Los datos de los torneos, las inscripciones y los avisos de torneo en esta plataforma son creados y mantenidos de forma autónoma por los respectivos organizadores o usuarios. Los respectivos organizadores o remitentes, y no el operador de esta plataforma, son los únicos responsables de la exactitud, integridad y actualidad de estos contenidos.',
    'Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Bei Bekanntwerden entsprechender Rechtsverletzungen werden wir die betroffenen Inhalte umgehend entfernen.':
      'Como prestador de servicios, somos responsables de nuestros propios contenidos en estas páginas conforme a la legislación general según el § 7, apartado 1 DDG. Sin embargo, conforme a los §§ 8 a 10 DDG, no estamos obligados a supervisar la información de terceros transmitida o almacenada ni a investigar circunstancias que indiquen una actividad ilícita. En cuanto tengamos conocimiento de tales infracciones, eliminaremos de inmediato el contenido correspondiente.',
    'Haftung für Links': 'Responsabilidad por los enlaces',
    'Turniermeldungen können Links zu externen Websites Dritter enthalten, etwa zu Anmeldeseiten der jeweiligen Veranstalter, auf deren Inhalte wir keinen Einfluss haben. Für diese fremden Inhalte können wir daher keine Gewähr übernehmen; für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.':
      'Los avisos de torneo pueden contener enlaces a sitios web externos de terceros, por ejemplo páginas de inscripción de los respectivos organizadores, sobre cuyo contenido no tenemos ninguna influencia. Por ello, no podemos asumir ninguna responsabilidad por estos contenidos ajenos; el respectivo proveedor u operador de las páginas enlazadas es siempre responsable de su contenido. Un control permanente del contenido de las páginas enlazadas no es razonable sin indicios concretos de una infracción. En cuanto tengamos conocimiento de infracciones, eliminaremos dichos enlaces de inmediato.',
    Hinweis: 'Aviso',
    'Dieses Angebot wird als nicht-kommerzielles Privatprojekt betrieben. Es werden keine Waren oder Dienstleistungen gegen Entgelt über diese Website angeboten oder abgewickelt.':
      'Esta oferta se gestiona como un proyecto privado sin ánimo de lucro. A través de este sitio web no se ofrecen ni se tramitan bienes o servicios a cambio de una contraprestación económica.',
    Streitschlichtung: 'Resolución de litigios',
    'Als Privatperson bieten wir kein kommerzielles Angebot an und nehmen daher nicht an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil.':
      'Como persona particular, no ofrecemos ninguna oferta comercial y, por lo tanto, no participamos en procedimientos de resolución de litigios ante una entidad de resolución de conflictos con consumidores.',
    Datenschutzerklärung: 'Política de privacidad',
    '1. Verantwortlicher': '1. Responsable del tratamiento',
    'Verantwortlich für die Datenverarbeitung auf dieser Website ist:': 'El responsable del tratamiento de datos en este sitio web es:',
    'Michael Massee, An der Ziegelei 21, 35440 Linden, E-Mail: michael.massee@gmail.com':
      'Michael Massee, An der Ziegelei 21, 35440 Linden, Alemania, correo electrónico: michael.massee@gmail.com',
    '2. Allgemeines zur Datenverarbeitung': '2. Información general sobre el tratamiento de datos',
    'Wir verarbeiten personenbezogene Daten unserer Nutzer grundsätzlich nur, soweit dies zur Bereitstellung einer funktionsfähigen Website sowie unserer Inhalte und Leistungen erforderlich ist.':
      'Por lo general, solo tratamos los datos personales de nuestros usuarios en la medida necesaria para ofrecer un sitio web funcional, así como nuestros contenidos y servicios.',
    'Rechtsgrundlage ist, je nach Verarbeitungsvorgang, die Erfüllung eines Vertrags bzw. vorvertraglicher Maßnahmen (Art. 6 Abs. 1 lit. b DSGVO), eine erteilte Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) oder unser berechtigtes Interesse an einem sicheren und funktionsfähigen Betrieb der Website (Art. 6 Abs. 1 lit. f DSGVO).':
      'La base jurídica es, según la operación de tratamiento, la ejecución de un contrato o medidas precontractuales (art. 6, apartado 1, letra b RGPD), un consentimiento otorgado (art. 6, apartado 1, letra a RGPD) o nuestro interés legítimo en un funcionamiento seguro y funcional del sitio web (art. 6, apartado 1, letra f RGPD).',
    '3. Bereitstellung der Website und Hosting': '3. Puesta a disposición del sitio web y alojamiento',
    'Diese Website wird über Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA) als Hosting- und Content-Delivery-Anbieter bereitgestellt. Cloudflare verarbeitet dabei technisch notwendige Daten wie IP-Adresse, Datum und Uhrzeit der Anfrage sowie Browser-Informationen (Server-Logfiles), um die Website sicher und zuverlässig auszuliefern (Art. 6 Abs. 1 lit. f DSGVO).':
      'Este sitio web se proporciona a través de Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, EE. UU.) como proveedor de alojamiento y distribución de contenidos. Cloudflare trata datos técnicamente necesarios como la dirección IP, la fecha y hora de la solicitud, así como información del navegador (archivos de registro del servidor), para entregar el sitio web de forma segura y fiable (art. 6, apartado 1, letra f RGPD).',
    'Da Cloudflare auch Server außerhalb der EU nutzen kann, erfolgt die Datenübermittlung auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.':
      'Dado que Cloudflare también puede utilizar servidores fuera de la UE, la transferencia de datos se realiza sobre la base de las cláusulas contractuales tipo de la UE conforme al art. 46 RGPD.',
    '4. Registrierung und Benutzerkonto': '4. Registro y cuenta de usuario',
    'Wenn du dich registrierst, erheben wir Name, E-Mail-Adresse und ein sicher gehashtes Passwort. Diese Daten werden zur Bereitstellung deines Benutzerkontos und zur Verwaltung deiner Turniere verarbeitet (Art. 6 Abs. 1 lit. b DSGVO). Nach der Registrierung senden wir dir zur Bestätigung deiner E-Mail-Adresse eine E-Mail mit einem 24 Stunden gültigen Bestätigungslink.':
      'Si te registras como organizador de torneos o administrador, recopilamos tu nombre, dirección de correo electrónico y una contraseña cifrada de forma segura. Estos datos se tratan para ofrecerte tu cuenta de usuario y gestionar tus torneos (art. 6, apartado 1, letra b RGPD). Tras el registro, te enviamos un correo electrónico con un enlace de confirmación válido durante 24 horas para verificar tu dirección de correo electrónico.',
    'Wenn du die Google Anmeldung nutzt, erhalten wir von Google deine verifizierte E-Mail-Adresse, deinen Namen und eine technische Google-Konto-ID. Wir verwenden diese Daten nur, um dein Benutzerkonto anzulegen, dich anzumelden und dein Google-Konto deinem Benutzerkonto zuzuordnen.':
      'Si utilizas el inicio de sesión con Google, recibimos de Google tu dirección de correo verificada, tu nombre y un identificador técnico de cuenta de Google. Usamos estos datos solo para crear tu cuenta, iniciar tu sesión y vincular tu cuenta de Google con tu cuenta de usuario.',
    'Wenn du die Facebook Anmeldung nutzt, erhalten wir von Facebook deine E-Mail-Adresse, deinen Namen und eine technische Facebook-Konto-ID. Wir verwenden diese Daten nur, um dein Benutzerkonto anzulegen, dich anzumelden und dein Facebook-Konto deinem Benutzerkonto zuzuordnen.':
      'Si utilizas el inicio de sesión con Facebook, recibimos de Facebook tu dirección de correo, tu nombre y un identificador técnico de cuenta de Facebook. Usamos estos datos solo para crear tu cuenta, iniciar tu sesión y vincular tu cuenta de Facebook con tu cuenta de usuario.',
    '5. Turnieranmeldungen und öffentliche Teilnehmerlisten': '5. Inscripciones a torneos y listas públicas de participantes',
    'Wenn du dich über diese Website für ein Turnier anmeldest, verarbeiten wir Vorname, Nachname, E-Mail-Adresse sowie je nach Turnier optional oder verpflichtend Verein, Lizenznummer und Angaben zu deinem Partner bzw. deinen Partnern (Doublette/Triplette). Diese Daten werden an den jeweiligen Turnierleiter zur Organisation des Turniers weitergegeben (Art. 6 Abs. 1 lit. b DSGVO).':
      'Cuando te inscribes en un torneo a través de este sitio web, tratamos tu nombre, apellidos, dirección de correo electrónico y, según el torneo, de forma opcional u obligatoria, club, número de licencia y datos de tu(s) compañero(s) (doublette/triplette). Estos datos se transmiten al respectivo organizador del torneo para su organización (art. 6, apartado 1, letra b RGPD).',
    'Turnierleiter können die Teilnehmerliste eines Turniers öffentlich sichtbar schalten. In diesem Fall werden Vorname, Nachname, Verein und die Namen deiner Partner für jeden Besucher der Turnierseite sichtbar, ohne dass eine Anmeldung erforderlich ist. Wenn du das nicht möchtest, wende dich bitte direkt an den Veranstalter (Turnierleiter) des jeweiligen Turniers, dessen Kontaktdaten auf der Turnierseite angegeben sind.':
      'Los organizadores de torneos pueden hacer visible públicamente la lista de participantes de un torneo. En ese caso, el nombre, los apellidos, el club y los nombres de tu(s) compañero(s) serán visibles para cualquier visitante de la página del torneo, sin necesidad de iniciar sesión. Si no lo deseas, ponte en contacto directamente con el organizador (director del torneo) del torneo correspondiente, cuyos datos de contacto figuran en la página del torneo.',
    '6. Turniermeldungen': '6. Avisos de torneo',
    'Wenn du ein fremdes Turnier zur Veröffentlichung vorschlägst, verarbeiten wir deinen Namen und deine E-Mail-Adresse zur Rückfrage und Bestätigung sowie zur Moderation durch unsere Administratoren (Art. 6 Abs. 1 lit. a, lit. f DSGVO).':
      'Si propones un torneo externo para su publicación, tratamos tu nombre y tu dirección de correo electrónico para consultas y confirmación, así como para la moderación por parte de nuestros administradores (art. 6, apartado 1, letras a y f RGPD).',
    '7. Cookies und lokaler Speicher': '7. Cookies y almacenamiento local',
    'Diese Website verwendet ein technisch notwendiges Session-Cookie (ptm_session), um dich nach der Anmeldung für bis zu 14 Tage eingeloggt zu halten. Das Cookie ist HttpOnly, Secure und SameSite=Lax gesetzt und wird ausschließlich für den Login-Status verwendet. Da dieses Cookie technisch notwendig ist, ist gemäß § 25 Abs. 2 TTDSG keine Einwilligung erforderlich.':
      'Este sitio web utiliza una cookie de sesión técnicamente necesaria (ptm_session) para mantenerte conectado hasta 14 días después de iniciar sesión. La cookie está configurada como HttpOnly, Secure y SameSite=Lax y se utiliza exclusivamente para el estado de inicio de sesión. Dado que esta cookie es técnicamente necesaria, no se requiere consentimiento conforme al § 25, apartado 2 TTDSG (ley alemana de protección de datos en telecomunicaciones y telemedios).',
    'Zusätzlich speichern wir deine gewählte Sprache in deinem Browser (localStorage), um sie bei deinem nächsten Besuch beizubehalten. Diese Daten verlassen dein Gerät nicht.':
      'Además, guardamos el idioma que has seleccionado en tu navegador (localStorage) para mantenerlo en tu próxima visita. Estos datos no salen de tu dispositivo.',
    'Wir setzen keine Analyse-, Marketing- oder Tracking-Cookies ein.': 'No utilizamos cookies de análisis, marketing o seguimiento.',
    '8. Versand von E-Mails': '8. Envío de correos electrónicos',
    'Für den Versand von Bestätigungs-, Registrierungs- und Passwort-Zurücksetzen-E-Mails nutzen wir den Dienst Resend (Resend, Inc., USA). Hierbei werden die E-Mail-Adresse sowie der jeweilige E-Mail-Inhalt an Resend übermittelt (Art. 6 Abs. 1 lit. b DSGVO). Auch hier erfolgt die Übermittlung auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.':
      'Para el envío de correos de confirmación, registro y restablecimiento de contraseña utilizamos el servicio Resend (Resend, Inc., EE. UU.). En este proceso se transmiten a Resend la dirección de correo electrónico y el contenido correspondiente del correo (art. 6, apartado 1, letra b RGPD). También en este caso la transmisión se realiza sobre la base de las cláusulas contractuales tipo de la UE conforme al art. 46 RGPD.',
    '9. Speicherdauer': '9. Plazo de conservación',
    'Bestätigungslinks für die E-Mail-Verifizierung und Turniermeldungen sind 24 Stunden gültig, Links zum Zurücksetzen des Passworts 30 Minuten. Danach werden die zugehörigen Token automatisch gelöscht. Benutzerkonten und Turnieranmeldungen speichern wir, solange dein Konto besteht bzw. das Turnier organisiert wird, oder bis du eine Löschung beantragst.':
      'Los enlaces de confirmación para la verificación de correo electrónico y los avisos de torneo son válidos durante 24 horas, y los enlaces para restablecer la contraseña durante 30 minutos. Después, los tokens correspondientes se eliminan automáticamente. Conservamos las cuentas de usuario y las inscripciones a torneos mientras exista tu cuenta o se organice el torneo, o hasta que solicites su eliminación.',
    '10. Deine Rechte': '10. Tus derechos',
    'Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO) sowie Widerspruch gegen die Verarbeitung (Art. 21 DSGVO). Eine erteilte Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO).':
      'Tienes derecho de acceso (art. 15 RGPD), rectificación (art. 16 RGPD), supresión (art. 17 RGPD), limitación del tratamiento (art. 18 RGPD), portabilidad de los datos (art. 20 RGPD) y oposición al tratamiento (art. 21 RGPD). Puedes revocar en cualquier momento, con efectos para el futuro, un consentimiento otorgado (art. 7, apartado 3 RGPD).',
    'Bitte wende dich hierfür an: michael.massee@gmail.com': 'Para ello, ponte en contacto con: michael.massee@gmail.com',
    'Außerdem hast du das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, zum Beispiel beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit.':
      'Además, tienes derecho a presentar una reclamación ante una autoridad de control de protección de datos, por ejemplo ante el comisionado de protección de datos y libertad de información de Hesse.',
    '11. Stand': '11. Última actualización',
    'Diese Datenschutzerklärung wurde zuletzt am 26. August 2026 aktualisiert.': 'Esta política de privacidad se actualizó por última vez el 26 de agosto de 2026.',
    'Koordinaten manuell anpassen': 'Ajustar coordenadas manualmente',
    Breitengrad: 'Latitud',
    Längengrad: 'Longitud',
    'Umkreissuche: Von diesem Ort aus suchen': 'Búsqueda por radio: buscar desde este lugar',
    'Ort oder PLZ eingeben': 'Introduce un lugar o código postal',
    Suchen: 'Buscar',
    'Meinen Standort verwenden': 'Usar mi ubicación',
    Umkreis: 'Radio',
    'Ausgangspunkt:': 'Punto de partida:',
    'Umkreissuche beenden': 'Finalizar búsqueda por radio',
    'Mein Standort': 'Mi ubicación',
    'km entfernt': 'km de distancia',
    'Geolocation wird von diesem Browser nicht unterstützt.': 'Este navegador no admite la geolocalización.',
    'Standort konnte nicht ermittelt werden.': 'No se pudo determinar la ubicación.',
    'Standort-Zugriff wurde verweigert. Bitte erlaube den Zugriff in den Einstellungen deines Geräts unter Datenschutz > Ortungsdienste.':
      'Se ha denegado el acceso a la ubicación. Permite el acceso en los ajustes de tu dispositivo, en Privacidad > Servicios de localización.',
    'Kein Ort gefunden.': 'No se encontró ningún lugar.',
    '5 km': '5 km',
    '10 km': '10 km',
    '25 km': '25 km',
    '50 km': '50 km',
    '100 km': '100 km',
  },
  fr: {
    'Eckdaten im Turnierdokument': 'Informations du tournoi dans le document du tournoi',
    'App wird geladen.': 'Chargement de l’application.',
    'Ersten Admin anlegen': 'Créer le premier admin',
    'Passwort vergessen': 'Mot de passe oublié',
    'Passwort ändern': 'Modifier le mot de passe',
    'Neu registrieren': 'Créer un compte',
    'Turniersoftware': 'Logiciel de tournoi',
    'Registrierung gespeichert': 'Inscription enregistrée',
    'E-Mail bestätigen': 'Confirmer l’e-mail',
    'Turnieranmeldung': 'Inscription au tournoi',
    Anmelden: 'Connexion',
    'Lege den ersten Admin-Benutzer für dieses neue Projekt an.': 'Crée le premier utilisateur administrateur pour ce nouveau projet.',
    'Fordere einen Link zum Zurücksetzen deines Passworts an.': 'Demande un lien de réinitialisation.',
    'Registriere dein Benutzerkonto. Die Freischaltung erfolgt erst nach E-Mail-Bestätigung.': 'Crée ton compte. L’accès est activé seulement après confirmation de l’e-mail.',
    'Registriere dein Benutzerkonto. Nach der E-Mail-Bestätigung kannst du dich anmelden.':
      'Crée ton compte. Tu peux te connecter après confirmation de l’e-mail.',
    'Setze mit deinem Reset-Token ein neues Passwort.': 'Définis un nouveau mot de passe avec ton jeton.',
    'Bestätige deine E-Mail-Adresse, um dein Benutzerkonto freizuschalten.': 'Confirme ton adresse e-mail pour activer ton compte.',
    'Melde dich für ein öffentliches Turnier an.': 'Inscris-toi à un tournoi public.',
    'Melde dich mit deinem Benutzerkonto an.': 'Connecte-toi avec ton compte.',
    Sprache: 'Langue',
    Name: 'Nom',
    'E-Mail': 'E-mail',
    Passwort: 'Mot de passe',
    Anzeigen: 'Afficher',
    Verbergen: 'Masquer',
    'Passwort anzeigen': 'Afficher le mot de passe',
    'Passwort verbergen': 'Masquer le mot de passe',
    'Passwort bestätigen': 'Confirmer le mot de passe',
    'Verein oder kurze Begründung': 'Club ou courte justification',
    'Admin anlegen': 'Créer admin',
    'Passwort vergessen?': 'Mot de passe oublié ?',
    'Reset-Link anfordern': 'Demander le lien',
    Registrieren: 'Créer le compte',
    'Zurück zur Anmeldung': 'Retour à la connexion',
    'Reset-Token': 'Jeton',
    'Bestätigungs-Token': 'Jeton de confirmation',
    'E-Mail bestätigt': 'E-mail confirmé',
    'E-Mail offen': 'E-mail en attente',
    'E-Mail bestätigt setzen': 'Marquer l’e-mail comme confirmé',
    'Passwortänderung beim nächsten Login erzwingen': 'Exiger un changement de mot de passe à la prochaine connexion',
    'Passwortwechsel nötig': 'Changement de mot de passe requis',
    'E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden.': 'Adresse e-mail confirmée. Tu peux maintenant te connecter.',
    'Mit Google anmelden': 'Se connecter avec Google',
    'Mit Google angemeldet.': 'Connecté avec Google.',
    'Google Anmeldung ist nicht konfiguriert.': 'La connexion Google n’est pas configurée.',
    'Google Anmeldung fehlgeschlagen.': 'Échec de la connexion Google.',
    'Mit Facebook anmelden': 'Se connecter avec Facebook',
    'Mit Facebook angemeldet.': 'Connecté avec Facebook.',
    'Facebook Anmeldung ist nicht konfiguriert.': 'La connexion Facebook n’est pas configurée.',
    'Facebook Anmeldung fehlgeschlagen.': 'Échec de la connexion Facebook.',
    'Registrierung gespeichert. Bitte bestätige deine E-Mail-Adresse über den Link in der E-Mail.': 'Compte créé. Confirme ton adresse e-mail avec le lien envoyé.',
    'Bitte bestätige zuerst deine E-Mail-Adresse.': 'Confirme d’abord ton adresse e-mail.',
    'Bitte ändere dein Passwort, bevor du fortfährst.': 'Modifie ton mot de passe avant de continuer.',
    'Bestätigungs-Token ist erforderlich': 'Le jeton de confirmation est obligatoire',
    'Bestätigungs-Link ist ungültig oder abgelaufen': 'Le lien de confirmation est invalide ou expiré',
    'Bestätigungs-E-Mail nicht erhalten?': 'Tu n’as pas reçu l’e-mail de confirmation ?',
    'Bestätigungslink erneut senden': 'Renvoyer le lien de confirmation',
    'Bestätigungslink erneut anfordern': 'Redemander le lien de confirmation',
    'Fordere einen neuen Bestätigungslink für dein Benutzerkonto an.': 'Demande un nouveau lien de confirmation pour ton compte.',
    'Wenn ein unbestätigtes Konto mit dieser E-Mail-Adresse existiert, wurde ein neuer Bestätigungslink gesendet.':
      'Si un compte non confirmé existe avec cette adresse e-mail, un nouveau lien de confirmation a été envoyé.',
    'Die Passwörter stimmen nicht überein.': 'Les mots de passe ne correspondent pas.',
    'Mein Profil': 'Mon profil',
    'Bearbeite deinen Namen, deine E-Mail-Adresse und dein Passwort.': 'Modifie ton nom, ton adresse e-mail et ton mot de passe.',
    'Aktuelles Passwort': 'Mot de passe actuel',
    'Nur erforderlich, wenn du deine E-Mail-Adresse oder dein Passwort änderst.':
      'Nécessaire uniquement si tu modifies ton adresse e-mail ou ton mot de passe.',
    'Deine Daten wurden gespeichert.': 'Tes données ont été enregistrées.',
    'Deine Daten wurden gespeichert. Bitte bestätige deine neue E-Mail-Adresse über den Link, den wir dir zugeschickt haben.':
      'Tes données ont été enregistrées. Confirme ta nouvelle adresse e-mail avec le lien que nous t’avons envoyé.',
    'Aktuelles Passwort ist erforderlich oder falsch': 'Le mot de passe actuel est requis ou incorrect',
    'Das Passwort muss mindestens 8 Zeichen lang sein und mindestens eine Zahl, einen Kleinbuchstaben, einen Großbuchstaben und ein Sonderzeichen enthalten':
      'Le mot de passe doit contenir au moins 8 caractères, un chiffre, une minuscule, une majuscule et un caractère spécial',
    'Mindestens 8 Zeichen, ein Groß- und Kleinbuchstabe, eine Zahl und ein Sonderzeichen.':
      'Au moins 8 caractères, une majuscule et une minuscule, un chiffre et un caractère spécial.',
    'Neues Passwort darf nicht mit dem aktuellen Passwort übereinstimmen':
      'Le nouveau mot de passe ne doit pas être identique au mot de passe actuel',
    'Email already exists': 'L’e-mail existe déjà',
    'Email and password are required': 'E-mail et mot de passe obligatoires',
    'Invalid login': 'Connexion invalide',
    'Name must contain at least 2 characters': 'Le nom doit contenir au moins 2 caractères',
    'A valid email is required': 'Une adresse e-mail valide est obligatoire',
    'Password must contain at least 8 characters': 'Le mot de passe doit contenir au moins 8 caractères',
    'E-Mail-Versand ist nicht konfiguriert.': "L'envoi d'e-mails n'est pas configuré.",
    'E-Mail konnte nicht versendet werden.': "L'e-mail n'a pas pu être envoyé.",
    'Die Nachricht darf maximal 1000 Zeichen enthalten.': 'Le message peut contenir au maximum 1000 caractères.',
    'Benutzer nicht gefunden.': 'Utilisateur introuvable.',
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
    'Konten, Rollen und Freischaltungen zentral bearbeiten.': 'Gérer les comptes, rôles et validations au même endroit.',
    Admins: 'Admins',
    Passwortwechsel: 'Changements de mot de passe',
    Anfragen: 'Demandes',
    'Name oder E-Mail suchen': 'Rechercher nom ou e-mail',
    'Rolle filtern': 'Filtrer le rôle',
    'Status filtern': 'Filtrer le statut',
    'Alle Rollen': 'Tous les rôles',
    'Alle Status': 'Tous les statuts',
    'Filter zurücksetzen': 'Réinitialiser les filtres',
    'Keine Benutzer gefunden.': 'Aucun utilisateur trouvé.',
    Abmelden: 'Déconnexion',
    'Turnier bearbeiten': 'Modifier le tournoi',
    'Turnier anlegen': 'Créer un tournoi',
    Neu: 'Nouveau',
    Datum: 'Date',
    Startzeit: 'Heure',
    Ort: 'Lieu',
    Turniersystem: 'Système',
    Formation: 'Formation',
    Anmeldetyp: "Type d'inscription",
    Mêlée: 'Mêlée',
    Formé: 'Formé',
    'Dieses Turnier wird als Mêlée gespielt – Partner werden vor Ort ausgelost.':
      "Ce tournoi se joue en mêlée – les partenaires seront tirés au sort sur place.",
    Status: 'Statut',
    VIP: 'VIP',
    Sichtbarkeit: 'Visibilité',
    'Max. Meldungen': 'Max. inscriptions',
    'Noch frei': 'Places libres',
    'Startgeld EUR': 'Frais EUR',
    Meldefrist: 'Date limite',
    Kontaktname: 'Contact',
    'Kontakt-E-Mail': 'E-mail contact',
    'Kontakt-Telefon': 'Téléphone',
    Beschreibung: 'Description',
    'Interne Notizen': 'Notes internes',
    'Turnier speichern': 'Enregistrer',
    'Lizenznummer erforderlich': 'Licence obligatoire',
    'Teamname abfragen': 'Demander le nom d’équipe',
    'Supermêlée ist nur mit der Formation Tête möglich': 'Supermêlée n’est possible qu’avec la formation Tête',
    'Lizenznummer ist erforderlich': 'La licence est obligatoire',
    'Lizenznummer für Partner ist erforderlich': 'La licence du partenaire est obligatoire',
    'Lizenznummer für Partner 2 ist erforderlich': 'La licence du partenaire 2 est obligatoire',
    Bearbeiten: 'Modifier',
    Löschen: 'Supprimer',
    'Anmeldung bearbeiten': 'Modifier inscription',
    'Anmeldung erfassen': 'Ajouter inscription',
    Turnier: 'Tournoi',
    Vorname: 'Prénom',
    Nachname: 'Nom',
    Verein: 'Club',
    Lizenznummer: 'Licence',
    Lizenz: 'Licence',
    Ja: 'Oui',
    Nein: 'Non',
    'Turnier teilen': 'Partager le tournoi',
    'Link kopiert': 'Lien copié',
    'Teilen wird von diesem Gerät nicht unterstützt': 'Le partage n’est pas pris en charge sur cet appareil',
    Teamname: 'Équipe',
    'Partner Vorname': 'Prénom partenaire',
    'Partner Nachname': 'Nom partenaire',
    'Partner E-Mail': 'E-mail partenaire',
    'Partner Lizenznummer': 'Licence partenaire',
    'Partner 2 Vorname': 'Prénom partenaire 2',
    'Partner 2 Nachname': 'Nom partenaire 2',
    'Partner 2 E-Mail': 'E-mail partenaire 2',
    'Partner 2 Lizenznummer': 'Licence partenaire 2',
    Setzposition: 'Tête de série',
    'Anmeldung speichern': 'Enregistrer inscription',
    'Benutzer bearbeiten': 'Modifier utilisateur',
    'Benutzer anlegen': 'Créer utilisateur',
    Rolle: 'Rôle',
    Speichern: 'Enregistrer',
    Anlegen: 'Créer',
    Admin: 'Admin',
    User: 'Utilisateur',
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
    'Teilnehmerliste öffentlich sichtbar. Ich bestätige, dass ich als Turnierersteller für diese Veröffentlichung verantwortlich bin und die Teilnehmer ausdrücklich darauf hinweisen muss.':
      'Liste des participants visible publiquement. Je confirme qu’en tant que créateur du tournoi, je suis responsable de cette publication et dois en informer expressément les participants.',
    'Nur meine Turniere': 'Seulement mes tournois',
    'Turnier suchen': 'Rechercher un tournoi',
    'Name, Ort oder Turniersystem': 'Nom, lieu ou système',
    'Suche öffnen': 'Ouvrir la recherche',
    'Suche schließen': 'Fermer la recherche',
    'Filter ausblenden': 'Masquer le filtre',
    'Filter anzeigen': 'Afficher le filtre',
    'Finde dein nächstes Pétanque-Turnier': 'Trouve ton prochain tournoi de pétanque',
    'Suche nach Ort, Verein oder Turniersystem und melde dich direkt online an.':
      'Recherche par lieu, club ou système de tournoi et inscris-toi directement en ligne.',
    'Gefundene Turniere': 'Tournois trouvés',
    keiner: 'aucun',
    'Nächster Termin': 'Prochaine date',
    'Filter aktiv': 'Filtre actif',
    'Keine Filter aktiv': 'Aucun filtre actif',
    Finder: 'Recherche',
    'Umkreissuche aus': 'Recherche par rayon désactivée',
    'Alle passenden Turniere': 'Tous les tournois correspondants',
    'Keine Turniere gefunden.': 'Aucun tournoi trouvé.',
    Ganztägig: 'Toute la journée',
    'Weitere Turniere laden': 'Charger plus de tournois',
    Monat: 'Mois',
    'Alle Monate': 'Tous les mois',
    'Alle Formationen': 'Toutes les formations',
    'Anmeldung möglich': 'Inscription possible',
    Zurücksetzen: 'Réinitialiser',
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
    'Spielort in Google Maps öffnen': 'Ouvrir le lieu dans Google Maps',
    Präsentation: 'Présentation',
    'Website öffnen': 'Ouvrir le site web',
    Website: 'Site web',
    'Logo-Bildlink': 'Lien de l’image du logo',
    'Flyer-Bildlink': 'Lien de l’image du flyer',
    'Präsentation speichern': 'Enregistrer la présentation',
    'Präsentation wurde gespeichert.': 'La présentation a été enregistrée.',
    'Website, Logo und Flyer sind unabhängig von den Turnier-Eckdaten und können auch bei dokument-verwalteten Turnieren jederzeit hier gepflegt werden. Logo und Flyer werden als Link zu einem bereits online gehosteten Bild eingebunden, nicht hochgeladen.':
      'Le site web, le logo et le flyer sont indépendants des données de base du tournoi et peuvent toujours être gérés ici, même pour les tournois gérés par document. Le logo et le flyer sont intégrés sous forme de lien vers une image déjà hébergée en ligne, et non téléversés.',
    'Eine gültige URL (http:// oder https://) ist erforderlich': 'Une URL valide (http:// ou https://) est requise',
    'Die Teilnehmerliste ist für dieses Turnier nicht öffentlich.': 'La liste des participants n’est pas publique pour ce tournoi.',
    'Teilnehmerliste wird geladen…': 'Chargement de la liste des participants…',
    'Noch keine Anmeldungen.': 'Pas encore d’inscriptions.',
    'Invalid formation': 'Formation invalide',
    'Formation tete allows only a single participant, no partner': 'La formation tete n’autorise qu’un seul participant, sans partenaire',
    'Formation doublette requires exactly one partner': 'La formation doublette requiert exactement un partenaire',
    'Formation doublette allows only one partner': 'La formation doublette n’autorise qu’un seul partenaire',
    'Formation triplette requires exactly two partners': 'La formation triplette requiert exactement deux partenaires',
    'A valid tournament date is required': 'Une date valide est requise',
    'Tournament name must contain at least 2 characters': 'Le nom du tournoi doit contenir au moins 2 caractères',
    'API-Zugänge': 'Accès API',
    'Externe Turnierleitungs-Software (z.B. das PTM-Hauptprogramm auf deinem Rechner) braucht einen freigeschalteten API-Schlüssel, um Turniere anzulegen und Anmeldungen abzugleichen. Ein Administrator muss jede Installation einzeln genehmigen.':
      'Un logiciel externe de gestion de tournois (p. ex. le programme principal PTM sur ton ordinateur) a besoin d’une clé API approuvée pour créer des tournois et synchroniser les inscriptions. Un administrateur doit approuver chaque installation individuellement.',
    'Bezeichnung der Installation, z.B. Bürorechner': 'Nom de l’installation, p. ex. ordinateur de bureau',
    'Schlüssel beantragen': 'Demander une clé',
    'Speichere diesen Schlüssel jetzt sicher ab. Er wird nicht erneut angezeigt.':
      'Enregistre cette clé en lieu sûr maintenant. Elle ne sera plus affichée.',
    Bezeichnung: 'Nom',
    'Beantragt am': 'Demandée le',
    'Zuletzt genutzt': 'Dernière utilisation',
    'Schlüssel abholen': 'Récupérer la clé',
    Widerrufen: 'Révoquer',
    'Noch keine API-Schlüssel beantragt.': 'Aucune clé API demandée pour le moment.',
    'Offene Freischaltungsanfragen': 'Demandes d’approbation en attente',
    Genehmigen: 'Approuver',
    'Keine offenen Anfragen.': 'Aucune demande en attente.',
    'API-Schlüssel wirklich widerrufen?': 'Vraiment révoquer cette clé API ?',
    Ausstehend: 'En attente',
    Freigeschaltet: 'Approuvée',
    Impressum: 'Mentions légales',
    Datenschutz: 'Confidentialité',
    'Diese Teilnehmerliste ist öffentlich sichtbar und ohne Anmeldung einsehbar. Wer hier nicht aufgeführt werden möchte, wende sich bitte direkt an den Veranstalter dieses Turniers.':
      "Cette liste de participants est visible publiquement et consultable sans connexion. Toute personne ne souhaitant pas y figurer est priée de contacter directement l'organisateur de ce tournoi.",
    'Ich habe verstanden, dass meine Anmeldedaten zur Turnierorganisation verarbeitet werden und mein Name sowie ggf. Verein, Teamname und Partnernamen auf der öffentlichen Turnierseite erscheinen können, wenn der Veranstalter die Teilnehmerliste öffentlich sichtbar schaltet.':
      "Je comprends que mes données d'inscription seront traitées pour l'organisation du tournoi et que mon nom ainsi que, le cas échéant, mon club, le nom d'équipe et les noms de mes partenaires peuvent apparaître sur la page publique du tournoi si l'organisateur rend la liste des participants publiquement visible.",
    'Der Hinweis zur möglichen Veröffentlichung der Anmeldedaten muss bestätigt werden':
      "L'avis relatif à la publication possible des données d'inscription doit être confirmé",
    'Datenschutzerklärung lesen': 'Lire la politique de confidentialité',
    'Mit der Registrierung stimmst du der Verarbeitung deiner Daten gemäß unserer Datenschutzerklärung zu.':
      "En t'inscrivant, tu acceptes le traitement de tes données conformément à notre politique de confidentialité.",
    'Angaben gemäß § 5 DDG': 'Informations conformément au § 5 DDG (loi allemande sur les services numériques)',
    Deutschland: 'Allemagne',
    'E-Mail: michael.massee@gmail.com': 'E-mail : michael.massee@gmail.com',
    'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV': 'Responsable du contenu conformément au § 18, al. 2 MStV (traité interétatique allemand sur les médias)',
    'Michael Massee (Anschrift wie oben)': 'Michael Massee (adresse comme ci-dessus)',
    'Haftung für Inhalte': 'Responsabilité du contenu',
    'Turnierdaten, Anmeldungen und Turniermeldungen auf dieser Plattform werden von den jeweiligen Turnierleitern bzw. Nutzern eigenverantwortlich erstellt und gepflegt. Für die Richtigkeit, Vollständigkeit und Aktualität dieser Inhalte sind allein die jeweiligen Turnierleiter bzw. Einsender verantwortlich, nicht der Betreiber dieser Plattform.':
      "Les données de tournois, les inscriptions et les signalements de tournois sur cette plateforme sont créés et gérés de manière autonome par les organisateurs de tournois ou les utilisateurs concernés. Seuls les organisateurs de tournois ou les auteurs des signalements concernés, et non l'exploitant de cette plateforme, sont responsables de l'exactitude, de l'exhaustivité et de l'actualité de ce contenu.",
    'Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Bei Bekanntwerden entsprechender Rechtsverletzungen werden wir die betroffenen Inhalte umgehend entfernen.':
      'En tant que fournisseur de services, nous sommes responsables de notre propre contenu sur ces pages conformément aux lois générales, en vertu du § 7, al. 1 DDG. Toutefois, conformément aux §§ 8 à 10 DDG, nous ne sommes pas tenus de surveiller les informations de tiers transmises ou stockées, ni de rechercher des circonstances indiquant une activité illégale. Dès que nous prenons connaissance de telles violations, nous supprimons immédiatement le contenu concerné.',
    'Haftung für Links': 'Responsabilité des liens',
    'Turniermeldungen können Links zu externen Websites Dritter enthalten, etwa zu Anmeldeseiten der jeweiligen Veranstalter, auf deren Inhalte wir keinen Einfluss haben. Für diese fremden Inhalte können wir daher keine Gewähr übernehmen; für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.':
      "Les signalements de tournois peuvent contenir des liens vers des sites web externes de tiers, par exemple des pages d'inscription des organisateurs concernés, sur le contenu desquels nous n'avons aucune influence. Nous ne pouvons donc assumer aucune responsabilité pour ce contenu tiers ; le fournisseur ou l'exploitant respectif des pages liées est toujours responsable de leur contenu. Un contrôle permanent du contenu des pages liées n'est pas raisonnable en l'absence d'indices concrets d'une violation. Dès que nous prenons connaissance de violations, nous supprimons immédiatement ces liens.",
    Hinweis: 'Remarque',
    'Dieses Angebot wird als nicht-kommerzielles Privatprojekt betrieben. Es werden keine Waren oder Dienstleistungen gegen Entgelt über diese Website angeboten oder abgewickelt.':
      "Cette offre est exploitée en tant que projet privé à but non lucratif. Aucun bien ou service n'est proposé ou traité contre rémunération via ce site web.",
    Streitschlichtung: 'Règlement des litiges',
    'Als Privatperson bieten wir kein kommerzielles Angebot an und nehmen daher nicht an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil.':
      'En tant que particulier, nous ne proposons aucune offre commerciale et ne participons donc pas aux procédures de règlement des litiges devant un organisme de médiation de la consommation.',
    Datenschutzerklärung: 'Politique de confidentialité',
    '1. Verantwortlicher': '1. Responsable du traitement',
    'Verantwortlich für die Datenverarbeitung auf dieser Website ist:': 'Le responsable du traitement des données sur ce site web est :',
    'Michael Massee, An der Ziegelei 21, 35440 Linden, E-Mail: michael.massee@gmail.com':
      'Michael Massee, An der Ziegelei 21, 35440 Linden, Allemagne, e-mail : michael.massee@gmail.com',
    '2. Allgemeines zur Datenverarbeitung': '2. Informations générales sur le traitement des données',
    'Wir verarbeiten personenbezogene Daten unserer Nutzer grundsätzlich nur, soweit dies zur Bereitstellung einer funktionsfähigen Website sowie unserer Inhalte und Leistungen erforderlich ist.':
      "Nous ne traitons en principe les données personnelles de nos utilisateurs que dans la mesure où cela est nécessaire pour fournir un site web fonctionnel ainsi que nos contenus et services.",
    'Rechtsgrundlage ist, je nach Verarbeitungsvorgang, die Erfüllung eines Vertrags bzw. vorvertraglicher Maßnahmen (Art. 6 Abs. 1 lit. b DSGVO), eine erteilte Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) oder unser berechtigtes Interesse an einem sicheren und funktionsfähigen Betrieb der Website (Art. 6 Abs. 1 lit. f DSGVO).':
      "La base juridique est, selon l'opération de traitement, l'exécution d'un contrat ou de mesures précontractuelles (art. 6, § 1, point b RGPD), un consentement donné (art. 6, § 1, point a RGPD) ou notre intérêt légitime à un fonctionnement sûr et fonctionnel du site web (art. 6, § 1, point f RGPD).",
    '3. Bereitstellung der Website und Hosting': '3. Fourniture du site web et hébergement',
    'Diese Website wird über Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA) als Hosting- und Content-Delivery-Anbieter bereitgestellt. Cloudflare verarbeitet dabei technisch notwendige Daten wie IP-Adresse, Datum und Uhrzeit der Anfrage sowie Browser-Informationen (Server-Logfiles), um die Website sicher und zuverlässig auszuliefern (Art. 6 Abs. 1 lit. f DSGVO).':
      "Ce site web est fourni via Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, États-Unis) en tant que fournisseur d'hébergement et de diffusion de contenu. Cloudflare traite à cette occasion des données techniquement nécessaires telles que l'adresse IP, la date et l'heure de la requête ainsi que des informations sur le navigateur (fichiers journaux du serveur), afin de fournir le site web de manière sûre et fiable (art. 6, § 1, point f RGPD).",
    'Da Cloudflare auch Server außerhalb der EU nutzen kann, erfolgt die Datenübermittlung auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.':
      "Étant donné que Cloudflare peut également utiliser des serveurs situés en dehors de l'UE, le transfert de données s'effectue sur la base de clauses contractuelles types de l'UE conformément à l'art. 46 RGPD.",
    '4. Registrierung und Benutzerkonto': '4. Inscription et compte utilisateur',
    'Wenn du dich registrierst, erheben wir Name, E-Mail-Adresse und ein sicher gehashtes Passwort. Diese Daten werden zur Bereitstellung deines Benutzerkontos und zur Verwaltung deiner Turniere verarbeitet (Art. 6 Abs. 1 lit. b DSGVO). Nach der Registrierung senden wir dir zur Bestätigung deiner E-Mail-Adresse eine E-Mail mit einem 24 Stunden gültigen Bestätigungslink.':
      "Si tu t'inscris en tant qu'organisateur de tournoi ou administrateur, nous collectons ton nom, ton adresse e-mail et un mot de passe haché de manière sécurisée. Ces données sont traitées pour fournir ton compte utilisateur et gérer tes tournois (art. 6, § 1, point b RGPD). Après l'inscription, nous t'envoyons un e-mail contenant un lien de confirmation valable 24 heures afin de vérifier ton adresse e-mail.",
    'Wenn du die Google Anmeldung nutzt, erhalten wir von Google deine verifizierte E-Mail-Adresse, deinen Namen und eine technische Google-Konto-ID. Wir verwenden diese Daten nur, um dein Benutzerkonto anzulegen, dich anzumelden und dein Google-Konto deinem Benutzerkonto zuzuordnen.':
      'Si tu utilises la connexion Google, nous recevons de Google ton adresse e-mail vérifiée, ton nom et un identifiant technique de compte Google. Nous utilisons ces données uniquement pour créer ton compte utilisateur, te connecter et associer ton compte Google à ton compte utilisateur.',
    'Wenn du die Facebook Anmeldung nutzt, erhalten wir von Facebook deine E-Mail-Adresse, deinen Namen und eine technische Facebook-Konto-ID. Wir verwenden diese Daten nur, um dein Benutzerkonto anzulegen, dich anzumelden und dein Facebook-Konto deinem Benutzerkonto zuzuordnen.':
      'Si tu utilises la connexion Facebook, nous recevons de Facebook ton adresse e-mail, ton nom et un identifiant technique de compte Facebook. Nous utilisons ces données uniquement pour créer ton compte utilisateur, te connecter et associer ton compte Facebook à ton compte utilisateur.',
    '5. Turnieranmeldungen und öffentliche Teilnehmerlisten': '5. Inscriptions aux tournois et listes de participants publiques',
    'Wenn du dich über diese Website für ein Turnier anmeldest, verarbeiten wir Vorname, Nachname, E-Mail-Adresse sowie je nach Turnier optional oder verpflichtend Verein, Lizenznummer und Angaben zu deinem Partner bzw. deinen Partnern (Doublette/Triplette). Diese Daten werden an den jeweiligen Turnierleiter zur Organisation des Turniers weitergegeben (Art. 6 Abs. 1 lit. b DSGVO).':
      "Lorsque tu t'inscris à un tournoi via ce site web, nous traitons ton prénom, ton nom, ton adresse e-mail ainsi que, selon le tournoi, de manière facultative ou obligatoire, ton club, ton numéro de licence et des informations sur ton/tes partenaire(s) (doublette/triplette). Ces données sont transmises à l'organisateur du tournoi concerné pour l'organisation du tournoi (art. 6, § 1, point b RGPD).",
    'Turnierleiter können die Teilnehmerliste eines Turniers öffentlich sichtbar schalten. In diesem Fall werden Vorname, Nachname, Verein und die Namen deiner Partner für jeden Besucher der Turnierseite sichtbar, ohne dass eine Anmeldung erforderlich ist. Wenn du das nicht möchtest, wende dich bitte direkt an den Veranstalter (Turnierleiter) des jeweiligen Turniers, dessen Kontaktdaten auf der Turnierseite angegeben sind.':
      "Les organisateurs de tournois peuvent rendre la liste des participants d'un tournoi publiquement visible. Dans ce cas, le prénom, le nom, le club et les noms de tes partenaires sont visibles par tout visiteur de la page du tournoi, sans connexion requise. Si tu ne le souhaites pas, merci de contacter directement l'organisateur (directeur du tournoi) du tournoi concerné, dont les coordonnées figurent sur la page du tournoi.",
    '6. Turniermeldungen': '6. Signalements de tournois',
    'Wenn du ein fremdes Turnier zur Veröffentlichung vorschlägst, verarbeiten wir deinen Namen und deine E-Mail-Adresse zur Rückfrage und Bestätigung sowie zur Moderation durch unsere Administratoren (Art. 6 Abs. 1 lit. a, lit. f DSGVO).':
      "Lorsque tu proposes un tournoi externe pour publication, nous traitons ton nom et ton adresse e-mail pour les questions de suivi et la confirmation, ainsi que pour la modération par nos administrateurs (art. 6, § 1, points a et f RGPD).",
    '7. Cookies und lokaler Speicher': '7. Cookies et stockage local',
    'Diese Website verwendet ein technisch notwendiges Session-Cookie (ptm_session), um dich nach der Anmeldung für bis zu 14 Tage eingeloggt zu halten. Das Cookie ist HttpOnly, Secure und SameSite=Lax gesetzt und wird ausschließlich für den Login-Status verwendet. Da dieses Cookie technisch notwendig ist, ist gemäß § 25 Abs. 2 TTDSG keine Einwilligung erforderlich.':
      "Ce site web utilise un cookie de session techniquement nécessaire (ptm_session) pour te maintenir connecté(e) jusqu'à 14 jours après la connexion. Le cookie est défini en HttpOnly, Secure et SameSite=Lax et n'est utilisé que pour le statut de connexion. Ce cookie étant techniquement nécessaire, aucun consentement n'est requis conformément au § 25, al. 2 TTDSG (loi allemande sur la protection des données dans les télécommunications et les télémédias).",
    'Zusätzlich speichern wir deine gewählte Sprache in deinem Browser (localStorage), um sie bei deinem nächsten Besuch beizubehalten. Diese Daten verlassen dein Gerät nicht.':
      'Nous enregistrons également la langue que tu as choisie dans ton navigateur (localStorage) afin de la conserver lors de ta prochaine visite. Ces données ne quittent pas ton appareil.',
    'Wir setzen keine Analyse-, Marketing- oder Tracking-Cookies ein.': "Nous n'utilisons aucun cookie d'analyse, de marketing ou de suivi.",
    '8. Versand von E-Mails': "8. Envoi d'e-mails",
    'Für den Versand von Bestätigungs-, Registrierungs- und Passwort-Zurücksetzen-E-Mails nutzen wir den Dienst Resend (Resend, Inc., USA). Hierbei werden die E-Mail-Adresse sowie der jeweilige E-Mail-Inhalt an Resend übermittelt (Art. 6 Abs. 1 lit. b DSGVO). Auch hier erfolgt die Übermittlung auf Grundlage von EU-Standardvertragsklauseln gemäß Art. 46 DSGVO.':
      "Pour l'envoi des e-mails de confirmation, d'inscription et de réinitialisation de mot de passe, nous utilisons le service Resend (Resend, Inc., États-Unis). L'adresse e-mail ainsi que le contenu de l'e-mail concerné sont alors transmis à Resend (art. 6, § 1, point b RGPD). Ici aussi, la transmission s'effectue sur la base de clauses contractuelles types de l'UE conformément à l'art. 46 RGPD.",
    '9. Speicherdauer': '9. Durée de conservation',
    'Bestätigungslinks für die E-Mail-Verifizierung und Turniermeldungen sind 24 Stunden gültig, Links zum Zurücksetzen des Passworts 30 Minuten. Danach werden die zugehörigen Token automatisch gelöscht. Benutzerkonten und Turnieranmeldungen speichern wir, solange dein Konto besteht bzw. das Turnier organisiert wird, oder bis du eine Löschung beantragst.':
      "Les liens de confirmation pour la vérification de l'e-mail et les signalements de tournois sont valables 24 heures, les liens de réinitialisation du mot de passe 30 minutes. Passé ce délai, les jetons correspondants sont automatiquement supprimés. Nous conservons les comptes utilisateurs et les inscriptions aux tournois tant que ton compte existe ou que le tournoi est organisé, ou jusqu'à ce que tu demandes leur suppression.",
    '10. Deine Rechte': '10. Tes droits',
    'Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO) sowie Widerspruch gegen die Verarbeitung (Art. 21 DSGVO). Eine erteilte Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO).':
      "Tu disposes d'un droit d'accès (art. 15 RGPD), de rectification (art. 16 RGPD), d'effacement (art. 17 RGPD), de limitation du traitement (art. 18 RGPD), de portabilité des données (art. 20 RGPD) ainsi que d'opposition au traitement (art. 21 RGPD). Tu peux révoquer à tout moment, avec effet pour l'avenir, un consentement donné (art. 7, § 3 RGPD).",
    'Bitte wende dich hierfür an: michael.massee@gmail.com': 'Merci de nous contacter à cet effet à l’adresse : michael.massee@gmail.com',
    'Außerdem hast du das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, zum Beispiel beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit.':
      'Tu as également le droit de déposer une réclamation auprès d’une autorité de contrôle de la protection des données, par exemple auprès du commissaire hessois à la protection des données et à la liberté d’information.',
    '11. Stand': '11. Date de mise à jour',
    'Diese Datenschutzerklärung wurde zuletzt am 26. August 2026 aktualisiert.': 'Cette politique de confidentialité a été mise à jour pour la dernière fois le 26 août 2026.',
    'Koordinaten manuell anpassen': 'Ajuster les coordonnées manuellement',
    Breitengrad: 'Latitude',
    Längengrad: 'Longitude',
    'Umkreissuche: Von diesem Ort aus suchen': 'Recherche par rayon : rechercher depuis ce lieu',
    'Ort oder PLZ eingeben': 'Saisir un lieu ou un code postal',
    Suchen: 'Rechercher',
    'Meinen Standort verwenden': 'Utiliser ma position',
    Umkreis: 'Rayon',
    'Ausgangspunkt:': 'Point de départ :',
    'Umkreissuche beenden': 'Terminer la recherche par rayon',
    'Mein Standort': 'Ma position',
    'km entfernt': 'km',
    'Geolocation wird von diesem Browser nicht unterstützt.': "La géolocalisation n'est pas prise en charge par ce navigateur.",
    'Standort konnte nicht ermittelt werden.': 'Impossible de déterminer la position.',
    'Standort-Zugriff wurde verweigert. Bitte erlaube den Zugriff in den Einstellungen deines Geräts unter Datenschutz > Ortungsdienste.':
      "L'accès à la position a été refusé. Autorise l'accès dans les réglages de ton appareil sous Confidentialité > Service de localisation.",
    'Kein Ort gefunden.': 'Aucun lieu trouvé.',
    '5 km': '5 km',
    '10 km': '10 km',
    '25 km': '25 km',
    '50 km': '50 km',
    '100 km': '100 km',
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
    if (node.nodeValue !== translated) {
      node.nodeValue = translated;
    }
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
    if (element.getAttribute('placeholder') !== translated) {
      element.setAttribute('placeholder', translated);
    }
  }
}

function translateText(source, language) {
  if (language === 'de') {
    return source;
  }
  return TRANSLATIONS[language]?.[source] || source;
}
