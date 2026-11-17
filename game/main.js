// main.js — Golden Hour's wiring: renderer, camera, input, the game-state
// object every system shares, entering and stealing cars, busted / wasted /
// ending flow, saving, and the main loop.

import * as THREE from 'three';
import { buildWorld, LOCATIONS } from './world.js';
import { TrafficSystem, makeCar, stepDrive, stepCarCollisions } from './vehicles.js';
import { PeopleSystem, makePersonMesh, stepPlayerOnFoot } from './people.js';
import { PoliceSystem } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { AudioSys } from './audio.js';
import { clamp, dist2d } from './util.js';

const SAVE_KEY = 'golden-hour-save-v1';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2400);
const world = buildWorld(scene);

const G = {
  mode: 'menu', cash: 120, objectiveText: '', objectivePos: null, jobProgress: '',
  arrestRatio: 0, danger: null, events: [], packagesFound: new Set(), raceBest: 0,
  camYaw: Math.PI, camPitch: 0.34, aiming: false, camera, scene,
};
G.audio = new AudioSys();
G.hud = new Hud();
G.traffic = new TrafficSystem(scene, world, world.parkedSpots);
G.allCars = [...G.traffic.cars];
G.people = new PeopleSystem(scene, world);
G.police = new PoliceSystem(scene, world);
G.combat = new Combat(scene);
G.reportCrime = (kind, x, z) => G.police.reportCrime(kind, x, z, G);
G.spawnCar = car => { G.traffic.addCar(scene, car); G.allCars.push(car); return car; };
G.despawnCar = car => {
  scene.remove(car.mesh);
  const ti = G.traffic.cars.indexOf(car); if (ti >= 0) G.traffic.cars.splice(ti, 1);
  const ai = G.allCars.indexOf(car); if (ai >= 0) G.allCars.splice(ai, 1);
};
// The gold Tormenta waiting at the Hotel Palma valet — story job 2's target.
G.valetCar = G.spawnCar(makeCar('sport', LOCATIONS.valetCar.x, LOCATIONS.valetCar.z, LOCATIONS.valetCar.angle, 'parked', 0xd4af37));

// ---- the player ----
const playerMesh = makePersonMesh(0xff5a49, 0xf2ead8, 0xc98d5e, 0xffd94d);
scene.add(playerMesh);
const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, 0.32),
  new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.4, metalness: 0.6 }));
pistol.position.set(0, -0.68, 0.1);
playerMesh.userData.armR.add(pistol);
G.player = {
  mesh: playerMesh, x: -148, z: 198, y: 0, vy: 0, angle: Math.PI, phase: 0,
  health: 100, armor: 0, speedNow: 0, onFoot: true, car: null, lastHurtT: 0,
};
G.lastCar = null;
G.missions = new Missions(scene, world, G);
G.world = world;

// ---- saving ----
G.save = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash, story: G.missions.storyIndex, packages: [...G.packagesFound],
      raceBest: G.raceBest, pos: [G.player.x, G.player.z],
    }));
  } catch (e) { /* private mode etc. — saving is best-effort */ }
};
function loadSaveData() {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; }
  catch (e) { return null; }
}
function applySave(d) {
  G.cash = d.cash | 0;
  G.missions.storyIndex = Math.min(d.story | 0, 6);
  G.packagesFound = new Set(d.packages || []);
  G.raceBest = d.raceBest || 0;
  if (d.pos) { G.player.x = d.pos[0]; G.player.z = d.pos[1]; }
  G.missions.restore(G);
}

