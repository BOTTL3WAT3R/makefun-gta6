// vehicles.js — Costa Vera's six stealable vehicle types, their low-poly
// bodies, arcade driving physics, and the traffic brain that cruises the
// avenue grid, brakes for obstacles and turns at intersections.

import * as THREE from 'three';
import { clamp, lerp, turnToward, angleDelta, makeRng } from './util.js';
import { AVENUES, WORLD_BOUND } from './world.js';

export const VEHICLE_TYPES = [
  { id: 'veloz', name: 'Veloz GT', topSpeed: 39, accel: 17, turn: 2.0, w: 1.9, l: 4.3, h: 0.62, cabin: 0.5, colors: [0xd8402e, 0x2e7ad8, 0xf2b134, 0x30b06a, 0xe8e8f0] },
  { id: 'palmera', name: 'Palmera Cabrio', topSpeed: 31, accel: 12.5, turn: 1.9, w: 1.9, l: 4.2, h: 0.66, cabin: 0.34, colors: [0xff8fb3, 0x7ad0e8, 0xf6e3b4, 0xb8e986] },
  { id: 'andante', name: 'Andante Sedan', topSpeed: 27, accel: 10.5, turn: 1.7, w: 1.9, l: 4.5, h: 0.7, cabin: 0.55, colors: [0x9aa5b1, 0x44546a, 0x7a4a3a, 0xd8d8d8, 0x3a6ea5] },
  { id: 'taxi', name: 'Taxímetro', topSpeed: 27, accel: 11, turn: 1.7, w: 1.9, l: 4.5, h: 0.7, cabin: 0.55, colors: [0xf7b500] },
  { id: 'carguera', name: 'Carguera Van', topSpeed: 22, accel: 8.5, turn: 1.4, w: 2.1, l: 5.0, h: 1.15, cabin: 0.75, colors: [0xe8e4da, 0x88a0b8, 0xc96f4a] },
  { id: 'ranchera', name: 'Ranchera Pickup', topSpeed: 25, accel: 9.5, turn: 1.6, w: 2.0, l: 4.8, h: 0.78, cabin: 0.6, colors: [0x707a68, 0xa03d2d, 0x2d5a7a, 0xd8cfc0] },
];

const rng = makeRng(987123);

export function makeVehicleMesh(type, color, opts = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2f42 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x17181c });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xb9c2cc });

  const body = new THREE.Mesh(new THREE.BoxGeometry(type.w, type.h, type.l), paint);
  body.position.y = 0.35 + type.h / 2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(type.w * 0.94, type.h * 0.55, 0.5), paint);
  nose.position.set(0, 0.35 + type.h * 0.4, type.l / 2 + 0.1);
  g.add(nose);

  if (type.id === 'carguera') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(type.w, 1.1, type.l * 0.55), paint);
    box.position.set(0, 0.35 + type.h + 0.4, -type.l * 0.18);
    g.add(box);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(type.w * 0.9, 0.62, 0.1), glass);
    shield.position.set(0, 0.35 + type.h + 0.25, type.l * 0.22);
    g.add(shield);
  } else if (type.id === 'ranchera') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(type.w * 0.92, type.cabin, 1.5), paint);
    cab.position.set(0, 0.35 + type.h + type.cabin / 2, type.l * 0.16);
    g.add(cab);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(type.w * 0.84, type.cabin * 0.7, 0.08), glass);
    shield.position.set(0, 0.35 + type.h + type.cabin / 2, type.l * 0.16 + 0.78);
    g.add(shield);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(type.w * 0.94, 0.28, type.l * 0.42), dark);
    bed.position.set(0, 0.35 + type.h + 0.05, -type.l * 0.27);
    g.add(bed);
  } else {
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(type.w * 0.86, type.cabin, type.l * 0.46),
      type.id === 'palmera' ? dark : paint
    );
    cab.position.set(0, 0.35 + type.h + type.cabin / 2, -type.l * 0.04);
    g.add(cab);
    if (type.id !== 'palmera') {
      const shield = new THREE.Mesh(new THREE.BoxGeometry(type.w * 0.8, type.cabin * 0.72, 0.08), glass);
      shield.position.set(0, 0.35 + type.h + type.cabin / 2, type.l * 0.19);
      g.add(shield);
      const rear = shield.clone();
      rear.position.z = -type.l * 0.27;
      g.add(rear);
    }
  }

  const lightGeo = new THREE.BoxGeometry(0.34, 0.14, 0.06);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(lightGeo, headMat);
    hl.position.set(sx * type.w * 0.32, 0.35 + type.h * 0.55, type.l / 2 + 0.36);
    g.add(hl);
    const tl = new THREE.Mesh(lightGeo, tailMat);
    tl.position.set(sx * type.w * 0.32, 0.35 + type.h * 0.6, -type.l / 2 - 0.03);
    g.add(tl);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.14), chrome);
    bumper.position.set(sx * type.w * 0.28, 0.32, type.l / 2 + 0.3);
    g.add(bumper);
  }

  if (opts.taxi) {
    const signMat = new THREE.MeshBasicMaterial({ color: 0xffe27a });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.3), signMat);
    sign.position.set(0, 0.35 + type.h + type.cabin + 0.12, -type.l * 0.04);
    g.add(sign);
  }
  if (opts.police) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(type.w + 0.04, 0.3, type.l * 0.98),
      new THREE.MeshLambertMaterial({ color: 0x1d4e9e })
    );
    stripe.position.y = 0.35 + type.h * 0.52;
    g.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.x = 0.3;
    bar.add(red);
    bar.add(blue);
    bar.position.set(0, 0.35 + type.h + type.cabin + 0.1, -type.l * 0.04);
    g.add(bar);
    g.userData.lightbar = { red, blue };
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x101114 });
  const wheels = [];
  const wheelPivots = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (type.w / 2 - 0.05), 0.36, sz * (type.l / 2 - 0.85));
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    pivot.add(wheel);
    g.add(pivot);
    wheels.push(wheel);
    wheelPivots.push(pivot);
  }
  g.userData.wheels = wheels;
  g.userData.pivots = wheelPivots;
  return g;
}

