// people.js — the citizens of Costa Vera: low-poly pedestrians who stroll
// the sidewalks, chat in pairs, flee from trouble and fall when hurt, five
// dogs, and Nico Ferrer himself, the player's character.

import { makeRng, randRange, randPick, angleTowards, headingOf } from './util.js';
import { LAYOUT } from './world.js';

const SKIN = [0xf2c49b, 0xd99e6a, 0xa96b3f, 0x7a4a28, 0xffe0bd];
const SHIRTS = [0xff6b81, 0x4ecdc4, 0xffd23e, 0x5168b8, 0xf0ece2, 0xff9a5f, 0x7bc47f, 0xb06ab3, 0x38b2a8, 0xe05a4e];
const PANTS = [0x2c3e55, 0x4a3728, 0x555c66, 0x27313d, 0x6e4630, 0x37474f];

// One articulated figure: swinging legs and arms, a head that can wear a cap.
// Parts are returned so walkers can be animated and outfits recoloured.
export function makePersonMesh(THREE, shirt, pants, skin, capColor) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const legGeo = new THREE.BoxGeometry(0.17, 0.78, 0.19); legGeo.translate(0, -0.39, 0);
  const armGeo = new THREE.BoxGeometry(0.13, 0.68, 0.15); armGeo.translate(0, -0.34, 0);
  const legL = new THREE.Mesh(legGeo, pantsMat); legL.position.set(-0.11, 0.8, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat); legR.position.set(0.11, 0.8, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.24), shirtMat);
  torso.position.y = 1.1; torso.castShadow = true;
  const armL = new THREE.Mesh(armGeo, shirtMat); armL.position.set(-0.31, 1.38, 0);
  const armR = new THREE.Mesh(armGeo, shirtMat); armR.position.set(0.31, 1.38, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), skinMat);
  head.position.y = 1.58; head.castShadow = true;
  g.add(legL, legR, torso, armL, armR, head);
  if (capColor !== null && capColor !== undefined) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.09, 10),
      new THREE.MeshLambertMaterial({ color: capColor }));
    cap.position.y = 1.7; g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2),
      new THREE.MeshLambertMaterial({ color: capColor }));
    brim.position.set(0, 1.67, 0.2); g.add(brim);
  }
  g.userData.parts = { legL, legR, armL, armR, torso, head, shirtMat };
  return g;
}

export const NICO_OUTFITS = [
  { shirt: 0xff7847, pants: 0x27313d, name: 'Sunset Tee' },
  { shirt: 0x38b2a8, pants: 0xf0ece2, name: 'Marina Look' },
  { shirt: 0x2c2c34, pants: 0x2c2c34, name: 'Night Black' },
  { shirt: 0xffd23e, pants: 0x5168b8, name: 'Sol Yellow' },
];

export function makePlayerMesh(THREE) {
  const outfit = NICO_OUTFITS[0];
  const mesh = makePersonMesh(THREE, outfit.shirt, outfit.pants, 0xd99e6a, 0x22222e);
  return mesh;
}

export function setOutfit(THREE, playerMesh, idx) {
  const o = NICO_OUTFITS[idx % NICO_OUTFITS.length];
  playerMesh.userData.parts.shirtMat.color.setHex(o.shirt);
  return o;
}

function loopPoint(cx, cz, half, idx) {
  const corners = [
    { x: cx - half, z: cz - half }, { x: cx + half, z: cz - half },
    { x: cx + half, z: cz + half }, { x: cx - half, z: cz + half },
  ];
  return corners[((idx % 4) + 4) % 4];
}

function makeDogMesh(THREE, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.78), mat);
  body.position.y = 0.42; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.3), mat);
  head.position.set(0, 0.58, 0.5); g.add(head);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.34), mat);
  tail.position.set(0, 0.55, -0.5); tail.rotation.x = -0.6; g.add(tail);
  g.userData.tail = tail;
  return g;
}

