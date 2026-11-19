// main.js — the shell of Golden Hour: renderer, camera and input, the
// player on foot and behind the wheel, crime and consequence, the shops of
// Costa Vera, saving, and the wiring that lets world, vehicles, people,
// police, combat, missions and the HUD act as one game.

import * as THREE from 'three';
import { clamp, dist2d, resolveCollisions, angleDelta } from './util.js';
import { AudioSys } from './audio.js';
import { buildWorld, LOCATIONS, WORLD_BOUND, WATER_Z, PIER_HALF, PIER_END_Z } from './world.js';
import { VEHICLE_TYPES, Vehicle, spawnTraffic, spawnParked } from './vehicles.js';
import { makePersonMesh, animateWalk, resetPose, spawnCrowd } from './people.js';
import { PoliceSystem } from './police.js';
import { CombatSystem } from './combat.js';
import { Story, Activities } from './missions.js';
import { HUD } from './hud.js';

const SAVE_KEY = 'golden-hour-costa-vera-v1';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(20, 9, 34);

const audio = new AudioSys();
const hud = new HUD();
const world = buildWorld(scene);
const colliders = world.colliders;

const S = {
  mode: 'title', // title | play | pause | ending
  cash: 85,
  health: 100,
  wantedF: 0,
  heatFloor: 0,
  crimeTimer: 0,
  time: 0,
  started: false,
};

const player = {
  x: 16, z: 20, heading: 2.7, speed: 0, vx: 0, vz: 0,
  vehicle: null, phase: 0,
  mesh: makePersonMesh({ shirt: 0xf2e8cf, pants: 0x2b2d42, cap: 0xe2703a }),
};
player.mesh.position.set(player.x, 0, player.z);
scene.add(player.mesh);

