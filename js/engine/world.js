import * as THREE from 'three';
import { getMaterial, tileSize } from './textures.js';

// The world is a grid of CELL-sized columns. Every solid is a column from y=0 to its height,
// so collision, raycasts and navigation all run directly on the grid.
export const CELL = 2;
const SOLID_H = { '#': 6, 'X': 6, 'h': 1.15, 'c': 1.0, 'C': 2.0, 'M': 2.6 };
const CONTAINER_TINTS = ['#a8432f', '#2f6aa8', '#3d7a45', '#c27a2c', '#7b7f86'];

function heightOf(ch) {
  if (ch in SOLID_H) return SOLID_H[ch];
  if (ch >= '1' && ch <= '4') return (ch.charCodeAt(0) - 48) * 0.5;
  return 0;
}

export class World {
  constructor(def) {
    this.def = def;
    this.w = def.w; this.h = def.h;
    const g = Array.from({ length: def.h }, () => Array(def.w).fill('#'));
    const apply = (op) => {
      const [ch, x0, y0, x1, y1] = op;
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
          if (x > 0 && y > 0 && x < def.w - 1 && y < def.h - 1) g[y][x] = ch;
    };
    for (const op of def.ops) {
      apply(op);
      if (def.mirror) apply([op[0], def.w - 1 - op[1], def.h - 1 - op[2], def.w - 1 - op[3], def.h - 1 - op[4]]);
    }
    this.chars = g;
    this.H = new Float32Array(def.w * def.h);
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) this.H[y * def.w + x] = heightOf(g[y][x]);

