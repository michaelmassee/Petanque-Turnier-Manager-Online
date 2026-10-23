import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Feedback, SelectField } from './ui.jsx';
import { authenticatedApi } from '../lib/api.js';
import { formatUserLabel, formatUserName } from '../lib/userLabel.js';
import { UsernameReportButton } from './UsernameReportDialog.jsx';

/**
 * Zusätzliche Bearbeiter/Verwalter für Turniere und Mietangebote: endpoint liefert per GET/POST { editors },
 * DELETE ${endpoint}/:userId entfernt einen. Der Owner steht nur in der eigenen Zeile, nie als Bearbeiter.
 * Mietangebote liefern zusätzlich owner, geerbte Vereinsbearbeiter und persönliche Nachrichteneinstellungen.
 */
export function EditorsPanel({ endpoint, candidates = [], ownerId, owner, currentUserId, emptyText, hint, notifications = false }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setPanelError('');
    setSelectedCandidateId('');
    authenticatedApi(endpoint)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setPanelError(err.message); });
    return () => { cancelled = true; };
  }, [endpoint]);

  // Schutz für noch nicht migrierte/inkonsistente Bestände: Der Owner steht
  // ausschließlich in der eigenen Owner-Zeile, nie nochmals als Bearbeiter.
  const panelOwner = owner || data?.owner;
  const panelOwnerId = ownerId || panelOwner?.id;
  const additionalEditors = (data?.editors || []).filter((editor) => editor.id !== panelOwnerId);
  const availableCandidates = candidates.filter((candidate) => candidate.id !== panelOwnerId && !additionalEditors.some((editor) => editor.id === candidate.id));

  async function handleAdd(event) {
    event.preventDefault();
    if (!selectedCandidateId) return;
    setBusy(true);
    setPanelError('');
    try {
      const result = await authenticatedApi(endpoint, { method: 'POST', body: JSON.stringify({ userId: selectedCandidateId }) });
      setData(result);
      setSelectedCandidateId('');
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(editorId) {
    setBusy(true);
    setPanelError('');
    try {
      const result = await authenticatedApi(`${endpoint}/${editorId}`, { method: 'DELETE' });
      setData(result);
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleNotifications(userId, notificationsEnabled) {
    setBusy(true);
    setPanelError('');
    try {
      setData(await authenticatedApi(`${endpoint}/${userId}`, { method: 'PUT', body: JSON.stringify({ notificationsEnabled }) }));
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function notificationSwitch(person) {
    const enabled = person.notificationsEnabled !== false;
    return (
      <label className="checkbox-field editor-notifications">
        <input type="checkbox" role="switch" checked={enabled} disabled={busy}
          aria-label={t('Nachrichten für {{name}}', { name: formatUserLabel(person) })}
          onChange={(event) => handleNotifications(person.id, event.target.checked)} />
        {t('Nachrichten erhalten')}: {enabled ? t('Ja') : t('Nein')}
      </label>
    );
  }

  return (
    <div className="form-section">
      <div className="form-section-header">
        <span>{t('Bearbeitungsrechte verwalten')}</span>
      </div>
      {hint && <p className="hint">{hint}</p>}
      {notifications && <p className="hint">{t('Der Schalter steuert Postfach- und Push-Nachrichten je Person für dieses Angebot.')}</p>}
      <Feedback error={panelError} />
      {data === null ? (
        <p className="muted">{t('Lädt …')}</p>
      ) : (
        <>
          {panelOwner && (
            <ul className="editor-list">
              <li>
                <span data-i18n-skip>
                  {formatUserName(panelOwner)}
                  {panelOwner.username && <span className="user-handle"> @{panelOwner.username}</span>}
                </span>
                <span className={`editor-actions${notifications ? ' editor-actions-with-notifications' : ''}`}>
                  <span className="role">{t('Owner')}</span>
                  {notifications && notificationSwitch(panelOwner)}
                </span>
              </li>
            </ul>
          )}
          {additionalEditors.length === 0 && <p className="muted">{emptyText}</p>}
          {additionalEditors.length > 0 && (
            <ul className="editor-list">
              {additionalEditors.map((editor) => (
                  <li key={editor.id}>
                    <span data-i18n-skip>
                      {formatUserName(editor)}
                      {editor.username && <span className="user-handle"> @{editor.username}</span>}
                    </span>
                    <span className={`editor-actions${notifications ? ' editor-actions-with-notifications' : ''}`}>
                      {editor.inherited && <span className="role">{t('Vereinsbearbeiter')}</span>}
                      {notifications && notificationSwitch(editor)}
                      <UsernameReportButton user={editor} currentUserId={currentUserId} />
                      {!editor.inherited && <Button variant="secondary" type="button" disabled={busy} loading={busy} onClick={() => handleRemove(editor.id)}>{t('Entfernen')}</Button>}
                    </span>
                  </li>
              ))}
            </ul>
          )}
          {availableCandidates.length > 0 && (
            <div className="inline-form">
              <SelectField
                label={t('Benutzer hinzufügen')}
                value={selectedCandidateId}
                onChange={setSelectedCandidateId}
                options={[
                  { value: '', label: t('Bitte wählen') },
                  ...availableCandidates.map((candidate) => ({ value: candidate.id, label: formatUserLabel(candidate) })),
                ]}
              />
              <Button type="button" disabled={busy || !selectedCandidateId} loading={busy} onClick={handleAdd}>{t('Hinzufügen')}</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
