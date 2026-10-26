import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatWeekdayShort } from '../lib/format.js';

// Ab dieser Breite zeigt das Raster nur einen Tag (siehe Media-Query in styles.css); nur dann wird gewischt.
const SINGLE_DAY_QUERY = '(max-width: 640px)';
const SWIPE_MIN_DISTANCE = 50;

const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

function isSelected(selection, date, hour) {
  return Boolean(selection) && selection.date === date && hour >= selection.startHour && hour < selection.startHour + selection.hours;
}

// Farbe nach Belegung; requested markiert zusätzlich, dass ein Teil davon nur angefragt, noch nicht bestätigt ist.
// blocked markiert regelmäßige Belegungen des Vereins (z. B. Training).
function slotClass(slot, laneCount, minLanes, selected) {
  if (selected) return 'rental-slot selected';
  if (!slot.bookable) return 'rental-slot past';
  const marks = `${slot.requested > 0 ? ' requested' : ''}${slot.blocked > 0 ? ' blocked' : ''}`;
  if (slot.free < minLanes) return `rental-slot full${marks}`;
  return slot.free < laneCount ? `rental-slot partial${marks}` : 'rental-slot free';
}

// Nur für Verwalter (bookings kommt nur bei ihnen vom Server): wer in dieser Stunde belegt.
function slotRenters(bookings, date, hour) {
  return bookings.filter((booking) => booking.date === date && hour >= booking.startHour && hour < booking.startHour + booking.hours)
    .map((booking) => booking.renterName).filter(Boolean);
}

/**
 * Wochenraster der freien Bahnen (Tage × Stunden). Auf dem Handy zeigt es nur den gewählten Tag, umschaltbar über
 * die Tagesleiste oder durch Wischen – so bleibt die Seite ohne horizontales Scrollen.
 * @param days Verfügbarkeit aus GET /api/rentals/:id/availability
 * @param onSelect (date, hour) => void; ohne onSelect ist das Raster nur zur Ansicht
 * @param minLanes so viele Bahnen müssen frei sein, damit eine Stunde wählbar ist (Nur-komplett-Angebote: alle)
 * @param popover Inhalt, der direkt an der Startstunde der Auswahl aufklappt (z. B. die Dauerwahl)
 * @param bookings nur für Verwalter: Buchungen des Angebots mit Mieternamen (Tooltip der belegten Stunden)
 * @param onPreviousWeek/onNextWeek Wischen über den Wochenrand hinaus; null, wenn es dort nicht weitergeht
 * @param toolbar Wochen-Navigation; klebt am Desktop zusammen mit den Tagesköpfen beim Scrollen oben
 */