// ---- flow: busted, wasted, ending ----
const $ = id => document.getElementById(id);
function endRun(title, text, respawn) {
  G.mode = 'over';
  document.exitPointerLock && document.exitPointerLock();
  $('over-title').textContent = title;
  $('over-text').textContent = text;
  $('menu-over').classList.remove('hidden');
  G.pendingRespawn = respawn;
  G.audio.setEngine(false, 0, 0); G.audio.setRadio(false); G.audio.setSirenLevel(0);
}
G.onBusted = () => {
  const fine = Math.min(G.cash, Math.max(40, Math.round(G.cash * 0.12)));
  G.cash -= fine;
  G.police.clearAll();
  endRun('BUSTED', 'The Policía del Sol walk you out of the station $' + fine +
    ' lighter. Pilar sends a car and a warning: “Do not get caught standing still, cariño.”',
    { x: 46, z: -70 });
};
G.onWasted = () => {
  const bill = Math.min(G.cash, Math.max(30, Math.round(G.cash * 0.1)));
  G.cash -= bill;
  G.police.clearAll();
  endRun('WASTED', 'You wake up at Clínica Brisa with a $' + bill +
    ' bill and a nurse who has seen worse. The city kept spinning without you.',
    { x: LOCATIONS.clinic.x, z: LOCATIONS.clinic.z + 4 });
};
G.onEnding = () => {
  G.mode = 'end';
  world.setDusk(0.3);
  $('end-text').textContent = 'Six jobs, one crown case, and a yacht at golden hour. ' +
    'Cash earned, debts settled — Costa Vera is yours now: ' + '$' + G.cash.toLocaleString('en-US') +
    ' in hand, ' + G.packagesFound.size + '/15 packages found. Free roam is open.';
  $('menu-end').classList.remove('hidden');
  G.save();
};

