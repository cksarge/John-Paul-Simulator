import * as THREE from 'three';
import { CharacterModel } from '../engine/models.js';
import { WEAPONS } from '../data/weapons.js';

const PRONE = [
  ['head', -0.12, 0.24, -1.8, 0.12, 0.7, -1.46],
  ['body', -0.25, 0, -1.48, 0.25, 0.64, -0.8],
  ['legs', -0.17, 0, -0.86, 0.17, 0.5, 0.02],
];
const tmpMin = new THREE.Vector3(), tmpMax = new THREE.Vector3(), tmpO = new THREE.Vector3(), tmpD = new THREE.Vector3();

function rayBox(o, d, min, max) {
  let tmin = 0, tmax = Infinity;
  for (const a of ['x', 'y', 'z']) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < min[a] || o[a] > max[a]) return -1; continue; }
    let t1 = (min[a] - o[a]) / d[a], t2 = (max[a] - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

// One combatant: the local player, a remote human, or a bot.
export class Player {
  constructor(info) {
    this.id = info.id;
    this.name = info.name;
    this.team = info.team ?? 0;
    this.isBot = !!info.isBot;
    this.char = info.char;
    this.elo = info.elo ?? 1000;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = 0.3;
    this.yaw = 0; this.pitch = 0;
    this.crouch = 0; this.crouching = false; this.walking = false;
    this.onGround = true;
    this.hp = 100; this.armor = 0; this.helmet = false;
    this.alive = false;
    this.money = 800;
    this.kills = 0; this.deaths = 0; this.hs = 0; this.score = 0; this.damage = 0;
    this.resetKit();
    this.buffer = [];
    this.netSpeed = 0;
    this.firingT = 0;
    this.stepDist = 0;
    this.model = null;
  }

  resetKit() {
    this.inv = { primary: null, secondary: 'p9', melee: this.knifePref || 'knife', nades: [] };
    this.ammo = {};
    this.giveAmmo('p9');
    this.slot = 'secondary';
    this.lastSlot = 'melee';
    this.ws = { cooldown: 0, reloadT: -1, drawT: 0, spray: 0, scope: 0, nadeIdx: 0 };
  }

  giveAmmo(id) {
    const w = WEAPONS[id];
    if (w && w.mag) this.ammo[id] = { mag: w.mag, reserve: w.reserve };
  }

  get weaponId() {
    if (this.slot === 'nade') return this.inv.nades[this.ws.nadeIdx % Math.max(1, this.inv.nades.length)] || null;
    if (this.slot === 'bomb') return 'bomb';
    return this.inv[this.slot];
  }
  get weapon() { return WEAPONS[this.weaponId] || null; }

  height() { return 1.8 - this.crouch * 0.55; }
  eyeY() { return this.pos.y + 1.64 - this.crouch * 0.5; }
  eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.eyeY(), this.pos.z); }
  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // Hitboxes, in the player's own frame (x right, z backward, y up from the feet), measured from the
  // match model (models.js, MATCH_SCALE) so they cover what other players see:
  // - head: follows the eye, leans forward when crouched and with aim pitch (the head tilts with it)
  // - body: hips to neck; legs: feet to hips, folding back under the body when crouched and widening
  //   front-to-back while running (stride).
  // Every operator has the same boxes regardless of height, build or headgear.
  hitboxes() {
    // Push-ups lay the model flat in front of the player (measured from the emote's whole cycle).
    const em = this.model?.emote;
    if (em?.id === 'pushups' && em.t > 0.3 && em.t < em.dur - 0.3) return PRONE;
    const c = this.crouch, eye = this.eyeY() - this.pos.y;
    const fwd = 0.17 * c - 0.137 * this.pitch;
    const hips = 0.86 - 0.4 * c;
    const stride = 0.2 * Math.min(1, (this.isRemoteView ? this.netSpeed : Math.hypot(this.vel.x, this.vel.z)) / 5.5);
    return [
      ['head', -0.13, eye - 0.15, -fwd - 0.13, 0.13, eye + 0.17, -fwd + 0.13],
      ['body', -0.21, hips, -0.21 - 0.06 * c, 0.21, eye - 0.15, 0.17 - 0.05 * c],
      ['legs', -0.18, 0, -0.16 + 0.11 * c - stride, 0.18, hips, 0.1 + 0.35 * c + stride],
    ];
  }

  // Centre of the head hitbox in world space (what bots aim at for headshots).
  headCenter(out = new THREE.Vector3()) {
    const [, ax, ay, az, bx, by, bz] = this.hitboxes()[0];
    const lx = (ax + bx) / 2, ly = (ay + by) / 2, lz = (az + bz) / 2;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    return out.set(this.pos.x + lx * cy + lz * sy, this.pos.y + ly, this.pos.z - lx * sy + lz * cy);
  }

  // Ray vs hitboxes. Returns {dist, part} for the nearest hit part or null.
  hitTest(o, d, maxDist) {
    if (!this.alive) return null;
    const p = this.pos;
    // Broad phase (wide enough for the push-up pose, which reaches 1.8 m in front)
    tmpMin.set(p.x - 1.9, p.y, p.z - 1.9); tmpMax.set(p.x + 1.9, p.y + this.height() + 0.15, p.z + 1.9);
    const broad = rayBox(o, d, tmpMin, tmpMax);
    if (broad < 0 || broad > maxDist) return null;
    // Into the player's frame: the model faces -z when yaw = 0 and turns with yaw.
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const ox = o.x - p.x, oz = o.z - p.z;
    tmpO.set(ox * cy - oz * sy, o.y - p.y, ox * sy + oz * cy);
    tmpD.set(d.x * cy - d.z * sy, d.y, d.x * sy + d.z * cy);
    let best = null;
    for (const [part, ax, ay, az, bx, by, bz] of this.hitboxes()) {
      tmpMin.set(ax, ay, az); tmpMax.set(bx, by, bz);
      const t = rayBox(tmpO, tmpD, tmpMin, tmpMax);
      if (t >= 0 && t <= maxDist && (!best || t < best.dist)) best = { dist: t, part };
    }
    return best;
  }

  ensureModel(scene, teamColored) {
    if (this.model) return this.model;
    this.model = new CharacterModel(this.char, { team: teamColored ? this.team : -1, match: true });
    scene.add(this.model.root);
    return this.model;
  }

  syncModel(dt, visible) {
    const m = this.model;
    if (!m) return;
    m.root.visible = visible;
    if (!visible) return;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    m.setWeapon(this.isRemoteView ? (this.remoteWeapon || this.weaponId) : this.weaponId);
    const speed = this.isRemoteView ? this.netSpeed : Math.hypot(this.vel.x, this.vel.z);
    m.update(dt, { speed, crouch: this.crouch, pitch: this.pitch, onGround: this.onGround, firing: this.firingT > 0 });
  }

  // Buffered snapshot interpolation for players simulated elsewhere.
  pushState(s, now) {
    // Packets sent before a respawn can arrive after it; don't drag the player back to where they died.
    if (now - (this.snapAt || 0) < 700 && Math.hypot(s.p[0] - this.pos.x, s.p[2] - this.pos.z) > 5) return;
    this.buffer.push({ t: now, x: s.p[0], y: s.p[1], z: s.p[2], yaw: s.y, pitch: s.pi, crouch: s.c, w: s.w, g: s.g });
    if (this.buffer.length > 30) this.buffer.shift();
  }

  interpolate(now, delay) {
    const b = this.buffer;
    if (!b.length) return;
    const t = now - delay;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > t) i--;
    const a = b[Math.max(0, i - 1)], c = b[i];
    const span = c.t - a.t;
    const k = span > 0 ? THREE.MathUtils.clamp((t - a.t) / span, 0, 1) : 1;
    const nx = a.x + (c.x - a.x) * k, ny = a.y + (c.y - a.y) * k, nz = a.z + (c.z - a.z) * k;
    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.set(nx, ny, nz);
    let dy = c.yaw - a.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw = a.yaw + dy * k;
    this.pitch = a.pitch + (c.pitch - a.pitch) * k;
    this.crouch = a.crouch + (c.crouch - a.crouch) * k;
    this.onGround = c.g !== 0;
    if (c.w) this.remoteWeapon = c.w;
    const dt = 1 / 60;
    const sp = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ) / dt;
    this.netSpeed += (Math.min(sp, 8) - this.netSpeed) * 0.2;
  }

  snapTo(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = 0;
    this.buffer = [];
    this.snapAt = performance.now();
  }
}
