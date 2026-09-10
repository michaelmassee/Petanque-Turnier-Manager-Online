import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { filterRegistrations, filterTournaments, filterUsers } from './frontend-core.js';
import { ROLES, TOURNAMENT_TYPES, FORMATIONS, REGISTRATION_TYPES, MONTHS, TOURNAMENT_STATUSES, VISIBILITIES, REGISTRATION_STATUSES, RADIUS_OPTIONS, DEFAULT_TOURNAMENT_LIMIT, EMPTY_USER_FORM, EMPTY_PROFILE_FORM, EMPTY_AUTH_FORM, EMPTY_TOURNAMENT_FORM, EMPTY_TOURNAMENT_REPORT_FORM, EMPTY_REGISTRATION_FORM, REGISTER_SUCCESS, VERIFY_SUCCESS, CANCEL_REGISTRATION_EXPLANATION, CANCEL_REGISTRATION_SUCCESS, PROFILE_UPDATE_SUCCESS, PROFILE_EMAIL_CHANGE_PENDING } from './lib/constants.js';
import { POSTBOX_TEXT, postboxText, TRANSLATIONS, translateDom, translateText } from './lib/i18n.js';
import { api } from './lib/api.js';
import { usePath, matchTournamentRoute } from './lib/routing.js';
import { useInstallPrompt, isIosSafari, useOnlineStatus, useRoutedTournament } from './lib/hooks.js';
import { DISPLAY_LOCALES, TIMEZONE_HINT_TEMPLATES, MAIL_NOT_ENABLED_HINT_TEMPLATES, REGISTRATION_OPENS_TEMPLATES, PASSWORD_STRENGTH_ERROR, PASSWORD_STRENGTH_HINT, detectViewerTimeZone, formatDate, timezoneAbbrev, formatTournamentDateTime, minorUnitsToAmount, amountToMinorUnits, currencyOptions, formatMoney, utcIsoToZonedDateTimeInput, formatDateTime, isPasswordStrong } from './lib/format.js';
import { authTitle, authSubtitle, authErrorMessage, googleMapsUrl, tournamentImageUrl, tournamentPayload, registrationPayload, roleName, labelFor, formationLabel, isOwnTournament, isUpcoming, registrationNotYetOpen, hasOpenRegistration, SLOTS_FREE_TEMPLATES, REGISTERED_COUNT_TEMPLATES, registrationStatusLabel, API_KEY_STATUS_LABELS, formatTournamentStartTime, distanceKm } from './lib/domain.js';
import { RequiredMark, TextField, SelectField, Button, Feedback } from './components/ui.jsx';
import { LazyFallback } from './components/LazyFallback.jsx';
import { RegistrationFields } from './components/RegistrationFields.jsx';
import { AppHeader, PostboxControl, PushMigrationNotice, SearchMenuControl, AuthModal, StandalonePageHeader, InstallAppButton, OfflineNotice } from './components/layout.jsx';
import { AuthShell, LanguageSelect, SetupForm, LoginForm, RegisterForm, RegisterSuccessNotice, ForgotPasswordForm, ResendVerificationForm, ResetPasswordForm, VerifyEmailForm, CancelRegistrationForm } from './auth/AuthForms.jsx';
import { isOnlinePlayable } from './lib/pairing/index.js';

const ImpressumPage = lazy(() => import('./pages/ImpressumPage.jsx'));
const DatenschutzPage = lazy(() => import('./pages/DatenschutzPage.jsx'));
const TournamentReportPage = lazy(() => import('./pages/TournamentReportPage.jsx'));
const TournamentDetailPage = lazy(() => import('./pages/TournamentDetailPage.jsx'));
const TournamentManagement = lazy(() => import('./pages/TournamentManagement.jsx'));
const RegistrationsManagement = lazy(() => import('./pages/RegistrationsManagement.jsx'));
const UserManagementPanel = lazy(() => import('./pages/UserManagementPanel.jsx'));
const ApiKeysPanel = lazy(() => import('./pages/ApiKeysPanel.jsx'));
const TournamentPlayManagement = lazy(() => import('./pages/TournamentPlayManagement.jsx'));

