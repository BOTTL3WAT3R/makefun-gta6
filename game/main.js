// main.js — Golden Hour, Costa Vera. Boots the renderer, builds the city,
// wires every system together, runs the player controller (on foot and
// behind the wheel), the camera, saves, menus and the end-of-run flows.

import * as THREE from 'three';
import { clamp, lerp, angleTowards, headingOf, resolveCircleColliders } from './util.js';
import { createWorld, LAYOUT } from './world.js';
import { createFleet, updateTrafficCar, driveCar, nearestCar } from './vehicles.js';
import { createCrowd, makePlayerMesh, setOutfit } from './people.js';
import { createPolice } from './police.js';
import { createEffects, createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const SAVE_KEY = 'golden-hour-costa-vera-v1';

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.24;
if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
camera.position.set(30, 16, 60);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- game state ----------
const G = {
  time: 0, mode: 'menu', started: false,
  cash: 85, health: 100, vignette: 0,
  progress: { jobIndex: 0, packages: [], outfit: 0 },
  keys: {}, interactQueued: false,
};
window.__G = G;

// ---------- world and cast ----------
G.world = createWorld(THREE, scene);
G.audio = createAudio();
G.hud = createHud();
G.effects = createEffects(THREE, scene);
G.combat = createCombat(THREE, G.effects);
G.fleet = createFleet(THREE, scene);
G.crowd = createCrowd(THREE, scene);
G.police = createPolice(THREE, scene, G.fleet, G.effects);
G.police.bind(G);

const playerMesh = makePlayerMesh(THREE);
playerMesh.position.set(8, 0, 196);
scene.add(playerMesh);
const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42),
  new THREE.MeshLambertMaterial({ color: 0x14141a }));
gun.position.set(0.33, 0.78, 0.3);
playerMesh.add(gun);
let playerHeading = Math.PI, playerVel = { x: 0, z: 0 }, walkPhase = 0;
let playerCar = null;

// Combat targets: every citizen and every car that exists at boot.
for (const ped of G.crowd.people) G.combat.registerTarget(ped.mesh, 'ped', ped);
for (const car of G.fleet.all) G.combat.registerTarget(car.mesh, 'car', car);

// ---------- G accessors used across modules ----------
G.playerPos = () => playerCar ? playerCar.pos : playerMesh.position;
G.playerVel = () => playerCar
  ? { x: Math.sin(playerCar.heading) * playerCar.speed, z: Math.cos(playerCar.heading) * playerCar.speed }
  : playerVel;
G.playerHeading = () => playerCar ? playerCar.heading : playerHeading;
G.playerInCar = () => !!playerCar;
G.playerCar = () => playerCar;
G.consumeInteract = () => { const q = G.interactQueued; G.interactQueued = false; return q; };
G.anyoneNear = (pos, r) => {
  for (const ped of G.crowd.people) {
    if (ped.mode !== 'down' && Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z) < r) return true;
  }
  return G.police.cars.length > 0;
};
G.applyOutfit = idx => setOutfit(THREE, playerMesh, idx).name;
G.remainingPackages = () => missions.remainingPackages();
G.groundHeightAt = (x, z) => (x > -158 && x < -146 && z > 232 && z < 308) ? 1.15 : 0;

G.damagePlayer = dmg => {
  if (G.mode !== 'play' || dmg <= 0) return;
  G.health -= dmg;
  G.vignette = Math.min(1, G.vignette + 0.55);
  if (G.health <= 0) { G.health = 0; wasted(); }
};

G.saveGame = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash, jobIndex: missions.state.jobIndex,
      packages: G.progress.packages, outfit: G.progress.outfit,
    }));
  } catch (e) {}
};
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
}

// ---------- run flow: busted, wasted, ending ----------
function endScreen(kind, title, sub) {
  G.mode = 'ended';
  G.audio.setEngine(false, 0, 0);
  G.hud.showEnd(title, sub);
  if (document.pointerLockElement) document.exitPointerLock();
}
function wasted() {
  endScreen('wasted', 'WASTED', 'Costa Vera\'s clinic patches you up and bills you $150 for the trouble.');
  G.cash = Math.max(0, G.cash - 150);
}
G.onBusted = () => {
  const fine = Math.min(G.cash, 120);
  endScreen('busted', 'BUSTED', 'The CVPD takes $' + fine + ' in fines and your pride. The street is still out there.');
  G.cash -= fine;
};
G.onEnding = () => {
  endScreen('ending', 'THE TIDE GOES OUT',
    'Lucia is on the boat, the bag is gone, and Pilar owes you a drink. Seven jobs, one long golden hour. Costa Vera is yours now — free roam, race, and cause exactly as much trouble as you like.');
};
function respawn() {
  G.police.clearAll(G);
  G.health = 100; G.vignette = 0;
  if (playerCar) { playerCar.mode = 'parked'; playerCar = null; }
  playerMesh.visible = true;
  playerMesh.position.set(-114, 0, 110);
  playerHeading = Math.PI;
  G.hud.hideEnd();
  G.mode = 'play';
  G.saveGame();
}
document.getElementById('btn-again').addEventListener('click', () => { G.audio.unlock(); respawn(); });