// Pilar Duarte, by the fountain.
const pilarMesh = makePersonMesh({ shirt: 0x2a9d8f, pants: 0x7a2d4d, longHair: true, skin: 0xc98a5a });
pilarMesh.position.set(LOCATIONS.pilar.x, 0, LOCATIONS.pilar.z);
pilarMesh.rotation.y = -2.2;
scene.add(pilarMesh);
const pilarRing = new THREE.Mesh(
  new THREE.RingGeometry(1.6, 2.05, 28),
  new THREE.MeshBasicMaterial({ color: 0x4dd8ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
);
pilarRing.rotation.x = -Math.PI / 2;
pilarRing.position.set(LOCATIONS.pilar.x, 0.09, LOCATIONS.pilar.z);
scene.add(pilarRing);

// Vehicles: traffic, parked cars, and two guaranteed cabs.
const traffic = spawnTraffic(scene, 14);
const parked = spawnParked(scene, [
  { x: 194, z: -96, heading: 0.2 }, { x: 205, z: -96, heading: -0.1 }, { x: 194, z: -124, heading: 3.0 },
  { x: -52, z: 20, heading: 1.57 }, { x: -224, z: 14, heading: 0 }, { x: -96, z: -96, heading: 0.8 },
  { x: 96, z: 96, heading: 2.4 }, { x: 124, z: 96, heading: -0.6 }, { x: -60, z: 186, heading: 1.57 },
  { x: 10, z: -224, heading: 0 },
]);
const taxiType = VEHICLE_TYPES.find((t) => t.id === 'taxi');
parked.push(new Vehicle(scene, taxiType, 52, -20, -1.57, { driver: null, taxi: true, color: 0xf7b500 }));
const allVehicles = () => traffic.concat(parked, police.cars, police.roadblock);

const crowd = spawnCrowd(scene, 26);
const police = new PoliceSystem(scene);
const combat = new CombatSystem(scene, audio);
combat.onShotFired = (x, z) => {
  for (const ped of crowd) if (dist2d(ped.x, ped.z, x, z) < 26) ped.panic(x, z);
  S.crimeTimer = Math.max(S.crimeTimer, 4);
};

function crime(n, x, z) {
  S.wantedF = clamp(S.wantedF + n, 0, 5);
  S.crimeTimer = Math.max(S.crimeTimer, 6);
  if (x !== undefined) {
    for (const ped of crowd) if (dist2d(ped.x, ped.z, x, z) < 24) ped.panic(x, z);
  }
}

const fx = {
  scene,
  colliders,
  dialogue: (lines, cb) => hud.dialogue(lines, cb),
  toast: (msg) => hud.toast(msg),
  pay: (n, label) => {
    S.cash += n;
    hud.toast('+' + '$' + n + (label ? ' — ' + label : ''));
    audio.cash();
    saveGame(true);
  },
  addWanted: (n) => crime(n, player.x, player.z),
  setWantedAtLeast: (n) => { S.wantedF = Math.max(S.wantedF, n); S.crimeTimer = Math.max(S.crimeTimer, 8); },
  setHeatFloor: (n) => { S.heatFloor = n; },
  spawnHostiles: (pts) => pts.forEach((p) => combat.spawnHostile(p[0], p[1])),
  aliveHostiles: () => combat.aliveCount(),
  clearHostiles: () => combat.clearHostiles(),
  ending: () => { S.mode = 'ending'; hud.showEnding(); audio.setRadio(false); },
  audioPickup: () => audio.pickup(),
  audioGate: () => audio.gate(),
};

const story = new Story(fx);
const activities = new Activities(fx);

const SERVICES = [
  {
    id: 'clinic', at: LOCATIONS.clinicDoor, label: 'Clínica del Sol — full heal',
    cost: 60, can: () => S.health < 100, apply: () => { S.health = 100; },
    done: 'The Clínica patches you up. Good as new.',
  },
  {
    id: 'market', at: LOCATIONS.marketDoor, label: 'Mercado Brisa — energy drink (+30 health)',
    cost: 10, can: () => S.health < 100, apply: () => { S.health = Math.min(100, S.health + 30); },
    done: 'Sweet, cold and immediately effective.',
  },
  {
    id: 'garage', at: LOCATIONS.garageDoor, label: 'Taller Vera — repair your car',
    cost: 40, can: () => !!player.vehicle && player.vehicle.health < 100,
    apply: () => { player.vehicle.health = 100; },
    done: 'Taller Vera hammers out every dent.',
  },
];

// ---------------------------------------------------------------- input
const keys = new Set();
let camYaw = 2.7;
let camPitch = 0.32;
let mouseDown = false;
let pointerLocked = false;

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  audio.unlock();
  if (S.mode === 'play') {
    if (e.code === 'KeyE') doInteract();
    if (e.code === 'KeyF') toggleVehicle();
    if (e.code === 'KeyQ' && player.vehicle) {
      hud.toast('♪ ' + audio.cycleStation());
    }
    if (e.code === 'KeyT') activities.toggleTaxi(playerView());
    if (e.code === 'Escape') setPause(true);
  } else if (S.mode === 'pause' && e.code === 'Escape') {
    setPause(false);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
renderer.domElement.addEventListener('mousedown', () => {
  audio.unlock();
  mouseDown = true;
  if (S.mode === 'play' && !pointerLocked) {
    renderer.domElement.requestPointerLock();
  }
});
window.addEventListener('mouseup', () => { mouseDown = false; });
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
});
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || S.mode !== 'play') return;
  camYaw -= e.movementX * 0.0026;
  camPitch = clamp(camPitch + e.movementY * 0.0022, -0.05, 1.1);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function playerView() {
  return {
    x: player.x, z: player.z, heading: player.vehicle ? player.vehicle.heading : player.heading,
    speed: player.vehicle ? player.vehicle.speed : player.speed,
    vx: player.vx, vz: player.vz, vehicle: player.vehicle,
  };
}

