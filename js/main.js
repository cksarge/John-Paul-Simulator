import { Engine, loadSettings } from './engine/engine.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { OPERATORS, sanitizeChar } from './data/characters.js';
import { Room, buildMatch } from './net/realtime.js';
import { MODES } from './data/modes.js';
import { MAPS } from './data/maps.js';
import { MenuScene } from './ui/menuscene.js';
import { PartyManager } from './net/party.js';
import { initAudio } from './engine/audio.js';
import { pad, PadNav, isTouchOnly, applyPadSettings, padHelp } from './engine/gamepad.js';
import { normalizeInventory, rollDrop, addToInventory, KINDS } from './data/skins.js';
import { applySeasonRows, currentSeason, seasonById, seasonTrack, tierFor, rankedReward, RANKED_REWARD_WINS } from './data/seasons.js';
import { normalizeProgress, applyMatch } from './data/challenges.js';
import { applyAccess } from './ui/access.js';
import { loadLocalMaps, setFeatured, registerRow, isCustom } from './data/custommaps.js';
import { normalizeAchievements, mergeAchievements, applyMatchAchievements, checkUnlocks } from './data/achievements.js';

const boot = document.getElementById('boot');
const bootBar = boot.querySelector('.boot-bar div');
const bootMsg = boot.querySelector('.boot-msg');
const step = (pct, msg) => { bootBar.style.width = pct + '%'; bootMsg.textContent = msg; };

class App {
  async init() {
    step(10, 'Loading settings');
    this.settings = loadSettings();
    applyAccess(this.settings);
    // Community maps saved on this device (downloads and the last known featured maps).
    loadLocalMaps();
    step(30, 'Starting renderer');
    this.gameEl = document.getElementById('game');
    this.engine = new Engine(this.gameEl, this.settings);
    this.gameEl.classList.add('hidden');
    this.menuScene = new MenuScene(this);
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
    this.sessionStart = Date.now();
    this.challenges = this.loadLocalChallenges();
    this.achievements = this.loadLocalAchievements();
    this.ui = new UI(this);
    addEventListener('pointerdown', () => initAudio(), { once: true });
    applyPadSettings(this.settings);
    this.padNav = new PadNav(this);
    if (isTouchOnly()) this.watchController();
    step(80, 'Checking session');
    // No internet (offline play installed): straight into guest mode for bot matches and training.
    if (!navigator.onLine) {
      if (location.hash || location.search) history.replaceState(null, '', location.pathname);
      this.offlineGuest();
      step(100, 'Ready');
      setTimeout(() => boot.classList.add('done'), 150);
      return;
    }
    import('./net/offline.js').then((m) => m.syncOffline(this.settings.offlineMode)).catch(() => null);
    this.refreshFeatured();
    setInterval(() => this.refreshFeatured(), 10 * 60 * 1000);
    let session = null;
    try { session = this.api ? await this.api.session() : null; } catch { session = null; }
    if (location.hash || location.search) history.replaceState(null, '', location.pathname);
    if (recovery && session) { this.user = session.user; this.ui.showAuth('newpass', { text: 'Link verified — choose a new password.', good: true }); }
    else if (recovery && linkError) this.ui.showAuth('forgot', { text: linkError });
    else if (session) {
      await this.onSignedIn().catch((e) => {
        console.warn(e);
        // Connected to a network with no internet: play offline instead of showing a sign-in error.
        if (/fetch|network|load failed/i.test(e.message)) return this.offlineGuest();
        this.ui.showAuth(); this.ui.toast(e.message, 'bad');
      });
      if (confirmed) this.ui.toast('Email confirmed — welcome to John-Paul Simulator!', 'good');
    } else if (linkError) this.ui.showAuth('login', { text: linkError });
    else if (confirmed) this.ui.showAuth('login', { text: 'Email confirmed. Sign in to continue.', good: true });
    else this.ui.showAuth();
    step(100, 'Ready');
    setTimeout(() => boot.classList.add('done'), 150);
  }