export { filterRegistrations, filterTournaments, filterUsers } from './frontend-core.js';
export { EditDialog, ListToolbar } from './components/ui.jsx';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState(() => localStorage.getItem('ptm_language') || 'de');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState(null);
  const [reportVerifyStatus, setReportVerifyStatus] = useState(null);
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
  const [homeFilterRegistrationType, setHomeFilterRegistrationType] = useState('');
  const [homeFilterType, setHomeFilterType] = useState('');
  const [homeFilterOpenOnly, setHomeFilterOpenOnly] = useState(false);
  const [searchOrigin, setSearchOrigin] = useState(null);
  const [searchOriginQuery, setSearchOriginQuery] = useState('');
  const [searchRadiusKm, setSearchRadiusKm] = useState('25');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('');
  const [tournamentQuery, setTournamentQuery] = useState('');
  const [tournamentStatusFilter, setTournamentStatusFilter] = useState('');
  const [registrationQuery, setRegistrationQuery] = useState('');
  const [registrationStatusFilter, setRegistrationStatusFilter] = useState('');
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [tournamentDialogOpen, setTournamentDialogOpen] = useState(false);
  const [registrationDialogOpen, setRegistrationDialogOpen] = useState(false);
  const [path, navigate] = usePath();
  const [currentUser, setCurrentUser] = useState(null);
  const [postboxOpen, setPostboxOpen] = useState(false);
  const [postbox, setPostbox] = useState({ messages: [], unreadCount: 0, todos: [] });
  const [postboxRecipients, setPostboxRecipients] = useState([]);
  const [postboxRecipientTournaments, setPostboxRecipientTournaments] = useState([]);
  const [postboxRecipientId, setPostboxRecipientId] = useState('');
  const [postboxBody, setPostboxBody] = useState('');
  const [pushMigrationDismissed, setPushMigrationDismissed] = useState(() => localStorage.getItem('ptm_push_migration') === 'dismissed');
  const [users, setUsers] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE_FORM);
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM);
  const [tournamentForm, setTournamentForm] = useState(EMPTY_TOURNAMENT_FORM);
  const [registrationForm, setRegistrationForm] = useState(EMPTY_REGISTRATION_FORM);
  const [registrationInvalidField, setRegistrationInvalidField] = useState(null);
  const [userMode, setUserMode] = useState('create');
  const [tournamentMode, setTournamentMode] = useState('create');
  const [registrationMode, setRegistrationMode] = useState('create');
  const [message, setMessageState] = useState('');
  const [error, setErrorState] = useState('');

  function setMessage(text) {
    setMessageState(text);
    if (text) {
      window.scrollTo(0, 0);
    }
  }

  function setError(text) {
    setErrorState(text);
    if (text) {
      window.scrollTo(0, 0);
    }
  }

  const isAdmin = currentUser?.role === 'admin';
  const canManageTournaments = Boolean(currentUser);
  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedTournamentId) || null;

  const homeHeading = 'Öffentliche Turniere';

  const filteredHomeTournaments = useMemo(() => {
    const query = homeQuery.trim().toLowerCase();
    let results = tournaments.filter((tournament) => {
      if ((tournament.visibility !== 'public' && !isAdmin) || tournament.status === 'draft' || !isUpcoming(tournament)) {
        return false;
      }
      if (homeOnlyMine && !isOwnTournament(tournament, currentUser)) {
        return false;
      }
      if (homeFilterMonth && tournament.date.slice(5, 7) !== homeFilterMonth) {
        return false;
      }
      if (homeFilterFormation === 'andere' ? !tournament.formationOther : (homeFilterFormation && (tournament.formation !== homeFilterFormation || tournament.formationOther))) {
        return false;
      }
      if (homeFilterRegistrationType && tournament.registrationType !== homeFilterRegistrationType) {
        return false;
      }
      if (homeFilterType && tournament.type !== homeFilterType) {
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
    isAdmin,
    homeFilterMonth,
    homeFilterFormation,
    homeFilterRegistrationType,
    homeFilterType,
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

  const filteredTournaments = useMemo(
    () => filterTournaments(manageableTournaments, tournamentQuery, tournamentStatusFilter),
    [manageableTournaments, tournamentQuery, tournamentStatusFilter],
  );

  const filteredRegistrations = useMemo(
    () => filterRegistrations(registrations, registrationQuery, registrationStatusFilter),
    [registrations, registrationQuery, registrationStatusFilter],
  );

  const filteredUsers = useMemo(
    () => filterUsers(users, userQuery, userRoleFilter, userStatusFilter),
    [users, userQuery, userRoleFilter, userStatusFilter],
  );

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
  }, [
    homeQuery,
    homeOnlyMine,
    homeFilterMonth,
    homeFilterFormation,
    homeFilterRegistrationType,
    homeFilterType,
    homeFilterOpenOnly,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset_token');
    const verifyToken = params.get('verify_token');
    const cancelToken = params.get('cancel_token');
    const reportVerifyToken = params.get('report_verify_token');
    const authResult = params.get('auth');
    const authError = params.get('auth_error');
    let pendingAuthMessage = '';
    let pendingAuthError = '';
    if (reportVerifyToken) {
      navigate('/turnier-melden');
      api('/api/tournament-reports/verify', { method: 'POST', body: JSON.stringify({ token: reportVerifyToken }) })
        .then(() => setReportVerifyStatus('success'))
        .catch(() => setReportVerifyStatus('error'));
    }
    if (resetToken) {
      setAuthView('reset');
      setAuthForm((previous) => ({ ...previous, token: resetToken }));
    } else if (verifyToken) {
      setAuthView('verify');
      setAuthForm((previous) => ({ ...previous, token: verifyToken }));
    } else if (cancelToken) {
      setAuthView('cancelRegistration');
      setAuthForm((previous) => ({ ...previous, token: cancelToken }));
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

  const authModalOpen = authView !== 'home' && authView !== 'cancelRegistration';
  const anyDialogOpen =
    menuOpen || searchMenuOpen || homeFilterOpen || postboxOpen || userDialogOpen || tournamentDialogOpen || registrationDialogOpen || authModalOpen;
  const awayFromHome = activeTab !== 'home';
  const desiredNavDepth = (awayFromHome ? 1 : 0) + (anyDialogOpen ? 1 : 0);
  const navDepthRef = useRef(0);
  const navPathRef = useRef(path);
  const suppressNavPopCountRef = useRef(0);

  // Zurück (Handy-Geste/Hardware-Button, Browser) soll offene Dialoge schließen bzw. von einem
  // anderen Tab auf den Hauptbildschirm (Home) zurückkehren, statt die App zu verlassen. Dafür
  // bekommt jede aktive "Ebene" (weg von Home, Dialog offen) genau einen History-Eintrag; wird
  // eine Ebene stattdessen über die UI geschlossen (X, Speichern, Tab-Wechsel), wird der
  // zugehörige Eintrag hier konsumiert, damit Zurück nicht ins Leere läuft. Welche Ebene ein
  // echter Zurück-Druck schließt, wird bewusst erst im Popstate-Handler anhand des aktuellen
  // Zustands entschieden (Dialog vor Tab) statt anhand gemerkter Labels, weil einzelne UI-
  // Aktionen (z. B. Menüpunkt anklicken) Dialog- und Tab-Zustand gleichzeitig ändern können.
  useEffect(() => {
    const pathChanged = navPathRef.current !== path;
    navPathRef.current = path;
    if (pathChanged) {
      // Ein echter Routenwechsel legt bereits einen neuen History-Eintrag an. Offene
      // App-Ebenen liegen darunter und dürfen diesen Eintrag nicht mit history.go()
      // wieder zurücknehmen (z. B. "Turnier melden" aus dem geöffneten Admin-Menü).
      navDepthRef.current = desiredNavDepth;
      return;
    }

    const current = navDepthRef.current;
    if (desiredNavDepth > current) {
      for (let index = current; index < desiredNavDepth; index += 1) {
        window.history.pushState({ ...window.history.state, ptmNav: true }, '');
      }
      navDepthRef.current = desiredNavDepth;
    } else if (desiredNavDepth < current) {
      const removeCount = current - desiredNavDepth;
      navDepthRef.current = desiredNavDepth;
      suppressNavPopCountRef.current += removeCount;
      window.history.go(-removeCount);
    }
  }, [desiredNavDepth, path]);

  useEffect(() => {
    function onPopState() {
      if (suppressNavPopCountRef.current > 0) {
        suppressNavPopCountRef.current -= 1;
        return;
      }
      if (navDepthRef.current <= 0) return;
      navDepthRef.current -= 1;
      if (anyDialogOpen) {
        setMenuOpen(false);
        setSearchMenuOpen(false);
        setHomeFilterOpen(false);
        setPostboxOpen(false);
        setUserDialogOpen(false);
        setTournamentDialogOpen(false);
        setRegistrationDialogOpen(false);
        if (authModalOpen) {
          setAuthView('home');
          clearFeedback();
        }
      } else if (awayFromHome) {
        setActiveTab('home');
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [anyDialogOpen, awayFromHome, authModalOpen]);

  useEffect(() => {
    if (currentUser) {
      loadTournaments();
      loadPostbox();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return undefined;
    const timer = window.setInterval(loadPostbox, 60000);
    return () => window.clearInterval(timer);
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

    // Turniere zuerst laden: der Service Worker kann /api/tournaments aus dem
    // Cache bedienen, auch wenn /api/bootstrap offline fehlschlägt - das darf
    // die öffentliche Turnier-Detailseite offline nicht blockieren.
    await loadTournaments();

    try {
      // /api/bootstrap wird (anders als /api/tournaments) nicht vom Service
      // Worker gecacht, daher auf Mobilfunk anfällig für kurze Netzwerkaussetzer -
      // ein stiller Retry vermeidet unnötige Fehlermeldungen bei bereits
      // erfolgreich geladener Turnierliste.
      const bootstrap = await api('/api/bootstrap').catch(() => api('/api/bootstrap'));
      setNeedsSetup(bootstrap.needsSetup);
      setTurnstileSiteKey(bootstrap.turnstileSiteKey || null);

      if (!bootstrap.needsSetup) {
        try {
          const session = await api('/api/session');
          setCurrentUser(session.user);
        } catch {
          setCurrentUser(null);
        }
      }
    } catch (requestError) {
      // Turnierliste ist bereits geladen und nutzbar; ein fehlgeschlagenes
      // /api/bootstrap blockiert die Finder-Seite nicht und verdient keinen
      // alarmierenden globalen Fehlerbanner.
      console.warn('Bootstrap-Request fehlgeschlagen:', requestError);
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const data = await api('/api/users');
      setUsers(data.users);
    } catch (requestError) {
      setError(translateText(requestError.message, language));
    }
  }

  async function loadTournaments() {
    try {
      const data = await api('/api/tournaments');
      setTournaments(data.tournaments);
      setSelectedTournamentId((previous) => {
        if (previous && data.tournaments.some((tournament) => tournament.id === previous)) {
          return previous;
        }
        const manageable = data.tournaments.find((tournament) => tournament.canManage);
        return manageable?.id || data.tournaments[0]?.id || '';
      });
    } catch (requestError) {
      setError(translateText(requestError.message, language));
    }
  }

  async function loadRegistrations(tournamentId) {
    try {
      const data = await api(`/api/tournaments/${tournamentId}/registrations`);
      setRegistrations(data.registrations);
    } catch (requestError) {
      setError(translateText(requestError.message, language));
    }
  }

  async function loadPostbox() {
    try {
      const [data, recipients] = await Promise.all([api('/api/postbox'), api('/api/postbox/recipients')]);
      setPostbox(data);
      setPostboxRecipients(recipients.recipients);
      setPostboxRecipientTournaments(recipients.tournaments || []);
    } catch (requestError) {
      setError(translateText(requestError.message, language));
    }
  }

  async function handleSendPostboxMessage(event) {
    event.preventDefault();
    try {
      await api('/api/postbox/messages', { method: 'POST', body: JSON.stringify({ recipientId: postboxRecipientId, body: postboxBody }) });
      setPostboxBody('');
      setPostboxRecipientId('');
      await loadPostbox();
    } catch (requestError) {
      setError(translateText(requestError.message, language));
    }
  }

  async function handleOpenPostbox() {
    setMenuOpen(false);
    setSearchMenuOpen(false);
    setPostboxOpen((open) => {
      const willOpen = !open;
      if (willOpen && postbox.unreadCount > 0) {
        api('/api/postbox/read-all', { method: 'POST' })
          .then(loadPostbox)
          .catch((requestError) => setError(translateText(requestError.message, language)));
      }
      return willOpen;
    });
  }

  async function handleReadPostboxMessage(message) {
    if (message.kind === 'direct' && !message.mine && message.senderId) {
      setPostboxRecipientId(message.senderId);
    }
    if (message.recipientId === currentUser?.id && !message.readAt) {
      await api(`/api/postbox/messages/${message.id}/read`, { method: 'POST' });
      await loadPostbox();
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
      setError(translateText(requestError.message, language));
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
        setMessage(translateText(requestError.message, language));
        return;
      }
      setError(translateText(requestError.message, language));
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
      setError(translateText(requestError.message, language));
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
      setError(translateText(requestError.message, language));
    }
  }

  async function handleCancelRegistration(event) {
    event.preventDefault();
    if (!window.confirm(translateText(CANCEL_REGISTRATION_EXPLANATION, language))) {
      return;
    }
    setError('');
    setMessage('');

    try {
      await api('/api/registrations/cancel-by-token', {
        method: 'POST',
        body: JSON.stringify({ token: authForm.token }),
      });
      window.history.replaceState({}, '', window.location.pathname);
      setAuthForm(EMPTY_AUTH_FORM);
      setAuthView('login');
      setMessage(translateText(CANCEL_REGISTRATION_SUCCESS, language));
    } catch (requestError) {
      setError(translateText(requestError.message, language));
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
      setError(translateText(requestError.message, language));
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
      setError(translateText(requestError.message, language));
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
      setError(translateText(requestError.message, language));
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
      setError(translateText(requestError.message, language));
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
    setUserDialogOpen(false);
    setTournamentDialogOpen(false);
    setRegistrationDialogOpen(false);
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
      setUserDialogOpen(false);
      await loadUsers();
    } catch (requestError) {
      setError(translateText(requestError.message, language));
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
      setError(translateText(requestError.message, language));
    }
  }

  async function handleTournamentSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const payload = tournamentPayload(tournamentForm);

    try {
      let data;
      if (tournamentMode === 'edit') {
        data = await api(`/api/tournaments/${tournamentForm.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        await api(`/api/tournaments/${data.tournament.id}/presentation`, {
          method: 'PUT',
          body: JSON.stringify({
            websiteUrl: tournamentForm.websiteUrl,
            logoUrl: tournamentForm.logoUrl,
            flyerUrl: tournamentForm.flyerUrl,
          }),
        });
      } else {
        data = await api('/api/tournaments', { method: 'POST', body: JSON.stringify(payload) });
      }

      setMessage(tournamentMode === 'edit' ? 'Turnier wurde aktualisiert.' : 'Turnier wurde angelegt.');
      setTournamentForm(EMPTY_TOURNAMENT_FORM);
      setTournamentMode('create');
      setTournamentDialogOpen(false);
      await loadTournaments();
      setSelectedTournamentId(data.tournament.id);
    } catch (requestError) {
      setError(translateText(requestError.message, language));
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
      setError(translateText(requestError.message, language));
    }
  }

  async function handleRegistrationSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setRegistrationInvalidField(null);

    const tournamentId = registrationForm.tournamentId || selectedTournamentId;
    const payload = registrationPayload({ ...registrationForm, tournamentId }, language);

    // Dieselbe Funktion bedient sowohl die öffentliche Selbstanmeldung (PublicRegistrationPanel)
    // als auch den Erfassungsdialog des Turniererstellers (RegistrationsManagementPage) - nur
    // Letzterer öffnet über registrationDialogOpen. Die Erfolgsmeldung muss sich unterscheiden:
    // "Du hast dich angemeldet" ergibt keinen Sinn, wenn der Veranstalter eine fremde Meldung erfasst.
    const isManagerEntry = registrationDialogOpen;

    try {
      if (registrationMode === 'edit') {
        await api(`/api/registrations/${registrationForm.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMessage('Anmeldung wurde aktualisiert.');
      } else {
        const result = await api(`/api/tournaments/${tournamentId}/registrations`, { method: 'POST', body: JSON.stringify(payload) });
        setMessage(
          isManagerEntry
            ? `${translateText('Neue Meldung hinzugefügt:', language)} ${result.registration.firstName} ${result.registration.lastName}`
            : result.registration.status === 'pending'
              ? translateText('Deine Anmeldung ist eingegangen und wird vom Turnierleiter geprüft.', language)
              : result.mailEnabled && !result.registration.noEmail
                ? translateText('Du hast dich erfolgreich angemeldet. Deine Teilnahme wurde per E-Mail bestätigt.', language)
                : translateText('Du hast dich erfolgreich angemeldet. Deine Teilnahme ist bestätigt.', language),
        );
      }

      setRegistrationForm(EMPTY_REGISTRATION_FORM);
      setRegistrationMode('create');
      setRegistrationDialogOpen(false);
      setAuthView('home');
      await loadTournaments();
      if (selectedTournament?.canManage) {
        await loadRegistrations(selectedTournament.id);
      }
    } catch (requestError) {
      const baseMessage = translateText(requestError.message, language);
      const conflictName = requestError.payload?.details?.name;
      setError(conflictName ? `${baseMessage} ("${conflictName}")` : baseMessage);
      setRegistrationInvalidField(requestError.payload?.details?.field || null);
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
      setError(translateText(requestError.message, language));
    }
  }

  async function handleConfirmRegistration(registration) {
    setError('');
    setMessage('');
    try {
      const payload = registrationPayload({ ...registration, seedingPosition: registration.seedingPosition ?? '', status: 'confirmed' }, language);
      await api(`/api/registrations/${registration.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setMessage(translateText('Anmeldung wurde bestätigt.', language));
      await loadRegistrations(registration.tournamentId);
      await loadTournaments();
    } catch (requestError) {
      setError(translateText(requestError.message, language));
    }
  }

  async function handleConfirmAllRegistrations() {
    if (!selectedTournament) return;
    setError('');
    setMessage('');
    try {
      const result = await api(`/api/tournaments/${selectedTournament.id}/registrations/confirm-pending`, { method: 'POST' });
      setMessage(`${result.confirmedCount} ${translateText('offene Anmeldung(en) wurden bestätigt.', language)}`);
      await loadRegistrations(selectedTournament.id);
      await loadTournaments();
    } catch (requestError) {
      setError(translateText(requestError.message, language));
    }
  }

  function newUser() {
    setUserMode('create');
    setUserForm(EMPTY_USER_FORM);
    clearFeedback();
    setUserDialogOpen(true);
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
      mailEnabled: user.mailEnabled ?? true,
    });
    clearFeedback();
    setUserDialogOpen(true);
  }

  function closeUserDialog() {
    setUserDialogOpen(false);
    setUserMode('create');
    setUserForm(EMPTY_USER_FORM);
  }

  function newTournament() {
    setTournamentMode('create');
    setTournamentForm(EMPTY_TOURNAMENT_FORM);
    setActiveTab('tournaments');
    clearFeedback();
    setTournamentDialogOpen(true);
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
      locationConfirmed: false,
      description: tournament.description || '',
      type: tournament.type || 'formule_x',
      formation: tournament.formationOther ? 'andere' : (tournament.formation || 'doublette'),
      registrationType: tournament.registrationType || 'forme',
      status: tournament.status || 'draft',
      maxRegistrations: tournament.maxRegistrations || 0,
      registrationDeadline: utcIsoToZonedDateTimeInput(tournament.registrationDeadline, tournament.timezone),
      registrationOpensAt: utcIsoToZonedDateTimeInput(tournament.registrationOpensAt, tournament.timezone),
      timezone: tournament.timezone || '',
      entryFeeAmount: minorUnitsToAmount(tournament.entryFeeCents, tournament.currency || 'EUR'),
      currency: tournament.currency || 'EUR',
      contactName: tournament.contactName || '',
      contactEmail: tournament.contactEmail || '',
      contactPhone: tournament.contactPhone || '',
      visibility: tournament.visibility || 'private',
      internalNotes: tournament.internalNotes || '',
      club: tournament.club || '',
      participantsPublic: Boolean(tournament.participantsPublic),
      approvalRequired: Boolean(tournament.approvalRequired),
      licenseRequired: Boolean(tournament.licenseRequired),
      teamNameEnabled: Boolean(tournament.teamNameEnabled),
      waitlistEnabled: tournament.waitlistEnabled === undefined ? true : Boolean(tournament.waitlistEnabled),
      registrationEnabled: tournament.registrationEnabled === undefined ? true : Boolean(tournament.registrationEnabled),
      websiteUrl: tournament.websiteUrl || '',
      logoUrl: tournament.logoUrl || '',
      flyerUrl: tournament.flyerUrl || '',
    });
    setActiveTab('tournaments');
    clearFeedback();
    setTournamentDialogOpen(true);
  }

  function closeTournamentDialog() {
    setTournamentDialogOpen(false);
    setTournamentMode('create');
    setTournamentForm(EMPTY_TOURNAMENT_FORM);
  }

  function newRegistration() {
    setRegistrationMode('create');
    setRegistrationForm({ ...EMPTY_REGISTRATION_FORM, tournamentId: selectedTournamentId });
    setActiveTab('registrations');
    clearFeedback();
    setRegistrationDialogOpen(true);
  }

  function editRegistration(registration) {
    setRegistrationMode('edit');
    setRegistrationForm({
      id: registration.id,
      tournamentId: registration.tournamentId,
      firstName: registration.firstName || '',
      lastName: registration.lastName || '',
      email: registration.email || '',
      noEmail: Boolean(registration.noEmail),
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
    setRegistrationDialogOpen(true);
  }

  function closeRegistrationDialog() {
    setRegistrationDialogOpen(false);
    setRegistrationMode('create');
    setRegistrationForm(EMPTY_REGISTRATION_FORM);
  }

  function clearFeedback() {
    setError('');
    setMessage('');
    setRegistrationInvalidField(null);
  }

  function resetHomeFilters() {
    setHomeFilterMonth('');
    setHomeFilterFormation('');
    setHomeFilterRegistrationType('');
    setHomeFilterType('');
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
      setGeoError(translateText(requestError.message, language));
    } finally {
      setGeoLoading(false);
    }
  }

  function handleSearchOriginSelect(candidate) {
    setSearchOrigin({ lat: candidate.lat, lng: candidate.lng, label: candidate.displayName });
    setSearchOriginQuery('');
    setGeoError('');
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
      <Suspense fallback={<LazyFallback label={translateText('Wird geladen…', language)} />}>
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
          registrationInvalidField={registrationInvalidField}
          setMessage={setMessage}
          setError={setError}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  if (!needsSetup && path === '/impressum') {
    return (
      <Suspense fallback={<LazyFallback label={translateText('Wird geladen…', language)} />}>
        <ImpressumPage
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  if (!needsSetup && path === '/datenschutz') {
    return (
      <Suspense fallback={<LazyFallback label={translateText('Wird geladen…', language)} />}>
        <DatenschutzPage
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  if (!needsSetup && path === '/turnier-melden') {
    return (
      <Suspense fallback={<LazyFallback label={translateText('Wird geladen…', language)} />}>
        <TournamentReportPage
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          onLogout={handleLogout}
          turnstileSiteKey={turnstileSiteKey}
          verifyStatus={reportVerifyStatus}
        />
      </Suspense>
    );
  }

  if (currentUser && authView === 'cancelRegistration') {
    return (
      <main className="app-shell">
        <StandalonePageHeader
          heading={authTitle(needsSetup, authView)}
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
        <section className="single-column">
          <div className="panel">
            <p className="subtitle">{authSubtitle(needsSetup, authView)}</p>
            <CancelRegistrationForm
              onSubmit={handleCancelRegistration}
              onBack={() => {
                window.history.replaceState({}, '', window.location.pathname);
                setAuthForm(EMPTY_AUTH_FORM);
                setAuthView('home');
                clearFeedback();
              }}
            />
            <Feedback message={message} error={error} />
          </div>
        </section>
      </main>
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
              filterRegistrationType={homeFilterRegistrationType}
              setFilterRegistrationType={setHomeFilterRegistrationType}
              filterType={homeFilterType}
              setFilterType={setHomeFilterType}
              filterOpenOnly={homeFilterOpenOnly}
              setFilterOpenOnly={setHomeFilterOpenOnly}
              onResetFilters={resetHomeFilters}
              searchOrigin={searchOrigin}
              searchOriginQuery={searchOriginQuery}
              setSearchOriginQuery={setSearchOriginQuery}
              onSearchOriginSubmit={handleSearchOriginSubmit}
              onSearchOriginSelect={handleSearchOriginSelect}
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
          <button
            className="drawer-link"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              navigate('/turnier-melden');
            }}
          >
            Turnier melden
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
          filterRegistrationType={homeFilterRegistrationType}
          filterType={homeFilterType}
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

            {authView === 'cancelRegistration' && (
              <CancelRegistrationForm
                onSubmit={handleCancelRegistration}
                onBack={() => {
                  setAuthView('login');
                  clearFeedback();
                }}
                language={language}
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
                language={language}
                currentUser={currentUser}
                invalidField={registrationInvalidField}
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
        : activeTab === 'play'
          ? 'Turnier durchführen'
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
        onLogoClick={() => {
          setActiveTab('home');
          clearFeedback();
        }}
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
              filterRegistrationType={homeFilterRegistrationType}
              setFilterRegistrationType={setHomeFilterRegistrationType}
              filterType={homeFilterType}
              setFilterType={setHomeFilterType}
              filterOpenOnly={homeFilterOpenOnly}
              setFilterOpenOnly={setHomeFilterOpenOnly}
              onResetFilters={resetHomeFilters}
              searchOrigin={searchOrigin}
              searchOriginQuery={searchOriginQuery}
              setSearchOriginQuery={setSearchOriginQuery}
              onSearchOriginSubmit={handleSearchOriginSubmit}
              onSearchOriginSelect={handleSearchOriginSelect}
              onUseMyLocation={handleUseMyLocation}
              onClearSearchOrigin={handleClearSearchOrigin}
              searchRadiusKm={searchRadiusKm}
              setSearchRadiusKm={setSearchRadiusKm}
              geoLoading={geoLoading}
              geoError={geoError}
            />
          ) : null
        }
        postboxControl={
          <PostboxControl
            language={language}
            open={postboxOpen}
            unreadCount={postbox.unreadCount}
            messages={postbox.messages}
            todos={postbox.todos}
            recipients={postboxRecipients}
            recipientTournaments={postboxRecipientTournaments}
            recipientId={postboxRecipientId}
            setRecipientId={setPostboxRecipientId}
            body={postboxBody}
            setBody={setPostboxBody}
            onToggle={handleOpenPostbox}
            onClose={() => setPostboxOpen(false)}
            onRead={handleReadPostboxMessage}
            onSubmit={handleSendPostboxMessage}
            onTodoClick={(type) => {
              setPostboxOpen(false);
              if (type === 'unverified_users') setActiveTab('users');
              else if (type === 'api_key_requests') setActiveTab('apikeys');
              else if (type === 'pending_registrations') {
                setRegistrationStatusFilter('pending');
                setActiveTab('registrations');
              } else if (type === 'waitlist') {
                setRegistrationStatusFilter('waitlist');
                setActiveTab('registrations');
              }
            }}
          />
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
            clearFeedback();
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
              clearFeedback();
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
            clearFeedback();
          }}
        >
          Anmeldungen
        </button>
        {canManageTournaments && (
          <button
            className={`drawer-link ${activeTab === 'play' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setActiveTab('play');
              setMenuOpen(false);
              clearFeedback();
            }}
          >
            Turnier durchführen
          </button>
        )}
        <button
          className="drawer-link"
          type="button"
          onClick={() => {
            setMenuOpen(false);
            clearFeedback();
            navigate('/turnier-melden');
          }}
        >
          Turnier melden
        </button>
        {isAdmin && (
          <button
            className={`drawer-link ${activeTab === 'users' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setActiveTab('users');
              setMenuOpen(false);
              clearFeedback();
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
              clearFeedback();
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

      {currentUser && !pushMigrationDismissed && (
        <PushMigrationNotice
          language={language}
          onDismiss={() => {
            localStorage.setItem('ptm_push_migration', 'dismissed');
            setPushMigrationDismissed(true);
          }}
          onEnabled={() => {
            localStorage.setItem('ptm_push_migration', 'enabled');
            setPushMigrationDismissed(true);
          }}
        />
      )}

      {activeTab === 'home' && (
        <HomeTournaments
          language={language}
          showMineFilter={canManageTournaments}
          onlyMine={homeOnlyMine}
          filterMonth={homeFilterMonth}
          filterFormation={homeFilterFormation}
          filterRegistrationType={homeFilterRegistrationType}
          filterType={homeFilterType}
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
            language={language}
            currentUser={currentUser}
            invalidField={registrationInvalidField}
            embedded
          />
        </AuthModal>
      )}

      {activeTab === 'tournaments' && (
        <Suspense fallback={<LazyFallback label={translateText('Wird geladen…', language)} />}>
          <section className="single-column">
            <TournamentManagement
              tournaments={filteredTournaments}
              totalTournaments={manageableTournaments.length}
              selectedId={selectedTournamentId}
              onSelect={setSelectedTournamentId}
              onEdit={editTournament}
              onDelete={handleDeleteTournament}
              isAdmin={isAdmin}
              language={language}
              onCreate={newTournament}
              query={tournamentQuery}
              onQueryChange={setTournamentQuery}
              statusFilter={tournamentStatusFilter}
              onStatusFilterChange={setTournamentStatusFilter}
              onResetFilters={() => {
                setTournamentQuery('');
                setTournamentStatusFilter('');
              }}
              canManageTournaments={canManageTournaments}
              tournamentDialogOpen={tournamentDialogOpen}
              tournamentMode={tournamentMode}
              tournamentForm={tournamentForm}
              setTournamentForm={setTournamentForm}
              onTournamentSubmit={handleTournamentSubmit}
              onCloseTournamentDialog={closeTournamentDialog}
              users={users}
              currentUser={currentUser}
            />
          </section>
        </Suspense>
      )}

      {activeTab === 'registrations' && (
        <Suspense fallback={<LazyFallback label={translateText('Wird geladen…', language)} />}>
          <section className="single-column">
            <RegistrationsManagement
              tournament={selectedTournament}
              registrations={registrations}
              filteredRegistrations={filteredRegistrations}
              onTournamentChange={setSelectedTournamentId}
              tournaments={manageableTournaments.filter((tournament) => tournament.registrationEnabled !== false)}
              onCreate={newRegistration}
              query={registrationQuery}
              onQueryChange={setRegistrationQuery}
              statusFilter={registrationStatusFilter}
              onStatusFilterChange={setRegistrationStatusFilter}
              onResetFilters={() => {
                setRegistrationQuery('');
                setRegistrationStatusFilter('');
              }}
              onEdit={editRegistration}
              onConfirm={handleConfirmRegistration}
              onConfirmAll={handleConfirmAllRegistrations}
              onDelete={handleDeleteRegistration}
              language={language}
              registrationDialogOpen={registrationDialogOpen}
              registrationMode={registrationMode}
              registrationForm={registrationForm}
              setRegistrationForm={setRegistrationForm}
              onRegistrationSubmit={handleRegistrationSubmit}
              onCloseRegistrationDialog={closeRegistrationDialog}
              manageableTournaments={manageableTournaments}
              selectedTournamentId={selectedTournamentId}
              manageMode={Boolean(selectedTournament?.canManage)}
              invalidField={registrationInvalidField}
            />
          </section>
        </Suspense>
      )}

      {activeTab === 'users' && isAdmin && (
        <Suspense fallback={<LazyFallback label={translateText('Wird geladen…', language)} />}>
          <UserManagementPanel
            users={filteredUsers}
            stats={userStats}
            totalUsers={users.length}
            userMode={userMode}
            currentUser={currentUser}
            userForm={userForm}
            setUserForm={setUserForm}
            userQuery={userQuery}
            setUserQuery={setUserQuery}
            userRoleFilter={userRoleFilter}
            setUserRoleFilter={setUserRoleFilter}
            userStatusFilter={userStatusFilter}
            setUserStatusFilter={setUserStatusFilter}
            dialogOpen={userDialogOpen}
            onCloseDialog={closeUserDialog}
            onCreateUser={newUser}
            onSubmitUser={handleUserSubmit}
            onEditUser={editUser}
            onDeleteUser={handleDeleteUser}
          />
        </Suspense>
      )}

      {activeTab === 'apikeys' && canManageTournaments && (
        <Suspense fallback={<LazyFallback label={translateText('Wird geladen…', language)} />}>
          <section className="single-column">
            <ApiKeysPanel isAdmin={isAdmin} language={language} />
          </section>
        </Suspense>
      )}

      {activeTab === 'play' && canManageTournaments && (
        <Suspense fallback={<LazyFallback label={translateText('Wird geladen…', language)} />}>
          <section className="single-column">
            <TournamentPlayManagement tournaments={manageableTournaments.filter(isOnlinePlayable)} language={language} />
          </section>
        </Suspense>
      )}

      {activeTab === 'profile' && (
        <section className="single-column">
          <ProfilePanel currentUser={currentUser} form={profileForm} setForm={setProfileForm} onSubmit={handleUpdateProfile} />
        </section>
      )}
    </main>
  );
}

export function ProfilePanel({ currentUser, form, setForm, onSubmit }) {
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
        <TextField label="Lizenznummer" value={form.licenseNr} onChange={(licenseNr) => setForm({ ...form, licenseNr })} />
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
            <strong>{formatDate(tournament.date, language)}</strong>
            <small>{formatTournamentStartTime(tournament, language)}</small>
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
            {tournament.visibility === 'private' && (
              <span className="license-badge" title="Nur für Admins sichtbar (Privat)">🔒</span>
            )}
            {tournament.name}
          </strong>
          <span>{tournament.location}</span>
          <small>
            {tournament.registrationEnabled !== false && (
              <>{formationLabel(tournament)} · {labelFor(REGISTRATION_TYPES, tournament.registrationType)} · {labelFor(TOURNAMENT_TYPES, tournament.type)}</>
            )}
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
        {tournament.registrationEnabled !== false && (
          <Button
            variant="secondary"
            onClick={() => onRegister(tournament)}
            disabled={tournament.status !== 'registration' || tournament.visibility !== 'public' || registrationNotYetOpen(tournament)}
          >
            Anmelden
          </Button>
        )}
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
  filterRegistrationType,
  filterType,
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
    filterRegistrationType,
    filterType,
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
                ? `Nächster Termin ${formatDate(nextTournament.date, language)} – Turnier öffnen`
                : 'Kein nächster Termin'
            }
          >
            <strong>{nextTournament ? formatDate(nextTournament.date, language) : 'keiner'}</strong>
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

export function PublicRegistrationPanel({ tournament, form, setForm, onSubmit, onCancel, navigate, language, embedded = false, currentUser = null, invalidField = null }) {
  useEffect(() => {
    if (!form.id && form.tournamentId !== tournament.id) {
      setForm({ ...EMPTY_REGISTRATION_FORM, tournamentId: tournament.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id]);

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
            {(REGISTRATION_OPENS_TEMPLATES[language] || REGISTRATION_OPENS_TEMPLATES.de)(formatTournamentDateTime(tournament.registrationOpensAt, language, tournament.timezone))}
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
            invalidField={invalidField}
          />
          <label className="website-field" aria-hidden="true">
            Website
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => setForm({ ...form, website: event.target.value })}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.publicationNoticeAccepted}
              onChange={(event) => setForm({ ...form, publicationNoticeAccepted: event.target.checked })}
              required
            />
            <span>
              Ich habe verstanden, dass meine Anmeldedaten zur Turnierorganisation verarbeitet werden und mein Name sowie ggf. Verein, Teamname und Partnernamen auf der öffentlichen Turnierseite erscheinen können, wenn der Veranstalter die Teilnehmerliste öffentlich sichtbar schaltet.
              <RequiredMark />
            </span>
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


