function nearestVehicle(maxD) {
  let best = null;
  let bestD = maxD;
  for (const v of allVehicles()) {
    if (v.dead) continue;
    const d = dist2d(player.x, player.z, v.x, v.z);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

function toggleVehicle() {
  if (player.vehicle) exitVehicle();
  else enterVehicle(nearestVehicle(3.6));
}

function enterVehicle(v) {
  if (!v) return;
  const wasTraffic = v.driver === 'traffic';
  const wasCop = v.driver === 'police';
  if (wasCop) {
    const i = police.cars.indexOf(v);
    if (i >= 0) police.cars.splice(i, 1);
  }
  if (wasTraffic) {
    const i = traffic.indexOf(v);
    if (i >= 0) traffic.splice(i, 1);
    parked.push(v);
  }
  v.driver = 'player';
  v.occupied = true;
  player.vehicle = v;
  player.x = v.x;
  player.z = v.z;
  audio.setRadio(true);
  hud.toast(v.type.name + ' — Q changes the radio');
  if (wasTraffic) crime(1, v.x, v.z);
  if (wasCop) crime(1, v.x, v.z);
}

function exitVehicle() {
  const v = player.vehicle;
  if (!v) return;
  const side = 2.4;
  const sx = Math.cos(v.heading) * -side;
  const sz = -Math.sin(v.heading) * -side;
  player.x = clamp(v.x + sx, -WORLD_BOUND, WORLD_BOUND);
  player.z = clamp(v.z + sz, -WORLD_BOUND, WATER_Z - 3);
  const p = resolveCollisions({ x: player.x, z: player.z }, 0.5, colliders);
  player.x = p.x;
  player.z = p.z;
  player.heading = v.heading;
  v.driver = null;
  player.vehicle = null;
  audio.setRadio(false);
  audio.engine(0, false);
}

function doInteract() {
  if (hud.advanceDialogue()) return;
  if (S.mode !== 'play') return;
  if (story.canTalk(playerView())) {
    story.startNext();
    return;
  }
  for (const svc of SERVICES) {
    if (dist2d(player.x, player.z, svc.at.x, svc.at.z) < 5) {
      if (!svc.can()) { hud.toast(svc.label + ' — nothing you need right now'); return; }
      if (S.cash < svc.cost) { hud.toast('Not enough cash for ' + svc.label); return; }
      S.cash -= svc.cost;
      svc.apply();
      hud.toast(svc.done + ' (-$' + svc.cost + ')');
      audio.cash();
      return;
    }
  }
  if (player.vehicle) {
    for (const start of activities.raceStarts()) {
      if (dist2d(player.x, player.z, start.x, start.z) < 8 && !activities.race) {
        activities.startRace(start.id);
        return;
      }
    }
  }
}

function currentPrompt() {
  if (hud.dialogueActive || S.mode !== 'play') return null;
  if (story.canTalk(playerView())) return '<b>E</b> — Talk to Pilar Duarte';
  for (const svc of SERVICES) {
    if (dist2d(player.x, player.z, svc.at.x, svc.at.z) < 5) {
      return '<b>E</b> — ' + svc.label + ' · $' + svc.cost;
    }
  }
  if (player.vehicle) {
    for (const start of activities.raceStarts()) {
      if (dist2d(player.x, player.z, start.x, start.z) < 8 && !activities.race) {
        return '<b>E</b> — Start the ' + start.name;
      }
    }
    if (player.vehicle.type.id === 'taxi' && !activities.taxi.onDuty) return '<b>T</b> — Taxi duty';
    return '<b>F</b> — Exit the ' + player.vehicle.type.name;
  }
  const v = nearestVehicle(3.6);
  if (v) return '<b>F</b> — ' + (v.driver === 'traffic' ? 'Steal the ' : 'Enter the ') + v.type.name;
  return null;
}

// ---------------------------------------------------------------- saves
function saveGame(silent) {
  const data = {
    cash: S.cash,
    jobIndex: story.jobIndex,
    packages: activities.foundFlags(),
    x: player.x,
    z: player.z,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (!silent) hud.toast('Game saved');
    return true;
  } catch (e) {
    if (!silent) hud.toast('Save failed in this browser');
    return false;
  }
}

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function applySave(data) {
  S.cash = data.cash;
  S.health = 100;
  S.wantedF = 0;
  story.jobIndex = clamp(data.jobIndex || 0, 0, 7);
  activities.setFoundFlags(data.packages || []);
  if (player.vehicle) exitVehicle();
  player.x = data.x !== undefined ? data.x : 16;
  player.z = data.z !== undefined ? data.z : 20;
}

function resetGame() {
  S.cash = 85;
  S.health = 100;
  S.wantedF = 0;
  S.heatFloor = 0;
  story.jobIndex = 0;
  story.active = false;
  story.marker = null;
  story.objective = '';
  story.timer = -1;
  story.heatFloor = 0;
  story.cleanupActors();
  combat.clearHostiles();
  activities.race = null;
  activities.endTaxiSilent();
  activities.setFoundFlags(activities.packages.map(() => false));
  if (player.vehicle) exitVehicle();
  player.x = 16;
  player.z = 20;
  player.heading = 2.7;
}

function startPlay() {
  S.mode = 'play';
  S.started = true;
  hud.hideTitle();
  hud.toast('Find Pilar Duarte by the fountain — the gold ring on your map');
}

function setPause(on) {
  if (on && S.mode === 'play') {
    S.mode = 'pause';
    hud.showPause(true);
  } else if (!on && S.mode === 'pause') {
    S.mode = 'play';
    hud.showPause(false);
  }
}

hud.el['btn-new'].addEventListener('click', () => { audio.unlock(); resetGame(); startPlay(); });
hud.el['btn-continue'].addEventListener('click', () => {
  audio.unlock();
  const data = readSave();
  if (data) applySave(data);
  startPlay();
});
hud.el['btn-resume'].addEventListener('click', () => setPause(false));
hud.el['btn-save'].addEventListener('click', () => {
  saveGame(false);
  hud.showPause(true, 'Saved — cash, story progress and packages are kept.');
});
hud.el['btn-restart'].addEventListener('click', () => { resetGame(); setPause(false); });
hud.el['btn-quit'].addEventListener('click', () => {
  setPause(false);
  S.mode = 'title';
  hud.showTitle(!!readSave());
});
hud.el['btn-roam'].addEventListener('click', () => {
  hud.hideEnding();
  S.mode = 'play';
});

// ---------------------------------------------------------------- consequences
function wasted() {
  hud.flashScreen('wasted-screen');
  const fee = Math.min(100, S.cash);
  S.cash -= fee;
  S.health = 100;
  S.wantedF = 0;
  S.heatFloor = 0;
  story.failJobSilent();
  clearPolice();
  if (player.vehicle) {
    player.vehicle.driver = null;
    player.vehicle = null;
  }
  player.x = LOCATIONS.clinicDoor.x + 4;
  player.z = LOCATIONS.clinicDoor.z;
  audio.setRadio(false);
  hud.toast('The Clínica charged you $' + fee);
}

function busted() {
  hud.flashScreen('busted-screen');
  const fine = Math.round(S.cash * 0.15);
  S.cash -= fine;
  S.wantedF = 0;
  S.heatFloor = 0;
  clearPolice();
  if (player.vehicle) {
    player.vehicle.driver = null;
    player.vehicle = null;
  }
  player.x = LOCATIONS.policeDoor.x;
  player.z = LOCATIONS.policeDoor.z + 6;
  audio.setRadio(false);
  hud.toast('Released from the Comisaría. Fine: $' + fine);
}

function clearPolice() {
  for (const c of police.cars) c.dispose(scene);
  police.cars = [];
  police.clearRoadblock();
  if (police.heli) {
    scene.remove(police.heli);
    police.heli = null;
  }
}

// Story needs a quiet fail path for death/arrest mid-job.
story.failJobSilent = function () {
  if (!this.active) return;
  this.active = false;
  this.marker = null;
  this.objective = '';
  this.timer = -1;
  this.heatFloor = 0;
  this.cleanupActors();
  combat.clearHostiles();
};

function damagePlayer(dmg) {
  if (S.mode !== 'play') return;
  S.health -= dmg;
  hud.hurt();
  audio.hurt();
  if (S.health <= 0) wasted();
}

// ---------------------------------------------------------------- per-frame
function clampToWorld(o, r) {
  o.x = clamp(o.x, -WORLD_BOUND, WORLD_BOUND);
  const onPier = Math.abs(o.x) < PIER_HALF + 1.2;
  const zMax = onPier ? PIER_END_Z - 2 : WATER_Z - 3;
  o.z = clamp(o.z, -WORLD_BOUND, zMax);
  const p = resolveCollisions({ x: o.x, z: o.z }, r, colliders);
  o.x = p.x;
  o.z = p.z;
}

function movePlayer(dt) {
  const pv = playerView();
  if (player.vehicle) {
    const v = player.vehicle;
    const ctl = {
      throttle: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + (keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0),
      steer: (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + (keys.has('KeyD') || keys.has('ArrowRight') ? -1 : 0),
      handbrake: keys.has('Space'),
    };
    const beforeX = v.x;
    const beforeZ = v.z;
    v.drive(dt, ctl);
    clampToWorld(v, v.type.l * 0.36);
    player.x = v.x;
    player.z = v.z;
    player.vx = (v.x - beforeX) / Math.max(dt, 0.001);
    player.vz = (v.z - beforeZ) / Math.max(dt, 0.001);
    player.speed = v.speed;
    // The driver rides along — visible only in the open-top Palmera, where
    // there is no roof to clip through.
    player.mesh.visible = v.type.id === 'palmera';
    const sx = Math.cos(v.heading) * -0.45;
    const sz = -Math.sin(v.heading) * -0.45;
    player.mesh.position.set(v.x + sx, 0.62, v.z + sz);
    player.mesh.rotation.y = v.heading;
    resetPose(player.mesh);
    audio.engine(clamp(Math.abs(v.speed) / v.type.topSpeed, 0, 1), true);
    return pv;
  }
  audio.engine(0, false);
  player.mesh.visible = true;
  // On foot: move relative to the camera.
  let ix = 0;
  let iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  const moving = ix !== 0 || iz !== 0;
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = sprint ? 8.4 : 5.2;
  if (moving) {
    const len = Math.hypot(ix, iz);
    const dirX = ix / len;
    const dirZ = iz / len;
    const worldX = Math.sin(camYaw) * dirZ + Math.cos(camYaw) * dirX;
    const worldZ = Math.cos(camYaw) * dirZ - Math.sin(camYaw) * dirX;
    const targetHeading = Math.atan2(worldX, worldZ);
    let dh = angleDelta(player.heading, targetHeading);
    player.heading += clamp(dh, -11 * dt, 11 * dt);
    player.x += worldX * speed * dt;
    player.z += worldZ * speed * dt;
    player.vx = worldX * speed;
    player.vz = worldZ * speed;
    player.speed = speed;
    player.phase += dt * speed * 1.9;
    animateWalk(player.mesh, player.phase, sprint ? 1 : 0.75);
  } else {
    player.speed = 0;
    player.vx = 0;
    player.vz = 0;
    resetPose(player.mesh);
  }
  clampToWorld(player, 0.5);
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.heading;
  return pv;
}

function vehicleCollisions(dt) {
  const cars = allVehicles();
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = (a.radius() + b.radius()) * 0.82;
      if (d > min || d < 0.001) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      const closing = Math.abs(a.speed) + Math.abs(b.speed);
      if (closing > 7) {
        const dmg = (closing - 6) * 1.1;
        a.damage(dmg);
        b.damage(dmg);
        audio.noise(0.12, 0.2, 500);
        if (a === player.vehicle || b === player.vehicle) {
          crime(0.34, player.x, player.z);
          if (closing > 13) damagePlayer(3);
        }
      }
      const swap = a.speed;
      a.speed = b.speed * 0.4;
      b.speed = swap * 0.4;
      a.syncMesh(0);
      b.syncMesh(0);
    }
  }
  // Cars versus the crowd.
  for (const car of cars) {
    if (Math.abs(car.speed) < 4) continue;
    for (const ped of crowd) {
      if (ped.dead) continue;
      if (dist2d(car.x, car.z, ped.x, ped.z) < 1.7) {
        ped.dead = true;
        ped.mesh.rotation.x = -Math.PI / 2;
        ped.mesh.position.y = 0.25;
        setTimeout(() => ped.dispose(scene), 5000);
        if (car === player.vehicle) {
          crime(1, ped.x, ped.z);
          hud.toast('You hit a pedestrian!');
        } else {
          for (const p2 of crowd) if (dist2d(p2.x, p2.z, ped.x, ped.z) < 22) p2.panic(ped.x, ped.z);
        }
      }
    }
  }
}

let debugCam = null;
function updateCamera(dt) {
  if (debugCam) {
    camera.position.set(debugCam.x, debugCam.y, debugCam.z);
    camera.lookAt(debugCam.lx, debugCam.ly, debugCam.lz);
    return;
  }
  const target = player.vehicle
    ? { x: player.vehicle.x, z: player.vehicle.z, heading: player.vehicle.heading }
    : { x: player.x, z: player.z, heading: player.heading };
  if (player.vehicle) {
    // The chase camera swings behind the car.
    let dh = angleDelta(camYaw, target.heading + Math.PI);
    camYaw += dh * Math.min(1, dt * 2.2);
  }
  const dist = player.vehicle ? 11.5 : 8.2;
  const height = player.vehicle ? 3.6 : 2.6;
  const cx = target.x - Math.sin(camYaw) * Math.cos(camPitch) * dist;
  const cz = target.z - Math.cos(camYaw) * Math.cos(camPitch) * dist;
  const cy = height + Math.sin(camPitch) * dist;
  camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 7);
  camera.position.y += (Math.max(0.7, cy) - camera.position.y) * Math.min(1, dt * 7);
  camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 7);
  camera.lookAt(target.x, 1.5, target.z);
}

