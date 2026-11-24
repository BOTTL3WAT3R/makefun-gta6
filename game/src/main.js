// main.js — Golden Hour: Costa Vera. Boots the city, owns the game state,
// runs the frame loop, the camera, entering and leaving cars, arrests and
// hospital trips, and the window.GH hooks the test harness drives.

import * as THREE from '../three.module.min.js';
import { PLACES, PLAYER_START } from './config.js';
import { clamp, damp, turnToward } from './util.js';
import { flushInput, initInput, input, moveAxes } from './input.js';
import { buildCity, surfaceAt, updateCity } from './city.js';
import {
  collideVehicles, makeVehicle, spawnParkedVehicles, spawnTraffic, stepVehicle, updateTraffic,
} from './vehicles.js';
import {
  downPerson, scarePedsNear, spawnFleeingDriver, spawnPedestrians, spawnPilar,
  updateChaseTarget, updateHostiles, updatePedestrians,
} from './people.js';
import { createPlayer, damagePlayer, playerPos, updatePlayerOnFoot } from './player.js';
import { initCombat, playerShoot, updateCombat } from './combat.js';
import { addWanted, clearPolice, createPolice, setHeatFloor, setWanted, updatePolice } from './police.js';
import {
  advanceDialogue, createJobState, initMarker, pilarDistance, showCard, talkToPilar, updateJobs, JOBS,
} from './jobs.js';
import { activityInteract, createActivities, initActivities, spawnFare, updateActivities } from './activities.js';
import { initHud, showPause, showTitle, updateHud } from './hud.js';
import { createRadio, nextStation, stationName, updateRadio } from './radio.js';
import { applySave, hasSave, loadSave, saveGame } from './save.js';

// --- Renderer, scene, golden-hour light ---------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.className = 'game-view';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8906a);
scene.fog = new THREE.Fog(0xeaa06e, 210, 820);

// Gradient sky dome: a big inside-out sphere painted with a vertical canvas
// gradient — deep dusty blue-violet up top, peach through the middle and a
// warm glow at the horizon, so the golden hour has depth instead of one
// flat orange wash. Its material ignores fog so the dome stays the backdrop.
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#2e2a55');
  grad.addColorStop(0.28, '#5c4a78');
  grad.addColorStop(0.52, '#b06a7d');
  grad.addColorStop(0.72, '#e88a5f');
  grad.addColorStop(0.88, '#f7a56b');
  grad.addColorStop(1.0, '#ffd9a0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 512);
  return new THREE.CanvasTexture(c);
}
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(1750, 24, 16),
  new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
);
skyDome.renderOrder = -10;
scene.add(skyDome);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 2400);
camera.position.set(240, 60, 300);
camera.lookAt(330, 0, 60);

const hemi = new THREE.HemisphereLight(0xffd9a8, 0x6b4a3f, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 1.35);
sun.position.set(500, 170, 160);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x7fb3c8, 0.25);
fill.position.set(-300, 200, -200);
scene.add(fill);

// Soft radial glow, painted at runtime — the sun and clouds are feathered
// sprites, never hard-edged squares.
function glowTexture(stops) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  for (const [at, col] of stops) grad.addColorStop(at, col);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// The sun itself, low over the water.
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture([[0, 'rgba(255,244,205,1)'], [0.35, 'rgba(255,214,140,0.85)'], [1, 'rgba(255,180,90,0)']]),
  transparent: true,
  depthWrite: false,
  fog: false,
}));
sunSprite.position.set(1150, 120, 220);
sunSprite.scale.set(300, 300, 1);
scene.add(sunSprite);

// A few soft sunset clouds high over the city.
const cloudTex = glowTexture([[0, 'rgba(255,217,194,0.55)'], [0.6, 'rgba(255,205,180,0.28)'], [1, 'rgba(255,205,180,0)']]);
for (const [cx, cy, cz, s] of [[300, 150, -300, 180], [-200, 170, 200, 220], [600, 140, 400, 160], [0, 185, -520, 260]]) {
  const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false }));
  cloud.position.set(cx, cy, cz);
  cloud.scale.set(s, s * 0.26, 1);
  scene.add(cloud);
}

// --- Game state -------------------------------------------------------------------

