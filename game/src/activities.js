// activities.js — the city's side hustles: two point-to-point races, taxi
// fares, fifteen hidden packages, and the services that keep a working
// criminal healthy, armoured, clean and unpainted-by-police.

import * as THREE from '../three.module.min.js';
import { FARES, PACKAGE_POSITIONS, PACKAGE_VALUE, PLACES, RACES, SERVICES } from './config.js';
import { formatCash, formatTime } from './util.js';
import { playerPos } from './player.js';
import { makePersonMesh } from './people.js';
import { clearPolice } from './police.js';

export function createActivities() {
  return {
    packages: [],
    packagesFound: 0,
    race: null, // { key, def, gateIndex, elapsed }
    fare: null, // { stage, x, z, destKey, elapsed, ped }
    fareCooldown: 8,
  };
}

function ringMesh(color, radius = 3.4) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.5, radius, 26),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  return ring;
}

function beamMesh(color, height = 26) {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, height, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.position.y = height / 2;
  return beam;
}

export function initActivities(G) {
  const A = G.activities;
  // Hidden packages: little gold ingots, bobbing and turning.
  const ingotMat = new THREE.MeshBasicMaterial({ color: 0xffca3a });
  for (const pos of PACKAGE_POSITIONS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.9), ingotMat);
    mesh.position.set(pos.x, 1.1, pos.z);
    G.scene.add(mesh);
    A.packages.push({ x: pos.x, z: pos.z, mesh, taken: false, phase: Math.random() * 6 });
  }
  // Permanent rings: race starts and service doors.
  A.markers = [];
  const addMarker = (x, z, color) => {
    const ring = ringMesh(color);
    ring.position.x = x;
    ring.position.z = z;
    G.scene.add(ring);
    A.markers.push(ring);
  };
  addMarker(RACES.vuelta.start.x, RACES.vuelta.start.z, 0x7ddb4a);
  addMarker(RACES.boardwalk.start.x, RACES.boardwalk.start.z, 0x7ddb4a);
  addMarker(PLACES.clinicaDoor.x, PLACES.clinicaDoor.z, 0xf2f0e8);
  addMarker(PLACES.paintShop.x, PLACES.paintShop.z, 0x7fb3c8);
  addMarker(PLACES.gunShop.x, PLACES.gunShop.z, 0xe8b93c);
  addMarker(PLACES.carWash.x, PLACES.carWash.z, 0x4a90b8);
  // The moving beam that marks the current race gate / taxi target.
  A.beam = beamMesh(0x7ddb4a);
  A.beam.visible = false;
  G.scene.add(A.beam);
}

function startRace(G, key) {
  const def = RACES[key];
  G.activities.race = { key, def, gateIndex: 0, elapsed: 0 };
  G.toast(def.name + ' — follow the green beam! Beat ' + formatTime(def.parSeconds) + ' for ' + formatCash(def.prize) + '.');
  if (G.sfx) G.sfx.blip();
}

export function cancelRace(G) {
  G.activities.race = null;
  G.activities.beam.visible = false;
}

// What the E key would do here, if anything: { label, run } or null.
export function activityInteract(G) {
  const A = G.activities;
  const player = G.player;
  const pp = playerPos(player);

  if (!A.race) {
    for (const key of Object.keys(RACES)) {
      const def = RACES[key];
      const near = Math.hypot(pp.x - def.start.x, pp.z - def.start.z) < 5.5;
      if (!near) continue;
      if (def.needsVehicle && player.inVehicle) {
        return { label: 'E — Start ' + def.name + ' (race)', run: () => startRace(G, key) };
      }
      if (!def.needsVehicle && !player.inVehicle) {
        return { label: 'E — Start ' + def.name + ' (on foot)', run: () => startRace(G, key) };
      }
    }
  }
  // Services.
  for (const [key, svc] of Object.entries(SERVICES)) {
    const place = PLACES[svc.place];
    if (Math.hypot(pp.x - place.x, pp.z - place.z) > 7) continue;
    if (svc.onFoot && player.inVehicle) continue;
    if (svc.inVehicle && !player.inVehicle) continue;
    return {
      label: 'E — ' + svc.label + ' (' + formatCash(svc.price) + ')',
      run: () => applyService(G, key),
    };
  }
  return null;
}

