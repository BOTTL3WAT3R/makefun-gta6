// vehicles.js — car meshes (merged boxes, vertex-colored), the traffic
// system that keeps Costa Vera's roads alive, parked cars, the arcade
// driving physics used by the player, traffic and police alike, and the
// damage-smoke puffs that trail wounded cars.

import * as THREE from 'three';
import { mergeParts, partBox, partCyl, AVENUES_X, STREETS_Z } from './world.js';
import { clamp, angleLerp, dist2d, collideCircle, pick, rand } from './util.js';

export const CAR_TYPES = {
  sedan:  { name: 'Brisas Sedan',   topSpeed: 34, accel: 11.5, brake: 22, turn: 1.9, colors: [0xc0c6cc, 0x7a4a8c, 0x2e6f8e, 0xb03a2e, 0x3f7a4e, 0xe0d6c2] },
  taxi:   { name: 'Taxi Sol',       topSpeed: 33, accel: 11,   brake: 22, turn: 1.9, colors: [0xffc21c] },
  sport:  { name: 'Tormenta GT',    topSpeed: 49, accel: 17,   brake: 26, turn: 2.3, colors: [0xd4af37, 0xc22430, 0x2255c2, 0x15151a, 0xe8641c] },
  van:    { name: 'Carga Van',      topSpeed: 27, accel: 9,    brake: 20, turn: 1.6, colors: [0xd8d8d2, 0x5e7a8a, 0x8a5e3a] },
  pickup: { name: 'Costa Pickup',   topSpeed: 31, accel: 10.5, brake: 21, turn: 1.75, colors: [0xb0563a, 0x4a6e8a, 0x6e7a4a, 0xd8cfc0] },
  police: { name: 'Patrulla del Sol', topSpeed: 44, accel: 15.5, brake: 26, turn: 2.1, colors: [0xf2f2ee] },
};
const paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.38 });
const darkMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.55 });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff3c0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xd42430 });
const shadeOf = hex => new THREE.Color(hex).multiplyScalar(0.8).getHex();

