import * as THREE from 'three';

function radialTexture(inner, outer, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function smokeTexture() {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.4, y = s / 2 + (Math.random() - 0.5) * s * 0.4, r = s * (0.15 + Math.random() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
  }
  return new THREE.CanvasTexture(c);
}

// Short-lived visual effects with pooling so the frame rate stays stable.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.smokes = [];
    this.flashTex = radialTexture('rgba(255,240,200,1)', 'rgba(255,140,30,0)');
    this.sparkTex = radialTexture('rgba(255,230,160,1)', 'rgba(255,160,60,0)', 32);
    this.dustTex = radialTexture('rgba(200,190,170,0.8)', 'rgba(200,190,170,0)', 32);
    this.bloodTex = radialTexture('rgba(140,10,10,0.95)', 'rgba(90,0,0,0)', 32);
    this.fireTex = radialTexture('rgba(255,220,140,1)', 'rgba(255,80,10,0)', 64);
    this.smokeTex = smokeTexture();

    this.light = new THREE.PointLight(0xffb060, 0, 10, 2);
    scene.add(this.light);
    this.lightT = 0;

    this.tracerGeo = new THREE.BoxGeometry(0.012, 0.012, 1);
    this.tracerGeo.translate(0, 0, -0.5);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, toneMapped: false });

    this.decalGeo = new THREE.PlaneGeometry(0.09, 0.09);
    this.decalMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(15,12,10,0.95)', 'rgba(15,12,10,0)', 32), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.decals = [];
  }

  sprite(tex, pos, size, life, opts = {}) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, color: opts.color ?? 0xffffff, toneMapped: !opts.additive });
    const s = new THREE.Sprite(m);
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.scene.add(s);
    this.items.push({ obj: s, life, max: life, vel: opts.vel || null, grow: opts.grow || 0, grav: opts.grav || 0, fade: true });
    return s;
  }

  muzzle(pos, big = 1) {
    this.sprite(this.flashTex, pos, 0.35 * big, 0.05, { additive: true });
    this.light.position.copy(pos);
    this.light.intensity = 6 * big;
    this.lightT = 0.05;
  }

  tracer(from, to) {
    const len = from.distanceTo(to);
    if (len < 1.5) return;
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(1, 1, Math.min(len, 6));
    this.scene.add(m);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    this.items.push({ obj: m, life: Math.min(0.12, len / 280), max: 0.12, vel: dir.multiplyScalar(280), fade: true, mat: m.material });
  }

  impact(point, normal, { blood = false } = {}) {
    if (blood) {
      for (let i = 0; i < 5; i++) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2);
        this.sprite(this.bloodTex, point, 0.18 + Math.random() * 0.15, 0.35, { vel: v, grow: 0.4, grav: 6 });
      }
      return;
    }
    for (let i = 0; i < 6; i++) {
      const v = normal.clone().multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3));
      this.sprite(this.sparkTex, point, 0.05, 0.18 + Math.random() * 0.1, { vel: v, grav: 12, additive: true });
    }
    this.sprite(this.dustTex, point.clone().addScaledVector(normal, 0.05), 0.25, 0.5, { vel: normal.clone().multiplyScalar(0.6), grow: 1.2 });
    // decal
    const d = new THREE.Mesh(this.decalGeo, this.decalMat);
    d.position.copy(point).addScaledVector(normal, 0.01);
    d.lookAt(point.clone().add(normal));
    d.rotation.z = Math.random() * 6.28;
    this.scene.add(d);
    this.decals.push(d);
    if (this.decals.length > 120) this.decals.shift().removeFromParent();
  }

  explosion(pos) {
    for (let i = 0; i < 14; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8);
      this.sprite(this.fireTex, pos, 1.2 + Math.random(), 0.45, { vel: v, grow: 2.5, additive: true });
    }
    for (let i = 0; i < 10; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3);
      this.sprite(this.smokeTex, pos, 2, 2.2, { vel: v, grow: 2, color: 0x55504a });
    }
    this.light.position.copy(pos).y += 1;
    this.light.intensity = 60; this.light.distance = 25;
    this.lightT = 0.25;
  }

  // Smoke grenade cloud. Returned object is used for line-of-sight blocking.
  smoke(pos, radius, duration) {
    const group = new THREE.Group();
    const parts = [];
    for (let i = 0; i < 46; i++) {
      const m = new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, color: 0xb9bcc0, opacity: 0 });
      const s = new THREE.Sprite(m);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius * 0.8;
      s.userData.target = new THREE.Vector3(Math.cos(a) * r, 0.4 + Math.random() * 2.8, Math.sin(a) * r);
      s.position.set(0, 0.3, 0);
      s.scale.setScalar(3.2 + Math.random() * 1.6);
      group.add(s); parts.push(s);
    }
    group.position.copy(pos);
    this.scene.add(group);
    const cloud = { pos: pos.clone().setY(pos.y + 1.6), radius, t: 0, duration, group, parts };
    this.smokes.push(cloud);
    return cloud;
  }

  // True if the segment a→b passes through an active smoke cloud.
  smokeBlocks(a, b) {
    for (const s of this.smokes) {
      if (s.t < 0.8) continue;
      const ab = new THREE.Vector3().subVectors(b, a), len = ab.length();
      ab.divideScalar(len);
      const t = Math.max(0, Math.min(len, new THREE.Vector3().subVectors(s.pos, a).dot(ab)));
      const closest = a.clone().addScaledVector(ab, t);
      if (closest.distanceTo(s.pos) < s.radius * 0.85) return true;
    }
    return false;
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        it.obj.removeFromParent();
        it.obj.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      if (it.vel) { it.vel.y -= it.grav * dt; it.obj.position.addScaledVector(it.vel, dt); }
      if (it.grow) it.obj.scale.multiplyScalar(1 + it.grow * dt);
      if (it.fade) it.obj.material.opacity = Math.min(1, (it.life / it.max) * 1.5);
    }
    if (this.lightT > 0) { this.lightT -= dt; if (this.lightT <= 0) { this.light.intensity = 0; this.light.distance = 10; } }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      const fadeIn = Math.min(1, s.t / 1.2), fadeOut = Math.min(1, (s.duration - s.t) / 2.5);
      for (const p of s.parts) {
        p.position.lerp(p.userData.target, Math.min(1, dt * 2));
        p.material.opacity = 0.85 * Math.min(fadeIn, fadeOut);
        p.material.rotation += dt * 0.05;
      }
      if (s.t >= s.duration) {
        s.group.removeFromParent();
        s.parts.forEach((p) => p.material.dispose());
        this.smokes.splice(i, 1);
      }
    }
  }

  clearRound() {
    for (const s of this.smokes) s.group.removeFromParent();
    this.smokes = [];
  }
}
