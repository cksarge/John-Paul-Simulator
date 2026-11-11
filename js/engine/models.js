import * as THREE from 'three';
import { TEAM_COLORS } from '../data/modes.js';

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

function part(g, w, h, d, x, y, z, mat, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gm(mat));
  m.position.set(x, y, z); m.rotation.x = rx;
  m.castShadow = true;
  g.add(m);
  return m;
}
function cyl(g, r, len, x, y, z, mat, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), gm(mat));
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

// Weapon model pointing down -Z, grip roughly at the origin.
export function buildGun(id) {
  const g = new THREE.Group();
  let muzzle = new THREE.Vector3(0, 0.03, -0.3);
  switch (id) {
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
export class CharacterModel {
  constructor(c, { team = -1 } = {}) {
    this.c = c;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const s = c.height || 1;
    this.body.scale.setScalar(s);
    const bw = c.build === 'heavy' ? 1.14 : c.build === 'slim' ? 0.9 : 1;

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
    if (id === this.weaponId) return;
    this.weaponId = id;
    this.gunHolder.clear();
    if (!id) return;
    const g = buildGun(id);
    g.scale.setScalar(1.05);
    this.gunHolder.add(g);
    const pistol = id === 'p9' || id === 'magnum' || id === 'knife' || id === 'he' || id === 'smoke' || id === 'bomb';
    this.pistolPose = pistol;
    this.gunHolder.position.set(pistol ? 0.02 : 0.1, pistol ? 0.36 : 0.28, pistol ? -0.42 : -0.3);
  }

  // state: {speed (m/s), crouch 0..1, pitch, onGround, firing}
  update(dt, st) {
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
    this.legs[0].rotation.x = air ? -0.5 : swing - cr * 1.1;
    this.legs[1].rotation.x = air ? 0.2 : -swing - cr * 1.1;
    this.legs[0].userData.knee.rotation.x = air ? 0.9 : Math.max(0, -Math.sin(this.phase) * 0.9 * sp) + cr * 1.9;
    this.legs[1].userData.knee.rotation.x = air ? 0.4 : Math.max(0, Math.sin(this.phase) * 0.9 * sp) + cr * 1.9;
    this.body.position.y = -cr * 0.36 + Math.abs(Math.cos(this.phase)) * 0.03 * sp;
    this.torso.rotation.x = -cr * 0.25 + st.pitch * 0.35;
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
