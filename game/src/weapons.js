// SOLARIS — weapons: five guns + two grenades. Hitscan with distance falloff,
// headshot x2, recoil bloom, move/air spread penalties, and distinct view models.
// A shooter is { pos:Vector3, yaw, pitch, eyeH, weapon, ammo:{mag,reserve}, bloom,
// reloading, reloadT, lastShot, scoped, crouch, moving, airborne }.
import * as THREE from 'three';

export const WEAPONS = {
  rifle: { name: 'VK-47 Sunspike', kind: 'rifle', price: 2700, dmg: 25, hs: 2, rate: 0.1, auto: true, mag: 25, reserve: 75, reload: 2.2, spread: 0.011, moveMul: 2.6, recoil: 0.011, kick: 0.05, range: 60, falloff: 0.75, zoom: 1 },
  smg: { name: 'Hornet', kind: 'smg', price: 1500, dmg: 18, hs: 2, rate: 0.075, auto: true, mag: 30, reserve: 90, reload: 1.9, spread: 0.02, moveMul: 1.8, recoil: 0.007, kick: 0.03, range: 35, falloff: 0.6, zoom: 1 },
  sniper: { name: 'Longshot', kind: 'sniper', price: 4750, dmg: 95, hs: 2, rate: 1.15, auto: false, mag: 5, reserve: 15, reload: 2.8, spread: 0.0012, moveMul: 6, recoil: 0.05, kick: 0.16, range: 120, falloff: 1, zoom: 4 },
  pistol: { name: 'Sidearm', kind: 'pistol', price: 0, dmg: 35, hs: 2, rate: 0.22, auto: false, mag: 8, reserve: 24, reload: 1.6, spread: 0.014, moveMul: 2, recoil: 0.009, kick: 0.04, range: 30, falloff: 0.7, zoom: 1 },
  shotgun: { name: 'Duster', kind: 'shotgun', price: 2000, dmg: 9, hs: 1.5, rate: 0.9, auto: false, mag: 6, reserve: 18, reload: 2.6, spread: 0.048, moveMul: 2.2, recoil: 0.03, kick: 0.12, range: 18, falloff: 0.45, zoom: 1, pellets: 8 },
};
export const GRENADES = {
  frag: { name: 'Frag', price: 300, dmg: 90, radius: 6 },
  smoke: { name: 'Smoke', price: 300, radius: 5 },
};
export const WEAPON_ORDER = ['rifle', 'smg', 'sniper', 'shotgun', 'pistol'];

export function freshAmmo(id) {
  const w = WEAPONS[id];
  return { mag: w.mag, reserve: w.reserve };
}

// --- ray vs AABB (colliders are {x0,z0,x1,z1,h}, y from 0 to h) ---
const _dir = new THREE.Vector3();
export function rayWall(o, d, colliders, maxDist) {
  let best = maxDist;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    let t0 = 0, t1 = best, ok = true;
    // x slab
    if (Math.abs(d.x) < 1e-9) { if (o.x < c.x0 || o.x > c.x1) ok = false; }
    else {
      let ta = (c.x0 - o.x) / d.x, tb = (c.x1 - o.x) / d.x;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false;
    }
    if (ok) {
      if (Math.abs(d.z) < 1e-9) { if (o.z < c.z0 || o.z > c.z1) ok = false; }
      else {
        let ta = (c.z0 - o.z) / d.z, tb = (c.z1 - o.z) / d.z;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false;
      }
    }
    if (ok) {
      // y slab 0..h
      if (Math.abs(d.y) < 1e-9) { if (o.y < 0 || o.y > c.h) ok = false; }
      else {
        let ta = (0 - o.y) / d.y, tb = (c.h - o.y) / d.y;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false;
      }
    }
    if (ok && t0 > 0.001 && t0 < best) best = t0;
  }
  return best;
}

// --- ray vs a person (head sphere + body capsule as two spheres) ---
// person: { pos:Vector3 (feet), eyeH, crouch } — head center y = eyeH-0.15, body center y = 0.9
export function rayPerson(o, d, p, maxDist) {
  const headY = p.pos.y + (p.crouch ? 1.05 : 1.45);
  const bodyY = p.pos.y + (p.crouch ? 0.55 : 0.95);
  let best = maxDist, part = null;
  for (const [cy, r, name] of [[headY, 0.24, 'head'], [bodyY, 0.42, 'body']]) {
    const cx = p.pos.x - o.x, cy2 = cy - o.y, cz = p.pos.z - o.z;
    const tca = cx * d.x + cy2 * d.y + cz * d.z;
    if (tca < 0) continue;
    const d2 = cx * cx + cy2 * cy2 + cz * cz - tca * tca;
    if (d2 > r * r) continue;
    const t = tca - Math.sqrt(r * r - d2);
    if (t > 0.001 && t < best) { best = t; part = name; }
  }
  return part ? { dist: best, part } : null;
}

export function aimDir(yaw, pitch, spread, out) {
  out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  if (spread > 0) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
    out.x += Math.cos(a) * r; out.y += Math.sin(a) * r; out.normalize();
  }
  return out;
}

