import * as THREE from 'three';

// Procedural, tileable PBR-ish textures generated on canvases at startup.
const SIZE = 512;
const cache = new Map();
let maxAniso = 8;
export function setAnisotropy(n) { maxAniso = n; }

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

function lattice(seed) {
  const r = rng(seed), a = new Float32Array(256 * 256);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
}

function vnoise(L, x, y, p) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const a = L[y0 * 256 + x0], b = L[y0 * 256 + x1], c = L[y1 * 256 + x0], d = L[y1 * 256 + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(L, u, v, freq, oct = 4) {
  let sum = 0, amp = 0.5, f = freq, norm = 0;
  for (let o = 0; o < oct; o++) { sum += vnoise(L, u * f, v * f, f) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}

function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const clamp = (v, a = 0, b = 255) => (v < a ? a : v > b ? b : v);

// Each generator returns {color:[r,g,b], h: 0..1 height} for uv in [0,1).
const GEN = {
  concrete(L) {
    const base = hex('#8f8e89');
    return (u, v) => {
      const n = fbm(L, u, v, 8, 5), s = fbm(L, u + 0.3, v + 0.7, 32, 2);
      const seam = (Math.min(u % 0.5, 0.5 - (u % 0.5)) < 0.004 || Math.min(v % 0.5, 0.5 - (v % 0.5)) < 0.004) ? 1 : 0;
      const pit = s > 0.78 ? 0.25 : 0;
      const k = 0.78 + n * 0.38 - seam * 0.35 - pit * 0.4;
      return { color: base.map((c) => c * k), h: 0.6 + n * 0.3 - seam * 0.5 - pit };
    };
  },
  sandstone(L) {
    const base = hex('#c8a374');
    return (u, v) => {
      const row = Math.floor(v * 6), off = (row % 2) * 0.25;
      const bu = (u + off) % 0.5, bv = (v * 6) % 1;
      const mortar = bu < 0.008 || bu > 0.492 || bv < 0.035 || bv > 0.965;
      const n = fbm(L, u, v, 6, 5), d = fbm(L, u * 3, v, 16, 3);
      const tone = 0.82 + n * 0.32 + (vnoise(L, row * 3.7, Math.floor((u + off) * 2) * 1.3, 256) - 0.5) * 0.12;
      if (mortar) return { color: base.map((c) => c * 0.72), h: 0.15 };
      return { color: [base[0] * tone, base[1] * tone * 0.98, base[2] * tone * 0.95], h: 0.65 + d * 0.3 };
    };
  },
  plaster(L) {
    const base = hex('#d8ccb4');
    return (u, v) => {
      const n = fbm(L, u, v, 4, 6), d = fbm(L, u, v, 24, 3);
      const stain = Math.max(0, fbm(L, u + 0.5, v * 0.5, 3, 3) - 0.55) * 1.4 + Math.max(0, 0.25 - v) * 0.4 * n;
      const k = 0.88 + n * 0.18 - stain * 0.35;
      return { color: [base[0] * k, base[1] * k, base[2] * (k - stain * 0.08)], h: 0.5 + d * 0.25 };
    };
  },
  brick(L) {
    const mortar = hex('#b3a896');
    return (u, v) => {
      const rows = 16, row = Math.floor(v * rows), off = (row % 2) * 0.0625;
      const bu = ((u + off) * 8) % 1, bv = (v * rows) % 1;
      const isM = bu < 0.05 || bu > 0.95 || bv < 0.09 || bv > 0.91;
      const n = fbm(L, u, v, 16, 4);
      if (isM) return { color: mortar.map((c) => c * (0.8 + n * 0.25)), h: 0.2 };
      const id = vnoise(L, Math.floor((u + off) * 8) * 1.7, row * 2.3, 256);
      const r = 130 + id * 50, g = 62 + id * 22, b = 44 + id * 14, k = 0.8 + n * 0.35;
      return { color: [r * k, g * k, b * k], h: 0.75 + n * 0.2 };
    };
  },
  stone(L) {
    return (u, v) => {
      const row = Math.floor(v * 4), off = (row % 2) * 0.17;
      const bu = ((u + off) * 3) % 1, bv = (v * 4) % 1;
      const m = bu < 0.025 || bu > 0.975 || bv < 0.035 || bv > 0.965;
      const n = fbm(L, u, v, 8, 5);
      const id = vnoise(L, Math.floor((u + off) * 3) * 2.1, row * 1.9, 256);
      const k = 0.75 + n * 0.3 + id * 0.12;
      if (m) return { color: [92, 88, 82], h: 0.1 };
      return { color: [158 * k, 150 * k, 136 * k], h: 0.6 + n * 0.35 };
    };
  },
  metal(L) {
    return (u, v) => {
      const pu = (u * 2) % 1, pv = (v * 2) % 1;
      const seam = pu < 0.01 || pu > 0.99 || pv < 0.01 || pv > 0.99;
      const rx = Math.min(pu, 1 - pu), ry = Math.min(pv, 1 - pv);
      const rivet = rx < 0.06 && rx > 0.025 && ((pv * 8) % 1 < 0.18) ? 1 : (ry < 0.06 && ry > 0.025 && ((pu * 8) % 1 < 0.18) ? 1 : 0);
      const brushed = vnoise(L, u * 4, v * 160, 256) * 0.12;
      const n = fbm(L, u, v, 6, 4);
      const k = 0.62 + n * 0.25 + brushed + rivet * 0.15 - seam * 0.3;
      return { color: [118 * k, 124 * k, 128 * k], h: 0.5 + rivet * 0.4 - seam * 0.4 };
    };
  },
  tile(L) {
    return (u, v) => {
      const tu = (u * 4) % 1, tv = (v * 4) % 1;
      const grout = tu < 0.03 || tu > 0.97 || tv < 0.03 || tv > 0.97;
      const n = fbm(L, u, v, 16, 4);
      const id = vnoise(L, Math.floor(u * 4) * 3.1, Math.floor(v * 4) * 2.7, 256);
      if (grout) return { color: [70, 70, 68], h: 0.1 };
      const k = 0.82 + id * 0.12 + n * 0.12;
      return { color: [168 * k, 166 * k, 160 * k], h: 0.7 + n * 0.08 };
    };
  },
  sand(L) {
    const base = hex('#cdab7b');
    return (u, v) => {
      const n = fbm(L, u, v, 6, 6), g = vnoise(L, u * 256, v * 256, 256);
      const ripple = Math.sin((u * 18 + fbm(L, u, v, 3, 2) * 6) * Math.PI * 2) * 0.03;
      const k = 0.85 + n * 0.25 + g * 0.06 + ripple;
      return { color: base.map((c) => c * k), h: n * 0.6 + g * 0.2 + ripple * 3 };
    };
  },
  cobble(L) {
    const pts = [], r = rng(77), N = 10;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([(i + 0.2 + r() * 0.6) / N, (j + 0.2 + r() * 0.6) / N, r()]);
    return (u, v) => {
      const ci = Math.floor(u * N), cj = Math.floor(v * N);
      let d1 = 9, d2 = 9, id = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + N) % N, jj = (cj + dj + N) % N, p = pts[jj * N + ii];
        const px = p[0] + (ci + di < 0 ? -1 : ci + di >= N ? 1 : 0);
        const py = p[1] + (cj + dj < 0 ? -1 : cj + dj >= N ? 1 : 0);
        const d = Math.hypot(u - px, v - py);
        if (d < d1) { d2 = d1; d1 = d; id = p[2]; } else if (d < d2) d2 = d;
      }
      const edge = (d2 - d1) * N;
      const n = fbm(L, u, v, 16, 3);
      if (edge < 0.08) return { color: [70, 66, 60], h: 0.05 };
      const k = 0.7 + id * 0.3 + n * 0.15;
      return { color: [150 * k, 140 * k, 125 * k], h: Math.min(1, edge * 2.2) * 0.8 + n * 0.1 };
    };
  },
  asphalt(L) {
    return (u, v) => {
      const n = fbm(L, u, v, 8, 5), g = vnoise(L, u * 256, v * 256, 256);
      const crack = Math.abs(fbm(L, u, v, 5, 3) - 0.5) < 0.008 ? 1 : 0;
      const k = 0.5 + n * 0.25 + (g > 0.85 ? 0.25 : 0) - crack * 0.25;
      return { color: [92 * k, 94 * k, 98 * k], h: 0.5 + g * 0.3 - crack * 0.5 };
    };
  },
  wood(L) {
    return (u, v) => {
      const frame = u < 0.09 || u > 0.91 || v < 0.09 || v > 0.91;
      const diag = Math.abs(u - v) < 0.06 || Math.abs(u + v - 1) < 0.06;
      const plank = Math.floor(v * 5), pv = (v * 5) % 1;
      const grain = vnoise(L, u * 3 + plank * 7, v * 60, 256) * 0.2 + fbm(L, u, v, 12, 3) * 0.2;
      const gap = !frame && !diag && (pv < 0.04 || pv > 0.96);
      let k = 0.75 + grain;
      if (frame || diag) k *= 0.82;
      if (gap) return { color: [50, 36, 22], h: 0.05 };
      return { color: [160 * k, 116 * k, 70 * k], h: (frame || diag ? 0.85 : 0.6) + grain * 0.3 };
    };
  },
  container(L) {
    return (u, v) => {
      const ridge = Math.sin(u * Math.PI * 2 * 14);
      const rust = Math.max(0, fbm(L, u, v, 6, 5) - 0.58) * 2.2;
      const n = fbm(L, u, v, 20, 3);
      const k = 0.82 + ridge * 0.06 + n * 0.12;
      return { color: [235 * k - rust * 80, 235 * k - rust * 140, 235 * k - rust * 170], h: 0.5 + ridge * 0.35 };
    };
  },
};

