import * as THREE from 'three';
import { CELL } from '../engine/world.js';
import { GUN_GAME_ORDER, isKnife } from '../data/weapons.js';
import { RESPAWN_KINDS, econFor } from '../data/modes.js';

// Host-only match logic. Everything it decides is broadcast as events that every client applies.
export class Rules {
  constructor(game) {
    this.g = game;
    this.mode = game.mode;
    this.respawnQueue = new Map();
    this.econ = econFor(this.mode);
    this.syncT = 0;
  }

  get s() { return this.g.state; }

  begin() {
    const s = this.s;
    s.phase = 'warmup';
    s.time = this.g.online ? 6 : 3;
    s.round = 0;
    s.scores = [0, 0];
    s.lossStreak = [0, 0];
    for (const p of this.g.players.values()) p.money = this.econ ? this.econ.start : 0;
    this.g.broadcast('phase', { phase: s.phase, time: s.time });
  }

  update(dt) {
    const s = this.s, g = this.g;
    if (s.phase === 'over') return;
    s.time -= dt;
    this.syncT -= dt;
    if (this.syncT <= 0) { this.syncT = 1; g.broadcast('sync', g.syncPayload()); }

    if (s.phase === 'warmup') {
      if (g.waitingForPlayers() && s.time > -12) return;
      if (s.time <= 0) RESPAWN_KINDS.has(this.mode.kind) ? this.startFFA() : this.startRound();
      return;
    }
    if (RESPAWN_KINDS.has(this.mode.kind)) return this.updateFFA(dt);
    if (s.phase === 'buy' && s.time <= 0) {
      s.phase = 'live'; s.time = this.mode.roundTime;
      g.broadcast('phase', { phase: 'live', time: s.time });
      return;
    }
    if (s.phase === 'live') return this.checkLive(dt);
    if (s.phase === 'post' && s.time <= 0) this.afterRound();
  }

  aliveCount(team) {
    let n = 0;
    for (const p of this.g.players.values()) if (p.team === team && p.alive) n++;
    return n;
  }

  checkLive(dt) {
    const s = this.s, g = this.g;
    const a0 = this.aliveCount(0), a1 = this.aliveCount(1);
    if (this.mode.kind === 'bomb') {
      const b = s.bomb;
      if (b.state === 'planted') {
        b.time -= dt;
        if (b.time <= 0) {
          b.state = 'exploded';
          g.broadcast('bomb', { ...b });
          this.bombDamage(b.pos);
          return this.endRound(0, 'bomb');
        }
        if (a1 === 0) return this.endRound(0, 'elim');
        return;
      }
      if (b.state === 'dropped') {
        for (const p of g.players.values()) {
          if (p.alive && p.team === 0 && Math.hypot(p.pos.x - b.pos[0], p.pos.z - b.pos[2]) < 1.3) {
            s.bomb = { state: 'carried', carrier: p.id };
            g.broadcast('bomb', s.bomb);
            break;
          }
        }
      }
      if (a0 === 0) return this.endRound(1, 'elim');
      if (a1 === 0) return this.endRound(0, 'elim');
      if (s.time <= 0) return this.endRound(1, 'time');
      return;
    }
    if (a0 === 0 && a1 === 0) return this.endRound(-1, 'draw');
    if (a0 === 0) return this.endRound(1, 'elim');
    if (a1 === 0) return this.endRound(0, 'elim');
    if (s.time <= 0) {
      let h0 = 0, h1 = 0;
      for (const p of g.players.values()) if (p.alive) { if (p.team === 0) h0 += p.hp; else h1 += p.hp; }
      this.endRound(h0 === h1 ? -1 : h0 > h1 ? 0 : 1, 'time');
    }
  }

