import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatWeekdayShort } from '../lib/format.js';

const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

function isSelected(selection, date, hour) {
  return Boolean(selection) && selection.date === date && hour >= selection.startHour && hour < selection.startHour + selection.hours;
}

// Farbe nach Belegung; requested markiert zusätzlich, dass ein Teil davon nur angefragt, noch nicht bestätigt ist.
function slotClass(slot, laneCount, minLanes, selected) {
  if (selected) return 'rental-slot selected';
  if (!slot.bookable) return 'rental-slot past';
  const requested = slot.requested > 0 ? ' requested' : '';
  if (slot.free < minLanes) return `rental-slot full${requested}`;
  return slot.free < laneCount ? `rental-slot partial${requested}` : 'rental-slot free';
}

// Nur für Verwalter (bookings kommt nur bei ihnen vom Server): wer in dieser Stunde belegt.
function slotRenters(bookings, date, hour) {
  return bookings.filter((booking) => booking.date === date && hour >= booking.startHour && hour < booking.startHour + booking.hours)
    .map((booking) => booking.renterName).filter(Boolean);
}

/**
 * Wochenraster der freien Bahnen (Tage × Stunden). Auf dem Handy zeigt es nur den gewählten Tag, umschaltbar über
 * die Tagesleiste – so bleibt die Seite ohne horizontales Scrollen.
 * @param days Verfügbarkeit aus GET /api/rentals/:id/availability
 * @param onSelect (date, hour) => void; ohne onSelect ist das Raster nur zur Ansicht
 * @param minLanes so viele Bahnen müssen frei sein, damit eine Stunde wählbar ist (Nur-komplett-Angebote: alle)
 * @param popover Inhalt, der direkt an der Startstunde der Auswahl aufklappt (z. B. die Dauerwahl)
 * @param bookings nur für Verwalter: Buchungen des Angebots mit Mieternamen (Tooltip der belegten Stunden)
 */
export function RentalCalendar({ days, laneCount, minLanes = 1, selection, onSelect, language, popover = null, bookings = [] }) {
  const { t } = useTranslation();
  const firstOpenDay = Math.max(0, days.findIndex((day) => day.slots.some((slot) => slot.bookable)));
  const [activeDay, setActiveDay] = useState(firstOpenDay);
  useEffect(() => { setActiveDay(firstOpenDay); }, [days[0]?.date]);

  const hours = [...new Set(days.flatMap((day) => day.slots.map((slot) => slot.hour)))].sort((left, right) => left - right);
  if (!hours.length) return <p className="muted">{t('In dieser Woche ist nicht geöffnet.')}</p>;

  return (
    <div className="rental-calendar">
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
      <div className="rental-grid" style={{ '--rental-days': days.length }}>
        <div className="rental-grid-corner" aria-hidden="true" />
        {days.map((day, index) => (
          <div key={day.date} className={`rental-grid-head${index === activeDay ? ' active' : ''}`}>
            <span>{formatWeekdayShort(day.date, language)}</span> {formatDate(day.date, language)}
          </div>
        ))}
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
        <span><i className="rental-slot selected" />{t('Deine Auswahl')}</span>
      </div>
    </div>
  );
}
