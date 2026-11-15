// SOLARIS — rounds: 5v5, first to 8, buy phase, bomb plant/defuse, economy.
// The player is always on Attack; defender bots plant-guard and defuse.
import { SITE_A, SITE_B, SPAWN_ATK, SPAWN_DEF } from './world.js';
import { WEAPONS, freshAmmo } from './weapons.js';

export const WIN_SCORE = 8;
export const ROUND_TIME = 100;
export const BOMB_TIME = 40;

export function createRounds(G) {
  const R = {
    state: 'lobby', // lobby | buy | live | roundEnd | matchEnd
    round: 0, score: { atk: 0, def: 0 }, timer: 0, buyT: 0, endT: 0,
    lossStreak: 0, winner: null, reason: '',
    bomb: { carrier: null, droppedAt: null, plantedAt: null, plantT: 0, defuser: null, bombT: 0 },
  };
  G.round = R; G.bomb = R.bomb;

  function resetPositions() {
    const P = G.player;
    P.pos.set(SPAWN_ATK.x, 0, SPAWN_ATK.z); P.yaw = SPAWN_ATK.yaw; P.pitch = 0;
    P.hp = 100; P.armor = P.armorKept ? 50 : 0; P.armorKept = false;
    P.dead = false; P.ammo = freshAmmo(P.weapon); P.bloom = 0; P.reloading = false;
    P.grenades = { frag: P.grenades?.frag ?? 0, smoke: P.grenades?.smoke ?? 0 };
    let ai = 0, di = 0;
    for (const b of G.bots) {
      b.dead = false; b.hp = 100; b.armor = 0; b.ammo = freshAmmo(b.weapon);
      b.bloom = 0; b.reloading = false; b.target = null; b.path = []; b.pathI = 0;
      b.plantT = 0; b.defuseT = 0; b.state = 'route';
      if (b.mesh) { b.mesh.rotation.x = 0; b.mesh.visible = true; }
      if (b.team === 'atk') {
        b.pos.set(-28 + (ai % 2) * 2, 0, -4.5 + ai * 3); b.yaw = -Math.PI / 2; ai++;
        b.role = ai === 1 ? 'plant' : ai === 2 ? 'cover' : 'roam';
        b.assignedSite = null;
      } else {
        const spots = [[24, -10], [24, 10], [18, -6], [18, 6], [10, 0]];
        b.pos.set(spots[di][0], 0, spots[di][1]); b.yaw = Math.PI / 2; di++;
        b.role = di <= 2 ? 'siteA' : di <= 4 ? 'siteB' : 'mid';
      }
    }
    // bomb to the player; the plant bot is the backup carrier
    R.bomb.carrier = P; R.bomb.droppedAt = null; R.bomb.plantedAt = null;
    R.bomb.defuser = null; R.bomb.plantT = 0; R.bomb.bombT = 0;
    // assign the planter a site (alternate A/B by round)
    const planter = G.bots.find((b) => b.team === 'atk' && b.role === 'plant');
    if (planter) planter.assignedSite = R.round % 2 === 1 ? SITE_A : SITE_B;
    // bots upgrade to rifles after round 3 if they can afford it
    if (R.round >= 3) for (const b of G.bots) {
      if (b.weapon === 'smg' || b.weapon === 'shotgun') { b.weapon = 'rifle'; b.ammo = freshAmmo('rifle'); }
    }
  }
  function startRound() {
    R.round++;
    resetPositions();
    R.timer = ROUND_TIME; R.state = 'buy'; R.buyT = 12;
    G.hud.banner(`ROUND ${R.round}`, 'Buy your loadout — press B', 'info');
    G.hud.setBuyOpen(false);
    G.audio.click();
  }
  function endRound(winner, reason) {
    if (R.state === 'roundEnd' || R.state === 'matchEnd') return;
    R.winner = winner; R.reason = reason;
    R.score[winner]++;
    const P = G.player;
    if (winner === 'atk') {
      P.money += 3250; R.lossStreak = 0;
      G.hud.banner('ATTACKERS WIN THE ROUND', reason, 'win'); G.audio.roundWin();
    } else {
      R.lossStreak++;
      P.money += 1900 + Math.min(1000, (R.lossStreak - 1) * 500);
      G.hud.banner('DEFENDERS WIN THE ROUND', reason, 'lose'); G.audio.roundLose();
    }
    R.state = 'roundEnd'; R.endT = 4.5;
    G.hud.setBuyOpen(false);
    // clear bomb visuals
    if (R.bomb.plantedAt) G.effects.smoke(R.bomb.plantedAt.x, R.bomb.plantedAt.z, 2, 2);
  }
  function endMatch() {
    R.state = 'matchEnd';
    const won = R.score.atk > R.score.def;
    G.hud.showMatchEnd(won, R.score.atk, R.score.def);
    if (won) G.audio.roundWin(); else G.audio.roundLose();
  }
  function checkWin() {
    const atkAlive = G.persons.filter((p) => p.team === 'atk' && !p.dead).length;
    const defAlive = G.persons.filter((p) => p.team === 'def' && !p.dead).length;
    if (R.bomb.plantedAt) {
      if (R.bomb.bombT <= 0) { G.effects.explosion({ x: R.bomb.plantedAt.x, y: 0, z: R.bomb.plantedAt.z }); G.audio.explosion(0); endRound('atk', 'The bomb detonated at Site ' + R.bomb.plantedAt.name); return; }
      if (defAlive === 0) { endRound('atk', 'All defenders eliminated'); return; }
      return; // bomb ticking; only defuse or explosion ends it
    }
    if (defAlive === 0) { endRound('atk', 'All defenders eliminated'); return; }
    if (atkAlive === 0) { endRound('def', 'All attackers eliminated'); return; }
    if (R.timer <= 0) { endRound('def', 'Time expired — the bomb was never planted'); }
  }
  function update(dt) {
    if (R.state === 'buy') {
      R.buyT -= dt;
      if (R.buyT <= 0) { R.state = 'live'; G.hud.banner('', '', 'info'); G.hud.setBuyOpen(false); }
      return;
    }
    if (R.state === 'live') {
      R.timer -= dt;
      if (R.bomb.plantedAt) {
        R.bomb.bombT -= dt;
        // defuse progress is driven by bots in updateBots; player is attack-only
        if (R.bomb.defuser && R.bomb.defuser.dead) R.bomb.defuser = null;
      } else {
        // bomb pickup: player walks over a dropped bomb
        const P = G.player;
        if (!R.bomb.carrier && R.bomb.droppedAt && !P.dead) {
          const d = Math.hypot(P.pos.x - R.bomb.droppedAt.x, P.pos.z - R.bomb.droppedAt.z);
          if (d < 1.4) { R.bomb.carrier = P; R.bomb.droppedAt = null; G.hud.flash('Bomb picked up'); G.audio.buy(); }
        }
        // a bot picks up a dropped bomb
        if (!R.bomb.carrier && R.bomb.droppedAt) {
          for (const b of G.bots) {
            if (b.team !== 'atk' || b.dead) continue;
            const d = Math.hypot(b.pos.x - R.bomb.droppedAt.x, b.pos.z - R.bomb.droppedAt.z);
            if (d < 1.4) { R.bomb.carrier = b; R.bomb.droppedAt = null; G.hud.killfeed('SYSTEM', `${b.name} picked up the bomb`); break; }
          }
        }
      }
      checkWin();
      return;
    }
    if (R.state === 'roundEnd') {
      R.endT -= dt;
      if (R.endT <= 0) {
        if (R.score.atk >= WIN_SCORE || R.score.def >= WIN_SCORE || R.round >= 15) endMatch();
        else startRound();
      }
    }
  }
  return {
    R, startMatch() { R.score = { atk: 0, def: 0 }; R.round = 0; R.lossStreak = 0; startRound(); },
    startRound, endRound, update,
    buyWeapon(id) {
      const w = WEAPONS[id], P = G.player;
      if (!w || P.money < w.price || R.state !== 'buy') return false;
      P.money -= w.price; P.weapon = id; P.ammo = freshAmmo(id);
      G.onWeaponChange(); G.audio.buy(); return true;
    },
    buyEquip(id) {
      const P = G.player;
      if (!G.ownedWeapons.has(id) || R.state !== 'buy') return false;
      P.weapon = id; P.ammo = G.ammoStore[id] || freshAmmo(id);
      G.onWeaponChange(); G.audio.click(); return true;
    },
    buyItem(kind) {
      const P = G.player;
      if (R.state !== 'buy') return false;
      if (kind === 'armor') {
        if (P.money < 650 || P.armor >= 50) return false;
        P.money -= 650; P.armor = 50; P.armorKept = true;
      } else if (kind === 'frag' || kind === 'smoke') {
        if (P.money < 300 || P.grenades[kind] >= 2) return false;
        P.money -= 300; P.grenades[kind]++;
      } else return false;
      G.audio.buy(); return true;
    },
  };
}
