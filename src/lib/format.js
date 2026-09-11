import { CURRENCY_CODES, currencyDecimals } from '../currencies.js';

export const DISPLAY_LOCALES = { de: 'de-DE', nl: 'nl-NL', en: 'en-US', es: 'es-ES', fr: 'fr-FR' };

export const TIMEZONE_HINT_TEMPLATES = {
  de: (timeZone) => `Hinweis: Datum, Startzeit und Anmeldezeiten dieses Turniers gelten in der Zeitzone des Turnierstandorts: ${timeZone}. Deine Zeitzone weicht davon ab.`,
  nl: (timeZone) => `Let op: datum, starttijd en inschrijftijden van dit toernooi gelden in de tijdzone van de toernooilocatie: ${timeZone}. Jouw tijdzone wijkt hiervan af.`,
  en: (timeZone) => `Note: this tournament's date, start time and registration times are in the tournament location's time zone: ${timeZone}. Your time zone differs.`,
  es: (timeZone) => `Aviso: la fecha, hora de inicio y horarios de inscripción de este torneo son en la zona horaria de la sede: ${timeZone}. Tu zona horaria es diferente.`,
  fr: (timeZone) => `Remarque : la date, l'heure de début et les horaires d'inscription de ce tournoi sont dans le fuseau horaire du lieu : ${timeZone}. Votre fuseau horaire est différent.`,
};

export const MAIL_NOT_ENABLED_HINT_TEMPLATES = {
  de: 'Hinweis: Der E-Mail-Versand für deine Turniere ist noch nicht von einem Admin freigeschaltet. Anmeldungen und Stornierungen funktionieren normal, es werden aber keine Bestätigungs-, Erinnerungs- oder Broadcast-Mails verschickt, bis die Freischaltung erfolgt ist.',
  nl: "Let op: het versturen van e-mails voor jouw toernooien is nog niet door een beheerder vrijgegeven. Aanmelden en afmelden werken normaal, maar er worden geen bevestigings-, herinnerings- of broadcastmails verstuurd totdat dit is vrijgegeven.",
  en: 'Note: email sending for your tournaments has not yet been approved by an admin. Registrations and cancellations work normally, but no confirmation, reminder or broadcast emails will be sent until this is approved.',
  es: 'Aviso: el envío de correos para tus torneos aún no ha sido aprobado por un administrador. Las inscripciones y cancelaciones funcionan con normalidad, pero no se enviará ningún correo de confirmación, recordatorio o difusión hasta que se apruebe.',
  fr: "Remarque : l'envoi d'e-mails pour vos tournois n'a pas encore été validé par un administrateur. Les inscriptions et annulations fonctionnent normalement, mais aucun e-mail de confirmation, de rappel ou de diffusion ne sera envoyé tant que la validation n'a pas eu lieu.",
};

export const REGISTRATION_OPENS_TEMPLATES = {
  de: (dateTime) => `Die Anmeldung für dieses Turnier ist ab ${dateTime} möglich.`,
  nl: (dateTime) => `Inschrijving voor dit toernooi is mogelijk vanaf ${dateTime}.`,
  en: (dateTime) => `Registration for this tournament is available from ${dateTime} onwards.`,
  es: (dateTime) => `La inscripción para este torneo está disponible desde ${dateTime}.`,
  fr: (dateTime) => `Les inscriptions pour ce tournoi sont possibles à partir du ${dateTime}.`,
};

export const PASSWORD_STRENGTH_ERROR = 'Das Passwort muss mindestens 8 Zeichen lang sein und mindestens eine Zahl, einen Kleinbuchstaben, einen Großbuchstaben und ein Sonderzeichen enthalten';
export const PASSWORD_STRENGTH_HINT = 'Mindestens 8 Zeichen, ein Groß- und Kleinbuchstabe, eine Zahl und ein Sonderzeichen.';

export function detectViewerTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function formatDate(value, language = 'de') {
  if (!value) {
    return '';
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(DISPLAY_LOCALES[language] || DISPLAY_LOCALES.de, { timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function timezoneAbbrev(date, timeZone, locale) {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value || timeZone;
  } catch {
    return timeZone;
  }
}

export function formatTournamentDateTime(value, language, timeZone) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const zone = timeZone || 'UTC';
  const viewerZone = detectViewerTimeZone();
  const locale = DISPLAY_LOCALES[language] || DISPLAY_LOCALES.de;
  const formatted = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(date);
  if (!viewerZone || viewerZone === zone) return formatted;
  return `${formatted} ${timezoneAbbrev(date, zone, locale)}`;
}

export function minorUnitsToAmount(units, currency) {
  if (!units) {
    return '';
  }
  const decimals = currencyDecimals(currency);
  return (Number(units) / 10 ** decimals).toFixed(decimals).replace('.', ',');
}

export function amountToMinorUnits(value, currency) {
  if (!value) {
    return 0;
  }
  const decimals = currencyDecimals(currency);
  const normalized = String(value).replace(',', '.');
  return Math.round(Number(normalized) * 10 ** decimals);
}

export function currencyOptions(language) {
  const locale = DISPLAY_LOCALES[language] || 'de-DE';
  let displayNames = null;
  try {
    displayNames = new Intl.DisplayNames([locale], { type: 'currency' });
  } catch {
    displayNames = null;
  }
  return CURRENCY_CODES.map((code) => ({
    value: code,
    label: displayNames ? `${code} – ${displayNames.of(code)}` : code,
  }));
}

export function formatMoney(units, currency, language) {
  if (!units) {
    return '';
  }
  const decimals = currencyDecimals(currency);
  const amount = Number(units) / 10 ** decimals;
  try {
    return new Intl.NumberFormat(DISPLAY_LOCALES[language] || 'de-DE', { style: 'currency', currency: currency || 'EUR' }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function utcIsoToZonedDateTimeInput(value, timeZone) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const valueFor = (type) => parts.find((part) => part.type === type)?.value;
    return `${valueFor('year')}-${valueFor('month')}-${valueFor('day')}T${valueFor('hour')}:${valueFor('minute')}`;
  } catch {
    return '';
  }
}

export function formatDateTime(value) {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function isPasswordStrong(password) {
  return (
    password.length >= 8 &&
    /[0-9]/.test(password) &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
