const DIRECT_FORMATIONS = new Map([
  ['tete_a_tete', 'tete'],
  ['doublette', 'doublette'],
  ['doublette_mixed', 'doublette'],
  ['triplette', 'triplette'],
]);

export function petanqueOnlineKey(entry) {
  return `${entry.type}:${entry.id}`;
}

export function mapPetanqueOnlineFormation(value) {
  return DIRECT_FORMATIONS.get(value) || 'andere';
}

export function sourceUrlForPetanqueOnline(entry) {
  if (entry.source_url) return entry.source_url;
  return entry.slug ? `https://petanque-online.de/turniere/${encodeURIComponent(entry.slug)}` : 'https://petanque-online.de/';
}

export function mapPetanqueOnlineTournament(entry) {
  const formation = mapPetanqueOnlineFormation(entry.formation);
  const location = String(entry.location || entry.club_city || entry.club_name || '').trim();
  const details = [
    entry.additional_info,
    entry.formation && formation === 'andere' ? `Original-Formation: ${entry.formation}` : null,
    entry.formation === 'doublette_mixed' ? 'Original-Formation: Doublette Mixte' : null,
    entry.entry_fee ? `Startgeld: ${entry.entry_fee} €` : null,
    entry.max_teams !== null && entry.max_teams !== undefined && entry.max_teams !== '' && Number.isFinite(Number(entry.max_teams)) ? `Max. Teams: ${entry.max_teams}` : null,
    entry.registration_deadline ? `Meldefrist: ${entry.registration_deadline}${entry.registration_deadline_time ? ` ${String(entry.registration_deadline_time).slice(0, 5)}` : ''}` : null,
    `Quelle: ${sourceUrlForPetanqueOnline(entry)}`,
  ].filter(Boolean);

  return {
    externalKey: petanqueOnlineKey(entry),
    name: String(entry.name || '').trim(),
    club: String(entry.club_name || '').trim() || null,
    date: String(entry.date || '').trim(),
    startTime: entry.time ? String(entry.time).slice(0, 5) : null,
    location,
    formation,
    description: details.join('\n'),
    websiteUrl: sourceUrlForPetanqueOnline(entry),
    flyerUrl: entry.tournament_flyer_url || entry.flyer_url || null,
  };
}

export function isFuturePetanqueOnlineTournament(entry, today = new Date().toISOString().slice(0, 10)) {
  return typeof entry?.date === 'string' && entry.date > today;
}