// The crowd: 40 walkers and talkers plus 5 dogs, all animated in update().
export function createCrowd(THREE, scene) {
  const rng = makeRng(4242);
  const people = [], dogs = [];
  for (let i = 0; i < 40; i++) {
    const mesh = makePersonMesh(THREE, randPick(rng, SHIRTS), randPick(rng, PANTS),
      randPick(rng, SKIN), rng() < 0.4 ? randPick(rng, SHIRTS) : null);
    scene.add(mesh);
    const ped = {
      mesh, pos: mesh.position, heading: rng() * 6.28, health: 30,
      mode: 'walk', phase: rng() * 6.28, speed: randRange(rng, 1.1, 1.9),
      loop: null, wp: 0, fleeFrom: null, fleeT: 0, downT: 0, chatPartner: null,
    };
    if (i < 8) {
      // Chatting pairs stand together on corners and the plaza edge.
      const spots = [[12, 24], [-60, -60], [90, 100], [-160, -100]];
      const s = spots[Math.floor(i / 2)];
      ped.mode = 'chat';
      ped.pos.set(s[0] + (i % 2 ? 1.1 : -1.1), 0, s[1] + randRange(rng, -1, 1));
      ped.heading = i % 2 ? -Math.PI / 2 : Math.PI / 2;
    } else if (i < 12) {
      // Beach strollers walk the sand.
      ped.mode = 'beach';
      ped.pos.set(randRange(rng, -220, 220), 0, randRange(rng, 206, 228));
      ped.wp = rng() < 0.5 ? 1 : -1; // direction along the beach
    } else {
      const bx = randPick(rng, LAYOUT.cols), bz = randPick(rng, LAYOUT.rows);
      ped.loop = { cx: bx, cz: bz, half: 31.5 };
      ped.wp = Math.floor(rng() * 4);
      const start = loopPoint(bx, bz, 31.5, ped.wp);
      ped.pos.set(start.x + randRange(rng, -4, 4), 0, start.z + randRange(rng, -4, 4));
    }
    people.push(ped);
  }
  for (let i = 0; i < 5; i++) {
    const mesh = makeDogMesh(THREE, randPick(rng, [0xb08954, 0x6e4630, 0xe8e0d0, 0x3a3230]));
    scene.add(mesh);
    const owner = people[12 + i * 4];
    dogs.push({ mesh, pos: mesh.position, owner, phase: rng() * 6, speed: 2.2 });
  }

  function animateWalk(ped, dt, t, speedNow) {
    const swing = Math.sin(t * (4 + speedNow * 2.4) + ped.phase) * Math.min(0.65, 0.2 + speedNow * 0.22);
    const p = ped.mesh.userData.parts;
    p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 0.7; p.armR.rotation.x = swing * 0.7;
    ped.mesh.position.y = Math.abs(Math.sin(t * (4 + speedNow * 2.4) + ped.phase)) * 0.045;
  }

  function update(dt, t) {
    for (const ped of people) {
      const p = ped.mesh.userData.parts;
      if (ped.mode === 'down') {
        ped.downT -= dt;
        ped.mesh.rotation.x = -Math.PI / 2 * Math.min(1, (ped.downT > 9.6 ? 10 - ped.downT : 1));
        ped.mesh.position.y = 0.18;
        if (ped.downT <= 0) {
          ped.mode = 'flee'; ped.fleeT = 2; ped.health = Math.max(ped.health, 15);
          ped.mesh.rotation.x = 0; ped.mesh.position.y = 0;
        }
        continue;
      }
      if (ped.mode === 'flee') {
        ped.fleeT -= dt;
        const away = headingOf(ped.pos.x - ped.fleeFrom.x, ped.pos.z - ped.fleeFrom.z);
        ped.heading = angleTowards(ped.heading, away, dt * 5);
        ped.pos.x += Math.sin(ped.heading) * 4.4 * dt;
        ped.pos.z += Math.cos(ped.heading) * 4.4 * dt;
        animateWalk(ped, dt, t, 4.4);
        if (ped.fleeT <= 0) {
          ped.mode = ped.loop ? 'walk' : 'beach';
          if (!ped.loop && ped.mode === 'beach') ped.pos.z = Math.max(204, Math.min(230, ped.pos.z));
        }
      } else if (ped.mode === 'chat') {
        p.armR.rotation.x = Math.sin(t * 1.7 + ped.phase) * 0.25 - 0.15;
        p.armL.rotation.x = Math.sin(t * 1.3 + ped.phase) * 0.18;
        ped.mesh.position.y = Math.sin(t * 2 + ped.phase) * 0.012;
      } else if (ped.mode === 'beach') {
        ped.pos.x += ped.wp * ped.speed * dt;
        if (ped.pos.x > 232) ped.wp = -1;
        if (ped.pos.x < -232) ped.wp = 1;
        ped.heading = angleTowards(ped.heading, ped.wp > 0 ? Math.PI / 2 : -Math.PI / 2, dt * 3);
        animateWalk(ped, dt, t, ped.speed);
      } else {
        const target = loopPoint(ped.loop.cx, ped.loop.cz, ped.loop.half, ped.wp + 1);
        const dx = target.x - ped.pos.x, dz = target.z - ped.pos.z;
        if (Math.hypot(dx, dz) < 2.2) ped.wp = (ped.wp + 1) % 4;
        ped.heading = angleTowards(ped.heading, headingOf(dx, dz), dt * 4);
        ped.pos.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.pos.z += Math.cos(ped.heading) * ped.speed * dt;
        animateWalk(ped, dt, t, ped.speed);
      }
      ped.mesh.rotation.y = ped.heading;
    }
    for (const dog of dogs) {
      const o = dog.owner;
      const tx = o.pos.x - Math.sin(o.heading) * 1.1, tz = o.pos.z - Math.cos(o.heading) * 1.1;
      const dx = tx - dog.pos.x, dz = tz - dog.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.4) {
        const sp = Math.min(dog.speed + d * 0.4, 5);
        dog.pos.x += (dx / d) * sp * dt; dog.pos.z += (dz / d) * sp * dt;
        dog.mesh.rotation.y = headingOf(dx, dz);
        dog.mesh.position.y = Math.abs(Math.sin(t * 11 + dog.phase)) * 0.05;
      }
      dog.mesh.userData.tail.rotation.y = Math.sin(t * 6 + dog.phase) * 0.5;
    }
  }

  // Violence lands here: a hurt pedestrian falls, then flees when they rise.
  function hurtPed(ped, dmg, fromPos) {
    ped.health -= dmg;
    ped.fleeFrom = { x: fromPos.x, z: fromPos.z };
    if (ped.health <= 0 || dmg >= 12) {
      ped.mode = 'down'; ped.downT = 6;
      ped.mesh.userData.parts.legL.rotation.x = 0; ped.mesh.userData.parts.legR.rotation.x = 0;
    } else {
      ped.mode = 'flee'; ped.fleeT = 3.5;
    }
  }

  function scareNear(pos, radius) {
    for (const ped of people) {
      if (ped.mode === 'down') continue;
      if (Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z) < radius) {
        ped.mode = 'flee'; ped.fleeT = randRange(Math.random, 2, 4);
        ped.fleeFrom = { x: pos.x, z: pos.z };
      }
    }
  }

  return { people, dogs, update, hurtPed, scareNear };
}