const G = {
  scene,
  camera,
  renderer,
  mode: 'title', // 'title' | 'playing' | 'paused'
  elapsed: 0,
  player: null,
  vehicles: [],
  peds: [],
  hostiles: [],
  targetPed: null,
  pilar: null,
  police: null,
  job: createJobState(),
  activities: createActivities(),
  cameraYaw: PLAYER_START.heading,
  camOverride: null,
  aiming: false,
  hudFlash: 0,
  bustProgress: 0,
  storyDone: false,
  inputSeen: false,
  prompt: '',
  toastMsg: null,
  banner: null,
  radioDisplay: null,
  activityObjective: null,
  activityTimer: null,
  lockUntil: -1,
  respawnAt: null,
  currentAction: null,
  radio: null,
  sfx: null,
};

G.toast = (text, seconds = 3.6) => {
  G.toastMsg = { text, until: G.elapsed + seconds };
};
G.addWanted = (n) => addWanted(G, n);
G.setWanted = (n) => setWanted(G, n);
G.hasSaveFile = () => hasSave();

buildCity(scene);
G.player = createPlayer(scene);
G.pilar = spawnPilar(scene);
G.peds = spawnPedestrians(scene, 44);
G.vehicles = [...spawnParkedVehicles(scene), ...spawnTraffic(scene, 12)];
G.police = createPolice(G);
G.radio = createRadio(G);
initCombat(G);
initMarker(G);
initActivities(G);
initInput(renderer.domElement);
initHud(G);

G.ui = {
  newGame: () => startPlaying(),
  continueGame: () => {
    const data = loadSave();
    if (data) applySave(G, data);
    startPlaying();
    G.toast(data ? 'Welcome back to Costa Vera.' : 'No save found — fresh start.');
  },
  resume: () => setPaused(false),
  save: () => {
    if (saveGame(G)) G.toast('Saved. Cash, story, packages and position kept.');
    else G.toast('Save failed — storage unavailable.');
    setPaused(false);
  },
  quitToTitle: () => window.location.reload(),
};

function startPlaying() {
  G.mode = 'playing';
  showTitle(G, false);
  showPause(G, false);
}

function setPaused(paused) {
  if (paused && G.mode === 'playing') {
    G.mode = 'paused';
    showPause(G, true);
  } else if (!paused && G.mode === 'paused') {
    G.mode = 'playing';
    showPause(G, false);
  }
}

// --- Arrests, hospital, endings ------------------------------------------------------

G.onBusted = () => {
  if (G.respawnAt || G.elapsed < G.lockUntil) return;
  const stars = Math.max(G.police.wanted, G.police.heatFloor);
  const fine = Math.min(G.player.cash, 40 + 15 * stars);
  G.banner = { title: 'BUSTED', sub: 'The Comisaría fines you ' + fine + ' dollars.', until: G.elapsed + 2.8 };
  G.respawnAt = { time: G.elapsed + 2.8, kind: 'busted', fine };
  G.lockUntil = G.elapsed + 2.8;
  failActiveJob('the law intervened.');
};

G.onWasted = () => {
  if (G.respawnAt || G.elapsed < G.lockUntil) return;
  const fee = Math.min(G.player.cash, 50);
  G.banner = { title: 'WASTED', sub: 'Clínica Sol bills you ' + fee + ' dollars.', until: G.elapsed + 2.8 };
  G.respawnAt = { time: G.elapsed + 2.8, kind: 'wasted', fee };
  G.lockUntil = G.elapsed + 2.8;
  failActiveJob('you woke up in hospital.');
};

G.onStoryComplete = () => {
  G.banner = {
    title: 'THE TIDE GOES OUT',
    sub: 'Seven jobs done · Cash $' + Math.round(G.player.cash) + ' · Packages ' + G.activities.packagesFound + '/15 — Costa Vera is yours.',
    until: G.elapsed + 7,
  };
  G.lockUntil = G.elapsed + 2.2;
  if (G.sfx) G.sfx.cash();
};

function failActiveJob(reason) {
  // Deferred import cycle guard: jobs.js failJob is reached via G.failJob.
  if (G.failJob) G.failJob(reason);
}

function doRespawn() {
  const r = G.respawnAt;
  G.respawnAt = null;
  if (G.player.inVehicle) exitVehicle(true);
  clearPolice(G);
  G.player.health = 100;
  G.player.armor = 0;
  if (r.kind === 'busted') {
    G.player.cash -= r.fine;
    teleportPlayer(PLACES.comisariaDoor.x, PLACES.comisariaDoor.z);
  } else {
    G.player.cash -= r.fee;
    teleportPlayer(PLACES.clinicaDoor.x, PLACES.clinicaDoor.z);
  }
  G.banner = null;
}

