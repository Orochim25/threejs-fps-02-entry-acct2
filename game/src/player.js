// SOLARIS — player: WASD + mouse look, crouch/sprint/jump, shooting, grenades,
// bomb planting. The view model sways, kicks, dips on reload and zooms on scope.
import * as THREE from 'three';
import { WEAPONS, freshAmmo, fire, buildViewModel } from './weapons.js';
import { moveWithCollision } from './bots.js';
import { SITE_A, SITE_B } from './world.js';

const _right = new THREE.Vector3(), _fwd = new THREE.Vector3();
const WEAPON_KEYS = { Digit1: 'rifle', Digit2: 'smg', Digit3: 'sniper', Digit4: 'shotgun', Digit5: 'pistol' };

export function createPlayer(G, camera) {
  const P = {
    team: 'atk', name: 'You', isBot: false, personRef: null,
    pos: new THREE.Vector3(-28, 0, 0), yaw: -Math.PI / 2, pitch: 0,
    eyeH: 1.55, crouch: false, vy: 0, jumpY: 0,
    hp: 100, armor: 0, armorKept: false, dead: false,
    weapon: 'pistol', ammo: freshAmmo('pistol'), bloom: 0, reloading: false, reloadT: 0,
    lastShot: -9, scoped: false, moving: false, airborne: false,
    money: 800, grenades: { frag: 0, smoke: 0 }, kills: 0, deaths: 0,
    plantT: 0, stepT: 0, throwCd: 0,
  };
  P.personRef = P;
  const vm = buildViewModel(P.weapon);
  camera.add(vm);
  P.viewModel = vm;
  P.muzzleWorld = new THREE.Vector3();
  return P;
}

