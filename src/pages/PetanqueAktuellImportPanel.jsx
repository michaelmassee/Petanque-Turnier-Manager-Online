import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { formatLocationAddress } from '../lib/domain.js';
import { Button, Feedback, SelectField, TextArea } from '../components/ui.jsx';
import { invalidNameBlacklistPatterns, NAME_BLACKLIST_HINT_VALUES, nameBlacklistMatcher, normalizeNameBlacklist } from '../petanque-aktuell-core.js';
import { InfiniteListLoadMore, useInfiniteList } from '../components/InfiniteListLoadMore.jsx';

const IMPORT_STATUS_OPTIONS = [
  { value: 'all', label: 'Alle Termine' },
  { value: 'new', label: 'Noch nicht importiert' },
  { value: 'imported', label: 'Bereits importiert' },
  { value: 'blocked', label: 'Durch Sperrliste ausgeblendet' },
];

// Neue Termine auf der Sperrliste erscheinen nur unter "Durch Sperrliste ausgeblendet"; bereits importierte bleiben sichtbar.
function matchesImportStatus(tournament, importStatus) {
  const hidden = tournament.blocked && !tournament.imported;
  if (importStatus === 'blocked') return hidden;
  if (hidden) return false;
  return importStatus === 'all' || (importStatus === 'imported' ? tournament.imported : !tournament.imported);
}

