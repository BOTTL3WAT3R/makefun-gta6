// hud.js — everything drawn over the 3D world: wallet and wanted stars,
// health and armour, the objective line, dialogue, job cards, toasts, the
// BUSTED/WASTED banners, and the live minimap with its blips.

import { PLACES, ROAD_X, ROAD_Z } from './config.js';
import { formatCash, formatTime } from './util.js';
import { currentLine } from './jobs.js';
import { playerPos } from './player.js';

const el = {};

export function initHud(G) {
  for (const id of [
    'hud', 'cash', 'wanted-stars', 'health-fill', 'armor-fill', 'package-count',
    'objective', 'job-timer', 'dialogue', 'dlg-name', 'dlg-text', 'card',
    'card-title', 'card-sub', 'prompt', 'toast', 'radio-name', 'bust-wrap',
    'bust-fill', 'banner', 'banner-title', 'banner-sub', 'vignette',
    'title-screen', 'pause-menu', 'btn-new', 'btn-continue',
    'btn-resume', 'btn-save', 'btn-quit',
  ]) {
    el[id] = document.getElementById(id);
  }
  el.minimap = document.getElementById('minimap');
  el.mapCtx = el.minimap.getContext('2d');

  el['btn-new'].addEventListener('click', () => G.ui.newGame());
  el['btn-continue'].addEventListener('click', () => G.ui.continueGame());
  el['btn-resume'].addEventListener('click', () => G.ui.resume());
  el['btn-save'].addEventListener('click', () => G.ui.save());
  el['btn-quit'].addEventListener('click', () => G.ui.quitToTitle());
  refreshContinueButton(G);
}

export function refreshContinueButton(G) {
  if (el['btn-continue']) el['btn-continue'].disabled = !G.hasSaveFile();
}

export function showTitle(G, show) {
  el['title-screen'].style.display = show ? 'flex' : 'none';
  el.hud.style.display = show ? 'none' : 'block';
  if (show) refreshContinueButton(G);
}

export function showPause(G, show) {
  el['pause-menu'].style.display = show ? 'flex' : 'none';
}

