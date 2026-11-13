import * as THREE from 'three';
import { CharacterModel, buildGun } from '../engine/models.js';

// Small standalone renderer that shows a rotating operator in the menus.
export class CharacterPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 1.25, 4.6);
    this.camera.lookAt(0, 1.0, 0);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a241e, 1.3));
    const key = new THREE.DirectionalLight(0xfff0dd, 2.6);
    key.position.set(2.5, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xf2a33a, 1.6);
    rim.position.set(-3, 2, -3);
    this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), new THREE.MeshStandardMaterial({ color: 0x1a1f26, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // Models face -Z and the camera sits at +Z, so π is straight-on. Start just off the front
    // (three-quarter view) and sway gently around wherever the player last left it.
    this.FRONT = Math.PI - 0.35;
    this.base = this.FRONT;
    this.yaw = this.FRONT;
    this.swayT = 0;
    this.drag = null;
    canvas.addEventListener('pointerdown', (e) => { this.drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (this.drag !== null) { this.yaw += (e.clientX - this.drag) * 0.01; this.drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => { this.drag = null; this.base = this.yaw; this.swayT = 0; });
    this.running = true;
    this.last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.resize();
      if (this.drag === null) { this.swayT += dt; this.yaw = this.base + Math.sin(this.swayT * 0.45) * 0.38; }
      if (this.model) {
        this.model.root.rotation.y = this.yaw;
        this.model.update(dt, { speed: 0, crouch: 0, pitch: 0, onGround: true, firing: false });
      }
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.floor(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  // Back to the front-facing view (used whenever a new item or operator is selected).
  resetView() { this.base = this.FRONT; this.yaw = this.FRONT; this.swayT = 0; }

  setCharacter(c, weapon = 'ar7') {
    if (this.model) this.model.root.removeFromParent();
    this.model = new CharacterModel(c, { team: -1 });
    this.model.setWeapon(weapon);
    this.scene.add(this.model.root);
  }

  dispose() {
    this.running = false;
    this.renderer.dispose();
  }
}

export { buildGun };
