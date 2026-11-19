// player.js — the protagonist: a figure in a teal shirt and a red cap, on
// foot or behind a wheel, with health, armour and a wallet.

import * as THREE from '../three.module.min.js';
import { PLAYER_START } from './config.js';
import { clamp } from './util.js';
import { resolveCollisions, surfaceAt } from './city.js';
import { makePersonMesh } from './people.js';
import { moveAxes, sprintHeld } from './input.js';

export function createPlayer(scene) {
  const group = makePersonMesh(0x2a9d8f, { cap: 0xd93a2e, pants: 0xe8e2d2 });
  group.position.set(PLAYER_START.x, 0, PLAYER_START.z);
  scene.add(group);
  return {
    group,
    x: PLAYER_START.x,
    z: PLAYER_START.z,
    heading: PLAYER_START.heading,
    health: 100,
    armor: 0,
    cash: 85,
    inVehicle: null,
    walkPhase: 0,
    moving: false,
    lastDamageAt: -99,
    aimX: PLAYER_START.x,
    aimZ: PLAYER_START.z - 10,
  };
}

// Where the player "is" for AI and markers: their feet, or their car's nose.
export function playerPos(player) {
  if (player.inVehicle) return { x: player.inVehicle.x, z: player.inVehicle.z };
  return { x: player.x, z: player.z };
}

const WALK_SPEED = 8.6;
const SPRINT_SPEED = 13.6;
export const PLAYER_SPEEDS = { walk: WALK_SPEED, sprint: SPRINT_SPEED };

export function updatePlayerOnFoot(G, dt) {
  const player = G.player;
  const axes = moveAxes();
  player.moving = axes.x !== 0 || axes.z !== 0;

  if (player.moving) {
    const camYaw = G.cameraYaw;
    const moveAngle = camYaw + Math.atan2(-axes.x, -axes.z);
    // Turn toward the movement direction, briskly but not instantly.
    let delta = moveAngle - player.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    player.heading += delta * Math.min(1, dt * 14);

    let speed = sprintHeld() ? SPRINT_SPEED : WALK_SPEED;
    const here = surfaceAt(player.x, player.z);
    if (here === 'sand') speed *= 0.72;

    let nx = player.x + Math.sin(moveAngle) * speed * dt;
    let nz = player.z + Math.cos(moveAngle) * speed * dt;
    // Water blocks: try sliding along each axis before giving up.
    if (surfaceAt(nx, nz) === 'water') {
      if (surfaceAt(nx, player.z) !== 'water') nz = player.z;
      else if (surfaceAt(player.x, nz) !== 'water') nx = player.x;
      else { nx = player.x; nz = player.z; }
    }
    const pos = { x: nx, z: nz };
    resolveCollisions(pos, 0.55);
    player.x = clamp(pos.x, -486, 468);
    player.z = clamp(pos.z, -486, 486);
    player.walkPhase += dt * (sprintHeld() ? 11 : 8);
  }

  // Face the aim point while a shot is being lined up.
  if (G.aiming) {
    player.heading = Math.atan2(player.aimX - player.x, player.aimZ - player.z);
  }

  const u = player.group.userData;
  const swing = player.moving ? Math.sin(player.walkPhase) * 0.6 : 0;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.85;
  u.armR.rotation.x = swing * 0.85;
  player.group.position.set(player.x, Math.abs(Math.sin(player.walkPhase)) * (player.moving ? 0.06 : 0.01), player.z);
  player.group.rotation.y = player.heading;
}

// Damage routes through armour first (60% absorbed while armour lasts).
export function damagePlayer(G, amount) {
  const player = G.player;
  if (G.mode !== 'playing' || player.health <= 0) return;
  let remaining = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, amount * 0.6);
    player.armor -= absorbed;
    remaining -= absorbed;
  }
  player.health -= remaining;
  player.lastDamageAt = G.elapsed;
  G.hudFlash = 1;
  if (player.health <= 0) {
    player.health = 0;
    G.onWasted();
  }
}

export function healPlayer(G, amount) {
  G.player.health = clamp(G.player.health + amount, 0, 100);
}
