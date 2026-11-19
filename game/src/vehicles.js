// vehicles.js — every car in Costa Vera: how they look, how they drive, the
// parked cars waiting to be borrowed, and the traffic that follows the grid.

import * as THREE from '../three.module.min.js';
import { ROAD_X, ROAD_Z, VEHICLE_TYPES, VEHICLE_COLORS } from './config.js';
import { clamp, headingTo, makeRng, pick, turnToward } from './util.js';
import { resolveCollisions, surfaceAt } from './city.js';

const BODY_DIMS = {
  compact: { w: 1.8, l: 3.6, h: 0.62, cabin: 0.55 },
  sedan: { w: 1.9, l: 4.4, h: 0.66, cabin: 0.58 },
  sports: { w: 1.95, l: 4.2, h: 0.5, cabin: 0.42 },
  pickup: { w: 2.0, l: 4.9, h: 0.78, cabin: 0.62 },
  van: { w: 2.1, l: 5.0, h: 1.15, cabin: 0.5 },
  taxi: { w: 1.9, l: 4.4, h: 0.66, cabin: 0.58 },
};

const GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x223140 });
const TYRE_MAT = new THREE.MeshLambertMaterial({ color: 0x17181c });
const LIGHT_MAT = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const TAIL_MAT = new THREE.MeshBasicMaterial({ color: 0xd93a2e });

// Builds the visual for one car. Front of the car faces +Z locally.
export function makeCarMesh(type, colorHex) {
  const dims = BODY_DIMS[type] || BODY_DIMS.sedan;
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });

  const body = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h, dims.l), paint);
  body.position.y = 0.38 + dims.h / 2;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(dims.w * 0.82, dims.cabin, dims.l * 0.48),
    type === 'van' ? paint : GLASS_MAT,
  );
  cabin.position.set(0, 0.38 + dims.h + dims.cabin / 2, type === 'pickup' ? dims.l * 0.14 : -dims.l * 0.04);
  group.add(cabin);

  if (type === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(dims.w * 0.9, 0.3, dims.l * 0.3), paint);
    bed.position.set(0, 0.95, -dims.l * 0.32);
    group.add(bed);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.32, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0 }),
    );
    sign.position.set(0, 0.38 + dims.h + dims.cabin + 0.18, -dims.l * 0.04);
    group.add(sign);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 10);
  const wheels = [];
  for (const [wx, wz] of [
    [-dims.w / 2, dims.l * 0.32], [dims.w / 2, dims.l * 0.32],
    [-dims.w / 2, -dims.l * 0.32], [dims.w / 2, -dims.l * 0.32],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, TYRE_MAT);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.37, wz);
    group.add(wheel);
    wheels.push(wheel);
  }

  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), LIGHT_MAT);
    head.position.set(side * dims.w * 0.32, 0.72, dims.l / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), TAIL_MAT);
    tail.position.set(side * dims.w * 0.32, 0.72, -dims.l / 2 - 0.02);
    group.add(tail);
  }
  group.userData.wheels = wheels;
  group.userData.dims = dims;
  return group;
}

let nextVehicleId = 1;

export function makeVehicle(type, colorHex, x, z, heading, mode) {
  const group = makeCarMesh(type, colorHex);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  return {
    id: nextVehicleId++,
    type,
    stats: VEHICLE_TYPES[type] || VEHICLE_TYPES.sedan,
    group,
    x, z, heading,
    speed: 0,
    mode, // 'parked' | 'traffic' | 'player' | 'abandoned'
    hasDriver: false,
    health: 100,
    targetX: x,
    targetZ: z,
    cruiseSpeed: 13 + Math.random() * 4,
    stuckTime: 0,
  };
}

// Arcade driving step shared by the player and (indirectly) pursuers.
// throttle -1..1 (W/S), steer -1..1 (A=-1, D=+1).
export function stepVehicle(v, dt, throttle, steer) {
  const s = v.stats;
  const wear = 0.55 + 0.45 * (v.health / 100); // a beaten-up car is slower
  if (throttle > 0) {
    v.speed += s.accel * throttle * dt;
    if (v.speed > s.topSpeed * wear) v.speed = s.topSpeed * wear;
  } else if (throttle < 0) {
    if (v.speed > 0.5) v.speed -= 34 * dt; // braking
    else {
      v.speed += s.accel * 0.6 * throttle * dt;
      if (v.speed < -s.reverse) v.speed = -s.reverse;
    }
  }
  // Rolling drag and engine braking.
  v.speed -= v.speed * 0.35 * dt;
  if (Math.abs(v.speed) < 0.04 && throttle === 0) v.speed = 0;

  if (v.speed !== 0) {
    const steerAuthority = clamp(v.speed / 11, -1, 1);
    v.heading -= steer * 1.75 * s.grip * steerAuthority * dt;
  }

  v.x += Math.sin(v.heading) * v.speed * dt;
  v.z += Math.cos(v.heading) * v.speed * dt;

  // Cars stay on land: no promenade shortcuts into the sea, no pier driving.
  if (v.x > 330) { v.x = 330; v.speed *= 0.4; }
  if (v.x < -486) { v.x = -486; v.speed *= 0.4; }
  v.z = clamp(v.z, -486, 486);

  const before = { x: v.x, z: v.z };
  resolveCollisions(before, 2.1);
  if (before.x !== v.x || before.z !== v.z) v.speed *= 0.45; // scraped a wall
  v.x = before.x; v.z = before.z;

  v.group.position.set(v.x, 0, v.z);
  v.group.rotation.y = v.heading;
  // A touch of body language: lean into corners, squat under power.
  v.group.rotation.z = -steer * clamp(Math.abs(v.speed) / 40, 0, 1) * 0.035 * Math.sign(v.speed);
  v.group.rotation.x = clamp(-throttle * Math.abs(v.speed) / 60, -0.02, 0.03);
  const spin = v.speed * dt * 2.4;
  for (const wheel of v.group.userData.wheels) wheel.rotation.x += spin;
}

