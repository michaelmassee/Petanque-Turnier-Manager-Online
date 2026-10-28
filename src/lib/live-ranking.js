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

const OPTIONAL_COLUMNS = new Set(['bhz', 'fbhz', 'wertung', 'gameDiff']);

/**
 * Spalten-Schlüssel der Rangliste je Turniersystem (wie im Turnierdokument): Schweizer/Maastrichter mit Buchholz,
 * Formule X mit Wertung, sonst Spieldifferenz; Niederlagen zeigt die Rangliste nicht. Wertungskriterien, die kein Eintrag führt (z. B. weil
 * das verbundene Dokument sie nicht überträgt), entfallen.
 */
export function rankingColumnKeys(tournament, entries) {
  const swiss = tournament?.type === 'schweizer' || tournament?.type === 'maastrichter';
  const formuleX = tournament?.type === 'formule_x';
  const keys = [
    'rank', 'label', 'wins',
    ...(swiss && tournament?.schweizerRankingMode !== 'ohne_buchholz' ? ['bhz', 'fbhz'] : []),
    ...(formuleX ? ['wertung'] : []),
    ...(!swiss && !formuleX ? ['gameDiff'] : []),
    'pointsFor', 'pointsAgainst', 'pointsDiff',
  ];
  return keys.filter((key) => !OPTIONAL_COLUMNS.has(key) || entries.some((entry) => entry[key] != null));
}

/** Spaltenüberschrift der Rangliste (Tabelle und PDF); t ist die i18next-Übersetzungsfunktion. */
export function rankingColumnLabel(key, tournament, t) {
  switch (key) {
    case 'rank': return t('Platz');
    case 'label': return tournament?.registrationType === 'supermelee' ? t('Spieler') : t('Team');
    case 'wins': return t('Siege');
    case 'bhz': return t('BHZ');
    case 'fbhz': return t('FBHZ');
    case 'wertung': return t('Wertung');
    case 'gameDiff': return t('Spieldifferenz');
    case 'pointsFor': return t('Punkte+');
    case 'pointsAgainst': return t('Punkte−');
    default: return t('Δ');
  }
}

const POINT_SUB_LABELS = { pointsFor: '+', pointsAgainst: '−', pointsDiff: 'Δ' };

/**
 * Zweizeiliger Tabellenkopf (Tabelle und PDF, wie im Turnierdokument): Einzelspalten überspannen beide Zeilen, die
 * Gruppen „Spiele“ und „Punkte“ tragen in der zweiten Zeile +, − und Δ. Siege werden nur zur Spiele-Gruppe, wenn es
 * eine Spieldifferenz gibt.
 */
export function rankingHeaderGroups(columns, tournament, t) {
  const withGameDiff = columns.includes('gameDiff');
  const groups = [];
  for (const key of columns) {
    let group = null;
    if (withGameDiff && (key === 'wins' || key === 'gameDiff')) group = { id: 'games', label: t('Spiele'), sub: key === 'wins' ? '+' : 'Δ' };
    else if (POINT_SUB_LABELS[key]) group = { id: 'points', label: t('Punkte'), sub: POINT_SUB_LABELS[key] };
    const last = groups[groups.length - 1];
    if (group && last?.id === group.id) {
      last.keys.push(key);
      last.subLabels.push(group.sub);
    } else if (group) {
      groups.push({ id: group.id, label: group.label, keys: [key], subLabels: [group.sub] });
    } else {
      groups.push({ id: key, label: rankingColumnLabel(key, tournament, t), keys: [key] });
    }
  }
  return groups;
}

/** Zellwert der Rangliste: Differenzen mit Vorzeichen (+3, −2), fehlende Werte als Gedankenstrich. */
export function rankingValue(key, value) {
  if (value == null) return '—';
  if ((key === 'gameDiff' || key === 'pointsDiff') && value !== 0) return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
  return String(value);
}
