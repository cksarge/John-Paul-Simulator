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
  snow(L) {
    return (u, v) => {
      const n = fbm(L, u, v, 6, 6), g = vnoise(L, u * 256, v * 256, 256);
      const drift = fbm(L, u * 0.5 + 0.3, v, 3, 3);
      const sparkle = g > 0.93 ? 0.12 : 0;
      const k = 0.86 + n * 0.12 + sparkle - drift * 0.06;
      return { color: [222 * k, 230 * k, 240 * k], h: n * 0.5 + drift * 0.4 };
    };
  },
  grass(L) {
    return (u, v) => {
      const n = fbm(L, u, v, 8, 5), blade = vnoise(L, u * 180, v * 60, 256), dirt = fbm(L, u + 0.4, v + 0.2, 4, 4);
      const bare = dirt > 0.66 ? (dirt - 0.66) * 3 : 0;
      const k = 0.7 + n * 0.3 + blade * 0.18;
      const r = (58 + bare * 60) * k, g = (92 - bare * 20) * k, b = (40 + bare * 10) * k;
      return { color: [r, g, b], h: blade * 0.6 + n * 0.3 };
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
  // Painted steel wall panels with seams, bolts and worn edges.
  panel(L) {
    const base = hex('#5d6a72');
    return (u, v) => {
      const pu = (u * 2) % 1, pv = (v * 3) % 1;
      const seam = pu < 0.008 || pu > 0.992 || pv < 0.01 || pv > 0.99;
      const edge = Math.min(pu, 1 - pu, pv * 1.5, (1 - pv) * 1.5);
      const bolt = (Math.hypot(pu - 0.04, pv - 0.06) < 0.012 || Math.hypot(pu - 0.96, pv - 0.06) < 0.012 || Math.hypot(pu - 0.04, pv - 0.94) < 0.012 || Math.hypot(pu - 0.96, pv - 0.94) < 0.012);
      const n = fbm(L, u, v, 6, 5), wear = fbm(L, u + 0.2, v, 18, 3);
      const chip = wear > 0.68 && edge < 0.08 ? 1 : 0;
      const grime = Math.max(0, 0.35 - v) * fbm(L, u, v, 4, 3) * 1.2;
      if (seam) return { color: [30, 33, 36], h: 0.1, r: 0.9 };
      let k = 0.85 + n * 0.22 - grime;
      const c = chip ? [120 * k, 118 * k, 112 * k] : base.map((x) => x * k);
      return { color: bolt ? [150, 150, 145] : c, h: bolt ? 0.95 : 0.6 - chip * 0.15 + n * 0.1, r: chip ? 0.45 : 0.62 + n * 0.2 };
    };
  },
  plank(L) {
    return (u, v) => {
      const rows = 6, row = Math.floor(v * rows), pv = (v * rows) % 1;
      const off = vnoise(L, row * 5.3, 1.7, 256) * 0.7;
      const pu = (u + off) % 1, board = Math.floor(((u + off) % 1) * 2);
      const gap = pv < 0.03 || pv > 0.97 || Math.abs(pu - 0.5) < 0.004 || pu < 0.004;
      const id = vnoise(L, row * 2.1 + board * 9.7, 3.3, 256);
      const grain = vnoise(L, u * 40 + row * 13, v * rows * 2, 256) * 0.18 + fbm(L, u * 2, v, 10, 3) * 0.2;
      const k = 0.62 + id * 0.3 + grain;
      if (gap) return { color: [38, 28, 20], h: 0.05, r: 1 };
      return { color: [150 * k, 104 * k, 64 * k], h: 0.6 + grain * 0.5, r: 0.6 + grain };
    };
  },
  grate(L) {
    return (u, v) => {
      const gu = (u * 16) % 1, gv = (v * 16) % 1;
      const bar = gu < 0.22 || gv < 0.22;
      const frame = Math.min(u, 1 - u, v, 1 - v) < 0.02;
      const n = fbm(L, u, v, 8, 4), rust = Math.max(0, fbm(L, u + 0.6, v, 5, 4) - 0.6) * 2;
      if (!bar && !frame) return { color: [18, 18, 18], h: 0, r: 1 };
      const k = 0.55 + n * 0.3;
      return { color: [110 * k + rust * 60, 112 * k + rust * 20, 116 * k], h: frame ? 1 : 0.8, r: 0.45 + rust * 0.4 };
    };
  },
  dirt(L) {
    return (u, v) => {
      const n = fbm(L, u, v, 6, 6), g = vnoise(L, u * 200, v * 200, 256), pebble = fbm(L, u, v, 40, 2);
      const wet = Math.max(0, fbm(L, u + 0.3, v + 0.7, 3, 3) - 0.6) * 2;
      const k = 0.7 + n * 0.35 + g * 0.08 - wet * 0.25;
      const pb = pebble > 0.7 ? 0.25 : 0;
      return { color: [112 * k + pb * 60, 88 * k + pb * 55, 62 * k + pb * 50], h: n * 0.6 + pb, r: 0.95 - wet * 0.5 };
    };
  },
  gravel(L) {
    const pts = [], r = rng(31), N = 22;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([(i + r()) / N, (j + r()) / N, r()]);
    return (u, v) => {
      const ci = Math.floor(u * N), cj = Math.floor(v * N);
      let d1 = 9, id = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + N) % N, jj = (cj + dj + N) % N, p = pts[jj * N + ii];
        const px = p[0] + (ci + di < 0 ? -1 : ci + di >= N ? 1 : 0), py = p[1] + (cj + dj < 0 ? -1 : cj + dj >= N ? 1 : 0);
        const d = Math.hypot(u - px, v - py);
        if (d < d1) { d1 = d; id = p[2]; }
      }
      const stone = 1 - Math.min(1, d1 * N * 1.25);
      const k = 0.45 + id * 0.4 + stone * 0.2;
      return { color: [128 * k, 124 * k, 116 * k], h: stone, r: 0.85 };
    };
  },
  marble(L) {
    return (u, v) => {
      const tu = (u * 2) % 1, tv = (v * 2) % 1;
      const grout = tu < 0.006 || tu > 0.994 || tv < 0.006 || tv > 0.994;
      const vein = Math.abs(Math.sin((u * 3 + fbm(L, u, v, 3, 5) * 4) * Math.PI));
      const id = vnoise(L, Math.floor(u * 2) * 4.1, Math.floor(v * 2) * 3.3, 256);
      if (grout) return { color: [90, 88, 84], h: 0.2, r: 0.8 };
      const k = 0.86 + id * 0.1 - Math.pow(1 - vein, 8) * 0.35;
      return { color: [226 * k, 220 * k, 210 * k], h: 0.8, r: 0.18 };
    };
  },
  ice(L) {
    return (u, v) => {
      const n = fbm(L, u, v, 5, 5), crack = Math.abs(fbm(L, u, v, 7, 3) - 0.5) < 0.006 ? 1 : 0;
      const frost = fbm(L, u + 0.5, v, 20, 2);
      const k = 0.8 + n * 0.2 + frost * 0.1;
      return { color: [170 * k + crack * 50, 200 * k + crack * 40, 225 * k + crack * 30], h: 0.6 - crack * 0.4 + frost * 0.1, r: 0.12 + frost * 0.3 };
    };
  },
  moss(L) {
    const stone = GEN.stone(L);
    return (u, v) => {
      const s0 = stone(u, v);
      const m = fbm(L, u + 0.13, v * 1.3, 5, 5) + Math.max(0, 0.4 - v) * 0.5;
      if (m < 0.58) return s0;
      const k = 0.6 + fbm(L, u, v, 30, 2) * 0.4, a = Math.min(1, (m - 0.58) * 6);
      return { color: [s0.color[0] * (1 - a) + 62 * k * a, s0.color[1] * (1 - a) + 92 * k * a, s0.color[2] * (1 - a) + 38 * k * a], h: s0.h + a * 0.15, r: 0.95 };
    };
  },
  rust(L) {
    return (u, v) => {
      const n = fbm(L, u, v, 6, 6), r2 = fbm(L, u + 0.4, v + 0.1, 12, 4);
      const rust = Math.max(0, n - 0.42) * 2.4;
      const streak = Math.max(0, vnoise(L, u * 40, v * 2, 256) - 0.6) * v;
      const k = 0.55 + r2 * 0.3;
      const c = [96 * k, 98 * k, 100 * k];
      const rr = Math.min(1, rust + streak);
      return { color: [c[0] * (1 - rr) + 128 * rr * k * 1.3, c[1] * (1 - rr) + 64 * rr * k * 1.2, c[2] * (1 - rr) + 34 * rr * k], h: 0.5 + rr * 0.3 * r2, r: 0.5 + rr * 0.45 };
    };
  },
  corrugated(L) {
    const base = hex('#7f8a86');
    return (u, v) => {
      const wave = Math.sin(u * Math.PI * 2 * 12);
      const sheet = (v * 2) % 1 < 0.01;
      const rust = Math.max(0, fbm(L, u, v, 5, 5) - 0.6) * 2.2 + Math.max(0, 0.2 - (v % 0.5)) * fbm(L, u * 4, v, 8, 2);
      const k = 0.78 + wave * 0.1 + fbm(L, u, v, 16, 3) * 0.12;
      if (sheet) return { color: [40, 40, 40], h: 0.2, r: 0.8 };
      return { color: [base[0] * k + rust * 60, base[1] * k - rust * 20, base[2] * k - rust * 40], h: 0.5 + wave * 0.45, r: 0.45 + rust * 0.4 };
    };
  },
  hazard(L) {
    return (u, v) => {
      const stripe = Math.floor((u + v) * 8) % 2 === 0;
      const n = fbm(L, u, v, 12, 4), wear = fbm(L, u, v, 30, 2) > 0.7;
      const k = 0.75 + n * 0.3;
      const c = wear ? [90 * k, 90 * k, 88 * k] : stripe ? [222 * k, 176 * k, 36 * k] : [32 * k, 32 * k, 32 * k];
      return { color: c, h: wear ? 0.4 : 0.6, r: wear ? 0.9 : 0.55 };
    };
  },
  trim(L) {
    return (u, v) => {
      const n = fbm(L, u, v, 10, 4), line = (v * 4) % 1 < 0.04;
      const k = 0.7 + n * 0.25 - (line ? 0.25 : 0);
      return { color: [62 * k, 64 * k, 66 * k], h: line ? 0.2 : 0.6, r: 0.5 + n * 0.3 };
    };
  },
  crate_mil(L) {
    return (u, v) => {
      const frame = u < 0.07 || u > 0.93 || v < 0.07 || v > 0.93;
      const mid = Math.abs(v - 0.5) < 0.035;
      const stencil = u > 0.28 && u < 0.72 && v > 0.62 && v < 0.82 && (Math.floor(u * 30) % 3 !== 0) && (Math.floor(v * 24) % 4 !== 1);
      const n = fbm(L, u, v, 10, 4), scuff = fbm(L, u + 0.3, v, 24, 2) > 0.72;
      let k = 0.72 + n * 0.25;
      if (frame || mid) k *= 0.82;
      if (stencil) return { color: [200 * k, 196 * k, 160 * k], h: 0.62, r: 0.8 };
      return { color: scuff ? [95 * k, 90 * k, 70 * k] : [74 * k, 84 * k, 52 * k], h: frame || mid ? 0.9 : 0.6, r: 0.75 };
    };
  },
  crate_metal(L) {
    return (u, v) => {
      const frame = u < 0.06 || u > 0.94 || v < 0.06 || v > 0.94;
      const rib = !frame && (v * 6) % 1 < 0.08;
      const latch = Math.abs(u - 0.5) < 0.06 && v > 0.08 && v < 0.2;
      const n = fbm(L, u, v, 10, 4);
      const k = 0.62 + n * 0.25 + (frame ? 0.12 : 0);
      if (latch) return { color: [170, 170, 165], h: 1, r: 0.3 };
      return { color: [110 * k, 120 * k, 128 * k], h: frame ? 0.9 : rib ? 0.75 : 0.55, r: 0.4 + n * 0.25 };
    };
  },
  epoxy(L) {
    return (u, v) => {
      const n = fbm(L, u, v, 4, 6), spec = vnoise(L, u * 300, v * 300, 256) > 0.9 ? 0.1 : 0;
      const line = Math.min(u % 0.5, 0.5 - (u % 0.5)) < 0.003;
      const scuff = fbm(L, u, v, 14, 3);
      const k = 0.78 + n * 0.12 + spec - (line ? 0.4 : 0);
      return { color: [96 * k, 104 * k, 106 * k], h: 0.5 + spec - (line ? 0.3 : 0), r: 0.28 + scuff * 0.4 };
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
  snow: { rough: 0.8, normal: 0.8, tile: 6 },
  grass: { rough: 0.95, normal: 1.4, tile: 5 },
  container: { rough: 0.6, metal: 0.3, normal: 1.5, tile: 3 },
  panel: { rough: 0.75, metal: 0.45, normal: 1.2, tile: 4 },
  plank: { rough: 0.85, normal: 1.4, tile: 4 },
  grate: { rough: 0.6, metal: 0.7, normal: 2.2, tile: 2 },
  dirt: { rough: 1.0, normal: 1.4, tile: 5 },
  gravel: { rough: 1.0, normal: 2.4, tile: 3 },
  marble: { rough: 0.35, normal: 0.6, tile: 4 },
  ice: { rough: 0.3, normal: 1.0, tile: 6 },
  moss: { rough: 0.95, normal: 1.6, tile: 4 },
  rust: { rough: 0.8, metal: 0.5, normal: 1.4, tile: 4 },
  corrugated: { rough: 0.6, metal: 0.55, normal: 2.0, tile: 3 },
  hazard: { rough: 0.7, normal: 0.8, tile: 1.2 },
  trim: { rough: 0.6, metal: 0.4, normal: 1.0, tile: 2 },
  crate_mil: { rough: 0.85, normal: 1.4, tile: 2 },
  crate_metal: { rough: 0.55, metal: 0.6, normal: 1.6, tile: 2 },
  epoxy: { rough: 0.5, normal: 0.6, tile: 6 },
};

function generate(name) {
  const L = lattice(name.length * 7919 + name.charCodeAt(0) * 31);
  const fn = GEN[name](L);
  const col = document.createElement('canvas'); col.width = col.height = SIZE;
  const nrm = document.createElement('canvas'); nrm.width = nrm.height = SIZE;
  const cctx = col.getContext('2d'), nctx = nrm.getContext('2d');
  const cimg = cctx.createImageData(SIZE, SIZE), nimg = nctx.createImageData(SIZE, SIZE);
  const H = new Float32Array(SIZE * SIZE);
  // Roughness varies with the surface: recesses and grout are rougher, raised areas a touch smoother.
  const rgh = document.createElement('canvas'); rgh.width = rgh.height = SIZE;
  const rctx = rgh.getContext('2d'), rimg = rctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const s = fn(x / SIZE, y / SIZE), i = (y * SIZE + x) * 4;
      cimg.data[i] = clamp(s.color[0]); cimg.data[i + 1] = clamp(s.color[1]); cimg.data[i + 2] = clamp(s.color[2]); cimg.data[i + 3] = 255;
      H[y * SIZE + x] = s.h;
      const r = s.r ?? (0.82 + (0.55 - s.h) * 0.35);
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = clamp(r * 255); rimg.data[i + 3] = 255;
    }
  }
  rctx.putImageData(rimg, 0, 0);
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
  const roughnessMap = new THREE.CanvasTexture(rgh);
  for (const t of [map, normalMap, roughnessMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; }
  return { map, normalMap, roughnessMap, canvas: col };
}

// Returns a material whose UVs are expected in world metres divided by `tileSize(name)`.
// `vertexColors` is used by world geometry, which bakes floor-contact shading into vertex colours.
export function getMaterial(name, tint, vertexColors = false) {
  const key = name + (tint || '') + (vertexColors ? ':vc' : '');
  if (cache.has(key)) return cache.get(key);
  const base = cache.get('__tex_' + name) || generate(name);
  cache.set('__tex_' + name, base);
  const s = SETTINGS[name];
  const mat = new THREE.MeshStandardMaterial({
    map: base.map, normalMap: base.normalMap, roughnessMap: base.roughnessMap, roughness: Math.min(1, s.rough * 1.15), metalness: s.metal || 0,
    color: tint ? new THREE.Color(tint) : 0xffffff, vertexColors,
  });
  cache.set(key, mat);
  return mat;
}

export function tileSize(name) { return SETTINGS[name]?.tile || 4; }
export function textureCanvas(name) { getMaterial(name); return cache.get('__tex_' + name).canvas; }
