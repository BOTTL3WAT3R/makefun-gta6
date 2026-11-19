// combat.js — gunplay in Costa Vera: the player's pistol (hitscan with a
// visible tracer and muzzle flash) and the hostile gunmen who hold the Club
// Brisa car park and other bad places — they keep their range, strafe, and
// fire in bursts that can genuinely hurt.

import * as THREE from 'three';
import { clamp, dist2d, lineBlocked, makeRng } from './util.js';
import { makePersonMesh, animateWalk } from './people.js';

const rng = makeRng(31337);

export class Hostile {
  constructor(scene, x, z, opts = {}) {
    this.mesh = makePersonMesh({ shirt: 0x23232e, pants: 0x1a1a20, cap: 0x111116 });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    // A blocky pistol in the right hand.
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x0c0c0e })
    );
    gun.position.set(0.34, 1.12, 0.3);
    this.mesh.add(gun);
    this.x = x;
    this.z = z;
    this.heading = rng() * Math.PI * 2;
    this.health = opts.health || 100;
    this.dead = false;
    this.deadFor = 0;
    this.burstLeft = 0;
    this.cooldown = 1 + rng() * 1.5;
    this.strafeDir = rng() < 0.5 ? 1 : -1;
    this.strafeFlip = 2 + rng() * 2;
    this.phase = rng() * 6;
    this.homeX = x;
    this.homeZ = z;
  }

  get pos() {
    return this.mesh.position;
  }
}

