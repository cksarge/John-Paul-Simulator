import * as THREE from 'three';
import { CELL } from '../engine/world.js';
import { COURSE_ZONES } from '../data/maps.js';
import { pad, isPS } from '../engine/gamepad.js';
import { sfx } from '../engine/audio.js';
import { DUMMY_LOOK } from './training.js';

// The tutorial: a guided course (map 'course') that walks through every control one step at a time.
// It runs on the Training Range's sandbox (mode kind 'training'): one endless live phase, free buying,
// no stats. Each step names a zone (where its marker goes and where you respawn if you die) and a
// `done` check that polls the game every frame. `enter` runs when the step starts and records a
// baseline in `t.b`, so things you did before a step don't count towards it.

// Key hints: [keyboard, Xbox, PlayStation].
const KEYS = {
  move: ['W A S D', 'left stick', 'left stick'], look: ['the mouse', 'right stick', 'right stick'],
  jump: ['Space', 'A', '✕'], crouch: ['Ctrl', 'B', '◯'], walk: ['Shift', 'a light push on the stick', 'a light push on the stick'],
  fire: ['Left click', 'RT', 'R2'], reload: ['R', 'X', '▢'], inspect: ['V', 'L3', 'L3'],
  knife: ['3', 'D-pad ↓', 'D-pad ↓'], last: ['Q', 'Y', '△'], nade: ['4', 'LB', 'L1'], use: ['E', 'RB', 'R1'],
};
const label = (a) => {
  const k = KEYS[a];
  if (!k) return pad.label(a);
  return pad.active ? k[isPS(pad.id) ? 2 : 1] : k[0];
};
const kbd = (a) => `<kbd>${label(a)}</kbd>`;

const cellOf = (p) => [Math.floor(p.pos.x / CELL), Math.floor(p.pos.z / CELL)];
const inRect = (p, r) => { const [x, y] = cellOf(p); return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]; };
const inZone = (p, z) => inRect(p, COURSE_ZONES[z]);
const TARGETS = [[33, 13], [31, 16], [34, 18]];