function teleportPlayer(x, z) {
  if (G.player.inVehicle) {
    G.player.inVehicle.x = x;
    G.player.inVehicle.z = z;
    G.player.inVehicle.group.position.set(x, 0, z);
  }
  G.player.x = x;
  G.player.z = z;
  G.player.group.position.set(x, 0, z);
}

// --- Cars: getting in and out ----------------------------------------------------------

function nearestVehicle(maxDist) {
  const pp = playerPos(G.player);
  let best = null;
  let bestDist = maxDist;
  for (const v of G.vehicles) {
    if (v.mode === 'player') continue;
    const d = Math.hypot(v.x - pp.x, v.z - pp.z);
    if (d < bestDist) {
      best = v;
      bestDist = d;
    }
  }
  return best;
}

function enterVehicle(v) {
  const hadDriver = v.hasDriver;
  if (hadDriver) {
    v.hasDriver = false;
    const side = { x: v.x + Math.cos(v.heading) * 2.4, z: v.z - Math.sin(v.heading) * 2.4 };
    spawnFleeingDriver(G, side.x, side.z);
    scarePedsNear(G, v.x, v.z, 14);
  }
  const policeNear = G.police.units.some((u) => Math.hypot(u.x - v.x, u.z - v.z) < 48);
  if (hadDriver || policeNear) addWanted(G, 1);
  v.mode = 'player';
  v.speed = 0;
  G.player.inVehicle = v;
  G.player.group.visible = false;
  G.radioDisplay = { text: '📻 ' + stationName(G.radio.station), until: G.elapsed + 2.2 };
  if (G.sfx) G.sfx.blip();
}

function exitVehicle(silent = false) {
  const v = G.player.inVehicle;
  if (!v) return;
  v.mode = 'abandoned';
  G.player.inVehicle = null;
  const sideX = v.x + Math.cos(v.heading) * 2.8;
  const sideZ = v.z - Math.sin(v.heading) * 2.8;
  G.player.x = clamp(sideX, -486, 460);
  G.player.z = clamp(sideZ, -486, 486);
  G.player.heading = v.heading;
  G.player.group.visible = true;
  G.player.group.position.set(G.player.x, 0, G.player.z);
  if (!silent && G.sfx) G.sfx.blip();
}

G.exitToFoot = (x, z) => {
  if (G.player.inVehicle) {
    G.player.inVehicle.mode = 'abandoned';
    G.player.inVehicle = null;
  }
  G.player.group.visible = true;
  teleportPlayer(x, z);
};

// --- Interaction: what E does right now ---------------------------------------------------

function computeInteract() {
  G.currentAction = null;
  G.prompt = '';
  if (G.mode !== 'playing' || G.elapsed < G.lockUntil) return;
  if (G.job.dialogue) return; // E advances dialogue instead (handled in the loop)

  const player = G.player;
  if (player.inVehicle) {
    const act = activityInteract(G);
    if (act) {
      G.prompt = act.label;
      G.currentAction = act.run;
      return;
    }
    if (Math.abs(player.inVehicle.speed) < 8) {
      G.prompt = 'E — Exit the ' + player.inVehicle.stats.name;
      G.currentAction = () => exitVehicle();
    } else {
      G.prompt = 'Slow down to get out';
    }
    return;
  }

  if (pilarDistance(G) < 4.4) {
    G.prompt = G.job.active ? 'E — Talk to Pilar' : 'E — Talk to Pilar (a job is waiting)';
    G.currentAction = () => talkToPilar(G);
    return;
  }
  const act = activityInteract(G);
  if (act) {
    G.prompt = act.label;
    G.currentAction = act.run;
    return;
  }
  const v = nearestVehicle(4.4);
  if (v) {
    G.prompt = 'E — Take the ' + v.stats.name + (v.hasDriver ? ' (driver inside!)' : '');
    G.currentAction = () => enterVehicle(v);
  }
}

// --- Aim --------------------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);