function applyService(G, key) {
  const player = G.player;
  const svc = SERVICES[key];
  if (player.cash < svc.price) {
    G.toast('Not enough cash — you have ' + formatCash(player.cash) + '.');
    return;
  }
  if (key === 'clinic') {
    if (player.health >= 100) { G.toast('You are already in perfect health.'); return; }
    player.cash -= svc.price;
    player.health = 100;
    G.toast('Clínica Sol patched you up. ' + formatCash(svc.price) + ' well spent.');
  } else if (key === 'armor') {
    if (player.armor >= 100) { G.toast('Your armour is already whole.'); return; }
    player.cash -= svc.price;
    player.armor = 100;
    G.toast('Armería Sol fitted a fresh vest.');
  } else if (key === 'paint') {
    player.cash -= svc.price;
    player.inVehicle.health = 100;
    player.inVehicle.group.children[0].material.color.setHex(
      [0xd94f30, 0x2e6fb7, 0x3f9e63, 0xe8e2d2, 0x30343c][Math.floor(Math.random() * 5)],
    );
    clearPolice(G);
    G.toast('New paint, new plates. The law loses interest.');
  } else if (key === 'wash') {
    player.cash -= svc.price;
    player.inVehicle.health = 100;
    G.police.wanted = Math.max(G.police.heatFloor, G.police.wanted - 1);
    G.toast('Washed and repaired. The heat cools a little.');
  }
  if (G.sfx) G.sfx.cash();
}

// --- Taxi fares -----------------------------------------------------------------

// Curbside drop points — always on open ground a car can actually reach,
// never inside a building's footprint.
const FARE_DESTINATIONS = [
  { label: 'Café Alba', x: -246, z: -96 },
  { label: 'Hotel Marea (front steps)', x: 60, z: -148 },
  { label: 'Marina Alba', x: 330, z: -356 },
  { label: 'Club Brisa car park', x: 168, z: -272 },
  { label: 'Plaza del Faro', x: -24, z: -60 },
  { label: 'Costa Vera Pier', x: 322, z: 58 },
  { label: 'Clínica Sol', x: -126, z: 116 },
];

export function spawnFare(G) {
  const A = G.activities;
  if (A.fare) return;
  const pp = playerPos(G.player);
  const angle = Math.random() * Math.PI * 2;
  const dist = 55 + Math.random() * 90;
  const x = Math.max(-460, Math.min(290, pp.x + Math.cos(angle) * dist));
  const z = Math.max(-460, Math.min(460, pp.z + Math.sin(angle) * dist));
  const ped = makePersonMesh(0xe4e0d6);
  ped.position.set(x, 0, z);
  G.scene.add(ped);
  A.fare = { stage: 'pickup', x, z, dest: null, elapsed: 0, ped };
  G.toast('A fare is hailing your taxi nearby — check the minimap.');
}

