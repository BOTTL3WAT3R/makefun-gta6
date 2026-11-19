// people.js — the low-poly citizens of Costa Vera: a shared character
// factory with swinging limbs, the player character's look, Pilar Duarte's
// distinctive outfit, and the pedestrian crowd that strolls the sidewalks,
// the plaza and the boardwalk.

import * as THREE from 'three';
import { clamp, makeRng, resolveCollisions, dist2d } from './util.js';
import { AVENUES } from './world.js';

const SKIN = [0xf2c79b, 0xc98a5a, 0x8a5a34, 0x6e4226, 0xffe0bd];
const SHIRT = [0xe84a5f, 0x2a9d8f, 0xf4a259, 0x577590, 0xf2e8cf, 0xbc4b51, 0x43aa8b, 0xf9c74f];
const PANTS = [0x2b2d42, 0x5a4a3a, 0x3a5a80, 0x707a68, 0xe8e0d0, 0x8c5a2b];

const rng = makeRng(4451);

export function makePersonMesh(opts = {}) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: opts.skin !== undefined ? opts.skin : SKIN[Math.floor(rng() * SKIN.length)] });
  const shirt = new THREE.MeshLambertMaterial({ color: opts.shirt !== undefined ? opts.shirt : SHIRT[Math.floor(rng() * SHIRT.length)] });
  const pants = new THREE.MeshLambertMaterial({ color: opts.pants !== undefined ? opts.pants : PANTS[Math.floor(rng() * PANTS.length)] });
  const hair = new THREE.MeshLambertMaterial({ color: opts.hair !== undefined ? opts.hair : [0x2b2118, 0x4a3220, 0x8a6a42, 0xd8cfc0, 0xb03a2e][Math.floor(rng() * 5)] });

  const legGeo = new THREE.BoxGeometry(0.17, 0.82, 0.2);
  legGeo.translate(0, -0.41, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.11, 0.82, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.11, 0.82, 0);
  g.add(legL);
  g.add(legR);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.28), shirt);
  torso.position.y = 1.15;
  g.add(torso);

  const armGeo = new THREE.BoxGeometry(0.13, 0.62, 0.15);
  armGeo.translate(0, -0.28, 0);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.34, 1.44, 0);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.34, 1.44, 0);
  g.add(armL);
  g.add(armR);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), skin);
  head.position.y = 1.68;
  g.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.12, 0.33), hair);
  hairTop.position.y = 1.88;
  g.add(hairTop);
  if (opts.longHair) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.42, 0.1), hair);
    back.position.set(0, 1.62, -0.13);
    g.add(back);
  }
  if (opts.cap) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.34), new THREE.MeshLambertMaterial({ color: opts.cap }));
    cap.position.y = 1.9;
    g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.22), cap.material);
    brim.position.set(0, 1.86, 0.26);
    g.add(brim);
  }
  g.userData.limbs = { legL, legR, armL, armR, head };
  return g;
}

// Swing the limbs for a walker moving at speedFactor 0..1.
export function animateWalk(mesh, phase, speedFactor) {
  const l = mesh.userData.limbs;
  const swing = Math.sin(phase) * 0.62 * speedFactor;
  l.legL.rotation.x = swing;
  l.legR.rotation.x = -swing;
  l.armL.rotation.x = -swing * 0.8;
  l.armR.rotation.x = swing * 0.8;
}

export function resetPose(mesh) {
  const l = mesh.userData.limbs;
  l.legL.rotation.x = 0;
  l.legR.rotation.x = 0;
  l.armL.rotation.x = 0;
  l.armR.rotation.x = 0;
}

// A citizen with a simple life: pick a stroll target, walk to it, idle a
// moment, repeat. Flees when panic is raised nearby.
export class Pedestrian {
  constructor(scene, x, z) {
    this.mesh = makePersonMesh();
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.heading = rng() * Math.PI * 2;
    this.speed = 0;
    this.phase = rng() * 6;
    this.tx = x;
    this.tz = z;
    this.idleFor = rng() * 2;
    this.fleeFrom = null;
    this.fleeTime = 0;
    this.dead = false;
  }

  pickTarget() {
    const kind = rng();
    if (kind < 0.35) {
      // A point on a sidewalk beside a random avenue.
      const a = AVENUES[Math.floor(rng() * AVENUES.length)];
      const side = rng() < 0.5 ? -13 : 13;
      const along = -250 + rng() * 480;
      if (rng() < 0.5) { this.tx = a + side; this.tz = clamp(along, -260, 185); }
      else { this.tx = clamp(along, -260, 260); this.tz = a + side; }
    } else if (kind < 0.6) {
      this.tx = (rng() - 0.5) * 76;
      this.tz = (rng() - 0.5) * 76;
      if (Math.abs(this.tx) < 13 && Math.abs(this.tz) < 13) this.tx += 20;
    } else if (kind < 0.8) {
      this.tx = -250 + rng() * 500;
      this.tz = 190 + rng() * 10;
    } else {
      this.tx = (rng() - 0.5) * 400;
      this.tz = (rng() - 0.5) * 400;
    }
  }

  panic(x, z) {
    this.fleeFrom = { x, z };
    this.fleeTime = 2.4;
  }

  update(dt, colliders) {
    if (this.dead) return;
    let moveX = 0;
    let moveZ = 0;
    let want = 0;
    if (this.fleeTime > 0 && this.fleeFrom) {
      this.fleeTime -= dt;
      const dx = this.x - this.fleeFrom.x;
      const dz = this.z - this.fleeFrom.z;
      const d = Math.max(1, Math.hypot(dx, dz));
      moveX = dx / d;
      moveZ = dz / d;
      want = 4.6;
    } else if (this.idleFor > 0) {
      this.idleFor -= dt;
    } else {
      const dx = this.tx - this.x;
      const dz = this.tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.6) {
        this.pickTarget();
        this.idleFor = 0.5 + rng() * 3;
      } else {
        moveX = dx / d;
        moveZ = dz / d;
        want = 1.5 + (this.stroller ? 0.4 : 0);
      }
    }
    this.speed += (want - this.speed) * Math.min(1, dt * 6);
    if (this.speed > 0.1) {
      const targetHeading = Math.atan2(moveX, moveZ);
      let dh = targetHeading - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += clamp(dh, -5 * dt, 5 * dt);
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
      const p = resolveCollisions({ x: this.x, z: this.z }, 0.45, colliders);
      this.x = p.x;
      this.z = p.z;
      this.phase += dt * this.speed * 3.4;
      animateWalk(this.mesh, this.phase, clamp(this.speed / 2, 0, 1));
    } else {
      resetPose(this.mesh);
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.dead = true;
  }
}

export function spawnCrowd(scene, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const r = rng();
    let x;
    let z;
    if (r < 0.4) {
      x = (rng() - 0.5) * 80;
      z = (rng() - 0.5) * 80;
      if (Math.abs(x) < 12 && Math.abs(z) < 12) x += 24;
    } else if (r < 0.65) {
      x = -250 + rng() * 500;
      z = 188 + rng() * 12;
    } else {
      const a = AVENUES[Math.floor(rng() * AVENUES.length)];
      const side = rng() < 0.5 ? -13 : 13;
      if (rng() < 0.5) { x = a + side; z = -240 + rng() * 420; }
      else { x = -240 + rng() * 480; z = a + side; }
    }
    const ped = new Pedestrian(scene, x, z);
    ped.pickTarget();
    peds.push(ped);
  }
  return peds;
}

export { dist2d };