let vehicleSeq = 0;

export class Vehicle {
  constructor(scene, type, x, z, heading, opts = {}) {
    this.id = ++vehicleSeq;
    this.type = type;
    this.color = opts.color !== undefined ? opts.color : type.colors[Math.floor(rng() * type.colors.length)];
    this.mesh = makeVehicleMesh(type, this.color, opts);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.driver = opts.driver || null; // 'player' | 'traffic' | 'police' | 'racer' | null (parked)
    this.occupied = !!opts.occupied;
    this.dead = false;
    this.brain = { avenue: null, dir: 1, axis: 'z', nextTurn: 0, wait: 0 };
    this.smoke = null;
    this.wheelSpin = 0;
  }

  get pos() {
    return this.mesh.position;
  }

  radius() {
    return this.type.l * 0.42;
  }

  // Arcade drive step. ctl: { throttle: -1..1, steer: -1..1, handbrake: bool }
  drive(dt, ctl) {
    const t = this.type;
    const accel = ctl.throttle > 0 ? t.accel : t.accel * 0.62;
    if (ctl.throttle !== 0) {
      this.speed += ctl.throttle * accel * dt;
    }
    const drag = ctl.handbrake ? 3.2 : 0.35;
    this.speed -= this.speed * drag * dt;
    if (!ctl.throttle && Math.abs(this.speed) < 0.25) this.speed = 0;
    const maxRev = t.topSpeed * 0.42;
    this.speed = clamp(this.speed, -maxRev, t.topSpeed);
    this.steer = lerp(this.steer, ctl.steer, 1 - Math.exp(-10 * dt));
    const speedRatio = clamp(Math.abs(this.speed) / 9, 0, 1);
    if (Math.abs(this.speed) > 0.05) {
      this.heading += this.steer * t.turn * speedRatio * dt * Math.sign(this.speed) * clamp(Math.abs(this.speed) / t.topSpeed + 0.35, 0, 1);
    }
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    this.x += fx * this.speed * dt;
    this.z += fz * this.speed * dt;
    this.syncMesh(dt);
  }

  syncMesh(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.wheelSpin += (this.speed * (dt || 0)) / 0.36;
    const wheels = this.mesh.userData.wheels;
    for (const w of wheels) w.rotation.x = this.wheelSpin;
    const pivots = this.mesh.userData.pivots;
    pivots[0].rotation.y = this.steer * 0.42;
    pivots[1].rotation.y = this.steer * 0.42;
    // Body roll and pitch sell the speed.
    this.mesh.rotation.z = -this.steer * clamp(Math.abs(this.speed) / this.type.topSpeed, 0, 1) * 0.045;
    this.mesh.rotation.x = clamp(-this.speed * 0.0012, -0.03, 0.03);
  }

