import * as THREE from 'three';
import { TEAM_COLORS } from '../data/modes.js';
import { WEAPON_SKINS, OUTFITS } from '../data/skins.js';
import { WEAPONS, GRENADES } from '../data/weapons.js';

// ───────────────────────── weapons ─────────────────────────
const gunMats = {};
function gm(key) {
  if (gunMats[key]) return gunMats[key];
  const defs = {
    metal: { color: 0x2a2c30, roughness: 0.35, metalness: 0.85 },
    steel: { color: 0x8d9298, roughness: 0.25, metalness: 0.95 },
    polymer: { color: 0x1c1d1f, roughness: 0.7, metalness: 0.05 },
    tan: { color: 0x8a7656, roughness: 0.75, metalness: 0.05 },
    wood: { color: 0x6b3f1f, roughness: 0.55, metalness: 0.0 },
    olive: { color: 0x4c5238, roughness: 0.7, metalness: 0.05 },
    glass: { color: 0x223344, roughness: 0.05, metalness: 0.9 },
    red: { color: 0xa02020, roughness: 0.5, metalness: 0.1 },
    green: { color: 0x3f4a2c, roughness: 0.8 },
  };
  gunMats[key] = new THREE.MeshStandardMaterial(defs[key]);
  return gunMats[key];
}

// ───────────── weapon finishes ─────────────
const SKINNABLE = new Set(['metal', 'polymer', 'tan', 'wood', 'olive']);
const skinCache = new Map();
let activeSkin = null;

