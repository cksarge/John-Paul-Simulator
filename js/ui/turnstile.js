import { TURNSTILE_SITE_KEY } from '../config.js';

// Cloudflare Turnstile widget. Supabase verifies the token server-side (Auth → Attack Protection).
// The script is loaded with ?render=explicit in the page <head>.
function ready(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (window.turnstile) return resolve(window.turnstile);
      if (Date.now() - start > timeout) return reject(new Error('Security check failed to load. Disable ad blockers for this site and refresh.'));
      setTimeout(tick, 100);
    };
    tick();
  });
}

export function mountTurnstile(el, { action } = {}) {
  let token = null, id = null, waiters = [];
  const settle = (t) => { token = t; waiters.forEach((w) => w(t)); waiters = []; };
  ready().then((ts) => {
    if (!el.isConnected) return;
    id = ts.render(el, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'dark',
      action,
      callback: (t) => settle(t),
      'expired-callback': () => { token = null; },
      'error-callback': () => { token = null; },
    });
  }).catch((e) => { el.innerHTML = `<span class="err">${e.message}</span>`; });

  return {
    // Resolves with a fresh token, waiting briefly for the challenge to finish.
    async token(wait = 8000) {
      if (token) return token;
      const t = await Promise.race([
        new Promise((r) => waiters.push(r)),
        new Promise((r) => setTimeout(() => r(null), wait)),
      ]);
      if (!t) throw new Error('Please complete the security check.');
      return t;
    },
    // Tokens are single-use: call after every request that consumed one.
    reset() {
      token = null;
      if (id !== null && window.turnstile) window.turnstile.reset(id);
    },
    remove() {
      if (id !== null && window.turnstile) window.turnstile.remove(id);
      id = null;
    },
  };
}