export function makeCarMesh(type, colorHex) {
  const paint = [], dark = [], glow = [], tail = [];
  const P = (w, h, d, x, y, z, c, rx = 0) => paint.push(partBox(w, h, d, x, y, z, c, 0, rx));
  const D = (w, h, d, x, y, z, c = 0x14161c, rx = 0) => dark.push(partBox(w, h, d, x, y, z, c, 0, rx));
  const wheel = (x, z, r) => {
    dark.push(partCyl(r, r, 0.26, x, r, z, 0x17181c, 10, 0, Math.PI / 2));
    glow.push(partCyl(r * 0.45, r * 0.45, 0.28, x, r, z, 0x8a8f96, 8, 0, Math.PI / 2)); // hubcap
  };
  const mirrors = () => { D(0.1, 0.12, 0.2, -1.0, 1.06, 0.72); D(0.1, 0.12, 0.2, 1.0, 1.06, 0.72); };
  if (type === 'van') {
    P(2.0, 1.45, 4.7, 0, 1.18, 0, colorHex);
    D(1.9, 0.62, 0.9, 0, 1.32, 2.0);                       // windshield block
    D(2.02, 0.3, 4.72, 0, 0.42, 0, 0x2a2d33);              // lower trim
    P(2.02, 0.34, 2.2, 0, 1.05, -0.9, shadeOf(colorHex));  // side panel band
    wheel(-0.95, 1.5, 0.4); wheel(0.95, 1.5, 0.4); wheel(-0.95, -1.5, 0.4); wheel(0.95, -1.5, 0.4);
  } else if (type === 'sport') {
    P(1.92, 0.4, 4.55, 0, 0.48, 0, colorHex);
    P(1.7, 0.3, 1.5, 0, 0.62, 1.35, colorHex, -0.16);      // sloping nose
    D(1.5, 0.4, 1.65, 0, 0.86, -0.35);                     // glasshouse
    P(0.5, 0.05, 3.6, 0, 0.72, 0.1, shadeOf(colorHex));    // centre stripe
    P(1.86, 0.07, 0.42, 0, 1.0, -2.2, colorHex);           // spoiler blade
    P(0.08, 0.24, 0.3, -0.7, 0.82, -2.2, colorHex); P(0.08, 0.24, 0.3, 0.7, 0.82, -2.2, colorHex);
    D(0.16, 0.12, 0.3, -0.5, 0.3, -2.3, 0x3a3f45); D(0.16, 0.12, 0.3, 0.5, 0.3, -2.3, 0x3a3f45); // exhausts
    wheel(-0.88, 1.42, 0.37); wheel(0.88, 1.42, 0.37); wheel(-0.88, -1.42, 0.37); wheel(0.88, -1.42, 0.37);
    mirrors();
  } else if (type === 'pickup') {
    P(1.95, 0.62, 4.6, 0, 0.62, 0, colorHex);
    D(1.7, 0.55, 1.3, 0, 1.18, 1.15);                      // cab glass
    P(1.95, 0.5, 1.5, 0, 1.05, 1.15, shadeOf(colorHex));   // cab roof band behind glass
    P(0.12, 0.42, 1.9, -0.92, 0.98, -1.25, shadeOf(colorHex)); P(0.12, 0.42, 1.9, 0.92, 0.98, -1.25, shadeOf(colorHex)); // bed walls
    P(1.95, 0.42, 0.12, 0, 0.98, -2.18, shadeOf(colorHex)); // tailgate
    wheel(-0.92, 1.5, 0.42); wheel(0.92, 1.5, 0.42); wheel(-0.92, -1.5, 0.42); wheel(0.92, -1.5, 0.42);
    mirrors();
  } else { // sedan / taxi / police share a silhouette
    P(1.82, 0.55, 4.35, 0, 0.58, 0, colorHex);
    P(1.7, 0.34, 1.1, 0, 0.72, 1.72, colorHex, -0.1);      // hood slope
    D(1.58, 0.5, 1.95, 0, 1.06, -0.25);                    // glasshouse
    P(1.6, 0.06, 2.0, 0, 1.34, -0.25, shadeOf(colorHex));  // roof panel
    D(1.84, 0.22, 0.3, 0, 0.4, 2.12, 0x23252b); D(1.84, 0.22, 0.3, 0, 0.4, -2.12, 0x23252b);
    wheel(-0.84, 1.38, 0.35); wheel(0.84, 1.38, 0.35); wheel(-0.84, -1.38, 0.35); wheel(0.84, -1.38, 0.35);
    mirrors();
    if (type === 'taxi') glow.push(partBox(0.72, 0.2, 0.34, 0, 1.48, -0.25, 0xffd94d));
    if (type === 'police') {
      D(1.84, 0.5, 1.2, 0, 0.6, 1.55, 0x1c1e26);           // black hood panel
      P(0.06, 0.34, 1.7, -0.93, 0.62, 0, 0x2255c2); P(0.06, 0.34, 1.7, 0.93, 0.62, 0, 0x2255c2); // door stripes
    }
  }
  glow.push(partBox(0.34, 0.13, 0.07, -0.58, 0.62, 2.19, 0xfff3c0));
  glow.push(partBox(0.34, 0.13, 0.07, 0.58, 0.62, 2.19, 0xfff3c0));
  tail.push(partBox(0.36, 0.12, 0.07, -0.58, 0.66, -2.19, 0xd42430));
  tail.push(partBox(0.36, 0.12, 0.07, 0.58, 0.66, -2.19, 0xd42430));
  const group = new THREE.Group();
  const body = new THREE.Mesh(mergeParts(paint), paintMat); body.castShadow = true;
  const trim = new THREE.Mesh(mergeParts(dark), darkMat);
  const lights = new THREE.Mesh(mergeParts(glow), lightMat);
  const tails = new THREE.Mesh(mergeParts(tail), tailMat);
  group.add(body, trim, lights, tails);
  if (type === 'police') {
    const barL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2a30 }));
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.42), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    barL.position.set(-0.3, 1.46, -0.25); barR.position.set(0.3, 1.46, -0.25);
    group.add(barL, barR); group.userData.barL = barL; group.userData.barR = barR;
  }
  return group;
}

let carSeq = 0;
export function makeCar(type, x, z, angle, driver, colorHex) {
  const spec = CAR_TYPES[type];
  const color = colorHex !== undefined ? colorHex : pick(spec.colors);
  const mesh = makeCarMesh(type, color);
  mesh.position.set(x, 0, z); mesh.rotation.y = angle;
  return {
    id: carSeq++, type, spec, color, mesh, x, z, angle, speed: 0,
    health: 100, driver, radius: 1.75, dead: false, smokeT: rand(0, 0.3),
    cruise: rand(0.44, 0.6),
    road: null, target: null, stuckT: 0, honkT: rand(4, 14),
  };
}

