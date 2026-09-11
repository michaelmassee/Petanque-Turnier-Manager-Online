import i18next from './i18next-config.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_JSON_BYTES = 1_000_000;

export class ApiError extends Error {
  constructor(message, { status, payload, retryAfter } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.payload = payload;
    this.retryAfter = retryAfter;
  }
}

export class NetworkError extends ApiError {
  constructor() { super(i18next.t('Keine Verbindung zum Server. Bitte versuche es erneut.')); }
}

export class TimeoutError extends ApiError {
  constructor() { super(i18next.t('Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.')); }
}

export class AbortedError extends ApiError {
  constructor() { super(i18next.t('Die Anfrage wurde abgebrochen.')); }
}

export class InvalidResponseError extends ApiError {
  constructor() { super(i18next.t('Die Serverantwort konnte nicht verarbeitet werden.')); }
}

async function readJsonResponse(response) {
  const contentLength = Number(response.headers?.get?.('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) throw new InvalidResponseError();
  // Existing tests and a few fetch-compatible clients expose json() but not a
  // body reader. Real Fetch Response objects always take the bounded text path.
  if (typeof response.text !== 'function') {
    try {
      return await response.json();
    } catch {
      throw new InvalidResponseError();
    }
  }
  const body = await response.text();
  if (body.length > MAX_JSON_BYTES) throw new InvalidResponseError();
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new InvalidResponseError();
  }
}

async function requestOnce(path, options, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      const error = new ApiError(i18next.t(payload.error || 'Request failed'), {
        status: response.status,
        payload,
        retryAfter: response.headers.get('Retry-After'),
      });
      throw error;
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new TimeoutError();
    if (options.signal?.aborted) throw new AbortedError();
    if (error?.name === 'AbortError') throw new AbortedError();
    throw new NetworkError();
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

/** Mutations are deliberately attempted once; query lifecycle belongs to TanStack Query. */
export function api(path, options = {}) {
  return requestOnce(path, options, options.timeoutMs || DEFAULT_TIMEOUT_MS);
}