  // No internet: guest mode, where bot matches and the Training Range work (with offline play on,
  // the whole game loads from the saved copy).
  offlineGuest() {
    this.user = null; this.profile = null;
    this.loginGuest();
    this.ui.toast('You’re offline. Bot matches and the Training Range work; online play comes back with your connection.', '', null, 8000);
    addEventListener('online', () => this.ui.toast('You’re back online. Sign in from the top-right to play online.', 'good', null, 8000), { once: true });
  }

  // Phones and tablets can't play with touch, so a controller has to be connected first.
  // The gate comes back (and pauses the match) if the controller drops out.
  watchController() {
    const check = () => {
      const has = pad.connected();
      if (!has && !document.querySelector('.pad-gate')) this.showControllerGate();
      if (has) this.updateControllerGate();
    };
    addEventListener('gamepadconnected', check);
    addEventListener('gamepaddisconnected', () => setTimeout(check, 50));
    this.showControllerGate();
    setInterval(check, 500);
  }

  showControllerGate() {
    if (document.querySelector('.pad-gate')) return;
    const g = this.game;
    if (g && !g.ended && !g.hud.overlayOpen()) g.hud.showPause();
    const el = document.createElement('div');
    el.className = 'pad-gate';
    el.innerHTML = `<div class="pad-gate-card">
      <svg class="pad-gate-icon" viewBox="0 0 120 72" aria-hidden="true"><path d="M30 10h60c14 0 22 10 26 30s-2 30-12 30c-8 0-12-6-18-14H34c-6 8-10 14-18 14C6 70 0 60 4 40S16 10 30 10z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M30 28v20M20 38h20" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="84" cy="30" r="4.5" fill="currentColor"/><circle cx="96" cy="40" r="4.5" fill="currentColor"/><circle cx="72" cy="40" r="4.5" fill="currentColor"/><circle cx="84" cy="50" r="4.5" fill="currentColor"/></svg>
      <h1>Connect a controller</h1>
      <p>John-Paul Simulator can't be played with touch controls. Pair a Bluetooth controller (Xbox, PlayStation, Switch Pro or similar) or plug one in, then <b>press any button on it</b>.</p>
      <p class="pad-gate-status" aria-live="polite">Waiting for a controller…</p>
      <button class="btn primary big hidden" data-gate-go>Tap to continue</button>
      <p class="pad-gate-help">${padHelp()}</p>
    </div>`;
    document.body.appendChild(el);
    el.querySelector('[data-gate-go]').onclick = () => { initAudio(); el.remove(); pad.setActive(true); };
    this.updateControllerGate();
  }

  updateControllerGate() {
    const el = document.querySelector('.pad-gate');
    if (!el) return;
    const has = pad.connected();
    el.querySelector('.pad-gate-status').textContent = has ? `Controller connected: ${(pad.id || 'Gamepad').replace(/\s*\(.*$/, '')}` : 'Waiting for a controller…';
    el.querySelector('[data-gate-go]').classList.toggle('hidden', !has);
    el.classList.toggle('ready', has);
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
    this.challenges = normalizeProgress(profile.challenges);
    // Achievements earned as a guest on this device carry over to the account.
    this.achievements = mergeAchievements(profile.achievements, this.loadLocalAchievements());
    try { localStorage.removeItem('jps_achievements'); } catch { /* ignore */ }
    this.checkAchievements();
    // Check for a ban before appearing in the online list.
    await this.pollStatus();
    if (this.banned) return;
    this.joinPresence();
    this.grantSeasonRewards();
    this.claimPending();
    this.ui.showMenu('play');
  }

  loginGuest() {
    this.user = null; this.profile = null; this.isAdmin = false; this.muted = null;
    this.inventory = this.loadLocalInventory();
    this.challenges = this.loadLocalChallenges();
    this.achievements = this.loadLocalAchievements();
    this.pollStatus();
    this.ui.showMenu('play');
  }

