// hud.js — everything drawn over the 3D view: the minimap, wanted stars,
// cash and health, the objective tracker with its distance readout, dialogue
// banners, dispatch toasts, story job cards and the end screens.

import { fmtMoney, fmtTime } from './util.js';
import { LAYOUT } from './world.js';

const $ = id => document.getElementById(id);

export function createHud() {
  const els = {
    objbox: $('objbox'), objText: $('obj-text'), objDist: $('obj-dist'), objKicker: $('obj-kicker'),
    status: $('status'), stars: $('stars'), cash: $('cash'),
    healthfill: $('healthfill'), bustedwrap: $('bustedwrap'), bustedfill: $('bustedfill'),
    speedo: $('speedo'), radio: $('radio'), mapwrap: $('mapwrap'),
    dialogue: $('dialogue'), dlgName: $('dlg-name'), dlgText: $('dlg-text'),
    prompt: $('prompt'), toasts: $('toasts'), jobcard: $('jobcard'),
    cardKicker: $('card-kicker'), cardTitle: $('card-title'), cardSub: $('card-sub'),
    racebox: $('racebox'), raceTitle: $('race-title'), raceInfo: $('race-info'),
    vignette: $('vignette'), fade: $('fade'), crosshair: $('crosshair'),
    end: $('end'), endTitle: $('end-title'), endSub: $('end-sub'),
  };
  const mapCtx = $('minimap').getContext('2d');
  let objective = null; // { text, x, z } — z null means no marker
  let dlgT = 0, cardT = 0, lastStars = -1, lastCash = null, radioText = null;

  function showGameUI(on) {
    for (const k of ['objbox', 'status', 'mapwrap']) els[k].classList.toggle('hidden', !on);
    els.crosshair.style.display = on ? 'block' : 'none';
    if (!on) { els.dialogue.classList.add('hidden'); els.prompt.classList.add('hidden'); els.racebox.classList.add('hidden'); }
  }

  function setObjective(text, x, z, kicker) {
    objective = text ? { text, x, z } : null;
    els.objbox.classList.toggle('hidden', !text);
    if (text) {
      els.objText.textContent = text;
      els.objKicker.textContent = kicker || 'OBJECTIVE';
    }
  }

  function toast(name, text, kind) {
    const div = document.createElement('div');
    div.className = 'toast' + (kind ? ' ' + kind : '');
    div.innerHTML = `<b>${name}</b><br>${text}`;
    els.toasts.appendChild(div);
    while (els.toasts.children.length > 4) els.toasts.firstChild.remove();
    setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity .5s'; }, 4200);
    setTimeout(() => div.remove(), 4800);
  }

  function dialogue(name, text, dur) {
    els.dlgName.textContent = name;
    els.dlgText.textContent = text;
    els.dialogue.classList.remove('hidden');
    dlgT = dur || 4.2;
  }
  function hideDialogue() { els.dialogue.classList.add('hidden'); dlgT = 0; }

  function jobCard(kicker, title, sub, dur) {
    els.cardKicker.textContent = kicker;
    els.cardTitle.textContent = title;
    els.cardSub.textContent = sub || '';
    els.jobcard.classList.remove('hidden');
    cardT = dur || 3.4;
  }

  function prompt(html) {
    if (!html) { els.prompt.classList.add('hidden'); return; }
    els.prompt.innerHTML = html;
    els.prompt.classList.remove('hidden');
  }

  function setRadio(html) {
    radioText = html;
    els.radio.innerHTML = html || '';
    els.radio.classList.toggle('hidden', !html);
  }

  function showEnd(kind, sub) {
    els.endTitle.textContent = kind;
    els.endSub.textContent = sub;
    els.end.classList.remove('hidden');
  }
  function hideEnd() { els.end.classList.add('hidden'); }

  function drawMinimap(G) {
    const ctx = mapCtx, S = 196, C = S / 2, RANGE = 125;
    const p = G.playerPos();
    const w2m = (wx, wz) => [C + (wx - p.x) * (C / RANGE), C + (wz - p.z) * (C / RANGE)];
    ctx.fillStyle = '#241a3e'; ctx.fillRect(0, 0, S, S);
    // Sea and beach to the south.
    ctx.fillStyle = '#274b73';
    let [, seaY] = w2m(0, LAYOUT.seaZ); ctx.fillRect(0, seaY, S, S - seaY);
    ctx.fillStyle = '#d9b77c';
    let [, beachY] = w2m(0, LAYOUT.beachZ); ctx.fillRect(0, beachY, S, Math.max(0, seaY - beachY));
    // Blocks and roads.
    ctx.fillStyle = '#3c3f4a';
    for (const bx of LAYOUT.cols) for (const bz of LAYOUT.rows) {
      const [x, y] = w2m(bx - 29, bz - 29);
      ctx.fillRect(x, y, 58 * C / RANGE, 58 * C / RANGE);
    }
    ctx.fillStyle = '#ffb347';
    const [plx, ply] = w2m(LAYOUT.plaza.x - 29, LAYOUT.plaza.z - 29);
    ctx.fillRect(plx, ply, 58 * C / RANGE, 58 * C / RANGE);
    // Blips: packages, shops, police, then the objective, then the player.
    const dot = (wx, wz, color, r) => {
      const [x, y] = w2m(wx, wz);
      if (x < -6 || y < -6 || x > S + 6 || y > S + 6) return;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.29); ctx.fill();
    };
    for (const spot of G.remainingPackages()) dot(spot.x, spot.z, '#4ecdc4', 2.4);
    for (const s of G.world.shops) dot(s.x, s.z, '#ffffff', 2.2);
    for (const c of G.police.cars) dot(c.pos.x, c.pos.z, '#6db3ff', 3);
    for (const o of G.police.officers) if (!o.dead) dot(o.pos.x, o.pos.z, '#bcd8ff', 2);
    if (objective && objective.x !== null && objective.x !== undefined) {
      let [x, y] = w2m(objective.x, objective.z);
      x = Math.max(10, Math.min(S - 10, x)); y = Math.max(10, Math.min(S - 10, y));
      ctx.fillStyle = '#ffd23e';
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore();
      ctx.strokeStyle = '#000'; ctx.strokeRect(x - 5, y - 5, 10, 10);
    }
    // Player arrow, pointing along the player's heading.
    ctx.save(); ctx.translate(C, C); ctx.rotate(-G.playerHeading());
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(5.5, -6); ctx.lineTo(0, -3); ctx.lineTo(-5.5, -6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function update(G, dt) {
    if (dlgT > 0) { dlgT -= dt; if (dlgT <= 0) els.dialogue.classList.add('hidden'); }
    if (cardT > 0) { cardT -= dt; if (cardT <= 0) els.jobcard.classList.add('hidden'); }
    const st = G.police.stars;
    if (st !== lastStars) {
      lastStars = st;
      els.stars.innerHTML = Array.from({ length: 5 }, (_, i) =>
        `<span class="${i < st ? 'lit' : ''}">★</span>`).join('');
    }
    if (G.cash !== lastCash) { lastCash = G.cash; els.cash.textContent = fmtMoney(G.cash); }
    els.healthfill.style.width = Math.max(0, G.health) + '%';
    const b = G.police.busted01;
    els.bustedwrap.style.opacity = b > 0.02 ? '1' : '0';
    els.bustedfill.style.width = (b * 100) + '%';
    els.vignette.style.opacity = String(G.vignette || 0);
    if (G.playerInCar()) {
      const kmh = Math.round(Math.abs(G.playerCar().speed) * 3.6);
      els.speedo.textContent = kmh + ' km/h · ' + G.playerCar().spec.name;
    } else els.speedo.textContent = '';
    if (objective && objective.x !== null && objective.x !== undefined) {
      const p = G.playerPos();
      const d = Math.hypot(objective.x - p.x, objective.z - p.z);
      els.objDist.textContent = '▸ ' + Math.round(d) + ' m';
    } else els.objDist.textContent = '';
    drawMinimap(G);
  }

  function raceShow(title, info) {
    els.raceTitle.textContent = title;
    els.raceInfo.textContent = info;
    els.racebox.classList.remove('hidden');
  }
  function raceHide() { els.racebox.classList.add('hidden'); }

  return {
    els, showGameUI, setObjective, toast, dialogue, hideDialogue, jobCard, prompt,
    setRadio, showEnd, hideEnd, update, raceShow, raceHide,
    fade(on) { els.fade.style.opacity = on ? '1' : '0'; },
    raceInfo: (t) => { els.raceInfo.textContent = t; },
    fmtTime,
  };
}
