// SOLARIS — HUD: all DOM. Cached refs, updates only what changed. The buy menu
// releases pointer lock so its buttons are clickable; B closes it again.
import { WEAPONS, GRENADES, WEAPON_ORDER } from './weapons.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createHud(G) {
  const el = {};
  for (const id of ['hp', 'hp-num', 'armor', 'armor-num', 'ammo-mag', 'ammo-res', 'weapon-name',
    'money', 'timer', 'score-atk', 'score-def', 'alive-atk', 'alive-def', 'round-num',
    'crosshair', 'hitmarker', 'killfeed', 'banner', 'banner-title', 'banner-sub', 'toast',
    'buy', 'buy-grid', 'buy-money', 'plant', 'plant-fill', 'plant-label', 'scope',
    'matchend', 'me-title', 'me-score', 'restart', 'vignette', 'bomb-status', 'overlay', 'play']) {
    el[id] = $(id);
  }
  let last = {};
  const set = (id, v) => { if (last[id] !== v) { last[id] = v; el[id].textContent = v; } };

  const hud = {
    el,
    banner(title, sub, kind) {
      if (!title) { el.banner.classList.add('hidden'); el.banner.classList.remove('show'); return; }
      el['banner-title'].textContent = title;
      el['banner-sub'].textContent = sub || '';
      el.banner.className = 'banner show ' + (kind || 'info');
      clearTimeout(hud._bt);
      hud._bt = setTimeout(() => { el.banner.classList.add('hidden'); el.banner.classList.remove('show'); }, 5000);
    },
    flash(msg) {
      el.toast.textContent = msg;
      el.toast.classList.add('show');
      clearTimeout(hud._ft);
      hud._ft = setTimeout(() => el.toast.classList.remove('show'), 2200);
    },
    killfeed(killer, victim, head) {
      const line = document.createElement('div');
      line.className = 'kf-line';
      line.innerHTML = `<b class="kf-k">${killer}</b> ${head ? '<span class="kf-hs">HEADSHOT</span> ' : ''}☠ <b class="kf-v">${victim}</b>`;
      el.killfeed.prepend(line);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
      setTimeout(() => line.classList.add('fade'), 4200);
      setTimeout(() => line.remove(), 5200);
    },
    hitmarker(head, kill) {
      el.hitmarker.className = 'hitmarker show' + (head ? ' head' : '') + (kill ? ' kill' : '');
      clearTimeout(hud._ht);
      hud._ht = setTimeout(() => { el.hitmarker.className = 'hitmarker'; }, 130);
    },
    hurt() {
      el.vignette.classList.add('hurt');
      setTimeout(() => el.vignette.classList.remove('hurt'), 220);
    },
    setScope(on) { el.scope.classList.toggle('hidden', !on); },
    setPlant(frac, site) {
      if (frac <= 0) { el.plant.classList.add('hidden'); return; }
      el.plant.classList.remove('hidden');
      el['plant-fill'].style.width = (frac * 100).toFixed(0) + '%';
      el['plant-label'].textContent = 'PLANTING — SITE ' + site;
    },
    setBuyOpen(open) {
      if (open && G.round.state !== 'buy') open = false;
      el.buy.classList.toggle('hidden', !open);
      if (open) { hud.refreshBuy(); if (document.pointerLockElement) document.exitPointerLock(); }
      G.buyOpen = open;
    },
    refreshBuy() {
      const P = G.player;
      el['buy-money'].textContent = '$' + P.money;
      let html = '';
      for (const id of WEAPON_ORDER) {
        const w = WEAPONS[id], owned = G.ownedWeapons.has(id);
        const afford = P.money >= w.price;
        html += `<button class="buy-card${owned ? ' owned' : ''}${!owned && !afford ? ' poor' : ''}" data-w="${id}">
          <b>${w.name}</b><span>${w.kind} · ${w.dmg} dmg · ${w.mag} rnd</span>
          <i>${owned ? 'OWNED — click to equip' : '$' + w.price}</i></button>`;
      }
      html += `<button class="buy-card" data-item="armor"><b>Kevlar Armor</b><span>+50 armor</span><i>$650</i></button>
        <button class="buy-card" data-item="frag"><b>Frag Grenade</b><span>throw with G</span><i>$300</i></button>
        <button class="buy-card" data-item="smoke"><b>Smoke Grenade</b><span>throw with X</span><i>$300</i></button>`;
      el['buy-grid'].innerHTML = html;
      el['buy-grid'].querySelectorAll('[data-w]').forEach((b) => b.onclick = () => {
        const id = b.dataset.w;
        if (G.ownedWeapons.has(id)) { G.rounds.buyEquip(id); }
        else if (G.rounds.buyWeapon(id)) { G.ownedWeapons.add(id); G.ammoStore[id] = G.player.ammo; }
        hud.refreshBuy();
      });
      el['buy-grid'].querySelectorAll('[data-item]').forEach((b) => b.onclick = () => {
        G.rounds.buyItem(b.dataset.item); hud.refreshBuy();
      });
    },
    showMatchEnd(won, a, d) {
      el['me-title'].textContent = won ? 'SOLARIS SECURED — ATTACKERS WIN' : 'DEFENSE HOLDS — DEFENDERS WIN';
      el['me-title'].className = won ? 'win' : 'lose';
      el['me-score'].textContent = `Final score  ${a} — ${d}   ·   Your kills: ${G.player.kills}`;
      el.matchend.classList.remove('hidden');
      if (document.pointerLockElement) document.exitPointerLock();
    },
    hideMatchEnd() { el.matchend.classList.add('hidden'); },
    update() {
      const P = G.player, R = G.round;
      set('hp-num', Math.ceil(P.hp));
      el.hp.style.width = clamp(P.hp, 0, 100) + '%';
      el.hp.classList.toggle('low', P.hp <= 30);
      set('armor-num', Math.ceil(P.armor));
      el.armor.style.width = clamp(P.armor / 50 * 100, 0, 100) + '%';
      set('ammo-mag', P.ammo.mag);
      set('ammo-res', '/ ' + P.ammo.reserve);
      el['ammo-mag'].parentElement.classList.toggle('empty', P.ammo.mag === 0);
      set('weapon-name', WEAPONS[P.weapon].name + (P.reloading ? ' — RELOADING' : ''));
      set('money', '$' + P.money);
      const t = R.state === 'buy' ? Math.ceil(R.buyT) : R.state === 'live' ? Math.max(0, Math.ceil(R.bomb.plantedAt ? R.bomb.bombT : R.timer)) : 0;
      set('timer', String(Math.floor(t / 60)) + ':' + String(t % 60).padStart(2, '0'));
      el.timer.classList.toggle('urgent', t <= 15 && R.state === 'live');
      set('score-atk', R.score.atk);
      set('score-def', R.score.def);
      set('round-num', 'ROUND ' + Math.max(1, R.round) + ' / 15');
      const atkAlive = G.persons.filter((p) => p.team === 'atk' && !p.dead).length;
      const defAlive = G.persons.filter((p) => p.team === 'def' && !p.dead).length;
      set('alive-atk', atkAlive + ' alive');
      set('alive-def', defAlive + ' alive');
      // crosshair spread from bloom + movement
      const sp = 6 + P.bloom * 900 + (P.moving ? 5 : 0) + (P.crouch ? -2 : 0) + (P.scoped ? -6 : 0);
      el.crosshair.style.setProperty('--gap', clamp(sp, 3, 26) + 'px');
      el.crosshair.classList.toggle('hidden', P.scoped);
      // bomb status line
      const b = G.bomb;
      let bs = '';
      if (b.plantedAt) bs = '💣 BOMB PLANTED — SITE ' + b.plantedAt.name + ' — ' + Math.ceil(b.bombT) + 's';
      else if (b.carrier === P) bs = '💣 YOU CARRY THE BOMB — plant at A or B (hold E)';
      else if (b.carrier) bs = '💣 ' + b.carrier.name + ' carries the bomb';
      else if (b.droppedAt) bs = '💣 BOMB DROPPED — pick it up';
      if (last.bs !== bs) { last.bs = bs; el['bomb-status'].textContent = bs; el['bomb-status'].classList.toggle('planted', !!b.plantedAt); }
      // grenade counts in the weapon line
      set('weapon-name', WEAPONS[P.weapon].name + (P.reloading ? ' — RELOADING' : '') + `  ·  frag ${P.grenades.frag} · smoke ${P.grenades.smoke}`);
    },
  };
  return hud;
}
