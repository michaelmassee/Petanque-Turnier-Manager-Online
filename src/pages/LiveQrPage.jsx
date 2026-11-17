import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { LiveQrCode } from '../components/LiveQrCode.jsx';
import { Button, Feedback } from '../components/ui.jsx';

const QR_PAGE_SIZE = 360;

export function liveLinkFor(origin, token) {
  return `${origin}/live/t/${encodeURIComponent(token)}`;
}

// QR-Code zum persönlichen Live-Link einer Meldung, großformatig zum Vorzeigen oder Ausdrucken. Die Turnierleitung
// öffnet die Seite aus dem Turnierdokument („QR-Code Live-Ansicht“). Der Link bleibt bewusst nicht auf diesem Gerät
// gemerkt – das Gerät gehört der Turnierleitung, nicht dem Team.
export function LiveQrPage({ token }) {
  const { t } = useTranslation();
  const [qrError, setQrError] = useState('');
  const query = useQuery({
    queryKey: ['live', 'qr', token],
    queryFn: () => api(`/api/live/token/${encodeURIComponent(token)}`),
    retry: false,
  });
  const url = liveLinkFor(window.location.origin, token);
  const data = query.data;

  let content;
  if (query.error?.status === 404) {
    content = <p>{t('Für diese Anmeldung gibt es keine Live-Ansicht.')}</p>;
  } else if (query.error) {
    content = <Feedback error={query.error.message} />;
  } else if (!data) {
    content = <p className="muted">{t('Wird geladen…')}</p>;
  } else {
    content = (
      <>
        <p className="live-qr-page-tournament">{data.tournament?.name}</p>
        <h1>{data.registration?.label}</h1>
        <Feedback error={qrError} />
        <LiveQrCode url={url} size={QR_PAGE_SIZE} onError={setQrError} />
        <p className="hint">{t('Mit dem Handy scannen: öffnet die Live-Ansicht dieses Teams (Runde, Gegner, Bahn), ohne Anmeldung.')}</p>
        <p className="live-qr-url" data-i18n-skip>{url}</p>
        <div className="dialog-actions live-qr-page-actions">
          <Button variant="secondary" onClick={() => window.print()}>{t('Drucken')}</Button>
        </div>
      </>
    );
  }

  return (
    <main className="app-shell live-qr-page">
      <section className="panel live-qr">{content}</section>
    </main>
  );
}

export default LiveQrPage;
