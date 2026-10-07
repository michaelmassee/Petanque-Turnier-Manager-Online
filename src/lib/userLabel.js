// Anzeige von Personen in Listen und Auswahlfeldern. Gleichnamige Nutzer werden über @benutzername und Verein
// unterscheidbar.
export function formatUserName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
}

// „@anna.schmidt · BC Linden“
export function formatUserMeta(user, { withClub = true } = {}) {
  return [user?.username ? `@${user.username}` : '', withClub ? user?.club || '' : ''].filter(Boolean).join(' · ');
}

// Einzeilige Variante für <option>: „Anna Schmidt (@anna.schmidt · BC Linden)“
export function formatUserLabel(user, options) {
  const name = formatUserName(user);
  const meta = formatUserMeta(user, options);
  if (!name) return meta;
  return meta ? `${name} (${meta})` : name;
}
