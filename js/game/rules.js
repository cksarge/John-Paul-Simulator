import * as THREE from 'three';
import { CELL } from '../engine/world.js';
import { ECON, GUN_GAME_ORDER } from '../data/weapons.js';
import { RESPAWN_KINDS } from '../data/modes.js';

// Host-only match logic. Everything it decides is broadcast as events that every client applies.
export class Rules {
  constructor(game) {
    this.g = game;
    this.mode = game.mode;
    this.respawnQueue = new Map();
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
    for (const p of this.g.players.values()) p.money = this.mode.kind === 'bomb' ? ECON.start : 0;
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

  startRound() {
    const s = this.s, g = this.g, m = this.mode;
    s.round++;
    s.phase = 'buy';
    s.time = m.buyTime;
    const spawns = {}, resetKit = [];
    for (const team of [0, 1]) {
      const ps = [...g.players.values()].filter((p) => p.team === team);
      const pts = this.spawnPoints(team, ps.length);
      ps.forEach((p, i) => { spawns[p.id] = pts[i]; });
    }
    for (const p of g.players.values()) {
      if (!p.alive || m.kind !== 'bomb' || s.round === 1 || this.justSwapped) resetKit.push(p.id);
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
      freeArmor: m.kind !== 'bomb',
    });
  }

  endRound(winner, reason) {
    const s = this.s, g = this.g, m = this.mode;
    s.phase = 'post';
    s.time = 5;
    if (winner >= 0) s.scores[winner]++;
    if (m.kind === 'bomb' && winner >= 0) {
      const loser = 1 - winner;
      const winAmt = reason === 'bomb' ? ECON.winBomb : reason === 'defuse' ? ECON.winDefuse : ECON.winElim;
      const lossAmt = Math.min(ECON.lossMax, ECON.lossBase + ECON.lossStep * s.lossStreak[loser]);
      s.lossStreak[winner] = Math.max(0, s.lossStreak[winner] - 1);
      s.lossStreak[loser] = Math.min(4, s.lossStreak[loser] + 1);
      for (const p of g.players.values()) {
        p.money = Math.min(ECON.max, p.money + (p.team === winner ? winAmt : lossAmt));
      }
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
      for (const p of g.players.values()) { p.team = 1 - p.team; p.money = ECON.start; }
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
    for (const p of g.players.values()) { p.gg = 0; spawns[p.id] = this.respawnPoint(p); }
    g.broadcast('round', {
      round: 1, time: s.time, scores: [0, 0], spawns, resetKit: [...g.players.keys()], money: {}, bomb: s.bomb,
      teams: Object.fromEntries([...g.players.values()].map((p) => [p.id, p.team])), freeArmor: true, phase: 'live',
    });
  }

  // Team modes spawn in the team's zone; solo modes pick the open cell furthest from everyone.
  respawnPoint(p) {
    if (this.mode.kind === 'tdm') {
      const pts = this.spawnPoints(p.team, 6);
      let best = pts[0], bestD = -1;
      for (const pt of pts) {
        let minD = 999;
        for (const o of this.g.players.values()) if (o !== p && o.alive && o.team !== p.team) minD = Math.min(minD, Math.hypot(o.pos.x - pt[0], o.pos.z - pt[2]));
        if (minD > bestD) { bestD = minD; best = pt; }
      }
      return best;
    }
    return this.ffaSpawn(p);
  }

  ffaSpawn(p) {
    const w = this.g.world;
    let best = null, bestD = -1;
    for (let i = 0; i < 40; i++) {
      const c = w.allFloor[Math.floor(Math.random() * w.allFloor.length)];
      const x = (c.x + 0.5) * CELL, z = (c.y + 0.5) * CELL;
      let minD = 999;
      for (const o of this.g.players.values()) if (o !== p && o.alive) minD = Math.min(minD, Math.hypot(o.pos.x - x, o.pos.z - z));
      if (minD > bestD) { bestD = minD; best = [x, 0, z, Math.random() * Math.PI * 2]; }
    }
    return best;
  }

  onKill(killer, victim, weapon) {
    const kind = this.mode.kind, s = this.s;
    if (RESPAWN_KINDS.has(kind)) {
      if (s.phase !== 'live') return;
      this.respawnQueue.set(victim.id, kind === 'gungame' ? 1.5 : 2.5);
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
          if (weapon === 'knife' && (victim.gg || 0) > 0) this.g.broadcast('gg', { id: victim.id, level: victim.gg - 1, demoted: true });
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
      this.respawnQueue.delete(id);
      const p = g.players.get(id);
      if (p) g.broadcast('respawn', { id, at: this.respawnPoint(p) });
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
    p.money = Math.min(ECON.max, p.money + ECON.plant);
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
