// police.js — the law of Costa Vera: a wanted level that rises with crime
// and cools when you lie low, cruisers that hunt with predictive steering,
// a helicopter at four stars, roadblocks at five, and the BUSTED arrest.

import * as THREE from '../three.module.min.js';
import { ROAD_X, ROAD_Z } from './config.js';
import { clamp, headingTo, turnToward } from './util.js';
import { resolveCollisions } from './city.js';
import { makeCarMesh, collideVehicles } from './vehicles.js';
import { damagePlayer, playerPos } from './player.js';
import { spawnTracer } from './combat.js';

export function createPolice(G) {
  return {
    wanted: 0,
    heatFloor: 0,
    lastCrimeAt: -99,
    quietSince: 0,
    units: [],
    heli: null,
    bustProgress: 0,
    roadblockCooldown: 0,
    wasFive: false,
  };
}

export function addWanted(G, stars) {
  const P = G.police;
  P.wanted = clamp(Math.max(P.wanted + stars, P.heatFloor), 0, 5);
  P.lastCrimeAt = G.elapsed;
}

export function setWanted(G, stars) {
  const P = G.police;
  P.wanted = clamp(Math.max(stars, P.heatFloor), 0, 5);
  P.lastCrimeAt = G.elapsed;
}

export function setHeatFloor(G, stars) {
  const P = G.police;
  P.heatFloor = stars;
  if (stars > 0) {
    P.wanted = Math.max(P.wanted, stars);
    P.lastCrimeAt = G.elapsed;
  }
}

// --- Cruiser visuals -----------------------------------------------------------

function makeCruiser(x, z, heading) {
  const group = makeCarMesh('sedan', 0xf0f0ee);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(1.94, 0.3, 4.44),
    new THREE.MeshLambertMaterial({ color: 0x1d2a47 }),
  );
  stripe.position.y = 0.62;
  stripe.castShadow = true;
  group.add(stripe);
  const barBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.1, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x22242a }),
  );
  barBase.position.set(0, 1.62, -0.2);
  barBase.castShadow = true;
  group.add(barBase);
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
  const blueMat = new THREE.MeshBasicMaterial({ color: 0x2255ff });
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.34), redMat);
  red.position.set(-0.31, 1.75, -0.2);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.34), blueMat);
  blue.position.set(0.31, 1.75, -0.2);
  group.add(red, blue);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  return {
    group, x, z, heading,
    speed: 0,
    mode: 'pursue', // 'pursue' | 'roadblock' | 'disabled'
    health: 100,
    fireTimer: 1.5,
    flashers: [redMat, blueMat],
    stats: { topSpeed: 47, accel: 24 },
    stuckTime: 0,
    farTime: 0,
    lastX: x,
    lastZ: z,
    detour: null,
    detourUntil: 0,
  };
}

// A road junction at a useful distance from the player, if one exists.
function junctionNear(G, minD, maxD) {
  const pp = playerPos(G.player);
  const options = [];
  for (const x of ROAD_X) {
    for (const z of ROAD_Z) {
      const d = Math.hypot(x - pp.x, z - pp.z);
      if (d >= minD && d <= maxD) options.push({ x, z });
    }
  }
  if (!options.length) return null;
  return options[Math.floor(Math.random() * options.length)];
}

function spawnCruiser(G, mode = 'pursue', at = null) {
  const pp = playerPos(G.player);
  let x;
  let z;
  if (at) {
    x = at.x; z = at.z;
  } else {
    // Appear at a junction a good distance away — close enough to matter,
    // far enough not to pop in: prefer 85–165 units, settle for nearer a road.
    const j = junctionNear(G, 85, 165) || junctionNear(G, 55, 420) || { x: pp.x + 120, z: pp.z };
    x = j.x + (Math.random() - 0.5) * 8;
    z = j.z + (Math.random() - 0.5) * 8;
  }
  const unit = makeCruiser(x, z, headingTo(x, z, pp.x, pp.z));
  unit.mode = mode;
  G.scene.add(unit.group);
  G.police.units.push(unit);
  return unit;
}

