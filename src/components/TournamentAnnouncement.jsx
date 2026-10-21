import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { DISPLAY_LOCALES } from '../lib/format.js';
import { Button, Feedback, TextArea } from './ui.jsx';

const ANNOUNCEMENT_MAX_LENGTH = 300;

function formatAnnouncementTime(timestamp, language) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(DISPLAY_LOCALES[language] || DISPLAY_LOCALES.de, { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

// Aktuelle Ankündigung der Turnierleitung als Banner (Live-Ansicht und Turnierseite).
export function AnnouncementBanner({ announcement, language }) {
  const { t } = useTranslation();
  if (!announcement?.text) return null;
  return (
    <section className="announcement-banner" role="status">
      <span className="announcement-banner-icon" aria-hidden="true">📢</span>
      <div>
        <p className="announcement-banner-title">
          {t('Ankündigung der Turnierleitung')}
          {announcement.at && <span className="muted"> · {formatAnnouncementTime(announcement.at, language)}</span>}
        </p>
        <p className="announcement-banner-text" data-i18n-skip>{announcement.text}</p>
      </div>
    </section>
  );
}

/**
 * Turnierleitung: eine Ankündigung senden oder löschen. Sie erscheint in der Live-Ansicht (spätestens beim nächsten
 * Abruf) und auf der Turnierseite; Spieler mit Live-Push bekommen sie sofort.
 */
export function AnnouncementEditor({ tournament, onChange }) {
  const { t } = useTranslation();
  // Gesendeter Stand: Die Turnierliste der Seite wird nicht neu geladen, daher hier selbst nachführen.
  const [current, setCurrent] = useState(tournament.announcement || null);
  const [text, setText] = useState(tournament.announcement?.text || '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setCurrent(tournament.announcement || null);
    setText(tournament.announcement?.text || '');
  }, [tournament.id, tournament.announcement?.text]);

  async function save(nextText) {
    setError('');
    setMessage('');
    setBusy(nextText ? 'send' : 'delete');
    try {
      const data = await authenticatedApi(`/api/tournaments/${tournament.id}/announcement`, { method: 'PUT', body: JSON.stringify({ text: nextText }) });
      setCurrent(data.announcement || null);
      setText(data.announcement?.text || '');
      setMessage(nextText ? t('Ankündigung gesendet.') : t('Ankündigung gelöscht.'));
      onChange?.(data.announcement);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <details className="panel announcement-editor" open={Boolean(current?.text)}>
      <summary>📢 {t('Ankündigung')}</summary>
      <TextArea label={t('Mitteilung an alle Teilnehmer')} value={text} maxLength={ANNOUNCEMENT_MAX_LENGTH} rows={3} onChange={setText} />
      <p className="hint">{t('Erscheint in der Live-Ansicht und auf der Turnierseite, bis du sie löschst oder das Turnier abschließt. Spieler mit Live-Benachrichtigung erhalten sie sofort als Push.')}</p>
      <div className="row-actions">
        <Button disabled={Boolean(busy) || !text.trim()} loading={busy === 'send'} onClick={() => save(text.trim())}>{t('Senden')}</Button>
        <Button variant="secondary" disabled={Boolean(busy) || !current?.text} loading={busy === 'delete'} onClick={() => save('')}>{t('Löschen')}</Button>
      </div>
      <Feedback error={error} />
      <Feedback message={message} />
    </details>
  );
}
