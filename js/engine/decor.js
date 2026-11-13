import * as THREE from 'three';
import { getMaterial } from './textures.js';
import { isPlatform, platformH } from './grid.js';

// Visual dressing generated from the map grid: trims, contact shadows, floor decals, wall fixtures
// and lights, scenery beyond the walls and ambient particles. Nothing here affects collision.
// Also builds the meshes for interactive cells (doors, glass, barrels, ammo crates).
const CELL = 2;
const WALLS = new Set(['#', 'X']);

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
const hashStr = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Collects boxes and quads into one merged mesh per material.
class Batch {
  constructor(tile = 2) { this.pos = []; this.nrm = []; this.uv = []; this.idx = []; this.tile = tile; }
  quad(a, b, c, d, n, uvs) {
    const base = this.pos.length / 3;
    for (const q of [a, b, c, d]) this.pos.push(q[0], q[1], q[2]);
    for (let i = 0; i < 4; i++) this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(...uvs);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  box(x0, y0, z0, x1, y1, z1) {
    const t = this.tile;
    const U = (a, b, c, d) => [a / t, c / t, b / t, c / t, b / t, d / t, a / t, d / t];
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], U(-z1, -z0, y0, y1));
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], U(z0, z1, y0, y1));
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], U(x0, x1, y0, y1));
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], U(-x1, -x0, y0, y1));
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], U(x0, x1, -z1, -z0));
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], U(x0, x1, z0, z1));
  }
  // Box placed against a wall face: s along the face, y up, size w (along) × h × d (out from wall).
  faceBox(f, s, y, w, h, d, out = 0) {
    const cx = f.cx + f.tx * s + f.nx * (out + d / 2), cz = f.cz + f.tz * s + f.nz * (out + d / 2);
    const hx = (f.tx ? w : d) / 2, hz = (f.tz ? w : d) / 2;
    this.box(cx - hx, y, cz - hz, cx + hx, y + h, cz + hz);
  }
  mesh(mat, shadows = true) {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = shadows; m.receiveShadow = true;
    return m;
  }
}

// Every wall side that faces open ground, with its outward normal and tangent.
function wallFaces(world) {
  const out = [];
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    if (!WALLS.has(world.chars[y][x])) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) continue;
      const ch = world.chars[ny][nx];
      if (WALLS.has(ch)) continue;
      const floorY = platformH(ch);
      out.push({ x, y, nx: dx, nz: dy, tx: Math.abs(dy), tz: Math.abs(dx), cx: (x + 0.5) * CELL + dx, cz: (y + 0.5) * CELL + dy, floorY, open: ch });
    }
  }
  return out;
}

// ───────────────────────── textures for decor ─────────────────────────
let shared = null;
function sharedTex() {
  if (shared) return shared;
  const gradient = canvasTex(8, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#7a7a7a'); gr.addColorStop(1, '#000000');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
  // 4 × 2 atlas of floor decals.
  const atlas = canvasTex(1024, 512, (g) => {
    const r = seeded(99);
    const blob = (cx, cy, rad, color, n = 14, alpha = 0.5) => {
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * rad, y = cy + (r() - 0.5) * rad, rr = rad * (0.15 + r() * 0.35);
        const gr = g.createRadialGradient(x, y, 0, x, y, rr);
        gr.addColorStop(0, color.replace('A', alpha)); gr.addColorStop(1, color.replace('A', 0));
        g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
    };
    const tile = (i, fn) => { const x = (i % 4) * 256, y = Math.floor(i / 4) * 256; g.save(); g.beginPath(); g.rect(x, y, 256, 256); g.clip(); fn(x + 128, y + 128); g.restore(); };
    tile(0, (cx, cy) => blob(cx, cy, 170, 'rgba(70,52,34,A)', 22, 0.45)); // dirt
    tile(1, (cx, cy) => { // cracks
      g.strokeStyle = 'rgba(20,18,16,.85)'; g.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        let x = cx + (r() - 0.5) * 60, y = cy + (r() - 0.5) * 60, a = r() * 6.28;
        g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(x, y);
        for (let i = 0; i < 9; i++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); g.lineWidth *= 0.9; }
        g.stroke();
      }
    });
    tile(2, (cx, cy) => blob(cx, cy, 120, 'rgba(8,8,10,A)', 16, 0.6)); // oil
    tile(3, (cx, cy) => { // leaves
      for (let i = 0; i < 70; i++) {
        const x = cx + (r() - 0.5) * 220, y = cy + (r() - 0.5) * 220;
        g.fillStyle = ['#5f6b2a', '#7a5a22', '#8a3f1a', '#4c5a24', '#9a7a30'][Math.floor(r() * 5)];
        g.save(); g.translate(x, y); g.rotate(r() * 6.28); g.beginPath(); g.ellipse(0, 0, 7 + r() * 5, 3 + r() * 2, 0, 0, 6.28); g.fill(); g.restore();
      }
    });
    tile(4, (cx, cy) => blob(cx, cy, 190, 'rgba(214,184,138,A)', 20, 0.55)); // sand
    tile(5, (cx, cy) => blob(cx, cy, 190, 'rgba(240,246,255,A)', 22, 0.7)); // snow
    tile(6, (cx, cy) => { // painted markings
      g.fillStyle = 'rgba(226,186,48,.85)';
      g.fillRect(cx - 120, cy - 8, 240, 16);
      for (let i = 0; i < 40; i++) { g.clearRect(cx - 120 + r() * 240, cy - 8 + r() * 16, 3 + r() * 6, 2 + r() * 4); }
    });
    tile(7, (cx, cy) => { // debris
      for (let i = 0; i < 60; i++) {
        const x = cx + (r() - 0.5) * 200, y = cy + (r() - 0.5) * 200, s = 2 + r() * 6;
        g.fillStyle = `rgba(${60 + r() * 60},${58 + r() * 50},${55 + r() * 40},.9)`;
        g.fillRect(x, y, s, s * (0.5 + r()));
      }
    });
  });
  const puddle = canvasTex(256, 256, (g) => {
    const r = seeded(5);
    for (let i = 0; i < 10; i++) {
      const x = 128 + (r() - 0.5) * 120, y = 128 + (r() - 0.5) * 120, rr = 40 + r() * 50;
      const gr = g.createRadialGradient(x, y, rr * 0.6, x, y, rr);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 6.28); g.fill();
    }
  }, false);
  const vine = canvasTex(256, 512, (g) => {
    const r = seeded(17);
    for (let s = 0; s < 7; s++) {
      let x = 20 + r() * 216, y = 0;
      const len = 200 + r() * 300;
      g.strokeStyle = '#3d4a22'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x, y);
      while (y < len) {
        x += (r() - 0.5) * 10; y += 12; g.lineTo(x, y);
        for (let k = 0; k < 2; k++) {
          g.fillStyle = ['#3f6b2a', '#4f7d2e', '#2f5a24', '#5d8a34'][Math.floor(r() * 4)];
          g.save(); g.translate(x + (r() - 0.5) * 18, y); g.rotate(r() * 6.28);
          g.beginPath(); g.ellipse(0, 0, 9 + r() * 6, 5 + r() * 3, 0, 0, 6.28); g.fill(); g.restore();
        }
      }
      g.stroke();
    }
  });
  const soft = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  shared = { gradient, atlas, puddle, vine, soft };
  return shared;
}

