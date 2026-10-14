// Vereinheitlicht die systemabhängigen Ranglisten-Formen (Spieler-, Team- und Snapshot-Einträge aus dem
// Turnierdokument) für die Anzeige; systemabhängige Wertungskriterien bleiben erhalten. Gemeinsam genutzt von der
// Live-Ansicht (Server) und den Ranglisten-Tabellen (Client).
export function normalizeRanking(ranking) {
  return ranking.map((entry) => {
    const members = entry.members || [entry];
    return {
      rank: entry.rank,
      registrationIds: entry.registrationIds || members.map((member) => member.id || member.playerId),
      label: members.map((member) => member.teamLabel || [member.firstName, member.lastName].filter(Boolean).join(' ') || '?').join(' + '),
      wins: entry.wins ?? null,
      losses: entry.losses ?? (entry.wins != null && entry.gameDiff != null ? entry.wins - entry.gameDiff : null),
      gameDiff: entry.gameDiff ?? null,
      bhz: entry.bhz ?? null,
      fbhz: entry.fbhz ?? null,
      wertung: entry.wertung ?? null,
      pointsFor: entry.pointsFor ?? null,
      pointsAgainst: entry.pointsAgainst ?? null,
      pointsDiff: entry.pointsDiff ?? (entry.pointsFor != null && entry.pointsAgainst != null ? entry.pointsFor - entry.pointsAgainst : null),
    };
  });
}

const OPTIONAL_COLUMNS = new Set(['bhz', 'fbhz', 'wertung', 'losses', 'gameDiff']);

/**
 * Spalten-Schlüssel der Rangliste je Turniersystem (wie im Turnierdokument): Schweizer/Maastrichter mit Buchholz,
 * Formule X mit Wertung, sonst Niederlagen und Spieldifferenz. Wertungskriterien, die kein Eintrag führt (z. B. weil
 * das verbundene Dokument sie nicht überträgt), entfallen.
 */
export function rankingColumnKeys(tournament, entries) {
  const swiss = tournament?.type === 'schweizer' || tournament?.type === 'maastrichter';
  const formuleX = tournament?.type === 'formule_x';
  const keys = [
    'rank', 'label', 'wins',
    ...(swiss && tournament?.schweizerRankingMode !== 'ohne_buchholz' ? ['bhz', 'fbhz'] : []),
    ...(formuleX ? ['wertung'] : []),
    ...(!swiss ? ['losses'] : []),
    ...(!swiss && !formuleX ? ['gameDiff'] : []),
    'pointsFor', 'pointsAgainst', 'pointsDiff',
  ];
  return keys.filter((key) => !OPTIONAL_COLUMNS.has(key) || entries.some((entry) => entry[key] != null));
}
