// hud.js — everything drawn over the 3D world: the objective panel with the
// job title and progress, wallet and wanted stars, segmented health and
// armour bars, dialogue, job cards, toasts, the radio toast, the BUSTED /
// WASTED banners, a player-centred minimap, a speedometer while driving,
// the interaction prompt, the combat crosshair and the damage vignette.

import { CITY, PLACES, ROAD_X, ROAD_Z } from './config.js';
import { formatCash, formatTime } from './util.js';
import { activeJobTitle, currentLine, JOBS } from './jobs.js';
import { playerPos } from './player.js';
import { input } from './input.js';

const el = {};
let lastWanted = -1;
let lastDotsKey = '';

export function initHud(G) {
  for (const id of [
    'hud', 'cash', 'wanted-stars', 'health-fill', 'armor-fill', 'health-wrap',
    'armor-wrap', 'package-count', 'objective', 'job-kicker', 'job-title',
    'job-dots', 'job-timer', 'dialogue', 'dlg-name', 'dlg-text', 'card',
    'card-title', 'card-sub', 'prompt', 'prompt-key', 'prompt-text', 'toast',
    'radio-name', 'bust-wrap', 'bust-fill', 'banner', 'banner-title',
    'banner-sub', 'vignette', 'speedo', 'speedo-num', 'speedo-car',
    'crosshair', 'title-screen', 'pause-menu', 'btn-new', 'btn-continue',
    'btn-resume', 'btn-save', 'btn-quit',
  ]) {
    el[id] = document.getElementById(id);
  }
  el.minimap = document.getElementById('minimap');
  el.mapCtx = el.minimap.getContext('2d');
  el.bigmap = document.getElementById('bigmap');
  el.bigmapCtx = document.getElementById('bigmap-canvas').getContext('2d');

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

// Player-centred radar: a 250 m window on the city, north up, the player
// arrow in the middle and the mission blip pinned to the rim when the
// objective is off-screen.
function drawMinimap(G) {
  const ctx = el.mapCtx;
  const SIZE = 190;
  const VIEW = 250; // world metres across the map
  const S = SIZE / VIEW;
  const pp = playerPos(G.player);
  const mx = (x) => SIZE / 2 + (x - pp.x) * S;
  const mz = (z) => SIZE / 2 + (z - pp.z) * S;

  ctx.save();
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, 7);
  ctx.clip();
  // Land, then the shore: promenade, sand, sea.
  ctx.fillStyle = '#2b3644';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(mx(CITY.promenadeX - 10), 0, (372 - CITY.promenadeX + 10) * S, SIZE);
  ctx.fillStyle = '#e6c98c';
  ctx.fillRect(mx(CITY.sandX), 0, (CITY.waterX - CITY.sandX) * S, SIZE);
  ctx.fillStyle = '#2d6f8e';
  ctx.fillRect(mx(CITY.waterX), 0, SIZE - mx(CITY.waterX), SIZE);
  // Roads as filled strips.
  ctx.fillStyle = '#59636f';
  for (const x of ROAD_X) ctx.fillRect(mx(x) - 12 * S, 0, 24 * S, SIZE);
  for (const z of ROAD_Z) ctx.fillRect(0, mz(z) - 12 * S, SIZE, 24 * S);
  ctx.fillStyle = '#c8a06a';
  ctx.fillRect(mx(CITY.promenadeX) - 3 * S, 0, 6 * S, SIZE);
  // The pier.
  ctx.fillStyle = '#9a6b44';
  ctx.fillRect(mx(317), mz(CITY.pierZ) - 13 * S, (467 - 317) * S, 26 * S);
  // Plaza.
  ctx.fillStyle = '#8a7c62';
  ctx.beginPath(); ctx.arc(mx(PLACES.plaza.x), mz(PLACES.plaza.z), 36 * S, 0, 7); ctx.fill();

  const inView = (x, z) => Math.abs(x - pp.x) < VIEW / 2 && Math.abs(z - pp.z) < VIEW / 2;
  // Packages still out there.
  ctx.fillStyle = '#ffe9a0';
  for (const p of G.activities.packages) {
    if (p.taken || !inView(p.x, p.z)) continue;
    ctx.fillRect(mx(p.x) - 1.5, mz(p.z) - 1.5, 3, 3);
  }
  // Police: alternating red/blue blips.
  const phase = Math.floor(G.elapsed * 2.4) % 2;
  for (const u of G.police.units) {
    if (!inView(u.x, u.z)) continue;
    ctx.fillStyle = phase === 0 ? '#ff4030' : '#3a6aff';
    ctx.beginPath(); ctx.arc(mx(u.x), mz(u.z), 3, 0, 7); ctx.fill();
  }
  if (G.police.heli) {
    const hx = G.police.heli.group.position.x;
    const hz = G.police.heli.group.position.z;
    if (inView(hx, hz)) {
      ctx.fillStyle = '#c89aff';
      ctx.beginPath(); ctx.arc(mx(hx), mz(hz), 3.4, 0, 7); ctx.fill();
    }
  }
  // The objective: a pulsing ring in view, a rim blip when it is not.
  const objective = G.job.objective || G.activityObjective;
  if (objective) {
    const gold = !!G.job.objective;
    ctx.strokeStyle = gold ? '#ffca3a' : '#7ddb4a';
    ctx.fillStyle = ctx.strokeStyle;
    if (inView(objective.x, objective.z)) {
      const pulse = 4 + Math.sin(G.elapsed * 5) * 1.4;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx(objective.x), mz(objective.z), pulse + 2.5, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx(objective.x), mz(objective.z), 2.4, 0, 7); ctx.fill();
    } else {
      const ang = Math.atan2(objective.z - pp.z, objective.x - pp.x);
      const bx = SIZE / 2 + Math.cos(ang) * (SIZE / 2 - 11);
      const bz = SIZE / 2 + Math.sin(ang) * (SIZE / 2 - 11);
      ctx.beginPath(); ctx.arc(bx, bz, 4.5, 0, 7); ctx.fill();
    }
  }
  // The player: a white arrow on their heading, centre of the map.
  const heading = G.player.inVehicle ? G.player.inVehicle.heading : G.player.heading;
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.rotate(Math.PI - heading); // the arrow is drawn pointing up (north)
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(10,10,14,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(4.6, 5.6);
  ctx.lineTo(0, 2.8);
  ctx.lineTo(-4.6, 5.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // North marker.
  ctx.fillStyle = 'rgba(253,246,233,0.85)';
  ctx.font = '800 11px Verdana, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', SIZE / 2, 14);
}

