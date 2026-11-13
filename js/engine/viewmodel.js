import * as THREE from 'three';
import { buildGun } from './models.js';
import { WEAPONS, GRENADES, PROJECTILES } from '../data/weapons.js';

const OFFSETS = {
  knife: [0.24, -0.24, -0.46], p9: [0.17, -0.17, -0.5], magnum: [0.17, -0.18, -0.52],
  vex: [0.19, -0.19, -0.5], breacher: [0.2, -0.22, -0.5], ar7: [0.2, -0.21, -0.52],
  m5: [0.2, -0.21, -0.52], longshot: [0.2, -0.22, -0.5], he: [0.2, -0.2, -0.46],
  smoke: [0.2, -0.2, -0.46], bomb: [0.1, -0.28, -0.52],
  viper: [0.17, -0.17, -0.5], tac45: [0.17, -0.17, -0.5], kestrel: [0.19, -0.19, -0.5],
  reaper: [0.2, -0.22, -0.5], bulldog: [0.21, -0.23, -0.52], trident: [0.19, -0.2, -0.48],
  falcon: [0.2, -0.21, -0.52], sparrow: [0.2, -0.21, -0.5],
};
// Defaults by weapon class for anything without a hand-tuned offset.
const CLASS_OFFSETS = {
  pistol: [0.17, -0.17, -0.5], knife: [0.24, -0.24, -0.46], smg: [0.19, -0.19, -0.5], shotgun: [0.2, -0.22, -0.5],
  rifle: [0.2, -0.21, -0.52], lmg: [0.21, -0.23, -0.52], sniper: [0.2, -0.21, -0.5], other: [0.2, -0.22, -0.5], nade: [0.2, -0.2, -0.46],
};
const typeOf = (id) => WEAPONS[id]?.type || (GRENADES[id] || PROJECTILES[id] ? 'nade' : null);
const isPistol = (id) => typeOf(id) === 'pistol';
const isOneHand = (id) => typeOf(id) === 'knife' || typeOf(id) === 'nade';

function sleeve(len, mat, glove) {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, len), mat);
  s.position.z = len / 2 + 0.04;
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.06, 0.1), glove);
  h.position.z = 0.0;
  g.add(s, h);
  return g;
}

