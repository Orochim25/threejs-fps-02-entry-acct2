// SOLARIS — bots: 9 soldiers with a waypoint graph, line-of-sight + hearing,
// burst fire, team roles (planter, cover, site holders, rotators) and a walk cycle.
// One state store G is passed in; no module imports main.js.
import * as THREE from 'three';
import { WAYPOINTS, EDGES, SITE_A, SITE_B, MAP } from './world.js';
import { WEAPONS, freshAmmo, fire, rayWall } from './weapons.js';

const ADJ = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }
function nearestWp(x, z) {
  let bi = 0, bd = 1e9;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i][0] - x, dz = WAYPOINTS[i][1] - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
export function findPath(sx, sz, tx, tz) {
  const s = nearestWp(sx, sz), t = nearestWp(tx, tz);
  if (s === t) return [t];
  const prev = new Array(WAYPOINTS.length).fill(-1), q = [s]; prev[s] = s;
  while (q.length) {
    const c = q.shift();
    for (const n of ADJ[c]) if (prev[n] === -1) { prev[n] = c; if (n === t) { q.length = 0; break; } q.push(n); }
  }
  if (prev[t] === -1) return [t];
  const path = []; let c = t;
  while (c !== s) { path.unshift(c); c = prev[c]; }
  return path;
}

const ATK_NAMES = ['Sol', 'Dune', 'Mirage', 'Ember'];
const DEF_NAMES = ['Volt', 'Panel', 'Rust', 'Haze', 'Onyx'];
const _eye = new THREE.Vector3(), _to = new THREE.Vector3(), _fwd = new THREE.Vector3();

export function buildSoldier(team) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: team === 'atk' ? 0x8a5a28 : 0x1d4e5f, roughness: 0.85, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.7, metalness: 0.3 });
  const visor = new THREE.MeshStandardMaterial({ color: team === 'atk' ? 0xffb347 : 0x4fd2c9, emissive: team === 'atk' ? 0xcc7713 : 0x1d8a80, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.4 });
  const add = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  const torso = add(0.52, 0.62, 0.3, suit, 0, 1.12, 0);
  const head = add(0.3, 0.28, 0.3, dark, 0, 1.6, 0);
  add(0.26, 0.08, 0.05, visor, 0, 1.62, 0.16); // glowing visor slit
  const legL = add(0.18, 0.78, 0.2, dark, -0.14, 0.39, 0);
  const legR = add(0.18, 0.78, 0.2, dark, 0.14, 0.39, 0);
  const armL = add(0.14, 0.55, 0.16, suit, -0.34, 1.15, 0.05);
  const armR = add(0.14, 0.55, 0.16, suit, 0.34, 1.15, 0.05);
  // held rifle
  const gun = new THREE.Group();
  const gm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.7), dark);
  gm.position.set(0, 0, -0.2); gun.add(gm);
  gun.position.set(0.1, 1.25, 0.3); g.add(gun);
  // team shoulder light
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02),
    new THREE.MeshBasicMaterial({ color: team === 'atk' ? 0xffb347 : 0x4fd2c9 }));
  lamp.position.set(0, 1.42, -0.17); g.add(lamp);
  g.userData = { legL, legR, armL, armR, torso, head, gun, walkPhase: Math.random() * 6 };
  return g;
}

export function makeBot(id, team, name, x, z, yaw, weaponId, skill) {
  return {
    id, team, name, isBot: true, personRef: null,
    pos: new THREE.Vector3(x, 0, z), yaw, pitch: 0, eyeH: 1.55, crouch: false,
    hp: 100, armor: 0, dead: false, deathT: 0,
    weapon: weaponId, ammo: freshAmmo(weaponId), bloom: 0, reloading: false, reloadT: 0,
    lastShot: -9, scoped: false, moving: false, airborne: false,
    state: 'route', path: [], pathI: 0, holdPos: null, holdYaw: yaw,
    target: null, lastSeen: null, hearPos: null, hearT: -9,
    role: 'roam', skill, reactionT: 0, burstLeft: 0, burstPause: 0,
    speed: 3.4, walkPhase: Math.random() * 6, kills: 0, deaths: 0,
    plantT: 0, defuseT: 0, strafeDir: 1, strafeT: 0, mesh: null, flashT: 0,
  };
}

