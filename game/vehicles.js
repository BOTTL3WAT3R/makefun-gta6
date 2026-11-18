// vehicles.js — Costa Vera's cars: six body types built from boxes, the
// traffic fleet that loops the blocks, the parked cars along the kerbs, and
// the arcade driving model the player and the police both use.

import { makeRng, randRange, randPick, angleTowards, headingOf, resolveCircleColliders } from './util.js';
import { LAYOUT } from './world.js';

export const CAR_TYPES = {
  sedan:  { w: 1.9, l: 4.4, h: 0.62, cabin: 0.55, top: 30, accel: 13, name: 'Marina Sedan' },
  hatch:  { w: 1.8, l: 3.8, h: 0.66, cabin: 0.6, top: 26, accel: 12, name: 'Pico Hatch' },
  taxi:   { w: 1.9, l: 4.5, h: 0.62, cabin: 0.55, top: 29, accel: 13, name: 'Sol Taxi' },
  pickup: { w: 2.0, l: 4.9, h: 0.78, cabin: 0.62, top: 27, accel: 12, name: 'Duna Pickup' },
  van:    { w: 2.0, l: 5.0, h: 1.15, cabin: 0.5, top: 24, accel: 10, name: 'Cargo Van' },
  sports: { w: 1.9, l: 4.3, h: 0.45, cabin: 0.42, top: 40, accel: 19, name: 'Vela GT' },
};
const TYPE_KEYS = Object.keys(CAR_TYPES);
const PAINTS = [0xd8546a, 0x4ecdc4, 0xffd23e, 0x5168b8, 0xf0ece2, 0x2c2c34, 0xff9a5f, 0x7bc47f, 0xb06ab3, 0x8899aa];

const wheelGeoCache = new Map();
function wheelGeo(THREE) {
  if (!wheelGeoCache.has('w')) wheelGeoCache.set('w', new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10));
  return wheelGeoCache.get('w');
}

// Build one car mesh. Livery 'police' adds the black-and-white paint and a
// light bar whose two lamps police.js flashes.
export function createCarMesh(THREE, typeKey, colorHex, livery) {
  const spec = CAR_TYPES[typeKey];
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: livery === 'police' ? 0xf2f2f2 : colorHex });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e26 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x22384f });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.l), paint);
  body.position.y = 0.38 + spec.h / 2; body.castShadow = true; g.add(body);
  if (typeKey === 'pickup') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.92, spec.cabin, spec.l * 0.36), glass);
    cab.position.set(0, 0.38 + spec.h + spec.cabin / 2, spec.l * 0.22); g.add(cab);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.94, spec.h * 0.5, spec.l * 0.4), dark);
    bed.position.set(0, 0.38 + spec.h * 0.75, -spec.l * 0.26); g.add(bed);
  } else if (typeKey === 'van') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.96, spec.h * 0.9, spec.l * 0.62), paint);
    box.position.set(0, 0.38 + spec.h * 0.95, -spec.l * 0.16); g.add(box);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.94, spec.cabin * 0.8, spec.l * 0.3), glass);
    cab.position.set(0, 0.38 + spec.h + spec.cabin * 0.4, spec.l * 0.32); g.add(cab);
  } else {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.84, spec.cabin, spec.l * 0.48), glass);
    cab.position.set(0, 0.38 + spec.h + spec.cabin / 2, -spec.l * 0.03); cab.castShadow = true; g.add(cab);
  }
  if (typeKey === 'taxi' || livery === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffe98a }));
    sign.position.set(0, 0.38 + spec.h + spec.cabin + 0.12, -spec.l * 0.03); g.add(sign);
  }
  if (livery === 'police') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.02, spec.h * 0.5, spec.l * 0.4), dark);
    stripe.position.set(0, 0.38 + spec.h * 0.45, 0); g.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.32;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.x = 0.32;
    bar.add(red, blue); bar.position.set(0, 0.38 + spec.h + spec.cabin + 0.1, -spec.l * 0.03);
    g.add(bar);
    g.userData.lightbar = { red: red.material, blue: blue.material };
  }
  // Headlights and tail lights.
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tl = new THREE.MeshBasicMaterial({ color: 0xff3344 });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), hl);
    h.position.set(sx * spec.w * 0.32, 0.62, spec.l / 2 + 0.01); g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tl);
    t.position.set(sx * spec.w * 0.32, 0.66, -spec.l / 2 - 0.01); g.add(t);
  }
  const wheels = [], frontWheels = [];
  const wg = wheelGeo(THREE), wm = new THREE.MeshLambertMaterial({ color: 0x14141a });
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wg, wm);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * (spec.w / 2 - 0.05), 0.36, sz * (spec.l / 2 - 0.85));
    g.add(w); wheels.push(w);
    if (sz > 0) frontWheels.push(w);
  }
  g.userData.wheels = wheels; g.userData.frontWheels = frontWheels;
  return g;
}