function patternTexture(skin) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), p = skin.palette;
  let seed = skin.name.length * 97 + 13;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = p[0]; g.fillRect(0, 0, S, S);
  if (skin.pattern === 'camo') {
    for (let layer = 1; layer < p.length; layer++) {
      g.fillStyle = p[layer];
      for (let i = 0; i < 9; i++) {
        const x = rnd() * S, y = rnd() * S, r = 18 + rnd() * 34;
        g.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.5) { const rr = r * (0.6 + rnd() * 0.6); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7); }
        g.fill();
      }
    }
  } else if (skin.pattern === 'digital') {
    const px = 16;
    for (let y = 0; y < S; y += px) for (let x = 0; x < S; x += px) { g.fillStyle = p[Math.floor(rnd() * p.length)]; g.fillRect(x, y, px, px); }
  } else if (skin.pattern === 'stripes') {
    g.fillStyle = p[1];
    for (let i = -S; i < S * 2; i += 34) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 14 + rnd() * 10, 0); g.lineTo(i + 60, S); g.lineTo(i + 48, S); g.fill(); }
  } else if (skin.pattern === 'carbon') {
    for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 8) { g.fillStyle = ((x + y) / 8) % 2 ? p[1] : p[0]; g.fillRect(x, y, 8, 8); }
  } else if (skin.pattern === 'waves') {
    const grad = g.createLinearGradient(0, 0, S, S); p.forEach((col, i) => grad.addColorStop(i / (p.length - 1), col));
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 3;
    for (let y = 10; y < S; y += 26) { g.beginPath(); for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x / 18) * 6); g.stroke(); }
  } else if (skin.pattern === 'cracks' || skin.pattern === 'grid') {
    g.strokeStyle = p[1]; g.lineWidth = skin.pattern === 'grid' ? 2 : 3;
    if (skin.pattern === 'grid') { for (let i = 0; i <= S; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); } }
    else for (let i = 0; i < 14; i++) { let x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
  } else if (skin.pattern === 'fade') {
    const grad = g.createLinearGradient(0, 0, S * 0.4, S);
    p.forEach((col, i) => grad.addColorStop(i / (p.length - 1), col));
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
  } else if (skin.pattern === 'splatter') {
    for (let i = 0; i < 40; i++) {
      g.fillStyle = p[1 + Math.floor(rnd() * (p.length - 1))];
      const x = rnd() * S, y = rnd() * S, r = 4 + rnd() * 18;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + (rnd() - 0.5) * r * 3, y + (rnd() - 0.5) * r * 3, 1 + rnd() * 3, 0, Math.PI * 2); g.fill(); }
    }
  } else if (skin.pattern === 'hex') {
    g.strokeStyle = p[1]; g.lineWidth = 2;
    const r = 14, hh = r * Math.sqrt(3);
    for (let row = -1; row < S / hh + 1; row++) for (let col = -1; col < S / (r * 1.5) + 1; col++) {
      const cx = col * r * 1.5, cy = row * hh + (col % 2 ? hh / 2 : 0);
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.stroke();
    }
  } else if (skin.pattern === 'marble') {
    g.strokeStyle = p[1]; g.globalAlpha = 0.55;
    for (let i = 0; i < 9; i++) {
      let x = rnd() * S, y = 0;
      g.lineWidth = 0.5 + rnd() * 2;
      g.beginPath(); g.moveTo(x, y);
      while (y < S) { x += (rnd() - 0.5) * 30; y += 10 + rnd() * 14; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (skin.pattern === 'damascus') {
    g.strokeStyle = p[1]; g.lineWidth = 1.5; g.globalAlpha = 0.7;
    for (let i = -10; i < 40; i++) {
      g.beginPath();
      for (let x = 0; x <= S; x += 4) g.lineTo(x, i * 8 + Math.sin(x * 0.04 + i * 0.5) * 10 + Math.sin(x * 0.11) * 4);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (skin.pattern === 'circuit') {
    g.strokeStyle = p[1]; g.fillStyle = p[1]; g.lineWidth = 2;
    for (let i = 0; i < 30; i++) {
      let x = Math.floor(rnd() * 16) * 16, y = Math.floor(rnd() * 16) * 16;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { if (rnd() < 0.5) x += (rnd() < 0.5 ? -1 : 1) * 32; else y += (rnd() < 0.5 ? -1 : 1) * 32; g.lineTo(x, y); }
      g.stroke();
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
  } else if (skin.pattern === 'prism') {
    const grad = g.createLinearGradient(0, 0, S, S * 0.6); p.forEach((col, i) => grad.addColorStop(i / (p.length - 1), col));
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function skinMaterial(skinId, key) {
  const skin = WEAPON_SKINS[skinId];
  if (!skin || skin.pattern === 'solid' && !skin.palette.length) return gm(key);
  const ck = skinId + ':' + key;
  if (skinCache.has(ck)) return skinCache.get(ck);
  let mat;
  if (key === 'metal') {
    mat = new THREE.MeshStandardMaterial({ color: skin.metal || 0x2a2c30, roughness: skin.roughness ?? 0.35, metalness: skin.metalness ?? 0.85 });
  } else {
    const opts = { roughness: skin.roughness ?? 0.55, metalness: skin.metalness ?? 0.1 };
    if (skin.pattern === 'solid') opts.color = new THREE.Color(skin.palette[0]);
    else if (skin.pattern === 'metal') { opts.color = new THREE.Color(skin.palette[0]); }
    else {
      if (!skinCache.has(skinId + ':tex')) skinCache.set(skinId + ':tex', patternTexture(skin));
      opts.map = skinCache.get(skinId + ':tex');
    }
    if (skin.emissive) { opts.emissive = new THREE.Color(skin.emissive); opts.emissiveMap = opts.map; opts.emissiveIntensity = 0.9; }
    mat = new THREE.MeshStandardMaterial(opts);
  }
  skinCache.set(ck, mat);
  return mat;
}

function matFor(key) {
  return activeSkin && SKINNABLE.has(key) ? skinMaterial(activeSkin, key) : gm(key);
}

function part(g, w, h, d, x, y, z, mat, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matFor(mat));
  m.position.set(x, y, z); m.rotation.x = rx;
  m.castShadow = true;
  g.add(m);
  return m;
}
function cyl(g, r, len, x, y, z, mat, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), matFor(mat));
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

// Weapon model pointing down -Z, grip roughly at the origin. `skin` is a WEAPON_SKINS id.
export function buildGun(id, skin = null) {
  activeSkin = skin && skin !== 'factory' && WEAPON_SKINS[skin] ? skin : null;
  try { return buildGunInner(id); } finally { activeSkin = null; }
}

function buildGunInner(id) {
  const g = new THREE.Group();
  let muzzle = new THREE.Vector3(0, 0.03, -0.3);
  switch (id) {
    case 'viper': {
      part(g, 0.034, 0.036, 0.17, 0, 0.055, -0.05, 'metal');
      part(g, 0.032, 0.024, 0.15, 0, 0.026, -0.04, 'polymer');
      part(g, 0.03, 0.11, 0.045, 0, -0.025, 0.01, 'polymer', 0.22);
      part(g, 0.026, 0.12, 0.034, 0, -0.1, 0.03, 'metal', 0.22);
      part(g, 0.02, 0.03, 0.05, 0, 0.0, -0.12, 'polymer');
      muzzle = new THREE.Vector3(0, 0.055, -0.14);
      break;
    }
    case 'tac45': {
      part(g, 0.036, 0.04, 0.21, 0, 0.058, -0.07, 'metal');
      part(g, 0.034, 0.026, 0.18, 0, 0.027, -0.06, 'tan');
      part(g, 0.034, 0.12, 0.05, 0, -0.03, 0.01, 'tan', 0.22);
      part(g, 0.03, 0.02, 0.06, 0, 0.0, -0.13, 'metal');
      muzzle = new THREE.Vector3(0, 0.058, -0.18);
      break;
    }
    case 'kestrel': {
      part(g, 0.06, 0.09, 0.42, 0, 0.03, -0.06, 'polymer');
      part(g, 0.05, 0.03, 0.3, 0, 0.09, -0.08, 'metal');
      cyl(g, 0.014, 0.12, 0, 0.04, -0.33, 'metal');
      part(g, 0.04, 0.11, 0.045, 0, -0.05, -0.1, 'polymer', 0.2);
      part(g, 0.035, 0.04, 0.05, 0, 0.12, -0.04, 'glass');
      muzzle = new THREE.Vector3(0, 0.04, -0.39);
      break;
    }
    case 'reaper': {
      part(g, 0.06, 0.08, 0.4, 0, 0.04, -0.14, 'metal');
      cyl(g, 0.022, 0.38, 0, 0.06, -0.48, 'metal');
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 18), matFor('polymer'));
      drum.rotation.z = Math.PI / 2; drum.position.set(0, -0.06, -0.14); drum.castShadow = true; g.add(drum);
      part(g, 0.04, 0.11, 0.045, 0, -0.04, 0.03, 'polymer', 0.2);
      part(g, 0.05, 0.09, 0.26, 0, 0.01, 0.2, 'polymer', -0.08);
      part(g, 0.062, 0.05, 0.14, 0, 0.02, -0.36, 'polymer');
      muzzle = new THREE.Vector3(0, 0.06, -0.68);
      break;
    }
    case 'bulldog': {
      part(g, 0.08, 0.1, 0.5, 0, 0.04, -0.12, 'metal');
      cyl(g, 0.02, 0.45, 0, 0.05, -0.6, 'metal');
      part(g, 0.07, 0.09, 0.22, 0, 0.04, -0.42, 'polymer');
      part(g, 0.09, 0.14, 0.12, 0.0, -0.06, -0.1, 'olive');
      part(g, 0.02, 0.05, 0.16, 0, 0.12, -0.12, 'metal');
      part(g, 0.04, 0.11, 0.045, 0, -0.045, 0.06, 'polymer', 0.22);
      part(g, 0.05, 0.11, 0.3, 0, 0.0, 0.3, 'polymer');
      for (const sx of [-1, 1]) { const leg = part(g, 0.012, 0.16, 0.012, sx * 0.03, -0.04, -0.66, 'metal'); leg.rotation.z = sx * 0.3; }
      muzzle = new THREE.Vector3(0, 0.05, -0.83);
      break;
    }
    case 'trident': {
      part(g, 0.06, 0.1, 0.48, 0, 0.03, -0.02, 'tan');
      part(g, 0.05, 0.04, 0.3, 0, 0.1, -0.1, 'metal');
      cyl(g, 0.013, 0.2, 0, 0.05, -0.36, 'metal');
      part(g, 0.04, 0.11, 0.045, 0, -0.06, -0.16, 'polymer', 0.2);
      part(g, 0.035, 0.15, 0.06, 0, -0.07, 0.1, 'metal', -0.1);
      part(g, 0.03, 0.04, 0.07, 0, 0.14, -0.08, 'metal');
      part(g, 0.032, 0.03, 0.02, 0, 0.14, -0.12, 'glass');
      muzzle = new THREE.Vector3(0, 0.05, -0.47);
      break;
    }
    case 'falcon': {
      part(g, 0.05, 0.08, 0.42, 0, 0.04, -0.1, 'metal');
      part(g, 0.055, 0.06, 0.3, 0, 0.04, -0.42, 'polymer');
      cyl(g, 0.012, 0.36, 0, 0.05, -0.72, 'metal');
      part(g, 0.035, 0.15, 0.06, 0, -0.06, -0.12, 'metal', -0.15);
      part(g, 0.04, 0.11, 0.045, 0, -0.04, 0.05, 'polymer', 0.22);
      part(g, 0.045, 0.1, 0.28, 0, 0.01, 0.24, 'polymer');
      cyl(g, 0.022, 0.24, 0, 0.12, -0.12, 'metal');
      muzzle = new THREE.Vector3(0, 0.05, -0.9);
      break;
    }
    case 'sparrow': {
      part(g, 0.05, 0.07, 0.46, 0, 0.03, -0.1, 'tan');
      cyl(g, 0.011, 0.48, 0, 0.05, -0.58, 'metal');
      part(g, 0.04, 0.1, 0.045, 0, -0.045, 0.06, 'tan', 0.25);
      part(g, 0.045, 0.1, 0.28, 0, 0.0, 0.28, 'tan');
      part(g, 0.03, 0.09, 0.05, 0, -0.05, -0.08, 'metal');
      cyl(g, 0.022, 0.26, 0, 0.115, -0.08, 'metal');
      cyl(g, 0.028, 0.05, 0, 0.115, -0.22, 'metal');
      muzzle = new THREE.Vector3(0, 0.05, -0.83);
      break;
    }
    case 'knife': {
      part(g, 0.028, 0.03, 0.11, 0, 0, 0.02, 'polymer');
      part(g, 0.05, 0.012, 0.016, 0, 0.0, -0.04, 'metal');
      const blade = part(g, 0.006, 0.03, 0.17, 0, 0.004, -0.13, 'steel');
      blade.scale.y = 1;
      part(g, 0.006, 0.012, 0.05, 0, 0.018, -0.2, 'steel');
      muzzle = new THREE.Vector3(0, 0, -0.22);
      break;
    }
    case 'p9': {
      part(g, 0.032, 0.034, 0.19, 0, 0.055, -0.06, 'metal');
      part(g, 0.03, 0.022, 0.16, 0, 0.026, -0.05, 'polymer');
      part(g, 0.03, 0.11, 0.045, 0, -0.025, 0.01, 'polymer', 0.22);
      part(g, 0.006, 0.03, 0.035, 0, 0.005, -0.045, 'polymer');
      part(g, 0.006, 0.01, 0.01, 0, 0.077, -0.145, 'metal');
      muzzle = new THREE.Vector3(0, 0.055, -0.16);
      break;
    }
    case 'magnum': {
      part(g, 0.04, 0.045, 0.27, 0, 0.06, -0.1, 'steel');
      part(g, 0.036, 0.024, 0.2, 0, 0.026, -0.07, 'metal');
      part(g, 0.034, 0.12, 0.05, 0, -0.03, 0.01, 'wood', 0.2);
      part(g, 0.012, 0.012, 0.25, 0, 0.088, -0.1, 'metal');
      muzzle = new THREE.Vector3(0, 0.06, -0.24);
      break;
    }
    case 'vex': {
      part(g, 0.05, 0.07, 0.3, 0, 0.04, -0.1, 'polymer');
      part(g, 0.04, 0.12, 0.04, 0, -0.04, 0.0, 'polymer', 0.18);
      part(g, 0.035, 0.16, 0.05, 0, -0.06, -0.12, 'metal');
      cyl(g, 0.016, 0.14, 0, 0.05, -0.31, 'metal');
      part(g, 0.035, 0.03, 0.18, 0, 0.03, 0.15, 'metal');
      part(g, 0.02, 0.025, 0.06, 0, 0.09, -0.08, 'metal');
      muzzle = new THREE.Vector3(0, 0.05, -0.38);
      break;
    }
    case 'breacher': {
      part(g, 0.05, 0.07, 0.42, 0, 0.04, -0.15, 'metal');
      cyl(g, 0.02, 0.5, 0, 0.06, -0.48, 'metal');
      cyl(g, 0.017, 0.4, 0, 0.025, -0.43, 'metal');
      part(g, 0.056, 0.05, 0.16, 0, 0.022, -0.42, 'polymer');
      part(g, 0.04, 0.11, 0.045, 0, -0.04, 0.02, 'polymer', 0.2);
      part(g, 0.045, 0.08, 0.26, 0, 0.0, 0.2, 'polymer', -0.1);
      muzzle = new THREE.Vector3(0, 0.06, -0.74);
      break;
    }
    case 'ar7': {
      part(g, 0.05, 0.07, 0.4, 0, 0.04, -0.12, 'metal');
      part(g, 0.052, 0.06, 0.2, 0, 0.04, -0.38, 'wood');
      cyl(g, 0.012, 0.3, 0, 0.055, -0.6, 'metal');
      part(g, 0.04, 0.18, 0.06, 0, -0.07, -0.16, 'metal', -0.35);
      part(g, 0.04, 0.11, 0.045, 0, -0.04, 0.03, 'wood', 0.2);
      part(g, 0.045, 0.09, 0.3, 0, 0.0, 0.24, 'wood', -0.08);
      part(g, 0.012, 0.03, 0.012, 0, 0.09, -0.62, 'metal');
      part(g, 0.024, 0.02, 0.05, 0, 0.085, -0.02, 'metal');
      muzzle = new THREE.Vector3(0, 0.055, -0.76);
      break;
    }
    case 'm5': {
      part(g, 0.05, 0.08, 0.36, 0, 0.04, -0.1, 'tan');
      part(g, 0.055, 0.065, 0.26, 0, 0.045, -0.4, 'polymer');
      cyl(g, 0.012, 0.22, 0, 0.05, -0.62, 'metal');
      part(g, 0.035, 0.17, 0.06, 0, -0.07, -0.13, 'polymer', -0.15);
      part(g, 0.04, 0.11, 0.045, 0, -0.04, 0.04, 'polymer', 0.22);
      part(g, 0.04, 0.08, 0.24, 0, 0.02, 0.22, 'tan');
      part(g, 0.03, 0.04, 0.09, 0, 0.11, -0.12, 'metal');
      part(g, 0.032, 0.03, 0.03, 0, 0.115, -0.12, 'glass');
      muzzle = new THREE.Vector3(0, 0.05, -0.74);
      break;
    }
    case 'longshot': {
      part(g, 0.06, 0.08, 0.5, 0, 0.03, -0.1, 'olive');
      cyl(g, 0.014, 0.55, 0, 0.055, -0.62, 'metal');
      cyl(g, 0.022, 0.08, 0, 0.055, -0.92, 'metal');
      part(g, 0.04, 0.1, 0.045, 0, -0.045, 0.06, 'olive', 0.25);
      part(g, 0.05, 0.12, 0.3, 0, 0.0, 0.3, 'olive');
      part(g, 0.035, 0.12, 0.05, 0, -0.06, -0.1, 'metal');
      cyl(g, 0.028, 0.32, 0, 0.13, -0.08, 'metal');
      cyl(g, 0.036, 0.06, 0, 0.13, -0.26, 'metal');
      cyl(g, 0.034, 0.05, 0, 0.13, 0.09, 'metal');
      part(g, 0.02, 0.05, 0.02, 0, 0.09, -0.08, 'metal');
      muzzle = new THREE.Vector3(0, 0.055, -0.97);
      break;
    }
    // ───── knives ─────
    case 'karambit': {
      part(g, 0.026, 0.03, 0.09, 0, 0, 0.02, 'polymer');
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 14), matFor('metal'));
      ring.rotation.y = Math.PI / 2; ring.position.set(0, 0, 0.075); g.add(ring);
      for (let i = 0; i < 4; i++) {
        const seg = part(g, 0.005, 0.022, 0.045, 0, 0.004 - i * i * 0.006, -0.045 - i * 0.04, 'steel');
        seg.rotation.x = 0.25 + i * 0.22;
      }
      muzzle = new THREE.Vector3(0, -0.04, -0.2);
      break;
    }
    case 'machete': {
      part(g, 0.03, 0.034, 0.12, 0, 0, 0.03, 'wood');
      part(g, 0.05, 0.012, 0.016, 0, 0.0, -0.04, 'metal');
      part(g, 0.006, 0.05, 0.36, 0, 0.012, -0.22, 'steel');
      part(g, 0.006, 0.03, 0.06, 0, 0.026, -0.41, 'steel').rotation.x = -0.4;
      muzzle = new THREE.Vector3(0, 0, -0.44);
      break;
    }
    case 'hatchet': {
      part(g, 0.028, 0.03, 0.3, 0, 0, -0.06, 'wood');
      part(g, 0.016, 0.1, 0.05, 0, 0.04, -0.2, 'steel');
      part(g, 0.008, 0.13, 0.025, 0, 0.05, -0.235, 'steel');
      part(g, 0.02, 0.04, 0.05, 0, -0.03, -0.2, 'metal');
      muzzle = new THREE.Vector3(0, 0.05, -0.25);
      break;
    }
    // ───── SMGs ─────
    case 'hornet': {
      part(g, 0.045, 0.065, 0.26, 0, 0.04, -0.08, 'polymer');
      part(g, 0.035, 0.12, 0.04, 0, -0.04, 0.0, 'polymer', 0.18);
      part(g, 0.03, 0.2, 0.04, 0, -0.08, -0.1, 'metal', 0.05);
      cyl(g, 0.014, 0.1, 0, 0.05, -0.25, 'metal');
      part(g, 0.012, 0.012, 0.22, 0, 0.03, 0.14, 'metal');
      part(g, 0.04, 0.05, 0.012, 0, 0.03, 0.25, 'metal');
      muzzle = new THREE.Vector3(0, 0.05, -0.3);
      break;
    }
    case 'mako': {
      part(g, 0.06, 0.09, 0.34, 0, 0.04, -0.09, 'tan');
      part(g, 0.04, 0.12, 0.045, 0, -0.05, 0.02, 'polymer', 0.2);
      part(g, 0.04, 0.14, 0.05, 0, -0.06, -0.14, 'polymer');
      cyl(g, 0.02, 0.12, 0, 0.05, -0.32, 'metal');
      part(g, 0.05, 0.07, 0.2, 0, 0.03, 0.18, 'polymer');
      part(g, 0.03, 0.035, 0.07, 0, 0.11, -0.07, 'metal');
      part(g, 0.032, 0.03, 0.02, 0, 0.11, -0.11, 'glass');
      muzzle = new THREE.Vector3(0, 0.05, -0.39);
      break;
    }
    // ───── shotguns ─────
    case 'coach': {
      for (const sx of [-1, 1]) cyl(g, 0.016, 0.62, sx * 0.017, 0.05, -0.42, 'metal');
      part(g, 0.06, 0.05, 0.16, 0, 0.03, -0.04, 'steel');
      part(g, 0.05, 0.04, 0.24, 0, 0.02, -0.3, 'wood');
      part(g, 0.04, 0.11, 0.045, 0, -0.04, 0.05, 'wood', 0.25);
      part(g, 0.048, 0.1, 0.3, 0, -0.01, 0.24, 'wood', -0.1);
      muzzle = new THREE.Vector3(0, 0.05, -0.73);
      break;
    }
    case 'striker': {
      part(g, 0.06, 0.09, 0.36, 0, 0.04, -0.12, 'olive');
      cyl(g, 0.02, 0.36, 0, 0.06, -0.46, 'metal');
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 20), matFor('metal'));
      drum.rotation.x = Math.PI / 2; drum.position.set(0, 0.0, -0.18); drum.castShadow = true; g.add(drum);
      part(g, 0.04, 0.11, 0.045, 0, -0.04, 0.03, 'polymer', 0.2);
      part(g, 0.035, 0.11, 0.04, 0, -0.05, -0.36, 'polymer');
      part(g, 0.014, 0.014, 0.28, 0, 0.06, 0.2, 'metal');
      muzzle = new THREE.Vector3(0, 0.06, -0.66);
      break;
    }
    // ───── LMGs ─────
    case 'mauler': {
      part(g, 0.07, 0.11, 0.62, 0, 0.04, 0.0, 'polymer');
      cyl(g, 0.017, 0.3, 0, 0.05, -0.45, 'metal');
      part(g, 0.08, 0.12, 0.13, 0, -0.06, 0.12, 'metal');
      part(g, 0.04, 0.11, 0.045, 0, -0.05, -0.16, 'polymer', 0.2);
      part(g, 0.035, 0.05, 0.1, 0, 0.12, -0.1, 'metal');
      part(g, 0.036, 0.035, 0.02, 0, 0.12, -0.15, 'glass');
      muzzle = new THREE.Vector3(0, 0.05, -0.62);
      break;
    }
    case 'hailstorm': {
      part(g, 0.1, 0.11, 0.42, 0, 0.03, -0.06, 'metal');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cyl(g, 0.01, 0.46, Math.cos(a) * 0.028, 0.04 + Math.sin(a) * 0.028, -0.48, 'steel', 8);
      }
      const box = part(g, 0.12, 0.14, 0.16, 0.0, -0.08, -0.04, 'olive');
      box.castShadow = true;
      part(g, 0.04, 0.11, 0.045, 0, -0.04, 0.12, 'polymer', 0.2);
      part(g, 0.02, 0.09, 0.02, 0, 0.12, -0.2, 'metal');
      muzzle = new THREE.Vector3(0, 0.04, -0.72);
      break;
    }
    case 'anvil': {
      part(g, 0.09, 0.12, 0.55, 0, 0.04, -0.12, 'olive');
      cyl(g, 0.026, 0.5, 0, 0.05, -0.62, 'metal');
      cyl(g, 0.036, 0.1, 0, 0.05, -0.9, 'metal');
      part(g, 0.1, 0.15, 0.15, 0, -0.07, -0.12, 'olive');
      part(g, 0.04, 0.11, 0.045, 0, -0.045, 0.08, 'polymer', 0.22);
      part(g, 0.05, 0.12, 0.28, 0, 0.0, 0.3, 'polymer');
      part(g, 0.05, 0.03, 0.4, 0, 0.12, -0.2, 'metal');
      for (const sx of [-1, 1]) { const leg = part(g, 0.014, 0.2, 0.014, sx * 0.04, -0.06, -0.72, 'metal'); leg.rotation.z = sx * 0.35; }
      muzzle = new THREE.Vector3(0, 0.05, -0.96);
      break;
    }
    // ───── snipers ─────
    case 'kodiak': {
      part(g, 0.055, 0.08, 0.5, 0, 0.03, -0.1, 'wood');
      cyl(g, 0.016, 0.56, 0, 0.055, -0.62, 'metal');
      part(g, 0.04, 0.1, 0.045, 0, -0.045, 0.06, 'wood', 0.25);
      part(g, 0.05, 0.12, 0.3, 0, 0.0, 0.3, 'wood');
      part(g, 0.03, 0.08, 0.05, 0, -0.05, -0.08, 'metal');
      cyl(g, 0.026, 0.3, 0, 0.13, -0.08, 'metal');
      cyl(g, 0.034, 0.05, 0, 0.13, -0.24, 'metal');
      part(g, 0.012, 0.012, 0.05, 0.035, 0.07, 0.04, 'steel');
      muzzle = new THREE.Vector3(0, 0.055, -0.9);
      break;
    }
    case 'warden': {
      part(g, 0.06, 0.1, 0.48, 0, 0.03, -0.08, 'tan');
      part(g, 0.06, 0.07, 0.24, 0, 0.04, -0.42, 'polymer');
      cyl(g, 0.014, 0.36, 0, 0.05, -0.7, 'metal');
      part(g, 0.04, 0.15, 0.06, 0, -0.07, -0.12, 'metal', -0.12);
      part(g, 0.04, 0.11, 0.045, 0, -0.05, 0.06, 'polymer', 0.22);
      part(g, 0.05, 0.11, 0.3, 0, 0.0, 0.28, 'tan');
      cyl(g, 0.026, 0.3, 0, 0.13, -0.1, 'metal');
      cyl(g, 0.034, 0.05, 0, 0.13, -0.27, 'metal');
      muzzle = new THREE.Vector3(0, 0.05, -0.88);
      break;
    }
    // ───── other ─────
    case 'nailer': {
      part(g, 0.07, 0.12, 0.34, 0, 0.04, -0.1, 'olive');
      part(g, 0.05, 0.05, 0.12, 0, 0.04, -0.33, 'metal');
      part(g, 0.04, 0.12, 0.05, 0, -0.06, 0.04, 'polymer', 0.2);
      part(g, 0.03, 0.06, 0.3, 0, -0.04, -0.12, 'steel').rotation.x = 0.05;
      const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), matFor('metal'));
      coil.rotation.z = Math.PI / 2; coil.position.set(0.0, -0.05, -0.2); g.add(coil);
      part(g, 0.06, 0.02, 0.22, 0, 0.11, -0.1, 'red');
      muzzle = new THREE.Vector3(0, 0.04, -0.4);
      break;
    }
    case 'crossbow': {
      part(g, 0.04, 0.05, 0.6, 0, 0.02, -0.1, 'wood');
      part(g, 0.6, 0.02, 0.03, 0, 0.04, -0.36, 'metal');
      for (const sx of [-1, 1]) part(g, 0.004, 0.004, 0.3, sx * 0.15, 0.045, -0.24, 'steel').rotation.y = sx * -1.1;
      part(g, 0.006, 0.006, 0.4, 0, 0.06, -0.24, 'steel');
      part(g, 0.04, 0.11, 0.045, 0, -0.05, 0.05, 'wood', 0.25);
      part(g, 0.045, 0.1, 0.24, 0, 0.0, 0.3, 'wood');
      cyl(g, 0.02, 0.22, 0, 0.1, -0.1, 'metal');
      muzzle = new THREE.Vector3(0, 0.06, -0.45);
      break;
    }
    case 'thumper': {
      cyl(g, 0.045, 0.42, 0, 0.05, -0.28, 'olive', 16);
      cyl(g, 0.05, 0.05, 0, 0.05, -0.49, 'metal', 16);
      part(g, 0.06, 0.08, 0.2, 0, 0.02, -0.02, 'metal');
      part(g, 0.04, 0.12, 0.045, 0, -0.06, 0.04, 'polymer', 0.2);
      part(g, 0.04, 0.12, 0.05, 0, -0.04, -0.3, 'polymer');
      part(g, 0.045, 0.09, 0.26, 0, 0.0, 0.22, 'olive');
      part(g, 0.03, 0.06, 0.02, 0, 0.12, -0.15, 'metal');
      muzzle = new THREE.Vector3(0, 0.05, -0.52);
      break;
    }
    case 'rail': {
      part(g, 0.07, 0.1, 0.5, 0, 0.04, -0.12, 'metal');
      for (const sy of [-1, 1]) part(g, 0.05, 0.016, 0.5, 0, 0.05 + sy * 0.035, -0.6, 'steel');
      const coilMat = new THREE.MeshStandardMaterial({ color: 0x1a3d66, emissive: 0x3aa8ff, emissiveIntensity: 1.6, roughness: 0.3 });
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16), coilMat);
        c.position.set(0, 0.05, -0.42 - i * 0.07); g.add(c);
      }
      part(g, 0.04, 0.11, 0.045, 0, -0.05, 0.04, 'polymer', 0.2);
      part(g, 0.05, 0.11, 0.28, 0, 0.0, 0.26, 'polymer');
      part(g, 0.035, 0.05, 0.12, 0, 0.12, -0.1, 'metal');
      muzzle = new THREE.Vector3(0, 0.05, -0.86);
      break;
    }
    // ───── grenades & projectiles ─────
    case 'flash': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 14), gm('steel'));
      g.add(c);
      for (let i = 0; i < 3; i++) part(g, 0.062, 0.008, 0.062, 0, -0.035 + i * 0.035, 0, 'polymer');
      part(g, 0.016, 0.03, 0.016, 0, 0.075, 0, 'metal');
      break;
    }
    case 'fire': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.1, 14), new THREE.MeshStandardMaterial({ color: 0x8a4a12, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }));
      g.add(body);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.05, 10), body.material); neck.position.y = 0.075; g.add(neck);
      const rag = part(g, 0.02, 0.04, 0.02, 0, 0.115, 0, 'tan'); rag.rotation.z = 0.3;
      break;
    }
    case 'mine': {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.035, 18), gm('olive'));
      disc.position.y = 0.017; g.add(disc);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.02, 14), gm('metal'));
      top.position.y = 0.045; g.add(top);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }));
      led.name = 'led'; led.position.set(0.03, 0.04, 0); g.add(led);
      break;
    }
    case 'decoy': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.11, 12), gm('tan'));
      g.add(c);
      part(g, 0.058, 0.014, 0.058, 0, 0.03, 0, 'red');
      part(g, 0.014, 0.03, 0.014, 0, 0.07, 0, 'steel');
      break;
    }
    case 'gl': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.06, 12), gm('olive'));
      c.rotation.x = Math.PI / 2; g.add(c);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), gm('steel'));
      tip.position.z = -0.03; g.add(tip);
      break;
    }
    case 'he': {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), gm('green'));
      s.scale.y = 1.25; g.add(s);
      part(g, 0.02, 0.03, 0.02, 0, 0.055, 0, 'steel');
      part(g, 0.008, 0.06, 0.012, 0.02, 0.035, 0, 'steel');
      break;
    }
    case 'smoke': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.11, 14), gm('polymer'));
      g.add(c);
      part(g, 0.066, 0.02, 0.066, 0, 0.03, 0, 'metal');
      part(g, 0.016, 0.03, 0.016, 0, 0.07, 0, 'steel');
      break;
    }
    case 'bomb': {
      part(g, 0.22, 0.08, 0.14, 0, 0, 0, 'tan');
      part(g, 0.1, 0.02, 0.07, -0.03, 0.05, 0, 'polymer');
      part(g, 0.04, 0.03, 0.03, 0.06, 0.05, 0.02, 'red');
      cyl(g, 0.012, 0.22, 0, 0.0, 0.08, 'red', 8).rotation.set(0, 0, Math.PI / 2);
      break;
    }
    default:
      part(g, 0.04, 0.06, 0.3, 0, 0, -0.1, 'metal');
      g.userData.generic = true;
  }
  g.userData.muzzle = muzzle;
  return g;
}

