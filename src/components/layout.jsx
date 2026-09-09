import { useState, useEffect } from 'react';
import { postboxText, translateText } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { useInstallPrompt, isIosSafari, useOnlineStatus } from '../lib/hooks.js';
import { ROLES, MONTHS, FORMATIONS, REGISTRATION_TYPES, TOURNAMENT_TYPES, RADIUS_OPTIONS, TOURNAMENT_STATUSES, REGISTRATION_STATUSES } from '../lib/constants.js';
import { labelFor, roleName } from '../lib/domain.js';
import { EditDialog, SelectField, TextArea, Button } from './ui.jsx';
import { LocationAutocomplete } from './LocationAutocomplete.jsx';

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const { publicKey } = await api('/api/push/public-key');
  const registration = await navigator.serviceWorker.ready;
  const applicationServerKey = base64urlToUint8Array(publicKey);
  const existing = await registration.pushManager.getSubscription();
  const existingKey = existing?.options?.applicationServerKey;
  const keyChanged = existingKey && !sameBytes(new Uint8Array(existingKey), applicationServerKey);
  if (existing && keyChanged) await existing.unsubscribe();
  const subscription = existing && !keyChanged
    ? existing
    : await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  await api('/api/push/subscriptions', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
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

export function PushMigrationNotice({ language, onDismiss, onEnabled }) {
  const [state, setState] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [checking, setChecking] = useState(true);
  const text = (key) => postboxText(language, key);
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

export function PostboxControl({ language, open, unreadCount, messages, todos = [], recipients, recipientTournaments = [], recipientId, setRecipientId, body, setBody, onToggle, onClose, onRead, onSubmit, onTodoClick }) {
  const [pushState, setPushState] = useState('');
  const [pushErrorDetail, setPushErrorDetail] = useState('');
  const [pushActive, setPushActive] = useState(false);
  const text = (key) => postboxText(language, key);

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
              <SelectField label={text('recipient')} value={recipientId} onChange={setRecipientId} options={[
                { value: '', label: text('chooseRecipient') },
                ...recipientTournaments.map((tournament) => ({ value: `tournament:${tournament.id}`, label: text('allParticipantsOf').replace('{name}', tournament.name) })),
                ...recipients.map((recipient) => ({ value: recipient.id, label: `${recipient.firstName} ${recipient.lastName} (${labelFor(ROLES, recipient.role)})` })),
              ]} />
              <TextArea label={text('message')} value={body} onChange={setBody} maxLength={250} />
              <Button type="submit" disabled={!recipientId || !body.trim()}>{text('send')}</Button>
            </form>
            {todos.length > 0 && <div className="postbox-section"><h3>{text('todos')}</h3>{todos.map((todo) => (
              <button className="postbox-todo" key={todo.type} type="button" onClick={() => onTodoClick?.(todo.type)}>
                <strong>{todo.count}</strong> {postboxTodoText(todo.type, language)}
              </button>
            ))}</div>}
            <div className="postbox-section"><h3>{text('messages')}</h3>
              {messages.map((message) => (
                <button className={`postbox-message ${!message.readAt && !message.mine ? 'unread' : ''}`} key={message.id} type="button" onClick={() => onRead(message)}>
                  <strong>{message.kind === 'system' ? text('status') : message.broadcastTournamentName ? (message.mine ? `${text('you')} → ` : `${message.senderName} → `) + text('allParticipantsOf').replace('{name}', message.broadcastTournamentName) : message.mine ? `${text('you')} → ${message.recipientName || ''}` : message.senderName}</strong>
                  <span>{postboxMessageText(message, language)}</span>
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

function postboxMessageText(message, language) {
  if (message.kind === 'direct') return message.body;
  const data = message.eventData || {};
  if (message.eventType === 'tournament_status_changed') return `${data.tournamentName}: Status ${labelFor(TOURNAMENT_STATUSES, data.status)}`;
  if (message.eventType === 'registration_status_changed') return `${data.tournamentName}: Anmeldung ${labelFor(REGISTRATION_STATUSES, data.status)}`;
  return postboxText(language, 'status');
}

function postboxTodoText(type, language) {
  return postboxText(language, `todo_${type}`);
}

export function InstallAppButton() {
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
            Tippe unten auf <strong>Teilen</strong> und dann auf <strong>„Zum Home-Bildschirm"</strong>.
          </p>
        )}
      </div>
    );
  }

  return null;
}

export function AppHeader({ heading, language, setLanguage, menuOpen, onToggleMenu, onCloseMenu, navigate, onLogoClick, searchControl, postboxControl, children }) {
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
        {postboxControl}
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

export function SearchMenuControl({
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
  filterRegistrationType,
  setFilterRegistrationType,
  filterType,
  setFilterType,
  filterOpenOnly,
  setFilterOpenOnly,
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
              <LocationAutocomplete
                label="Umkreissuche: Von diesem Ort aus suchen"
                value={searchOriginQuery}
                onChange={setSearchOriginQuery}
                onSelect={onSearchOriginSelect}
                language={language}
                disabled={geoLoading}
              />
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
                  <SelectField
                    label="Anmeldetyp"
                    value={filterRegistrationType}
                    onChange={setFilterRegistrationType}
                    options={[{ value: '', label: 'Alle Anmeldetypen' }, ...REGISTRATION_TYPES]}
                  />
                  <SelectField
                    label="Turniersystem"
                    value={filterType}
                    onChange={setFilterType}
                    options={[{ value: '', label: 'Alle Turniersysteme' }, ...TOURNAMENT_TYPES]}
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

export function AuthModal({ title, subtitle, message, error, onClose, children }) {
  return (
    <EditDialog title={title} subtitle={subtitle} message={message} error={error} onClose={onClose}>
      {children}
    </EditDialog>
  );
}

export function StandalonePageHeader({ heading, language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, onLogout }) {
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

export function OfflineNotice({ language }) {
  const online = useOnlineStatus();
  if (online) {
    return null;
  }
  return <p className="feedback offline">{translateText('Du bist offline – angezeigte Daten können veraltet sein.', language)}</p>;
}
