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

// Baut aus der schema.org-PostalAddress der gescrapten Turnier-Detailseite eine
// vollständige Adresse (Straße + PLZ/Ort) statt nur des Orts aus der Kalender-Liste.
// Fehlt die Straße, bleibt es beim reinen Ort.
export function formatPetanqueOnlineAddress(address, fallbackLocation) {
  const street = String(address?.streetAddress || '').trim();
  const postalCode = String(address?.postalCode || '').trim();
  const city = String(address?.addressLocality || fallbackLocation || '').trim();
  if (!street) return null;
  const cityPart = [postalCode, city].filter(Boolean).join(' ');
  return [street, cityPart].filter(Boolean).join(', ');
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
    'Hinweis: Dieser Termin wurde automatisch übernommen. Weitere Informationen findest du auf der verlinkten Vereinswebseite (🌐-Symbol oben).',
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

// true, wenn die URL auf eine externe Domain zeigt statt auf petanque-online.de selbst
// (Fallback-Link, wenn der Verein keine eigene Webseite hinterlegt hat).
export function isExternalPetanqueOnlineWebsite(url) {
  if (!url) return false;
  try {
    return new URL(url).hostname !== 'petanque-online.de';
  } catch {
    return false;
  }
}