function windowTex(lit) {
  return canvasTex(128, 256, (g) => {
    const r = seeded(lit ? 3 : 4);
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, lit ? '#ffcf86' : '#5a6b7c'); gr.addColorStop(1, lit ? '#c97a32' : '#1a222c');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
    if (lit) for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(60,30,10,${0.2 + r() * 0.3})`; g.fillRect(r() * 100, 120 + r() * 120, 20 + r() * 40, 30 + r() * 60); }
    g.fillStyle = '#2a2a2a';
    g.fillRect(0, 0, 128, 8); g.fillRect(0, 248, 128, 8); g.fillRect(0, 0, 8, 256); g.fillRect(120, 0, 8, 256);
    g.fillRect(60, 0, 8, 256); g.fillRect(0, 124, 128, 8);
  });
}

function facadeTex(seed, night, base = '#59606a') {
  const t = facadeCanvas(seed, night, base);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function facadeCanvas(seed, night, base) {
  return canvasTex(256, 512, (g) => {
    const r = seeded(seed);
    g.fillStyle = base; g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.08})`; g.fillRect(r() * 256, r() * 512, 2 + r() * 20, 2 + r() * 20); }
    for (let y = 16; y < 500; y += 40) for (let x = 14; x < 240; x += 40) {
      const lit = night && r() < 0.35;
      g.fillStyle = lit ? ['#ffd69a', '#ffe7b8', '#cfe3ff'][Math.floor(r() * 3)] : `rgb(${30 + r() * 25},${36 + r() * 25},${44 + r() * 25})`;
      g.fillRect(x, y, 24, 26);
    }
  });
}

function signTex(text, sub, color = '#d9a531', fg = '#141414') {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, 244, 116);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 64px Rajdhani, Impact, sans-serif'; g.fillText(text, 128, sub ? 52 : 66);
    if (sub) { g.font = 'bold 22px Rajdhani, sans-serif'; g.fillText(sub, 128, 102); }
    const r = seeded(hashStr(text + sub));
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(40,30,20,${r() * 0.25})`; g.fillRect(r() * 256, r() * 128, 2 + r() * 8, 2 + r() * 6); }
  });
}

// ───────────────────────── interactive props ─────────────────────────
const propMats = {};
function propMat(key) {
  if (propMats[key]) return propMats[key];
  const make = {
    glass: () => new THREE.MeshStandardMaterial({ color: 0xa8cde0, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0.3, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
    shard: () => new THREE.MeshStandardMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.4 }),
    barrel: () => new THREE.MeshStandardMaterial({
      map: canvasTex(256, 128, (g) => {
        g.fillStyle = '#a3261c'; g.fillRect(0, 0, 256, 128);
        for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#1a1a1a' : '#e0b030'; g.beginPath(); g.moveTo(i * 16, 50); g.lineTo(i * 16 + 16, 50); g.lineTo(i * 16 + 8, 78); g.lineTo(i * 16 - 8, 78); g.fill(); }
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 16, 256, 4); g.fillRect(0, 108, 256, 4);
        const r = seeded(11);
        for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(70,40,20,${r() * 0.4})`; g.fillRect(r() * 256, r() * 128, 2 + r() * 10, 2 + r() * 6); }
      }), roughness: 0.55, metalness: 0.45,
    }),
    char: () => new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 1 }),
    ammo: () => new THREE.MeshStandardMaterial({
      map: canvasTex(256, 128, (g) => {
        g.fillStyle = '#41502e'; g.fillRect(0, 0, 256, 128);
        g.strokeStyle = '#2b3520'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 120);
        g.fillStyle = '#e0c040'; g.font = 'bold 44px Rajdhani, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('AMMO', 128, 56); g.font = 'bold 18px Rajdhani, sans-serif'; g.fillText('PRESS E · RESUPPLY', 128, 96);
      }), roughness: 0.8,
    }),
    handle: () => new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.3, metalness: 0.9 }),
    lampOn: () => new THREE.MeshBasicMaterial({ color: 0x60ff90, toneMapped: false }),
    lampRed: () => new THREE.MeshBasicMaterial({ color: 0xff5040, toneMapped: false }),
    steel: () => new THREE.MeshStandardMaterial({ color: 0x59606a, roughness: 0.45, metalness: 0.8 }),
    hazard: () => new THREE.MeshStandardMaterial({
      map: canvasTex(128, 32, (g) => { g.fillStyle = '#e0b030'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#1a1a1a'; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 16, 32); g.lineTo(i * 16 + 8, 32); g.lineTo(i * 16 + 24, 0); g.lineTo(i * 16 + 16, 0); g.fill(); } }),
      roughness: 0.6,
    }),
    crack: () => new THREE.MeshStandardMaterial({
      map: canvasTex(256, 256, (g) => {
        g.clearRect(0, 0, 256, 256); g.strokeStyle = 'rgba(20,18,16,.9)'; g.lineCap = 'round';
        const r = seeded(29);
        for (let k = 0; k < 7; k++) { let x = 128, y = 128; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 7; i++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); g.lineWidth = Math.max(1, 4 - i * 0.5); } g.stroke(); }
      }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 1,
    }),
  };
  propMats[key] = make[key]();
  return propMats[key];
}

