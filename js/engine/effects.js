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
    this.fires = [];
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

  // Rail shot: a bright line that lingers briefly.
  beam(from, to) {
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    for (const [w, color, life] of [[0.05, 0x6fc8ff, 0.35], [0.016, 0xffffff, 0.25]]) {
      const m = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.copy(from); m.lookAt(to);
      m.scale.set(w / 0.012, w / 0.012, len);
      this.scene.add(m);
      this.items.push({ obj: m, life, max: life, fade: true });
    }
    this.light.position.copy(from); this.light.color.set(0x6fc8ff); this.light.intensity = 10; this.lightT = 0.08;
  }

  shatter(pos) {
    for (let i = 0; i < 26; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 2.5, (Math.random() - 0.5) * 5);
      this.sprite(this.sparkTex, pos.clone().add(new THREE.Vector3(0, (Math.random() - 0.5) * 2, 0)), 0.07 + Math.random() * 0.06, 0.7, { vel: v, grav: 14, color: 0xcfe8ff });
    }
  }

  flash(pos) {
    this.sprite(this.flashTex, pos, 6, 0.25, { additive: true, color: 0xffffff });
    this.sprite(this.sparkTex, pos, 2.5, 0.5, { additive: true, grow: 1 });
    this.light.position.copy(pos); this.light.color.set(0xffffff);
    this.light.intensity = 120; this.light.distance = 30; this.lightT = 0.12;
  }

  // Burning area. Returns a handle the game passes back to endFire.
  fire(pos, radius, duration) {
    const group = new THREE.Group();
    group.position.copy(pos);
    const parts = [];
    const n = Math.round(radius * radius * 3.2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius * 0.92;
      const m = new THREE.SpriteMaterial({ map: this.fireTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: 0xffa040 });
      const sp = new THREE.Sprite(m);
      sp.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
      sp.userData = { base: 0.55 + Math.random() * 0.6, ph: Math.random() * 10, sp: 6 + Math.random() * 6 };
      group.add(sp); parts.push(sp);
    }
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.02;
    group.add(scorch);
    const light = new THREE.PointLight(0xff7a2a, 0, radius * 4, 2);
    light.position.y = 0.8;
    group.add(light);
    this.scene.add(group);
    const f = { group, parts, light, life: duration, t: 0, emberT: 0, pos: pos.clone(), radius };
    this.fires.push(f);
    return f;
  }

  endFire(f) {
    if (!f) return;
    f.group.removeFromParent();
    f.parts.forEach((p) => p.material.dispose());
    this.fires = this.fires.filter((x) => x !== f);
  }

  // True if a smoke cloud covers `pos` (smoke puts out incendiaries).
  smokeCovers(pos) {
    return this.smokes.some((s) => s.t > 0.3 && Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z) < s.radius);
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
    if (this.lightT > 0) { this.lightT -= dt; if (this.lightT <= 0) { this.light.intensity = 0; this.light.distance = 10; this.light.color.set(0xffb060); } }
    for (const f of this.fires) {
      f.t += dt;
      const k = Math.min(1, f.t * 4) * Math.min(1, f.life / 1.2);
      for (const p of f.parts) {
        const u = p.userData, flick = 0.75 + Math.sin(f.t * u.sp + u.ph) * 0.25;
        p.scale.set(u.base * flick * k, u.base * 1.6 * flick * k, 1);
        p.position.y = 0.25 + u.base * 0.6 * flick;
      }
      f.light.intensity = (14 + Math.sin(f.t * 23) * 3 + Math.sin(f.t * 7) * 3) * k;
      f.emberT -= dt;
      if (f.emberT <= 0 && k > 0.3) {
        f.emberT = 0.08;
        const a = Math.random() * Math.PI * 2, r = Math.random() * f.radius;
        const at = f.pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.6, Math.sin(a) * r));
        if (Math.random() < 0.5) this.sprite(this.sparkTex, at, 0.06, 0.9, { vel: new THREE.Vector3((Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5)), additive: true });
        else this.sprite(this.smokeTex, at.setY(at.y + 1), 1.2, 1.8, { vel: new THREE.Vector3(0, 1.4, 0), grow: 0.8, color: 0x2a2624 });
      }
    }
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
