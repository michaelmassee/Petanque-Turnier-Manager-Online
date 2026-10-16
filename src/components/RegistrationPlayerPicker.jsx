import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { playerSearchTurnstileToken } from '../lib/player-search-turnstile.js';
import { formatUserMeta, formatUserName } from '../lib/userLabel.js';
import { Button, Feedback, TextField } from './ui.jsx';

const MAX_MATCHES = 20;

// Vorschläge wie bei den Postbox-Empfängern: Die Nutzerliste wird einmal geladen (gleicher Query-Key, also
// gemeinsamer Cache mit der Postbox) und lokal gefiltert – keine Serversuche pro Tastendruck. Erst die Auswahl
// lädt E-Mail und Lizenznummer, geschützt durch Turnstile und Rate-Limit. Die Namensfelder bleiben freie Eingabe.
function usePlayerDirectory(currentUserId, currentUser, enabled) {
  const { data } = useQuery({
    queryKey: ['postbox-recipients', currentUserId],
    queryFn: () => authenticatedApi('/api/postbox/recipients'),
    enabled: enabled && Boolean(currentUserId),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    // Die Postbox-Liste enthält das eigene Konto nicht; für die eigene Anmeldung wird es ergänzt.
    const own = currentUser?.id && currentUser.emailVerifiedAt ? [currentUser] : [];
    return [...own, ...(data?.recipients || []).filter((recipient) => recipient.id !== currentUser?.id)]
      .map((recipient) => ({ ...recipient,
        searchText: `${formatUserName(recipient)} ${formatUserMeta(recipient)}`.toLowerCase() }));
  }, [data, currentUser]);
}

export function RegistrationPlayerPicker({ tournamentId, siteKey, shareToken, selected, excludedIds, currentUserId, currentUser,
  firstName, lastName, onNameChange, firstRequired, lastRequired, invalid, onSelect, onClear }) {
  const { t, i18n } = useTranslation();
  const listId = useId();
  const [wanted, setWanted] = useState(false);
  const [typed, setTyped] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuRect, setMenuRect] = useState(null);
  const [focusedField, setFocusedField] = useState('');
  const root = useRef(null);
  const menu = useRef(null);
  const input = useRef(null);
  const challenge = useRef(null);
  const active = useRef(null);
  const directory = usePlayerDirectory(currentUserId, currentUser, wanted);

  const tokens = `${firstName || ''} ${lastName || ''}`.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = useMemo(() => {
    if (!typed || selected || tokens.join('').length < 2) return [];
    return directory.filter((player) => !excludedIds.includes(player.id)
      && tokens.every((token) => player.searchText.includes(token))).slice(0, MAX_MATCHES + 1);
  }, [directory, excludedIds, tokens.join(' '), typed, selected]);
  const visible = open && matches.length > 0;

  function dismiss() {
    setOpen(false); setActiveIndex(-1);
  }
  useEffect(() => () => active.current?.abort(), []);

  useEffect(() => {
    function outside(event) {
      if (!root.current?.contains(event.target) && !menu.current?.contains(event.target)) dismiss();
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    function position() {
      const rect = input.current?.getBoundingClientRect();
      if (rect) setMenuRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [visible, focusedField]);

  async function choose(player) {
    dismiss();
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    setBusy(true); setError('');
    try {
      let turnstileToken;
      try {
        turnstileToken = await playerSearchTurnstileToken(challenge.current, siteKey, 'registration_player_details', i18n.language, controller.signal);
      } catch {
        throw new Error(t('Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.'));
      }
      if (controller.signal.aborted) return;
      const data = await authenticatedApi(`/api/tournaments/${encodeURIComponent(tournamentId)}/registration-players/details`, {
        method: 'POST', body: JSON.stringify({ userId: player.id, turnstileToken, shareToken }), signal: controller.signal,
      });
      if (!controller.signal.aborted) { onSelect(data.player); setTyped(false); }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }

  function keyDown(event) {
    if (event.isComposing) return;
    if (event.key === 'Escape' && visible) { event.preventDefault(); dismiss(); }
    else if (visible && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const last = Math.min(matches.length, MAX_MATCHES) - 1;
      setActiveIndex((index) => event.key === 'ArrowDown' ? Math.min(index + 1, last) : Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && visible && activeIndex >= 0 && matches[activeIndex]) {
      event.preventDefault(); choose(matches[activeIndex]);
    }
  }

  const nameField = (field, label, value, required) => <TextField label={label} value={value || ''}
    required={required} minLength={2} maxLength={100} invalid={invalid} readOnly={Boolean(selected) || busy}
    role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={visible && focusedField === field}
    aria-controls={visible ? listId : undefined}
    aria-activedescendant={visible && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
    data-name-field={field} onKeyDown={keyDown}
    onFocus={(event) => { input.current = event.target; setFocusedField(field); setWanted(true); }}
    onBlur={(event) => {
      if (!root.current?.contains(event.relatedTarget) && !menu.current?.contains(event.relatedTarget)) dismiss();
    }}
    onChange={(nextValue) => {
      onNameChange(field, nextValue); setTyped(true); setOpen(true); setActiveIndex(-1);
    }} />;

  return <div className="registration-player-picker" ref={root}>
    <div className="form-grid">
      {nameField('firstName', t('Vorname'), firstName, firstRequired)}
      {nameField('lastName', t('Nachname'), lastName, lastRequired)}
    </div>
    {selected && <div className="row-actions">
      <span>{t('Mit Benutzerkonto verbunden')}</span>
      <Button variant="secondary" onClick={() => { dismiss(); onClear(); }}>{t('Auswahl aufheben')}</Button>
    </div>}
    <div ref={challenge} />
    {busy && <p className="muted" role="status">{t('Wird geladen…')}</p>}
    <Feedback error={error} />
    {visible && menuRect && createPortal(<ul id={listId} ref={menu} role="listbox" aria-label={t('Suchergebnisse')}
      className="location-autocomplete-results registration-player-matches"
      style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width }}>
      {matches.slice(0, MAX_MATCHES).map((player, index) => <li key={player.id} role="presentation">
        <button type="button" id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}
          className={index === activeIndex ? 'active' : undefined} onMouseEnter={() => setActiveIndex(index)}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(player)}>
          <span data-i18n-skip>{player.firstName} {player.lastName}{player.username ? ` (@${player.username})` : ''}{player.club ? ` · ${player.club}` : ''}</span>
        </button>
      </li>)}
      {matches.length > MAX_MATCHES && <li role="presentation" className="hint">{t('Bitte die Suche eingrenzen, um weitere Spieler zu finden.')}</li>}
    </ul>, document.body)}
  </div>;
}
