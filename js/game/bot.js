import * as THREE from 'three';
import { switchSlot, startReload, bestSlot } from './combat.js';

// reaction: seconds before a bot starts shooting at someone it just spotted.
// error: aim offset (radians) when it starts; settle: how fast that offset shrinks per second.
// minErr: the fraction of the error that never goes away. nades: chance to throw utility when it can.
export const BOT_LEVELS = {
  easy: { reaction: 0.95, turn: 2.4, error: 0.14, settle: 0.45, minErr: 0.45, fov: 95, headChance: 0.04, strafe: 0.08, burst: 3, nades: 0.03 },
  normal: { reaction: 0.68, turn: 3.6, error: 0.095, settle: 0.7, minErr: 0.3, fov: 100, headChance: 0.12, strafe: 0.22, burst: 4, nades: 0.06 },
  hard: { reaction: 0.3, turn: 9, error: 0.035, settle: 1.2, minErr: 0.15, fov: 120, headChance: 0.5, strafe: 0.55, burst: 7, nades: 0.12 },
  elite: { reaction: 0.16, turn: 16, error: 0.016, settle: 1.3, minErr: 0.15, fov: 130, headChance: 0.75, strafe: 0.8, burst: 9, nades: 0.18 },
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
    this.blindT = 0;
  }

  blind(t) { this.blindT = Math.max(this.blindT, t); if (t > 0.6) { this.target = null; this.seenT = 0; } }

  enemies() {
    const out = [];
    for (const o of this.g.players.values()) if (o !== this.p && o.alive && this.g.canDamage(this.p, o)) out.push(o);
    return out;
  }

  canSee(o) {
    if (this.blindT > 0.4) return false;
    const eye = this.p.eye(), dst = o.eye().setY(o.eyeY() - 0.35);
    const d = dst.clone().sub(eye);
    const dist = d.length();
    if (dist > (this.g.sightRange || 75)) return false;
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
    if (kind === 'hostage') return this.hostageGoal();
    if (kind === 'bomb' || kind === 'retake') {
      const b = g.state.bomb || {};
      if (p.team === 0) {
        if (b.state === 'dropped') return new THREE.Vector3(...b.pos);
        if (b.state === 'planted') {
          if (!this.holdSpot || this.holdSpot.distanceTo(new THREE.Vector3(...b.pos)) > 10) {
            this.holdSpot = w.randomCellIn(w.sites[b.site].rects);
          }
          return this.holdSpot;
        }
        const site = g.botPlan.site;
        if (!this.siteSpot || this.site !== site) { this.site = site; this.siteSpot = w.randomCellIn(w.sites[site].rects); }
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
        this.holdSpot = w.randomCellIn(w.sites[site].rects);
      }
      return this.holdSpot;
    }
    if (this.lastSeen && this.lostT < 5) return this.lastSeen;
    const enemies = this.enemies();
    if (!enemies.length) return null;
    const e = enemies[Math.floor(Math.random() * enemies.length)];
    return e.pos.clone();
  }

  // Attackers fetch the nearest free hostage and carry it home; defenders guard the hostage site.
  hostageGoal() {
    const g = this.g, p = this.p, w = g.world, list = g.state.hostages || [];
    if (p.team === 0) {
      if (list.some((h) => h.carrier === p.id)) {
        if (!this.homeSpot) this.homeSpot = w.randomCellIn(g.mapDef.spawns[0]);
        return this.homeSpot;
      }
      this.homeSpot = null;
      let best = null, bd = Infinity;
      for (const h of list) {
        if (h.state !== 'idle') continue;
        const d = Math.hypot(p.pos.x - h.pos[0], p.pos.z - h.pos[2]);
        if (d < bd) { bd = d; best = h; }
      }
      // Escort whoever is carrying, or head for a hostage.
      const carried = list.find((h) => h.state === 'carried');
      if (!best && carried) return new THREE.Vector3(...carried.pos);
      if (this.lastSeen && this.lostT < 4 && bd > 12) return this.lastSeen;
      return best ? new THREE.Vector3(...best.pos) : null;
    }
    const carried = list.find((h) => h.state === 'carried');
    if (carried) return new THREE.Vector3(...carried.pos);
    if (this.lastSeen && this.lostT < 6) return this.lastSeen;
    const site = list[0]?.site;
    if (site && (!this.holdSpot || this.holdSite !== site)) { this.holdSite = site; this.holdSpot = w.randomCellIn(w.sites[site].rects); }
    return this.holdSpot || null;
  }

  update(dt) {
    const p = this.p, g = this.g;
    if (!p.alive) return;
    this.hurtT = (this.hurtT || 0) - dt;
    this.blindT = Math.max(0, this.blindT - dt);
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
      const aimPoint = this.aimHead ? t.headCenter() : t.pos.clone().setY(t.pos.y + t.height() * 0.66);
      const eye = p.eye();
      const d = aimPoint.sub(eye);
      const dist = d.length();
      const errScale = this.L.error * Math.max(this.L.minErr, 1 - (this.seenT - this.L.reaction) * this.L.settle) * (1 + Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 5) * 0.5);
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
    if (fire || p.burstLeft > 0) g.tryFire(p, false);
    if (!fire) g.releaseTrigger(p);
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
    if (this.blindT > 0) return;
    this.maybeThrow();

    // Objectives
    const b = g.state.bomb || {};
    if ((g.mode.kind === 'bomb' || g.mode.kind === 'retake') && g.state.phase === 'live') {
      if (p.team === 0 && b.state === 'carried' && b.carrier === p.id && g.world.siteAt(p.pos.x, p.pos.z) && !this.action) {
        this.action = 'plant'; this.actionT = 0;
      }
      if (p.team === 1 && b.state === 'planted' && Math.hypot(p.pos.x - b.pos[0], p.pos.z - b.pos[2]) < 1.8 && !this.action) {
        this.action = 'defuse'; this.actionT = 0;
      }
    }
    if (g.mode.kind === 'hostage' && g.state.phase === 'live' && !this.action && g.hostageView?.usable(p)) {
      this.action = 'pickup'; this.actionT = 0; this.pickup = g.hostageView.usable(p).i;
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

  // Lobs a grenade toward where an enemy was last seen, now and then.
  maybeThrow() {
    const p = this.p, g = this.g;
    if (g.state.phase !== 'live' || !this.lastSeen || this.lostT < 0.4 || this.lostT > 3 || this.action) return;
    const kinds = p.inv.nades.filter((k) => k === 'he' || k === 'fire' || k === 'flash' || k === 'mine');
    if (!kinds.length || Math.random() > this.L.nades) return;
    const d = this.lastSeen.clone().sub(p.pos), dist = Math.hypot(d.x, d.z);
    if (dist < 6 || dist > 26) return;
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    p.yaw = Math.atan2(-d.x, -d.z);
    p.pitch = THREE.MathUtils.clamp(0.08 + dist * 0.012, 0.1, 0.45);
    switchSlot(p, 'nade');
    p.ws.nadeIdx = p.inv.nades.indexOf(kind);
    p.ws.drawT = 1; p.ws.cooldown = 0;
    g.throwNade(p);
  }

  navigate() {
    const p = this.p;
    if (!this.path || this.pathI >= this.path.length) {
      this.lookAt = (this.g.mode.kind === 'bomb' || this.g.mode.kind === 'hostage') && p.team === 1 ? new THREE.Vector3(this.g.world.size.x / 2, 0, this.g.world.size.z / 2) : null;
      return new THREE.Vector3();
    }
    const wp = this.path[this.pathI];
    const dx = wp.x - p.pos.x, dz = wp.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    // Open closed doors on the route.
    const cx = Math.floor(wp.x / 2), cy = Math.floor(wp.z / 2), door = this.g.world.prop(cx, cy);
    if (door && door.ch === 'D' && !door.open && d < 2.6 && !(this.doorT > performance.now())) {
      this.doorT = performance.now() + 1000;
      this.g.request('door', { cell: [cx, cy] }, p);
    }
    if (d < 0.7) { this.pathI++; return this.navigate(); }
    return new THREE.Vector3(dx / d, 0, dz / d);
  }

  doAction(dt) {
    const g = this.g, p = this.p;
    this.actionT += dt;
    const b = g.state.bomb || {};
    if (this.action === 'plant') {
      if (b.state !== 'carried' || b.carrier !== p.id) { this.action = null; return; }
      p.plantProgress = this.actionT / g.actionTime('plant', p);
      if (this.actionT >= g.actionTime('plant', p)) { g.request('plant', { pos: [p.pos.x, p.pos.y, p.pos.z] }, p); this.action = null; p.plantProgress = 0; }
    } else if (this.action === 'pickup') {
      const h = g.state.hostages?.[this.pickup];
      if (!h || h.state !== 'idle' || Math.hypot(p.pos.x - h.pos[0], p.pos.z - h.pos[2]) > 2.2) { this.action = null; return; }
      if (this.actionT >= g.mode.pickupTime) { g.request('pickup', { i: this.pickup }, p); this.action = null; }
    } else if (this.action === 'defuse') {
      if (b.state !== 'planted') { this.action = null; return; }
      if (this.actionT >= g.actionTime('defuse', p)) { g.request('defuse', {}, p); this.action = null; }
    }
  }
}