/** Sperrliste nach Turniernamen, eine Zeile je Muster. */
function BlacklistEditor({ blacklist, onSaved, hiddenCount }) {
  const { t } = useTranslation();
  const [text, setText] = useState(blacklist.join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function save() {
    setError('');
    setMessage('');
    const patterns = normalizeNameBlacklist(text.split('\n'));
    const invalid = invalidNameBlacklistPatterns(patterns);
    if (invalid.length > 0) {
      setError(t('Ungültige Muster: {{patterns}}', { patterns: invalid.join(', ') }));
      return;
    }
    setBusy(true);
    try {
      const result = await authenticatedApi('/api/admin/petanque-aktuell/blacklist', { method: 'PUT', body: JSON.stringify({ patterns }) });
      setText(result.blacklist.join('\n'));
      onSaved(result.blacklist);
      setMessage(t('Sperrliste gespeichert.'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="import-blacklist">
      <summary>{t('Sperrliste nach Turniernamen ({{count}} Muster, {{hidden}} Termine ausgeblendet)', { count: blacklist.length, hidden: hiddenCount })}</summary>
      <p className="muted">
        {t('Ein Muster pro Zeile, Groß-/Kleinschreibung egal. {{any}} steht für beliebig viele Zeichen, {{one}} für genau ein Zeichen; das Muster muss auf den ganzen Namen passen (z. B. {{wildcardExample}}). In Schrägstrichen ist es ein regulärer Ausdruck, der irgendwo im Namen treffen darf (z. B. {{regexExample}}). Bereits importierte Termine bleiben erhalten.', NAME_BLACKLIST_HINT_VALUES)}
      </p>
      <TextArea label={t('Gesperrte Turniernamen')} value={text} onChange={setText} rows={6} />
      <Feedback message={message} error={error} />
      <Button disabled={busy} loading={busy} onClick={save}>{t('Sperrliste speichern')}</Button>
    </details>
  );
}

export function PetanqueAktuellImportPanel() {
  const { t } = useTranslation();
  const [tournaments, setTournaments] = useState([]);
  const [blacklist, setBlacklist] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [importStatus, setImportStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await authenticatedApi('/api/admin/petanque-aktuell/tournaments');
      setTournaments(result.tournaments || []);
      setBlacklist(result.blacklist || []);
      setSelected(new Set());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  // Lokal gegen die gespeicherte Sperrliste prüfen, damit eine Änderung ohne erneutes Laden des Kalenders wirkt.
  const checkedTournaments = useMemo(() => {
    const blocked = nameBlacklistMatcher(blacklist || []);
    return tournaments.map((tournament) => ({ ...tournament, blocked: blocked(tournament.name) }));
  }, [tournaments, blacklist]);
  const hiddenCount = checkedTournaments.filter((tournament) => matchesImportStatus(tournament, 'blocked')).length;
  const selectable = useMemo(() => checkedTournaments.filter((tournament) => !tournament.imported && !tournament.blocked), [checkedTournaments]);
  const allNewSelected = selectable.length > 0 && selectable.every((tournament) => selected.has(tournament.externalKey));
  const visibleTournaments = useMemo(() => checkedTournaments.filter((tournament) => matchesImportStatus(tournament, importStatus)), [checkedTournaments, importStatus]);
  const visibleImportTournaments = useInfiniteList(visibleTournaments);
  const importKeys = useMemo(() => {
    const blockedKeys = new Set(checkedTournaments.filter((tournament) => tournament.blocked).map((tournament) => tournament.externalKey));
    return [...selected].filter((key) => !blockedKeys.has(key));
  }, [checkedTournaments, selected]);

  function toggle(key) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Wählt nur neue Termine (ab), bereits zum erneuten Import markierte bleiben erhalten.
  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      for (const tournament of selectable) {
        if (allNewSelected) next.delete(tournament.externalKey);
        else next.add(tournament.externalKey);
      }
      return next;
    });
  }

  async function handleImport() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await authenticatedApi('/api/admin/petanque-aktuell/import', { method: 'POST', body: JSON.stringify({ externalKeys: importKeys }) });
      const parts = [t('Pétanque-Aktuell-Termine importiert: {created} neu, {updated} aktualisiert.').replace('{created}', result.created).replace('{updated}', result.updated)];
      if (result.failed > 0) parts.push(t('{failed} Termine fehlgeschlagen.').replace('{failed}', result.failed));
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
            <h2>{t('Pétanque Aktuell importieren')}</h2>
            <p className="muted">{t('Wähle künftige Termine aus. Bereits importierte Termine werden täglich nur darauf geprüft, ob sie noch vorhanden sind. Um sie mit der Quelle zu aktualisieren, wähle sie erneut aus und importiere sie.')}</p>
          </div>
          <Button variant="secondary" disabled={loading || busy} loading={loading || busy} onClick={load}>{t('Aktualisieren')}</Button>
        </div>
        <Feedback message={message} error={error} />
        {loading ? <p className="muted">{t('Wird geladen…')}</p> : (
          <>
            {blacklist && <BlacklistEditor blacklist={blacklist} onSaved={setBlacklist} hiddenCount={hiddenCount} />}
            <div className="section-title">
              <SelectField
                label={t('Importstatus')}
                value={importStatus}
                onChange={setImportStatus}
                disabled={busy}
                options={IMPORT_STATUS_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
              />
              <label className="checkbox-field">
                <input type="checkbox" checked={allNewSelected} onChange={toggleAll} disabled={selectable.length === 0 || busy} />
                <span>{t('Alle neuen Termine auswählen')}</span>
              </label>
              <Button disabled={importKeys.length === 0 || busy} loading={busy} onClick={handleImport}>{t('Ausgewählte Termine importieren')}</Button>
            </div>
            <div className="user-list import-list">
              {visibleImportTournaments.items.map((tournament) => (
                <label className="data-row" key={tournament.externalKey}>
                  <input type="checkbox" checked={selected.has(tournament.externalKey)} onChange={() => toggle(tournament.externalKey)} disabled={busy || tournament.blocked} />
                  <span>
                    <strong data-i18n-skip>{tournament.name}</strong>
                    <small data-i18n-skip>{tournament.date}{tournament.startTime ? ` · ${tournament.startTime}` : ''} · {formatLocationAddress(tournament.location)}</small>
                    <small data-i18n-skip>{[tournament.sourceFormation, tournament.association, tournament.licenseRequired].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="badges">
                    {tournament.imported && <span className="role">{t('Bereits importiert')}</span>}
                    {tournament.blocked && <span className="role">{t('Gesperrt')}</span>}
                    <a className="role" href={tournament.websiteUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{t('Quelle')}</a>
                  </span>
                </label>
              ))}
              {visibleTournaments.length === 0 && <p className="muted">{t('Keine künftigen Termine gefunden.')}</p>}
            </div>
            <InfiniteListLoadMore hasMore={visibleImportTournaments.hasMore} onLoadMore={visibleImportTournaments.loadMore} label={t('Weitere Turniere laden')} />
          </>
        )}
      </div>
    </section>
  );
}

export default PetanqueAktuellImportPanel;
