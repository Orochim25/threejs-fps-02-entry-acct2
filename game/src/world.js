// SOLARIS — world: a desert solar farm at golden hour. 64x44 m, two bomb sites,
// panel-array lanes, a control building, a water tower. Ground-level AABB collision
// plus a waypoint graph the bots route on. Palette: gold sun, teal shadow, warm sand.
import * as THREE from 'three';
import { sandTex, panelTex, concreteTex, metalTex, roofTex, skyTex, hazardTex } from './textures.js';

export const MAP = { x: 32, z: 22 }; // half-extents; playable area
export const SITE_A = { x: 13, z: -13, r: 5, name: 'A' };
export const SITE_B = { x: 19, z: 14, r: 5, name: 'B' };
export const SPAWN_ATK = { x: -28, z: 0, yaw: -Math.PI / 2 }; // face east (+x)
export const SPAWN_DEF = { x: 26, z: 0, yaw: Math.PI / 2 };   // face west (-x)

// Waypoints (x,z) the bots route on; edges are by index.
export const WAYPOINTS = [
  [-28, 0], [-24, -8], [-24, 8], [-18, 0], [-14, -12], [-14, 12], [-8, 0], [0, 0],
  [8, 0], [0, -8], [0, 10], [-8, -16], [4, -16], [12, -14], [-8, 16], [4, 16],
  [12, 14], [13, -13], [10, -10], [19, 14], [14, 10], [26, 0], [22, -6], [22, 8],
];
export const EDGES = [
  [0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [3, 6], [4, 11], [5, 14], [6, 7],
  [6, 11], [6, 14], [7, 8], [7, 9], [7, 10], [8, 13], [8, 16], [9, 11], [9, 12],
  [10, 14], [10, 15], [11, 12], [12, 13], [12, 17], [13, 17], [13, 18], [14, 15],
  [15, 16], [16, 19], [16, 20], [17, 18], [18, 13], [19, 20], [20, 21], [21, 22],
  [21, 23], [22, 13], [23, 16], [3, 4], [3, 5], [8, 9], [8, 10],
];

export function buildWorld(scene) {
  const colliders = []; // {x0,z0,x1,z1}
  const addBox = (x, z, w, d, h = 3) => colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h });
  const mats = {
    sand: new THREE.MeshStandardMaterial({ map: sandTex(), roughness: 1, metalness: 0 }),
    panel: new THREE.MeshStandardMaterial({ map: panelTex(), roughness: 0.35, metalness: 0.55 }),
    steel: new THREE.MeshStandardMaterial({ map: metalTex(), roughness: 0.6, metalness: 0.7 }),
    concrete: new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.95, metalness: 0 }),
    roof: new THREE.MeshStandardMaterial({ map: roofTex(), roughness: 0.85, metalness: 0.15 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.8, metalness: 0 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d2126, roughness: 0.7, metalness: 0.4 }),
    teal: new THREE.MeshStandardMaterial({ color: 0x1d4e5f, roughness: 0.6, metalness: 0.3 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xe8a33c, roughness: 0.5, metalness: 0.4, emissive: 0x442200 }),
  };

  // --- sky, fog, lights ---
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false }));
  scene.add(sky);
  scene.fog = new THREE.Fog(0xd99a55, 55, 190);
  const sun = new THREE.DirectionalLight(0xffb347, 2.6);
  sun.position.set(-60, 26, -38); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 180; sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffd9a0, 0x8a6a42, 0.85));
  const fill = new THREE.DirectionalLight(0x7fb2c9, 0.35); fill.position.set(40, 30, 50); scene.add(fill);
  // visible sun disc
  const sunSprite = new THREE.Mesh(new THREE.CircleGeometry(9, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }));
  sunSprite.position.set(-180, 62, -110); sunSprite.lookAt(0, 0, 0); scene.add(sunSprite);

  // --- ground ---
  const sand = sandTex(); sand.repeat.set(10, 7);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 160),
    new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // darker packed-earth playfield
  const field = new THREE.Mesh(new THREE.PlaneGeometry(66, 46),
    new THREE.MeshStandardMaterial({ color: 0xc08a4a, roughness: 1 }));
  field.rotation.x = -Math.PI / 2; field.position.y = 0.01; field.receiveShadow = true; scene.add(field);

  const box = (w, h, d, mat, x, y, z, ry = 0, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m;
  };
  const cyl = (rt, rb, h, mat, x, y, z, seg = 14) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
  };

  // --- perimeter dunes + fence ---
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const dx = Math.cos(a) * 52, dz = Math.sin(a) * 40;
    const dune = new THREE.Mesh(new THREE.SphereGeometry(9 + (i % 3) * 3, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9a05b, roughness: 1 }));
    dune.scale.y = 0.22; dune.position.set(dx, -0.4, dz); dune.receiveShadow = true; scene.add(dune);
  }
  // fence posts around the playfield
  const postGeo = new THREE.BoxGeometry(0.12, 1.6, 0.12);
  for (let x = -32; x <= 32; x += 4) for (const z of [-22, 22]) {
    const p = new THREE.Mesh(postGeo, mats.dark); p.position.set(x, 0.8, z); scene.add(p);
  }
  for (let z = -22; z <= 22; z += 4) for (const x of [-32, 32]) {
    const p = new THREE.Mesh(postGeo, mats.dark); p.position.set(x, 0.8, z); scene.add(p);
  }

  // --- solar panel arrays (tilted slabs on steel legs) ---
  const slabGeo = new THREE.BoxGeometry(3.2, 0.08, 2.1);
  const legGeo = new THREE.BoxGeometry(0.12, 1.1, 0.12);
  function panelRow(cx, cz, n, gap, ry) {
    for (let i = 0; i < n; i++) {
      const px = cx + (i - (n - 1) / 2) * gap, pz = cz;
      const g = new THREE.Group();
      const slab = new THREE.Mesh(slabGeo, mats.panel);
      slab.rotation.x = -0.5; slab.position.y = 1.35; slab.castShadow = true; slab.receiveShadow = true;
      g.add(slab);
      for (const [lx, lz] of [[-1.3, -0.6], [1.3, -0.6], [-1.3, 0.6], [1.3, 0.6]]) {
        const leg = new THREE.Mesh(legGeo, mats.steel); leg.position.set(lx, 0.55, lz); leg.castShadow = true; g.add(leg);
      }
      g.position.set(px, 0, pz); g.rotation.y = ry || 0; scene.add(g);
      // one collider per panel (axis-aligned, generous)
      addBox(px, pz, 3.4, 2.4, 2.0);
    }
  }
  panelRow(-13, -13, 4, 4.2, 0);      // north array
  panelRow(-13, 13, 3, 4.2, 0);       // west-south array
  panelRow(0, -3.5, 5, 4.2, 0);       // mid north row
  panelRow(0, 3.5, 5, 4.2, 0);        // mid south row
  panelRow(19, 14, 4, 4.2, 0);        // site B array
  panelRow(19, 8, 2, 4.2, 0);         // B approach

  // --- control building (site A) ---
  box(10, 5, 10, mats.concrete, 21, 2.5, -13); addBox(21, -13, 10, 10, 5);
  box(10.6, 0.35, 10.6, mats.roof, 21, 5.15, -13);
  box(3, 3.4, 0.3, mats.dark, 16, 1.7, -13); // door face (visual)
  box(6, 0.5, 0.5, mats.hazard, 16, 0.25, -8.2); // hazard strip at entrance
  // AC units + vent on the roof
  box(1.6, 0.8, 1.6, mats.steel, 19, 5.7, -15);
  box(1.2, 1.1, 1.2, mats.steel, 23, 5.9, -11);
  cyl(0.35, 0.35, 1.4, mats.teal, 21, 6, -13);
  // site A courtyard low wall with a west gap
  box(0.5, 1.1, 6, mats.concrete, 10, 0.55, -16); addBox(10, -16, 0.5, 6, 1.1);
  box(0.5, 1.1, 6, mats.concrete, 10, 0.55, -10); addBox(10, -10, 0.5, 6, 1.1);
  box(6.5, 1.1, 0.5, mats.concrete, 13, 0.55, -19); addBox(13, -19, 6.5, 0.5, 1.1);

  // --- water tower (mid-north) ---
  cyl(2.2, 2.2, 3, mats.teal, 0, 7.5, -14);
  cyl(2.5, 2.5, 0.4, mats.dark, 0, 9.2, -14);
  for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 6, 0.25), mats.steel);
    leg.position.set(lx, 3, -14 + lz); leg.castShadow = true; scene.add(leg);
  }
  for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) addBox(lx, -14 + lz, 0.4, 0.4, 6);

  // --- crates & barriers (cover) ---
  const crate = (x, z, s, ry = 0) => { box(s, s, s, mats.steel, x, s / 2, z, ry); addBox(x, z, s, s, s); };
  crate(-20, 0, 1.2); crate(-20.9, 0, 1.2, 0.4); crate(-20.4, 1.2, 1.0, 0.2);
  crate(6, -8, 1.2); crate(-6, 8, 1.2); crate(10, 4, 1.2); crate(-2, -10, 1.2);
  crate(16, 2, 1.2); crate(-26, -14, 1.2); crate(24, 16, 1.2);
  const barrier = (x, z, ry) => { box(2.6, 1.15, 0.5, mats.concrete, x, 0.575, z, ry); addBox(x, z, ry ? 0.5 : 2.6, ry ? 2.6 : 0.5, 1.15); };
  barrier(-8, -6, 0); barrier(4, 6, 0); barrier(-16, 4, Math.PI / 2); barrier(14, -4, Math.PI / 2);
  barrier(8, 16, 0); barrier(-4, -16, 0); barrier(26, -4, Math.PI / 2); barrier(-28, 14, 0);

  // --- bomb site rings + beacons ---
  function siteRing(site, color) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(site.r - 0.35, site.r, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(site.x, 0.03, site.z); scene.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(site.x, 0.03, site.z); scene.add(disc);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 14, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.set(site.x, 7, site.z); scene.add(beam);
    return { ring, disc, beam };
  }
  const siteAVisual = siteRing(SITE_A, 0xffb347);
  const siteBVisual = siteRing(SITE_B, 0x4fd2c9);

  // --- dust motes ---
  const moteCount = 260, motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 64;
    motePos[i * 3 + 1] = 0.3 + Math.random() * 7;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 44;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: 0xffd9a0, size: 0.09, transparent: true, opacity: 0.65, sizeAttenuation: true,
  }));
  scene.add(motes);

  return { colliders, siteAVisual, siteBVisual, motes, sun };
}
