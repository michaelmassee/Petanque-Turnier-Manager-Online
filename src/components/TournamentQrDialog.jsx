import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { DEFAULT_QR_DESIGN, QR_TEXT_MAX_LENGTH, sanitizeQrDesign } from '../lib/qr-design.js';
import {
  QR_COLOR_SWATCHES, composeQrSvg, drawQrImage, footerSuggestions, hasWeakQrContrast, headerSuggestions, layoutQrImage, loadQrLogo, qrFileName, toQrOptions,
} from '../lib/qr-style.js';
import { Button, DownloadIcon, EditDialog, SelectField, ShareIcon, TextField } from './ui.jsx';
import { TournamentPicker } from './TournamentPicker.jsx';

const PREVIEW_DELAY_MS = 200;

function loadQrCodeStyling() {
  return import('qr-code-styling').then((module) => module.default);
}

function saveBlob(blob, fileName) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob'))), 'image/png');
  });
}

function ColorField({ label, value, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="qr-color-field">
      <label>
        {label}
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
      <div className="qr-swatches" role="group" aria-label={label}>
        {QR_COLOR_SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            className={`qr-swatch${value === color ? ' active' : ''}`}
            style={{ backgroundColor: color }}
            aria-label={`${t('Farbe')} ${color}`}
            aria-pressed={value === color}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
  );
}

function SuggestionChips({ label, suggestions, onPick }) {
  const { t } = useTranslation();
  if (!suggestions.length) return null;
  return (
    <div className="qr-suggestions" role="group" aria-label={label}>
      <small className="muted">{t('Vorschläge:')}</small>
      {suggestions.map((text) => (
        <button key={text} type="button" className="qr-suggestion" onClick={() => onPick(text)} data-i18n-skip>{text}</button>
      ))}
    </div>
  );
}

/**
 * QR-Code zur Turnieranmeldung mit PTM-Logo. Farbe, Style sowie Header-/Footer-Text sind einstellbar;
 * das Design wird pro Turnier gespeichert und kann von anderen eigenen Turnieren übernommen werden.
 */
export function TournamentQrDialog({ tournament, url, initialDesign = null, sourceTournaments = [], currentUserId, onSaved, onClose }) {
  const { t, i18n } = useTranslation();
  const [design, setDesign] = useState(() => sanitizeQrDesign(initialDesign ?? DEFAULT_QR_DESIGN));
  const [savedDesign, setSavedDesign] = useState(() => (initialDesign ? sanitizeQrDesign(initialDesign) : null));
  const [sourceId, setSourceId] = useState('');
  const [saving, setSaving] = useState(false);
  const [copyingFrom, setCopyingFrom] = useState(false);
  const [downloading, setDownloading] = useState('');
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canvasRef = useRef(null);

  const dirty = JSON.stringify(design) !== JSON.stringify(savedDesign ?? sanitizeQrDesign(DEFAULT_QR_DESIGN));
  const weakContrast = hasWeakQrContrast(design);
  const sources = useMemo(
    () => sourceTournaments.filter((entry) => entry.canManage && entry.hasQrDesign && entry.id !== tournament.id),
    [sourceTournaments, tournament.id],
  );

  const dateLabel = formatDate(tournament.date, i18n.language);
  const headerTexts = headerSuggestions(tournament, { callToAction: t('Jetzt anmelden!'), prefix: t('Jetzt anmelden:'), dateLabel })
    .filter((text) => text !== design.header);
  const footerTexts = footerSuggestions(tournament, { dateLabel }).filter((text) => text !== design.footer);

  const update = (changes) => setDesign((current) => ({ ...current, ...changes }));

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const QRCodeStyling = await loadQrCodeStyling();
        const logoUrl = await loadQrLogo(design);
        const blob = await new QRCodeStyling(toQrOptions(design, url, { logoUrl })).getRawData('png');
        const image = await createImageBitmap(blob);
        if (!cancelled && canvasRef.current) drawQrImage(canvasRef.current, image, design);
      } catch (previewError) {
        console.error('QR preview failed', previewError);
        if (!cancelled) setError(t('QR-Code konnte nicht erzeugt werden'));
      }
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [design, url, t]);

  async function handleSave() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await authenticatedApi(`/api/tournaments/${tournament.id}/qr-design`, { method: 'PUT', body: JSON.stringify({ design }) });
      const stored = sanitizeQrDesign(data.design);
      setSavedDesign(stored);
      setDesign(stored);
      setMessage(t('QR-Code-Design gespeichert'));
      await onSaved?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyFrom(id) {
    setSourceId(id);
    if (!id) return;
    setCopyingFrom(true);
    setError('');
    setMessage('');
    try {
      const data = await authenticatedApi(`/api/tournaments/${id}/qr-design`);
      setDesign(sanitizeQrDesign(data.design ?? DEFAULT_QR_DESIGN));
      setMessage(t('Design übernommen – zum Behalten speichern'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCopyingFrom(false);
    }
  }

  async function handleDownload(extension) {
    setDownloading(extension);
    setError('');
    setMessage('');
    try {
      if (extension === 'png') {
        saveBlob(await canvasToBlob(canvasRef.current), qrFileName(tournament.name, 'png', t('Turnier')));
      } else {
        const QRCodeStyling = await loadQrCodeStyling();
        const svgBlob = await new QRCodeStyling(toQrOptions(design, url, { type: 'svg', logoUrl: await loadQrLogo(design) })).getRawData('svg');
        const layout = layoutQrImage(document.createElement('canvas').getContext('2d'), design);
        const svg = composeQrSvg(await svgBlob.text(), design, layout);
        saveBlob(new Blob([svg], { type: 'image/svg+xml' }), qrFileName(tournament.name, 'svg', t('Turnier')));
      }
    } catch (downloadError) {
      console.error('QR download failed', downloadError);
      setError(t('QR-Code konnte nicht erzeugt werden'));
    } finally {
      setDownloading('');
    }
  }

  // Teilt das fertige PNG über das Teilen-Menü des Geräts; wo Dateien nicht geteilt werden können
  // (viele Desktop-Browser), wird das Bild in die Zwischenablage kopiert.
  async function handleShareImage() {
    setSharing(true);
    setError('');
    setMessage('');
    try {
      const blob = await canvasToBlob(canvasRef.current);
      const file = new File([blob], qrFileName(tournament.name, 'png', t('Turnier')), { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: tournament.name, text: `${tournament.name}\n${url}` });
      } else if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setMessage(t('Bild in die Zwischenablage kopiert'));
      } else {
        setError(t('Teilen wird von diesem Gerät nicht unterstützt'));
      }
    } catch (shareError) {
      if (shareError.name !== 'AbortError') {
        console.error('QR share failed', shareError);
        setError(t('Bild konnte nicht geteilt werden'));
      }
    } finally {
      setSharing(false);
    }
  }

  async function handleCopyLink() {
    setError('');
    setMessage('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error(t('Teilen wird von diesem Gerät nicht unterstützt'));
      await navigator.clipboard.writeText(url);
      setMessage(t('Link kopiert'));
    } catch (copyError) {
      setError(copyError.message);
    }
  }

  return (
    <EditDialog wide title={t('QR-Code zur Anmeldung')} subtitle={tournament.name} message={message} error={error} onClose={onClose}>
      <div className="qr-dialog">
        <div className="qr-preview">
          <canvas ref={canvasRef} className="qr-preview-canvas" role="img" aria-label={t('Vorschau des QR-Codes')} />
          <small className="qr-url" data-i18n-skip>{url}</small>
          <Button variant="secondary" onClick={handleCopyLink}>{t('Link kopieren')}</Button>
          {weakContrast && (
            <p className="feedback offline">{t('Geringer Kontrast: Der QR-Code lässt sich eventuell nicht scannen. Dunkle Farbe auf hellem Hintergrund verwenden.')}</p>
          )}
        </div>
        <div className="qr-settings">
          <div className="qr-import">
            {sources.length > 0 ? (
              <TournamentPicker
                label={t('Design von anderem Turnier importieren')}
                tournaments={sources}
                value={sourceId}
                onChange={handleCopyFrom}
                currentUserId={currentUserId}
              />
            ) : (
              <>
                <strong>{t('Design von anderem Turnier importieren')}</strong>
                <small className="muted">{t('Noch kein anderes Turnier mit gespeichertem QR-Code-Design. Sobald du bei einem anderen Turnier ein Design speicherst, kannst du es hier übernehmen.')}</small>
              </>
            )}
            {copyingFrom && <small className="muted">{t('Design wird geladen …')}</small>}
          </div>
          <TextField label={t('Header-Text')} value={design.header} maxLength={QR_TEXT_MAX_LENGTH} onChange={(header) => update({ header })} data-i18n-skip />
          <SuggestionChips label={t('Vorschläge für den Header-Text')} suggestions={headerTexts} onPick={(header) => update({ header })} />
          <TextField label={t('Footer-Text')} value={design.footer} maxLength={QR_TEXT_MAX_LENGTH} onChange={(footer) => update({ footer })} data-i18n-skip />
          <SuggestionChips label={t('Vorschläge für den Footer-Text')} suggestions={footerTexts} onPick={(footer) => update({ footer })} />
          <SelectField
            label={t('Textgröße')}
            value={design.textSize}
            onChange={(textSize) => update({ textSize })}
            options={[{ value: 's', label: t('Klein') }, { value: 'm', label: t('Mittel') }, { value: 'l', label: t('Groß') }]}
          />
          <ColorField label={t('Farbe des Codes')} value={design.fgColor} onChange={(fgColor) => update({ fgColor })} />
          <ColorField label={t('Hintergrundfarbe')} value={design.bgColor} onChange={(bgColor) => update({ bgColor })} />
          <label className="checkbox-field">
            <input type="checkbox" checked={design.logoInCodeColor} onChange={(event) => update({ logoInCodeColor: event.target.checked })} />
            {t('PTM-Logo in Code-Farbe')}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(design.cornerColor)}
              onChange={(event) => update({ cornerColor: event.target.checked ? design.fgColor : '' })}
            />
            {t('Eigene Farbe für die Eckmarken')}
          </label>
          {design.cornerColor && <ColorField label={t('Farbe der Eckmarken')} value={design.cornerColor} onChange={(cornerColor) => update({ cornerColor })} />}
          <SelectField
            label={t('Punkt-Style')}
            value={design.dotType}
            onChange={(dotType) => update({ dotType })}
            options={[
              { value: 'square', label: t('Quadrate') },
              { value: 'dots', label: t('Runde Punkte') },
              { value: 'rounded', label: t('Abgerundet') },
              { value: 'extra-rounded', label: t('Stark abgerundet') },
              { value: 'classy', label: t('Klassisch') },
              { value: 'classy-rounded', label: t('Klassisch abgerundet') },
            ]}
          />
          <SelectField
            label={t('Eckmarken-Style')}
            value={design.cornerType}
            onChange={(cornerType) => update({ cornerType })}
            options={[
              { value: 'square', label: t('Eckig') },
              { value: 'extra-rounded', label: t('Abgerundet') },
              { value: 'dot', label: t('Rund') },
            ]}
          />
        </div>
      </div>
      {dirty && <small className="muted qr-unsaved">{t('Nicht gespeicherte Änderungen am Design')}</small>}
      <div className="dialog-actions qr-dialog-actions">
        <Button variant="secondary" onClick={() => setDesign(sanitizeQrDesign(DEFAULT_QR_DESIGN))}>{t('Zurücksetzen')}</Button>
        <span className="qr-dialog-actions-spacer" />
        <Button variant="secondary" loading={sharing} disabled={sharing || Boolean(downloading)} onClick={handleShareImage}>
          {!sharing && <ShareIcon size={18} />}{t('Bild teilen')}
        </Button>
        <Button variant="secondary" aria-label={t('SVG herunterladen')} title={t('SVG herunterladen')} loading={downloading === 'svg'} disabled={Boolean(downloading)} onClick={() => handleDownload('svg')}>
          {downloading !== 'svg' && <DownloadIcon />}SVG
        </Button>
        <Button variant="secondary" aria-label={t('PNG herunterladen')} title={t('PNG herunterladen')} loading={downloading === 'png'} disabled={Boolean(downloading)} onClick={() => handleDownload('png')}>
          {downloading !== 'png' && <DownloadIcon />}PNG
        </Button>
        <Button loading={saving} onClick={handleSave}>{t('Design speichern')}</Button>
      </div>
    </EditDialog>
  );
}
