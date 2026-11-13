import * as THREE from 'three';
import { CELL } from '../engine/world.js';
import { WEAPONS, GRENADES, nadeDef } from '../data/weapons.js';
import { OPERATORS } from '../data/characters.js';
import { sfx } from '../engine/audio.js';

// The Training Range: target dummies, timed drills, infinite ammo and grenades, and a grenade arc preview.
// Runs offline only, with the local player as host. Dummies are players with no bot brain.
export const DRILLS = {
  free: { name: 'Free practice', desc: 'Static targets at 10, 20 and 35 m. They pop back up after a second.' },
  aim: { name: 'Aim drill', desc: '60 seconds. One target at a time in a random spot. Score kills; time-to-kill and accuracy are tracked.', time: 60 },
  moving: { name: 'Moving targets', desc: 'Targets strafe across the lanes at different speeds.' },
  spray: { name: 'Spray practice', desc: 'Hold fire at the board on the left lane wall. Marks clear when you start a new spray.' },
  nades: { name: 'Grenade line-ups', desc: 'Unlimited grenades with a live arc preview. Practise throws over the crates in the yard.' },
};

export const DUMMY_LOOK = { ...OPERATORS[0].char, name: 'Target', top: '#ff8a3d', pants: '#3a3f45', vest: 'plate', vestColor: '#ffd23f', headgear: 'none', face: 'none', outfit: 'standard', skins: {} };
const MAX_DUMMIES = 6;
const bestKey = (drill) => 'jps_training_best_' + drill;

