import { MODES, SOLO_KINDS, nextMap } from '../data/modes.js';
import { botName } from '../game/bot.js';
import { randomChar } from '../data/characters.js';

// A realtime room: broadcast messages + presence, on top of a Supabase channel.
export class Room {
  constructor(sb, name, me, presence = {}) {
    this.sb = sb;
    this.name = name;
    this.me = me;
    this.presence = presence;
    this.handlers = new Map();
    this.leaveHandlers = [];
    this.syncHandlers = [];
    this.channel = null;
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
  }
  onLeave(fn) { this.leaveHandlers.push(fn); }
  onSync(fn) { this.syncHandlers.push(fn); }

  connect() {
    return new Promise((resolve, reject) => {
      const ch = this.sb.channel(this.name, { config: { broadcast: { self: false, ack: false }, presence: { key: this.me.id } } });
      this.channel = ch;
      ch.on('broadcast', { event: 'm' }, ({ payload }) => {
        const hs = this.handlers.get(payload.e);
        if (hs) for (const h of hs) { try { h(payload.d, payload.f); } catch (e) { console.error(e); } }
      });
      ch.on('presence', { event: 'sync' }, () => { for (const h of this.syncHandlers) h(this.members()); });
      ch.on('presence', { event: 'leave' }, ({ key }) => { for (const h of this.leaveHandlers) h(key); });
      const timer = setTimeout(() => reject(new Error('Realtime connection timed out')), 12000);
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          try { await ch.track({ ...this.presence, id: this.me.id, t: Date.now() }); } catch { /* presence optional */ }
          resolve(this);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          reject(new Error('Realtime connection failed (' + status + ')'));
        }
      });
    });
  }

  async track(extra) {
    this.presence = { ...this.presence, ...extra };
    try { await this.channel?.track({ ...this.presence, id: this.me.id, t: this.presence.t || Date.now() }); } catch { /* ignore */ }
  }

  members() {
    if (!this.channel) return [];
    const st = this.channel.presenceState();
    return Object.values(st).map((arr) => arr[arr.length - 1]).filter(Boolean);
  }

  send(e, d) {
    this.channel?.send({ type: 'broadcast', event: 'm', payload: { e, d, f: this.me.id } });
  }

  leave() {
    if (this.channel) { this.sb.removeChannel(this.channel); this.channel = null; }
  }
}

export function newId(n = 10) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

// Builds the roster for a match: humans get teams (balanced by ELO), bots fill empty slots.
export function buildMatch({ mode, map, humans, hostId, fillBots = true, botLevel = 'normal' }) {
  const m = MODES[mode];
  const players = [];
  if (SOLO_KINDS.has(m.kind)) {
    humans.forEach((h) => players.push({ ...h, team: 0, isBot: false }));
    const target = fillBots ? Math.max(humans.length, 6) : humans.length;
    for (let i = players.length; i < target; i++) players.push({ id: 'bot-' + i, name: botName(i), team: 0, isBot: true, char: randomChar(), elo: 1000 });
  } else {
    const sorted = [...humans].sort((a, b) => (b.elo || 1000) - (a.elo || 1000));
    const counts = [0, 0];
    sorted.forEach((h, i) => {
      let team = h.team;
      if (team !== 0 && team !== 1) team = [0, 1, 1, 0][i % 4];
      if (counts[team] >= m.teamSize) team = 1 - team;
      counts[team]++;
      players.push({ ...h, team, isBot: false });
    });
    if (fillBots) {
      let i = 0;
      for (const team of [0, 1]) while (counts[team] < m.teamSize) { counts[team]++; players.push({ id: 'bot-' + i, name: botName(i + team * 7), team, isBot: true, char: randomChar(), elo: 1000 }); i++; }
    }
  }
  return { matchId: newId(14), mode, map: map || nextMap(mode), hostId, players, botLevel };
}