export function RentalCalendar({ days, laneCount, minLanes = 1, selection, onSelect, language, popover = null, bookings = [], onPreviousWeek = null, onNextWeek = null, toolbar = null }) {
  const { t } = useTranslation();
  const firstOpenDay = Math.max(0, days.findIndex((day) => day.slots.some((slot) => slot.bookable)));
  const [activeDay, setActiveDay] = useState(firstOpenDay);
  // Nach einem Wochenwechsel per Wischen auf dem angrenzenden Tag landen statt auf dem ersten offenen.
  const pendingDayRef = useRef(null);
  useEffect(() => {
    const pending = pendingDayRef.current;
    pendingDayRef.current = null;
    setActiveDay(pending === 'first' ? 0 : pending === 'last' ? days.length - 1 : firstOpenDay);
  }, [days[0]?.date]);

  const [swipe, setSwipe] = useState('');
  const touchStartRef = useRef(null);

  function goToDay(index, direction) {
    if (index >= 0 && index < days.length) {
      setActiveDay(index);
    } else if (index >= days.length && onNextWeek) {
      pendingDayRef.current = 'first';
      onNextWeek();
    } else if (index < 0 && onPreviousWeek) {
      pendingDayRef.current = 'last';
      onPreviousWeek();
    } else {
      return;
    }
    setSwipe(direction);
  }

  function handleTouchStart(event) {
    const touch = event.touches[0];
    touchStartRef.current = touch && window.matchMedia?.(SINGLE_DAY_QUERY).matches ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function handleTouchEnd(event) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Nur deutlich waagerechte Gesten wechseln den Tag, senkrechtes Scrollen bleibt unberührt.
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) <= 1.5 * Math.abs(dy)) return;
    if (dx < 0) goToDay(activeDay + 1, 'next');
    else goToDay(activeDay - 1, 'prev');
  }

  const hours = [...new Set(days.flatMap((day) => day.slots.map((slot) => slot.hour)))].sort((left, right) => left - right);

  // Kalenderkopf (Desktop: Wochen-Navigation + Tagesköpfe, Handy: Tagesleiste) klebt beim Scrollen direkt unter
  // der ebenfalls klebenden Kopfzeile; deren Höhe hängt vom Inhalt ab, deshalb gemessen statt fest eingetragen.
  const calendarRef = useRef(null);
  useEffect(() => {
    const topbar = document.querySelector('.topbar');
    const calendar = calendarRef.current;
    if (!topbar || !calendar) return undefined;
    const update = () => calendar.style.setProperty('--rental-sticky-top', `${topbar.getBoundingClientRect().height}px`);
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(topbar);
    return () => observer.disconnect();
  }, [hours.length > 0]);

  if (!hours.length) return <>{toolbar}<p className="muted">{t('In dieser Woche ist nicht geöffnet.')}</p></>;

  const swipeClass = swipe ? ` swipe-${swipe}` : '';

  return (
    <div className="rental-calendar" ref={calendarRef}>
      <div className="rental-calendar-head">
        {toolbar}
        <div className="rental-day-tabs" role="tablist" aria-label={t('Tag wählen')}>
          {days.map((day, index) => (
            <button
              key={day.date}
              type="button"
              role="tab"
              aria-selected={index === activeDay}
              className={`rental-day-tab${index === activeDay ? ' active' : ''}${day.slots.length ? '' : ' closed'}`}
              onClick={() => setActiveDay(index)}
            >
              <span>{formatWeekdayShort(day.date, language)}</span>
              <strong>{Number(day.date.slice(8, 10))}</strong>
            </button>
          ))}
        </div>
        {/* Eigenes Raster mit denselben Spalten wie die Stunden, damit die Tagesköpfe mitkleben können. */}
        <div className={`rental-grid rental-grid-header${swipeClass}`} style={{ '--rental-days': days.length }}>
          <div className="rental-grid-corner" aria-hidden="true" />
          {days.map((day, index) => (
            <div key={day.date} className={`rental-grid-head${index === activeDay ? ' active' : ''}`}>
              <span>{formatWeekdayShort(day.date, language)}</span> {formatDate(day.date, language)}
            </div>
          ))}
        </div>
      </div>
      <div
        className={`rental-grid${swipeClass}`}
        style={{ '--rental-days': days.length }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onAnimationEnd={() => setSwipe('')}
      >
        {hours.map((hour) => [
          <div key={`h${hour}`} className="rental-grid-hour">{hourLabel(hour)}</div>,
          ...days.map((day, index) => {
            const slot = day.slots.find((entry) => entry.hour === hour);
            const columnClass = index === activeDay ? ' active' : '';
            if (!slot) return <div key={`${day.date}-${hour}`} className={`rental-slot closed${columnClass}`} aria-hidden="true" />;
            const selected = isSelected(selection, day.date, hour);
            const renters = slotRenters(bookings, day.date, hour);
            const label = `${formatDate(day.date, language)} ${hourLabel(hour)}: ${t('{{free}} von {{total}} Bahnen frei', { free: slot.free, total: laneCount })}`
              + (slot.requested > 0 ? `, ${t('{{count}} angefragt', { count: slot.requested })}` : '')
              + (slot.blocked > 0 ? `, ${t('{{count}} regelmäßig belegt', { count: slot.blocked })}${slot.blockLabels?.length ? ` (${slot.blockLabels.join(', ')})` : ''}` : '')
              + (renters.length ? ` – ${renters.join(', ')}` : '');
            const disabled = !onSelect || !slot.bookable || slot.free < minLanes;
            const button = (
              <button
                key={`${day.date}-${hour}`}
                type="button"
                className={`${slotClass(slot, laneCount, minLanes, selected)}${columnClass}`}
                disabled={disabled}
                aria-pressed={selected}
                aria-label={label}
                title={label}
                onClick={() => onSelect?.(day.date, hour)}
              >
                {slot.bookable ? `${slot.free}/${laneCount}` : '–'}
                {/* Am Handy gibt es keinen Tooltip: Bezeichnung der Belegung klein im Feld (aria-label enthält sie schon). */}
                {slot.bookable && slot.blockLabels?.length ? <small className="rental-slot-note" aria-hidden="true">{slot.blockLabels.join(', ')}</small> : null}
              </button>
            );
            if (!popover || selection?.date !== day.date || selection?.startHour !== hour) return button;
            // In den letzten Spalten klappt das Popup nach links auf, damit es nicht über den Rand ragt.
            const alignEnd = index >= days.length - 2 ? ' align-end' : '';
            return (
              <div key={`${day.date}-${hour}`} className={`rental-slot-anchor${alignEnd}${columnClass}`}>
                {button}
                {popover}
              </div>
            );
          }),
        ])}
      </div>
      <div className="rental-legend" aria-hidden="true">
        <span><i className="rental-slot free" />{t('frei')}</span>
        <span><i className="rental-slot partial" />{t('teilweise belegt')}</span>
        <span><i className="rental-slot full" />{t('ausgebucht')}</span>
        <span><i className="rental-slot partial requested" />{t('angefragt, noch nicht bestätigt')}</span>
        <span><i className="rental-slot partial blocked" />{t('regelmäßig belegt')}</span>
        <span><i className="rental-slot selected" />{t('Deine Auswahl')}</span>
      </div>
    </div>
  );
}