const SETTINGS = {
  concrete: { rough: 0.92, normal: 1.2, tile: 4 },
  sandstone: { rough: 0.95, normal: 1.6, tile: 4 },
  plaster: { rough: 0.9, normal: 0.8, tile: 4 },
  brick: { rough: 0.9, normal: 1.8, tile: 4 },
  stone: { rough: 0.9, normal: 1.6, tile: 4 },
  metal: { rough: 0.5, metal: 0.6, normal: 1.0, tile: 3 },
  tile: { rough: 0.45, normal: 1.0, tile: 4 },
  sand: { rough: 1.0, normal: 1.0, tile: 6 },
  cobble: { rough: 0.85, normal: 2.2, tile: 4 },
  asphalt: { rough: 0.95, normal: 0.9, tile: 6 },
  wood: { rough: 0.85, normal: 1.4, tile: 2 },
  container: { rough: 0.6, metal: 0.3, normal: 1.5, tile: 3 },
};

function generate(name) {
  const L = lattice(name.length * 7919 + name.charCodeAt(0) * 31);
  const fn = GEN[name](L);
  const col = document.createElement('canvas'); col.width = col.height = SIZE;
  const nrm = document.createElement('canvas'); nrm.width = nrm.height = SIZE;
  const cctx = col.getContext('2d'), nctx = nrm.getContext('2d');
  const cimg = cctx.createImageData(SIZE, SIZE), nimg = nctx.createImageData(SIZE, SIZE);
  const H = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const s = fn(x / SIZE, y / SIZE), i = (y * SIZE + x) * 4;
      cimg.data[i] = clamp(s.color[0]); cimg.data[i + 1] = clamp(s.color[1]); cimg.data[i + 2] = clamp(s.color[2]); cimg.data[i + 3] = 255;
      H[y * SIZE + x] = s.h;
    }
  }
  const strength = (SETTINGS[name].normal || 1) * 3;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const hl = H[y * SIZE + ((x - 1 + SIZE) % SIZE)], hr = H[y * SIZE + ((x + 1) % SIZE)];
      const hu = H[((y - 1 + SIZE) % SIZE) * SIZE + x], hd = H[((y + 1) % SIZE) * SIZE + x];
      let nx = (hl - hr) * strength, ny = (hu - hd) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * SIZE + x) * 4;
      nimg.data[i] = (nx * 0.5 + 0.5) * 255; nimg.data[i + 1] = (ny * 0.5 + 0.5) * 255; nimg.data[i + 2] = (nz * 0.5 + 0.5) * 255; nimg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0); nctx.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(nrm);
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; }
  return { map, normalMap, canvas: col };
}

// Returns a material whose UVs are expected in world metres divided by `tileSize(name)`.
export function getMaterial(name, tint) {
  const key = name + (tint || '');
  if (cache.has(key)) return cache.get(key);
  const base = cache.get('__tex_' + name) || generate(name);
  cache.set('__tex_' + name, base);
  const s = SETTINGS[name];
  const mat = new THREE.MeshStandardMaterial({
    map: base.map, normalMap: base.normalMap, roughness: s.rough, metalness: s.metal || 0,
    color: tint ? new THREE.Color(tint) : 0xffffff,
  });
  cache.set(key, mat);
  return mat;
}

export function tileSize(name) { return SETTINGS[name]?.tile || 4; }
export function textureCanvas(name) { getMaterial(name); return cache.get('__tex_' + name).canvas; }
