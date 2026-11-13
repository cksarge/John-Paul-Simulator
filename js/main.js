import { Engine, loadSettings } from './engine/engine.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { OPERATORS, sanitizeChar } from './data/characters.js';
import { Room, buildMatch } from './net/realtime.js';
import { MODES } from './data/modes.js';
import { initAudio } from './engine/audio.js';
import { normalizeInventory, rollDrop, addToInventory, KINDS } from './data/skins.js';

const boot = document.getElementById('boot');
const bootBar = boot.querySelector('.boot-bar div');
const bootMsg = boot.querySelector('.boot-msg');
const step = (pct, msg) => { bootBar.style.width = pct + '%'; bootMsg.textContent = msg; };

class App {
  async init() {
    step(10, 'Loading settings');
    this.settings = loadSettings();
    step(30, 'Starting renderer');
    this.gameEl = document.getElementById('game');
    this.engine = new Engine(this.gameEl, this.settings);
    this.gameEl.classList.add('hidden');
    step(55, 'Connecting to services');
    // Read email-link results before the auth client consumes the URL.
    const hash = new URLSearchParams(location.hash.slice(1));
    const query = new URLSearchParams(location.search);
    const confirmed = query.has('confirmed') || hash.get('type') === 'signup';
    const recovery = query.has('reset') || hash.get('type') === 'recovery';
    let linkError = null;
    try {
      const { Api, authErrorFromUrl } = await import('./net/api.js');
      linkError = authErrorFromUrl();
      this.api = new Api();
    } catch (e) {
      console.warn('Online services unavailable', e);
      this.api = null;
    }
    this.char = this.loadChar();
    this.inventory = this.loadLocalInventory();
    this.ui = new UI(this);
    addEventListener('pointerdown', () => initAudio(), { once: true });
    step(80, 'Checking session');
    let session = null;
    try { session = this.api ? await this.api.session() : null; } catch { session = null; }
    if (location.hash || location.search) history.replaceState(null, '', location.pathname);
    if (recovery && session) { this.user = session.user; this.ui.showAuth('newpass', { text: 'Link verified — choose a new password.', good: true }); }
    else if (recovery && linkError) this.ui.showAuth('forgot', { text: linkError });
    else if (session) {
      await this.onSignedIn().catch((e) => { console.warn(e); this.ui.showAuth(); this.ui.toast(e.message, 'bad'); });
      if (confirmed) this.ui.toast('Email confirmed — welcome to John-Paul Simulator!', 'good');
    } else if (linkError) this.ui.showAuth('login', { text: linkError });
    else if (confirmed) this.ui.showAuth('login', { text: 'Email confirmed. Sign in to continue.', good: true });
    else this.ui.showAuth();
    step(100, 'Ready');
    setTimeout(() => boot.classList.add('done'), 150);
  }

  loadChar() {
    try {
      const raw = JSON.parse(localStorage.getItem('jps_char') || 'null');
      if (raw) return { ...sanitizeChar(raw), preset: raw.preset || 'custom' };
    } catch { /* ignore */ }
    return { ...OPERATORS[0].char, preset: OPERATORS[0].id };
  }

  loadLocalInventory() {
    try { return normalizeInventory(JSON.parse(localStorage.getItem('jps_inventory') || 'null')); }
    catch { return normalizeInventory(null); }
  }

  // Signed-in collections live on the profile; browser storage only holds what a guest earned.
  async saveInventory() {
    if (this.user) return this.api.saveInventory(this.user.id, this.inventory);
    try { localStorage.setItem('jps_inventory', JSON.stringify(this.inventory)); } catch { /* ignore */ }
  }

  // Post-match reward: wins always drop an item, other results drop half the time (less offline).
  async awardDrop(result, online) {
    let chance = result === 'win' ? 1 : 0.5;
    if (!online) chance *= 0.6;
    if (Math.random() >= chance) return null;
    const item = rollDrop(this.inventory);
    addToInventory(this.inventory, item);
    await this.saveInventory().catch((e) => console.warn('Inventory sync failed', e));
    return item;
  }

  me() {
    if (this.user && this.profile) return { id: this.user.id, name: this.profile.username, elo: this.profile.elo, char: this.char };
    if (!this.guestId) this.guestId = 'guest-' + Math.random().toString(36).slice(2, 8);
    return { id: this.guestId, name: this.char?.name || 'Guest', elo: 1000, char: this.char };
  }