export class Training {
  constructor(game) {
    this.g = game;
    this.drill = 'free';
    this.stats = this.freshStats();
    this.respawns = new Map(); // dummy id -> seconds until it pops up again
    this.t = 0;
    for (let i = 0; i < MAX_DUMMIES; i++) {
      game.addPlayer({ id: 'dummy-' + i, name: 'Target', team: 1, isBot: true, dummy: true, char: DUMMY_LOOK, elo: 0 });
    }
    this.board = this.buildBoard();
    this.arc = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x3dff8f, dashSize: 0.25, gapSize: 0.15, transparent: true, opacity: 0.9, depthTest: false }));
    this.arc.renderOrder = 20;
    this.arc.frustumCulled = false;
    game.scene.add(this.arc);
    this.arcEnd = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 24), new THREE.MeshBasicMaterial({ color: 0x3dff8f, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
    this.arcEnd.rotation.x = -Math.PI / 2;
    this.arcEnd.renderOrder = 20;
    game.scene.add(this.arcEnd);
  }

  freshStats() { return { kills: 0, shots: 0, hits: 0, ttk: [], left: DRILLS[this.drill]?.time || 0, running: false, done: false }; }

  get dummies() { return [...this.g.players.values()].filter((p) => p.dummy); }

  // A target board painted on the spray wall in the left lane.
  buildBoard() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#e8e4da'; x.fillRect(0, 0, 256, 256);
    for (let r = 5; r > 0; r--) { x.fillStyle = r % 2 ? '#1b2028' : '#e8e4da'; x.beginPath(); x.arc(128, 128, r * 24, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#ff4d4d'; x.beginPath(); x.arc(128, 128, 10, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#ff4d4d'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 256); x.moveTo(0, 128); x.lineTo(256, 128); x.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    // The spray wall is the row of 'X' cells at y = 1; its face is at z = 2 cells.
    m.position.set(5.5 * CELL, 1.6, 2 * CELL + 0.02);
    this.g.scene.add(m);
    return m;
  }

  // ───────────── drills ─────────────
  setDrill(id) {
    if (!DRILLS[id]) return;
    this.drill = id;
    this.stats = this.freshStats();
    this.respawns.clear();
    this.g.effects.clearRound();
    for (const d of this.dummies) this.hide(d);
    const want = { free: 6, aim: 0, moving: 5, spray: 0, nades: 3 }[id];
    this.dummies.slice(0, want).forEach((d, i) => this.place(d, i));
    if (id === 'aim') this.stats.running = false;
    const lp = this.g.local;
    if (lp && id === 'nades') {
      lp.inv.nades = Object.keys(GRENADES);
      this.g.selectSlot(lp, 'nade');
    }
    this.g.hud.center(DRILLS[id].name.toUpperCase(), id === 'aim' ? 'Fire to start the clock' : DRILLS[id].desc, 2.5);
  }

  hide(d) {
    d.alive = false;
    d.model?.die(1);
    if (d.model) d.model.root.visible = false;
  }

  // Lane spots: three distances (10, 20, 35 m from the firing line) across the middle lanes.
  spot(i, random = false) {
    const w = this.g.world;
    let cx, cy;
    if (random || this.drill === 'aim') { cx = 3 + Math.floor(Math.random() * 20); cy = 2 + Math.floor(Math.random() * 13); }
    else {
      const lanes = [[6, 13], [14, 13], [21, 13], [8, 8], [16, 8], [13, 2]];
      [cx, cy] = lanes[i % lanes.length];
      if (this.drill === 'nades') [cx, cy] = [[28, 7], [31, 11], [29, 3]][i % 3];
    }
    if (w.navH(cx, cy) === null) return this.spot(i, true);
    const x = (cx + 0.5) * CELL, z = (cy + 0.5) * CELL;
    return [x, w.heightAt(x, z), z];
  }

  place(d, i) {
    const at = this.spot(i);
    const lp = this.g.local;
    const yaw = lp ? Math.atan2(-(lp.pos.x - at[0]), -(lp.pos.z - at[2])) : Math.PI;
    this.g.spawnPlayer(d, [...at, yaw], true, false);
    d.armor = 0; d.helmet = false;
    d.inv.primary = null; d.inv.secondary = null; d.slot = 'melee';
    d.home = at;
    d.slotIdx = i;
    d.strafe = this.drill === 'moving' ? { speed: 1.6 + (i % 3) * 1.4, range: 2 + (i % 2) * 2, t: Math.random() * 6 } : null;
    d.shownAt = this.t;
  }

  onKill(killer, victim) {
    if (victim.dummy) {
      if (killer?.isLocal) {
        this.stats.kills++;
        if (this.drill === 'aim') this.stats.ttk.push(this.t - victim.shownAt);
      }
      this.respawns.set(victim.id, this.drill === 'aim' ? 0.05 : 1);
    } else if (victim.isLocal) {
      // Fall damage or your own grenade: back to the firing line.
      setTimeout(() => this.respawnLocal(), 1200);
    }
  }

  respawnLocal() {
    const g = this.g, lp = g.local;
    if (!lp || lp.alive || !g.running) return;
    const r = g.mapDef.spawns[0], x = (r[0] + 2) * CELL, z = (r[1] + 1) * CELL;
    g.spawnPlayer(lp, [x, g.world.heightAt(x, z), z, 0], false, true);
  }

  onShot(hit) {
    if (this.drill === 'aim' && !this.stats.running && !this.stats.done) { this.stats.running = true; this.stats.left = DRILLS.aim.time; this.spawnAimTarget(); }
    this.stats.shots++;
    if (hit) this.stats.hits++;
    // A new spray on the board wipes the old marks.
    if (this.drill === 'spray' && this.t - (this.lastShot || 0) > 1.2) this.g.effects.clearRound();
    this.lastShot = this.t;
  }

  spawnAimTarget() {
    const d = this.dummies.find((x) => !x.alive);
    if (d) this.place(d, 0);
  }

  // ───────────── per frame ─────────────
  update(dt) {
    const g = this.g, lp = g.local;
    this.t += dt;
    // Infinite ammo: keep the reserve topped up.
    if (lp) for (const [id, a] of Object.entries(lp.ammo)) { const w = WEAPONS[id]; if (w?.reserve) a.reserve = w.reserve; }
    if (lp && this.drill === 'nades' && lp.inv.nades.length < Object.keys(GRENADES).length) lp.inv.nades = Object.keys(GRENADES);
    for (const [id, t] of this.respawns) {
      if ((t - dt) > 0) { this.respawns.set(id, t - dt); continue; }
      this.respawns.delete(id);
      const d = g.players.get(id);
      if (!d) continue;
      if (this.drill === 'aim') { if (this.stats.running) this.place(d, 0); }
      else this.place(d, d.slotIdx || 0);
    }
    for (const d of this.dummies) {
      if (!d.alive || !d.strafe) continue;
      const s = d.strafe;
      s.t += dt;
      const off = Math.sin(s.t * s.speed / s.range) * s.range;
      const prevX = d.pos.x;
      d.pos.x = d.home[0] + off;
      d.vel.set((d.pos.x - prevX) / Math.max(dt, 1e-3), 0, 0);
    }
    if (this.drill === 'aim' && this.stats.running) {
      this.stats.left -= dt;
      if (this.stats.left <= 0) this.finishAim();
    }
    this.updateArc();
  }

  finishAim() {
    const st = this.stats;
    st.running = false; st.done = true; st.left = 0;
    for (const d of this.dummies) this.hide(d);
    let best = 0;
    try { best = Number(localStorage.getItem(bestKey('aim')) || 0); if (st.kills > best) localStorage.setItem(bestKey('aim'), String(st.kills)); } catch { /* ignore */ }
    const avg = st.ttk.length ? st.ttk.reduce((a, b) => a + b, 0) / st.ttk.length : 0;
    this.g.hud.center(st.kills > best ? 'NEW BEST' : 'DRILL OVER', `${st.kills} kills · ${this.accuracy()}% accuracy · ${avg.toFixed(2)} s average`, 5);
    sfx.win();
  }

  accuracy() { return this.stats.shots ? Math.round((this.stats.hits / this.stats.shots) * 100) : 0; }
  best(drill = this.drill) { try { return Number(localStorage.getItem(bestKey(drill)) || 0); } catch { return 0; } }

  // Dashed arc showing where the held grenade would land.
  updateArc() {
    const g = this.g, lp = g.local;
    const show = lp?.alive && GRENADES[lp.weaponId] && !g.hud.overlayOpen();
    this.arc.visible = this.arcEnd.visible = !!show;
    if (!show) return;
    const f = lp.forward();
    const n = { kind: lp.weaponId, pos: lp.eye().addScaledVector(f, 0.4), vel: f.clone().multiplyScalar(lp.weaponId === 'mine' ? 9 : 15).add(new THREE.Vector3(lp.vel.x * 0.5, 2.2, lp.vel.z * 0.5)), t: 1 };
    const pts = [n.pos.clone()];
    const fuse = nadeDef(n.kind)?.fuse || 1.6, step = 1 / 60;
    let still = 0;
    for (let t = 0; t < fuse && still < 0.2; t += step) {
      g.stepNade(n, step, true);
      if (n.vel.length() < 0.4) still += step;
      pts.push(n.pos.clone());
    }
    this.arc.geometry.setFromPoints(pts);
    this.arc.computeLineDistances();
    this.arcEnd.position.copy(n.pos).setY(g.world.heightAt(n.pos.x, n.pos.z) + 0.04);
  }

  hudLine() {
    const st = this.stats, d = DRILLS[this.drill];
    if (this.drill === 'aim') {
      const avg = st.ttk.length ? (st.ttk.reduce((a, b) => a + b, 0) / st.ttk.length).toFixed(2) + ' s' : '—';
      return `${d.name} · ${st.running ? Math.ceil(st.left) + ' s' : st.done ? 'done' : 'fire to start'} · ${st.kills} kills · ${this.accuracy()}% · avg ${avg} · best ${this.best('aim')}`;
    }
    return `${d.name} · ${st.kills} kills · ${this.accuracy()}% accuracy`;
  }

  dispose() {
    this.board.removeFromParent();
    this.arc.removeFromParent();
    this.arcEnd.removeFromParent();
  }
}