export class CombatSystem {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.hostiles = [];
    this.tracers = [];
    this.fireCooldown = 0;
    this.flash = new THREE.PointLight(0xffc46b, 0, 18, 1.6);
    scene.add(this.flash);
    this.flashPos = new THREE.Vector3();
    this.onShotFired = null; // (x, z) => void, wired by main for crowd panic
  }

  spawnHostile(x, z, opts) {
    const h = new Hostile(this.scene, x, z, opts);
    this.hostiles.push(h);
    return h;
  }

  clearHostiles() {
    for (const h of this.hostiles) this.scene.remove(h.mesh);
    this.hostiles = [];
  }

  aliveCount() {
    let n = 0;
    for (const h of this.hostiles) if (!h.dead) n++;
    return n;
  }

  addTracer(x1, y1, z1, x2, y2, z2, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1),
      new THREE.Vector3(x2, y2, z2),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, ttl: 0.07 });
  }

  // The player fires. from: Vector3 at the muzzle, dir: normalised Vector3.
  // Returns 'hit' | 'kill' | 'miss' | 'cooldown'.
  playerFire(from, dir) {
    if (this.fireCooldown > 0) return 'cooldown';
    this.fireCooldown = 0.21;
    this.audio.shot();
    if (this.onShotFired) this.onShotFired(from.x, from.z);
    this.flash.position.copy(from);
    this.flash.intensity = 3.2;
    // The hit test runs on the ground plane: the camera ray of a
    // third-person view dives past the player, so a chest-height test in
    // full 3D would shoot over everyone's head. Horizontal aim decides.
    const dl = Math.hypot(dir.x, dir.z) || 1;
    const dx = dir.x / dl;
    const dz = dir.z / dl;
    let best = null;
    let bestT = 60;
    for (const h of this.hostiles) {
      if (h.dead) continue;
      const rx = h.x - from.x;
      const rz = h.z - from.z;
      const t = rx * dx + rz * dz;
      if (t < 1 || t > bestT) continue;
      const miss = Math.abs(rx * dz - rz * dx);
      if (miss < 0.62) {
        best = h;
        bestT = t;
      }
    }
    const endT = best ? bestT : 60;
    const endY = best ? 1.25 : from.y + dir.y * endT;
    this.addTracer(from.x, from.y, from.z, from.x + dx * endT, endY, from.z + dz * endT, 0xffe9a8);
    if (best) {
      best.health -= 40;
      if (best.health <= 0) {
        best.dead = true;
        return 'kill';
      }
      return 'hit';
    }
    return 'miss';
  }

  hostileFire(h, player) {
    const from = { x: h.x, y: 1.3, z: h.z };
    const jitter = () => (rng() - 0.5) * 1.6;
    const to = { x: player.x + jitter(), y: 1.2, z: player.z + jitter() };
    this.addTracer(from.x, from.y, from.z, to.x, to.y, to.z, 0xff9a7a);
    this.audio.shot();
    if (this.onShotFired) this.onShotFired(h.x, h.z);
  }

  // onPlayerHit(dmg) applies damage to the player.
  update(dt, player, colliders, onPlayerHit) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 30);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.ttl -= dt;
      t.line.material.opacity = Math.max(0, t.ttl / 0.07) * 0.9;
      if (t.ttl <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (const h of this.hostiles) {
      if (h.dead) {
        h.deadFor += dt;
        h.mesh.rotation.x = Math.max(-Math.PI / 2, h.mesh.rotation.x - dt * 5);
        h.mesh.position.y = h.deadFor > 2.5 ? Math.max(-1.2, h.mesh.position.y - dt * 0.4) : 0;
        continue;
      }
      const d = dist2d(h.x, h.z, player.x, player.z);
      const seen = d < 46 && !lineBlocked(h.x, h.z, player.x, player.z, colliders);
      // Face the player when engaged, else drift back toward the post.
      const tx = seen ? player.x : h.homeX;
      const tz = seen ? player.z : h.homeZ;
      const targetHeading = Math.atan2(tx - h.x, tz - h.z);
      let dh = targetHeading - h.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      h.heading += clamp(dh, -4 * dt, 4 * dt);

      let moving = 0;
      if (seen && d > 17) moving = 1;
      else if (seen && d < 8) moving = -1;
      if (moving !== 0) {
        h.x += Math.sin(h.heading) * moving * 2.3 * dt;
        h.z += Math.cos(h.heading) * moving * 2.3 * dt;
        h.phase += dt * 7;
        animateWalk(h.mesh, h.phase, 0.8);
      } else if (seen) {
        // Strafe sideways between bursts.
        h.strafeFlip -= dt;
        if (h.strafeFlip <= 0) {
          h.strafeDir *= -1;
          h.strafeFlip = 1.6 + rng() * 2;
        }
        const sx = Math.cos(h.heading) * h.strafeDir;
        const sz = -Math.sin(h.heading) * h.strafeDir;
        h.x += sx * 0.9 * dt;
        h.z += sz * 0.9 * dt;
        h.phase += dt * 4;
        animateWalk(h.mesh, h.phase, 0.4);
      }
      h.mesh.position.set(h.x, 0, h.z);
      h.mesh.rotation.y = h.heading;

      if (!seen) continue;
      h.cooldown -= dt;
      if (h.burstLeft > 0) {
        h.burstTimer -= dt;
        if (h.burstTimer <= 0) {
          h.burstTimer = 0.13;
          h.burstLeft--;
          this.hostileFire(h, player);
          const cover = player.vehicle ? 0.55 : 1;
          const speedDodge = clamp(1 - player.speed / 30, 0.45, 1);
          const chance = clamp(0.62 - d * 0.016, 0.12, 0.55) * cover * speedDodge;
          if (rng() < chance) onPlayerHit(6 + rng() * 5);
        }
      } else if (h.cooldown <= 0) {
        h.burstLeft = 3;
        h.burstTimer = 0;
        h.cooldown = 1.1 + rng() * 1.3;
      }
    }
    // Remove long-dead bodies.
    for (let i = this.hostiles.length - 1; i >= 0; i--) {
      if (this.hostiles[i].dead && this.hostiles[i].deadFor > 4) {
        this.scene.remove(this.hostiles[i].mesh);
        this.hostiles.splice(i, 1);
      }
    }
  }
}
