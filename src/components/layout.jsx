import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { useInstallPrompt, isIosSafari, useOnlineStatus } from '../lib/hooks.js';
import { MONTHS, FORMATIONS, REGISTRATION_TYPES, TOURNAMENT_TYPES, RADIUS_OPTIONS, TOURNAMENT_STATUSES, REGISTRATION_STATUSES } from '../lib/constants.js';
import { labelFor, roleName, translatedOptions } from '../lib/domain.js';
import { EditDialog, SelectField, TextArea, Button } from './ui.jsx';
import { LocationAutocomplete } from './LocationAutocomplete.jsx';
import { RecipientPicker } from './RecipientPicker.jsx';
import { LanguageSelect } from '../auth/AuthForms.jsx';

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const { publicKey } = await authenticatedApi('/api/push/public-key');
  const registration = await navigator.serviceWorker.ready;
  const applicationServerKey = base64urlToUint8Array(publicKey);
  const existing = await registration.pushManager.getSubscription();
  const existingKey = existing?.options?.applicationServerKey;
  const keyChanged = existingKey && !sameBytes(new Uint8Array(existingKey), applicationServerKey);
  if (existing && keyChanged) await existing.unsubscribe();
  const subscription = existing && !keyChanged
    ? existing
    : await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  await authenticatedApi('/api/push/subscriptions', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
  return 'enabled';
}

function sameBytes(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function hasActivePushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  return Boolean(await registration.pushManager.getSubscription());
}

export function PushMigrationNotice({ onDismiss, onEnabled }) {
  const [state, setState] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [checking, setChecking] = useState(true);
  const { t: text } = useTranslation();
  useEffect(() => {
    let cancelled = false;
    hasActivePushSubscription().then((active) => {
      if (cancelled) return;
      if (active) onEnabled();
      else setChecking(false);
    });
    return () => { cancelled = true; };
  }, []);
  async function enable() {
    try {
      const result = await subscribeToPush();
      setState(result);
      if (result === 'enabled') onEnabled();
    } catch (error) {
      setState('setupError');
      setErrorDetail(error.message || '');
    }
  }
  if (checking) return null;
  return (
    <section className="panel push-migration-notice" aria-label={text('migrationTitle')}>
      <h2>{text('migrationTitle')}</h2>
      <p>{state === 'blocked' ? text('blocked') : text('migrationText')}</p>
      {state && state !== 'enabled' && <p className="hint">{text(state)}{errorDetail ? ` (${errorDetail})` : ''}</p>}
      <div className="dialog-actions"><Button onClick={enable}>{text('enable')}</Button><Button variant="secondary" onClick={onDismiss}>{text('later')}</Button></div>
    </section>
  );
}