// Fire one trigger pull. ctx: { colliders, targets:[{person, onHit}], now }.
// Returns { fired, hit, target, part, damage, point, wallDist } or { fired:false }.
export function fire(shooter, ctx) {
  const w = WEAPONS[shooter.weapon];
  const a = shooter.ammo;
  if (shooter.reloading || a.mag <= 0) return { fired: false };
  if (ctx.now - shooter.lastShot < w.rate) return { fired: false };
  shooter.lastShot = ctx.now;
  a.mag--;
  // spread: base * (scope / move / air) + bloom
  let sp = w.spread * (shooter.scoped ? 0.25 : 1);
  if (shooter.moving) sp *= w.moveMul;
  if (shooter.airborne) sp *= 2;
  if (shooter.crouch) sp *= 0.7;
  sp += shooter.bloom;
  shooter.bloom = Math.min(0.05, shooter.bloom + w.recoil * 0.55);
  shooter.pitch += w.recoil * (0.7 + Math.random() * 0.6);
  shooter.yaw += (Math.random() - 0.5) * w.recoil * 0.5;
  const origin = _dir.copy(shooter.pos); origin.y = shooter.pos.y + shooter.eyeH;
  const pellets = w.pellets || 1;
  let bestHit = null;
  for (let p = 0; p < pellets; p++) {
    const dir = aimDir(shooter.yaw, shooter.pitch, sp, new THREE.Vector3());
    const wallD = rayWall(origin, dir, ctx.colliders, w.range);
    let hit = null;
    for (const t of ctx.targets) {
      if (t.person === shooter.personRef || t.person.dead) continue;
      const r = rayPerson(origin, dir, t.person, Math.min(wallD, w.range));
      if (r && (!hit || r.dist < hit.dist)) hit = { ...r, target: t };
    }
    if (hit) {
      const fall = hit.dist > 30 ? Math.max(w.falloff, 1 - (hit.dist - 30) / 90) : 1;
      const dmg = w.dmg * (hit.part === 'head' ? w.hs : 1) * fall;
      if (!bestHit || hit.dist < bestHit.dist) {
        bestHit = { ...hit, damage: dmg, point: origin.clone().addScaledVector(dir, hit.dist) };
      }
      hit.target.onHit(dmg, hit.part, shooter);
    } else {
      const end = origin.clone().addScaledVector(dir, wallD);
      if (!bestHit) bestHit = { dist: wallD, part: null, damage: 0, point: end, wall: true };
    }
  }
  return { fired: true, hit: bestHit, pellets, muzzle: origin };
}

// --- view models: one small gun per kind, built from boxes, attached to the camera ---
const VM = {
  rifle: { body: [0.09, 0.13, 0.62], barrel: [0.05, 0.05, 0.3], mag: [0.06, 0.16, 0.09], sight: [0.04, 0.07, 0.05], grip: [0.05, 0.12, 0.06], color: 0x2e3438, accent: 0xe8a33c },
  smg: { body: [0.08, 0.11, 0.42], barrel: [0.04, 0.04, 0.18], mag: [0.05, 0.2, 0.07], sight: [0.03, 0.05, 0.04], grip: [0.05, 0.1, 0.05], color: 0x3a4046, accent: 0x4fd2c9 },
  sniper: { body: [0.08, 0.12, 0.78], barrel: [0.035, 0.035, 0.42], mag: [0.05, 0.12, 0.08], sight: [0.05, 0.09, 0.16], grip: [0.05, 0.11, 0.06], color: 0x1d4e5f, accent: 0xffb347 },
  pistol: { body: [0.07, 0.1, 0.26], barrel: [0.04, 0.04, 0.1], mag: [0.05, 0.11, 0.06], sight: [0.03, 0.04, 0.03], grip: [0.05, 0.12, 0.06], color: 0x2e3438, accent: 0xe8a33c },
  shotgun: { body: [0.1, 0.13, 0.58], barrel: [0.06, 0.06, 0.3], mag: [0.06, 0.06, 0.3], sight: [0.03, 0.05, 0.04], grip: [0.05, 0.12, 0.06], color: 0x5a3a28, accent: 0xe8a33c },
};
export function buildViewModel(id) {
  const d = VM[id];
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.5, metalness: 0.5, emissive: 0x2a2a2a, emissiveIntensity: 0.7 });
  const acc = new THREE.MeshStandardMaterial({ color: d.accent, roughness: 0.4, metalness: 0.5, emissive: d.accent, emissiveIntensity: 0.25 });
  const add = (size, pos, m = mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), m);
    mesh.position.set(pos[0], pos[1], pos[2]); g.add(mesh); return mesh;
  };
  add(d.body, [0, 0, -0.1]);
  add(d.barrel, [0, 0.01, -0.5]);
  add(d.mag, [0, -0.12, -0.05]);
  add(d.sight, [0, 0.1, -0.12], acc);
  const grip = add(d.grip, [0, -0.1, 0.12]); grip.rotation.x = 0.35;
  // stock
  add([0.07, 0.09, 0.16], [0, -0.01, 0.24]);
  // muzzle tip (flash attaches here)
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, -0.68); g.add(muzzle);
  // muzzle flash: two crossed additive planes
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  const f2 = f1.clone(); f2.rotation.z = Math.PI / 2;
  f1.position.copy(muzzle.position); f2.position.copy(muzzle.position);
  g.add(f1); g.add(f2);
  g.position.set(0.28, -0.24, -0.5);
  g.scale.setScalar(0.85);
  g.userData = { muzzle, flashMat, basePos: g.position.clone(), kick: 0, swayX: 0, swayY: 0 };
  return g;
}
