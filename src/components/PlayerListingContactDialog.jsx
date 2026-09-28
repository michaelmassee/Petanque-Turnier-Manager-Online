import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Feedback, Button, TextArea, EditDialog } from './ui.jsx';

export function PlayerListingContactDialog({ listing, onClose }) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError(''); setSending(true);
    try {
      await authenticatedApi('/api/postbox/messages', { method: 'POST', body: JSON.stringify({ recipientId: listing.userId, body }) });
      setSent(true);
    } catch (err) { setError(err.message); } finally { setSending(false); }
  }

  return (
    <EditDialog open title={`${t('Nachricht an')} ${listing.ownerName || ''}`} error={error} onClose={onClose}>
      {sent ? (
        <Feedback message={t('Nachricht gesendet.')} />
      ) : (
        <form className="form" onSubmit={submit}>
          <TextArea label={t('Nachricht')} value={body} onChange={setBody} maxLength={250} />
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={onClose}>{t('Abbrechen')}</Button>
            <Button type="submit" disabled={!body.trim()} loading={sending}>{t('Senden')}</Button>
          </div>
        </form>
      )}
    </EditDialog>
  );
}

export default PlayerListingContactDialog;
