import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { translateText } from '../lib/i18n.js';
import { RequiredMark } from './ui.jsx';

export function LocationAutocomplete({ label, value, onChange, onSelect, confirmed, required, minLength, disabled, language }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searched, setSearched] = useState(false);
  const requestIdRef = useRef(0);
  const containerRef = useRef(null);
  const lastSelectedValueRef = useRef(null);
  const userEditedRef = useRef(false);

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
      if (containerRef.current && !containerRef.current.contains(event.target)) {
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
      {open && suggestions.length > 0 && (
        <ul className="location-autocomplete-results">
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
        </ul>
      )}
      {loading && (
        <p className="location-autocomplete-status muted">{translateText('Orte werden gesucht…', language)}</p>
      )}
      {confirmed && !loading && (
        <p className="location-autocomplete-status success">
          ✓ {translateText('Ausgewählt:', language)} {value}
        </p>
      )}
      {showHint && (
        <p className="location-autocomplete-status hint">
          {suggestions.length === 0
            ? translateText('Kein Ort gefunden. Bitte Eingabe prüfen.', language)
            : translateText('Bitte Ort aus der Liste auswählen, um Mehrdeutigkeiten zu vermeiden.', language)}
        </p>
      )}
    </div>
  );
}
