import { MODES, rankBadge, rankFor, levelFor, RANKS, SOLO_KINDS, SIDED_KINDS, needsSites, goalText } from '../data/modes.js';
import { PERKS, OPERATORS, CHAR_OPTIONS, sanitizeChar } from '../data/characters.js';
import { WEAPONS, CLASS_NAMES, itemInfo } from '../data/weapons.js';
import { RARITIES, KINDS, owns } from '../data/skins.js';
import { MAPS } from '../data/maps.js';
import { PRESETS, saveSettings } from '../engine/engine.js';
import { World } from '../engine/world.js';
import { Matchmaker, Lobby, listLobbies } from '../net/matchmaking.js';
import { partyLimit } from '../net/party.js';
import { sfx, setVolume, initAudio } from '../engine/audio.js';
import { BOT_LEVELS } from '../game/bot.js';
import { PASSWORD_RULES, OTP_LENGTH, assertPassword } from '../data/auth.js';
import { mountTurnstile } from './turnstile.js';
import { cardImage, itemSwatch } from './cards.js';
import { applyPadSettings, padHelp } from '../engine/gamepad.js';
import { renderSeason } from './season.js';
import { AdminPanel } from './admin.js';
import { commendDialog, reportDialog, showBanned, showWarnings, bannerHTML, COMMENDS } from './social.js';
import { seasonById, fmtDate } from '../data/seasons.js';
import { censor } from '../data/profanity.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kd = (k, d) => (d ? (k / d).toFixed(2) : k ? k.toFixed(2) : '0.00');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
const QUAD_MODES = ['ranked', 'duo', 'bomb', 'tdm'];
const MORE_MODES = ['hostage', 'retake', 'duel', 'gungame', 'ffa'];
const OFFLINE_MODES = ['duel', 'duo', 'bomb', 'hostage', 'retake', 'tdm', 'gungame', 'ffa'];
const PLAY_MAPS = Object.values(MAPS).filter((m) => !m.training);
const RESEND_COOLDOWN = 60; // seconds between auth emails (matches Supabase's default per-user limit)
const COOLDOWN_KEY = 'jps_email_sent_at';
const NAV = [
  ['play', 'Play', 'Queue up or fight bots'],
  ['season', 'Season', 'Reward track and challenges'],
  ['operators', 'Operators', 'Pick and build your operator'],
  ['armory', 'Armory', 'Finishes, outfits, cards, effects, emotes'],
  ['stats', 'Stats', 'Your record, weapons and rivals'],
  ['replays', 'Replays', 'Rewatch your recent matches'],
  ['leaderboard', 'Leaderboard', 'Top players'],
  ['settings', 'Settings', 'Graphics, controls and audio'],
];
const FOCUS = { play: 'play', season: 'operator', operators: 'operator', armory: 'weapon', stats: 'stats', replays: 'stats', leaderboard: 'play', settings: 'play', admin: 'stats' };
const WIDE = new Set(['season', 'stats', 'replays', 'leaderboard', 'settings', 'admin']);
const ADMIN_NAV = ['admin', 'Admin', 'Reports, players and game switches'];
const ARMORY_KINDS = [['finish', 'Finishes'], ['outfit', 'Outfits'], ['card', 'Calling cards'], ['effect', 'Kill effects'], ['emote', 'Emotes']];
const WHEEL = ['Up', 'Right', 'Down', 'Left'];
const SIZE_LABEL = (m) => (SOLO_KINDS.has(m.kind) ? `${m.maxPlayers} players` : `${m.teamSize}v${m.teamSize}`);

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
    this.source = 'online';
    this.onlineMode = 'ranked';
    this.allModes = false;
    this.offline = { mode: 'bomb', map: 'dustline', botLevel: 'normal' };
    this.armoryKind = 'finish';
    this.armoryWeapon = 'ar7';
    this.emoteSlot = 0;
    this.editChar = null;
    document.addEventListener('click', (e) => { if (e.target.closest('button, .mrow, .map-tile, .op-row, .chip, .swatch, .item-card')) sfx.ui(); }, true);
  }

  get scene() { return this.app.menuScene; }

  // Toast with optional action buttons: actions = [{label, fn, primary}].
  toast(msg, kind = '', actions = null, ms = 4200) {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = `<span>${esc(msg)}</span>${actions ? `<div class="toast-actions">${actions.map((a, i) => `<button class="btn small ${a.primary ? 'primary' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}`;
    t.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { actions[+b.dataset.i].fn(); t.remove(); }; });
    document.getElementById('toast-stack').appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  hide() { this.cleanup(); this.root.innerHTML = ''; this.scene?.stop(); }

  cleanup() {
    clearInterval(this.cooldownTimer);
    this.captcha?.remove(); this.captcha = null;
    clearInterval(this.onlineTimer);
    this.partyUnsub?.(); this.partyUnsub = null;
  }

  modal(html, cls = '') {
    const m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.innerHTML = `<div class="modal m-card ${cls}">${html}</div>`;
    m.addEventListener('click', (e) => { if (e.target === m && !m.dataset.locked) m.remove(); });
    this.root.appendChild(m);
    return m;
  }

  // Stats used for milestone unlocks: profile totals online, local totals for guests.
  milestoneStats() {
    if (this.app.profile) return this.app.profile;
    const l = this.app.localStats();
    const on = l.matches.filter((m) => m.online);
    return { matches: on.length, wins: on.filter((m) => m.result === 'win').length, kills: on.reduce((a, m) => a + m.k, 0), headshots: on.reduce((a, m) => a + m.hs, 0), peak_elo: 1000, ranked_wins: 0 };
  }

  owned(kind, id) { return owns(this.app.inventory, kind, id, this.milestoneStats()); }

  // The squad shown in the 3D stage: you, then party members.
  squad() {
    const me = this.app.me(), party = this.app.party;
    const list = [{ char: this.tab === 'operators' && this.editChar ? this.editChar : me.char, weapon: this.tab === 'armory' && this.armoryKind === 'finish' ? this.armoryWeapon : 'ar7' }];
    if (party?.inParty) for (const m of party.members()) if (m.id !== me.id && m.char) list.push({ char: m.char, weapon: 'ar7' });
    return list;
  }

  stage(mapId, focus) {
    const s = this.scene;
    if (!s) return;
    s.squad = this.squad();
    s.show(mapId || s.mapId || this.offline.map);
    s.setFocus(focus);
    s.setSquad(this.squad());
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
      ? `<div class="m-switch"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Sign in</button><button data-m="signup" class="${mode === 'signup' ? 'on' : ''}">Create account</button></div>` : '';
    this.root.innerHTML = `<div class="m-shell auth" data-tab="auth">
      <header class="m-top"><div class="m-brand"><span class="m-mark">JP</span><span class="m-title">John-Paul Simulator</span></div></header>
      <div class="auth-hero">
        <h1 class="m-hero">John-Paul<br>Simulator</h1>
        <p>Five-a-side bomb defusal, ranked duels, wingman and free-for-all. Build your operator, bring your friends, climb the ladder.</p>
        <div class="ranks">${RANKS.map((r) => `<span class="rank-badge" style="--rc:${r.color}" title="${r.name}, ${r.min}+ rating"><i></i></span>`).join('')}</div>
      </div>
      <section class="m-panel auth-panel">${tabs}${views[mode]}</section>
    </div>`;
    this.tab = null;
    const maps = Object.keys(MAPS);
    this.stage(maps[new Date().getDate() % maps.length], 'auth');
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
    this.root.querySelectorAll('.m-switch button').forEach((b) => { b.onclick = () => this.showAuth(b.dataset.m); });
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
    this.root.querySelectorAll('.auth-panel input').forEach((i) => { i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); });
  }

  // ───────────────────────── shell ─────────────────────────
  showMenu(tab = this.tab) {
    // A banned account only ever sees the ban screen (e.g. after being removed from a match).
    if (this.app.banned) { this.showBanned(this.app.banned); return; }
    if (tab === 'profile') tab = 'stats';
    this.cleanup();
    if (this.lobby && !this.lobby.started) { this.lobby.leave(); this.lobby = null; }
    this.tab = tab;
    if (tab !== 'operators') this.editChar = null;
    const app = this.app, me = app.me();
    this.root.innerHTML = `<div class="m-shell ${WIDE.has(tab) ? 'wide' : ''}" data-tab="${tab}">
      <header class="m-top">
        <div class="m-brand"><span class="m-mark">JP</span><span class="m-title">John-Paul Simulator</span></div>
        <div class="m-party" id="party"></div>
        <button class="m-me" id="me-chip" style="background-image:linear-gradient(90deg, rgba(14,18,13,.92), rgba(14,18,13,.5)), url(${cardImage(me.char?.card || 'standard', 360, 90)})">
          <span class="m-me-name">${esc(me.name)}</span>
          <span class="m-me-sub">${app.profile ? `${rankFor(app.profile.elo).name} ${app.profile.elo} · level ${levelFor(app.profile.xp).level}` : 'Guest, offline only'}</span>
        </button>
      </header>
      <nav class="m-nav">${this.navHTML(tab)}</nav>
      <div class="m-banners" id="banners">${bannerHTML(app)}</div>
      <div class="m-stage" id="stage" title="Drag to turn your operator, click to wave"></div>
      <section class="m-panel" id="tab"></section>
      <footer class="m-foot"><span id="foot-hint">Drag the stage to turn your operator · click it to wave</span><span class="spacer"></span><span id="foot-map"></span></footer>
    </div>`;
    this.root.querySelectorAll('.m-nav button').forEach((b) => { b.onclick = () => this.showMenu(b.dataset.t); });
    this.root.querySelector('#me-chip').onclick = () => (app.profile ? this.showMenu('stats') : this.showAuth());
    this.bindStage();
    this.stage(tab === 'play' && this.source === 'offline' ? this.offline.map : null, FOCUS[tab]);
    this.footMap();
    this.renderParty();
    if (app.party) {
      let key = '';
      this.partyUnsub = app.party.onChange(() => {
        this.renderParty();
        this.scene?.setSquad(this.squad());
        // Leader / size changes affect who can start a search, so refresh the Play panel.
        const k = `${app.party.inParty}-${app.party.isLeader}-${app.party.size}`;
        if (k !== key && this.tab === 'play' && !this.lobby) { key = k; this.renderPlay(this.root.querySelector('#tab')); }
      });
    }
    const el = this.root.querySelector('#tab');
    ({
      play: () => this.renderPlay(el), season: () => renderSeason(this, el), admin: () => (this.adminPanel ||= new AdminPanel(this)).render(el), operators: () => this.renderOperators(el), armory: () => this.renderArmory(el),
      stats: () => this.renderStats(el), replays: () => this.renderReplays(el), leaderboard: () => this.renderLeaderboard(el), settings: () => this.renderSettings(el),
    })[tab]();
  }

  navHTML(tab) {
    const items = this.app.isAdmin ? [...NAV, ADMIN_NAV] : NAV;
    return items.map(([k, label, hint]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''} ${k === 'admin' ? 'nav-admin' : ''}"><b>${label}</b><span>${hint}</span></button>`).join('');
  }

  // The admin tab appears only after the database confirms admin rights (see App.pollStatus).
  adminChanged() {
    const nav = this.root.querySelector('.m-nav');
    if (!nav) return;
    const has = !!nav.querySelector('[data-t=admin]');
    if (has !== !!this.app.isAdmin) {
      nav.innerHTML = this.navHTML(this.tab);
      nav.querySelectorAll('button').forEach((b) => { b.onclick = () => this.showMenu(b.dataset.t); });
      if (!this.app.isAdmin && this.tab === 'admin') this.showMenu('play');
    }
  }

  renderBanner() { const b = this.root.querySelector('#banners'); if (b) b.innerHTML = bannerHTML(this.app); }
  showBanned(ban) { showBanned(this, ban); }
  showWarnings(list) { showWarnings(this, list); }
  commendDialog(player, matchId, done) { commendDialog(this, player, matchId, done); }
  reportDialog(player, ctx, done) { reportDialog(this, player, ctx, done); }

  // Online play is paused in maintenance mode (except for the admin).
  blockedByMaintenance() {
    const mt = this.app.maintenance;
    if (!mt || this.app.isAdmin) return false;
    this.toast(mt.message || 'Online play is paused for maintenance. Try training or a bot match.', 'bad', null, 6000);
    return true;
  }

  footMap() {
    const f = this.root.querySelector('#foot-map');
    if (f && this.scene?.mapId) f.textContent = `Standing in ${MAPS[this.scene.mapId].name}`;
  }

  // Drag on the stage turns your operator; a click without dragging makes them wave.
  bindStage() {
    const st = this.root.querySelector('#stage');
    if (!st) return;
    let down = null, moved = 0;
    st.onpointerdown = (e) => { down = e.clientX; moved = 0; st.setPointerCapture(e.pointerId); };
    st.onpointermove = (e) => { if (down === null) return; const dx = e.clientX - down; down = e.clientX; moved += Math.abs(dx); this.scene?.rotate(dx); };
    st.onpointerup = () => { if (down !== null && moved < 4) this.scene?.emote(this.app.char.emotes?.[0] || 'wave'); down = null; };
  }

  // ───────────────────────── party strip ─────────────────────────
  renderParty() {
    const el = this.root.querySelector('#party');
    if (!el) return;
    const app = this.app, party = app.party;
    if (!app.user || !party) { el.innerHTML = `<span class="m-party-note">Sign in to party up with friends</span>`; return; }
    const meId = app.me().id, members = party.inParty ? party.members() : [{ ...app.me(), id: meId }];
    const leader = party.inParty ? party.leaderId : meId;
    const slots = [];
    for (let i = 0; i < 5; i++) {
      const m = members[i];
      if (m) {
        slots.push(`<div class="slot filled ${m.id === meId ? 'me' : ''}" style="background-image:linear-gradient(rgba(14,18,13,.55), rgba(14,18,13,.85)), url(${cardImage(m.char?.card || 'standard', 240, 60)})" title="${esc(m.name)}">
          ${m.id === leader && members.length > 1 ? '<i class="crown" title="Party leader">★</i>' : ''}<span>${esc(m.name)}</span>
          ${party.isLeader && m.id !== meId ? `<button class="kick" data-kick="${esc(m.id)}" title="Remove from party">×</button>` : ''}</div>`);
      } else slots.push(`<button class="slot open" data-invite title="Invite a friend">+</button>`);
    }
    const inv = party.invites.length;
    el.innerHTML = `${slots.join('')}${party.inParty ? '<button class="btn small ghost" data-leave>Leave</button>' : ''}${inv ? `<button class="btn small primary" data-invites>${inv} invite${inv > 1 ? 's' : ''}</button>` : ''}`;
    el.querySelectorAll('[data-invite]').forEach((b) => { b.onclick = () => this.friendsDrawer(); });
    el.querySelectorAll('[data-kick]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); party.kick(b.dataset.kick); }; });
    el.querySelector('[data-leave]')?.addEventListener('click', () => party.leave());
    el.querySelector('[data-invites]')?.addEventListener('click', () => { for (const i of [...party.invites]) this.partyInvite(i); });
  }

  // Online players: invite to party or watch their match.
  friendsDrawer() {
    const m = this.modal(`<div class="row"><h2 class="m-h2">Online now</h2><span class="spacer"></span><button class="btn small" data-x>Close</button></div><div class="friends" id="fr"></div>`, 'drawer');
    m.querySelector('[data-x]').onclick = () => m.remove();
    const draw = () => {
      if (!m.isConnected) return clearInterval(timer);
      const list = this.app.onlinePlayers(), meId = this.app.me().id, party = this.app.party;
      const inParty = new Set(party?.inParty ? party.members().map((x) => x.id) : []);
      const box = m.querySelector('#fr');
      const others = list.filter((p) => p.id !== meId);
      box.innerHTML = others.length ? others.map((p) => {
        const status = p.match ? `${MODES[p.match.mode]?.name || 'In a match'} on ${MAPS[p.match.map]?.name || ''}` : p.status === 'menu' ? 'In the menu' : p.status;
        return `<div class="friend"><div><b>${esc(p.name)}</b><span>${esc(status || '')}</span></div><span class="spacer"></span>${rankBadge(p.elo)}
          ${p.match && !p.match.ranked ? `<button class="btn small" data-watch="${esc(p.id)}">Watch</button>` : ''}
          ${inParty.has(p.id) ? '<span class="m-tagline">In your party</span>' : `<button class="btn small primary" data-inv="${esc(p.id)}">Invite</button>`}</div>`;
      }).join('') : '<p class="m-empty">Nobody else is online right now. Friends appear here when they open the game while signed in.</p>';
      box.querySelectorAll('[data-inv]').forEach((b) => { b.onclick = () => { const p = others.find((x) => x.id === b.dataset.inv); if (p) party.invite(p); b.disabled = true; b.textContent = 'Invited'; }; });
      box.querySelectorAll('[data-watch]').forEach((b) => { b.onclick = () => { const p = others.find((x) => x.id === b.dataset.watch); m.remove(); if (p?.match) this.app.spectate(p.match); }; });
    };
    const timer = setInterval(draw, 3000);
    draw();
  }

  partyInvite(inv) {
    const party = this.app.party;
    this.toast(`${inv.name} invited you to their party`, 'good', [
      { label: 'Join', primary: true, fn: () => party.accept(inv).then(() => this.tab && this.renderParty()) },
      { label: 'Decline', fn: () => party.decline(inv) },
    ], 15000);
  }

  // Shown to party members while the leader searches.
  partySearching(d) {
    this.searchModal?.remove();
    this.searchModal = null;
    if (!d) return;
    const m = this.modal(`<div class="m-search"><div class="queue-pulse"></div><h2 class="m-h2">Searching for ${esc(MODES[d.mode]?.name || d.mode)}</h2>
      <p class="m-sub">Your party leader started the search. You'll join the match automatically.</p>
      <button class="btn small" data-leave>Leave party</button></div>`);
    m.dataset.locked = '1';
    m.querySelector('[data-leave]').onclick = () => { this.app.party.leave(); m.remove(); };
    this.searchModal = m;
  }

  partyChat(d) { this.toast(`${d.name}: ${censor(String(d.text ?? ''))}`); }

  // ───────────────────────── play ─────────────────────────
  renderPlay(el) {
    const app = this.app, online = !!app.user, src = this.source;
    const party = app.party, inParty = !!party?.inParty, isLeader = !inParty || party.isLeader;
    const active = online ? app.activeMatch() : null;
    const am = active && MODES[active.payload.mode];
    const o = this.offline;
    const row = (id, sel, attr) => {
      const m = MODES[id];
      return `<button class="mrow ${sel ? 'sel' : ''} ${m.ranked ? 'ranked' : ''}" ${attr}="${id}">
        <span class="mrow-name">${esc(m.name)}</span><span class="mrow-goal">${esc(goalText(m))}</span><span class="mrow-size">${SIZE_LABEL(m)}</span></button>`;
    };
    const quad = (id) => {
      const m = MODES[id];
      return `<button class="mquad ${id === this.onlineMode ? 'sel' : ''} ${m.ranked ? 'ranked' : ''}" data-mode="${id}">
        <span class="mquad-size">${SIZE_LABEL(m)}</span><span class="mquad-name">${esc(m.name)}</span><span class="mquad-goal">${esc(goalText(m))}</span></button>`;
    };
    const moreSel = !QUAD_MODES.includes(this.onlineMode), showMore = this.allModes || moreSel;
    el.innerHTML = `
      ${active ? `<div class="m-rejoin"><div><b>Your match is still running</b><span>${esc(am?.name || active.payload.mode)} on ${esc(MAPS[active.payload.map]?.name || active.payload.map)}. A bot is playing for you.</span></div>
        <button class="btn small primary" id="rejoin">Reconnect</button><button class="btn small ghost" id="rejoin-x">Dismiss</button></div>` : ''}
      <div class="m-switch" role="tablist"><button data-src="online" class="${src === 'online' ? 'on' : ''}">Online</button><button data-src="offline" class="${src === 'offline' ? 'on' : ''}">Versus bots</button></div>
      ${src === 'online' ? `
        ${online ? '' : `<div class="m-note">Online play needs an account so your rank and stats can be saved. <button class="btn small primary" id="signin">Sign in</button></div>`}
        <div class="mquads ${online ? '' : 'off'}">${QUAD_MODES.map((id) => quad(id)).join('')}</div>
        <button class="m-allmodes ${online ? '' : 'off'} ${moreSel ? 'has-sel' : ''}" id="all-modes" aria-expanded="${showMore}">All modes<span>${showMore ? '−' : '+'}</span></button>
        ${showMore ? `<div class="mrows ${online ? '' : 'off'}">${MORE_MODES.map((id) => row(id, id === this.onlineMode, 'data-mode')).join('')}
          <button class="mrow ${this.onlineMode === 'custom' ? 'sel' : ''}" data-mode="custom"><span class="mrow-name">Custom lobby</span><span class="mrow-goal">Your rules, invite code, bots optional</span><span class="mrow-size">Any</span></button></div>` : ''}
        ${online ? `<div class="m-join"><input type="text" id="join-code" maxlength="5" placeholder="Lobby code" aria-label="Lobby code"><button class="btn small" id="join-btn">Join</button><button class="btn small ghost" id="browse-btn">Browse open lobbies</button></div><div id="lobby-list"></div>` : ''}
      ` : `
        <button class="m-train" id="train"><b>Training Range</b><span>Aim drills, moving targets, spray practice and grenade line-ups</span></button>
        <div class="mrows">${OFFLINE_MODES.map((id) => row(id, id === o.mode, 'data-omode')).join('')}</div>
        <div class="m-label">Map</div>
        <div class="map-strip">${PLAY_MAPS.map((m) => `<button class="map-tile ${o.map === m.id ? 'sel' : ''} ${needsSites(MODES[o.mode]) && !m.sites ? 'off' : ''}" data-map="${m.id}" title="${esc(m.desc)}"><img src="${mapPreview(m.id)}" alt=""><span>${esc(m.name)}</span></button>`).join('')}</div>
        <div class="m-label">Bots</div>
        <div class="seg" id="off-diff">${Object.keys(BOT_LEVELS).map((k) => `<button data-d="${k}" class="${o.botLevel === k ? 'sel' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      `}
      <div class="m-deploy">
        <div class="m-deploy-info" id="deploy-info"></div>
        <button class="deploy-btn" id="deploy" ${src === 'online' && (!online || !isLeader) ? 'disabled' : ''}></button>
      </div>`;
    const $ = (s) => el.querySelector(s);
    el.querySelectorAll('[data-src]').forEach((b) => { b.onclick = () => { this.source = b.dataset.src; if (this.source === 'offline') { this.scene?.show(o.map); this.footMap(); } this.renderPlay(el); }; });
    if (active) {
      $('#rejoin').onclick = () => app.rejoinMatch();
      $('#rejoin-x').onclick = () => { app.clearActiveMatch(); this.renderPlay(el); };
    }
    const info = $('#deploy-info'), btn = $('#deploy');
    if (src === 'online') {
      $('#signin')?.addEventListener('click', () => this.showAuth());
      el.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { this.onlineMode = b.dataset.mode; this.renderPlay(el); }; });
      $('#all-modes').onclick = () => {
        // Collapsing while a mode from the list is picked falls back to the first quadrant.
        if (showMore && moreSel) this.onlineMode = QUAD_MODES[0];
        this.allModes = !showMore; this.renderPlay(el);
      };
      if (online) {
        $('#join-btn').onclick = () => { const c = $('#join-code').value.trim().toUpperCase(); if (c.length === 5) this.joinLobby(c); else this.toast('Lobby codes are 5 characters', 'bad'); };
        $('#join-code').onkeydown = (e) => { if (e.key === 'Enter') $('#join-btn').click(); };
        $('#browse-btn').onclick = () => this.browseLobbies($('#lobby-list'));
      }
      const custom = this.onlineMode === 'custom', m = MODES[this.onlineMode];
      const mt = app.maintenance && !app.isAdmin ? `<span class="m-party-line">${esc(app.maintenance.message || 'Online play is paused for maintenance.')}</span>` : '';
      info.innerHTML = mt + (custom ? '<b>Custom lobby</b><span>Pick the mode and map, share the code, start when ready.</span>'
        : `<b>${esc(m.name)}</b><span>${esc(m.desc)}</span>${inParty ? `<span class="m-party-line">${isLeader ? `Your party of ${party.size} queues together${party.size > partyLimit(m.id) ? ' — too many players for this mode' : ''}.` : 'Only your party leader can start a search.'}</span>` : ''}`);
      btn.textContent = custom ? 'Create lobby' : 'Find match';
      btn.onclick = () => (custom ? this.createLobby() : this.startQueue(this.onlineMode));
    } else {
      $('#train').onclick = () => app.startOffline({ mode: 'training', map: 'range', botLevel: 'easy' });
      el.querySelectorAll('[data-omode]').forEach((b) => { b.onclick = () => { o.mode = b.dataset.omode; if (!MAPS[o.map].sites && needsSites(MODES[o.mode])) { o.map = 'dustline'; this.scene?.show(o.map); this.footMap(); } this.renderPlay(el); }; });
      el.querySelectorAll('[data-map]').forEach((b) => { b.onclick = () => {
        if (needsSites(MODES[o.mode]) && !MAPS[b.dataset.map].sites) { this.toast(`${MODES[o.mode].name} needs one of the large maps with sites.`, 'bad'); return; }
        o.map = b.dataset.map; this.scene?.show(o.map); this.footMap(); this.renderPlay(el);
      }; });
      el.querySelectorAll('#off-diff button').forEach((b) => { b.onclick = () => { o.botLevel = b.dataset.d; this.renderPlay(el); }; });
      const m = MODES[o.mode], map = MAPS[o.map];
      const n = SOLO_KINDS.has(m.kind) ? 5 : m.teamSize * 2 - 1;
      info.innerHTML = `<b>${esc(m.name)} on ${esc(map.name)}</b><span>${n} ${o.botLevel} bot${n > 1 ? 's' : ''}. ${esc(map.desc)}</span>`;
      btn.textContent = 'Deploy';
      btn.onclick = () => app.startOffline({ ...o });
    }
  }

  // ───────────────────────── queue ─────────────────────────
  async startQueue(mode) {
    if (this.blockedByMaintenance()) return;
    const m = MODES[mode], party = this.app.party;
    if (party?.inParty) {
      if (!party.isLeader) return this.toast('Only your party leader can start a search', 'bad');
      if (party.size > partyLimit(mode)) return this.toast(`${m.name} allows parties of up to ${partyLimit(mode)}`, 'bad');
    }
    const modal = this.modal(`<div class="m-search"><div class="queue-pulse"></div><h2 class="m-h2">${esc(m.name)}</h2>
      <p class="m-big" id="q-status">Connecting…</p><p class="m-sub" id="q-sub"></p>
      <div class="row" style="justify-content:center"><button class="btn small hidden" id="q-force">Start now with bots</button><button class="btn small danger" id="q-cancel">Cancel</button></div></div>`);
    modal.dataset.locked = '1';
    const mm = new Matchmaker(this.app, mode, {
      onUpdate: (s) => {
        const t = Math.floor(s.waited);
        modal.querySelector('#q-status').textContent = `Searching ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
        modal.querySelector('#q-sub').textContent = `${s.count} of ${s.need} players found${m.ranked ? '' : s.count >= 2 ? '. Bots fill the empty slots at 0:20.' : '. Waiting for at least one more player.'}`;
        modal.querySelector('#q-force').classList.toggle('hidden', !s.canForce);
      },
      onMatch: (payload) => { modal.remove(); this.app.startOnline(payload); },
    });
    modal.querySelector('#q-cancel').onclick = () => { mm.cancel(); modal.remove(); party?.announceCancel(); this.app.setStatus('menu'); };
    modal.querySelector('#q-force').onclick = () => mm.forceStart();
    try { await mm.start(); this.app.setStatus('queue'); party?.announceQueue(mode); }
    catch (e) { modal.remove(); this.toast(e.message, 'bad'); }
  }

  // ───────────────────────── lobbies ─────────────────────────
  async createLobby() { await this.openLobby(Lobby.newCode(), true); }
  async joinLobby(code) { await this.openLobby(code, false); }

  async openLobby(code, isHost) {
    if (this.blockedByMaintenance()) return;
    if (this.tab === null || !this.root.querySelector('.m-shell')) this.showMenu('play');
    const lobby = new Lobby(this.app, code, isHost, {
      onChange: () => this.renderLobby(lobby),
      onStart: (payload) => { lobby.leave(); this.lobby = null; this.app.startOnline(payload); },
      onClosed: (msg) => { lobby.leave(); this.lobby = null; this.toast(msg, 'bad'); this.showMenu('play'); },
    });
    const el = this.root.querySelector('#tab');
    this.root.querySelector('.m-shell').classList.add('wide');
    el.innerHTML = `<p class="m-big">Joining lobby ${esc(code)}…</p>`;
    try {
      await lobby.connect();
      this.app.setStatus('lobby');
      this.lobby = lobby;
      if (isHost && this.app.party?.inParty && this.app.party.isLeader) this.app.party.announceLobby(code);
      this.renderLobby(lobby);
      if (!isHost) setTimeout(() => { if (!lobby.cfg.hostId && !lobby.started) { lobby.leave(); this.lobby = null; this.toast('No lobby with that code', 'bad'); this.showMenu('play'); } }, 4000);
    } catch (e) { this.toast(e.message, 'bad'); this.showMenu('play'); }
  }

  renderLobby(lobby) {
    if (!lobby.room || lobby.started || this.lobby !== lobby) return;
    const el = this.root.querySelector('#tab');
    if (!el) return;
    const me = this.app.me(), cfg = lobby.cfg, m = MODES[cfg.mode], host = lobby.isHost;
    const members = lobby.members();
    const row = (x) => `<div class="l-player"><span>${esc(x.name)}</span>${x.host ? '<span class="m-tagline">Host</span>' : ''}<span class="spacer"></span>${rankBadge(x.elo)}${host && x.id !== me.id ? ` <button class="btn small ghost" data-kick="${x.id}" title="Remove">×</button>` : ''}</div>`;
    let teams;
    if (SOLO_KINDS.has(m.kind)) teams = `<div class="l-team"><div class="l-head"><b>Players</b><span>${members.length}</span></div>${members.map(row).join('')}</div>`;
    else {
      const col = (t, label) => `<div class="l-team ${t ? 'ct' : 't'}"><div class="l-head"><b>${label}</b><button class="btn small" data-team="${t}">Join</button></div>${members.filter((x) => x.team === t).map(row).join('') || '<p class="m-empty">Empty — bots fill in if enabled.</p>'}</div>`;
      const auto = members.filter((x) => x.team !== 0 && x.team !== 1);
      teams = col(0, SIDED_KINDS.has(m.kind) ? 'Attackers' : 'Team 1') + col(1, SIDED_KINDS.has(m.kind) ? 'Defenders' : 'Team 2') +
        (auto.length ? `<div class="l-team wide"><div class="l-head"><b>Auto-assign</b><button class="btn small" data-team="-1">Join</button></div>${auto.map(row).join('')}</div>` : '');
    }
    const maps = needsSites(m) ? PLAY_MAPS.filter((x) => x.sites) : PLAY_MAPS;
    const opt = (v, cur, label) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
    el.innerHTML = `<div class="l-top"><div><span class="m-label">Lobby code</span><div class="code-box">${esc(lobby.code)}</div></div><span class="spacer"></span>
        <button class="btn small ghost" id="lb-leave">Leave lobby</button>${host ? '<button class="deploy-btn small" id="lb-start">Start match</button>' : '<span class="m-sub">Waiting for the host to start</span>'}</div>
      <div class="l-grid"><div class="l-teams">${teams}</div>
        <div class="l-cfg">
          <label class="field"><span>Mode</span><select id="lb-mode" ${host ? '' : 'disabled'}>${OFFLINE_MODES.map((k) => opt(k, cfg.mode, MODES[k].name)).join('')}</select></label>
          <label class="field"><span>Map</span><select id="lb-map" ${host ? '' : 'disabled'}>${maps.map((x) => opt(x.id, cfg.map, `${x.name} (${x.size})`)).join('')}</select></label>
          <label class="field"><span>Bot difficulty</span><select id="lb-diff" ${host ? '' : 'disabled'}>${Object.keys(BOT_LEVELS).map((k) => opt(k, cfg.botLevel, k)).join('')}</select></label>
          <label class="m-check"><input type="checkbox" id="lb-fill" ${cfg.fillBots ? 'checked' : ''} ${host ? '' : 'disabled'}><span>Fill empty slots with bots</span></label>
          <img src="${mapPreview(cfg.map)}" class="l-map" alt="">
          <p class="m-sub">${esc(m.desc)}</p>
        </div></div>`;
    const $ = (s) => el.querySelector(s);
    if (this.scene?.mapId !== cfg.map) { this.scene?.show(cfg.map); this.footMap(); }
    $('#lb-leave').onclick = () => { lobby.leave(); this.lobby = null; this.app.setStatus('menu'); this.showMenu('play'); };
    el.querySelectorAll('[data-team]').forEach((b) => { b.onclick = () => lobby.setTeam(+b.dataset.team); });
    el.querySelectorAll('[data-kick]').forEach((b) => { b.onclick = () => lobby.room.send('kick', b.dataset.kick); });
    if (host) {
      $('#lb-mode').onchange = (e) => { const mode = e.target.value; let map = cfg.map; if (needsSites(MODES[mode]) && !MAPS[map].sites) map = 'dustline'; lobby.setCfg({ mode, map }); };
      $('#lb-map').onchange = (e) => lobby.setCfg({ map: e.target.value });
      $('#lb-diff').onchange = (e) => lobby.setCfg({ botLevel: e.target.value });
      $('#lb-fill').onchange = (e) => lobby.setCfg({ fillBots: e.target.checked });
      $('#lb-start').onclick = () => {
        const humans = lobby.members().length;
        if (!cfg.fillBots && humans < 2) { this.toast('Add a second player or turn on bot fill', 'bad'); return; }
        if (!SOLO_KINDS.has(m.kind) && humans > m.teamSize * 2) { this.toast(`Too many players for ${m.name}`, 'bad'); return; }
        lobby.start();
      };
    }
  }

  async browseLobbies(el) {
    el.innerHTML = '<p class="m-sub">Looking for open lobbies…</p>';
    try {
      const list = await listLobbies(this.app);
      el.innerHTML = list.length ? `<div class="lobby-list">${list.map((l) => `<button class="lobby-item" data-code="${esc(l.code)}"><b>${esc(l.name)}</b><span>${esc(MODES[l.mode]?.name || l.mode)} on ${esc(MAPS[l.map]?.name || l.map)}</span><span class="spacer"></span><span>${l.count} in lobby</span><kbd>${esc(l.code)}</kbd></button>`).join('')}</div>` : '<p class="m-empty">No open lobbies. Create one from the list above.</p>';
      el.querySelectorAll('[data-code]').forEach((r) => { r.onclick = () => this.joinLobby(r.dataset.code); });
    } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  // ───────────────────────── operators ─────────────────────────
  renderOperators(el) {
    const app = this.app;
    if (!this.editChar) this.editChar = { ...app.char };
    const c = this.editChar, equipped = app.char.preset;
    el.innerHTML = `<div class="op-list">${OPERATORS.map((o) => `<button class="op-row ${c.preset === o.id ? 'sel' : ''}" data-op="${o.id}">
        <span class="op-name">${esc(o.name.replace('J.P. ', ''))}${equipped === o.id ? '<i>Equipped</i>' : ''}</span><span class="op-role">${esc(o.role)} · ${esc(PERKS[o.char.perk].name)}</span></button>`).join('')}
        <button class="op-row ${c.preset === 'custom' ? 'sel' : ''}" data-op="custom"><span class="op-name">Custom${equipped === 'custom' ? '<i>Equipped</i>' : ''}</span><span class="op-role">Build your own, any perk</span></button></div>
      <div class="op-bio" id="op-bio"></div>
      <div class="controls" id="cc"></div>`;
    const op = OPERATORS.find((o) => o.id === c.preset);
    el.querySelector('#op-bio').innerHTML = op ? `<p>${esc(op.bio)}</p><p class="op-perk"><b>${esc(PERKS[op.char.perk].name)}</b> ${esc(PERKS[op.char.perk].desc)}</p>` : '';
    this.scene?.setChar(c, 'ar7');
    this.scene?.faceFront();
    el.querySelectorAll('[data-op]').forEach((d) => { d.onclick = () => {
      const o = OPERATORS.find((x) => x.id === d.dataset.op);
      const keep = { outfit: this.editChar.outfit, skins: this.editChar.skins, card: this.editChar.card, killfx: this.editChar.killfx, emotes: this.editChar.emotes };
      this.editChar = o ? { ...o.char, ...keep, preset: o.id } : { ...this.editChar, preset: 'custom' };
      this.renderOperators(el);
    }; });
    this.renderCreatorControls(el.querySelector('#cc'));
  }

  renderCreatorControls(cc) {
    const c = this.editChar;
    const chips = (key, list, label) => `<div class="field"><span>${label}</span><div class="chips">${list.map((v) => `<button class="chip ${c[key] === v ? 'sel' : ''}" data-k="${key}" data-v="${v}">${v}</button>`).join('')}</div></div>`;
    const swatches = (key, list, label) => `<div class="field"><span>${label}</span><div class="swatches">${list.map((v) => `<button class="swatch ${c[key] === v ? 'sel' : ''}" style="background:${v}" data-k="${key}" data-v="${v}" aria-label="${v}"></button>`).join('')}<input type="color" value="${c[key]}" data-color="${key}" aria-label="Custom colour"></div></div>`;
    const perk = PERKS[c.perk] || PERKS.speedloader;
    const perkBlock = c.preset === 'custom' || !c.preset
      ? `<div class="field"><span>Perk</span><div class="chips">${Object.entries(PERKS).map(([k, pk]) => `<button class="chip ${c.perk === k ? 'sel' : ''}" data-perk="${k}" title="${esc(pk.desc)}">${pk.name}</button>`).join('')}</div><span class="m-sub" id="cc-perk-desc">${esc(perk.desc)}</span></div>`
      : '';
    cc.innerHTML = `
      <label class="field"><span>Callsign</span><input type="text" id="cc-name" maxlength="18" value="${esc(c.name)}"></label>
      ${perkBlock}
      ${swatches('skin', CHAR_OPTIONS.skin, 'Skin tone')}
      ${chips('hair', CHAR_OPTIONS.hair, 'Hair')}
      ${swatches('hairColor', CHAR_OPTIONS.hairColor, 'Hair colour')}
      ${chips('face', CHAR_OPTIONS.face, 'Face')}
      ${chips('headgear', CHAR_OPTIONS.headgear, 'Headgear')}
      ${chips('build', CHAR_OPTIONS.build, 'Build')}
      <label class="field"><span>Height</span><input type="range" min="0.92" max="1.08" step="0.01" value="${c.height}" id="cc-h"></label>
      ${swatches('top', CHAR_OPTIONS.cloth, 'Shirt')}
      ${chips('vest', CHAR_OPTIONS.vest, 'Vest')}
      ${swatches('vestColor', CHAR_OPTIONS.cloth, 'Vest and helmet')}
      ${swatches('pants', CHAR_OPTIONS.cloth, 'Trousers')}
      ${swatches('gloves', ['#1d1d1f', '#3b3328', '#5a5040', '#6b6f75', '#2b3a2b'], 'Gloves')}
      ${swatches('boots', ['#2a221b', '#1a1a1a', '#5a4632', '#6f6448'], 'Boots')}
      <div class="m-sticky"><button class="deploy-btn small" id="cc-save">Equip operator</button><button class="btn small ghost" id="cc-rand">Randomise</button></div>`;
    const update = () => { this.scene?.setChar(this.editChar, 'ar7'); };
    cc.querySelectorAll('[data-k]').forEach((e) => { e.onclick = () => {
      c[e.dataset.k] = e.dataset.v; c.preset = 'custom';
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
      this.renderOperators(this.root.querySelector('#tab'));
    };
    cc.querySelector('#cc-save').onclick = async () => {
      const saved = { ...sanitizeChar(c), preset: c.preset || 'custom' };
      await this.app.saveChar(saved);
      this.toast('Operator equipped', 'good');
      this.editChar = { ...saved };
      this.showMenu('operators');
    };
  }

  // ───────────────────────── armory ─────────────────────────
  renderArmory(el) {
    const app = this.app, kind = this.armoryKind;
    const c = { ...app.char, skins: { ...(app.char.skins || {}) }, emotes: [...(app.char.emotes || [])] };
    const defs = KINDS[kind].defs;
    const total = Object.values(KINDS).reduce((n, k) => n + Object.keys(k.defs).length, 0);
    const have = Object.entries(KINDS).reduce((n, [k, d]) => n + Object.keys(d.defs).filter((id) => this.owned(k, id)).length, 0);
    const wid = this.armoryWeapon;
    const current = kind === 'finish' ? c.skins[wid] || 'factory' : kind === 'outfit' ? c.outfit || 'standard' : kind === 'card' ? c.card : kind === 'effect' ? c.killfx : null;
    const card = (id, d) => {
      const own = this.owned(kind, id), r = RARITIES[d.rarity], sw = itemSwatch(kind, id);
      const eq = kind === 'emote' ? c.emotes.includes(id) : id === current;
      const ss = d.season ? seasonById(d.season) : null;
      const lockText = d.milestone ? d.milestone.label : ss ? (d.rankedReward ? `Season ${ss.num} ranked reward` : `Season ${ss.num} reward track`) + (Date.parse(ss.start) > Date.now() ? ` · from ${fmtDate(ss.start)}` : '') : 'Earned from match drops';
      return `<button class="item-card ${kind === 'card' ? 'wide' : ''} ${eq ? 'equipped' : ''} ${own ? '' : 'locked'}" data-item="${id}" style="--rc:${r.color}" title="${esc(own ? d.name : lockText)}">
        <span class="sw" style="background:${sw.bg}">${sw.glyph}</span><b>${esc(d.name)}</b><em>${own ? r.name : d.milestone ? 'Milestone' : ss ? `Season ${ss.num}` : 'Locked'}</em>
        ${kind === 'emote' && eq ? `<i class="slot-tag">${WHEEL[c.emotes.indexOf(id)]}</i>` : ''}</button>`;
    };
    const classes = Object.keys(CLASS_NAMES);
    el.innerHTML = `<div class="m-switch scroll">${ARMORY_KINDS.map(([k, l]) => `<button data-kind="${k}" class="${k === kind ? 'on' : ''}">${l}</button>`).join('')}</div>
      <p class="m-sub">${have} of ${total} collected. Wins always drop an item; other matches drop one half the time. Milestone items unlock as you play.</p>
      ${kind === 'finish' ? `<label class="field"><span>Weapon</span><select id="ar-w">${classes.map((t) => `<optgroup label="${CLASS_NAMES[t]}">${Object.values(WEAPONS).filter((w) => w.type === t).map((w) => `<option value="${w.id}" ${w.id === wid ? 'selected' : ''}>${esc(w.name)} — ${esc(defs[c.skins[w.id] || 'factory']?.name || 'Factory')}</option>`).join('')}</optgroup>`).join('')}</select></label>` : ''}
      ${kind === 'emote' ? `<div class="emote-slots">${WHEEL.map((dir, i) => `<button class="eslot ${i === this.emoteSlot ? 'sel' : ''}" data-slot="${i}"><span>${dir}</span><b>${esc(defs[c.emotes[i]]?.name || '—')}</b></button>`).join('')}</div>
        <p class="m-sub">Pick a wheel slot, then an emote to put there. Hold G in a match to use the wheel. Click any emote to preview it.</p>` : ''}
      ${kind === 'effect' ? '<p class="m-sub">Click an effect to see it play beside your operator.</p>' : ''}
      ${kind === 'card' ? `<div class="card-preview" style="background-image:url(${cardImage(c.card || 'standard')})"><span>${esc(app.me().name)}</span></div>` : ''}
      <div class="item-grid ${kind === 'card' ? 'cards' : ''}">${Object.entries(defs).map(([id, d]) => card(id, d)).join('')}</div>
      ${kind === 'finish' ? `<button class="btn small ghost" id="apply-all">Use ${esc(defs[current]?.name || 'Factory')} on every weapon</button>` : ''}`;
    const focus = kind === 'finish' ? 'weapon' : kind === 'card' ? 'play' : 'operator';
    this.scene?.setFocus(focus);
    this.scene?.setChar(c, kind === 'finish' ? wid : 'ar7');
    this.scene?.faceFront();
    const save = async (next) => { await app.saveChar({ ...next, preset: app.char.preset }); this.renderArmory(el); this.refreshMeChip(); };
    el.querySelectorAll('[data-kind]').forEach((b) => { b.onclick = () => { this.armoryKind = b.dataset.kind; this.renderArmory(el); }; });
    el.querySelector('#ar-w')?.addEventListener('change', (e) => { this.armoryWeapon = e.target.value; this.renderArmory(el); });
    el.querySelectorAll('[data-slot]').forEach((b) => { b.onclick = () => { this.emoteSlot = +b.dataset.slot; this.renderArmory(el); }; });
    el.querySelectorAll('[data-item]').forEach((b) => { b.onclick = () => {
      const id = b.dataset.item, own = this.owned(kind, id), d = defs[id];
      // Previews work for everything; equipping needs the item.
      if (kind === 'effect') this.scene?.killFx(id);
      if (kind === 'emote') this.scene?.emote(id);
      if (kind === 'finish' && !own) { const prev = { ...c, skins: { ...c.skins, [wid]: id } }; this.scene?.setChar(prev, wid); this.scene?.faceFront(); }
      if (kind === 'outfit' && !own) { this.scene?.setChar({ ...c, outfit: id }, 'ar7'); this.scene?.faceFront(); }
      if (!own) { const ss = d.season ? seasonById(d.season) : null; this.toast(`${d.name} is locked. ${d.milestone ? d.milestone.label + ' to unlock it.' : ss ? `It's a Season ${ss.num} (${ss.name}) ${d.rankedReward ? 'ranked reward' : 'reward-track item'}${Date.parse(ss.start) > Date.now() ? `, available from ${fmtDate(ss.start)}` : ''}.` : 'Win matches to earn drops.'}`, 'bad'); return; }
      if (kind === 'finish') { if (id === 'factory') delete c.skins[wid]; else c.skins[wid] = id; }
      else if (kind === 'outfit') c.outfit = id;
      else if (kind === 'card') c.card = id;
      else if (kind === 'effect') c.killfx = id;
      else if (kind === 'emote') {
        const at = c.emotes.indexOf(id);
        if (at >= 0) c.emotes[at] = c.emotes[this.emoteSlot];
        c.emotes[this.emoteSlot] = id;
        this.emoteSlot = (this.emoteSlot + 1) % 4;
      }
      save(c);
    }; });
    el.querySelector('#apply-all')?.addEventListener('click', () => {
      for (const w of Object.keys(WEAPONS)) { if (current === 'factory') delete c.skins[w]; else c.skins[w] = current; }
      save(c);
      this.toast(`${defs[current].name} is now on every weapon`, 'good');
    });
  }

  refreshMeChip() {
    const chip = this.root.querySelector('#me-chip');
    if (chip) chip.style.backgroundImage = `linear-gradient(90deg, rgba(14,18,13,.92), rgba(14,18,13,.5)), url(${cardImage(this.app.char.card || 'standard', 360, 90)})`;
  }

  // ───────────────────────── stats ─────────────────────────
  async renderStats(el, mapId = null) {
    const app = this.app, p = app.profile;
    el.innerHTML = '<p class="m-sub">Loading your stats…</p>';
    let rows = [];
    if (p && app.api) { try { rows = await app.api.statsHistory(app.user.id, 100); } catch (e) { console.warn(e); } }
    if (!el.isConnected) return;
    const local = app.localStats();
    // Matches: database history when signed in, this browser's record otherwise.
    const matches = rows.length ? rows.map((r) => ({ mode: r.mode, map: r.map, result: r.result, online: r.online, k: r.kills, d: r.deaths, hs: r.headshots, at: new Date(r.created_at).getTime(), details: r.details }))
      : local.matches;
    // Weapon / accuracy / rivals / death spots: from stored details if the database has them, else this browser.
    const withDetails = matches.filter((m) => m.details);
    const agg = withDetails.length ? this.aggregateDetails(withDetails) : { weapons: local.weapons, shots: local.shots, hits: local.hits, h2h: local.h2h, deaths: local.deaths };
    const totK = p ? p.kills : matches.reduce((a, m) => a + m.k, 0), totD = p ? p.deaths : matches.reduce((a, m) => a + m.d, 0);
    const totHS = p ? p.headshots : matches.reduce((a, m) => a + m.hs, 0);
    const wins = matches.filter((m) => m.result === 'win').length;
    const lvl = levelFor(p?.xp || 0);
    // Recent form: K/D per match, oldest → newest.
    const recent = matches.slice(0, 30).reverse();
    const spark = this.sparkline(recent.map((m) => (m.d ? m.k / m.d : m.k)), recent.map((m) => m.result));
    const byMode = this.groupBy(matches, 'mode'), byMap = this.groupBy(matches, 'map');
    const bars = (groups, names) => Object.entries(groups).sort((a, b) => b[1].n - a[1].n).map(([k, g]) => `<div class="bar-row"><span>${esc(names[k]?.name || k)}</span>
      <div class="bar"><i class="w" style="width:${pct(g.w, g.n)}%"></i><i class="l" style="width:${pct(g.l, g.n)}%"></i></div><b>${g.w}–${g.l}</b></div>`).join('') || '<p class="m-empty">No matches yet.</p>';
    const weapons = Object.entries(agg.weapons || {}).filter(([, w]) => w.k || w.s).sort((a, b) => b[1].k - a[1].k).slice(0, 10);
    const rivals = Object.entries(agg.h2h || {}).filter(([id]) => id !== 'bot').sort((a, b) => (b[1].k + b[1].d) - (a[1].k + a[1].d)).slice(0, 8);
    const bots = agg.h2h?.bot;
    const deathMaps = Object.keys(agg.deaths || {}).filter((k) => MAPS[k] && agg.deaths[k].length);
    const heatMap = mapId && deathMaps.includes(mapId) ? mapId : deathMaps[0];
    el.innerHTML = `<div class="st-head">
        <div><h2 class="m-h1">${esc(app.me().name)}</h2><p class="m-sub">${p ? `Joined ${new Date(p.created_at).toLocaleDateString()} · level ${lvl.level}` : 'Playing as a guest. Stats below are from this browser only.'}</p></div>
        <span class="spacer"></span>${p ? rankBadge(p.elo, true) : ''}
      </div>
      ${p ? `<div class="xp"><div style="width:${(lvl.into / lvl.need) * 100}%"></div></div><p class="m-sub">${lvl.into} of ${lvl.need} XP to level ${lvl.level + 1}</p>` : ''}
      <div class="st-nums">
        ${p ? `<div><b>${p.elo}</b><span>Rating, peak ${p.peak_elo}</span></div><div><b>${p.ranked_wins}–${p.ranked_losses}</b><span>Ranked record</span></div>` : ''}
        <div><b>${kd(totK, totD)}</b><span>Kills per death</span></div>
        <div><b>${pct(totHS, totK)}%</b><span>Headshot kills</span></div>
        <div><b>${pct(wins, matches.length)}%</b><span>Wins, last ${matches.length}</span></div>
        <div><b>${agg.shots ? pct(agg.hits, agg.shots) + '%' : '—'}</b><span>Shots that hit</span></div>
      </div>
      <div class="st-grid">
        <section><h3 class="m-h3">Recent form</h3>${recent.length ? spark : '<p class="m-empty">Play a few matches to see your form.</p>'}<p class="m-sub">Kills per death in your last ${recent.length} matches. Dots show wins and losses.</p></section>
        <section><h3 class="m-h3">By mode</h3>${bars(byMode, MODES)}</section>
        <section><h3 class="m-h3">By map</h3>${bars(byMap, MAPS)}</section>
        <section class="span2"><h3 class="m-h3">Weapons</h3>${weapons.length ? `<table class="tbl"><tr><th>Weapon</th><th>Class</th><th class="num">Kills</th><th class="num">Headshots</th><th class="num">Accuracy</th></tr>
          ${weapons.map(([id, w]) => `<tr><td>${esc(itemInfo(id)?.name || id)}</td><td class="muted">${esc(CLASS_NAMES[WEAPONS[id]?.type] || 'Utility')}</td><td class="num">${w.k}</td><td class="num">${pct(w.hs, w.k)}%</td><td class="num">${w.s ? pct(w.h, w.s) + '%' : '—'}</td></tr>`).join('')}</table>` : '<p class="m-empty">Weapon stats appear after your first match.</p>'}</section>
        <section><h3 class="m-h3">Rivals</h3>${rivals.length || bots ? `<div class="rivals">${rivals.map(([, r]) => `<div><span>${esc(r.n)}</span><b class="${r.k >= r.d ? 'up' : 'down'}">${r.k}–${r.d}</b></div>`).join('')}${bots ? `<div class="muted"><span>Bots</span><b>${bots.k}–${bots.d}</b></div>` : ''}</div><p class="m-sub">Your kills against them, then theirs against you.</p>` : '<p class="m-empty">Head-to-head records appear once you play other people.</p>'}</section>
        <section class="span3"><h3 class="m-h3">Where you die</h3>${heatMap ? `<div class="heat-maps">${deathMaps.map((k) => `<button class="chip ${k === heatMap ? 'sel' : ''}" data-heat="${k}">${esc(MAPS[k].name)}</button>`).join('')}</div><canvas class="heat" id="heat"></canvas>` : '<p class="m-empty">Death locations show up here after a few matches.</p>'}</section>
      </div>
      <div class="st-search"><input type="text" id="ps" placeholder="Find a player by name" aria-label="Find a player"><button class="btn small" id="psb">Search</button><span class="spacer"></span>
        ${p ? '<button class="btn small danger" id="logout">Sign out</button>' : '<button class="btn small primary" id="signin">Sign in to save stats online</button>'}</div>
      <div id="psr"></div>`;
    if (heatMap) this.drawHeat(el.querySelector('#heat'), heatMap, agg.deaths[heatMap]);
    el.querySelectorAll('[data-heat]').forEach((b) => { b.onclick = () => this.renderStats(el, b.dataset.heat); });
    const search = async () => {
      const q = el.querySelector('#ps').value.trim();
      if (!q || !app.api) return;
      try {
        const res = await app.api.searchPlayers(q);
        el.querySelector('#psr').innerHTML = res.length ? `<table class="tbl">${res.map((r) => `<tr class="clickable" data-id="${r.id}"><td><b>${esc(r.username)}</b></td><td>${rankBadge(r.elo)}</td><td class="num">${r.elo}</td><td class="num">Level ${levelFor(r.xp).level}</td><td class="num">${r.matches} matches</td></tr>`).join('')}</table>` : '<p class="m-empty">No players with that name.</p>';
        el.querySelectorAll('#psr [data-id]').forEach((r) => { r.onclick = () => this.profileModal(r.dataset.id); });
      } catch (e) { this.toast(e.message, 'bad'); }
    };
    el.querySelector('#psb').onclick = search;
    el.querySelector('#ps').onkeydown = (e) => { if (e.key === 'Enter') search(); };
    el.querySelector('#logout')?.addEventListener('click', () => app.signOut());
    el.querySelector('#signin')?.addEventListener('click', () => this.showAuth());
  }

  aggregateDetails(list) {
    const out = { weapons: {}, shots: 0, hits: 0, h2h: {}, deaths: {} };
    for (const m of list) {
      const d = m.details || {};
      out.shots += d.shots || 0; out.hits += d.hits || 0;
      for (const [w, v] of Object.entries(d.weapons || {})) { const a = (out.weapons[w] ||= { k: 0, s: 0, h: 0, hs: 0 }); a.k += v.k || 0; a.s += v.s || 0; a.h += v.h || 0; a.hs += v.hs || 0; }
      for (const [id, v] of Object.entries(d.victims || {})) { const a = (out.h2h[id] ||= { n: v.n, k: 0, d: 0 }); a.k += v.c; }
      for (const [id, v] of Object.entries(d.killers || {})) { const a = (out.h2h[id] ||= { n: v.n, k: 0, d: 0 }); a.d += v.c; }
      if (d.deaths?.length) (out.deaths[m.map] ||= []).push(...d.deaths);
    }
    return out;
  }

  groupBy(list, key) {
    const g = {};
    for (const m of list) { const e = (g[m[key]] ||= { n: 0, w: 0, l: 0 }); e.n++; if (m.result === 'win') e.w++; else if (m.result === 'loss') e.l++; }
    return g;
  }

  sparkline(values, results) {
    if (!values.length) return '';
    const W = 320, H = 90, max = Math.max(2, ...values), step = values.length > 1 ? W / (values.length - 1) : 0;
    const pts = values.map((v, i) => [i * step, H - 8 - (v / max) * (H - 16)]);
    const one = H - 8 - (1 / max) * (H - 16);
    return `<svg class="spark" viewBox="-6 0 ${W + 12} ${H}" preserveAspectRatio="none" role="img" aria-label="Kills per death, recent matches">
      <line x1="0" x2="${W}" y1="${one}" y2="${one}" class="even"/>
      <polyline points="${pts.map((p) => p.join(',')).join(' ')}" class="line"/>
      ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" class="${results[i]}"/>`).join('')}</svg>`;
  }

  drawHeat(canvas, mapId, spots) {
    const w = new World(MAPS[mapId]), scale = 8;
    const base = w.radarCanvas(scale);
    canvas.width = base.width; canvas.height = base.height;
    const g = canvas.getContext('2d');
    g.globalAlpha = 0.85; g.drawImage(base, 0, 0); g.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';
    for (const [x, z] of spots) {
      const px = (x / 2) * scale, py = (z / 2) * scale, r = scale * 2.2;
      const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, 'rgba(229,72,77,.55)'); gr.addColorStop(1, 'rgba(229,72,77,0)');
      g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
  }

  async profileModal(id) {
    const m = this.modal('<p class="m-sub">Loading…</p>');
    try {
      const [p, hist, commends] = await Promise.all([this.app.api.profile(id), this.app.api.history(id, 10), this.app.api.playerCommends(id).catch(() => null)]);
      m.querySelector('.modal').innerHTML = this.profileHTML(p, hist, commends) + '<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn small" data-x>Close</button></div>';
      m.querySelector('[data-x]').onclick = () => m.remove();
    } catch (e) { m.querySelector('.modal').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  profileHTML(p, hist, commends = null) {
    const lvl = levelFor(p.xp);
    const card = p.character?.card || 'standard';
    return `<div class="pm-card" style="background-image:linear-gradient(90deg, rgba(14,18,13,.9), rgba(14,18,13,.3)), url(${cardImage(card)})"><div><h2 class="m-h1">${esc(p.username)}</h2><p class="m-sub">Level ${lvl.level}, joined ${new Date(p.created_at).toLocaleDateString()}</p></div><span class="spacer"></span>${rankBadge(p.elo, true)}</div>
      <div class="st-nums">
        <div><b>${p.elo}</b><span>Rating, peak ${p.peak_elo}</span></div>
        <div><b>${p.ranked_wins}–${p.ranked_losses}</b><span>Ranked record</span></div>
        <div><b>${kd(p.kills, p.deaths)}</b><span>Kills per death</span></div>
        <div><b>${pct(p.headshots, p.kills)}%</b><span>Headshot kills</span></div>
        <div><b>${pct(p.wins, p.matches)}%</b><span>Win rate</span></div>
        <div><b>${p.matches}</b><span>Online matches</span></div>
      </div>
      ${commends && Object.keys(commends).length ? `<div class="commends">${COMMENDS.filter(([k]) => commends[k]).map(([k, l, i]) => `<span title="${l}">${i} ${l} <b>${commends[k]}</b></span>`).join('')}</div>` : ''}
      <h3 class="m-h3">Recent matches</h3>
      ${hist.length ? `<table class="tbl"><tr><th>Result</th><th>Mode</th><th>Map</th><th class="num">K–D</th><th class="num">Rating</th><th class="num">When</th></tr>
        ${hist.map((h) => `<tr><td class="res-${h.result}">${h.result[0].toUpperCase() + h.result.slice(1)}</td><td>${esc(MODES[h.mode]?.name || h.mode)}</td><td>${esc(MAPS[h.map]?.name || h.map)}</td><td class="num">${h.kills}–${h.deaths}</td><td class="num">${h.ranked ? (h.elo_change > 0 ? '+' : '') + h.elo_change : '—'}</td><td class="num muted">${ago(h.created_at)}</td></tr>`).join('')}</table>` : '<p class="m-empty">No matches yet.</p>'}`;
  }

  // ───────────────────────── replays ─────────────────────────
  async renderReplays(el) {
    el.innerHTML = `<h2 class="m-h1">Replays</h2><p class="m-sub">Your last 8 matches are saved in this browser. Open one to rewatch it from any player's view or a free camera.</p><div id="rp-list"><p class="m-sub">Loading…</p></div>`;
    const body = el.querySelector('#rp-list');
    try {
      const { listReplays, deleteReplay } = await import('../game/replaystore.js');
      const list = await listReplays();
      if (!list.length) { body.innerHTML = '<p class="m-empty">Nothing saved yet. Finish a match and it shows up here.</p>'; return; }
      body.innerHTML = `<div class="replay-list">${list.map((r) => `<div class="replay-item">
        <span class="res res-${r.result}">${esc((r.result || '').replace(/^./, (x) => x.toUpperCase()))}</span>
        <div><b>${esc(MODES[r.mode]?.name || r.mode)}</b><span>${esc(MAPS[r.map]?.name || r.map)}, ${Math.floor(r.duration / 60)}:${String(Math.floor(r.duration % 60)).padStart(2, '0')}, ${r.kills} kills</span></div>
        <span class="spacer"></span><span class="m-sub">${ago(new Date(r.savedAt).toISOString())}</span>
        <button class="btn small primary" data-watch="${esc(r.id)}">Watch</button><button class="btn small ghost" data-del="${esc(r.id)}" title="Delete replay">×</button></div>`).join('')}</div>`;
      body.querySelectorAll('[data-watch]').forEach((b) => { b.onclick = () => this.app.watchReplay(b.dataset.watch); });
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { await deleteReplay(b.dataset.del); this.renderReplays(el); }; });
    } catch (e) { body.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  // ───────────────────────── leaderboard ─────────────────────────
  async renderLeaderboard(el, kind = 'elo') {
    const app = this.app;
    el.innerHTML = `<div class="row"><h2 class="m-h1">Leaderboard</h2><span class="spacer"></span>
      <div class="seg" id="lb-kind">${[['season', 'Season'], ['elo', 'Rating'], ['kills', 'Kills'], ['wins', 'Wins'], ['xp', 'Level']].map(([k, l]) => `<button data-k="${k}" class="${k === kind ? 'sel' : ''}">${l}</button>`).join('')}</div></div>
      <div id="lb-body"><p class="m-sub">Loading…</p></div>`;
    el.querySelectorAll('#lb-kind button').forEach((b) => { b.onclick = () => this.renderLeaderboard(el, b.dataset.k); });
    const body = el.querySelector('#lb-body');
    if (!app.api) { body.innerHTML = '<p class="m-empty">The leaderboard needs an internet connection.</p>'; return; }
    try {
      if (kind === 'season') {
        const { currentSeason } = await import('../data/seasons.js');
        const cur = currentSeason();
        const rows = cur ? await app.api.seasonLeaderboard(cur.id, 100) : [];
        body.innerHTML = rows.length ? `<p class="m-sub">Season ${cur.num}: ${esc(cur.name)}</p><table class="tbl lb"><tr><th>#</th><th>Player</th><th>Rank</th><th class="num">Rating</th><th class="num">Record</th><th class="num">Peak</th></tr>
          ${rows.map((r, i) => `<tr class="clickable ${r.id === app.user?.id ? 'me' : ''}" data-id="${r.id}"><td class="pos">${i + 1}</td><td><b>${esc(r.username)}</b></td><td>${rankBadge(r.elo)}</td><td class="num">${r.elo}</td><td class="num">${r.season_wins}–${r.season_losses}</td><td class="num">${r.season_peak}</td></tr>`).join('')}</table>`
          : '<p class="m-empty">Nobody has played ranked this season yet.</p>';
        body.querySelectorAll('[data-id]').forEach((r) => { r.onclick = () => this.profileModal(r.dataset.id); });
        return;
      }
      const rows = await app.api.leaderboard(kind);
      if (!rows.length) { body.innerHTML = '<p class="m-empty">No players yet. Play a ranked match to be first.</p>'; return; }
      body.innerHTML = `<table class="tbl lb"><tr><th>#</th><th>Player</th><th>Rank</th><th class="num">Rating</th><th class="num">Ranked</th><th class="num">Wins</th><th class="num">K/D</th><th class="num">Kills</th><th class="num">Level</th></tr>
        ${rows.map((r, i) => `<tr class="clickable ${r.id === app.user?.id ? 'me' : ''}" data-id="${r.id}"><td class="pos">${i + 1}</td><td><b>${esc(r.username)}</b></td><td>${rankBadge(r.elo)}</td><td class="num">${r.elo}</td><td class="num">${r.ranked_wins}–${r.ranked_losses}</td><td class="num">${r.wins}</td><td class="num">${kd(r.kills, r.deaths)}</td><td class="num">${r.kills}</td><td class="num">${levelFor(r.xp).level}</td></tr>`).join('')}</table>`;
      body.querySelectorAll('[data-id]').forEach((r) => { r.onclick = () => this.profileModal(r.dataset.id); });
    } catch (e) { body.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  // ───────────────────────── settings ─────────────────────────
  renderSettings(el) {
    el.innerHTML = this.settingsHTML();
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
    return `<h2 class="m-h2">Graphics</h2>
      <div class="settings-grid">
        <span>Quality preset</span>${seg('preset', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra'], ['custom', 'Custom']])}<span></span>
        <span>Render resolution</span>${range('renderScale', 0.5, 2, 0.25, (v) => Math.round(v * 100) + '%')}
        <span>Shadows</span>${seg('shadows', [['off', 'Off'], ['low', 'Low'], ['high', 'High'], ['ultra', 'Ultra']])}<span></span>
        <span>Anti-aliasing</span>${seg('aa', [['off', 'Off'], ['fxaa', 'FXAA'], ['smaa', 'SMAA'], ['msaa', 'MSAA 4x']])}<span></span>
        <span>Bloom</span>${toggle('bloom')}
        <span>Ambient occlusion (GTAO)</span>${toggle('ao')}
        <span>Frame rate cap</span>${seg('maxFps', [[0, 'Unlimited'], [60, '60'], [120, '120'], [144, '144']])}<span></span>
        <span>Show FPS</span>${toggle('showFps')}
        <span>3D menu backdrop</span>${toggle('menuScene')}
      </div>
      <h2 class="m-h2">Gameplay</h2>
      <div class="settings-grid">
        <span>Field of view</span>${range('fov', 70, 110, 1, (v) => v + '°')}
        <span>Weapon field of view</span>${range('viewmodelFov', 50, 80, 1, (v) => v + '°')}
        <span>Mouse sensitivity</span>${range('sens', 0.1, 4, 0.05, (v) => (+v).toFixed(2))}
        <span>Scoped sensitivity</span>${range('scopedSens', 0.2, 2, 0.05, (v) => (+v).toFixed(2))}
        <span>Invert mouse Y</span>${toggle('invertY')}
        <span>Kill cam</span>${toggle('killcam')}
        <span>Master volume</span>${range('volume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')}
      </div>
      <h2 class="m-h2">Controller</h2>
      <div class="settings-grid">
        <span>Look sensitivity</span>${range('padSens', 0.2, 3, 0.05, (v) => (+v).toFixed(2))}
        <span>Invert look Y</span>${toggle('padInvertY')}
        <span>Stick dead zone</span>${range('padDeadzone', 0.05, 0.4, 0.01, (v) => Math.round(v * 100) + '%')}
        <span>Vibration</span>${toggle('padVibration')}
      </div>
      <p class="m-sub small">${padHelp()}</p>
      <h2 class="m-h2">Crosshair</h2>
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
      applyPadSettings(s);
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
      const fmt = { renderScale: (v) => Math.round(v * 100) + '%', fov: (v) => v + '°', viewmodelFov: (v) => v + '°', volume: (v) => Math.round(v * 100) + '%', crosshairSize: (v) => v + 'px', crosshairGap: (v) => v + 'px', crosshairThick: (v) => v + 'px', padDeadzone: (v) => Math.round(v * 100) + '%' }[key] || ((v) => (+v).toFixed(2));
      r.oninput = () => { fmtEl.textContent = fmt(+r.value); if (key !== 'renderScale') apply({ [key]: +r.value }, false); };
      r.onchange = () => apply({ [key]: +r.value }, GRAPHICS.has(key));
    });
    root.querySelectorAll('[data-toggle]').forEach((t) => { t.onchange = () => {
      apply({ [t.dataset.toggle]: t.checked }, GRAPHICS.has(t.dataset.toggle));
      if (t.dataset.toggle === 'menuScene' && !app.game) { if (t.checked) this.stage(null, FOCUS[this.tab] || 'play'); else app.menuScene?.stop(); }
    }; });
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
