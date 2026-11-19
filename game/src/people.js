// people.js — the humans of Costa Vera: wandering pedestrians, Pilar the
// fixer, drivers who run from a carjacking, the foot-chase target, and the
// armed hostiles who guard the rough jobs.

import * as THREE from '../three.module.min.js';
import { PLACES } from './config.js';
import { clamp, headingTo, makeRng, pick, turnToward } from './util.js';
import { resolveCollisions, surfaceAt } from './city.js';

const SHIRTS = [0xe8e2d2, 0xd94f30, 0x2e6fb7, 0x3f9e63, 0xe8b93c, 0x7a4fa3, 0xe4e0d6, 0x30343c];
const SKIN = [0xe8b98d, 0xc68863, 0x8a5a3b, 0xf0c8a0];
const skinRng = makeRng(2026);

// A simple articulated figure: legs, torso, arms, head. Faces +Z locally.
export function makePersonMesh(shirtColor, opts = {}) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: pick(skinRng, SKIN) });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: opts.pants || 0x2c3242 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.26), pants);
  legL.position.set(-0.14, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legL, legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.3), shirt);
  torso.position.y = 1.11;
  group.add(torso);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.2), shirt);
  armL.position.set(-0.37, 1.12, 0);
  const armR = armL.clone();
  armR.position.x = 0.37;
  group.add(armL, armR);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.66;
  group.add(head);
  if (opts.cap) {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.24, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: opts.cap }),
    );
    cap.position.y = 1.82;
    group.add(cap);
  }
  group.userData = { legL, legR, armL, armR, torso };
  return group;
}

let nextPersonId = 1;

function makePerson(x, z, heading, mode, shirt) {
  const group = makePersonMesh(shirt);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  return {
    id: nextPersonId++,
    group, x, z, heading,
    speed: 0,
    mode, // 'wander' | 'stand' | 'flee' | 'target' | 'hostile' | 'down'
    hp: 100,
    walkPhase: Math.random() * 6,
    targetX: x, targetZ: z,
    timer: 0,
    fireTimer: 1 + Math.random(),
    strafeDir: Math.random() > 0.5 ? 1 : -1,
    anchorX: x, anchorZ: z,
    barGroup: null,
    barFill: null,
  };
}

function animatePerson(p, dt, moving) {
  if (moving) p.walkPhase += dt * (4 + p.speed * 1.1);
  const swing = moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  const u = p.group.userData;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.8;
  u.armR.rotation.x = swing * 0.8;
  p.group.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * (moving ? 0.05 : 0.01), p.z);
  p.group.rotation.y = p.heading;
}

function movePerson(p, dt, speed, desiredHeading) {
  p.heading = turnToward(p.heading, desiredHeading, 6 * dt);
  p.speed = speed;
  let nx = p.x + Math.sin(p.heading) * speed * dt;
  let nz = p.z + Math.cos(p.heading) * speed * dt;
  const pos = { x: nx, z: nz };
  resolveCollisions(pos, 0.55);
  if (surfaceAt(pos.x, pos.z) === 'water') return;
  p.x = pos.x;
  p.z = pos.z;
}

// --- Pedestrians ---------------------------------------------------------------

export function spawnPedestrians(scene, count) {
  const rng = makeRng(777);
  const peds = [];
  for (let i = 0; i < count; i++) {
    const x = -440 + rng() * 700;
    const z = -440 + rng() * 880;
    if (surfaceAt(x, z) !== 'land') continue;
    const p = makePerson(x, z, rng() * Math.PI * 2, 'wander', pick(rng, SHIRTS));
    p.targetX = x + (rng() - 0.5) * 160;
    p.targetZ = z + (rng() - 0.5) * 160;
    scene.add(p.group);
    peds.push(p);
  }
  return peds;
}

const pedRng = makeRng(31337);

export function updatePedestrians(G, dt) {
  const player = G.player;
  for (const p of G.peds) {
    if (p.mode === 'down') continue;
    if (p.mode === 'flee') {
      p.timer -= dt;
      const away = headingTo(player.x, player.z, p.x, p.z);
      movePerson(p, dt, 9.5, away);
      animatePerson(p, dt, true);
      if (p.timer <= 0) {
        p.mode = 'wander';
        p.targetX = p.x + (pedRng() - 0.5) * 120;
        p.targetZ = p.z + (pedRng() - 0.5) * 120;
      }
      continue;
    }
    // Wander between idle strolls.
    const dx = p.targetX - p.x;
    const dz = p.targetZ - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2) {
      p.targetX = clamp(p.x + (pedRng() - 0.5) * 200, -460, 290);
      p.targetZ = clamp(p.z + (pedRng() - 0.5) * 200, -460, 460);
      animatePerson(p, dt, false);
      continue;
    }
    movePerson(p, dt, 2.2, Math.atan2(dx, dz));
    animatePerson(p, dt, true);
  }
}

