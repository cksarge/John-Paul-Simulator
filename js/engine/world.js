import * as THREE from 'three';
import { getMaterial, tileSize } from './textures.js';
import { buildProp, decorate } from './decor.js';
import { isPlatform, platformH, UPPER, turnChar } from './grid.js';

// The world is a grid of CELL-sized columns. Every solid is a column from y=0 to its height,
// so collision, raycasts and navigation all run directly on the grid.
export const CELL = 2;
// Interactive cells: 'D' door (solid while closed) · 'G' glass pane (blocks movement, not sight or
// bullets; shatters when shot) · 'B' explosive barrel · 'A' ammo crate (press E to refill).
// 'W' wooden barricade and 'k' wooden crate can be shot apart (bullets also go through them).
// 'L' is floor with a ladder up the neighbouring platform.
// A second, upper layer (def.upper, see UPPER in grid.js) holds bridges, grate catwalks and tunnel
// roofs: a slab from UL to UT over a cell whose ground stays open underneath. ('=' in the ground
// layer is the older way to write a 4 m bridge and still works.)
// 'Q' cracked wall: solid, but explosives (and a lot of bullets) knock it down.
// 'P' heavy gate, opened and closed by the nearest 'J' switch (press E at the switch).
// 'E' elevator: a lift that rides between the floor and the tallest platform beside it.
// 'Y' spawn barrier: holds everyone in place until the round goes live, then switches off.
const SOLID_H = { '#': 6, 'X': 6, 'h': 1.15, 'c': 1.0, 'C': 2.0, 'M': 2.6, 'D': 6, 'G': 6, 'B': 1.2, 'A': 1.0, 'W': 3.0, 'k': 1.0, 'Q': 6, 'P': 6, 'J': 1.3, 'Y': 0 };
export const PROP_CHARS = new Set(['D', 'G', 'B', 'A', 'W', 'k', 'Q', 'P', 'J', 'E']);
export const WOOD_HP = { W: 240, k: 120, g: 160, Q: 420 };
// Cells you may never mantle onto (walls, doors, glass, gates).
const NO_MANTLE = new Set(['#', 'X', 'D', 'G', 'Q', 'P', 'Y']);
// Lifts: seconds at the bottom, going up, at the top, coming down.
const LIFT = { wait: 3, move: 2.5 };
const LIFT_PERIOD = 2 * (LIFT.wait + LIFT.move);
// Standing height of a body, for walking under bridges.
const BODY_H = 1.8;
const RAIL_BITS = [[1, 0, 1], [-1, 0, 2], [0, 1, 4], [0, -1, 8]];
const CONTAINER_TINTS = ['#a8432f', '#2f6aa8', '#3d7a45', '#c27a2c', '#7b7f86'];

function heightOf(ch) {
  if (ch in SOLID_H) return SOLID_H[ch];
  return platformH(ch);
}

