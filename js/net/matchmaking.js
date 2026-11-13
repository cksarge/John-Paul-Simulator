import { Room, buildMatch, newId } from './realtime.js';
import { MODES, SOLO_KINDS } from '../data/modes.js';

const FILL_AFTER = 20; // seconds before a non-ranked queue starts with bots filling gaps

// Keeps banned accounts out of queues and lobbies. Flags come from the database (moderation_flags).
// Lookups are cached for a minute so the list filters smoothly, and every match is re-checked with
// fresh flags right before it starts (forming it, or accepting one someone else formed).
const RECHECK_MS = 60000;
class BanFilter {
  constructor(app) { this.app = app; this.checkedAt = new Map(); this.banned = new Set(); }
  check(ids) {
    const now = Date.now();
    const fresh = ids.filter((id) => id && !(now - (this.checkedAt.get(id) || 0) < RECHECK_MS));
    if (!fresh.length || !this.app.api) return;
    fresh.forEach((id) => this.checkedAt.set(id, now));
    this.app.api.moderationFlags(fresh).then((rows) => {
      for (const id of fresh) this.banned.delete(id);
      for (const r of rows) if (r.banned) this.banned.add(r.id);
    }).catch(() => null);
  }
  has(id) { return this.banned.has(id); }
  // Fresh lookup (no cache) for the humans about to play. Returns the set of banned ids among them.
  async verify(ids) {
    if (!this.app.api) return new Set();
    const rows = await this.app.api.moderationFlags(ids).catch(() => []);
    const out = new Set(rows.filter((r) => r.banned).map((r) => r.id));
    for (const id of out) this.banned.add(id);
    return out;
  }
}
const humanIds = (payload) => payload.players.filter((p) => !p.isBot).map((p) => p.id);
const groupIds = (e) => (e.group?.length ? e.group : [e]).map((x) => x.id);

function needFor(mode) {
  const m = MODES[mode];
  return SOLO_KINDS.has(m.kind) ? m.maxPlayers : m.teamSize * 2;
}

// Presence-based queue: the longest-waiting player forms the match and hosts it.
export class Matchmaker {
  constructor(app, mode, { onUpdate, onMatch }) {
    this.app = app; this.mode = mode;
    this.onUpdate = onUpdate; this.onMatch = onMatch;
    this.done = false;
    this.started = Date.now();
    this.bans = new BanFilter(app);
  }

  async start() {
    const me = this.app.me();
    // A party queues as one entry carrying every member (the leader's).
    const group = this.app.party?.group() || [{ id: me.id, name: me.name, elo: me.elo, char: me.char }];
    this.room = new Room(this.app.api.sb, 'jps-q-' + this.mode, me, { name: me.name, elo: me.elo, char: me.char, group });
    this.room.onSync(() => this.evaluate());
    this.room.on('match', (payload) => this.accept(payload));
    await this.room.connect();
    this.timer = setInterval(() => this.evaluate(), 1000);
    this.evaluate();
  }

  queue() {
    const all = this.room.members().filter((m) => m.id);
    this.bans.check(all.flatMap(groupIds));
    return all.filter((m) => !groupIds(m).some((id) => this.bans.has(id))).sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
  }

  // Entries that fit in one match, oldest first. Team modes also need each group to fit on a team.
  pick(list) {
    const m = MODES[this.mode], need = needFor(this.mode), out = [];
    const room = SOLO_KINDS.has(m.kind) ? null : [m.teamSize, m.teamSize];
    let total = 0;
    for (const e of list) {
      const g = e.group?.length ? e.group : [e];
      if (total + g.length > need) continue;
      let team = -1;
      if (room) { team = room[0] >= room[1] ? 0 : 1; if (room[team] < g.length) team = 1 - team; if (room[team] < g.length) continue; room[team] -= g.length; }
      out.push({ g, team });
      total += g.length;
    }
    return { out, total };
  }

  evaluate() {
    if (this.done || !this.room) return;
    const list = this.queue(), me = this.app.me();
    const need = needFor(this.mode), m = MODES[this.mode];
    const leader = list[0]?.id === me.id;
    const waited = (Date.now() - this.started) / 1000;
    const humans = list.reduce((n, e) => n + (e.group?.length || 1), 0);
    const canFill = !m.ranked && humans >= 2 && waited >= FILL_AFTER;
    this.onUpdate?.({ count: humans, need, waited, leader, canForce: leader && !m.ranked && humans >= 2 });
    if (!leader) return;
    const { total } = this.pick(list);
    if (total >= need || canFill) this.form(list);
  }

  forceStart() {
    const list = this.queue();
    if (list.reduce((n, e) => n + (e.group?.length || 1), 0) >= 2) this.form(list);
  }

