import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { Button, Feedback } from '../components/ui.jsx';

export function PetanqueOnlineImportPanel() {
  const { t } = useTranslation();
  const [tournaments, setTournaments] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await api('/api/admin/petanque-online/tournaments');
      setTournaments(result.tournaments || []);
      setSelected(new Set());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const selectable = useMemo(() => tournaments.filter((tournament) => !tournament.imported), [tournaments]);

  function toggle(key) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected(selected.size === selectable.length ? new Set() : new Set(selectable.map((tournament) => tournament.externalKey)));
  }

  async function handleImport() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await api('/api/admin/petanque-online/import', { method: 'POST', body: JSON.stringify({ externalKeys: [...selected] }) });
      const parts = [t('Petanque-Online-Termine importiert: {created} neu, {updated} aktualisiert.', { created: result.created, updated: result.updated })];
      if (result.failed > 0) parts.push(t('{failed} Termine fehlgeschlagen.', { failed: result.failed }));
      setMessage(parts.join(' '));
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="single-column">
      <div className="panel">
        <div className="section-title">
          <div>
            <h2>{t('Petanque-Online importieren')}</h2>
            <p className="muted">{t('Wähle künftige Termine aus. Bereits importierte Termine werden täglich mit der Quelle abgeglichen.')}</p>
          </div>
          <Button variant="secondary" disabled={loading || busy} onClick={load}>{t('Aktualisieren')}</Button>
        </div>
        <Feedback message={message} error={error} />
        {loading ? <p className="muted">{t('Wird geladen…')}</p> : (
          <>
            <div className="section-title">
              <label className="checkbox-field">
                <input type="checkbox" checked={selectable.length > 0 && selected.size === selectable.length} onChange={toggleAll} disabled={selectable.length === 0 || busy} />
                <span>{t('Alle neuen Termine auswählen')}</span>
              </label>
              <Button disabled={selected.size === 0 || busy} onClick={handleImport}>{t('Ausgewählte Termine importieren')}</Button>
            </div>
            <div className="user-list import-list">
              {tournaments.map((tournament) => (
                <label className="data-row" key={tournament.externalKey}>
                  <input type="checkbox" checked={selected.has(tournament.externalKey)} onChange={() => toggle(tournament.externalKey)} disabled={tournament.imported || busy} />
                  <span>
                    <strong data-i18n-skip>{tournament.name}</strong>
                    <small data-i18n-skip>{tournament.date}{tournament.startTime ? ` · ${tournament.startTime}` : ''} · {tournament.location} · {tournament.club || 'Petanque-Online'}</small>
                    <small data-i18n-skip>{tournament.sourceFormation}</small>
                  </span>
                  {tournament.imported && <span className="role">{t('Bereits importiert')}</span>}
                </label>
              ))}
              {tournaments.length === 0 && <p className="muted">{t('Keine künftigen Termine gefunden.')}</p>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default PetanqueOnlineImportPanel;
