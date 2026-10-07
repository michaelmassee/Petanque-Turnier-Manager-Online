import { useEffect, useMemo, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { RequiredMark } from './ui.jsx';
import { formatDate } from '../lib/format.js';
import { formatUserMeta, formatUserName } from '../lib/userLabel.js';
import {
  loadFavoriteRecipientIds,
  toggleFavoriteRecipientId,
  loadRecentRecipientValues,
} from '../lib/postboxRecipientStorage.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Stabiler Default: ein neues [] pro Render würde die Einträge neu berechnen und die Auswahl zurücksetzen.
const NO_TOURNAMENTS = [];

function recipientEntry(recipient) {
  const name = formatUserName(recipient);
  const meta = formatUserMeta(recipient);
  return {
    kind: 'recipient',
    id: recipient.id,
    value: recipient.id,
    label: name,
    meta,
    searchText: `${name} ${meta} ${recipient.username || ''}`.toLowerCase(),
    selectedLabel: recipient.username ? `${name} (@${recipient.username})` : name,
  };
}

// onLookupEmail(email) → Empfänger oder null: findet Nutzer über die exakte E-Mail, ohne sie anzuzeigen.
export function RecipientPicker({ label, recipients, recipientTournaments = NO_TOURNAMENTS, value, onChange, currentUserId, required, onLookupEmail }) {
  const { t, i18n } = useTranslation();
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [displayValue, setDisplayValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuRect, setMenuRect] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState(() => loadFavoriteRecipientIds(currentUserId));
  const [recentValues, setRecentValues] = useState(() => loadRecentRecipientValues(currentUserId));
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const userEditedRef = useRef(false);
  const [emailMatches, setEmailMatches] = useState([]);
  const [emailLookupPending, setEmailLookupPending] = useState(false);

  const entries = useMemo(() => {
    const tournamentEntries = recipientTournaments.map((tournament) => ({
      kind: 'tournament',
      id: `tournament:${tournament.id}`,
      value: `tournament:${tournament.id}`,
      label: `${t('allParticipantsOf').replace('{name}', tournament.name)} · ${formatDate(tournament.date, i18n.language)} · ${t('registrationCount', { count: tournament.registrationCount || 0 })}`,
      // Kurzform fürs Eingabefeld nach der Auswahl, damit es am Handy nicht abgeschnitten wird.
      selectedLabel: `${tournament.name} · ${formatDate(tournament.date, i18n.language)}`,
    }));
    const knownIds = new Set(recipients.map((recipient) => recipient.id));
    const recipientEntries = [...recipients, ...emailMatches.filter((recipient) => !knownIds.has(recipient.id))].map(recipientEntry);
    return [...tournamentEntries, ...recipientEntries];
  }, [recipients, emailMatches, recipientTournaments, t, i18n.language]);

  const trimmedQuery = query.trim().toLowerCase();
  const queryIsEmail = Boolean(onLookupEmail) && EMAIL_PATTERN.test(trimmedQuery);
  useEffect(() => {
    if (!queryIsEmail) return undefined;
    let cancelled = false;
    setEmailLookupPending(true);
    const timer = setTimeout(async () => {
      try {
        const recipient = await onLookupEmail(trimmedQuery);
        if (!cancelled && recipient) {
          setEmailMatches((current) => [...current.filter((entry) => entry.id !== recipient.id), { ...recipient, matchedEmail: trimmedQuery }]);
        }
      } catch {
        // Kein Treffer oder Fehler: Die Liste bleibt leer, die E-Mail wird nicht weiter verraten.
      } finally {
        if (!cancelled) setEmailLookupPending(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [queryIsEmail, trimmedQuery, onLookupEmail]);

  const entryByValue = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => map.set(entry.value, entry));
    return map;
  }, [entries]);

  useEffect(() => {
    setFavoriteIds(loadFavoriteRecipientIds(currentUserId));
    setRecentValues(loadRecentRecipientValues(currentUserId));
  }, [currentUserId]);

  useEffect(() => {
    if (userEditedRef.current) return;
    const entry = value ? entryByValue.get(value) : null;
    setDisplayValue(entry ? entry.selectedLabel : '');
  }, [value, entryByValue]);

  useEffect(() => {
    if (!open) return;
    function updateRect() {
      if (!inputRef.current) return;
      const rect = inputRef.current.getBoundingClientRect();
      setMenuRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event) {
      const insideContainer = containerRef.current && containerRef.current.contains(event.target);
      const insideMenu = menuRef.current && menuRef.current.contains(event.target);
      if (!insideContainer && !insideMenu) {
        closeAndRestore();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  });

  function closeAndRestore() {
    setOpen(false);
    setActiveIndex(-1);
    userEditedRef.current = false;
    const entry = value ? entryByValue.get(value) : null;
    setDisplayValue(entry ? entry.selectedLabel : '');
    setQuery('');
  }

  const visibleSections = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed) {
      const byEmail = new Set(emailMatches.filter((recipient) => recipient.matchedEmail === trimmed).map((recipient) => recipient.id));
      const filtered = entries.filter((entry) => byEmail.has(entry.id) || (entry.searchText || entry.label.toLowerCase()).includes(trimmed));
      return [{ heading: t('searchResults'), items: filtered }];
    }
    const recipientEntries = entries.filter((entry) => entry.kind === 'recipient');
    const tournamentEntries = entries.filter((entry) => entry.kind === 'tournament');
    const favorites = recipientEntries.filter((entry) => favoriteIds.includes(entry.id));
    const favoriteSet = new Set(favorites.map((entry) => entry.id));
    const recents = recentValues
      .map((recentValue) => entryByValue.get(recentValue))
      .filter((entry) => entry && !favoriteSet.has(entry.id));
    const recentSet = new Set(recents.map((entry) => entry.id));
    const rest = recipientEntries.filter((entry) => !favoriteSet.has(entry.id) && !recentSet.has(entry.id));
    const sections = [];
    if (favorites.length) sections.push({ heading: t('favorites'), items: favorites });
    if (recents.length) sections.push({ heading: t('recentRecipients'), items: recents });
    if (tournamentEntries.length) sections.push({ heading: t('allTournamentsSection'), items: tournamentEntries });
    sections.push({ heading: t('allRecipientsSection'), items: rest });
    return sections;
  }, [entries, emailMatches, query, favoriteIds, recentValues, entryByValue, t]);

  const flatItems = useMemo(() => visibleSections.flatMap((section) => section.items), [visibleSections]);

  function handleSelect(entry) {
    userEditedRef.current = false;
    onChange(entry.value);
    setDisplayValue(entry.selectedLabel);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleToggleFavorite(event, entry) {
    event.stopPropagation();
    event.preventDefault();
    setFavoriteIds(toggleFavoriteRecipientId(currentUserId, entry.id));
  }

  function handleKeyDown(event) {
    if (!open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (!flatItems.length) {
      if (event.key === 'Escape') closeAndRestore();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, flatItems.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(flatItems[activeIndex]);
    } else if (event.key === 'Escape') {
      closeAndRestore();
    }
  }

  return (
    <div className="recipient-picker" ref={containerRef}>
      <label>
        {label}
        {required ? <RequiredMark /> : null}
        <input
          ref={inputRef}
          type="text"
          value={open ? query : displayValue}
          placeholder={t('searchRecipient')}
          onFocus={() => {
            setOpen(true);
            setQuery('');
            setFavoriteIds(loadFavoriteRecipientIds(currentUserId));
            setRecentValues(loadRecentRecipientValues(currentUserId));
          }}
          onChange={(event) => {
            userEditedRef.current = true;
            setQuery(event.target.value);
            setActiveIndex(-1);
            if (!open) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          required={required}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
        />
      </label>
      {open && menuRect && createPortal(
        <ul
          id={listboxId}
          ref={menuRef}
          role="listbox"
          className="recipient-picker-results"
          style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width }}
        >
          {flatItems.length === 0 && (
            <li className="recipient-picker-empty muted">
              {queryIsEmail && emailLookupPending ? t('searchingByEmail') : t('noRecipientsFound')}
              {!queryIsEmail && onLookupEmail ? <span className="recipient-picker-hint">{t('recipientEmailSearchHint')}</span> : null}
            </li>
          )}
          {visibleSections.map((section) => (
            section.items.length === 0 ? null : (
              <li key={section.heading} className="recipient-picker-group">
                <span className="recipient-picker-section-heading" role="presentation">{section.heading}</span>
                <ul role="presentation">
                  {section.items.map((entry) => {
                    const index = flatItems.indexOf(entry);
                    return (
                      <li key={entry.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === activeIndex}
                          className={`recipient-picker-option${index === activeIndex ? ' active' : ''}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => handleSelect(entry)}
                        >
                          <span className="recipient-picker-label">{entry.label}</span>
                          {entry.meta ? <small className="recipient-picker-meta">{entry.meta}</small> : null}
                        </button>
                        {entry.kind === 'recipient' && (
                          <button
                            type="button"
                            className="recipient-picker-star"
                            aria-pressed={favoriteIds.includes(entry.id)}
                            aria-label={t('toggleFavorite')}
                            onClick={(event) => handleToggleFavorite(event, entry)}
                          >
                            {favoriteIds.includes(entry.id) ? '★' : '☆'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            )
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
