import * as THREE from 'three';
import { World, CELL } from '../engine/world.js';
import { Effects } from '../engine/effects.js';
import { CharacterModel } from '../engine/models.js';
import { MAPS } from '../data/maps.js';
import { KILL_FX, EMOTES } from '../data/skins.js';

// The live 3D backdrop behind the menus: your operator (and party) standing in a real map.
// Each menu section frames the scene differently; the camera eases between framings.
const FRAMES = {
  // [distance in front, height, sideways shift of the look target, look height]
  // Positive side pushes the squad left on screen (the content panel sits on the right).
  play: { d: 6.4, h: 1.7, side: 0.9, look: 1.15 },
  operator: { d: 3.6, h: 1.3, side: 0.55, look: 1.0 },
  weapon: { d: 2.9, h: 1.4, side: -0.45, look: 1.2 },
  stats: { d: 0, h: 0, side: 0, look: 0, overhead: true },
  auth: { d: 8, h: 2.1, side: -0.4, look: 1.3 },
};

export class MenuScene {
  constructor(app) {
    this.app = app;
    this.engine = app.engine;
    this.focus = 'play';
    this.models = [];
    this.squad = [];
    this.running = false;
  }

  get enabled() { return this.app.settings.menuScene !== false; }

  // Shows the scene for a map (rebuilding only if the map changed) and starts rendering.
  show(mapId) {
    if (!this.enabled) { this.stop(); return; }
    mapId = MAPS[mapId] ? mapId : this.mapId || 'courtyard';
    if (mapId !== this.mapId || !this.scene) this.build(mapId);
    this.app.gameEl.classList.remove('hidden');
    this.app.gameEl.classList.add('menu-stage');
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  stop() {
    this.running = false;
    this.app.gameEl.classList.remove('menu-stage');
    if (this.scene) { this.engine.clearScene(); this.scene = null; this.models = []; this.mapId = null; }
  }

  build(mapId) {
    const eng = this.engine;
    eng.clearScene();
    const scene = new THREE.Scene();
    this.scene = scene;
    this.mapId = mapId;
    this.world = new World(MAPS[mapId]);
    this.world.build(scene);
    eng.setupEnvironment(scene, MAPS[mapId].theme, this.world.size);
    eng.setScene(scene);
    this.effects = new Effects(scene);
    this.pickStage();
    this.models = [];
    this.camPos = null;
    this.setSquad(this.squad);
  }

  // A spot with open space in front (for the camera) and a long view behind the squad.
  pickStage() {
    const W = this.world;
    const cells = [...(W.spawnCells[0] || []), ...(W.spawnCells[1] || []), ...W.allFloor.filter((_, i) => i % 7 === 0)];
    let best = null;
    for (const c of cells) {
      const base = new THREE.Vector3((c.x + 0.5) * CELL, 1.5, (c.y + 0.5) * CELL);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, f = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        const front = W.raycast(base, f, 9)?.dist ?? 9, back = W.raycast(base, f.clone().negate(), 30)?.dist ?? 30;
        const side = Math.min(W.raycast(base, new THREE.Vector3(f.z, 0, -f.x), 4)?.dist ?? 4, W.raycast(base, new THREE.Vector3(-f.z, 0, f.x), 4)?.dist ?? 4);
        const score = Math.min(front, 7.5) * 2 + Math.min(back, 26) + Math.min(side, 3.5) * 5;
        if (!best || score > best.score) best = { score, pos: base.setY(W.heightAt(base.x, base.z)), front: f };
      }
    }
    this.stage = best || { pos: new THREE.Vector3(W.size.x / 2, 0, W.size.z / 2), front: new THREE.Vector3(0, 0, 1) };
    this.right = new THREE.Vector3(this.stage.front.z, 0, -this.stage.front.x);
  }

