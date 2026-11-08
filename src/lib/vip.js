// VIP-Stufen der Meldeliste (Issue #34). Höherer Wert = mehr Vorrang: Eine Meldung verdrängt bei vollem Turnier nur
// Meldungen mit niedrigerer Stufe, Warteliste und Nachrücken sortieren nach Stufe, dann Meldezeit. Die Werte stehen
// so in registrations.vip_level; eine weitere Stufe wird nur hier ergänzt.
export const VIP_NONE = 0;
export const VIP_LEVELS = [
  { value: 3, key: 'gold', label: 'VIP Gold' },
  { value: 2, key: 'silver', label: 'VIP Silber' },
  { value: 1, key: 'bronze', label: 'VIP Bronze' },
];
export const VIP_MAX_LEVEL = Math.max(...VIP_LEVELS.map((level) => level.value));

export function normalizeVipLevel(value) {
  const level = Number(value);
  return VIP_LEVELS.some((entry) => entry.value === level) ? level : VIP_NONE;
}

// Alte Zeilen/Clients kennen nur is_vip/isVip; ein VIP ohne Stufe gilt als höchste Stufe.
export function vipLevelOf(row) {
  if (!row) return VIP_NONE;
  const level = normalizeVipLevel(row.vip_level ?? row.vipLevel);
  if (level) return level;
  return Number(row.is_vip ?? row.isVip ?? 0) ? VIP_MAX_LEVEL : VIP_NONE;
}

export function vipLevelInfo(level) {
  return VIP_LEVELS.find((entry) => entry.value === Number(level)) || null;
}

// Auswahl „ohne VIP“ + Stufen (höchste zuerst) für Formular und Meldezeile.
export function vipLevelOptions(t) {
  return [{ value: String(VIP_NONE), label: t('ohne VIP') }, ...VIP_LEVELS.map((level) => ({ value: String(level.value), label: t(level.label) }))];
}
