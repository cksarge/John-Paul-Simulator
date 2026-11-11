import * as THREE from 'three';
import { switchSlot, startReload, bestSlot } from './combat.js';

export const BOT_LEVELS = {
  easy: { reaction: 0.7, turn: 3.2, error: 0.1, fov: 100, headChance: 0.1, strafe: 0.1, burst: 3 },
  normal: { reaction: 0.42, turn: 6, error: 0.055, fov: 110, headChance: 0.3, strafe: 0.35, burst: 5 },
  hard: { reaction: 0.26, turn: 10, error: 0.03, fov: 120, headChance: 0.55, strafe: 0.6, burst: 7 },
  elite: { reaction: 0.16, turn: 16, error: 0.016, fov: 130, headChance: 0.75, strafe: 0.8, burst: 9 },
};

const BOT_NAMES = ['Hollis', 'Brandt', 'Vasquez', 'Petrov', 'Kade', 'Moreau', 'Sato', 'Novak', 'Ibarra', 'Quinn', 'Rourke', 'Falk', 'Abara', 'Dunmore', 'Lark', 'Ostrova', 'Teague', 'Wilder'];
export function botName(i) { return 'BOT ' + BOT_NAMES[i % BOT_NAMES.length]; }

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Host-side AI for one bot player.
export class BotBrain {
  constructor(game, p, level = 'normal') {
    this.g = game; this.p = p;
    this.L = BOT_LEVELS[level] || BOT_LEVELS.normal;
    this.reset();
  }