function removeUnit(G, unit) {
  G.scene.remove(unit.group);
  const i = G.police.units.indexOf(unit);
  if (i >= 0) G.police.units.splice(i, 1);
}

// --- Helicopter -----------------------------------------------------------------

function spawnHeli(G) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1d2a47 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 7.5), bodyMat);
  body.position.y = 0;
  body.castShadow = true;
  group.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 6.5), bodyMat);
  tail.position.set(0, 0.5, -6.4);
  tail.castShadow = true;
  group.add(tail);
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0x22242a, transparent: true, opacity: 0.55 });
  const rotor = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.1), rotorMat);
  rotor.rotation.x = -Math.PI / 2;
  rotor.position.y = 1.6;
  group.add(rotor);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a0, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 34, 18, 1, true), coneMat);
  cone.position.y = -18;
  group.add(cone);
  const pp = playerPos(G.player);
  group.position.set(pp.x + 30, 36, pp.z + 30);
  G.scene.add(group);
  return { group, rotor, fireTimer: 2.5, angle: Math.random() * 6 };
}

// --- The update -------------------------------------------------------------------

export function updatePolice(G, dt) {
  const P = G.police;
  const player = G.player;
  const pp = playerPos(player);
  const wanted = Math.max(P.wanted, P.heatFloor);
  P.roadblockCooldown = Math.max(0, P.roadblockCooldown - dt);

  // Cooling off: no crime and nobody close for a while, one star at a time.
  const nearest = P.units.reduce(
    (m, u) => Math.min(m, Math.hypot(u.x - pp.x, u.z - pp.z)),
    Infinity,
  );
  if (wanted > P.heatFloor && G.elapsed - P.lastCrimeAt > 16 && nearest > 60) {
    P.quietSince += dt;
    if (P.quietSince > 11) {
      P.wanted = Math.max(P.heatFloor, P.wanted - 1);
      P.quietSince = 0;
      P.lastCrimeAt = G.elapsed - 8; // partial credit toward the next drop
    }
  } else {
    P.quietSince = 0;
  }

  // Maintain the pursuit strength the wanted level calls for.
  const desired = wanted === 0 ? 0 : Math.min(6, wanted + 1);
  const active = P.units.filter((u) => u.mode === 'pursue').length;
  if (active < desired) spawnCruiser(G);
  if (wanted === 0) {
    for (const u of [...P.units]) removeUnit(G, u);
  }

  // Roadblock the moment five stars land (and again on a cooldown).
  if (wanted >= 5 && !P.wasFive && P.roadblockCooldown <= 0) spawnRoadblock(G);
  P.wasFive = wanted >= 5;

  // Helicopter joins at four stars.
  if (wanted >= 4 && !P.heli) P.heli = spawnHeli(G);
  if (wanted < 4 && P.heli) {
    G.scene.remove(P.heli.group);
    P.heli = null;
  }
  if (P.heli) updateHeli(G, dt);

  // Flashers.
  const phase = Math.floor(G.elapsed * 2.4) % 2;
  for (const u of P.units) {
    // HDR values on the lit side so the light bar blooms as it flashes.
    if (phase === 0) u.flashers[0].color.setRGB(3.2, 0.35, 0.25);
    else u.flashers[0].color.setRGB(0.37, 0.07, 0.05);
    if (phase === 0) u.flashers[1].color.setRGB(0.06, 0.11, 0.37);
    else u.flashers[1].color.setRGB(0.3, 0.45, 3.2);
  }

  for (const u of [...P.units]) updateCruiser(G, u, dt);

  // The arrest: close, slow and surrounded is how they take you.
  const playerSpeed = player.inVehicle ? Math.abs(player.inVehicle.speed) : (player.moving ? 6 : 0);
  const closeUnit = P.units.some(
    (u) => u.mode !== 'disabled' && Math.hypot(u.x - pp.x, u.z - pp.z) < (player.inVehicle ? 6 : 5.2),
  );
  if (wanted > 0 && closeUnit && playerSpeed < 2.6) {
    P.bustProgress += dt * (player.inVehicle ? 0.75 : 1);
    if (P.bustProgress >= 1.5) {
      P.bustProgress = 0;
      G.onBusted();
      return;
    }
  } else {
    P.bustProgress = Math.max(0, P.bustProgress - dt * 1.6);
  }
  G.bustProgress = P.bustProgress / 1.5;
}

