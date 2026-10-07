import { useId } from 'react';

// Vorschläge veröffentlichter Vereine für freie Vereinsfelder (native <datalist>, Freitext bleibt möglich).
// Nutzung: const clubs = useClubSuggestions(clubNames); <TextField list={clubs.listId} … />{clubs.datalist}
export function useClubSuggestions(clubNames = []) {
  const id = useId();
  if (clubNames.length === 0) return { listId: undefined, datalist: null };
  return {
    listId: id,
    datalist: (
      <datalist id={id}>
        {clubNames.map((name) => <option key={name} value={name} />)}
      </datalist>
    ),
  };
}
