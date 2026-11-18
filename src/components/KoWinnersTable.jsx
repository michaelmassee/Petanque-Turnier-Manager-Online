import { useTranslation } from 'react-i18next';

/**
 * Sieger der KO-Felder (Maastrichter-Finalrunden A–H) als eigener Teil der Endrangliste neben der Vorrunden-Rangliste.
 * Ohne Sieger nichts.
 *
 * @param winners normalisierte KO-Sieger (siehe normalizeKoWinners): Feld und Teambezeichnung
 */
export function KoWinnersTable({ winners }) {
  const { t } = useTranslation();
  if (!winners?.length) return null;
  return (
    <table className="ranking-table ko-winners-table">
      <thead>
        <tr>
          <th scope="col">{t('Feld')}</th>
          <th scope="col">{t('Sieger')}</th>
        </tr>
      </thead>
      <tbody>
        {winners.map((winner) => (
          <tr key={winner.label}>
            <td data-i18n-skip>{winner.label}</td>
            <td data-i18n-skip>{winner.team}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Rangliste, bei KO-Siegern zweigeteilt: zuerst die Sieger der KO-Runden, dann die Vorrunden-Rangliste. Ohne
 * KO-Sieger nur die Rangliste wie bisher.
 */
export function RankingWithKoWinners({ winners, children }) {
  const { t } = useTranslation();
  if (!winners?.length) return children;
  return (
    <>
      <h3 className="ranking-part-title">{t('Sieger der KO-Runden')}</h3>
      <KoWinnersTable winners={winners} />
      <h3 className="ranking-part-title">{t('Vorrunde')}</h3>
      {children}
    </>
  );
}
