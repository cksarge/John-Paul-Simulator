import * as THREE from 'three';
import { World, CELL } from '../engine/world.js';
import { Effects } from '../engine/effects.js';
import { Viewmodel } from '../engine/viewmodel.js';
import { buildGun } from '../engine/models.js';
import { sfx, setListener, initAudio, setVolume } from '../engine/audio.js';
import { MAPS } from '../data/maps.js';
import { MODES, RESPAWN_KINDS, SOLO_KINDS, goalText, econFor } from '../data/modes.js';
import { WEAPONS, GRENADES, itemInfo, GUN_GAME_ORDER, nadeDef, isKnife } from '../data/weapons.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Rules } from './rules.js';
import { BotBrain } from './bot.js';
import { Hud } from './hud.js';
import {
  switchSlot, cycleSlot, startReload, tickWeapon, ready, spreadFor, applySpread, traceBullet, tracePierce, bulletDamage, bestSlot, hasSlot,
  reloadTime, maxNades, nadeLimit,
} from './combat.js';

const FFA_WEAPONS = [
  'ar7', 'm5', 'vex', 'longshot', 'breacher', 'trident', 'falcon', 'kestrel', 'reaper', 'bulldog', 'sparrow', 'hornet', 'mako',
  'coach', 'striker', 'mauler', 'anvil', 'hailstorm', 'warden', 'kodiak', 'crossbow', 'nailer', 'rail', 'ar7', 'm5',
];
const FFA_NADES = ['he', 'flash', 'fire', 'mine', 'decoy', 'smoke', 'he'];
const BOT_TDM_WEAPONS = ['ar7', 'm5', 'trident', 'kestrel', 'falcon', 'vex', 'reaper', 'mako', 'mauler', 'warden', 'hornet', 'striker'];
const BOT_SMGS = ['vex', 'kestrel', 'breacher', 'sparrow', 'hornet', 'mako', 'coach', 'striker', 'nailer'];
const BOT_NADES = ['he', 'smoke', 'flash', 'fire', 'mine', 'he'];
const loadoutKey = (mode) => 'jps_loadout_' + (econFor(mode) ? 'bomb' : 'free');

// One match. Runs identically online and offline; when `net` is null this client is the host.
export class Game {
  constructor(app, opts) {
    this.app = app;
    this.engine = app.engine;
    this.opts = opts;
    this.mode = MODES[opts.mode];
    this.econ = econFor(this.mode);
    this.mapDef = MAPS[opts.map];
    this.net = opts.net || null;
    this.online = !!this.net;
    this.localId = opts.localId;
    this.rejoin = !!opts.rejoin;
    // A rejoining player learns the current host from the snapshot (it may have changed).
    this.hostId = this.rejoin ? null : opts.hostId || opts.localId;
    this.isHost = this.hostId === this.localId;
    this.pendingLeave = new Map(); // id -> seconds left to reconnect
    this.matchId = opts.matchId || 'off-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.players = new Map();
    this.brains = new Map();
    this.state = { phase: 'warmup', time: 0, round: 0, scores: [0, 0], bomb: { state: 'none' } };
    this.botPlan = { site: 'A', ctIndex: 0 };
    this.nades = [];
    this.fires = [];
    this.decoys = [];
    this.nadeSeq = 0;
    this.punch = 0;
    this.lookDX = 0; this.lookDY = 0;
    this.outShots = new Map();
    this.sendT = 0;
    this.helloFrom = new Set([this.localId]);
    this.expectedHumans = (opts.players || []).filter((p) => !p.isBot).map((p) => p.id);
    this.running = false;
    this.paused = false;
    this.ended = false;
    this.action = null;
    this.spectateIdx = 0;
    this.lastFrame = performance.now();
    this.roundBuys = [];
    try { this.savedBuys = JSON.parse(localStorage.getItem(loadoutKey(this.mode)) || '[]'); } catch { this.savedBuys = []; }
  }

  get local() { return this.players.get(this.localId); }
  get settings() { return this.app.settings; }

  // ───────────────────────── setup ─────────────────────────
  async start() {
    const eng = this.engine;
    eng.clearScene();
    const scene = new THREE.Scene();
    this.scene = scene;
    this.world = new World(this.mapDef);
    this.world.build(scene);
    eng.setupEnvironment(scene, this.mapDef.theme, this.world.size);
    eng.setScene(scene);
    this.effects = new Effects(scene);
    this.viewmodel = new Viewmodel(eng.vmScene);
    this.bombMesh = buildGun('bomb');
    this.bombMesh.scale.setScalar(2.2);
    this.bombMesh.visible = false;
    this.bombLight = new THREE.PointLight(0xff2020, 0, 4, 2);
    this.bombMesh.add(this.bombLight);
    scene.add(this.bombMesh);
    this.beepT = 0;

    for (const info of this.opts.players) this.addPlayer(info);

    this.input = new Input(eng.renderer.domElement);
    this.input.onUnlock = () => { if (!this.ended && !this.hud.overlayOpen()) this.hud.showPause(); };
    this.input.onCanvasClick = () => { if (!this.ended && (!this.hud.overlayOpen() || this.hud.overlay === 'score')) this.hud.closeOverlay(true); };
    this.hud = new Hud(this);
    this.hud.mount();
    initAudio();
    setVolume(this.settings.volume);

    if (this.online) this.bindNet();
    if (this.isHost) {
      this.rules = new Rules(this);
      this.rules.begin();
    } else {
      this.helloT = 0;
      if (this.rejoin) {
        this.hud.center('RECONNECTING', 'Syncing with the match…', 14);
        setTimeout(() => {
          if (this.gotSnap || this.ended) return;
          this.app.clearActiveMatch?.();
          this.hud.center('MATCH UNAVAILABLE', 'That match has ended or everyone left.', 3);
          setTimeout(() => this.leave(), 2500);
        }, 14000);
      }
    }
    this.running = true;
    this.hud.showClickToPlay();
    requestAnimationFrame((t) => this.frame(t));
  }

  addPlayer(info) {
    if (this.players.has(info.id)) return this.players.get(info.id);
    const p = new Player(info);
    p.owner = info.isBot ? this.hostId : info.id;
    p.isLocal = info.id === this.localId;
    p.isRemoteView = p.owner !== this.localId;
    this.players.set(p.id, p);
    if (info.isBot && this.isHost) this.brains.set(p.id, new BotBrain(this, p, this.opts.botLevel || 'normal'));
    if (!p.isLocal) {
      p.ensureModel(this.scene, !SOLO_KINDS.has(this.mode.kind));
      p.model.root.visible = false;
      this.attachNameTag(p);
    } else {
      p.ensureModel(this.scene, !SOLO_KINDS.has(this.mode.kind));
      p.model.root.visible = false;
    }
    return p;
  }

