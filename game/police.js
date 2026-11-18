// police.js — the Policía del Sol: wanted heat and its decay, patrol cars
// that hunt with predictive steering and flanking, a roadblock at five
// stars, officers who shoot at high wanted levels, a spotlight helicopter
// at four stars, dispatch callouts, and the busted check.

import * as THREE from 'three';
import { makeCar, placeOnRoad, moveCar, syncMesh, approach } from './vehicles.js';
import { clamp, angleDiff, dist2d, dampFactor, rand } from './util.js';

const CRIME_HEAT = {
  carjack: 0.55, hitCar: 0.25, hitPed: 0.8, assault: 0.8, kill: 1.4,
  shot: 0.3, copHit: 0.5, copKill: 2.0, robbery: 1.0, mission: 0.5,
};
const DISPATCH = {
  2: 'Dispatch: “Units, converge on the suspect.”',
  3: 'Dispatch: “Shots authorized. Bring him in.”',
  4: 'Dispatch: “Air unit up — light him up.”',
  5: 'Dispatch: “All units. Roadblocks. End this.”',
};

export class PoliceSystem {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.cars = []; this.heat = 0; this.sinceCrime = 99;
    this.arrestT = 0; this.spawnT = 0; this.lockFloor = 0; this.flashT = 0;
    this.lastStars = 0; this.roadblock = null; this.roadblockCd = 0;
    // Helicopter: dark body, spinning rotors, a real spotlight + visible cone.
    const heli = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1d2733, roughness: 0.4, metalness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.9, 5.6), bodyMat); body.castShadow = true;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 4.6), bodyMat); tail.position.set(0, 0.3, -4.6);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.3, 0.9), bodyMat); fin.position.set(0, 0.8, -6.7);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.07, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.6 }));
    rotor.position.y = 1.25;
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.22), rotor.material);
    tailRotor.position.set(0.32, 0.8, -6.7);
    const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.6), bodyMat); skidL.position.set(-1.1, -1.25, 0);
    const skidR = skidL.clone(); skidR.position.x = 1.1;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 9, 42, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffeeb8, transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.y = -22;
    const spot = new THREE.SpotLight(0xfff2c0, 0, 130, 0.34, 0.55, 0.6);
    spot.position.set(0, -1, 0);
    heli.add(body, tail, fin, rotor, tailRotor, skidL, skidR, cone, spot, spot.target);
    heli.visible = false;
    scene.add(heli);
    this.heli = heli; this.rotor = rotor; this.tailRotor = tailRotor;
    this.spot = spot; this.cone = cone;
    this.heliAngle = 0; this.heliActive = false;
    this.spotCur = { x: 0, z: 0 };
  }
  stars() { return this.heat <= 0.02 ? 0 : Math.min(5, Math.ceil(this.heat)); }
  reportCrime(kind, x, z, G) {
    const add = CRIME_HEAT[kind] || 0.3;
    this.heat = clamp(this.heat + add, 0, 5);
    this.sinceCrime = 0;
    if (G) G.danger = { x, z, t: performance.now() };
  }
  setLock(floor) { this.lockFloor = floor; if (floor > 0) this.heat = Math.max(this.heat, floor); }
  clearAll() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    this.cars = []; this.heat = 0; this.arrestT = 0; this.heliActive = false; this.heli.visible = false;
    this.spot.intensity = 0; this.roadblock = null; this.lastStars = 0;
  }
  removeCar(car, G) {
    this.scene.remove(car.mesh);
    this.cars.splice(this.cars.indexOf(car), 1);
    if (G) G.allCars.splice(G.allCars.indexOf(car), 1);
  }
  spawnCop(G) {
    const P = G.player;
    // Bias spawns behind the player's heading so pursuits form up naturally.
    const heading = P.onFoot ? P.angle : P.car.angle;
    const a = heading + Math.PI + rand(-0.9, 0.9), d = rand(68, 96);
    const car = makeCar('police', P.x + Math.sin(a) * d, P.z + Math.cos(a) * d, 0, 'police');
    placeOnRoad(car, car.x, car.z);
    car.shootT = rand(0.4, 1.2);
    this.scene.add(car.mesh); this.cars.push(car);
    G.allCars.push(car);
  }
  // At five stars, once in a while: two patrol cars angled across the road
  // ahead of the player. They do not steer; they are a wall with lights.
  maybeRoadblock(dt, G) {
    this.roadblockCd -= dt;
    if (this.roadblock) {
      const P = G.player;
      const mid = this.roadblock.cars[0];
      if (!mid || dist2d(mid.x, mid.z, P.x, P.z) > 130 || this.stars() < 5) {
        for (const c of this.roadblock.cars) this.removeCar(c, G);
        this.roadblock = null; this.roadblockCd = 14;
      }
      return;
    }
    if (this.stars() < 5 || G.player.onFoot || this.roadblockCd > 0) return;
    const car = G.player.car;
    if (Math.abs(car.speed) < 8) return;
    const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
    const bx = car.x + fx * 58, bz = car.z + fz * 58;
    const cars = [];
    for (const off of [-3.4, 3.4]) {
      const c = makeCar('police', bx - fz * off, bz + fx * off, car.angle + Math.PI / 2 + (off > 0 ? 0.35 : -0.35), 'police');
      c.roadblock = true; c.shootT = rand(0.5, 1);
      this.scene.add(c.mesh); this.cars.push(c); G.allCars.push(c);
      cars.push(c);
    }
    this.roadblock = { cars };
    G.hud.toast('Roadblock ahead!', 2.2);
  }
  step(dt, G) {
    const P = G.player;
    const px = P.onFoot ? P.x : P.car.x, pz = P.onFoot ? P.z : P.car.z;
    const pvx = P.onFoot ? 0 : Math.sin(P.car.angle) * P.car.speed;
    const pvz = P.onFoot ? 0 : Math.cos(P.car.angle) * P.car.speed;
    this.sinceCrime += dt;
    if (this.lockFloor > 0) this.heat = Math.max(this.heat, this.lockFloor);
    // Decay only when unseen: no crime lately, no cop close, no helicopter.
    const nearest = this.cars.reduce((m, c) => Math.min(m, dist2d(c.x, c.z, px, pz)), 1e9);
    if (this.sinceCrime > 7 && nearest > 30 && !this.heliActive && this.lockFloor === 0)
      this.heat = Math.max(0, this.heat - dt * 0.085);
    const stars = this.stars();
    if (stars > this.lastStars && DISPATCH[stars]) G.hud.toast(DISPATCH[stars], 2.8);
    this.lastStars = stars;
    const wantCops = stars === 0 ? 0 : Math.min(1 + stars, 6);
    this.spawnT -= dt;
    const chasers = this.cars.filter(c => !c.roadblock);
    if (chasers.length < wantCops && this.spawnT <= 0) { this.spawnCop(G); this.spawnT = 2.2; }
    if (chasers.length > wantCops + 2) {
      const far = chasers.find(c => dist2d(c.x, c.z, px, pz) > 150);
      if (far) this.removeCar(far, G);
    }
    this.maybeRoadblock(dt, G);
    this.flashT += dt;
    const phase = (this.flashT % 0.56) < 0.28;
    let arrest = false;
    let ci = 0;
    for (const car of this.cars) {
      if (car.mesh.userData.barL) {
        car.mesh.userData.barL.material.color.setHex(phase ? 0xff2a30 : 0x571014);
        car.mesh.userData.barR.material.color.setHex(phase ? 0x1c2f6e : 0x3a6bff);
      }
      if (car.dead) { syncMesh(car); continue; }
      if (car.roadblock) { // a parked wall: officers still shoot from it
        if (stars >= 3) {
          car.shootT -= dt;
          const d = dist2d(car.x, car.z, px, pz);
          if (car.shootT <= 0 && d < 26 && d > 4) { car.shootT = rand(0.8, 1.4); G.combat.policeShot(car, G); }
        }
        continue;
      }
      const d = dist2d(car.x, car.z, px, pz);
      // Predictive steering: the lead car aims where the player will be,
      // the rest fan out to flank offsets so they do not queue in a line.
      const lead = clamp(d / 55, 0, 0.85);
      let tx = px + pvx * lead, tz = pz + pvz * lead;
      if (ci > 0) {
        const side = (ci % 2 === 0 ? 1 : -1) * Math.ceil(ci / 2) * 7;
        const pa = Math.atan2(tx - car.x, tz - car.z);
        tx += Math.cos(pa) * side; tz -= Math.sin(pa) * side;
      }
      ci++;
      const desired = Math.atan2(tx - car.x, tz - car.z);
      const diff = angleDiff(desired, car.angle);
      car.angle += clamp(diff, -car.spec.turn * dt, car.spec.turn * dt);
      let want = car.spec.topSpeed * (d > 26 ? 1 : 0.45 + d / 26 * 0.55);
      if (Math.abs(diff) > 1.15) want *= 0.45;
      if (d < 4.2) want = 0;
      car.speed = approach(car.speed, want, (want > car.speed ? car.spec.accel : car.spec.brake) * dt);
      moveCar(car, dt, this.world.colliders);
      syncMesh(car);
      // Officers shoot from a stopped car at 3+ stars.
      if (stars >= 3 && car.speed < 2.5 && d < 24 && d > 5) {
        car.shootT -= dt;
        if (car.shootT <= 0) {
          car.shootT = rand(0.75, 1.3);
          G.combat.policeShot(car, G);
        }
      }
      if (P.onFoot ? d < 6.5 : (d < 6 && Math.abs(P.car.speed) < 2.5)) arrest = true;
    }
    // Busted build-up.
    if (arrest && stars > 0) {
      this.arrestT += dt;
      if (this.arrestT > 2.6) { this.arrestT = 0; G.onBusted(); }
    } else this.arrestT = Math.max(0, this.arrestT - dt * 1.6);
    G.arrestRatio = clamp(this.arrestT / 2.6, 0, 1);
    // Helicopter at 4+ stars: lower and tighter at five.
    const wantHeli = stars >= 4;
    if (wantHeli && !this.heliActive) {
      this.heliActive = true; this.heli.visible = true; this.spot.intensity = 900;
      this.spotCur = { x: px, z: pz };
      this.heli.position.set(px + 20, 44, pz + 20);
    }
    if (!wantHeli && this.heliActive) { this.heliActive = false; this.heli.visible = false; this.spot.intensity = 0; }
    if (this.heliActive) {
      this.heliAngle += dt * 0.45;
      const alt = stars >= 5 ? 33 : 40;
      const hx = px + Math.sin(this.heliAngle) * 15, hz = pz + Math.cos(this.heliAngle) * 15;
      const hk = dampFactor(3.2, dt);
      this.heli.position.x += (hx - this.heli.position.x) * hk;
      this.heli.position.z += (hz - this.heli.position.z) * hk;
      this.heli.position.y += (alt - this.heli.position.y) * dampFactor(1.6, dt);
      this.heli.rotation.y = this.heliAngle + Math.PI / 2;
      this.rotor.rotation.y += dt * 28;
      this.tailRotor.rotation.x += dt * 40;
      const sk = dampFactor(6, dt);
      this.spotCur.x += (px - this.spotCur.x) * sk;
      this.spotCur.z += (pz - this.spotCur.z) * sk;
      this.spot.target.position.set(this.spotCur.x - this.heli.position.x, -this.heli.position.y, this.spotCur.z - this.heli.position.z);
    }
    G.audio.setSirenLevel(stars > 0 ? clamp(1 - nearest / 70, 0, 1) : 0);
    G.audio.setHeliLevel(this.heliActive ? clamp(1 - dist2d(this.heli.position.x, this.heli.position.z, px, pz) / 130, 0.15, 1) : 0);
  }
}
