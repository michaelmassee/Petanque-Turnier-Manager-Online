import { useEffect, useMemo, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { RequiredMark } from './ui.jsx';
import { loadFavorites, loadRecents, pushRecent, toggleFavorite } from '../lib/pickerStorage.js';

// Durchsuchbare Auswahl mit Favoriten (Stern) und „Zuletzt verwendet“, gemeinsam für Postbox-Empfänger und
// Turnierauswahl. Einträge: { id, value, label, meta?, searchText?, selectedLabel?, group, favoritable? }.
// Ohne Suchbegriff: Favoriten, zuletzt verwendet, danach die Gruppen in Reihenfolge ihres ersten Auftretens.
// storageScope/currentUserId: Bereich und Nutzer für Favoriten und Verlauf (lib/pickerStorage.js).
// recordRecentOnSelect: Auswahl sofort als zuletzt verwendet merken (sonst merkt sich der Aufrufer, z. B. beim Senden).
// matchesQuery(entry, query): zusätzliche Treffer (z. B. Empfänger aus der E-Mail-Suche).
// onQueryChange/renderEmpty: Aufrufer reagiert auf den Suchbegriff und gestaltet den leeren Zustand.
// recentFirst/pageSize: optional zuletzt verwendete Einträge vorziehen und die Anzeige beim Scrollen erweitern.
function selectedText(entry) {
  return entry ? entry.selectedLabel || entry.label : '';
}

export function ComboboxPicker({
  label,
  entries,
  value,
  onChange,
  required,
  placeholder,
  emptyText,
  storageScope,
  currentUserId,
  recordRecentOnSelect = false,
  matchesQuery,
  onQueryChange,
  renderEmpty,
  recentFirst = false,
  pageSize = Infinity,
}) {
  const { t } = useTranslation();
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [displayValue, setDisplayValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuRect, setMenuRect] = useState(null);
  const [visibleLimit, setVisibleLimit] = useState(pageSize);
  const [favoriteIds, setFavoriteIds] = useState(() => loadFavorites(storageScope, currentUserId));
  const [recentValues, setRecentValues] = useState(() => loadRecents(storageScope, currentUserId));
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const userEditedRef = useRef(false);
  const keyboardScrollRef = useRef(false);

  const entryByValue = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => map.set(entry.value, entry));
    return map;
  }, [entries]);

  useEffect(() => {
    setFavoriteIds(loadFavorites(storageScope, currentUserId));
    setRecentValues(loadRecents(storageScope, currentUserId));
  }, [storageScope, currentUserId]);

  useEffect(() => {
    if (userEditedRef.current) return;
    setDisplayValue(selectedText(value ? entryByValue.get(value) : null));
  }, [value, entryByValue]);

  useEffect(() => {
    onQueryChange?.(query);
  }, [query, onQueryChange]);

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
    setDisplayValue(selectedText(value ? entryByValue.get(value) : null));
    setQuery('');
  }

  const visibleSections = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed) {
      const filtered = entries.filter((entry) => matchesQuery?.(entry, trimmed)
        || (entry.searchText || entry.label.toLowerCase()).includes(trimmed));
      return [{ heading: t('searchResults'), items: filtered }];
    }
    const favorites = entries.filter((entry) => entry.favoritable && favoriteIds.includes(entry.id));
    const favoriteSet = new Set(favorites.map((entry) => entry.id));
    const recents = recentValues
      .map((recentValue) => entryByValue.get(recentValue))
      .filter((entry) => entry && (recentFirst || !favoriteSet.has(entry.id)));
    const recentSet = new Set(recents.map((entry) => entry.id));
    const favoriteItems = recentFirst ? favorites.filter((entry) => !recentSet.has(entry.id)) : favorites;
    const pinned = new Set([...favoriteSet, ...recents.map((entry) => entry.id)]);
    const sections = [];
    const favoriteSection = { heading: t('favorites'), items: favoriteItems };
    const recentSection = { heading: t('recentRecipients'), items: recents };
    sections.push(...(recentFirst ? [recentSection, favoriteSection] : [favoriteSection, recentSection]).filter((section) => section.items.length));
    const groups = new Map();
    entries.filter((entry) => !pinned.has(entry.id)).forEach((entry) => {
      if (!groups.has(entry.group)) groups.set(entry.group, []);
      groups.get(entry.group).push(entry);
    });
    groups.forEach((items, heading) => sections.push({ heading, items }));
    return sections;
  }, [entries, query, favoriteIds, recentValues, entryByValue, matchesQuery, recentFirst, t]);

  const flatItems = useMemo(() => visibleSections.flatMap((section) => section.items), [visibleSections]);
  const renderedSections = useMemo(() => {
    let startIndex = 0;
    return visibleSections.map((section) => {
      const items = section.items.slice(0, Math.max(visibleLimit - startIndex, 0));
      const result = { ...section, items, startIndex };
      startIndex += section.items.length;
      return result;
    });
  }, [visibleSections, visibleLimit]);

  useEffect(() => {
    if (!keyboardScrollRef.current) return;
    keyboardScrollRef.current = false;
    menuRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, visibleLimit]);

  function moveActiveIndex(nextIndex) {
    keyboardScrollRef.current = true;
    setVisibleLimit((limit) => Math.max(limit, nextIndex + 1));
    setActiveIndex(nextIndex);
  }

  function handleScroll(event) {
    if (visibleLimit >= flatItems.length) return;
    const menu = event.currentTarget;
    if (menu.scrollHeight - menu.scrollTop - menu.clientHeight < 80) {
      setVisibleLimit((limit) => Math.min(limit + pageSize, flatItems.length));
    }
  }

  function handleSelect(entry) {
    userEditedRef.current = false;
    onChange(entry.value);
    if (recordRecentOnSelect) setRecentValues(pushRecent(storageScope, currentUserId, entry.value));
    setDisplayValue(selectedText(entry));
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleToggleFavorite(event, entry) {
    event.stopPropagation();
    event.preventDefault();
    setFavoriteIds(toggleFavorite(storageScope, currentUserId, entry.id));
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
      moveActiveIndex(Math.min(activeIndex + 1, flatItems.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveIndex(Math.max(activeIndex - 1, 0));
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
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery('');
            setVisibleLimit(pageSize);
            setFavoriteIds(loadFavorites(storageScope, currentUserId));
            setRecentValues(loadRecents(storageScope, currentUserId));
          }}
          onChange={(event) => {
            userEditedRef.current = true;
            setQuery(event.target.value);
            setActiveIndex(-1);
            setVisibleLimit(pageSize);
            if (menuRef.current) menuRef.current.scrollTop = 0;
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
          onScroll={handleScroll}
          style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width }}
        >
          {flatItems.length === 0 && (
            <li className="recipient-picker-empty muted">{renderEmpty ? renderEmpty(query) : emptyText}</li>
          )}
          {renderedSections.map((section) => (
            section.items.length === 0 ? null : (
              <li key={section.heading} className="recipient-picker-group">
                <span className="recipient-picker-section-heading" role="presentation">{section.heading}</span>
                <ul role="presentation">
                  {section.items.map((entry, itemIndex) => {
                    const index = section.startIndex + itemIndex;
                    return (
                      <li key={entry.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === activeIndex}
                          aria-posinset={index + 1}
                          aria-setsize={flatItems.length}
                          className={`recipient-picker-option${index === activeIndex ? ' active' : ''}${entry.unavailable ? ' is-unavailable' : ''}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => handleSelect(entry)}
                        >
                          <span className="recipient-picker-label">
                            {entry.unavailable && <span className="unavailable-mark" aria-hidden="true">✕ </span>}
                            {entry.label}
                          </span>
                          {entry.meta ? <small className="recipient-picker-meta">{entry.meta}</small> : null}
                        </button>
                        {entry.favoritable && (
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