// First-person weapon and arms, rendered in their own scene on top of the world.
export class Viewmodel {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.sway = new THREE.Vector2();
    this.bobT = 0;
    this.kick = 0;
    this.kickRot = 0;
    this.swing = 0;
    this.flashMat = new THREE.SpriteMaterial({
      map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,245,210,1)'); gr.addColorStop(0.3, 'rgba(255,190,90,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.flash = new THREE.Sprite(this.flashMat);
    this.flash.visible = false;
    this.flashT = 0;
  }

  setWeapon(id, char) {
    this.root.clear();
    this.inspectT = -1;
    this.id = id;
    this.skin = char?.skins?.[id] || null;
    if (!id) return;
    const gun = buildGun(id, char?.skins?.[id]);
    gun.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    const sleeveM = new THREE.MeshStandardMaterial({ color: char?.top || '#3a4658', roughness: 0.85 });
    const gloveM = new THREE.MeshStandardMaterial({ color: char?.gloves || '#1d1d1f', roughness: 0.7 });
    const right = sleeve(0.5, sleeveM, gloveM);
    right.position.set(0.01, -0.06, 0.04);
    right.rotation.set(0.5, 0.12, 0);
    gun.add(right);
    if (!isOneHand(id)) {
      const left = sleeve(0.55, sleeveM, gloveM);
      const pistol = isPistol(id);
      left.position.set(pistol ? -0.025 : -0.03, pistol ? -0.06 : -0.02, pistol ? 0.02 : -0.3);
      left.rotation.set(pistol ? 0.5 : 0.35, pistol ? -0.35 : -0.55, 0);
      gun.add(left);
    }
    this.gun = gun;
    this.flash.position.copy(gun.userData.muzzle).add(new THREE.Vector3(0, 0, -0.03));
    gun.add(this.flash);
    this.holder = new THREE.Group();
    this.holder.add(gun);
    this.holder.scale.setScalar(0.8);
    this.root.add(this.holder);
    this.base = new THREE.Vector3(...(OFFSETS[id] || CLASS_OFFSETS[typeOf(id)] || OFFSETS.ar7));
    this.drawT = 0;
  }

  fire(strength = 1, flash = true) {
    this.inspectT = -1;
    this.kick = Math.min(0.08, this.kick + 0.035 * strength);
    this.kickRot = Math.min(0.25, this.kickRot + 0.08 * strength);
    if (flash && typeOf(this.id) !== 'knife') {
      this.flash.visible = true;
      this.flash.scale.setScalar(0.12 + Math.random() * 0.06);
      this.flash.material.rotation = Math.random() * 6;
      this.flashT = 0.04;
    }
  }

  swingKnife(heavy) { this.swing = heavy ? 1.6 : 1; this.swingHeavy = heavy; this.inspectT = -1; }

  // Weapon inspect: turns the gun to show its finish, then the other side; knives get a flip.
  inspect() {
    if (!this.holder || typeOf(this.id) === 'nade' || this.id === 'bomb') return false;
    this.inspectT = 0;
    this.inspectDur = typeOf(this.id) === 'knife' ? 2.4 : 3.0;
    return true;
  }
  get inspecting() { return this.inspectT >= 0; }

  inspectPose(t, knife) {
    const ease = (x) => x * x * (3 - 2 * x);
    const seg = (a, b) => ease(THREE.MathUtils.clamp((t - a) / (b - a), 0, 1));
    const into = seg(0, 0.18), out = seg(0.84, 1), mid = seg(0.4, 0.62);
    const k = into * (1 - out);
    // Bring the gun toward the centre and tilt it to show the right side, then roll to the left side.
    const ry = k * (-1.05 + mid * 1.9), rz = k * (0.25 - mid * 0.65), rx = k * (0.18 + Math.sin(t * Math.PI * 2) * 0.04);
    const pos = new THREE.Vector3(-k * 0.13, k * 0.05, k * 0.06);
    let spin = 0;
    if (knife) spin = seg(0.42, 0.66) * Math.PI * 2 * k; // a full flip around the blade
    return { rx, ry, rz: rz + spin, pos };
  }

  // st: {speed, onGround, lookDX, lookDY, reload (0..1 or -1), scoped, crouch, calm, dt}
  update(dt, st) {
    if (!this.holder) return;
    this.root.visible = !st.scoped && !st.hidden;
    this.drawT = Math.min(1, this.drawT + dt / (st.drawTime || 0.6));
    const draw = 1 - Math.pow(1 - this.drawT, 3);
    // Reduce motion (st.calm) keeps the weapon still: no bob while moving and no sway when turning.
    const moving = st.onGround && !st.calm ? Math.min(1, st.speed / 5) : 0, swayK = st.calm ? 0 : 0.0006;
    this.bobT += dt * (6 + st.speed * 1.2);
    const bobX = Math.sin(this.bobT) * 0.012 * moving, bobY = Math.abs(Math.cos(this.bobT)) * 0.012 * moving;
    this.sway.x += (THREE.MathUtils.clamp(-st.lookDX * swayK, -0.04, 0.04) - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (THREE.MathUtils.clamp(st.lookDY * swayK, -0.04, 0.04) - this.sway.y) * Math.min(1, dt * 10);
    this.kick += (0 - this.kick) * Math.min(1, dt * 14);
    this.kickRot += (0 - this.kickRot) * Math.min(1, dt * 12);
    const airY = st.onGround ? 0 : -0.015;
    this.holder.position.set(
      this.base.x + bobX + this.sway.x,
      this.base.y - bobY + this.sway.y + airY - (1 - draw) * 0.3,
      this.base.z + this.kick,
    );
    let rx = this.kickRot - (1 - draw) * 0.8, rz = this.sway.x * 2, ry = 0;
    if (st.reload >= 0) {
      const r = Math.sin(st.reload * Math.PI);
      rx -= r * 0.6; rz += r * 0.5;
      this.holder.position.y -= r * 0.08;
    }
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * (this.swingHeavy ? 2.5 : 4));
      const s = Math.sin((1 - this.swing / (this.swingHeavy ? 1.6 : 1)) * Math.PI);
      ry += s * (this.swingHeavy ? 0.2 : 0.9);
      rx -= s * (this.swingHeavy ? 0.9 : 0.2);
      this.holder.position.z -= s * 0.12;
    }
    if (this.inspectT >= 0) {
      if (st.reload >= 0 || st.scoped) this.inspectT = -1;
      else {
        this.inspectT += dt;
        const t = this.inspectT / this.inspectDur;
        if (t >= 1) this.inspectT = -1;
        else {
          const p = this.inspectPose(t, typeOf(this.id) === 'knife');
          rx += p.rx; ry += p.ry; rz += p.rz;
          this.holder.position.add(p.pos);
        }
      }
    }
    this.holder.rotation.set(rx, ry, rz);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
  }
}