export function PostboxControl({ open, unreadCount, messages, todos = [], recipients, recipientTournaments = [], recipientId, setRecipientId, body, setBody, onToggle, onClose, onRead, onSubmit, onTodoClick, currentUserId, sending = false }) {
  const [pushState, setPushState] = useState('');
  const [pushErrorDetail, setPushErrorDetail] = useState('');
  const [pushActive, setPushActive] = useState(false);
  const { t: text } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    hasActivePushSubscription().then((active) => { if (!cancelled) setPushActive(active); });
    return () => { cancelled = true; };
  }, []);

  async function enablePush() {
    try {
      setPushErrorDetail('');
      const result = await subscribeToPush();
      setPushState(result);
      if (result === 'enabled') setPushActive(true);
    } catch (error) {
      setPushState('setupError');
      setPushErrorDetail(error.message || '');
    }
  }

  const badgeCount = unreadCount + todos.reduce((sum, todo) => sum + todo.count, 0);
  return (
    <div className="postbox-menu">
      <button className="postbox-btn" type="button" aria-label={text('inbox')} aria-expanded={open} onClick={onToggle}>
        <svg className="postbox-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3.5 5.5h17v13h-17zM4.5 6.5 12 13l7.5-6.5M4.5 17.5l5.7-5M19.5 17.5l-5.7-5" />
        </svg>
        {badgeCount > 0 && <span className="postbox-badge">{badgeCount > 99 ? '99+' : badgeCount}</span>}
      </button>
      {open && (
        <>
          <div className="search-menu-backdrop" onClick={onClose} />
          <section className="postbox-panel" aria-label={text('inbox')}>
            <div className="section-title"><h2>{text('inbox')}</h2><button className="link-button" type="button" onClick={onClose}>{text('close')}</button></div>
            <div>
              {pushActive
                ? <p className="hint">{text('enabled')}</p>
                : <Button variant="secondary" onClick={enablePush}>{text('enable')}</Button>}
              {pushState && !pushActive && <p className="hint">{text(pushState)}{pushErrorDetail ? ` (${pushErrorDetail})` : ''}</p>}
            </div>
            <form className="form postbox-compose" onSubmit={onSubmit}>
              <RecipientPicker
                label={text('recipient')}
                recipients={recipients}
                recipientTournaments={recipientTournaments}
                value={recipientId}
                onChange={setRecipientId}
                currentUserId={currentUserId}
                required
              />
              <TextArea label={text('message')} value={body} onChange={setBody} maxLength={250} />
              <Button type="submit" disabled={!recipientId || !body.trim()} loading={sending}>{text('send')}</Button>
            </form>
            {todos.length > 0 && <div className="postbox-section"><h3>{text('todos')}</h3>{todos.map((todo) => (
              <button className="postbox-todo" key={todo.type} type="button" onClick={() => onTodoClick?.(todo.type)}>
                <strong>{todo.count}</strong> {postboxTodoText(todo.type, text)}
              </button>
            ))}</div>}
            <div className="postbox-section"><h3>{text('messages')}</h3>
              {messages.map((message) => (
                <button className={`postbox-message ${!message.readAt && !message.mine ? 'unread' : ''}`} key={message.id} type="button" onClick={() => onRead(message)}>
                  <strong>{message.kind === 'system' ? text('status') : message.broadcastTournamentName ? (message.mine ? `${text('you')} → ` : `${message.senderName} → `) + text('allParticipantsOf').replace('{name}', message.broadcastTournamentName) : message.mine ? `${text('you')} → ${message.recipientName || ''}` : message.senderName}</strong>
                  <span>{postboxMessageText(message, text)}</span>
                  <small>{new Date(message.createdAt).toLocaleString()}</small>
                </button>
              ))}
              {messages.length === 0 && <p className="muted">{text('none')}</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function base64urlToUint8Array(value) {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function postboxMessageText(message, t) {
  if (message.kind === 'direct') return message.body;
  const data = message.eventData || {};
  if (message.eventType === 'tournament_status_changed') return `${data.tournamentName}: ${t('Status')} ${labelFor(TOURNAMENT_STATUSES, data.status)}`;
  if (message.eventType === 'registration_status_changed') {
    return `${data.tournamentName}: ${t('registrationFor').replace('{participant}', data.participant || '')} ${labelFor(REGISTRATION_STATUSES, data.status)}`;
  }
  if (message.eventType === 'account_status_changed') {
    const parts = [t('accountRoleUpdated').replace('{role}', roleName(data.role))];
    if (!data.emailVerified) parts.push(t('accountEmailUnverified'));
    if (data.passwordChangeRequired) parts.push(t('accountPasswordChangeRequired'));
    return parts.join(', ');
  }
  if (message.eventType === 'api_key_status_changed') {
    return t(data.status === 'approved' ? 'apiKeyApproved' : 'apiKeyRevoked').replace('{label}', data.label || '');
  }
  if (message.eventType === 'saved_search_new_matches') {
    return t('savedSearchMatchesText').replace('{name}', data.savedSearchName || '').replace('{count}', data.count ?? 0);
  }
  return t('status');
}

function postboxTodoText(type, t) {
  return t(`todo_${type}`);
}

function savedSearchSummary(search, t) {
  const parts = [];
  if (search.query) parts.push(`„${search.query}“`);
  if (search.filterMonth) parts.push(labelFor(MONTHS, search.filterMonth));
  if (search.filterFormation) parts.push(labelFor(FORMATIONS, search.filterFormation));
  if (search.filterRegistrationType) parts.push(labelFor(REGISTRATION_TYPES, search.filterRegistrationType));
  if (search.filterType) parts.push(labelFor(TOURNAMENT_TYPES, search.filterType));
  if (search.filterOpenOnly) parts.push(t('Anmeldung möglich'));
  if (search.filterOnlineRegistrationOnly) parts.push(t('Online-Anmeldung möglich'));
  if (search.searchOrigin) parts.push(`${t('Umkreis')}: ${labelFor(RADIUS_OPTIONS, search.radiusKm)} · ${search.searchOrigin.label}`);
  return parts.length ? parts.join(' · ') : t('Alle Turniere');
}

export function SavedSearchesControl({ open, savedSearches = [], onToggle, onClose, onApply, onToggleNotify, onEdit, onDelete }) {
  const { t } = useTranslation();
  const [notifyBusyId, setNotifyBusyId] = useState(null);
  const [deleteBusyId, setDeleteBusyId] = useState(null);

  async function handleToggleNotify(search) {
    setNotifyBusyId(search.id);
    try {
      await onToggleNotify(search);
    } finally {
      setNotifyBusyId(null);
    }
  }

  async function handleDelete(search) {
    setDeleteBusyId(search.id);
    try {
      await onDelete(search);
    } finally {
      setDeleteBusyId(null);
    }
  }

  return (
    <div className="postbox-menu">
      <button className="postbox-btn" type="button" aria-label={t('savedSearches')} aria-expanded={open} onClick={onToggle}>
        <svg className="postbox-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 3.5h12v17l-6-4-6 4z" />
        </svg>
      </button>
      {open && (
        <>
          <div className="search-menu-backdrop" onClick={onClose} />
          <section className="postbox-panel" aria-label={t('savedSearches')}>
            <div className="section-title"><h2>{t('savedSearches')}</h2><button className="link-button" type="button" onClick={onClose}>{t('close')}</button></div>
            <div className="postbox-section">
              {savedSearches.map((search) => (
                <div className="postbox-message" key={search.id}>
                  <strong data-i18n-skip>{search.name}</strong>
                  <span data-i18n-skip>{savedSearchSummary(search, t)}</span>
                  <div className="dialog-actions">
                    <Button variant="secondary" onClick={() => onApply(search)}>{t('applySavedSearch')}</Button>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={search.notifyEnabled}
                        disabled={notifyBusyId === search.id}
                        onChange={() => handleToggleNotify(search)}
                      />
                      {t('notifyOnNewMatches')}
                    </label>
                    <Button variant="secondary" disabled={deleteBusyId === search.id} onClick={() => onEdit(search)}>{t('Bearbeiten')}</Button>
                    <Button variant="danger" loading={deleteBusyId === search.id} onClick={() => handleDelete(search)}>{t('Löschen')}</Button>
                  </div>
                </div>
              ))}
              {savedSearches.length === 0 && <p className="muted">{t('noSavedSearches')}</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export function InstallAppButton() {
  const { t } = useTranslation();
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [showIosHint, setShowIosHint] = useState(false);

  if (installed) {
    return null;
  }

  if (canInstall) {
    return (
      <button className="drawer-link install-link" type="button" onClick={promptInstall}>
        {t('App installieren')}
      </button>
    );
  }

  if (isIosSafari()) {
    return (
      <div className="install-hint">
        <button className="drawer-link install-link" type="button" onClick={() => setShowIosHint((prev) => !prev)}>
          {t('App installieren')}
        </button>
        {showIosHint && (
          <p className="install-hint-text">
            {t('Tippe unten auf „Teilen" und dann auf „Zum Home-Bildschirm".')}
          </p>
        )}
      </div>
    );
  }

  return null;
}

export function AppHeader({ heading, headingNoTranslate, language, setLanguage, menuOpen, onToggleMenu, onCloseMenu, navigate, onLogoClick, currentUser, searchControl, postboxControl, savedSearchesControl, children }) {
  const { t } = useTranslation();
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const closeLeftPanel = () => setLeftPanelOpen(false);
  const goToTournaments = () => {
    if (onLogoClick) {
      onLogoClick();
    } else if (navigate) {
      navigate('/');
    }
  };
  return (
    <header className="topbar">
      <button
        className="left-menu-btn"
        type="button"
        aria-label={t('Bereiche öffnen')}
        aria-expanded={leftPanelOpen}
        onClick={() => {
          onCloseMenu();
          setLeftPanelOpen((open) => !open);
        }}
      >
        <svg className="left-menu-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" />
          <rect x="13" y="3.5" width="7.5" height="7.5" rx="2" />
          <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" />
          <rect x="13" y="13" width="7.5" height="7.5" rx="2" />
        </svg>
      </button>
      <button
        className="brand brand-link"
        type="button"
        onClick={() => {
          onCloseMenu();
          closeLeftPanel();
          goToTournaments();
        }}
      >
        <img src="/icons/logo.png" alt="Pétanque Turnier Manager Online" className="brand-logo" />
        <div className="brand-text">
          <p className="eyebrow">Pétanque Turnier Manager Online</p>
          <h1 {...(headingNoTranslate ? { 'data-i18n-skip': true } : {})}>{heading}</h1>
        </div>
      </button>
      <div className="topbar-actions-scroll">
        <div className="topbar-actions">
          {searchControl}
          {savedSearchesControl}
          {postboxControl}
          <LanguageSelect language={language} setLanguage={setLanguage} />
          <button
            className="hamburger-btn"
            type="button"
            aria-label={t('Menü öffnen')}
            aria-expanded={menuOpen}
            onClick={() => {
              closeLeftPanel();
              onToggleMenu();
            }}
          >
            <span className="hamburger-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>
      <div
        className={`left-panel-backdrop${leftPanelOpen ? ' open' : ''}`}
        onClick={closeLeftPanel}
        aria-hidden="true"
      />
      <nav
        className={`left-panel${leftPanelOpen ? ' open' : ''}`}
        aria-label={t('Bereiche')}
        inert={!leftPanelOpen}
      >
        <button
          className="left-panel-link"
          type="button"
          onClick={() => {
            closeLeftPanel();
            goToTournaments();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 3 3 9l9 6 9-6z" />
            <path d="M3 9v6l9 6 9-6V9" />
          </svg>
          {t('Turniere')}
        </button>
        <button
          className="left-panel-link"
          type="button"
          onClick={() => {
            closeLeftPanel();
            navigate?.('/plaetze');
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="9" r="7" />
            <path d="M12 21c3-3.6 4.5-6.4 4.5-9" />
            <path d="M12 21c-3-3.6-4.5-6.4-4.5-9" />
          </svg>
          {t('Boule-Plätze / Vereine')}
        </button>
        <button
          className="left-panel-link"
          type="button"
          onClick={() => {
            closeLeftPanel();
            navigate?.('/spielerboerse');
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="8.5" cy="8" r="3" />
            <circle cx="16" cy="9.5" r="2.5" />
            <path d="M3 20c0-3 2.5-5.5 5.5-5.5S14 17 14 20" />
            <path d="M14.5 20c0-2.4 1.8-4.4 4-4.7" />
          </svg>
          {t('Boule-Treff')}
        </button>
      </nav>
      {menuOpen && (
        <>
          <div className="nav-drawer-backdrop" onClick={onCloseMenu} />
          <nav className="nav-drawer" aria-label={t('Hauptmenü')}>
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
                  {t('Impressum')}
                </button>
                <button
                  className="link-button"
                  type="button"
                  onClick={() => {
                    onCloseMenu();
                    navigate('/datenschutz');
                  }}
                >
                  {t('Datenschutz')}
                </button>
              </div>
            )}
            <a
              className="drawer-support"
              href="https://www.paypal.com/paypalme/michaelmassee1"
              target="_blank"
              rel="noreferrer"
            >
              <strong>❤️ {t('Unterstützung')}</strong>
              <span>{t('Wenn dir der Pétanque-Turnier-Manager hilft, freue ich mich über eine Unterstützung via PayPal.')}</span>
            </a>
          </nav>
        </>
      )}
    </header>
  );
}

export function SearchMenuControl({
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
  filterRegistrationType,
  setFilterRegistrationType,
  filterType,
  setFilterType,
  filterOpenOnly,
  setFilterOpenOnly,
  filterOnlineRegistrationOnly,
  setFilterOnlineRegistrationOnly,
  onResetFilters,
  searchOrigin,
  searchOriginQuery,
  setSearchOriginQuery,
  onSearchOriginSubmit,
  onSearchOriginSelect,
  onUseMyLocation,
  onClearSearchOrigin,
  searchRadiusKm,
  setSearchRadiusKm,
  geoLoading,
  geoError,
  canSaveSearch,
  onSaveSearch,
}) {
  const { t } = useTranslation();
  return (
    <div className="search-menu">
      <button
        className="search-menu-btn"
        type="button"
        aria-label={open ? t('Suche schließen') : t('Suche öffnen')}
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
              {t('Turnier suchen')}
              <input
                type="search"
                placeholder={t('Name, Ort oder Turniersystem')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="home-search-actions">
              {showMineFilter && (
                <label className="checkbox-field">
                  <input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)} />
                  {t('Nur meine Turniere')}
                </label>
              )}
              <Button variant="secondary" onClick={() => setFilterOpen((active) => !active)}>
                {filterOpen ? t('Filter ausblenden') : t('Filter anzeigen')}
              </Button>
            </div>

            <form className="home-radius-search" onSubmit={onSearchOriginSubmit}>
              <LocationAutocomplete
                label={t('Umkreissuche: Von diesem Ort aus suchen')}
                value={searchOriginQuery}
                onChange={setSearchOriginQuery}
                onSelect={onSearchOriginSelect}
                disabled={geoLoading}
              />
              <Button type="submit" variant="secondary" disabled={geoLoading} loading={geoLoading}>
                {t('Suchen')}
              </Button>
              <Button type="button" variant="secondary" onClick={onUseMyLocation} disabled={geoLoading} loading={geoLoading}>
                {t('Meinen Standort verwenden')}
              </Button>
              {searchOrigin && (
                <>
                  <SelectField label={t('Umkreis')} value={searchRadiusKm} onChange={setSearchRadiusKm} options={translatedOptions(RADIUS_OPTIONS)} />
                  <span className="search-origin-label">
                    {t('Ausgangspunkt:')} {searchOrigin.label}
                  </span>
                  <button className="link-button" type="button" onClick={onClearSearchOrigin}>
                    {t('Umkreissuche beenden')}
                  </button>
                </>
              )}
            </form>
            {geoError && <p className="feedback error">{geoError}</p>}

            {filterOpen && (
              <div className="filter-panel">
                <div className="filter-grid">
                  <SelectField
                    label={t('Monat')}
                    value={filterMonth}
                    onChange={setFilterMonth}
                    options={[{ value: '', label: t('Alle Monate') }, ...translatedOptions(MONTHS)]}
                  />
                  <SelectField
                    label={t('Formation')}
                    value={filterFormation}
                    onChange={setFilterFormation}
                    options={[{ value: '', label: t('Alle Formationen') }, ...translatedOptions(FORMATIONS)]}
                  />
                  <SelectField
                    label={t('Anmeldetyp')}
                    value={filterRegistrationType}
                    onChange={setFilterRegistrationType}
                    options={[{ value: '', label: t('Alle Anmeldetypen') }, ...translatedOptions(REGISTRATION_TYPES)]}
                  />
                  <SelectField
                    label={t('Turniersystem')}
                    value={filterType}
                    onChange={setFilterType}
                    options={[{ value: '', label: t('Alle Turniersysteme') }, ...translatedOptions(TOURNAMENT_TYPES)]}
                  />
                </div>
                <label className="checkbox-field">
                  <input type="checkbox" checked={filterOpenOnly} onChange={(event) => setFilterOpenOnly(event.target.checked)} />
                  {t('Anmeldung möglich')}
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={filterOnlineRegistrationOnly} onChange={(event) => setFilterOnlineRegistrationOnly(event.target.checked)} />
                  {t('Online-Anmeldung möglich')}
                </label>
                <div className="filter-actions">
                  <button className="link-button" type="button" onClick={onResetFilters}>
                    {t('Zurücksetzen')}
                  </button>
                  {canSaveSearch && (
                    <button className="link-button" type="button" onClick={onSaveSearch}>
                      {t('saveThisSearch')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function AuthModal({ title, subtitle, message, error, onClose, children }) {
  return (
    <EditDialog title={title} subtitle={subtitle} message={message} error={error} onClose={onClose}>
      {children}
    </EditDialog>
  );
}

export function StandalonePageHeader({ heading, headingNoTranslate, language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, onLogout, searchControl, postboxControl, menuExtra, drawerContent }) {
  const { t } = useTranslation();
  return (
    <AppHeader
      heading={heading}
      headingNoTranslate={headingNoTranslate}
      language={language}
      setLanguage={setLanguage}
      menuOpen={menuOpen}
      onToggleMenu={() => setMenuOpen((open) => !open)}
      onCloseMenu={() => setMenuOpen(false)}
      navigate={navigate}
      currentUser={currentUser}
      searchControl={searchControl}
      postboxControl={postboxControl}
    >
      {drawerContent || <>
        <button
        className="drawer-link"
        type="button"
        onClick={() => {
          setMenuOpen(false);
          navigate('/');
        }}
      >
        {t('Zur Startseite')}
        </button>
        {menuExtra}
        {currentUser && (
        <Button
          variant="secondary"
          onClick={() => {
            setMenuOpen(false);
            onLogout();
          }}
        >
          {t('Abmelden')}
        </Button>
        )}
      </>}
    </AppHeader>
  );
}

export function OfflineNotice() {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  if (online) {
    return null;
  }
  return <p className="feedback offline">{t('Du bist offline – angezeigte Daten können veraltet sein.')}</p>;
}
