// combat.js — gunfire: the player's pistol, hostile return fire, tracers and
// muzzle flashes. Hitscan with a visible tracer for every shot.

import * as THREE from '../three.module.min.js';
import { clamp } from './util.js';
import { damagePlayer, playerPos } from './player.js';
import { downPerson, refreshHostileBar, scarePedsNear } from './people.js';

const TRACER_POOL = 28;
const tracers = [];
let tracerIndex = 0;
let lastPlayerShotAt = -9;
let lastPublicShotAt = -9;

export function initCombat(G) {
  for (let i = 0; i < TRACER_POOL; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffd98a, transparent: true, opacity: 0,
    }));
    line.frustumCulled = false;
    line.visible = false;
    G.scene.add(line);
    tracers.push({ line, life: 0 });
  }
  // Muzzle flash: a small additive star that pops at the gun for a frame.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffca7a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
  });
  G.muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), flashMat);
  G.muzzleFlash.visible = false;
  G.scene.add(G.muzzleFlash);
  G.muzzleAt = -9;
}

export function spawnTracer(G, from, to, color = 0xffd98a) {
  const t = tracers[tracerIndex++ % TRACER_POOL];
  const pos = t.line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  t.line.material.color.setHex(color);
  t.line.material.opacity = 0.9;
  t.line.visible = true;
  t.life = 0.07;
}

// Distance from a point to the shot segment (all in the XZ plane).
function segmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz || 1;
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return { dist: Math.hypot(px - cx, pz - cz), along: t * Math.sqrt(len2) };
}

// The player fires toward the aim point. Returns true if a shot was fired.
export function playerShoot(G) {
  const player = G.player;
  if (G.elapsed - lastPlayerShotAt < 0.27) return false;
  if (player.inVehicle || G.mode !== 'playing') return false;
  lastPlayerShotAt = G.elapsed;

  const from = { x: player.x, z: player.z };
  const aim = { x: player.aimX, z: player.aimZ };
  let dx = aim.x - from.x;
  let dz = aim.z - from.z;
  const aimDist = Math.hypot(dx, dz) || 1;
  dx /= aimDist; dz /= aimDist;
  const range = 75;
  const end = { x: from.x + dx * range, z: from.z + dz * range };

  // Find the closest hittable thing along the line of fire.
  let best = null;
  const consider = (x, z, radius, kind, ref) => {
    const { dist, along } = segmentDistance(x, z, from.x, from.z, end.x, end.z);
    if (dist < radius && along > 1 && (!best || along < best.along)) {
      best = { along, kind, ref, x: from.x + dx * along, z: from.z + dz * along };
    }
  };
  for (const h of G.hostiles) if (h.mode !== 'down') consider(h.x, h.z, 1.15, 'hostile', h);
  for (const p of G.peds) if (p.mode !== 'down') consider(p.x, p.z, 1.0, 'ped', p);
  for (const v of G.vehicles) consider(v.x, v.z, 2.3, 'vehicle', v);
  for (const u of G.police.units) consider(u.x, u.z, 2.3, 'police', u);

  const muzzle = {
    x: from.x + Math.sin(player.heading) * 0.55,
    y: 1.28,
    z: from.z + Math.cos(player.heading) * 0.55,
  };
  const hitPoint = best
    ? { x: best.x, y: 1.1, z: best.z }
    : { x: from.x + dx * 42, y: 1.0, z: from.z + dz * 42 };
  spawnTracer(G, muzzle, hitPoint);
  G.muzzleFlash.position.set(muzzle.x, muzzle.y, muzzle.z);
  G.muzzleFlash.quaternion.copy(G.camera.quaternion);
  G.muzzleFlash.visible = true;
  G.muzzleAt = G.elapsed;
  if (G.sfx) G.sfx.shot();
  scarePedsNear(G, from.x, from.z, 26);

  if (best) {
    if (best.kind === 'hostile') {
      best.ref.hp -= 34;
      refreshHostileBar(best.ref);
      scarePedsNear(G, best.ref.x, best.ref.z, 18);
      if (best.ref.hp <= 0) {
        downPerson(best.ref);
        if (G.sfx) G.sfx.thud();
      }
    } else if (best.kind === 'ped') {
      downPerson(best.ref);
      G.addWanted(2);
      G.toast('You shot a civilian. The city noticed.');
    } else if (best.kind === 'vehicle') {
      best.ref.health = Math.max(5, best.ref.health - 9);
    } else if (best.kind === 'police') {
      best.ref.health -= 12;
      G.addWanted(1);
    }
  }

  // Gunfire in earshot of a patrol raises the heat, throttled.
  if (G.elapsed - lastPublicShotAt > 2.5) {
    lastPublicShotAt = G.elapsed;
    const pp = playerPos(player);
    const heard = G.police.units.some((u) => Math.hypot(u.x - pp.x, u.z - pp.z) < 58);
    if (heard) G.addWanted(1);
  }
  return true;
}

// One hostile takes a shot at the player.
function hostileShoot(G, h) {
  const player = G.player;
  const pp = playerPos(player);
  const from = { x: h.x, y: 1.3, z: h.z };
  const spread = () => (Math.random() - 0.5) * 2.4;
  const to = { x: pp.x + spread(), y: 1.1, z: pp.z + spread() };
  spawnTracer(G, from, to, 0xff9a6a);
  if (G.sfx) G.sfx.shot(true);
  const dist = Math.hypot(pp.x - h.x, pp.z - h.z);
  const hitChance = clamp(0.66 - dist * 0.011, 0.22, 0.6);
  if (Math.random() < hitChance) {
    if (player.inVehicle) player.inVehicle.health = Math.max(5, player.inVehicle.health - 5);
    else damagePlayer(G, 5 + Math.random() * 4);
  }
}

export function updateCombat(G, dt) {
  for (const t of tracers) {
    if (!t.line.visible) continue;
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
    if (t.life <= 0) t.line.visible = false;
  }
  if (G.muzzleFlash && G.elapsed - G.muzzleAt > 0.045) G.muzzleFlash.visible = false;

  const pp = playerPos(G.player);
  for (const h of G.hostiles) {
    if (h.mode === 'down') continue;
    h.fireTimer -= dt;
    const dist = Math.hypot(pp.x - h.x, pp.z - h.z);
    if (h.fireTimer <= 0 && dist < 36) {
      hostileShoot(G, h);
      h.fireTimer = 1.25 + Math.random() * 0.95;
    }
  }
}
