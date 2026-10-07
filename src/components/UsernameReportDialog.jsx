import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button, EditDialog, TextArea } from './ui.jsx';

// Meldet einen anstößigen Benutzernamen an die Admins. user: { id, username }.
export function UsernameReportDialog({ user, onClose }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await authenticatedApi(`/api/users/${encodeURIComponent(user.id)}/username-report`, { method: 'POST', body: JSON.stringify({ reason }) });
      setMessage(t('Danke, die Meldung wurde an die Admins weitergeleitet.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <EditDialog title={t('Benutzername melden')} subtitle={`@${user.username}`} error={error} message={message} onClose={onClose}>
      {message ? (
        <div className="dialog-actions"><Button onClick={onClose}>{t('Schließen')}</Button></div>
      ) : (
        <form className="form" onSubmit={handleSubmit}>
          <p className="hint">{t('Melde Benutzernamen, die beleidigend, rassistisch oder anstößig sind. Ein Admin prüft die Meldung.')}</p>
          <TextArea label={t('Grund (optional)')} value={reason} onChange={setReason} maxLength={500} />
          <div className="dialog-actions">
            <Button type="submit" loading={busy}>{t('Melden')}</Button>
            <Button variant="secondary" onClick={onClose}>{t('Abbrechen')}</Button>
          </div>
        </form>
      )}
    </EditDialog>
  );
}

// Kleiner Flaggen-Button neben einem Benutzernamen; öffnet den Melde-Dialog.
export function UsernameReportButton({ user, currentUserId }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!user?.id || !user.username || !currentUserId || user.id === currentUserId) return null;
  return (
    <>
      <button
        type="button"
        className="username-report-btn"
        aria-label={t('Benutzername melden')}
        title={t('Benutzername melden')}
        onClick={(event) => { event.stopPropagation(); setOpen(true); }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 21V4m0 0h11l-2 4 2 4H5" /></svg>
      </button>
      {/* Portal: Das Formular darf nicht in einem umgebenden <form> landen (z. B. Turnier bearbeiten); stopPropagation
          verhindert, dass Klicks im Dialog den Klick-Handler einer umgebenden Nachricht auslösen. */}
      {open && createPortal(
        <div onClick={(event) => event.stopPropagation()}><UsernameReportDialog user={user} onClose={() => setOpen(false)} /></div>,
        document.body,
      )}
    </>
  );
}
