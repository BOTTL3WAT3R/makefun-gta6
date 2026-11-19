// hud.js — everything drawn over the 3D view: the minimap, wanted stars,
// cash and health, the job card and dialogue boxes, toasts and prompts, and
// the full-screen states (title, pause, WASTED, BUSTED and the ending).

import { clamp, formatMoney, formatTime } from './util.js';
import { AVENUES, WATER_Z, BEACH_Z } from './world.js';

export class HUD {
  constructor() {
    this.el = {};
    const ids = [
      'hud', 'cash', 'pkg-count', 'stars', 'busted-wrap', 'busted-fill',
      'objective', 'obj-title', 'obj-text', 'obj-timer', 'race-info',
      'dialogue', 'dlg-name', 'dlg-text', 'minimap', 'health-fill',
      'speedo', 'speed-val', 'veh-name', 'radio-name', 'toasts', 'prompt',
      'hitmarker', 'hurt-flash', 'title-screen', 'btn-new', 'btn-continue',
      'title-note', 'pause-menu', 'btn-resume', 'btn-save', 'btn-restart',
      'ending-screen', 'btn-roam', 'wasted-screen', 'busted-screen',
      'crosshair', 'btn-quit', 'save-note',
    ];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.mapCtx = this.el.minimap.getContext('2d');
    this.dialogueQueue = [];
    this.dialogueCb = null;
    this.dialogueTimer = 0;
    this.dialogueActive = false;
    this.hitT = 0;
    this.cashShown = -1;
  }

  setCash(n) {
    if (n === this.cashShown) return;
    this.cashShown = n;
    this.el.cash.textContent = formatMoney(n);
  }

  setPackages(n) {
    this.el['pkg-count'].textContent = '▣ ' + n + '/15';
  }

  setWanted(w) {
    const full = Math.ceil(w);
    let s = '';
    for (let i = 0; i < 5; i++) s += i < full ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.style.opacity = w > 0 ? '1' : '0.25';
  }

  setHealth(frac) {
    this.el['health-fill'].style.width = clamp(frac * 100, 0, 100) + '%';
    this.el['health-fill'].style.background = frac > 0.35 ? '#7CFC9A' : '#ff5a4d';
  }

  setBusted(frac) {
    this.el['busted-wrap'].style.display = frac > 0.02 ? 'block' : 'none';
    this.el['busted-fill'].style.width = clamp(frac * 100, 0, 100) + '%';
  }

  setSpeedo(speedKmh, vehName, radioName) {
    if (vehName) {
      this.el.speedo.style.display = 'block';
      this.el['speed-val'].textContent = Math.round(Math.abs(speedKmh)) + '';
      this.el['veh-name'].textContent = vehName;
      this.el['radio-name'].textContent = radioName ? '♪ ' + radioName : '';
    } else {
      this.el.speedo.style.display = 'none';
    }
  }

  objective(title, text, timerSec) {
    if (!text) {
      this.el.objective.style.display = 'none';
      return;
    }
    this.el.objective.style.display = 'block';
    this.el['obj-title'].textContent = title || '';
    this.el['obj-text'].textContent = text;
    this.el['obj-timer'].textContent = timerSec > 0 ? '⏱ ' + formatTime(timerSec) : '';
    this.el['obj-timer'].style.color = timerSec > 0 && timerSec < 20 ? '#ff5a4d' : '#ffd98a';
  }

  raceInfo(info) {
    if (!info) {
      this.el['race-info'].style.display = 'none';
      return;
    }
    this.el['race-info'].style.display = 'block';
    this.el['race-info'].textContent =
      info.name + ' — gate ' + info.gate + '/' + info.total + ' · ' + info.time.toFixed(1) + 's · par ' + info.par + 's';
  }

