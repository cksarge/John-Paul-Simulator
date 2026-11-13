import * as THREE from 'three';
import { CharacterModel } from '../engine/models.js';
import { CELL } from '../engine/world.js';

const HOSTAGE_LOOK = { name: 'Hostage', skin: '#c99a76', hair: 'short', hairColor: '#3a2a1e', headgear: 'none', face: 'none', top: '#d8d4ca', pants: '#3b4a63', vest: 'none', vestColor: '#d8d4ca', gloves: '#c99a76', boots: '#3a2a1e' };

// Draws the hostages (kneeling with hands behind their back, or carried on an attacker's shoulder)
// and marks the attackers' spawn as the rescue zone. State comes from game.state.hostages.
export class HostageView {
  constructor(game) {
    this.g = game;
    this.models = [];
    const r = game.mapDef.spawns[0];
    const x0 = (r[0] - 1) * CELL, z0 = (r[1] - 1) * CELL, x1 = (r[2] + 2) * CELL, z1 = (r[3] + 2) * CELL;
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color: 0x3dff8f, transparent: true, opacity: 0.12, depthWrite: false }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.set((x0 + x1) / 2, game.world.heightAt((x0 + x1) / 2, (z0 + z1) / 2) + 0.03, (z0 + z1) / 2);
    zone.renderOrder = 2;
    game.scene.add(zone);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(x1 - x0, 0.02, z1 - z0)), new THREE.LineBasicMaterial({ color: 0x3dff8f, transparent: true, opacity: 0.6 }));
    edge.position.copy(zone.position);
    game.scene.add(edge);
    this.zone = [zone, edge];
  }

  ensure(n) {
    while (this.models.length < n) {
      const m = new CharacterModel(HOSTAGE_LOOK, { team: -1 });
      m.setWeapon(null);
      this.g.scene.add(m.root);
      this.models.push(m);
    }
  }

  update(dt) {
    const list = this.g.state.hostages || [];
    this.ensure(list.length);
    this.models.forEach((m, i) => {
      const h = list[i];
      m.root.visible = !!h && h.state !== 'rescued';
      if (!m.root.visible) return;
      const carrier = h.state === 'carried' ? this.g.players.get(h.carrier) : null;
      if (carrier) {
        // Over the shoulder: behind and above the carrier, facing backwards.
        const back = new THREE.Vector3(Math.sin(carrier.yaw), 0, Math.cos(carrier.yaw));
        m.root.position.copy(carrier.pos).addScaledVector(back, 0.35).setY(carrier.pos.y + 0.55 - carrier.crouch * 0.3);
        m.root.rotation.set(0, carrier.yaw + Math.PI, 0);
        m.update(dt, { speed: 0, crouch: 0.5, pitch: 0, onGround: true, firing: false });
        m.body.rotation.x = 1.25;
        // Hide your own carried hostage in first person so it doesn't block the view.
        m.root.visible = !(carrier.isLocal && !this.g.spectating?.());
      } else {
        m.root.position.set(h.pos[0], h.pos[1], h.pos[2]);
        m.root.rotation.set(0, h.yaw || 0, 0);
        m.update(dt, { speed: 0, crouch: 1, pitch: 0.3, onGround: true, firing: false });
        m.body.rotation.x = 0;
      }
      // Hands tied behind the back.
      m.arms[0].rotation.set(-0.5, 0, 0.25); m.arms[0].userData.elbow.rotation.x = -1.2;
      m.arms[1].rotation.set(-0.5, 0, -0.25); m.arms[1].userData.elbow.rotation.x = -1.2;
    });
  }

  // Nearest hostage the player could pick up, or null.
  usable(p) {
    if (p.team !== 0 || !p.alive) return null;
    const list = this.g.state.hostages || [];
    if (list.some((h) => h.carrier === p.id)) return null;
    let best = null, bd = 1.8;
    for (const h of list) {
      if (h.state !== 'idle') continue;
      const d = Math.hypot(p.pos.x - h.pos[0], p.pos.z - h.pos[2]);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  dispose() {
    for (const m of this.models) m.dispose();
    for (const z of this.zone) z.removeFromParent();
  }
}
