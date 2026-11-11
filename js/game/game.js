import * as THREE from 'three';
import { World, CELL } from '../engine/world.js';
import { Effects } from '../engine/effects.js';
import { Viewmodel } from '../engine/viewmodel.js';
import { buildGun } from '../engine/models.js';
import { sfx, setListener, initAudio, setVolume } from '../engine/audio.js';
import { MAPS } from '../data/maps.js';
import { MODES } from '../data/modes.js';
import { WEAPONS, GRENADES, GEAR, itemInfo } from '../data/weapons.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Rules } from './rules.js';
import { BotBrain } from './bot.js';
import { Hud } from './hud.js';
import {
  switchSlot, cycleSlot, startReload, tickWeapon, ready, spreadFor, applySpread, traceBullet, bulletDamage, bestSlot, hasSlot,
} from './combat.js';

const FFA_WEAPONS = ['ar7', 'm5', 'vex', 'longshot', 'breacher', 'ar7', 'm5'];

// One match. Runs identically online and offline; when `net` is null this client is the host.
export class Game {
  constructor(app, opts) {
    this.app = app;
    this.engine = app.engine;
    this.opts = opts;
    this.mode = MODES[opts.mode];
    this.mapDef = MAPS[opts.map];
    this.net = opts.net || null;
    this.online = !!this.net;
    this.localId = opts.localId;
    this.hostId = opts.hostId || opts.localId;
    this.isHost = this.hostId === this.localId;
    this.matchId = opts.matchId || 'off-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.players = new Map();
    this.brains = new Map();
    this.state = { phase: 'warmup', time: 0, round: 0, scores: [0, 0], bomb: { state: 'none' } };
    this.botPlan = { site: 'A', ctIndex: 0 };
    this.nades = [];
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
      p.ensureModel(this.scene, this.mode.kind !== 'ffa');
      p.model.root.visible = false;
      this.attachNameTag(p);
    } else {
      p.ensureModel(this.scene, this.mode.kind !== 'ffa');
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
    if (this.mode.kind === 'ffa') return true;
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
        if (p.tag) p.tag.visible = p.alive && lp && !p.isLocal && this.mode.kind !== 'ffa' && p.team === lp.team;
      }
    }
    this.updateNades(dt);
    this.updateBomb(dt);
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
        if (this.action.t >= this.mode.plantTime) { this.request('plant', { pos: [p.pos.x, p.pos.y, p.pos.z] }); this.action = null; }
      } else if (b.state === 'planted' && p.team === 1 && Math.hypot(p.pos.x - b.pos[0], p.pos.z - b.pos[2]) < 2.2) {
        acting = true;
        if (this.action?.type !== 'defuse') this.action = { type: 'defuse', t: 0 };
        this.action.t += dt;
        if (this.action.t >= this.mode.defuseTime) { this.request('defuse', {}); this.action = null; }
      }
    }
    if (!acting) this.action = null;

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
    if (firing) this.tryFire(p, true);
    else this.releaseTrigger(p);

    this.handleUiKeys(p, ui);
    this.viewmodel.update(dt, {
      speed: Math.hypot(p.vel.x, p.vel.z), onGround: p.onGround, lookDX: this.lookDX, lookDY: this.lookDY,
      reload: p.ws.reloadT >= 0 && w ? p.ws.reloadT / w.reload : -1, scoped: p.ws.scope > 0,
      drawTime: w?.draw || 0.4,
    });
  }

  handleUiKeys(p, ui) {
    const inp = this.input;
    this.hud.setScoreboard(inp.keys.has('Tab') && !inp.typing);
    if (!ui && inp.pressed('KeyB')) this.hud.toggleBuy();
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
    if (this.mode.kind === 'ffa') return false;
    if (this.state.phase === 'buy') return true;
    if (this.state.phase === 'live' && this.mode.kind === 'bomb' && this.state.time > this.mode.roundTime - 20) {
      const r = this.mapDef.spawns[p.team];
      const cx = Math.floor(p.pos.x / CELL), cy = Math.floor(p.pos.z / CELL);
      return cx >= r[0] - 2 && cx <= r[2] + 2 && cy >= r[1] - 2 && cy <= r[3] + 2;
    }
    return false;
  }

  priceOf(item) {
    if (this.mode.kind !== 'bomb') return 0;
    return itemInfo(item)?.price ?? 0;
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
    let max = 6.0 * (w?.moveSpeed || 1) * (p.ws.scope > 0 ? 0.5 : 1);
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
    if (!w.auto && p.triggerHeld) return;
    const a = p.ammo[w.id];
    if (!a) return;
    if (a.mag <= 0) {
      if (!p.triggerHeld && isLocal) sfx.dryFire();
      p.triggerHeld = true;
      if (startReload(p) && isLocal) sfx.reload(null);
      return;
    }
    a.mag--;
    p.ws.cooldown = w.fireRate;
    p.triggerHeld = true;
    p.firingT = 0.12;
    const origin = p.eye();
    const pitch = p.pitch + (isLocal ? this.punch : 0);
    const cp = Math.cos(pitch);
    const base = new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(pitch), -Math.cos(p.yaw) * cp);
    const spread = spreadFor(p);
    const dmgBy = new Map();
    const shots = [];
    for (let i = 0; i < (w.pellets || 1); i++) {
      const dir = applySpread(base, spread);
      const tr = traceBullet(this, p, origin, dir);
      if (tr.victim) {
        const d = bulletDamage(w, tr.part, tr.dist);
        const prev = dmgBy.get(tr.victim) || { d: 0, part: 'legs' };
        prev.d += d;
        if (tr.part === 'head' || (tr.part === 'body' && prev.part === 'legs')) prev.part = tr.part;
        dmgBy.set(tr.victim, prev);
        this.effects.impact(tr.end, tr.normal, { blood: true });
        shots.push([+tr.end.x.toFixed(2), +tr.end.y.toFixed(2), +tr.end.z.toFixed(2), 1]);
      } else if (tr.normal) {
        this.effects.impact(tr.end, tr.normal);
        shots.push([+tr.end.x.toFixed(2), +tr.end.y.toFixed(2), +tr.end.z.toFixed(2), 0, tr.normal.x, tr.normal.y, tr.normal.z]);
      } else shots.push([+tr.end.x.toFixed(1), +tr.end.y.toFixed(1), +tr.end.z.toFixed(1), 2]);
      if (i < 3) this.effects.tracer(this.muzzlePos(p, isLocal), tr.end);
    }
    for (const [victim, { d, part }] of dmgBy) {
      this.request('hit', { v: victim.id, d: Math.round(d), part, w: w.id }, p);
      if (isLocal) this.hud.hitmarker(part === 'head', false);
      if (isLocal) sfx.hit(part === 'head');
    }
    p.ws.spray++;
    // Recoil
    const kick = w.recoil * (1 + Math.min(p.ws.spray, 10) * 0.1);
    const yawKick = (Math.random() - 0.5) * 2 * w.recoilYaw * (p.ws.spray > 6 ? 1.6 : 1);
    if (isLocal) {
      this.punch += kick * 0.45;
      p.pitch = Math.min(1.5, p.pitch + kick * 0.55);
      p.yaw += yawKick;
      this.viewmodel.fire(w.type === 'sniper' || w.type === 'shotgun' ? 1.8 : 1);
      if (w.type === 'sniper') p.ws.scope = 0;
    } else {
      p.pitch += kick * 0.35;
    }
    sfx.shot(w.id, isLocal ? null : p.pos);
    if (!isLocal) this.effects.muzzle(this.muzzlePos(p, false), w.type === 'pistol' ? 0.7 : 1);
    this.queueShot(p, w.id, shots);
  }

  knife(p, heavy) {
    const w = WEAPONS.knife;
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
      this.request('hit', { v: best.o.id, d: Math.round(dmg), part: 'body', w: 'knife' }, p);
      const pt = origin.clone().addScaledVector(dir, best.dist);
      this.effects.impact(pt, dir.clone().negate(), { blood: true });
      if (p.isLocal) { this.hud.hitmarker(false, false); sfx.hit(false); }
      this.queueShot(p, 'knife', [[+pt.x.toFixed(2), +pt.y.toFixed(2), +pt.z.toFixed(2), 1]]);
    } else if (wall) {
      this.effects.impact(wall.point, wall.normal);
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
      if (w === 'knife') { sfx.knife(p.pos); continue; }
      sfx.shot(w, p.pos);
      const muzzle = this.muzzlePos(p, false);
      this.effects.muzzle(muzzle, w === 'p9' ? 0.7 : 1);
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
        this.effects.tracer(muzzle, end);
      }
    }
  }

  // ───────────────────────── grenades ─────────────────────────
  throwNade(p) {
    const kind = p.weaponId;
    if (!GRENADES[kind]) return;
    const i = p.inv.nades.indexOf(kind);
    if (i >= 0) p.inv.nades.splice(i, 1);
    const f = p.forward();
    const o = p.eye().addScaledVector(f, 0.4);
    const v = f.clone().multiplyScalar(15).add(new THREE.Vector3(p.vel.x * 0.5, 2.2, p.vel.z * 0.5));
    p.ws.cooldown = 0.6;
    this.broadcast('nade', { id: p.id, kind, o: [o.x, o.y, o.z], v: [v.x, v.y, v.z] });
    switchSlot(p, bestSlot(p));
    if (p.isLocal) this.viewmodel.setWeapon(p.weaponId, p.char);
  }

  spawnNade(d) {
    const mesh = buildGun(d.kind);
    mesh.scale.setScalar(1.6);
    this.scene.add(mesh);
    this.nades.push({ ...d, pos: new THREE.Vector3(...d.o), vel: new THREE.Vector3(...d.v), t: 0, mesh, still: 0 });
  }

  updateNades(dt) {
    const W = this.world;
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.t += dt;
      const steps = 3, h = dt / steps;
      for (let s = 0; s < steps; s++) {
        n.vel.y -= 20 * h;
        const next = n.pos.clone().addScaledVector(n.vel, h);
        const hNext = W.heightAt(next.x, next.z);
        if (next.y < hNext) {
          const hCur = W.heightAt(n.pos.x, n.pos.z);
          let bounced = false;
          if (n.pos.y >= hNext - 0.01 && hCur <= n.pos.y) { n.vel.y = -n.vel.y * 0.4; n.vel.x *= 0.7; n.vel.z *= 0.7; bounced = true; next.y = hNext + 0.01; }
          else {
            if (W.heightAt(next.x, n.pos.z) > n.pos.y) { n.vel.x = -n.vel.x * 0.45; next.x = n.pos.x; bounced = true; }
            if (W.heightAt(n.pos.x, next.z) > n.pos.y) { n.vel.z = -n.vel.z * 0.45; next.z = n.pos.z; bounced = true; }
            if (!bounced) { n.vel.x = -n.vel.x * 0.45; n.vel.z = -n.vel.z * 0.45; next.x = n.pos.x; next.z = n.pos.z; }
          }
          if (bounced && n.vel.length() > 2) sfx.bounce(n.pos);
        }
        n.pos.copy(next);
      }
      n.mesh.position.copy(n.pos);
      n.mesh.rotation.x += dt * n.vel.length() * 2;
      if (n.vel.length() < 0.4) n.still += dt;
      const g = GRENADES[n.kind];
      if (n.kind === 'he' && n.t >= g.fuse) {
        this.effects.explosion(n.pos);
        sfx.explosion(n.pos);
        if (this.isHost) this.nadeDamage(n);
        this.removeNade(i);
      } else if (n.kind === 'smoke' && (n.still > 0.3 || n.t > 3) && n.t >= 1) {
        this.effects.smoke(n.pos.clone().setY(W.heightAt(n.pos.x, n.pos.z)), g.radius, g.duration);
        sfx.smoke(n.pos);
        this.removeNade(i);
      }
    }
  }

  removeNade(i) {
    this.nades[i].mesh.removeFromParent();
    this.nades.splice(i, 1);
  }

  nadeDamage(n) {
    const g = GRENADES.he;
    const thrower = this.players.get(n.id);
    const c = n.pos.clone().setY(n.pos.y + 0.3);
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p !== thrower && thrower && !this.canDamage(thrower, p)) continue;
      const chest = p.pos.clone().setY(p.pos.y + 1.1);
      const d = chest.distanceTo(c);
      if (d > g.radius || !this.world.lineOfSight(c, chest)) continue;
      this.hostDamage(thrower, p, g.damage * (1 - d / g.radius) * (p === thrower ? 0.5 : 1), 'body', 'he');
    }
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
    else if (type === 'plant') this.rules.onPlant(p, data.pos);
    else if (type === 'defuse') this.rules.onDefuse(p);
  }

  hostDamage(attacker, victim, raw, part, weapon) {
    if (!victim.alive || (this.state.phase !== 'live' && this.state.phase !== 'post')) return;
    if (attacker && attacker !== victim && !this.canDamage(attacker, victim)) return;
    const w = WEAPONS[weapon];
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
      const killReward = this.mode.kind === 'bomb' && attacker && attacker !== victim ? (w?.killReward ?? 300) : 0;
      if (attacker && killReward) attacker.money = Math.min(16000, attacker.money + killReward);
      this.broadcast('kill', { killer: attacker?.id ?? null, victim: victim.id, w: weapon, hs: part === 'head', money: attacker ? attacker.money : 0 });
      this.rules.onKill(attacker, victim);
    }
  }

  hostBuy(p, item) {
    if (!this.canBuy(p) && !(p.isBot && this.state.phase === 'buy')) return;
    const info = itemInfo(item);
    if (!info) return;
    const price = this.priceOf(item);
    if (p.money < price) return;
    if (WEAPONS[item]) { if (p.inv[WEAPONS[item].slot] === item) return; }
    else if (GRENADES[item]) { if (p.inv.nades.includes(item) || p.inv.nades.length >= 2) return; }
    else if (item === 'kevlar') { if (p.armor >= 100) return; }
    else if (item === 'helmet') { if (p.armor >= 100 && p.helmet) return; }
    p.money -= price;
    this.broadcast('give', { id: p.id, item, money: p.money });
  }

  botBuys() {
    for (const p of this.players.values()) {
      if (!p.isBot || !p.alive) continue;
      if (this.mode.kind !== 'bomb') {
        const pick = ['ar7', 'm5', 'ar7', 'vex', 'longshot', 'breacher'][Math.floor(Math.random() * 6)];
        this.hostBuy(p, pick);
        if (Math.random() < 0.4) this.hostBuy(p, 'magnum');
        continue;
      }
      const rifle = p.team === 0 ? 'ar7' : 'm5';
      if (!p.inv.primary) {
        if (p.money >= 5800 && Math.random() < 0.15) this.hostBuy(p, 'longshot');
        else if (p.money >= 3700) this.hostBuy(p, rifle);
        else if (p.money >= 2200) this.hostBuy(p, Math.random() < 0.6 ? 'vex' : 'breacher');
      }
      if (p.money >= 1000 && (p.armor < 100 || !p.helmet)) this.hostBuy(p, p.money >= 1600 ? 'helmet' : 'kevlar');
      if (p.money >= 300 && Math.random() < 0.5) this.hostBuy(p, Math.random() < 0.5 ? 'he' : 'smoke');
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
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, hs: p.hs, dmg: Math.round(p.damage), bot: p.isBot }));
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
        if (d.phase === 'live' && this.mode.kind !== 'ffa') { this.hud.center('GO', '', 1.2); sfx.roundStart(); }
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
          this.hud.center('YOU DIED', k ? `${k.name} · ${(WEAPONS[d.w] || GRENADES[d.w])?.name || d.w}${d.hs ? ' · headshot' : ''}` : '', 2.5);
        }
        if (this.mode.kind === 'bomb' && this.state.bomb?.carrier === v.id) v.hasBomb = false;
        break;
      }
      case 'respawn': {
        const p = this.players.get(d.id);
        if (!p) break;
        this.spawnPlayer(p, d.at, true, true);
        this.giveFFALoadout(p, d.at);
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
    p.model?.revive();
    p.ws.cooldown = 0; p.ws.reloadT = -1; p.ws.drawT = 0; p.ws.scope = 0; p.ws.spray = 0;
    this.brains.get(p.id)?.reset();
    if (p.isLocal) { this.punch = 0; this.viewmodel.setWeapon(p.weaponId, p.char); }
  }

  giveFFALoadout(p, seedArr) {
    const idx = Math.abs(Math.floor((seedArr?.[0] || 0) * 13 + (seedArr?.[2] || 0) * 7)) % FFA_WEAPONS.length;
    const wid = FFA_WEAPONS[idx];
    p.inv.primary = wid; p.giveAmmo(wid);
    p.inv.nades = ['he'];
    switchSlot(p, 'primary');
    if (p.isLocal) this.viewmodel.setWeapon(p.weaponId, p.char);
  }

  applyRound(d) {
    const s = this.state;
    s.round = d.round; s.time = d.time; s.scores = d.scores; s.phase = d.phase || 'buy'; s.bomb = d.bomb;
    this.effects.clearRound();
    for (const n of this.nades) n.mesh.removeFromParent();
    this.nades = [];
    for (const [id, team] of Object.entries(d.teams || {})) { const p = this.players.get(id); if (p) this.setTeam(p, team); }
    for (const [id, m] of Object.entries(d.money || {})) { const p = this.players.get(id); if (p) p.money = m; }
    const reset = new Set(d.resetKit || []);
    for (const p of this.players.values()) {
      const at = d.spawns[p.id];
      if (!at) { p.alive = false; continue; }
      this.spawnPlayer(p, at, reset.has(p.id), d.freeArmor);
      if (this.mode.kind === 'ffa') this.giveFFALoadout(p, at);
    }
    this.refreshBombCarrier();
    this.action = null;
    if (this.isHost) {
      this.botPlan.site = Math.random() < 0.5 ? 'A' : 'B';
      this.botPlan.ctIndex = Math.floor(Math.random() * 2);
      setTimeout(() => this.botBuys(), 400);
    }
    const lp = this.local;
    if (this.mode.kind === 'ffa') this.hud.center('FREE FOR ALL', `First to ${this.mode.killsToWin} kills`, 3);
    else {
      const side = this.mode.kind === 'bomb' && lp ? (lp.team === 0 ? 'Attack — plant the charge at A or B' : 'Defend — stop the plant') : 'Press B to choose your loadout';
      this.hud.center(`ROUND ${d.round}`, side, 2.5);
      if (lp && lp.alive && this.mode.kind !== 'bomb' && reset.has(lp.id)) this.hud.openBuy();
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
      p.giveAmmo(it);
      switchSlot(p, w.slot);
    } else if (GRENADES[it]) p.inv.nades.push(it);
    else if (it === 'kevlar') p.armor = 100;
    else if (it === 'helmet') { p.armor = 100; p.helmet = true; }
    if (p.isLocal) { sfx.buy(); this.viewmodel.setWeapon(p.weaponId, p.char); this.hud.refreshBuy(); }
  }

  // ───────────────────────── networking ─────────────────────────
  bindNet() {
    const n = this.net;
    const evs = ['phase', 'round', 'roundEnd', 'sync', 'hp', 'kill', 'respawn', 'bomb', 'give', 'nade', 'chat', 'msg', 'end'];
    for (const e of evs) n.on(e, (d) => this.onEvent(e, d));
    n.on('S', (d) => this.onStates(d));
    n.on('req', (d) => { if (this.isHost) this.handleRequest(d.type, d.data, d.from); });
    n.on('hello', (d) => {
      if (!this.isHost) return;
      this.helloFrom.add(d.id);
      n.send('snap', { state: this.state, roster: this.rosterPayload(), sync: this.syncPayload() });
    });
    n.on('snap', (d) => {
      if (this.isHost) return;
      this.gotSnap = true;
      for (const r of d.roster) if (!this.players.has(r.id)) this.addPlayer(r);
      Object.assign(this.state, d.state);
      this.onEvent('sync', d.sync);
    });
    n.onLeave((id) => this.onPeerLeft(id));
  }

  rosterPayload() {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, isBot: p.isBot, char: p.char, elo: p.elo }));
  }

  onPeerLeft(id) {
    if (this.ended) return;
    const p = this.players.get(id);
    if (!p || p.isBot) return;
    if (id === this.hostId) {
      // Host gone: the match cannot continue.
      const forfeitWin = this.mode.ranked;
      this.onEnd({ winner: forfeitWin ? this.local.team : -2, reason: 'host-left', scores: this.state.scores, stats: this.statsPayload() });
      return;
    }
    this.hud.chatLine('', `${p.name} left the match`, -1);
    if (this.isHost) {
      if (this.mode.ranked) { this.rules.finish(1 - p.team, 'forfeit'); return; }
      // Replace the leaver with a bot so team sizes stay even.
      p.isBot = true; p.owner = this.hostId; p.name = p.name + ' (bot)';
      this.brains.set(p.id, new BotBrain(this, p, this.opts.botLevel || 'normal'));
      p.isRemoteView = false;
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
      const alive = [...this.players.values()].filter((p) => p.alive && (this.mode.kind === 'ffa' || !lp || p.team === lp.team));
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
    this.state.phase = 'over';
    this.input.unlock();
    const lp = this.local;
    let result = 'draw';
    if (this.mode.kind === 'ffa') {
      result = d.winner === this.localId ? 'win' : 'loss';
    } else if (d.winner >= 0 && lp) result = d.winner === lp.team ? 'win' : 'loss';
    if (d.reason === 'host-left' && d.winner === -2) result = 'draw';
    const myStats = lp ? { k: lp.kills, d: lp.deaths, hs: lp.hs } : { k: 0, d: 0, hs: 0 };
    let eloChange = 0;
    const score = this.mode.kind === 'ffa' ? `${myStats.k} kills` : `${d.scores[lp?.team ?? 0]}-${d.scores[1 - (lp?.team ?? 0)]}`;
    (result === 'win' ? sfx.win : result === 'loss' ? sfx.lose : sfx.roundStart)();
    this.hud.showResults({ result, reason: d.reason, scores: d.scores, stats: d.stats || this.statsPayload(), eloChange: null, score });
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
    this.destroy();
    this.app.exitGame();
  }

  destroy() {
    this.running = false;
    this.input?.dispose();
    this.hud?.unmount();
    this.net?.leave();
    for (const n of this.nades) n.mesh.removeFromParent();
    this.engine.clearScene();
  }
}
