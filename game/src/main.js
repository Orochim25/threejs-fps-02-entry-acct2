// SOLARIS — main: the single state store G, fixed-step simulation, input,
// grenade physics, and the event callbacks (hit / shot / plant / defuse).
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { WEAPONS, freshAmmo } from './weapons.js';
import { createBots, updateBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createPlayer, updatePlayer, equipViewModel } from './player.js';
import { Effects } from './effects.js';
import { createHud } from './hud.js';
import { AudioSys } from './audio.js';

const STEP = 1 / 60;
const canvasHost = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

// --- the single state store ---
const G = {
  scene, camera, renderer, time: 0, noise: null, grenades: [],
  ownedWeapons: new Set(['pistol']), ammoStore: { pistol: freshAmmo('pistol') },
  buyOpen: false, quality: 'HIGH',
};
const world = buildWorld(scene);
G.colliders = world.colliders;
G.effects = new Effects(scene);
G.audio = new AudioSys();
G.hud = createHud(G);
G.bots = createBots(scene);
G.player = createPlayer(G, camera);
G.persons = [G.player, ...G.bots];
G.rounds = createRounds(G);
G.round = G.rounds.R;
G.bomb = G.rounds.R.bomb;
G.onWeaponChange = () => equipViewModel(G, G.player, G.player.weapon);

// --- event callbacks (wired here, used by bots/player/rounds) ---
const _m = new THREE.Vector3(), _r = new THREE.Vector3(), _f = new THREE.Vector3();
G.onHit = (person, dmg, part, shooter) => {
  if (person.dead) return;
  if (person.armor > 0) {
    const absorbed = Math.min(person.armor, dmg * 0.5);
    person.armor -= absorbed; dmg -= absorbed;
  }
  person.hp -= dmg;
  const killerIsPlayer = shooter === G.player, victimIsPlayer = person === G.player;
  if (killerIsPlayer && !victimIsPlayer) {
    G.hud.hitmarker(part === 'head', person.hp <= 0);
    G.audio.hit(part === 'head');
  }
  if (victimIsPlayer) { G.hud.hurt(); G.audio.hurt(); }
  if (person.hp <= 0 && !person.dead) {
    person.dead = true; person.deaths++;
    if (shooter) shooter.kills++;
    const kn = shooter ? shooter.name : '???';
    G.hud.killfeed(kn, person.name, part === 'head');
    if (shooter === G.player) { G.player.money += 300; G.audio.kill(); }
    if (person === G.player) G.hud.banner('YOU ARE DOWN', 'Your team fights on — next round you return', 'lose');
    // bomb drops
    if (G.bomb.carrier === person) {
      G.bomb.carrier = null;
      G.bomb.droppedAt = { x: person.pos.x, z: person.pos.z };
      G.hud.killfeed('SYSTEM', 'The bomb was dropped');
    }
    if (G.bomb.defuser === person) G.bomb.defuser = null;
  }
};
G.onShotFired = (shooter, res) => {
  const w = WEAPONS[shooter.weapon];
  // muzzle world position
  if (shooter === G.player) {
    shooter.viewModel.userData.muzzle.getWorldPosition(_m);
    shooter.viewModel.userData.flashMat.opacity = 1;
    _r.set(1, 0, 0).applyEuler(G.camera.rotation);
    G.effects.shell(_m, _r);
    G.effects.muzzle(_m);
  } else {
    _m.copy(shooter.pos); _m.y += 1.25;
    _f.set(-Math.sin(shooter.yaw), 0, -Math.cos(shooter.yaw));
    _m.addScaledVector(_f, 0.6);
    G.effects.muzzle(_m);
  }
  const end = res.hit ? res.hit.point : null;
  if (end) {
    G.effects.tracer(_m, end, shooter.team === 'atk' ? 0xffd27a : 0x8ad2ff);
    if (res.hit.target) G.effects.hitSpark(end);
    else if (res.hit.wall) G.effects.impact(end, end.y < 0.12 ? 'sand' : 'concrete');
  }
  const dist = shooter === G.player ? 0 : shooter.pos.distanceTo(G.player.pos);
  G.audio.shot(w.kind, dist);
  G.noise = { x: shooter.pos.x, z: shooter.pos.z, r: 32, t: G.time };
};
G.onPlant = (who) => {
  G.hud.banner('BOMB PLANTED — SITE ' + G.bomb.plantedAt.name, who.name + ' planted the bomb — defend it', 'warn');
  G.audio.plantBeep(true);
  G.noise = { x: G.bomb.plantedAt.x, z: G.bomb.plantedAt.z, r: 60, t: G.time };
};
G.onDefuse = (who) => {
  G.hud.banner('BOMB DEFUSED', who.name + ' defused the bomb', 'info');
  G.bomb.plantedAt = null; G.bomb.defuser = null;
  G.rounds.endRound('def', 'The bomb was defused');
};

