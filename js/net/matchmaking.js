import { Room, buildMatch, newId } from './realtime.js';
import { MODES, SOLO_KINDS } from '../data/modes.js';

const FILL_AFTER = 20; // seconds before a non-ranked queue starts with bots filling gaps

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
  }

  async start() {
    const me = this.app.me();
    this.room = new Room(this.app.api.sb, 'jps-q-' + this.mode, me, { name: me.name, elo: me.elo, char: me.char });
    this.room.onSync(() => this.evaluate());
    this.room.on('match', (payload) => this.accept(payload));
    await this.room.connect();
    this.timer = setInterval(() => this.evaluate(), 1000);
    this.evaluate();
  }

  queue() {
    return this.room.members().filter((m) => m.id).sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
  }

  evaluate() {
    if (this.done || !this.room) return;
    const list = this.queue(), me = this.app.me();
    const need = needFor(this.mode), m = MODES[this.mode];
    const leader = list[0]?.id === me.id;
    const waited = (Date.now() - this.started) / 1000;
    const canFill = !m.ranked && list.length >= 2 && waited >= FILL_AFTER;
    this.onUpdate?.({ count: list.length, need, waited, leader, canForce: leader && !m.ranked && list.length >= 2 });
    if (!leader) return;
    if (list.length >= need) this.form(list.slice(0, need));
    else if (canFill) this.form(list.slice(0, need));
  }

  forceStart() {
    const list = this.queue();
    if (list.length >= 2) this.form(list.slice(0, needFor(this.mode)));
  }

  form(members) {
    const me = this.app.me();
    const humans = members.map((x) => ({ id: x.id, name: x.name, elo: x.elo, char: x.char }));
    const payload = buildMatch({ mode: this.mode, humans, hostId: me.id, fillBots: true, botLevel: 'normal' });
    this.room.send('match', payload);
    this.accept(payload);
  }

  accept(payload) {
    if (this.done) return;
    if (!payload.players.some((p) => p.id === this.app.me().id)) return;
    this.done = true;
    this.cancel();
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
    this.cfg = { mode: 'bomb', map: 'dustline', botLevel: 'normal', fillBots: true, hostId: isHost ? app.me().id : null, name: '' };
  }

  static newCode() { return newId(5).toUpperCase(); }

  async connect() {
    const me = this.app.me();
    this.room = new Room(this.app.api.sb, 'jps-lobby-' + this.code, me, { name: me.name, elo: me.elo, char: me.char, team: -1, host: this.isHost });
    this.room.onSync(() => { this.onChange?.(); if (this.isHost) this.pushCfg(); });
    this.room.onLeave((id) => { if (!this.isHost && id === this.cfg.hostId) { this.onClosed?.('The host closed the lobby.'); } });
    this.room.on('cfg', (cfg) => { if (!this.isHost) { this.cfg = cfg; this.onChange?.(); } });
    this.room.on('start', (payload) => { if (payload.players.some((p) => p.id === me.id)) { this.started = true; this.onStart(payload); } });
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

  members() { return this.room ? this.room.members().filter((m) => m.id) : []; }

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

  start() {
    const me = this.app.me();
    const humans = this.members().map((x) => ({ id: x.id, name: x.name, elo: x.elo, char: x.char, team: x.team }));
    const payload = buildMatch({ mode: this.cfg.mode, map: this.cfg.map, humans, hostId: me.id, fillBots: this.cfg.fillBots, botLevel: this.cfg.botLevel });
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
