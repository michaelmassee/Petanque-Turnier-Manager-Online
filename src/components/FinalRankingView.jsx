import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { DISPLAY_FIT_QUERY, useAutoScroll, useMediaQuery } from '../lib/hooks.js';
import { formatLocationAddress, tournamentImageUrl } from '../lib/domain.js';
import { formatDate, formatTournamentDateTime } from '../lib/format.js';
import { normalizeRanking } from '../lib/live-ranking.js';
import { RankingTable } from './RankingTable.jsx';
import { Button, Feedback } from './ui.jsx';

const PTM_LOGO_URL = '/icons/logo.png';
const PTM_NAME = 'Pétanque Turnier Manager Online';

function headerLines(tournament, language) {
  return [formatDate(tournament.date, language), tournament.club, formatLocationAddress(tournament.location)].filter(Boolean);
}

/**
 * Erstellt das Ranglisten-PDF im Browser (satori + svg2pdf wie beim Flyer). Die Module werden erst beim Klick
 * geladen, damit die Turnierseite schlank bleibt.
 */
export async function downloadRankingPdf({ tournament, entries, publishedAt, shareToken, language, t }) {
  const [{ buildRankingPages, rankingFileName, renderRankingSvg, RANKING_PAGE }, { typesetFlyerText }, { renderFlyerPdf }, { loadLogo, saveBlob }] = await Promise.all([
    import('../lib/ranking-pdf.js'), import('../lib/flyer-typesetter.js'), import('../lib/flyer-render.js'), import('../lib/image-data.js'),
  ]);
  // Ohne erreichbares Vereinslogo entsteht das PDF einfach ohne.
  const [club, ptm] = await Promise.all([
    tournament.logoUrl ? loadLogo(tournamentImageUrl(tournament.id, 'logo', shareToken)).catch(() => null) : null,
    loadLogo(PTM_LOGO_URL).catch(() => null),
  ]);
  const published = publishedAt ? `${t('Veröffentlicht am')} ${formatTournamentDateTime(publishedAt, language, tournament.timezone)}` : '';
  const pages = await buildRankingPages({
    tournament,
    entries,
    header: { title: t('Endrangliste'), name: tournament.name, lines: [headerLines(tournament, language).join(' · '), published] },
    logos: { club, ptm },
    footer: (page, total) => `${PTM_NAME} · ptmonline.org · ${t('Seite')} ${page} / ${total}`,
    t,
    typeset: typesetFlyerText,
  });
  const pdf = await renderFlyerPdf(pages.map(renderRankingSvg), RANKING_PAGE, { title: `${t('Endrangliste')} – ${tournament.name}` });
  saveBlob(new Blob([pdf], { type: 'application/pdf' }), rankingFileName(tournament));
}

/**
 * Veröffentlichte Endrangliste mit Vereins- und PTM-Logo; das PDF entsteht im Browser.
 * display: Bildschirm vor Ort – ohne PDF-Button; im Querformat scrollt die Tabelle von selbst, der Kopf bleibt stehen.
 */
export function FinalRankingView({ tournament, language, shareToken = '', display = false }) {
  const { t } = useTranslation();
  const fitsScreen = useMediaQuery(DISPLAY_FIT_QUERY);
  const scrollRef = useAutoScroll(display && fitsScreen);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const query = shareToken ? `?share=${encodeURIComponent(shareToken)}` : '';
    api(`/api/tournaments/${tournament.id}/ranking${query}`)
      .then((value) => { if (!cancelled) setData(value); })
      .catch((requestError) => { if (!cancelled) setLoadError(requestError.message); });
    return () => { cancelled = true; };
  }, [tournament.id, tournament.rankingPublishedAt, shareToken]);

  const entries = normalizeRanking(data?.ranking || []);

  async function handleDownload() {
    setBusy(true);
    setError('');
    try {
      await downloadRankingPdf({ tournament, entries, publishedAt: data?.publishedAt, shareToken, language, t });
    } catch {
      setError(t('Das PDF konnte nicht erstellt werden.'));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <Feedback error={loadError} />;
  if (!data) return <p className="muted">{t('Wird geladen…')}</p>;

  return (
    <section className={`final-ranking${display ? ' is-display' : ''}`}>
      <header className="final-ranking-header">
        {tournament.logoUrl
          ? <img className="final-ranking-logo" src={tournamentImageUrl(tournament.id, 'logo', shareToken)} alt={t('Vereinslogo')} />
          : <span className="final-ranking-logo" aria-hidden="true" />}
        <div className="final-ranking-title">
          <p className="eyebrow">{t('Endrangliste')}</p>
          <h2 data-i18n-skip>{tournament.name}</h2>
          <p className="muted" data-i18n-skip>{headerLines(tournament, language).join(' · ')}</p>
        </div>
        <img className="final-ranking-logo" src={PTM_LOGO_URL} alt={PTM_NAME} />
      </header>
      <div className="display-scroll" ref={scrollRef}>
        <div className="table-scroll">
          <RankingTable tournament={tournament} entries={entries} />
        </div>
      </div>
      {data.publishedAt && (
        <p className="muted">{t('Veröffentlicht am')} {formatTournamentDateTime(data.publishedAt, language, tournament.timezone)}</p>
      )}
      {!display && (
        <>
          <Feedback error={error} />
          <div className="final-ranking-actions">
            <Button variant="secondary" disabled={busy || !entries.length} loading={busy} onClick={handleDownload}>{t('PDF herunterladen')}</Button>
          </div>
        </>
      )}
    </section>
  );
}
