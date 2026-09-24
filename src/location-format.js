const HOUSE_NUMBER = /^\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?$/;
const STREET_WITH_NUMBER = /^\p{L}[\p{L}.\- ]*\s\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?$/u;
const POSTCODE = /^\d{4,5}$/;

/**
 * Bringt Nominatim-Adressen in die übliche Schreibweise "Straße Nr, PLZ Ort, …, Land":
 * Nominatim liefert Hausnummer und Straße gelegentlich getrennt und vertauscht und die PLZ
 * als eigenen Bestandteil vor dem Land ("…, 61184, Deutschland", teils auch "Deutschland 61184").
 */
export function formatLocationAddress(location) {
  const parts = String(location || '').split(',').map((part) => part.trim());

  // Nur tauschen, solange noch keine "Straße Nr" existiert (idempotent), und nie die PLZ
  // vor dem Land - sonst entsteht beim erneuten Formatieren "Deutschland 61184".
  const hasStreet = parts.some((part) => STREET_WITH_NUMBER.test(part));
  for (let index = 0; !hasStreet && index < parts.length - 1; index += 1) {
    if (POSTCODE.test(parts[index]) && index + 1 === parts.length - 1) continue;
    if (HOUSE_NUMBER.test(parts[index]) && /\p{L}/u.test(parts[index + 1])) {
      parts.splice(index, 2, `${parts[index + 1]} ${parts[index]}`);
      break;
    }
  }

  return movePostcodeBeforeLocality(parts).join(', ');
}

function movePostcodeBeforeLocality(parts) {
  const street = parts.findIndex((part) => STREET_WITH_NUMBER.test(part));
  if (street < 0 || parts.some((part) => /^\d{4,5}\s+\p{L}/u.test(part))) return parts;

  let postcode = null;
  const result = [...parts];
  const standalone = result.findIndex((part, index) => index > street && POSTCODE.test(part));
  if (standalone >= 0) {
    [postcode] = result.splice(standalone, 1);
  } else {
    const trailing = result.at(-1)?.match(/^(\p{L}[\p{L} .-]*?)\s+(\d{4,5})$/u);
    if (!trailing || result.length - 1 <= street) return parts;
    result[result.length - 1] = trailing[1];
    postcode = trailing[2];
  }

  // Folgt auf die Straße nur noch das Land, bleibt die PLZ ein eigener Bestandteil.
  if (street + 1 < result.length - 1) result[street + 1] = `${postcode} ${result[street + 1]}`;
  else result.splice(street + 1, 0, postcode);
  return result;
}

/**
 * Ersatzanfrage "Straße Nr, PLZ" für Adressen, die Nominatim im Freitext nicht findet
 * (z. B. vertauschtes "…, Deutschland 61184" statt "…, 61184, Deutschland"). Liefert null,
 * wenn Straße mit Hausnummer oder PLZ fehlen.
 */
export function geocodingFallbackQuery(location) {
  const parts = formatLocationAddress(location).split(',').map((part) => part.trim());
  const street = parts.find((part) => STREET_WITH_NUMBER.test(part));
  // Letzte freistehende 4-5-stellige Zahl: die PLZ steht hinter Vereinsnamen wie "von 1986 e.V".
  const postcode = [...String(location || '').matchAll(/(?:^|[\s,])(\d{4,5})(?=$|[\s,])/g)].at(-1)?.[1];
  return street && postcode ? `${street}, ${postcode}` : null;
}
