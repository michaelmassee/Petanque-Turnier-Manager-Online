// Postbox-Empfänger: Favoriten und zuletzt verwendete Empfänger (siehe pickerStorage.js).
import { loadFavorites, loadRecents, pushRecent, toggleFavorite } from './pickerStorage.js';

export const loadFavoriteRecipientIds = (userId) => loadFavorites('postbox', userId);
export const toggleFavoriteRecipientId = (userId, id) => toggleFavorite('postbox', userId, id);
export const loadRecentRecipientValues = (userId) => loadRecents('postbox', userId);
export const pushRecentRecipientValue = (userId, value) => pushRecent('postbox', userId, value);