  async signOut() {
    this.party?.leave(true); this.party = null;
    this.presence?.leave(); this.presence = null;
    await this.api?.signOut();
    clearInterval(this.statusTimer);
    this.user = null; this.profile = null; this.isAdmin = false; this.muted = null; this.banned = null;
    this.friends = []; this.friendsLoaded = false; this.friendsSeen = false; this.friendRequestCount = 0;
    this.inventory = this.loadLocalInventory();
    this.achievements = this.loadLocalAchievements();
    this.ui.showAuth();
  }

  async refreshProfile() {
    if (!this.user) return;
    try { this.profile = await this.api.profile(this.user.id) || this.profile; } catch { /* keep old */ }
    this.presence?.track({ elo: this.profile.elo });
    this.grantSeasonRewards();
    this.checkAchievements();
  }

  // ───────────── account status: moderation, admin gifts, announcements ─────────────
  // Polled every 30 s while signed in. Bans, kicks and warnings come from the database, never from
  // other players' messages, so nobody can fake them.
  async pollStatus() {
    if (!this.api) return;
    clearInterval(this.statusTimer);
    this.statusTimer = setInterval(() => this.pollStatus(), 30000);
    const [ann, settings] = await Promise.all([this.api.announcements(), this.api.appSettings()]);
    this.announcementsList = ann; this.appSettings = settings;
    this.ui.renderBanner?.();
    if (!this.user) return;
    let st;
    try { st = await this.api.myStatus(); } catch (e) { if (!e.missing) console.warn('Status check failed', e); return; }
    if (!st) return;
    if (st.season && !this.seasonsLoaded) {
      this.seasonsLoaded = true;
      applySeasonRows(await this.api.seasons());
    }
    this.isAdmin = st.admin === true;
    if (st.friend_requests !== undefined && (st.friend_requests !== this.friendRequestCount || !this.friendsLoaded)) this.loadFriends();
    this.muted = st.muted_until ? { until: st.muted_until, reason: st.mute_reason } : null;
    const banned = st.banned_until ? { until: st.banned_until, reason: st.ban_reason } : null;
    const kickKey = 'jps_kick_' + this.user.id, lastKick = Number(localStorage.getItem(kickKey) || 0), kickAt = st.kick_at ? Date.parse(st.kick_at) : 0;
    if (kickAt > lastKick) {
      try { localStorage.setItem(kickKey, String(kickAt)); } catch { /* ignore */ }
      // Only kicks issued after this session started count; older ones were already handled.
      if (this.game && kickAt > (this.sessionStart || 0) - 5000) {
        // Forget the match so the menu doesn't offer to reconnect to it.
        this.clearActiveMatch();
        this.game.leave();
        this.ui.toast(`An admin removed you from the match${st.kick_reason && st.kick_reason !== 'Banned' ? ': ' + st.kick_reason : ''}`, 'bad', null, 9000);
      }
    }
    const wasBanned = !!this.banned;
    this.banned = banned;
    if (banned) { if (!wasBanned) this.goOffline(); this.ui.showBanned(banned); return; }
    // Ban expired or lifted while the ban screen was up: back to the menu.
    if (wasBanned) { this.joinPresence(); this.ui.showMenu('play'); }
    const acks = { w: [], g: [] };
    if (st.grants?.length) {
      for (const g of st.grants) {
        const key = KINDS[g.kind]?.key;
        if (key && KINDS[g.kind].defs[g.item]) {
          if (g.revoke) this.inventory[key] = (this.inventory[key] || []).filter((x) => x !== g.item);
          else addToInventory(this.inventory, { kind: g.kind, id: g.item });
          if (!g.revoke) this.ui.toast(`An admin gave you ${KINDS[g.kind].defs[g.item].name}`, 'good');
        }
        acks.g.push(g.id);
      }
      // Only mark gifts delivered once they're saved; otherwise the next check retries them.
      const saved = await this.saveInventory().then(() => true, () => false);
      if (!saved) acks.g = [];
    }
    if (st.warnings?.length) {
      for (const w of st.warnings) acks.w.push(w.id);
      this.ui.showWarnings(st.warnings);
    }
    if (acks.w.length || acks.g.length) this.api.ackStatus(acks.w, acks.g).catch(() => null);
    this.ui.adminChanged?.();
  }

