import * as THREE from 'three';
import { WEAPONS } from '../data/weapons.js';

const SLOT_ORDER = ['primary', 'secondary', 'melee', 'nade', 'bomb'];

export function hasSlot(p, slot) {
  if (slot === 'nade') return p.inv.nades.length > 0;
  if (slot === 'bomb') return !!p.hasBomb;
  return !!p.inv[slot];
}

export function switchSlot(p, slot) {
  if (!hasSlot(p, slot)) return false;
  if (slot === p.slot) {
    if (slot === 'nade' && p.inv.nades.length > 1) { p.ws.nadeIdx = (p.ws.nadeIdx + 1) % p.inv.nades.length; p.ws.drawT = 0; return true; }
    return false;
  }
  p.lastSlot = p.slot;
  p.slot = slot;
  p.ws.reloadT = -1;
  p.ws.drawT = 0;
  p.ws.scope = 0;
  p.ws.spray = 0;
  p.burstLeft = 0;
  p.ws.cooldown = Math.max(p.ws.cooldown, 0);
  return true;
}

export function cycleSlot(p, dir) {
  let i = SLOT_ORDER.indexOf(p.slot);
  for (let k = 0; k < SLOT_ORDER.length; k++) {
    i = (i + dir + SLOT_ORDER.length) % SLOT_ORDER.length;
    if (hasSlot(p, SLOT_ORDER[i])) return switchSlot(p, SLOT_ORDER[i]);
  }
  return false;
}

export function bestSlot(p) {
  for (const s of ['primary', 'secondary', 'melee']) if (hasSlot(p, s)) return s;
  return 'melee';
}

// Perk-adjusted timings.
export function reloadTime(p, w) { return w.reload * (p.char?.perk === 'speedloader' ? 0.8 : 1); }
export function maxNades(p) { return p.char?.perk === 'utility' ? 3 : 2; }

export function startReload(p) {
  const w = p.weapon;
  if (!w || !w.mag) return false;
  const a = p.ammo[w.id];
  if (!a || a.mag >= w.mag || a.reserve <= 0 || p.ws.reloadT >= 0) return false;
  p.ws.reloadT = 0;
  p.ws.scope = 0;
  return true;
}

// Advances cooldown/reload/draw. Returns true the frame a reload finishes.
export function tickWeapon(p, dt, firing) {
  const ws = p.ws, w = p.weapon;
  ws.cooldown -= dt;
  ws.drawT += dt;
  if (!firing && ws.cooldown < -0.05) ws.spray = Math.max(0, ws.spray - dt * (w?.spreadRecover ? 3 / w.spreadRecover : 8));
  if (ws.reloadT >= 0 && w?.mag) {
    ws.reloadT += dt;
    if (ws.reloadT >= reloadTime(p, w)) {
      const a = p.ammo[w.id];
      const take = Math.min(w.mag - a.mag, a.reserve);
      a.mag += take; a.reserve -= take;
      ws.reloadT = -1;
      return true;
    }
  }
  return false;
}

export function ready(p) {
  const w = p.weapon;
  if (!w && !(p.slot === 'nade' && p.weaponId)) return false;
  return p.ws.cooldown <= 0 && p.ws.reloadT < 0 && p.ws.drawT >= (w?.draw || 0.4);
}

export function spreadFor(p) {
  const w = p.weapon;
  if (!w || !w.spread) return 0;
  const speed = Math.hypot(p.vel.x, p.vel.z);
  let s = p.ws.scope > 0 && w.scopedSpread !== undefined ? w.scopedSpread : w.spread;
  s += w.moveSpread * THREE.MathUtils.clamp((speed - 1.2) / 4, 0, 1);
  if (!p.onGround) s += w.airSpread;
  s += Math.min(p.ws.spray, 14) * w.spreadPerShot;
  if (p.crouch > 0.5) s *= 0.8;
  return s;
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
export function applySpread(dir, spread, rand = Math.random) {
  if (spread <= 0) return dir.clone();
  const up = Math.abs(dir.y) > 0.99 ? tmpA.set(1, 0, 0) : tmpA.set(0, 1, 0);
  const right = tmpB.crossVectors(dir, up).normalize();
  const up2 = new THREE.Vector3().crossVectors(right, dir).normalize();
  const r = spread * Math.sqrt(rand()), a = rand() * Math.PI * 2;
  return dir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r).normalize();
}

// Traces one bullet. Returns {end, normal, victim, part, dist}.
export function traceBullet(game, shooter, origin, dir, range = 200) {
  const wall = game.world.raycast(origin, dir, range);
  const maxD = wall ? wall.dist : range;
  let best = null;
  for (const p of game.players.values()) {
    if (p === shooter || !p.alive) continue;
    if (!game.canDamage(shooter, p)) continue;
    const h = p.hitTest(origin, dir, maxD);
    if (h && (!best || h.dist < best.dist)) best = { victim: p, part: h.part, dist: h.dist };
  }
  if (best) return { ...best, end: origin.clone().addScaledVector(dir, best.dist), normal: dir.clone().negate() };
  if (wall) return { end: wall.point, normal: wall.normal, dist: wall.dist };
  return { end: origin.clone().addScaledVector(dir, range), normal: null, dist: range };
}

export function bulletDamage(w, part, dist) {
  let dmg = w.damage * Math.pow(w.rangeMod ?? 1, dist / 12.5);
  if (part === 'head') dmg *= w.hsMult;
  else if (part === 'legs') dmg *= w.legMult;
  return dmg;
}
