import i18next from './i18next-config.js';

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
    const error = new Error(i18next.t(payload.error || 'Request failed'));
    error.payload = payload;
    throw error;
  }

  return payload;
}