  // squad: [{char, weapon}] with you first. Party members stand either side.
  setSquad(list) {
    this.squad = list;
    if (!this.scene) return;
    for (const m of this.models) m.root.removeFromParent();
    const slots = [0, -1.25, 1.25, -2.5, 2.5];
    this.models = list.slice(0, 5).map((s, i) => {
      const m = new CharacterModel(s.char || {}, { team: -1 });
      const p = this.stage.pos.clone().addScaledVector(this.right, slots[i]).addScaledVector(this.stage.front, i ? -0.45 : 0);
      m.root.position.copy(p);
      m.setWeapon(s.weapon || 'ar7');
      m.baseYaw = Math.atan2(-this.stage.front.x, -this.stage.front.z) + (i ? (slots[i] > 0 ? -0.18 : 0.18) : -0.22);
      m.sway = Math.random() * 10;
      m.root.rotation.y = m.baseYaw;
      this.scene.add(m.root);
      return m;
    });
  }

  get me() { return this.models[0]; }

  setChar(c, weapon) {
    const s = [...this.squad];
    s[0] = { ...(s[0] || {}), char: c, weapon: weapon || s[0]?.weapon || 'ar7' };
    this.setSquad(s);
  }

  setWeapon(id) {
    if (this.squad[0]) this.squad[0].weapon = id;
    this.me?.setWeapon(id);
    this.me?.stopEmote();
  }

  // Turn your operator back to face the camera (when something new is selected).
  faceFront() { if (this.me) { this.me.drag = 0; this.me.sway = 0; } }

  rotate(dx) { if (this.me) this.me.drag = (this.me.drag || 0) + dx * 0.012; }

  setFocus(focus) {
    if (FRAMES[focus]) this.focus = focus;
  }

  // Extra turn for your operator per framing: side-on for weapon finishes so the whole gun shows.
  focusTurn() { return this.focus === 'weapon' ? -1.15 : 0; }

  emote(id) { const def = EMOTES[id]; if (def && this.me) this.me.playEmote(id, def.dur); }

  killFx(id) {
    const def = KILL_FX[id];
    if (!def || id === 'none' || !this.me) return;
    const at = this.me.root.position.clone().addScaledVector(this.right, -1.4).addScaledVector(this.stage.front, 0.8).setY(this.stage.pos.y + 1);
    this.effects.killFx(id, at, def.color);
  }

  frame(now) {
    if (!this.running) return;
    requestAnimationFrame((t) => this.frame(t));
    if (document.hidden || !this.scene) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t = (this.t || 0) + dt;
    this.models.forEach((m, i) => {
      // Gentle idle sway around a front-facing pose; dragging turns your own operator.
      m.sway += dt;
      const yaw = m.baseYaw + (i ? 0 : this.focusTurn()) + (m.drag || 0) + Math.sin(m.sway * 0.4 + i) * (i ? 0.08 : this.focus === 'weapon' ? 0.12 : 0.22);
      m.root.rotation.y += (yaw - m.root.rotation.y) * Math.min(1, dt * 6);
      m.update(dt, { speed: 0, crouch: 0, pitch: Math.sin(m.sway * 0.3 + i) * 0.05, onGround: true, firing: false });
    });
    this.effects.update(dt);
    this.world.update(dt);
    this.updateCamera(dt);
    this.engine.render();
  }

  updateCamera(dt) {
    const cam = this.engine.camera, f = FRAMES[this.focus], st = this.stage;
    let pos, look;
    if (f.overhead) {
      const c = new THREE.Vector3(this.world.size.x / 2, 0, this.world.size.z / 2), span = Math.max(this.world.size.x, this.world.size.z);
      const a = this.t * 0.04;
      pos = new THREE.Vector3(c.x + Math.cos(a) * span * 0.42, span * 0.62, c.z + Math.sin(a) * span * 0.42);
      look = c;
    } else {
      const drift = Math.sin(this.t * 0.18) * 0.25;
      const target = (this.me?.root.position || st.pos).clone();
      look = target.clone().addScaledVector(this.right, f.side).setY(st.pos.y + f.look);
      pos = target.clone().addScaledVector(st.front, f.d).addScaledVector(this.right, f.side * 0.55 + drift).setY(st.pos.y + f.h + Math.sin(this.t * 0.23) * 0.05);
    }
    if (!this.camPos) { this.camPos = pos.clone(); this.camLook = look.clone(); }
    const k = 1 - Math.exp(-dt * 2.6);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    const fov = this.focus === 'weapon' ? 42 : this.focus === 'operator' ? 46 : 55;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * k; cam.updateProjectionMatrix(); }
  }
}
