import * as THREE from 'three';
import { WEAPONS, GRENADES, PROJECTILES } from '../data/weapons.js';
import { sfx } from '../engine/audio.js';
import { GAME_VERSION } from '../config.js';

// Records a match for the kill cam and full replays: player states at a fixed rate, plus every
// visual effect, positional sound and world change as timestamped events.
export const RATE = 15;
export const STRIDE = 10; // x, y, z, yaw, pitch, crouch, alive, weapon, hp, team
export const ITEM_IDS = [null, ...Object.keys(WEAPONS), ...Object.keys(GRENADES), ...Object.keys(PROJECTILES), 'bomb'];
const ITEM_INDEX = new Map(ITEM_IDS.map((id, i) => [id, i]));

const FX = ['muzzle', 'tracer', 'impact', 'explosion', 'smoke', 'flash', 'fire', 'endFire', 'shatter', 'splinters', 'beam', 'killFx'];
const SFX_SKIP = new Set(['ui', 'ping', 'click', 'buy', 'hit', 'dryFire', 'ringing', 'pickup', 'hurt', 'win', 'lose', 'roundStart']);
export const WORLD_EVENTS = new Set(['door', 'prop', 'round', 'roundEnd', 'bomb', 'kill', 'emote', 'score', 'msg']);

// Plain-data versions of effect arguments (Vector3 → array; fire handles → ids).
function pack(a) {
  if (a && a.isVector3) return { v: [+a.x.toFixed(2), +a.y.toFixed(2), +a.z.toFixed(2)] };
  if (a && typeof a === 'object' && a.__rid !== undefined) return { fire: a.__rid };
  if (a && typeof a === 'object') return JSON.parse(JSON.stringify(a));
  return a;
}
export function unpack(a, fires) {
  if (a && a.v) return new THREE.Vector3(...a.v);
  if (a && a.fire !== undefined) return fires.get(a.fire);
  return a;
}

export class Recorder {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.acc = 1;
    this.players = [];
    this.index = new Map();
    this.frames = [];
    this.events = [];
    this.fireId = 0;
    this.wrap();
  }

  slot(p) {
    let i = this.index.get(p.id);
    if (i === undefined) {
      i = this.players.length;
      this.index.set(p.id, i);
      this.players.push({ id: p.id, name: p.baseName || p.name, team: p.team, char: p.char, isBot: p.isBot });
    }
    return i;
  }

  // Intercepts effect and positional-sound calls so they can be played back later.
  wrap() {
    const fx = this.g.effects;
    this.unwrapFns = [];
    this.raw = {}; // un-recorded effect calls, for the kill cam
    for (const name of FX) {
      const orig = fx[name].bind(fx);
      this.raw[name] = orig;
      fx[name] = (...args) => {
        const out = orig(...args);
        if (name === 'fire' && out) out.__rid = this.fireId++;
        this.events.push({ t: this.t, k: 'fx', n: name, a: args.map(pack) });
        return out;
      };
      this.unwrapFns.push(() => { fx[name] = orig; });
    }
    for (const name of Object.keys(sfx)) {
      if (SFX_SKIP.has(name)) continue;
      const orig = sfx[name];
      sfx[name] = (...args) => {
        // Sounds the local player makes have no position; pin them to where the local player is.
        const pos = args.find((a) => a && a.isVector3) || (this.g.local?.alive ? this.g.local.eye() : null);
        if (pos) this.events.push({ t: this.t, k: 'sfx', n: name, a: args.map((a) => (a === null || a === undefined ? pack(pos) : pack(a))) });
        return orig(...args);
      };
      this.unwrapFns.push(() => { sfx[name] = orig; });
    }
  }

  unwrap() { for (const f of this.unwrapFns || []) f(); this.unwrapFns = []; }

  event(type, data) { this.events.push({ t: this.t, k: 'ev', n: type, a: JSON.parse(JSON.stringify(data ?? null)) }); }

  tick(dt) {
    this.t += dt;
    this.acc += dt;
    if (this.acc < 1 / RATE) return;
    this.acc = 0;
    const g = this.g;
    for (const p of g.players.values()) this.slot(p);
    const s = new Float32Array(this.players.length * STRIDE).fill(NaN);
    for (const p of g.players.values()) {
      const o = this.index.get(p.id) * STRIDE;
      s[o] = p.pos.x; s[o + 1] = p.pos.y; s[o + 2] = p.pos.z; s[o + 3] = p.yaw; s[o + 4] = p.pitch;
      s[o + 5] = p.crouch; s[o + 6] = p.alive ? 1 : 0;
      s[o + 7] = ITEM_INDEX.get(p.isRemoteView ? p.remoteWeapon || p.weaponId : p.weaponId) || 0;
      s[o + 8] = p.hp; s[o + 9] = p.team;
    }
    const nades = g.nades.map((n) => [ITEM_INDEX.get(n.kind) || 0, +n.pos.x.toFixed(2), +n.pos.y.toFixed(2), +n.pos.z.toFixed(2)]);
    this.frames.push({ t: this.t, s, n: nades });
  }

  // State of player `id` at time `t` (interpolated), or null.
  sample(id, t) {
    const i = this.index.get(id);
    return i === undefined ? null : sampleFrames(this.frames, i, t);
  }

  serialize(meta) {
    return {
      version: GAME_VERSION, rate: RATE, stride: STRIDE, items: ITEM_IDS, players: this.players, duration: this.t,
      frames: this.frames, events: this.events, ...meta,
    };
  }
}

export function frameIndex(frames, t) {
  let lo = 0, hi = frames.length - 1;
  if (hi < 0) return -1;
  if (t <= frames[0].t) return 0;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].t <= t) lo = mid; else hi = mid - 1; }
  return lo;
}

export function sampleFrames(frames, i, t) {
  const a = frameIndex(frames, t);
  if (a < 0) return null;
  const fa = frames[a], fb = frames[Math.min(frames.length - 1, a + 1)];
  const o = i * STRIDE;
  if (o >= fa.s.length || Number.isNaN(fa.s[o])) return null;
  const k = fb !== fa && o < fb.s.length && !Number.isNaN(fb.s[o]) ? THREE.MathUtils.clamp((t - fa.t) / (fb.t - fa.t), 0, 1) : 0;
  const A = fa.s, B = k ? fb.s : fa.s, lerp = (j) => A[o + j] + (B[o + j] - A[o + j]) * k;
  let dy = B[o + 3] - A[o + 3];
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  // Teleports (respawns) shouldn't slide across the map.
  const jump = Math.hypot(B[o] - A[o], B[o + 2] - A[o + 2]) > 4;
  const pos = jump ? new THREE.Vector3(A[o], A[o + 1], A[o + 2]) : new THREE.Vector3(lerp(0), lerp(1), lerp(2));
  const speed = fb !== fa ? Math.hypot(B[o] - A[o], B[o + 2] - A[o + 2]) / Math.max(1e-3, fb.t - fa.t) : 0;
  return {
    pos, yaw: A[o + 3] + dy * k, pitch: lerp(4), crouch: lerp(5), alive: A[o + 6] > 0.5,
    weapon: ITEM_IDS[A[o + 7]] || null, hp: Math.round(A[o + 8]), team: A[o + 9], speed: jump ? 0 : Math.min(8, speed),
  };
}
