/** Nominatim liefert Hausnummer und Straße gelegentlich als getrennte, vertauschte Bestandteile. */
export function formatLocationAddress(location) {
  const parts = String(location || '').split(',').map((part) => part.trim());
  const houseNumber = /^\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?$/;

  for (let index = 0; index < parts.length - 1; index += 1) {
    if (houseNumber.test(parts[index]) && /\p{L}/u.test(parts[index + 1])) {
      parts.splice(index, 2, `${parts[index + 1]} ${parts[index]}`);
      break;
    }
  }

  return parts.join(', ');
}
