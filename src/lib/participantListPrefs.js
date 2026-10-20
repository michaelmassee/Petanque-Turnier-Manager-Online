// Anzeigeeinstellungen der öffentlichen Meldeliste (Lfd.-Nr., VIP-Filter, Meldezeit, Sortierung), für alle
// Turniere gemeinsam im localStorage. Suchtext und Suchfeld werden bewusst nicht gespeichert.
const STORAGE_KEY = 'ptm_participant_list';
export const VIP_FILTERS = ['all', 'only', 'without'];
export const DEFAULT_PARTICIPANT_LIST_PREFS = { numbers: false, vip: 'all', registeredAt: false, sortByLastName: false };

export function loadParticipantListPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    return {
      numbers: stored.numbers === true,
      vip: VIP_FILTERS.includes(stored.vip) ? stored.vip : 'all',
      registeredAt: stored.registeredAt === true,
      sortByLastName: stored.sortByLastName === true,
    };
  } catch {
    return { ...DEFAULT_PARTICIPANT_LIST_PREFS };
  }
}

export function saveParticipantListPrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore (private mode, quota, etc.)
  }
}

export function nextVipFilter(vip) {
  return VIP_FILTERS[(VIP_FILTERS.indexOf(vip) + 1) % VIP_FILTERS.length];
}
