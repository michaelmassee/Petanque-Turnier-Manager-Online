import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { Button, EditDialog, Feedback, SelectField, TextField } from '../components/ui.jsx';
import { translateMailGatewayError } from '../mail-gateway-messages.js';

// Eigenes E-Mail-Gateway (Zusatzoption je Konto): Ist es aktiv, gehen alle Turnier-Mails des Kontos ausschließlich
// darüber – auch ohne Mail-Freischaltung durch einen Admin. Kein Ausweichen auf die Plattform bei Fehlern.
const EMPTY_FORM = {
  provider: 'smtp', smtpHost: '', smtpPort: '587', smtpSecurity: 'starttls', smtpUser: '', secret: '',
  fromEmail: '', fromName: '', replyTo: '', enabled: true,
};

function formFromGateway(gateway) {
  if (!gateway?.configured) return EMPTY_FORM;
  return {
    provider: gateway.provider,
    smtpHost: gateway.smtpHost || '',
    smtpPort: gateway.smtpPort ? String(gateway.smtpPort) : '587',
    smtpSecurity: gateway.smtpSecurity || 'starttls',
    smtpUser: gateway.smtpUser || '',
    secret: '',
    fromEmail: gateway.fromEmail || '',
    fromName: gateway.fromName || '',
    replyTo: gateway.replyTo || '',
    enabled: gateway.enabled,
  };
}

function GatewayStatus({ gateway }) {
  const { t } = useTranslation();
  if (!gateway?.configured) return null;
  if (!gateway.enabled) return <p className="hint">{t('Gateway ist deaktiviert – Turnier-Mails laufen wie bisher über PTM Online.')}</p>;
  if (gateway.status === 'ok') {
    return (
      <p className="mail-gateway-status mail-gateway-status--ok">
        {t('Funktioniert')}{gateway.lastSuccessAt ? ` · ${t('zuletzt erfolgreich: {{date}}', { date: formatDateTime(gateway.lastSuccessAt) })}` : ''}
      </p>
    );
  }
  if (gateway.status === 'error') {
    return (
      <p className="mail-gateway-status mail-gateway-status--error">
        {t('Fehler – Turnier-Mails gehen zurzeit nicht raus')}
        {gateway.lastErrorAt ? ` (${formatDateTime(gateway.lastErrorAt)})` : ''}
        {gateway.lastError ? <><br /><code>{translateMailGatewayError(t, gateway.lastError)}</code></> : null}
      </p>
    );
  }
  return <p className="mail-gateway-status">{t('Noch nicht getestet – bitte eine Test-Mail senden.')}</p>;
}