  // Traffic: cruise the grid, right-hand lanes, turn at intersections.
  trafficDrive(dt, obstacles) {
    const b = this.brain;
    if (b.wait > 0) {
      b.wait -= dt;
      this.drive(dt, { throttle: 0, steer: 0, handbrake: true });
      return;
    }
    // Find how far ahead the way is clear.
    let clear = 16;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    for (const o of obstacles) {
      if (o === this) continue;
      const dx = o.x - this.x;
      const dz = o.z - this.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < clear && side < 2.4) clear = ahead;
    }
    // Steering: aim at a point 18 m ahead in the travel direction, pulled
    // toward the right-hand lane centre line of the current avenue.
    let aimX;
    let aimZ;
    if (b.axis === 'z') {
      aimX = b.avenue + laneOffsetX(b.dir);
      aimZ = this.z + b.dir * 18;
    } else {
      aimX = this.x + b.dir * 18;
      aimZ = b.avenue + laneOffsetZ(b.dir);
    }
    // Near an intersection, maybe pick a new avenue/direction.
    const cross = nearestAvenue(b.axis === 'z' ? this.z : this.x, b.dir);
    const distCross = Math.abs(cross - (b.axis === 'z' ? this.z : this.x));
    if (distCross < 3 && b.nextTurn <= 0) {
      b.nextTurn = 26;
      const roll = rng();
      const atEdge = Math.abs(cross) >= 165;
      if (roll < 0.42 || atEdge) {
        // Turn onto the crossing avenue.
        const newAxis = b.axis === 'z' ? 'x' : 'z';
        const newAvenue = cross;
        let newDir = rng() < 0.5 ? 1 : -1;
        // Do not turn off the south edge into the sea.
        if (newAxis === 'z' && newAvenue >= 165 && newDir > 0) newDir = -1;
        b.axis = newAxis;
        b.avenue = newAvenue;
        b.dir = newDir;
      }
    }
    if (b.nextTurn > 0) b.nextTurn -= Math.abs(this.speed) * dt;
    const targetHeading = Math.atan2(aimX - this.x, aimZ - this.z);
    const steer = clamp(angleDelta(this.heading, targetHeading) * 2.2, -1, 1);
    const wantSpeed = clear < 7 ? 0 : clear < 12 ? 6 : 12.5;
    const throttle = this.speed < wantSpeed ? 0.75 : this.speed > wantSpeed + 2 ? -0.5 : 0;
    this.drive(dt, { throttle, steer, handbrake: clear < 4.5 });
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.dead = true;
  }
}

function laneOffsetX(dir) {
  // Travelling along z: right-hand lane sits at avenue - 4.5 when heading
  // south (+z) and avenue + 4.5 when heading north.
  return dir > 0 ? -4.5 : 4.5;
}

function laneOffsetZ(dir) {
  // Travelling along x: right-hand lane sits at avenue + 4.5 heading east.
  return dir > 0 ? 4.5 : -4.5;
}

function nearestAvenue(v, dir) {
  let best = AVENUES[0];
  let bestD = Infinity;
  for (const a of AVENUES) {
    const d = (a - v) * dir;
    if (d > -2 && d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

export function spawnTraffic(scene, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const type = VEHICLE_TYPES[Math.floor(rng() * VEHICLE_TYPES.length)];
    const axis = rng() < 0.5 ? 'z' : 'x';
    const avenue = AVENUES[Math.floor(rng() * AVENUES.length)];
    const dir = rng() < 0.5 ? 1 : -1;
    const along = -240 + rng() * 460;
    let x;
    let z;
    let heading;
    if (axis === 'z') {
      x = avenue + laneOffsetX(dir);
      z = along;
      heading = dir > 0 ? 0 : Math.PI;
    } else {
      x = along;
      z = avenue + laneOffsetZ(dir);
      heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (z > 175) z = 175 - rng() * 60;
    const car = new Vehicle(scene, type, x, z, heading, { driver: 'traffic', occupied: true });
    car.brain.axis = axis;
    car.brain.avenue = avenue;
    car.brain.dir = dir;
    cars.push(car);
  }
  return cars;
}

export function spawnParked(scene, spots) {
  const cars = [];
  for (const s of spots) {
    const type = VEHICLE_TYPES[Math.floor(rng() * VEHICLE_TYPES.length)];
    const car = new Vehicle(scene, type, s.x, s.z, s.heading, { driver: null, color: s.color });
    cars.push(car);
  }
  return cars;
}

export { turnToward, WORLD_BOUND };