// --- input ---
const input = { keys: new Set(), pressed: new Set(), mdx: 0, mdy: 0, mouseDown: false, mouseEdge: false, mouseRight: false, wheel: 0 };
addEventListener('keydown', (e) => {
  if (e.code === 'KeyB' && (G.round.state === 'buy')) { G.hud.setBuyOpen(!G.buyOpen); }
  if (e.code === 'F9') cycleQuality();
  if (!e.repeat) { input.keys.add(e.code); input.pressed.add(e.code); }
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => input.keys.delete(e.code));
addEventListener('mousedown', (e) => {
  if (!document.pointerLockElement) return;
  if (e.button === 0) { input.mouseDown = true; input.mouseEdge = true; }
  if (e.button === 2) input.mouseRight = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) input.mouseDown = false;
  if (e.button === 2) input.mouseRight = false;
});
addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return;
  input.mdx += e.movementX; input.mdy += e.movementY;
});
addEventListener('wheel', (e) => { input.wheel += e.deltaY > 0 ? 1 : -1; }, { passive: true });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement;
  if (!locked && G.round.state !== 'lobby' && G.round.state !== 'matchEnd' && !G.buyOpen) {
    G.hud.el.overlay.classList.remove('hidden');
    document.getElementById('overlay-title').textContent = 'SOLARIS — paused';
    document.getElementById('overlay-copy').textContent = 'Click to resume. WASD move · mouse look · click fire · R reload · B buy · G frag · X smoke · E plant.';
  }
});
function lockPointer() {
  G.audio.init(); G.audio.resume();
  renderer.domElement.requestPointerLock();
  G.hud.el.overlay.classList.add('hidden');
}
document.getElementById('play').addEventListener('click', () => {
  if (G.round.state === 'lobby') { startMatch(); }
  lockPointer();
});
document.getElementById('restart').addEventListener('click', () => {
  G.hud.hideMatchEnd();
  startMatch(); lockPointer();
});
document.getElementById('quality').addEventListener('change', (e) => applyQuality(e.target.value));

// --- quality presets ---
function applyQuality(q) {
  G.quality = q;
  const px = { LOW: 0.75, MEDIUM: 1, HIGH: 1.25, ULTRA: 1.5 }[q];
  renderer.setPixelRatio(Math.min(devicePixelRatio, px));
  const sh = { LOW: 1024, MEDIUM: 1024, HIGH: 2048, ULTRA: 2048 }[q];
  scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) o.shadow.mapSize.set(sh, sh); });
  world.motes.visible = q !== 'LOW';
  if (q === 'LOW') { renderer.shadowMap.enabled = false; } else renderer.shadowMap.enabled = true;
}
function cycleQuality() {
  const order = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
  const next = order[(order.indexOf(G.quality) + 1) % order.length];
  applyQuality(next);
  document.getElementById('quality').value = next;
  G.hud.flash('Quality: ' + next);
}

// --- match start / reset ---
function startMatch() {
  const P = G.player;
  P.money = 800; P.kills = 0; P.deaths = 0;
  G.ownedWeapons = new Set(['pistol']);
  G.ammoStore = { pistol: freshAmmo('pistol') };
  P.weapon = 'pistol'; P.ammo = G.ammoStore.pistol;
  equipViewModel(G, P, 'pistol');
  G.hud.hideMatchEnd();
  G.rounds.startMatch();
}

// --- grenade physics ---
function updateGrenades(dt) {
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i];
    g.vel.y -= 14 * dt;
    g.pos.addScaledVector(g.vel, dt);
    // ground bounce
    if (g.pos.y < 0.06) { g.pos.y = 0.06; g.vel.y *= -0.4; g.vel.x *= 0.7; g.vel.z *= 0.7; g.bounced++; }
    // wall bounce (AABB)
    for (const c of G.colliders) {
      if (g.pos.x > c.x0 && g.pos.x < c.x1 && g.pos.z > c.z0 && g.pos.z < c.z1 && g.pos.y < c.h) {
        const dxl = g.pos.x - c.x0, dxr = c.x1 - g.pos.x, dzl = g.pos.z - c.z0, dzr = c.z1 - g.pos.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl || m === dxr) g.vel.x *= -0.5; else g.vel.z *= -0.5;
        g.bounced++;
      }
    }
    g.fuse -= dt;
    if (g.fuse <= 0) {
      if (g.kind === 'frag') {
        G.effects.explosion(g.pos);
        G.audio.explosion(g.pos.distanceTo(G.player.pos));
        G.noise = { x: g.pos.x, z: g.pos.z, r: 40, t: G.time };
        for (const p of G.persons) {
          if (p.dead) continue;
          const d = Math.hypot(p.pos.x - g.pos.x, p.pos.z - g.pos.z);
          if (d < 6) {
            // wall between? cheap check: only damage if roughly visible
            G.onHit(p, 90 * (1 - d / 6) + 10, 'body', null);
          }
        }
      } else {
        G.effects.smoke(g.pos.x, g.pos.z, 5, 14);
        G.audio.click();
      }
      G.grenades.splice(i, 1);
    }
  }
}

// --- fixed-step loop ---
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    acc -= STEP; steps++;
    G.time += STEP;
    const R = G.round;
    if (R.state === 'buy' || R.state === 'live' || R.state === 'roundEnd') {
      updatePlayer(G, G.player, input, STEP);
      updateBots(G, STEP);
      updateGrenades(STEP);
      G.rounds.update(STEP);
    }
    input.pressed.clear();
  }
  if (steps === 4) acc = 0;
  // camera follows the player
  const P = G.player;
  camera.position.set(P.pos.x, P.pos.y + P.eyeH + P.jumpY, P.pos.z);
  camera.rotation.set(P.pitch, P.yaw, 0);
  // dust drift
  world.motes.rotation.y += dt * 0.005;
  G.effects.update(dt);
  G.hud.update();
  renderer.render(scene, camera);
}
applyQuality('HIGH');
// Debug/testing hook: the whole state store is reachable as window.__SOLARIS__
// (read-only inspection and driving the game in automated tests).
window.__SOLARIS__ = G;
requestAnimationFrame(frame);
