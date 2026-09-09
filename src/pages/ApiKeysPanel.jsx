import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { translateText } from '../lib/i18n.js';
import { formatDateTime } from '../lib/format.js';
import { API_KEY_STATUS_LABELS } from '../lib/domain.js';
import { Button } from '../components/ui.jsx';

function ApiKeysPanel({ isAdmin, language }) {
  const [apiKeys, setApiKeys] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [revealedSecret, setRevealedSecret] = useState(null);

  async function loadOwnKeys() {
    try {
      const data = await api('/api/api-keys');
      setApiKeys(data.apiKeys);
    } catch (err) {
      setPanelError(translateText(err.message, language));
    }
  }

  async function loadPendingRequests() {
    if (!isAdmin) {
      return;
    }
    try {
      const data = await api('/api/admin/api-keys?status=pending');
      setPendingRequests(data.apiKeys);
    } catch (err) {
      setPanelError(translateText(err.message, language));
    }
  }

  useEffect(() => {
    loadOwnKeys();
    loadPendingRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function handleRequest(event) {
    event.preventDefault();
    if (!label.trim()) {
      return;
    }
    setBusy(true);
    setPanelError('');
    try {
      await api('/api/api-keys/request', { method: 'POST', body: JSON.stringify({ label: label.trim() }) });
      setLabel('');
      await loadOwnKeys();
    } catch (err) {
      setPanelError(translateText(err.message, language));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevealSecret(id) {
    setPanelError('');
    try {
      const data = await api(`/api/api-keys/${id}/secret`);
      setRevealedSecret({ id, secret: data.secret });
      await loadOwnKeys();
    } catch (err) {
      setPanelError(translateText(err.message, language));
    }
  }

  async function handleRevoke(id) {
    if (!window.confirm('API-Schlüssel wirklich widerrufen?')) {
      return;
    }
    setPanelError('');
    try {
      await api(`/api/admin/api-keys/${id}/revoke`, { method: 'POST' });
      await loadOwnKeys();
    } catch (err) {
      setPanelError(translateText(err.message, language));
    }
  }

  async function handleApprove(id) {
    setPanelError('');
    try {
      await api(`/api/admin/api-keys/${id}/approve`, { method: 'POST' });
      await Promise.all([loadPendingRequests(), loadOwnKeys()]);
    } catch (err) {
      setPanelError(translateText(err.message, language));
    }
  }

  async function handleReject(id) {
    setPanelError('');
    try {
      await api(`/api/admin/api-keys/${id}/revoke`, { method: 'POST' });
      await loadPendingRequests();
    } catch (err) {
      setPanelError(translateText(err.message, language));
    }
  }

  return (
    <>
      <div className="panel">
        <div className="section-title">
          <h2>API-Zugänge</h2>
        </div>
        <p className="hint">
          Externe Turnierleitungs-Software (z.B. das PTM-Hauptprogramm auf deinem Rechner) braucht einen
          freigeschalteten API-Schlüssel, um Turniere anzulegen und Anmeldungen abzugleichen. Ein Administrator muss
          jede Installation einzeln genehmigen.
        </p>

        <form className="form" onSubmit={handleRequest}>
          <input
            type="text"
            placeholder="Bezeichnung der Installation, z.B. Bürorechner"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Button type="submit" disabled={busy || !label.trim()}>
            Schlüssel beantragen
          </Button>
        </form>

        {panelError && <p className="feedback error">{panelError}</p>}

        {revealedSecret && (
          <div className="api-key-secret-box">
            <p>Speichere diesen Schlüssel jetzt sicher ab. Er wird nicht erneut angezeigt.</p>
            <code>{revealedSecret.secret}</code>
          </div>
        )}

        <table className="data-table">
          <thead>
            <tr>
              <th>Bezeichnung</th>
              <th>Status</th>
              <th>Beantragt am</th>
              <th>Zuletzt genutzt</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => (
              <tr key={key.id}>
                <td>{key.label}</td>
                <td>{API_KEY_STATUS_LABELS[key.status] || key.status}</td>
                <td>{formatDateTime(key.requestedAt)}</td>
                <td>{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : '–'}</td>
                <td>
                  {key.status === 'approved' && key.secretAvailable && (
                    <Button variant="secondary" onClick={() => handleRevealSecret(key.id)}>
                      Schlüssel abholen
                    </Button>
                  )}
                  {key.status === 'approved' && (
                    <Button variant="secondary" onClick={() => handleRevoke(key.id)}>
                      Widerrufen
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {apiKeys.length === 0 && (
              <tr>
                <td colSpan={5}>Noch keine API-Schlüssel beantragt.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="panel">
          <div className="section-title">
            <h2>Offene Freischaltungsanfragen</h2>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Turnierleiter</th>
                <th>Bezeichnung</th>
                <th>Beantragt am</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pendingRequests.map((key) => (
                <tr key={key.id}>
                  <td>
                    {key.userName} ({key.userEmail})
                  </td>
                  <td>{key.label}</td>
                  <td>{formatDateTime(key.requestedAt)}</td>
                  <td>
                    <Button onClick={() => handleApprove(key.id)}>Genehmigen</Button>
                    <Button variant="secondary" onClick={() => handleReject(key.id)}>
                      Ablehnen
                    </Button>
                  </td>
                </tr>
              ))}
              {pendingRequests.length === 0 && (
                <tr>
                  <td colSpan={4}>Keine offenen Anfragen.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default ApiKeysPanel;