function spawnRoadblock(G) {
  const P = G.police;
  P.roadblockCooldown = 45;
  const player = G.player;
  const heading = player.inVehicle ? player.inVehicle.heading : player.heading;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const cx = clamp(player.x + fx * 58, -460, 320);
  const cz = clamp(player.z + fz * 58, -460, 460);
  for (const side of [-6, 0, 6]) {
    const unit = spawnCruiser(G, 'roadblock', {
      x: cx + fz * side,
      z: cz - fx * side,
    });
    unit.heading = heading + Math.PI / 2;
    unit.group.rotation.y = unit.heading;
  }
  G.toast('Roadblock ahead!');
}

function updateCruiser(G, u, dt) {
  const P = G.police;
  const player = G.player;
  const pp = playerPos(player);
  const dist = Math.hypot(pp.x - u.x, pp.z - u.z);

  if (u.health <= 20 && u.mode !== 'disabled') {
    u.mode = 'disabled';
    u.speed = 0;
    u.disabledAt = G.elapsed;
  }
  if (u.mode === 'disabled') {
    u.group.position.set(u.x, 0, u.z);
    // A wrecked cruiser is towed away once the street has moved on.
    if (G.elapsed - (u.disabledAt || 0) > 25) removeUnit(G, u);
    return;
  }
  if (u.mode === 'roadblock') {
    if (dist < 30) u.mode = 'pursue';
    else {
      u.group.position.set(u.x, 0, u.z);
      return;
    }
  }

  // Hopeless cases are quietly repositioned, out of sight, back on a road.
  if (dist > 280) {
    u.farTime += dt;
    if (u.farTime > 6) {
      const j = junctionNear(G, 90, 150);
      if (j) {
        u.x = j.x; u.z = j.z; u.speed = 18; u.farTime = 0; u.stuckTime = 0;
      }
    }
  } else {
    u.farTime = 0;
  }

  // Predictive steering: aim where the player will be, not where they are.
  const pv = player.inVehicle
    ? { x: Math.sin(player.inVehicle.heading) * player.inVehicle.speed, z: Math.cos(player.inVehicle.heading) * player.inVehicle.speed }
    : { x: 0, z: 0 };
  const lead = clamp(dist / 46, 0, 1.1);
  let tx = pp.x + pv.x * lead;
  let tz = pp.z + pv.z * lead;
  // Wedged against a building? Break for the nearest junction — open road —
  // and come at the player again from there.
  if (u.detour && G.elapsed < u.detourUntil && dist > 12) {
    tx = u.detour.x;
    tz = u.detour.z;
    if (Math.hypot(tx - u.x, tz - u.z) < 9) u.detourUntil = 0;
  }
  const desired = Math.atan2(tx - u.x, tz - u.z);
  u.heading = turnToward(u.heading, desired, 2.1 * dt);

  const wanted = Math.max(P.wanted, P.heatFloor);
  const shootPost = wanted >= 3 && !player.inVehicle && dist > 10 && dist < 27;
  let targetSpeed = u.stats.topSpeed;
  if (dist < 16) targetSpeed = Math.max(Math.abs(player.inVehicle ? player.inVehicle.speed : 0) + 5, 13);
  // Against a suspect on foot, cruisers box in: creep up and hold position
  // close enough for the arrest instead of orbiting at speed.
  if (!player.inVehicle && dist < 8) targetSpeed = dist < 5 ? 0 : 6;
  if (shootPost) targetSpeed = 0;
  u.speed += clamp(targetSpeed - u.speed, -30 * dt, u.stats.accel * dt);
  u.x += Math.sin(u.heading) * u.speed * dt;
  u.z += Math.cos(u.heading) * u.speed * dt;

  const pos = { x: u.x, z: u.z };
  resolveCollisions(pos, 2.1);
  if (pos.x !== u.x || pos.z !== u.z) u.speed *= 0.55;
  u.x = clamp(pos.x, -486, 330);
  u.z = clamp(pos.z, -486, 486);

  // Stuck detection: commanded to move, barely moving, building in the way.
  const actualSpeed = Math.hypot(u.x - u.lastX, u.z - u.lastZ) / Math.max(dt, 0.001);
  u.lastX = u.x;
  u.lastZ = u.z;
  if (dist > 14 && u.speed > 12 && actualSpeed < 3) {
    u.stuckTime += dt;
    if (u.stuckTime > 1.1) {
      u.stuckTime = 0;
      const jx = ROAD_X.reduce((a, b) => (Math.abs(b - u.x) < Math.abs(a - u.x) ? b : a));
      const jz = ROAD_Z.reduce((a, b) => (Math.abs(b - u.z) < Math.abs(a - u.z) ? b : a));
      u.detour = { x: jx, z: jz };
      u.detourUntil = G.elapsed + 4;
    }
  } else {
    u.stuckTime = Math.max(0, u.stuckTime - dt);
  }

  // Contact with the player's car trades paint and speed.
  if (player.inVehicle) {
    collideVehicles(u, player.inVehicle);
    u.group.position.set(u.x, 0, u.z);
  }
  u.group.position.set(u.x, 0, u.z);
  u.group.rotation.y = u.heading;
  const spin = u.speed * dt * 2.4;
  for (const wheel of u.group.userData.wheels) wheel.rotation.x += spin;

  // Officers fire on a wanted, on-foot player at three stars and up.
  if (shootPost) {
    u.fireTimer -= dt;
    if (u.fireTimer <= 0) {
      u.fireTimer = 1.35 + Math.random() * 0.5;
      const from = { x: u.x, y: 1.3, z: u.z };
      const to = { x: pp.x + (Math.random() - 0.5) * 2, y: 1.1, z: pp.z + (Math.random() - 0.5) * 2 };
      spawnTracer(G, from, to, 0x9ac2ff);
      if (G.sfx) G.sfx.shot(true);
      if (Math.random() < 0.42) {
        damagePlayer(G, 4 + Math.random() * 4);
      }
    }
  }
}