  // Ends every online session at once (used when a ban lands): match, replay, queue, lobby, party, presence.
  goOffline() {
    this.clearActiveMatch();
    this.game?.leave();
    this.replay?.exit();
    this.ui.queue?.cancel(); this.ui.queue = null;
    this.ui.lobby?.leave(); this.ui.lobby = null;
    this.party?.leave(true); this.party = null;
    this.presence?.leave(); this.presence = null;
  }

  get maintenance() {
    const m = this.appSettings?.maintenance;
    return m?.on ? m : null;
  }

  // Grants season reward-track items you've reached, plus rewards from finished seasons.
  // Inventory adds are idempotent, so this can run any time the profile changes.
  async grantSeasonRewards() {
    const p = this.profile;
    if (!p || !this.user) return;
    const before = JSON.stringify(this.inventory);
    const cur = currentSeason();
    if (cur && p.season_id === cur.id) {
      const { tier } = tierFor(p.pass_xp);
      for (const r of seasonTrack(cur.id).slice(0, tier)) addToInventory(this.inventory, r);
    }
    for (const h of await this.api.seasonHistory(this.user.id)) {
      if (!seasonById(h.season_id)) continue;
      for (const r of seasonTrack(h.season_id).slice(0, tierFor(h.pass_xp).tier)) addToInventory(this.inventory, r);
      const rr = rankedReward(h.season_id);
      if (rr && h.wins >= RANKED_REWARD_WINS) addToInventory(this.inventory, rr);
    }
    if (JSON.stringify(this.inventory) !== before) {
      await this.saveInventory().catch(() => null);
      this.ui.toast('New season rewards added to your Armory', 'good');
    }
  }

  // ───────────── challenges ─────────────
  loadLocalChallenges() {
    try { return normalizeProgress(JSON.parse(localStorage.getItem('jps_challenges') || 'null')); }
    catch { return normalizeProgress(null); }
  }

  // Called after every finished match (not the training range). Signed-in players get the XP
  // straight away; guests keep progress on this device.
  async trackChallenges(m) {
    this.challenges = normalizeProgress(this.challenges);
    const done = applyMatch(this.challenges, m);
    if (this.user) {
      for (const c of done) {
        try {
          const xp = await this.api.claimChallenge(c.key);
          if (!this.challenges.claimed.includes(c.key)) this.challenges.claimed.push(c.key);
          this.ui.toast(`Challenge complete: ${c.text} · +${xp || c.xp} XP`, 'good', null, 6000);
        } catch (e) {
          if (!e.missing) this.ui.toast(`Challenge complete: ${c.text} (XP not saved: ${e.message})`, 'bad');
        }
      }
      this.api.saveChallenges(this.user.id, this.challenges).catch(() => null);
    } else {
      for (const c of done) this.ui.toast(`Challenge complete: ${c.text}. Sign in to earn the XP.`, 'good', null, 6000);
      try { localStorage.setItem('jps_challenges', JSON.stringify(this.challenges)); } catch { /* ignore */ }
    }
    return done;
  }

  // Retry claims that finished while offline or before the database was updated.
  async claimPending() {
    if (!this.user || !this.challenges) return;
    const { activeChallenges } = await import('./data/challenges.js');
    for (const c of activeChallenges()) {
      if ((this.challenges[c.key] || 0) >= c.n && !this.challenges.claimed.includes(c.key)) {
        try { await this.api.claimChallenge(c.key); this.challenges.claimed.push(c.key); } catch { return; }
      }
    }
    this.api.saveChallenges(this.user.id, this.challenges).catch(() => null);
  }

  // ───────────── achievements ─────────────
  loadLocalAchievements() {
    try { return normalizeAchievements(JSON.parse(localStorage.getItem('jps_achievements') || 'null')); }
    catch { return normalizeAchievements(null); }
  }