function makeCar(THREE, scene, typeKey, colorHex, livery) {
  const mesh = createCarMesh(THREE, typeKey, colorHex, livery);
  scene.add(mesh);
  return {
    mesh, type: typeKey, spec: CAR_TYPES[typeKey],
    heading: 0, speed: 0, mode: 'parked', radius: 2.25,
    wp: 0, loop: null, cruise: 10, steerVis: 0, dead: false,
    get pos() { return mesh.position; },
  };
}

// The living fleet: traffic looping the blocks, parked cars at the kerbs.
export function createFleet(THREE, scene) {
  const rng = makeRng(777);
  const traffic = [], parked = [], all = [];
  for (let i = 0; i < 20; i++) {
    const type = randPick(rng, TYPE_KEYS);
    const car = makeCar(THREE, scene, type, type === 'taxi' ? 0xffc61a : randPick(rng, PAINTS), type === 'taxi' ? 'taxi' : null);
    const bx = randPick(rng, LAYOUT.cols), bz = randPick(rng, LAYOUT.rows);
    const dirn = rng() < 0.5 ? 1 : -1, half = dirn > 0 ? 42.2 : 33.8;
    car.loop = { cx: bx, cz: bz, half, dir: dirn };
    car.wp = Math.floor(rng() * 4);
    car.cruise = randRange(rng, 8.5, 13);
    const corner = loopPoint(car.loop, car.wp);
    car.pos.set(corner.x, 0, corner.z);
    car.heading = rng() * Math.PI * 2;
    car.mode = 'traffic';
    traffic.push(car); all.push(car);
  }
  for (let i = 0; i < 30; i++) {
    const type = randPick(rng, TYPE_KEYS);
    const car = makeCar(THREE, scene, type, randPick(rng, PAINTS), null);
    if (rng() < 0.55) {
      const rx = randPick(rng, LAYOUT.vRoads.slice(1, -1));
      car.pos.set(rx + (rng() < 0.5 ? -6.6 : 6.6), 0, randRange(rng, -185, 185));
      car.heading = rng() < 0.5 ? 0 : Math.PI;
    } else {
      const rz = randPick(rng, LAYOUT.hRoads.slice(1, -1));
      car.pos.set(randRange(rng, -232, 232), 0, rz + (rng() < 0.5 ? -6.6 : 6.6));
      car.heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.mesh.rotation.y = car.heading;
    parked.push(car); all.push(car);
  }
  return { traffic, parked, all, spawnOne: (type, color, livery) => {
    const car = makeCar(THREE, scene, type, color, livery); all.push(car); return car;
  } };
}

function loopPoint(loop, idx) {
  const { cx, cz, half, dir } = loop;
  const corners = [
    { x: cx - half, z: cz - half }, { x: cx + half, z: cz - half },
    { x: cx + half, z: cz + half }, { x: cx - half, z: cz + half },
  ];
  return corners[((idx % 4) + 4) % 4];
}

// Traffic driving: follow the block loop, brake for anything ahead.
export function updateTrafficCar(dt, car, obstacles) {
  if (car.mode !== 'traffic') return;
  const target = loopPoint(car.loop, car.wp + (car.loop.dir > 0 ? 1 : 0));
  const dx = target.x - car.pos.x, dz = target.z - car.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 7) car.wp = (car.wp + car.loop.dir + 4) % 4;
  const want = headingOf(dx, dz);
  let speedTarget = car.cruise;
  if (dist < 16) speedTarget = Math.min(speedTarget, 5.5);
  // Something ahead? Stop behind it.
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  for (const o of obstacles) {
    if (o === car) continue;
    const ox = o.pos.x - car.pos.x, oz = o.pos.z - car.pos.z;
    const ahead = ox * fx + oz * fz, side = Math.abs(ox * fz - oz * fx);
    if (ahead > 0 && ahead < 8.5 && side < 2.1) { speedTarget = 0; break; }
  }
  car.speed += Math.sign(speedTarget - car.speed) * Math.min(Math.abs(speedTarget - car.speed), 9 * dt);
  car.heading = angleTowards(car.heading, want, dt * (car.speed > 1 ? 1.5 : 2.4));
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  syncCarMesh(car, dt);
}