export function createBots(scene) {
  const bots = [];
  // attackers: 4 bots + the player (player created in main.js)
  const atkW = ['rifle', 'smg', 'rifle', 'shotgun'];
  for (let i = 0; i < 4; i++) {
    const b = makeBot('atk' + i, 'atk', ATK_NAMES[i], -28 + (i % 2) * 2, -4.5 + i * 3, -Math.PI / 2, atkW[i], 0.58 + i * 0.05);
    b.role = i === 0 ? 'plant' : i === 1 ? 'cover' : 'roam';
    b.mesh = buildSoldier('atk'); scene.add(b.mesh);
    b.personRef = b; bots.push(b);
  }
  // defenders: 5 bots
  const defW = ['rifle', 'smg', 'sniper', 'rifle', 'shotgun'];
  const defSpots = [[24, -10, 'siteA'], [24, 10, 'siteB'], [18, -6, 'siteA'], [18, 6, 'siteB'], [10, 0, 'mid']];
  for (let i = 0; i < 5; i++) {
    const [x, z, role] = defSpots[i];
    const b = makeBot('def' + i, 'def', DEF_NAMES[i], x, z, Math.PI / 2, defW[i], 0.55 + i * 0.05);
    b.role = role; b.holdPos = { x, z }; b.holdYaw = Math.PI / 2;
    b.mesh = buildSoldier('def'); scene.add(b.mesh);
    b.personRef = b; bots.push(b);
  }
  return bots;
}