// ───────────────────────── characters ─────────────────────────
function mat(color, rough = 0.85, metal = 0) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: metal });
}
function bx(parent, w, h, d, x, y, z, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function rbx(parent, w, h, d, x, y, z, m, r = 0.02) {
  const geo = roundedBox(w, h, d, r);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const rbCache = new Map();
function roundedBox(w, h, d, r) {
  const key = [w, h, d, r].join();
  if (rbCache.has(key)) return rbCache.get(key);
  // Box with chamfered silhouette: a capsule-ish shape via scaled sphere-box blend.
  const geo = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const p = geo.attributes.position, v = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const dir = v.clone().sub(c);
    if (dir.lengthSq() > 1e-8) { dir.setLength(r); v.copy(c).add(dir); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  rbCache.set(key, geo);
  return geo;
}

// Procedural operator. Root sits at the feet, faces -Z.
// In matches every operator is drawn at the same size, matched to the hitboxes in game/player.js
// (head around the camera eye at 1.64 m), so no body type is easier or harder to hit than another.
// Height and build only change how an operator looks in the menus.
export const MATCH_SCALE = 0.92;

export class CharacterModel {
  // match: true for anything that can be shot (or replayed): fixed size, standard build.
  constructor(c, { team = -1, match = false } = {}) {
    const outfit = OUTFITS[c.outfit];
    if (outfit) c = { ...c, ...outfit.colors };
    this.c = c;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const s = match ? MATCH_SCALE : c.height || 1;
    this.scale = s;
    this.body.scale.setScalar(s);
    const bw = match ? 1 : c.build === 'heavy' ? 1.14 : c.build === 'slim' ? 0.9 : 1;

    const skin = mat(c.skin, 0.6), top = mat(c.top), pants = mat(c.pants), boots = mat(c.boots || '#2a221b', 0.7);
    const gloves = mat(c.gloves || '#1d1d1f', 0.7), hair = mat(c.hairColor, 0.9), vestM = mat(c.vestColor, 0.8);
    const dark = mat('#141414', 0.5);
    const teamM = team >= 0 ? new THREE.MeshStandardMaterial({ color: TEAM_COLORS[team], emissive: TEAM_COLORS[team], emissiveIntensity: 0.35, roughness: 0.6 }) : mat(c.accent || '#f2a33a');

    // legs
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.1 * side * bw, 0.93, 0);
      rbx(hip, 0.16 * bw, 0.46, 0.18, 0, -0.23, 0, pants, 0.04);
      const knee = new THREE.Group();
      knee.position.set(0, -0.46, 0);
      rbx(knee, 0.14 * bw, 0.4, 0.16, 0, -0.2, 0, pants, 0.035);
      rbx(knee, 0.15, 0.1, 0.27, 0, -0.42, -0.04, boots, 0.03);
      bx(knee, 0.12 * bw, 0.1, 0.05, 0, -0.04, -0.085, mat('#3a3a36', 0.9)); // knee pad
      hip.add(knee);
      hip.userData.knee = knee;
      this.body.add(hip);
      this.legs.push(hip);
    }
    rbx(this.body, 0.36 * bw, 0.2, 0.22, 0, 0.98, 0, pants, 0.04);
    bx(this.body, 0.38 * bw, 0.05, 0.24, 0, 1.07, 0, dark); // belt

    // torso
    this.torso = new THREE.Group();
    this.torso.position.set(0, 1.06, 0);
    this.body.add(this.torso);
    rbx(this.torso, 0.4 * bw, 0.5, 0.24, 0, 0.27, 0, top, 0.06);
    if (c.vest === 'plate') {
      rbx(this.torso, 0.42 * bw, 0.4, 0.29, 0, 0.27, 0, vestM, 0.04);
      bx(this.torso, 0.3 * bw, 0.12, 0.05, 0, 0.17, -0.16, vestM);
      for (const x of [-0.1, 0, 0.1]) bx(this.torso, 0.08, 0.1, 0.05, x * bw, 0.19, -0.18, mat(c.vestColor, 0.9));
    } else if (c.vest === 'rig') {
      bx(this.torso, 0.42 * bw, 0.06, 0.27, 0, 0.42, 0, vestM);
      for (const x of [-0.12, -0.04, 0.04, 0.12]) bx(this.torso, 0.07, 0.12, 0.05, x * bw, 0.16, -0.14, vestM);
    }
    // neck & head
    bx(this.torso, 0.1, 0.08, 0.1, 0, 0.55, 0, skin);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.6, 0);
    this.torso.add(this.head);
    rbx(this.head, 0.21, 0.25, 0.23, 0, 0.12, 0, skin, 0.05);
    bx(this.head, 0.04, 0.025, 0.02, -0.05, 0.14, -0.115, dark);
    bx(this.head, 0.04, 0.025, 0.02, 0.05, 0.14, -0.115, dark);
    bx(this.head, 0.03, 0.05, 0.03, 0, 0.1, -0.12, skin);
    bx(this.head, 0.07, 0.015, 0.01, 0, 0.045, -0.116, mat('#5a2a22'));
    for (const x of [-0.11, 0.11]) bx(this.head, 0.02, 0.06, 0.04, x, 0.12, 0, skin);
    this._hair(c.hair, hair);
    this._face(c.face, hair, skin);
    this._headgear(c.headgear, vestM, top);

    // arms (rifle hold)
    this.arms = [];
    for (const side of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(0.25 * side * bw, 0.46, 0);
      rbx(sh, 0.12, 0.3, 0.13, 0, -0.14, 0, top, 0.04);
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.28, 0);
      rbx(elbow, 0.11, 0.28, 0.11, 0, -0.13, 0, top, 0.035);
      rbx(elbow, 0.09, 0.1, 0.1, 0, -0.3, 0, gloves, 0.03);
      sh.add(elbow);
      sh.userData.elbow = elbow;
      if (side === -1) bx(sh, 0.13, 0.06, 0.14, 0, -0.1, 0, teamM); // armband
      this.torso.add(sh);
      this.arms.push(sh);
    }
    bx(this.torso, 0.12, 0.08, 0.04, 0.12 * bw, 0.4, 0.15, teamM); // back patch

    if (outfit?.glow) {
      const glow = new THREE.MeshStandardMaterial({ color: outfit.glow, emissive: outfit.glow, emissiveIntensity: 1.2 });
      for (const x of [-0.12, 0.12]) bx(this.torso, 0.02, 0.36, 0.3, x * bw * 1.7, 0.27, 0, glow);
    }
    this.gunHolder = new THREE.Group();
    this.gunHolder.position.set(0.1, 0.28, -0.3);
    this.torso.add(this.gunHolder);

    this.phase = 0;
    this.dead = false;
    this.deathT = 0;
    this.weaponId = null;
  }

  _hair(style, m) {
    const h = this.head;
    if (style === 'none') return;
    if (style === 'buzz') { bx(h, 0.215, 0.04, 0.235, 0, 0.245, 0, m); return; }
    bx(h, 0.225, 0.06, 0.245, 0, 0.26, 0.005, m);
    bx(h, 0.225, 0.12, 0.05, 0, 0.18, 0.11, m);
    if (style === 'short') { bx(h, 0.23, 0.05, 0.06, 0, 0.24, -0.09, m); }
    if (style === 'swept') { const f = bx(h, 0.23, 0.06, 0.1, 0.01, 0.27, -0.08, m); f.rotation.z = 0.12; }
    if (style === 'long') { bx(h, 0.24, 0.26, 0.08, 0, 0.1, 0.1, m); for (const x of [-0.115, 0.115]) bx(h, 0.03, 0.2, 0.18, x, 0.13, 0.02, m); }
    if (style === 'mohawk') { bx(h, 0.05, 0.08, 0.25, 0, 0.3, 0, m); }
    if (style === 'ponytail') { bx(h, 0.06, 0.18, 0.06, 0, 0.13, 0.15, m); }
  }

  _face(face, hairM, skin) {
    const h = this.head;
    if (face === 'beard') { bx(h, 0.215, 0.1, 0.06, 0, 0.04, -0.1, hairM); bx(h, 0.215, 0.1, 0.2, 0, 0.06, 0, hairM).scale.set(1.02, 1, 1); }
    if (face === 'stubble') { const m = hairM.clone(); m.transparent = true; m.opacity = 0.45; bx(h, 0.212, 0.07, 0.23, 0, 0.04, 0.0, m); }
    if (face === 'glasses') { const g = mat('#111', 0.15, 0.6); bx(h, 0.2, 0.04, 0.02, 0, 0.145, -0.122, g); }
    if (face === 'balaclava') { const m = mat('#1a1a1a', 0.95); bx(h, 0.222, 0.2, 0.242, 0, 0.1, 0, m); bx(h, 0.15, 0.04, 0.02, 0, 0.14, -0.123, skin); bx(h, 0.04, 0.025, 0.02, -0.05, 0.14, -0.13, mat('#000')); bx(h, 0.04, 0.025, 0.02, 0.05, 0.14, -0.13, mat('#000')); }
    if (face === 'mask') { bx(h, 0.2, 0.09, 0.05, 0, 0.06, -0.11, mat('#222', 0.8)); }
    if (face === 'gasmask') {
      const m = mat('#232323', 0.6);
      bx(h, 0.225, 0.22, 0.05, 0, 0.11, -0.11, m);
      for (const x of [-0.05, 0.05]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), mat('#3a5060', 0.1, 0.8)); l.rotation.x = Math.PI / 2; l.position.set(x, 0.15, -0.14); h.add(l); }
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 12), m); f.rotation.x = Math.PI / 2; f.position.set(0, 0.05, -0.16); h.add(f);
    }
  }

  _headgear(g, vestM, topM) {
    const h = this.head;
    if (g === 'helmet') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), vestM);
      m.scale.set(1, 0.85, 1.08); m.position.set(0, 0.2, 0.005); m.castShadow = true; h.add(m);
      bx(h, 0.26, 0.025, 0.28, 0, 0.2, 0.005, vestM);
    }
    if (g === 'cap') {
      bx(h, 0.225, 0.07, 0.24, 0, 0.27, 0, topM);
      bx(h, 0.18, 0.015, 0.1, 0, 0.245, -0.16, topM);
    }
    if (g === 'beanie') { rbx(h, 0.23, 0.12, 0.25, 0, 0.27, 0, topM, 0.04); }
    if (g === 'headset') {
      const m = mat('#151515', 0.6);
      bx(h, 0.25, 0.025, 0.04, 0, 0.27, 0, m);
      for (const x of [-0.125, 0.125]) bx(h, 0.04, 0.08, 0.08, x, 0.13, 0, m);
      bx(h, 0.015, 0.015, 0.11, -0.13, 0.08, -0.06, m);
    }
    if (g === 'boonie') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 20), vestM);
      brim.position.set(0, 0.22, 0); h.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.1, 16), vestM);
      crown.position.set(0, 0.27, 0); h.add(crown);
    }
  }

  setWeapon(id) {
    const skin = this.c.skins?.[id] || null;
    if (id === this.weaponId && skin === this.weaponSkin) return;
    this.weaponId = id;
    this.weaponSkin = skin;
    this.gunHolder.clear();
    if (!id) return;
    const g = buildGun(id, skin);
    g.scale.setScalar(1.05);
    this.gunHolder.add(g);
    const type = WEAPONS[id]?.type;
    const pistol = type === 'pistol' || type === 'knife' || !!GRENADES[id] || id === 'bomb';
    this.pistolPose = pistol;
    this.gunHolder.position.set(pistol ? 0.02 : 0.1, pistol ? 0.36 : 0.28, pistol ? -0.42 : -0.3);
  }

  playEmote(id, dur = 2) {
    if (this.dead) return;
    this.emote = { id, t: 0, dur };
    this.gunHolder.visible = false;
  }

  stopEmote() {
    if (!this.emote) return;
    this.emote = null;
    this.gunHolder.visible = true;
    this.body.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.arms.forEach((a) => a.userData.elbow.rotation.set(0, 0, 0));
  }

  // Poses for each emote as a function of time. arms[0] is the left arm, arms[1] the right.
  _emotePose(e, dt) {
    const t = e.t, [L, Rt] = this.arms, le = L.userData.elbow, re = Rt.userData.elbow;
    const s = Math.sin, wave = (f) => s(t * f);
    const set = (arm, x, y, z) => arm.rotation.set(x, y, z);
    for (const l of this.legs) { l.rotation.set(0, 0, 0); l.userData.knee.rotation.x = 0; }
    this.body.position.y = 0; this.body.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0);
    le.rotation.set(0, 0, 0); re.rotation.set(0, 0, 0);
    set(L, 0, 0, -0.08); set(Rt, 0, 0, 0.08);
    const ease = Math.min(1, t * 5, (e.dur - t) * 5);
    switch (e.id) {
      case 'wave': set(Rt, 0.3 * ease, 0, (2.3 + wave(9) * 0.35) * ease); re.rotation.z = 0.5 * ease; this.head.rotation.z = 0.1 * ease; break;
      case 'salute': set(Rt, 2.0 * ease, 0, 0.75 * ease); re.rotation.x = 2.3 * ease; this.torso.rotation.x = -0.05; break;
      case 'point': set(Rt, (Math.PI / 2 + 0.15) * ease, 0, 0.05); this.torso.rotation.y = -0.25 * ease; this.head.rotation.y = -0.2 * ease; break;
      case 'shrug': set(L, 0.5 * ease, 0, -0.6 * ease); set(Rt, 0.5 * ease, 0, 0.6 * ease); le.rotation.x = 1.4 * ease; re.rotation.x = 1.4 * ease; this.body.position.y = Math.abs(wave(4)) * 0.02; this.head.rotation.z = 0.25 * ease; break;
      case 'thumbs': set(Rt, 1.1 * ease, 0, 0.3); re.rotation.x = 1.4 * ease; this.head.rotation.x = -0.1; break;
      case 'clap': { const c = Math.abs(wave(7)); set(L, 1.25 * ease, 0, (-0.15 - c * 0.35) * ease); set(Rt, 1.25 * ease, 0, (0.15 + c * 0.35) * ease); le.rotation.x = 0.6 * ease; re.rotation.x = 0.6 * ease; break; }
      case 'facepalm': set(Rt, 2.4 * ease, 0, -0.35 * ease); re.rotation.x = 2.3 * ease; this.head.rotation.x = 0.35 * ease; this.torso.rotation.x = 0.12 * ease; break;
      case 'dance': {
        this.body.position.y = Math.abs(wave(6)) * 0.08;
        this.torso.rotation.y = wave(3) * 0.4;
        set(L, (1.2 + wave(6) * 1.2) * ease, 0, -0.4); set(Rt, (1.2 - wave(6) * 1.2) * ease, 0, 0.4);
        le.rotation.x = 1.2; re.rotation.x = 1.2;
        this.legs[0].rotation.x = Math.max(0, wave(6)) * 0.6; this.legs[1].rotation.x = Math.max(0, -wave(6)) * 0.6;
        this.head.rotation.z = wave(6) * 0.15;
        break;
      }
      case 'pushups': {
        const k = Math.min(1, t * 3, (e.dur - t) * 3), down = (1 - Math.cos(t * 5)) / 2;
        this.body.rotation.x = -1.42 * k;
        this.body.position.y = (0.28 - down * 0.14) * k;
        set(L, Math.PI * 0.5 * k, 0, -0.25 * k); set(Rt, Math.PI * 0.5 * k, 0, 0.25 * k);
        le.rotation.x = down * 1.1 * k; re.rotation.x = down * 1.1 * k;
        break;
      }
      case 'flex': set(L, 0.2, 0, -1.6 * ease); set(Rt, 0.2, 0, 1.6 * ease); le.rotation.z = -(1.7 + wave(5) * 0.15) * ease; re.rotation.z = (1.7 + wave(5) * 0.15) * ease; this.torso.rotation.x = -0.1 * ease; break;
      default: break;
    }
  }

  // state: {speed (m/s), crouch 0..1, pitch, onGround, firing}
  update(dt, st) {
    if (this.emote) {
      this.emote.t += dt;
      if (this.emote.t >= this.emote.dur || this.dead || st.speed > 1.2 || st.firing) this.stopEmote();
      else { this._emotePose(this.emote, dt); return; }
    }
    if (this.dead) {
      this.deathT = Math.min(1, this.deathT + dt * 2.2);
      const e = 1 - Math.pow(1 - this.deathT, 3);
      this.body.rotation.x = e * (Math.PI / 2) * this.deathDir;
      this.body.position.y = e * 0.15;
      return;
    }
    const sp = Math.min(1.4, st.speed / 5.5);
    this.phase += dt * (3 + st.speed * 1.6);
    const swing = Math.sin(this.phase) * 0.6 * sp;
    const cr = st.crouch;
    const air = st.onGround === false;
    // Crouch depth matches the crouched camera and head hitbox (the eye drops 0.5 m).
    this.legs[0].rotation.x = air ? -0.5 : swing - cr * 1.4;
    this.legs[1].rotation.x = air ? 0.2 : -swing - cr * 1.4;
    this.legs[0].userData.knee.rotation.x = air ? 0.9 : Math.max(0, -Math.sin(this.phase) * 0.9 * sp) + cr * 2.5;
    this.legs[1].userData.knee.rotation.x = air ? 0.4 : Math.max(0, Math.sin(this.phase) * 0.9 * sp) + cr * 2.5;
    this.body.position.y = (-cr * 0.52 + Math.abs(Math.cos(this.phase)) * 0.03 * sp) * this.scale;
    // Only a slight lean with aim pitch, so the head stays where its hitbox is.
    this.torso.rotation.x = -cr * 0.25 + st.pitch * 0.12;
    this.head.rotation.x = st.pitch * 0.5;
    // arms aim the weapon
    const pistol = this.pistolPose;
    // Shoulders rotate the hanging arm forward (+X rotation swings -Y toward -Z).
    const aimX = Math.PI / 2 - 0.2 + st.pitch * 0.6;
    const kick = st.firing ? 0.08 : 0;
    this.arms[1].rotation.set(aimX + kick - (pistol ? 0.05 : 0.45), 0, pistol ? -0.3 : -0.1);
    this.arms[1].userData.elbow.rotation.x = pistol ? 0.1 : 0.9;
    this.arms[0].rotation.set(aimX + kick - (pistol ? 0.05 : 0.1), 0, pistol ? 0.45 : 0.55);
    this.arms[0].userData.elbow.rotation.x = pistol ? 0.1 : 0.25;
    this.arms[0].userData.elbow.rotation.z = 0;
    this.gunHolder.rotation.x = st.pitch * 0.6 + kick * 0.5;
  }

  die(dir = 1) { this.dead = true; this.deathT = 0; this.deathDir = dir; }
  revive() { this.dead = false; this.body.rotation.set(0, 0, 0); this.body.position.y = 0; }

  dispose() {
    this.root.removeFromParent();
  }
}