  async onSignedIn() {
    const session = await this.api.session();
    if (!session) throw new Error('Not signed in');
    this.user = session.user;
    let profile = null;
    for (let i = 0; i < 4 && !profile; i++) {
      profile = await this.api.profile(this.user.id);
      if (!profile) await new Promise((r) => setTimeout(r, 400));
    }
    if (!profile) throw new Error('Profile not found. Make sure supabase/schema.sql has been run.');
    this.profile = profile;
    // Merge anything collected as a guest on this device into the account.
    const local = this.loadLocalInventory();
    this.inventory = normalizeInventory(profile.inventory);
    const count = () => Object.values(KINDS).reduce((n, k) => n + this.inventory[k.key].length, 0);
    const before = count();
    for (const [kind, k] of Object.entries(KINDS)) for (const id of local[k.key]) addToInventory(this.inventory, { kind, id });
    if (count() > before) this.saveInventory().catch(() => null);
    try { localStorage.removeItem('jps_inventory'); } catch { /* ignore */ }
    if (profile.character) this.char = { ...sanitizeChar(profile.character), preset: profile.character.preset || 'custom' };
    else this.api.saveCharacter(this.user.id, this.char).catch(() => null);
    localStorage.setItem('jps_char', JSON.stringify(this.char));
    this.joinPresence();
    this.ui.showMenu('play');
  }

  loginGuest() {
    this.user = null; this.profile = null;
    this.inventory = this.loadLocalInventory();
    this.ui.showMenu('play');
  }

  async signOut() {
    this.presence?.leave(); this.presence = null;
    await this.api?.signOut();
    this.user = null; this.profile = null;
    this.inventory = this.loadLocalInventory();
    this.ui.showAuth();
  }

  async refreshProfile() {
    if (!this.user) return;
    try { this.profile = await this.api.profile(this.user.id) || this.profile; } catch { /* keep old */ }
    this.presence?.track({ elo: this.profile.elo });
  }

  async saveChar(c) {
    this.char = c;
    try { localStorage.setItem('jps_char', JSON.stringify(c)); } catch { /* ignore */ }
    if (this.user) {
      try { await this.api.saveCharacter(this.user.id, c); } catch (e) { this.ui.toast('Saved locally (cloud save failed: ' + e.message + ')', 'bad'); }
    }
  }

  async joinPresence() {
    if (!this.api || !this.user) return;
    const me = this.me();
    this.presence = new Room(this.api.sb, 'jps-online', me, { name: me.name, elo: me.elo, status: 'menu' });
    try { await this.presence.connect(); } catch (e) { console.warn('Presence unavailable', e); this.presence = null; }
  }

  onlinePlayers() {
    if (!this.presence) return [];
    return this.presence.members().filter((m) => m.id && m.name).sort((a, b) => (b.elo || 0) - (a.elo || 0));
  }

  // `match` (when in a match) lets friends see what you're playing and spectate it.
  setStatus(status, match = null) { this.presence?.track({ status, match }); }

  // Watch someone else's live match as a spectator.
  spectate(match) {
    if (!match?.id) return;
    this.startOnline({ matchId: match.id, mode: match.mode, map: match.map, hostId: null, players: [], botLevel: 'normal' }, { spectator: true });
  }

  startOffline(o) {
    const me = this.me();
    const payload = buildMatch({ mode: o.mode, map: o.map, humans: [{ id: me.id, name: me.name, elo: me.elo, char: me.char }], hostId: me.id, fillBots: true, botLevel: o.botLevel });
    this.runGame(payload, null);
  }

  async startOnline(payload, { rejoin = false, spectator = false } = {}) {
    const me = this.me();
    const title = spectator ? 'Joining as spectator' : rejoin ? 'Reconnecting' : 'Match found';
    this.ui.root.innerHTML = `<div class="screen"><div class="menu-bg"></div><div class="content" style="display:grid;place-items:center"><div style="text-align:center"><div class="queue-pulse"></div><h2>${title}</h2><p class="muted">Connecting to ${payload.players.filter((p) => !p.isBot).length} player(s)…</p></div></div></div>`;
    try {
      const net = new Room(this.api.sb, 'jps-match-' + payload.matchId, me, { name: me.name, spectator });
      await net.connect();
      this.runGame(payload, net, { rejoin, spectator });
    } catch (e) {
      this.ui.toast('Could not join match: ' + e.message, 'bad');
      this.ui.showMenu('play');
    }
  }

  // ───────────── reconnecting to an online match ─────────────
  saveActiveMatch(payload) {
    try { localStorage.setItem('jps_active_match', JSON.stringify({ payload, at: Date.now(), user: this.me().id })); } catch { /* ignore */ }
  }

