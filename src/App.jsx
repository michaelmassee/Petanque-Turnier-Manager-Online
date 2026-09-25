import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { TOURNAMENT_TYPES, FORMATIONS, REGISTRATION_TYPES, MONTHS, TOURNAMENT_STATUSES, VISIBILITIES, RADIUS_OPTIONS, EMPTY_PROFILE_FORM, EMPTY_AUTH_FORM, EMPTY_TOURNAMENT_REPORT_FORM, EMPTY_REGISTRATION_FORM, REGISTER_SUCCESS, VERIFY_SUCCESS, CANCEL_REGISTRATION_EXPLANATION, CANCEL_REGISTRATION_SUCCESS, PROFILE_UPDATE_SUCCESS, PROFILE_EMAIL_CHANGE_PENDING } from './lib/constants.js';
import i18next from './lib/i18next-config.js';
import { useTranslation } from 'react-i18next';
import { CancelledError, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, authenticatedApi, setSessionExpiredHandler } from './lib/api.js';
import { queryClient } from './lib/query-client.js';
import { pushRecentRecipientValue } from './lib/postboxRecipientStorage.js';
import { usePath, matchTournamentRoute } from './lib/routing.js';
import { useInstallPrompt, isIosSafari, useOnlineStatus, useRoutedTournament } from './lib/hooks.js';
import { DISPLAY_LOCALES, TIMEZONE_HINT_TEMPLATES, MAIL_NOT_ENABLED_HINT_TEMPLATES, REGISTRATION_OPENS_TEMPLATES, PASSWORD_STRENGTH_ERROR, PASSWORD_STRENGTH_HINT, detectViewerTimeZone, formatDate, timezoneAbbrev, formatTournamentDateTime, currencyOptions, formatMoney, formatDateTime, isPasswordStrong } from './lib/format.js';
import { authTitle, authSubtitle, authErrorMessage, googleMapsUrl, tournamentImageUrl, registrationPayload, roleName, labelFor, formationLabel, isOwnTournament, isUpcoming, registrationNotYetOpen, hasOpenRegistration, hasOnlineRegistrationAvailable, isCalendarEntry, SLOTS_FREE_TEMPLATES, REGISTERED_COUNT_TEMPLATES, registrationStatusLabel, API_KEY_STATUS_LABELS, formatTournamentStartTime, formatLocationAddress, distanceKm } from './lib/domain.js';
import { RequiredMark, TextField, TextArea, SelectField, Button, Feedback, EditDialog, DistanceBadge } from './components/ui.jsx';
import { LazyFallback } from './components/LazyFallback.jsx';
import { RegistrationFields } from './components/RegistrationFields.jsx';
import { InfiniteListLoadMore } from './components/InfiniteListLoadMore.jsx';
import { AppHeader, PostboxControl, PushMigrationNotice, SearchMenuControl, SavedSearchesControl, AuthModal, StandalonePageHeader, InstallAppButton, OfflineNotice } from './components/layout.jsx';
import { AuthShell, LanguageSelect, SetupForm, LoginForm, RegisterForm, RegisterSuccessNotice, ForgotPasswordForm, ResendVerificationForm, ResetPasswordForm, VerifyEmailForm, CancelRegistrationForm } from './auth/AuthForms.jsx';

