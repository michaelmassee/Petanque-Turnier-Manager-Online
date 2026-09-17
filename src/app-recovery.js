const RECOVERY_STORAGE_KEY = 'ptm_app_recovery_attempt';
const RECOVERY_WINDOW_MS = 30_000;

let recoveryInProgress = false;

function recoveryAttemptIsRecent(value, now) {
  try {
    const { timestamp } = JSON.parse(value || '');
    return Number.isFinite(timestamp) && now - timestamp >= 0 && now - timestamp < RECOVERY_WINDOW_MS;
  } catch {
    return false;
  }
}

export function canRestartAutomatically(storage = window.sessionStorage, now = Date.now()) {
  try {
    if (recoveryAttemptIsRecent(storage.getItem(RECOVERY_STORAGE_KEY), now)) return false;
    storage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify({ timestamp: now }));
    return true;
  } catch {
    // Ohne funktionierenden Session-Speicher ist eine Schleifenbremse nicht
    // zuverlässig möglich. Dann lieber die manuelle, sichere Fehleransicht.
    return false;
  }
}

export function clearRecoveryAttempt(storage = window.sessionStorage) {
  try {
    storage.removeItem(RECOVERY_STORAGE_KEY);
  } catch {
    // Private Browser-Modi können den Speicherzugriff verweigern.
  }
}

export function requestAppRestart() {
  if (recoveryInProgress) return 'reloading';
  recoveryInProgress = true;

  if (!canRestartAutomatically()) return 'manual';

  try {
    window.location.reload();
    return 'reloading';
  } catch {
    return 'manual';
  }
}

export function resetRecoveryForTest() {
  recoveryInProgress = false;
}
