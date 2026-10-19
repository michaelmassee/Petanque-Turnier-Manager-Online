import { useTranslation } from 'react-i18next';
import { rankingColumnKeys, rankingColumnLabel } from '../lib/live-ranking.js';

/**
 * Rangliste mit den Spalten des Turniersystems – dieselbe Darstellung in Live-Ansicht, öffentlichem Spielplan und
 * Spielverwaltung, für online durchgeführte wie für mit einem Turnierdokument verbundene Turniere.
 *
 * @param entries normalisierte Einträge (siehe normalizeRanking); `own` markiert die eigene Zeile
 */
export function RankingTable({ tournament, entries }) {
  const { t } = useTranslation();
  const columns = rankingColumnKeys(tournament, entries);
  return (
    <table className="ranking-table">
      <thead>
        <tr>
          {columns.map((key) => <th key={key}>{rankingColumnLabel(key, tournament, t)}</th>)}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.registrationIds.join('-')} className={entry.own ? 'live-own-row' : undefined}>
            {columns.map((key) => <td key={key} data-i18n-skip={key === 'label' || undefined}>{entry[key] ?? '—'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
