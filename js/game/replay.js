import * as THREE from 'three';
import { World } from '../engine/world.js';
import { Effects } from '../engine/effects.js';
import { Viewmodel } from '../engine/viewmodel.js';
import { CharacterModel, buildGun } from '../engine/models.js';
import { sfx, setListener, initAudio, setVolume } from '../engine/audio.js';
import { MAPS } from '../data/maps.js';
import { MODES, SOLO_KINDS, TEAM_CLASS } from '../data/modes.js';
import { itemInfo, nadeDef } from '../data/weapons.js';
import { sampleFrames, frameIndex, unpack, ITEM_IDS } from './recorder.js';
import { SpectatorCam, CAM_LABELS } from './spectatorcam.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (t) => { t = Math.max(0, Math.floor(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const SPEEDS = [0.25, 0.5, 1, 2, 4];

// Plays back a recorded match in the full 3D scene with a timeline and free/follow cameras.
export class ReplayViewer {
  constructor(app, data) {
    this.app = app;
    this.data = data;
    this.engine = app.engine;
    this.mode = MODES[data.mode];
    this.solo = SOLO_KINDS.has(this.mode?.kind);
    this.t = 0;
    this.playing = true;
    this.speed = 1;
    this.cursor = 0;
    this.fires = new Map();
    this.fireSeq = 0;
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0 };
    this.scores = [0, 0];
    this.kills = data.events.filter((e) => e.k === 'ev' && e.n === 'kill');
    this.targetIdx = Math.max(0, data.players.findIndex((p) => p.id === data.localId));
  }

  async start() {
    const eng = this.engine;
    eng.clearScene();
    const scene = new THREE.Scene();
    this.scene = scene;
    this.world = new World(MAPS[this.data.map]);
    this.world.build(scene);
    eng.setupEnvironment(scene, MAPS[this.data.map].theme, this.world.size);
    eng.setScene(scene);
    this.effects = new Effects(scene);
    this.viewmodel = new Viewmodel(eng.vmScene);
    this.cam = new SpectatorCam(eng.camera, this.world);
    this.models = this.data.players.map((p) => {
      const m = new CharacterModel(p.char || {}, { team: this.solo ? -1 : p.team });
      m.root.visible = false;
      scene.add(m.root);
      m.everAlive = false;
      return m;
    });
    this.nadeMeshes = [];
    this.bomb = buildGun('bomb');
    this.bomb.scale.setScalar(2.2);
    this.bomb.visible = false;
    scene.add(this.bomb);
    initAudio();
    setVolume(this.app.settings.volume);
    this.mountUI();
    this.bindInput();
    this.app.gameEl.classList.remove('hidden');
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ───────────── input ─────────────
  bindInput() {
    const canvas = this.engine.renderer.domElement;
    this.onKey = (e) => {
      if (e.type === 'keyup') { this.keys.delete(e.code); return; }
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Space' && this.cam.mode !== 'free') { e.preventDefault(); this.togglePlay(); }
      if (e.code === 'KeyP') this.togglePlay();
      if (e.code === 'ArrowRight') this.seek(this.t + 5);
      if (e.code === 'ArrowLeft') this.seek(this.t - 5);
      if (e.code === 'KeyV') this.cycleCam();
      if (e.code === 'BracketRight' || e.code === 'Tab') { e.preventDefault(); this.cycleTarget(1); }
      if (e.code === 'BracketLeft') this.cycleTarget(-1);
      if (e.code === 'Escape' && !document.pointerLockElement) this.exit();
    };
    this.onMove = (e) => { if (document.pointerLockElement === canvas) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } };
    this.onClick = () => { if (this.cam.mode === 'free') canvas.requestPointerLock?.(); };
    addEventListener('keydown', this.onKey);
    addEventListener('keyup', this.onKey);
    addEventListener('mousemove', this.onMove);
    canvas.addEventListener('click', this.onClick);
  }

  togglePlay() { this.playing = !this.playing; if (this.t >= this.data.duration) { this.seek(0); this.playing = true; } this.refreshControls(); }
  cycleCam() { const m = this.cam.cycle(); if (m !== 'free' && document.pointerLockElement) document.exitPointerLock(); this.refreshControls(); }
  cycleTarget(dir) { const n = this.data.players.length; this.targetIdx = (this.targetIdx + dir + n) % n; this.refreshControls(); }

  // ───────────── playback ─────────────
  frame(now) {
    if (!this.running) return;
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const step = this.playing ? dt * this.speed : 0;
    if (this.playing) {
      this.t = Math.min(this.data.duration, this.t + step);
      if (this.t >= this.data.duration) { this.playing = false; this.refreshControls(); }
    }
    this.processEvents(this.t, true);
    this.applyPlayers(step || 0.0001);
    this.applyNades();
    this.world.update(step);
    if (step) this.effects.update(step);
    const target = this.targetState();
    this.cam.update(dt, target, { keys: this.keys, dx: this.mouse.dx, dy: this.mouse.dy, locked: !!document.pointerLockElement });
    this.mouse.dx = this.mouse.dy = 0;
    const pov = this.cam.mode === 'pov' && target;
    if (pov) {
      if (this.viewmodel.id !== target.weapon) this.viewmodel.setWeapon(target.weapon, this.data.players[this.targetIdx].char);
      this.viewmodel.update(dt, { speed: target.speed, onGround: true, lookDX: 0, lookDY: 0, reload: -1, scoped: false, drawTime: 0.01 });
    } else if (this.viewmodel.id) this.viewmodel.setWeapon(null);
    const tm = this.models[this.targetIdx];
    if (pov && tm) tm.root.visible = false;
    const cam = this.engine.camera;
    if (cam.fov !== this.app.settings.fov) { cam.fov = this.app.settings.fov; cam.updateProjectionMatrix(); }
    const f = new THREE.Vector3(); cam.getWorldDirection(f);
    setListener(cam.position, f);
    this.engine.render();
    this.uiT = (this.uiT || 0) - dt;
    if (this.uiT <= 0) { this.uiT = 0.1; this.updateUI(); }
  }

  targetState() {
    const p = this.data.players[this.targetIdx];
    return p ? sampleFrames(this.data.frames, this.targetIdx, this.t) : null;
  }

  // Applies events up to time t. `live` plays effects and sounds; seeking only replays world state.
  processEvents(t, live) {
    const ev = this.data.events;
    while (this.cursor < ev.length && ev[this.cursor].t <= t) {
      const e = ev[this.cursor++];
      if (e.k === 'ev') this.worldEvent(e.n, e.a, live);
      else if (e.k === 'fx' && e.n === 'fire') {
        // Fires are numbered in recording order so their matching endFire can find them.
        const id = this.fireSeq++;
        if (live) this.fires.set(id, this.effects.fire(...e.a.map((a) => unpack(a, this.fires))));
      } else if (live && e.k === 'fx' && this.effects[e.n]) this.effects[e.n](...e.a.map((a) => unpack(a, this.fires))); else if (live && e.k === 'sfx' && sfx[e.n] && this.speed <= 2) sfx[e.n](...e.a.map((a) => unpack(a, this.fires)));
    }
  }

  worldEvent(type, d) {
    const W = this.world;
    if (type === 'door') W.setDoor(d.cell, d.open);
    else if (type === 'prop') {
      if (d.restore) for (const [x, y] of d.restore) { const pr = W.prop(x, y); if (pr) W.restoreProp(pr); }
      else if (d.stage !== undefined) W.setStage(d.cell[0], d.cell[1], d.stage);
      else W.breakProp(d.cell[0], d.cell[1]);
    } else if (type === 'round') {
      if (!SOLO_KINDS.has(this.mode?.kind) && this.mode?.kind !== 'tdm') W.resetProps();
      this.scores = d.scores || this.scores;
      this.bombState = d.bomb;
    } else if (type === 'roundEnd' || type === 'score') this.scores = d.scores || this.scores;
    else if (type === 'bomb') this.bombState = d;
    else if (type === 'emote') {
      const i = this.data.players.findIndex((p) => p.id === d.id);
      if (i >= 0) this.models[i].playEmote(d.e, 2.4);
    }
    const b = this.bombState || {};
    const show = b.state === 'dropped' || b.state === 'planted' || b.state === 'defused';
    this.bomb.visible = show;
    if (show) this.bomb.position.set(b.pos[0], b.pos[1] + 0.09, b.pos[2]);
  }

  applyPlayers(dt) {
    this.data.players.forEach((p, i) => {
      const m = this.models[i], st = sampleFrames(this.data.frames, i, this.t);
      if (!st) { m.root.visible = false; return; }
      if (st.alive) {
        if (m.dead) m.revive();
        m.everAlive = true;
        m.root.visible = true;
        m.root.position.copy(st.pos);
        m.root.rotation.y = st.yaw;
        m.setWeapon(st.weapon);
        m.update(dt, { speed: st.speed, crouch: st.crouch, pitch: st.pitch, onGround: true, firing: false });
      } else {
        if (!m.everAlive) { m.root.visible = false; return; }
        if (!m.dead) { m.die(1); m.root.position.copy(st.pos); m.root.rotation.y = st.yaw; }
        m.update(dt, { speed: 0, crouch: 0, pitch: 0, onGround: true, firing: false });
      }
    });
  }

  applyNades() {
    const f = this.data.frames[frameIndex(this.data.frames, this.t)];
    const list = f?.n || [];
    while (this.nadeMeshes.length < list.length) { const m = new THREE.Group(); this.scene.add(m); this.nadeMeshes.push(m); }
    this.nadeMeshes.forEach((g, i) => {
      const n = list[i];
      if (!n) { g.visible = false; return; }
      const kind = ITEM_IDS[n[0]];
      if (g.userData.kind !== kind) { g.clear(); if (nadeDef(kind)) { const mesh = buildGun(kind); mesh.scale.setScalar(1.6); g.add(mesh); } g.userData.kind = kind; }
      g.visible = true;
      g.position.set(n[1], n[2], n[3]);
    });
  }

  seek(t) {
    t = THREE.MathUtils.clamp(t, 0, this.data.duration);
    // Rebuild world state from the start, without effects or sounds.
    this.world.resetProps();
    for (const p of this.world.props.values()) if (p.ch === 'D') { p.anim = 0; }
    this.effects.clearRound();
    for (const f of this.fires.values()) this.effects.endFire(f);
    this.fires.clear();
    this.fireSeq = 0;
    this.bombState = null; this.scores = [0, 0];
    this.cursor = 0;
    this.processEvents(t, false);
    this.t = t;
    this.models.forEach((m, i) => {
      const st = sampleFrames(this.data.frames, i, t);
      m.everAlive = !!st && (st.alive || frameIndex(this.data.frames, t) > 0);
      if (st && !st.alive && m.everAlive) { m.die(1); m.deathT = 1; } else if (m.dead) m.revive();
    });
    this.refreshControls();
  }

  // ───────────── UI ─────────────
  mountUI() {
    const hud = document.getElementById('hud');
    this.hud = hud;
    hud.classList.remove('hidden');
    const d = this.data, map = MAPS[d.map];
    const marks = this.kills.map((k) => `<i style="left:${(k.t / d.duration) * 100}%" title="${esc(this.nameOf(k.a.killer))} → ${esc(this.nameOf(k.a.victim))}"></i>`).join('');
    hud.innerHTML = `<div class="replay-ui">
      <div class="rp-top"><span class="rp-badge">REPLAY</span><b>${esc(this.mode?.name || d.mode)}</b><span class="muted">${esc(map?.name || d.map)} · ${new Date(d.date).toLocaleString()}</span><span class="spacer"></span><span class="rp-score"></span><button class="btn small" data-a="exit">Exit (Esc)</button></div>
      <div class="rp-feed"></div>
      <div class="rp-players"></div>
      <div class="rp-target"></div>
      <div class="rp-bar">
        <button class="btn small rp-play" data-a="play"></button>
        <span class="rp-time"></span>
        <div class="rp-track"><input type="range" min="0" max="${d.duration}" step="0.05" value="0" class="rp-scrub"><div class="rp-marks">${marks}</div></div>
        <div class="seg rp-speed">${SPEEDS.map((s) => `<button data-s="${s}">${s}×</button>`).join('')}</div>
        <button class="btn small" data-a="cam"></button>
      </div>
      <div class="rp-help">Space play/pause · ←/→ 5 s · V camera · [ ] or Tab switch player · click the view in free camera, then WASD + mouse</div>
    </div>`;
    const q = (s) => hud.querySelector(s);
    q('[data-a=exit]').onclick = () => this.exit();
    q('[data-a=play]').onclick = () => this.togglePlay();
    q('[data-a=cam]').onclick = () => this.cycleCam();
    const scrub = q('.rp-scrub');
    scrub.oninput = () => { this.scrubbing = true; this.seek(+scrub.value); };
    scrub.onchange = () => { this.scrubbing = false; };
    hud.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { this.speed = +b.dataset.s; this.refreshControls(); }; });
    this.refreshControls();
  }

  nameOf(id) { return this.data.players.find((p) => p.id === id)?.name || (id ? id : ''); }

  refreshControls() {
    const hud = this.hud;
    if (!hud) return;
    hud.querySelector('[data-a=play]').textContent = this.playing ? '❚❚ Pause' : '▶ Play';
    hud.querySelector('[data-a=cam]').textContent = `Camera: ${CAM_LABELS[this.cam.mode]} (V)`;
    hud.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('sel', +b.dataset.s === this.speed));
    hud.querySelector('.rp-players').innerHTML = this.data.players.map((p, i) => `<div class="rp-p ${i === this.targetIdx ? 'sel' : ''} ${this.solo ? '' : TEAM_CLASS[p.team]}" data-i="${i}">${esc(p.name)}</div>`).join('');
    hud.querySelectorAll('.rp-p').forEach((e) => { e.onclick = () => { this.targetIdx = +e.dataset.i; if (this.cam.mode === 'free') this.cam.setMode('follow'); this.refreshControls(); }; });
  }

  updateUI() {
    const hud = this.hud, d = this.data;
    hud.querySelector('.rp-time').textContent = `${fmt(this.t)} / ${fmt(d.duration)}`;
    if (!this.scrubbing) hud.querySelector('.rp-scrub').value = this.t;
    hud.querySelector('.rp-score').textContent = this.solo ? '' : `${this.scores[0]} — ${this.scores[1]}`;
    const recent = this.kills.filter((k) => k.t <= this.t && k.t > this.t - 6).slice(-5).reverse();
    hud.querySelector('.rp-feed').innerHTML = recent.map((k) => {
      const w = itemInfo(k.a.w)?.name || k.a.w;
      return `<div class="kf">${k.a.killer && k.a.killer !== k.a.victim ? `<span>${esc(this.nameOf(k.a.killer))}</span>` : ''}<span class="w">${esc(w)}</span>${k.a.hs ? '<span class="hs">◉ HS</span>' : ''}<span>${esc(this.nameOf(k.a.victim))}</span></div>`;
    }).join('');
    const st = this.targetState(), p = d.players[this.targetIdx];
    hud.querySelector('.rp-target').innerHTML = p ? `<span class="muted small">${this.cam.mode === 'free' ? 'Free camera' : 'Watching'}</span><b>${esc(p.name)}</b>${st ? `<span>${st.alive ? st.hp + ' HP' : 'Dead'} · ${esc(itemInfo(st.weapon)?.name || '')}</span>` : ''}` : '';
  }

  exit() {
    if (!this.running) return;
    this.running = false;
    removeEventListener('keydown', this.onKey);
    removeEventListener('keyup', this.onKey);
    removeEventListener('mousemove', this.onMove);
    this.engine.renderer.domElement.removeEventListener('click', this.onClick);
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.innerHTML = '';
    this.hud.classList.add('hidden');
    this.viewmodel.setWeapon(null);
    this.engine.clearScene();
    this.app.exitReplay();
  }
}