// Section numbers follow the spec: 1 basics · 2 climbing · 3 doors · 4 shooting · 5 grenades · 6 buying ·
// 7 the charge · 8 team tools · 9 final test.
export const STEPS = [
  { id: 'look', section: 1, title: 'Look around', zone: 'start', help: () => `Move ${kbd('look')} to look around.`,
    enter: (t) => { t.b.yaw = t.lp.yaw; t.b.pitch = t.lp.pitch; t.b.turned = 0; },
    tick: (t) => { const p = t.lp; t.b.turned += Math.abs(p.yaw - t.b.yaw) + Math.abs(p.pitch - t.b.pitch); t.b.yaw = p.yaw; t.b.pitch = p.pitch; },
    done: (t) => t.b.turned > 2.5 },
  { id: 'move', section: 1, title: 'Move to the marker', zone: 'walk', help: () => `Use ${kbd('move')} to walk to the glowing marker.`,
    done: (t) => inZone(t.lp, 'walk') },
  { id: 'walk-key', section: 1, title: 'Walk quietly', zone: 'walk', help: () => `Hold ${kbd('walk')} while moving to walk. Walking makes no footstep sounds.`,
    enter: (t) => { t.b.walked = 0; },
    tick: (t, dt) => { if (t.g.moveKeys?.walk && Math.hypot(t.lp.vel.x, t.lp.vel.z) > 0.5) t.b.walked += dt; },
    done: (t) => t.b.walked > 1 },
  { id: 'jump', section: 1, title: 'Jump the crates', zone: 'jump', help: () => `Press ${kbd('jump')} to jump over the crates.`,
    done: (t) => cellOf(t.lp)[0] >= 16 },
  { id: 'crouch', section: 1, title: 'Crouch under the bridge', zone: 'crouch', help: () => `Hold ${kbd('crouch')} to crouch, then go under the low bridge.`,
    enter: (t) => { t.b.held = 0; },
    tick: (t, dt) => { if (t.g.moveKeys?.crouch) t.b.held += dt; },
    done: (t) => t.b.held > 0.3 && cellOf(t.lp)[0] >= 18 },
  { id: 'mantle', section: 2, title: 'Climb the ledge', zone: 'mantle', help: () => `Jump at the ledge with ${kbd('jump')} and keep pushing forward to pull yourself up.`,
    tick: (t) => { if (t.lp.mantle) t.b.mantled = true; },
    done: (t) => t.b.mantled && t.lp.onGround && t.lp.pos.y > 1.8 },
  { id: 'ladder', section: 2, title: 'Climb the ladder', zone: 'ladderTop', help: () => 'Walk into the ladder and keep moving forward to climb up to the catwalk.',
    tick: (t) => { if (t.lp.climbing) t.b.climbed = true; },
    done: (t) => t.b.climbed && inZone(t.lp, 'ladderTop') && t.lp.pos.y > 3 },
  { id: 'lift', section: 2, title: 'Ride the lift down', zone: 'liftBottom', help: () => 'Step onto the lift at the end of the catwalk and ride it down.',
    done: (t) => inZone(t.lp, 'liftBottom') && t.lp.pos.y < 0.4 && t.lp.onGround },
  { id: 'door', section: 3, title: 'Open the door', zone: 'door', help: () => `Look at the door and press ${kbd('use')}.`,
    done: (t) => t.g.world.prop(38, 4)?.open || t.g.world.prop(38, 5)?.open },
  { id: 'gate', section: 3, title: 'Open the gate', zone: 'gate', help: () => `Gates open from a switch. Press ${kbd('use')} at the switch.`,
    done: (t) => t.g.world.prop(43, 4)?.open },
  { id: 'shoot', section: 4, title: 'Shoot 3 targets', zone: 'range', help: () => `Here's a rifle. ${kbd('fire')} to shoot each target. Aim for the head.`,
    enter: (t) => { t.giveRifle(); t.b.kills = t.kills; TARGETS.forEach((c, i) => t.placeDummy(t.dummies[i], c)); },
    done: (t) => t.kills - t.b.kills >= 3 },
  { id: 'reload', section: 4, title: 'Reload', zone: 'range', help: () => `Press ${kbd('reload')} to reload.`,
    // Only a reload started during this step counts (shooting the targets can end mid-reload).
    tick: (t) => { if (t.lp.ws.reloadT < 0) t.b.idle = true; },
    done: (t) => t.b.idle && t.lp.ws.reloadT >= 0 },
  { id: 'switch', section: 4, title: 'Switch weapons', zone: 'range', help: () => `Press ${kbd('knife')}${pad.active ? ' until you hold' : ' for'} your knife, then ${kbd('last')} to go back to your rifle.`,
    tick: (t) => { if (t.lp.slot === 'melee') t.b.knife = true; },
    done: (t) => t.b.knife && (t.lp.slot === 'primary' || t.lp.slot === 'secondary') },
  { id: 'inspect', section: 4, title: 'Inspect your weapon', zone: 'range', help: () => `Press ${kbd('inspect')} to inspect your rifle and its finish.`,
    done: (t) => t.g.viewmodel.inspecting },
];
export const SECTIONS = 9;