// Simple car-to-car contact: overlapping circles push apart and trade speed.
export function collideVehicles(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const min = 3.6;
  if (d === 0 || d >= min) return false;
  const push = (min - d) / 2;
  const nx = dx / d;
  const nz = dz / d;
  a.x -= nx * push; a.z -= nz * push;
  b.x += nx * push; b.z += nz * push;
  const avg = (a.speed + b.speed) / 2;
  a.speed = avg * 0.6;
  b.speed = avg * 0.6;
  a.health = Math.max(5, a.health - 4);
  b.health = Math.max(5, b.health - 4);
  a.group.position.set(a.x, 0, a.z);
  b.group.position.set(b.x, 0, b.z);
  return true;
}

// --- Spawning ---------------------------------------------------------------

const PARKED_SPOTS = [
  // Along the promenade and in the two car parks, plus kerbside spots.
  { x: 262, z: -300, h: 0 }, { x: 262, z: -338, h: 0 }, { x: 150, z: -262, h: Math.PI / 2 },
  { x: 186, z: -262, h: Math.PI / 2 }, { x: 168, z: -284, h: 0 }, { x: 292, z: 40, h: 0 },
  { x: 292, z: -80, h: 0 }, { x: -106, z: -200, h: 0 }, { x: 134, z: 60, h: 0 },
  { x: -226, z: 200, h: 0 }, { x: 20, z: -106, h: Math.PI / 2 }, { x: -60, z: 134, h: Math.PI / 2 },
  { x: 106, z: 320, h: 0 }, { x: -346, z: -40, h: 0 }, { x: 226, z: -160, h: 0 },
  { x: -134, z: -320, h: 0 }, { x: 60, z: 106, h: Math.PI / 2 }, { x: -20, z: 226, h: Math.PI / 2 },
];

export function spawnParkedVehicles(scene) {
  const rng = makeRng(4242);
  const types = ['compact', 'sedan', 'sports', 'pickup', 'van', 'taxi'];
  const vehicles = [];
  for (const spot of PARKED_SPOTS) {
    const type = pick(rng, types);
    const color = type === 'taxi' ? 0xf2b33c : pick(rng, VEHICLE_COLORS);
    const v = makeVehicle(type, color, spot.x, spot.z, spot.h, 'parked');
    v.hasDriver = rng() > 0.55;
    scene.add(v.group);
    vehicles.push(v);
  }
  return vehicles;
}

export function spawnTraffic(scene, count) {
  const rng = makeRng(9911);
  const types = ['compact', 'sedan', 'sedan', 'pickup', 'van', 'taxi'];
  const vehicles = [];
  for (let i = 0; i < count; i++) {
    const ix = Math.floor(rng() * ROAD_X.length);
    const iz = Math.floor(rng() * ROAD_Z.length);
    const type = pick(rng, types);
    const color = type === 'taxi' ? 0xf2b33c : pick(rng, VEHICLE_COLORS);
    const v = makeVehicle(type, color, ROAD_X[ix], ROAD_Z[iz], 0, 'traffic');
    v.hasDriver = true;
    chooseTrafficTarget(v, rng, true);
    scene.add(v.group);
    vehicles.push(v);
  }
  return vehicles;
}

// Traffic drives junction to junction along the grid, turning at random.
function chooseTrafficTarget(v, rng, first = false) {
  const options = [];
  for (const x of ROAD_X) if (Math.abs(x - v.x) > 4) options.push({ x, z: v.z });
  for (const z of ROAD_Z) if (Math.abs(z - v.z) > 4) options.push({ x: v.x, z });
  // Prefer continuing along the current axis so traffic mostly flows.
  const along = options.filter((o) => (first ? true : Math.abs(headingTo(v.x, v.z, o.x, o.z) - v.heading) < 0.6));
  const choice = pick(rng, along.length && rng() > 0.35 ? along : options);
  v.targetX = choice.x;
  v.targetZ = choice.z;
}

const trafficRng = makeRng(5150);

export function updateTraffic(vehicles, dt, playerPos) {
  for (const v of vehicles) {
    if (v.mode !== 'traffic') continue;
    const dx = v.targetX - v.x;
    const dz = v.targetZ - v.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 7) {
      chooseTrafficTarget(v, trafficRng);
      continue;
    }
    const desired = Math.atan2(dx, dz);
    v.heading = turnToward(v.heading, desired, 1.6 * dt);
    let speed = v.cruiseSpeed;
    // Slow for the player standing in the road ahead.
    const aheadX = v.x + Math.sin(v.heading) * 9;
    const aheadZ = v.z + Math.cos(v.heading) * 9;
    if (Math.hypot(playerPos.x - aheadX, playerPos.z - aheadZ) < 5) speed = 0;
    v.speed += clamp(speed - v.speed, -22 * dt, 14 * dt);
    v.x += Math.sin(v.heading) * v.speed * dt;
    v.z += Math.cos(v.heading) * v.speed * dt;
    if (surfaceAt(v.x, v.z) !== 'land') { // never wander onto the shore
      v.x = clamp(v.x, -470, 300);
      v.z = clamp(v.z, -470, 470);
    }
    v.group.position.set(v.x, 0, v.z);
    v.group.rotation.y = v.heading;
    const spin = v.speed * dt * 2.4;
    for (const wheel of v.group.userData.wheels) wheel.rotation.x += spin;
  }
}