const ImpressumPage = lazy(() => import('./pages/ImpressumPage.jsx'));
const DatenschutzPage = lazy(() => import('./pages/DatenschutzPage.jsx'));
const TournamentReportPage = lazy(() => import('./pages/TournamentReportPage.jsx'));
const TournamentDetailPage = lazy(() => import('./pages/TournamentDetailPage.jsx'));
const TournamentManagement = lazy(() => import('./pages/TournamentManagement.jsx'));
const RegistrationsManagement = lazy(() => import('./pages/RegistrationsManagement.jsx'));
const UserManagementPanel = lazy(() => import('./pages/UserManagementPanel.jsx'));
const ApiKeysPanel = lazy(() => import('./pages/ApiKeysPanel.jsx'));
const OwnApiKeysPanel = lazy(() => import('./pages/ApiKeysPanel.jsx').then((module) => ({ default: module.OwnApiKeysPanel })));
const TournamentPlayManagement = lazy(() => import('./pages/TournamentPlayManagement.jsx'));
const PetanqueAktuellImportPanel = lazy(() => import('./pages/PetanqueAktuellImportPanel.jsx'));
const PlacesPage = lazy(() => import('./pages/PlacesPage.jsx'));
const MyClubsPage = lazy(() => import('./pages/MyClubsPage.jsx'));
const PlayerExchangePage = lazy(() => import('./pages/PlayerExchangePage.jsx'));
const MyPlayerListingsPage = lazy(() => import('./pages/MyPlayerListingsPage.jsx'));
const PlaceReportPage = lazy(() => import('./pages/PlaceReportPage.jsx'));
const PlaceEditByTokenPage = lazy(() => import('./pages/PlaceEditByTokenPage.jsx'));
const ClubModerationPanel = lazy(() => import('./pages/ClubModerationPanel.jsx'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage.jsx'));

export { filterRegistrations, filterTournaments, filterUsers } from './frontend-core.js';
export { EditDialog, ListToolbar } from './components/ui.jsx';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

function ContextualDrawerContent({ area, currentUser, canManageTournaments, activeTab, onSelectTab, onNavigate, onOpenProfile, onLogout, onLogin }) {
  const { t } = useTranslation();
  const closeThen = (action) => () => action();
  const navigate = (path) => closeThen(() => onNavigate(path));
  const selectTab = (tab) => closeThen(() => onSelectTab(tab));

  const showAllAreas = area === 'all';

  return <>
    {(showAllAreas || area === 'turniere') && <div className="drawer-menu-section" aria-label={t('Turniere')}>
      {canManageTournaments && <button className={`drawer-link ${activeTab === 'tournaments' ? 'active' : ''}`} type="button" onClick={selectTab('tournaments')}>{t('Turnierverwaltung')}</button>}
      {currentUser && <button className={`drawer-link ${activeTab === 'registrations' ? 'active' : ''}`} type="button" onClick={selectTab('registrations')}>{t('Anmeldungen')}</button>}
      {canManageTournaments && <button className={`drawer-link ${activeTab === 'play' ? 'active' : ''}`} type="button" onClick={selectTab('play')}>{t('Turnier starten')}</button>}
      <button className="drawer-link" type="button" onClick={navigate('/turnier-melden')}>{t('Turnier melden')}</button>
    </div>}
    {(showAllAreas || area === 'bouleplaetze') && <div className="drawer-menu-section" aria-label={t('Boule-Plätze / Vereine')}>
      <button className="drawer-link" type="button" onClick={navigate('/platz-melden')}>{t('Bouleplatz melden')}</button>
      {currentUser && <button className="drawer-link" type="button" onClick={navigate('/vereine')}>{t('Meine Vereine')}</button>}
    </div>}
    {(showAllAreas || area === 'spielerboerse') && currentUser && <div className="drawer-menu-section" aria-label={t('Boule-Treff')}>
      <button className="drawer-link" type="button" onClick={navigate('/meine-anzeigen')}>{t('Meine Mitspielgesuche')}</button>
    </div>}
    <div className="drawer-menu-section drawer-menu-section-account">
      {currentUser ? (
        <>
          <button className={`drawer-link ${activeTab === 'profile' ? 'active' : ''}`} type="button" onClick={closeThen(onOpenProfile)}>{t('Mein Profil')}</button>
          <button className="drawer-link" type="button" onClick={closeThen(onLogout)}>{t('Abmelden')}</button>
        </>
      ) : (
        <button className="drawer-link" type="button" onClick={closeThen(onLogin)}>{t('Anmelden')}</button>
      )}
    </div>
  </>;
}

function AppContent() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState(() => localStorage.getItem('ptm_language') || 'de');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState(null);
  const [maptilerApiKey, setMaptilerApiKey] = useState(null);
  const [reportVerifyStatus, setReportVerifyStatus] = useState(null);
  const [placeReportVerifyStatus, setPlaceReportVerifyStatus] = useState(null);
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
  const [homeFilterOnlineRegistrationOnly, setHomeFilterOnlineRegistrationOnly] = useState(false);
  const [searchOrigin, setSearchOrigin] = useState(null);
  const [searchOriginQuery, setSearchOriginQuery] = useState('');
  const [searchRadiusKm, setSearchRadiusKm] = useState('25');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [path, navigate] = usePath();
  const [currentUser, setCurrentUser] = useState(null);
  const [postboxOpen, setPostboxOpen] = useState(false);
  const [postbox, setPostbox] = useState({ messages: [], unreadCount: 0, todos: [] });
  const [postboxRecipients, setPostboxRecipients] = useState([]);
  const [postboxRecipientTournaments, setPostboxRecipientTournaments] = useState([]);
  const [postboxRecipientId, setPostboxRecipientId] = useState('');
  const [postboxBody, setPostboxBody] = useState('');
  const [postboxSending, setPostboxSending] = useState(false);
  const [savedSearches, setSavedSearches] = useState([]);
  const [savedSearchesOpen, setSavedSearchesOpen] = useState(false);
  const [savedSearchDialogOpen, setSavedSearchDialogOpen] = useState(false);
  const [savedSearchMode, setSavedSearchMode] = useState('create');
  const [savedSearchForm, setSavedSearchForm] = useState({ id: '', name: '', notifyEnabled: false });
  const [savedSearchSaving, setSavedSearchSaving] = useState(false);
  const [pushMigrationDismissed, setPushMigrationDismissed] = useState(() => localStorage.getItem('ptm_push_migration') === 'dismissed');
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [pendingRegistrationsFilter, setPendingRegistrationsFilter] = useState('');
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE_FORM);
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM);
  const [registrationForm, setRegistrationForm] = useState(EMPTY_REGISTRATION_FORM);
  const [registrationInvalidField, setRegistrationInvalidField] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [registrationSaving, setRegistrationSaving] = useState(false);
  const [authSaving, setAuthSaving] = useState(false);
  const [message, setMessageState] = useState('');
  const [error, setErrorState] = useState('');
  const sessionExpiryHandled = useRef(false);

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

  useEffect(() => {
    if (currentUser) sessionExpiryHandled.current = false;
  }, [currentUser]);

  useEffect(() => setSessionExpiredHandler(() => {
    if (sessionExpiryHandled.current) return;
    sessionExpiryHandled.current = true;
    queryClient.clear();
    setCurrentUser(null);
    setPostboxOpen(false);
    setPostbox({ messages: [], unreadCount: 0, todos: [] });
    setPostboxRecipients([]);
    setPostboxRecipientTournaments([]);
    setPostboxRecipientId('');
    setPostboxBody('');
    setSavedSearches([]);
    setRegistrationForm(EMPTY_REGISTRATION_FORM);
    setActiveTab('home');
    setHomeOnlyMine(false);
    setMessage('');
    setError(t('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.'));
    navigate('/');
    setAuthView('login');
  }), [navigate, queryClient, t]);

  const isAdmin = currentUser?.role === 'admin';
  const canManageTournaments = Boolean(currentUser);
  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedTournamentId) || null;

  const tournamentsQuery = useQuery({ queryKey: ['tournaments'], queryFn: () => api('/api/tournaments') });
  const boulePlacesQuery = useQuery({ queryKey: ['boule-places-for-tournament'], queryFn: () => api('/api/places'), enabled: canManageTournaments });
  const postboxQuery = useQuery({
    queryKey: ['postbox', currentUser?.id],
    queryFn: async () => {
      const [postbox, recipients] = await Promise.all([authenticatedApi('/api/postbox'), authenticatedApi('/api/postbox/recipients')]);
      return { postbox, recipients };
    },
    enabled: Boolean(currentUser),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const homeHeading = t('Öffentliche Turniere');

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
      if (homeFilterOnlineRegistrationOnly && !hasOnlineRegistrationAvailable(tournament)) {
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
    homeFilterOnlineRegistrationOnly,
    searchOrigin,
    searchRadiusKm,
  ]);

  const visibleHomeTournaments = filteredHomeTournaments.slice(0, homeVisibleCount);
  const hasMoreHomeTournaments = filteredHomeTournaments.length > homeVisibleCount;

  const manageableTournaments = useMemo(
    () => tournaments.filter((tournament) => tournament.canManage),
    [tournaments],
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
    const placeReportVerifyToken = params.get('place_report_verify_token');
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
    if (placeReportVerifyToken) {
      navigate('/platz-melden');
      api('/api/place-reports/verify', { method: 'POST', body: JSON.stringify({ token: placeReportVerifyToken }) })
        .then(() => setPlaceReportVerifyStatus('success'))
        .catch(() => setPlaceReportVerifyStatus('error'));
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
      pendingAuthMessage = t('Mit Google angemeldet.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (authResult === 'facebook_success') {
      pendingAuthMessage = t('Mit Facebook angemeldet.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (authError) {
      setAuthView('login');
      pendingAuthError = authErrorMessage(authError);
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
    if (i18next.language !== language) {
      i18next.changeLanguage(language);
    }
  }, [language]);

  const authModalOpen = authView !== 'home' && authView !== 'cancelRegistration';
  const anyDialogOpen =
    menuOpen || searchMenuOpen || homeFilterOpen || postboxOpen || savedSearchesOpen || savedSearchDialogOpen || authModalOpen;
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
        setSavedSearchesOpen(false);
        setSavedSearchDialogOpen(false);
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
    if (!tournamentsQuery.data) return;
    const data = tournamentsQuery.data;
    setTournaments(data.tournaments);
    setSelectedTournamentId((previous) => {
      if (previous && data.tournaments.some((tournament) => tournament.id === previous)) return previous;
      const manageable = data.tournaments.find((tournament) => tournament.canManage);
      return manageable?.id || data.tournaments[0]?.id || '';
    });
  }, [tournamentsQuery.data]);

  useEffect(() => {
    if (!postboxQuery.data) return;
    setPostbox(postboxQuery.data.postbox);
    setPostboxRecipients(postboxQuery.data.recipients.recipients);
    setPostboxRecipientTournaments(postboxQuery.data.recipients.tournaments || []);
  }, [postboxQuery.data]);

  useEffect(() => {
    if (currentUser) {
      loadSavedSearches(true);
    } else {
      setSavedSearches([]);
    }
  }, [currentUser?.id]);

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
      setMaptilerApiKey(bootstrap.maptilerApiKey || null);

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

  async function loadTournaments(silent = false) {
    try {
      const data = await queryClient.fetchQuery({ queryKey: ['tournaments'], queryFn: () => api('/api/tournaments'), staleTime: 0 });
      setTournaments(data.tournaments);
      setSelectedTournamentId((previous) => {
        if (previous && data.tournaments.some((tournament) => tournament.id === previous)) {
          return previous;
        }
        const manageable = data.tournaments.find((tournament) => tournament.canManage);
        return manageable?.id || data.tournaments[0]?.id || '';
      });
    } catch (requestError) {
      // Eine neuere Anfrage mit demselben Query-Key (z.B. durch refetchOnWindowFocus
      // beim Rückflug vom Google-OAuth-Redirect oder durch queryClient.clear() nach
      // dem Login) bricht diese hier ab - keine echte Fehlermeldung wert.
      if (!silent && !(requestError instanceof CancelledError)) setError(requestError.message);
    }
  }

  async function loadPostbox(silent = false) {
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ['postbox', currentUser?.id],
        queryFn: async () => {
          const [postbox, recipients] = await Promise.all([authenticatedApi('/api/postbox'), authenticatedApi('/api/postbox/recipients')]);
          return { postbox, recipients };
        },
        staleTime: 0,
      });
      setPostbox(data.postbox);
      setPostboxRecipients(data.recipients.recipients);
      setPostboxRecipientTournaments(data.recipients.tournaments || []);
    } catch (requestError) {
      if (!silent && !(requestError instanceof CancelledError)) setError(requestError.message);
    }
  }

  async function loadSavedSearches(silent = false) {
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ['savedSearches', currentUser?.id],
        queryFn: () => authenticatedApi('/api/saved-searches'),
        staleTime: 0,
      });
      setSavedSearches(data.savedSearches);
    } catch (requestError) {
      if (!silent && !(requestError instanceof CancelledError)) setError(requestError.message);
    }
  }

  function handleOpenSavedSearches() {
    setMenuOpen(false);
    setSearchMenuOpen(false);
    setSavedSearchesOpen((open) => !open);
  }

  function handleApplySavedSearch(search) {
    setHomeQuery(search.query || '');
    setHomeOnlyMine(Boolean(search.onlyMine));
    setHomeFilterMonth(search.filterMonth || '');
    setHomeFilterFormation(search.filterFormation || '');
    setHomeFilterRegistrationType(search.filterRegistrationType || '');
    setHomeFilterType(search.filterType || '');
    setHomeFilterOpenOnly(Boolean(search.filterOpenOnly));
    setHomeFilterOnlineRegistrationOnly(Boolean(search.filterOnlineRegistrationOnly));
    setSearchRadiusKm(search.radiusKm || '25');
    if (search.searchOrigin) {
      setSearchOrigin({ lat: search.searchOrigin.lat, lng: search.searchOrigin.lng, label: search.searchOrigin.label });
      setSearchOriginQuery(search.searchOrigin.label || '');
    } else {
      setSearchOrigin(null);
      setSearchOriginQuery('');
    }
    setSavedSearchesOpen(false);
    setActiveTab('home');
  }

  function handleOpenSaveSearchDialog() {
    setMenuOpen(false);
    setSearchMenuOpen(false);
    setSavedSearchMode('create');
    setSavedSearchForm({ id: '', name: '', notifyEnabled: false });
    clearFeedback();
    setSavedSearchDialogOpen(true);
  }

  function handleEditSavedSearch(search) {
    setSavedSearchesOpen(false);
    setSavedSearchMode('edit');
    setSavedSearchForm({ id: search.id, name: search.name, notifyEnabled: search.notifyEnabled, sourceSearch: search });
    clearFeedback();
    setSavedSearchDialogOpen(true);
  }

  function buildSavedSearchPayload(name, notifyEnabled) {
    return {
      name,
      query: homeQuery,
      onlyMine: homeOnlyMine,
      filterMonth: homeFilterMonth,
      filterFormation: homeFilterFormation,
      filterRegistrationType: homeFilterRegistrationType,
      filterType: homeFilterType,
      filterOpenOnly: homeFilterOpenOnly,
      filterOnlineRegistrationOnly: homeFilterOnlineRegistrationOnly,
      searchOrigin: searchOrigin ? { lat: searchOrigin.lat, lng: searchOrigin.lng, label: searchOrigin.label } : null,
      radiusKm: searchRadiusKm,
      notifyEnabled,
    };
  }

  async function handleSaveCurrentSearch(event) {
    event.preventDefault();
    setSavedSearchSaving(true);
    setError('');
    setMessage('');
    try {
      if (savedSearchMode === 'edit') {
        const source = savedSearchForm.sourceSearch;
        const payload = {
          name: savedSearchForm.name,
          query: source.query,
          onlyMine: source.onlyMine,
          filterMonth: source.filterMonth,
          filterFormation: source.filterFormation,
          filterRegistrationType: source.filterRegistrationType,
          filterType: source.filterType,
          filterOpenOnly: source.filterOpenOnly,
          filterOnlineRegistrationOnly: source.filterOnlineRegistrationOnly,
          searchOrigin: source.searchOrigin,
          radiusKm: source.radiusKm,
          notifyEnabled: savedSearchForm.notifyEnabled,
        };
        await authenticatedApi(`/api/saved-searches/${savedSearchForm.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMessage(t('Gespeicherte Suche wurde aktualisiert.'));
      } else {
        const payload = buildSavedSearchPayload(savedSearchForm.name, savedSearchForm.notifyEnabled);
        await authenticatedApi('/api/saved-searches', { method: 'POST', body: JSON.stringify(payload) });
        setMessage(t('Suche wurde gespeichert.'));
      }
      setSavedSearchDialogOpen(false);
      await loadSavedSearches();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavedSearchSaving(false);
    }
  }

  async function handleToggleSavedSearchNotify(search) {
    try {
      const payload = {
        name: search.name,
        query: search.query,
        onlyMine: search.onlyMine,
        filterMonth: search.filterMonth,
        filterFormation: search.filterFormation,
        filterRegistrationType: search.filterRegistrationType,
        filterType: search.filterType,
        filterOpenOnly: search.filterOpenOnly,
        filterOnlineRegistrationOnly: search.filterOnlineRegistrationOnly,
        searchOrigin: search.searchOrigin,
        radiusKm: search.radiusKm,
        notifyEnabled: !search.notifyEnabled,
      };
      await authenticatedApi(`/api/saved-searches/${search.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      await loadSavedSearches();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleDeleteSavedSearch(search) {
    if (!window.confirm(t('Gespeicherte Suche "{name}" wirklich löschen?').replace('{name}', search.name))) {
      return;
    }
    setError('');
    setMessage('');
    try {
      await authenticatedApi(`/api/saved-searches/${search.id}`, { method: 'DELETE' });
      setMessage(t('Gespeicherte Suche wurde gelöscht.'));
      await loadSavedSearches();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleSendPostboxMessage(event) {
    event.preventDefault();
    setPostboxSending(true);
    try {
      await authenticatedApi('/api/postbox/messages', { method: 'POST', body: JSON.stringify({ recipientId: postboxRecipientId, body: postboxBody }) });
      pushRecentRecipientValue(currentUser?.id, postboxRecipientId);
      setPostboxBody('');
      setPostboxRecipientId('');
      await loadPostbox();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPostboxSending(false);
    }
  }

  async function handleOpenPostbox() {
    setMenuOpen(false);
    setSearchMenuOpen(false);
    setPostboxOpen((open) => {
      const willOpen = !open;
      if (willOpen && postbox.unreadCount > 0) {
        authenticatedApi('/api/postbox/read-all', { method: 'POST' })
          .then(loadPostbox)
          .catch((requestError) => setError(requestError.message));
      }
      return willOpen;
    });
  }

  async function handleReadPostboxMessage(message) {
    if (message.kind === 'direct' && !message.mine && message.senderId) {
      setPostboxRecipientId(message.senderId);
    }
    if (message.recipientId === currentUser?.id && !message.readAt) {
      await authenticatedApi(`/api/postbox/messages/${message.id}/read`, { method: 'POST' });
      await loadPostbox();
    }
    if (message.eventType === 'saved_search_new_matches' && message.eventData?.tournamentId) {
      setPostboxOpen(false);
      navigate(`/turniere/${message.eventData.tournamentId}`);
    }
  }

  async function handleSetup(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (authForm.password !== authForm.passwordConfirm) {
      setError(t('Die Passwörter stimmen nicht überein.'));
      return;
    }

    if (!isPasswordStrong(authForm.password)) {
      setError(t(PASSWORD_STRENGTH_ERROR));
      return;
    }

    setAuthSaving(true);
    try {
      const data = await api('/api/setup', {
        method: 'POST',
        body: JSON.stringify(authForm),
      });
      queryClient.clear();
      setCurrentUser(data.user);
      setNeedsSetup(false);
      setAuthForm(EMPTY_AUTH_FORM);
      setMessage(t('Admin wurde angelegt.'));
      await loadTournaments();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAuthSaving(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    setAuthSaving(true);
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify(authForm),
      });
      queryClient.clear();
      setCurrentUser(data.user);
      setAuthForm(EMPTY_AUTH_FORM);
      setMessage(t('Angemeldet.'));
      await loadTournaments();
    } catch (requestError) {
      if (requestError.payload?.passwordChangeRequired && requestError.payload.resetToken) {
        setAuthForm({ ...EMPTY_AUTH_FORM, token: requestError.payload.resetToken });
        setAuthView('reset');
        setMessage(requestError.message);
        return;
      }
      setError(requestError.message);
    } finally {
      setAuthSaving(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (authForm.password !== authForm.passwordConfirm) {
      setError(t('Die Passwörter stimmen nicht überein.'));
      return;
    }

    if (!isPasswordStrong(authForm.password)) {
      setError(t(PASSWORD_STRENGTH_ERROR));
      return;
    }

    setAuthSaving(true);
    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({ ...authForm, language }),
      });
      setAuthForm(EMPTY_AUTH_FORM);
      setAuthView('registerSuccess');
      setMessage(data.verificationUrl ? `${t(REGISTER_SUCCESS)} ${data.verificationUrl}` : t(REGISTER_SUCCESS));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAuthSaving(false);
    }
  }

  async function handleVerifyEmail(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    setAuthSaving(true);
    try {
      await api('/api/email/verify', {
        method: 'POST',
        body: JSON.stringify({ token: authForm.token }),
      });
      window.history.replaceState({}, '', window.location.pathname);
      setAuthForm(EMPTY_AUTH_FORM);
      setAuthView('login');
      setMessage(t(VERIFY_SUCCESS));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAuthSaving(false);
    }
  }

  async function handleCancelRegistration(event) {
    event.preventDefault();
    if (!window.confirm(t(CANCEL_REGISTRATION_EXPLANATION))) {
      return;
    }
    setError('');
    setMessage('');

    setAuthSaving(true);
    try {
      await api('/api/registrations/cancel-by-token', {
        method: 'POST',
        body: JSON.stringify({ token: authForm.token }),
      });
      window.history.replaceState({}, '', window.location.pathname);
      setAuthForm(EMPTY_AUTH_FORM);
      setAuthView('login');
      setMessage(t(CANCEL_REGISTRATION_SUCCESS));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAuthSaving(false);
    }
  }

  async function handleUpdateProfile(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (profileForm.newPassword && profileForm.newPassword !== profileForm.newPasswordConfirm) {
      setError(t('Die Passwörter stimmen nicht überein.'));
      return;
    }

    if (profileForm.newPassword && !isPasswordStrong(profileForm.newPassword)) {
      setError(t(PASSWORD_STRENGTH_ERROR));
      return;
    }

    if (profileForm.newPassword && profileForm.newPassword === profileForm.currentPassword) {
      setError(t('Neues Passwort darf nicht mit dem aktuellen Passwort übereinstimmen'));
      return;
    }

    setProfileSaving(true);
    try {
      const data = await authenticatedApi('/api/me', {
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
          ? t(PROFILE_EMAIL_CHANGE_PENDING) + (data.verificationUrl ? ` ${data.verificationUrl}` : '')
          : t(PROFILE_UPDATE_SUCCESS),
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    setAuthSaving(true);
    try {
      const data = await api('/api/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email: authForm.email }),
      });
      setMessage(data.resetUrl ? `${data.message} ${data.resetUrl}` : data.message);
      setAuthForm(EMPTY_AUTH_FORM);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAuthSaving(false);
    }
  }

  async function handleResendVerification(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    setAuthSaving(true);
    try {
      const data = await api('/api/email/resend', {
        method: 'POST',
        body: JSON.stringify({ email: authForm.email, language }),
      });
      setMessage(data.verificationUrl ? `${data.message} ${data.verificationUrl}` : data.message);
      setAuthForm(EMPTY_AUTH_FORM);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAuthSaving(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (authForm.password !== authForm.passwordConfirm) {
      setError(t('Die Passwörter stimmen nicht überein.'));
      return;
    }

    if (!isPasswordStrong(authForm.password)) {
      setError(t(PASSWORD_STRENGTH_ERROR));
      return;
    }

    setAuthSaving(true);
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
      setMessage(t('Passwort wurde geändert. Du kannst dich jetzt anmelden.'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAuthSaving(false);
    }
  }

  async function handleLogout() {
    sessionExpiryHandled.current = true;
    await api('/api/logout', { method: 'POST' });
    await resetSessionState();
  }

  async function handleDeleteAccount(confirmation) {
    if (!window.confirm(t('Konto endgültig löschen? Deine eigenen Turniere werden mit allen Anmeldungen gelöscht. Das kann nicht rückgängig gemacht werden.'))) {
      return;
    }
    setError('');
    setMessage('');
    setAccountDeleting(true);
    try {
      await authenticatedApi('/api/me', { method: 'DELETE', body: JSON.stringify({ confirmation }) });
      sessionExpiryHandled.current = true;
      await resetSessionState();
      setMessage(t('Dein Konto wurde gelöscht.'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAccountDeleting(false);
    }
  }

  async function resetSessionState() {
    queryClient.clear();
    setCurrentUser(null);
    setPostboxOpen(false);
    setPostbox({ messages: [], unreadCount: 0, todos: [] });
    setPostboxRecipients([]);
    setPostboxRecipientTournaments([]);
    setPostboxRecipientId('');
    setPostboxBody('');
    setRegistrationForm(EMPTY_REGISTRATION_FORM);
    setAuthView('home');
    setActiveTab('home');
    setHomeOnlyMine(false);
    setMessage('');
    setError('');
    await loadTournaments();
  }

  async function handleRegistrationSubmit(event, shareToken = '') {
    event.preventDefault();
    setError('');
    setMessage('');
    setRegistrationInvalidField(null);

    const tournamentId = registrationForm.tournamentId || selectedTournamentId;
    const payload = registrationPayload({ ...registrationForm, tournamentId }, language);

    setRegistrationSaving(true);
    try {
      const shareQuery = shareToken ? `?share=${encodeURIComponent(shareToken)}` : '';
      const result = await api(`/api/tournaments/${tournamentId}/registrations${shareQuery}`, { method: 'POST', body: JSON.stringify(payload) });
      setMessage(
        result.registration.status === 'pending'
          ? t('Deine Anmeldung ist eingegangen und wird vom Turnierleiter geprüft.')
          : result.mailEnabled && !result.registration.noEmail
            ? t('Du hast dich erfolgreich angemeldet. Deine Teilnahme wurde per E-Mail bestätigt.')
            : t('Du hast dich erfolgreich angemeldet. Deine Teilnahme ist bestätigt.'),
      );

      setRegistrationForm(EMPTY_REGISTRATION_FORM);
      setAuthView('home');
      await loadTournaments();
    } catch (requestError) {
      const baseMessage = requestError.message;
      const conflictName = requestError.payload?.details?.name;
      setError(conflictName ? `${baseMessage} ("${conflictName}")` : baseMessage);
      setRegistrationInvalidField(requestError.payload?.details?.field || null);
    } finally {
      setRegistrationSaving(false);
    }
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
    setHomeFilterOnlineRegistrationOnly(false);
  }

  function handleUseMyLocation() {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError(t('Geolocation wird von diesem Browser nicht unterstützt.'));
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSearchOrigin({ lat: position.coords.latitude, lng: position.coords.longitude, label: t('Mein Standort') });
        setSearchOriginQuery('');
        setGeoLoading(false);
      },
      (error) => {
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? t('Standort-Zugriff wurde verweigert. Bitte erlaube den Zugriff in den Einstellungen deines Geräts unter Datenschutz > Ortungsdienste.')
            : t('Standort konnte nicht ermittelt werden.'),
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
        setGeoError(t('Kein Ort gefunden.'));
      } else {
        setSearchOrigin({ lat: data.lat, lng: data.lng, label: data.displayName || query });
      }
    } catch (requestError) {
      setGeoError(requestError.message);
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

  function selectDrawerTab(tab) {
    setActiveTab(tab);
    setMenuOpen(false);
    clearFeedback();
    if (path !== '/') navigate('/');
  }

  function navigateFromDrawer(nextPath) {
    setMenuOpen(false);
    clearFeedback();
    navigate(nextPath);
  }

  function openProfileFromDrawer() {
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
    selectDrawerTab('profile');
  }

  function handlePostboxTodoClick(type) {
    setPostboxOpen(false);
    if (type === 'unverified_users') setActiveTab('users');
    else if (type === 'api_key_requests') setActiveTab('apikeys');
    else if (type === 'pending_registrations') {
      setPendingRegistrationsFilter('pending');
      setActiveTab('registrations');
    } else if (type === 'waitlist') {
      setPendingRegistrationsFilter('waitlist');
      setActiveTab('registrations');
    }
    if (path !== '/') navigate('/');
  }

  function renderPostboxControl() {
    if (!currentUser) return null;
    return <PostboxControl
      language={language}
      open={postboxOpen}
      unreadCount={postbox.unreadCount}
      messages={postbox.messages}
      todos={postbox.todos}
      recipients={postboxRecipients}
      recipientTournaments={postboxRecipientTournaments}
      recipientId={postboxRecipientId}
      setRecipientId={setPostboxRecipientId}
      currentUserId={currentUser.id}
      body={postboxBody}
      setBody={setPostboxBody}
      sending={postboxSending}
      onToggle={handleOpenPostbox}
      onClose={() => setPostboxOpen(false)}
      onRead={handleReadPostboxMessage}
      onSubmit={handleSendPostboxMessage}
      onTodoClick={handlePostboxTodoClick}
    />;
  }

  function loginFromDrawer() {
    setMenuOpen(false);
    clearFeedback();
    if (path !== '/') navigate('/');
    setAuthView('login');
  }

  function drawerContent(area) {
    return <ContextualDrawerContent
      area={area}
      currentUser={currentUser}
      canManageTournaments={canManageTournaments}
      activeTab={activeTab}
      onSelectTab={selectDrawerTab}
      onNavigate={navigateFromDrawer}
      onOpenProfile={openProfileFromDrawer}
      onLogout={() => {
        setMenuOpen(false);
        handleLogout();
      }}
      onLogin={loginFromDrawer}
    />;
  }

  if (loading) {
    return <AuthShell title="Pétanque Turnier Manager Online" subtitle={t('App wird geladen.')} language={language} setLanguage={setLanguage} />;
  }

  const tournamentRoute = matchTournamentRoute(path);

  if (!needsSetup && tournamentRoute) {
    return (
      <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
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
          registrationSaving={registrationSaving}
          message={message}
          error={error}
          registrationInvalidField={registrationInvalidField}
          setMessage={setMessage}
          setError={setError}
          isAdmin={isAdmin}
          onSelectAdminDashboard={() => selectDrawerTab('admin-dashboard')}
          onLogout={handleLogout}
          drawerContent={drawerContent('turniere')}
          postboxControl={renderPostboxControl()}
        />
      </Suspense>
    );
  }

  if (!needsSetup && path === '/impressum') {
    return (
      <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
        <ImpressumPage
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onSelectAdminDashboard={() => selectDrawerTab('admin-dashboard')}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  if (!needsSetup && path === '/datenschutz') {
    return (
      <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
        <DatenschutzPage
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onSelectAdminDashboard={() => selectDrawerTab('admin-dashboard')}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  if (!needsSetup && path === '/turnier-melden') {
    return (
      <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
        <TournamentReportPage
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onSelectAdminDashboard={() => selectDrawerTab('admin-dashboard')}
          onLogout={handleLogout}
          turnstileSiteKey={turnstileSiteKey}
          verifyStatus={reportVerifyStatus}
          drawerContent={drawerContent('turniere')}
          postboxControl={renderPostboxControl()}
        />
      </Suspense>
    );
  }

  if (!needsSetup && path === '/platz-melden') {
    return (
      <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
        <PlaceReportPage
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onSelectAdminDashboard={() => selectDrawerTab('admin-dashboard')}
          onLogout={handleLogout}
          turnstileSiteKey={turnstileSiteKey}
          verifyStatus={placeReportVerifyStatus}
          drawerContent={drawerContent('bouleplaetze')}
          postboxControl={renderPostboxControl()}
        />
      </Suspense>
    );
  }

  if (!needsSetup && path === '/platz-bearbeiten') {
    return (
      <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
        <PlaceEditByTokenPage
          language={language}
          setLanguage={setLanguage}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          navigate={navigate}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onSelectAdminDashboard={() => selectDrawerTab('admin-dashboard')}
          onLogout={handleLogout}
          drawerContent={drawerContent('bouleplaetze')}
          postboxControl={renderPostboxControl()}
        />
      </Suspense>
    );
  }

  if (!needsSetup && path === '/plaetze') {
    return <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}><PlacesPage language={language} setLanguage={setLanguage} menuOpen={menuOpen} setMenuOpen={setMenuOpen} navigate={navigate} currentUser={currentUser} isAdmin={isAdmin} onSelectAdminDashboard={() => selectDrawerTab('admin-dashboard')} onLogout={handleLogout} maptilerApiKey={maptilerApiKey} drawerContent={drawerContent('bouleplaetze')} postboxControl={renderPostboxControl()} /></Suspense>;
  }

  if (!needsSetup && currentUser && path === '/vereine') {
    return <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}><MyClubsPage language={language} setLanguage={setLanguage} menuOpen={menuOpen} setMenuOpen={setMenuOpen} navigate={navigate} currentUser={currentUser} isAdmin={isAdmin} onSelectAdminDashboard={() => selectDrawerTab('admin-dashboard')} onLogout={handleLogout} drawerContent={drawerContent('bouleplaetze')} postboxControl={renderPostboxControl()} /></Suspense>;
  }

  if (!needsSetup && path === '/spielerboerse') {
    return <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}><PlayerExchangePage language={language} setLanguage={setLanguage} menuOpen={menuOpen} setMenuOpen={setMenuOpen} navigate={navigate} currentUser={currentUser} isAdmin={isAdmin} onSelectAdminDashboard={() => selectDrawerTab('admin-dashboard')} onLogout={handleLogout} maptilerApiKey={maptilerApiKey} drawerContent={drawerContent('spielerboerse')} postboxControl={renderPostboxControl()} /></Suspense>;
  }

  if (!needsSetup && currentUser && path === '/meine-anzeigen') {
    return <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}><MyPlayerListingsPage language={language} setLanguage={setLanguage} menuOpen={menuOpen} setMenuOpen={setMenuOpen} navigate={navigate} currentUser={currentUser} isAdmin={isAdmin} onSelectAdminDashboard={() => selectDrawerTab('admin-dashboard')} onLogout={handleLogout} drawerContent={drawerContent('spielerboerse')} postboxControl={renderPostboxControl()} /></Suspense>;
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
          isAdmin={isAdmin}
          onSelectAdminDashboard={() => selectDrawerTab('admin-dashboard')}
          onLogout={handleLogout}
        />
        <section className="single-column">
          <div className="panel">
            <p className="subtitle">{authSubtitle(needsSetup, authView)}</p>
            <CancelRegistrationForm
              onSubmit={handleCancelRegistration}
              saving={authSaving}
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
          <SetupForm form={authForm} setForm={setAuthForm} onSubmit={handleSetup} saving={authSaving} />
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
          heading={t('Turniere')}
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
              filterOnlineRegistrationOnly={homeFilterOnlineRegistrationOnly}
              setFilterOnlineRegistrationOnly={setHomeFilterOnlineRegistrationOnly}
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
            {t('Anmelden')}
          </button>
          <div className="drawer-menu-section" aria-label={t('Turniere')}>
            <button
              className="drawer-link"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                navigate('/turnier-melden');
              }}
            >
              {t('Turnier melden')}
            </button>
          </div>
          <a
            className="drawer-link"
            href="https://michaelmassee.github.io/Petanque-Turnier-Manager/"
            target="_blank"
            rel="noreferrer"
          >
            {t('Turniersoftware')}
          </a>
        </AppHeader>

        {/* While a dialog is open it shows the shared message itself – don't duplicate it behind the backdrop. */}
        {authView === 'home' && <Feedback message={message} error={error} />}

        <HomeTournaments
          language={language}
          query={homeQuery}
          showMineFilter={false}
          onlyMine={false}
          filterMonth={homeFilterMonth}
          filterFormation={homeFilterFormation}
          filterRegistrationType={homeFilterRegistrationType}
          filterType={homeFilterType}
          filterOpenOnly={homeFilterOpenOnly}
          filterOnlineRegistrationOnly={homeFilterOnlineRegistrationOnly}
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
                saving={authSaving}
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
                saving={authSaving}
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
                saving={authSaving}
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
                saving={authSaving}
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
                saving={authSaving}
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
                saving={authSaving}
                onBack={() => {
                  setAuthView('login');
                  clearFeedback();
                }}
              />
            )}

            {authView === 'cancelRegistration' && (
              <CancelRegistrationForm
                onSubmit={handleCancelRegistration}
                saving={authSaving}
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
                saving={registrationSaving}
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
      ? t('Mein Profil')
      : activeTab === 'admin-dashboard'
      ? t('Admin Dashboard')
      : activeTab === 'users'
      ? t('Benutzerverwaltung')
      : activeTab === 'clubs'
      ? t('Vereine & Bouleplätze')
      : activeTab === 'apikeys'
        ? t('Alle API-Schlüssel')
        : activeTab === 'petanque-aktuell-import'
          ? t('Pétanque Aktuell importieren')
        : activeTab === 'play'
          ? t('Turnier starten')
          : activeTab === 'registrations'
            ? t('Anmeldungen')
            : activeTab === 'tournaments'
              ? t('Turnierverwaltung')
              : homeHeading;

  const activeTabArea =
    activeTab === 'clubs'
      ? 'bouleplaetze'
      : (activeTab === 'home' || activeTab === 'tournaments' || activeTab === 'registrations' || activeTab === 'play' || activeTab === 'petanque-aktuell-import')
        ? 'turniere'
        : null;

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
        currentUser={currentUser}
        isAdmin={isAdmin}
        onSelectAdminDashboard={() => selectDrawerTab('admin-dashboard')}
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
              filterOnlineRegistrationOnly={homeFilterOnlineRegistrationOnly}
              setFilterOnlineRegistrationOnly={setHomeFilterOnlineRegistrationOnly}
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
              canSaveSearch={Boolean(currentUser)}
              onSaveSearch={handleOpenSaveSearchDialog}
            />
          ) : null
        }
        savedSearchesControl={currentUser ? (
          <SavedSearchesControl
            open={savedSearchesOpen}
            savedSearches={savedSearches}
            onToggle={handleOpenSavedSearches}
            onClose={() => setSavedSearchesOpen(false)}
            onApply={handleApplySavedSearch}
            onToggleNotify={handleToggleSavedSearchNotify}
            onEdit={handleEditSavedSearch}
            onDelete={handleDeleteSavedSearch}
          />
        ) : null}
        postboxControl={renderPostboxControl()}
      >
        <div className="drawer-user">
          <span data-i18n-skip>{currentUser.firstName} {currentUser.lastName}</span>
          <strong>{roleLabel}</strong>
        </div>
        {drawerContent(activeTabArea)}
      </AppHeader>

      {/* While a dialog is open it shows the shared message itself – don't duplicate it behind the backdrop. */}
      {!savedSearchDialogOpen && authView !== 'publicRegistration' && <Feedback message={message} error={error} />}

      <EditDialog
        open={savedSearchDialogOpen}
        title={savedSearchMode === 'edit' ? t('Gespeicherte Suche bearbeiten') : t('Suche speichern')}
        message={message}
        error={error}
        onClose={() => setSavedSearchDialogOpen(false)}
      >
        <form onSubmit={handleSaveCurrentSearch}>
          <TextField
            label={t('Name')}
            value={savedSearchForm.name}
            onChange={(name) => setSavedSearchForm((form) => ({ ...form, name }))}
            required
          />
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={savedSearchForm.notifyEnabled}
              onChange={(event) => setSavedSearchForm((form) => ({ ...form, notifyEnabled: event.target.checked }))}
            />
            {t('notifyOnNewMatches')}
          </label>
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={() => setSavedSearchDialogOpen(false)}>{t('Abbrechen')}</Button>
            <Button type="submit" disabled={savedSearchSaving} loading={savedSearchSaving}>
              {savedSearchMode === 'edit' ? t('Speichern') : t('Anlegen')}
            </Button>
          </div>
        </form>
      </EditDialog>

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
          query={homeQuery}
          showMineFilter={canManageTournaments}
          onlyMine={homeOnlyMine}
          filterMonth={homeFilterMonth}
          filterFormation={homeFilterFormation}
          filterRegistrationType={homeFilterRegistrationType}
          filterType={homeFilterType}
          filterOpenOnly={homeFilterOpenOnly}
          filterOnlineRegistrationOnly={homeFilterOnlineRegistrationOnly}
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
            saving={registrationSaving}
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
        <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
          <section className="single-column">
            <TournamentManagement
              tournaments={tournaments}
              isAdmin={isAdmin}
              language={language}
              currentUser={currentUser}
              boulePlaces={boulePlacesQuery.data?.places || []}
              postboxRecipients={postboxRecipients}
              selectedTournamentId={selectedTournamentId}
              setSelectedTournamentId={setSelectedTournamentId}
              onTournamentsChanged={() => loadTournaments(true)}
            />
          </section>
        </Suspense>
      )}

      {activeTab === 'registrations' && (
        <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
          <section className="single-column">
            <RegistrationsManagement
              tournaments={tournaments}
              selectedTournamentId={selectedTournamentId}
              setSelectedTournamentId={setSelectedTournamentId}
              onTournamentsChanged={() => loadTournaments(true)}
              language={language}
              initialStatusFilter={pendingRegistrationsFilter}
              onInitialStatusFilterConsumed={() => setPendingRegistrationsFilter('')}
            />
          </section>
        </Suspense>
      )}

      {activeTab === 'admin-dashboard' && isAdmin && (
        <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
          <AdminDashboardPage
            onSelectTab={selectDrawerTab}
            onNavigate={navigateFromDrawer}
            tournamentsCount={tournaments.length}
            registrationsCount={tournaments.reduce((sum, tournament) => sum + (tournament.activeRegistrations || 0), 0)}
          />
        </Suspense>
      )}

      {activeTab === 'users' && isAdmin && (
        <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
          <UserManagementPanel
            currentUser={currentUser}
            tournaments={tournaments}
            onTournamentsChanged={() => loadTournaments(true)}
          />
        </Suspense>
      )}

      {(activeTab === 'clubs' || activeTab === 'places') && isAdmin && (
        <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
          <ClubModerationPanel language={language} section={activeTab} />
        </Suspense>
      )}

      {activeTab === 'apikeys' && isAdmin && (
        <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
          <section className="single-column">
            <ApiKeysPanel isAdmin={isAdmin} />
          </section>
        </Suspense>
      )}

      {activeTab === 'petanque-aktuell-import' && isAdmin && (
        <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
          <PetanqueAktuellImportPanel />
        </Suspense>
      )}

      {activeTab === 'play' && canManageTournaments && (
        <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
          <section className="single-column">
            <TournamentPlayManagement tournaments={manageableTournaments} />
          </section>
        </Suspense>
      )}

      {activeTab === 'profile' && (
        <section className="single-column">
          <ProfilePanel currentUser={currentUser} form={profileForm} setForm={setProfileForm} onSubmit={handleUpdateProfile} saving={profileSaving} onDeleteAccount={handleDeleteAccount} deleting={accountDeleting} />
        </section>
      )}
    </main>
  );
}

export function ProfilePanel({ currentUser, form, setForm, onSubmit, saving = false, onDeleteAccount, deleting = false }) {
  const { t } = useTranslation();
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  return (
    <>
      <div className="panel">
        <div className="section-title">
          <h2>{t('Mein Profil')}</h2>
        </div>
        <p className="muted">{t('Bearbeite deinen Namen, deine E-Mail-Adresse und dein Passwort.')}</p>
        {currentUser.pendingEmail && (
          <p className="hint">
            {`${t('Bestätigung ausstehend für')} ${currentUser.pendingEmail}. ${t('Bitte prüfe dein Postfach, um die Änderung abzuschließen.')}`}
          </p>
        )}
        <form className="form" onSubmit={onSubmit}>
          <TextField label={t('Vorname')} value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
          <TextField label={t('Nachname')} value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
          <TextField label={t('E-Mail')} type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
          <TextField label={t('Verein')} value={form.club} onChange={(club) => setForm({ ...form, club })} />
          <TextField label={t('Lizenznummer')} value={form.licenseNr} onChange={(licenseNr) => setForm({ ...form, licenseNr })} />
          <TextField
            label={t('Aktuelles Passwort')}
            type="password"
            value={form.currentPassword}
            onChange={(currentPassword) => setForm({ ...form, currentPassword })}
          />
          <p className="hint">{t('Nur erforderlich, wenn du deine E-Mail-Adresse oder dein Passwort änderst.')}</p>
          <TextField
            label={t('Neues Passwort')}
            type="password"
            value={form.newPassword}
            onChange={(newPassword) => setForm({ ...form, newPassword })}
            minLength={8}
          />
          <p className="hint">{t(PASSWORD_STRENGTH_HINT)}</p>
          <TextField
            label={t('Passwort bestätigen')}
            type="password"
            value={form.newPasswordConfirm}
            onChange={(newPasswordConfirm) => setForm({ ...form, newPasswordConfirm })}
            minLength={8}
          />
          <Button type="submit" loading={saving}>{t('Speichern')}</Button>
        </form>
      </div>
      {onDeleteAccount && (
        <div className="panel">
          <div className="section-title">
            <h2>{t('Konto löschen')}</h2>
          </div>
          <p className="muted">
            {t('Dein Konto und deine eigenen Turniere mit allen Anmeldungen werden endgültig gelöscht. Deine Vereine, Gruppen und Bouleplätze werden an einen Administrator übertragen.')}
          </p>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              onDeleteAccount(deleteConfirmation);
            }}
          >
            <TextField
              label={t('Passwort (bei Google-Anmeldung: E-Mail-Adresse)')}
              type="password"
              value={deleteConfirmation}
              onChange={setDeleteConfirmation}
              required
            />
            <Button type="submit" variant="danger" loading={deleting} disabled={!deleteConfirmation}>{t('Konto löschen')}</Button>
          </form>
        </div>
      )}
      <Suspense fallback={<LazyFallback label={t('Wird geladen…')} />}>
        <OwnApiKeysPanel />
      </Suspense>
    </>
  );
}


function TournamentCard({ tournament, onOpenTournament, onRegister, language }) {
  const { t } = useTranslation();
  const [logoBroken, setLogoBroken] = useState(false);
  const hasLogo = Boolean(tournament.logoUrl) && !logoBroken;

  return (
    <article className={`tournament-card${isCalendarEntry(tournament) ? ' calendar-entry' : ''}`}>
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
              <span className="license-badge" title={t('Lizenznummer erforderlich')}>🪪</span>
            )}
            {tournament.visibility === 'private' && (
              <span className="license-badge" title={t('Nur für Admins sichtbar (Privat)')}>🔒</span>
            )}
            <span data-i18n-skip>{tournament.name}</span>
          </strong>
          <span data-i18n-skip>{formatLocationAddress(tournament.location)}</span>
          <small>
            {tournament.registrationEnabled !== false && (
              <>{formationLabel(tournament)} · {labelFor(REGISTRATION_TYPES, tournament.registrationType)} · {labelFor(TOURNAMENT_TYPES, tournament.type)}</>
            )}
          </small>
          <DistanceBadge distanceKm={tournament.distanceKm} />
        </span>
      </button>
      <div className="tournament-card-meta">
        <span className={`status ${isCalendarEntry(tournament) ? 'status-calendar' : `status-${tournament.status}`}`}>{registrationStatusLabel(tournament, language)}</span>
        {tournament.registrationEnabled !== false && (
          <Button
            variant="secondary"
            onClick={() => onRegister(tournament)}
            disabled={tournament.visibility !== 'public' || !hasOpenRegistration(tournament)}
          >
            {t('Anmelden')}
          </Button>
        )}
      </div>
    </article>
  );
}

export function HomeTournaments({
  language,
  query = '',
  showMineFilter,
  onlyMine,
  filterMonth,
  filterFormation,
  filterRegistrationType,
  filterType,
  filterOpenOnly,
  filterOnlineRegistrationOnly,
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
  const { t } = useTranslation();
  const activeFilterCount = [
    query.trim(),
    showMineFilter && onlyMine,
    filterMonth,
    filterFormation,
    filterRegistrationType,
    filterType,
    filterOpenOnly,
    filterOnlineRegistrationOnly,
  ].filter(Boolean).length;
  const nextTournament = tournaments[0] || null;
  const radiusLabel = labelFor(RADIUS_OPTIONS, searchRadiusKm);
  const resultsRef = useRef(null);
  return (
    <section className="home-tournaments">
      <div className="home-finder">
        <div className="home-finder-copy">
          <p className="eyebrow">Pétanque Turnier Manager Online</p>
          <h2>{t('Finde dein nächstes Pétanque-Turnier')}</h2>
          <p className="subtitle">{t('Suche nach Ort, Verein oder Turniersystem und melde dich direkt online an.')}</p>
        </div>
        <div className="home-finder-stats" aria-label={t('Turniersuche Übersicht')}>
          <button
            type="button"
            onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            aria-label={`${total} ${t('gefundene Turniere – zur Liste springen')}`}
          >
            <strong>{total}</strong>
            <span>{t('Gefundene Turniere')}</span>
          </button>
          <button
            type="button"
            onClick={() => nextTournament && onOpenTournament(nextTournament)}
            disabled={!nextTournament}
            aria-label={
              nextTournament
                ? `${t('Nächster Termin')} ${formatDate(nextTournament.date, language)} ${t('– Turnier öffnen')}`
                : t('Kein nächster Termin')
            }
          >
            <strong>{nextTournament ? formatDate(nextTournament.date, language) : t('keiner')}</strong>
            <span>{t('Nächster Termin')}</span>
          </button>
          <button
            type="button"
            onClick={onOpenFilters}
            aria-label={`${activeFilterCount > 0 ? t('Filter aktiv') : t('Keine Filter aktiv')} ${t('– Filter öffnen')}`}
          >
            <strong>{activeFilterCount > 0 ? t('Filter aktiv') : t('Keine Filter aktiv')}</strong>
            <span>{t('Finder')}</span>
          </button>
          <button type="button" onClick={onOpenRadiusSearch} aria-label={t('Umkreissuche öffnen')}>
            <strong>
              {searchOrigin ? (
                <>
                  {radiusLabel} {t('Umkreis')}
                </>
              ) : (
                t('Umkreissuche aus')
              )}
            </strong>
            <span>
              {searchOrigin ? (
                <>
                  {t('Ausgangspunkt:')} {searchOrigin.label}
                </>
              ) : (
                t('Umkreis')
              )}
            </span>
          </button>
        </div>
      </div>

      <div className="section-title home-results-title" ref={resultsRef}>
        <p className="eyebrow">{t('Alle passenden Turniere')}</p>
        <span className="counter">{total}</span>
      </div>

      {!tournaments.length && (
        <div className="empty-state">
          <strong>{t('Keine Turniere gefunden.')}</strong>
          <p className="muted">{t('Passe die Suche an.')}</p>
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

      <InfiniteListLoadMore hasMore={hasMore} onLoadMore={onLoadMore} label={t('Weitere Turniere laden')} />

    </section>
  );
}

export function PublicRegistrationPanel({ tournament, form, setForm, onSubmit, onCancel, navigate, language, embedded = false, currentUser = null, invalidField = null, saving = false }) {
  const { t } = useTranslation();
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
  const registrationOpen = hasOpenRegistration(tournament);

  return (
    <form className={embedded ? 'public-registration public-registration--embedded' : 'public-registration'} onSubmit={onSubmit}>
      <h2>{t('Anmeldung:')} <span data-i18n-skip>{tournament.name}</span></h2>
      {!registrationOpen ? (
        <>
          {notYetOpen ? (
            <p className="hint">
              {(REGISTRATION_OPENS_TEMPLATES[language] || REGISTRATION_OPENS_TEMPLATES.de)(formatTournamentDateTime(tournament.registrationOpensAt, language, tournament.timezone))}
            </p>
          ) : <p className="hint">{registrationStatusLabel(tournament, language)}</p>}
          <div className="row-actions stretch">
            <Button variant="secondary" onClick={onCancel}>{t('Abbrechen')}</Button>
          </div>
        </>
      ) : (
        <>
          <button className="link-button" type="button" onClick={() => navigate('/datenschutz')}>
            {t('Datenschutzerklärung lesen')}
          </button>
          <RegistrationFields
            form={form}
            setForm={setForm}
            showStatus={false}
            formation={tournament.formation}
            registrationType={tournament.registrationType}
            licenseRequired={tournament.licenseRequired}
            teamNameEnabled={tournament.teamNameEnabled}
            feeTiers={tournament.feeTiers}
            registrationQuestions={tournament.registrationQuestions}
            currency={tournament.currency}
            invalidField={invalidField}
          />
          <TextArea
            label={t('Nachricht an die Turnierleitung')}
            value={form.organizerMessage || ''}
            onChange={(organizerMessage) => setForm({ ...form, organizerMessage })}
            maxLength={250}
          />
          <label className="website-field" aria-hidden="true">
            {t('Website')}
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
              {t('Ich habe verstanden, dass meine Anmeldedaten zur Turnierorganisation verarbeitet werden und mein Name sowie ggf. Verein, Teamname und Partnernamen auf der öffentlichen Turnierseite erscheinen können, wenn der Veranstalter die Teilnehmerliste öffentlich sichtbar schaltet.')}
              <RequiredMark />
            </span>
          </label>
          <div className="row-actions stretch">
            <Button type="submit" loading={saving}>{t('Anmeldung senden')}</Button>
            <Button variant="secondary" onClick={onCancel}>{t('Abbrechen')}</Button>
          </div>
        </>
      )}
    </form>
  );
}