export function scarePedsNear(G, x, z, radius) {
  for (const p of G.peds) {
    if (p.mode === 'wander' && Math.hypot(p.x - x, p.z - z) < radius) {
      p.mode = 'flee';
      p.timer = 3 + Math.random() * 2;
    }
  }
}

// A driver who has just been pulled out of their car and runs for it.
export function spawnFleeingDriver(G, x, z) {
  const p = makePerson(x, z, 0, 'flee', pick(pedRng, SHIRTS));
  p.timer = 6;
  G.scene.add(p.group);
  G.peds.push(p);
  return p;
}

// --- Pilar -----------------------------------------------------------------------

export function spawnPilar(scene) {
  const p = makePerson(PLACES.pilarCorner.x, PLACES.pilarCorner.z, -Math.PI / 2, 'stand', 0xd94f30);
  p.group.userData.torso.material = new THREE.MeshLambertMaterial({ color: 0xd94f30 });
  scene.add(p.group);
  return p;
}

// --- The foot-chase target ---------------------------------------------------------

export function spawnChaseTarget(scene, x, z) {
  const p = makePerson(x, z, 0, 'target', 0xe8b93c);
  scene.add(p.group);
  return p;
}

export function updateChaseTarget(G, dt) {
  const t = G.targetPed;
  if (!t || t.mode !== 'target') return;
  const player = G.player;
  const away = headingTo(player.x, player.z, t.x, t.z);
  // Weave: bias the escape direction toward the nearest street line.
  const weave = Math.sin(G.elapsed * 1.7) * 0.5;
  movePerson(t, dt, G.targetTired ? 9.4 : 11.1, away + weave);
  animatePerson(t, dt, true);
}

// --- Hostiles ------------------------------------------------------------------------

export function spawnHostile(scene, x, z) {
  const p = makePerson(x, z, 0, 'hostile', 0x30343c);
  p.hp = 100;
  // A little rifle block in the right hand.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x14151a }),
  );
  gun.position.set(0.37, 1.15, 0.3);
  p.group.add(gun);
  // Health bar that floats over the head.
  const barGroup = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.2),
    new THREE.MeshBasicMaterial({ color: 0x14151a, side: THREE.DoubleSide }),
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.13),
    new THREE.MeshBasicMaterial({ color: 0x7ddb4a, side: THREE.DoubleSide }),
  );
  fill.position.z = 0.01;
  barGroup.add(bg, fill);
  barGroup.position.y = 2.25;
  p.group.add(barGroup);
  p.barGroup = barGroup;
  p.barFill = fill;
  scene.add(p.group);
  return p;
}

export function refreshHostileBar(p) {
  const frac = clamp(p.hp / 100, 0, 1);
  p.barFill.scale.x = Math.max(frac, 0.001);
  p.barFill.position.x = -(1 - frac) * 0.7;
  p.barFill.material.color.setHex(frac > 0.45 ? 0x7ddb4a : frac > 0.2 ? 0xe8b93c : 0xd93a2e);
}

export function updateHostiles(G, dt) {
  const player = G.player;
  for (const h of G.hostiles) {
    if (h.mode === 'down') continue;
    const dx = player.x - h.x;
    const dz = player.z - h.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    let moving = false;
    if (dist > 20) {
      movePerson(h, dt, 5.2, toPlayer);
      moving = true;
    } else if (dist < 9) {
      movePerson(h, dt, 4.2, toPlayer + Math.PI);
      moving = true;
    } else {
      // Strafe sideways around the firing line.
      movePerson(h, dt, 2.4, toPlayer + (Math.PI / 2) * h.strafeDir);
      h.heading = toPlayer;
      moving = true;
      if (Math.random() < dt * 0.25) h.strafeDir *= -1;
    }
    animatePerson(h, dt, moving);
    if (h.barGroup) h.barGroup.quaternion.copy(G.camera.quaternion);
  }
}

export function downPerson(p) {
  p.mode = 'down';
  p.group.rotation.x = -Math.PI / 2;
  p.group.position.y = 0.25;
  if (p.barGroup) p.barGroup.visible = false;
}