  async form(list) {
    if (this.forming) return;
    this.forming = true;
    // Re-check everyone with fresh flags before the match exists; banned entries drop out.
    const banned = await this.bans.verify(list.flatMap(groupIds));
    this.forming = false;
    if (this.done || !this.room) return;
    if (banned.size) { this.evaluate(); return; }
    const me = this.app.me();
    const humans = [];
    for (const { g, team } of this.pick(list).out) for (const x of g) humans.push({ id: x.id, name: x.name, elo: x.elo, char: x.char, ...(team >= 0 ? { team } : {}) });
    const payload = buildMatch({ mode: this.mode, humans, hostId: me.id, fillBots: true, botLevel: 'normal' });
    this.room.send('match', payload);
    this.accept(payload);
  }

  async accept(payload) {
    if (this.done) return;
    if (!payload.players.some((p) => p.id === this.app.me().id)) return;
    // A match formed by someone else: refuse it if it includes a banned account.
    if ((await this.bans.verify(humanIds(payload))).size) return;
    if (this.done) return;
    this.done = true;
    this.cancel();
    // Party members aren't in the queue room; the leader passes the match on.
    this.app.party?.relayMatch(payload);
    this.onMatch(payload);
  }

  cancel() {
    clearInterval(this.timer);
    this.room?.leave();
    this.room = null;
  }
}

// Custom lobby joined by code. The creator is the host and starts the match.
export class Lobby {
  constructor(app, code, isHost, { onChange, onStart, onClosed }) {
    this.app = app; this.code = code; this.isHost = isHost;
    this.onChange = onChange; this.onStart = onStart; this.onClosed = onClosed;
    this.cfg = { mode: 'bomb', map: 'dustline', variant: 'day', botLevel: 'normal', fillBots: true, hostId: isHost ? app.me().id : null, name: '' };
    this.bans = new BanFilter(app);
  }

  static newCode() { return newId(5).toUpperCase(); }

  async connect() {
    const me = this.app.me();
    this.room = new Room(this.app.api.sb, 'jps-lobby-' + this.code, me, { name: me.name, elo: me.elo, char: me.char, team: -1, host: this.isHost });
    this.room.onSync(() => { this.onChange?.(); if (this.isHost) this.pushCfg(); });
    this.room.onLeave((id) => { if (!this.isHost && id === this.cfg.hostId) { this.onClosed?.('The host closed the lobby.'); } });
    this.room.on('cfg', (cfg) => { if (!this.isHost) { this.cfg = cfg; this.onChange?.(); } });
    this.room.on('start', async (payload) => {
      if (!payload.players.some((p) => p.id === me.id)) return;
      if ((await this.bans.verify(humanIds(payload))).size) { this.onClosed?.('That match included a banned player, so it was cancelled.'); return; }
      this.started = true; this.onStart(payload);
    });
    this.room.on('kick', (id) => { if (id === me.id) this.onClosed?.('You were removed from the lobby.'); });
    await this.room.connect();
    if (this.isHost) {
      this.cfg.name = me.name + "'s lobby";
      this.board = new Room(this.app.api.sb, 'jps-lobbies', me, this.boardEntry());
      await this.board.connect().catch(() => null);
      this.pushCfg();
    } else {
      // Ask the host for the current config.
      setTimeout(() => this.room.send('hi', {}), 300);
    }
    if (this.isHost) this.room.on('hi', () => this.pushCfg());
  }

  boardEntry() {
    return { code: this.code, name: this.cfg.name, mode: this.cfg.mode, map: this.cfg.map, count: this.members().length || 1 };
  }

  members() {
    if (!this.room) return [];
    const all = this.room.members().filter((m) => m.id);
    this.bans.check(all.map((m) => m.id));
    return all.filter((m) => !this.bans.has(m.id));
  }

  pushCfg() {
    if (!this.isHost) return;
    this.room.send('cfg', this.cfg);
    this.board?.track(this.boardEntry());
  }

  setCfg(patch) {
    Object.assign(this.cfg, patch);
    this.pushCfg();
    this.onChange?.();
  }

  setTeam(team) { this.room.track({ team }); }

  async start() {
    const me = this.app.me();
    const banned = await this.bans.verify(this.members().map((x) => x.id));
    if (banned.size) { this.onChange?.(); return; }
    const humans = this.members().map((x) => ({ id: x.id, name: x.name, elo: x.elo, char: x.char, team: x.team }));
    const payload = buildMatch({ mode: this.cfg.mode, map: this.cfg.map, variant: this.cfg.variant || 'day', humans, hostId: me.id, fillBots: this.cfg.fillBots, botLevel: this.cfg.botLevel });
    this.started = true;
    this.room.send('start', payload);
    setTimeout(() => this.onStart(payload), 150);
  }

  leave() {
    this.room?.leave();
    this.board?.leave();
    this.room = this.board = null;
  }
}

// Read-only view of open lobbies.
export async function listLobbies(app) {
  const me = app.me();
  const room = new Room(app.api.sb, 'jps-lobbies', { id: 'viewer-' + me.id }, {});
  await room.connect();
  await new Promise((r) => setTimeout(r, 700));
  const list = room.members().filter((m) => m.code);
  room.leave();
  return list;
}