  clearActiveMatch() {
    try { localStorage.removeItem('jps_active_match'); } catch { /* ignore */ }
  }

  // The last online match this account was in, if it might still be running.
  activeMatch() {
    try {
      const r = JSON.parse(localStorage.getItem('jps_active_match') || 'null');
      if (!r || r.user !== this.me().id || Date.now() - r.at > 30 * 60 * 1000) return null;
      if (this.game && this.game.matchId === r.payload.matchId) return null;
      return r;
    } catch { return null; }
  }

  rejoinMatch() {
    const r = this.activeMatch();
    if (r) this.startOnline(r.payload, { rejoin: true });
  }

  runGame(payload, net, { rejoin = false, spectator = false } = {}) {
    this.ui.hide();
    this.gameEl.classList.remove('hidden');
    const m = MODES[payload.mode];
    if (spectator) this.setStatus('spectating');
    else this.setStatus('in match', net ? { id: payload.matchId, mode: payload.mode, map: payload.map, ranked: !!m?.ranked } : null);
    if (net && !spectator) this.saveActiveMatch(payload);
    this.game = new Game(this, { ...payload, net, localId: this.me().id, rejoin, spectator });
    this.game.start().catch((e) => {
      console.error(e);
      this.ui.toast('Failed to start match: ' + e.message, 'bad');
      this.exitGame();
    });
  }

  // ───────────── personal stats (this browser) ─────────────
  // Totals per account (or guest) so the stats page has weapon, accuracy and head-to-head data
  // even before the database stores per-match details.
  localStatsKey() { return 'jps_stats_' + (this.user?.id || 'guest'); }

  localStats() {
    try { return JSON.parse(localStorage.getItem(this.localStatsKey()) || 'null') || { matches: [], weapons: {}, shots: 0, hits: 0, h2h: {}, deaths: {} }; }
    catch { return { matches: [], weapons: {}, shots: 0, hits: 0, h2h: {}, deaths: {} }; }
  }

  recordLocalStats(m) {
    const st = this.localStats(), d = m.details || {};
    st.matches.unshift({ mode: m.mode, map: m.map, result: m.result, online: m.online, k: m.k, d: m.d, hs: m.hs, at: Date.now() });
    st.matches = st.matches.slice(0, 200);
    st.shots += d.shots || 0; st.hits += d.hits || 0;
    for (const [w, v] of Object.entries(d.weapons || {})) {
      const a = (st.weapons[w] ||= { k: 0, s: 0, h: 0, hs: 0 });
      a.k += v.k; a.s += v.s; a.h += v.h; a.hs += v.hs;
    }
    for (const [id, v] of Object.entries(d.victims || {})) { const a = (st.h2h[id] ||= { n: v.n, k: 0, d: 0 }); a.k += v.c; a.n = v.n; }
    for (const [id, v] of Object.entries(d.killers || {})) { const a = (st.h2h[id] ||= { n: v.n, k: 0, d: 0 }); a.d += v.c; a.n = v.n; }
    const spots = (st.deaths[m.map] ||= []);
    spots.push(...(d.deaths || []));
    st.deaths[m.map] = spots.slice(-400);
    try { localStorage.setItem(this.localStatsKey(), JSON.stringify(st)); } catch { /* storage full */ }
  }

  // ───────────── replays ─────────────
  storeReplay(data) {
    import('./game/replaystore.js').then((m) => m.saveReplay(data)).then((id) => { this.lastReplayId = id; })
      .catch((e) => console.warn('Replay not saved', e));
  }

  async watchReplay(id) {
    const { loadReplay } = await import('./game/replaystore.js');
    const data = await loadReplay(id);
    if (!data) { this.ui.toast('That replay is no longer available', 'bad'); return; }
    if (this.game) { this.game.destroy(); this.game = null; }
    const { ReplayViewer } = await import('./game/replay.js');
    this.ui.hide();
    this.setStatus('watching a replay');
    this.replay = new ReplayViewer(this, data);
    await this.replay.start();
  }

  exitReplay() {
    this.replay = null;
    this.gameEl.classList.add('hidden');
    this.setStatus('menu');
    this.ui.showMenu('replays');
  }

  exitGame() {
    this.game = null;
    this.gameEl.classList.add('hidden');
    this.setStatus('menu');
    this.refreshProfile().finally(() => this.ui.showMenu('play'));
  }
}

const app = new App();
window.jps = app;
app.init().catch((e) => {
  console.error(e);
  bootMsg.textContent = 'Failed to start: ' + e.message;
});