  reset() {
    this.path = null; this.pathI = 0; this.goal = null; this.goalT = 0;
    this.target = null; this.seenT = 0; this.lostT = 0; this.lastSeen = null;
    this.thinkT = Math.random() * 0.2; this.stuckT = 0; this.lastPos = this.p.pos.clone();
    this.aimErr = new THREE.Vector2((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0;
    this.holdSpot = null; this.action = null; this.actionT = 0; this.burstLeft = 0; this.pauseT = 0;
    this.site = null;
  }

  enemies() {
    const out = [];
    for (const o of this.g.players.values()) if (o !== this.p && o.alive && this.g.canDamage(this.p, o)) out.push(o);
    return out;
  }

  canSee(o) {
    const eye = this.p.eye(), dst = o.eye().setY(o.eyeY() - 0.35);
    const d = dst.clone().sub(eye);
    const dist = d.length();
    if (dist > 75) return false;
    const fwd = new THREE.Vector3(-Math.sin(this.p.yaw), 0, -Math.cos(this.p.yaw));
    const flat = new THREE.Vector3(d.x, 0, d.z).normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(fwd.dot(flat), -1, 1));
    if (ang > THREE.MathUtils.degToRad(this.L.fov / 2) && dist > 4 && !(this.hurtT > 0)) return false;
    if (!this.g.world.lineOfSight(eye, dst) && !this.g.world.lineOfSight(eye, o.eye())) return false;
    if (this.g.effects.smokeBlocks(eye, dst)) return false;
    return true;
  }

  onDamaged(by) {
    this.hurtT = 1.5;
    if (by && by.alive) { this.lastSeen = by.pos.clone(); this.p.yaw += angleDiff(this.p.yaw, Math.atan2(-(by.pos.x - this.p.pos.x), -(by.pos.z - this.p.pos.z))) * 0.5; }
  }

  chooseGoal() {
    const g = this.g, p = this.p, w = g.world, kind = g.mode.kind;
    if (kind === 'bomb') {
      const b = g.state.bomb || {};
      if (p.team === 0) {
        if (b.state === 'dropped') return new THREE.Vector3(...b.pos);
        if (b.state === 'planted') {
          if (!this.holdSpot || this.holdSpot.distanceTo(new THREE.Vector3(...b.pos)) > 10) {
            const [x0, y0, x1, y1] = w.sites[b.site].cells;
            this.holdSpot = w.randomCellIn([x0, y0, x1, y1]);
          }
          return this.holdSpot;
        }
        const site = g.botPlan.site;
        if (!this.siteSpot || this.site !== site) { this.site = site; this.siteSpot = w.randomCellIn(w.sites[site].cells); }
        if (b.carrier === p.id) return this.siteSpot;
        // Escorts trail behind the carrier slightly, then spread across the site.
        if (g.state.phase === 'live' && g.state.time > g.mode.roundTime - 25 && Math.random() < 0.5) return this.lastSeen || this.siteSpot;
        return this.siteSpot;
      }
      if (b.state === 'planted') return new THREE.Vector3(...b.pos);
      if (this.lastSeen && this.lostT < 6) return this.lastSeen;
      if (!this.holdSpot) {
        const sites = Object.keys(w.sites);
        const site = sites[g.botPlan.ctIndex++ % sites.length];
        this.holdSpot = w.randomCellIn(w.sites[site].cells);
      }
      return this.holdSpot;
    }
    if (this.lastSeen && this.lostT < 5) return this.lastSeen;
    const enemies = this.enemies();
    if (!enemies.length) return null;
    const e = enemies[Math.floor(Math.random() * enemies.length)];
    return e.pos.clone();
  }

  update(dt) {
    const p = this.p, g = this.g;
    if (!p.alive) return;
    this.hurtT = (this.hurtT || 0) - dt;
    this.thinkT -= dt;
    const frozen = g.state.phase === 'buy' || g.state.phase === 'warmup';
    if (this.thinkT <= 0) { this.thinkT = 0.15 + Math.random() * 0.1; this.think(); }

    // Pick weapon
    if (p.slot !== bestSlot(p) && !this.action && (p.slot === 'melee' || p.slot === 'nade' || p.slot === 'bomb' || !p.inv[p.slot])) switchSlot(p, bestSlot(p));
    const w = p.weapon;
    const a = w && p.ammo[w.id];
    if (a && a.mag === 0 && a.reserve === 0) {
      if (p.slot === 'primary' && p.inv.secondary) switchSlot(p, 'secondary');
      else if (p.slot !== 'melee') switchSlot(p, 'melee');
    }

    let wish = new THREE.Vector3(), walk = false, crouch = false, fire = false;
    const t = this.target;
    if (t && t.alive && this.seenT >= this.L.reaction) {
      // Combat: aim, fire in bursts, strafe a little.
      const aimPoint = t.pos.clone();
      aimPoint.y = this.aimHead ? t.eyeY() + 0.02 : t.pos.y + t.height() * 0.66;
      const eye = p.eye();
      const d = aimPoint.sub(eye);
      const dist = d.length();
      const errScale = this.L.error * Math.max(0.15, 1 - (this.seenT - this.L.reaction) * 1.3);
      const wantYaw = Math.atan2(-d.x, -d.z) + this.aimErr.x * errScale;
      const wantPitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) + this.aimErr.y * errScale * 0.6;
      const k = Math.min(1, dt * this.L.turn);
      p.yaw += angleDiff(p.yaw, wantYaw) * k;
      p.pitch += (wantPitch - p.pitch) * k;
      const off = Math.abs(angleDiff(p.yaw, wantYaw)) + Math.abs(wantPitch - p.pitch);
      const tolerance = Math.max(0.025, Math.atan2(0.3, dist));
      if (w && w.type === 'knife') {
        wish.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
        fire = dist < 1.9;
      } else if (off < tolerance) {
        if (this.pauseT > 0) this.pauseT -= dt;
        else {
          fire = true;
          if (w?.auto) {
            this.burstLeft -= dt / w.fireRate;
            if (this.burstLeft <= 0) { this.burstLeft = this.L.burst * (dist < 12 ? 2 : 1); this.pauseT = dist > 25 ? 0.35 : 0.12; }
          }
        }
      }
      if (w?.type === 'sniper' && p.ws.scope === 0) p.ws.scope = 1;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 0.3 + Math.random() * 0.7; this.strafeDir = Math.random() < this.L.strafe ? -this.strafeDir : this.strafeDir; this.strafing = Math.random() < this.L.strafe; }
      if (this.strafing && !(fire && (w?.type === 'rifle' || w?.type === 'sniper'))) {
        wish.set(Math.cos(p.yaw) * this.strafeDir, 0, -Math.sin(p.yaw) * this.strafeDir);
      }
      crouch = dist > 20 && (w?.type === 'rifle') && this.L.strafe > 0.5 && fire;
    } else {
      p.ws.scope = 0;
      if (a && a.mag < (w.mag * 0.35) && a.reserve > 0) startReload(p);
      if (this.action) this.doAction(dt);
      else wish = this.navigate(dt);
      if (wish.lengthSq() > 0) {
        const want = Math.atan2(-wish.x, -wish.z);
        p.yaw += angleDiff(p.yaw, want) * Math.min(1, dt * 5);
        p.pitch += (0 - p.pitch) * Math.min(1, dt * 4);
      } else if (this.lookAt) {
        const want = Math.atan2(-(this.lookAt.x - p.pos.x), -(this.lookAt.z - p.pos.z));
        p.yaw += angleDiff(p.yaw, want) * Math.min(1, dt * 3);
      }
    }
    if (frozen) { wish.set(0, 0, 0); fire = false; }
    g.movePlayer(p, wish, dt, { walk, crouch, jump: false });
    if (fire) g.tryFire(p, false);
    else g.releaseTrigger(p);
  }

  think() {
    const p = this.p, g = this.g;
    // Targets
    let best = null, bestD = Infinity;
    for (const e of this.enemies()) {
      if (!this.canSee(e)) continue;
      const d = e.pos.distanceTo(p.pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      if (best !== this.target) {
        this.target = best; this.seenT = 0;
        this.aimErr.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
        this.aimHead = Math.random() < this.L.headChance;
      } else this.seenT += 0.2;
      this.lastSeen = best.pos.clone(); this.lostT = 0;
      this.action = null;
    } else {
      if (this.target) { this.target = null; this.seenT = 0; }
      this.lostT += 0.2;
    }
    if (this.target) return;

    // Objectives
    const b = g.state.bomb || {};
    if (g.mode.kind === 'bomb' && g.state.phase === 'live') {
      if (p.team === 0 && b.state === 'carried' && b.carrier === p.id && g.world.siteAt(p.pos.x, p.pos.z) && !this.action) {
        this.action = 'plant'; this.actionT = 0;
      }
      if (p.team === 1 && b.state === 'planted' && Math.hypot(p.pos.x - b.pos[0], p.pos.z - b.pos[2]) < 1.8 && !this.action) {
        this.action = 'defuse'; this.actionT = 0;
      }
    }
    this.goalT -= 0.2;
    const goal = this.chooseGoal();
    if (goal && (!this.goal || this.goal.distanceTo(goal) > 3 || this.goalT <= 0 || !this.path)) {
      this.goal = goal.clone(); this.goalT = 4 + Math.random() * 4;
      this.path = g.world.findPath(p.pos, this.goal); this.pathI = 0;
    }
    // Stuck detection
    if (p.pos.distanceTo(this.lastPos) < 0.15 && this.path && this.pathI < this.path.length) {
      this.stuckT += 0.2;
      if (this.stuckT > 1.2) { this.path = g.world.findPath(p.pos, this.goal); this.pathI = 0; this.stuckT = 0; }
    } else this.stuckT = 0;
    this.lastPos.copy(p.pos);
  }

  navigate() {
    const p = this.p;
    if (!this.path || this.pathI >= this.path.length) {
      this.lookAt = this.g.mode.kind === 'bomb' && p.team === 1 ? new THREE.Vector3(this.g.world.size.x / 2, 0, this.g.world.size.z / 2) : null;
      return new THREE.Vector3();
    }
    const wp = this.path[this.pathI];
    const dx = wp.x - p.pos.x, dz = wp.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.7) { this.pathI++; return this.navigate(); }
    return new THREE.Vector3(dx / d, 0, dz / d);
  }

  doAction(dt) {
    const g = this.g, p = this.p;
    this.actionT += dt;
    const b = g.state.bomb || {};
    if (this.action === 'plant') {
      if (b.state !== 'carried' || b.carrier !== p.id) { this.action = null; return; }
      p.plantProgress = this.actionT / g.mode.plantTime;
      if (this.actionT >= g.mode.plantTime) { g.request('plant', { pos: [p.pos.x, p.pos.y, p.pos.z] }, p); this.action = null; p.plantProgress = 0; }
    } else if (this.action === 'defuse') {
      if (b.state !== 'planted') { this.action = null; return; }
      if (this.actionT >= g.mode.defuseTime) { g.request('defuse', {}, p); this.action = null; }
    }
  }
}