function losClear(G, a, b) {
  _eye.set(a.pos.x, a.pos.y + a.eyeH, a.pos.z);
  _to.set(b.pos.x, b.pos.y + b.eyeH, b.pos.z);
  const dist = _eye.distanceTo(_to);
  if (dist > 58) return false;
  _fwd.copy(_to).sub(_eye).normalize();
  if (rayWall(_eye, _fwd, G.colliders, dist) < dist - 0.3) return false;
  if (G.effects.smokeBlocks(_eye, _to)) return false;
  return true;
}
function inFov(a, b) {
  _fwd.set(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
  _to.set(b.pos.x - a.pos.x, 0, b.pos.z - a.pos.z).normalize();
  return _fwd.dot(_to) > 0.12; // ~83 deg half-angle
}

export function updateBots(G, dt) {
  const now = G.time;
  for (const b of G.bots) {
    if (b.dead) { if (b.mesh) { b.mesh.rotation.x = Math.min(-Math.PI / 2, b.mesh.rotation.x - dt * 4); } continue; }
    // --- perception ---
    let seen = null, seenD = 1e9;
    for (const e of G.persons) {
      if (e.team === b.team || e.dead) continue;
      const dx = e.pos.x - b.pos.x, dz = e.pos.z - b.pos.z, d = Math.hypot(dx, dz);
      if (d > 58 || d > seenD) continue;
      if (!inFov(b, e) && d > 4) continue;
      if (!losClear(G, b, e)) continue;
      seen = e; seenD = d;
    }
    if (seen) {
      if (b.target !== seen) b.reactionT = now + (0.65 - b.skill * 0.35) + Math.random() * 0.15;
      b.target = seen; b.lastSeen = { x: seen.pos.x, z: seen.pos.z, t: now };
      if (b.state !== 'engage') b.state = 'engage';
    } else if (b.target) {
      if (now - (b.lastSeen ? b.lastSeen.t : 0) > 2.2) {
        b.target = null;
        // target gone: leave engage so the state machine re-decides (route/hold/defuse)
        if (b.state === 'engage') { b.state = 'route'; b.path = []; b.pathI = 0; }
      }
    }
    // a planter that lost the bomb, or a defuser with no planted bomb, goes back to routing
    if (b.state === 'plant' && G.bomb.carrier !== b) { b.state = 'route'; b.path = []; b.pathI = 0; }
    if (b.state === 'defuse' && !G.bomb.plantedAt) { b.state = 'route'; b.path = []; b.pathI = 0; }
    // hearing: a recent loud noise pulls bots that have no target
    if (!b.target && G.noise && now - G.noise.t < 1.2 && now - b.hearT > 3) {
      const dx = G.noise.x - b.pos.x, dz = G.noise.z - b.pos.z;
      if (dx * dx + dz * dz < G.noise.r * G.noise.r) { b.hearPos = { x: G.noise.x, z: G.noise.z }; b.hearT = now; }
    }
    // --- state decisions ---
    const bomb = G.bomb;
    if (b.team === 'atk') {
      if (bomb.plantedAt) { // bomb down: cover the site
        if (b.state !== 'engage') { b.state = 'route'; b.path = findPath(b.pos.x, b.pos.z, bomb.plantedAt.x, bomb.plantedAt.z); b.pathI = 0; }
      } else if (bomb.carrier === b && b.role === 'plant') {
        const site = b.assignedSite || SITE_A;
        const d = Math.hypot(site.x - b.pos.x, site.z - b.pos.z);
        if (d < 3.2) { b.state = 'plant'; }
        else if (b.state !== 'engage' && b.state !== 'plant') { b.state = 'route'; if (!b.path.length || b.pathI >= b.path.length) { b.path = findPath(b.pos.x, b.pos.z, site.x, site.z); b.pathI = 0; } }
      } else if (bomb.droppedAt && !bomb.carrier) {
        if (b.state !== 'engage') { b.state = 'route'; b.path = findPath(b.pos.x, b.pos.z, bomb.droppedAt.x, bomb.droppedAt.z); b.pathI = 0; }
      } else if (b.state !== 'engage') {
        if (b.role === 'cover' && bomb.carrier && bomb.carrier !== b) {
          const c = bomb.carrier, d = Math.hypot(c.pos.x - b.pos.x, c.pos.z - b.pos.z);
          if (d > 5) { b.state = 'route'; b.path = findPath(b.pos.x, b.pos.z, c.pos.x - 3, c.pos.z); b.pathI = 0; }
          else b.state = 'hold';
        } else if (b.state === 'route' && (!b.path.length || b.pathI >= b.path.length)) {
          const site = b.role === 'plant' ? (b.assignedSite || SITE_A) : (Math.random() < 0.5 ? SITE_A : SITE_B);
          b.path = findPath(b.pos.x, b.pos.z, site.x + (Math.random() * 4 - 2), site.z + (Math.random() * 4 - 2)); b.pathI = 0;
        } else if (b.state !== 'route') b.state = 'route';
      }
    } else { // defenders
      if (bomb.plantedAt) {
        if (b.state !== 'engage' && b.state !== 'defuse') {
          const d = Math.hypot(bomb.plantedAt.x - b.pos.x, bomb.plantedAt.z - b.pos.z);
          if (d < 2.6) b.state = 'defuse';
          else { b.state = 'route'; if (!b.path.length || b.pathI >= b.path.length) { b.path = findPath(b.pos.x, b.pos.z, bomb.plantedAt.x, bomb.plantedAt.z); b.pathI = 0; } }
        }
      } else if (b.state !== 'engage') {
        if (b.hearPos && now - b.hearT < 4) {
          b.state = 'route'; b.path = findPath(b.pos.x, b.pos.z, b.hearPos.x, b.hearPos.z); b.pathI = 0; b.hearPos = null;
        } else if (b.holdPos) {
          const d = Math.hypot(b.holdPos.x - b.pos.x, b.holdPos.z - b.pos.z);
          if (d > 1.2) { b.state = 'route'; b.path = findPath(b.pos.x, b.pos.z, b.holdPos.x, b.holdPos.z); b.pathI = 0; }
          else b.state = 'hold';
        }
      }
    }
    // --- movement ---
    let mvx = 0, mvz = 0, wantSpeed = 0;
    if (b.state === 'route' && b.path.length && b.pathI < b.path.length) {
      const wp = WAYPOINTS[b.path[b.pathI]];
      const dx = wp[0] - b.pos.x, dz = wp[1] - b.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.9) b.pathI++;
      else { mvx = dx / d; mvz = dz / d; wantSpeed = b.state === 'engage' ? 2.6 : 3.6; }
    } else if (b.state === 'engage' && b.target) {
      // strafe perpendicular, keep ~10-18 m
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafeDir *= -1; b.strafeT = 0.7 + Math.random() * 0.9; }
      const dx = b.target.pos.x - b.pos.x, dz = b.target.pos.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
      const px = -dz / d * b.strafeDir, pz = dx / d * b.strafeDir;
      const toward = d > 18 ? 0.6 : d < 8 ? -0.7 : 0;
      mvx = px * 0.8 + (dx / d) * toward; mvz = pz * 0.8 + (dz / d) * toward;
      wantSpeed = 2.4;
    }
    if (wantSpeed > 0) {
      b.moving = true;
      const nx = b.pos.x + mvx * wantSpeed * dt, nz = b.pos.z + mvz * wantSpeed * dt;
      moveWithCollision(G, b, nx, nz);
      // face movement (or the target when engaging)
      const face = b.target ? Math.atan2(-(b.target.pos.x - b.pos.x), -(b.target.pos.z - b.pos.z)) : Math.atan2(-mvx, -mvz);
      b.yaw = turnToward(b.yaw, face, dt * 6);
      b.walkPhase += dt * wantSpeed * 2.4;
    } else {
      b.moving = false;
      if (b.state === 'hold') { b.yaw = turnToward(b.yaw, b.holdYaw + Math.sin(now * 0.4 + b.id.charCodeAt(3)) * 0.7, dt * 1.2); }
      if (b.state === 'engage' && b.target) {
        b.yaw = turnToward(b.yaw, Math.atan2(-(b.target.pos.x - b.pos.x), -(b.target.pos.z - b.pos.z)), dt * 8);
      }
    }
    // --- plant / defuse progress ---
    if (b.state === 'plant' && bomb.carrier === b && !bomb.plantedAt) {
      b.plantT += dt;
      if (Math.floor(b.plantT * 2) !== Math.floor((b.plantT - dt) * 2)) G.audio.plantBeep(false);
      if (b.plantT >= 3.5) { bomb.plantedAt = b.assignedSite || SITE_A; bomb.plantT = 0; b.plantT = 0; G.onPlant(b); }
    } else b.plantT = 0;
    if (b.state === 'defuse' && bomb.plantedAt && !bomb.defuser) {
      bomb.defuser = b; b.defuseT = 0;
    }
    if (bomb.defuser === b) {
      b.defuseT += dt;
      if (Math.floor(b.defuseT * 2) !== Math.floor((b.defuseT - dt) * 2)) G.audio.defuseBeep();
      if (b.defuseT >= 5) { G.onDefuse(b); }
    }
    // --- firing ---
    if (b.target && now >= b.reactionT && !b.reloading) {
      const d = Math.hypot(b.target.pos.x - b.pos.x, b.target.pos.z - b.pos.z);
      if (b.burstLeft <= 0) {
        if (b.burstPause <= 0) { b.burstLeft = 3 + ((Math.random() * 3) | 0); b.burstPause = 0.45 + Math.random() * 0.5; }
        else b.burstPause -= dt;
      } else if (losClear(G, b, b.target)) {
        // aim with skill-based error
        const err = (1 - b.skill) * 0.055 * (0.6 + d / 40);
        b.yaw += (Math.random() - 0.5) * err; b.pitch = 0;
        const res = fire(b, { colliders: G.colliders, targets: G.persons.map((p) => ({ person: p, onHit: (dmg, part, sh) => G.onHit(p, dmg, part, sh) })), now });
        if (res.fired) {
          b.burstLeft--;
          G.onShotFired(b, res);
          if (b.ammo.mag === 0) { b.reloading = true; b.reloadT = WEAPONS[b.weapon].reload; }
        }
      }
    }
    if (b.reloading) {
      b.reloadT -= dt;
      if (b.reloadT <= 0) {
        const w = WEAPONS[b.weapon], need = w.mag - b.ammo.mag, take = Math.min(need, b.ammo.reserve);
        b.ammo.mag += take; b.ammo.reserve -= take; b.reloading = false;
      }
    }
    b.bloom = Math.max(0, b.bloom - dt * 0.09);
    // --- mesh pose ---
    if (b.mesh) {
      const u = b.mesh.userData;
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.y = b.yaw;
      const sw = b.moving ? Math.sin(b.walkPhase) * 0.5 : 0;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.6; u.armR.rotation.x = sw * 0.6;
      u.torso.rotation.x = b.moving ? 0.08 : 0;
      // aim the gun at the target
      if (b.target) {
        const dy = (b.target.pos.y + 1.3) - 1.25;
        const dd = Math.hypot(b.target.pos.x - b.pos.x, b.target.pos.z - b.pos.z) || 1;
        u.gun.rotation.x = -Math.atan2(dy, dd);
      } else u.gun.rotation.x = 0;
    }
  }
}

