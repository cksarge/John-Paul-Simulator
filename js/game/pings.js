import * as THREE from 'three';
import { sfx } from '../engine/audio.js';
import { SOLO_KINDS } from '../data/modes.js';

// Quick pings: tap Z (R3 on a controller) to mark where you're aiming, or an enemy under your crosshair.
// Hold it for a wheel of callouts. Teammates see a marker in the world, on the radar and in chat.
export const PING_KINDS = {
  enemy: { label: 'Enemy spotted', icon: '◆', color: '#ff4d4d', urgent: true },
  go: { label: 'Go here', icon: '▼', color: '#4ea3ff' },
  help: { label: 'Need backup', icon: '✚', color: '#f2a33a', urgent: true },
  watch: { label: 'Watch out', icon: '!', color: '#ffd23f', urgent: true },
  defend: { label: 'Defending here', icon: '⛨', color: '#3dff8f' },
  rotate: { label: 'Rotating', icon: '↻', color: '#c06cff' },
};
// Wheel order, clockwise from the top.
const WHEEL = ['enemy', 'go', 'help', 'watch', 'defend', 'rotate'];
const LIFE = 6;
const HOLD = 0.25;

export class Pings {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.recent = [];
    this.holdT = -1;
    this.wheel = null;
    const root = game.hud.root;
    this.layer = document.createElement('div');
    this.layer.className = 'ping-layer';
    root.appendChild(this.layer);
    this.wheelEl = document.createElement('div');
    this.wheelEl.className = 'ping-wheel hidden';
    root.appendChild(this.wheelEl);
  }

  // Called from the local player's update. Returns true while the wheel is open (it takes the mouse).
  input(dt, p, ui) {
    const inp = this.g.input;
    const down = !ui && p.alive && inp.down('KeyZ');
    if (down) {
      this.holdT = this.holdT < 0 ? 0 : this.holdT + dt;
      if (this.holdT >= HOLD) {
        if (!this.wheel) this.wheel = { x: 0, y: 0 };
        this.wheel.x += inp.mouse.dx; this.wheel.y += inp.mouse.dy;
        const rs = inp.padState?.rs;
        if (rs && rs.m > 0.5) { this.wheel.x = rs.x * 100; this.wheel.y = rs.y * 100; }
        this.drawWheel(this.wheelSlot());
        return true;
      }
      return false;
    }
    if (this.holdT >= 0) {
      const kind = this.wheel ? (this.wheelSlot() < 0 ? null : WHEEL[this.wheelSlot()]) : null;
      const quick = !this.wheel;
      this.holdT = -1;
      this.wheel = null;
      this.wheelEl.classList.add('hidden');
      if (quick || kind) this.send(p, kind);
    }
    return false;
  }

  wheelSlot() {
    const w = this.wheel;
    if (!w || Math.hypot(w.x, w.y) < 25) return -1;
    const a = Math.atan2(w.x, -w.y); // 0 = up, clockwise
    return ((Math.round(a / (Math.PI / 3)) % 6) + 6) % 6;
  }

  drawWheel(sel) {
    const el = this.wheelEl;
    el.classList.remove('hidden');
    if (this.wheelKey === sel) return;
    this.wheelKey = sel;
    el.innerHTML = WHEEL.map((k, i) => {
      const d = PING_KINDS[k], a = (i / 6) * Math.PI * 2;
      return `<div class="pw-slot ${i === sel ? 'sel' : ''}" style="--c:${d.color};left:${130 + Math.sin(a) * 105}px;top:${130 - Math.cos(a) * 105}px"><i>${d.icon}</i><span>${d.label}</span></div>`;
    }).join('') + '<div class="ew-hint">Point and release</div>';
  }

  // Where the crosshair points: an enemy in view (for "enemy"), or the first surface hit.
  aim(p) {
    const g = this.g, eye = p.eye(), f = p.forward();
    let enemy = null, best = Math.cos(THREE.MathUtils.degToRad(4));
    for (const o of g.players.values()) {
      if (!o.alive || o === p || !g.canDamage(p, o)) continue;
      const to = o.pos.clone().setY(o.pos.y + 1.2).sub(eye);
      const d = to.length(), dot = to.dot(f) / d;
      if (dot > best && d < 90 && g.world.lineOfSight(eye, o.pos.clone().setY(o.pos.y + 1.2)) && !g.effects.smokeBlocks?.(eye, o.pos.clone().setY(o.pos.y + 1.2))) { best = dot; enemy = o; }
    }
    if (enemy) return { pos: enemy.pos.clone().setY(enemy.pos.y + 1.9), enemy: true };
    const hit = g.world.raycast(eye, f, 90);
    return { pos: hit ? eye.clone().addScaledVector(f, Math.max(0, hit.dist - 0.1)) : eye.clone().addScaledVector(f, 30), enemy: false };
  }

  send(p, kind) {
    const now = performance.now();
    this.recent = this.recent.filter((t) => now - t < 4000);
    if (this.recent.length >= 3 || now - (this.recent[this.recent.length - 1] || 0) < 450) return;
    this.recent.push(now);
    const a = this.aim(p);
    kind = kind || (a.enemy ? 'enemy' : 'go');
    this.g.broadcast('ping', { id: p.id, team: p.team, kind, pos: [a.pos.x, a.pos.y, a.pos.z] });
  }

  // Event from anyone (including yourself). Only your team sees team pings; solo modes keep pings private.
  receive(d) {
    const g = this.g, me = g.local, from = g.players.get(d.id), def = PING_KINDS[d.kind];
    if (!def || !from) return;
    if (SOLO_KINDS.has(g.mode.kind) ? d.id !== g.localId : me && d.team !== me.team) return;
    this.list = this.list.filter((x) => x.from !== d.id || x.kind !== d.kind);
    const el = document.createElement('div');
    el.className = 'ping';
    el.style.setProperty('--c', def.color);
    el.innerHTML = `<i>${def.icon}</i><b>${def.label}</b><span></span>`;
    this.layer.appendChild(el);
    this.list.push({ from: d.id, kind: d.kind, pos: new THREE.Vector3(...d.pos), t: LIFE, el, name: from.name });
    while (this.list.length > 8) this.list.shift().el.remove();
    sfx.ping(def.urgent);
    g.hud.chatLine('', `${from.name}: ${def.label}`, -1);
  }

  update(dt) {
    const cam = this.g.engine.camera, W = innerWidth, H = innerHeight;
    const v = new THREE.Vector3();
    for (const pg of [...this.list]) {
      pg.t -= dt;
      if (pg.t <= 0) { pg.el.remove(); this.list.splice(this.list.indexOf(pg), 1); continue; }
      v.copy(pg.pos).project(cam);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      if (behind) { x = W - x; y = H - 24; }
      // Off-screen pings stick to the edge so you can still find them.
      const edge = behind || x < 30 || x > W - 30 || y < 30 || y > H - 30;
      x = Math.min(W - 30, Math.max(30, x)); y = Math.min(H - 30, Math.max(30, y));
      pg.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      pg.el.classList.toggle('edge', edge);
      pg.el.style.opacity = Math.min(1, pg.t * 2);
      pg.el.querySelector('span').textContent = `${Math.round(cam.position.distanceTo(pg.pos))} m · ${pg.name}`;
    }
  }

  drawRadar(ctx, S) {
    for (const pg of this.list) {
      ctx.fillStyle = PING_KINDS[pg.kind].color;
      ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(pg.t * 5));
      ctx.beginPath(); ctx.arc(pg.pos.x * S, pg.pos.z * S, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  dispose() { this.layer.remove(); this.wheelEl.remove(); }
}
