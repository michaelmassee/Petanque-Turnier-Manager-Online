import { afterEach, describe, expect, it } from 'vitest';
import { canRestartAutomatically, clearRecoveryAttempt, resetRecoveryForTest } from './app-recovery.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

afterEach(() => resetRecoveryForTest());

describe('app recovery', () => {
  it('allows one automatic restart per recovery window', () => {
    const storage = memoryStorage();
    const now = 1_000_000;

    expect(canRestartAutomatically(storage, now)).toBe(true);
    expect(canRestartAutomatically(storage, now + 1)).toBe(false);
    expect(canRestartAutomatically(storage, now + 30_000)).toBe(true);
  });

  it('allows a manual restart to clear the loop brake', () => {
    const storage = memoryStorage();

    expect(canRestartAutomatically(storage, 1_000)).toBe(true);
    clearRecoveryAttempt(storage);
    expect(canRestartAutomatically(storage, 1_001)).toBe(true);
  });

  it('uses the safe fallback when session storage is unavailable', () => {
    const unavailableStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };

    expect(canRestartAutomatically(unavailableStorage, 1_000)).toBe(false);
    expect(() => clearRecoveryAttempt(unavailableStorage)).not.toThrow();
  });
});
