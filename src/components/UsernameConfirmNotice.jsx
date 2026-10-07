import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button, Feedback } from './ui.jsx';

// Einmaliger Hinweis für automatisch vergebene Benutzernamen (Google-/Facebook-Neukonten, Bestandskonten).
export function UsernameConfirmNotice({ username, onConfirmed, onChange }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setError('');
    setBusy(true);
    try {
      await authenticatedApi('/api/me/username/confirm', { method: 'POST' });
      onConfirmed();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel username-confirm-notice" aria-label={t('Dein Benutzername')}>
      <h2>{t('Dein Benutzername')}</h2>
      <p>{t('Dein Benutzername ist @{{username}}. Darüber finden dich andere eindeutig – auch bei gleichem Namen.', { username })}</p>
      <Feedback error={error} />
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onChange}>{t('Ändern')}</Button>
        <Button onClick={confirm} loading={busy}>{t('Passt so')}</Button>
      </div>
    </section>
  );
}