function updateAim() {
  const ndc = new THREE.Vector2(
    (input.mouseX / window.innerWidth) * 2 - 1,
    -(input.mouseY / window.innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  const point = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(aimPlane, point)) {
    G.player.aimX = point.x;
    G.player.aimZ = point.z;
  }
  G.aiming = input.mouseDown && !G.player.inVehicle;
}

// --- Camera -------------------------------------------------------------------------------------

function updateCamera(dt) {
  if (G.camOverride) {
    const o = G.camOverride;
    camera.position.set(o.x, o.y, o.z);
    camera.lookAt(o.lx, o.ly, o.lz);
    return;
  }
  if (G.mode === 'title') {
    const a = G.elapsed * 0.045;
    camera.position.set(120 + Math.cos(a) * 250, 74, Math.sin(a) * 250);
    camera.lookAt(160, 0, 30);
    return;
  }
  const player = G.player;
  const target = player.inVehicle
    ? { x: player.inVehicle.x, z: player.inVehicle.z, heading: player.inVehicle.heading, dist: 12.5, h: 5.4, lookY: 1.9 }
    : { x: player.x, z: player.z, heading: player.heading, dist: 9.5, h: 4.4, lookY: 1.7 };
  G.cameraYaw = turnToward(G.cameraYaw, target.heading, (player.inVehicle ? 2.3 : 3.4) * dt);
  const back = {
    x: target.x - Math.sin(G.cameraYaw) * target.dist,
    z: target.z - Math.cos(G.cameraYaw) * target.dist,
  };
  const k = damp(7, dt);
  camera.position.x += (back.x - camera.position.x) * k;
  camera.position.z += (back.z - camera.position.z) * k;
  camera.position.y += (target.h - camera.position.y) * k;
  if (surfaceAt(camera.position.x, camera.position.z) === 'water') camera.position.y = Math.max(camera.position.y, 3);
  camera.lookAt(target.x, target.lookY, target.z);
}

// --- The frame ------------------------------------------------------------------------------------

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.08);
  G.elapsed += dt;
  if (input.anyGesture) G.inputSeen = true;

  if (input.pausePressed) {
    if (G.mode === 'playing') setPaused(true);
    else if (G.mode === 'paused') setPaused(false);
  }

  if (G.mode === 'playing') {
    if (G.respawnAt && G.elapsed >= G.respawnAt.time) doRespawn();
    const locked = G.elapsed < G.lockUntil;

    // Dialogue first: E and clicks turn its pages.
    if (G.job.dialogue && (input.interactPressed || input.clicked) && !locked) {
      advanceDialogue(G);
    }

    computeInteract();
    if (input.interactPressed && G.currentAction && !locked) G.currentAction();

    // The player, on foot or driving.
    if (!locked) {
      if (G.player.inVehicle) {
        const axes = moveAxes();
        const v = G.player.inVehicle;
        stepVehicle(v, dt, -axes.z, axes.x);
        if (input.radioPressed) nextStation(G);
        // Running someone down is a crime with witnesses everywhere.
        for (const p of G.peds) {
          if (p.mode === 'down' || p.mode === 'target') continue;
          if (Math.abs(v.speed) > 5 && Math.hypot(p.x - v.x, p.z - v.z) < 2.3) {
            downPerson(p);
            addWanted(G, 1);
            v.speed *= 0.6;
            if (G.sfx) G.sfx.thud();
            scarePedsNear(G, v.x, v.z, 20);
          }
        }
        for (const other of G.vehicles) {
          if (other !== v) collideVehicles(v, other);
        }
      } else {
        updatePlayerOnFoot(G, dt);
      }
    }

    // Abandoned cars roll to a stop.
    for (const v of G.vehicles) {
      if (v.mode === 'abandoned' && v.speed !== 0) {
        v.speed *= Math.max(0, 1 - 2.2 * dt);
        if (Math.abs(v.speed) < 0.1) v.speed = 0;
        v.x += Math.sin(v.heading) * v.speed * dt;
        v.z += Math.cos(v.heading) * v.speed * dt;
        v.group.position.set(v.x, 0, v.z);
      }
    }

    updateAim();
    if (input.mouseDown && !locked && !G.job.dialogue) playerShoot(G);

    updateTraffic(G.vehicles, dt, playerPos(G.player));
    updatePedestrians(G, dt);
    updateChaseTarget(G, dt);
    updateHostiles(G, dt);
    updateCombat(G, dt);
    if (!G.respawnAt) updatePolice(G, dt);
    updateJobs(G, dt);
    updateActivities(G, dt);
    G.hudFlash = Math.max(0, G.hudFlash - dt * 1.7);
  }

  updateCity(dt, G.elapsed);
  updateRadio(G, dt);
  updateCamera(dt);
  updateHud(G);
  renderer.render(scene, camera);
  flushInput();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