function mesh(geo, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

// Builds the meshes for one interactive cell. Returns {root, setBroken(b), update(dt, prop)}.
export function buildProp(world, p, theme) {
  const root = new THREE.Group();
  const cx = (p.x + 0.5) * CELL, cz = (p.y + 0.5) * CELL;
  root.position.set(cx, 0, cz);
  const solid = (x, y) => { const c = world.chars[y]?.[x]; return c === '#' || c === 'X'; };
  // Panels span the axis that has walls on both ends.
  const alongX = solid(p.x - 1, p.y) || solid(p.x + 1, p.y) ? true : !(solid(p.x, p.y - 1) || solid(p.x, p.y + 1));
  const wallMat = getMaterial(theme.wall);
  const view = { root, setBroken() {}, update() {} };

  if (p.ch === 'Q') {
    // Cracked wall: a full-height block that cracks, then collapses into a rubble heap.
    const wall = mesh(new THREE.BoxGeometry(CELL, 6, CELL), wallMat, 0, 3, 0);
    const cracks = [];
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = mesh(new THREE.PlaneGeometry(1.9, 1.9), propMat('crack'), sx * (CELL / 2 + 0.01), 1.3, sz * (CELL / 2 + 0.01), false);
      c.rotation.y = sx ? (sx > 0 ? Math.PI / 2 : -Math.PI / 2) : sz > 0 ? 0 : Math.PI;
      c.visible = false; cracks.push(c);
    }
    const rubble = new THREE.Group();
    const r = seeded(p.x * 31 + p.y * 7);
    for (let i = 0; i < 9; i++) {
      const sz = 0.3 + r() * 0.5, m = mesh(new THREE.BoxGeometry(sz, sz * 0.6, sz), wallMat, (r() - 0.5) * 1.6, sz * 0.3, (r() - 0.5) * 1.6);
      m.rotation.set(r() * 0.5, r() * 6, r() * 0.5); rubble.add(m);
    }
    rubble.visible = false;
    root.add(wall, rubble, ...cracks);
    view.setStage = (n) => { cracks.forEach((c, i) => { c.visible = n >= 1; c.scale.setScalar(n >= 2 ? 1.5 : 1); c.position.y = n >= 2 ? 1.6 + (i % 2) * 0.6 : 1.3; }); };
    view.setBroken = (b) => { wall.visible = !b; rubble.visible = b; cracks.forEach((c) => { c.visible = !b && c.visible; }); };
    return view;
  }

  if (p.ch === 'P') {
    // Heavy gate: a steel shutter that rolls up into the header when its switch is thrown.
    const top = 3.2;
    root.add(mesh(new THREE.BoxGeometry(CELL, 6 - top, CELL), wallMat, 0, top + (6 - top) / 2, 0));
    const shutter = new THREE.Group();
    shutter.add(mesh(alongX ? new THREE.BoxGeometry(CELL, top, 0.16) : new THREE.BoxGeometry(0.16, top, CELL), propMat('steel'), 0, top / 2, 0));
    const stripe = mesh(alongX ? new THREE.BoxGeometry(CELL, 0.25, 0.18) : new THREE.BoxGeometry(0.18, 0.25, CELL), propMat('hazard'), 0, 0.2, 0);
    shutter.add(stripe);
    root.add(shutter);
    let open = 0, target = 0;
    view.setOpen = (o) => { target = o ? 1 : 0; };
    view.update = (dt) => { open += Math.sign(target - open) * Math.min(Math.abs(target - open), dt * 1.4); shutter.position.y = open * (top - 0.15); shutter.scale.y = 1 - open * 0.95; };
    return view;
  }

  if (p.ch === 'J') {
    // Gate switch: a post with a lever and a lamp (green while its gates are open).
    root.add(mesh(new THREE.BoxGeometry(0.35, 1.3, 0.35), propMat('steel'), 0, 0.65, 0));
    const box = mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), propMat('hazard'), 0, 1.1, 0);
    const lever = mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), propMat('handle'), 0.32, 1.25, 0);
    const lamp = mesh(new THREE.SphereGeometry(0.07, 10, 8), propMat('lampRed'), 0, 1.4, 0, false);
    root.add(box, lever, lamp);
    view.update = () => {
      const open = [...world.props.values()].some((g) => g.ch === 'P' && g.link === p && g.open);
      lamp.material = propMat(open ? 'lampOn' : 'lampRed');
      lever.rotation.z = open ? -0.7 : 0.7;
    };
    return view;
  }

  if (p.ch === 'E') {
    // Lift: a platform with hazard edges on a scissor post, riding with the world's lift height.
    const deck = new THREE.Group();
    deck.add(mesh(new THREE.BoxGeometry(CELL - 0.04, 0.2, CELL - 0.04), getMaterial(theme.platform || 'grate'), 0, -0.1, 0));
    for (const s of [-1, 1]) {
      deck.add(mesh(new THREE.BoxGeometry(CELL, 0.06, 0.12), propMat('hazard'), 0, 0.02, s * (CELL / 2 - 0.06)));
      deck.add(mesh(new THREE.BoxGeometry(0.12, 0.06, CELL), propMat('hazard'), s * (CELL / 2 - 0.06), 0.02, 0));
    }
    const post = mesh(new THREE.BoxGeometry(0.3, 1, 0.3), propMat('steel'), 0, 0.5, 0);
    root.add(deck, post);
    view.update = (dt, pr) => {
      const h = Math.max(0.02, pr.h || 0);
      deck.position.y = h;
      post.scale.y = Math.max(0.01, h - 0.2); post.position.y = Math.max(0.01, h - 0.2) / 2;
    };
    return view;
  }

  if (p.ch === 'g') {
    // Breakable grate catwalk overhead: a thin grating in a steel frame that cracks, then drops out.
    const intact = new THREE.Group();
    intact.add(mesh(new THREE.BoxGeometry(CELL, 0.06, CELL), getMaterial(theme.platform || 'grate'), 0, 3.97, 0));
    const frameMat = getMaterial(theme.trim || 'trim');
    for (const s of [-1, 1]) {
      intact.add(mesh(new THREE.BoxGeometry(CELL, 0.16, 0.08), frameMat, 0, 3.88, s * (CELL / 2 - 0.04)));
      intact.add(mesh(new THREE.BoxGeometry(0.08, 0.16, CELL), frameMat, s * (CELL / 2 - 0.04), 3.88, 0));
    }
    const cracks = mesh(new THREE.BoxGeometry(CELL * 0.7, 0.01, 0.05), propMat('handle'), 0.1, 4.005, -0.2, false);
    cracks.rotation.y = 0.6; cracks.visible = false;
    intact.add(cracks);
    root.add(intact);
    view.setStage = (n) => { cracks.visible = n >= 1; intact.rotation.z = n >= 2 ? 0.02 : 0; };
    view.setBroken = (b) => { intact.visible = !b; };
    return view;
  }

  if (p.ch === 'D' || p.ch === 'G') {
    const top = p.ch === 'D' ? 2.7 : 3;
    const lintel = mesh(new THREE.BoxGeometry(CELL, 6 - top, CELL), wallMat, 0, top + (6 - top) / 2, 0);
    root.add(lintel);
    const frameMat = getMaterial(theme.trim || 'trim');
    const jambW = 0.12;
    for (const s of [-1, 1]) {
      const g = alongX ? new THREE.BoxGeometry(jambW, top, 0.3) : new THREE.BoxGeometry(0.3, top, jambW);
      root.add(mesh(g, frameMat, alongX ? s * (CELL / 2 - jambW / 2) : 0, top / 2, alongX ? 0 : s * (CELL / 2 - jambW / 2)));
    }
    if (p.ch === 'D') {
      const panel = new THREE.Group();
      const w = CELL - jambW * 2, door = mesh(alongX ? new THREE.BoxGeometry(w, top - 0.05, 0.1) : new THREE.BoxGeometry(0.1, top - 0.05, w), getMaterial(theme.door || 'panel'), 0, (top - 0.05) / 2, 0);
      panel.add(door);
      for (const side of [-1, 1]) {
        const h = mesh(new THREE.BoxGeometry(alongX ? 0.04 : 0.06, 0.04, alongX ? 0.06 : 0.04), propMat('handle'), alongX ? w * 0.38 : side * 0.08, 1.05, alongX ? side * 0.08 : w * 0.38);
        panel.add(h);
      }
      const win = mesh(alongX ? new THREE.BoxGeometry(0.5, 0.35, 0.11) : new THREE.BoxGeometry(0.11, 0.35, 0.5), propMat('glass'), 0, 1.8, 0, false);
      panel.add(win);
      root.add(panel);
      // Sliding door: it slides sideways into the wall when opened.
      view.update = (dt, prop) => {
        const target = prop.open ? 1 : 0;
        prop.anim += Math.sign(target - prop.anim) * Math.min(Math.abs(target - prop.anim), dt * 3.2);
        const e = prop.anim * prop.anim * (3 - 2 * prop.anim);
        if (alongX) panel.position.x = e * (w - 0.1); else panel.position.z = e * (w - 0.1);
      };
    } else {
      const pane = mesh(alongX ? new THREE.BoxGeometry(CELL - jambW * 2, top, 0.04) : new THREE.BoxGeometry(0.04, top, CELL - jambW * 2), propMat('glass'), 0, top / 2, 0, false);
      pane.renderOrder = 2;
      const mull = mesh(alongX ? new THREE.BoxGeometry(CELL, 0.08, 0.14) : new THREE.BoxGeometry(0.14, 0.08, CELL), frameMat, 0, 1.1, 0);
      const sill = mesh(alongX ? new THREE.BoxGeometry(CELL, 0.12, 0.34) : new THREE.BoxGeometry(0.34, 0.12, CELL), frameMat, 0, 0.06, 0);
      const shards = new THREE.Group();
      const r = seeded(p.x * 131 + p.y);
      for (let i = 0; i < 14; i++) {
        const s = new THREE.Mesh(new THREE.CircleGeometry(0.06 + r() * 0.1, 3), propMat('shard'));
        s.rotation.set(-Math.PI / 2, 0, r() * 6.28);
        s.position.set((r() - 0.5) * 1.8, 0.015, (r() - 0.5) * 1.8);
        shards.add(s);
      }
      shards.visible = false;
      root.add(pane, mull, sill, shards);
      view.setBroken = (b) => { pane.visible = !b; mull.visible = !b; shards.visible = b; };
    }
  } else if (p.ch === 'B') {
    const barrels = new THREE.Group(), geo = new THREE.CylinderGeometry(0.36, 0.36, 1.12, 20);
    const spots = [[-0.42, -0.3], [0.42, -0.3], [0, 0.42]];
    for (const [x, z] of spots) {
      const b = mesh(geo, propMat('barrel'), x, 0.56, z);
      b.rotation.y = x * 3;
      barrels.add(b);
      barrels.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 16), getMaterial('trim'), x, 1.125, z));
    }
    const remains = new THREE.Group();
    for (const [x, z] of spots) {
      const b = mesh(new THREE.CylinderGeometry(0.38, 0.33, 0.28, 10, 1, true), propMat('char'), x, 0.14, z);
      remains.add(b);
    }
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.012;
    remains.add(scorch);
    remains.visible = false;
    root.add(barrels, remains);
    view.setBroken = (b) => { barrels.visible = !b; remains.visible = b; };
  } else if (p.ch === 'W' || p.ch === 'k') {
    // Wooden barricade (full cell, 3 m) or crate (1 m). Damage shows as holes, then it splinters.
    const wall = p.ch === 'W', h = wall ? 3 : 1;
    const intact = new THREE.Group();
    const r = seeded(p.x * 977 + p.y * 31);
    if (wall) {
      const planks = 9, ph = h / planks;
      for (let i = 0; i < planks; i++) {
        const geo = new THREE.BoxGeometry(CELL - 0.02 - (alongX ? 0 : r() * 0.06), ph - 0.03, CELL - 0.02 - (alongX ? r() * 0.06 : 0));
        const m = mesh(geo, getMaterial('plank'), 0, ph * i + ph / 2, 0);
        m.rotation.y = (r() - 0.5) * 0.02;
        intact.add(m);
      }
      for (const s of [-1, 1]) for (const t of [-1, 1]) intact.add(mesh(new THREE.BoxGeometry(0.14, h, 0.14), getMaterial('wood'), s * 0.94, h / 2, t * 0.94));
      intact.add(mesh(new THREE.BoxGeometry(CELL, 0.12, CELL), getMaterial('trim'), 0, h + 0.06, 0));
    } else {
      intact.add(mesh(new THREE.BoxGeometry(CELL * 0.98, h, CELL * 0.98), getMaterial('wood'), 0, h / 2, 0));
    }
    // Damage stages: dark splintered holes on both faces.
    const holes = [new THREE.Group(), new THREE.Group()];
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x0b0806, side: THREE.DoubleSide });
    for (let st = 0; st < 2; st++) {
      for (let i = 0; i < (st ? 7 : 4); i++) {
        const w = 0.18 + r() * 0.3, hh = 0.12 + r() * 0.25, y = 0.25 + r() * (h - 0.5), s2 = (r() - 0.5) * 1.5;
        for (const side of [-1, 1]) {
          const q = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), holeMat);
          const off = CELL * 0.502 * side;
          if (alongX) { q.position.set(s2, y, off); } else { q.position.set(off, y, s2); q.rotation.y = Math.PI / 2; }
          q.rotation.z = r() * 0.8;
          holes[st].add(q);
        }
      }
      holes[st].visible = false;
      intact.add(holes[st]);
    }
    const debris = new THREE.Group();
    for (let i = 0; i < (wall ? 10 : 5); i++) {
      const m = mesh(new THREE.BoxGeometry(0.12 + r() * 0.1, 0.05, 0.6 + r() * 0.9), getMaterial('plank'), (r() - 0.5) * 1.6, 0.03 + r() * 0.05, (r() - 0.5) * 1.6);
      m.rotation.set((r() - 0.5) * 0.3, r() * 6, (r() - 0.5) * 0.3);
      debris.add(m);
    }
    debris.visible = false;
    root.add(intact, debris);
    view.setStage = (n) => { holes[0].visible = n >= 1; holes[1].visible = n >= 2; };
    view.setBroken = (b) => { intact.visible = !b; debris.visible = b; };
  } else if (p.ch === 'A') {
    const crate = mesh(new THREE.BoxGeometry(1.7, 0.85, 1.1), propMat('ammo'), 0, 0.425, 0);
    crate.rotation.y = alongX ? 0 : Math.PI / 2;
    const lid = mesh(new THREE.BoxGeometry(1.76, 0.1, 1.16), getMaterial('crate_mil'), 0, 0.9, 0);
    lid.rotation.y = crate.rotation.y;
    const lamp = mesh(new THREE.SphereGeometry(0.05, 8, 6), propMat('lampOn'), 0.7, 0.98, 0, false);
    root.add(crate, lid, lamp);
    view.update = (dt) => { lamp.visible = Math.floor(performance.now() / 600) % 2 === 0; };
  }
  return view;
}