// ---- cars: entering, stealing, exiting ----
function nearestEnterableCar() {
  let best = null, bd = 3.6;
  for (const car of G.allCars) {
    if (car.driver === 'police' || car.dead) continue;
    const d = dist2d(G.player.x, G.player.z, car.x, car.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
function enterCar(car) {
  const P = G.player;
  if (car.driver === 'traffic' && Math.abs(car.speed) > 7) { G.hud.toast('Too fast to grab!', 1.2); return; }
  if (!car.stolen) {
    car.stolen = true;
    G.reportCrime('carjack', car.x, car.z);
    G.hud.toast(car.driver === 'traffic' ? 'Driver dragged out — the city saw that' : 'Car stolen', 1.8);
  }
  if (car.driver === 'traffic') G.audio.crash(false);
  car.driver = 'player'; car.speed = car.speed || 0;
  P.car = car; P.onFoot = false; P.mesh.visible = false;
  G.lastCar = car;
  G.camYaw = car.angle;
  G.audio.door(); G.audio.setRadio(true);
  G.hud.el.radio.textContent = '♪ ' + G.audio.stationName();
}
function exitCar() {
  const P = G.player, car = P.car;
  car.driver = 'parked';
  const side = car.angle + Math.PI / 2;
  P.x = clamp(car.x + Math.sin(side) * 2.4, -250, 250);
  P.z = clamp(car.z + Math.cos(side) * 2.4, -212, 210);
  P.angle = car.angle; P.mesh.visible = true; P.mesh.position.set(P.x, 0, P.z);
  P.car = null; P.onFoot = true;
  G.camYaw = car.angle;
  G.audio.door(); G.audio.setRadio(false); G.audio.setEngine(false, 0, 0);
  G.hud.el.radio.textContent = '';
  G.save();
}

// ---- input ----
const keys = {};
let shootCd = 0, pointerLocked = false;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (G.mode !== 'play') return;
  if (e.code === 'KeyE') {
    const act = G.currentInteract;
    if (act) act.action();
    else if (G.player.onFoot) { const c = nearestEnterableCar(); if (c) enterCar(c); }
    else exitCar();
  }
  if (e.code === 'KeyR' && !G.player.onFoot) {
    G.hud.el.radio.textContent = '♪ ' + G.audio.nextStation();
    G.audio.pickup();
  }
  if (e.code === 'KeyM') G.hud.toast(G.audio.toggleMute() ? 'Sound off' : 'Sound on', 1.2);
  if (e.code === 'KeyP') pauseGame();
});
addEventListener('keyup', e => { keys[e.code] = false; });
renderer.domElement.addEventListener('click', () => {
  if (G.mode === 'play' && !pointerLocked) renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
});
addEventListener('mousemove', e => {
  if (!pointerLocked || G.mode !== 'play') return;
  G.camYaw -= e.movementX * 0.0026;
  G.camPitch = clamp(G.camPitch + e.movementY * 0.0022, 0.04, 1.15);
});
addEventListener('mousedown', e => { if (e.button === 0) G.aiming = true; });
addEventListener('mouseup', e => { if (e.button === 0) G.aiming = false; });
function pauseGame() {
  if (G.mode !== 'play') return;
  G.mode = 'pause';
  document.exitPointerLock && document.exitPointerLock();
  $('pause-stats').textContent = 'Cash $' + G.cash.toLocaleString('en-US') +
    ' · Story job ' + Math.min(G.missions.storyIndex + 1, 6) + '/6 · Packages ' +
    G.packagesFound.size + '/15' + (G.raceBest ? ' · Best race ' + G.raceBest.toFixed(1) + 's' : '');
  $('menu-pause').classList.remove('hidden');
}
$('btn-resume').addEventListener('click', () => { $('menu-pause').classList.add('hidden'); G.mode = 'play'; });
$('btn-restart').addEventListener('click', () => {
  localStorage.removeItem(SAVE_KEY); location.reload();
});
$('btn-respawn').addEventListener('click', () => {
  $('menu-over').classList.add('hidden');
  const r = G.pendingRespawn || { x: -148, z: 198 };
  if (!G.player.onFoot) { G.player.car.driver = 'parked'; G.player.car = null; G.player.onFoot = true; G.player.mesh.visible = true; }
  G.player.x = r.x; G.player.z = r.z; G.player.health = 100;
  G.mode = 'play'; G.save();
});
$('btn-freeroam').addEventListener('click', () => { $('menu-end').classList.add('hidden'); G.mode = 'play'; });
function startGame(withSave) {
  G.audio.init();
  if (withSave) { const d = loadSaveData(); if (d) applySave(d); }
  $('menu-start').classList.add('hidden');
  G.hud.show();
  G.mode = 'play';
  if (G.missions.storyIndex === 0 && !withSave)
    G.hud.banner('GOLDEN HOUR', 'Costa Vera — earn your name before the light dies', 4.2);
}
$('btn-start').addEventListener('click', () => startGame(false));
$('btn-continue').addEventListener('click', () => startGame(true));
if (loadSaveData()) $('btn-continue').classList.remove('hidden');
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- per-frame systems ----
const input = { f: 0, b: 0, l: 0, r: 0, sprint: 0, jump: 0 };
let crimeThrottle = 0, autosaveT = 0;
function handleEvents(dt) {
  crimeThrottle -= dt;
  for (const ev of G.events) {
    if (ev.type === 'pedHit') {
      if (ev.car === G.player.car) { G.audio.crash(false); ev.car.speed *= 0.8; }
      else if (dist2d(ev.x, ev.z, G.player.x, G.player.z) < 30) G.audio.crash(false);
    }
    if (ev.type === 'carDead' && ev.car === G.valetCar) G.hud.toast('The gold Tormenta is wrecked!', 2.4);
  }
  G.events.length = 0;
}
function onCarImpact(a, b, rel) {
  const P = G.player;
  const mine = !P.onFoot && (a === P.car || b === P.car);
  const other = a === P.car ? b : a;
  if (rel > 5 && (mine || dist2d(a.x, a.z, P.x, P.z) < 26)) G.audio.crash(rel > 11);
  if (mine && crimeThrottle <= 0) {
    crimeThrottle = 1.6;
    if (other.driver === 'police') G.reportCrime('copHit', other.x, other.z);
    else G.reportCrime('hitCar', other.x, other.z);
  }
  if (mine && rel > 9.5) G.combat.damagePlayer(G, (rel - 9.5) * 0.85);
}
function step(dt) {
  const P = G.player;
  input.f = keys.KeyW || keys.ArrowUp; input.b = keys.KeyS || keys.ArrowDown;
  input.l = keys.KeyA || keys.ArrowLeft; input.r = keys.KeyD || keys.ArrowRight;
  input.sprint = keys.ShiftLeft || keys.ShiftRight; input.jump = keys.Space;
  if (P.onFoot) {
    stepPlayerOnFoot(G, dt, input);
    if (pointerLocked) { P.angle = G.camYaw; P.mesh.rotation.y = P.angle; }
    shootCd -= dt;
    if (G.aiming && pointerLocked && shootCd <= 0) { G.combat.playerShoot(G); shootCd = 0.23; }
  } else {
    const car = P.car;
    const throttle = input.f ? 1 : input.b ? -1 : 0;
    const steer = (input.l ? 1 : 0) - (input.r ? 1 : 0);
    const before = car.hitWall || 0;
    stepDrive(car, throttle, steer * (keys.Space ? 1 : 1), !!keys.Space, dt, world.colliders);
    if ((car.hitWall || 0) > 10 && before === 0) {
      G.audio.crash(car.hitWall > 16);
      G.combat.damagePlayer(G, (car.hitWall - 10) * 0.5);
      if (crimeThrottle <= 0) { crimeThrottle = 1.6; G.reportCrime('hitCar', car.x, car.z); }
    }
    car.hitWall = 0;
    P.x = car.x; P.z = car.z;
    G.audio.setEngine(true, Math.abs(car.speed) / car.spec.topSpeed, throttle !== 0 ? 1 : 0.3);
  }
  G.traffic.step(dt, G);
  stepCarCollisions(G.allCars, onCarImpact);
  G.people.step(dt, G);
  G.police.step(dt, G);
  G.combat.update(dt);
  G.missions.update(dt, G);
  handleEvents(dt);
  // interact prompt
  let act = G.missions.getInteract(G);
  if (!act && P.onFoot) {
    const c = nearestEnterableCar();
    if (c) act = { text: 'E — ' + (c.stolen ? 'get in the ' : 'steal the ') + c.spec.name, action: () => enterCar(c) };
  }
  if (!act && !P.onFoot && Math.abs(P.car.speed) < 1.5)
    act = { text: 'E — get out', action: exitCar };
  G.currentInteract = act;
  G.hud.setInteract(act ? act.text : null);
  // gentle health regen when calm and unhunted
  if (G.police.stars() === 0 && performance.now() - P.lastHurtT > 8000 && P.health > 0)
    P.health = Math.min(100, P.health + dt * 1.6);
  // audio + shadow follow
  G.audio.update(dt);
  world.sun.position.set(P.x - 90, 120, P.z - 55);
  world.sun.target.position.set(P.x, 0, P.z);
  autosaveT += dt;
  if (autosaveT > 15) { autosaveT = 0; G.save(); }
}
function updateCamera(dt) {
  const P = G.player;
  if (G.camOverride) {
    const o = G.camOverride;
    camera.position.set(o.pos[0], o.pos[1], o.pos[2]);
    camera.lookAt(o.look[0], o.look[1], o.look[2]);
    return;
  }
  if (G.mode === 'menu') { // slow showcase orbit over the coast
    const t = performance.now() * 0.00005;
    camera.position.set(Math.sin(t) * 190, 60, 120 + Math.cos(t) * 60);
    camera.lookAt(0, 8, 60);
    return;
  }
  if (P.onFoot || !P.car) {
    const d = 7.6, cp = Math.cos(G.camPitch), sp = Math.sin(G.camPitch);
    const tx = P.x - Math.sin(G.camYaw) * cp * d;
    const tz = P.z - Math.cos(G.camYaw) * cp * d;
    const ty = P.y + 1.8 + sp * d;
    camera.position.set(tx, Math.max(ty, 0.7), tz);
    camera.lookAt(P.x, P.y + 1.55, P.z);
  } else {
    const car = P.car;
    const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
    const want = new THREE.Vector3(car.x - fx * 10.5, 4.3, car.z - fz * 10.5);
    camera.position.lerp(want, 1 - Math.exp(-dt * 4.2));
    if (camera.position.y < 1.2) camera.position.y = 1.2;
    camera.lookAt(car.x + fx * 7, 1.5, car.z + fz * 7);
    G.camYaw = car.angle;
  }
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (G.mode === 'play' && !G.frozen) step(dt);
  world.update(dt, t);
  updateCamera(dt);
  if (G.mode === 'play' || G.mode === 'pause') G.hud.update(G);
  renderer.render(scene, camera);
}
frame();

// Debug hooks for automated play-tests and screenshot sessions.
window.GH = {
  G, keys, start: startGame,
  teleport(x, z) {
    const P = G.player;
    if (!P.onFoot && P.car) { P.car.x = x; P.car.z = z; P.car.speed = 0; }
    P.x = x; P.z = z;
  },
  setHeat(n) { G.police.heat = n; },
  cops(n) { for (let i = 0; i < n; i++) G.police.spawnCop(G); },
  startJob(i) { G.missions.startJob(G, i); },
  dusk(f) { world.setDusk(f); },
  enterNearest() { const c = nearestEnterableCar(); if (c) enterCar(c); return !!c; },
  freeze(v) { G.frozen = !!v; },
  setCam(px, py, pz, lx, ly, lz) { G.camOverride = { pos: [px, py, pz], look: [lx, ly, lz] }; },
  clearCam() { G.camOverride = null; },
};
