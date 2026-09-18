import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { API_KEY_STATUS_LABELS } from '../lib/domain.js';
import { filterApiKeys } from '../frontend-core.js';
import { Button, ListToolbar, EditDialog, SelectField, TextField } from '../components/ui.jsx';
import { InfiniteListLoadMore, useInfiniteList } from '../components/InfiniteListLoadMore.jsx';

const API_KEY_STATUS_FILTERS = [
  { value: '', label: 'Alle Status' },
  { value: 'pending', label: 'Ausstehend' },
  { value: 'approved', label: 'Freigeschaltet' },
  { value: 'revoked', label: 'Widerrufen' },
];

const EMPTY_ADMIN_KEY_FORM = { id: '', userId: '', label: '' };

export function OwnApiKeysPanel() {
  const { t } = useTranslation();
  const [apiKeys, setApiKeys] = useState([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [revealedSecret, setRevealedSecret] = useState(null);
  const [actionId, setActionId] = useState('');
  const visibleApiKeys = useInfiniteList(apiKeys);

  async function loadOwnKeys() {
    try {
      const data = await authenticatedApi('/api/api-keys');
      setApiKeys(data.apiKeys);
    } catch (err) {
      setPanelError(err.message);
    }
  }

  useEffect(() => {
    loadOwnKeys();
  }, []);

  async function handleRequest(event) {
    event.preventDefault();
    if (!label.trim()) {
      return;
    }
    setBusy(true);
    setPanelError('');
    try {
      await authenticatedApi('/api/api-keys/request', { method: 'POST', body: JSON.stringify({ label: label.trim() }) });
      setLabel('');
      await loadOwnKeys();
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevealSecret(id) {
    setPanelError('');
    setActionId(`reveal-${id}`);
    try {
      const data = await authenticatedApi(`/api/api-keys/${id}/secret`);
      setRevealedSecret({ id, secret: data.secret });
      await loadOwnKeys();
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setActionId('');
    }
  }

  return (
    <div className="panel">
      <div className="section-title">
        <h2>{t('API-Zugänge')}</h2>
      </div>
      <p className="hint">
        {t('Externe Turnierleitungs-Software (z.B. das PTM-Hauptprogramm auf deinem Rechner) braucht einen freigeschalteten API-Schlüssel, um Turniere anzulegen und Anmeldungen abzugleichen. Ein Administrator muss jede Installation einzeln genehmigen.')}
      </p>

      <form className="form" onSubmit={handleRequest}>
        <input
          type="text"
          placeholder={t('Bezeichnung der Installation, z.B. Bürorechner')}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <Button type="submit" disabled={busy || !label.trim()} loading={busy}>
          {t('Schlüssel beantragen')}
        </Button>
      </form>

      {panelError && <p className="feedback error">{panelError}</p>}

      {revealedSecret && (
        <div className="api-key-secret-box">
          <p>{t('Speichere diesen Schlüssel jetzt sicher ab. Er wird nicht erneut angezeigt.')}</p>
          <code>{revealedSecret.secret}</code>
        </div>
      )}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('Bezeichnung')}</th>
              <th>{t('Status')}</th>
              <th>{t('Beantragt am')}</th>
              <th>{t('Zuletzt genutzt')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleApiKeys.items.map((key) => (
              <tr key={key.id}>
                <td>{key.label}</td>
                <td>{API_KEY_STATUS_LABELS[key.status] || key.status}</td>
                <td>{formatDateTime(key.requestedAt)}</td>
                <td>{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : '–'}</td>
                <td>
                  {key.status === 'approved' && key.secretAvailable && (
                    <Button variant="secondary" disabled={Boolean(actionId)} loading={actionId === `reveal-${key.id}`} onClick={() => handleRevealSecret(key.id)}>
                      {t('Schlüssel abholen')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {apiKeys.length === 0 && (
              <tr>
                <td colSpan={5}>{t('Noch keine API-Schlüssel beantragt.')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <InfiniteListLoadMore hasMore={visibleApiKeys.hasMore} onLoadMore={visibleApiKeys.loadMore} label={t('Weitere Einträge laden')} />
    </div>
  );
}

function ApiKeysPanel({ isAdmin }) {
  const { t } = useTranslation();
  const [panelError, setPanelError] = useState('');

  const [allApiKeys, setAllApiKeys] = useState([]);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState('create');
  const [form, setForm] = useState(EMPTY_ADMIN_KEY_FORM);
  const [adminError, setAdminError] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminActionId, setAdminActionId] = useState('');

  async function loadAllApiKeys() {
    if (!isAdmin) {
      return;
    }
    try {
      const data = await authenticatedApi('/api/admin/api-keys');
      setAllApiKeys(data.apiKeys);
    } catch (err) {
      setPanelError(err.message);
    }
  }

  async function loadUsers() {
    if (!isAdmin) {
      return;
    }
    try {
      const data = await authenticatedApi('/api/users');
      setUsers(data.users);
    } catch (err) {
      setPanelError(err.message);
    }
  }

  useEffect(() => {
    loadAllApiKeys();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filteredApiKeys = useMemo(() => filterApiKeys(allApiKeys, query, statusFilter), [allApiKeys, query, statusFilter]);
  const filtered = filteredApiKeys.length !== allApiKeys.length;

  function resetFilters() {
    setQuery('');
    setStatusFilter('');
  }

  async function handleRevoke(id) {
    if (!window.confirm('API-Schlüssel wirklich sperren?')) {
      return;
    }
    setPanelError('');
    setAdminActionId(`revoke-${id}`);
    try {
      await authenticatedApi(`/api/admin/api-keys/${id}/revoke`, { method: 'POST' });
      await loadAllApiKeys();
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setAdminActionId('');
    }
  }

  async function handleApprove(id) {
    setPanelError('');
    setAdminActionId(`approve-${id}`);
    try {
      await authenticatedApi(`/api/admin/api-keys/${id}/approve`, { method: 'POST' });
      await loadAllApiKeys();
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setAdminActionId('');
    }
  }

  async function handleDelete(key) {
    if (!window.confirm(`API-Schlüssel "${key.label}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) {
      return;
    }
    setPanelError('');
    setAdminActionId(`delete-${key.id}`);
    try {
      await authenticatedApi(`/api/admin/api-keys/${key.id}`, { method: 'DELETE' });
      await loadAllApiKeys();
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setAdminActionId('');
    }
  }

  function openCreateDialog() {
    setForm({ ...EMPTY_ADMIN_KEY_FORM, userId: users[0]?.id || '' });
    setMode('create');
    setAdminError('');
    setDialogOpen(true);
  }

  function openEditDialog(key) {
    setForm({ id: key.id, userId: key.userId, label: key.label });
    setMode('edit');
    setAdminError('');
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  async function handleDialogSubmit(event) {
    event.preventDefault();
    setAdminError('');
    setAdminSaving(true);
    try {
      if (mode === 'edit') {
        await authenticatedApi(`/api/admin/api-keys/${form.id}`, { method: 'PUT', body: JSON.stringify({ label: form.label.trim() }) });
      } else {
        await authenticatedApi('/api/admin/api-keys', { method: 'POST', body: JSON.stringify({ userId: form.userId, label: form.label.trim() }) });
      }
      setDialogOpen(false);
      await loadAllApiKeys();
    } catch (err) {
      setAdminError(err.message);
    } finally {
      setAdminSaving(false);
    }
  }

  const userOptions = users.map((user) => ({ value: user.id, label: `${user.firstName} ${user.lastName} (${user.email})` }));
  const visibleAllApiKeys = useInfiniteList(filteredApiKeys);

  return (
    <>
      {isAdmin && (
        <div className="panel">
          <div className="section-title">
            <h2>{t('Alle API-Schlüssel')}</h2>
            <span className="counter">{filtered ? `${filteredApiKeys.length}/${allApiKeys.length}` : allApiKeys.length}</span>
            <Button onClick={openCreateDialog} disabled={users.length === 0}>
              {t('Neuer API-Schlüssel')}
            </Button>
          </div>
          {panelError && <p className="feedback error">{panelError}</p>}
          <ListToolbar
            query={query}
            onQueryChange={setQuery}
            searchPlaceholder={t('Bezeichnung, Name oder E-Mail suchen')}
            filters={[
              {
                label: t('Status filtern'),
                value: statusFilter,
                onChange: setStatusFilter,
                options: API_KEY_STATUS_FILTERS.map((option) => ({ ...option, label: t(option.label) })),
              },
            ]}
            onReset={resetFilters}
            resetDisabled={!filtered}
          />
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('Turnierleiter')}</th>
                  <th>{t('Bezeichnung')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Beantragt am')}</th>
                  <th>{t('Zuletzt genutzt')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleAllApiKeys.items.map((key) => (
                  <tr key={key.id}>
                    <td>
                      {key.userName} ({key.userEmail})
                    </td>
                    <td>{key.label}</td>
                    <td>{API_KEY_STATUS_LABELS[key.status] || key.status}</td>
                    <td>{formatDateTime(key.requestedAt)}</td>
                    <td>{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : '–'}</td>
                    <td className="row-actions">
                      {key.status === 'pending' && (
                        <Button disabled={Boolean(adminActionId)} loading={adminActionId === `approve-${key.id}`} onClick={() => handleApprove(key.id)}>{t('Freischalten')}</Button>
                      )}
                      {key.status === 'approved' && (
                        <Button variant="secondary" disabled={Boolean(adminActionId)} loading={adminActionId === `revoke-${key.id}`} onClick={() => handleRevoke(key.id)}>
                          {t('Sperren')}
                        </Button>
                      )}
                      <Button variant="secondary" onClick={() => openEditDialog(key)} disabled={Boolean(adminActionId)}>
                        {t('Bearbeiten')}
                      </Button>
                      <Button variant="danger" disabled={Boolean(adminActionId)} loading={adminActionId === `delete-${key.id}`} onClick={() => handleDelete(key)}>
                        {t('Löschen')}
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredApiKeys.length === 0 && (
                  <tr>
                    <td colSpan={6}>{t('Keine API-Schlüssel gefunden.')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <InfiniteListLoadMore hasMore={visibleAllApiKeys.hasMore} onLoadMore={visibleAllApiKeys.loadMore} label={t('Weitere Einträge laden')} />
        </div>
      )}

      <EditDialog
        open={dialogOpen}
        title={mode === 'edit' ? t('API-Schlüssel bearbeiten') : t('API-Schlüssel anlegen')}
        error={adminError}
        onClose={closeDialog}
      >
        <form className="form" onSubmit={handleDialogSubmit}>
          {mode === 'create' && (
            <SelectField
              label={t('Turnierleiter')}
              value={form.userId}
              onChange={(userId) => setForm({ ...form, userId })}
              options={userOptions}
              required
            />
          )}
          <TextField
            label={t('Bezeichnung')}
            value={form.label}
            onChange={(value) => setForm({ ...form, label: value })}
            required
            minLength={2}
            maxLength={120}
          />
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={closeDialog}>
              {t('Abbrechen')}
            </Button>
            <Button type="submit" loading={adminSaving}>{mode === 'edit' ? t('Speichern') : t('Anlegen')}</Button>
          </div>
        </form>
      </EditDialog>
    </>
  );
}

export default ApiKeysPanel;