// Full-screen map (M): the whole city on one canvas, drawn from the same
// layout data as the minimap — roads, shore, pier and plaza — with the
// player arrow, the objective ring, police and packages over it. World
// extents x -500..500, z -500..500 mapped onto the square canvas.
export function showBigMap(G, show) {
  el.bigmap.style.display = show ? 'flex' : 'none';
  if (show) drawBigMap(G);
}

export function drawBigMap(G) {
  const ctx = el.bigmapCtx;
  const W = 960;
  const H = 760;
  const mx = (x) => ((x + 500) / 1000) * W;
  const mz = (z) => ((z + 500) / 1000) * H;
  const S = W / 1000; // pixels per metre (x axis; z is close enough)

  ctx.fillStyle = '#2b3644';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#8a6f4d';
  ctx.fillRect(mx(CITY.promenadeX - 10), 0, mx(CITY.waterX) - mx(CITY.promenadeX - 10), H);
  ctx.fillStyle = '#e6c98c';
  ctx.fillRect(mx(CITY.sandX), 0, mx(CITY.waterX) - mx(CITY.sandX), H);
  ctx.fillStyle = '#2d6f8e';
  ctx.fillRect(mx(CITY.waterX), 0, W - mx(CITY.waterX), H);
  ctx.fillStyle = '#59636f';
  for (const x of ROAD_X) ctx.fillRect(mx(x) - 12 * S, 0, 24 * S, H);
  for (const z of ROAD_Z) ctx.fillRect(0, mz(z) - 12 * S, W, 24 * S);
  ctx.fillStyle = '#c8a06a';
  ctx.fillRect(mx(CITY.promenadeX) - 3 * S, 0, 6 * S, H);
  ctx.fillStyle = '#9a6b44';
  ctx.fillRect(mx(317), mz(CITY.pierZ) - 13 * S, mx(467) - mx(317), 26 * S);
  ctx.fillStyle = '#8a7c62';
  ctx.beginPath(); ctx.arc(mx(PLACES.plaza.x), mz(PLACES.plaza.z), 36 * S, 0, 7); ctx.fill();

  // Named places worth finding again.
  ctx.fillStyle = 'rgba(253,246,233,0.85)';
  ctx.font = '700 12px Verdana, sans-serif';
  ctx.textAlign = 'left';
  for (const key of ['comisaria', 'clinica', 'clubBrisa', 'marina', 'plaza', 'safehouse']) {
    const p = PLACES[key];
    ctx.beginPath(); ctx.arc(mx(p.x), mz(p.z), 3.5, 0, 7); ctx.fill();
    ctx.fillText(p.label, mx(p.x) + 8, mz(p.z) + 4);
  }
  // Packages still out there.
  ctx.fillStyle = '#ffe9a0';
  for (const p of G.activities.packages) {
    if (p.taken) continue;
    ctx.fillRect(mx(p.x) - 3, mz(p.z) - 3, 6, 6);
  }
  // Police.
  const phase = Math.floor(G.elapsed * 2.4) % 2;
  for (const u of G.police.units) {
    ctx.fillStyle = phase === 0 ? '#ff4030' : '#3a6aff';
    ctx.beginPath(); ctx.arc(mx(u.x), mz(u.z), 5, 0, 7); ctx.fill();
  }
  if (G.police.heli) {
    ctx.fillStyle = '#c89aff';
    ctx.beginPath();
    ctx.arc(mx(G.police.heli.group.position.x), mz(G.police.heli.group.position.z), 5.5, 0, 7);
    ctx.fill();
  }
  // The objective: a pulsing gold (job) or green (activity) ring.
  const objective = G.job.objective || G.activityObjective;
  if (objective) {
    ctx.strokeStyle = G.job.objective ? '#ffca3a' : '#7ddb4a';
    ctx.lineWidth = 3;
    const pulse = 11 + Math.sin(G.elapsed * 5) * 2.5;
    ctx.beginPath(); ctx.arc(mx(objective.x), mz(objective.z), pulse, 0, 7); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.arc(mx(objective.x), mz(objective.z), 4, 0, 7); ctx.fill();
  }
  // The player arrow on their heading.
  const pp = playerPos(G.player);
  const heading = G.player.inVehicle ? G.player.inVehicle.heading : G.player.heading;
  ctx.save();
  ctx.translate(mx(pp.x), mz(pp.z));
  ctx.rotate(Math.PI - heading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(10,10,14,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(8, 10);
  ctx.lineTo(0, 5);
  ctx.lineTo(-8, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // North marker.
  ctx.fillStyle = 'rgba(253,246,233,0.9)';
  ctx.font = '800 15px Verdana, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', W / 2, 22);
}

export function updateHud(G) {
  if (G.mode === 'title') return;
  const player = G.player;
  el.cash.textContent = formatCash(player.cash);
  const wanted = Math.max(G.police.wanted, G.police.heatFloor);
  if (wanted !== lastWanted) {
    lastWanted = wanted;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += '<span class="star' + (i < wanted ? ' on' : '') + '">★</span>';
    el['wanted-stars'].innerHTML = stars;
  }
  el['health-fill'].style.width = player.health + '%';
  el['health-fill'].style.background = player.health > 45 ? '#7ddb4a' : player.health > 22 ? '#e8b93c' : '#d93a2e';
  el['health-wrap'].classList.toggle('low', player.health <= 25 && player.health > 0);
  el['armor-fill'].style.width = player.armor + '%';
  el['package-count'].textContent = '📦 ' + G.activities.packagesFound + '/15';

  // Objective panel: kicker (job n of 7), title, objective line, dots.
  const active = G.job.active;
  const title = activeJobTitle(G);
  el['job-kicker'].textContent = active
    ? active.def.subtitle.toUpperCase()
    : (G.storyDone ? 'ALL SEVEN JOBS DONE' : 'COSTA VERA · GOLDEN HOUR');
  el['job-title'].textContent = title || (G.storyDone ? 'The city is yours' : 'Free roam');
  const objective = G.job.objective || G.activityObjective;
  el.objective.textContent = objective
    ? '◎ ' + objective.label
    : (active ? '' : 'Talk to Pilar by the pier for work');
  const dotsKey = G.job.nextIndex + '|' + (active ? 'a' : '') + '|' + G.storyDone;
  if (dotsKey !== lastDotsKey) {
    lastDotsKey = dotsKey;
    let dots = '';
    for (let i = 0; i < JOBS.length; i++) {
      const cls = i < G.job.nextIndex || G.storyDone ? 'done' : (active && i === G.job.nextIndex ? 'current' : '');
      dots += '<span class="dot ' + cls + '"></span>';
    }
    el['job-dots'].innerHTML = dots;
  }

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

  // Interaction prompt: a key pill plus the action text.
  const rawPrompt = G.prompt || '';
  if (rawPrompt) {
    let text = rawPrompt;
    if (rawPrompt.startsWith('E — ')) text = rawPrompt.slice(4);
    else if (rawPrompt.startsWith('E - ')) text = rawPrompt.slice(4);
    el['prompt-key'].style.display = text !== rawPrompt ? 'inline-block' : 'none';
    el['prompt-text'].textContent = text;
    el.prompt.style.display = 'flex';
  } else {
    el.prompt.style.display = 'none';
  }

  if (G.toastMsg && G.elapsed < G.toastMsg.until) {
    el.toast.textContent = G.toastMsg.text;
    el.toast.style.display = 'block';
  } else {
    el.toast.style.display = 'none';
  }

  // The radio toast fades in and out on a class, not a hard display cut.
  const radioOn = !!(G.radioDisplay && G.elapsed < G.radioDisplay.until);
  if (radioOn) el['radio-name'].textContent = G.radioDisplay.text;
  el['radio-name'].classList.toggle('show', radioOn);

  // Speedometer while driving.
  if (player.inVehicle) {
    el.speedo.style.display = 'flex';
    el['speedo-num'].textContent = String(Math.round(Math.abs(player.inVehicle.speed) * 3.6));
    el['speedo-car'].textContent = player.inVehicle.stats.name;
  } else {
    el.speedo.style.display = 'none';
  }

  // Crosshair at the mouse while aiming (combat mode).
  if (G.aiming) {
    el.crosshair.style.display = 'block';
    el.crosshair.style.left = input.mouseX + 'px';
    el.crosshair.style.top = input.mouseY + 'px';
  } else {
    el.crosshair.style.display = 'none';
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

  el.vignette.style.opacity = String(Math.min(0.65, G.hudFlash * 0.65));
  drawMinimap(G);
  if (G.mapOpen) drawBigMap(G);
}
