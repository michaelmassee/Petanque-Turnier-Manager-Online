import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { LiveQrCode } from './LiveQrCode.jsx';
import { Button, EditDialog, Feedback, ShareLinkButton } from './ui.jsx';

// QR-Code zum persönlichen Live-Link einer Meldung: Die Turnierleitung zeigt ihn am Turniertag vor (z. B. für Teams ohne
// E-Mail-Adresse). Der Server liefert den bestehenden Link; nur wenn der alte Link nicht wiederherstellbar ist, kann hier
// nach einem Hinweis ein neuer erzeugt werden.
export function LiveQrDialog({ registration, onClose }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [notRecoverable, setNotRecoverable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const registrationId = registration?.id;
  // Der Dialog bleibt gemountet; eine verspätete Antwort für eine vorher geöffnete Meldung darf nicht in die nächste.
  const currentIdRef = useRef(registrationId);
  currentIdRef.current = registrationId;

  useEffect(() => {
    if (!registrationId) return undefined;
    let cancelled = false;
    setUrl(''); setError(''); setNotRecoverable(false); setRenewing(false); setLoading(true);
    authenticatedApi(`/api/registrations/${registrationId}/live-link/qr`)
      .then((data) => { if (!cancelled) setUrl(data.url); })
      .catch((err) => {
        if (cancelled) return;
        if (err.payload?.details?.code === 'live_link_not_recoverable') setNotRecoverable(true);
        else setError(err.message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [registrationId]);

  async function renew() {
    const id = registrationId;
    const stillCurrent = () => currentIdRef.current === id;
    setError('');
    setRenewing(true);
    try {
      const data = await authenticatedApi(`/api/registrations/${id}/live-link/qr`, { method: 'POST' });
      if (!stillCurrent()) return;
      setNotRecoverable(false);
      setUrl(data.url);
    } catch (err) {
      if (stillCurrent()) setError(err.message);
    } finally {
      if (stillCurrent()) setRenewing(false);
    }
  }

  const teamName = registration ? `${registration.firstName || ''} ${registration.lastName || ''}`.trim() : '';
  return (
    <EditDialog open={Boolean(registration)} title={t('QR-Code Live-Ansicht')} subtitle={teamName} onClose={onClose}>
      <div className="live-qr">
        <Feedback error={error} />
        {loading && <p className="muted">{t('Wird geladen…')}</p>}
        {notRecoverable && (
          <>
            <p className="hint">{t('Der bisherige Live-Link dieser Meldung kann nicht angezeigt werden, weil er vor dieser Funktion verschickt wurde. Ein neuer Link macht den bisherigen aus der Bestätigungsmail ungültig.')}</p>
            <Button loading={renewing} onClick={renew}>{t('Neuen Live-Link erzeugen')}</Button>
          </>
        )}
        {url && (
          <>
            <p className="hint">{t('Mit dem Handy scannen: öffnet die Live-Ansicht dieses Teams (Runde, Gegner, Bahn), ohne Anmeldung.')}</p>
            <LiveQrCode url={url} onError={setError} />
            <p className="live-qr-url" data-i18n-skip>{url}</p>
            <div className="dialog-actions">
              <ShareLinkButton url={url} linkOnly />
            </div>
          </>
        )}
      </div>
    </EditDialog>
  );
}