// ───────────────────────── map dressing ─────────────────────────
export function decorate(world, group, theme) {
  const d = theme.decor || {};
  const rand = seeded(hashStr(world.def.id));
  const tex = sharedTex();
  const faces = wallFaces(world);
  const dyn = []; // things that animate each frame
  const add = (m) => { if (m) group.add(m); return m; };

  // Trims: skirting along every wall base and a cap on top of walls and half walls.
  const trim = new Batch(2), rails = new Batch(1);
  for (const f of faces) {
    trim.faceBox(f, 0, f.floorY, CELL, 0.22, 0.05);
    trim.faceBox(f, 0, 5.92, CELL + 0.001, 0.16, 0.1);
  }
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    const ch = world.chars[y][x];
    if (ch === 'h') trim.box(x * CELL - 0.06, 1.15, y * CELL - 0.06, (x + 1) * CELL + 0.06, 1.24, (y + 1) * CELL + 0.06);
    // Hazard edge on raised platforms where they drop to the floor.
    if (isPlatform(ch)) {
      const top = platformH(ch);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = world.chars[y + dy]?.[x + dx];
        if (n !== '.' && n !== 'L' && !(isPlatform(n) && n < ch)) continue;
        const f = { cx: (x + 0.5) * CELL + dx, cz: (y + 0.5) * CELL + dy, nx: dx, nz: dy, tx: Math.abs(dy), tz: Math.abs(dx) };
        trim.faceBox(f, 0, top - 0.12, CELL, 0.12, 0.02);
      }
    }
    // Hazard edge along bridge decks wherever they end in mid-air (railings get posts and a top bar).
    const dk = world.deckAt(x, y);
    if (dk && dk.ch !== 'T' && dk.ch !== 'g') {
      const railBits = world.rails[y * world.w + x];
      for (const [dx, dy, bit] of [[1, 0, 1], [-1, 0, 2], [0, 1, 4], [0, -1, 8]]) {
        const nd = world.deckAt(x + dx, y + dy), n = world.chars[y + dy]?.[x + dx];
        if (!n || WALLS.has(n) || (nd && Math.abs(nd.top - dk.top) < 0.3) || Math.abs(platformH(n) - dk.top) < 0.3) continue;
        const f = { cx: (x + 0.5) * CELL + dx, cz: (y + 0.5) * CELL + dy, nx: dx, nz: dy, tx: Math.abs(dy), tz: Math.abs(dx) };
        trim.faceBox(f, 0, dk.top - 0.12, CELL, 0.12, 0.02);
        if (railBits & bit) {
          const rf = { ...f, nx: -dx, nz: -dy };
          for (const sx of [-0.92, 0, 0.92]) rails.faceBox(rf, sx, dk.top, 0.06, 1.0, 0.06, 0.02);
          rails.faceBox(rf, 0, dk.top + 0.96, CELL, 0.07, 0.07, 0.01);
          rails.faceBox(rf, 0, dk.top + 0.5, CELL, 0.04, 0.04, 0.02);
        }
      }
    }
  }
  add(trim.mesh(getMaterial(d.trim || 'trim')));
  add(rails.mesh(new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.5, metalness: 0.6 })));

  // Soft contact shadows on the floor along the base of walls, crates and containers.
  const ao = new Batch();
  // v = 1 at the wall edge (white, opaque in the alpha map) fading to 0 inward.
  const AOUV = [0, 1, 1, 1, 1, 0, 0, 0];
  for (let y = 1; y < world.h - 1; y++) for (let x = 1; x < world.w - 1; x++) {
    if (world.H[y * world.w + x] !== 0 && world.chars[y][x] !== 'D') continue;
    const x0 = x * CELL, z0 = y * CELL, x1 = x0 + CELL, z1 = z0 + CELL, W = 0.85, Y = 0.008;
    const solid = (cx, cy) => 'XhcCMBA#'.includes(world.chars[cy]?.[cx] ?? '#');
    if (solid(x - 1, y)) ao.quad([x0, Y, z1], [x0, Y, z0], [x0 + W, Y, z0], [x0 + W, Y, z1], [0, 1, 0], AOUV);
    if (solid(x + 1, y)) ao.quad([x1, Y, z0], [x1, Y, z1], [x1 - W, Y, z1], [x1 - W, Y, z0], [0, 1, 0], AOUV);
    if (solid(x, y - 1)) ao.quad([x0, Y, z0], [x1, Y, z0], [x1, Y, z0 + W], [x0, Y, z0 + W], [0, 1, 0], AOUV);
    if (solid(x, y + 1)) ao.quad([x1, Y, z1], [x0, Y, z1], [x0, Y, z1 - W], [x1, Y, z1 - W], [0, 1, 0], AOUV);
  }
  const aoMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: d.aoStrength ?? 0.42, alphaMap: tex.gradient, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
  const aoMesh = add(ao.mesh(aoMat, false));
  if (aoMesh) aoMesh.renderOrder = 1;

  // Floor decals from the atlas.
  const decalNames = ['dirt', 'crack', 'oil', 'leaves', 'sand', 'snow', 'paint', 'debris'];
  const kinds = (d.decals || ['dirt', 'crack']).map((k) => decalNames.indexOf(k)).filter((i) => i >= 0);
  const decals = new Batch();
  const floorCells = [];
  for (let y = 1; y < world.h - 1; y++) for (let x = 1; x < world.w - 1; x++) if (world.chars[y][x] === '.' || isPlatform(world.chars[y][x])) floorCells.push([x, y]);
  const nDecals = Math.round(floorCells.length * (d.decalDensity ?? 0.22));
  for (let i = 0; i < nDecals && kinds.length; i++) {
    const [x, y] = floorCells[Math.floor(rand() * floorCells.length)];
    const k = kinds[Math.floor(rand() * kinds.length)];
    const s = 0.9 + rand() * 1.6, a = rand() * Math.PI * 2, Y = world.H[y * world.w + x] + 0.012 + i * 0.00002;
    const cx = (x + 0.5) * CELL + (rand() - 0.5), cz = (y + 0.5) * CELL + (rand() - 0.5);
    const c = Math.cos(a) * s, sn = Math.sin(a) * s;
    const u0 = (k % 4) / 4, v0 = 1 - Math.floor(k / 4) / 2;
    decals.quad([cx - c + sn, Y, cz - sn - c], [cx + c + sn, Y, cz + sn - c], [cx + c - sn, Y, cz + sn + c], [cx - c - sn, Y, cz - sn + c], [0, 1, 0],
      [u0, v0 - 0.5, u0 + 0.25, v0 - 0.5, u0 + 0.25, v0, u0, v0]);
  }
  const decalMesh = add(decals.mesh(new THREE.MeshStandardMaterial({ map: tex.atlas, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }), false));
  if (decalMesh) decalMesh.renderOrder = 1;

  // Reflective puddles.
  if (d.puddles) {
    const pud = new Batch();
    for (let i = 0; i < floorCells.length * 0.05; i++) {
      const [x, y] = floorCells[Math.floor(rand() * floorCells.length)];
      if (world.H[y * world.w + x] !== 0) continue;
      const s = 0.8 + rand() * 1.1, cx = (x + 0.5) * CELL, cz = (y + 0.5) * CELL, Y = 0.016;
      pud.quad([cx - s, Y, cz + s], [cx + s, Y, cz + s], [cx + s, Y, cz - s], [cx - s, Y, cz - s], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
    }
    const pm = add(pud.mesh(new THREE.MeshStandardMaterial({ color: 0x1c262c, roughness: 0.02, metalness: 0.6, transparent: true, opacity: 0.8, alphaMap: tex.puddle, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, envMapIntensity: 1.4 }), false));
    if (pm) pm.renderOrder = 1;
  }

  // ───── wall fixtures ─────
  const kinds2 = d.wall || ['lamp', 'pipe', 'vent'];
  const fixtures = new Batch(1);
  const lampBodies = new Batch(1);
  const glowQuads = new Batch(1);
  const lampSpots = [];
  const shuffled = [...faces].sort(() => rand() - 0.5);
  const used = new Set();
  const take = (f) => { const k = f.x + ',' + f.y + ',' + f.nx + ',' + f.nz; if (used.has(k)) return false; used.add(k); return true; };
  const outward = (f, s, y, out) => [f.cx + f.tx * s + f.nx * out, y, f.cz + f.tz * s + f.nz * out];
  // A flat quad on the wall face (signs, windows, glows).
  const faceQuad = (b, f, s, y, w, h, out, uv = [0, 0, 1, 0, 1, 1, 0, 1]) => {
    const p0 = outward(f, s - w / 2, y, out), p1 = outward(f, s + w / 2, y, out), p2 = outward(f, s + w / 2, y + h, out), p3 = outward(f, s - w / 2, y + h, out);
    // Wind so the quad faces outward.
    const flip = (f.nx === 1 || f.nz === -1);
    if (flip) b.quad(p1, p0, p3, p2, [f.nx, 0, f.nz], uv); else b.quad(p0, p1, p2, p3, [f.nx, 0, f.nz], uv);
  };

  const lampEvery = d.lampEvery || 7;
  let li = 0;
  for (const f of shuffled) {
    if (f.floorY > 0) continue;
    const kind = kinds2[Math.floor(rand() * kinds2.length)];
    if (kind === 'lamp' && li++ % 2 === 0 && take(f)) {
      lampBodies.faceBox(f, 0, 3.55, 0.5, 0.16, 0.24);
      lampBodies.faceBox(f, 0, 3.3, 0.06, 0.26, 0.1);
      glowQuads.faceBox(f, 0, 3.48, 0.42, 0.07, 0.2, 0.02);
      lampSpots.push(f);
    }
    if (lampSpots.length > (faces.length / lampEvery)) break;
  }
  const vents = new Batch(1), windowsDark = new Batch(1), windowsLit = new Batch(1), vines = new Batch(1), awnings = new Batch(1), furnace = new Batch(1);
  const furnaceSpots = [];
  for (const f of shuffled) {
    if (rand() > (d.wallDensity ?? 0.22) || !take(f)) continue;
    const kind = kinds2[Math.floor(rand() * kinds2.length)];
    if (kind === 'vent') {
      const s = (rand() - 0.5) * 0.6, y = 0.6 + rand() * 1.6;
      fixtures.faceBox(f, s, y, 0.8, 0.55, 0.06);
      faceQuad(vents, f, s, y + 0.06, 0.66, 0.43, 0.065);
    }
    else if (kind === 'window') {
      const lit = d.night && rand() < 0.5;
      fixtures.faceBox(f, 0, 3.1, 1.3, 0.1, 0.18);
      fixtures.faceBox(f, 0, 5.0, 1.3, 0.08, 0.1);
      faceQuad(lit ? windowsLit : windowsDark, f, 0, 3.2, 1.1, 1.8, 0.01);
    } else if (kind === 'vine') {
      // Hangs from just under the wall cap.
      const len = 2.5 + rand() * 3;
      faceQuad(vines, f, (rand() - 0.5) * 0.4, 5.9 - len, 1.6, len, 0.03, [0, 0, 1, 0, 1, 1, 0, 1]);
    }
    else if (kind === 'awning') {
      const a0 = outward(f, -0.9, 3.1, 0), a1 = outward(f, 0.9, 3.1, 0), a2 = outward(f, 0.9, 2.7, 1.1), a3 = outward(f, -0.9, 2.7, 1.1);
      awnings.quad(a0, a1, a2, a3, [f.nx * 0.4, 0.9, f.nz * 0.4], [0, 1, 1, 1, 1, 0, 0, 0]);
      awnings.quad(a1, a0, a3, a2, [-f.nx * 0.4, -0.9, -f.nz * 0.4], [1, 1, 0, 1, 0, 0, 1, 0]);
      fixtures.faceBox(f, 0, 3.05, 1.9, 0.08, 0.08);
    } else if (kind === 'furnace') {
      fixtures.faceBox(f, 0, 0.3, 1.5, 0.12, 0.2);
      fixtures.faceBox(f, -0.75, 0.3, 0.12, 1.5, 0.2);
      fixtures.faceBox(f, 0.75, 0.3, 0.12, 1.5, 0.2);
      fixtures.faceBox(f, 0, 1.7, 1.62, 0.14, 0.24);
      faceQuad(furnace, f, 0, 0.42, 1.38, 1.28, 0.02);
      furnaceSpots.push(f);
    } else if (kind === 'pipe') {
      // Pipes are laid in runs below.
    }
  }
  add(fixtures.mesh(getMaterial(d.fixture || 'trim')));
  add(vents.mesh(new THREE.MeshStandardMaterial({ map: getMaterial('grate').map, color: 0x9a9a9a, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide }), false));
  add(lampBodies.mesh(getMaterial('trim')));
  const lampColor = new THREE.Color(d.lampColor ?? 0xffd9a0);
  add(glowQuads.mesh(new THREE.MeshBasicMaterial({ color: lampColor.clone().multiplyScalar(2.2), toneMapped: false, side: THREE.DoubleSide }), false));
  add(windowsDark.mesh(new THREE.MeshStandardMaterial({ map: windowTex(false), side: THREE.DoubleSide, roughness: 0.08, metalness: 0.7, envMapIntensity: 1.4 }), false));
  add(windowsLit.mesh(new THREE.MeshStandardMaterial({ map: windowTex(true), emissive: 0xffffff, emissiveMap: windowTex(true), emissiveIntensity: 0.9, roughness: 0.3, side: THREE.DoubleSide }), false));
  add(vines.mesh(new THREE.MeshStandardMaterial({ map: tex.vine, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }), false));
  add(awnings.mesh(new THREE.MeshStandardMaterial({ map: canvasTex(128, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e8e0cc' : (d.awning || '#a8402c'); g.fillRect(i * 16, 0, 16, 64); } }), side: THREE.DoubleSide, roughness: 0.95 })));
  const furnaceMat = new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#ff5a10'); gr.addColorStop(0.6, '#ffb040'); gr.addColorStop(1, '#fff0b0');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(30,10,0,.7)'; for (let x = 8; x < 128; x += 20) g.fillRect(x, 0, 6, 128);
  }), toneMapped: false, color: 0xffffff, side: THREE.DoubleSide });
  const furnaceMesh = add(furnace.mesh(furnaceMat, false));

  // Pipe runs: long straight stretches of wall faces in the same direction.
  if (kinds2.includes('pipe')) {
    const pipes = new Batch(1), brackets = new Batch(1);
    const runs = new Map();
    for (const f of faces) {
      if (f.floorY > 0) continue;
      const key = `${f.nx},${f.nz},${f.nx ? f.x : f.y}`;
      if (!runs.has(key)) runs.set(key, []);
      runs.get(key).push(f);
    }
    const radius = 0.09, y = 4.5 + rand() * 0.6;
    for (const list of runs.values()) {
      list.sort((a, b) => (a.nx ? a.y - b.y : a.x - b.x));
      let start = 0;
      for (let i = 1; i <= list.length; i++) {
        const contiguous = i < list.length && (list[i].nx ? list[i].y - list[i - 1].y : list[i].x - list[i - 1].x) === 1;
        if (contiguous) continue;
        const run = list.slice(start, i);
        start = i;
        if (run.length < 3 || rand() > 0.55) continue;
        const a = run[0], b = run[run.length - 1];
        const along = (b.nx ? b.cz - a.cz : b.cx - a.cx) + CELL;
        const midS = 0;
        const mid = { ...a, cx: (a.cx + b.cx) / 2, cz: (a.cz + b.cz) / 2 };
        pipes.faceBox(mid, midS, y, along, radius * 2, radius * 2, 0.12);
        if (rand() < 0.5) pipes.faceBox(mid, midS, y + 0.3, along, radius * 1.4, radius * 1.4, 0.1);
        for (const f of run) brackets.faceBox(f, 0, y - 0.05, 0.08, radius * 2 + 0.1, 0.32);
      }
    }
    add(pipes.mesh(getMaterial(d.pipe || 'rust')));
    add(brackets.mesh(getMaterial('trim')));
  }

  // Signs: site arrows on bomb maps, warning plates elsewhere.
  const signFaces = shuffled.filter((f) => f.floorY === 0).slice(0, 60);
  const sites = Object.entries(world.sites);
  let signs = 0;
  for (const f of signFaces) {
    if (signs >= (d.signs ?? 6) || !take(f)) continue;
    let text = 'B-7', sub = 'AUTHORISED PERSONNEL ONLY';
    if (sites.length) {
      let best = null, bd = Infinity;
      for (const [k, s] of sites) { const dd = Math.hypot((s.x0 + s.x1) / 2 - f.cx, (s.z0 + s.z1) / 2 - f.cz); if (dd < bd) { bd = dd; best = [k, s]; } }
      const [k, s] = best;
      const dx = (s.x0 + s.x1) / 2 - f.cx, dz = (s.z0 + s.z1) / 2 - f.cz;
      // Tangent direction as seen by someone facing the wall.
      const along = dx * f.tx * (f.nz === 1 ? -1 : 1) + dz * f.tz * (f.nx === -1 ? -1 : 1);
      text = along >= 0 ? `${k}  →` : `←  ${k}`;
      sub = bd < 14 ? 'BOMB SITE' : `SITE ${k} · ${Math.round(bd)} M`;
    } else {
      [text, sub] = [['SEC 7', 'RESTRICTED AREA'], ['B-7', 'AUTHORISED PERSONNEL ONLY'], ['⚠', 'HIGH VOLTAGE'], ['EXIT', 'KEEP CLEAR']][signs % 4];
    }
    const sign = new Batch(1);
    faceQuad(sign, f, 0, 2.2, 1.2, 0.6, 0.02);
    add(sign.mesh(new THREE.MeshStandardMaterial({ map: signTex(text, sub, d.signColor || '#d9a531'), roughness: 0.7, side: THREE.DoubleSide }), false));
    signs++;
  }

  // ───── ladders ─────
  const ladder = new Batch(1);
  for (let y = 1; y < world.h - 1; y++) for (let x = 1; x < world.w - 1; x++) {
    const L = world.chars[y][x] === 'L' ? world.ladderAt((x + 0.5) * CELL, (y + 0.5) * CELL) : null;
    if (!L) continue;
    // Against the platform's face, on the ladder cell's side.
    const f = { cx: (x + 0.5) * CELL + L.dx, cz: (y + 0.5) * CELL + L.dz, nx: -L.dx, nz: -L.dz, tx: Math.abs(L.dz), tz: Math.abs(L.dx) };
    // Rails stop a hand's height above the deck; rungs stay below its edge trim.
    for (const sx of [-0.32, 0.32]) ladder.faceBox(f, sx, 0.005, 0.07, L.top + 0.3, 0.07, 0.06);
    for (let ry = 0.3; ry + 0.045 < L.top - 0.15; ry += 0.32) ladder.faceBox(f, 0, ry, 0.64, 0.045, 0.045, 0.07);
  }
  add(ladder.mesh(new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.4, metalness: 0.85 })));

  // ───── lights ─────
  const lights = [];
  const budget = d.lights ?? 4;
  const spots = [...lampSpots.map((f) => ({ f, kind: 'lamp' })), ...furnaceSpots.map((f) => ({ f, kind: 'furnace' }))];
  // Spread the real lights out: farthest-point sampling over fixture positions.
  const chosen = [];
  while (chosen.length < Math.min(budget, spots.length)) {
    let best = null, bd = -1;
    for (const s of spots) {
      if (chosen.includes(s)) continue;
      const dmin = chosen.length ? Math.min(...chosen.map((c) => Math.hypot(c.f.cx - s.f.cx, c.f.cz - s.f.cz))) : rand();
      if (dmin > bd) { bd = dmin; best = s; }
    }
    chosen.push(best);
  }
  for (const s of chosen) {
    const furnaceLight = s.kind === 'furnace';
    const l = new THREE.PointLight(furnaceLight ? 0xff7a30 : lampColor, (furnaceLight ? 26 : d.lampIntensity ?? 14), furnaceLight ? 14 : 16, 2);
    l.position.set(...outward(s.f, 0, furnaceLight ? 1.0 : 3.2, furnaceLight ? 1.2 : 0.6));
    group.add(l);
    lights.push({ l, base: l.intensity, flicker: furnaceLight || d.flicker, ph: rand() * 10 });
  }

  // ───── beyond the walls ─────
  const water = scenery(world, group, d, rand);

  // ───── ambient particles ─────
  const particles = d.particles ? makeParticles(world, d.particles, tex.soft) : null;
  if (particles) group.add(particles.points);

  let t = 0;
  return {
    update(dt) {
      t += dt;
      for (const L of lights) if (L.flicker) L.l.intensity = L.base * (0.8 + Math.sin(t * 13 + L.ph) * 0.1 + Math.sin(t * 31 + L.ph * 2) * 0.1);
      if (furnaceMesh) furnaceMat.color.setScalar(0.85 + Math.sin(t * 3) * 0.15);
      particles?.update(dt);
      if (water) { water.offset.x += dt * 0.012; water.offset.y += dt * 0.006; }
      for (const f of dyn) f(dt, t);
    },
  };
}