function updateHeli(G, dt) {
  const heli = G.police.heli;
  const pp = playerPos(G.player);
  heli.angle += dt * 0.35;
  const tx = pp.x + Math.cos(heli.angle) * 20;
  const tz = pp.z + Math.sin(heli.angle) * 20;
  heli.group.position.x += (tx - heli.group.position.x) * Math.min(1, dt * 1.6);
  heli.group.position.z += (tz - heli.group.position.z) * Math.min(1, dt * 1.6);
  heli.group.position.y = 36 + Math.sin(G.elapsed * 0.8) * 1.6;
  heli.group.lookAt(pp.x, 0, pp.z);
  heli.rotor.rotation.z += dt * 28;

  // At five stars the helicopter opens fire in bursts.
  if (Math.max(G.police.wanted, G.police.heatFloor) >= 5) {
    heli.fireTimer -= dt;
    if (heli.fireTimer <= 0) {
      heli.fireTimer = 2.6;
      for (let i = 0; i < 3; i++) {
        const from = { x: heli.group.position.x, y: 34, z: heli.group.position.z };
        const to = { x: pp.x + (Math.random() - 0.5) * 6, y: 1, z: pp.z + (Math.random() - 0.5) * 6 };
        spawnTracer(G, from, to, 0x9ac2ff);
        if (Math.random() < 0.3) {
          if (G.player.inVehicle) G.player.inVehicle.health = Math.max(5, G.player.inVehicle.health - 5);
          else damagePlayer(G, 4);
        }
      }
      if (G.sfx) G.sfx.shot(true);
    }
  }
}

// Paint-shop respray / arrest / hospital: the pursuit simply ends.
export function clearPolice(G) {
  const P = G.police;
  for (const u of [...P.units]) removeUnit(G, u);
  if (P.heli) {
    G.scene.remove(P.heli.group);
    P.heli = null;
  }
  P.wanted = 0;
  P.heatFloor = 0;
  P.bustProgress = 0;
  P.wasFive = false;
}