    this.sites = {};
    for (const [k, r] of Object.entries(def.sites || {}))
      this.sites[k] = { x0: r[0] * CELL, z0: r[1] * CELL, x1: (r[2] + 1) * CELL, z1: (r[3] + 1) * CELL, cells: r };
    this.spawnCells = (def.spawns || []).map((r) => this.cellsIn(r, true));
    this.allFloor = this.cellsIn([1, 1, def.w - 2, def.h - 2], true);
    this.size = { x: def.w * CELL, z: def.h * CELL };
  }

  cellsIn([x0, y0, x1, y1], floorOnly) {
    const out = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const h = this.H[y * this.w + x];
      if (floorOnly ? h === 0 : h <= 1) out.push({ x, y });
    }
    return out;
  }

  cellH(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return 50;
    return this.H[cy * this.w + cx];
  }
  heightAt(x, z) { return this.cellH(Math.floor(x / CELL), Math.floor(z / CELL)); }
  cellCenter(cx, cy) { return new THREE.Vector3((cx + 0.5) * CELL, this.cellH(cx, cy), (cy + 0.5) * CELL); }

  siteAt(x, z) {
    for (const [k, s] of Object.entries(this.sites)) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return k;
    return null;
  }

  // Highest solid top among cells overlapping the footprint that rises above `y`; -1 if clear.
  blockingTop(x, y, z, r) {
    let top = -1;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const h = this.cellH(cx, cz);
      if (h > y + 0.001 && h > top) top = h;
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
      if (h <= y + 0.05 && h > f) f = h;
    }
    return f;
  }

  // Moves a body (feet position `pos`, velocity `vel`) with gravity, step-up and wall sliding.
  move(body, dt) {
    const STEP = 0.55, r = body.radius;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const axis of ['x', 'z']) {
        const v = body.vel[axis];
        if (v === 0) continue;
        const next = body.pos[axis] + v * h;
        const px = axis === 'x' ? next : body.pos.x, pz = axis === 'z' ? next : body.pos.z;
        const top = this.blockingTop(px, body.pos.y, pz, r);
        if (top < 0) { body.pos[axis] = next; continue; }
        if (body.onGround && top - body.pos.y <= STEP && this.blockingTop(px, top, pz, r) < 0) {
          body.pos.y = top; body.pos[axis] = next; continue;
        }
        const edge = v > 0 ? Math.floor((next + r) / CELL) * CELL - r - 0.001 : (Math.floor((next - r) / CELL) + 1) * CELL + r + 0.001;
        body.pos[axis] = v > 0 ? Math.max(body.pos[axis], Math.min(next, edge)) : Math.min(body.pos[axis], Math.max(next, edge));
        body.vel[axis] = 0;
      }
      body.vel.y -= 20 * h;
      const ny = body.pos.y + body.vel.y * h;
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
      const H = this.cellH(cx, cz);
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
    if (ch === '.' || (ch >= '1' && ch <= '4')) return this.H[cy * this.w + cx];
    return null;
  }

  findPath(from, to) {
    const W = this.w;
    const sx = Math.floor(from.x / CELL), sy = Math.floor(from.z / CELL);
    let tx = Math.floor(to.x / CELL), ty = Math.floor(to.z / CELL);
    if (this.navH(sx, sy) === null) return null;
    if (this.navH(tx, ty) === null) {
      const n = this.nearestWalkable(tx, ty);
      if (!n) return null;
      tx = n.x; ty = n.y;
    }
    const N = W * this.h, g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [];
    const push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const hfn = (x, y) => { const ax = Math.abs(x - tx), ay = Math.abs(y - ty); return Math.max(ax, ay) + 0.414 * Math.min(ax, ay); };
    const start = sy * W + sx, goal = ty * W + tx;
    g[start] = 0; push(start, hfn(sx, sy));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false, guard = 0;
    while (heap.length && guard++ < 20000) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      if (cur === goal) { found = true; break; }
      closed[cur] = 1;
      const cx = cur % W, cy = (cur / W) | 0, ch = this.navH(cx, cy);
      for (const [ddx, ddy, cost] of dirs) {
        const nx = cx + ddx, ny = cy + ddy, nh = this.navH(nx, ny);
        if (nh === null || Math.abs(nh - ch) > 0.55) continue;
        if (ddx && ddy) {
          const a = this.navH(cx + ddx, cy), b = this.navH(cx, cy + ddy);
          if (a === null || b === null || Math.abs(a - ch) > 0.55 || Math.abs(b - ch) > 0.55) continue;
        }
        const ni = ny * W + nx, ng = g[cur] + cost;
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; push(ni, ng + hfn(nx, ny)); }
      }
    }
    if (!found) return null;
    const path = [];
    for (let c = goal; c !== -1 && c !== start; c = came[c]) path.push(this.cellCenter(c % W, (c / W) | 0));
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
      if (!buckets.has(mat)) buckets.set(mat, { pos: [], nrm: [], uv: [], idx: [], fit });
      return buckets.get(mat);
    };
    const matFor = (ch, i) => {
      if (ch === '#') return theme.wall;
      if (ch === 'X') return theme.wall2;
      if (ch === 'h') return theme.half;
      if (ch === 'c' || ch === 'C') return 'wood';
      if (ch === 'M') return 'container:' + CONTAINER_TINTS[i % CONTAINER_TINTS.length];
      return theme.platform;
    };
    // Greedy-merge equal cells into boxes.
    const seen = new Uint8Array(this.w * this.h);
    let boxIndex = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const ch = this.chars[y][x];
      if (ch === '.' || seen[y * this.w + x]) continue;
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
    for (const [name, b] of buckets) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setIndex(b.idx);
      geo.computeTangents?.();
      const [tex, tint] = name.split(':');
      const mesh = new THREE.Mesh(geo, getMaterial(tex, tint));
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
      ctx.fillStyle = ch === '#' || ch === 'X' ? '#1b1f25' : ch === 'h' || ch === 'c' || ch === 'C' || ch === 'M' ? '#4a515b' : ch === '.' ? '#7c8591' : '#959eaa';
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
    for (const [k, s] of Object.entries(this.sites)) {
      const [x0, y0, x1, y1] = s.cells;
      ctx.fillStyle = 'rgba(255,90,90,.25)';
      ctx.fillRect(x0 * scale, y0 * scale, (x1 - x0 + 1) * scale, (y1 - y0 + 1) * scale);
      ctx.fillStyle = '#ff6b6b'; ctx.font = `bold ${scale * 3}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(k, ((x0 + x1 + 1) / 2) * scale, ((y0 + y1 + 1) / 2) * scale);
    }
    (this.def.spawns || []).forEach((r, i) => {
      ctx.fillStyle = i === 0 ? 'rgba(232,131,58,.35)' : 'rgba(78,163,255,.35)';
      ctx.fillRect(r[0] * scale, r[1] * scale, (r[2] - r[0] + 1) * scale, (r[3] - r[1] + 1) * scale);
    });
    return c;
  }
}

function addBox(b, x0, y0, z0, x1, y1, z1, name, ch) {
  const tex = name.split(':')[0];
  const t = tileSize(tex);
  const fit = b.fit;
  const faces = [
    { n: [1, 0, 0], v: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], u: (q) => [(z1 - q[2]), q[1] - y0] },
    { n: [-1, 0, 0], v: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], u: (q) => [(q[2] - z0), q[1] - y0] },
    { n: [0, 0, 1], v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], u: (q) => [(q[0] - x0), q[1] - y0] },
    { n: [0, 0, -1], v: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], u: (q) => [(x1 - q[0]), q[1] - y0] },
    { n: [0, 1, 0], v: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], u: (q) => [(q[0] - x0), (z1 - q[2])] },
  ];
  const h = y1 - y0;
  for (const f of faces) {
    const base = b.pos.length / 3;
    for (const q of f.v) {
      b.pos.push(q[0], q[1], q[2]);
      b.nrm.push(...f.n);
      let [u, v] = f.u(q);
      if (fit) {
        // Crates/containers: one texture across each 2 m footprint and the full height.
        const top = f.n[1] === 1;
        u = u / (ch === 'M' ? 3 : CELL);
        v = top ? v / (ch === 'M' ? 3 : CELL) : v / h;
      } else {
        // World-aligned tiling so neighbouring walls line up.
        if (f.n[1] === 1) { u = q[0] / t; v = q[2] / t; }
        else { u = (f.n[0] !== 0 ? q[2] : q[0]) / t; v = q[1] / t; }
      }
      b.uv.push(u, v);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
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
  m.position.set((s.x0 + s.x1) / 2, 0.02, (s.z0 + s.z1) / 2);
  m.receiveShadow = true;
  return m;
}
