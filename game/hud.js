// hud.js — everything the player reads: cash, wanted stars, health bars,
// objective line, job banners, dialogue, toasts, and the minimap (a static
// painted map layer with live dots for player, police, traffic, objective).

import { AVENUES_X, STREETS_Z, SHOPS } from './world.js';
import { clamp, fmtCash } from './util.js';

const $ = id => document.getElementById(id);
const MAP = { x0: -260, x1: 260, z0: -230, z1: 230, w: 200, h: 200 };
const mx = x => (x - MAP.x0) / (MAP.x1 - MAP.x0) * MAP.w;
const mz = z => (z - MAP.z0) / (MAP.z1 - MAP.z0) * MAP.h;

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), cash: $('cash'), stars: $('stars'), radio: $('radio-name'),
      health: $('bar-health'), armor: $('bar-armor'), speed: $('speed'),
      vehicle: $('vehicle-name'), objective: $('objective-text'), progress: $('job-progress'),
      banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      dialogue: $('dialogue'), dialogueWho: $('dialogue-who'), dialogueText: $('dialogue-text'),
      toast: $('toast'), interact: $('interact'), crosshair: $('crosshair'),
    };
    this.bannerUntil = 0; this.dialogueUntil = 0; this.toastUntil = 0;
    // Paint the static minimap layer once: land, water, beach, roads, shops.
    this.mapBase = document.createElement('canvas');
    this.mapBase.width = MAP.w; this.mapBase.height = MAP.h;
    const c = this.mapBase.getContext('2d');
    c.fillStyle = '#274b63'; c.fillRect(0, 0, MAP.w, MAP.h);
    c.fillStyle = '#57503f'; c.fillRect(0, 0, MAP.w, mz(216));
    c.fillStyle = '#d9b77c'; c.fillRect(0, mz(168), MAP.w, mz(216) - mz(168));
    c.strokeStyle = '#26282e'; c.lineWidth = 5;
    for (const x of AVENUES_X) { c.beginPath(); c.moveTo(mx(x), 0); c.lineTo(mx(x), mz(216)); c.stroke(); }
    for (const z of STREETS_Z) { c.beginPath(); c.moveTo(0, mz(z)); c.lineTo(MAP.w, mz(z)); c.stroke(); }
    c.fillStyle = '#ffd94d';
    for (const s of SHOPS) { c.fillRect(mx(s.door.x) - 2, mz(s.door.z) - 2, 4, 4); }
    this.mapCtx = $('minimap').getContext('2d');
  }
  show() { this.el.hud.classList.remove('hidden'); }
  banner(title, sub = '', seconds = 3.4) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.remove('hidden');
    this.bannerUntil = performance.now() + seconds * 1000;
  }
  dialogue(who, text, seconds = 4.2) {
    this.el.dialogueWho.textContent = who;
    this.el.dialogueText.textContent = text;
    this.el.dialogue.classList.remove('hidden');
    this.dialogueUntil = performance.now() + seconds * 1000;
  }
  toast(text, seconds = 2.2) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    this.toastUntil = performance.now() + seconds * 1000;
  }
  setInteract(text) {
    if (!text) { this.el.interact.classList.add('hidden'); return; }
    this.el.interact.textContent = text;
    this.el.interact.classList.remove('hidden');
  }
  update(G) {
    const now = performance.now(), el = this.el;
    if (now > this.bannerUntil) el.banner.classList.add('hidden');
    if (now > this.dialogueUntil) el.dialogue.classList.add('hidden');
    if (now > this.toastUntil) el.toast.classList.add('hidden');
    el.cash.textContent = fmtCash(G.cash);
    const stars = G.police.stars();
    el.stars.textContent = stars ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : '';
    el.stars.style.color = G.arrestRatio > 0.03 ? '#ff5a49' : '#ffd94d';
    el.health.style.width = clamp(G.player.health, 0, 100) + '%';
    el.armor.style.width = clamp(G.player.armor, 0, 100) + '%';
    el.objective.textContent = G.objectiveText || 'Free roam — find Pilar at Club Brisa, or make your own trouble.';
    el.progress.textContent = G.jobProgress || '';
    el.crosshair.style.display = G.player.onFoot && G.mode === 'play' ? 'block' : 'none';
    if (G.player.onFoot) { el.speed.textContent = ''; el.vehicle.textContent = ''; }
    else {
      const kmh = Math.round(Math.abs(G.player.car.speed) * 3.6);
      el.speed.innerHTML = kmh + ' <small>km/h</small>';
      el.vehicle.textContent = G.player.car.spec.name + (G.player.car.health < 45 ? ' — smoking!' : '');
    }
    this.drawMinimap(G);
  }
  drawMinimap(G) {
    const c = this.mapCtx;
    c.drawImage(this.mapBase, 0, 0);
    const px = G.player.onFoot ? G.player.x : G.player.car.x;
    const pz = G.player.onFoot ? G.player.z : G.player.car.z;
    // objective marker (pulsing gold ring)
    if (G.objectivePos) {
      const r = 4 + Math.sin(performance.now() * 0.006) * 1.4;
      c.strokeStyle = '#ffd94d'; c.lineWidth = 2;
      c.beginPath(); c.arc(mx(G.objectivePos.x), mz(G.objectivePos.z), r, 0, 6.29); c.stroke();
      c.fillStyle = '#ffd94d';
      c.fillRect(mx(G.objectivePos.x) - 1.5, mz(G.objectivePos.z) - 1.5, 3, 3);
    }
    // traffic dots near the player
    c.fillStyle = 'rgba(240,240,240,0.75)';
    for (const car of G.traffic.cars) {
      if (car.driver !== 'traffic') continue;
      if (Math.abs(car.x - px) > 130 || Math.abs(car.z - pz) > 130) continue;
      c.fillRect(mx(car.x) - 1, mz(car.z) - 1, 2, 2);
    }
    // police dots
    c.fillStyle = '#3a6bff';
    for (const car of G.police.cars) { c.beginPath(); c.arc(mx(car.x), mz(car.z), 2.6, 0, 6.29); c.fill(); }
    // player arrow
    const a = G.player.onFoot ? G.player.angle : G.player.car.angle;
    c.save();
    c.translate(mx(px), mz(pz)); c.rotate(a);
    c.fillStyle = '#ff5a49';
    c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 5); c.lineTo(0, 2.6); c.lineTo(-4, 5); c.closePath(); c.fill();
    c.restore();
    c.fillStyle = '#fff'; c.font = 'bold 9px Arial'; c.fillText('N', MAP.w - 11, 11);
  }
}
