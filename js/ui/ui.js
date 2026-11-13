import { MODES, rankBadge, rankFor, levelFor, RANKS, SOLO_KINDS, goalText } from '../data/modes.js';
import { PERKS } from '../data/characters.js';
import { WEAPONS } from '../data/weapons.js';
import { WEAPON_SKINS, OUTFITS, RARITIES, finishSwatch, outfitSwatch } from '../data/skins.js';
import { MAPS } from '../data/maps.js';
import { OPERATORS, CHAR_OPTIONS, sanitizeChar } from '../data/characters.js';
import { PRESETS, saveSettings } from '../engine/engine.js';
import { World } from '../engine/world.js';
import { CharacterPreview } from './creator.js';
import { Matchmaker, Lobby, listLobbies } from '../net/matchmaking.js';
import { sfx, setVolume, initAudio } from '../engine/audio.js';
import { BOT_LEVELS } from '../game/bot.js';
import { PASSWORD_RULES, OTP_LENGTH, assertPassword } from '../data/auth.js';
import { mountTurnstile } from './turnstile.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kd = (k, d) => (d ? (k / d).toFixed(2) : k ? k.toFixed(2) : '0.00');
const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
const MODE_ORDER = ['ranked', 'duel', 'duo', 'bomb', 'tdm', 'gungame', 'ffa'];
const OFFLINE_MODES = ['duel', 'duo', 'bomb', 'tdm', 'gungame', 'ffa'];
const RESEND_COOLDOWN = 60; // seconds between auth emails (matches Supabase's default per-user limit)
const COOLDOWN_KEY = 'jps_email_sent_at';

function emailCooldownLeft() {
  let sent = 0;
  try { sent = Number(localStorage.getItem(COOLDOWN_KEY)) || 0; } catch { /* storage unavailable */ }
  return Math.max(0, Math.ceil(RESEND_COOLDOWN - (Date.now() - sent) / 1000));
}
function markEmailSent() {
  try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch { /* storage unavailable */ }
}

