import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, authenticatedApi } from '../lib/api.js';
import { clubLogoImageUrl } from '../lib/domain.js';
import { amountToMinorUnits, currencyOptions, formatDate, formatMoney, formatTournamentDateTime, formatWeekdayShort, minorUnitsToAmount } from '../lib/format.js';
import { addDays, rentalMinLanes } from '../rental-core.js';
import { Button, EditDialog, Feedback, SelectField, ShareLinkButton, TextArea, TextField } from '../components/ui.jsx';
import { StandalonePageHeader } from '../components/layout.jsx';
import { RentalCalendar } from '../components/RentalCalendar.jsx';
import { RentalMonthPicker } from '../components/RentalMonthPicker.jsx';
import { ComboboxPicker } from '../components/ComboboxPicker.jsx';
import { RichText, handleOwnLinkClick } from '../components/RichText.jsx';
import { RichTextEditor } from '../components/RichTextEditor.jsx';
import { EditorsPanel } from '../components/EditorsPanel.jsx';

const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;
// Montag zuerst; 0 = Sonntag wie im Worker.
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
// 18.10.2026 ist ein Sonntag: Referenzdatum für die Wochentagsnamen.
const weekdayName = (weekday, language) => formatWeekdayShort(addDays('2026-10-18', weekday), language);
const RESERVATION_STATUS_LABELS = { requested: 'Angefragt', confirmed: 'Bestätigt', rejected: 'Abgelehnt', cancelled: 'Storniert' };

export function formatReservationSlot(reservation, language) {
  return `${formatWeekdayShort(reservation.date, language)} ${formatDate(reservation.date, language)}, ${hourLabel(reservation.startHour)}–${hourLabel(reservation.startHour + reservation.hours)}`;
}

// Wer eine Reservierung bestätigt hat (nur Verwalter sehen das), damit mehrere Verwalter nicht nachfragen müssen.
function confirmedByLine(t, reservation, language, timeZone) {
  if (reservation.status !== 'confirmed' || !reservation.decidedByName) return null;
  return t('Bestätigt von {{name}} am {{date}}', { name: reservation.decidedByName, date: formatTournamentDateTime(reservation.decidedAt, language, timeZone) });
}