showTitle(G, true);
frame();

// --- Test & screenshot hooks ------------------------------------------------------------------

import { failJob } from './jobs.js';
G.failJob = (reason) => failJob(G, reason);

function projectToScreen(x, z, y = 1.2) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return {
    x: Math.round(((v.x + 1) / 2) * window.innerWidth),
    y: Math.round(((1 - v.y) / 2) * window.innerHeight),
  };
}

window.GH = {
  state() {
    const pp = playerPos(G.player);
    return {
      mode: G.mode,
      cash: G.player.cash,
      health: G.player.health,
      armor: G.player.armor,
      wanted: Math.max(G.police.wanted, G.police.heatFloor),
      heatFloor: G.police.heatFloor,
      jobNext: G.job.nextIndex,
      jobActive: !!G.job.active,
      jobId: G.job.active ? G.job.active.def.id : null,
      jobStage: G.job.active ? G.job.active.data.stage : null,
      objective: G.job.objective ? G.job.objective.label : (G.activityObjective ? G.activityObjective.label : null),
      inVehicle: G.player.inVehicle ? G.player.inVehicle.type : null,
      vehicleSpeed: G.player.inVehicle ? G.player.inVehicle.speed : 0,
      pos: { x: Math.round(pp.x * 10) / 10, z: Math.round(pp.z * 10) / 10 },
      packagesFound: G.activities.packagesFound,
      storyDone: G.storyDone,
      raceActive: !!G.activities.race,
      fareStage: G.activities.fare ? G.activities.fare.stage : null,
      policeUnits: G.police.units.length,
      heli: !!G.police.heli,
      hostilesAlive: G.hostiles.filter((h) => h.mode !== 'down').length,
      hostilesTotal: G.hostiles.length,
      dialogueOpen: !!G.job.dialogue,
      banner: G.banner && G.elapsed < G.banner.until ? G.banner.title : null,
      prompt: G.prompt,
    };
  },
  newGame() {
    startPlaying();
  },
  continueGame() {
    G.ui.continueGame();
  },
  teleport(x, z) {
    if (G.player.inVehicle) {
      G.player.inVehicle.x = x;
      G.player.inVehicle.z = z;
      G.player.inVehicle.speed = 0;
      G.player.inVehicle.group.position.set(x, 0, z);
    }
    teleportPlayer(x, z);
  },
  setWanted(n) { setWanted(G, n); },
  addWanted(n) { addWanted(G, n); },
  setHealth(n) { G.player.health = n; },
  damage(n) { damagePlayer(G, n); },
  giveCash(n) { G.player.cash += n; },
  talkPilar() { talkToPilar(G); },
  skipDialogue() {
    let guard = 30;
    while (G.job.dialogue && guard-- > 0) advanceDialogue(G);
  },
  interact() { input.interactPressed = true; },
  key(code, down = true) {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  },
  mouseAt(x, y) {
    renderer.domElement.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
  },
  clickAt(x, y) {
    const c = renderer.domElement;
    c.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
    c.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0 }));
    setTimeout(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 0 })), 130);
  },
  project(x, z) { return projectToScreen(x, z); },
  hostileScreenPos(i = 0) {
    const alive = G.hostiles.filter((h) => h.mode !== 'down');
    if (!alive[i]) return null;
    return projectToScreen(alive[i].x, alive[i].z, 1.2);
  },
  spawnFare() { spawnFare(G); },
  lowFx() {
    // Test hook: shrink the renderer's backing store so software-rendered
    // environments (CI, headless) run the simulation closer to real time.
    renderer.setPixelRatio(0.5);
  },
  targetPos() {
    return G.targetPed ? { x: G.targetPed.x, z: G.targetPed.z } : null;
  },
  objectivePos() {
    const o = G.job.objective || G.activityObjective;
    return o ? { x: o.x, z: o.z } : null;
  },
  fareInfo() {
    const f = G.activities.fare;
    if (!f) return null;
    return {
      stage: f.stage, x: f.x, z: f.z,
      dest: f.dest ? { x: f.dest.x, z: f.dest.z, label: f.dest.label } : null,
    };
  },
  findVehicle(type) {
    const v = G.vehicles.find((c) => c.type === type && c.mode !== 'player');
    return v ? { x: v.x, z: v.z, mode: v.mode, hasDriver: v.hasDriver } : null;
  },
  gatePos() {
    const r = G.activities.race;
    if (!r) return null;
    const g = r.def.gates[r.gateIndex];
    return { x: g.x, z: g.z, index: r.gateIndex, total: r.def.gates.length };
  },
  packagePos(i) {
    const p = G.activities.packages[i];
    return p ? { x: p.x, z: p.z, taken: p.taken } : null;
  },
  spawnCar(type, x, z) {
    const car = makeVehicle(type, type === 'taxi' ? 0xf2b33c : 0x2e6fb7, x, z, 0, 'parked');
    G.scene.add(car.group);
    G.vehicles.push(car);
    return { x: car.x, z: car.z };
  },
  findDriverCar() {
    const v = G.vehicles.find((c) => c.hasDriver && c.mode === 'traffic');
    return v ? { x: v.x, z: v.z, type: v.type } : null;
  },
  pedScreenPos() {
    const p = G.peds.find((c) => c.mode === 'wander' || c.mode === 'flee');
    return p ? projectToScreen(p.x, p.z, 1.2) : null;
  },
  nearestPolice() {
    const pp = playerPos(G.player);
    let best = null;
    for (const u of G.police.units) {
      const d = Math.hypot(u.x - pp.x, u.z - pp.z);
      if (best === null || d < best) best = d;
    }
    return best;
  },
  save() { return saveGame(G); },
  cam(x, y, z, lx, ly, lz) {
    G.camOverride = { x, y, z, lx, ly, lz };
  },
  camFree() { G.camOverride = null; },
  stageShot(name) {
    startPlaying();
    G.camOverride = null;
    if (name === 'cover') {
      // Hero shot: the Vendaval fills the lower centre of the east avenue,
      // driver standing on the camera side of it. The tower blocks line the
      // left of the frame, a taxi and a sedan give the street depth, and the
      // car-wash canopy, promenade lamps and palms close the right side.
      const car = makeVehicle('sports', 0xd94f30, 241, 140, 0, 'parked');
      G.scene.add(car.group);
      G.vehicles.push(car);
      const taxi = makeVehicle('taxi', 0xf2b33c, 243.5, 112, 0, 'parked');
      G.scene.add(taxi.group);
      G.vehicles.push(taxi);
      const sedan = makeVehicle('sedan', 0x2e6fb7, 216, 117, -Math.PI / 2, 'parked');
      G.scene.add(sedan.group);
      G.vehicles.push(sedan);
      // A few residents stroll the avenue and the street corner.
      const strollers = [[232, 128], [250.5, 124], [226, 136], [254, 148], [238, 108]];
      let placed = 0;
      for (const p of G.peds) {
        if (placed >= strollers.length) break;
        if (p.mode !== 'wander') continue;
        const [px, pz] = strollers[placed++];
        p.x = px; p.z = pz;
        p.targetX = px; p.targetZ = pz;
        p.anchorX = px; p.anchorZ = pz;
        p.group.position.set(px, 0, pz);
      }
      teleportPlayer(245.2, 136.8);
      G.player.heading = Math.PI;
      G.player.group.rotation.y = G.player.heading;
      G.cameraYaw = G.player.heading;
      G.camOverride = { x: 247.5, y: 1.7, z: 147.5, lx: 237.5, ly: 1.3, lz: 128 };
    } else if (name === 'combat') {
      G.job.nextIndex = 3;
      talkToPilar(G);
      let guard = 30;
      while (G.job.dialogue && guard-- > 0) advanceDialogue(G);
      teleportPlayer(168, -263);
      G.camOverride = { x: 155, y: 3.4, z: -245, lx: 176, ly: 1.3, lz: -278 };
    } else if (name === 'story') {
      G.job.nextIndex = 0;
      // Leave Pilar's real opening line open over the live first job.
      talkToPilar(G);
      teleportPlayer(296, 34);
      G.player.heading = Math.PI / 2;
      G.cameraYaw = Math.PI / 2;
      G.camOverride = { x: 282, y: 4.5, z: 12, lx: 380, ly: 3, lz: 58 };
    } else if (name === 'vista') {
      G.camOverride = { x: 150, y: 95, z: 305, lx: 430, ly: 0, lz: 10 };
    }
  },
};