export function syncCarMesh(car, dt) {
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * dt * 2.6;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
}

// The driving model for whoever holds the wheel (player or police AI sets
// the same inputs). Returns the impact speed when a crash happens.
export function driveCar(dt, car, input, colliders, others) {
  const spec = car.spec;
  const accel = input.throttle > 0 ? spec.accel : input.throttle < 0 ? -spec.accel * 0.7 : 0;
  car.speed += accel * dt * (input.throttle > 0 ? 1 : 1);
  // Rolling drag and brakes.
  const drag = input.brake ? 26 : 2.2;
  if (!input.throttle) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), drag * dt);
  if (input.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
  car.speed = Math.max(-11, Math.min(spec.top, car.speed));
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 7) * (input.handbrake ? 1.5 : 1);
  car.heading += input.steer * steerAuthority * dt * 1.65 * (car.speed < 0 ? -1 : 1);
  car.steerVis = input.steer * 0.42;
  for (const w of car.mesh.userData.frontWheels) w.rotation.y = car.steerVis;
  const before = { x: car.pos.x, z: car.pos.z };
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  car.pos.x = Math.max(LAYOUT.land.minX - 6, Math.min(LAYOUT.land.maxX + 6, car.pos.x));
  car.pos.z = Math.max(LAYOUT.land.minZ - 6, Math.min(306, car.pos.z));
  let impact = 0;
  if (resolveCircleColliders(car.pos, car.radius, colliders.boxes, colliders.circles)) {
    impact = Math.abs(car.speed);
    car.speed *= -0.25;
  }
  // Car-to-car bumps.
  for (const o of others) {
    if (o === car || o.dead) continue;
    const dx = car.pos.x - o.pos.x, dz = car.pos.z - o.pos.z;
    const rr = car.radius + o.radius, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 0.01) {
      const d = Math.sqrt(d2), push = (rr - d) / 2;
      car.pos.x += (dx / d) * push; car.pos.z += (dz / d) * push;
      if (o.mode !== 'player') { o.pos.x -= (dx / d) * push * 0.5; o.pos.z -= (dz / d) * push * 0.5; }
      impact = Math.max(impact, Math.abs(car.speed) * 0.8);
      car.speed *= 0.55;
      if (o.mode === 'traffic') o.speed = Math.min(o.speed, 2);
    }
  }
  if (impact > 4 && Math.hypot(car.pos.x - before.x, car.pos.z - before.z) < 0.05) impact = Math.abs(car.speed);
  syncCarMesh(car, dt);
  return impact;
}

export function nearestCar(cars, pos, maxDist) {
  let best = null, bd = maxDist;
  for (const c of cars) {
    if (c.dead) continue;
    const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
