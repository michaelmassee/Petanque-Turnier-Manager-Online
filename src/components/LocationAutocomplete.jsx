import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { RequiredMark } from './ui.jsx';

const EMPTY_PLACES = [];

export function LocationAutocomplete({ label, value, onChange, onSelect, confirmed, required, minLength, disabled, places = EMPTY_PLACES }) {
  const { t } = useTranslation();
  const listId = useId();
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
  const [focused, setFocused] = useState(false);
  const cacheRef = useRef(new Map());
  const [composing, setComposing] = useState(false);
  const localMatches = useMemo(() => {
    const tokens = value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    if (tokens.join('').length < 2 || !userEditedRef.current || confirmed) return [];
    return places.filter((place) => {
      const text = `${place.clubName || ''} ${place.name || ''} ${place.address || ''}`.toLocaleLowerCase();
      return tokens.every((token) => text.includes(token));
    }).slice(0, 20).map((place) => ({
      boulePlaceId: place.id, displayName: place.address, lat: place.latitude, lng: place.longitude,
      label: [place.clubName, place.name, place.address].filter(Boolean).join(' · '),
    }));
  }, [places, value, confirmed]);
  const matches = [...localMatches, ...suggestions];

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
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setSuggestions([]);
    setSearched(false);
    setLoading(false);
    if (query.length < 3 || !focused || composing || disabled || confirmed || !userEditedRef.current || value === lastSelectedValueRef.current) return;
    const cached = cacheRef.current.get(query.toLocaleLowerCase());
    if (cached && Date.now() - cached.time < 240_000) {
      setSuggestions(cached.results);
      setSearched(true);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api('/api/geocode', { method: 'POST', body: JSON.stringify({ query }), signal: controller.signal });
        if (requestIdRef.current !== requestId) return;
        if (cacheRef.current.size >= 40) cacheRef.current.delete(cacheRef.current.keys().next().value);
        cacheRef.current.set(query.toLocaleLowerCase(), { time: Date.now(), results: data.results || [] });
        setSuggestions(data.results || []);
        setSearched(true);
        setActiveIndex(-1);
      } catch {
        if (controller.signal.aborted || requestIdRef.current !== requestId) return;
        setSuggestions([]);
        setSearched(true);
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }, 700);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [value, focused, composing, disabled, confirmed]);

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
    requestIdRef.current += 1;
    userEditedRef.current = false;
    lastSelectedValueRef.current = candidate.displayName;
    onSelect(candidate);
    setOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(event) {
    if (event.nativeEvent.isComposing || composing) return;
    if (event.key === 'Escape') { setOpen(false); return; }
    if (!open || !matches.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      if (matches[activeIndex]) handleSelect(matches[activeIndex]);
    }
  }

  const showHint = !confirmed && searched && !loading && (!open || matches.length === 0) && value.trim().length >= 3;

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
            lastSelectedValueRef.current = null;
            requestIdRef.current += 1;
            setSuggestions([]);
            setActiveIndex(-1);
            setOpen(true);
            onChange(event.target.value);
          }}
          onFocus={() => { setFocused(true); setOpen(true); }}
          onBlur={() => { setFocused(false); setOpen(false); }}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={handleKeyDown}
          required={required}
          minLength={minLength}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && matches.length > 0 && !composing}
          aria-controls={open && matches.length > 0 ? listId : undefined}
          aria-activedescendant={open && matches[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
        />
      </label>
      {open && !composing && matches.length > 0 && menuRect && createPortal(
        <ul
          id={listId}
          role="listbox"
          aria-label={t('Suchergebnisse')}
          ref={menuRef}
          className="location-autocomplete-results"
          style={{ position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width }}
        >
          {matches.map((candidate, index) => (
            <li key={candidate.boulePlaceId || `${candidate.lat}-${candidate.lng}-${index}`} role="presentation">
              <button
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                type="button"
                className={index === activeIndex ? 'active' : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(candidate)}
              >
                <span data-i18n-skip>{candidate.label || candidate.displayName}</span>
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