function activeMarker() {
  if (story.active && story.marker) return story.marker;
  const gate = activities.raceMarker();
  if (gate) return gate;
  return activities.taxiMarker();
}

const clock = new THREE.Clock();
let debugSteps = 1;

function playStep(dt) {
  {
    const pv = movePlayer(dt);
    // Traffic and parked life.
    const obstacles = allVehicles().map((v) => ({ x: v.x, z: v.z }));
    obstacles.push({ x: player.x, z: player.z });
    for (const car of traffic) {
      car.trafficDrive(dt, obstacles);
      clampToWorld(car, car.type.l * 0.36);
      car.syncMesh(0);
    }
    vehicleCollisions(dt);
    // Wanted bookkeeping.
    if (S.heatFloor > 0) S.wantedF = Math.max(S.wantedF, S.heatFloor);
    if (S.crimeTimer > 0) S.crimeTimer -= dt;
    else if (!police.anySeesPlayer(pv, colliders) && S.wantedF > S.heatFloor) {
      S.wantedF = Math.max(S.heatFloor, S.wantedF - dt / 15);
    }
    const wantedInt = Math.ceil(S.wantedF);
    const result = police.update(dt, pv, wantedInt, colliders);
    audio.setSiren(police.cars.length > 0 && wantedInt > 0);
    if (result === 'busted') busted();
    // Combat.
    if (mouseDown && !player.vehicle && !hud.dialogueActive) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const from = new THREE.Vector3(player.x, 1.45, player.z);
      const res = combat.playerFire(from, dir);
      if (res === 'hit' || res === 'kill') hud.hitmarker();
      if (res !== 'cooldown') crime(0.5, player.x, player.z);
    }
    combat.update(dt, pv, colliders, damagePlayer);
    story.update(dt, pv);
    activities.update(dt, pv);
    for (const ped of crowd) ped.update(dt, colliders);
    // HUD.
    hud.setCash(S.cash);
    hud.setPackages(activities.foundCount());
    hud.setWanted(S.wantedF);
    hud.setHealth(S.health / 100);
    hud.setBusted(police.bustedMeter);
    hud.objective(story.active ? story.currentJob().title : '', story.active ? story.objective : '', story.active ? story.timer : -1);
    hud.raceInfo(activities.raceInfo());
    hud.prompt(currentPrompt());
    hud.setSpeedo(
      player.vehicle ? player.vehicle.speed * 3.6 : 0,
      player.vehicle ? player.vehicle.type.name : null,
      player.vehicle ? audio.stationName() : null
    );
    document.getElementById('crosshair').style.display = !player.vehicle ? 'block' : 'none';
    const marker = activeMarker();
    world.setBeacon(marker ? marker.x : null, marker ? marker.z : null, 0xffcf4d);
    hud.drawMinimap({
      player: { x: player.x, z: player.z, heading: pv.heading },
      marker,
      cops: police.cars.concat(police.roadblock),
      packages: activities.packages,
      raceGate: activities.raceMarker(),
      taxiPoint: activities.taxiMarker(),
      pilar: story.active ? null : LOCATIONS.pilar,
    });
  }
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  S.time += dt;
  world.update(dt);
  pilarRing.material.opacity = 0.5 + Math.sin(S.time * 3) * 0.25;
  pilarRing.visible = !story.active && S.mode === 'play';
  pilarMesh.rotation.y = -2.2 + Math.sin(S.time * 0.6) * 0.14;
  if (S.mode === 'play') {
    for (let i = 0; i < debugSteps; i++) playStep(dt);
  }
  hud.update(dt);
  audio.update();
  updateCamera(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- debug hooks
window.GAME = {
  S, player, story, activities, police, combat, traffic, parked, crowd,
  hud, audio,
  pos: () => ({ x: player.x, z: player.z }),
  teleport(x, z) {
    if (player.vehicle) {
      player.vehicle.x = x;
      player.vehicle.z = z;
      player.vehicle.speed = 0;
      player.vehicle.syncMesh(0);
    }
    player.x = x;
    player.z = z;
  },
  setWanted(n) { S.wantedF = n; },
  setHealth(n) { S.health = n; },
  giveCash(n) { S.cash += n; },
  startGame() { if (S.mode === 'title') { resetGame(); startPlay(); } },
  talk() { if (story.canTalk(playerView())) story.startNext(); },
  forceJob(i) { story.jobIndex = i; },
  interact() { doInteract(); },
  enterCar() { toggleVehicle(); },
  setCam(x, y, z, lx, ly, lz) { debugCam = { x, y, z, lx, ly, lz }; },
  clearCam() { debugCam = null; },
  aimAt(x, z) { camYaw = Math.atan2(player.x - x, player.z - z) + Math.PI; camPitch = 0.18; },
  shoot() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return combat.playerFire(new THREE.Vector3(player.x, 1.45, player.z), dir);
  },
  setSteps(n) { debugSteps = clamp(Math.round(n) || 1, 1, 10); },
  save: () => saveGame(true),
  load: () => { const d = readSave(); if (d) applySave(d); return !!d; },
  readSave,
};

hud.showTitle(!!readSave());
frame();
