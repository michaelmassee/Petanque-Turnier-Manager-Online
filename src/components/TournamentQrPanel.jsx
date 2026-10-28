import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { DEFAULT_QR_DESIGN, sanitizeQrDesign } from '../lib/qr-design.js';
import { drawQrImage, qrFileName } from '../lib/qr-style.js';
import { canvasToBlob, createQrBitmap, saveBlob, shareQrPng } from '../lib/qr-image.js';
import { Button, DownloadIcon, Feedback, ShareIcon } from './ui.jsx';

// QR-Code des Turniers auf der Turnierseite (Info) für alle Besucher: derselbe feste Link /q/… im selben Design wie
// der gedruckte QR-Code der Turnierleitung. „Teilen“ teilt das Bild. Ohne Link (z. B. Entwurf) bleibt das Panel weg.
export function TournamentQrPanel({ tournament, shareToken = '' }) {
  const { t } = useTranslation();
  const [qr, setQr] = useState(null);
  const [drawn, setDrawn] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canvasRef = useRef(null);
  const tournamentId = tournament.id;

  useEffect(() => {
    let cancelled = false;
    setQr(null);
    setDrawn(false);
    api(`/api/tournaments/${tournamentId}/qr${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ''}`)
      .then((data) => { if (!cancelled && data?.qrUrl) setQr({ url: data.qrUrl, design: sanitizeQrDesign(data.design ?? DEFAULT_QR_DESIGN) }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tournamentId, shareToken]);

  useEffect(() => {
    if (!qr) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const image = await createQrBitmap(qr.design, qr.url);
        if (cancelled || !canvasRef.current) return;
        drawQrImage(canvasRef.current, image, qr.design);
        setDrawn(true);
      } catch (qrError) {
        console.error('QR panel failed', qrError);
        if (!cancelled) setError(t('QR-Code konnte nicht erzeugt werden'));
      }
    })();
    return () => { cancelled = true; };
  }, [qr, t]);

  if (!qr) return null;
  const fileName = qrFileName(tournament.name, 'png', t('Turnier'));

  async function run(action, task) {
    setError('');
    setMessage('');
    setBusy(action);
    try {
      await task();
    } catch (taskError) {
      console.error(`QR panel ${action} failed`, taskError);
      setError(action === 'share' ? t('Bild konnte nicht geteilt werden') : taskError.message);
    } finally {
      setBusy('');
    }
  }

  const share = () => run('share', async () => {
    const result = await shareQrPng({ blob: await canvasToBlob(canvasRef.current), fileName, title: tournament.name, text: `${tournament.name}\n${qr.url}` });
    if (result === 'copied') setMessage(t('Bild in die Zwischenablage kopiert'));
    else if (result === 'unsupported') setError(t('Teilen wird von diesem Gerät nicht unterstützt'));
  });
  const download = () => run('download', async () => saveBlob(await canvasToBlob(canvasRef.current), fileName));
  const copyLink = () => run('copy', async () => {
    if (!navigator.clipboard?.writeText) throw new Error(t('Teilen wird von diesem Gerät nicht unterstützt'));
    await navigator.clipboard.writeText(qr.url);
    setMessage(t('Link kopiert'));
  });

  return (
    <section className="panel tournament-qr-panel" aria-labelledby={`qr-panel-${tournamentId}`}>
      <h2 id={`qr-panel-${tournamentId}`}>{t('QR-Code zum Turnier')}</h2>
      <canvas ref={canvasRef} className="tournament-qr-canvas" role="img" aria-label={t('QR-Code zum Turnier')} />
      <small className="qr-url" data-i18n-skip>{qr.url}</small>
      <Feedback message={message} error={error} />
      <div className="row-actions">
        <Button disabled={!drawn} loading={busy === 'share'} onClick={share}><ShareIcon size={18} /> {t('Teilen')}</Button>
        <Button variant="secondary" disabled={!drawn} loading={busy === 'download'} onClick={download}><DownloadIcon /> {t('PNG herunterladen')}</Button>
        <Button variant="secondary" loading={busy === 'copy'} onClick={copyLink}>{t('Link kopieren')}</Button>
      </div>
    </section>
  );
}
