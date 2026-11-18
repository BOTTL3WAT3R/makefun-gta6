// police.js — Costa Vera's law: the wanted system (heat, stars, decay), the
// pursuit fleet with predictive steering and flanking, foot officers who
// shoot at three stars, the helicopter at four, roadblocks at five, and the
// BUSTED meter that fills when the law corners a slow or walking player.

import { clamp, angleTowards, headingOf } from './util.js';
import { LAYOUT } from './world.js';
import { driveCar } from './vehicles.js';
import { makePersonMesh } from './people.js';

const DISPATCH = {
  1: 'Unit rolling to a reported disturbance.',
  2: 'All patrols converge on the suspect.',
  3: 'Shots fired — officers cleared to return fire.',
  4: 'Air support inbound. Repeat, air support inbound.',
  5: 'Roadblocks going up across Costa Vera. Bring him in.',
};
const DESIRED_CARS = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

export function createPolice(THREE, scene, fleet, effects) {
  let heat = 0, starFloor = 0, lastCrimeAt = -99, busted01 = 0;
  let spawnT = 0, roadblockCd = 0, heli = null, roadblockUnits = [];
  const cars = [], officers = [];
  const stars = () => heat <= 0 ? 0 : Math.min(5, Math.max(starFloor, Math.ceil(heat / 100)));

  function addHeat(G, n, why) {
    const before = stars();
    heat = Math.min(500, heat + n);
    lastCrimeAt = G.time;
    const now = stars();
    if (now > before && DISPATCH[now]) {
      G.hud.toast('DISPATCH', DISPATCH[now], 'warn');
      G.audio.alarm();
    }
  }
  function setStars(n) { heat = n <= 0 ? 0 : (n - 1) * 100 + 50; }
  function setStarFloor(n) { starFloor = n; if (stars() < n) setStars(n); }

  function spawnPointNear(G) {
    // A road junction a few blocks away, so units arrive rather than appear.
    const p = G.playerPos();
    const rx = LAYOUT.vRoads.reduce((a, b) => Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a);
    const rz = LAYOUT.hRoads.reduce((a, b) => Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a);
    const dir = Math.random() < 0.5 ? 1 : -1;
    return {
      x: clamp(rx + dir * 76 * (Math.random() < 0.5 ? 1 : 0), -232, 232),
      z: clamp(rz + (Math.random() < 0.5 ? 1 : -1) * 76, -194, 194),
    };
  }

  function spawnCar(G) {
    const car = fleet.spawnOne('sedan', 0xf2f2f2, 'police');
    const s = spawnPointNear(G);
    car.pos.set(s.x, 0, s.z);
    car.heading = Math.random() * 6.28;
    car.mode = 'police'; car.officersOut = false;
    cars.push(car);
    G.combat.registerTarget(car.mesh, 'car', car);
    return car;
  }

  function spawnOfficer(G, fromCar) {
    const mesh = makePersonMesh(THREE, 0x27355e, 0x1d2436, 0xd99e6a, 0x1d2436);
    scene.add(mesh);
    const off = {
      mesh, pos: mesh.position, health: 45, dead: false,
      heading: 0, shootT: 1 + Math.random() * 1.4, phase: Math.random() * 6,
    };
    off.pos.set(fromCar.pos.x + 1.6, 0, fromCar.pos.z + 1.2);
    officers.push(off);
    G.combat.registerTarget(mesh, 'officer', off);
    return off;
  }

  function hurtOfficer(off, dmg, fromPos) {
    if (off.dead) return;
    off.health -= dmg;
    if (off.health <= 0) {
      off.dead = true;
      off.mesh.rotation.x = -Math.PI / 2; off.mesh.position.y = 0.18;
      off.removeAt = performance.now() / 1000 + 9;
    }
  }

  function buildHelicopter() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2c3550 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.9, 5.6), bodyMat); g.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x9fd4ff }));
    glass.position.set(0, 0.25, 2.4); g.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.6), bodyMat);
    tail.position.set(0, 0.3, -4.8); g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.08, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x14141a }));
    rotor.position.y = 1.25; g.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x14141a }));
    tailRotor.position.set(0.3, 0.5, -7); g.add(tailRotor);
    for (const sx of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 4.4), bodyMat);
      skid.position.set(sx * 1.1, -1.25, 0); g.add(skid);
    }
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 6.5, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    cone.position.y = -14; g.add(cone);
    const spot = new THREE.SpotLight(0xfff2b0, 1.6, 60, 0.32, 0.5);
    spot.position.set(0, -1, 0); g.add(spot); g.add(spot.target);
    scene.add(g);
    return { mesh: g, rotor, spot, angle: 0 };
  }

  function deployRoadblock(G) {
    const p = G.playerPos(), v = G.playerVel();
    const sp = Math.hypot(v.x, v.z);
    const nx = sp > 1 ? v.x / sp : Math.sin(G.playerHeading());
    const nz = sp > 1 ? v.z / sp : Math.cos(G.playerHeading());
    let bx = p.x + nx * 58, bz = p.z + nz * 58;
    if (Math.abs(v.x) > Math.abs(v.z)) bx = LAYOUT.vRoads.reduce((a, b) => Math.abs(b - bx) < Math.abs(a - bx) ? b : a);
    else bz = LAYOUT.hRoads.reduce((a, b) => Math.abs(b - bz) < Math.abs(a - bz) ? b : a);
    bx = clamp(bx, -230, 230); bz = clamp(bz, -196, 196);
    for (let i = 0; i < 2; i++) {
      const car = fleet.spawnOne('sedan', 0xf2f2f2, 'police');
      const along = Math.abs(v.x) > Math.abs(v.z);
      car.pos.set(along ? bx : bx - 3 + i * 6, 0, along ? bz - 3 + i * 6 : bz);
      car.heading = (along ? Math.PI / 2 : 0) + (i ? 0.35 : -0.35);
      car.mesh.rotation.y = car.heading;
      car.mode = 'roadblock';
      roadblockUnits.push(car); cars.push(car);
      G.combat.registerTarget(car.mesh, 'car', car);
      spawnOfficer(G, car);
    }
    G.hud.toast('DISPATCH', 'Roadblock ahead — they are boxing you in.', 'warn');
  }

  function removeCar(G, car) {
    scene.remove(car.mesh);
    const fi = fleet.all.indexOf(car); if (fi >= 0) fleet.all.splice(fi, 1);
    const ci = cars.indexOf(car); if (ci >= 0) cars.splice(ci, 1);
  }

  function update(dt, G) {
    const now = G.time, lvl = stars();
    // Heat cools when the player lies low; the finale's floor holds it up.
    if (now - lastCrimeAt > 7 && heat > 0) {
      heat = Math.max(starFloor > 0 ? (starFloor - 1) * 100 + 1 : 0, heat - dt * (lvl >= 4 ? 3 : 5));
    }
    roadblockCd -= dt; spawnT -= dt;
    const p = G.playerPos(), pv = G.playerVel();

    if (lvl > 0 && cars.filter(c => c.mode === 'police').length < DESIRED_CARS[lvl] && spawnT <= 0) {
      spawnCar(G); spawnT = 3.5;
    }
    if (lvl >= 5 && roadblockCd <= 0) { deployRoadblock(G); roadblockCd = 34; }

    // ---- pursuit cars ----
    let nearest = 1e9;
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      const d = Math.hypot(car.pos.x - p.x, car.pos.z - p.z);
      nearest = Math.min(nearest, d);
      if (d > 210 || (lvl === 0 && d > 60)) { removeCar(G, car); continue; }
      if (car.mode === 'roadblock' || car.dead) continue;
      const lead = clamp(d / 24, 0, 1.15);
      let tx = p.x + pv.x * lead, tz = p.z + pv.z * lead;
      if (i % 2 === 1) { tx += -pv.z * 0.4 * 6; tz += pv.x * 0.4 * 6; } // the flanker cuts the corner
      const want = headingOf(tx - car.pos.x, tz - car.pos.z);
      let diff = (want - car.heading) % (Math.PI * 2);
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      const playerSlow = Math.hypot(pv.x, pv.z) < 2 && !G.playerInCar();
      const input = {
        throttle: Math.abs(diff) > 2.2 ? -0.5 : 1,
        steer: clamp(diff * 1.7, -1, 1),
        brake: d < 6 && !playerSlow,
      };
      if (playerSlow && d < 9) { input.throttle = 0; input.brake = true; }
      driveCar(dt, car, input, G.world.colliders, fleet.all);
      // Officers bail out when the suspect is on foot and they are close.
      if (playerSlow && d < 13 && !car.officersOut && officers.filter(o => !o.dead).length < 8) {
        car.officersOut = true;
        spawnOfficer(G, car); spawnOfficer(G, car);
      }
      // Light bar strobes.
      const lb = car.mesh.userData.lightbar;
      if (lb) {
        const phase = Math.floor(now * 6 + i) % 2 === 0;
        lb.red.color.setHex(phase ? 0xff2222 : 0x551111);
        lb.blue.color.setHex(phase ? 0x112255 : 0x3366ff);
      }
    }
    G.audio.setSiren(lvl > 0 && nearest < 90, clamp(1 - nearest / 90, 0, 1));

    // ---- helicopter ----
    if (lvl >= 4) {
      if (!heli) { heli = buildHelicopter(); G.audio.setRotor(true); G.hud.toast('DISPATCH', 'Air support has eyes on the suspect.', 'warn'); }
      heli.angle += dt * 0.35;
      const hx = p.x + Math.cos(heli.angle) * 17, hz = p.z + Math.sin(heli.angle) * 17;
      heli.mesh.position.set(hx, 26 + Math.sin(now * 0.8) * 1.2, hz);
      heli.mesh.rotation.y = headingOf(p.x - hx, p.z - hz);
      heli.rotor.rotation.y += dt * 28;
      heli.spot.target.position.set(p.x - hx, -26, p.z - hz);
    } else if (heli) {
      scene.remove(heli.mesh); heli = null; G.audio.setRotor(false);
    }

    // ---- officers on foot ----
    let cornering = false;
    for (let i = officers.length - 1; i >= 0; i--) {
      const off = officers[i];
      if (off.dead) {
        if (performance.now() / 1000 > off.removeAt) { scene.remove(off.mesh); officers.splice(i, 1); }
        continue;
      }
      const d = Math.hypot(off.pos.x - p.x, off.pos.z - p.z);
      if (d > 200 || lvl === 0) { scene.remove(off.mesh); officers.splice(i, 1); continue; }
      const wantDist = lvl >= 3 ? 11 : 4.5;
      const dirx = (off.pos.x - p.x) / (d || 1), dirz = (off.pos.z - p.z) / (d || 1);
      let mx = 0, mz = 0;
      if (d > wantDist + 1.5) { mx = -dirx; mz = -dirz; }
      else if (d < wantDist - 1.5) { mx = dirx; mz = dirz; }
      const strafe = Math.sin(now * 0.7 + off.phase) * 0.5;
      mx += -dirz * strafe; mz += dirx * strafe;
      const ml = Math.hypot(mx, mz) || 1;
      const sp = d > 20 ? 4.6 : 2.6;
      off.pos.x += (mx / ml) * sp * dt; off.pos.z += (mz / ml) * sp * dt;
      off.heading = angleTowards(off.heading, headingOf(p.x - off.pos.x, p.z - off.pos.z), dt * 6);
      off.mesh.rotation.y = off.heading;
      const parts = off.mesh.userData.parts;
      const sw = Math.sin(now * 8 + off.phase) * 0.4;
      parts.legL.rotation.x = sw; parts.legR.rotation.x = -sw;
      if (d < 6.5) cornering = true;
      // Gunfire at three stars and up.
      off.shootT -= dt;
      if (lvl >= 3 && off.shootT <= 0 && d < 30) {
        off.shootT = 1.15 + Math.random() * 0.9;
        const from = off.pos.clone(); from.y += 1.35;
        const to = p.clone(); to.y += 1.1;
        effects.tracer(from, to); effects.muzzle(from);
        G.audio.distantShot();
        const pSpeed = Math.hypot(pv.x, pv.z);
        const chance = clamp(0.6 - d * 0.011 - pSpeed * 0.014, 0.1, 0.55);
        if (Math.random() < chance) G.damagePlayer((4 + Math.random() * 5) * (G.playerInCar() ? 0.55 : 1));
        else effects.sparks(to, 0xffe9a8);
      }
    }

    // ---- the BUSTED meter ----
    const playerSpeed = Math.hypot(pv.x, pv.z);
    const boxed = lvl > 0 && playerSpeed < 2.2 &&
      (cornering || cars.some(c => Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < 7));
    if (boxed) busted01 = Math.min(1, busted01 + dt / 2.4);
    else busted01 = Math.max(0, busted01 - dt * 1.6);
    if (busted01 >= 1) { busted01 = 0; heat = 0; starFloor = 0; G.onBusted(); }
    return { stars: lvl, busted01, nearest };
  }

  function clearAll(G) {
    for (let i = cars.length - 1; i >= 0; i--) removeCar(G, cars[i]);
    for (const off of officers) scene.remove(off.mesh);
    officers.length = 0; roadblockUnits = [];
    if (heli) { scene.remove(heli.mesh); heli = null; G.audio.setRotor(false); }
    heat = 0; starFloor = 0; busted01 = 0;
  }

  return {
    update, clearAll, hurtOfficer,
    addHeat: (n, why) => addHeat(currentG, n, why),
    setStars, setStarFloor,
    get stars() { return stars(); },
    get busted01() { return busted01; },
    get heliUp() { return !!heli; },
    officers, cars,
    bind(G) { currentG = G; },
  };
  var currentG = null;
}