// Belegung der angezeigten Woche mit Mietern – liefert der Server nur Verwaltern des Angebots (Datenschutz).
function RentalBookingList({ bookings, offer, language }) {
  const { t } = useTranslation();
  return (
    <section className="rental-bookings">
      <h3>{t('Belegung dieser Woche')}</h3>
      {bookings.length === 0 ? <p className="muted">{t('Keine Reservierungen in dieser Woche.')}</p> : (
        <div className="user-list">
          {bookings.map((booking) => (
            <article className="data-row" key={booking.id}>
              <div>
                <strong data-i18n-skip>{formatReservationSlot(booking, language)} · {booking.renterName}</strong>
                <span>
                  <span data-i18n-skip>{reservationScope(t, { ...booking, venueType: offer.venueType })}</span>
                  {' · '}{t(RESERVATION_STATUS_LABELS[booking.status])}
                </span>
                {confirmedByLine(t, booking, language, offer.timezone) && <span data-i18n-skip>{confirmedByLine(t, booking, language, offer.timezone)}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

// Komplettmiete heißt je nach Spielort „Komplette Halle“ oder „Kompletter Platz“.
function wholeLabel(t, venueType) {
  return venueType === 'indoor' ? t('Komplette Halle') : t('Kompletter Platz');
}

// Ältere Reservierungen haben noch keine Personenzahl.
function reservationScope(t, reservation) {
  const scope = reservation.whole ? wholeLabel(t, reservation.venueType) : t('{{lanes}} Bahn(en)', { lanes: reservation.lanes });
  return reservation.persons ? `${scope} · ${t('{{persons}} Person(en)', { persons: reservation.persons })}` : scope;
}

function formatPrice(t, priceMinor, currency, note, language) {
  if (priceMinor === null || priceMinor === undefined) return t('Preis auf Anfrage');
  return `${priceMinor === 0 ? t('kostenlos') : formatMoney(priceMinor, currency, language)}${note ? ` ${note}` : ''}`;
}

// Bahnenpreis, Komplettpreis oder beide – je nach Vermietungsart des Angebots.
function OfferPrice({ offer, language }) {
  const { t } = useTranslation();
  const lanes = formatPrice(t, offer.priceMinor, offer.currency, offer.priceNote, language);
  if (offer.rentalMode !== 'whole' && offer.rentalMode !== 'both') return <span data-i18n-skip>{lanes}</span>;
  const whole = `${wholeLabel(t, offer.venueType)}: ${formatPrice(t, offer.wholePriceMinor, offer.currency, offer.wholePriceNote, language)}`;
  return <span data-i18n-skip>{offer.rentalMode === 'both' ? `${t('Einzelne Bahnen')}: ${lanes} · ${whole}` : whole}</span>;
}

// Spielort und Verein heißen oft gleich; dann nur einmal nennen. Die Adresse steht in einer eigenen Zeile.
// Wie beim Turnier: Der Spielort führt zur Karte unter „Plätze & Vereine“, gefiltert auf genau diesen Platz.
// Nur bei öffentlichen Angeboten, denn nicht freigegebene Spielorte zeigt die Platzseite nicht.
function OfferSummary({ offer, navigate }) {
  const { t } = useTranslation();
  const placePath = `/plaetze#${encodeURIComponent(offer.placeId || '')}`;
  const showClub = offer.clubName && offer.clubName.trim().toLowerCase() !== (offer.placeName || '').trim().toLowerCase();
  const place = offer.placeName && (offer.isPublic && offer.placeId
    ? <a href={placePath} onClick={(event) => handleOwnLinkClick(event, placePath, navigate)}>{offer.placeName}</a>
    : offer.placeName);
  return <>
    <span data-i18n-skip>
      {place}{place && ' · '}{showClub && `${offer.clubName} · `}{t('{{lanes}} Bahn(en)', { lanes: offer.laneCount })}
    </span>
    {offer.address && <span className="rental-offer-address" data-i18n-skip>{offer.address}</span>}
  </>;
}

// „Nachricht an Vermieter“ öffnet das E-Mail-Programm mit der Kontakt-E-Mail des Angebots (Pflicht, vorbelegt mit der des Vereins).
function RentalContactLink({ offer }) {
  const { t } = useTranslation();
  if (!offer.contactEmail) return null;
  return (
    <a className="button button-secondary" href={`mailto:${encodeURIComponent(offer.contactEmail)}?subject=${encodeURIComponent(offer.title)}`}>
      {t('Nachricht an Vermieter')}
    </a>
  );
}

function ShareRentalOfferButton({ offer }) {
  return <ShareLinkButton title={offer.title} url={new URL(`/platz-mieten/${encodeURIComponent(offer.id)}`, window.location.origin).href} />;
}

function RentalOfferList({ language, navigate }) {
  const { t } = useTranslation();
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState('');
  const [venueFilter, setVenueFilter] = useState('');
  const resultsRef = useRef(null);

  useEffect(() => {
    api('/api/rentals').then((data) => setOffers(data.offers || [])).catch((requestError) => setError(requestError.message));
  }, []);

  const allOffers = offers || [];
  const visible = allOffers.filter((offer) => !venueFilter || offer.venueType === venueFilter);
  const indoorCount = allOffers.filter((offer) => offer.venueType === 'indoor').length;
  const outdoorCount = allOffers.filter((offer) => offer.venueType === 'outdoor').length;
  const toggleVenue = (venueType) => setVenueFilter((current) => (current === venueType ? '' : venueType));
  const venueFilterLabel = venueFilter === 'indoor' ? t('Nur Boulehallen') : t('Nur Bouleplätze');
  return (
    <>
      <div className="home-finder">
        <div className="home-finder-copy">
          <p className="eyebrow">Pétanque Turnier Manager Online</p>
          <h2>{t('Platz mieten')}</h2>
          <p className="subtitle">{t('Vereine vermieten hier stundenweise einzelne Bahnen oder die komplette Halle bzw. den kompletten Platz. Wähle ein Angebot und frage deinen Wunschtermin im Kalender an; der Verein bestätigt die Reservierung.')}</p>
        </div>
        <div className="home-finder-stats" aria-label={t('Platz mieten Übersicht')}>
          <button
            type="button"
            onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            aria-label={`${visible.length} ${t('gefundene Mietangebote – zur Liste springen')}`}
          >
            <strong>{visible.length}</strong>
            <span>{t('Mietangebote')}</span>
          </button>
          <button type="button" aria-pressed={venueFilter === 'indoor'} onClick={() => toggleVenue('indoor')}>
            <strong>{indoorCount}</strong>
            <span>{t('Nur Boulehallen')}</span>
          </button>
          <button type="button" aria-pressed={venueFilter === 'outdoor'} onClick={() => toggleVenue('outdoor')}>
            <strong>{outdoorCount}</strong>
            <span>{t('Nur Bouleplätze')}</span>
          </button>
        </div>
      </div>

      {venueFilter && <div className="active-search-badges" aria-label={t('Filter aktiv')}>
        <button type="button" className="active-search-badge" onClick={() => setVenueFilter('')} aria-label={`${t('Entfernen')}: ${venueFilterLabel}`}><span>{venueFilterLabel}</span><span aria-hidden="true">×</span></button>
      </div>}

      <Feedback error={error} />
      <div className="section-title home-results-title" ref={resultsRef}>
        <p className="eyebrow">{t('Alle Mietangebote')}</p>
        {offers && <span className="counter">{visible.length}</span>}
      </div>
      {!offers && !error && <p className="muted">{t('Wird geladen…')}</p>}
      {offers && visible.length === 0 && <div className="empty-state"><strong>{t('Zurzeit gibt es keine Mietangebote.')}</strong></div>}
      {visible.length > 0 && <div className="panel">
        <div className="user-list">
          {visible.map((offer) => (
            <article className="data-row rental-offer-row" key={offer.id}>
              {offer.hasClubLogo
                ? <img className="rental-offer-logo" src={clubLogoImageUrl(offer.placeId)} alt="" loading="lazy" />
                : <span className="rental-offer-logo" aria-hidden="true" />}
              <div className="rental-offer-info">
                <strong data-i18n-skip>{offer.title}</strong>
                <OfferSummary offer={offer} navigate={navigate} />
                <OfferPrice offer={offer} language={language} />
              </div>
              <div className="row-actions">
                <ShareRentalOfferButton offer={offer} />
                <Button onClick={() => navigate(`/platz-mieten/${encodeURIComponent(offer.id)}`)}>{t('Termine ansehen')}</Button>
              </div>
            </article>
          ))}
        </div>
      </div>}
    </>
  );
}

// Dauerwahl direkt an der angeklickten Startstunde; schließt bei Wahl, Escape oder Klick daneben.
// „Ganzer Tag“ bucht unabhängig von der angeklickten Stunde die komplette Öffnungszeit des Tages.
function DurationPopover({ options, tooShort, fullDay, onChoose, onChooseFullDay, onClose }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  useEffect(() => {
    const closeOutside = (event) => { if (!ref.current?.contains(event.target)) onClose(); };
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    ref.current?.querySelector('button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);
  return (
    <div className="rental-duration-popover" role="dialog" aria-label={t('Dauer wählen')} ref={ref}>
      <strong>{t('Dauer')}</strong>
      {fullDay && (
        <div className="rental-duration-options">
          <button type="button" className="rental-duration-option rental-duration-full-day" onClick={onChooseFullDay}>
            {t('Ganzer Tag')} <span data-i18n-skip>({hourLabel(fullDay.startHour)}–{hourLabel(fullDay.startHour + fullDay.hours)})</span>
          </button>
        </div>
      )}
      {tooShort ? <p className="hint">{t('Ab dieser Uhrzeit ist die Mindestdauer nicht frei. Bitte wähle eine andere Startzeit.')}</p> : (
        <div className="rental-duration-options">
          {options.map((option) => (
            <button key={option.value} type="button" className="rental-duration-option" onClick={() => onChoose(Number(option.value))}>{option.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RentalOfferView(props) {
  // Personenbezogene Kalenderdaten gehören zu Angebot und Sitzung. Beim Wechsel
  // sofort verwerfen; verspätete Antworten dürfen nur die alte Instanz erreichen.
  return <RentalOfferContent key={JSON.stringify([props.id, props.currentUser?.id ?? null])} {...props} />;
}

function RentalOfferContent({ id, language, currentUser, navigate, onLogin }) {
  const { t } = useTranslation();
  const [offer, setOffer] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [from, setFrom] = useState('');
  const [loadError, setLoadError] = useState('');
  const [selection, setSelection] = useState(null);
  const [lanes, setLanes] = useState('1');
  const [whole, setWhole] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const [revealForm, setRevealForm] = useState(false);
  const formRef = useRef(null);
  const [note, setNote] = useState('');
  const [persons, setPersons] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api(`/api/rentals/${encodeURIComponent(id)}`).then((data) => setOffer(data.offer)).catch((requestError) => setLoadError(requestError.message));
  }, [id, currentUser?.id]);

  async function loadAvailability(start = from) {
    const data = await api(`/api/rentals/${encodeURIComponent(id)}/availability${start ? `?from=${start}` : ''}`);
    setAvailability(data);
    if (!start) setFrom(data.from);
  }
  useEffect(() => { loadAvailability(from).catch((requestError) => setLoadError(requestError.message)); }, [id, from]);

  const day = availability?.days.find((entry) => entry.date === selection?.date);
  const minLanes = offer ? rentalMinLanes(offer) : 1;
  // Längste Dauer ab der gewählten Stunde: bis Ladenschluss, Höchstdauer oder zur ersten ausgebuchten Stunde
  // (bei Nur-komplett-Angeboten: zur ersten Stunde, in der nicht alle Bahnen frei sind).
  const maxHours = useMemo(() => {
    if (!day || !offer) return 0;
    let hours = 0;
    while (hours < offer.maxHours) {
      const slot = day.slots.find((entry) => entry.hour === selection.startHour + hours);
      if (!slot || !slot.bookable || slot.free < minLanes) break;
      hours += 1;
    }
    return hours;
  }, [day, offer, minLanes, selection?.startHour]);
  // Ganzer Tag = komplette Öffnungszeit, sofern sie innerhalb von Mindest-/Höchstdauer liegt und durchgehend frei ist.
  const fullDay = useMemo(() => {
    if (!day?.slots.length || !offer) return null;
    const hours = day.slots.length;
    if (hours < offer.minHours || hours > offer.maxHours) return null;
    if (day.slots.some((slot) => !slot.bookable || slot.free < minLanes)) return null;
    return { startHour: day.slots[0].hour, hours };
  }, [day, offer, minLanes]);
  const freeLanes = day && selection
    ? Math.min(...day.slots.filter((slot) => slot.hour >= selection.startHour && slot.hour < selection.startHour + selection.hours).map((slot) => slot.free))
    : 0;

  function select(date, hour) {
    setMessage('');
    setError('');
    setSelection({ date, startHour: hour, hours: offer.minHours });
    setLanes('1');
    setWhole(offer.rentalMode === 'whole');
    setDurationOpen(Boolean(currentUser));
  }

  function chooseDuration(hours, startHour) {
    setSelection((current) => ({ ...current, startHour: startHour ?? current.startHour, hours }));
    setLanes('1');
    setDurationOpen(false);
    setRevealForm(true);
  }

  // Nach der Dauerwahl das Formular ins Bild holen; es steht unter dem oft langen Stundenraster.
  useEffect(() => {
    if (!revealForm) return;
    setRevealForm(false);
    formRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [revealForm]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await authenticatedApi(`/api/rentals/${encodeURIComponent(id)}/reservations`, {
        method: 'POST', body: JSON.stringify({ ...selection, ...(whole ? { whole: true } : { lanes: Number(lanes) }), persons: Number(persons), note }),
      });
      setMessage(t('Anfrage gesendet. Der Verein bestätigt die Reservierung; du bekommst eine Nachricht.'));
      setSelection(null);
      setNote('');
      setPersons('');
      await loadAvailability(from);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <div className="panel"><Feedback error={loadError} /></div>;
  if (!offer || !availability) return <div className="panel"><p className="muted">{t('Wird geladen…')}</p></div>;

  const lastDate = addDays(availability.today, offer.bookingHorizonDays);
  const durationOptions = Array.from({ length: Math.max(0, maxHours - offer.minHours + 1) }, (_, index) => offer.minHours + index)
    .map((hours) => ({ value: String(hours), label: t('{{hours}} Std.', { hours }) }));
  const tooShort = selection && maxHours < offer.minHours;
  const wholeFree = freeLanes >= offer.laneCount;

  return (
    <div className="panel rental-offer">
      <div className="section-title">
        <h2 data-i18n-skip>{offer.title}</h2>
        <div className="row-actions">
          {offer.isPublic && <ShareRentalOfferButton offer={offer} />}
          {offer.isPublic && !offer.canManage && <RentalContactLink offer={offer} />}
          {offer.canManage && (
            <Button variant="secondary" onClick={() => navigate(`/platz-mieten/verwalten?verein=${encodeURIComponent(offer.clubId)}&angebot=${encodeURIComponent(offer.id)}`)}>
              {t('Angebot bearbeiten')}
            </Button>
          )}
        </div>
      </div>
      <div className="rental-offer-meta"><OfferSummary offer={offer} navigate={navigate} /></div>
      <p><OfferPrice offer={offer} language={language} /></p>
      {offer.description && <RichText value={offer.description} onNavigate={navigate} />}
      <p className="hint">
        {t('Buchbar in vollen Stunden, {{min}} bis {{max}} Stunden am Stück, bis {{days}} Tage im Voraus.', { min: offer.minHours, max: offer.maxHours, days: offer.bookingHorizonDays })}
      </p>
      <div className="rental-week-nav">
        <Button variant="secondary" disabled={availability.from <= availability.today} onClick={() => setFrom(addDays(availability.from, -7) < availability.today ? availability.today : addDays(availability.from, -7))}>{t('Vorherige Woche')}</Button>
        <RentalMonthPicker
          offerId={id}
          language={language}
          today={availability.today}
          lastDate={lastDate}
          selectedDate={availability.from}
          rangeLabel={`${formatDate(availability.days[0].date, language)} – ${formatDate(availability.days.at(-1).date, language)}`}
          onSelect={(date) => { setSelection(null); setFrom(date); }}
        />
        <Button variant="secondary" disabled={addDays(availability.from, 7) > lastDate} onClick={() => setFrom(addDays(availability.from, 7))}>{t('Nächste Woche')}</Button>
      </div>
      <RentalCalendar
        days={availability.days}
        laneCount={offer.laneCount}
        minLanes={minLanes}
        selection={selection}
        onSelect={select}
        language={language}
        popover={durationOpen && selection
          ? <DurationPopover options={durationOptions} tooShort={tooShort} fullDay={fullDay} onChoose={chooseDuration}
            onChooseFullDay={() => chooseDuration(fullDay.hours, fullDay.startHour)} onClose={() => setDurationOpen(false)} />
          : null}
        bookings={offer.canManage ? availability.bookings : undefined}
      />
      {offer.canManage && availability.bookings && <RentalBookingList bookings={availability.bookings} offer={offer} language={language} />}
      <Feedback message={message} />
      {selection && (
        currentUser ? (
          <form className="form rental-request" onSubmit={submit} ref={formRef}>
            <h3>{formatReservationSlot(selection, language)}{whole ? ` · ${wholeLabel(t, offer.venueType)}` : ''}</h3>
            {tooShort ? <p className="hint">{t('Ab dieser Uhrzeit ist die Mindestdauer nicht frei. Bitte wähle eine andere Startzeit.')}</p> : <>
              <div className="form-grid">
                <SelectField label={t('Dauer')} value={String(selection.hours)} onChange={(hours) => { setSelection({ ...selection, hours: Number(hours) }); setLanes('1'); }} options={durationOptions} />
                {offer.rentalMode === 'both' && (
                  <SelectField
                    label={t('Umfang')}
                    value={whole ? 'whole' : 'lanes'}
                    onChange={(value) => setWhole(value === 'whole')}
                    options={[{ value: 'lanes', label: t('Einzelne Bahnen') }, { value: 'whole', label: wholeLabel(t, offer.venueType) }]}
                  />
                )}
                {!whole && <SelectField label={t('Bahnen')} value={lanes} onChange={setLanes} options={Array.from({ length: freeLanes }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))} />}
                <TextField label={t('Anzahl Personen')} type="number" min={1} max={500} step={1} inputMode="numeric" value={persons} onChange={setPersons} required />
              </div>
              {whole && !wholeFree && <p className="hint">{t('In diesem Zeitraum sind nicht alle Bahnen frei.')}</p>}
              <TextArea label={t('Nachricht an den Verein')} value={note} onChange={setNote} maxLength={500} rows={3} />
            </>}
            <Feedback error={error} />
            <div className="dialog-actions">
              <Button variant="secondary" onClick={() => setSelection(null)}>{t('Abbrechen')}</Button>
              <Button type="submit" disabled={tooShort || freeLanes < 1 || (whole && !wholeFree)} loading={busy}>{t('Reservierung anfragen')}</Button>
            </div>
          </form>
        ) : (
          <div className="rental-request">
            <p className="hint">{t('Zum Reservieren bitte anmelden oder kostenlos registrieren.')}</p>
            <Button onClick={onLogin}>{t('Anmelden')}</Button>
          </div>
        )
      )}
    </div>
  );
}

export function MyRentalReservations({ language, navigate }) {
  const { t } = useTranslation();
  const [reservations, setReservations] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    if (!reservations) return;
    const focusReservation = () => {
      const target = document.getElementById(window.location.hash.slice(1));
      target?.scrollIntoView?.({ block: 'center' });
      target?.focus?.({ preventScroll: true });
    };
    focusReservation();
    window.addEventListener('hashchange', focusReservation);
    return () => window.removeEventListener('hashchange', focusReservation);
  }, [reservations]);

  async function load() {
    const data = await authenticatedApi('/api/rentals/reservations/mine');
    setReservations(data.reservations || []);
  }
  useEffect(() => { load().catch((requestError) => setError(requestError.message)); }, []);

  async function cancel(reservation) {
    if (!window.confirm(t('Reservierung wirklich stornieren?'))) return;
    setCancellingId(reservation.id);
    setError('');
    setMessage('');
    try {
      await authenticatedApi(`/api/rentals/reservations/${reservation.id}/cancel`, { method: 'POST' });
      setMessage(t('Reservierung storniert.'));
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCancellingId(null);
    }
  }

  const now = new Date().toISOString();
  return (
    <div className="panel">
      <div className="section-title">
        <h2>{t('Meine Reservierungen')}</h2>
        <Button variant="secondary" onClick={() => navigate('/platz-mieten')}>{t('Angebote ansehen')}</Button>
      </div>
      <Feedback message={message} />
      <Feedback error={error} />
      {!reservations && !error && <p className="muted">{t('Wird geladen…')}</p>}
      {reservations?.length === 0 && <p className="muted">{t('Du hast noch keine Reservierungen.')}</p>}
      <div className="user-list">
        {(reservations || []).map((reservation) => (
          <article className="data-row" key={reservation.id} id={`reservierung-${encodeURIComponent(reservation.id)}`} tabIndex={-1}>
            <div>
              <strong data-i18n-skip>{reservation.offerTitle} · {formatReservationSlot(reservation, language)}</strong>
              <span data-i18n-skip>{reservation.placeName} · {reservation.clubName} · {reservationScope(t, reservation)}</span>
              <span className={`rental-status rental-status-${reservation.status}`}>{t(RESERVATION_STATUS_LABELS[reservation.status])}</span>
              {reservation.decisionNote && <span data-i18n-skip>{t('Nachricht vom Verein')}: {reservation.decisionNote}</span>}
            </div>
            <div className="row-actions">
              <Button variant="secondary" onClick={() => navigate(`/platz-mieten/${encodeURIComponent(reservation.offerId)}`)}>{t('Angebot')}</Button>
              {['requested', 'confirmed'].includes(reservation.status) && reservation.startUtc > now && (
                <Button id={`stornieren-${encodeURIComponent(reservation.id)}`} variant="danger" loading={cancellingId === reservation.id} onClick={() => cancel(reservation)}>{t('Stornieren')}</Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_OPENING = { enabled: false, openHour: '10', closeHour: '20' };

function emptyOfferForm(places, contactEmail = '') {
  return {
    placeId: places[0]?.id || '', title: '', description: '', contactEmail: contactEmail || '', laneCount: String(places[0]?.courtCount || 4), rentalMode: 'lanes', price: '', currency: 'EUR', priceNote: '',
    wholePrice: '', wholePriceNote: '',
    minHours: '1', maxHours: '4', bookingHorizonDays: '60', status: 'active',
    opening: Object.fromEntries(WEEKDAYS.map((weekday) => [weekday, { ...DEFAULT_OPENING }])),
  };
}

function priceToForm(priceMinor, currency) {
  if (priceMinor === null || priceMinor === undefined) return '';
  return priceMinor === 0 ? '0' : minorUnitsToAmount(priceMinor, currency);
}

function priceFromForm(value, currency) {
  return value.trim() === '' ? null : amountToMinorUnits(value, currency);
}

function offerToForm(offer, places) {
  const form = emptyOfferForm(places);
  for (const entry of offer.openingHours || []) {
    form.opening[entry.weekday] = { enabled: true, openHour: String(entry.openHour), closeHour: String(entry.closeHour) };
  }
  return {
    ...form, placeId: offer.placeId, title: offer.title, description: offer.description || '', contactEmail: offer.contactEmail || '', laneCount: String(offer.laneCount),
    rentalMode: offer.rentalMode || 'lanes', price: priceToForm(offer.priceMinor, offer.currency), currency: offer.currency, priceNote: offer.priceNote || '',
    wholePrice: priceToForm(offer.wholePriceMinor, offer.currency), wholePriceNote: offer.wholePriceNote || '', minHours: String(offer.minHours), maxHours: String(offer.maxHours),
    bookingHorizonDays: String(offer.bookingHorizonDays), status: offer.status,
  };
}

function offerPayload(form, clubId) {
  return {
    clubId, placeId: form.placeId, title: form.title, description: form.description, contactEmail: form.contactEmail, laneCount: Number(form.laneCount), rentalMode: form.rentalMode,
    priceMinor: priceFromForm(form.price, form.currency), currency: form.currency, priceNote: form.priceNote,
    wholePriceMinor: priceFromForm(form.wholePrice, form.currency), wholePriceNote: form.wholePriceNote,
    minHours: Number(form.minHours), maxHours: Number(form.maxHours), bookingHorizonDays: Number(form.bookingHorizonDays), status: form.status,
    openingHours: WEEKDAYS.filter((weekday) => form.opening[weekday].enabled)
      .map((weekday) => ({ weekday, openHour: Number(form.opening[weekday].openHour), closeHour: Number(form.opening[weekday].closeHour) })),
  };
}

function OfferFields({ form, setForm, places, language }) {
  const { t } = useTranslation();
  const set = (field) => (value) => setForm({ ...form, [field]: value });
  const hourOptions = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => ({ value: String(from + index), label: hourLabel(from + index) }));
  const setOpening = (weekday, patch) => setForm({ ...form, opening: { ...form.opening, [weekday]: { ...form.opening[weekday], ...patch } } });
  const whole = wholeLabel(t, places.find((place) => place.id === form.placeId)?.venueType);
  return <>
    <SelectField label={t('Spielort')} value={form.placeId} onChange={set('placeId')} required options={places.map((place) => ({ value: place.id, label: `${t(place.venueType === 'indoor' ? 'Boulehalle' : 'Bouleplatz')}: ${place.name}` }))} />
    <TextField label={t('Titel')} value={form.title} onChange={set('title')} required maxLength={120} placeholder={t('z. B. Boulehalle – Bahnen stundenweise')} />
    <TextField label={t('Kontakt-E-Mail')} type="email" value={form.contactEmail} onChange={set('contactEmail')} required />
    <p className="hint">{t('An diese Adresse gehen Anfragen und Nachrichten zu diesem Angebot.')}</p>
    <RichTextEditor
      label={t('Beschreibung')}
      value={form.description}
      onChange={set('description')}
      boldLabel={t('Fett')}
      italicLabel={t('Kursiv')}
      underlineLabel={t('Unterstrichen')}
      strikeLabel={t('Durchgestrichen')}
      bulletListLabel={t('Aufzählung')}
      orderedListLabel={t('Nummerierte Liste')}
      headingLabel={t('Überschrift')}
    />
    <div className="form-grid">
      <TextField label={t('Anzahl Bahnen')} type="number" min={1} max={200} value={form.laneCount} onChange={set('laneCount')} required />
      <SelectField label={t('Status')} value={form.status} onChange={set('status')} options={[{ value: 'active', label: t('Aktiv (öffentlich buchbar)') }, { value: 'inactive', label: t('Pausiert') }]} />
      <SelectField
        label={t('Vermietung')}
        value={form.rentalMode}
        onChange={set('rentalMode')}
        options={[
          { value: 'lanes', label: t('Einzelne Bahnen') },
          { value: 'whole', label: t('Nur komplett ({{scope}})', { scope: whole }) },
          { value: 'both', label: t('Einzelne Bahnen oder komplett') },
        ]}
      />
      <SelectField label={t('Währung')} value={form.currency} onChange={set('currency')} options={currencyOptions(language)} />
      {form.rentalMode !== 'whole' && <TextField label={t('Preis')} inputMode="decimal" value={form.price} onChange={set('price')} placeholder={t('leer = auf Anfrage')} />}
      {form.rentalMode !== 'whole' && <TextField label={t('Preis-Hinweis')} value={form.priceNote} onChange={set('priceNote')} maxLength={120} placeholder={t('z. B. pro Bahn und Stunde')} />}
      {form.rentalMode !== 'lanes' && <TextField label={t('Preis komplett')} inputMode="decimal" value={form.wholePrice} onChange={set('wholePrice')} placeholder={t('leer = auf Anfrage')} />}
      {form.rentalMode !== 'lanes' && <TextField label={t('Preis-Hinweis komplett')} value={form.wholePriceNote} onChange={set('wholePriceNote')} maxLength={120} placeholder={t('z. B. pro Stunde')} />}
    </div>
    {form.rentalMode !== 'lanes' && <p className="hint">{t('Komplett bedeutet: alle Bahnen dieses Angebots auf einmal.')}</p>}
    <div className="form-grid">
      <TextField label={t('Mindestdauer (Stunden)')} type="number" min={1} max={24} value={form.minHours} onChange={set('minHours')} required />
      <TextField label={t('Höchstdauer (Stunden)')} type="number" min={1} max={24} value={form.maxHours} onChange={set('maxHours')} required />
      <TextField label={t('Buchbar im Voraus (Tage)')} type="number" min={1} max={365} value={form.bookingHorizonDays} onChange={set('bookingHorizonDays')} required />
    </div>
    <fieldset className="rental-opening">
      <legend>{t('Öffnungszeiten')}</legend>
      {WEEKDAYS.map((weekday) => (
        <div className="rental-opening-row" key={weekday}>
          <label className="checkbox-field">
            <input type="checkbox" checked={form.opening[weekday].enabled} onChange={(event) => setOpening(weekday, { enabled: event.target.checked })} />
            {weekdayName(weekday, language)}
          </label>
          <SelectField label={t('von')} value={form.opening[weekday].openHour} disabled={!form.opening[weekday].enabled} onChange={(openHour) => setOpening(weekday, { openHour })} options={hourOptions(0, 23)} />
          <SelectField label={t('bis')} value={form.opening[weekday].closeHour} disabled={!form.opening[weekday].enabled} onChange={(closeHour) => setOpening(weekday, { closeHour })} options={hourOptions(1, 24)} />
        </div>
      ))}
    </fieldset>
  </>;
}

const DECISION_LABELS = { confirm: 'Bestätigen', reject: 'Ablehnen', cancel: 'Stornieren' };

export function RentalManagement({ language, navigate, currentUser }) {
  const { t } = useTranslation();
  const [clubs, setClubs] = useState(null);
  // „Angebot bearbeiten“ auf der Angebotsseite: Verein vorwählen und das Angebot direkt im Dialog öffnen.
  const [pendingEdit, setPendingEdit] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('angebot') ? { offerId: params.get('angebot'), clubId: params.get('verein') || '' } : null;
  });
  const [clubId, setClubId] = useState(pendingEdit?.clubId || '');
  const [hasUnpublishedClub, setHasUnpublishedClub] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [decision, setDecision] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [deciding, setDeciding] = useState(false);
  const isAdmin = currentUser?.role === 'admin';
  const canManageClub = Boolean(data?.canManageClub);
  // Kandidaten für Angebotsverwalter wie bei Turnieren: alle Benutzer, erst beim Bearbeiten eines Angebots geladen.
  const [editorCandidates, setEditorCandidates] = useState(null);
  const editingExistingOffer = canManageClub && Boolean(dialog) && dialog !== 'new';
  useEffect(() => {
    if (!editingExistingOffer || editorCandidates) return;
    authenticatedApi('/api/postbox/recipients').then((result) => setEditorCandidates(result.recipients || []))
      .catch((requestError) => setDialogError(requestError.message));
  }, [editingExistingOffer]);
  const clubEntries = useMemo(() => (clubs || []).map((club) => {
    const meta = club.placeCount !== undefined ? t('Spielorte: {{places}}', { places: club.placeCount }) : '';
    return {
      id: club.id, value: club.id, label: club.name, meta: meta || undefined, searchText: club.name.toLowerCase(),
      group: club.own ? t('Meine Vereine') : t('Alle Vereine'), favoritable: true,
    };
  }), [clubs, t]);

  useEffect(() => {
    // Admins verwalten alle Vereine (z. B. für Support); die eigenen stehen oben.
    Promise.all([
      authenticatedApi('/api/clubs/mine'),
      isAdmin ? authenticatedApi('/api/admin/clubs') : Promise.resolve({ clubs: [] }),
      authenticatedApi('/api/rentals/manage/clubs'),
    ]).then(([mine, all, offerClubs]) => {
      // Vermieten dürfen nur freigegebene Vereine, nicht freigegebene erscheinen deshalb gar nicht erst in der Auswahl.
      const editable = (mine.clubs || []).filter((club) => club.canEdit);
      setHasUnpublishedClub(editable.some((club) => club.status !== 'published'));
      // Dazu Vereine, in denen man nur einzelne Angebote verwaltet (wie Bearbeiter eines Turniers).
      const editableIds = new Set(editable.map((club) => club.id));
      const own = [...editable, ...(offerClubs.clubs || []).filter((club) => !editableIds.has(club.id))]
        .filter((club) => club.status === 'published').map((club) => ({ ...club, own: true }));
      const ownIds = new Set(own.map((club) => club.id));
      const others = (all.clubs || []).filter((club) => club.status === 'published' && !ownIds.has(club.id))
        .sort((left, right) => left.name.localeCompare(right.name, language));
      const list = [...own, ...others];
      setClubs(list);
      setClubId((current) => current || list[0]?.id || '');
    }).catch((requestError) => setError(requestError.message));
  }, [isAdmin]);

  async function load(id = clubId) {
    if (!id) return;
    setData(await authenticatedApi(`/api/rentals/manage?club=${encodeURIComponent(id)}`));
  }
  useEffect(() => { setData(null); load(clubId).catch((requestError) => setError(requestError.message)); }, [clubId]);

  useEffect(() => {
    if (!pendingEdit || !data) return;
    setPendingEdit(null);
    window.history.replaceState(window.history.state, '', window.location.pathname);
    const offer = data.offers.find((entry) => entry.id === pendingEdit.offerId);
    if (offer) openOffer(offer);
  }, [data]);

  function openOffer(offer = null) {
    setDialogError('');
    setDialog(offer || 'new');
    // Die Kontakt-E-Mail eines neuen Angebots ist mit der des Vereins vorbelegt und kann abweichen.
    setForm(offer ? offerToForm(offer, data.places) : emptyOfferForm(data.places, data.clubContactEmail));
  }

  async function saveOffer(event) {
    event.preventDefault();
    setSaving(true);
    setDialogError('');
    setMessage('');
    try {
      const body = JSON.stringify(offerPayload(form, clubId));
      if (dialog === 'new') await authenticatedApi('/api/rentals/offers', { method: 'POST', body });
      else await authenticatedApi(`/api/rentals/offers/${dialog.id}`, { method: 'PUT', body });
      setDialog(null);
      setMessage(t('Angebot gespeichert.'));
      await load();
    } catch (requestError) {
      setDialogError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeOffer(offer) {
    if (!window.confirm(t('Angebot „{{title}}“ wirklich löschen?', { title: offer.title }))) return;
    setDeletingId(offer.id);
    setError('');
    setMessage('');
    try {
      await authenticatedApi(`/api/rentals/offers/${offer.id}`, { method: 'DELETE' });
      setMessage(t('Angebot gelöscht.'));
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function decide(event) {
    event.preventDefault();
    setDeciding(true);
    setDialogError('');
    setMessage('');
    try {
      await authenticatedApi(`/api/rentals/reservations/${decision.reservation.id}/decision`, {
        method: 'POST', body: JSON.stringify({ decision: decision.kind, note: decisionNote }),
      });
      setDecision(null);
      setMessage(t('Der Mieter wurde benachrichtigt.'));
      await load();
    } catch (requestError) {
      setDialogError(requestError.message);
    } finally {
      setDeciding(false);
    }
  }

  function openDecision(reservation, kind) {
    setDialogError('');
    setDecisionNote('');
    setDecision({ reservation, kind });
  }

  if (clubs && clubs.length === 0) {
    return (
      <div className="panel">
        <h2>{t('Vermietung verwalten')}</h2>
        <p className="hint">{hasUnpublishedClub
          ? t('Dein Verein ist noch nicht freigegeben. Angebote kannst du anlegen, sobald ein Admin ihn freigegeben hat.')
          : t('Vermieten können Vereine, die du verwaltest. Lege zuerst unter „Meine Vereine“ einen Verein mit Spielort an.')}</p>
        <Button onClick={() => navigate('/vereine')}>{t('Meine Vereine')}</Button>
      </div>
    );
  }

  const clubPublished = data?.clubStatus === 'published';
  // Angebote brauchen einen freigegebenen Verein mit mindestens einem freigegebenen Spielort.
  const canEditOffers = clubPublished && Boolean(data?.places.length);
  const canCreateOffers = canEditOffers && canManageClub;
  const offerTitle = (offerId) => data?.offers.find((offer) => offer.id === offerId)?.title || '';
  const requests = (data?.reservations || []).filter((reservation) => reservation.status === 'requested');
  const confirmed = (data?.reservations || []).filter((reservation) => reservation.status === 'confirmed');
  const reservationRow = (reservation, actions) => (
    <article className="data-row" key={reservation.id}>
      <div>
        <strong data-i18n-skip>{offerTitle(reservation.offerId)} · {formatReservationSlot(reservation, language)}</strong>
        <span data-i18n-skip>{reservation.renterName} · {reservationScope(t, reservation)}{reservation.renterEmail ? ` · ${reservation.renterEmail}` : ''}{reservation.renterPhone ? ` · ${reservation.renterPhone}` : ''}</span>
        {reservation.note && <span data-i18n-skip>„{reservation.note}“</span>}
        {confirmedByLine(t, reservation, language, reservation.timezone) && <span data-i18n-skip>{confirmedByLine(t, reservation, language, reservation.timezone)}</span>}
      </div>
      <div className="row-actions">
        {actions.map((kind) => (
          <Button key={kind} variant={kind === 'confirm' ? 'primary' : 'danger'} onClick={() => openDecision(reservation, kind)}>{t(DECISION_LABELS[kind])}</Button>
        ))}
      </div>
    </article>
  );

  return (
    <div className="panel rental-manage">
      <Feedback message={message} />
      <Feedback error={error} />
      {clubs && clubs.length > 1 && (
        <div className="rental-manage-club">
          <ComboboxPicker
            label={t('Verein')}
            entries={clubEntries}
            value={clubId}
            onChange={(value) => { if (value) setClubId(value); }}
            placeholder={t('Verein suchen…')}
            emptyText={t('Keine Vereine gefunden.')}
            storageScope="rental-clubs"
            currentUserId={currentUser?.id}
            recordRecentOnSelect
          />
        </div>
      )}
      {!data && !error && <p className="muted">{t('Wird geladen…')}</p>}
      {data && <>
        <section className="rental-manage-section">
          <div className="section-title">
            <div className="rental-section-heading"><h3>{t('Offene Anfragen')}</h3><span className="counter">{requests.length}</span></div>
          </div>
          {requests.length === 0 ? <p className="muted">{t('Keine offenen Anfragen.')}</p> : (
            <div className="user-list">{requests.map((reservation) => reservationRow(reservation, ['confirm', 'reject']))}</div>
          )}
        </section>
        <section className="rental-manage-section">
          <div className="section-title">
            <div className="rental-section-heading"><h3>{t('Bestätigte Reservierungen')}</h3><span className="counter">{confirmed.length}</span></div>
          </div>
          {confirmed.length === 0 ? <p className="muted">{t('Keine kommenden Reservierungen.')}</p> : (
            <div className="user-list">{confirmed.map((reservation) => reservationRow(reservation, ['cancel']))}</div>
          )}
        </section>
        <section className="rental-manage-section">
          <div className="section-title">
            <div className="rental-section-heading"><h3>{t('Angebote')}</h3><span className="counter">{data.offers.length}</span></div>
            {canManageClub && <Button disabled={!canCreateOffers} onClick={() => openOffer()}>{t('Neues Angebot')}</Button>}
          </div>
          {!clubPublished && <p className="hint">{t('Dein Verein ist noch nicht freigegeben. Angebote kannst du anlegen, sobald ein Admin ihn freigegeben hat.')}</p>}
          {clubPublished && !data.places.length && <p className="hint">{t('Dein Verein hat noch keinen Spielort. Lege ihn unter „Meine Vereine“ an.')}</p>}
          {data.offers.length === 0 && data.places.length > 0 && <p className="muted">{t('Noch keine Angebote.')}</p>}
          <div className="user-list">
            {data.offers.map((offer) => (
              <article className="data-row" key={offer.id}>
                <div>
                  <strong data-i18n-skip>{offer.title}</strong>
                  <OfferSummary offer={offer} navigate={navigate} />
                  <span>{offer.status !== 'active' ? t('Pausiert') : offer.isPublic ? t('Aktiv (öffentlich buchbar)') : t('Aktiv – öffentlich sichtbar, sobald Verein und Spielort freigegeben sind')}</span>
                </div>
                <div className="row-actions">
                  {offer.isPublic && <ShareRentalOfferButton offer={offer} />}
                  <Button variant="secondary" onClick={() => navigate(`/platz-mieten/${encodeURIComponent(offer.id)}`)}>{t('Kalender')}</Button>
                  <Button variant="secondary" disabled={!canEditOffers || deletingId === offer.id} onClick={() => openOffer(offer)}>{t('Bearbeiten')}</Button>
                  <Button variant="danger" loading={deletingId === offer.id} onClick={() => removeOffer(offer)}>{t('Löschen')}</Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </>}

      <EditDialog open={Boolean(dialog)} wide title={dialog === 'new' ? t('Neues Angebot') : t('Angebot bearbeiten')} error={dialogError} onClose={() => setDialog(null)}>
        {form && (
          <form className="form" onSubmit={saveOffer}>
            <OfferFields form={form} setForm={setForm} places={data?.places || []} language={language} />
            {editingExistingOffer && (
              <EditorsPanel
                endpoint={`/api/rentals/offers/${dialog.id}/editors`}
                notifications
                candidates={editorCandidates || []}
                currentUserId={currentUser?.id}
                emptyText={t('Noch keine weiteren Verwalter für dieses Angebot.')}
                hint={t('Verwalter bearbeiten dieses Angebot und entscheiden über seine Anfragen. Owner und Bearbeiter des Vereins haben ohnehin Zugriff.')}
              />
            )}
            <div className="dialog-actions">
              <Button variant="secondary" onClick={() => setDialog(null)}>{t('Abbrechen')}</Button>
              <Button type="submit" loading={saving}>{t('Speichern')}</Button>
            </div>
          </form>
        )}
      </EditDialog>

      <EditDialog open={Boolean(decision)} title={decision ? t(DECISION_LABELS[decision.kind]) : ''} subtitle={decision ? `${offerTitle(decision.reservation.offerId)} · ${formatReservationSlot(decision.reservation, language)} · ${decision.reservation.renterName}` : ''} error={dialogError} onClose={() => setDecision(null)}>
        {decision && (
          <form className="form" onSubmit={decide}>
            <TextArea label={t('Nachricht an den Mieter (optional)')} value={decisionNote} onChange={setDecisionNote} maxLength={500} rows={3} />
            <div className="dialog-actions">
              <Button variant="secondary" onClick={() => setDecision(null)}>{t('Abbrechen')}</Button>
              <Button type="submit" variant={decision.kind === 'confirm' ? 'primary' : 'danger'} loading={deciding}>{t(DECISION_LABELS[decision.kind])}</Button>
            </div>
          </form>
        )}
      </EditDialog>
    </div>
  );
}

const HEADINGS = { list: 'Platz mieten', mine: 'Meine Reservierungen', manage: 'Vermietung verwalten', offer: 'Platz mieten' };

export function RentalsPage({ route, language, setLanguage, menuOpen, setMenuOpen, navigate, currentUser, isAdmin, onSelectAdminDashboard, onLogout, onLogin, drawerContent, postboxControl }) {
  const { t } = useTranslation();
  const needsLogin = (route.view === 'mine' || route.view === 'manage') && !currentUser;
  return (
    <main className="app-shell">
      <StandalonePageHeader
        heading={t(HEADINGS[route.view])}
        language={language}
        setLanguage={setLanguage}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        navigate={navigate}
        currentUser={currentUser}
        isAdmin={isAdmin}
        onSelectAdminDashboard={onSelectAdminDashboard}
        onLogout={onLogout}
        drawerContent={drawerContent}
        postboxControl={postboxControl}
      />
      <section className={route.view === 'list' ? 'home-tournaments' : 'single-column'}>
        {needsLogin ? (
          <div className="panel">
            <p className="hint">{t('Bitte melde dich an.')}</p>
            <Button onClick={onLogin}>{t('Anmelden')}</Button>
          </div>
        ) : route.view === 'offer' ? (
          <RentalOfferView id={route.id} language={language} currentUser={currentUser} navigate={navigate} onLogin={onLogin} />
        ) : route.view === 'mine' ? (
          <MyRentalReservations language={language} navigate={navigate} />
        ) : route.view === 'manage' ? (
          <RentalManagement language={language} navigate={navigate} currentUser={currentUser} />
        ) : (
          <RentalOfferList language={language} navigate={navigate} />
        )}
      </section>
    </main>
  );
}

export default RentalsPage;
