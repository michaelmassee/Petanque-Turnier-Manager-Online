import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, authenticatedApi } from '../lib/api.js';
import { DEFAULT_QR_DESIGN, sanitizeQrDesign } from '../lib/qr-design.js';
import { drawQrImage, qrFileName } from '../lib/qr-style.js';
import { canvasToBlob, createQrBitmap, saveBlob, shareQrPng } from '../lib/qr-image.js';
import { Button, DownloadIcon, Feedback, ShareIcon } from './ui.jsx';

// QR-Code des Turniers auf der Turnierseite (Info) für alle Besucher: derselbe feste Link /q/… im selben Design wie
// der gedruckte QR-Code der Turnierleitung; ohne eigenen Header-Text steht der Turniername darüber. „Teilen“ teilt
// das Bild. Ohne Link (z. B. Entwurf) bleibt das Panel weg.
// Bei privaten Turnieren ohne aktiven Freigabe-Link (sieht nur die Turnierleitung) führt der Code Gäste ins Leere:
// statt Code und Teilen-Knöpfen gibt es dann einen Hinweis und die ausdrückliche Freigabe.
export function TournamentQrPanel({ tournament, shareToken = '' }) {
  const { t } = useTranslation();
  const [qr, setQr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const tournamentId = tournament.id;

  useEffect(() => {
    let cancelled = false;
    setQr(null);
    api(`/api/tournaments/${tournamentId}/qr${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ''}`)
      .then((data) => {
        if (!cancelled && data?.qrUrl) setQr({ url: data.qrUrl, design: sanitizeQrDesign(data.design ?? DEFAULT_QR_DESIGN), shareActive: data.shareActive !== false });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tournamentId, shareToken]);

  if (!qr) return null;

  async function activateShare() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await authenticatedApi(`/api/tournaments/${tournamentId}/share-link`, { method: 'POST' });
      setQr((current) => ({ ...current, shareActive: true }));
      setMessage(t('Freigabe-Link aktiviert'));
    } catch (activateError) {
      setError(activateError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel tournament-qr-panel" aria-labelledby={`qr-panel-${tournamentId}`}>
      <h2 id={`qr-panel-${tournamentId}`}>{t('QR-Code zum Turnier')}</h2>
      {qr.shareActive ? (
        <QrImageShare url={qr.url} design={qr.design} title={tournament.name} label={t('QR-Code zum Turnier')} />
      ) : (
        <>
          <p className="muted">{t('Das Turnier ist privat und der Freigabe-Link ist nicht aktiv. Gäste können den QR-Code daher nicht öffnen.')}</p>
          <div className="row-actions">
            <Button loading={busy} onClick={activateShare}>{t('Freigabe-Link aktivieren')}</Button>
          </div>
        </>
      )}
      {/* Außerhalb der Zweige: „Freigabe-Link aktiviert“ bleibt sichtbar, wenn danach der Code erscheint. */}
      <Feedback message={message} error={error} />
    </section>
  );
}

// QR-Bild mit Teilen (Bild + Link), PNG-Download und „Link kopieren“ – im Info-Panel der Turnierseite und für den
// Anzeige-Link unter „Turnier starten“. Ohne eigenen Header-Text im Design steht der Titel über dem Code.
export function QrImageShare({ url, design, title, label }) {
  const { t } = useTranslation();
  const [drawn, setDrawn] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setDrawn(false);
    (async () => {
      try {
        const withHeader = design.header ? design : { ...design, header: title };
        const image = await createQrBitmap(withHeader, url);
        if (cancelled || !canvasRef.current) return;
        drawQrImage(canvasRef.current, image, withHeader);
        setDrawn(true);
      } catch (qrError) {
        console.error('QR panel failed', qrError);
        if (!cancelled) setError(t('QR-Code konnte nicht erzeugt werden'));
      }
    })();
    return () => { cancelled = true; };
  }, [url, design, title, t]);

  const fileName = qrFileName(title, 'png', t('Turnier'));

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
    const result = await shareQrPng({ blob: await canvasToBlob(canvasRef.current), fileName, title, text: `${title}\n${url}` });
    if (result === 'copied') setMessage(t('Bild in die Zwischenablage kopiert'));
    else if (result === 'unsupported') setError(t('Teilen wird von diesem Gerät nicht unterstützt'));
  });
  const download = () => run('download', async () => saveBlob(await canvasToBlob(canvasRef.current), fileName));
  const copyLink = () => run('copy', async () => {
    if (!navigator.clipboard?.writeText) throw new Error(t('Teilen wird von diesem Gerät nicht unterstützt'));
    await navigator.clipboard.writeText(url);
    setMessage(t('Link kopiert'));
  });

  return (
    <>
      <canvas ref={canvasRef} className="tournament-qr-canvas" role="img" aria-label={label} />
      <small className="qr-url" data-i18n-skip>{url}</small>
      <Feedback message={message} error={error} />
      <div className="row-actions">
        <Button disabled={!drawn} loading={busy === 'share'} onClick={share}><ShareIcon size={18} /> {t('Teilen')}</Button>
        <Button variant="secondary" disabled={!drawn} loading={busy === 'download'} onClick={download}><DownloadIcon /> {t('PNG herunterladen')}</Button>
        <Button variant="secondary" loading={busy === 'copy'} onClick={copyLink}>{t('Link kopieren')}</Button>
      </div>
    </>
  );
}
