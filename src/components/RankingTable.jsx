import { useTranslation } from 'react-i18next';
import { rankingColumnKeys, rankingHeaderGroups, rankingValue } from '../lib/live-ranking.js';

/**
 * Rangliste mit den Spalten des Turniersystems – dieselbe Darstellung in Live-Ansicht, öffentlichem Spielplan und
 * Spielverwaltung, für online durchgeführte wie für mit einem Turnierdokument verbundene Turniere. Der Kopf ist wie im
 * PDF zweizeilig (Spiele bzw. Punkte mit +, − und Δ).
 *
 * @param entries normalisierte Einträge (siehe normalizeRanking); `own` markiert die eigene Zeile
 */
export function RankingTable({ tournament, entries }) {
  const { t } = useTranslation();
  const columns = rankingColumnKeys(tournament, entries);
  const groups = rankingHeaderGroups(columns, tournament, t);
  return (
    <table className="ranking-table">
      <thead>
        <tr>
          {groups.map((group) => (group.subLabels
            ? <th key={group.id} colSpan={group.keys.length} scope="colgroup" className="ranking-group">{group.label}</th>
            : <th key={group.id} rowSpan={2} scope="col">{group.label}</th>))}
        </tr>
        <tr>
          {groups.filter((group) => group.subLabels).flatMap((group) => group.keys.map((key, index) => (
            <th key={key} scope="col" aria-label={`${group.label} ${group.subLabels[index]}`}>{group.subLabels[index]}</th>
          )))}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.registrationIds.join('-')} className={entry.own ? 'live-own-row' : undefined}>
            {columns.map((key) => <td key={key} data-i18n-skip={key === 'label' || undefined}>{key === 'label' ? entry[key] ?? '—' : rankingValue(key, entry[key])}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
