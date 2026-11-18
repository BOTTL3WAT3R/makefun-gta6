// people.js — the on-foot player character (Nico Ferrer) and Costa Vera's
// pedestrians: sidewalk walkers who flee danger, hail taxis, stop to chat
// in pairs, walk their dogs, and fall when hit.

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

// A dog: one merged mesh, trots at its owner's heel.
function makeDogMesh(coat) {
  const m = new THREE.Mesh(mergeParts([
    partBox(0.34, 0.34, 0.78, 0, 0.48, 0, coat),                 // body
    partBox(0.26, 0.26, 0.3, 0, 0.68, 0.48, coat),               // head
    partBox(0.1, 0.1, 0.24, 0, 0.6, 0.66, 0x2c2118),             // snout
    partBox(0.07, 0.2, 0.07, 0, 0.72, -0.44, coat, 0, -0.5),     // tail, up
    partBox(0.09, 0.34, 0.09, -0.1, 0.17, 0.28, coat), partBox(0.09, 0.34, 0.09, 0.1, 0.17, 0.28, coat),
    partBox(0.09, 0.34, 0.09, -0.1, 0.17, -0.28, coat), partBox(0.09, 0.34, 0.09, 0.1, 0.17, -0.28, coat),
  ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  m.castShadow = true;
  return m;
}

export class PeopleSystem {
  constructor(scene, world) {
    this.world = world; this.peds = [];
    for (let i = 0; i < 40; i++) {
      const mesh = makePersonMesh(pick(shirts), pick(pants), pick(skinTones), pick(shirts));
      const ped = {
        mesh, x: 0, z: 0, angle: rand(0, 6.28), speed: 0, health: 100,
        state: 'walk', fleeT: 0, downT: 0, phase: rand(0, 6), hail: false, route: null,
        chatT: 0, partner: null, dog: null,
      };
      this.placeOnSidewalk(ped, rand(-230, 230), rand(-200, 170));
      scene.add(mesh); this.peds.push(ped);
    }
    // Five of them walk dogs.
    for (let i = 0; i < 5; i++) {
      const ped = this.peds[i * 7 + 2];
      const dogMesh = makeDogMesh(pick([0x8a5e3a, 0xd8d2c4, 0x3a3230, 0xb0563a]));
      scene.add(dogMesh);
      ped.dog = { mesh: dogMesh, x: ped.x - 0.8, z: ped.z - 0.8, angle: ped.angle, phase: rand(0, 6) };
    }
    // Four pairs start out mid-conversation on the promenade and downtown.
    for (let i = 0; i < 4; i++) {
      const a = this.peds[30 + i * 2], b = this.peds[31 + i * 2];
      if (!a || !b) break;
      const sx = rand(-180, 180), sz = pick([171.5, -40 + 11.3, 40 - 11.3, 80 + 11.3]);
      this.placeOnSidewalk(a, sx, sz); this.placeOnSidewalk(b, sx + 1.1, sz + 0.4);
      b.x = a.x + 1.05; b.z = a.z + 0.35;
      a.angle = Math.atan2(b.x - a.x, b.z - a.z); b.angle = Math.atan2(a.x - b.x, a.z - b.z);
      a.state = b.state = 'chat'; a.chatT = b.chatT = rand(7, 15);
      a.partner = b; b.partner = a;
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
    ped.mesh.position.y = 0;
    if (ped.dog) { ped.dog.x = ped.x - 0.8; ped.dog.z = ped.z - 0.8; ped.dog.mesh.visible = true; }
  }
  damage(ped, dmg, G) {
    if (ped.state === 'down') return;
    ped.health -= dmg;
    if (ped.partner) { ped.partner.partner = null; ped.partner = null; }
    if (ped.health <= 0) {
      ped.state = 'down'; ped.downT = 0;
      ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.18;
      G.reportCrime && G.reportCrime('kill', ped.x, ped.z);
    } else {
      ped.state = 'flee'; ped.fleeT = 3;
      G.reportCrime && G.reportCrime('assault', ped.x, ped.z);
    }
  }
  stepDog(ped, dt) {
    const dog = ped.dog;
    if (!dog) return;
    if (ped.state === 'ride' || ped.state === 'gone') { dog.mesh.visible = false; return; }
    dog.mesh.visible = true;
    // heel: behind and to the left of the owner, trotting to keep up
    const hx = ped.x - Math.sin(ped.angle) * 0.85 - Math.cos(ped.angle) * 0.4;
    const hz = ped.z - Math.cos(ped.angle) * 0.85 + Math.sin(ped.angle) * 0.4;
    const d = dist2d(dog.x, dog.z, hx, hz);
    if (d > 0.15) {
      const sp = clamp(d * 2.2, 0.8, 5.2);
      dog.angle = angleLerp(dog.angle, Math.atan2(hx - dog.x, hz - dog.z), clamp(dt * 10, 0, 1));
      dog.x += Math.sin(dog.angle) * sp * dt;
      dog.z += Math.cos(dog.angle) * sp * dt;
      dog.phase += dt * sp * 4.2;
    }
    dog.mesh.position.set(dog.x, Math.abs(Math.sin(dog.phase)) * 0.05, dog.z);
    dog.mesh.rotation.y = dog.angle;
  }
  step(dt, G) {
    const danger = G.danger; // {x, z, t} recent violence / fast car
    for (const ped of this.peds) {
      if (ped.state === 'ride' || ped.state === 'gone') { this.stepDog(ped, dt); continue; }
      if (ped.state === 'down') {
        ped.downT += dt;
        this.stepDog(ped, dt);
        if (ped.downT > 7 && dist2d(ped.x, ped.z, G.player.x, G.player.z) > 60) {
          ped.mesh.rotation.x = 0; ped.mesh.position.y = 0;
          this.placeOnSidewalk(ped, G.player.x + rand(-160, 160), G.player.z + rand(-160, 160));
        }
        continue;
      }
      if (ped.state === 'chat') {
        ped.chatT -= dt;
        ped.phase += dt * 0.7;
        // idle talk: mostly still, an arm gesture now and then
        const u = ped.mesh.userData;
        u.armR.rotation.x = Math.sin(ped.phase * 1.7) > 0.72 ? -0.9 : 0.05;
        u.armL.rotation.x = Math.sin(ped.phase * 1.3 + 2) > 0.8 ? -0.7 : -0.05;
        syncPed(ped);
        if (danger && performance.now() - danger.t < 2000 && dist2d(ped.x, ped.z, danger.x, danger.z) < 15) {
          if (ped.partner) { ped.partner.partner = null; ped.partner = null; }
          ped.state = 'flee'; ped.fleeT = 2.6; ped.fleeFrom = { x: danger.x, z: danger.z };
        } else if (ped.chatT <= 0) {
          if (ped.partner) { ped.partner.partner = null; ped.partner = null; }
          ped.state = 'walk';
        }
        this.stepDog(ped, dt);
        continue;
      }
      let moveAngle = ped.angle, speed = 0;
      if (ped.hail) { // stands at the curb, arm up
        ped.mesh.userData.armR.rotation.x = -2.6;
        syncPed(ped); this.stepDog(ped, dt); continue;
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
      this.stepDog(ped, dt);
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
  const bob = moving && p.y === 0 ? Math.abs(Math.sin(p.phase)) * 0.045 : 0;
  p.mesh.position.set(p.x, p.y + bob, p.z);
  p.mesh.rotation.y = p.angle;
  animatePerson(p.mesh, p.phase, moving ? sprint : 0, G.aiming);
  return moving;
}