// ───────────────────────── scenery ─────────────────────────
function scenery(world, group, d, rand) {
  const W = world.size.x, D = world.size.z, cx = W / 2, cz = D / 2;
  const kind = d.skyline;
  // Outer ground so the world doesn't end at a cliff edge.
  const waterMat = d.water ? waterMaterial() : null;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), d.water
    ? waterMat
    : new THREE.MeshStandardMaterial({ color: d.groundColor ?? 0x6d655a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, d.water ? -0.9 : -0.05, cz);
  ground.receiveShadow = !d.water;
  group.add(ground);
  if (d.water) {
    // Quay edge around the playable area.
    const quay = new THREE.Mesh(new THREE.BoxGeometry(W + 44, 1, D + 44), getMaterial('concrete'));
    quay.position.set(cx, -0.52, cz);
    quay.receiveShadow = true;
    group.add(quay);
  }
  const ring = (minR, maxR, n, fn) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.2;
      // Distance measured from the map's rectangle, not its centre.
      const r = minR + rand() * (maxR - minR);
      const ex = Math.cos(a), ez = Math.sin(a);
      const k = Math.min(Math.abs((W / 2 + r) / (ex || 1e-6)), Math.abs((D / 2 + r) / (ez || 1e-6)));
      fn(cx + ex * k, cz + ez * k, a, i);
    }
  };
  if (kind === 'city' || kind === 'harbor' || kind === 'desert') {
    const night = !!d.night;
    const mats = [0, 1, 2].map((i) => new THREE.MeshStandardMaterial({
      map: facadeTex(10 + i, night, ['#6a5d50', '#7d7466', '#585f69'][i]), emissive: night ? 0xffffff : 0x000000,
      emissiveMap: night ? facadeTex(10 + i, true, '#000000') : null, emissiveIntensity: night ? 0.6 : 0, roughness: 0.9,
    }));
    if (kind === 'desert') mats.forEach((m) => { m.map = facadeTex(20, false, '#c9a77a'); m.emissive.set(0); m.emissiveIntensity = 0; });
    ring(4, 26, kind === 'desert' ? 38 : 46, (x, z, a) => {
      const w = 6 + rand() * 10, h = (kind === 'desert' ? 6 : 9) + rand() * (kind === 'desert' ? 8 : 26), dd = 6 + rand() * 10;
      const geo = new THREE.BoxGeometry(w, h, dd);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 8, uv.getY(i) * h / 16);
      const b = new THREE.Mesh(geo, mats[Math.floor(rand() * 3)]);
      b.position.set(x, h / 2, z); b.rotation.y = -a;
      group.add(b);
      if (kind !== 'desert' && rand() < 0.5) { // rooftop clutter
        const r = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 2), getMaterial('trim'));
        r.position.set(x, h + 0.7, z); group.add(r);
      }
    });
  }
  if (kind === 'harbor') {
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xc9572b, roughness: 0.6, metalness: 0.4 });
    ring(30, 60, 5, (x, z, a) => {
      const crane = new THREE.Group();
      for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 26, 0.6), craneMat); leg.position.set(ox, 13, oz); crane.add(leg); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 8), craneMat); top.position.y = 27; crane.add(top);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 46), craneMat); boom.position.set(0, 29, -14); crane.add(boom);
      crane.position.set(x, 0, z); crane.rotation.y = -a + Math.PI / 2;
      group.add(crane);
    });
    const hull = new THREE.MeshStandardMaterial({ color: 0x23303a, roughness: 0.7 });
    ring(50, 90, 4, (x, z, a) => {
      const ship = new THREE.Group();
      const h = new THREE.Mesh(new THREE.BoxGeometry(60, 9, 14), hull); h.position.y = 2; ship.add(h);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 12), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.8 })); deck.position.set(22, 10, 0); ship.add(deck);
      for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 12), getMaterial('container', ['#a8432f', '#2f6aa8', '#3d7a45', '#c27a2c'][i % 4])); c.position.set(-20 + i * 6.5, 7.8, 0); ship.add(c); }
      ship.position.set(x, -1, z); ship.rotation.y = -a + Math.PI / 2;
      group.add(ship);
    });
  }
  if (kind === 'industrial') {
    const stack = new THREE.MeshStandardMaterial({ color: 0x6b625a, roughness: 0.9 });
    const band = new THREE.MeshStandardMaterial({ color: 0xb03a2a, roughness: 0.7 });
    ring(10, 40, 10, (x, z) => {
      const h = 22 + rand() * 24, r = 1.4 + rand() * 1.4;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 16), stack); c.position.set(x, h / 2, z); group.add(c);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 1.5, 16), band); b.position.set(x, h - 3, z); group.add(b);
    });
    ring(6, 30, 18, (x, z, a) => {
      const w = 10 + rand() * 14, h = 8 + rand() * 10, dd = 10 + rand() * 12;
      const geo = new THREE.BoxGeometry(w, h, dd);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 3, uv.getY(i) * h / 3);
      const b = new THREE.Mesh(geo, getMaterial(rand() < 0.5 ? 'panel' : 'concrete'));
      b.position.set(x, h / 2, z); b.rotation.y = -a;
      group.add(b);
    });
    ring(8, 26, 6, (x, z) => {
      const r = 3 + rand() * 3, h = 6 + rand() * 6;
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), getMaterial('rust'));
      tank.position.set(x, h / 2, z); group.add(tank);
    });
  }
  if (kind === 'mountains' || kind === 'desert') {
    const snow = kind === 'mountains';
    ring(130, 260, 16, (x, z) => {
      const r = 34 + rand() * 46, h = snow ? 34 + rand() * 46 : 14 + rand() * 22;
      const geo = snow ? new THREE.ConeGeometry(r, h, 14, 6) : new THREE.CylinderGeometry(r * 0.75, r, h, 12, 3);
      const p = geo.attributes.position, col = [];
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setX(i, p.getX(i) * (0.85 + rand() * 0.3)); p.setZ(i, p.getZ(i) * (0.85 + rand() * 0.3));
        const k = (y + h / 2) / h;
        const c = snow ? (k > 0.55 ? [0.92, 0.95, 1] : [0.36, 0.38, 0.42]) : [0.72 - k * 0.1, 0.52 - k * 0.08, 0.36];
        col.push(...c);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
      m.position.set(x, h / 2 - 1, z);
      group.add(m);
    });
  }
  if (kind === 'mountains' || kind === 'jungle') {
    // Trees just outside the walls (pines on snow maps, broadleaf in the jungle).
    const pine = kind === 'mountains';
    const n = pine ? 60 : 110;
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 1, 6);
    const crownGeo = pine ? new THREE.ConeGeometry(1, 1, 8) : new THREE.IcosahedronGeometry(1, 1);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }), n);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: pine ? 0x2c4a36 : 0x3d6a2c, roughness: 0.9, flatShading: true }), n * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    let ci = 0;
    ring(3, pine ? 40 : 28, n, (x, z, a, i) => {
      const h = pine ? 8 + rand() * 9 : 9 + rand() * 12;
      m.compose(pos.set(x, h * 0.3, z), q.identity(), s.set(1, h * 0.6, 1)); trunks.setMatrixAt(i, m);
      for (let k = 0; k < 2; k++) {
        const r = pine ? 2.4 - k * 0.9 + rand() * 0.5 : 3 + rand() * 2.5;
        const y = pine ? h * (0.45 + k * 0.28) : h * 0.7 + k * 1.6;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6);
        m.compose(pos.set(x + (pine ? 0 : (rand() - 0.5) * 2), y, z + (pine ? 0 : (rand() - 0.5) * 2)), q, s.set(r, pine ? h * 0.45 : r * 0.8, r));
        crowns.setMatrixAt(ci++, m);
        const c = new THREE.Color(pine ? 0x2c4a36 : 0x3d6a2c).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.08);
        crowns.setColorAt(ci - 1, c);
      }
    });
    crowns.count = ci;
    group.add(trunks, crowns);
  }
  return waterMat?.normalMap || null;
}