// ---------- starting ----------
function startGame(fromSave) {
  G.audio.unlock();
  const save = fromSave ? loadSave() : null;
  if (save) {
    G.cash = save.cash | 0;
    G.progress = { jobIndex: save.jobIndex | 0, packages: save.packages || [], outfit: save.outfit | 0 };
  } else {
    G.cash = 85;
    G.progress = { jobIndex: 0, packages: [], outfit: 0 };
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }
  document.getElementById('menu').classList.add('hidden');
  G.hud.showGameUI(true);
  G.started = true; G.mode = 'play';
  if (missions) missions.applyProgress(G.progress);
  G.applyOutfit(G.progress.outfit);
  G.hud.toast('COSTA VERA', save ? 'Welcome back, Nico.' : 'Golden hour. Find Pilar at the fountain plaza.', '');
}
document.getElementById('btn-new').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => {
  if (G.started && G.mode === 'pause') {
    document.getElementById('menu').classList.add('hidden');
    G.mode = 'play';
  } else startGame(true);
});
if (!loadSave()) document.getElementById('btn-continue').disabled = true;

// ---------- missions (needs G wired first) ----------
const missions = createMissions(THREE, scene, G);

// ---------- input ----------
let camYaw = Math.PI, camPitch = 0.32, shakeT = 0, mouseDown = false;
window.addEventListener('keydown', e => {
  G.keys[e.code] = true;
  if (e.code === 'KeyE') G.interactQueued = true;
  if (e.code === 'KeyM') { const m = G.audio.toggleMute(); G.hud.toast('AUDIO', m ? 'Muted.' : 'Sound on.', ''); }
  if (e.code === 'KeyP' && G.started && (G.mode === 'play' || G.mode === 'pause')) {
    if (G.mode === 'play') { G.mode = 'pause'; document.getElementById('menu').classList.remove('hidden'); }
    else { G.mode = 'play'; document.getElementById('menu').classList.add('hidden'); }
  }
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { G.keys[e.code] = false; });
renderer.domElement.addEventListener('click', () => {
  G.audio.unlock();
  if (G.mode === 'play' && !document.pointerLockElement) renderer.domElement.requestPointerLock();
});
document.addEventListener('mousemove', e => {
  if (!document.pointerLockElement || G.mode !== 'play') return;
  camYaw -= e.movementX * 0.0026;
  camPitch = clamp(camPitch + e.movementY * 0.0022, -0.12, 1.05);
});
document.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });

function enterCar(car) {
  playerCar = car;
  car.mode = 'player'; car.speed = 0;
  playerMesh.visible = false;
  G.audio.doorSlam();
  const witnessed = G.anyoneNear(car.pos, 30);
  if (car.wasTraffic) G.police.addHeat(witnessed ? 45 : 18, 'carjacking');
  else if (car.wasParkedTaken) { /* already reported */ }
  if (car.type === 'taxi') G.hud.toast('SOL TAXI', 'Fares appear while you cruise. Press R for radio.', '');
}
function exitCar() {
  const car = playerCar;
  car.mode = 'parked'; car.speed = 0;
  playerMesh.position.set(car.pos.x + Math.cos(car.heading) * 2.2, G.groundHeightAt(car.pos.x, car.pos.z), car.pos.z - Math.sin(car.heading) * 2.2);
  playerMesh.visible = true;
  playerHeading = car.heading;
  playerCar = null;
  G.audio.doorSlam();
  G.audio.setEngine(false, 0, 0);
  G.audio.setStation(-1); G.hud.setRadio(null);
}

