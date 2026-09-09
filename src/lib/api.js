import { translateText } from './i18n.js';

export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(translateText(payload.error || 'Request failed', localStorage.getItem('ptm_language') || 'de'));
    error.payload = payload;
    throw error;
  }

  return payload;
}