function updateFare(G, dt) {
  const A = G.activities;
  const player = G.player;
  if (!player.inVehicle || player.inVehicle.type !== 'taxi') {
    A.fareCooldown = Math.max(A.fareCooldown, 4);
    return;
  }
  if (!A.fare) {
    A.fareCooldown -= dt;
    if (A.fareCooldown <= 0) spawnFare(G);
    return;
  }
  const fare = A.fare;
  const v = player.inVehicle;
  if (fare.stage === 'pickup') {
    if (Math.hypot(v.x - fare.x, v.z - fare.z) < 5.5 && Math.abs(v.speed) < 2.5) {
      fare.stage = 'dropoff';
      fare.elapsed = 0;
      fare.dest = FARE_DESTINATIONS[Math.floor(Math.random() * FARE_DESTINATIONS.length)];
      G.scene.remove(fare.ped);
      G.toast('Fare aboard! Take them to ' + fare.dest.label + '.');
      if (G.sfx) G.sfx.blip();
    }
  } else {
    fare.elapsed += dt;
    const dest = fare.dest;
    if (Math.hypot(v.x - dest.x, v.z - dest.z) < 7 && Math.abs(v.speed) < 2.5) {
      const tip = fare.elapsed < FARES.tipWindow ? 15 : fare.elapsed < 150 ? 7 : 0;
      player.cash += FARES.base + tip;
      G.toast('Fare paid ' + formatCash(FARES.base + tip) + (tip ? ' (tip ' + formatCash(tip) + ')' : '') + '.');
      if (G.sfx) G.sfx.cash();
      A.fare = null;
      A.fareCooldown = 10 + Math.random() * 10;
    }
  }
}

// --- The per-frame update ---------------------------------------------------------

export function updateActivities(G, dt) {
  const A = G.activities;
  const pp = playerPos(G.player);

  for (const p of A.packages) {
    if (p.taken) continue;
    p.mesh.rotation.y += dt * 2.2;
    p.mesh.position.y = 1.1 + Math.sin(G.elapsed * 2 + p.phase) * 0.18;
    if (Math.hypot(pp.x - p.x, pp.z - p.z) < 2.6) {
      p.taken = true;
      p.mesh.visible = false;
      A.packagesFound++;
      G.player.cash += PACKAGE_VALUE;
      G.toast('Hidden package ' + A.packagesFound + '/15 · +' + formatCash(PACKAGE_VALUE));
      if (G.sfx) G.sfx.blip();
    }
  }

  // Race progression.
  if (A.race) {
    const race = A.race;
    race.elapsed += dt;
    G.activityTimer = race.elapsed;
    const gate = race.def.gates[race.gateIndex];
    A.beam.visible = true;
    A.beam.position.x = gate.x;
    A.beam.position.z = gate.z;
    A.beam.material.color.setHex(0x7ddb4a);
    G.activityObjective = {
      x: gate.x, z: gate.z,
      label: race.def.name + ' · gate ' + (race.gateIndex + 1) + '/' + race.def.gates.length + ' · ' + formatTime(race.elapsed),
    };
    const radius = race.def.needsVehicle ? 8 : 4.5;
    if (Math.hypot(pp.x - gate.x, pp.z - gate.z) < radius) {
      race.gateIndex++;
      if (G.sfx) G.sfx.blip();
      if (race.gateIndex >= race.def.gates.length) {
        const inTime = race.elapsed <= race.def.parSeconds;
        const prize = inTime ? race.def.prize : Math.floor(race.def.prize / 4);
        G.player.cash += prize;
        G.toast(race.def.name + ' finished in ' + formatTime(race.elapsed) + '! +' + formatCash(prize) + (inTime ? '' : ' (outside the par time)'));
        if (G.sfx) G.sfx.cash();
        A.race = null;
        A.beam.visible = false;
        G.activityObjective = null;
        G.activityTimer = null;
      }
    }
  } else if (A.fare && A.fare.stage === 'dropoff') {
    const dest = A.fare.dest;
    A.beam.visible = true;
    A.beam.position.x = dest.x;
    A.beam.position.z = dest.z;
    A.beam.material.color.setHex(0xe8b93c);
    G.activityObjective = { x: dest.x, z: dest.z, label: 'Taxi fare → ' + dest.label };
  } else if (A.fare) {
    A.beam.visible = true;
    A.beam.position.x = A.fare.x;
    A.beam.position.z = A.fare.z;
    A.beam.material.color.setHex(0xe8b93c);
    G.activityObjective = { x: A.fare.x, z: A.fare.z, label: 'Taxi fare — pick up' };
  } else {
    A.beam.visible = false;
    G.activityObjective = null;
  }

  updateFare(G, dt);
}