export function updatePlayer(G, P, input, dt) {
  const now = G.time;
  if (P.dead) return;
  const w = WEAPONS[P.weapon];
  // --- look ---
  const lookDX = input.mdx, lookDY = input.mdy;
  if (input.mdx || input.mdy) {
    const s = P.scoped ? 0.0009 : 0.0022;
    P.yaw -= input.mdx * s;
    P.pitch -= input.mdy * s;
    P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch));
    input.mdx = 0; input.mdy = 0;
  }
  // --- move ---
  const k = input.keys;
  P.crouch = k.has('ControlLeft') || k.has('KeyC');
  const sprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && !P.crouch && k.has('KeyW');
  let ix = 0, iz = 0;
  if (k.has('KeyW')) iz += 1;
  if (k.has('KeyS')) iz -= 1;
  if (k.has('KeyA')) ix -= 1;
  if (k.has('KeyD')) ix += 1;
  const moving = ix !== 0 || iz !== 0;
  P.moving = moving;
  const speed = P.crouch ? 2.2 : sprint ? 6.0 : 4.2;
  if (moving) {
    const len = Math.hypot(ix, iz); ix /= len; iz /= len;
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    // forward is -sin(yaw), -cos(yaw); right is -cos(yaw)... check: yaw=0 -> forward (0,0,-1)
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    const mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
    moveWithCollision(G, P, P.pos.x + mx * speed * dt, P.pos.z + mz * speed * dt);
    P.stepT -= dt * (sprint ? 1.7 : 1);
    if (P.stepT <= 0) { G.audio.step(sprint); P.stepT = 0.42; }
  }
  // jump
  if (k.has('Space') && P.jumpY <= 0 && !P.airborne) { P.vy = 6.4; P.airborne = true; }
  if (P.airborne) {
    P.vy -= 18 * dt; P.jumpY += P.vy * dt;
    if (P.jumpY <= 0) { P.jumpY = 0; P.vy = 0; P.airborne = false; }
  }
  P.eyeH = P.crouch ? 1.05 : 1.55;
  // --- weapon switch ---
  for (const [code, id] of Object.entries(WEAPON_KEYS)) {
    if (input.pressed.has(code) && P.weapon !== id && G.ownedWeapons.has(id)) switchWeapon(G, P, id);
  }
  if (input.wheel !== 0) {
    const order = ['rifle', 'smg', 'sniper', 'shotgun', 'pistol'].filter((id) => G.ownedWeapons.has(id));
    if (order.length > 1) {
      let i = order.indexOf(P.weapon);
      i = (i + (input.wheel > 0 ? 1 : -1) + order.length) % order.length;
      switchWeapon(G, P, order[i]);
    }
    input.wheel = 0;
  }
  // --- reload ---
  if (input.pressed.has('KeyR') && !P.reloading && P.ammo.mag < WEAPONS[P.weapon].mag && P.ammo.reserve > 0) {
    P.reloading = true; P.reloadT = WEAPONS[P.weapon].reload; G.audio.reload();
  }
  if (P.reloading) {
    P.reloadT -= dt;
    if (P.reloadT <= 0) {
      const ww = WEAPONS[P.weapon], need = ww.mag - P.ammo.mag, take = Math.min(need, P.ammo.reserve);
      P.ammo.mag += take; P.ammo.reserve -= take; P.reloading = false;
    }
  }
  // --- fire ---
  const wantFire = input.mouseDown && (w.auto || input.mouseEdge);
  if (wantFire && !P.reloading && P.ammo.mag > 0) {
    const res = fire(P, { colliders: G.colliders, targets: G.persons.map((p) => ({ person: p, onHit: (dmg, part, sh) => G.onHit(p, dmg, part, sh) })), now });
    if (res.fired) {
      G.onShotFired(P, res);
      P.viewModel.userData.kick = 1;
      if (P.ammo.mag === 0) G.audio.dry();
    }
  } else if (wantFire && P.ammo.mag === 0 && !P.reloading) {
    if (input.mouseEdge) G.audio.dry();
    if (P.ammo.reserve > 0) { P.reloading = true; P.reloadT = w.reload; G.audio.reload(); }
  }
  input.mouseEdge = false;
  // --- scope (sniper right mouse) ---
  const wantScope = input.mouseRight && P.weapon === 'sniper';
  if (wantScope !== P.scoped) {
    P.scoped = wantScope;
    G.camera.fov = wantScope ? 18 : 70;
    G.camera.updateProjectionMatrix();
    P.viewModel.visible = !wantScope;
    G.hud.setScope(wantScope);
  }
  // --- grenades ---
  P.throwCd -= dt;
  if (input.pressed.has('KeyG') && P.throwCd <= 0) throwGrenade(G, P, 'frag');
  if (input.pressed.has('KeyX') && P.throwCd <= 0) throwGrenade(G, P, 'smoke');
  // --- plant (hold E at a site while carrying the bomb) ---
  const bomb = G.bomb;
  if (G.round.state === 'live' && bomb.carrier === P && !bomb.plantedAt) {
    const site = nearSite(P);
    if (site && k.has('KeyE')) {
      P.plantT += dt;
      G.hud.setPlant(P.plantT / 3.5, site.name);
      if (Math.floor(P.plantT * 2) !== Math.floor((P.plantT - dt) * 2)) G.audio.plantBeep(false);
      if (P.plantT >= 3.5) {
        bomb.plantedAt = site; bomb.bombT = 40; P.plantT = 0;
        G.onPlant(P);
      }
    } else {
      if (P.plantT > 0) G.hud.setPlant(0, '');
      P.plantT = 0;
    }
  }
  // --- view model pose ---
  const u = P.viewModel.userData;
  u.kick = Math.max(0, u.kick - dt * 7);
  const bob = moving && !P.airborne ? Math.sin(now * (sprint ? 13 : 9)) * (sprint ? 0.016 : 0.01) : 0;
  const sway = Math.min(0.03, Math.abs(lookDX) * 0.001);
  P.viewModel.position.set(
    0.28 + (P.scoped ? -0.28 : 0) + sway,
    -0.24 + bob - (P.reloading ? 0.12 : 0) + (P.crouch ? -0.02 : 0),
    -0.5 + u.kick * 0.09
  );
  P.viewModel.rotation.x = u.kick * 0.14 + (P.reloading ? -0.5 : 0);
  P.viewModel.rotation.z = moving ? Math.sin(now * 9) * 0.012 : 0;
  const fm = u.flashMat;
  fm.opacity = Math.max(0, fm.opacity - dt * 14);
  // bloom decay
  P.bloom = Math.max(0, P.bloom - dt * 0.09);
}

export function equipViewModel(G, P, id) {
  const cam = G.camera;
  cam.remove(P.viewModel);
  P.viewModel = buildViewModel(id);
  cam.add(P.viewModel);
}

function switchWeapon(G, P, id) {
  P.weapon = id;
  P.ammo = G.ammoStore[id] || freshAmmo(id);
  G.ammoStore[id] = P.ammo;
  P.reloading = false; P.scoped = false;
  G.camera.fov = 70; G.camera.updateProjectionMatrix();
  G.hud.setScope(false);
  equipViewModel(G, P, id);
  G.audio.click();
}

function nearSite(P) {
  for (const s of [SITE_A, SITE_B]) {
    if (Math.hypot(P.pos.x - s.x, P.pos.z - s.z) < s.r) return s;
  }
  return null;
}

export function throwGrenade(G, P, kind) {
  if (P.grenades[kind] <= 0) { if (kind === 'frag') G.hud.flash('No frag grenades — buy with B'); return; }
  P.grenades[kind]--;
  P.throwCd = 0.7;
  const dir = new THREE.Vector3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch) + 0.35, -Math.cos(P.yaw) * Math.cos(P.pitch)).normalize();
  G.grenades.push({
    kind, pos: P.pos.clone().add(new THREE.Vector3(0, P.eyeH + P.jumpY, 0)).addScaledVector(dir, 0.6),
    vel: dir.multiplyScalar(13), fuse: kind === 'frag' ? 1.6 : 1.2, bounced: 0,
  });
  G.audio.click();
}
