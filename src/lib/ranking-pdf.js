import { jsPDF } from 'jspdf';

const LABELS = {
  de: { ranking: 'Endrangliste', place: 'Platz', team: 'Team', wins: 'Siege', pointsFor: 'Punkte +', pointsAgainst: 'Punkte -', pointsDiff: 'Differenz', date: 'Datum', location: 'Ort' },
  en: { ranking: 'Final ranking', place: 'Place', team: 'Team', wins: 'Wins', pointsFor: 'Points +', pointsAgainst: 'Points -', pointsDiff: 'Difference', date: 'Date', location: 'Location' },
  fr: { ranking: 'Classement final', place: 'Place', team: 'Équipe', wins: 'Victoires', pointsFor: 'Points +', pointsAgainst: 'Points -', pointsDiff: 'Différence', date: 'Date', location: 'Lieu' },
  es: { ranking: 'Clasificación final', place: 'Puesto', team: 'Equipo', wins: 'Victorias', pointsFor: 'Puntos +', pointsAgainst: 'Puntos -', pointsDiff: 'Diferencia', date: 'Fecha', location: 'Lugar' },
  nl: { ranking: 'Eindranglijst', place: 'Plaats', team: 'Team', wins: 'Overwinningen', pointsFor: 'Punten +', pointsAgainst: 'Punten -', pointsDiff: 'Verschil', date: 'Datum', location: 'Locatie' },
};

function base64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function teamLabel(entry) {
  return entry.label || entry.members?.map((member) => [member.firstName, member.lastName].filter(Boolean).join(' ')).join(' + ') || '?';
}

// jsPDF übernimmt die WinAnsi-Kodierung. Nur nicht darstellbare Zeichen werden
// transliteriert; unterstützte Umlaute und Akzente bleiben unverändert.
function fontText(pdf, value) {
  const encoding = pdf.getFont().metadata.Unicode.encoding.WinAnsiEncoding;
  const supported = (char) => {
    const code = char.codePointAt(0);
    return char === '\n' || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || encoding[code] !== undefined;
  };
  const substitutions = { ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', ı: 'i', ſ: 's' };
  return [...String(value)].map((char) => supported(char) ? char
    : [...(substitutions[char] || char.normalize('NFD').replace(/\p{M}/gu, ''))]
      .map((part) => supported(part) ? part : '?').join('')).join('');
}

function wrapTeamLabel(pdf, value, maxWidth) {
  const lines = pdf.splitTextToSize(value, maxWidth) || ['?'];
  const wrapped = [];
  for (let line of lines) {
    while (pdf.getTextWidth(line) > maxWidth) {
      let cut = line.length - 1;
      while (cut > 1 && pdf.getTextWidth(`${line.slice(0, cut)}-`) > maxWidth) cut -= 1;
      wrapped.push(`${line.slice(0, cut)}-`);
      line = line.slice(cut);
    }
    wrapped.push(line);
  }
  return wrapped;
}

function columnsFor(ranking, labels) {
  const columns = [{ key: 'rank', label: labels.place, x: 50, width: 36 }, { key: 'team', label: labels.team, x: 92, width: 225 }];
  if (ranking.some((entry) => entry.wins !== null && entry.wins !== undefined)) columns.push({ key: 'wins', label: labels.wins, x: 330, width: 62 });
  if (ranking.some((entry) => entry.pointsFor !== null && entry.pointsFor !== undefined)) columns.push({ key: 'pointsFor', label: labels.pointsFor, x: 400, width: 48 });
  if (ranking.some((entry) => entry.pointsAgainst !== null && entry.pointsAgainst !== undefined)) columns.push({ key: 'pointsAgainst', label: labels.pointsAgainst, x: 455, width: 42 });
  if (ranking.some((entry) => entry.pointsDiff !== null && entry.pointsDiff !== undefined)) columns.push({ key: 'pointsDiff', label: labels.pointsDiff, x: 505, width: 40 });
  return columns;
}

function headerLines(pdf, value, maxLines) {
  const lines = wrapTeamLabel(pdf, value, 495);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  let last = visible.at(-1);
  while (pdf.getTextWidth(`${last}…`) > 495) last = last.slice(0, -1);
  visible[maxLines - 1] = `${last}…`;
  return visible;
}

function pageHeader(pdf, tournament, labels, columns) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  const title = headerLines(pdf, fontText(pdf, tournament.name || '-'), 4);
  pdf.text(title, 50, 52, { lineHeightFactor: 1.15 });
  let y = 52 + (title.length - 1) * 16 * 1.15 + 24;
  pdf.setFontSize(12);
  pdf.text(labels.ranking, 50, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  y += 20;
  pdf.text(fontText(pdf, `${labels.date}: ${tournament.date || '-'}`), 50, y);
  y += 14;
  const location = headerLines(pdf, fontText(pdf, `${labels.location}: ${tournament.location || '-'}`), 3);
  pdf.text(location, 50, y, { lineHeightFactor: 1.4 });
  y += (location.length - 1) * 14;
  pdf.setLineWidth(0.75);
  pdf.line(50, y + 19, 545, y + 19);
  pdf.line(50, y + 41, 545, y + 41);
  pdf.setFont('helvetica', 'bold');
  columns.forEach((column) => {
    pdf.setFontSize(7);
    const width = pdf.getTextWidth(column.label);
    if (width > column.width) pdf.setFontSize(7 * column.width / width);
    pdf.text(column.label, column.x, y + 36);
  });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  return y + 57;
}

/** @returns {{ filename: string, content: string }} Resend-/SMTP-kompatibler Base64-Anhang. */
export function createRankingPdfAttachment(tournament, ranking, language = 'de') {
  const labels = LABELS[language] || LABELS.de;
  const columns = columnsFor(ranking, labels);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true, putOnlyUsedFonts: true });
  const bodyStart = pageHeader(pdf, tournament, labels, columns);
  let y = bodyStart;
  const rowHeight = 14;
  for (const entry of ranking) {
    const lines = wrapTeamLabel(pdf, fontText(pdf, teamLabel(entry)), 225);
    if (y + (lines.length - 1) * rowHeight > 787 && y > bodyStart) {
      pdf.addPage();
      y = pageHeader(pdf, tournament, labels, columns);
    }
    columns.forEach((column) => {
      const value = column.key === 'team' ? lines[0] : entry[column.key];
      pdf.text(fontText(pdf, value ?? ''), column.x, y, { maxWidth: column.width });
    });
    y += rowHeight;
    for (const line of lines.slice(1)) {
      if (y > 787) {
        pdf.addPage();
        y = pageHeader(pdf, tournament, labels, columns);
      }
      pdf.text(line, 92, y, { maxWidth: 225 });
      y += rowHeight;
    }
  }
  const pages = pdf.getNumberOfPages();
  pdf.setFontSize(8);
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.text(String(page), 50, 808);
  }
  return { filename: 'rangliste.pdf', content: base64(new Uint8Array(pdf.output('arraybuffer'))) };
}