export class World {
  constructor(def) {
    this.def = def;
    this.w = def.w; this.h = def.h;
    const g = Array.from({ length: def.h }, () => Array(def.w).fill('#'));
    const up = Array.from({ length: def.h }, () => Array(def.w).fill('.'));
    const apply = (grid, op, ch = op[0]) => {
      const [, x0, y0, x1, y1] = op;
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
          if (x > 0 && y > 0 && x < def.w - 1 && y < def.h - 1) grid[y][x] = ch;
    };
    const mirrored = (op) => [turnChar(op[0], 2), def.w - 1 - op[1], def.h - 1 - op[2], def.w - 1 - op[3], def.h - 1 - op[4]];
    for (const op of def.ops) {
      const ops = def.mirror ? [op, mirrored(op)] : [op];
      for (const o of ops) {
        if (o[0] === '=') { apply(g, o, '.'); apply(up, o, '='); } else apply(g, o);
      }
    }
    for (const op of def.upper || []) {
      if (!UPPER[op[0]] && op[0] !== '.') continue;
      apply(up, op);
      if (def.mirror) apply(up, mirrored(op));
    }
    this.chars = g;
    this.H = new Float32Array(def.w * def.h);  // what bodies and grenades collide with
    this.RH = new Float32Array(def.w * def.h); // what bullets and sight lines collide with
    this.UT = new Float32Array(def.w * def.h); // upper slab top (0 = nothing overhead)
    this.UL = new Float32Array(def.w * def.h); // upper slab underside
    this.rails = new Uint8Array(def.w * def.h);
    this.props = new Map();
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) {
      this.setChar(x, y, g[y][x]);
      if (PROP_CHARS.has(g[y][x])) this.props.set(x + ',' + y, { x, y, ch: g[y][x], open: false, broken: false, hp: WOOD_HP[g[y][x]] || 60, stage: 0, anim: 0 });
    }
    // An upper slab only makes sense over ground that's lower than its underside.
    this.up = up;
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) {
      const u = UPPER[up[y][x]];
      if (!u || this.H[y * def.w + x] >= u.lo) { up[y][x] = '.'; continue; }
      this.setUpper(x, y, up[y][x]);
      if (u.grate) this.props.set('u' + x + ',' + y, { x, y, ch: 'g', up: true, open: false, broken: false, hp: WOOD_HP.g, stage: 0, anim: 0 });
    }
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) this.updateRails(x, y);

    // Lifts ride up to the tallest platform beside them (4 m if there's none).
    this.lifts = [];
    for (const p of this.props.values()) if (p.ch === 'E') {
      let top = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) top = Math.max(top, platformH(g[p.y + dy]?.[p.x + dx]), this.UT[(p.y + dy) * def.w + p.x + dx] || 0);
      p.top = top || 4; p.h = 0;
      this.lifts.push(p);
    }
    this.clock = 0;
    // Each gate answers to the nearest switch.
    const switches = [...this.props.values()].filter((p) => p.ch === 'J');
    for (const p of this.props.values()) if (p.ch === 'P' && switches.length) {
      p.link = switches.reduce((a, b) => (Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? b : a));
    }
    this.barrierCells = [];
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) if (g[y][x] === 'Y') this.barrierCells.push([x, y]);
    this.barriersOn = false;

    // Bomb sites: one rectangle [x0, y0, x1, y1] or a list of them (any shape). x0..z1 is the bounding box.
    this.sites = {};
    for (const [k, r] of Object.entries(def.sites || {})) {
      const rects = (Array.isArray(r[0]) ? r : [r]).filter((q) => Array.isArray(q) && q.length === 4);
      if (!rects.length) continue;
      const bx0 = Math.min(...rects.map((q) => q[0])), by0 = Math.min(...rects.map((q) => q[1])), bx1 = Math.max(...rects.map((q) => q[2])), by1 = Math.max(...rects.map((q) => q[3]));
      const big = rects.reduce((a, q) => ((q[2] - q[0] + 1) * (q[3] - q[1] + 1) > (a[2] - a[0] + 1) * (a[3] - a[1] + 1) ? q : a));
      this.sites[k] = { x0: bx0 * CELL, z0: by0 * CELL, x1: (bx1 + 1) * CELL, z1: (by1 + 1) * CELL, cells: [bx0, by0, bx1, by1], rects,
        center: [((big[0] + big[2] + 1) / 2) * CELL, ((big[1] + big[3] + 1) / 2) * CELL] };
    }
    this.spawnCells = (def.spawns || []).map((r) => this.cellsIn(r, true));
    this.allFloor = this.cellsIn([1, 1, def.w - 2, def.h - 2], true);
    this.size = { x: def.w * CELL, z: def.h * CELL };
  }

  // Cells in a rectangle (or a list of rectangles, like a bomb site's `rects`).
  cellsIn(r, floorOnly) {
    if (Array.isArray(r[0])) {
      const seen = new Set(), out = [];
      for (const q of r) for (const c of this.cellsIn(q, floorOnly)) { const k = c.x + ',' + c.y; if (!seen.has(k)) { seen.add(k); out.push(c); } }
      return out;
    }
    const [x0, y0, x1, y1] = r, out = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const h = this.H[y * this.w + x];
      if (floorOnly ? h === 0 && !this.blocked?.(x, y) : h <= 1) out.push({ x, y });
    }
    return out;
  }

  // ───────────── upper layer ─────────────
  setUpper(x, y, ch) {
    const u = UPPER[ch], i = y * this.w + x;
    this.up[y][x] = u ? ch : '.';
    this.UT[i] = u ? u.top : 0;
    this.UL[i] = u ? u.lo : 0;
  }
  deckAt(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return null;
    const i = cy * this.w + cx;
    return this.UT[i] > 0 ? { top: this.UT[i], lo: this.UL[i], ch: this.up[cy][cx] } : null;
  }
  isDeck(cx, cy) { return !!this.deckAt(cx, cy); }
  // Railings run along the edges of a railed deck that don't continue onto something level.
  updateRails(x, y) {
    const i = y * this.w + x, u = UPPER[this.up[y][x]];
    this.rails[i] = 0;
    if (!u?.rails) return;
    for (const [dx, dy, bit] of RAIL_BITS) {
      const nx = x + dx, ny = y + dy, d = this.deckAt(nx, ny), gh = this.cellH(nx, ny);
      const level = (d && Math.abs(d.top - u.top) <= 0.55) || (Math.abs(gh - u.top) <= 0.55 && this.navH(nx, ny) !== null);
      if (!level && gh < u.top + 0.5) this.rails[i] |= bit;
    }
  }

  cellH(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return 50;
    return this.H[cy * this.w + cx];
  }
  rayH(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return 50;
    return this.RH[cy * this.w + cx];
  }

  setChar(x, y, ch) {
    this.chars[y][x] = ch;
    const h = heightOf(ch);
    this.H[y * this.w + x] = h;
    this.RH[y * this.w + x] = ch === 'G' ? 0 : h;
  }

  // Cells that aren't real floor even though nothing stands on them (spawn barriers).
  blocked(x, y) { return this.chars[y]?.[x] === 'Y'; }

  // Spawn barriers: solid to bodies (not bullets) while on.
  setBarriers(on) {
    if (on === this.barriersOn) return;
    this.barriersOn = on;
    for (const [x, y] of this.barrierCells) this.H[y * this.w + x] = on ? 6 : 0;
    if (this.barrierView) this.barrierView.visible = on;
  }

  // Lifts follow a fixed cycle on the shared round clock, so every player sees the same thing.
  liftHeight(p, t = this.clock) {
    const ph = ((t % LIFT_PERIOD) + LIFT_PERIOD) % LIFT_PERIOD, { wait, move } = LIFT;
    const k = ph < wait ? 0 : ph < wait + move ? (ph - wait) / move : ph < 2 * wait + move ? 1 : 1 - (ph - 2 * wait - move) / move;
    return p.top * (0.5 - 0.5 * Math.cos(Math.PI * k));
  }
  isLift(cx, cy) { return this.chars[cy]?.[cx] === 'E'; }

  // ───────────── interactive props ─────────────
  // Props on the upper layer (breakable grates) are keyed separately from the ground cell below.
  prop(x, y, up = false) { return this.props.get((up ? 'u' : '') + x + ',' + y) || null; }

  setDoor([x, y], open) {
    const p = this.prop(x, y);
    if (!p || (p.ch !== 'D' && p.ch !== 'P')) return;
    p.open = open;
    this.setChar(x, y, open ? '.' : p.ch);
    p.view?.setOpen?.(open);
  }

  breakProp(x, y, up = false) {
    const p = this.prop(x, y, up);
    if (!p || p.broken || !'GBWkQg'.includes(p.ch)) return null;
    p.broken = true;
    if (p.up) { this.setUpper(x, y, '.'); this.railsAround(x, y); } else this.setChar(x, y, '.');
    p.view?.setBroken(true);
    return p;
  }

  restoreProp(p) {
    if (p.ch === 'D' || p.ch === 'P') { p.open = false; this.setChar(p.x, p.y, p.ch); p.view?.setOpen?.(false); return; }
    if (!p.broken && !p.stage) return;
    p.broken = false; p.hp = WOOD_HP[p.ch] || 60; p.stage = 0;
    if (p.up) { this.setUpper(p.x, p.y, p.ch); this.railsAround(p.x, p.y); } else this.setChar(p.x, p.y, p.ch);
    p.view?.setBroken(false);
    p.view?.setStage?.(0);
  }

  railsAround(x, y) { for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.up[y + dy]?.[x + dx]) this.updateRails(x + dx, y + dy); }

  resetProps() { for (const p of this.props.values()) this.restoreProp(p); }

  propState() { return [...this.props.values()].filter((p) => p.open || p.broken || p.stage).map((p) => [p.x, p.y, p.open ? 1 : 0, p.broken ? 1 : 0, p.stage || 0, p.up ? 1 : 0]); }

  applyPropState(list) {
    this.resetProps();
    for (const [x, y, open, broken, stage, up] of list || []) {
      if (open) this.setDoor([x, y], true);
      if (broken) this.breakProp(x, y, !!up);
      else if (stage) this.setStage(x, y, stage, !!up);
    }
  }

  // Visible damage on wooden props (0 intact … 2 badly damaged).
  setStage(x, y, stage, up = false) {
    const p = this.prop(x, y, up);
    if (!p || p.broken) return;
    p.stage = stage;
    p.view?.setStage?.(stage);
  }

  // Can a body standing at feet height `y` climb onto the cell at (x, z)?
  canMantle(x, z) {
    const ch = this.chars[Math.floor(z / CELL)]?.[Math.floor(x / CELL)];
    return ch !== undefined && !NO_MANTLE.has(ch);
  }

  // If (x, z) is a ladder cell, the direction [dx, dz] and top height of the platform it climbs.
  ladderAt(x, z) {
    const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
    if (this.chars[cy]?.[cx] !== 'L') return null;
    let best = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ch = this.chars[cy + dy]?.[cx + dx];
      if (ch && isPlatform(ch) && (!best || platformH(ch) > best.top)) best = { dx, dz: dy, top: platformH(ch), cx: cx + dx, cy: cy + dy };
    }
    return best;
  }

  // Cell of the solid just behind a surface hit (point + normal from raycast).
  cellBehind(point, normal) {
    return [Math.floor((point.x - normal.x * 0.05) / CELL), Math.floor((point.z - normal.z * 0.05) / CELL)];
  }

  // Intact glass cells crossed by the segment a→b below the pane's top edge.
  glassAlong(a, b) {
    const out = [], seen = new Set(), d = b.clone().sub(a), len = d.length();
    for (let t = 0; t <= len; t += 0.4) {
      const x = a.x + (d.x * t) / len, y = a.y + (d.y * t) / len, z = a.z + (d.z * t) / len;
      const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL), key = cx + ',' + cy;
      if (seen.has(key)) continue;
      const p = this.props.get(key);
      if (p && p.ch === 'G' && !p.broken && y < 3) { seen.add(key); out.push([cx, cy]); }
    }
    return out;
  }

  update(dt) {
    for (const p of this.lifts) {
      p.h = this.liftHeight(p);
      this.H[p.y * this.w + p.x] = this.RH[p.y * this.w + p.x] = p.h;
    }
    for (const p of this.props.values()) p.view?.update?.(dt, p);
    this.decor?.update(dt);
  }
  heightAt(x, z) { return this.cellH(Math.floor(x / CELL), Math.floor(z / CELL)); }
  cellCenter(cx, cy) { return new THREE.Vector3((cx + 0.5) * CELL, this.cellH(cx, cy), (cy + 0.5) * CELL); }

  siteAt(x, z) {
    const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
    for (const [k, s] of Object.entries(this.sites)) if (s.rects.some((r) => cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3])) return k;
    return null;
  }

  // Highest solid top among cells overlapping the footprint that rises above `y`; -1 if clear.
  blockingTop(x, y, z, r, bh = BODY_H) {
    let top = -1;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const h = this.cellH(cx, cz);
      if (h > y + (this.isLift(cx, cz) ? 0.4 : 0.001) && h > top) top = h;
      // An overhead slab blocks only bodies that overlap it.
      const i = cz * this.w + cx, ut = this.UT[i] || 0;
      if (ut && y < ut - 0.001 && y + bh > this.UL[i] && ut > top) top = ut;
    }
    return top;
  }

  // Highest floor under the footprint at or below `y` (what you would stand on).
  floorUnder(x, y, z, r) {
    let f = 0;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const h = this.cellH(cx, cz);
      if (h <= y + (this.isLift(cx, cz) ? 0.4 : 0.05) && h > f) f = h;
      const ut = this.UT[cz * this.w + cx] || 0;
      if (ut && ut <= y + 0.05 && ut > f) f = ut;
    }
    return f;
  }

  // Lowest overhead slab above a body's feet at `y` (Infinity when the sky is clear).
  ceilingAbove(x, y, z, r) {
    let c = Infinity;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const i = cz * this.w + cx, lo = this.UL[i];
      if (this.UT[i] && lo > y + 0.05 && lo < c) c = lo;
    }
    return c;
  }

  // Floor height under (x, z) for something at height y: the deck once it's at deck level.
  floorAt(x, z, y) {
    const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL), d = this.deckAt(cx, cy);
    return d && y >= d.lo ? d.top : this.cellH(cx, cy);
  }

  // Moves a body (feet position `pos`, velocity `vel`) with gravity, step-up and wall sliding.
  move(body, dt) {
    const STEP = 0.55, r = body.radius, bh = body.height ? body.height() : BODY_H;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const axis of ['x', 'z']) {
        const v = body.vel[axis];
        if (v === 0) continue;
        const next = body.pos[axis] + v * h;
        const px = axis === 'x' ? next : body.pos.x, pz = axis === 'z' ? next : body.pos.z;
        // Railings: no walking off the side of a railed deck.
        const ci = Math.floor(body.pos.z / CELL) * this.w + Math.floor(body.pos.x / CELL), rail = this.rails[ci];
        if (rail && Math.abs(body.pos.y - this.UT[ci]) < 0.2) {
          const c0 = Math.floor(body.pos[axis] / CELL) * CELL, bit = axis === 'x' ? (v > 0 ? 1 : 2) : (v > 0 ? 4 : 8);
          if (rail & bit) {
            const lim = v > 0 ? c0 + CELL - r - 0.001 : c0 + r + 0.001;
            if (v > 0 ? next > lim : next < lim) { body.pos[axis] = v > 0 ? Math.max(body.pos[axis], lim) : Math.min(body.pos[axis], lim); body.vel[axis] = 0; continue; }
          }
        }
        const top = this.blockingTop(px, body.pos.y, pz, r, bh);
        if (top < 0) { body.pos[axis] = next; continue; }
        if (body.onGround && top - body.pos.y <= STEP && this.blockingTop(px, top, pz, r, bh) < 0) {
          body.pos.y = top; body.pos[axis] = next; continue;
        }
        const edge = v > 0 ? Math.floor((next + r) / CELL) * CELL - r - 0.001 : (Math.floor((next - r) / CELL) + 1) * CELL + r + 0.001;
        body.pos[axis] = v > 0 ? Math.max(body.pos[axis], Math.min(next, edge)) : Math.min(body.pos[axis], Math.max(next, edge));
        body.vel[axis] = 0;
      }
      body.vel.y -= 20 * h;
      let ny = body.pos.y + body.vel.y * h;
      // Heads bump the underside of bridges.
      const ceil = this.ceilingAbove(body.pos.x, body.pos.y, body.pos.z, r);
      if (ny + bh > ceil) { ny = Math.min(ny, Math.max(body.pos.y, ceil - bh)); body.vel.y = Math.min(0, body.vel.y); }
      const floor = this.floorUnder(body.pos.x, body.pos.y, body.pos.z, r);
      if (ny <= floor) {
        body.pos.y = floor; body.vel.y = Math.max(0, body.vel.y); body.onGround = true;
      } else {
        body.pos.y = ny;
        body.onGround = body.vel.y <= 0 && ny - floor < 0.02;
      }
    }
  }

  // Grid DDA raycast. Returns {dist, point, normal} or null. Hits the ground plane too.
  raycast(o, d, maxDist = 200) {
    const ox = o.x / CELL, oz = o.z / CELL, dx = d.x, dz = d.z;
    let cx = Math.floor(ox), cz = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(CELL / dx) : Infinity, tDeltaZ = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? cx + 1 - ox : ox - cx) * CELL) / Math.abs(dx) : Infinity;
    let tMaxZ = dz !== 0 ? ((dz > 0 ? cz + 1 - oz : oz - cz) * CELL) / Math.abs(dz) : Infinity;
    let tEnter = 0, nAxis = null;
    const tGround = d.y < 0 ? -o.y / d.y : Infinity;
    for (let iter = 0; iter < 512; iter++) {
      const tExit = Math.min(tMaxX, tMaxZ);
      const H = this.rayH(cx, cz);
      const di = cz * this.w + cx, UT = cx >= 0 && cz >= 0 && cx < this.w && cz < this.h ? this.UT[di] : 0;
      if (UT) {
        const UL = this.UL[di], yEnter = o.y + d.y * tEnter;
        if (tEnter > 0 && yEnter >= UL && yEnter < UT) {
          if (tEnter > maxDist) return null;
          const normal = nAxis === 'x' ? new THREE.Vector3(-stepX, 0, 0) : new THREE.Vector3(0, 0, -stepZ);
          return this._hit(o, d, tEnter, normal);
        }
        const tFace = d.y < 0 ? (UT - o.y) / d.y : d.y > 0 ? (UL - o.y) / d.y : -1;
        if (tFace >= tEnter && tFace <= tExit && tFace >= 0) {
          if (tFace > maxDist) return null;
          return this._hit(o, d, tFace, new THREE.Vector3(0, d.y < 0 ? 1 : -1, 0));
        }
      }
      if (H > 0) {
        const yEnter = o.y + d.y * tEnter;
        if (yEnter < H && tEnter > 0) {
          if (tEnter > maxDist) return null;
          const normal = nAxis === 'x' ? new THREE.Vector3(-stepX, 0, 0) : new THREE.Vector3(0, 0, -stepZ);
          return this._hit(o, d, tEnter, normal);
        }
        if (d.y < 0) {
          const tTop = (H - o.y) / d.y;
          if (tTop >= tEnter && tTop <= tExit && tTop >= 0) {
            if (tTop > maxDist) return null;
            return this._hit(o, d, tTop, new THREE.Vector3(0, 1, 0));
          }
        }
      }
      if (tGround >= tEnter && tGround <= tExit) {
        if (tGround > maxDist) return null;
        return this._hit(o, d, tGround, new THREE.Vector3(0, 1, 0));
      }
      if (tExit > maxDist) return null;
      tEnter = tExit;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDeltaX; nAxis = 'x'; } else { cz += stepZ; tMaxZ += tDeltaZ; nAxis = 'z'; }
      if (cx < -1 || cz < -1 || cx > this.w || cz > this.h) return null;
    }
    return null;
  }
  _hit(o, d, t, normal) {
    return { dist: t, point: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t), normal };
  }

  lineOfSight(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 0.001) return true;
    d.divideScalar(len);
    const hit = this.raycast(a, d, len);
    return !hit;
  }

  // ───────────── navigation ─────────────
  navH(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return null;
    const ch = this.chars[cy][cx];
    if (ch === '.' || ch === 'L' || isPlatform(ch)) return this.H[cy * this.w + cx];
    if (ch === 'D') return 0; // bots open doors on their way through
    if (ch === 'Y' || ch === 'E') return 0; // barriers drop at the start; lifts are boarded at the bottom
    return null;
  }

  // Height a body reaches stepping into cell (cx, cy) from height `from`, or null if it can't.
  // Cells under a bridge have two levels: the deck (from about deck height) and the ground under it.
  navInto(from, cx, cy) {
    const d = this.deckAt(cx, cy), g = this.navH(cx, cy);
    if (!d) return g;
    if (Math.abs(d.top - from) <= 0.55) return d.top;
    return g !== null && g + BODY_H <= d.lo && from + BODY_H <= d.lo ? g : null;
  }

  // A* over cells. Bridge cells get a second node (index + w*h) for their deck.
  findPath(from, to) {
    const W = this.w, N = W * this.h;
    const sx = Math.floor(from.x / CELL), sy = Math.floor(from.z / CELL);
    let tx = Math.floor(to.x / CELL), ty = Math.floor(to.z / CELL);
    if (this.navH(sx, sy) === null) return null;
    if (this.navH(tx, ty) === null) {
      const n = this.nearestWalkable(tx, ty);
      if (!n) return null;
      tx = n.x; ty = n.y;
    }
    const level = (x, y, h) => { const d = this.deckAt(x, y); return d && h >= d.lo ? 1 : 0; };
    const g = new Float32Array(2 * N).fill(Infinity), came = new Int32Array(2 * N).fill(-1), closed = new Uint8Array(2 * N);
    const heap = [];
    const push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const hfn = (x, y) => { const ax = Math.abs(x - tx), ay = Math.abs(y - ty); return Math.max(ax, ay) + 0.414 * Math.min(ax, ay); };
    const start = sy * W + sx + level(sx, sy, from.y) * N, goal = ty * W + tx + level(tx, ty, to.y) * N;
    g[start] = 0; push(start, hfn(sx, sy));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false, guard = 0;
    while (heap.length && guard++ < 40000) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      if (cur === goal) { found = true; break; }
      closed[cur] = 1;
      const cell = cur % N, cx = cell % W, cy = (cell / W) | 0, ch = cur >= N ? this.UT[cell] : this.navH(cx, cy);
      const onLadder = this.chars[cy][cx] === 'L', rail = cur >= N ? this.rails[cell] : 0;
      const lift = cur < N && this.isLift(cx, cy) ? this.prop(cx, cy) : null;
      for (const [ddx, ddy, cost] of dirs) {
        if (rail && ((ddx > 0 && rail & 1) || (ddx < 0 && rail & 2) || (ddy > 0 && rail & 4) || (ddy < 0 && rail & 8))) continue;
        const nx = cx + ddx, ny = cy + ddy, nh = this.navInto(ch, nx, ny);
        if (nh === null) continue;
        // Up: steps, or a ladder straight onto its platform. Down: any drop (bots accept a little fall damage).
        const up = nh - ch, ladderUp = (onLadder || (lift && nh <= lift.top + 0.01)) && !(ddx && ddy) && up > 0.55;
        if (up > 0.55 && !ladderUp) continue;
        if (ddx && ddy && Math.abs(up) > 0.55) continue;
        if (ddx && ddy) {
          const a = this.navInto(ch, cx + ddx, cy), b = this.navInto(ch, cx, cy + ddy);
          if (a === null || b === null || Math.abs(a - ch) > 0.55 || Math.abs(b - ch) > 0.55) continue;
        }
        const ni = ny * W + nx + level(nx, ny, nh) * N, ng = g[cur] + cost + (up < -0.55 ? 1.5 : 0) + (ladderUp ? 2 : 0);
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; push(ni, ng + hfn(nx, ny)); }
      }
    }
    if (!found) return null;
    const path = [];
    for (let c = goal; c !== -1 && c !== start; c = came[c]) {
      const cell = c % N, pt = this.cellCenter(cell % W, (cell / W) | 0);
      if (c >= N) pt.y = this.UT[cell];
      path.push(pt);
    }
    path.reverse();
    return path;
  }

  nearestWalkable(cx, cy) {
    for (let r = 1; r < 8; r++)
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
        if (this.navH(x, y) !== null) return { x, y };
    return null;
  }

  randomCellIn(rect) {
    const cells = this.cellsIn(rect, false).filter((c) => this.navH(c.x, c.y) !== null);
    const c = cells[Math.floor(Math.random() * cells.length)];
    return c ? this.cellCenter(c.x, c.y) : null;
  }

  // ───────────── rendering ─────────────
  build(scene) {
    const theme = this.def.theme;
    const group = new THREE.Group();
    group.name = 'world';
    const buckets = new Map();
    const bucket = (mat, fit) => {
      if (!buckets.has(mat)) buckets.set(mat, { pos: [], nrm: [], uv: [], idx: [], col: [], fit });
      return buckets.get(mat);
    };
    const matFor = (ch, i) => {
      if (ch === '#') return theme.wall;
      if (ch === 'X') return theme.wall2;
      if (ch === 'h') return theme.half;
      if (ch === 'c') return theme.crate || 'wood';
      if (ch === 'C') return theme.crate2 || theme.crate || 'wood';
      if (ch === 'M') return 'container:' + CONTAINER_TINTS[i % CONTAINER_TINTS.length];
      return theme.platform;
    };
    // Greedy-merge equal cells into boxes.
    const seen = new Uint8Array(this.w * this.h);
    // Interactive cells get their own meshes so they can open, shatter or explode.
    for (const p of this.props.values()) { if (!p.up) seen[p.y * this.w + p.x] = 1; p.view = buildProp(this, p, theme); group.add(p.view.root); }
    let boxIndex = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const ch = this.chars[y][x];
      if (ch === '.' || ch === 'L' || ch === 'Y' || seen[y * this.w + x]) continue;
      let x1 = x;
      while (x1 + 1 < this.w && this.chars[y][x1 + 1] === ch && !seen[y * this.w + x1 + 1]) x1++;
      let y1 = y;
      outer: while (y1 + 1 < this.h) {
        for (let k = x; k <= x1; k++) if (this.chars[y1 + 1][k] !== ch || seen[(y1 + 1) * this.w + k]) break outer;
        y1++;
      }
      for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) seen[yy * this.w + xx] = 1;
      // Containers and crates are split back into small boxes so each reads as a separate object.
      const split = ch === 'M' ? 2 : (ch === 'c' || ch === 'C') ? 1 : 0;
      const box = (ax, ay, bx, by) => {
        const name = matFor(ch, boxIndex++);
        const b = bucket(name, ch === 'c' || ch === 'C' || ch === 'M');
        addBox(b, ax * CELL, 0, ay * CELL, (bx + 1) * CELL, heightOf(ch), (by + 1) * CELL, name, ch);
      };
      if (split === 1) { for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) box(xx, yy, xx, yy); }
      else if (split === 2) {
        const horizontal = x1 - x >= y1 - y;
        if (horizontal) for (let yy = y; yy <= y1; yy++) box(x, yy, x1, yy);
        else for (let xx = x; xx <= x1; xx++) box(xx, y, xx, y1);
      } else box(x, y, x1, y1);
    }
    // Spawn barriers: glowing panels, shown while they're up.
    this.barrierView = new THREE.Group();
    for (const [x, y] of this.barrierCells) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(CELL, 3, CELL), getBarrierMat());
      m.position.set((x + 0.5) * CELL, 1.5, (y + 0.5) * CELL);
      this.barrierView.add(m);
    }
    this.barrierView.visible = this.barriersOn;
    group.add(this.barrierView);
    // Upper layer: bridge decks and tunnel roofs, greedy-merged per kind (grates are props above).
    const useen = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const ch = this.up[y][x];
      if (ch === '.' || ch === 'g' || useen[y * this.w + x]) continue;
      let x1 = x;
      while (x1 + 1 < this.w && this.up[y][x1 + 1] === ch && !useen[y * this.w + x1 + 1]) x1++;
      let y1 = y;
      outer2: while (y1 + 1 < this.h) {
        for (let k = x; k <= x1; k++) if (this.up[y1 + 1][k] !== ch || useen[(y1 + 1) * this.w + k]) break outer2;
        y1++;
      }
      for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) useen[yy * this.w + xx] = 1;
      const u = UPPER[ch], name = u.roof ? theme.wall : theme.platform;
      addBox(bucket(name, false), x * CELL, u.lo, y * CELL, (x1 + 1) * CELL, u.top, (y1 + 1) * CELL, name, ch);
    }
    for (const [name, b] of buckets) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.setIndex(b.idx);
      geo.computeTangents?.();
      const [tex, tint] = name.split(':');
      const mesh = new THREE.Mesh(geo, getMaterial(tex, tint, true));
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    // Floor
    const fw = this.w * CELL, fd = this.h * CELL, ft = tileSize(theme.floor);
    const fgeo = new THREE.PlaneGeometry(fw + 40, fd + 40);
    fgeo.rotateX(-Math.PI / 2);
    fgeo.translate(fw / 2, 0, fd / 2);
    const uv = fgeo.attributes.uv, p = fgeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / ft, -p.getZ(i) / ft);
    const floor = new THREE.Mesh(fgeo, getMaterial(theme.floor));
    floor.receiveShadow = true;
    group.add(floor);
    // Bomb site decals
    for (const [k, s] of Object.entries(this.sites)) group.add(siteDecal(k, s));
    this.decor = decorate(this, group, theme);
    scene.add(group);
    this.group = group;
    return group;
  }

  // Top-down image used by the radar and map previews. 1 px per `scale` cell units.
  radarCanvas(scale = 6) {
    const c = document.createElement('canvas');
    c.width = this.w * scale; c.height = this.h * scale;
    const ctx = c.getContext('2d');
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const ch = this.chars[y][x];
      ctx.fillStyle = ch === '#' || ch === 'X' ? '#1b1f25' : 'hcCMBA'.includes(ch) ? '#4a515b' : 'Wk'.includes(ch) ? '#7a5a36' : ch === 'D' ? '#8a6a3a' : ch === 'G' ? '#5f8fb0' : ch === '.' || ch === 'L' ? '#7c8591'
        : isPlatform(ch) ? `rgb(${140 + platformH(ch) * 18},${150 + platformH(ch) * 16},${165 + platformH(ch) * 14})` : '#959eaa';
      ctx.fillRect(x * scale, y * scale, scale, scale);
      // Bridges and roofs drawn over the ground, see-through so what's under them still shows.
      const u = this.up[y][x];
      if (u !== '.') {
        ctx.fillStyle = u === 'T' ? 'rgba(60,66,76,.75)' : u === 'g' ? 'rgba(150,160,172,.6)' : 'rgba(205,213,222,.7)';
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    for (const [k, s] of Object.entries(this.sites)) {
      ctx.fillStyle = 'rgba(255,90,90,.25)';
      for (const [x0, y0, x1, y1] of s.rects) ctx.fillRect(x0 * scale, y0 * scale, (x1 - x0 + 1) * scale, (y1 - y0 + 1) * scale);
      ctx.fillStyle = '#ff6b6b'; ctx.font = `bold ${scale * 3}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(k, (s.center[0] / CELL) * scale, (s.center[1] / CELL) * scale);
    }
    (this.def.spawns || []).forEach((r, i) => {
      ctx.fillStyle = i === 0 ? 'rgba(232,131,58,.35)' : 'rgba(78,163,255,.35)';
      ctx.fillRect(r[0] * scale, r[1] * scale, (r[2] - r[0] + 1) * scale, (r[3] - r[1] + 1) * scale);
    });
    return c;
  }
}

// Darkening toward the floor fakes ambient occlusion where walls meet the ground.
const aoAt = (y) => (y <= 0.001 ? 0.52 : y >= 1.6 ? 1 : 0.52 + (y / 1.6) * 0.48);

function addBox(b, x0, y0, z0, x1, y1, z1, name, ch) {
  const tex = name.split(':')[0];
  const t = tileSize(tex);
  const fit = b.fit;
  const h = y1 - y0;
  // Tall sides are split at 1.6 m so the occlusion gradient stays near the floor.
  const bands = h > 2 ? [[y0, y0 + 1.6], [y0 + 1.6, y1]] : [[y0, y1]];
  const faces = [];
  for (const [ya, yb] of bands) {
    faces.push(
      { n: [1, 0, 0], v: [[x1, ya, z1], [x1, ya, z0], [x1, yb, z0], [x1, yb, z1]], u: (q) => [(z1 - q[2]), q[1] - y0] },
      { n: [-1, 0, 0], v: [[x0, ya, z0], [x0, ya, z1], [x0, yb, z1], [x0, yb, z0]], u: (q) => [(q[2] - z0), q[1] - y0] },
      { n: [0, 0, 1], v: [[x0, ya, z1], [x1, ya, z1], [x1, yb, z1], [x0, yb, z1]], u: (q) => [(q[0] - x0), q[1] - y0] },
      { n: [0, 0, -1], v: [[x1, ya, z0], [x0, ya, z0], [x0, yb, z0], [x1, yb, z0]], u: (q) => [(x1 - q[0]), q[1] - y0] },
    );
  }
  faces.push({ n: [0, 1, 0], v: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], u: (q) => [(q[0] - x0), (z1 - q[2])] });
  // Raised boxes (bridge decks) can be seen from below.
  if (y0 > 0) faces.push({ n: [0, -1, 0], v: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], u: (q) => [(q[0] - x0), (q[2] - z0)] });
  for (const f of faces) {
    const base = b.pos.length / 3;
    for (const q of f.v) {
      b.pos.push(q[0], q[1], q[2]);
      b.nrm.push(...f.n);
      const ao = f.n[1] === 1 ? 1 : aoAt(q[1]);
      b.col.push(ao, ao, ao);
      let [u, v] = f.u(q);
      if (fit) {
        // Crates/containers: one texture across each 2 m footprint and the full height.
        const top = f.n[1] === 1;
        u = u / (ch === 'M' ? 3 : CELL);
        v = top ? v / (ch === 'M' ? 3 : CELL) : v / h;
      } else {
        // World-aligned tiling so neighbouring walls line up.
        if (f.n[1] !== 0) { u = q[0] / t; v = q[2] / t; }
        else { u = (f.n[0] !== 0 ? q[2] : q[0]) / t; v = q[1] / t; }
      }
      b.uv.push(u, v);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

let barrierMat;
function getBarrierMat() {
  return (barrierMat ||= new THREE.MeshBasicMaterial({ color: 0x4ea3ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
}

function siteDecal(letter, s) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(214,52,40,0.85)'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(128, 128, 104, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(214,52,40,0.9)'; ctx.font = 'bold 170px Rajdhani, Impact, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 138);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(s.center[0], 0.02, s.center[1]);
  m.receiveShadow = true;
  return m;
}