// ---------- per-frame updates ----------
function updateOnFoot(dt) {
  const k = G.keys;
  let ix = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  let iz = (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0);
  if (k.ArrowLeft) camYaw += dt * 1.9;
  if (k.ArrowRight) camYaw -= dt * 1.9;
  const moving = (ix !== 0 || iz !== 0);
  const sprint = k.ShiftLeft || k.ShiftRight;
  const speed = sprint ? 8.4 : 5.2;
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  let vx = 0, vz = 0;
  if (moving) {
    const wx = (-iz * sin - ix * cos), wz = (-iz * cos + ix * sin);
    const l = Math.hypot(wx, wz) || 1;
    vx = (wx / l) * speed; vz = (wz / l) * speed;
    playerHeading = angleTowards(playerHeading, headingOf(vx, vz), dt * 11);
  }
  playerVel = { x: vx, z: vz };
  const pos = playerMesh.position;
  pos.x += vx * dt; pos.z += vz * dt;
  pos.x = clamp(pos.x, LAYOUT.land.minX - 4, LAYOUT.land.maxX + 4);
  pos.z = clamp(pos.z, LAYOUT.land.minZ - 4, 308);
  const carCircles = G.fleet.all.filter(c => c !== playerCar).map(c => ({ x: c.pos.x, z: c.pos.z, r: 2.1 }));
  resolveCircleColliders(pos, 0.7, G.world.colliders.boxes, G.world.colliders.circles.concat(carCircles));
  pos.y = G.groundHeightAt(pos.x, pos.z);
  playerMesh.rotation.y = playerHeading;
  const parts = playerMesh.userData.parts;
  if (moving) {
    walkPhase += dt * (sprint ? 11 : 8.4);
    const sw = Math.sin(walkPhase) * 0.62;
    parts.legL.rotation.x = sw; parts.legR.rotation.x = -sw;
    parts.armL.rotation.x = -sw * 0.75; parts.armR.rotation.x = sw * 0.75;
    pos.y += Math.abs(Math.sin(walkPhase)) * 0.05;
  } else {
    parts.legL.rotation.x *= 0.8; parts.legR.rotation.x *= 0.8;
    parts.armL.rotation.x *= 0.8; parts.armR.rotation.x *= 0.8;
  }
  // Enter a car.
  if (G.keys.KeyF) {
    G.keys.KeyF = false;
    const car = nearestCar(G.fleet.all, pos, 3.6);
    if (car && !car.dead) { car.wasTraffic = car.mode === 'traffic'; enterCar(car); }
  }
  // Shooting from the crosshair.
  if (mouseDown && document.pointerLockElement) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    G.combat.shoot(G, camera.position.clone(), dir, pos);
  }
}

function updateDriving(dt) {
  const car = playerCar, k = G.keys;
  if (k.ArrowLeft) camYaw += dt * 1.9;
  if (k.ArrowRight) camYaw -= dt * 1.9;
  const input = {
    throttle: (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0),
    steer: (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0),
    brake: !!k.Space, handbrake: !!k.Space,
  };
  const impact = driveCar(dt, car, input, G.world.colliders, G.fleet.all);
  if (impact > 7.5) {
    G.audio.crash(impact / 20);
    shakeT = Math.min(0.5, impact / 40);
    G.damagePlayer((impact - 7.5) * 1.1);
    if (G.anyoneNear(car.pos, 34)) G.police.addHeat(9, 'collision');
  } else if (impact > 2.5) G.audio.crash(0.1);
  car.pos.y = G.groundHeightAt(car.pos.x, car.pos.z);
  G.audio.setEngine(true, input.throttle !== 0, Math.abs(car.speed) / car.spec.top);
  if (G.keys.KeyR) {
    G.keys.KeyR = false;
    const st = G.audio.cycleStation();
    G.hud.setRadio(st ? '♪ <b>' + st.name + '</b> · ' + st.tag : null);
    if (st) G.hud.toast('RADIO', st.name + ' — ' + st.tag, '');
  }
  if (G.keys.KeyF && Math.abs(car.speed) < 2) { G.keys.KeyF = false; exitCar(); }
}

function updateCamera(dt) {
  const target = G.playerPos();
  let dist = playerCar ? 10 + Math.abs(playerCar.speed) * 0.16 : 7.6;
  let height = playerCar ? 3.6 : 2.9;
  if (G.mode === 'menu') {
    const t = G.time * 0.05;
    camera.position.lerp(new THREE.Vector3(LAYOUT.plaza.x + Math.cos(t) * 42, 15, LAYOUT.plaza.z + Math.sin(t) * 42), 0.03);
    camera.lookAt(LAYOUT.plaza.x, 3, LAYOUT.plaza.z);
    return;
  }
  // While driving, the camera settles behind the car; on foot it is free.
  if (playerCar && !document.pointerLockElement) {
    camYaw = angleTowards(camYaw, playerCar.heading + Math.PI, dt * 2.2);
    camPitch = lerp(camPitch, 0.3, dt * 2);
  }
  const cx = target.x - Math.sin(camYaw) * Math.cos(camPitch) * dist;
  const cz = target.z - Math.cos(camYaw) * Math.cos(camPitch) * dist;
  const cy = target.y + Math.sin(camPitch) * dist + height * 0.4;
  const goal = new THREE.Vector3(cx, Math.max(1.1, cy), cz);
  camera.position.lerp(goal, 1 - Math.pow(0.0001, dt));
  if (shakeT > 0) {
    shakeT -= dt;
    camera.position.x += (Math.random() - 0.5) * shakeT * 1.6;
    camera.position.y += (Math.random() - 0.5) * shakeT * 1.6;
  }
  const look = new THREE.Vector3(target.x + Math.sin(camYaw) * 6, target.y + 1.6, target.z + Math.cos(camYaw) * 6);
  camera.lookAt(look);
  camera.fov = lerp(camera.fov, playerCar ? 62 + Math.abs(playerCar.speed) / playerCar.spec.top * 15 : 62, dt * 4);
  camera.updateProjectionMatrix();
}

