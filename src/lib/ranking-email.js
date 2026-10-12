import { authenticatedApi } from './api.js';

// Erst beim ausdrücklichen Versandklick laden und rechnen: keine PDFs im Worker,
// keine Vorab-Abfragen beim Öffnen der Postbox und keine zusätzliche Queue.
export async function sendTournamentRankingEmail(tournamentId) {
  const path = `/api/tournaments/${encodeURIComponent(tournamentId)}/ranking-email`;
  const prepared = await authenticatedApi(path);
  if (prepared.sent) return;
  const { createRankingPdfAttachment } = await import('./ranking-pdf.js');
  const attachments = Object.fromEntries(prepared.languages.map((language) => [
    language, createRankingPdfAttachment(prepared.tournament, prepared.ranking, language),
  ]));
  await authenticatedApi(path, { method: 'POST', body: JSON.stringify({ revision: prepared.revision, attachments }) });
}
