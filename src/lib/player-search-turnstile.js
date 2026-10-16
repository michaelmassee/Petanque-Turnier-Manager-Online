let loading;

function loadTurnstile() {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    let script = document.querySelector('script[data-turnstile]');
    const created = !script;
    const timer = setTimeout(() => finish(new Error('turnstile')), 20_000);
    const loaded = () => finish(window.turnstile?.render ? null : new Error('turnstile'));
    const failed = () => finish(new Error('turnstile'));
    function finish(error) {
      clearTimeout(timer);
      script.removeEventListener('load', loaded);
      script.removeEventListener('error', failed);
      if (error) { if (created) script.remove(); loading = null; reject(error); }
      else resolve(window.turnstile);
    }
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.dataset.turnstile = 'true';
      script.addEventListener('load', loaded, { once: true });
      script.addEventListener('error', failed, { once: true });
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', loaded, { once: true });
      script.addEventListener('error', failed, { once: true });
    }
  });
  return loading;
}

// Each explicit search/selection gets a fresh widget and a single-use token.
export async function playerSearchTurnstileToken(container, siteKey, action, language, signal) {
  if (!siteKey || signal.aborted) throw new Error('turnstile');
  const turnstile = await loadTurnstile();
  if (signal.aborted) throw new Error('turnstile');
  let widget;
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(null), 120_000);
      const abort = () => finish(null);
      function finish(token) {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        if (token) resolve(token); else reject(new Error('turnstile'));
      }
      signal.addEventListener('abort', abort, { once: true });
      try {
        widget = turnstile.render(container, {
          sitekey: siteKey, action, language, execution: 'execute', appearance: 'interaction-only',
          callback: finish, 'error-callback': () => finish(null), 'expired-callback': () => finish(null),
          'timeout-callback': () => finish(null),
        });
        turnstile.execute(widget);
      } catch {
        finish(null);
      }
    });
  } finally {
    if (widget !== undefined) turnstile.remove(widget);
  }
}