  async saveAchievements() {
    const local = () => { try { localStorage.setItem('jps_achievements', JSON.stringify(this.achievements)); } catch { /* ignore */ } };
    // Until the database has the achievements column, signed-in progress is kept on this device too.
    if (this.user) return this.api.saveAchievements(this.user.id, this.achievements).catch((e) => { if (e.missing) local(); else console.warn('Achievements not saved', e); });
    local();
  }

  announceAchievements(list) {
    if (list.length > 2) { this.ui.toast(`${list.length} achievements unlocked: ${list.map((d) => `${d.icon} ${d.name}`).join(', ')}`, 'good', null, 8000); return; }
    for (const d of list) this.ui.toast(`Achievement unlocked: ${d.icon} ${d.name}. ${d.desc}`, 'good', null, 6000);
  }

  // Unlocks anything reached through profile totals (level, kills…) or counters set elsewhere.
  checkAchievements() {
    const got = checkUnlocks(this.achievements, this.profile);
    if (got.length) { this.announceAchievements(got); this.saveAchievements(); }
  }

  // Called after every finished match (not the training range).
  trackAchievements(m) {
    this.achievements = normalizeAchievements(this.achievements);
    const got = applyMatchAchievements(this.achievements, m, this.profile);
    this.announceAchievements(got);
    this.saveAchievements();
    return got;
  }

  // Sets a counter that only goes up (e.g. number of friends) and unlocks what it reaches.
  bumpAchievementStat(stat, value) {
    if ((this.achievements.c[stat] || 0) >= value) return;
    this.achievements.c[stat] = value;
    this.checkAchievements();
    this.saveAchievements();
  }

  async saveChar(c) {
    this.char = c;
    try { localStorage.setItem('jps_char', JSON.stringify(c)); } catch { /* ignore */ }
    if (this.user) {
      try { await this.api.saveCharacter(this.user.id, c); } catch (e) { this.ui.toast('Saved locally (cloud save failed: ' + e.message + ')', 'bad'); }
    }
  }

  async joinPresence() {
    if (!this.api || !this.user || this.presence) return;
    const me = this.me();
    this.presence = new Room(this.api.sb, 'jps-online', me, { name: me.name, elo: me.elo, status: 'menu' });
    try { await this.presence.connect(); } catch (e) { console.warn('Presence unavailable', e); this.presence = null; }
    if (this.presence) {
      this.party = new PartyManager(this);
      this.party.attach(this.presence);
      this.presence.on('friend', (d) => { if (d.to === this.user?.id) this.loadFriends(); });
      this.presence.onSync(() => this.ui.friendsChanged?.());
      this.ui.renderParty?.();
    }
  }

  // ───────────── friends ─────────────
  // The list comes from the database (my_friends); online status comes from the presence room.
  async loadFriends() {
    if (!this.user || !this.api) return;
    let list;
    try { list = await this.api.friends(); } catch (e) { if (!e.missing) console.warn('Friends unavailable', e); this.friendsMissing = !!e.missing; return; }
    const before = new Set((this.friends || []).filter((f) => f.incoming && f.status === 'pending').map((f) => f.id));
    this.friends = list || [];
    this.friendsLoaded = true;
    const incoming = this.friends.filter((f) => f.incoming && f.status === 'pending');
    this.friendRequestCount = incoming.length;
    for (const f of incoming) if (!before.has(f.id) && this.friendsSeen) this.ui.toast(`${f.username} sent you a friend request`, 'good', [{ label: 'Accept', primary: true, fn: () => this.respondFriend(f.id, true) }, { label: 'Decline', fn: () => this.respondFriend(f.id, false) }], 15000);
    this.friendsSeen = true;
    this.bumpAchievementStat('friends', this.friends.filter((f) => f.status === 'accepted').length);
    this.ui.friendsChanged?.();
  }

  friendStatus(id) { return (this.friends || []).find((f) => f.id === id) || null; }

