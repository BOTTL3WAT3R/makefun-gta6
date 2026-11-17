// people.js — the on-foot player character (Nico Ferrer) and Costa Vera's
// pedestrians: sidewalk walkers who flee danger, hail taxis, and fall when hit.

import * as THREE from 'three';
import { mergeParts, partBox, AVENUES_X, STREETS_Z } from './world.js';
import { clamp, angleLerp, dist2d, collideCircle, pick, rand } from './util.js';

const skinTones = [0xf2c79b, 0xc98d5e, 0x8a5a34, 0x6e4226];
const shirts = [0xff6b5e, 0x3ec6ff, 0xffd94d, 0x7de28a, 0xff9ec4, 0xf2f2ee, 0xb48ce8, 0xff9a3d];
const pants = [0x2c3550, 0x5e4632, 0xd8d2c4, 0x37474f, 0x7a2e4d];

export function makePersonMesh(shirt, pant, skin, capColor) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const body = new THREE.Mesh(mergeParts([
    partBox(0.52, 0.74, 0.28, 0, 1.13, 0, shirt),          // torso
    partBox(0.3, 0.32, 0.3, 0, 1.68, 0, skin),              // head
    partBox(0.34, 0.09, 0.34, 0, 1.87, 0, capColor),        // cap
    partBox(0.34, 0.05, 0.2, 0, 1.84, 0.2, capColor),       // cap brim
  ]), cloth);
  body.castShadow = true;
  const limbGeoL = new THREE.BoxGeometry(0.15, 0.78, 0.18); limbGeoL.translate(0, -0.39, 0);
  const mkLimb = (geo, x, y, hex) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9 }));
    m.position.set(x, y, 0); m.castShadow = true;
    return m;
  };
  const legL = mkLimb(limbGeoL, -0.14, 0.78, pant), legR = mkLimb(limbGeoL.clone(), 0.14, 0.78, pant);
  const armGeo = new THREE.BoxGeometry(0.12, 0.66, 0.15); armGeo.translate(0, -0.33, 0);
  const armL = mkLimb(armGeo, -0.33, 1.44, shirt), armR = mkLimb(armGeo.clone(), 0.33, 1.44, shirt);
  g.add(body, legL, legR, armL, armR);
  g.userData = { legL, legR, armL, armR, body };
  return g;
}

export function animatePerson(mesh, phase, speedRatio, aiming) {
  const u = mesh.userData;
  const swing = Math.sin(phase) * 0.55 * speedRatio;
  u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
  u.armL.rotation.x = aiming ? -1.25 : -swing * 0.8;
  u.armR.rotation.x = aiming ? -1.35 : swing * 0.8;
}

