const PETANQUE_AKTUELL_ORIGIN = 'https://petanque-aktuell.de';
const PETANQUE_AKTUELL_CALENDAR_PATH = '/kialender_1/kalender.php';

function decodeHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/&uuml;/gi, 'ü').replace(/&ouml;/gi, 'ö').replace(/&auml;/gi, 'ä')
    .replace(/&Uuml;/g, 'Ü').replace(/&Ouml;/g, 'Ö').replace(/&Auml;/g, 'Ä')
    .replace(/&szlig;/gi, 'ß')
    .replace(/\s+/g, ' ').trim();
}

function absoluteSourceUrl(href) {
  try {
    const url = new URL(String(href || '').replace(/&amp;/gi, '&'), petanqueAktuellCalendarUrl());
    return url.origin === PETANQUE_AKTUELL_ORIGIN ? url.href : null;
  } catch {
    return null;
  }
}

export function petanqueAktuellCalendarUrl(start = null) {
  const url = new URL(PETANQUE_AKTUELL_CALENDAR_PATH, PETANQUE_AKTUELL_ORIGIN);
  if (Number.isInteger(start) && start > 0) url.searchParams.set('kal_Start', String(start));
  return url.href;
}

export function petanqueAktuellPageUrls(html) {
  const urls = new Set([petanqueAktuellCalendarUrl()]);
  // Nur echte Paginierungslinks (reines "?kal_Start=N") sammeln. Turnier-Detaillinks
  // (kal_Aktion=detail&...&kal_Start=N) tragen kal_Start ebenfalls in der Query mit,
  // zeigen aber auf eine einzelne Turnierseite statt der Kalenderliste - würden sie
  // mitgezählt, verbraucht jeder Detaillink einen Slot des Seiten-Limits.
  for (const match of String(html || '').matchAll(/href\s*=\s*["']?([^\s"'>]+kal_Start=\d+[^\s"'>]*)/gi)) {
    if (/kal_Aktion=/i.test(match[1])) continue;
    const url = absoluteSourceUrl(match[1]);
    if (url && new URL(url).pathname === PETANQUE_AKTUELL_CALENDAR_PATH) urls.add(url);
  }
  return [...urls];
}

export function mapPetanqueAktuellFormation(value) {
  const normalized = String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^1\s*:\s*1/.test(normalized)) return 'tete';
  if (/^2\s*:\s*2/.test(normalized)) return 'doublette';
  if (/^3\s*:\s*3/.test(normalized)) return 'triplette';
  return 'andere';
}

function dateFromCalendar(value) {
  const match = String(value || '').match(/(\d{2})\.(\d{2})\.(\d{2})/);
  return match ? `20${match[3]}-${match[2]}-${match[1]}` : null;
}

function hrefForDetail(row) {
  const match = row.match(/href\s*=\s*["']?([^\s"'>]*kal_Aktion=detail[^\s"'>]*kal_Nummer=(\d+)[^\s"'>]*)/i)
    || row.match(/href\s*=\s*["']?([^\s"'>]*kal_Nummer=(\d+)[^\s"'>]*)/i);
  if (!match) return null;
  const url = absoluteSourceUrl(match[1]);
  return url ? { id: match[2], url } : null;
}

function textForLink(row, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = row.match(new RegExp(`<a\\b[^>]*kal_Nummer=${escaped}[^>]*>([\\s\\S]*?)<\\/a>`, 'i'));
  return decodeHtml(match?.[1]);
}

function flyerUrlForRow(row) {
  for (const match of row.matchAll(/href\s*=\s*["']?([^\s"'>]+)/gi)) {
    const url = absoluteSourceUrl(match[1]);
    if (url && /\.(?:pdf|jpe?g|png)(?:$|[?#])/i.test(url)) return url;
  }
  return null;
}

function valueForLabel(row, label) {
  const match = row.match(new RegExp(`<span\\b[^>]*>\\s*${label}\\s*<\\/span>([\\s\\S]*?)(?=<div\\b[^>]*class=["'][^"']*kalTbLst|<\\/div>\\s*<div\\b[^>]*class=["'][^"']*kalTbZlX|$)`, 'i'));
  return decodeHtml(match?.[1]);
}

function calendarRows(html) {
  const tableRows = String(html || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  if (tableRows.length > 0) return tableRows;
  return String(html || '').match(/<div\b[^>]*class=["'][^"']*kalTbZl[12][^"']*["'][^>]*>[\s\S]*?(?=<\/div>\s*<div\b[^>]*class=["'][^"']*kalTbZlX|<div\b[^>]*class=["'][^"']*kalTbZl[12]|$)/gi) || [];
}

export function parsePetanqueAktuellCalendar(html) {
  const entries = [];
  for (const row of calendarRows(html)) {
    const detail = hrefForDetail(row);
    if (!detail) continue;
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => decodeHtml(cell[1]));
    const name = textForLink(row, detail.id);
    const labelled = cells.length === 0;
    const date = dateFromCalendar(labelled ? valueForLabel(row, 'Datum') : cells.find((cell) => /\d{2}\.\d{2}\.\d{2}/.test(cell)));
    const nameIndex = cells.findIndex((cell) => cell === name);
    const afterName = nameIndex >= 0 ? cells.slice(nameIndex + 1) : [];
    const location = labelled ? valueForLabel(row, 'Ort') : afterName[0] || '';
    const startTime = labelled ? valueForLabel(row, 'Uhrzeit') || null : afterName.find((cell) => /^\d{1,2}:\d{2}$/.test(cell)) || null;
    const timeIndex = afterName.indexOf(startTime);
    const formation = labelled ? valueForLabel(row, 'Formation') : timeIndex >= 0 ? afterName[timeIndex + 1] : '';
    const association = labelled ? valueForLabel(row, 'LV') : timeIndex >= 0 ? afterName[timeIndex + 2] : '';
    const licenseRequired = labelled ? valueForLabel(row, 'Lizenz') : timeIndex >= 0 ? afterName[timeIndex + 3] : '';
    if (!date || !name || !location) continue;
    entries.push({ id: detail.id, externalKey: `kalender:${detail.id}`, name, date, startTime, location, formation, association, licenseRequired, detailUrl: detail.url, flyerUrl: flyerUrlForRow(row) });
  }
  return entries;
}

export function mapPetanqueAktuellTournament(entry) {
  const formation = mapPetanqueAktuellFormation(entry.formation);
  const details = [
    entry.association ? `Landesverband: ${entry.association}` : null,
    entry.licenseRequired ? `Lizenz erforderlich: ${entry.licenseRequired}` : null,
    formation === 'andere' && entry.formation ? `Original-Formation: ${entry.formation}` : null,
    'Hinweis: Dieser Termin wurde automatisch aus dem Turnierkalender von Pétanque Aktuell übernommen.',
  ].filter(Boolean);
  return {
    externalKey: entry.externalKey,
    name: String(entry.name || '').trim(),
    club: null,
    date: entry.date,
    startTime: entry.startTime,
    location: String(entry.location || '').trim(),
    formation,
    description: details.join('\n'),
    websiteUrl: entry.detailUrl,
    flyerUrl: entry.flyerUrl,
  };
}

export function isFuturePetanqueAktuellTournament(entry, today = new Date().toISOString().slice(0, 10)) {
  return typeof entry?.date === 'string' && entry.date > today;
}
