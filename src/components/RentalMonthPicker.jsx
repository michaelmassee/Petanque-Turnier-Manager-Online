import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { formatDateLong, formatMonthYear, formatWeekdayShort } from '../lib/format.js';
import { addDays, weekdayOf } from '../rental-core.js';
import { Feedback } from './ui.jsx';

// 2024-01-01 ist ein Montag: Grundlage für die Wochentagsköpfe Mo–So in der Anzeigesprache.
const WEEKDAY_HEADS = Array.from({ length: 7 }, (_, index) => addDays('2024-01-01', index));
const STATUS_CLASSES = { free: 'free', partial: 'partial', full: 'full', unavailable: 'past', closed: 'closed' };
const STATUS_LABELS = { free: 'frei', partial: 'teilweise belegt', full: 'ausgebucht', unavailable: 'nicht buchbar', closed: 'geschlossen' };

function shiftMonth(month, delta) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M7.5 3v4M16.5 3v4M3.5 9h17" />
    </svg>
  );
}

/**
 * Ausklappbarer Monatskalender für „Platz mieten“: zeigt je Tag, ob noch Bahnen frei sind, und springt per Klick
 * in die Wochenansicht ab diesem Tag. Der Auslöser ist der Zeitraum der aktuellen Woche.
 * @param rangeLabel Text des Auslösers (angezeigter Wochenzeitraum)
 * @param onSelect (date) => void
 */
export function RentalMonthPicker({ offerId, language, today, lastDate, selectedDate, rangeLabel, onSelect }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (selectedDate || today).slice(0, 7));
  const [months, setMonths] = useState({});
  const [error, setError] = useState('');
  const panelId = useId();
  const toggleRef = useRef(null);
  const firstMonth = today.slice(0, 7);
  const lastMonth = lastDate.slice(0, 7);

  useEffect(() => {
    if (!open || months[month]) return undefined;
    let cancelled = false;
    setError('');
    api(`/api/rentals/${encodeURIComponent(offerId)}/availability?month=${month}`)
      .then((data) => { if (!cancelled) setMonths((current) => ({ ...current, [month]: data.days })); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); });
    return () => { cancelled = true; };
  }, [open, month, offerId, months]);

  function toggle() {
    if (!open) setMonth((selectedDate || today).slice(0, 7));
    setOpen(!open);
  }

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  function choose(date) {
    setOpen(false);
    onSelect(date);
  }

  const days = months[month];
  const leading = (weekdayOf(`${month}-01`) + 6) % 7;

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="rental-month-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${t('Datum wählen')}: ${rangeLabel}`}
        title={t('Datum wählen')}
        onClick={toggle}
      >
        <CalendarIcon />
        <strong>{rangeLabel}</strong>
      </button>
      {open && (
        <div className="rental-month-picker" id={panelId} onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
          <div className="rental-month-panel">
          <div className="rental-month-head">
            <button type="button" className="rental-month-nav" aria-label={t('Vorheriger Monat')} disabled={month <= firstMonth} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
            <strong>{formatMonthYear(month, language)}</strong>
            <button type="button" className="rental-month-nav" aria-label={t('Nächster Monat')} disabled={month >= lastMonth} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
          </div>
          <div className="rental-month-grid">
            {WEEKDAY_HEADS.map((date) => <span key={date} className="rental-month-weekday">{formatWeekdayShort(date, language)}</span>)}
            {days && Array.from({ length: leading }, (_, index) => <span key={`leer-${index}`} aria-hidden="true" />)}
            {days?.map((day) => {
              const bookable = day.status !== 'closed' && day.status !== 'unavailable';
              const classes = ['rental-slot', 'rental-month-day', STATUS_CLASSES[day.status]];
              if (day.date === today) classes.push('today');
              if (day.date === selectedDate) classes.push('current');
              return (
                <button
                  key={day.date}
                  type="button"
                  className={classes.join(' ')}
                  disabled={!bookable}
                  aria-current={day.date === selectedDate ? 'date' : undefined}
                  aria-label={`${formatDateLong(day.date, language)}: ${t(STATUS_LABELS[day.status])}`}
                  onClick={() => choose(day.date)}
                >
                  {Number(day.date.slice(8, 10))}
                </button>
              );
            })}
          </div>
          {!days && !error && <p className="muted">{t('Wird geladen…')}</p>}
          <Feedback error={error} />
          <div className="rental-legend" aria-hidden="true">
            <span><i className="rental-slot free" />{t('frei')}</span>
            <span><i className="rental-slot partial" />{t('teilweise belegt')}</span>
            <span><i className="rental-slot full" />{t('ausgebucht')}</span>
            <span><i className="rental-slot closed" />{t('geschlossen')}</span>
          </div>
          </div>
        </div>
      )}
    </>
  );
}