export class PeopleSystem {
  constructor(scene, world) {
    this.world = world; this.peds = [];
    for (let i = 0; i < 26; i++) {
      const mesh = makePersonMesh(pick(shirts), pick(pants), pick(skinTones), pick(shirts));
      const ped = {
        mesh, x: 0, z: 0, angle: rand(0, 6.28), speed: 0, health: 100,
        state: 'walk', fleeT: 0, downT: 0, phase: rand(0, 6), hail: false, route: null,
      };
      this.placeOnSidewalk(ped, rand(-230, 230), rand(-200, 170));
      scene.add(mesh); this.peds.push(ped);
    }
  }
  placeOnSidewalk(ped, x, z) {
    // Snap to a sidewalk: offset from the nearest road centreline.
    let best = null;
    for (const ax of AVENUES_X) { const d = Math.abs(x - ax); if (!best || d < best.d) best = { d, axis: 'z', fixed: ax }; }
    for (const sz of STREETS_Z) { const d = Math.abs(z - sz); if (!best || d < best.d) best = { d, axis: 'x', fixed: sz }; }
    ped.route = { axis: best.axis, fixed: best.fixed, side: Math.random() < 0.5 ? -11.3 : 11.3 };
    ped.dir = Math.random() < 0.5 ? 1 : -1;
    if (best.axis === 'z') { ped.x = best.fixed + ped.route.side; ped.z = z; }
    else { ped.z = best.fixed + ped.route.side; ped.x = x; }
    ped.state = 'walk'; ped.health = 100; ped.mesh.rotation.set(0, ped.angle, 0);
  }
  damage(ped, dmg, G) {
    if (ped.state === 'down') return;
    ped.health -= dmg;
    if (ped.health <= 0) {
      ped.state = 'down'; ped.downT = 0;
      ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.18;
      G.reportCrime && G.reportCrime('kill', ped.x, ped.z);
    } else {
      ped.state = 'flee'; ped.fleeT = 3;
      G.reportCrime && G.reportCrime('assault', ped.x, ped.z);
    }
  }
  step(dt, G) {
    const danger = G.danger; // {x, z, t} recent violence / fast car
    for (const ped of this.peds) {
      if (ped.state === 'ride' || ped.state === 'gone') continue; // in a car, or removed
      if (ped.state === 'down') {
        ped.downT += dt;
        if (ped.downT > 7 && dist2d(ped.x, ped.z, G.player.x, G.player.z) > 60) {
          ped.mesh.rotation.x = 0; ped.mesh.position.y = 0;
          this.placeOnSidewalk(ped, G.player.x + rand(-160, 160), G.player.z + rand(-160, 160));
        }
        continue;
      }
      let moveAngle = ped.angle, speed = 0;
      if (ped.hail) { // stands at the curb, arm up
        ped.mesh.userData.armR.rotation.x = -2.6;
        syncPed(ped); continue;
      }
      if (danger && performance.now() - danger.t < 2600 && dist2d(ped.x, ped.z, danger.x, danger.z) < 17) {
        ped.state = 'flee'; ped.fleeT = 2.6;
        ped.fleeFrom = { x: danger.x, z: danger.z };
      }
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        const f = ped.fleeFrom || { x: G.player.x, z: G.player.z };
        moveAngle = Math.atan2(ped.x - f.x, ped.z - f.z);
        speed = 4.6;
        if (ped.fleeT <= 0) ped.state = 'walk';
      } else {
        // amble along the sidewalk; turn around at the world edge or randomly
        const r = ped.route;
        moveAngle = r.axis === 'z' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        speed = 1.35;
        const along = r.axis === 'z' ? ped.z : ped.x;
        if (along > 205 || along < -205 || Math.random() < dt * 0.01) ped.dir *= -1;
      }
      ped.angle = angleLerp(ped.angle, moveAngle, clamp(dt * 8, 0, 1));
      let nx = ped.x + Math.sin(ped.angle) * speed * dt;
      let nz = ped.z + Math.cos(ped.angle) * speed * dt;
      [nx, nz] = collideCircle(nx, nz, 0.42, this.world.colliders);
      ped.x = clamp(nx, -250, 250); ped.z = clamp(nz, -212, 210);
      ped.phase += dt * speed * 3.4;
      animatePerson(ped.mesh, ped.phase, clamp(speed / 2, 0, 1.4), false);
      syncPed(ped);
      // run over?
      for (const car of G.allCars) {
        if (Math.abs(car.speed) < 3.2) continue;
        if (dist2d(ped.x, ped.z, car.x, car.z) < 2.0) {
          this.damage(ped, 100, G);
          G.events.push({ type: 'pedHit', car, x: ped.x, z: ped.z });
          break;
        }
      }
    }
  }
}
function syncPed(ped) { ped.mesh.position.set(ped.x, ped.mesh.position.y, ped.z); ped.mesh.rotation.y = ped.angle; }

// On-foot movement for the player: camera-relative WASD, sprint, a small hop.
export function stepPlayerOnFoot(G, dt, input) {
  const p = G.player;
  const camYaw = G.camYaw;
  let mx = 0, mz = 0;
  if (input.f) mz += 1; if (input.b) mz -= 1;
  if (input.l) mx -= 1; if (input.r) mx += 1;
  const moving = (mx !== 0 || mz !== 0);
  const sprint = input.sprint ? 1.55 : 1;
  const speed = (moving ? 5.4 : 0) * sprint;
  if (moving) {
    const a = Math.atan2(mx, mz) + camYaw;
    p.angle = angleLerp(p.angle, a, clamp(dt * 12, 0, 1));
    let nx = p.x + Math.sin(a) * speed * dt;
    let nz = p.z + Math.cos(a) * speed * dt;
    [nx, nz] = collideCircle(nx, nz, 0.45, G.world.colliders);
    p.x = clamp(nx, -250, 250); p.z = clamp(nz, -212, 210);
    p.phase += dt * speed * 2.1;
    if (Math.random() < dt * speed * 0.55) G.audio.step();
  }
  if (input.jump && p.y <= 0) p.vy = 4.6;
  p.vy -= 13 * dt; p.y = Math.max(0, p.y + p.vy * dt);
  if (p.y === 0) p.vy = 0;
  p.speedNow = speed;
  p.mesh.position.set(p.x, p.y, p.z);
  p.mesh.rotation.y = p.angle;
  animatePerson(p.mesh, p.phase, moving ? sprint : 0, G.aiming);
  return moving;
}