export class Tutorial {
  constructor(game) {
    this.g = game;
    this.i = -1;
    this.b = {};
    this.kills = 0;
    this.t = 0;
    this.dummies = TARGETS.map((_, i) => game.addPlayer({ id: 'dummy-' + i, name: 'Target', team: 1, isBot: true, dummy: true, char: DUMMY_LOOK, elo: 0 }));
    // Marker: a ring on the floor and a soft beam of light above it.
    const mat = (o) => new THREE.MeshBasicMaterial({ color: 0xf2a33a, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), mat(0.85));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 6, 24, 1, true), mat(0.12));
    beam.position.y = 3;
    this.marker.add(ring, beam);
    this.marker.renderOrder = 5;
    game.scene.add(this.marker);
  }

  get lp() { return this.g.local; }
  get step() { return STEPS[this.i] || null; }
  get index() { return this.i; }
  get section() { return Math.max(1, this.step?.section || SECTIONS); }
  get sections() { return SECTIONS; }

  // ───────────── steps ─────────────
  begin(i) {
    this.i = i;
    this.b = {};
    const s = this.step;
    if (!s) return this.finish();
    s.enter?.(this);
    this.placeMarker(s.zone);
    this.render();
  }

  next() {
    const s = this.step;
    if (s) { sfx.buy(); this.g.hud.center('✓', s.title, 1.2); }
    this.begin(this.i + 1);
  }

  skip() { if (this.step) this.begin(this.i + 1); }

  finish() {
    this.marker.visible = false;
    this.g.hud.el.tut?.classList.add('hidden');
    this.g.hud.center('TUTORIAL COMPLETE', '', 4);
    sfx.win();
  }

  zoneCenter(z) {
    const r = COURSE_ZONES[z], cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
    const x = (cx + 0.5) * CELL, zz = (cy + 0.5) * CELL;
    return new THREE.Vector3(x, this.g.world.navH(Math.round(cx), Math.round(cy)) ?? 0, zz);
  }

  placeMarker(z) {
    this.marker.visible = !!z;
    if (z) this.marker.position.copy(this.zoneCenter(z));
  }

  render() {
    const el = this.g.hud.el.tut, s = this.step;
    if (!el) return;
    this.padShown = pad.active;
    if (!s) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<div class="tut-step">Step ${s.section}/${SECTIONS}</div><div class="tut-title">${s.title}</div><div class="tut-help">${s.help()}</div>`;
  }

  // ───────────── helpers ─────────────
  giveRifle() {
    const p = this.lp;
    if (!p.inv.primary) { p.inv.primary = 'ar7'; p.giveAmmo('ar7'); }
    this.g.selectSlot(p, 'primary');
  }

  placeDummy(d, [cx, cy]) {
    const x = (cx + 0.5) * CELL, z = (cy + 0.5) * CELL, lp = this.lp;
    const yaw = Math.atan2(-(lp.pos.x - x), -(lp.pos.z - z));
    this.g.spawnPlayer(d, [x, this.g.world.heightAt(x, z), z, yaw], true, false);
    d.armor = 0; d.helmet = false;
    d.inv.primary = null; d.inv.secondary = null; d.slot = 'melee';
  }

  onKill(killer, victim) {
    if (victim.dummy) {
      if (killer?.isLocal) this.kills++;
      setTimeout(() => { if (victim.model && !victim.alive) victim.model.root.visible = false; }, 1500);
    } else if (victim.isLocal) {
      setTimeout(() => this.respawnLocal(), 1200);
    }
  }

  // Back to where the current step starts: its `respawn` zone, or the zone of the step before it
  // (respawning at the step's own zone could skip it, like the top of the ladder).
  respawnLocal() {
    const g = this.g, lp = this.lp;
    if (!lp || lp.alive || !g.running) return;
    const at = this.zoneCenter(this.step?.respawn || STEPS[this.i - 1]?.zone || 'start');
    g.spawnPlayer(lp, [at.x, at.y, at.z, lp.yaw], false, true);
  }

  // ───────────── per frame ─────────────
  update(dt) {
    const lp = this.lp;
    if (!lp) return;
    this.t += dt;
    if (this.i < 0) this.begin(0);
    const s = this.step;
    if (!s) return;
    if (this.padShown !== pad.active) this.render();
    const pulse = 1 + Math.sin(this.t * 4) * 0.08;
    this.marker.children[0].scale.set(pulse, pulse, 1);
    if (!lp.alive || this.g.hud.overlay === 'pause') return;
    s.tick?.(this, dt);
    if (s.done(this)) this.next();
  }

  dispose() {
    this.marker.removeFromParent();
  }
}
