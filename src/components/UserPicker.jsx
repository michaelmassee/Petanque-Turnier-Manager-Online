import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { pushRecentRecipientValue } from '../lib/postboxRecipientStorage.js';
import { ComboboxPicker } from './ComboboxPicker.jsx';
import { recipientEntry, useEmailLookup } from './RecipientPicker.jsx';

// Modulweit, damit useEmailLookup eine stabile Funktion bekommt.
async function lookupUserByEmail(email) {
  const data = await authenticatedApi(`/api/postbox/recipients/lookup?email=${encodeURIComponent(email)}`);
  return data.recipient || null;
}

// Nach erfolgreichem Hinzufügen/Übernehmen aufrufen: Der Nutzer erscheint dann unter „Zuletzt verwendet“.
export const rememberPickedUser = pushRecentRecipientValue;

/**
 * Benutzerauswahl wie beim Postbox-Empfänger: Suche, Favoriten (Stern) und „Zuletzt verwendet“, gemeinsam mit
 * dem Postfach gespeichert (Bereich postbox). users: Kandidaten; excludeIds: z. B. Owner und vorhandene
 * Bearbeiter, gelten auch für Treffer der E-Mail-Suche. withEmail: Admin-Listen mit E-Mail-Adressen.
 */
export function UserPicker({ label, users, excludeIds, value, onChange, currentUserId, required, withEmail = false, emailLookup = true }) {
  const { t } = useTranslation();
  const { setQuery, emailMatches, queryIsEmail, emailLookupPending, matchesQuery } = useEmailLookup(emailLookup ? lookupUserByEmail : null);

  const entries = useMemo(() => {
    const excluded = new Set(excludeIds || []);
    const knownIds = new Set(users.map((user) => user.id));
    return [...users, ...emailMatches.filter((user) => !knownIds.has(user.id))]
      .filter((user) => !excluded.has(user.id))
      .map((user) => recipientEntry(user, t('Alle Benutzer'), { withEmail }));
  }, [users, excludeIds, emailMatches, withEmail, t]);

  return (
    <ComboboxPicker
      label={label}
      entries={entries}
      value={value}
      onChange={onChange}
      required={required}
      placeholder={t('Benutzer suchen…')}
      storageScope="postbox"
      currentUserId={currentUserId}
      matchesQuery={matchesQuery}
      onQueryChange={setQuery}
      renderEmpty={() => (
        <>
          {queryIsEmail && emailLookupPending ? t('searchingByEmail') : t('Keine Benutzer gefunden.')}
          {!queryIsEmail && emailLookup ? <span className="recipient-picker-hint">{t('recipientEmailSearchHint')}</span> : null}
        </>
      )}
    />
  );
}