export default function MailGatewayPanel({ onChanged }) {
  const { t } = useTranslation();
  const [gateway, setGateway] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function applyGateway(next) {
    setGateway(next);
    setForm(formFromGateway(next));
  }

  useEffect(() => {
    let cancelled = false;
    authenticatedApi('/api/me/mail-gateway')
      .then((data) => { if (!cancelled) applyGateway(data.gateway); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const update = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));
  const isSmtp = form.provider === 'smtp';

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await authenticatedApi('/api/me/mail-gateway', {
        method: 'PUT',
        body: JSON.stringify({ ...form, smtpPort: Number(form.smtpPort) }),
      });
      applyGateway(data.gateway);
      setMessage(t('Gateway gespeichert. Bitte jetzt eine Test-Mail senden.'));
      onChanged?.(Boolean(data.gateway.configured && data.gateway.enabled));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setError('');
    setMessage('');
    try {
      const data = await authenticatedApi('/api/me/mail-gateway/test', { method: 'POST' });
      setGateway(data.gateway);
      setMessage(t('Test-Mail an {{email}} versendet.', { email: data.to }));
    } catch (err) {
      if (err.payload?.gateway) setGateway(err.payload.gateway);
      setError(err.payload?.sent === false ? t('Test-Mail fehlgeschlagen: {{error}}', { error: translateMailGatewayError(t, err.payload.error) }) : err.message);
    } finally {
      setTesting(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError('');
    setMessage('');
    try {
      const data = await authenticatedApi('/api/me/mail-gateway', { method: 'DELETE' });
      applyGateway(data.gateway);
      setConfirmRemove(false);
      setMessage(t('Eigenes E-Mail-Gateway entfernt.'));
      onChanged?.(Boolean(data.gateway.configured && data.gateway.enabled));
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving(false);
    }
  }

  if (!gateway && !error) return null;

  return (
    <div className="panel mail-gateway-panel">
      <div className="section-title">
        <h2>{t('Eigenes E-Mail-Gateway')}</h2>
      </div>
      <p className="hint">
        {t('Optional: Turnier-Mails an deine Teilnehmer (Anmeldebestätigungen, Erinnerungen, Rundmails, Endrangliste) über deinen eigenen Mailserver oder dein Resend-Konto versenden, mit deiner Absenderadresse. Ohne eigenes Gateway versendet PTM Online wie bisher.')}
      </p>
      <p className="hint">
        {t('Ist das Gateway aktiv, gehen Turnier-Mails ausschließlich darüber. Schlägt der Versand fehl, springen die Mailserver von PTM Online nicht ein – die Mails gehen dann nicht raus, und du bekommst eine Nachricht ins Postfach.')}
      </p>
      <Feedback error={error} />
      <Feedback message={message} />
      {gateway && !gateway.available && (
        <p className="feedback offline">{t('Eigene E-Mail-Gateways sind auf diesem Server nicht verfügbar.')}</p>
      )}
      <GatewayStatus gateway={gateway} />
      {gateway?.available && (
        <form className="form" onSubmit={handleSave}>
          <SelectField label={t('Anbieter')} value={form.provider} onChange={update('provider')} options={[
            { value: 'smtp', label: t('SMTP-Server') },
            { value: 'resend', label: 'Resend (API)' },
          ]} />
          {isSmtp && (
            <div className="form-grid">
              <TextField label={t('SMTP-Server')} value={form.smtpHost} onChange={update('smtpHost')} required
                placeholder="smtp.example.org" autoComplete="off" autoCapitalize="none" spellCheck={false} />
              <SelectField label={t('Port')} value={form.smtpPort} onChange={(port) => setForm((current) => ({
                ...current, smtpPort: port, smtpSecurity: port === '465' ? 'tls' : 'starttls',
              }))} options={['465', '587', '25', '2525'].map((port) => ({ value: port, label: port }))} />
              <SelectField label={t('Verschlüsselung')} value={form.smtpSecurity} onChange={update('smtpSecurity')} options={[
                { value: 'tls', label: 'SSL/TLS' },
                { value: 'starttls', label: 'STARTTLS' },
              ]} />
              <TextField label={t('Benutzername')} value={form.smtpUser} onChange={update('smtpUser')} required
                autoComplete="off" autoCapitalize="none" spellCheck={false} />
            </div>
          )}
          <TextField
            label={isSmtp ? t('Passwort') : t('API-Key')}
            type="password"
            value={form.secret}
            onChange={update('secret')}
            required={!gateway.hasSecret || gateway.provider !== form.provider}
            placeholder={gateway.hasSecret && gateway.provider === form.provider ? t('Gespeichert – leer lassen, um es beizubehalten') : ''}
            autoComplete="new-password"
          />
          <div className="form-grid">
            <TextField label={t('Absenderadresse')} type="email" value={form.fromEmail} onChange={update('fromEmail')} required autoComplete="off" />
            <TextField label={t('Absendername')} value={form.fromName} onChange={update('fromName')} placeholder={t('z. B. Vereinsname')} maxLength={100} />
            <TextField label={t('Antwortadresse (optional)')} type="email" value={form.replyTo} onChange={update('replyTo')} autoComplete="off" />
          </div>
          <p className="hint">
            {t('Damit die Mails nicht im Spam landen, muss die Absenderadresse zu deinem Mailserver passen (SPF/DKIM der Absenderdomain). Bei Gmail brauchst du ein App-Passwort.')}
          </p>
          <label className="checkbox-field">
            <input type="checkbox" checked={form.enabled} onChange={(event) => update('enabled')(event.target.checked)} />
            <span>{t('Eigenes Gateway für meine Turnier-Mails verwenden')}</span>
          </label>
          <div className="dialog-actions">
            <Button type="submit" loading={saving} disabled={testing || removing}>{t('Speichern')}</Button>
            {gateway.configured && (
              <Button variant="secondary" loading={testing} disabled={saving || removing} onClick={handleTest}>{t('Test-Mail senden')}</Button>
            )}
            {gateway.configured && (
              <Button variant="danger" disabled={saving || testing || removing} onClick={() => setConfirmRemove(true)}>{t('Entfernen')}</Button>
            )}
          </div>
        </form>
      )}
      <EditDialog open={confirmRemove} compact title={t('Eigenes E-Mail-Gateway entfernen?')} onClose={() => setConfirmRemove(false)}>
        <p>{t('Die Zugangsdaten werden gelöscht. Turnier-Mails laufen danach wieder über PTM Online – sofern der E-Mail-Versand für dein Konto freigeschaltet ist.')}</p>
        <div className="dialog-actions">
          <Button variant="danger" loading={removing} onClick={handleRemove}>{t('Entfernen')}</Button>
          <Button variant="secondary" disabled={removing} onClick={() => setConfirmRemove(false)}>{t('Abbrechen')}</Button>
        </div>
      </EditDialog>
    </div>
  );
}
