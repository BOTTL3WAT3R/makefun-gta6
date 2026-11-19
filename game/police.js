// police.js — the Costa Vera police response: patrol cars that spawn on the
// grid and hunt the player, a helicopter with a searchlight from four stars,
// a three-car roadblock at five stars, and the BUSTED arrest meter that fills
// when a cornered player stops moving.

import * as THREE from 'three';
import { clamp, angleDelta, dist2d, lineBlocked, makeRng } from './util.js';
import { Vehicle, VEHICLE_TYPES } from './vehicles.js';
import { AVENUES } from './world.js';

const rng = makeRng(777001);
const COPS_BY_STARS = [0, 1, 2, 3, 4, 5];

export class PoliceSystem {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.heli = null;
    this.heliAngle = 0;
    this.roadblock = [];
    this.spawnTimer = 0;
    this.bustedMeter = 0;
    this.flashPhase = 0;
  }

  desiredCops(wanted) {
    return COPS_BY_STARS[clamp(Math.floor(wanted), 0, 5)];
  }

  spawnCop(player) {
    const axis = rng() < 0.5 ? 'z' : 'x';
    const avenue = AVENUES[Math.floor(rng() * AVENUES.length)];
    let x;
    let z;
    let heading;
    const dir = rng() < 0.5 ? 1 : -1;
    if (axis === 'z') {
      x = avenue + (dir > 0 ? -4.5 : 4.5);
      z = player.z + dir * -(95 + rng() * 30);
      heading = dir > 0 ? Math.PI : 0;
      z = clamp(z, -255, 175);
      if (Math.abs(z - player.z) < 55) z = player.z - 95;
    } else {
      z = avenue + (dir > 0 ? 4.5 : -4.5);
      x = player.x + dir * -(95 + rng() * 30);
      heading = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      x = clamp(x, -255, 255);
      if (Math.abs(x - player.x) < 55) x = player.x - 95;
    }
    const type = VEHICLE_TYPES[2];
    const cop = new Vehicle(this.scene, type, x, z, heading, { driver: 'police', occupied: true, color: 0xf2f4f6, police: true });
    cop.stuckFor = 0;
    cop.reverseFor = 0;
    this.cars.push(cop);
    return cop;
  }

  buildHelicopter() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x22364f });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 4.6), bodyMat);
    g.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 1.4), new THREE.MeshLambertMaterial({ color: 0x9fd4e8 }));
    glass.position.set(0, 0.25, 1.9);
    g.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 4.6), bodyMat);
    tail.position.set(0, 0.3, -4.2);
    g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.7), new THREE.MeshLambertMaterial({ color: 0xd8402e }));
    fin.position.set(0, 0.6, -6.4);
    g.add(fin);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x14161a }));
    rotor.position.y = 1.35;
    g.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.3), rotor.material);
    tailRotor.position.set(0.35, 0.6, -6.4);
    g.add(tailRotor);
    const skidMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
    for (const sx of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.6), skidMat);
      skid.position.set(sx * 1.1, -1.25, 0);
      g.add(skid);
    }
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(7.5, 36, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })
    );
    cone.position.y = -19;
    g.add(cone);
    const spot = new THREE.SpotLight(0xfff3b0, 2.2, 90, 0.32, 0.5, 0.6);
    spot.position.set(0, -1, 0);
    g.add(spot);
    g.add(spot.target);
    spot.target.position.set(0, -40, 0);
    g.userData.rotor = rotor;
    g.userData.tailRotor = tailRotor;
    return g;
  }

  setRoadblock(player) {
    this.clearRoadblock();
    // Three cruisers parked across the avenue the player is travelling on,
    // 55 m ahead.
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    const cx = player.x + fx * 55;
    const cz = player.z + fz * 55;
    const alongX = Math.abs(fz) > Math.abs(fx);
    for (let i = -1; i <= 1; i++) {
      const x = alongX ? cx : cx + i * 4.4;
      const z = alongX ? cz + i * 4.4 : cz;
      const heading = alongX ? 0 : Math.PI / 2;
      const cop = new Vehicle(this.scene, VEHICLE_TYPES[2], x, z, heading, { driver: 'roadblock', occupied: true, color: 0xf2f4f6, police: true });
      cop.speed = 0;
      this.roadblock.push(cop);
    }
  }

  clearRoadblock() {
    for (const c of this.roadblock) c.dispose(this.scene);
    this.roadblock = [];
  }

  anySeesPlayer(player, colliders) {
    for (const cop of this.cars) {
      const d = dist2d(cop.x, cop.z, player.x, player.z);
      if (d < 95 && !lineBlocked(cop.x, cop.z, player.x, player.z, colliders)) return true;
    }
    return this.heli !== null;
  }

  // Returns 'busted' when the arrest completes this frame, else null.
  update(dt, player, wanted, colliders) {
    this.flashPhase += dt * 9;
    const flash = Math.sin(this.flashPhase) > 0;
    for (const cop of this.cars.concat(this.roadblock)) {
      const bar = cop.mesh.userData.lightbar;
      if (bar) {
        bar.red.material.color.setHex(flash ? 0xff2222 : 0x661111);
        bar.blue.material.color.setHex(flash ? 0x113377 : 0x3388ff);
      }
    }

    const want = this.desiredCops(wanted);
    this.spawnTimer -= dt;
    if (wanted > 0 && this.cars.length < want && this.spawnTimer <= 0) {
      this.spawnCop(player);
      this.spawnTimer = 2.2;
    }
    // Retire distant or wrecked units.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const cop = this.cars[i];
      const d = dist2d(cop.x, cop.z, player.x, player.z);
      if ((d > 260 && wanted === 0) || (d > 340) || cop.health <= 5) {
        cop.dispose(this.scene);
        this.cars.splice(i, 1);
      }
    }
    if (wanted === 0) this.bustedMeter = Math.max(0, this.bustedMeter - dt * 0.5);

    // Pursuit driving.
    for (const cop of this.cars) {
      if (cop.health <= 25) {
        cop.drive(dt, { throttle: 0, steer: 0, handbrake: true });
        continue;
      }
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const d = Math.hypot(dx, dz);
      const lead = clamp(d / 40, 0, 0.8);
      const aimX = player.x + (player.vx || 0) * lead;
      const aimZ = player.z + (player.vz || 0) * lead;
      const targetHeading = Math.atan2(aimX - cop.x, aimZ - cop.z);
      const delta = angleDelta(cop.heading, targetHeading);
      let throttle;
      let steer = clamp(delta * 2.4, -1, 1);
      if (cop.reverseFor > 0) {
        cop.reverseFor -= dt;
        throttle = -1;
        steer = -steer;
      } else if (Math.abs(cop.speed) < 0.6 && Math.abs(delta) < 1.1) {
        cop.stuckFor += dt;
        throttle = 1;
        if (cop.stuckFor > 2.2) { cop.reverseFor = 0.9; cop.stuckFor = 0; }
      } else {
        cop.stuckFor = 0;
        throttle = Math.abs(delta) > 1.5 ? 0.35 : 1;
        if (d < 7 && player.speed < 2) throttle = 0.25;
      }
      cop.drive(dt, { throttle, steer, handbrake: false });
      const p = { x: cop.x, z: cop.z };
      resolveVehicle(p, cop.radius(), colliders);
      cop.x = p.x;
      cop.z = p.z;
      cop.syncMesh(0);
    }

    // Helicopter from four stars.
    if (wanted >= 4 && !this.heli) {
      this.heli = this.buildHelicopter();
      this.heli.position.set(player.x + 40, 36, player.z - 40);
      this.scene.add(this.heli);
    }
    if (wanted < 4 && this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
    }
    if (this.heli) {
      this.heliAngle += dt * 0.25;
      const hx = player.x + Math.cos(this.heliAngle) * 16;
      const hz = player.z + Math.sin(this.heliAngle) * 16;
      this.heli.position.x += (hx - this.heli.position.x) * Math.min(1, dt * 1.6);
      this.heli.position.z += (hz - this.heli.position.z) * Math.min(1, dt * 1.6);
      this.heli.position.y = 35 + Math.sin(this.heliAngle * 2.3) * 1.5;
      this.heli.rotation.y = Math.atan2(player.x - this.heli.position.x, player.z - this.heli.position.z);
      this.heli.userData.rotor.rotation.y += dt * 28;
      this.heli.userData.tailRotor.rotation.x += dt * 34;
    }

    // Roadblock at five stars while the player drives.
    if (wanted >= 5 && player.vehicle && this.roadblock.length === 0) {
      this.setRoadblock(player);
    }
    if (this.roadblock.length) {
      const c = this.roadblock[1];
      if (!c || dist2d(c.x, c.z, player.x, player.z) > 130 || wanted < 5) this.clearRoadblock();
    }

    // BUSTED meter: a slow or stopped player with a cruiser alongside.
    if (wanted > 0) {
      let nearest = Infinity;
      for (const cop of this.cars) nearest = Math.min(nearest, dist2d(cop.x, cop.z, player.x, player.z));
      const cornered = player.speed < 1.6 && nearest < 10;
      if (cornered) this.bustedMeter += dt / 2.4;
      else this.bustedMeter = Math.max(0, this.bustedMeter - dt * 0.7);
      if (this.bustedMeter >= 1) {
        this.bustedMeter = 0;
        return 'busted';
      }
    }
    return null;
  }
}

function resolveVehicle(p, r, colliders) {
  for (const c of colliders) {
    const nx = clamp(p.x, c.minX, c.maxX);
    const nz = clamp(p.z, c.minZ, c.maxZ);
    const dx = p.x - nx;
    const dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r || d2 < 1e-9) continue;
    const d = Math.sqrt(d2);
    p.x = nx + (dx / d) * r;
    p.z = nz + (dz / d) * r;
  }
}
