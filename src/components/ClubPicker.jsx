import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// Uses the same searchable, portal-based combobox behavior as RecipientPicker.
// The value is the stable club ID. The Finder resolves it to the club's
// published venue coordinates before matching tournaments.
export function ClubPicker({ clubs = [], value, onChange }) {
  const { t } = useTranslation();
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [displayValue, setDisplayValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuRect, setMenuRect] = useState(null);
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const userEditedRef = useRef(false);

  const entries = useMemo(() => [{ id: '', value: '', label: t('Alle Vereine') }, ...clubs.map((club) => ({
    id: club.id,
    value: club.id,
    label: club.name,
  }))], [clubs, t]);
  const entryByValue = useMemo(() => new Map(entries.map((entry) => [entry.value, entry])), [entries]);
  const visibleEntries = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term ? entries.filter((entry) => entry.label.toLocaleLowerCase().includes(term)) : entries;
  }, [entries, query]);

  useEffect(() => {
    if (userEditedRef.current) return;
    setDisplayValue(value ? entryByValue.get(value)?.label || value : '');
  }, [value, entryByValue]);

  useEffect(() => {
    if (!open) return undefined;
    function updateRect() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) setMenuRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
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
      setActiveIndex((index) => Math.min(index + 1, visibleEntries.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(visibleEntries[activeIndex]);
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
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={(event) => { userEditedRef.current = true; setQuery(event.target.value); setActiveIndex(-1); if (!open) setOpen(true); }}
          onKeyDown={handleKeyDown}
        />
      </label>
      {open && menuRect && createPortal(
        <ul id={listboxId} ref={menuRef} role="listbox" className="recipient-picker-results" style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width }}>
          {visibleEntries.length === 0 ? <li className="recipient-picker-empty muted">{t('Keine Vereine gefunden')}</li> : visibleEntries.map((entry, index) => (
            <li key={entry.id || 'all'} role="presentation">
              <button type="button" role="option" aria-selected={index === activeIndex} className={`recipient-picker-option${index === activeIndex ? ' active' : ''}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => handleSelect(entry)}>{entry.label}</button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
