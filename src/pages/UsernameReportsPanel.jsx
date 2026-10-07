import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { formatUserLabel } from '../lib/userLabel.js';
import { Button, EditDialog, Feedback, TextField } from '../components/ui.jsx';
import { UsernameField } from '../components/UsernameField.jsx';

// Admin: gemeldete Benutzernamen prüfen – umbenennen (Nutzer wird informiert, alter Name gesperrt) oder verwerfen.
export function UsernameReportsPanel({ onUsersChanged }) {
  const { t } = useTranslation();
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [renameReport, setRenameReport] = useState(null);
  const [renameForm, setRenameForm] = useState({ newUsername: '', reason: '' });
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);

  async function load() {
    try {
      const data = await authenticatedApi('/api/admin/username-reports');
      setReports(data.reports || []);
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []);

  async function resolve(report, body) {
    return authenticatedApi(`/api/admin/username-reports/${encodeURIComponent(report.id)}/resolve`, { method: 'POST', body: JSON.stringify(body) });
  }

  async function handleDismiss(report) {
    setError(''); setMessage('');
    setBusyId(report.id);
    try {
      await resolve(report, { action: 'dismiss' });
      setMessage(t('Meldung wurde verworfen.'));
      await load();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  }

  function openRename(report) {
    setRenameReport(report);
    setRenameForm({ newUsername: '', reason: report.reason || '' });
    setRenameError('');
  }

  async function handleRename(event) {
    event.preventDefault();
    setRenameError('');
    setRenaming(true);
    try {
      await resolve(renameReport, { action: 'rename', newUsername: renameForm.newUsername, reason: renameForm.reason });
      setRenameReport(null);
      setMessage(t('Benutzername wurde geändert, der Nutzer wurde benachrichtigt.'));
      await load();
      onUsersChanged?.();
    } catch (err) { setRenameError(err.message); } finally { setRenaming(false); }
  }

  if (reports.length === 0 && !error && !message) return null;

  return (
    <div className="panel username-reports-panel">
      <div className="section-title">
        <h2>{t('Gemeldete Benutzernamen')}</h2>
        <span className="counter">{reports.length}</span>
      </div>
      <Feedback message={message} />
      <Feedback error={error} />
      {reports.length === 0 && <p className="muted">{t('Keine offenen Meldungen.')}</p>}
      <div className="user-list">
        {reports.map((report) => (
          <article className="data-row user-row" key={report.id}>
            <div>
              <strong data-i18n-skip>@{report.reportedUsername}</strong>
              <span data-i18n-skip>{formatUserLabel(report.reportedUser)}</span>
              {report.reason && <span data-i18n-skip>„{report.reason}“</span>}
              <span className="muted">
                {t('Gemeldet von')} <span data-i18n-skip>{report.reporter ? formatUserLabel(report.reporter, { withClub: false }) : t('gelöschtem Konto')}</span>
                {' · '}{formatDateTime(report.createdAt)}
              </span>
            </div>
            <div className="row-actions">
              <Button onClick={() => openRename(report)} disabled={Boolean(busyId)}>{t('Umbenennen')}</Button>
              <Button variant="secondary" loading={busyId === report.id} disabled={Boolean(busyId)} onClick={() => handleDismiss(report)}>{t('Verwerfen')}</Button>
            </div>
          </article>
        ))}
      </div>

      <EditDialog open={Boolean(renameReport)} title={t('Benutzername ändern')} subtitle={renameReport ? `@${renameReport.reportedUser.username}` : ''} error={renameError} onClose={() => setRenameReport(null)}>
        <form className="form" onSubmit={handleRename}>
          <UsernameField value={renameForm.newUsername} onChange={(newUsername) => setRenameForm({ ...renameForm, newUsername })} required />
          <TextField label={t('Grund der Änderung (optional)')} value={renameForm.reason} onChange={(reason) => setRenameForm({ ...renameForm, reason })} maxLength={200} />
          <p className="hint">{t('Der Nutzer wird benachrichtigt. Der bisherige Name wird gesperrt und kann nicht erneut vergeben werden. Alle offenen Meldungen zu diesem Nutzer werden geschlossen.')}</p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setRenameReport(null)}>{t('Abbrechen')}</Button>
            <Button type="submit" loading={renaming}>{t('Umbenennen')}</Button>
          </div>
        </form>
      </EditDialog>
    </div>
  );
}