// ---------- the loop ----------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (G.mode !== 'pause') {
    G.time += dt;
    G.world.update(dt, G.time);
    if (G.mode === 'play' || G.mode === 'ended') {
      const playerProxy = { pos: G.playerPos() };
      for (const car of G.fleet.all) {
        if (car.mode === 'traffic') updateTrafficCar(dt, car, [...G.fleet.all, playerProxy]);
      }
      G.crowd.update(dt, G.time);
      if (G.mode === 'play') {
        if (playerCar) updateDriving(dt); else updateOnFoot(dt);
        G.police.update(dt, G);
        missions.update(dt, G.time);
        // Keep every car resting on the pier deck or the street.
        for (const car of G.fleet.all) car.pos.y = G.groundHeightAt(car.pos.x, car.pos.z);
      }
      G.effects.update(dt, camera);
      G.combat.update(dt);
      G.vignette = Math.max(0, G.vignette - dt * 0.7);
      if (G.health < 30 && G.mode === 'play') G.vignette = Math.max(G.vignette, 0.3 + Math.sin(G.time * 5) * 0.1);
      G.hud.update(G, dt);
    }
    updateCamera(dt);
  }
  renderer.render(scene, camera);
}
frame();

// ---------- debug/testing handle ----------
window.GAME = {
  G, THREE, scene, camera, missions,
  state: () => ({
    mode: G.mode, cash: G.cash, health: G.health, stars: G.police.stars,
    jobIndex: missions.state.jobIndex, jobActive: !!missions.state.active,
    stepIdx: missions.state.stepIdx, done: missions.state.done,
    packages: G.progress.packages.length, inCar: !!playerCar,
    race: missions.state.race ? missions.state.race.kind : null,
    pos: { x: G.playerPos().x, z: G.playerPos().z },
  }),
  newGame: () => startGame(false),
  teleport: (x, z) => {
    if (playerCar) { playerCar.pos.set(x, 0, z); playerCar.speed = 0; }
    else playerMesh.position.set(x, G.groundHeightAt(x, z), z);
  },
  setJobIndex: i => { missions.state.jobIndex = i; missions.state.done = i >= missions.jobCount; G.progress.jobIndex = i; },
  setWanted: n => G.police.setStars(n),
  giveCash: n => { G.cash += n; },
  setHealth: n => { G.health = n; },
  shootNow: () => {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return G.combat.shoot(G, camera.position.clone(), dir, G.playerPos());
  },
  pressE: () => { G.interactQueued = true; },
  enterNearestCar: () => {
    const car = nearestCar(G.fleet.all, playerMesh.position, 60);
    if (car) { playerMesh.position.set(car.pos.x + 2, 0, car.pos.z); car.wasTraffic = car.mode === 'traffic'; enterCar(car); }
    return !!car;
  },
  exitCar: () => { if (playerCar) exitCar(); },
  playerCarType: () => playerCar ? playerCar.type : null,
  setCam: (yaw, pitch) => { camYaw = yaw; camPitch = pitch; },
  forceStars: n => { G.police.setStars(n); },
  activeStep: () => missions.state.active ? missions.state.active.steps[missions.state.stepIdx].type : null,
  raceGate: () => missions.state.race ? { idx: missions.state.race.idx, n: missions.state.race.gates.length } : null,
  taxiInfo: () => missions.state.taxi ? { phase: missions.state.taxi.phase, x: missions.state.taxi.x, z: missions.state.taxi.z } : null,
  hostiles: () => missions.state.hostiles.map(h => ({ dead: h.dead, health: h.health })),
  officers: () => G.police.officers.length,
  policeCars: () => G.police.cars.length,
  heliUp: () => G.police.heliUp,
};
