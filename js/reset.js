import { Api, authErrorFromUrl, siteUrl } from './net/api.js';

// Standalone page that password-reset emails link to.
const card = document.getElementById('card');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LOGO = '<div class="logo">JOHN-PAUL <span>SIMULATOR</span></div>';

const linkError = authErrorFromUrl();
const api = new Api();

function showForm(email) {
  card.innerHTML = `${LOGO}
    <h2 style="margin:0">Choose a new password</h2>
    ${email ? `<p class="muted small" style="margin:0">For <b>${esc(email)}</b></p>` : ''}
    <label class="field"><span>New password</span><input type="password" id="p1" autocomplete="new-password" minlength="6"></label>
    <div class="strength"><div id="bar"></div></div>
    <label class="field"><span>Confirm password</span><input type="password" id="p2" autocomplete="new-password"></label>
    <div class="err" id="err"></div>
    <button class="btn primary" id="save">Update password</button>`;
  const p1 = card.querySelector('#p1'), p2 = card.querySelector('#p2'), err = card.querySelector('#err'), btn = card.querySelector('#save'), bar = card.querySelector('#bar');
  p1.focus();
  p1.oninput = () => {
    const v = p1.value;
    const score = (v.length >= 6) + (v.length >= 10) + /[A-Z]/.test(v) + /[0-9]/.test(v) + /[^A-Za-z0-9]/.test(v);
    bar.style.width = (score / 5) * 100 + '%';
    bar.style.background = score <= 1 ? 'var(--bad)' : score <= 3 ? 'var(--accent)' : 'var(--good)';
  };
  const save = async () => {
    err.textContent = '';
    if (p1.value.length < 6) { err.textContent = 'Use at least 6 characters.'; return; }
    if (p1.value !== p2.value) { err.textContent = 'Passwords do not match.'; return; }
    btn.disabled = true;
    try {
      await api.updatePassword(p1.value);
      showDone();
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  };
  btn.onclick = save;
  [p1, p2].forEach((i) => { i.onkeydown = (e) => { if (e.key === 'Enter') save(); }; });
}

function showDone() {
  card.innerHTML = `${LOGO}
    <div class="state-icon ok">✓</div>
    <h2 style="margin:0;text-align:center">Password updated</h2>
    <p class="muted" style="text-align:center;margin:0">You're signed in and ready to deploy.</p>
    <a class="btn primary" href="${siteUrl('index.html')}">Play now</a>`;
}

function showInvalid(message) {
  card.innerHTML = `${LOGO}
    <div class="state-icon bad">!</div>
    <h2 style="margin:0;text-align:center">Link not valid</h2>
    <p class="muted" style="text-align:center;margin:0">${esc(message)}</p>
    <label class="field"><span>Email</span><input type="email" id="email" autocomplete="email"></label>
    <div class="err" id="err"></div>
    <button class="btn primary" id="send">Send a new reset link</button>
    <a class="btn ghost" href="${siteUrl('index.html')}">Back to the game</a>`;
  const email = card.querySelector('#email'), err = card.querySelector('#err'), btn = card.querySelector('#send');
  const send = async () => {
    if (!email.value.trim()) { err.textContent = 'Enter your email.'; return; }
    btn.disabled = true; err.style.color = ''; err.textContent = '';
    try {
      await api.requestPasswordReset(email.value.trim());
      err.style.color = 'var(--good)';
      err.textContent = 'If an account exists for that email, a new link is on its way.';
    } catch (e) { err.textContent = e.message; }
    btn.disabled = false;
  };
  btn.onclick = send;
  email.onkeydown = (e) => { if (e.key === 'Enter') send(); };
}

async function init() {
  if (linkError) { history.replaceState(null, '', location.pathname); return showInvalid(linkError); }
  // supabase-js reads the recovery token from the URL and signs the user in.
  const session = await api.session();
  history.replaceState(null, '', location.pathname);
  if (session) showForm(session.user?.email);
  else showInvalid('This reset link is invalid or has expired. Request a new one below.');
}

init().catch((e) => showInvalid(e.message));