// ---- damage smoke: a small pool of soft sprites that wounded cars trail ----
export class SmokeSystem {
  constructor(scene) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(70,66,70,0.55)'); g.addColorStop(1, 'rgba(70,66,70,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    this.pool = [];
    for (let i = 0; i < 42; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false; scene.add(s);
      this.pool.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
    }
    this.idx = 0;
  }
  emit(x, y, z, dark) {
    const p = this.pool[this.idx++ % this.pool.length];
    p.s.position.set(x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3));
    p.s.material.opacity = dark ? 0.75 : 0.5;
    p.s.scale.setScalar(rand(0.7, 1.1));
    p.s.visible = true;
    p.max = p.life = rand(0.7, 1.2);
    p.vx = rand(-0.4, 0.4); p.vy = rand(1.6, 2.6); p.vz = rand(-0.4, 0.4);
  }
  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = p.life / p.max;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.s.scale.setScalar(1 + (1 - k) * 2.4);
      p.s.material.opacity = Math.min(p.s.material.opacity, k * 0.75);
    }
  }
}

// ---- traffic routing on the grid ----
const laneOffset = (axis, dir) => axis === 'z' ? (dir > 0 ? -4 : 4) : (dir > 0 ? 4 : -4);
export function placeOnRoad(car, x, z) {
  // Snap a car onto the nearest road with a heading along it.
  let best = null;
  for (const ax of AVENUES_X) { const d = Math.abs(x - ax); if (!best || d < best.d) best = { d, axis: 'z', fixed: ax }; }
  for (const sz of STREETS_Z) { const d = Math.abs(z - sz); if (!best || d < best.d) best = { d, axis: 'x', fixed: sz }; }
  car.road = { axis: best.axis, fixed: best.fixed };
  car.dir = Math.random() < 0.5 ? 1 : -1;
  if (best.axis === 'z') { car.x = best.fixed + laneOffset('z', car.dir); car.z = z; car.angle = car.dir > 0 ? 0 : Math.PI; }
  else { car.z = best.fixed + laneOffset('x', car.dir); car.x = x; car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
  nextTarget(car, true);
}
function nextTarget(car, first = false) {
  const cross = car.road.axis === 'z' ? STREETS_Z : AVENUES_X;
  const pos = car.road.axis === 'z' ? car.z : car.x;
  const ahead = cross.filter(c => (c - pos) * car.dir > (first ? -4 : 4));
  const sorted = ahead.sort((a, b) => Math.abs(a - pos) - Math.abs(b - pos));
  let junction = sorted.length ? sorted[0] : pos + car.dir * 60;
  if (!first && Math.random() < 0.45 && sorted.length > 1) junction = sorted[0];
  car.junction = junction;
  if (car.road.axis === 'z') car.target = { x: car.road.fixed + laneOffset('z', car.dir), z: junction };
  else car.target = { x: junction, z: car.road.fixed + laneOffset('x', car.dir) };
}
function arriveAtJunction(car) {
  const r = Math.random();
  if (r < 0.42) { // turn onto the crossing road
    const old = car.road;
    car.road = { axis: old.axis === 'z' ? 'x' : 'z', fixed: car.junction };
    car.dir = Math.random() < 0.5 ? 1 : -1;
    if (car.road.axis === 'x') car.target = { x: car.x + car.dir * 40, z: car.road.fixed + laneOffset('x', car.dir) };
    else car.target = { x: car.road.fixed + laneOffset('z', car.dir), z: car.z + car.dir * 40 };
    nextTarget(car);
  } else nextTarget(car);
}

export class TrafficSystem {
  constructor(scene, world, parkedSpots) {
    this.cars = [];
    this.scene = scene;
    this.smoke = new SmokeSystem(scene);
    const types = ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'sport', 'pickup'];
    for (let i = 0; i < 20; i++) {
      const car = makeCar(pick(types), rand(-230, 230), rand(-200, 150), 0, 'traffic');
      placeOnRoad(car, car.x, car.z);
      scene.add(car.mesh); this.cars.push(car);
    }
    const spots = [...parkedSpots].sort(() => Math.random() - 0.5).slice(0, 30);
    for (const s of spots) {
      const car = makeCar(pick(['sedan', 'sedan', 'van', 'sport', 'taxi', 'pickup']), s.x, s.z, s.angle, 'parked');
      scene.add(car.mesh); this.cars.push(car);
    }
    this.world = world;
  }
  addCar(scene, car) { scene.add(car.mesh); this.cars.push(car); return car; }
  removeCar(scene, car) {
    scene.remove(car.mesh);
    this.cars.splice(this.cars.indexOf(car), 1);
  }
  step(dt, G) {
    const px = G.player.x, pz = G.player.z;
    // Wounded cars smoke, whoever drives them; wrecks smoke darker.
    for (const car of G.allCars) {
      if (car.health >= 45 && !car.dead) continue;
      car.smokeT -= dt;
      if (car.smokeT <= 0) {
        car.smokeT = car.dead ? 0.22 : 0.34;
        this.smoke.emit(car.x, 1.1, car.z, car.dead);
      }
    }
    this.smoke.update(dt);
    for (const car of this.cars) {
      if (car.driver === 'parked' || car.dead) { syncMesh(car); continue; }
      if (car.driver !== 'traffic') continue;
      const dPlayer = dist2d(car.x, car.z, px, pz);
      if (dPlayer > 330) { // recycle far traffic to ring the player
        placeOnRoad(car, px + rand(-190, 190), pz + rand(-190, 190));
      }
      // obstacle scan: anything solid ahead?
      const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
      let blocked = false;
      for (const other of G.allCars) {
        if (other === car) continue;
        const dx = other.x - car.x, dz = other.z - car.z;
        const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 10 && side < 2.4) { blocked = true; break; }
      }
      if (!blocked && !G.player.onFoot && G.player.car) {
        const dx = G.player.car.x - car.x, dz = G.player.car.z - car.z;
        const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 10 && side < 2.4) blocked = true;
      }
      if (!blocked && G.player.onFoot && dPlayer < 9) {
        const dx = px - car.x, dz = pz - car.z;
        if (dx * fx + dz * fz > 0) blocked = true;
      }
      if (!blocked) { // brake for pedestrians in the road ahead
        for (const ped of G.people.peds) {
          if (ped.state === 'down' || ped.state === 'ride') continue;
          const dx = ped.x - car.x, dz = ped.z - car.z;
          const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
          if (ahead > 0 && ahead < 7.5 && side < 2) { blocked = true; break; }
        }
      }
      const want = blocked ? 0 : car.spec.topSpeed * car.cruise;
      car.speed = approach(car.speed, want, (blocked ? car.spec.brake : car.spec.accel * 0.6) * dt);
      const t = car.target;
      const desired = Math.atan2(t.x - car.x, t.z - car.z);
      car.angle = angleLerp(car.angle, desired, clamp(dt * 2.2, 0, 1));
      moveCar(car, dt, this.world.colliders);
      if (dist2d(car.x, car.z, t.x, t.z) < 7) arriveAtJunction(car);
      car.honkT -= dt;
      if (blocked && car.honkT < 0) { car.honkT = rand(5, 12); G.audio.blip(392, 0.16, 0.05, 'square'); }
      syncMesh(car);
    }
  }
}

