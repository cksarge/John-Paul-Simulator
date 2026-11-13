import * as THREE from 'three';

// Camera used by spectators, the kill cam and the replay viewer.
// Modes: 'follow' (third person behind the target), 'pov' (the target's own view), 'free' (fly anywhere).
export const CAM_MODES = ['follow', 'pov', 'free'];
export const CAM_LABELS = { follow: 'Third person', pov: 'First person', free: 'Free camera' };

export class SpectatorCam {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.mode = 'follow';
    this.free = { pos: new THREE.Vector3(world.size.x / 2, 12, world.size.z / 2), yaw: 0, pitch: -0.6 };
    this.smooth = new THREE.Vector3();
    this.hasSmooth = false;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    // Start free flight from wherever the camera is now.
    if (mode === 'free') {
      this.free.pos.copy(this.camera.position);
      const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
      this.free.yaw = Math.atan2(-d.x, -d.z); this.free.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    }
    this.mode = mode;
    this.hasSmooth = false;
  }

  cycle() { this.setMode(CAM_MODES[(CAM_MODES.indexOf(this.mode) + 1) % CAM_MODES.length]); return this.mode; }

  // target: {pos: Vector3 (feet), yaw, pitch, crouch} or null. input: {keys:Set, dx, dy, locked} for free flight.
  update(dt, target, input) {
    const cam = this.camera;
    cam.rotation.order = 'YXZ';
    if (this.mode === 'free' || !target) {
      const f = this.free;
      if (input?.locked) { f.yaw -= input.dx * 0.0022; f.pitch = THREE.MathUtils.clamp(f.pitch - input.dy * 0.0022, -1.5, 1.5); }
      const k = input?.keys || new Set();
      const speed = (k.has('ShiftLeft') ? 22 : 9) * dt;
      const fwd = new THREE.Vector3(-Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), -Math.cos(f.yaw) * Math.cos(f.pitch));
      const right = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
      if (k.has('KeyW')) f.pos.addScaledVector(fwd, speed);
      if (k.has('KeyS')) f.pos.addScaledVector(fwd, -speed);
      if (k.has('KeyD')) f.pos.addScaledVector(right, speed);
      if (k.has('KeyA')) f.pos.addScaledVector(right, -speed);
      if (k.has('Space')) f.pos.y += speed;
      if (k.has('KeyC') || k.has('ControlLeft')) f.pos.y -= speed;
      f.pos.y = THREE.MathUtils.clamp(f.pos.y, 0.4, 60);
      cam.position.copy(f.pos);
      cam.rotation.set(f.pitch, f.yaw, 0);
      return;
    }
    const eye = target.pos.clone().setY(target.pos.y + 1.64 - (target.crouch || 0) * 0.5);
    if (this.mode === 'pov') {
      cam.position.copy(eye);
      cam.rotation.set(target.pitch || 0, target.yaw, 0);
      this.hasSmooth = false;
      return;
    }
    const back = new THREE.Vector3(Math.sin(target.yaw), 0, Math.cos(target.yaw)).multiplyScalar(2.7);
    const want = eye.clone().add(back).add(new THREE.Vector3(0, 0.5, 0));
    const dir = want.clone().sub(eye), len = dir.length();
    const hit = this.world.raycast(eye, dir.normalize(), len);
    const pos = hit ? eye.clone().addScaledVector(dir, Math.max(0.3, hit.dist - 0.25)) : want;
    if (!this.hasSmooth) { this.smooth.copy(pos); this.hasSmooth = true; }
    this.smooth.lerp(pos, Math.min(1, dt * 12));
    cam.position.copy(this.smooth);
    const look = eye.clone().add(new THREE.Vector3(-Math.sin(target.yaw), Math.sin(target.pitch || 0) * 0.6, -Math.cos(target.yaw)).multiplyScalar(6));
    cam.lookAt(look);
  }
}
