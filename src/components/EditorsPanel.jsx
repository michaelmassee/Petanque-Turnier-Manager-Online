import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Feedback, SelectField } from './ui.jsx';
import { authenticatedApi } from '../lib/api.js';
import { formatUserLabel, formatUserName } from '../lib/userLabel.js';
import { UsernameReportButton } from './UsernameReportDialog.jsx';

/**
 * Zusätzliche Bearbeiter/Verwalter für Turniere und Mietangebote: endpoint liefert per GET/POST { editors },
 * DELETE ${endpoint}/:userId entfernt einen. Der Owner (Turnier) steht nur in der eigenen Zeile, nie als Bearbeiter.
 */
export function EditorsPanel({ endpoint, candidates = [], ownerId, owner, currentUserId, emptyText, hint }) {
  const { t } = useTranslation();
  const [editors, setEditors] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setEditors(null);
    authenticatedApi(endpoint)
      .then((data) => { if (!cancelled) setEditors(data.editors); })
      .catch((err) => { if (!cancelled) setPanelError(err.message); });
    return () => { cancelled = true; };
  }, [endpoint]);

  // Schutz für noch nicht migrierte/inkonsistente Bestände: Der Owner steht
  // ausschließlich in der eigenen Owner-Zeile, nie nochmals als Bearbeiter.
  const additionalEditors = (editors || []).filter((editor) => editor.id !== ownerId);
  const availableCandidates = candidates.filter((candidate) => candidate.id !== ownerId && !additionalEditors.some((editor) => editor.id === candidate.id));

  async function handleAdd(event) {
    event.preventDefault();
    if (!selectedCandidateId) return;
    setBusy(true);
    setPanelError('');
    try {
      const data = await authenticatedApi(endpoint, { method: 'POST', body: JSON.stringify({ userId: selectedCandidateId }) });
      setEditors(data.editors);
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
      const data = await authenticatedApi(`${endpoint}/${editorId}`, { method: 'DELETE' });
      setEditors(data.editors);
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-section">
      <div className="form-section-header">
        <span>{t('Bearbeitungsrechte verwalten')}</span>
      </div>
      {hint && <p className="hint">{hint}</p>}
      <Feedback error={panelError} />
      {editors === null ? (
        <p className="muted">{t('Lädt …')}</p>
      ) : (
        <>
          {owner && (
            <ul className="editor-list">
              <li>
                <span data-i18n-skip>
                  {formatUserName(owner)}
                  {owner.username && <span className="user-handle"> @{owner.username}</span>}
                </span>
                <span className="role">{t('Owner')}</span>
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
                    <span className="editor-actions">
                      <UsernameReportButton user={editor} currentUserId={currentUserId} />
                      <Button variant="secondary" type="button" disabled={busy} loading={busy} onClick={() => handleRemove(editor.id)}>{t('Entfernen')}</Button>
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