  bombDamage(pos) {
    const c = new THREE.Vector3(pos[0], pos[1] + 0.5, pos[2]);
    for (const p of this.g.players.values()) {
      if (!p.alive) continue;
      const d = p.pos.distanceTo(c);
      if (d < 20) this.g.hostDamage(null, p, 240 * (1 - d / 20), 'body', 'bomb');
    }
  }

  spawnPoints(team, n) {
    const w = this.g.world;
    const cells = [...(w.spawnCells[team] || w.allFloor)].sort(() => Math.random() - 0.5);
    const center = new THREE.Vector3(w.size.x / 2, 0, w.size.z / 2);
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = cells[i % cells.length];
      const x = (c.x + 0.5) * CELL + (Math.random() - 0.5) * 0.6, z = (c.y + 0.5) * CELL + (Math.random() - 0.5) * 0.6;
      const yaw = Math.atan2(-(center.x - x), -(center.z - z));
      out.push([x, w.heightAt(x, z), z, yaw]);
    }
    return out;
  }

  // True if any part of a body standing at `e` can be seen from a player standing at `pt`
  // (standing or crouched eye, against head, chest and knees).
  canSeeBody(pt, e) {
    const w = this.g.world;
    for (const eyeH of [1.64, 1.14]) {
      const eye = new THREE.Vector3(pt[0], pt[1] + eyeH, pt[2]);
      for (const h of [1.75, 1.15, 0.45]) if (w.lineOfSight(eye, new THREE.Vector3(e[0], e[1] + h, e[2]))) return true;
    }
    return false;
  }

  // Picks a starting view direction with no enemy in sight. Prefers facing `preferYaw`
  // (the map centre); falls back to the direction that shows the fewest enemies.
  safeYaw(pt, enemies, preferYaw) { return this.safeYawInfo(pt, enemies, preferYaw).yaw; }

  // Returns {yaw, seen, visible}: the chosen direction, how many enemies are still on screen
  // from it, and how many have any line of sight at all.
  safeYawInfo(pt, enemies, preferYaw) {
    const visible = enemies.filter((e) => this.canSeeBody(pt, e));
    // Wider than the widest view: 110° vertical FOV on a 21:9 screen is ~74° each side.
    // Each enemy also gets a small angular margin for its body width.
    const HALF_VIEW = THREE.MathUtils.degToRad(84);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    let best = preferYaw, bestScore = -Infinity, bestSeen = 0;
    const w = this.g.world, eye = new THREE.Vector3(pt[0], pt[1] + 1.64, pt[2]);
    for (let i = 0; i < 36; i++) {
      const yaw = (i / 36) * Math.PI * 2;
      const seen = visible.filter((t) => Math.abs(wrap(Math.atan2(-(t[0] - pt[0]), -(t[2] - pt[2])) - yaw)) < HALF_VIEW).length;
      // Prefer looking toward the map centre and down open space rather than into a nearby wall.
      const hit = w.raycast(eye, new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), 14);
      const open = hit ? hit.dist / 14 : 1;
      const score = -seen * 10 + Math.cos(wrap(yaw - preferYaw)) + open * 1.6;
      if (score > bestScore) { bestScore = score; best = yaw; bestSeen = seen; }
    }
    return { yaw: best, seen: bestSeen, visible: visible.length };
  }

  // Applies safeYaw to a set of spawns given the positions enemies will appear at.
  // Returns how many spawns still have an enemy on screen (0 when every spawn is safe).
  faceAwayFromEnemies(spawns, teamOf) {
    let unsafe = 0;
    for (const [id, pt] of Object.entries(spawns)) {
      const enemies = Object.entries(spawns).filter(([oid]) => oid !== id && teamOf(oid) !== teamOf(id)).map(([, e]) => e);
      const info = this.safeYawInfo(pt, enemies, pt[3]);
      pt[3] = info.yaw;
      if (info.seen) unsafe++;
    }
    return unsafe;
  }

  startRound() {
    const s = this.s, g = this.g, m = this.mode;
    s.round++;
    s.phase = 'buy';
    s.time = m.buyTime;
    // Spawn zones are built so they can't see each other; re-rolling is a second safety net.
    let spawns = {};
    const resetKit = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      spawns = {};
      for (const team of [0, 1]) {
        const ps = [...g.players.values()].filter((p) => p.team === team);
        const pts = this.spawnPoints(team, ps.length);
        ps.forEach((p, i) => { spawns[p.id] = pts[i]; });
      }
      if (!this.faceAwayFromEnemies(spawns, (id) => g.players.get(id)?.team)) break;
    }
    for (const p of g.players.values()) {
      if (!p.alive || !this.econ || s.round === 1 || this.justSwapped) resetKit.push(p.id);
    }
    this.justSwapped = false;
    if (m.kind === 'bomb') {
      const ts = [...g.players.values()].filter((p) => p.team === 0);
      const carrier = ts[Math.floor(Math.random() * ts.length)];
      s.bomb = carrier ? { state: 'carried', carrier: carrier.id } : { state: 'none' };
    } else s.bomb = { state: 'none' };
    const money = {};
    for (const p of g.players.values()) money[p.id] = p.money;
    g.broadcast('round', {
      round: s.round, time: s.time, scores: s.scores, spawns, resetKit, money, bomb: s.bomb,
      teams: Object.fromEntries([...g.players.values()].map((p) => [p.id, p.team])),
      freeArmor: !this.econ,
    });
  }

  endRound(winner, reason) {
    const s = this.s, g = this.g, m = this.mode;
    s.phase = 'post';
    s.time = 5;
    if (winner >= 0) s.scores[winner]++;
    const E = this.econ;
    if (E && winner >= 0) {
      const loser = 1 - winner;
      const winAmt = reason === 'bomb' ? E.winBomb : reason === 'defuse' ? E.winDefuse : E.winElim;
      const lossAmt = Math.min(E.lossMax, E.lossBase + E.lossStep * s.lossStreak[loser]);
      s.lossStreak[winner] = Math.max(0, s.lossStreak[winner] - 1);
      s.lossStreak[loser] = Math.min(4, s.lossStreak[loser] + 1);
      for (const p of g.players.values()) {
        p.money = Math.min(E.max, p.money + (p.team === winner ? winAmt : lossAmt));
      }
    } else if (E) {
      for (const p of g.players.values()) p.money = Math.min(E.max, p.money + E.lossBase);
    }
    const over = this.matchWinner();
    g.broadcast('roundEnd', { winner, reason, scores: s.scores, money: Object.fromEntries([...g.players.values()].map((p) => [p.id, p.money])), over: over !== null });
  }

  matchWinner() {
    const s = this.s, m = this.mode;
    if (s.scores[0] >= m.roundsToWin) return 0;
    if (s.scores[1] >= m.roundsToWin) return 1;
    if (m.halftime && s.round >= m.halftime * 2) return -1;
    if (!m.halftime && s.round >= m.roundsToWin * 2 + 4) return s.scores[0] === s.scores[1] ? -1 : s.scores[0] > s.scores[1] ? 0 : 1;
    return null;
  }

  afterRound() {
    const s = this.s, g = this.g, m = this.mode;
    const w = this.matchWinner();
    if (w !== null) return this.finish(w, 'score');
    if (m.halftime && s.round === m.halftime) {
      for (const p of g.players.values()) { p.team = 1 - p.team; p.money = this.econ.start; }
      s.scores = [s.scores[1], s.scores[0]];
      s.lossStreak = [0, 0];
      this.justSwapped = true;
      g.broadcast('msg', { text: 'Halftime — switching sides', sub: '', time: 3 });
    }
    this.startRound();
  }

  finish(winner, reason) {
    const s = this.s;
    s.phase = 'over';
    this.g.broadcast('end', { winner, reason, scores: s.scores, stats: this.g.statsPayload() });
  }

  // ───────────── respawn modes: free for all, team deathmatch, gun game ─────────────
  startFFA() {
    const s = this.s, g = this.g;
    s.phase = 'live'; s.time = this.mode.timeLimit; s.round = 1; s.scores = [0, 0];
    s.bomb = { state: 'none' };
    const spawns = {};
    const teamOf = (id) => (this.mode.kind === 'tdm' ? g.players.get(id)?.team : id);
    // Everyone appears at once, so place players one by one, each out of sight of those already placed.
    for (const p of g.players.values()) {
      p.gg = 0;
      const enemies = Object.entries(spawns).filter(([id]) => teamOf(id) !== teamOf(p.id)).map(([, e]) => e);
      spawns[p.id] = this.respawnPoint(p, enemies) || this.respawnPoint(p, enemies, true);
    }
    this.faceAwayFromEnemies(spawns, teamOf);
    g.broadcast('round', {
      round: 1, time: s.time, scores: [0, 0], spawns, resetKit: [...g.players.keys()], money: {}, bomb: s.bomb,
      teams: Object.fromEntries([...g.players.values()].map((p) => [p.id, p.team])), freeArmor: true, phase: 'live',
    });
  }

  // Finds a respawn spot with no living enemy on screen. Team modes search outward from the team's
  // zone; solo modes prefer spots far from everyone. Spots no enemy can see at all win over spots where
  // enemies are only behind you. Returns null when nothing is safe yet (the caller retries shortly);
  // `force` returns the least-bad spot instead.
  respawnPoint(p, enemies = null, force = false) {
    const g = this.g, w = g.world;
    if (!enemies) enemies = [...g.players.values()].filter((o) => o !== p && o.alive && g.canDamage(p, o)).map((o) => [o.pos.x, o.pos.y, o.pos.z]);
    const center = [w.size.x / 2, w.size.z / 2];
    let cells;
    if (this.mode.kind === 'tdm') {
      const zone = w.spawnCells[p.team] || w.allFloor;
      const zc = zone.reduce((a, c) => [a[0] + c.x / zone.length, a[1] + c.y / zone.length], [0, 0]);
      const shuffled = [...zone].sort(() => Math.random() - 0.5);
      const near = w.allFloor.filter((c) => !zone.includes(c)).map((c) => ({ c, d: Math.hypot(c.x - zc[0], c.y - zc[1]) + Math.random() * 3 }))
        .sort((a, b) => a.d - b.d).slice(0, 60).map((o) => o.c);
      cells = [...shuffled, ...near];
    } else {
      const others = [...g.players.values()].filter((o) => o !== p && o.alive);
      cells = [];
      for (let i = 0; i < 60; i++) cells.push(w.allFloor[Math.floor(Math.random() * w.allFloor.length)]);
      const far = (c) => Math.min(999, ...others.map((o) => Math.hypot(o.pos.x - (c.x + 0.5) * CELL, o.pos.z - (c.y + 0.5) * CELL)));
      cells = cells.map((c) => ({ c, d: far(c) })).sort((a, b) => b.d - a.d).map((o) => o.c);
    }
    let behind = null, least = null;
    for (const c of cells.slice(0, 70)) {
      const x = (c.x + 0.5) * CELL, z = (c.y + 0.5) * CELL;
      const pt = [x, w.heightAt(x, z), z, Math.atan2(-(center[0] - x), -(center[1] - z))];
      const info = this.safeYawInfo(pt, enemies, pt[3]);
      pt[3] = info.yaw;
      if (!info.visible) return pt;
      if (!info.seen) behind = behind || pt;
      if (!least || info.seen < least.seen) least = { pt, seen: info.seen };
    }
    return behind || (force ? least?.pt : null);
  }

  onKill(killer, victim, weapon) {
    const kind = this.mode.kind, s = this.s;
    if (RESPAWN_KINDS.has(kind)) {
      if (s.phase !== 'live') return;
      // Humans wait long enough to watch the kill cam; bots come straight back.
      this.respawnQueue.set(victim.id, victim.isBot ? (kind === 'gungame' ? 1.5 : 2.5) : (kind === 'gungame' ? 3.6 : 4.2));
      const valid = killer && killer !== victim;
      if (kind === 'ffa' && valid && killer.kills >= this.mode.killsToWin) this.finish(killer.id, 'kills');
      if (kind === 'tdm' && valid && killer.team !== victim.team) {
        s.scores[killer.team]++;
        this.g.broadcast('score', { scores: s.scores });
        if (s.scores[killer.team] >= this.mode.killsToWin) this.finish(killer.team, 'kills');
      }
      if (kind === 'gungame') {
        const last = GUN_GAME_ORDER.length - 1;
        if (valid) {
          if ((killer.gg || 0) >= last) return this.finish(killer.id, 'gungame');
          this.g.broadcast('gg', { id: killer.id, level: (killer.gg || 0) + 1 });
          if (isKnife(weapon) && (victim.gg || 0) > 0) this.g.broadcast('gg', { id: victim.id, level: victim.gg - 1, demoted: true });
        } else if ((victim.gg || 0) > 0) {
          this.g.broadcast('gg', { id: victim.id, level: victim.gg - 1, demoted: true });
        }
      }
      return;
    }
    const b = s.bomb;
    if (b && b.state === 'carried' && b.carrier === victim.id) {
      s.bomb = { state: 'dropped', pos: [victim.pos.x, victim.pos.y, victim.pos.z] };
      this.g.broadcast('bomb', s.bomb);
    }
  }

  updateFFA(dt) {
    const s = this.s, g = this.g;
    for (const [id, t] of this.respawnQueue) {
      const nt = t - dt;
      if (nt > 0) { this.respawnQueue.set(id, nt); continue; }
      const p = g.players.get(id);
      if (!p) { this.respawnQueue.delete(id); continue; }
      // Never respawn someone with an enemy on screen: wait a moment and try again instead.
      const at = this.respawnPoint(p);
      if (!at) { this.respawnQueue.set(id, 0.25); continue; }
      this.respawnQueue.delete(id);
      g.broadcast('respawn', { id, at });
    }
    if (s.time <= 0) {
      const kind = this.mode.kind;
      if (kind === 'tdm') return this.finish(s.scores[0] === s.scores[1] ? -1 : s.scores[0] > s.scores[1] ? 0 : 1, 'time');
      let best = null;
      const rank = (p) => (kind === 'gungame' ? (p.gg || 0) * 1000 + p.kills : p.kills);
      for (const p of g.players.values()) if (!best || rank(p) > rank(best)) best = p;
      this.finish(best ? best.id : -1, 'time');
    }
  }

  // ───────────── requests from clients ─────────────
  onPlant(p, pos) {
    const s = this.s, b = s.bomb;
    if (s.phase !== 'live' || !b || b.state !== 'carried' || b.carrier !== p.id || !p.alive) return;
    const site = this.g.world.siteAt(pos[0], pos[2]);
    if (!site || p.pos.distanceTo(new THREE.Vector3(...pos)) > 2) return;
    s.bomb = { state: 'planted', pos, site, time: this.mode.bombTime, planter: p.id };
    p.money = Math.min(this.econ.max, p.money + this.econ.plant);
    this.g.broadcast('bomb', s.bomb);
  }

  onDefuse(p) {
    const s = this.s, b = s.bomb;
    if (s.phase !== 'live' || !b || b.state !== 'planted' || p.team !== 1 || !p.alive) return;
    if (Math.hypot(p.pos.x - b.pos[0], p.pos.z - b.pos[2]) > 2.4) return;
    s.bomb = { ...b, state: 'defused', defuser: p.id };
    this.g.broadcast('bomb', s.bomb);
    this.endRound(1, 'defuse');
  }
}