const mapPreviewCache = new Map();
function mapPreview(id) {
  if (!mapPreviewCache.has(id)) mapPreviewCache.set(id, new World(MAPS[id]).radarCanvas(6).toDataURL());
  return mapPreviewCache.get(id);
}

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.tab = 'play';
    this.offline = { mode: 'bomb', map: 'dustline', botLevel: 'normal' };
    this.editChar = null;
    document.addEventListener('click', (e) => { if (e.target.closest('button, .mode-card, .map-card, .op-item, .chip, .swatch')) sfx.ui(); }, true);
  }

  toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    document.getElementById('toast-stack').appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  hide() { this.cleanup(); this.root.innerHTML = ''; }

  cleanup() {
    clearInterval(this.cooldownTimer);
    this.captcha?.remove(); this.captcha = null;
    this.preview?.dispose(); this.preview = null;
    clearInterval(this.onlineTimer);
  }

  // ───────────────────────── auth ─────────────────────────
  showAuth(mode = 'login', notice = null) {
    this.cleanup();
    const hasApi = !!this.app.api;
    const email = esc(this.lastEmail || '');
    const emailField = `<label class="field"><span>Email</span><input type="email" id="a-email" autocomplete="email" value="${email}"></label>`;
    const codeField = `<label class="field"><span>${OTP_LENGTH}-digit code</span><input type="text" id="a-code" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="${OTP_LENGTH}" placeholder="${'•'.repeat(OTP_LENGTH)}"></label>`;
    const rules = `<ul class="pw-rules" id="a-rules">${PASSWORD_RULES.map((r) => `<li data-r="${r.id}">${r.label}</li>`).join('')}</ul>`;
    const views = {
      login: `
          ${emailField}
          <label class="field"><span>Password</span><input type="password" id="a-pass" autocomplete="current-password"></label>
          <a href="#" class="small muted" id="a-forgot" style="align-self:flex-end;margin-top:-6px">Forgot password?</a>
          <div class="cf-ts" id="a-ts"></div>
          <div class="err" id="a-err">${hasApi ? '' : 'Online services unavailable — you can still play offline.'}</div>
          <button class="btn primary" id="a-go" ${hasApi ? '' : 'disabled'}>Sign in</button>
          <div class="row hidden" id="a-unconfirmed"><button class="btn small" id="a-tocode">Enter code</button><button class="btn small" id="a-resend">Resend email</button></div>
          <button class="btn ghost" id="a-guest">Play offline as guest</button>`,
      signup: `
          <label class="field"><span>Username</span><input type="text" id="a-user" maxlength="16" autocomplete="username" placeholder="3-16 letters, numbers, _"></label>
          ${emailField}
          <label class="field"><span>Password</span><input type="password" id="a-pass" autocomplete="new-password"></label>
          ${rules}
          <div class="cf-ts" id="a-ts"></div>
          <div class="err" id="a-err">${hasApi ? '' : 'Online services unavailable — you can still play offline.'}</div>
          <button class="btn primary" id="a-go" ${hasApi ? '' : 'disabled'}>Create account</button>
          <button class="btn ghost" id="a-guest">Play offline as guest</button>`,
      verify: `
          <h2 style="margin:0">Check your email</h2>
          <p class="muted small" style="margin:0">We sent a ${OTP_LENGTH}-digit code to <b>${email}</b>. Enter it below, or just click the link in the email.</p>
          ${codeField}
          <div class="cf-ts" id="a-ts"></div>
          <div class="err" id="a-err"></div>
          <button class="btn primary" id="a-go">Verify &amp; sign in</button>
          <div class="row"><button class="btn small" id="a-resend">Resend email</button><span class="spacer"></span><a href="#" class="small muted" id="a-back">Back to sign in</a></div>`,
      forgot: `
          <h2 style="margin:0">Reset password</h2>
          <p class="muted small" style="margin:0">Enter your account email and we'll send you a ${OTP_LENGTH}-digit code and a reset link.</p>
          ${emailField}
          <div class="cf-ts" id="a-ts"></div>
          <div class="err" id="a-err"></div>
          <button class="btn primary" id="a-go" ${hasApi ? '' : 'disabled'}>Send reset email</button>
          <a href="#" class="small muted" id="a-back" style="align-self:center">Back to sign in</a>`,
      reset: `
          <h2 style="margin:0">Choose a new password</h2>
          <p class="muted small" style="margin:0">Enter the ${OTP_LENGTH}-digit code sent to <b>${email}</b> (or click the link in the email instead).</p>
          ${codeField}
          <label class="field"><span>New password</span><input type="password" id="a-pass" autocomplete="new-password"></label>
          ${rules}
          <label class="field"><span>Confirm password</span><input type="password" id="a-pass2" autocomplete="new-password"></label>
          <div class="cf-ts" id="a-ts"></div>
          <div class="err" id="a-err"></div>
          <button class="btn primary" id="a-go">Update password</button>
          <div class="row"><button class="btn small" id="a-resend">Resend email</button><span class="spacer"></span><a href="#" class="small muted" id="a-back">Back to sign in</a></div>`,
      newpass: `
          <h2 style="margin:0">Choose a new password</h2>
          <p class="muted small" style="margin:0">Signed in as <b>${esc(this.app.user?.email || '')}</b>.</p>
          <label class="field"><span>New password</span><input type="password" id="a-pass" autocomplete="new-password"></label>
          ${rules}
          <label class="field"><span>Confirm password</span><input type="password" id="a-pass2" autocomplete="new-password"></label>
          <div class="err" id="a-err"></div>
          <button class="btn primary" id="a-go">Update password</button>`,
    };
    const tabs = mode === 'login' || mode === 'signup'
      ? `<div class="tabs"><button data-m="login" class="${mode === 'login' ? 'active' : ''}">Sign in</button><button data-m="signup" class="${mode === 'signup' ? 'active' : ''}">Create account</button></div>` : '';
    this.root.innerHTML = `<div class="screen"><div class="menu-bg"></div>
      <div class="auth-wrap">
        <div class="auth-hero">
          <div class="title">JOHN-PAUL<span>SIMULATOR</span></div>
          <p>Tactical 5v5 bomb defusal, ranked 1v1 duels, wingman and free-for-all. Build your operator, climb the ladder, and settle it on the server.</p>
          <div class="row">${RANKS.map((r) => `<span class="rank-badge" style="--rc:${r.color}" title="${r.name} · ${r.min}+"><i></i></span>`).join('')}</div>
        </div>
        <div class="auth-box"><div class="panel">${tabs}${views[mode]}</div></div>
      </div></div>`;
    const $ = (sel) => this.root.querySelector(sel);
    const api = this.app.api;
    const err = $('#a-err');
    const say = (msg, good = false) => { err.style.color = good ? 'var(--good)' : ''; err.textContent = msg; };
    if (notice) say(notice.text, notice.good);
    this.captcha?.remove();
    this.captcha = hasApi && $('#a-ts') ? mountTurnstile($('#a-ts'), { action: mode }) : null;
    // Runs an auth request with a fresh Turnstile token, then resets the single-use widget.
    const withCaptcha = async (fn) => {
      const t = await this.captcha.token();
      try { return await fn(t); } finally { this.captcha?.reset(); }
    };
    const on = (sel, fn) => { const e = $(sel); if (e) e.onclick = (ev) => { ev.preventDefault(); fn(); }; };
    this.root.querySelectorAll('.tabs button').forEach((b) => { b.onclick = () => this.showAuth(b.dataset.m); });
    $('#a-email')?.addEventListener('input', (e) => { this.lastEmail = e.target.value.trim(); });
    on('#a-guest', () => this.app.loginGuest());
    on('#a-forgot', () => this.showAuth('forgot'));
    on('#a-back', () => this.showAuth('login'));
    on('#a-tocode', () => this.showAuth('verify'));
    const code = $('#a-code');
    if (code) {
      code.oninput = () => { code.value = code.value.replace(/\D/g, '').slice(0, OTP_LENGTH); };
      setTimeout(() => code.focus(), 0);
    }
    const pass = $('#a-pass'), ruleList = $('#a-rules');
    if (pass && ruleList) pass.addEventListener('input', () => {
      for (const r of PASSWORD_RULES) ruleList.querySelector(`[data-r="${r.id}"]`).classList.toggle('ok', r.test(pass.value));
    });
    // Resend button stays disabled with a countdown until RESEND_COOLDOWN has passed since the last email.
    const resendBtn = $('#a-resend');
    let sending = false;
    const tick = () => {
      if (!resendBtn?.isConnected) return clearInterval(this.cooldownTimer);
      const left = emailCooldownLeft();
      resendBtn.disabled = sending || left > 0;
      resendBtn.textContent = left > 0 ? `Resend email (${left}s)` : 'Resend email';
    };
    clearInterval(this.cooldownTimer);
    if (resendBtn) { tick(); this.cooldownTimer = setInterval(tick, 1000); }
    on('#a-resend', async () => {
      if (emailCooldownLeft() > 0 || sending) return;
      sending = true; tick();
      try {
        if (mode === 'reset') await withCaptcha((t) => api.requestPasswordReset(this.lastEmail, t));
        else await withCaptcha((t) => api.resendConfirmation(this.lastEmail, t));
        markEmailSent();
        say('Email sent. Check your inbox (and spam).', true);
      } catch (e) { say(e.message); }
      sending = false; tick();
    });

    const getCode = () => {
      const c = code.value.trim();
      if (c.length !== OTP_LENGTH) throw new Error(`Enter the ${OTP_LENGTH}-digit code from the email.`);
      return c;
    };
    const actions = {
      login: async () => {
        const em = $('#a-email').value.trim();
        if (!em || !pass.value) throw new Error('Enter your email and password.');
        try { await withCaptcha((t) => api.signIn(em, pass.value, t)); }
        catch (e) { if (/not confirmed/i.test(e.message)) $('#a-unconfirmed').classList.remove('hidden'); throw e; }
        await this.app.onSignedIn();
      },
      signup: async () => {
        const em = $('#a-email').value.trim();
        if (!em) throw new Error('Enter your email.');
        assertPassword(pass.value);
        const r = await withCaptcha((t) => api.signUp(em, pass.value, $('#a-user').value.trim(), t));
        if (r.session) return this.app.onSignedIn();
        markEmailSent();
        this.showAuth('verify', { text: 'Account created — check your inbox.', good: true });
      },
      verify: async () => {
        await api.verifyEmailCode(this.lastEmail, getCode());
        await this.app.onSignedIn();
        this.toast('Email confirmed — welcome to John-Paul Simulator!', 'good');
      },
      forgot: async () => {
        const em = $('#a-email').value.trim();
        if (!em) throw new Error('Enter your email.');
        const wait = emailCooldownLeft();
        if (wait > 0) throw new Error(`Please wait ${wait}s before requesting another email.`);
        await withCaptcha((t) => api.requestPasswordReset(em, t));
        markEmailSent();
        this.showAuth('reset', { text: `If an account exists for ${em}, a code is on its way.`, good: true });
      },
      reset: async () => {
        const c = getCode();
        assertPassword(pass.value);
        if (pass.value !== $('#a-pass2').value) throw new Error('Passwords do not match.');
        await api.verifyResetCode(this.lastEmail, c);
        await api.updatePassword(pass.value);
        await this.app.onSignedIn();
        this.toast('Password updated', 'good');
      },
      newpass: async () => {
        assertPassword(pass.value);
        if (pass.value !== $('#a-pass2').value) throw new Error('Passwords do not match.');
        await api.updatePassword(pass.value);
        await this.app.onSignedIn();
        this.toast('Password updated', 'good');
      },
    };
    const go = async () => {
      const btn = $('#a-go');
      say(''); btn.disabled = true;
      try { await actions[mode](); }
      catch (e) { say(e.message); }
      if (btn.isConnected) btn.disabled = false;
    };
    on('#a-go', go);
    this.root.querySelectorAll('.auth-box input').forEach((i) => { i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); });
  }

  // ───────────────────────── shell ─────────────────────────
  showMenu(tab = this.tab) {
    this.cleanup();
    this.tab = tab;
    const app = this.app, p = app.profile;
    const tabs = [['play', 'Play'], ['operators', 'Operators'], ['armory', 'Armory'], ['leaderboard', 'Leaderboard'], ['replays', 'Replays'], ['profile', 'Profile'], ['settings', 'Settings']];
    const lvl = levelFor(p?.xp || 0);
    this.root.innerHTML = `<div class="screen"><div class="menu-bg"></div>
      <div class="topbar">
        <div class="logo">JOHN-PAUL <span>SIMULATOR</span></div>
        <div class="nav">${tabs.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>
        <div class="user-chip" id="chip">
          <div class="avatar">${esc((app.me().name || '?')[0].toUpperCase())}</div>
          <div><div class="name">${esc(app.me().name)}</div><div class="sub">${p ? `${rankFor(p.elo).name} · ${p.elo} · Lv ${lvl.level}` : 'Guest · offline only'}</div></div>
        </div>
      </div>
      <div class="content"><div class="content-inner" id="tab"></div></div></div>`;
    this.root.querySelectorAll('.nav button').forEach((b) => { b.onclick = () => this.showMenu(b.dataset.t); });
    this.root.querySelector('#chip').onclick = () => (p ? this.showMenu('profile') : this.showAuth());
    const el = this.root.querySelector('#tab');
    ({ play: () => this.renderPlay(el), operators: () => this.renderOperators(el), armory: () => this.renderArmory(el), leaderboard: () => this.renderLeaderboard(el), replays: () => this.renderReplays(el), profile: () => this.renderProfile(el), settings: () => this.renderSettings(el) })[tab]();
  }

  // ───────────────────────── play ─────────────────────────
  renderPlay(el) {
    const app = this.app, online = !!app.user;
    const o = this.offline;
    const modeCard = (id, extra = '') => {
      const m = MODES[id];
      return `<div class="mode-card ${extra}" data-mode="${id}">
        ${m.ranked ? '<span class="mc-tag ranked">Ranked</span>' : `<span class="mc-tag">${m.short}</span>`}
        <div class="mc-title">${m.name}</div><div class="mc-desc">${m.desc}</div><div class="mc-goal">${goalText(m)} · ${m.maps.length} maps</div><div class="mc-big">${m.short}</div></div>`;
    };
    const active = online ? app.activeMatch() : null;
    const am = active && MODES[active.payload.mode];
    el.innerHTML = `
      ${active ? `<div class="panel rejoin-bar"><div><b>Match in progress</b><div class="muted small">${esc(am?.name || active.payload.mode)} on ${esc(MAPS[active.payload.map]?.name || active.payload.map)} · a bot is playing for you until you return</div></div>
        <span class="spacer"></span><button class="btn primary" id="rejoin">Reconnect</button><button class="btn small" id="rejoin-x">Dismiss</button></div>` : ''}
      <div class="grid" style="grid-template-columns: minmax(0,1fr) 300px; gap: 22px">
        <div class="col" style="gap:26px">
          <section>
            <div class="row"><h2>Online</h2><span class="muted small">${online ? 'Quick match finds players in the queue; bots fill empty slots after 20s (except ranked).' : 'Sign in to play online, ranked and save stats.'}</span></div>
            <div class="grid c4" id="online-modes" style="${online ? '' : 'opacity:.45;pointer-events:none'}">${MODE_ORDER.map((id) => modeCard(id)).join('')}
              <div class="mode-card" data-custom="1"><span class="mc-tag">Private</span><div class="mc-title">Custom Lobby</div><div class="mc-desc">Create a lobby with a code for friends, pick map and mode, fill with bots.</div><div class="mc-big">LOBBY</div></div>
            </div>
            ${online ? `<div class="row" style="margin-top:12px"><input type="text" id="join-code" maxlength="5" placeholder="LOBBY CODE" style="width:150px;text-transform:uppercase;letter-spacing:3px">
              <button class="btn small" id="join-btn">Join</button><button class="btn small" id="browse-btn">Browse lobbies</button></div>
              <div id="lobby-list" style="margin-top:10px"></div>` : `<button class="btn primary" id="signin" style="margin-top:12px">Sign in / create account</button>`}
          </section>
          <section>
            <div class="row"><h2>Offline · vs Bots</h2></div>
            <div class="panel">
              <div class="grid c3" id="off-modes">${OFFLINE_MODES.map((id) => `<div class="mode-card ${o.mode === id ? 'selected' : ''}" data-omode="${id}" style="min-height:96px"><span class="mc-tag">${MODES[id].short}</span><div class="mc-title" style="font-size:19px">${MODES[id].name}</div><div class="mc-goal">${goalText(MODES[id])}</div></div>`).join('')}</div>
              <h3 style="margin-top:18px">Map</h3>
              <div class="grid c4" id="off-maps">${Object.values(MAPS).map((m) => `<div class="map-card ${o.map === m.id ? 'selected' : ''} ${o.mode === 'bomb' && !m.sites ? 'disabled' : ''}" data-map="${m.id}" title="${esc(m.desc)}"><img src="${mapPreview(m.id)}" style="width:100%;aspect-ratio:16/11;object-fit:cover;display:block;image-rendering:pixelated;background:#000"><div class="mc-info"><b>${m.name}</b><span class="muted small">${m.size}</span></div></div>`).join('')}</div>
              <div class="row" style="margin-top:16px">
                <span class="muted small">Bot difficulty</span>
                <div class="seg" id="off-diff">${Object.keys(BOT_LEVELS).map((k) => `<button data-d="${k}" class="${o.botLevel === k ? 'sel' : ''}">${k}</button>`).join('')}</div>
                <span class="spacer"></span>
                <button class="btn primary big" id="off-start">Deploy</button>
              </div>
              <p class="muted small" id="off-note" style="margin:10px 0 0"></p>
            </div>
          </section>
        </div>
        <aside class="col">
          <div class="panel tight">${this.profileSummary()}</div>
          <div class="panel tight"><h3>Online now <span id="online-count"></span></h3><div class="online-list" id="online-list"><span class="muted small">${online ? 'Connecting…' : 'Sign in to see who is online.'}</span></div></div>
          <div class="panel tight"><h3>Controls</h3><div class="keys">
            <span>Move / Jump</span><span><kbd>WASD</kbd> <kbd>Space</kbd></span><span>Crouch / Walk</span><span><kbd>Ctrl</kbd> <kbd>Shift</kbd></span>
            <span>Fire / Scope</span><span><kbd>LMB</kbd> <kbd>RMB</kbd></span><span>Reload</span><span><kbd>R</kbd></span>
            <span>Weapons</span><span><kbd>1-5</kbd> <kbd>Q</kbd></span><span>Buy menu</span><span><kbd>B</kbd></span>
            <span>Rebuy last loadout</span><span><kbd>F</kbd></span><span>Keep loadout on/off</span><span><kbd>K</kbd></span>
            <span>Plant / Defuse</span><span><kbd>E</kbd> hold</span><span>Scoreboard</span><span><kbd>Tab</kbd></span>
            <span>Chat</span><span><kbd>Y</kbd></span></div></div>
        </aside>
      </div>`;
    const $ = (s) => el.querySelector(s);
    el.querySelectorAll('#online-modes [data-mode]').forEach((c) => { c.onclick = () => this.startQueue(c.dataset.mode); });
    el.querySelector('[data-custom]').onclick = () => this.createLobby();
    if (active) {
      $('#rejoin').onclick = () => app.rejoinMatch();
      $('#rejoin-x').onclick = () => { app.clearActiveMatch(); this.renderPlay(el); };
    }
    if (online) {
      $('#join-btn').onclick = () => { const c = $('#join-code').value.trim().toUpperCase(); if (c.length === 5) this.joinLobby(c); else this.toast('Enter a 5-character code', 'bad'); };
      $('#browse-btn').onclick = () => this.browseLobbies($('#lobby-list'));
    } else $('#signin').onclick = () => this.showAuth();
    const note = () => {
      const m = MODES[o.mode];
      const map = MAPS[o.map];
      const n = SOLO_KINDS.has(m.kind) ? 5 : m.teamSize * 2 - 1;
      $('#off-note').textContent = `${m.name} on ${map.name} with ${n} bot${n > 1 ? 's' : ''} — ${goalText(m)}. ${map.desc}${m.kind === 'rounds' && map.size === 'large' ? ' Tip: duels play best on small maps.' : ''}`;
    };
    el.querySelectorAll('[data-omode]').forEach((c) => { c.onclick = () => {
      o.mode = c.dataset.omode;
      if (!MAPS[o.map].sites && o.mode === 'bomb') o.map = 'dustline';
      this.renderPlay(el);
    }; });
    el.querySelectorAll('[data-map]').forEach((c) => { c.onclick = () => {
      if (o.mode === 'bomb' && !MAPS[c.dataset.map].sites) { this.toast('Bomb defusal needs a large map with bomb sites.', 'bad'); return; }
      o.map = c.dataset.map; this.renderPlay(el);
    }; });
    el.querySelectorAll('#off-diff button').forEach((b) => { b.onclick = () => { o.botLevel = b.dataset.d; el.querySelectorAll('#off-diff button').forEach((x) => x.classList.toggle('sel', x === b)); }; });
    $('#off-start').onclick = () => this.app.startOffline({ ...o });
    note();
    if (online) { this.renderOnlineList(); this.onlineTimer = setInterval(() => this.renderOnlineList(), 3000); }
  }

  renderOnlineList() {
    const list = this.app.onlinePlayers();
    const el = this.root.querySelector('#online-list');
    if (!el) return;
    this.root.querySelector('#online-count').textContent = `(${list.length})`;
    const meId = this.app.me().id;
    el.innerHTML = list.length ? list.map((p) => {
      const watch = p.match && !p.match.ranked && p.id !== meId;
      const status = p.match ? `${MODES[p.match.mode]?.short || ''} · ${MAPS[p.match.map]?.name || ''}` : p.status !== 'menu' ? p.status : '';
      return `<div class="o"><span class="dot ${p.status !== 'menu' ? 'busy' : ''}"></span><span>${esc(p.name)}</span>${status ? `<span class="muted small">${esc(status)}</span>` : ''}<span class="spacer"></span>${watch ? `<button class="btn small" data-watch="${esc(p.id)}">Watch</button>` : rankBadge(p.elo)}</div>`;
    }).join('') : '<span class="muted small">Nobody else is online.</span>';
    el.querySelectorAll('[data-watch]').forEach((b) => { b.onclick = () => { const p = list.find((x) => x.id === b.dataset.watch); if (p?.match) this.app.spectate(p.match); }; });
  }

  profileSummary() {
    const p = this.app.profile;
    if (!p) return `<h3>Guest</h3><p class="muted small" style="margin:0">Progress is not saved. Sign in to track ELO, stats and match history.</p>`;
    const lvl = levelFor(p.xp);
    return `<div class="row">${rankBadge(p.elo, true)}<span class="spacer"></span><div style="text-align:right"><div class="hud-num" style="font-size:30px">${p.elo}</div><div class="muted small">ELO</div></div></div>
      <div class="row small muted" style="margin-top:10px"><span>Level ${lvl.level}</span><span class="spacer"></span><span>${lvl.into} / ${lvl.need} XP</span></div>
      <div class="xpbar"><div style="width:${(lvl.into / lvl.need) * 100}%"></div></div>
      <div class="row small" style="margin-top:10px"><span>Ranked ${p.ranked_wins}W-${p.ranked_losses}L</span><span class="spacer"></span><span>K/D ${kd(p.kills, p.deaths)}</span></div>`;
  }

  // ───────────────────────── queue ─────────────────────────
  modal(html) {
    const m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.innerHTML = `<div class="modal panel">${html}</div>`;
    this.root.appendChild(m);
    return m;
  }

  async startQueue(mode) {
    const m = MODES[mode];
    const modal = this.modal(`<div style="text-align:center"><h3>${esc(m.name)}</h3><div class="queue-pulse"></div>
      <h2 id="q-status">Connecting…</h2><p class="muted small" id="q-sub"></p>
      <div class="row" style="justify-content:center"><button class="btn small hidden" id="q-force">Start now with bots</button><button class="btn danger small" id="q-cancel">Cancel</button></div></div>`);
    const mm = new Matchmaker(this.app, mode, {
      onUpdate: (s) => {
        const t = Math.floor(s.waited);
        modal.querySelector('#q-status').textContent = `Searching · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
        modal.querySelector('#q-sub').textContent = `${s.count} / ${s.need} players in queue${m.ranked ? '' : s.count >= 2 ? ' · bots fill remaining slots at 0:20' : ' · waiting for at least one more player'}`;
        modal.querySelector('#q-force').classList.toggle('hidden', !s.canForce);
      },
      onMatch: (payload) => { modal.remove(); this.app.startOnline(payload); },
    });
    modal.querySelector('#q-cancel').onclick = () => { mm.cancel(); modal.remove(); this.app.setStatus('menu'); };
    modal.querySelector('#q-force').onclick = () => mm.forceStart();
    try { await mm.start(); this.app.setStatus('queue'); }
    catch (e) { modal.remove(); this.toast(e.message, 'bad'); }
  }

  // ───────────────────────── lobbies ─────────────────────────
  async createLobby() { await this.openLobby(Lobby.newCode(), true); }
  async joinLobby(code) { await this.openLobby(code, false); }

  async openLobby(code, isHost) {
    this.cleanup();
    const lobby = new Lobby(this.app, code, isHost, {
      onChange: () => this.renderLobby(lobby),
      onStart: (payload) => { lobby.leave(); this.app.startOnline(payload); },
      onClosed: (msg) => { lobby.leave(); this.toast(msg, 'bad'); this.showMenu('play'); },
    });
    this.root.innerHTML = `<div class="screen"><div class="menu-bg"></div><div class="content"><div class="content-inner"><h2>Joining lobby ${esc(code)}…</h2></div></div></div>`;
    try {
      await lobby.connect();
      this.app.setStatus('lobby');
      this.lobby = lobby;
      this.renderLobby(lobby);
      if (!isHost) setTimeout(() => { if (!lobby.cfg.hostId && !lobby.started) { lobby.leave(); this.toast('Lobby not found', 'bad'); this.showMenu('play'); } }, 4000);
    } catch (e) { this.toast(e.message, 'bad'); this.showMenu('play'); }
  }

  renderLobby(lobby) {
    if (!lobby.room || lobby.started) return;
    const me = this.app.me(), cfg = lobby.cfg, m = MODES[cfg.mode];
    const members = lobby.members();
    const host = lobby.isHost;
    const row = (x) => `<div class="player-row"><span>${esc(x.name)}</span>${x.host ? '<span class="host">HOST</span>' : ''}<span class="spacer"></span>${rankBadge(x.elo)}${host && x.id !== me.id ? ` <button class="btn small" data-kick="${x.id}">✕</button>` : ''}</div>`;
    let teams;
    if (SOLO_KINDS.has(m.kind)) teams = `<div class="team-col"><h3>Players <span>${members.length}</span></h3>${members.map(row).join('')}</div><div></div>`;
    else {
      const col = (t, label) => `<div class="team-col ${t === 0 ? 't' : 'ct'}"><h3>${label} <button class="btn small" data-team="${t}">Join</button></h3>${members.filter((x) => x.team === t).map(row).join('')}</div>`;
      const auto = members.filter((x) => x.team !== 0 && x.team !== 1);
      teams = col(0, m.kind === 'bomb' ? 'Attackers' : 'Team 1') + col(1, m.kind === 'bomb' ? 'Defenders' : 'Team 2') +
        (auto.length ? `<div class="team-col" style="grid-column:span 2;min-height:0"><h3>Auto-assign <button class="btn small" data-team="-1">Join</button></h3>${auto.map(row).join('')}</div>` : '');
    }
    const maps = cfg.mode === 'bomb' ? Object.values(MAPS).filter((x) => x.sites) : Object.values(MAPS);
    const opt = (v, cur, label) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
    this.root.innerHTML = `<div class="screen"><div class="menu-bg"></div>
      <div class="topbar"><div class="logo">JOHN-PAUL <span>SIMULATOR</span></div><div class="nav"></div><button class="btn small danger" id="lb-leave">Leave lobby</button></div>
      <div class="content"><div class="content-inner">
        <div class="row" style="margin-bottom:18px"><div><h3 style="margin:0">Lobby code</h3><div class="code-box">${esc(lobby.code)}</div></div><span class="spacer"></span>
          ${host ? `<button class="btn primary big" id="lb-start">Start match</button>` : '<span class="muted">Waiting for the host to start…</span>'}</div>
        <div class="grid" style="grid-template-columns: minmax(0,1fr) 320px; gap:20px">
          <div class="lobby-teams">${teams}</div>
          <div class="panel col">
            <label class="field"><span>Mode</span><select id="lb-mode" ${host ? '' : 'disabled'}>${OFFLINE_MODES.map((k) => opt(k, cfg.mode, MODES[k].name)).join('')}</select></label>
            <label class="field"><span>Map</span><select id="lb-map" ${host ? '' : 'disabled'}>${maps.map((x) => opt(x.id, cfg.map, `${x.name} (${x.size})`)).join('')}</select></label>
            <label class="field"><span>Bot difficulty</span><select id="lb-diff" ${host ? '' : 'disabled'}>${Object.keys(BOT_LEVELS).map((k) => opt(k, cfg.botLevel, k)).join('')}</select></label>
            <label class="row"><input type="checkbox" id="lb-fill" ${cfg.fillBots ? 'checked' : ''} ${host ? '' : 'disabled'}> <span>Fill empty slots with bots</span></label>
            <img src="${mapPreview(cfg.map)}" style="width:100%;image-rendering:pixelated;border-radius:4px">
            <p class="muted small" style="margin:0">${esc(m.desc)}</p>
          </div>
        </div>
      </div></div></div>`;
    const $ = (s) => this.root.querySelector(s);
    $('#lb-leave').onclick = () => { lobby.leave(); this.lobby = null; this.app.setStatus('menu'); this.showMenu('play'); };
    this.root.querySelectorAll('[data-team]').forEach((b) => { b.onclick = () => lobby.setTeam(+b.dataset.team); });
    this.root.querySelectorAll('[data-kick]').forEach((b) => { b.onclick = () => lobby.room.send('kick', b.dataset.kick); });
    if (host) {
      $('#lb-mode').onchange = (e) => {
        const mode = e.target.value;
        let map = cfg.map;
        if (mode === 'bomb' && !MAPS[map].sites) map = 'dustline';
        lobby.setCfg({ mode, map });
      };
      $('#lb-map').onchange = (e) => lobby.setCfg({ map: e.target.value });
      $('#lb-diff').onchange = (e) => lobby.setCfg({ botLevel: e.target.value });
      $('#lb-fill').onchange = (e) => lobby.setCfg({ fillBots: e.target.checked });
      $('#lb-start').onclick = () => {
        const humans = lobby.members().length;
        if (!cfg.fillBots && humans < 2) { this.toast('Need at least 2 players, or enable bot fill.', 'bad'); return; }
        if (!SOLO_KINDS.has(m.kind) && humans > m.teamSize * 2) { this.toast(`Too many players for ${m.name}.`, 'bad'); return; }
        lobby.start();
      };
    }
  }

  async browseLobbies(el) {
    el.innerHTML = '<span class="muted small">Looking for lobbies…</span>';
    try {
      const list = await listLobbies(this.app);
      el.innerHTML = list.length ? `<table class="tbl">${list.map((l) => `<tr class="clickable" data-code="${esc(l.code)}"><td><b>${esc(l.name)}</b></td><td>${esc(MODES[l.mode]?.name || l.mode)}</td><td>${esc(MAPS[l.map]?.name || l.map)}</td><td class="num">${l.count} players</td><td class="num"><kbd>${esc(l.code)}</kbd></td></tr>`).join('')}</table>` : '<span class="muted small">No open lobbies. Create one!</span>';
      el.querySelectorAll('[data-code]').forEach((r) => { r.onclick = () => this.joinLobby(r.dataset.code); });
    } catch (e) { el.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  }

  // ───────────────────────── operators / creator ─────────────────────────
  renderOperators(el) {
    const app = this.app;
    if (!this.editChar) this.editChar = { ...app.char };
    const c = this.editChar;
    const equippedId = app.char.preset;
    el.innerHTML = `<div class="creator">
      <div class="col" style="min-height:0">
        <h2>Operators</h2>
        <div class="op-list">${OPERATORS.map((o) => `<div class="op-item ${c.preset === o.id ? 'selected' : ''}" data-op="${o.id}">${equippedId === o.id ? '<span class="eq">Equipped</span>' : ''}<b>${esc(o.name)}</b><span>${esc(o.role)} — ${esc(o.bio)}</span><span class="perk">★ ${PERKS[o.char.perk].name}: ${PERKS[o.char.perk].desc}</span></div>`).join('')}
          <div class="op-item ${c.preset === 'custom' ? 'selected' : ''}" data-op="custom">${equippedId === 'custom' ? '<span class="eq">Equipped</span>' : ''}<b>Custom Operator</b><span>Your own creation. Tweak anything on the right and pick any perk.</span></div>
        </div>
      </div>
      <div class="preview"><canvas id="pv"></canvas><div class="hint">Drag to rotate</div></div>
      <div class="controls" id="cc"></div>
    </div>`;
    this.preview = new CharacterPreview(el.querySelector('#pv'));
    this.preview.setCharacter(c);
    el.querySelectorAll('[data-op]').forEach((d) => { d.onclick = () => {
      const op = OPERATORS.find((o) => o.id === d.dataset.op);
      const cosmetics = { outfit: this.editChar.outfit, skins: this.editChar.skins };
      this.editChar = op ? { ...op.char, ...cosmetics, preset: op.id } : { ...this.editChar, preset: 'custom' };
      this.preview.dispose();
      this.renderOperators(el);
    }; });
    this.renderCreatorControls(el.querySelector('#cc'));
  }

  renderCreatorControls(cc) {
    const c = this.editChar;
    const chips = (key, list) => `<div class="field"><span>${key.replace(/([A-Z])/g, ' $1')}</span><div class="chips">${list.map((v) => `<div class="chip ${c[key] === v ? 'sel' : ''}" data-k="${key}" data-v="${v}">${v}</div>`).join('')}</div></div>`;
    const swatches = (key, list, label) => `<div class="field"><span>${label}</span><div class="swatches">${list.map((v) => `<div class="swatch ${c[key] === v ? 'sel' : ''}" style="background:${v}" data-k="${key}" data-v="${v}"></div>`).join('')}<input type="color" value="${c[key]}" data-color="${key}"></div></div>`;
    const perk = PERKS[c.perk] || PERKS.speedloader;
    const perkBlock = c.preset === 'custom' || !c.preset
      ? `<div class="field"><span>Perk</span><div class="chips">${Object.entries(PERKS).map(([k, pk]) => `<div class="chip ${c.perk === k ? 'sel' : ''}" data-perk="${k}" title="${esc(pk.desc)}">${pk.name}</div>`).join('')}</div><span class="small muted" id="cc-perk-desc">${esc(perk.desc)}</span></div>`
      : `<div class="field"><span>Perk</span><div class="perk-box"><b>★ ${perk.name}</b><span class="small muted">${esc(perk.desc)}</span></div><span class="small muted">Switch to Custom Operator to choose a different perk.</span></div>`;
    cc.innerHTML = `
      <label class="field"><span>Callsign</span><input type="text" id="cc-name" maxlength="18" value="${esc(c.name)}"></label>
      ${perkBlock}
      ${swatches('skin', CHAR_OPTIONS.skin, 'Skin tone')}
      ${chips('hair', CHAR_OPTIONS.hair)}
      ${swatches('hairColor', CHAR_OPTIONS.hairColor, 'Hair colour')}
      ${chips('face', CHAR_OPTIONS.face)}
      ${chips('headgear', CHAR_OPTIONS.headgear)}
      ${chips('build', CHAR_OPTIONS.build)}
      <label class="field"><span>Height</span><input type="range" min="0.92" max="1.08" step="0.01" value="${c.height}" id="cc-h"></label>
      ${swatches('top', CHAR_OPTIONS.cloth, 'Shirt')}
      ${chips('vest', CHAR_OPTIONS.vest)}
      ${swatches('vestColor', CHAR_OPTIONS.cloth, 'Vest / helmet')}
      ${swatches('pants', CHAR_OPTIONS.cloth, 'Trousers')}
      ${swatches('gloves', ['#1d1d1f', '#3b3328', '#5a5040', '#6b6f75', '#2b3a2b'], 'Gloves')}
      ${swatches('boots', ['#2a221b', '#1a1a1a', '#5a4632', '#6f6448'], 'Boots')}
      <div class="row" style="position:sticky;bottom:0;background:var(--bg2);padding:10px 0">
        <button class="btn primary" id="cc-save">Equip operator</button><button class="btn small" id="cc-rand">Randomise</button>
      </div>`;
    const update = () => { this.editChar.preset = this.editChar.preset && this.editChar.preset !== 'custom' && this.dirty ? 'custom' : this.editChar.preset; this.preview.setCharacter(this.editChar); };
    cc.querySelectorAll('[data-k]').forEach((e) => { e.onclick = () => {
      c[e.dataset.k] = e.dataset.v; this.dirty = true; c.preset = 'custom';
      cc.querySelectorAll(`[data-k="${e.dataset.k}"]`).forEach((x) => x.classList.toggle('sel', x === e));
      update();
    }; });
    cc.querySelectorAll('[data-perk]').forEach((e) => { e.onclick = () => {
      c.perk = e.dataset.perk; c.preset = 'custom';
      cc.querySelectorAll('[data-perk]').forEach((x) => x.classList.toggle('sel', x === e));
      cc.querySelector('#cc-perk-desc').textContent = PERKS[c.perk].desc;
    }; });
    cc.querySelectorAll('[data-color]').forEach((e) => { e.oninput = () => { c[e.dataset.color] = e.value; c.preset = 'custom'; update(); }; });
    cc.querySelector('#cc-h').oninput = (e) => { c.height = +e.target.value; c.preset = 'custom'; update(); };
    cc.querySelector('#cc-name').oninput = (e) => { c.name = e.target.value; };
    cc.querySelector('#cc-rand').onclick = () => {
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      Object.assign(c, {
        skin: pick(CHAR_OPTIONS.skin), hair: pick(CHAR_OPTIONS.hair), hairColor: pick(CHAR_OPTIONS.hairColor), face: pick(CHAR_OPTIONS.face),
        headgear: pick(CHAR_OPTIONS.headgear), build: pick(CHAR_OPTIONS.build), top: pick(CHAR_OPTIONS.cloth), vest: pick(CHAR_OPTIONS.vest),
        vestColor: pick(CHAR_OPTIONS.cloth), pants: pick(CHAR_OPTIONS.cloth), height: +(0.94 + Math.random() * 0.12).toFixed(2), preset: 'custom',
      });
      this.renderCreatorControls(cc); update();
    };
    cc.querySelector('#cc-save').onclick = async () => {
      const saved = { ...sanitizeChar(c), preset: c.preset || 'custom' };
      await this.app.saveChar(saved);
      this.toast('Operator equipped', 'good');
      this.editChar = { ...saved };
      this.preview.dispose();
      this.showMenu('operators');
    };
  }

  // ───────────────────────── armory (collection) ─────────────────────────
  renderArmory(el) {
    const app = this.app, inv = app.inventory, c = { ...app.char, skins: { ...(app.char.skins || {}) } };
    const guns = Object.values(WEAPONS);
    if (!this.armoryWeapon || !WEAPONS[this.armoryWeapon]) this.armoryWeapon = 'ar7';
    const wid = this.armoryWeapon;
    const curFinish = c.skins[wid] || 'factory';
    const total = Object.keys(WEAPON_SKINS).length + Object.keys(OUTFITS).length;
    const owned = inv.finishes.length + inv.outfits.length;
    const card = (kind, id, def, equipped) => {
      const have = (kind === 'finish' ? inv.finishes : inv.outfits).includes(id);
      const r = RARITIES[def.rarity];
      return `<div class="item-card ${equipped ? 'equipped' : ''} ${have ? '' : 'locked'}" data-${kind}="${id}" style="--rc:${r.color}" title="${have ? 'Click to equip' : 'Locked — earn it as a post-match drop'}">
        <div class="sw" style="background:${kind === 'finish' ? finishSwatch(id) : outfitSwatch(id)}"></div>
        <b>${esc(def.name)}</b><span style="color:${r.color}">${r.name}</span>${have ? '' : '<i class="lock">🔒</i>'}</div>`;
    };
    el.innerHTML = `<div class="row"><h2>Armory</h2><span class="muted small">${owned} / ${total} collected · Wins always drop an item; other matches drop one half the time.</span></div>
      <div class="creator" style="grid-template-columns: 220px 1fr 420px">
        <div class="op-list">${guns.map((w) => `<div class="op-item ${w.id === wid ? 'selected' : ''}" data-gun="${w.id}"><b style="font-size:15px">${esc(w.name)}</b><span>${esc(WEAPON_SKINS[c.skins[w.id] || 'factory'].name)}</span></div>`).join('')}</div>
        <div class="preview"><canvas id="pv"></canvas><div class="hint">Drag to rotate</div></div>
        <div class="controls">
          <div class="field"><span>Weapon finish · ${esc(WEAPONS[wid].name)}</span><div class="item-grid">${Object.entries(WEAPON_SKINS).map(([id, d]) => card('finish', id, d, id === curFinish)).join('')}</div>
            <button class="btn small" id="apply-all" style="align-self:flex-start;margin-top:6px">Apply ${esc(WEAPON_SKINS[curFinish].name)} to every weapon</button></div>
          <div class="field"><span>Outfit (works on every operator)</span><div class="item-grid">${Object.entries(OUTFITS).map(([id, d]) => card('outfit', id, d, id === (c.outfit || 'standard'))).join('')}</div></div>
        </div>
      </div>`;
    this.preview = new CharacterPreview(el.querySelector('#pv'));
    this.preview.setCharacter(c, wid);
    const save = async (next) => { await app.saveChar({ ...next, preset: app.char.preset }); this.preview.dispose(); this.renderArmory(el); };
    el.querySelectorAll('[data-gun]').forEach((d) => { d.onclick = () => { this.armoryWeapon = d.dataset.gun; this.preview.dispose(); this.renderArmory(el); }; });
    el.querySelectorAll('[data-finish]').forEach((d) => { d.onclick = () => {
      const id = d.dataset.finish;
      if (!inv.finishes.includes(id)) return this.toast('Locked — earn it as a post-match drop', 'bad');
      if (id === 'factory') delete c.skins[wid]; else c.skins[wid] = id;
      save(c);
    }; });
    el.querySelector('#apply-all').onclick = () => {
      for (const w of guns) { if (curFinish === 'factory') delete c.skins[w.id]; else c.skins[w.id] = curFinish; }
      save(c);
      this.toast(`${WEAPON_SKINS[curFinish].name} applied to every weapon`, 'good');
    };
    el.querySelectorAll('[data-outfit]').forEach((d) => { d.onclick = () => {
      const id = d.dataset.outfit;
      if (!inv.outfits.includes(id)) return this.toast('Locked — earn it as a post-match drop', 'bad');
      c.outfit = id;
      save(c);
    }; });
  }

  // ───────────────────────── replays ─────────────────────────
  async renderReplays(el) {
    el.innerHTML = `<div class="row"><h2>Replays</h2><span class="muted small">Your last 8 matches are saved in this browser automatically.</span></div><div class="panel" id="rp-list"><span class="muted">Loading…</span></div>`;
    const body = el.querySelector('#rp-list');
    try {
      const { listReplays, deleteReplay } = await import('../game/replaystore.js');
      const list = await listReplays();
      if (!list.length) { body.innerHTML = '<span class="muted">No replays yet — finish a match and it will show up here.</span>'; return; }
      body.innerHTML = `<table class="tbl"><tr><th>Result</th><th>Mode</th><th>Map</th><th class="num">Length</th><th class="num">Kills</th><th class="num">When</th><th></th></tr>
        ${list.map((r) => `<tr><td class="res-${r.result}">${esc((r.result || '').toUpperCase())}</td><td>${esc(MODES[r.mode]?.name || r.mode)}</td><td>${esc(MAPS[r.map]?.name || r.map)}</td><td class="num">${Math.floor(r.duration / 60)}:${String(Math.floor(r.duration % 60)).padStart(2, '0')}</td><td class="num">${r.kills}</td><td class="num muted">${ago(new Date(r.savedAt).toISOString())}</td>
          <td class="num"><button class="btn small primary" data-watch="${esc(r.id)}">Watch</button> <button class="btn small" data-del="${esc(r.id)}">✕</button></td></tr>`).join('')}</table>`;
      body.querySelectorAll('[data-watch]').forEach((b) => { b.onclick = () => this.app.watchReplay(b.dataset.watch); });
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { await deleteReplay(b.dataset.del); this.renderReplays(el); }; });
    } catch (e) { body.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  }

  // ───────────────────────── leaderboard ─────────────────────────
  async renderLeaderboard(el, kind = 'elo') {
    const app = this.app;
    el.innerHTML = `<div class="row"><h2>Leaderboard</h2><span class="spacer"></span>
      <div class="seg" id="lb-kind">${[['elo', 'Ranked ELO'], ['kills', 'Kills'], ['wins', 'Wins'], ['xp', 'Level']].map(([k, l]) => `<button data-k="${k}" class="${k === kind ? 'sel' : ''}">${l}</button>`).join('')}</div></div>
      <div class="panel" id="lb-body"><span class="muted">Loading…</span></div>`;
    el.querySelectorAll('#lb-kind button').forEach((b) => { b.onclick = () => this.renderLeaderboard(el, b.dataset.k); });
    const body = el.querySelector('#lb-body');
    if (!app.api) { body.innerHTML = '<span class="muted">Leaderboards need an online connection.</span>'; return; }
    try {
      const rows = await app.api.leaderboard(kind);
      if (!rows.length) { body.innerHTML = '<span class="muted">No players yet — be the first.</span>'; return; }
      body.innerHTML = `<table class="tbl"><tr><th>#</th><th>Player</th><th>Rank</th><th class="num">ELO</th><th class="num">Ranked W-L</th><th class="num">Wins</th><th class="num">K/D</th><th class="num">Kills</th><th class="num">Level</th></tr>
        ${rows.map((r, i) => `<tr class="clickable ${r.id === app.user?.id ? 'me' : ''}" data-id="${r.id}"><td>${i + 1}</td><td><b>${esc(r.username)}</b></td><td>${rankBadge(r.elo)}</td><td class="num">${r.elo}</td><td class="num">${r.ranked_wins}-${r.ranked_losses}</td><td class="num">${r.wins}</td><td class="num">${kd(r.kills, r.deaths)}</td><td class="num">${r.kills}</td><td class="num">${levelFor(r.xp).level}</td></tr>`).join('')}</table>`;
      body.querySelectorAll('[data-id]').forEach((r) => { r.onclick = () => this.profileModal(r.dataset.id); });
    } catch (e) { body.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  }

  async profileModal(id) {
    const m = this.modal('<span class="muted">Loading…</span>');
    m.onclick = (e) => { if (e.target === m) m.remove(); };
    try {
      const [p, hist] = await Promise.all([this.app.api.profile(id), this.app.api.history(id, 10)]);
      m.querySelector('.modal').innerHTML = this.profileHTML(p, hist) + '<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn small" data-x>Close</button></div>';
      m.querySelector('[data-x]').onclick = () => m.remove();
    } catch (e) { m.querySelector('.modal').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  }

  profileHTML(p, hist) {
    const lvl = levelFor(p.xp);
    const hsPct = p.kills ? Math.round((p.headshots / p.kills) * 100) : 0;
    const winPct = p.matches ? Math.round((p.wins / p.matches) * 100) : 0;
    return `<div class="row"><div><h1 style="margin:0">${esc(p.username)}</h1><div class="muted small">Joined ${new Date(p.created_at).toLocaleDateString()} · Level ${lvl.level}</div></div><span class="spacer"></span>${rankBadge(p.elo, true)}</div>
      <div class="grid c4" style="margin-top:16px">
        <div class="stat"><b>${p.elo}</b><span>ELO · peak ${p.peak_elo}</span></div>
        <div class="stat"><b>${p.ranked_wins}-${p.ranked_losses}</b><span>Ranked W-L</span></div>
        <div class="stat"><b>${kd(p.kills, p.deaths)}</b><span>K/D</span></div>
        <div class="stat"><b>${hsPct}%</b><span>Headshot %</span></div>
        <div class="stat"><b>${p.matches}</b><span>Online matches</span></div>
        <div class="stat"><b>${winPct}%</b><span>Win rate</span></div>
        <div class="stat"><b>${p.kills}</b><span>Kills</span></div>
        <div class="stat"><b>${p.xp}</b><span>Total XP</span></div>
      </div>
      <h3 style="margin-top:18px">Recent matches</h3>
      ${hist.length ? `<table class="tbl"><tr><th>Result</th><th>Mode</th><th>Map</th><th>Score</th><th class="num">K-D</th><th class="num">ELO</th><th class="num">When</th></tr>
        ${hist.map((h) => `<tr><td class="res-${h.result}">${h.result.toUpperCase()}</td><td>${esc(MODES[h.mode]?.name || h.mode)}${h.online ? '' : ' <span class="muted small">(offline)</span>'}</td><td>${esc(MAPS[h.map]?.name || h.map)}</td><td>${esc(h.score || '')}</td><td class="num">${h.kills}-${h.deaths}</td><td class="num" style="color:${h.elo_change > 0 ? 'var(--good)' : h.elo_change < 0 ? 'var(--bad)' : 'inherit'}">${h.ranked ? (h.elo_change > 0 ? '+' : '') + h.elo_change : '—'}</td><td class="num muted">${ago(h.created_at)}</td></tr>`).join('')}</table>` : '<span class="muted small">No matches yet.</span>'}`;
  }

  async renderProfile(el) {
    const app = this.app;
    if (!app.user) {
      el.innerHTML = `<div class="panel"><h2>Guest</h2><p class="muted">Create an account to get a ranked ELO, a public profile, match history and a spot on the leaderboard.</p><button class="btn primary" id="go">Sign in / create account</button></div>`;
      el.querySelector('#go').onclick = () => this.showAuth();
      return;
    }
    el.innerHTML = '<span class="muted">Loading…</span>';
    try {
      await app.refreshProfile();
      const hist = await app.api.history(app.user.id, 20);
      el.innerHTML = `<div class="panel">${this.profileHTML(app.profile, hist)}</div>
        <div class="row" style="margin-top:16px"><input type="text" id="ps" placeholder="Search players…" style="width:260px"><button class="btn small" id="psb">Search</button><span class="spacer"></span><button class="btn small danger" id="logout">Sign out</button></div>
        <div id="psr" style="margin-top:10px"></div>`;
      const search = async () => {
        const q = el.querySelector('#ps').value.trim();
        if (!q) return;
        const res = await app.api.searchPlayers(q);
        el.querySelector('#psr').innerHTML = res.length ? `<table class="tbl">${res.map((r) => `<tr class="clickable" data-id="${r.id}"><td><b>${esc(r.username)}</b></td><td>${rankBadge(r.elo)}</td><td class="num">${r.elo}</td><td class="num">Lv ${levelFor(r.xp).level}</td><td class="num">${r.matches} matches</td></tr>`).join('')}</table>` : '<span class="muted small">No players found.</span>';
        el.querySelectorAll('#psr [data-id]').forEach((r) => { r.onclick = () => this.profileModal(r.dataset.id); });
      };
      el.querySelector('#psb').onclick = search;
      el.querySelector('#ps').onkeydown = (e) => { if (e.key === 'Enter') search(); };
      el.querySelector('#logout').onclick = () => app.signOut();
    } catch (e) { el.innerHTML = `<div class="panel"><span class="err">${esc(e.message)}</span></div>`; }
  }

  // ───────────────────────── settings ─────────────────────────
  renderSettings(el) {
    el.innerHTML = `<div class="panel" style="max-width:860px">${this.settingsHTML()}</div>`;
    this.bindSettings(el);
  }

  openSettingsModal(container, onClose) {
    container.innerHTML = `<div class="overlay"><div class="panel" style="width:min(820px,94vw);max-height:88vh;overflow-y:auto">${this.settingsHTML()}<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" data-done>Done</button></div></div></div>`;
    this.bindSettings(container);
    container.querySelector('[data-done]').onclick = onClose;
  }

  settingsHTML() {
    const s = this.app.settings;
    const seg = (key, opts) => `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'sel' : ''}">${l}</button>`).join('')}</div>`;
    const range = (key, min, max, step, fmt = (v) => v) => `<input type="range" data-range="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"><span class="val" data-val="${key}">${fmt(s[key])}</span>`;
    const toggle = (key) => `<input type="checkbox" data-toggle="${key}" ${s[key] ? 'checked' : ''}><span></span>`;
    return `<h2>Graphics</h2>
      <div class="settings-grid">
        <span>Quality preset</span>${seg('preset', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra'], ['custom', 'Custom']])}<span></span>
        <span>Render resolution</span>${range('renderScale', 0.5, 2, 0.25, (v) => Math.round(v * 100) + '%')}
        <span>Shadows</span>${seg('shadows', [['off', 'Off'], ['low', 'Low'], ['high', 'High'], ['ultra', 'Ultra']])}<span></span>
        <span>Anti-aliasing</span>${seg('aa', [['off', 'Off'], ['fxaa', 'FXAA'], ['smaa', 'SMAA'], ['msaa', 'MSAA 4x']])}<span></span>
        <span>Bloom</span>${toggle('bloom')}
        <span>Ambient occlusion (GTAO)</span>${toggle('ao')}
        <span>Frame rate cap</span>${seg('maxFps', [[0, 'Unlimited'], [60, '60'], [120, '120'], [144, '144']])}<span></span>
        <span>Show FPS</span>${toggle('showFps')}
      </div>
      <h2 style="margin-top:22px">Gameplay</h2>
      <div class="settings-grid">
        <span>Field of view</span>${range('fov', 70, 110, 1, (v) => v + '°')}
        <span>Weapon field of view</span>${range('viewmodelFov', 50, 80, 1, (v) => v + '°')}
        <span>Mouse sensitivity</span>${range('sens', 0.1, 4, 0.05, (v) => (+v).toFixed(2))}
        <span>Scoped sensitivity</span>${range('scopedSens', 0.2, 2, 0.05, (v) => (+v).toFixed(2))}
        <span>Invert mouse Y</span>${toggle('invertY')}
        <span>Kill cam</span>${toggle('killcam')}
        <span>Master volume</span>${range('volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
      </div>
      <h2 style="margin-top:22px">Crosshair</h2>
      <div class="settings-grid">
        <span>Colour</span><div class="swatches">${['#3dff8f', '#ffffff', '#ffe14d', '#4dd7ff', '#ff4dd2', '#ff4d4d'].map((c) => `<div class="swatch ${s.crosshairColor === c ? 'sel' : ''}" data-ch="${c}" style="background:${c}"></div>`).join('')}<input type="color" data-color="crosshairColor" value="${s.crosshairColor}"></div><span></span>
        <span>Length</span>${range('crosshairSize', 2, 16, 1, (v) => v + 'px')}
        <span>Gap</span>${range('crosshairGap', 0, 12, 1, (v) => v + 'px')}
        <span>Thickness</span>${range('crosshairThick', 1, 4, 1, (v) => v + 'px')}
        <span>Centre dot</span>${toggle('crosshairDot')}
      </div>`;
  }

  bindSettings(root) {
    const app = this.app;
    const apply = (patch, graphics) => {
      const s = app.settings;
      Object.assign(s, patch);
      if (graphics && !('preset' in patch)) s.preset = 'custom';
      saveSettings(s);
      setVolume(s.volume);
      if (graphics) app.engine.applySettings(s);
      else { app.engine.camera.fov = s.fov; app.engine.vmCamera.fov = s.viewmodelFov; app.engine.camera.updateProjectionMatrix(); app.engine.vmCamera.updateProjectionMatrix(); }
    };
    const GRAPHICS = new Set(['renderScale', 'shadows', 'aa', 'bloom', 'ao']);
    root.querySelectorAll('[data-seg]').forEach((g) => {
      g.querySelectorAll('button').forEach((b) => { b.onclick = () => {
        const key = g.dataset.seg;
        let v = b.dataset.v;
        if (key === 'maxFps') v = +v;
        if (key === 'preset') {
          if (v === 'custom') return;
          apply({ preset: v, ...PRESETS[v] }, true);
          return this.rebindAfterPreset(root);
        }
        g.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
        apply({ [key]: v }, GRAPHICS.has(key));
        const pre = root.querySelector('[data-seg=preset]');
        if (GRAPHICS.has(key) && pre) pre.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x.dataset.v === 'custom'));
      }; });
    });
    root.querySelectorAll('[data-range]').forEach((r) => {
      const key = r.dataset.range;
      const fmtEl = root.querySelector(`[data-val="${key}"]`);
      const fmt = { renderScale: (v) => Math.round(v * 100) + '%', fov: (v) => v + '°', viewmodelFov: (v) => v + '°', volume: (v) => Math.round(v * 100) + '%', crosshairSize: (v) => v + 'px', crosshairGap: (v) => v + 'px', crosshairThick: (v) => v + 'px' }[key] || ((v) => (+v).toFixed(2));
      r.oninput = () => { fmtEl.textContent = fmt(+r.value); if (key !== 'renderScale') apply({ [key]: +r.value }, false); };
      r.onchange = () => apply({ [key]: +r.value }, GRAPHICS.has(key));
    });
    root.querySelectorAll('[data-toggle]').forEach((t) => { t.onchange = () => apply({ [t.dataset.toggle]: t.checked }, GRAPHICS.has(t.dataset.toggle)); });
    root.querySelectorAll('[data-ch]').forEach((sw) => { sw.onclick = () => { apply({ crosshairColor: sw.dataset.ch }); root.querySelectorAll('[data-ch]').forEach((x) => x.classList.toggle('sel', x === sw)); }; });
    root.querySelectorAll('[data-color]').forEach((c) => { c.oninput = () => apply({ [c.dataset.color]: c.value }); });
  }

  rebindAfterPreset(root) {
    // Re-render the whole settings body so every control reflects the preset.
    const done = root.querySelector('[data-done]');
    if (done) {
      const onClose = done.onclick;
      this.openSettingsModal(root, onClose);
    } else this.renderSettings(root);
    this.toast('Graphics preset applied', 'good');
    initAudio();
  }
}
