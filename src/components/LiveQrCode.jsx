import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_QR_DESIGN } from '../lib/qr-design.js';
import { loadQrLogo, toQrOptions } from '../lib/qr-style.js';

const QR_SIZE = 260;

// QR-Code zu einem persönlichen Live-Link im Standard-Design; gemeinsam für den Dialog der Anmeldeverwaltung und die
// QR-Seite, die die Turnierleitung aus dem Turnierdokument öffnet.
export function LiveQrCode({ url, size = QR_SIZE, onError }) {
  const { t } = useTranslation();
  const qrRef = useRef(null);
  // Aktueller Callback ohne neues Zeichnen bei jedem Rendern des Aufrufers.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const container = qrRef.current;
    if (!url || !container) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { default: QRCodeStyling } = await import('qr-code-styling');
        const logoUrl = await loadQrLogo(DEFAULT_QR_DESIGN);
        if (cancelled) return;
        container.replaceChildren();
        new QRCodeStyling(toQrOptions(DEFAULT_QR_DESIGN, url, { type: 'svg', size, logoUrl })).append(container);
      } catch (qrError) {
        console.error('Live QR failed', qrError);
        if (!cancelled) onErrorRef.current?.(t('QR-Code konnte nicht erzeugt werden'));
      }
    })();
    return () => { cancelled = true; };
  }, [url, size, t]);

  return <div className="live-qr-code" ref={qrRef} role="img" aria-label={t('QR-Code Live-Ansicht')} />;
}
