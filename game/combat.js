// combat.js — hitscan gunfire: the player's pistol, police return fire,
// tracer lines, muzzle flash, impact sparks, and the damage model for
// people, cars and the player (armor soaks most of a hit before health).

import * as THREE from 'three';
import { dist2d, rand, clamp } from './util.js';

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  return tca - Math.sqrt(r * r - d2);
}

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < 26; i++) {
      const line = new THREE.Line(geo.clone(),
        new THREE.LineBasicMaterial({ color: 0xffd98c, transparent: true, opacity: 0 }));
      line.frustumCulled = false; scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerIdx = 0;
    this.flash = new THREE.PointLight(0xffc873, 0, 16, 1.8);
    scene.add(this.flash);
    // Impact sparks: tiny additive points that burst where a round lands.
    this.sparks = [];
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(7 * 3), 3));
    for (let i = 0; i < 22; i++) {
      const pts = new THREE.Points(sGeo.clone(), new THREE.PointsMaterial({
        color: 0xffc873, size: 0.55, transparent: true, opacity: 0, depthWrite: false }));
      pts.frustumCulled = false; scene.add(pts);
      this.sparks.push({ pts, life: 0, vel: [] });
    }
    this.sparkIdx = 0;
  }
  tracer(x0, y0, z0, x1, y1, z1, color) {
    const t = this.tracers[this.tracerIdx++ % this.tracers.length];
    const p = t.line.geometry.attributes.position.array;
    p[0] = x0; p[1] = y0; p[2] = z0; p[3] = x1; p[4] = y1; p[5] = z1;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9; t.life = 0.09;
  }
  burst(x, y, z) {
    const s = this.sparks[this.sparkIdx++ % this.sparks.length];
    const p = s.pts.geometry.attributes.position.array;
    s.vel = [];
    for (let i = 0; i < 7; i++) {
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
      s.vel.push([rand(-2.4, 2.4), rand(0.6, 3.2), rand(-2.4, 2.4)]);
    }
    s.pts.geometry.attributes.position.needsUpdate = true;
    s.pts.material.opacity = 1; s.life = 0.28;
  }
  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) { t.life -= dt; t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9; }
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const p = s.pts.geometry.attributes.position.array;
      for (let i = 0; i < s.vel.length; i++) {
        p[i * 3] += s.vel[i][0] * dt; p[i * 3 + 1] += s.vel[i][1] * dt; p[i * 3 + 2] += s.vel[i][2] * dt;
        s.vel[i][1] -= 7 * dt;
      }
      s.pts.geometry.attributes.position.needsUpdate = true;
      s.pts.material.opacity = Math.max(0, s.life / 0.28);
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 260);
  }
  damagePlayer(G, dmg) {
    const p = G.player;
    if (p.armor > 0) {
      const soaked = Math.min(p.armor, dmg * 0.7);
      p.armor -= soaked; dmg -= soaked;
    }
    p.health -= dmg;
    p.lastHurtT = performance.now();
    G.hurtT = performance.now(); // main.js flashes the hurt vignette off this
    if (p.health <= 0 && G.mode === 'play') { p.health = 0; G.onWasted(); }
  }
  // The player fires toward the camera's centre. Returns true if a shot went off.
  playerShoot(G) {
    const cam = G.camera, p = G.player;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
    let bestT = 130, hitPed = null, hitCar = null;
    for (const ped of G.people.peds) {
      if (ped.state === 'down' || ped.state === 'ride') continue;
      const t = raySphere(ox, oy, oz, dir.x, dir.y, dir.z, ped.x, 1.15, ped.z, 0.62);
      if (t > 0 && t < bestT) { bestT = t; hitPed = ped; hitCar = null; }
    }
    for (const car of G.allCars) {
      const t = raySphere(ox, oy, oz, dir.x, dir.y, dir.z, car.x, 0.85, car.z, 2.3);
      if (t > 0 && t < bestT) { bestT = t; hitCar = car; hitPed = null; }
    }
    if (!hitPed && !hitCar && dir.y < -0.01) { // a miss still lands somewhere: the ground
      const tg = -oy / dir.y;
      if (tg > 0 && tg < bestT) bestT = tg;
    }
    const gx = p.x + Math.sin(p.angle) * 0.5, gz = p.z + Math.cos(p.angle) * 0.5;
    const ex = ox + dir.x * bestT, ey = Math.max(0.05, oy + dir.y * bestT), ez = oz + dir.z * bestT;
    this.tracer(gx, 1.35, gz, ex, ey, ez, 0xffe9a0);
    this.burst(ex, ey, ez);
    this.flash.position.set(gx, 1.5, gz); this.flash.intensity = 26;
    G.audio.shot();
    G.police.reportCrime('shot', p.x, p.z, G);
    const falloff = clamp(1.15 - bestT / 160, 0.55, 1); // distance softens a hit
    if (hitPed) G.people.damage(hitPed, 34 * falloff, G);
    if (hitCar) {
      hitCar.health -= 24 * falloff;
      G.police.reportCrime(hitCar.driver === 'police' ? 'copHit' : 'hitCar', hitCar.x, hitCar.z, G);
      if (hitCar.health <= 0 && !hitCar.dead) killCar(hitCar, G);
    }
    return true;
  }
  // An officer fires from a stopped patrol car (or a roadblock) at the player.
  policeShot(car, G) {
    const p = G.player;
    const tx = p.onFoot ? p.x : p.car.x, tz = p.onFoot ? p.z : p.car.z;
    const ty = p.onFoot ? 1.15 : 0.9;
    const d = dist2d(car.x, car.z, tx, tz);
    const spread = rand(-1, 1) * (1 + d * 0.05);
    const ex = tx + spread, ez = tz + rand(-1, 1) * (1 + d * 0.05);
    this.tracer(car.x, 1.3, car.z, ex, ty, ez, 0xff9a7a);
    if (Math.random() < 0.4) this.burst(ex, ty, ez);
    G.audio.dryShot();
    const hitChance = clamp(0.62 - d * 0.016, 0.08, 0.6);
    if (Math.random() < hitChance) this.damagePlayer(G, rand(4, 8.5));
  }
}

export function killCar(car, G) {
  car.dead = true; car.speed = 0;
  if (car.driver === 'police') G.police.reportCrime('copKill', car.x, car.z, G);
  G.events.push({ type: 'carDead', car });
}
