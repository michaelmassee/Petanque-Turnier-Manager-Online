import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { RequiredMark } from './ui.jsx';

export function LocationAutocomplete({ label, value, onChange, onSelect, confirmed, required, minLength, disabled }) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searched, setSearched] = useState(false);
  const [menuRect, setMenuRect] = useState(null);
  const requestIdRef = useRef(0);
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const lastSelectedValueRef = useRef(null);
  const userEditedRef = useRef(false);

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
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    if (!userEditedRef.current || value === lastSelectedValueRef.current) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api('/api/geocode', { method: 'POST', body: JSON.stringify({ query }) });
        if (requestIdRef.current !== requestId) return;
        setSuggestions(data.results || []);
        setSearched(true);
        setOpen(true);
        setActiveIndex(-1);
      } catch {
        if (requestIdRef.current !== requestId) return;
        setSuggestions([]);
        setSearched(true);
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      const insideContainer = containerRef.current && containerRef.current.contains(event.target);
      const insideMenu = menuRef.current && menuRef.current.contains(event.target);
      if (!insideContainer && !insideMenu) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(candidate) {
    lastSelectedValueRef.current = candidate.displayName;
    onSelect(candidate);
    setOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(event) {
    if (!open || !suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const showHint = !confirmed && searched && !loading && !open && value.trim().length >= 3;

  return (
    <div className="location-autocomplete" ref={containerRef}>
      <label>
        {label}
        {required ? <RequiredMark /> : null}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => {
            userEditedRef.current = true;
            onChange(event.target.value);
          }}
          onFocus={() => suggestions.length && setOpen(true)}
          onKeyDown={handleKeyDown}
          required={required}
          minLength={minLength}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
      </label>
      {open && suggestions.length > 0 && menuRect && createPortal(
        <ul
          ref={menuRef}
          className="location-autocomplete-results"
          style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width }}
        >
          {suggestions.map((candidate, index) => (
            <li key={`${candidate.lat}-${candidate.lng}-${index}`}>
              <button
                type="button"
                className={index === activeIndex ? 'active' : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleSelect(candidate)}
              >
                {candidate.displayName}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
      {loading && (
        <p className="location-autocomplete-status muted">{t('Orte werden gesucht…')}</p>
      )}
      {confirmed && !loading && (
        <p className="location-autocomplete-status success">
          ✓ {t('Ausgewählt:')} {value}
        </p>
      )}
      {showHint && (
        <p className="location-autocomplete-status hint">
          {suggestions.length === 0
            ? t('Kein Ort gefunden. Bitte Eingabe prüfen.')
            : t('Bitte Ort aus der Liste auswählen, um Mehrdeutigkeiten zu vermeiden.')}
        </p>
      )}
    </div>
  );
}
