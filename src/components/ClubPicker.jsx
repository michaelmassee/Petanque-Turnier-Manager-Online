import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { loadFavoriteClubIds, toggleFavoriteClubId } from '../lib/clubPickerStorage.js';

// Uses the same searchable, portal-based combobox behavior as RecipientPicker.
// The value is the stable club ID. The Finder resolves it to the club's
// published venue coordinates before matching tournaments.
export function ClubPicker({ clubs = [], value, onChange, currentUserId }) {
  const { t } = useTranslation();
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [displayValue, setDisplayValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuRect, setMenuRect] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState(() => loadFavoriteClubIds(currentUserId));
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const userEditedRef = useRef(false);

  const allClubsEntry = useMemo(() => ({ id: '', value: '', label: t('Alle Vereine') }), [t]);
  const entries = useMemo(() => clubs.map((club) => ({
    id: club.id,
    value: club.id,
    label: club.name,
  })), [clubs]);
  const entryByValue = useMemo(() => new Map([...entries, allClubsEntry].map((entry) => [entry.value, entry])), [entries, allClubsEntry]);

  useEffect(() => {
    setFavoriteIds(loadFavoriteClubIds(currentUserId));
  }, [currentUserId]);

  const visibleSections = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (term) return [{ heading: t('searchResults'), items: entries.filter((entry) => entry.label.toLocaleLowerCase().includes(term)) }];
    const favorites = entries.filter((entry) => favoriteIds.includes(entry.id));
    const favoriteSet = new Set(favorites.map((entry) => entry.id));
    const rest = entries.filter((entry) => !favoriteSet.has(entry.id));
    return [
      ...(favorites.length ? [{ heading: t('favorites'), items: favorites }] : []),
      { heading: t('Alle Vereine'), items: [allClubsEntry, ...rest] },
    ];
  }, [allClubsEntry, entries, favoriteIds, query, t]);
  const flatItems = useMemo(() => visibleSections.flatMap((section) => section.items), [visibleSections]);

  useEffect(() => {
    if (userEditedRef.current) return;
    setDisplayValue(value ? entryByValue.get(value)?.label || value : '');
  }, [value, entryByValue]);

  useEffect(() => {
    if (!open) return undefined;
    function updateRect() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const topBelow = rect.bottom + 4;
      const availableBelow = viewportHeight - topBelow - 8;
      const availableAbove = rect.top - 8;
      const openAbove = availableBelow < 180 && availableAbove > availableBelow;
      const maxHeight = Math.min(320, Math.max(120, openAbove ? availableAbove - 4 : availableBelow));
      setMenuRect({
        top: openAbove ? Math.max(8, rect.top - maxHeight - 4) : topBelow,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    }
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    window.visualViewport?.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
      window.visualViewport?.removeEventListener('resize', updateRect);
    };
  }, [open]);

  function closeAndRestore() {
    setOpen(false);
    setActiveIndex(-1);
    userEditedRef.current = false;
    setDisplayValue(value ? entryByValue.get(value)?.label || value : '');
    setQuery('');
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (!containerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) closeAndRestore();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  });

  function handleSelect(entry) {
    userEditedRef.current = false;
    onChange(entry.value);
    setDisplayValue(entry.label);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event) {
    if (!open && event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
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
      <label className="home-search-field">
        {t('Verein')}
        <input
          ref={inputRef}
          type="text"
          value={open ? query : displayValue}
          placeholder={t('Verein suchen…')}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          onFocus={() => { setOpen(true); setQuery(''); setFavoriteIds(loadFavoriteClubIds(currentUserId)); }}
          onChange={(event) => { userEditedRef.current = true; setQuery(event.target.value); setActiveIndex(-1); if (!open) setOpen(true); }}
          onKeyDown={handleKeyDown}
        />
      </label>
      {open && menuRect && createPortal(
        <ul id={listboxId} ref={menuRef} role="listbox" className="recipient-picker-results" style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width, maxHeight: menuRect.maxHeight }}>
          {flatItems.length === 0 && <li className="recipient-picker-empty muted">{t('Keine Vereine gefunden')}</li>}
          {visibleSections.map((section) => section.items.length === 0 ? null : (
            <li key={section.heading} className="recipient-picker-group">
              <span className="recipient-picker-section-heading" role="presentation">{section.heading}</span>
              <ul role="presentation">
                {section.items.map((entry) => {
                  const index = flatItems.indexOf(entry);
                  return (
                    <li key={entry.id || 'all'} role="presentation">
                      <button type="button" role="option" aria-selected={index === activeIndex} className={`recipient-picker-option${index === activeIndex ? ' active' : ''}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => handleSelect(entry)}>{entry.label}</button>
                      {entry.id && currentUserId && <button type="button" className="recipient-picker-star" aria-pressed={favoriteIds.includes(entry.id)} aria-label={t('toggleFavorite')} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setFavoriteIds(toggleFavoriteClubId(currentUserId, entry.id)); }}>{favoriteIds.includes(entry.id) ? '★' : '☆'}</button>}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
