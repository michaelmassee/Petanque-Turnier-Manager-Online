import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadFavorites, loadRecents, pushRecent, toggleFavorite } from './pickerStorage.js';

function usedScopes(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return usedScopes(path);
    if (!entry.name.endsWith('.jsx') || entry.name.includes('.test.')) return [];
    return [...readFileSync(path, 'utf8').matchAll(/storageScope="([^"]+)"/g)].map((match) => match[1]);
  });
}

describe('Favoriten und Verlauf der Auswahl-Comboboxen', () => {
  afterEach(() => localStorage.clear());

  it.each([...new Set(usedScopes('src'))])('speichert Stern und „Zuletzt verwendet“ im Bereich %s', (scope) => {
    expect(toggleFavorite(scope, 'u1', 'c1')).toEqual(['c1']);
    expect(loadFavorites(scope, 'u1')).toEqual(['c1']);
    pushRecent(scope, 'u1', 'c2');
    expect(loadRecents(scope, 'u1')).toEqual(['c2']);
    expect(loadFavorites(scope, 'u2')).toEqual([]);
  });
});
