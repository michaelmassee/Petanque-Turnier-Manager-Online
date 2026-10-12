import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatedApi } from './api.js';
import { createRankingPdfAttachment } from './ranking-pdf.js';
import { sendTournamentRankingEmail } from './ranking-email.js';

vi.mock('./api.js', () => ({ authenticatedApi: vi.fn() }));
vi.mock('./ranking-pdf.js', () => ({ createRankingPdfAttachment: vi.fn() }));

describe('Ranglistenversand im Browser', () => {
  beforeEach(() => vi.resetAllMocks());

  it('erzeugt nur die benötigten Sprachfassungen nach der Vorbereitung und lädt sie hoch', async () => {
    const prepared = { tournament: { name: 'Köln' }, ranking: [{ rank: 1, label: 'Änne Müller' }], revision: 'revision', languages: ['de', 'fr'] };
    authenticatedApi.mockResolvedValueOnce(prepared).mockResolvedValueOnce({ ok: true });
    createRankingPdfAttachment.mockImplementation((_tournament, _ranking, language) => ({ filename: 'rangliste.pdf', content: `pdf-${language}` }));

    await sendTournamentRankingEmail('id/with space');

    expect(authenticatedApi).toHaveBeenNthCalledWith(1, '/api/tournaments/id%2Fwith%20space/ranking-email');
    expect(createRankingPdfAttachment).toHaveBeenNthCalledWith(1, prepared.tournament, prepared.ranking, 'de');
    expect(createRankingPdfAttachment).toHaveBeenNthCalledWith(2, prepared.tournament, prepared.ranking, 'fr');
    expect(authenticatedApi).toHaveBeenNthCalledWith(2, '/api/tournaments/id%2Fwith%20space/ranking-email', {
      method: 'POST', body: JSON.stringify({ revision: 'revision', attachments: {
        de: { filename: 'rangliste.pdf', content: 'pdf-de' }, fr: { filename: 'rangliste.pdf', content: 'pdf-fr' },
      } }),
    });
  });

  it('erzeugt und sendet nichts nach einem bereits ausgelösten Versand', async () => {
    authenticatedApi.mockResolvedValueOnce({ sent: true });
    await sendTournamentRankingEmail('t1');
    expect(authenticatedApi).toHaveBeenCalledOnce();
    expect(createRankingPdfAttachment).not.toHaveBeenCalled();
  });

  it('reiht nach einem Fehler bei der PDF-Erzeugung keine Mail ein', async () => {
    authenticatedApi.mockResolvedValueOnce({ tournament: {}, ranking: [], revision: 'x', languages: ['de'] });
    createRankingPdfAttachment.mockImplementation(() => { throw new Error('PDF failed'); });
    await expect(sendTournamentRankingEmail('t1')).rejects.toThrow('PDF failed');
    expect(authenticatedApi).toHaveBeenCalledOnce();
  });
});