function waterMaterial() {
  const normal = canvasTex(256, 256, (g) => {
    const img = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const a = Math.sin((x / 256) * Math.PI * 8 + Math.sin((y / 256) * Math.PI * 4) * 1.5), b = Math.cos((y / 256) * Math.PI * 6 + Math.sin((x / 256) * Math.PI * 2) * 2);
      const i = (y * 256 + x) * 4;
      img.data[i] = 128 + a * 40; img.data[i + 1] = 128 + b * 40; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(120, 120);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1b3440, roughness: 0.06, metalness: 0.7, normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3 });
  return mat;
}

// Rain: short streaks that fall fast and slant slightly in the wind.
function makeRain(world) {
  const N = 9000, W = world.size.x, D = world.size.z, H = 18, LEN = 0.9, WIND = 1.6;
  const pos = new Float32Array(N * 6), speed = new Float32Array(N);
  const r = seeded(13);
  for (let i = 0; i < N; i++) {
    const x = r() * W, y = r() * H, z = r() * D;
    pos.set([x, y, z, x - WIND * 0.03, y + LEN, z], i * 6);
    speed[i] = 16 + r() * 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc8d4e2, transparent: true, opacity: 0.5, depthWrite: false }));
  lines.frustumCulled = false;
  return {
    points: lines,
    update(dt) {
      for (let i = 0; i < N; i++) {
        const k = i * 6, dy = speed[i] * dt;
        let y = pos[k + 1] - dy, x = pos[k] + WIND * dt;
        if (y < 0) { y += H; x = Math.random() * W; pos[k + 2] = pos[k + 5] = Math.random() * D; }
        if (x > W) x -= W;
        pos[k] = x; pos[k + 1] = y; pos[k + 3] = x - WIND * 0.03; pos[k + 4] = y + LEN;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

function makeParticles(world, kind, soft) {
  if (kind === 'rain') return makeRain(world);
  const blizzard = kind === 'blizzard';
  if (blizzard) kind = 'snow';
  const N = { snow: blizzard ? 5000 : 2200, dust: 700, embers: 500, fireflies: 260 }[kind] || 500;
  const W = world.size.x, D = world.size.z, H = kind === 'snow' ? 16 : 7;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), ph = new Float32Array(N);
  const r = seeded(7);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = r() * W; pos[i * 3 + 1] = r() * H; pos[i * 3 + 2] = r() * D; ph[i] = r() * 10;
    if (kind === 'snow') { vel[i * 3 + 1] = -(0.8 + r() * 0.8) * (blizzard ? 2.2 : 1); if (blizzard) vel[i * 3] = 3 + r() * 2; }
    else if (kind === 'embers') { vel[i * 3 + 1] = 0.6 + r() * 1.2; }
    else { vel[i * 3] = (r() - 0.5) * 0.2; vel[i * 3 + 1] = (r() - 0.5) * 0.05; vel[i * 3 + 2] = (r() - 0.5) * 0.2; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const look = {
    snow: { color: 0xffffff, size: 0.09, opacity: 0.9, add: false },
    dust: { color: 0xffe6c0, size: 0.05, opacity: 0.35, add: true },
    embers: { color: 0xff8a30, size: 0.07, opacity: 0.9, add: true },
    fireflies: { color: 0xd8ff7a, size: 0.12, opacity: 0.9, add: true },
  }[kind];
  const mat = new THREE.PointsMaterial({ color: look.color, size: look.size, map: soft, transparent: true, opacity: look.opacity, depthWrite: false, blending: look.add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !look.add });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let t = 0;
  return {
    points,
    update(dt) {
      t += dt;
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        let x = pos[k] + vel[k] * dt, y = pos[k + 1] + vel[k + 1] * dt, z = pos[k + 2] + vel[k + 2] * dt;
        if (kind === 'snow') { x += Math.sin(t * 0.8 + ph[i]) * 0.25 * dt; z += Math.cos(t * 0.6 + ph[i]) * 0.25 * dt; }
        if (kind === 'fireflies') { x += Math.sin(t * 0.5 + ph[i]) * 0.3 * dt; y += Math.cos(t * 0.7 + ph[i]) * 0.15 * dt; }
        if (y < 0) y += H; if (y > H) y -= H;
        if (x < 0) x += W; if (x > W) x -= W;
        if (z < 0) z += D; if (z > D) z -= D;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      }
      geo.attributes.position.needsUpdate = true;
      if (kind === 'fireflies') mat.opacity = 0.6 + Math.sin(t * 2) * 0.3;
    },
  };
}