  toast(msg) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = msg;
    this.el.toasts.appendChild(div);
    setTimeout(() => div.classList.add('show'), 16);
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 400);
    }, 3400);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  prompt(text) {
    if (text) {
      this.el.prompt.style.display = 'block';
      this.el.prompt.innerHTML = text; // prompts are built only from our own strings
    } else {
      this.el.prompt.style.display = 'none';
    }
  }

  // Dialogue: lines are [speaker, text] pairs; advance with E / click or
  // automatically. onDone fires once the last line closes.
  dialogue(lines, onDone) {
    this.dialogueQueue = lines.slice();
    this.dialogueCb = onDone || null;
    this.dialogueActive = true;
    this.showLine();
  }

  showLine() {
    const line = this.dialogueQueue[0];
    if (!line) {
      this.el.dialogue.style.display = 'none';
      this.dialogueActive = false;
      const cb = this.dialogueCb;
      this.dialogueCb = null;
      if (cb) cb();
      return;
    }
    this.el.dialogue.style.display = 'block';
    this.el['dlg-name'].textContent = line[0];
    this.el['dlg-text'].textContent = line[1];
    this.dialogueTimer = 5.2;
  }

  advanceDialogue() {
    if (!this.dialogueActive) return false;
    this.dialogueQueue.shift();
    this.showLine();
    return true;
  }

  hitmarker() {
    this.hitT = 0.28;
    this.el.hitmarker.style.opacity = '1';
  }

  hurt() {
    this.el['hurt-flash'].style.opacity = '0.55';
    setTimeout(() => { this.el['hurt-flash'].style.opacity = '0'; }, 90);
  }

  flashScreen(id) {
    const el = this.el[id];
    el.style.display = 'flex';
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 1500);
    setTimeout(() => { el.style.display = 'none'; }, 2100);
  }

  showTitle(hasSave, note) {
    this.el['title-screen'].style.display = 'flex';
    this.el['btn-continue'].style.display = hasSave ? 'block' : 'none';
    this.el['title-note'].textContent = note || '';
  }

  hideTitle() {
    this.el['title-screen'].style.display = 'none';
  }

  showEnding() {
    this.el['ending-screen'].style.display = 'flex';
  }

  hideEnding() {
    this.el['ending-screen'].style.display = 'none';
  }

  showPause(show, note) {
    this.el['pause-menu'].style.display = show ? 'flex' : 'none';
    if (note) this.el['save-note'].textContent = note;
  }

  update(dt) {
    if (this.dialogueActive) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.advanceDialogue();
    }
    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) this.el.hitmarker.style.opacity = '0';
    }
  }

  // view: { player, marker, cops, packages, raceGate, taxiPoint, pilar }
  drawMinimap(view) {
    const ctx = this.mapCtx;
    const S = 190;
    const scale = S / 300; // 300 m across
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.scale(scale, scale);
    ctx.translate(-view.player.x, -view.player.z);
    // Land and sea.
    ctx.fillStyle = '#5d6b52';
    ctx.fillRect(-320, -320, 640, 640);
    ctx.fillStyle = '#17557c';
    ctx.fillRect(-800, WATER_Z, 1600, 700);
    ctx.fillStyle = '#e6c188';
    ctx.fillRect(-320, BEACH_Z, 640, WATER_Z - BEACH_Z);
    // Boardwalk and pier.
    ctx.fillStyle = '#8a6844';
    ctx.fillRect(-280, 190, 560, 12);
    ctx.fillRect(-7, 190, 14, 110);
    // Roads.
    ctx.fillStyle = '#33343a';
    for (const a of AVENUES) {
      ctx.fillRect(a - 10, -280, 20, 470);
      ctx.fillRect(-280, a - 10, 560, 20);
    }
    // Plaza.
    ctx.fillStyle = '#c9a184';
    ctx.fillRect(-46, -46, 92, 92);
    ctx.restore();

    const px = (x) => S / 2 + (x - view.player.x) * scale;
    const pz = (z) => S / 2 + (z - view.player.z) * scale;
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px(x), pz(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const p of view.packages) if (!p.found) dot(p.x, p.z, '#7CFC9A', 2.4);
    if (view.pilar) dot(view.pilar.x, view.pilar.z, '#4dd8ff', 3.4);
    for (const c of view.cops) dot(c.x, c.z, '#4d8dff', 3);
    if (view.raceGate) {
      ctx.strokeStyle = '#ffcf4d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(view.raceGate.x), pz(view.raceGate.z), 5.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (view.taxiPoint) dot(view.taxiPoint.x, view.taxiPoint.z, '#ffe27a', 3.6);
    if (view.marker) {
      const pulse = 4.5 + Math.sin(performance.now() / 240) * 1.2;
      dot(view.marker.x, view.marker.z, '#ffcf4d', pulse);
      ctx.strokeStyle = 'rgba(255,207,77,0.6)';
      ctx.beginPath();
      ctx.arc(px(view.marker.x), pz(view.marker.z), pulse + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Player arrow.
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(view.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.6, 5.5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-4.6, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
