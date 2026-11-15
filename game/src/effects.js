// SOLARIS — effects: pooled tracers, impact sparks, shells, smoke, explosions.
// Everything is preallocated; update() reuses the same objects every frame.
import * as THREE from 'three';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // tracers: thin glowing boxes, stretched between two points
    this.tracers = [];
    const tGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    // sparks: small additive quads with velocity
    this.sparks = [];
    const sGeo = new THREE.PlaneGeometry(0.09, 0.09);
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m);
      this.sparks.push({ mesh: m, vel: new THREE.Vector3(), life: 0, spin: 0 });
    }
    // shells
    this.shells = [];
    const shGeo = new THREE.BoxGeometry(0.03, 0.03, 0.07);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(shGeo, new THREE.MeshStandardMaterial({ color: 0xd8a83c, roughness: 0.3, metalness: 0.9 }));
      m.visible = false; scene.add(m);
      this.shells.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
    }
    // smoke puffs (also used for the smoke grenade screen)
    this.smokes = [];
    const smGeo = new THREE.SphereGeometry(1, 12, 10);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(smGeo, new THREE.MeshStandardMaterial({ color: 0xcfc8bd, transparent: true, opacity: 0, roughness: 1, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.smokes.push({ mesh: m, life: 0, max: 1, grow: 1, x: 0, z: 0, r: 1 });
    }
    // explosion flash light + ring
    this.flash = new THREE.PointLight(0xffa040, 0, 14, 1.6); scene.add(this.flash);
    this.flashLife = 0;
    this.muzzleLight = new THREE.PointLight(0xffc861, 0, 7, 1.8); scene.add(this.muzzleLight);
    this.muzzleLife = 0;
  }
  tracer(a, b, color = 0xffd27a) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const m = t.mesh;
    m.visible = true; m.material.color.setHex(color);
    _v1.copy(b).sub(a);
    const len = _v1.length();
    m.position.copy(a).addScaledVector(_v1, 0.5);
    m.lookAt(b); m.scale.set(1, 1, len);
    m.material.opacity = 0.9; t.life = 0.07;
  }
  impact(p, surface = 'sand') {
    const n = surface === 'metal' ? 7 : surface === 'concrete' ? 6 : 5;
    const col = surface === 'metal' ? 0xffe9a8 : surface === 'concrete' ? 0xd8d2c8 : 0xe8b878;
    for (let i = 0; i < n; i++) {
      const s = this.sparks.find((x) => x.life <= 0); if (!s) break;
      s.mesh.visible = true; s.mesh.material.color.setHex(col);
      s.mesh.position.copy(p);
      s.vel.set((Math.random() - 0.5) * 5, Math.random() * 4 + 1, (Math.random() - 0.5) * 5);
      s.mesh.material.opacity = 1; s.life = 0.25 + Math.random() * 0.25; s.spin = (Math.random() - 0.5) * 12;
    }
  }
  hitSpark(p) { // red-orange confirmation on a person hit
    for (let i = 0; i < 4; i++) {
      const s = this.sparks.find((x) => x.life <= 0); if (!s) break;
      s.mesh.visible = true; s.mesh.material.color.setHex(0xff5a3c);
      s.mesh.position.copy(p);
      s.vel.set((Math.random() - 0.5) * 3, Math.random() * 2 + 0.5, (Math.random() - 0.5) * 3);
      s.mesh.material.opacity = 1; s.life = 0.3; s.spin = 0;
    }
  }
  shell(pos, right) {
    const s = this.shells.find((x) => x.life <= 0); if (!s) return;
    s.mesh.visible = true; s.mesh.position.copy(pos);
    s.vel.set(right.x * (1 + Math.random()), 2 + Math.random(), right.z * (1 + Math.random()));
    s.life = 1.4;
  }
  smoke(x, z, r = 4.5, dur = 14) {
    // a lingering screen: 5 puffs that grow and fade over `dur` seconds
    let placed = 0;
    for (const s of this.smokes) {
      if (s.life > 0) continue;
      s.mesh.visible = true;
      const a = (placed / 5) * Math.PI * 2, rr = Math.random() * r * 0.5;
      s.mesh.position.set(x + Math.cos(a) * rr, 1.1 + Math.random() * 0.6, z + Math.sin(a) * rr);
      s.mesh.scale.setScalar(0.6);
      s.mesh.material.opacity = 0.85; s.life = dur; s.max = dur; s.grow = r / 5;
      s.x = x; s.z = z; s.r = r; placed++;
      if (placed >= 5) break;
    }
  }
  explosion(p) {
    this.flash.position.copy(p); this.flash.position.y = p.y + 1;
    this.flash.intensity = 60; this.flashLife = 0.35;
    for (let i = 0; i < 16; i++) {
      const s = this.sparks.find((x) => x.life <= 0); if (!s) break;
      s.mesh.visible = true; s.mesh.material.color.setHex(i % 3 ? 0xffa040 : 0xff5a20);
      s.mesh.position.copy(p);
      s.vel.set((Math.random() - 0.5) * 11, Math.random() * 7 + 2, (Math.random() - 0.5) * 11);
      s.mesh.material.opacity = 1; s.life = 0.5 + Math.random() * 0.3; s.spin = (Math.random() - 0.5) * 14;
    }
    this.smoke(p.x, p.z, 3.5, 6);
  }
  muzzle(p) { this.muzzleLight.position.copy(p); this.muzzleLight.intensity = 14; this.muzzleLife = 0.05; }
  // does the segment a->b cross any live smoke screen?
  smokeBlocks(a, b) {
    for (const s of this.smokes) {
      if (s.life <= 0) continue;
      // segment-sphere test against the puff
      _v1.copy(b).sub(a);
      const len = _v1.length(); if (len < 1e-6) continue;
      _v1.divideScalar(len);
      _v2.copy(s.mesh.position).sub(a);
      const t = Math.max(0, Math.min(len, _v2.dot(_v1)));
      const px = a.x + _v1.x * t, py = a.y + _v1.y * t, pz = a.z + _v1.z * t;
      const dx = px - s.mesh.position.x, dy = py - s.mesh.position.y, dz = pz - s.mesh.position.z;
      const rad = s.mesh.scale.x * 1.1;
      if (dx * dx + dy * dy + dz * dz < rad * rad) return true;
    }
    return false;
  }
  update(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 12 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.mesh.position.y < 0.03) { s.mesh.position.y = 0.03; s.vel.y *= -0.3; s.vel.x *= 0.7; s.vel.z *= 0.7; }
      s.mesh.rotation.z += s.spin * dt;
      s.mesh.material.opacity = Math.max(0, s.life / 0.5);
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.mesh.position.y < 0.04) { s.mesh.position.y = 0.04; s.vel.y *= -0.35; s.vel.x *= 0.6; s.vel.z *= 0.6; }
      s.mesh.rotation.x += 9 * dt; s.mesh.rotation.z += 7 * dt;
      if (s.life <= 0) s.mesh.visible = false;
    }
    for (const s of this.smokes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.mesh.scale.x = Math.min(s.grow * 2.2, s.mesh.scale.x + s.grow * dt);
      s.mesh.scale.y = s.mesh.scale.x * 0.85; s.mesh.scale.z = s.mesh.scale.x;
      s.mesh.material.opacity = Math.max(0, Math.min(0.85, (s.life / s.max) * 1.7));
      if (s.life <= 0) s.mesh.visible = false;
    }
    if (this.flashLife > 0) { this.flashLife -= dt; this.flash.intensity = Math.max(0, this.flashLife / 0.35) * 60; }
    if (this.muzzleLife > 0) { this.muzzleLife -= dt; this.muzzleLight.intensity = Math.max(0, this.muzzleLife / 0.05) * 14; }
  }
}