  attachNameTag(p) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 48;
    const g = c.getContext('2d');
    g.font = '600 26px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(p.name, 128, 24);
    g.fillStyle = '#fff'; g.fillText(p.name, 128, 24);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(1.1, 0.21, 1);
    s.position.y = 2.15;
    s.renderOrder = 10;
    p.model.root.add(s);
    p.tag = s;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.model?.dispose();
    this.players.delete(id);
    this.brains.delete(id);
  }

  canDamage(a, b) {
    if (!a || !b || a === b) return false;
    if (SOLO_KINDS.has(this.mode.kind)) return true;
    return a.team !== b.team;
  }

  waitingForPlayers() {
    return this.online && this.expectedHumans.some((id) => !this.helloFrom.has(id));
  }

  // ───────────────────────── loop ─────────────────────────
  frame(now) {
    if (!this.running) return;
    requestAnimationFrame((t) => this.frame(t));
    const maxFps = this.settings.maxFps;
    if (maxFps > 0 && now - this.lastFrame < 1000 / maxFps - 1) return;
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.fpsAcc = (this.fpsAcc || 0) * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;
    // Safety net: if the mouse was released while another panel (e.g. the Tab scoreboard) was open,
    // nothing would offer a way back in, so show the pause menu.
    const inp = this.input;
    if (!this.ended && !inp.locked && !inp.typing && (!this.hud.overlayOpen() || this.hud.overlay === 'score') && now - inp.lockRequestedAt > 1600) this.hud.showPause();
    try {
      if (!(this.paused && !this.online)) this.update(dt, now);
      this.updateCamera(dt);
      this.engine.render();
    } catch (e) {
      console.error(e);
    }
    this.input.endFrame();
  }

  update(dt, now) {
    if (this.isHost) this.rules.update(dt);
    else {
      this.state.time -= dt;
      if (this.state.bomb?.state === 'planted') this.state.bomb.time -= dt;
      this.helloT -= dt;
      if (!this.gotSnap && this.helloT <= 0) { this.helloT = 1.5; this.net.send('hello', { id: this.localId }); }
    }
    const lp = this.local;
    if (lp) this.updateLocal(dt, lp);
    for (const [id, brain] of this.brains) {
      const p = this.players.get(id);
      if (p) { brain.update(dt); tickWeapon(p, dt, p.triggerHeld); }
    }
    for (const p of this.players.values()) {
      if (p.isRemoteView && p.owner !== this.localId) {
        p.interpolate(now, this.interpDelay());
        if (p.alive && p.onGround && p.netSpeed > 3.6) {
          p.stepDist += p.netSpeed * dt;
          if (p.stepDist > 2.4) { p.stepDist = 0; sfx.step(p.pos); }
        }
      }
      p.firingT -= dt;
      const showModel = !p.isLocal || this.spectating() || this.state.phase === 'over';
      if (p.model) {
        if (p.alive && p.model.dead) p.model.revive();
        p.syncModel(dt, showModel && (p.alive || p.model.dead) && !(p.isLocal && !this.spectating()));
        if (p.tag) p.tag.visible = p.alive && lp && !p.isLocal && !SOLO_KINDS.has(this.mode.kind) && p.team === lp.team;
      }
    }
    this.updateNades(dt);
    this.updateBomb(dt);
    this.world.update(dt);
    if (this.isHost && RESPAWN_KINDS.has(this.mode.kind)) this.tickPropRespawn(dt);
    if (this.pendingLeave.size) this.tickPendingLeaves(dt);
    this.effects.update(dt);
    if (this.online) this.netSend(dt);
    this.hud.update(dt);
  }

  interpDelay() {
    return this.sendInterval() * 1000 * 1.6 + 30;
  }

  sendInterval() {
    const humans = this.expectedHumans.length;
    return humans <= 2 ? 1 / 20 : humans <= 4 ? 1 / 15 : 1 / 10;
  }

  // ───────────────────────── local player ─────────────────────────
  updateLocal(dt, p) {
    const inp = this.input, s = this.settings;
    const ui = this.hud.overlayOpen() || !inp.locked;
    // Look
    const w = p.weapon;
    const zoom = p.ws.scope > 0 && w?.scope ? w.scope[p.ws.scope - 1] / s.fov : 1;
    const sens = 0.0022 * s.sens * (p.ws.scope > 0 ? s.scopedSens * zoom : 1);
    const mdx = ui ? 0 : inp.mouse.dx, mdy = ui ? 0 : inp.mouse.dy * (s.invertY ? -1 : 1);
    this.lookDX = mdx; this.lookDY = mdy;
    if (p.alive) {
      p.yaw -= mdx * sens;
      p.pitch = THREE.MathUtils.clamp(p.pitch - mdy * sens, -1.5, 1.5);
    }
    this.punch += (0 - this.punch) * Math.min(1, dt * 5);

    if (!p.alive) {
      if (!ui && (inp.clicked('left') || inp.pressed('Space'))) this.spectateIdx++;
      this.handleUiKeys(p, ui);
      return;
    }
    const frozen = this.state.phase === 'buy' || this.state.phase === 'warmup';
    const k = (c) => !ui && inp.down(c);

    // Plant / defuse (hold E)
    const b = this.state.bomb || {};
    let acting = false;
    if (k('KeyE') && this.state.phase === 'live' && p.onGround) {
      if (b.state === 'carried' && b.carrier === p.id && this.world.siteAt(p.pos.x, p.pos.z)) {
        acting = true;
        if (this.action?.type !== 'plant') this.action = { type: 'plant', t: 0 };
        this.action.t += dt;
        if (this.action.t >= this.actionTime('plant', p)) { this.request('plant', { pos: [p.pos.x, p.pos.y, p.pos.z] }); this.action = null; }
      } else if (b.state === 'planted' && p.team === 1 && Math.hypot(p.pos.x - b.pos[0], p.pos.z - b.pos[2]) < 2.2) {
        acting = true;
        if (this.action?.type !== 'defuse') this.action = { type: 'defuse', t: 0 };
        this.action.t += dt;
        if (this.action.t >= this.actionTime('defuse', p)) { this.request('defuse', {}); this.action = null; }
      }
    }
    if (!acting) this.action = null;
    if (!ui && !acting && inp.pressed('KeyE')) this.interact(p);

    // Move
    const wish = new THREE.Vector3();
    if (!frozen && !acting) {
      const f = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
      const r = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
      wish.set(-sy * f + cy * r, 0, -cy * f - sy * r);
      if (wish.lengthSq() > 0) wish.normalize();
    }
    const wasGround = p.onGround, prevVy = p.vel.y;
    this.movePlayer(p, wish, dt, {
      walk: k('ShiftLeft') || k('ShiftRight'),
      crouch: k('ControlLeft') || k('KeyC') || acting,
      jump: !frozen && !acting && !ui && inp.pressed('Space'),
    });
    if (!wasGround && p.onGround && prevVy < -4) sfx.land(null);

    // Weapons
    if (!ui) {
      const slots = { Digit1: 'primary', Digit2: 'secondary', Digit3: 'melee', Digit4: 'nade', Digit5: 'bomb' };
      for (const [code, slot] of Object.entries(slots)) if (inp.pressed(code)) this.selectSlot(p, slot);
      if (inp.pressed('KeyQ')) this.selectSlot(p, hasSlot(p, p.lastSlot) ? p.lastSlot : bestSlot(p));
      if (inp.mouse.wheel) { cycleSlot(p, inp.mouse.wheel > 0 ? 1 : -1); this.viewmodel.setWeapon(p.weaponId, p.char); }
      if (inp.pressed('KeyR') && startReload(p)) sfx.reload(null);
      if (inp.clicked('right')) this.altFire(p);
    }
    if (this.viewmodel.id !== p.weaponId) this.viewmodel.setWeapon(p.weaponId, p.char);
    const firing = !ui && !frozen && !acting && inp.mouse.left;
    if (tickWeapon(p, dt, firing)) { /* reload finished */ }
    if (firing || p.burstLeft > 0) this.tryFire(p, true);
    if (!firing) this.releaseTrigger(p);

    this.handleUiKeys(p, ui);
    this.viewmodel.update(dt, {
      speed: Math.hypot(p.vel.x, p.vel.z), onGround: p.onGround, lookDX: this.lookDX, lookDY: this.lookDY,
      reload: p.ws.reloadT >= 0 && w ? p.ws.reloadT / reloadTime(p, w) : -1, scoped: p.ws.scope > 0,
      drawTime: w?.draw || 0.4,
    });
  }

  handleUiKeys(p, ui) {
    const inp = this.input;
    this.hud.setScoreboard(inp.keys.has('Tab') && !inp.typing);
    if (!ui && inp.pressed('KeyB')) this.hud.toggleBuy();
    if (!ui && inp.pressed('KeyF') && this.canBuy()) this.rebuy(true);
    if (!ui && inp.pressed('KeyK')) this.toggleKeepLoadout();
    if (!ui && this.online && (inp.pressed('Enter') || inp.pressed('KeyY') || inp.pressed('KeyT'))) this.hud.openChat();
  }

  selectSlot(p, slot) {
    if (switchSlot(p, slot)) this.viewmodel.setWeapon(p.weaponId, p.char);
  }

  altFire(p) {
    const w = p.weapon;
    if (!w) return;
    if (w.scope && p.ws.reloadT < 0) { p.ws.scope = (p.ws.scope + 1) % (w.scope.length + 1); sfx.click(); }
    if (w.type === 'knife' && ready(p)) this.knife(p, true);
  }

  canBuy(p = this.local) {
    if (!p || !p.alive) return false;
    if (SOLO_KINDS.has(this.mode.kind)) return false;
    if (this.mode.kind === 'tdm') return this.state.phase === 'live';
    if (this.state.phase === 'buy') return true;
    if (this.state.phase === 'live' && this.mode.kind === 'bomb' && this.state.time > this.mode.roundTime - 20) {
      const r = this.mapDef.spawns[p.team];
      const cx = Math.floor(p.pos.x / CELL), cy = Math.floor(p.pos.z / CELL);
      return cx >= r[0] - 2 && cx <= r[2] + 2 && cy >= r[1] - 2 && cy <= r[3] + 2;
    }
    return false;
  }

  priceOf(item, p = this.local) {
    if (!this.econ) return 0;
    const price = itemInfo(item)?.price ?? 0;
    return GRENADES[item] && p?.char?.perk === 'utility' ? Math.round(price / 2) : price;
  }

  actionTime(type, p) {
    const t = type === 'plant' ? this.mode.plantTime : this.mode.defuseTime;
    return t * (p?.char?.perk === 'quickhands' ? 0.7 : 1);
  }

  // ───────────────────────── saved loadouts ─────────────────────────
  toggleKeepLoadout() {
    this.settings.keepLoadout = !this.settings.keepLoadout;
    try { localStorage.setItem('jps_settings', JSON.stringify(this.settings)); } catch { /* ignore */ }
    this.hud.info(this.settings.keepLoadout ? 'Keep loadout ON — your last loadout is re-equipped automatically' : 'Keep loadout OFF', 2.5);
    this.hud.refreshBuy();
  }

  // Re-requests every item from the last loadout the player bought (host validates money and limits).
  rebuy(manual = false) {
    const items = this.savedBuys || [];
    if (!items.length) { if (manual) this.hud.info('No saved loadout yet — buy something first', 2); return; }
    items.forEach((item, i) => setTimeout(() => { if (this.canBuy()) this.request('buy', { item }); }, i * 60));
    if (manual) this.hud.info('Rebuying last loadout', 1.5);
  }

  // TDM has no rounds, so a loadout is saved shortly after the player stops buying.
  commitRoundBuysSoon() {
    clearTimeout(this.commitT);
    this.commitT = setTimeout(() => this.commitRoundBuys(), 1500);
  }

  commitRoundBuys() {
    if (!this.roundBuys.length) return;
    this.savedBuys = this.roundBuys;
    this.roundBuys = [];
    try { localStorage.setItem(loadoutKey(this.mode), JSON.stringify(this.savedBuys)); } catch { /* ignore */ }
  }

  buy(item) {
    if (!this.canBuy()) return;
    this.request('buy', { item });
  }

  // ───────────────────────── movement ─────────────────────────
  movePlayer(p, wish, dt, { walk = false, crouch = false, jump = false } = {}) {
    p.crouching = crouch;
    p.walking = walk;
    p.crouch += ((crouch ? 1 : 0) - p.crouch) * Math.min(1, dt * 10);
    const w = p.weapon;
    let max = 6.0 * (w?.moveSpeed || 1) * (p.ws.scope > 0 ? 0.5 : 1) * (p.char?.perk === 'fleet' ? 1.06 : 1);
    if (crouch) max *= 0.42; else if (walk) max *= 0.52;
    const v = p.vel;
    if (p.onGround) {
      const speed = Math.hypot(v.x, v.z);
      if (speed > 0) {
        const drop = Math.max(speed, 1.6) * 7 * dt;
        const ns = Math.max(0, speed - drop) / speed;
        v.x *= ns; v.z *= ns;
      }
      if (wish.lengthSq() > 0) {
        const cur = v.x * wish.x + v.z * wish.z;
        const add = max - cur;
        if (add > 0) {
          const acc = Math.min(add, 10 * max * dt);
          v.x += wish.x * acc; v.z += wish.z * acc;
        }
      }
      if (jump) { v.y = 6.6; p.onGround = false; }
    } else if (wish.lengthSq() > 0) {
      const cur = v.x * wish.x + v.z * wish.z;
      const add = Math.min(0.9, max) - cur;
      if (add > 0) { const acc = Math.min(add, 12 * max * dt); v.x += wish.x * acc; v.z += wish.z * acc; }
    }
    this.world.move(p, dt);
    const sp = Math.hypot(v.x, v.z);
    if (p.onGround && sp > 3.6 && !walk && !crouch) {
      p.stepDist += sp * dt;
      if (p.stepDist > 2.4) { p.stepDist = 0; sfx.step(p.isLocal ? null : p.pos, p.isLocal ? 0.6 : 1); }
    }
  }

  // ───────────────────────── combat ─────────────────────────
  releaseTrigger(p) { p.triggerHeld = false; }

  tryFire(p, isLocal) {
    if (!p.alive) return;
    // Grenades aren't in WEAPONS, so handle them before the weapon lookup.
    if (p.slot === 'nade') { if (!p.triggerHeld && ready(p)) this.throwNade(p); p.triggerHeld = true; return; }
    const w = p.weapon;
    if (!w) return;
    if (w.type === 'knife') { if (ready(p)) this.knife(p, false); return; }
    if (p.slot === 'bomb') return;
    if (!ready(p)) return;
    if (!w.auto && p.triggerHeld && !(w.burst && p.burstLeft > 0)) return;
    const a = p.ammo[w.id];
    if (!a) return;
    if (a.mag <= 0) {
      if (!p.triggerHeld && isLocal) sfx.dryFire();
      p.triggerHeld = true;
      if (startReload(p) && isLocal) sfx.reload(null);
      return;
    }
    a.mag--;
    const breath = p.char?.perk === 'breath' && (w.type === 'sniper' || w.id === 'falcon') ? 0.8 : 1;
    p.ws.cooldown = w.fireRate * breath;
    if (w.burst) {
      // Burst rifles fire `burst` rounds per trigger pull, then wait burstDelay.
      if (!(p.burstLeft > 0)) p.burstLeft = w.burst;
      p.burstLeft--;
      if (p.burstLeft <= 0 || a.mag === 0) { p.ws.cooldown = w.burstDelay; p.burstLeft = 0; }
    }
    p.triggerHeld = true;
    p.firingT = 0.12;
    if (w.projectile) { this.fireProjectile(p, w, isLocal); this.recoil(p, w, isLocal); return; }
    const origin = p.eye();
    const pitch = p.pitch + (isLocal ? this.punch : 0);
    const cp = Math.cos(pitch);
    const base = new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(pitch), -Math.cos(p.yaw) * cp);
    const spread = spreadFor(p);
    const dmgBy = new Map();
    const shots = [];
    const addHit = (victim, part, dist) => {
      const d = bulletDamage(w, part, dist);
      const prev = dmgBy.get(victim) || { d: 0, part: 'legs' };
      prev.d += d;
      if (part === 'head' || (part === 'body' && prev.part === 'legs')) prev.part = part;
      dmgBy.set(victim, prev);
    };
    for (let i = 0; i < (w.pellets || 1); i++) {
      const dir = applySpread(base, spread);
      if (w.pierce) {
        // Rail: passes through every player on the line and stops at the first wall.
        const tr = tracePierce(this, p, origin, dir);
        for (const h of tr.hits) {
          addHit(h.victim, h.part, h.dist);
          this.effects.impact(origin.clone().addScaledVector(dir, h.dist), dir.clone().negate(), { blood: true });
        }
        if (tr.normal) { this.effects.impact(tr.end, tr.normal); this.shootProp(p, tr.end, tr.normal, w.damage); }
        this.effects.beam(this.muzzlePos(p, isLocal), tr.end);
        this.breakGlassAlong(origin, tr.end, p);
        shots.push([+tr.end.x.toFixed(2), +tr.end.y.toFixed(2), +tr.end.z.toFixed(2), 2]);
        continue;
      }
      const tr = traceBullet(this, p, origin, dir);
      this.breakGlassAlong(origin, tr.end, p);
      if (tr.victim) {
        addHit(tr.victim, tr.part, tr.dist);
        this.effects.impact(tr.end, tr.normal, { blood: true });
        shots.push([+tr.end.x.toFixed(2), +tr.end.y.toFixed(2), +tr.end.z.toFixed(2), 1]);
      } else if (tr.normal) {
        this.effects.impact(tr.end, tr.normal);
        this.shootProp(p, tr.end, tr.normal, w.damage);
        shots.push([+tr.end.x.toFixed(2), +tr.end.y.toFixed(2), +tr.end.z.toFixed(2), 0, tr.normal.x, tr.normal.y, tr.normal.z]);
      } else shots.push([+tr.end.x.toFixed(1), +tr.end.y.toFixed(1), +tr.end.z.toFixed(1), 2]);
      if (i < 3 && !w.silent) this.effects.tracer(this.muzzlePos(p, isLocal), tr.end);
    }
    for (const [victim, { d, part }] of dmgBy) {
      this.request('hit', { v: victim.id, d: Math.round(d), part, w: w.id }, p);
      if (isLocal) this.hud.hitmarker(part === 'head', false);
      if (isLocal) sfx.hit(part === 'head');
    }
    this.recoil(p, w, isLocal);
    if (isLocal && w.type === 'sniper' && !w.keepScope) p.ws.scope = 0;
    this.queueShot(p, w.id, shots);
  }

  recoil(p, w, isLocal) {
    p.ws.spray++;
    const steady = p.char?.perk === 'steady' && (w.type === 'rifle' || w.type === 'lmg') ? 0.75 : 1;
    const kick = w.recoil * steady * (1 + Math.min(p.ws.spray, 10) * 0.1);
    const yawKick = (Math.random() - 0.5) * 2 * w.recoilYaw * (p.ws.spray > 6 ? 1.6 : 1);
    if (isLocal) {
      this.punch += kick * 0.45;
      p.pitch = Math.min(1.5, p.pitch + kick * 0.55);
      p.yaw += yawKick;
      this.viewmodel.fire(w.type === 'sniper' || w.type === 'shotgun' || w.projectile ? 1.8 : 1, !w.silent);
    } else {
      p.pitch += kick * 0.35;
    }
    sfx.shot(w.id, isLocal ? null : p.pos);
    if (!isLocal && !w.silent) this.effects.muzzle(this.muzzlePos(p, false), w.type === 'pistol' ? 0.7 : 1);
  }

  fireProjectile(p, w, isLocal) {
    const def = nadeDef(w.projectile);
    const pitch = p.pitch + (isLocal ? this.punch : 0), cp = Math.cos(pitch);
    const f = new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(pitch), -Math.cos(p.yaw) * cp);
    const o = p.eye().addScaledVector(f, 0.5);
    const v = f.multiplyScalar(def.speed).add(new THREE.Vector3(0, 1.2, 0));
    this.broadcast('nade', { nid: this.newNid(p), id: p.id, team: p.team, kind: w.projectile, w: w.id, o: [o.x, o.y, o.z], v: [v.x, v.y, v.z] });
    this.queueShot(p, w.id, []);
  }

  knife(p, heavy) {
    const w = p.weapon?.type === 'knife' ? p.weapon : WEAPONS.knife;
    p.ws.cooldown = heavy ? w.altRate : w.fireRate;
    p.firingT = 0.2;
    if (p.isLocal) this.viewmodel.swingKnife(heavy);
    sfx.knife(p.isLocal ? null : p.pos);
    const origin = p.eye(), dir = p.forward();
    let best = null;
    for (const yawOff of [0, -0.15, 0.15]) {
      const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yawOff);
      for (const o of this.players.values()) {
        if (!this.canDamage(p, o) || !o.alive) continue;
        const h = o.hitTest(origin, d, w.range);
        if (h && (!best || h.dist < best.dist)) best = { o, ...h };
      }
    }
    const wall = this.world.raycast(origin, dir, w.range);
    if (best && (!wall || wall.dist > best.dist)) {
      const victimFwd = best.o.forward().setY(0).normalize();
      const back = victimFwd.dot(dir.clone().setY(0).normalize()) > 0.5;
      const dmg = (heavy ? w.altDamage : w.damage) * (back ? w.backstab : 1);
      this.request('hit', { v: best.o.id, d: Math.round(dmg), part: 'body', w: w.id }, p);
      const pt = origin.clone().addScaledVector(dir, best.dist);
      this.effects.impact(pt, dir.clone().negate(), { blood: true });
      if (p.isLocal) { this.hud.hitmarker(false, false); sfx.hit(false); }
      this.queueShot(p, w.id, [[+pt.x.toFixed(2), +pt.y.toFixed(2), +pt.z.toFixed(2), 1]]);
    } else if (wall) {
      this.effects.impact(wall.point, wall.normal);
      this.shootProp(p, wall.point, wall.normal, w.damage);
      sfx.impact(wall.point);
    }
  }

  muzzlePos(p, local) {
    const f = p.forward(), r = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    return p.eye().addScaledVector(f, local ? 0.6 : 0.75).addScaledVector(r, local ? 0.12 : 0.18).add(new THREE.Vector3(0, local ? -0.12 : -0.22, 0));
  }

  queueShot(p, w, shots) {
    if (!this.online) return;
    if (!this.outShots.has(p.id)) this.outShots.set(p.id, []);
    this.outShots.get(p.id).push([w, ...shots.flat().slice(0, 40)]);
  }

  // Remote shot visuals.
  playShots(p, list) {
    for (const s of list) {
      const w = s[0];
      if (isKnife(w)) { sfx.knife(p.pos); continue; }
      const wd = WEAPONS[w];
      sfx.shot(w, p.pos);
      const muzzle = this.muzzlePos(p, false);
      if (!wd?.silent) this.effects.muzzle(muzzle, wd?.type === 'pistol' ? 0.7 : 1);
      p.firingT = 0.12;
      for (let i = 1; i < s.length;) {
        const end = new THREE.Vector3(s[i], s[i + 1], s[i + 2]), kind = s[i + 3];
        if (kind === 0) {
          this.effects.impact(end, new THREE.Vector3(s[i + 4], s[i + 5], s[i + 6]));
          i += 7;
        } else {
          if (kind === 1) this.effects.impact(end, new THREE.Vector3(0, 1, 0), { blood: true });
          i += 4;
        }
        if (wd?.pierce) this.effects.beam(muzzle, end);
        else if (!wd?.silent) this.effects.tracer(muzzle, end);
      }
    }
  }

  // ───────────────────────── grenades ─────────────────────────
  newNid(p) { return `${p.id}:${++this.nadeSeq}:${Math.random().toString(36).slice(2, 5)}`; }

  throwNade(p) {
    const kind = p.weaponId;
    if (!GRENADES[kind]) return;
    const i = p.inv.nades.indexOf(kind);
    if (i >= 0) p.inv.nades.splice(i, 1);
    const f = p.forward();
    const o = p.eye().addScaledVector(f, 0.4);
    const v = f.clone().multiplyScalar(kind === 'mine' ? 9 : 15).add(new THREE.Vector3(p.vel.x * 0.5, 2.2, p.vel.z * 0.5));
    p.ws.cooldown = 0.6;
    this.broadcast('nade', { nid: this.newNid(p), id: p.id, team: p.team, kind, o: [o.x, o.y, o.z], v: [v.x, v.y, v.z] });
    switchSlot(p, bestSlot(p));
    if (p.isLocal) this.viewmodel.setWeapon(p.weaponId, p.char);
  }

  spawnNade(d) {
    const mesh = buildGun(d.kind);
    mesh.scale.setScalar(1.6);
    this.scene.add(mesh);
    // Each player keeps at most two mines down; the oldest is removed first.
    if (d.kind === 'mine') {
      const mine = this.nades.filter((n) => n.kind === 'mine' && n.id === d.id);
      if (mine.length >= 2) this.removeNade(this.nades.indexOf(mine[0]));
    }
    const shooter = this.players.get(d.id);
    this.nades.push({ ...d, pos: new THREE.Vector3(...d.o), vel: new THREE.Vector3(...d.v), t: 0, mesh, still: 0, state: 'fly', shooter });
  }

  // Moves one grenade a step with bounces. Returns {floor, wall} for what it hit this frame.
  stepNade(n, dt) {
    const W = this.world, steps = 3, h = dt / steps;
    const hit = { floor: false, wall: false, player: false };
    for (let s = 0; s < steps; s++) {
      n.vel.y -= 20 * h;
      const next = n.pos.clone().addScaledVector(n.vel, h);
      // Launcher rounds burst on contact with anyone but the shooter (shortly after leaving the barrel).
      if (nadeDef(n.kind).impact) {
        const seg = next.clone().sub(n.pos), len = seg.length();
        if (len > 0) {
          seg.divideScalar(len);
          for (const o of this.players.values()) {
            if (!o.alive || (o === n.shooter && n.t < 0.25)) continue;
            if (o.hitTest(n.pos, seg, len)) { hit.player = true; return hit; }
          }
        }
      }
      const hNext = W.heightAt(next.x, next.z);
      if (next.y < hNext) {
        const hCur = W.heightAt(n.pos.x, n.pos.z);
        let bounced = false;
        if (n.pos.y >= hNext - 0.01 && hCur <= n.pos.y) {
          n.vel.y = -n.vel.y * 0.4; n.vel.x *= 0.7; n.vel.z *= 0.7; bounced = true; next.y = hNext + 0.01; hit.floor = true;
        } else {
          if (W.heightAt(next.x, n.pos.z) > n.pos.y) { n.vel.x = -n.vel.x * 0.45; next.x = n.pos.x; bounced = true; }
          if (W.heightAt(n.pos.x, next.z) > n.pos.y) { n.vel.z = -n.vel.z * 0.45; next.z = n.pos.z; bounced = true; }
          if (!bounced) { n.vel.x = -n.vel.x * 0.45; n.vel.z = -n.vel.z * 0.45; next.x = n.pos.x; next.z = n.pos.z; }
          hit.wall = true;
        }
        if (n.vel.length() > 2) sfx.bounce(n.pos);
      }
      n.pos.copy(next);
    }
    return hit;
  }

  updateNades(dt) {
    const W = this.world;
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      const g = nadeDef(n.kind);
      n.t += dt;
      let hit = { floor: false, wall: false, player: false };
      if (n.state === 'fly') {
        hit = this.stepNade(n, dt);
        n.mesh.rotation.x += dt * n.vel.length() * 2;
        if (n.vel.length() < 0.4) n.still += dt;
      }
      n.mesh.position.copy(n.pos);
      const floorY = () => W.heightAt(n.pos.x, n.pos.z);
      if (g.impact) {
        if (hit.floor || hit.wall || hit.player || n.t >= g.fuse) this.detonate(i);
      } else if (n.kind === 'he') {
        if (n.t >= g.fuse) this.detonate(i);
      } else if (n.kind === 'flash') {
        if (n.t >= g.fuse) { this.flashBurst(n.pos.clone(), g); this.removeNade(i); }
      } else if (n.kind === 'smoke') {
        if ((n.still > 0.3 || n.t > 3) && n.t >= 1) {
          this.effects.smoke(n.pos.clone().setY(floorY()), g.radius, g.duration);
          sfx.smoke(n.pos);
          // Smoke puts out fires it covers.
          for (const f of this.fires) if (f.pos.distanceTo(n.pos) < f.radius + g.radius) f.t = Math.min(f.t, 0.4);
          this.removeNade(i);
        }
      } else if (n.kind === 'fire') {
        if ((hit.floor && n.t > 0.2) || n.t >= g.fuse) { this.ignite(n.pos.clone().setY(floorY()), g, n); this.removeNade(i); }
      } else if (n.kind === 'mine') {
        if (n.state === 'fly' && (n.still > 0.15 || n.t > 4)) {
          n.state = 'set'; n.armT = g.arm; n.vel.set(0, 0, 0);
          n.pos.y = floorY(); n.mesh.position.copy(n.pos); n.mesh.rotation.set(0, n.mesh.rotation.y, 0);
          sfx.beep(n.pos);
        }
        if (n.state === 'set') {
          n.armT -= dt;
          const led = n.mesh.getObjectByName('led');
          if (led) led.visible = n.armT > 0 ? true : Math.floor(n.t * 2.5) % 2 === 0;
          if (this.isHost && n.armT <= 0 && !n.triggered && this.state.phase !== 'post') {
            for (const o of this.players.values()) {
              if (!o.alive || o.id === n.id || (!SOLO_KINDS.has(this.mode.kind) && o.team === n.team)) continue;
              if (Math.hypot(o.pos.x - n.pos.x, o.pos.z - n.pos.z) < g.trigger && Math.abs(o.pos.y - n.pos.y) < 1.6) {
                n.triggered = true;
                this.broadcast('boom', { nid: n.nid });
                break;
              }
            }
          }
        }
      } else if (n.kind === 'decoy') {
        if ((n.still > 0.3 || n.t > 3) && n.t >= g.fuse) {
          const owner = this.players.get(n.id);
          const wid = owner?.inv.primary || owner?.inv.secondary || 'ar7';
          this.decoys.push({ pos: n.pos.clone().setY(floorY()), t: g.duration, owner: n.id, team: n.team, weapon: wid, nextT: 0.3, firingT: 0, mesh: n.mesh });
          this.nades.splice(i, 1);
        }
      }
    }
    this.updateFires(dt);
    this.updateDecoys(dt);
  }

  removeNade(i) {
    if (i < 0 || !this.nades[i]) return;
    this.nades[i].mesh.removeFromParent();
    this.nades.splice(i, 1);
  }

  // Explosion for frags, launcher rounds and triggered mines.
  detonate(i) {
    const n = this.nades[i];
    if (!n) return;
    const g = nadeDef(n.kind);
    const pos = n.pos.clone();
    if (n.kind === 'mine') pos.y += 0.15;
    this.effects.explosion(pos);
    sfx.explosion(pos);
    this.removeNade(i);
    this.breakGlassAround(pos, g.radius * 0.6);
    if (this.isHost) {
      this.blastDamage(pos, g, this.players.get(n.id), n.w || n.kind);
      this.chainBarrels(pos, g.radius, n.id);
    }
  }

  blastDamage(center, g, thrower, weapon) {
    const c = center.clone().setY(center.y + 0.3);
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p !== thrower && thrower && !this.canDamage(thrower, p)) continue;
      const chest = p.pos.clone().setY(p.pos.y + 1.1);
      const d = chest.distanceTo(c);
      if (d > g.radius || !this.world.lineOfSight(c, chest)) continue;
      this.hostDamage(thrower || null, p, g.damage * (1 - d / g.radius) * (p === thrower ? 0.5 : 1), 'body', weapon);
    }
  }

  // Flashbang: every client works out its own player's blindness; the host also blinds bots.
  flashBurst(pos, g) {
    this.effects.flash(pos);
    sfx.flash(pos);
    const lp = this.local;
    if (lp?.alive) this.hud.blind(this.blindAmount(lp, pos, g));
    if (this.isHost) for (const [id, brain] of this.brains) { const p = this.players.get(id); if (p?.alive) brain.blind(this.blindAmount(p, pos, g)); }
  }

  blindAmount(p, pos, g) {
    const eye = p.eye(), d = eye.distanceTo(pos);
    if (d > g.radius || !this.world.lineOfSight(eye, pos) || this.effects.smokeBlocks(eye, pos)) return 0;
    const facing = p.forward().dot(pos.clone().sub(eye).normalize());
    const look = facing > 0.55 ? 1 : facing > 0 ? 0.55 : 0.2;
    return g.blind * look * Math.max(0.15, 1 - d / g.radius);
  }

  ignite(pos, g, n) {
    if (this.effects.smokeCovers(pos)) { sfx.smoke(pos); return; }
    sfx.fire(pos);
    this.fires.push({ pos, radius: g.radius, t: g.duration, dps: g.dps, owner: n.id, tick: 0, vis: this.effects.fire(pos, g.radius, g.duration) });
  }

  updateFires(dt) {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      f.vis.life = f.t;
      if (f.t <= 0) { this.effects.endFire(f.vis); this.fires.splice(i, 1); continue; }
      if (!this.isHost) continue;
      f.tick -= dt;
      if (f.tick > 0) continue;
      f.tick = 0.25;
      const owner = this.players.get(f.owner) || null;
      for (const p of this.players.values()) {
        if (!p.alive || Math.hypot(p.pos.x - f.pos.x, p.pos.z - f.pos.z) > f.radius || Math.abs(p.pos.y - f.pos.y) > 1.2) continue;
        if (owner && p !== owner && !this.canDamage(owner, p)) continue;
        this.hostDamage(owner, p, f.dps * 0.25 * (p === owner ? 0.5 : 1), 'legs', 'fire');
      }
    }
  }

  // Decoys fake bursts of the thrower's gun and show up on enemy radar while "firing".
  updateDecoys(dt) {
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.t -= dt; d.nextT -= dt; d.firingT -= dt;
      if (d.t <= 0) { d.mesh.removeFromParent(); sfx.bounce(d.pos); this.decoys.splice(i, 1); continue; }
      if (d.nextT <= 0) {
        sfx.shot(d.weapon, d.pos);
        d.firingT = 0.8;
        d.burst = (d.burst || 0) - 1;
        if (d.burst <= 0) { d.burst = 1 + Math.floor(Math.random() * 5); d.nextT = 0.7 + Math.random() * 1.6; }
        else d.nextT = WEAPONS[d.weapon]?.auto ? WEAPONS[d.weapon].fireRate : 0.25;
      }
    }
  }

  clearNades() {
    for (const n of this.nades) n.mesh.removeFromParent();
    for (const d of this.decoys) d.mesh.removeFromParent();
    for (const f of this.fires) this.effects.endFire(f.vis);
    this.nades = []; this.decoys = []; this.fires = [];
  }

  // ───────────────────────── interactive props ─────────────────────────
  // Nearest door or ammo crate the player can use, or null.
  usableProp(p) {
    const eye = p.eye(), f = p.forward().setY(0).normalize();
    let best = null, bd = Infinity;
    for (const pr of this.world.props.values()) {
      if (pr.ch !== 'D' && pr.ch !== 'A') continue;
      const cx = (pr.x + 0.5) * CELL, cz = (pr.y + 0.5) * CELL;
      const dx = cx - eye.x, dz = cz - eye.z, dist = Math.hypot(dx, dz);
      if (dist > (pr.ch === 'D' ? 2.7 : 2.4)) continue;
      if (dist > 1.2 && (dx * f.x + dz * f.z) / dist < 0.35) continue;
      if (dist < bd) { bd = dist; best = pr; }
    }
    return best;
  }

  interactHint() {
    const p = this.local;
    if (!p?.alive) return '';
    const pr = this.usableProp(p);
    if (!pr) return '';
    if (pr.ch === 'D') return `Press E to ${pr.open ? 'close' : 'open'} the door`;
    const wait = Math.ceil((p.resupplyAt || 0) - performance.now() / 1000);
    return wait > 0 ? `Ammo crate restocking · ${wait}s` : 'Press E to resupply ammo';
  }

  interact(p) {
    const pr = this.usableProp(p);
    if (!pr) return;
    if (pr.ch === 'D') return this.request('door', { cell: [pr.x, pr.y] }, p);
    const now = performance.now() / 1000;
    if ((p.resupplyAt || 0) > now) return;
    let topped = false;
    for (const id of [p.inv.primary, p.inv.secondary]) {
      const w = WEAPONS[id], a = p.ammo[id];
      if (w && a && a.reserve < w.reserve) { a.reserve = w.reserve; topped = true; }
    }
    if (!topped) { this.hud.info('Your ammo is already full', 1.5); return; }
    p.resupplyAt = now + 25;
    sfx.pickup();
    this.hud.info('Ammo resupplied', 1.5);
  }

  hostToggleDoor(p, cell) {
    const pr = this.world.prop(cell[0], cell[1]);
    if (!pr || pr.ch !== 'D' || !p.alive) return;
    if (Math.hypot(p.pos.x - (pr.x + 0.5) * CELL, p.pos.z - (pr.y + 0.5) * CELL) > 3.6) return;
    const open = !pr.open;
    // Don't shut a door on someone standing in the doorway.
    if (!open) for (const o of this.players.values()) {
      if (o.alive && Math.abs(o.pos.x - (pr.x + 0.5) * CELL) < 1 + o.radius && Math.abs(o.pos.z - (pr.y + 0.5) * CELL) < 1 + o.radius) return;
    }
    this.broadcast('door', { cell, open });
  }

  // A bullet or blade hit a solid: damage the barrel behind it, if any.
  shootProp(p, point, normal, dmg) {
    const cell = this.world.cellBehind(point, normal);
    const pr = this.world.prop(cell[0], cell[1]);
    if (pr && pr.ch === 'B' && !pr.broken) this.request('prop', { cell, d: Math.round(dmg) }, p);
  }

  breakGlassAlong(a, b, p) {
    for (const cell of this.world.glassAlong(a, b)) this.request('prop', { cell, glass: true }, p);
  }

  // Host only: shatter glass near an explosion.
  breakGlassAround(pos, r) {
    if (!this.isHost) return;
    for (const pr of this.world.props.values()) {
      if (pr.ch === 'G' && !pr.broken && Math.hypot(pos.x - (pr.x + 0.5) * CELL, pos.z - (pr.y + 0.5) * CELL) < r + 1) this.broadcast('prop', { cell: [pr.x, pr.y], kind: 'glass' });
    }
  }

  // Host only: barrels caught in a blast go off a moment later.
  chainBarrels(pos, r, byId) {
    for (const pr of this.world.props.values()) {
      if (pr.ch !== 'B' || pr.broken || pr.chained) continue;
      if (Math.hypot(pos.x - (pr.x + 0.5) * CELL, pos.z - (pr.y + 0.5) * CELL) > r + 0.8) continue;
      pr.chained = true;
      setTimeout(() => { pr.chained = false; if (!pr.broken && !this.ended) this.broadcast('prop', { cell: [pr.x, pr.y], kind: 'barrel', by: byId }); }, 120 + Math.random() * 160);
    }
  }

  hostPropRequest(p, d) {
    const pr = this.world.prop(d.cell?.[0], d.cell?.[1]);
    if (!pr || pr.broken) return;
    if (d.glass && pr.ch === 'G') this.broadcast('prop', { cell: d.cell, kind: 'glass' });
    else if (pr.ch === 'B' && d.d > 0) {
      pr.hp -= Math.min(200, d.d);
      if (pr.hp <= 0) this.broadcast('prop', { cell: d.cell, kind: 'barrel', by: p.id });
    }
  }

  applyPropBreak(d) {
    if (d.restore) {
      for (const [x, y] of d.restore) { const pr = this.world.prop(x, y); if (pr) this.world.restoreProp(pr); }
      return;
    }
    const pr = this.world.breakProp(d.cell[0], d.cell[1]);
    if (!pr) return;
    const pos = new THREE.Vector3((pr.x + 0.5) * CELL, 0, (pr.y + 0.5) * CELL);
    if (pr.ch === 'G') {
      this.effects.shatter(pos.setY(1.5));
      sfx.glass(pos);
      return;
    }
    pos.y = 0.7;
    this.effects.explosion(pos);
    this.effects.explosion(pos.clone().setY(1.6));
    sfx.explosion(pos);
    if (this.isHost) {
      this.blastDamage(pos, { damage: 120, radius: 5.5 }, this.players.get(d.by) || null, 'barrel');
      this.chainBarrels(pos, 5.5, d.by);
      this.breakGlassAround(pos, 4);
    }
  }

  // Respawn modes: broken glass and barrels come back after a while (not under anyone's feet).
  tickPropRespawn(dt) {
    this.propT = (this.propT ?? 35) - dt;
    if (this.propT > 0) return;
    this.propT = 35;
    const restore = [];
    for (const pr of this.world.props.values()) {
      if (!pr.broken) continue;
      const cx = (pr.x + 0.5) * CELL, cz = (pr.y + 0.5) * CELL;
      if ([...this.players.values()].some((o) => o.alive && Math.abs(o.pos.x - cx) < 1.6 && Math.abs(o.pos.z - cz) < 1.6)) continue;
      restore.push([pr.x, pr.y]);
    }
    if (restore.length) this.broadcast('prop', { restore });
  }

  // ───────────────────────── bomb ─────────────────────────
  updateBomb(dt) {
    const b = this.state.bomb || {};
    const m = this.bombMesh;
    if (b.state === 'dropped' || b.state === 'planted' || b.state === 'defused') {
      m.visible = true;
      m.position.set(b.pos[0], b.pos[1] + 0.09, b.pos[2]);
      if (b.state === 'planted') {
        const t = Math.max(0, b.time);
        const interval = t > 20 ? 1 : t > 10 ? 0.5 : t > 5 ? 0.3 : 0.15;
        this.beepT -= dt;
        if (this.beepT <= 0) { this.beepT = interval; sfx.beep(m.position); this.bombLight.intensity = 3; }
        this.bombLight.intensity *= 0.9;
      } else this.bombLight.intensity = 0;
    } else m.visible = false;
  }

  // ───────────────────────── host authority ─────────────────────────
  request(type, data, p = this.local) {
    if (!p) return;
    if (this.isHost) this.handleRequest(type, data, p.id);
    else this.net.send('req', { type, data, from: p.id });
  }

  handleRequest(type, data, fromId) {
    const p = this.players.get(fromId);
    if (!p) return;
    if (type === 'hit') {
      const v = this.players.get(data.v);
      if (!v || !p.alive || data.d <= 0 || data.d > 700) return;
      this.hostDamage(p, v, data.d, data.part, data.w);
    } else if (type === 'buy') this.hostBuy(p, data.item);
    else if (type === 'door') this.hostToggleDoor(p, data.cell);
    else if (type === 'prop') this.hostPropRequest(p, data);
    else if (type === 'plant') this.rules.onPlant(p, data.pos);
    else if (type === 'defuse') this.rules.onDefuse(p);
  }

  hostDamage(attacker, victim, raw, part, weapon) {
    if (!victim.alive || (this.state.phase !== 'live' && this.state.phase !== 'post')) return;
    if (attacker && attacker !== victim && !this.canDamage(attacker, victim)) return;
    const w = WEAPONS[weapon];
    const explosive = nadeDef(weapon)?.explosive || weapon === 'bomb' || weapon === 'barrel' || !!WEAPONS[weapon]?.projectile;
    if (explosive && victim.char?.perk === 'blastsuit') raw *= 0.6;
    let dmg = raw, armorLoss = 0;
    const armored = part === 'head' ? victim.helmet : part !== 'legs' && victim.armor > 0;
    if (armored && victim.armor > 0) {
      const pen = w?.armorPen ?? 0.5;
      const reduced = raw * pen;
      armorLoss = (raw - reduced) * 0.5;
      dmg = reduced;
    }
    const hp = Math.max(0, Math.round(victim.hp - dmg));
    const armor = Math.max(0, Math.round(victim.armor - armorLoss));
    if (attacker) attacker.damage += Math.min(victim.hp, dmg);
    this.broadcast('hp', { id: victim.id, hp, armor, by: attacker?.id ?? null });
    if (hp <= 0) {
      const killReward = this.econ && attacker && attacker !== victim ? (w?.killReward ?? 300) : 0;
      if (attacker && killReward) attacker.money = Math.min(this.econ.max, attacker.money + killReward);
      this.broadcast('kill', { killer: attacker?.id ?? null, victim: victim.id, w: weapon, hs: part === 'head', money: attacker ? attacker.money : 0 });
      this.rules.onKill(attacker, victim, weapon);
    }
  }

  hostBuy(p, item) {
    if (!this.canBuy(p) && !(p.isBot && this.state.phase === 'buy')) return;
    const info = itemInfo(item);
    if (!info) return;
    const price = this.priceOf(item, p);
    if (p.money < price) return;
    if (WEAPONS[item]) { if (p.inv[WEAPONS[item].slot] === item) return; }
    else if (GRENADES[item]) {
      const dupes = p.inv.nades.filter((n) => n === item).length;
      if (p.inv.nades.length >= maxNades(p) || dupes >= nadeLimit(p, item)) return;
    }
    else if (item === 'kevlar') { if (p.armor >= 100) return; }
    else if (item === 'helmet') { if (p.armor >= 100 && p.helmet) return; }
    p.money -= price;
    this.broadcast('give', { id: p.id, item, money: p.money });
  }

  botBuys() {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    for (const p of this.players.values()) {
      if (!p.isBot || !p.alive) continue;
      if (!this.econ) {
        this.hostBuy(p, pick(FFA_WEAPONS));
        if (Math.random() < 0.4) this.hostBuy(p, 'magnum');
        if (Math.random() < 0.5) this.hostBuy(p, pick(BOT_NADES));
        continue;
      }
      const rifle = p.team === 0 ? pick(['ar7', 'ar7', 'trident', 'mauler']) : pick(['m5', 'm5', 'falcon', 'trident']);
      if (!p.inv.primary) {
        if (p.money >= 5800 && Math.random() < 0.15) this.hostBuy(p, 'longshot');
        else if (p.money >= 3700) this.hostBuy(p, rifle);
        else if (p.money >= 2200) this.hostBuy(p, pick(BOT_SMGS));
      }
      if (p.money >= 1000 && (p.armor < 100 || !p.helmet)) this.hostBuy(p, p.money >= 1600 ? 'helmet' : 'kevlar');
      if (p.money >= 400 && Math.random() < 0.6) this.hostBuy(p, pick(BOT_NADES));
      if (p.money >= 300 && Math.random() < 0.3) this.hostBuy(p, pick(BOT_NADES));
      if (!p.inv.primary && p.money >= 700 && Math.random() < 0.4) this.hostBuy(p, 'magnum');
    }
  }

  syncPayload() {
    const players = {};
    for (const p of this.players.values()) players[p.id] = [p.money, p.kills, p.deaths, p.hp, p.alive ? 1 : 0, p.team, p.hs, Math.round(p.damage)];
    const s = this.state;
    return { phase: s.phase, time: s.time, round: s.round, scores: s.scores, bomb: s.bomb, players };
  }

  statsPayload() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, hs: p.hs, dmg: Math.round(p.damage), bot: p.isBot, gg: p.gg || 0 }));
  }

  // ───────────────────────── events (all clients) ─────────────────────────
  broadcast(type, data) {
    this.onEvent(type, data);
    if (this.online) this.net.send(type, data);
  }

  onEvent(type, d) {
    const s = this.state, lp = this.local;
    switch (type) {
      case 'phase':
        s.phase = d.phase; s.time = d.time;
        if (d.phase === 'live' && !RESPAWN_KINDS.has(this.mode.kind)) { this.hud.center('GO', '', 1.2); sfx.roundStart(); }
        break;
      case 'round': this.applyRound(d); break;
      case 'roundEnd': {
        s.scores = d.scores; s.phase = 'post'; s.time = 5;
        for (const [id, m] of Object.entries(d.money || {})) { const p = this.players.get(id); if (p) p.money = m; }
        const reasonText = { elim: 'All enemies eliminated', bomb: 'The charge detonated', defuse: 'The charge was defused', time: 'Time ran out', draw: 'Draw' }[d.reason] || '';
        if (d.winner < 0) this.hud.center('ROUND DRAW', reasonText, 4);
        else {
          const name = this.teamName(d.winner);
          this.hud.center(`${name} WIN THE ROUND`, reasonText, 4, d.winner);
          if (lp && !d.over) (lp.team === d.winner ? sfx.win : sfx.lose)();
        }
        this.action = null;
        break;
      }
      case 'sync':
        if (!this.isHost) {
          s.phase = d.phase; s.time = d.time; s.round = d.round; s.scores = d.scores;
          if (d.bomb) s.bomb = d.bomb;
          for (const [id, v] of Object.entries(d.players)) {
            const p = this.players.get(id);
            if (!p) continue;
            [p.money, p.kills, p.deaths] = v;
            p.hs = v[6] || 0; p.damage = v[7] || 0;
            if (p.team !== v[5]) this.setTeam(p, v[5]);
            if (!v[4] && p.alive) { p.alive = false; p.model?.die(1); }
          }
          this.refreshBombCarrier();
        }
        break;
      case 'hp': {
        const p = this.players.get(d.id);
        if (!p) break;
        const by = d.by ? this.players.get(d.by) : null;
        if (p.isLocal && d.hp < p.hp) this.hud.damaged(by);
        p.hp = d.hp; p.armor = d.armor;
        this.brains.get(p.id)?.onDamaged(by);
        break;
      }
      case 'kill': {
        const v = this.players.get(d.victim), k = d.killer ? this.players.get(d.killer) : null;
        if (!v) break;
        v.alive = false; v.hp = 0;
        v.deaths++;
        const dir = k ? (new THREE.Vector3().subVectors(v.pos, k.pos).dot(v.forward()) > 0 ? -1 : 1) : 1;
        v.model?.die(dir);
        if (k && k !== v) { k.kills++; if (d.hs) k.hs++; if (this.isHost) k.money = d.money ?? k.money; }
        this.hud.killfeed(k, v, d.w, d.hs);
        if (k?.isLocal && k !== v) { this.hud.hitmarker(d.hs, true); }
        if (v.isLocal) {
          this.viewmodel.setWeapon(null);
          this.action = null;
          this.spectateIdx = 0;
          this.killer = k;
          this.hud.center('YOU DIED', k ? `${k.name} · ${itemInfo(d.w)?.name || { fire: 'Incendiary', barrel: 'Exploding barrel' }[d.w] || d.w}${d.hs ? ' · headshot' : ''}` : '', 2.5);
        }
        if (this.mode.kind === 'bomb' && this.state.bomb?.carrier === v.id) v.hasBomb = false;
        break;
      }
      case 'respawn': {
        const p = this.players.get(d.id);
        if (!p) break;
        this.spawnPlayer(p, d.at, true, true);
        this.giveSpawnLoadout(p, d.at);
        break;
      }
      case 'score': s.scores = d.scores; break;
      case 'gg': {
        const p = this.players.get(d.id);
        if (!p) break;
        p.gg = d.level;
        if (p.alive) this.setGunGameWeapon(p);
        if (p.isLocal) {
          const next = WEAPONS[GUN_GAME_ORDER[d.level]]?.name || 'Knife';
          this.hud.info(d.demoted ? `Knifed! Back to ${next}` : `Level ${d.level + 1}/${GUN_GAME_ORDER.length} — ${next}`, 2.5);
          if (!d.demoted) sfx.buy();
        }
        break;
      }
      case 'bomb': {
        const prev = s.bomb?.state;
        s.bomb = d;
        this.refreshBombCarrier();
        if (d.state === 'planted' && prev !== 'planted') { this.hud.center('CHARGE PLANTED', `Site ${d.site} · ${this.mode.bombTime}s`, 3); sfx.plantDone(new THREE.Vector3(...d.pos)); }
        if (d.state === 'exploded') { const pos = new THREE.Vector3(...d.pos); this.effects.explosion(pos); this.effects.explosion(pos.clone().setY(pos.y + 1.5)); sfx.explosion(pos); }
        if (d.state === 'defused') sfx.plantDone(new THREE.Vector3(...d.pos));
        break;
      }
      case 'give': this.applyGive(d); break;
      case 'nade': this.spawnNade(d); break;
      case 'boom': { const i = this.nades.findIndex((n) => n.nid === d.nid); if (i >= 0) this.detonate(i); break; }
      case 'door': this.world.setDoor(d.cell, d.open); sfx.door(this.world.cellCenter(...d.cell)); break;
      case 'prop': this.applyPropBreak(d); break;
      case 'chat': this.hud.chatLine(d.name, d.text, d.team); break;
      case 'msg': this.hud.center(d.text, d.sub || '', d.time || 3); break;
      case 'end': this.onEnd(d); break;
    }
  }

  teamName(team) {
    if (this.mode.kind === 'bomb') return team === 0 ? 'ATTACKERS' : 'DEFENDERS';
    const lp = this.local;
    if (this.mode.teamSize === 1) {
      const p = [...this.players.values()].find((q) => q.team === team);
      return p ? p.name.toUpperCase() : 'TEAM ' + (team + 1);
    }
    return lp && lp.team === team ? 'YOUR TEAM' : 'ENEMIES';
  }

  setTeam(p, team) {
    if (p.team === team) return;
    p.team = team;
    if (p.model) {
      const tag = p.tag;
      p.model.dispose(); p.model = null;
      p.ensureModel(this.scene, this.mode.kind !== 'ffa');
      if (tag) { p.model.root.add(tag); }
    }
  }

  refreshBombCarrier() {
    const b = this.state.bomb || {};
    for (const p of this.players.values()) {
      const had = p.hasBomb;
      p.hasBomb = b.state === 'carried' && b.carrier === p.id;
      if (had && !p.hasBomb && p.slot === 'bomb') { switchSlot(p, bestSlot(p)); if (p.isLocal) this.viewmodel.setWeapon(p.weaponId, p.char); }
    }
  }

  spawnPlayer(p, at, resetKit, freeArmor) {
    p.snapTo(at[0], at[1], at[2], at[3]);
    p.alive = true; p.hp = 100;
    if (resetKit) { p.resetKit(); p.armor = 0; p.helmet = false; }
    if (freeArmor) { p.armor = 100; p.helmet = true; }
    if (p.char?.perk === 'fortified' && p.armor < 100) p.armor = 100;
    p.model?.revive();
    p.ws.cooldown = 0; p.ws.reloadT = -1; p.ws.drawT = 0; p.ws.scope = 0; p.ws.spray = 0;
    this.brains.get(p.id)?.reset();
    if (p.isLocal) { this.punch = 0; this.viewmodel.setWeapon(p.weaponId, p.char); }
  }

  // Loadout given on spawn in respawn modes.
  giveSpawnLoadout(p, at) {
    const kind = this.mode.kind;
    if (kind === 'gungame') return this.setGunGameWeapon(p);
    if (kind === 'ffa') return this.giveFFALoadout(p, at);
    if (kind === 'tdm' && p.owner === this.localId) {
      if (p.isLocal && this.savedBuys.length) setTimeout(() => this.rebuy(), 120);
      else if (p.isLocal) setTimeout(() => this.request('buy', { item: 'ar7' }), 120);
      else setTimeout(() => { this.hostBuy(p, BOT_TDM_WEAPONS[Math.floor(Math.random() * BOT_TDM_WEAPONS.length)]); }, 120);
    }
  }

  setGunGameWeapon(p) {
    const id = GUN_GAME_ORDER[Math.min(p.gg || 0, GUN_GAME_ORDER.length - 1)];
    p.inv = { primary: null, secondary: null, melee: p.knifePref || 'knife', nades: [] };
    const w = WEAPONS[id];
    if (w.slot !== 'melee') { p.inv[w.slot] = id; p.giveAmmo(id); }
    p.slot = '';
    switchSlot(p, w.slot);
    if (p.isLocal) this.viewmodel.setWeapon(p.weaponId, p.char);
  }

  giveFFALoadout(p, seedArr) {
    const idx = Math.abs(Math.floor((seedArr?.[0] || 0) * 13 + (seedArr?.[2] || 0) * 7)) % FFA_WEAPONS.length;
    const wid = FFA_WEAPONS[idx];
    p.inv.primary = wid; p.giveAmmo(wid);
    p.inv.nades = [FFA_NADES[idx % FFA_NADES.length]];
    switchSlot(p, 'primary');
    if (p.isLocal) this.viewmodel.setWeapon(p.weaponId, p.char);
  }

  applyRound(d) {
    const s = this.state;
    s.round = d.round; s.time = d.time; s.scores = d.scores; s.phase = d.phase || 'buy'; s.bomb = d.bomb;
    this.effects.clearRound();
    this.clearNades();
    if (!RESPAWN_KINDS.has(this.mode.kind)) this.world.resetProps();
    for (const [id, team] of Object.entries(d.teams || {})) { const p = this.players.get(id); if (p) this.setTeam(p, team); }
    for (const [id, m] of Object.entries(d.money || {})) { const p = this.players.get(id); if (p) p.money = m; }
    const reset = new Set(d.resetKit || []);
    for (const p of this.players.values()) {
      const at = d.spawns[p.id];
      if (!at) { p.alive = false; continue; }
      this.spawnPlayer(p, at, reset.has(p.id), d.freeArmor);
      if (RESPAWN_KINDS.has(this.mode.kind)) this.giveSpawnLoadout(p, at);
    }
    this.refreshBombCarrier();
    this.action = null;
    if (this.isHost) {
      this.botPlan.site = Math.random() < 0.5 ? 'A' : 'B';
      this.botPlan.ctIndex = Math.floor(Math.random() * 2);
      setTimeout(() => this.botBuys(), 400);
    }
    const lp = this.local;
    this.commitRoundBuys();
    if (RESPAWN_KINDS.has(this.mode.kind)) this.hud.center(this.mode.name.toUpperCase(), goalText(this.mode), 3);
    else {
      const side = this.mode.kind === 'bomb' && lp ? (lp.team === 0 ? 'Attack — plant the charge at A or B' : 'Defend — stop the plant') : 'Press B to choose your loadout';
      this.hud.center(`ROUND ${d.round}`, side, 2.5);
      const keep = this.settings.keepLoadout && this.savedBuys.length;
      if (lp && lp.alive && keep) setTimeout(() => this.rebuy(), 350);
      else if (lp && lp.alive && this.mode.kind !== 'bomb' && reset.has(lp.id)) this.hud.openBuy();
    }
    if (lp?.hasBomb) this.hud.info('You have the charge — hold E inside a bomb site to plant', 5);
  }

  applyGive(d) {
    const p = this.players.get(d.id);
    if (!p) return;
    p.money = d.money;
    const it = d.item;
    if (WEAPONS[it]) {
      const w = WEAPONS[it];
      p.inv[w.slot] = it;
      if (w.type === 'knife') p.knifePref = it;
      p.giveAmmo(it);
      switchSlot(p, w.slot);
    } else if (GRENADES[it]) p.inv.nades.push(it);
    else if (it === 'kevlar') p.armor = 100;
    else if (it === 'helmet') { p.armor = 100; p.helmet = true; }
    if (p.isLocal) {
      sfx.buy(); this.viewmodel.setWeapon(p.weaponId, p.char); this.hud.refreshBuy();
      if (!this.roundBuys.includes(it)) this.roundBuys.push(it);
      if (this.mode.kind === 'tdm') this.commitRoundBuysSoon();
    }
  }

  // ───────────────────────── networking ─────────────────────────
  bindNet() {
    const n = this.net;
    const evs = ['phase', 'round', 'roundEnd', 'sync', 'hp', 'kill', 'respawn', 'bomb', 'give', 'nade', 'chat', 'msg', 'end', 'score', 'gg', 'boom', 'door', 'prop'];
    for (const e of evs) n.on(e, (d) => this.onEvent(e, d));
    n.on('S', (d) => this.onStates(d));
    n.on('req', (d) => { if (this.isHost) this.handleRequest(d.type, d.data, d.from); });
    n.on('hello', (d) => {
      this.peerReturned(d.id);
      if (!this.isHost) return;
      this.helloFrom.add(d.id);
      this.reclaimPlayer(d.id);
      n.send('snap', this.snapshot());
    });
    n.on('snap', (d) => this.applySnapshot(d));
    n.on('owner', (d) => this.applyOwner(d));
    n.on('host', (d) => { if (d.id !== this.localId) this.setHost(d.id); });
    n.onLeave((id) => this.onPeerLeft(id));
    n.onJoin((id) => this.peerReturned(id));
  }

  rosterPayload() {
    return [...this.players.values()].map((p) => ({
      id: p.id, name: p.baseName || p.name, team: p.team, isBot: p.isBot, char: p.char, elo: p.elo, owner: p.owner, wasHuman: !!p.wasHuman,
    }));
  }

  // Full state for players joining or rejoining mid-match.
  snapshot() {
    const pstate = {};
    for (const p of this.players.values()) {
      pstate[p.id] = { alive: p.alive, pos: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, hp: p.hp, armor: p.armor, helmet: p.helmet, gg: p.gg || 0 };
    }
    return { hostId: this.localId, state: this.state, roster: this.rosterPayload(), sync: this.syncPayload(), pstate, props: this.world.propState() };
  }

  applySnapshot(d) {
    if (this.isHost || (this.gotSnap && !this.rejoin)) return;
    const first = !this.gotSnap;
    this.gotSnap = true;
    if (d.hostId && d.hostId !== this.hostId) this.setHost(d.hostId);
    for (const r of d.roster) {
      const p = this.players.get(r.id) || this.addPlayer(r);
      p.isBot = r.isBot; p.wasHuman = r.wasHuman;
      p.owner = r.isBot ? d.hostId : r.id;
      p.isRemoteView = p.owner !== this.localId;
      if (p.team !== r.team) this.setTeam(p, r.team);
    }
    Object.assign(this.state, d.state);
    this.onEvent('sync', d.sync);
    if (d.props) this.world.applyPropState(d.props);
    if (this.rejoin && first) {
      // Put our own player back where the host last saw it.
      const lp = this.local, st = d.pstate?.[this.localId];
      if (lp && st) {
        lp.gg = st.gg;
        if (st.alive) {
          this.spawnPlayer(lp, [...st.pos, st.yaw], true, false);
          lp.hp = st.hp; lp.armor = st.armor; lp.helmet = st.helmet;
          if (RESPAWN_KINDS.has(this.mode.kind)) this.giveSpawnLoadout(lp, st.pos);
        } else { lp.alive = false; lp.model?.die(1); }
      }
      for (const [id, st2] of Object.entries(d.pstate || {})) {
        const p = this.players.get(id);
        if (!p || p.isLocal) continue;
        p.gg = st2.gg; p.alive = st2.alive; p.hp = st2.hp;
        if (st2.alive) p.snapTo(st2.pos[0], st2.pos[1], st2.pos[2], st2.yaw);
      }
      this.hud.center('RECONNECTED', `${this.mode.name} · ${this.mapDef.name}`, 2.5);
      this.rejoin = false;
    }
  }

  // ───────────── disconnects, reconnects and host handover ─────────────
  onPeerLeft(id) {
    if (this.ended || id === this.localId) return;
    const p = this.players.get(id);
    if (!p || p.isBot || this.pendingLeave.has(id)) return;
    this.pendingLeave.set(id, 10);
    this.hud.chatLine('', `${p.name} disconnected — waiting 10s for them to reconnect`, -1);
  }

  peerReturned(id) {
    if (!this.pendingLeave.has(id)) return;
    this.pendingLeave.delete(id);
    const p = this.players.get(id);
    if (p) this.hud.chatLine('', `${p.name} reconnected`, -1);
  }

  tickPendingLeaves(dt) {
    let msg = '';
    for (const [id, t] of this.pendingLeave) {
      const left = t - dt;
      const p = this.players.get(id);
      if (left <= 0) { this.pendingLeave.delete(id); this.finalizeLeave(id); continue; }
      this.pendingLeave.set(id, left);
      if (p) msg = `Waiting for ${p.name} to reconnect… ${Math.ceil(left)}s`;
    }
    if (msg) this.hud.info(msg, 0.3);
  }

  finalizeLeave(id) {
    if (this.ended) return;
    const p = this.players.get(id);
    if (!p) return;
    if (this.mode.ranked) {
      // Ranked: whoever stays wins by forfeit.
      if (this.isHost) return this.rules.finish(1 - p.team, 'forfeit');
      if (id === this.hostId) return this.onEnd({ winner: this.local.team, reason: 'forfeit', scores: this.state.scores, stats: this.statsPayload() });
      return;
    }
    this.hud.chatLine('', `${p.name} left — a bot takes over until they rejoin`, -1);
    if (id === this.hostId) return this.migrateHost(id);
    if (this.isHost) this.convertToBot(p);
  }

  convertToBot(p) {
    p.baseName = p.baseName || p.name;
    p.isBot = true; p.wasHuman = true; p.owner = this.hostId;
    p.name = p.baseName + ' (bot)';
    p.isRemoteView = p.owner !== this.localId;
    if (this.isHost) {
      this.brains.set(p.id, new BotBrain(this, p, this.opts.botLevel || 'normal'));
      this.net?.send('owner', { id: p.id, owner: this.hostId, isBot: true });
    }
  }

  // A player who dropped (and was replaced by a bot) gets their player back.
  reclaimPlayer(id) {
    const p = this.players.get(id);
    if (!p || !p.wasHuman || !p.isBot) return;
    this.applyOwner({ id, owner: id, isBot: false });
    this.net?.send('owner', { id, owner: id, isBot: false });
  }

  applyOwner(d) {
    const p = this.players.get(d.id);
    if (!p) return;
    p.owner = d.owner;
    p.isBot = d.isBot;
    if (d.isBot) { p.baseName = p.baseName || p.name; p.wasHuman = true; p.name = p.baseName + ' (bot)'; }
    else { if (p.baseName) p.name = p.baseName; this.brains.delete(p.id); }
    p.isRemoteView = p.owner !== this.localId;
    p.buffer = [];
  }

  setHost(id) {
    this.hostId = id;
    this.isHost = id === this.localId;
    for (const p of this.players.values()) {
      if (!p.isBot) continue;
      p.owner = id;
      p.isRemoteView = p.owner !== this.localId;
      if (this.isHost && !this.brains.has(p.id)) this.brains.set(p.id, new BotBrain(this, p, this.opts.botLevel || 'normal'));
    }
  }

  // The host is gone for good: the remaining human with the lowest id takes over.
  // Every client runs this with the same inputs, so they all agree on the new host.
  migrateHost(oldId) {
    const old = this.players.get(oldId);
    const candidates = [...this.players.values()]
      .filter((p) => !p.isBot && p.id !== oldId && !this.pendingLeave.has(p.id))
      .map((p) => p.id).sort();
    const next = candidates[0];
    if (!next) return this.onEnd({ winner: -2, reason: 'host-left', scores: this.state.scores, stats: this.statsPayload() });
    if (old) { old.baseName = old.baseName || old.name; old.isBot = true; old.wasHuman = true; old.name = old.baseName + ' (bot)'; }
    this.setHost(next);
    if (this.isHost) {
      this.state.lossStreak = this.state.lossStreak || [0, 0];
      this.rules = new Rules(this);
      if (RESPAWN_KINDS.has(this.mode.kind)) {
        for (const p of this.players.values()) if (!p.alive) this.rules.respawnQueue.set(p.id, 2);
      }
      this.net?.send('host', { id: this.localId });
      this.hud.chatLine('', 'You are now hosting this match', -1);
    } else {
      const np = this.players.get(next);
      this.hud.chatLine('', `${np?.name || 'Another player'} is now hosting`, -1);
    }
  }

  onStates(d) {
    const now = performance.now();
    for (const s of d.list) {
      const p = this.players.get(s.id);
      if (!p || p.owner === this.localId) continue;
      if (s.sh) this.playShots(p, s.sh);
      if (s.p) p.pushState(s, now);
    }
  }

  netSend(dt) {
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = this.sendInterval();
    const list = [];
    for (const p of this.players.values()) {
      if (p.owner !== this.localId) continue;
      const e = { id: p.id };
      if (p.alive) {
        e.p = [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)];
        e.y = +p.yaw.toFixed(3); e.pi = +p.pitch.toFixed(3); e.c = +p.crouch.toFixed(2); e.w = p.weaponId; e.g = p.onGround ? 1 : 0;
      }
      const sh = this.outShots.get(p.id);
      if (sh && sh.length) { e.sh = sh; this.outShots.set(p.id, []); }
      if (e.p || e.sh) list.push(e);
    }
    if (list.length) this.net.send('S', { list });
  }

  chat(text) {
    const lp = this.local;
    if (!text.trim() || !lp) return;
    this.broadcast('chat', { name: lp.name, text: text.slice(0, 120), team: lp.team });
  }

  // ───────────────────────── camera ─────────────────────────
  spectating() { const lp = this.local; return !lp || !lp.alive; }

  updateCamera(dt) {
    const cam = this.engine.camera, lp = this.local, s = this.settings;
    let fov = s.fov;
    if (lp && lp.alive) {
      cam.position.copy(lp.eye());
      cam.rotation.order = 'YXZ';
      cam.rotation.set(lp.pitch + this.punch, lp.yaw, 0);
      const w = lp.weapon;
      if (lp.ws.scope > 0 && w?.scope) fov = w.scope[lp.ws.scope - 1];
      this.spectateTarget = null;
    } else {
      const alive = [...this.players.values()].filter((p) => p.alive && (SOLO_KINDS.has(this.mode.kind) || !lp || p.team === lp.team));
      const pool = alive.length ? alive : [...this.players.values()].filter((p) => p.alive);
      const t = pool.length ? pool[this.spectateIdx % pool.length] : null;
      this.spectateTarget = t;
      if (t) {
        const back = t.forward().setY(0).normalize().multiplyScalar(-2.6);
        const eye = t.eye();
        const want = eye.clone().add(back).add(new THREE.Vector3(0, 0.45, 0));
        const dir = want.clone().sub(eye);
        const len = dir.length();
        const hit = this.world.raycast(eye, dir.normalize(), len);
        const pos = hit ? eye.clone().addScaledVector(dir, Math.max(0.3, hit.dist - 0.25)) : want;
        cam.position.lerp(pos, Math.min(1, dt * 12));
        cam.lookAt(eye.clone().addScaledVector(t.forward(), 6));
      } else {
        // Nobody alive yet (warmup, between rounds): slow overview orbit above the map instead of
        // leaving the camera at the origin, where it sits inside a wall and only shows fog.
        const size = this.world.size, c = new THREE.Vector3(size.x / 2, 0, size.z / 2);
        const span = Math.max(size.x, size.z);
        this.orbitT = (this.orbitT || 0) + dt * 0.06;
        cam.position.set(c.x + Math.cos(this.orbitT) * span * 0.55, span * 0.38 + 8, c.z + Math.sin(this.orbitT) * span * 0.55);
        cam.lookAt(c);
      }
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const f = new THREE.Vector3(); cam.getWorldDirection(f);
    setListener(cam.position, f);
  }

  // ───────────────────────── end ─────────────────────────
  async onEnd(d) {
    if (this.ended) return;
    this.ended = true;
    this.app.clearActiveMatch?.();
    this.state.phase = 'over';
    this.input.unlock();
    const lp = this.local;
    let result = 'draw';
    if (SOLO_KINDS.has(this.mode.kind)) {
      result = d.winner === this.localId ? 'win' : 'loss';
    } else if (d.winner >= 0 && lp) result = d.winner === lp.team ? 'win' : 'loss';
    if (d.reason === 'host-left' && d.winner === -2) result = 'draw';
    const myStats = lp ? { k: lp.kills, d: lp.deaths, hs: lp.hs } : { k: 0, d: 0, hs: 0 };
    let eloChange = 0;
    const score = this.mode.kind === 'ffa' ? `${myStats.k} kills`
      : this.mode.kind === 'gungame' ? `Weapon ${Math.min((lp?.gg || 0) + 1, GUN_GAME_ORDER.length)}/${GUN_GAME_ORDER.length}`
        : `${d.scores[lp?.team ?? 0]}-${d.scores[1 - (lp?.team ?? 0)]}`;
    (result === 'win' ? sfx.win : result === 'loss' ? sfx.lose : sfx.roundStart)();
    this.hud.showResults({ result, reason: d.reason, scores: d.scores, stats: d.stats || this.statsPayload(), eloChange: null, score });
    if (d.reason !== 'host-left') this.app.awardDrop?.(result, this.online).then((item) => this.hud.showDrop(item)).catch((e) => console.warn('Drop failed', e));
    const api = this.app.api;
    if (api && this.app.user) {
      try {
        if (this.mode.ranked && this.online && result !== 'draw') {
          const opp = [...this.players.values()].find((p) => p !== lp && !p.isBot);
          if (opp) {
            const winner = result === 'win' ? this.localId : opp.id, loser = result === 'win' ? opp.id : this.localId;
            const r = await api.reportRanked(this.matchId, winner, loser);
            eloChange = result === 'win' ? r.winner_delta : r.loser_delta;
          }
        }
        await api.recordMatch({
          matchId: this.matchId, mode: this.mode.id, map: this.mapDef.id, ranked: !!this.mode.ranked, online: this.online,
          result, kills: myStats.k, deaths: myStats.d, headshots: myStats.hs, score, eloChange,
        });
        this.hud.setEloChange(this.mode.ranked ? eloChange : null);
        this.app.refreshProfile?.();
      } catch (e) {
        console.warn('Could not record match', e);
        this.hud.setEloChange(null, 'Stats could not be saved: ' + (e.message || e));
      }
    }
  }

  leave() {
    // Leaving a ranked match is a forfeit, so there's nothing to rejoin.
    if (this.ended || this.mode.ranked) this.app.clearActiveMatch?.();
    this.destroy();
    this.app.exitGame();
  }

  destroy() {
    this.running = false;
    this.input?.dispose();
    this.hud?.unmount();
    this.net?.leave();
    this.clearNades();
    this.engine.clearScene();
  }
}
