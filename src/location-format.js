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

/**
 * Ersatzanfrage "Straße Nr, PLZ" für Adressen, die Nominatim im Freitext nicht findet
 * (z. B. vertauschtes "…, Deutschland 61184" statt "…, 61184, Deutschland"). Liefert null,
 * wenn Straße mit Hausnummer oder PLZ fehlen.
 */
export function geocodingFallbackQuery(location) {
  const parts = formatLocationAddress(location).split(',').map((part) => part.trim());
  const street = parts.find((part) => /^\p{L}[\p{L}.\- ]*\s\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?$/u.test(part));
  // Letzte freistehende 4-5-stellige Zahl: die PLZ steht hinter Vereinsnamen wie "von 1986 e.V".
  const postcode = [...String(location || '').matchAll(/(?:^|[\s,])(\d{4,5})(?=$|[\s,])/g)].at(-1)?.[1];
  return street && postcode ? `${street}, ${postcode}` : null;
}