export function approach(v, target, step) {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}
export function moveCar(car, dt, colliders) {
  car.x += Math.sin(car.angle) * car.speed * dt;
  car.z += Math.cos(car.angle) * car.speed * dt;
  const [nx, nz] = collideCircle(car.x, car.z, car.radius, colliders);
  if (nx !== car.x || nz !== car.z) { car.hitWall = Math.abs(car.speed); car.speed *= 0.55; }
  car.x = clamp(nx, -254, 254); car.z = clamp(nz, -216, 214);
}
export function syncMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
}

// Player / AI free driving (police reuse the steering in police.js).
export function stepDrive(car, throttle, steer, handbrake, dt, colliders) {
  const spec = car.spec;
  if (car.dead) { car.speed = approach(car.speed, 0, 14 * dt); moveCar(car, dt, colliders); syncMesh(car); return; }
  if (throttle > 0) car.speed += spec.accel * (1 - Math.abs(car.speed) / spec.topSpeed * 0.45) * throttle * dt * (car.speed < 0 ? 2.2 : 1);
  else if (throttle < 0) car.speed -= (car.speed > 0.5 ? spec.brake : spec.accel * 0.55) * dt;
  else car.speed = approach(car.speed, 0, 2.2 * dt);
  if (handbrake) car.speed = approach(car.speed, 0, 16 * dt);
  car.speed = clamp(car.speed, -13, spec.topSpeed);
  const steerAuthority = clamp(Math.abs(car.speed) / 9, 0, 1) * (handbrake ? 1.5 : 1);
  car.angle += steer * spec.turn * steerAuthority * dt * (car.speed < 0 ? -1 : 1);
  moveCar(car, dt, colliders);
  syncMesh(car);
}

// Circle collisions between every pair of cars; returns impact events.
export function stepCarCollisions(cars, onImpact) {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz), min = a.radius + b.radius;
    if (d === 0 || d >= min) continue;
    const push = (min - d) / 2, ux = dx / d, uz = dz / d;
    a.x -= ux * push; a.z -= uz * push; b.x += ux * push; b.z += uz * push;
    const rel = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3;
    if (rel > 3.5) {
      const dmg = (rel - 3) * 2.4;
      a.health -= dmg * 0.7; b.health -= dmg * 0.7;
      a.speed *= 0.72; b.speed *= 0.72;
      onImpact(a, b, rel);
    }
    syncMesh(a); syncMesh(b);
  }
}