  async addFriend(id, name) {
    try {
      const r = await this.api.friendRequest(id);
      this.ui.toast(r === 'accepted' ? `You and ${name} are now friends` : r === 'already' ? `${name} is already your friend` : `Friend request sent to ${name}`, 'good');
      // Let them know straight away if they're online; otherwise they see it on their next status check.
      this.presence?.send('friend', { to: id });
    } catch (e) { this.ui.toast(e.missing ? 'Friends need the latest database update (supabase/schema.sql)' : e.message, 'bad'); }
    await this.loadFriends();
  }

  async respondFriend(id, accept) {
    try { await this.api.friendRespond(id, accept); if (accept) this.presence?.send('friend', { to: id }); } catch (e) { this.ui.toast(e.message, 'bad'); }
    await this.loadFriends();
  }

  async removeFriend(id) {
    try { await this.api.friendRemove(id); this.presence?.send('friend', { to: id }); } catch (e) { this.ui.toast(e.message, 'bad'); }
    await this.loadFriends();
  }

  onlinePlayers() {
    if (!this.presence) return [];
    return this.presence.members().filter((m) => m.id && m.name).sort((a, b) => (b.elo || 0) - (a.elo || 0));
  }

  // ───────────── community maps ─────────────
  // Featured maps load for everyone at start-up (and every 10 minutes) and join the queues' rotation.
  async refreshFeatured() {
    if (!this.api) return;
    try { setFeatured(await this.api.featuredMaps()); } catch (e) { if (!e.missing) console.warn('Featured maps unavailable', e); return; }
    // Show newly featured maps in the bot-match map list if it's open.
    if (this.ui.tab === 'play' && !this.ui.lobby && !this.game) this.ui.renderPlay(this.ui.root.querySelector('#tab'));
  }

  // Makes sure a map is available here, downloading a community map by id if needed.
  async ensureMap(id) {
    if (MAPS[id]) return true;
    if (!isCustom(id) || !this.api) return false;
    try { const row = await this.api.customMap(Number(String(id).slice(2))); if (row) { registerRow(row); return true; } } catch (e) { console.warn('Map download failed', e); }
    return false;
  }

  // `match` (when in a match) lets friends see what you're playing and spectate it.
  setStatus(status, match = null) { this.presence?.track({ status, match }); }

  // Watch someone else's live match as a spectator.
  spectate(match) {
    if (!match?.id) return;
    this.startOnline({ matchId: match.id, mode: match.mode, map: match.map, variant: match.variant, hostId: null, players: [], botLevel: 'normal' }, { spectator: true });
  }

  startOffline(o) {
    const me = this.me();
    const payload = buildMatch({ mode: o.mode, map: o.map, variant: o.variant || 'day', humans: [{ id: me.id, name: me.name, elo: me.elo, char: me.char }], hostId: me.id, fillBots: true, botLevel: o.botLevel });
    this.runGame(payload, null);
  }

  async startOnline(payload, { rejoin = false, spectator = false } = {}) {
    if (this.banned) return;
    const me = this.me();
    // A match on a community map carries the map, so everyone can play it.
    if (payload.mapRow) { try { registerRow(payload.mapRow); } catch { /* falls through to the download below */ } }
    if (!(await this.ensureMap(payload.map))) { this.ui.toast('That match is on a map that couldn’t be downloaded', 'bad'); this.ui.showMenu('play'); return; }
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
    else this.setStatus('in match', net ? { id: payload.matchId, mode: payload.mode, map: payload.map, variant: payload.variant, ranked: !!m?.ranked } : null);
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
    try { await this.replay.start(); } catch (e) { this.replay = null; this.ui.toast(e.message, 'bad'); this.ui.showMenu('replays'); }
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
    // Testing a map from the workshop comes back to it.
    const tab = this.returnTab || 'play';
    this.returnTab = null;
    this.refreshProfile().finally(() => this.ui.showMenu(tab));
  }
}

const app = new App();
window.jps = app;
app.init().catch((e) => {
  console.error(e);
  bootMsg.textContent = 'Failed to start: ' + e.message;
});