function drawMinimap(G) {
  const ctx = el.mapCtx;
  const S = 190 / 1024;
  const mx = (x) => (x + 512) * S;
  const mz = (z) => (z + 512) * S;
  ctx.fillStyle = '#24313d';
  ctx.fillRect(0, 0, 190, 190);
  // Sea and sand.
  ctx.fillStyle = '#2d6f8e';
  ctx.fillRect(mx(336), 0, 190 - mx(336), 190);
  ctx.fillStyle = '#e6c98c';
  ctx.fillRect(mx(330), 0, mx(372) - mx(330), 190);
  // Roads.
  ctx.strokeStyle = '#5a6673';
  ctx.lineWidth = 3;
  for (const x of ROAD_X) {
    ctx.beginPath(); ctx.moveTo(mx(x), mz(-480)); ctx.lineTo(mx(x), mz(480)); ctx.stroke();
  }
  for (const z of ROAD_Z) {
    ctx.beginPath(); ctx.moveTo(mx(-480), mz(z)); ctx.lineTo(mx(300), mz(z)); ctx.stroke();
  }
  ctx.strokeStyle = '#c8a06a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(mx(292), mz(-480)); ctx.lineTo(mx(292), mz(480)); ctx.stroke();
  // Plaza.
  ctx.fillStyle = '#8a7c62';
  ctx.beginPath(); ctx.arc(mx(PLACES.plaza.x), mz(PLACES.plaza.z), 5, 0, 7); ctx.fill();

  // Packages still out there.
  ctx.fillStyle = '#ffe9a0';
  for (const p of G.activities.packages) {
    if (p.taken) continue;
    ctx.fillRect(mx(p.x) - 1, mz(p.z) - 1, 2, 2);
  }
  // The objective, gold for story, green for activities.
  const objective = G.job.objective || G.activityObjective;
  if (objective) {
    const pulse = 3 + Math.sin(G.elapsed * 5) * 1.2;
    ctx.strokeStyle = G.job.objective ? '#ffca3a' : '#7ddb4a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx(objective.x), mz(objective.z), pulse + 2, 0, 7); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.arc(mx(objective.x), mz(objective.z), 2, 0, 7); ctx.fill();
  }
  // Police: alternating red/blue blips.
  const phase = Math.floor(G.elapsed * 2.4) % 2;
  for (const u of G.police.units) {
    ctx.fillStyle = phase === 0 ? '#ff4030' : '#3a6aff';
    ctx.beginPath(); ctx.arc(mx(u.x), mz(u.z), 2.6, 0, 7); ctx.fill();
  }
  if (G.police.heli) {
    ctx.fillStyle = '#c89aff';
    ctx.beginPath();
    ctx.arc(mx(G.police.heli.group.position.x), mz(G.police.heli.group.position.z), 3, 0, 7);
    ctx.fill();
  }
  // The player: a white arrow on their heading.
  const pp = playerPos(G.player);
  const heading = G.player.inVehicle ? G.player.inVehicle.heading : G.player.heading;
  ctx.save();
  ctx.translate(mx(pp.x), mz(pp.z));
  ctx.rotate(Math.PI - heading); // the arrow is drawn pointing up (north)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 5);
  ctx.lineTo(0, 2.4);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function updateHud(G) {
  if (G.mode === 'title') return;
  const player = G.player;
  el.cash.textContent = formatCash(player.cash);
  const wanted = Math.max(G.police.wanted, G.police.heatFloor);
  el['wanted-stars'].textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
  el['wanted-stars'].style.opacity = wanted > 0 ? '1' : '0.25';
  el['health-fill'].style.width = player.health + '%';
  el['health-fill'].style.background = player.health > 45 ? '#7ddb4a' : player.health > 22 ? '#e8b93c' : '#d93a2e';
  el['armor-fill'].style.width = player.armor + '%';
  el['package-count'].textContent = '📦 ' + G.activities.packagesFound + '/15';

  const objective = G.job.objective || G.activityObjective;
  el.objective.textContent = objective ? '◎ ' + objective.label : '';
  if (G.job.timer !== null && G.job.timer !== undefined) {
    el['job-timer'].textContent = '⏱ ' + formatTime(G.job.timer);
    el['job-timer'].style.color = G.job.timer < 25 ? '#ff5040' : '#ffe9a0';
    el['job-timer'].style.display = 'block';
  } else if (G.activityTimer !== null && G.activityTimer !== undefined) {
    el['job-timer'].textContent = '⏱ ' + formatTime(G.activityTimer);
    el['job-timer'].style.color = '#b8ffc8';
    el['job-timer'].style.display = 'block';
  } else {
    el['job-timer'].style.display = 'none';
  }

  const line = currentLine(G);
  if (line) {
    el.dialogue.style.display = 'block';
    el['dlg-name'].textContent = line[0];
    el['dlg-text'].textContent = line[1];
  } else {
    el.dialogue.style.display = 'none';
  }

  const card = G.job.card;
  if (card && G.elapsed < card.until) {
    el.card.style.display = 'block';
    el['card-title'].textContent = card.title;
    el['card-sub'].textContent = card.subtitle;
  } else {
    el.card.style.display = 'none';
  }

  el.prompt.textContent = G.prompt || '';
  el.prompt.style.display = G.prompt ? 'block' : 'none';

  if (G.toastMsg && G.elapsed < G.toastMsg.until) {
    el.toast.textContent = G.toastMsg.text;
    el.toast.style.display = 'block';
  } else {
    el.toast.style.display = 'none';
  }

  if (G.radioDisplay && G.elapsed < G.radioDisplay.until) {
    el['radio-name'].textContent = G.radioDisplay.text;
    el['radio-name'].style.display = 'block';
  } else {
    el['radio-name'].style.display = 'none';
  }

  if (G.bustProgress > 0.03 && wanted > 0) {
    el['bust-wrap'].style.display = 'block';
    el['bust-fill'].style.width = Math.round(G.bustProgress * 100) + '%';
  } else {
    el['bust-wrap'].style.display = 'none';
  }

  if (G.banner && G.elapsed < G.banner.until) {
    el.banner.style.display = 'flex';
    el['banner-title'].textContent = G.banner.title;
    el['banner-sub'].textContent = G.banner.sub || '';
  } else {
    el.banner.style.display = 'none';
  }

  el.vignette.style.opacity = String(Math.min(0.6, G.hudFlash * 0.6));
  drawMinimap(G);
}
