import { Engine, loadSettings } from './engine/engine.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { OPERATORS, sanitizeChar } from './data/characters.js';
import { Room, buildMatch } from './net/realtime.js';
import { initAudio } from './engine/audio.js';

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
    if (profile.character) this.char = { ...sanitizeChar(profile.character), preset: profile.character.preset || 'custom' };
    else this.api.saveCharacter(this.user.id, this.char).catch(() => null);
    localStorage.setItem('jps_char', JSON.stringify(this.char));
    this.joinPresence();
    this.ui.showMenu('play');
  }

  loginGuest() {
    this.user = null; this.profile = null;
    this.ui.showMenu('play');
  }

  async signOut() {
    this.presence?.leave(); this.presence = null;
    await this.api?.signOut();
    this.user = null; this.profile = null;
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

  setStatus(status) { this.presence?.track({ status }); }

  startOffline(o) {
    const me = this.me();
    const payload = buildMatch({ mode: o.mode, map: o.map, humans: [{ id: me.id, name: me.name, elo: me.elo, char: me.char }], hostId: me.id, fillBots: true, botLevel: o.botLevel });
    this.runGame(payload, null);
  }

  async startOnline(payload) {
    const me = this.me();
    this.ui.root.innerHTML = `<div class="screen"><div class="menu-bg"></div><div class="content" style="display:grid;place-items:center"><div style="text-align:center"><div class="queue-pulse"></div><h2>Match found</h2><p class="muted">Connecting to ${payload.players.filter((p) => !p.isBot).length} player(s)…</p></div></div></div>`;
    try {
      const net = new Room(this.api.sb, 'jps-match-' + payload.matchId, me, { name: me.name });
      await net.connect();
      this.runGame(payload, net);
    } catch (e) {
      this.ui.toast('Could not join match: ' + e.message, 'bad');
      this.ui.showMenu('play');
    }
  }

  runGame(payload, net) {
    this.ui.hide();
    this.gameEl.classList.remove('hidden');
    this.setStatus('in match');
    this.game = new Game(this, { ...payload, net, localId: this.me().id });
    this.game.start().catch((e) => {
      console.error(e);
      this.ui.toast('Failed to start match: ' + e.message, 'bad');
      this.exitGame();
    });
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