function turnToward(cur, target, maxStep) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}

// Axis-separated AABB push-out, with map clamp. Shared by bots and the player.
export function moveWithCollision(G, p, nx, nz) {
  const r = 0.4;
  // x axis
  let hit = false;
  for (const c of G.colliders) {
    if (nz + r > c.z0 && nz - r < c.z1 && nx + r > c.x0 && nx - r < c.x1) { hit = true; break; }
  }
  if (!hit) p.pos.x = nx;
  hit = false;
  for (const c of G.colliders) {
    if (p.pos.z + r > c.z0 && p.pos.z - r < c.z1 && nz + r > c.x0 && nz - r < c.x1) { hit = true; break; }
  }
  if (!hit) p.pos.z = nz;
  p.pos.x = Math.max(-MAP.x + 0.5, Math.min(MAP.x - 0.5, p.pos.x));
  p.pos.z = Math.max(-MAP.z + 0.5, Math.min(MAP.z - 0.5, p.pos.z));
  // keep bots/persons from stacking
  for (const o of G.persons) {
    if (o === p || o.dead) continue;
    const dx = p.pos.x - o.pos.x, dz = p.pos.z - o.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.001 && d < 0.85) {
      p.pos.x += (dx / d) * (0.85 - d) * 0.5;
      p.pos.z += (dz / d) * (0.85 - d) * 0.5;
    }
  }
}
