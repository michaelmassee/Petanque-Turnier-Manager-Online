import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadFavoriteRecipientIds,
  toggleFavoriteRecipientId,
  loadRecentRecipientValues,
  pushRecentRecipientValue,
} from './postboxRecipientStorage.js';

describe('postboxRecipientStorage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('gibt leere Listen zurück, solange keine Daten gespeichert wurden', () => {
    expect(loadFavoriteRecipientIds('user-1')).toEqual([]);
    expect(loadRecentRecipientValues('user-1')).toEqual([]);
  });

  it('gibt leere Listen ohne userId zurück und schreibt nichts', () => {
    expect(loadFavoriteRecipientIds(undefined)).toEqual([]);
    expect(toggleFavoriteRecipientId(undefined, 'r1')).toEqual([]);
    expect(loadRecentRecipientValues(null)).toEqual([]);
    expect(pushRecentRecipientValue('', 'r1')).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it('togglet Favoriten (hinzufügen und wieder entfernen)', () => {
    expect(toggleFavoriteRecipientId('user-1', 'r1')).toEqual(['r1']);
    expect(loadFavoriteRecipientIds('user-1')).toEqual(['r1']);
    expect(toggleFavoriteRecipientId('user-1', 'r1')).toEqual([]);
    expect(loadFavoriteRecipientIds('user-1')).toEqual([]);
  });

  it('hält Favoriten pro Nutzer getrennt (kein Durchsickern zwischen Accounts)', () => {
    toggleFavoriteRecipientId('user-1', 'r1');
    toggleFavoriteRecipientId('user-2', 'r2');
    expect(loadFavoriteRecipientIds('user-1')).toEqual(['r1']);
    expect(loadFavoriteRecipientIds('user-2')).toEqual(['r2']);
  });

  it('merkt sich zuletzt verwendete Empfänger, neueste zuerst, ohne Duplikate', () => {
    pushRecentRecipientValue('user-1', 'r1');
    pushRecentRecipientValue('user-1', 'r2');
    pushRecentRecipientValue('user-1', 'r1');
    expect(loadRecentRecipientValues('user-1')).toEqual(['r1', 'r2']);
  });

  it('begrenzt die Liste zuletzt verwendeter Empfänger auf 5 Einträge', () => {
    ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].forEach((value) => pushRecentRecipientValue('user-1', value));
    expect(loadRecentRecipientValues('user-1')).toEqual(['r6', 'r5', 'r4', 'r3', 'r2']);
  });

  it('hält den Verlauf pro Nutzer getrennt', () => {
    pushRecentRecipientValue('user-1', 'r1');
    pushRecentRecipientValue('user-2', 'r2');
    expect(loadRecentRecipientValues('user-1')).toEqual(['r1']);
    expect(loadRecentRecipientValues('user-2')).toEqual(['r2']);
  });
});
