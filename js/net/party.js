import { Room, newId } from './realtime.js';
import { MODES, SOLO_KINDS } from '../data/modes.js';

// Largest party that can queue for a mode together (everyone on the same team).
export function partyLimit(modeId) {
  const m = MODES[modeId];
  return SOLO_KINDS.has(m.kind) ? m.maxPlayers : m.teamSize;
}

// Parties: friends group up in the menu, then the leader queues or opens a lobby for everyone.
// Invites travel over the global presence room; each party has its own realtime room.
export class PartyManager {
  constructor(app) {
    this.app = app;
    this.party = null;      // { id, room }
    this.invites = [];      // pending invites to us
    this.listeners = new Set();
    this.searching = null;  // { mode } while the leader is in a queue
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) { try { fn(); } catch (e) { console.error(e); } } }

  // Called once the global presence room is connected.
  attach(presence) {
    const me = () => this.app.me();
    presence.on('invite', (d) => {
      if (d.to !== me().id || this.party?.id === d.party) return;
      this.invites = this.invites.filter((i) => i.from !== d.from);
      this.invites.push(d);
      this.app.ui.partyInvite?.(d);
      this.emit();
    });
    presence.on('invite-no', (d) => { if (d.to === me().id) this.app.ui.toast(`${d.name} declined your party invite`); });
  }

  get inParty() { return !!this.party; }
  get id() { return this.party?.id || null; }

  members() {
    if (!this.party?.room) return [];
    return this.party.room.members().filter((m) => m.id).sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
  }

  // The longest-standing member leads (so if the leader leaves, the next one takes over automatically).
  get leaderId() { return this.members()[0]?.id || this.app.me().id; }
  get isLeader() { return !this.party || this.leaderId === this.app.me().id; }
  get size() { return this.party ? Math.max(1, this.members().length) : 1; }

  async create() {
    if (this.party) return this.party;
    return this.join(newId(8));
  }

  async join(id) {
    if (this.party?.id === id) return this.party;
    if (this.party) this.leave(true);
    const me = this.app.me();
    const room = new Room(this.app.api.sb, 'jps-party-' + id, me, { name: me.name, elo: me.elo, char: me.char, t: Date.now() });
    room.onSync(() => this.emit());
    room.on('queue', (d) => { if (!this.isLeader) { this.searching = d; this.app.ui.partySearching?.(d); this.emit(); } });
    room.on('cancel', () => { if (!this.isLeader) { this.searching = null; this.app.ui.partySearching?.(null); this.emit(); } });
    room.on('match', (payload) => {
      if (!payload.players.some((p) => p.id === me.id)) return;
      this.searching = null;
      this.app.ui.partySearching?.(null);
      this.app.startOnline(payload);
    });
    room.on('lobby', (d) => { if (!this.isLeader) this.app.ui.joinLobby(d.code); });
    room.on('kick', (target) => { if (target === me.id) { this.leave(true); this.app.ui.toast('You were removed from the party', 'bad'); } });
    room.on('chat', (d) => this.app.ui.partyChat?.(d));
    await room.connect();
    this.party = { id, room };
    this.app.presence?.track({ party: id });
    this.emit();
    return this.party;
  }

  async invite(user) {
    await this.create();
    if (this.size >= 5) { this.app.ui.toast('Parties are limited to 5 players', 'bad'); return; }
    const me = this.app.me();
    this.app.presence?.send('invite', { to: user.id, from: me.id, name: me.name, party: this.party.id });
    this.app.ui.toast(`Invite sent to ${user.name}`, 'good');
  }

  async accept(inv) {
    this.invites = this.invites.filter((i) => i !== inv);
    await this.join(inv.party);
    this.app.ui.toast('Joined the party', 'good');
  }

  decline(inv) {
    this.invites = this.invites.filter((i) => i !== inv);
    this.app.presence?.send('invite-no', { to: inv.from, name: this.app.me().name });
    this.emit();
  }

  kick(id) { if (this.isLeader) this.party?.room.send('kick', id); }

  leave(silent = false) {
    if (!this.party) return;
    this.party.room.leave();
    this.party = null;
    this.searching = null;
    this.app.presence?.track({ party: null });
    if (!silent) this.app.ui.toast('Left the party');
    this.emit();
  }

  // Leader → members.
  announceQueue(mode) { this.party?.room.send('queue', { mode }); }
  announceCancel() { this.party?.room.send('cancel', {}); }
  relayMatch(payload) { this.party?.room.send('match', payload); }
  announceLobby(code) { this.party?.room.send('lobby', { code }); }
  chat(text) { const me = this.app.me(); const d = { name: me.name, text: text.slice(0, 140) }; this.party?.room.send('chat', d); this.app.ui.partyChat?.(d); }

  // Party info that goes into the queue so the matchmaker keeps everyone together.
  group() {
    const list = this.party ? this.members() : [this.app.me()];
    return list.map((m) => ({ id: m.id, name: m.name, elo: m.elo, char: m.char }));
  }
}
