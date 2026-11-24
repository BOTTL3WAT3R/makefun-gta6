// city.js — builds Costa Vera itself: ground, roads, the promenade, the pier,
// the marina, and every building, then hands back the collision boxes the
// movement code needs. Layout is seeded, so the city is identical per load.

import * as THREE from '../three.module.min.js';
import { CITY, PLACES, ROAD_X, ROAD_Z } from './config.js';
import { makeRng, pick } from './util.js';

export const colliders = []; // {minX, maxX, minZ, maxZ} for solid buildings

const animated = { waterMaps: [], boats: [], fountain: null };

function canvasTexture(width, height, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

function facadeTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d8cbb6';
    ctx.fillRect(0, 0, w, h);
    const rng = makeRng(1234);
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 5; col++) {
        const lit = rng() > 0.62;
        ctx.fillStyle = lit ? '#ffca7a' : '#3d4a56';
        ctx.fillRect(10 + col * 23, 12 + row * 20, 14, 11);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, h - 14, w, 14);
  });
}

function roadTexture() {
  return canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a3d44';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8e2d2';
    ctx.fillRect(w / 2 - 2, 24, 4, 88); // one dash per tile, along the road
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }, 1, 40);
}

function roadTextureH() {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#3a3d44';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8e2d2';
    ctx.fillRect(24, h / 2 - 2, 88, 4); // one dash per tile, along the road
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }, 40, 1);
}

function planksTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#9a6b44';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(60,35,18,0.55)';
    for (let y = 0; y <= h; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,220,170,0.10)';
    for (let x = 0; x <= w; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
  }, 6, 70);
}

function waterTexture() {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2d6f8e';
    ctx.fillRect(0, 0, w, h);
    const rng = makeRng(77);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(255,190,120,0.10)' : 'rgba(160,220,255,0.10)';
      ctx.beginPath();
      ctx.ellipse(rng() * w, rng() * h, 8 + rng() * 22, 2 + rng() * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 10, 10);
  animated.waterMaps.push(tex);
  return tex;
}

function signTexture(text, bg, fg) {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = fg;
    ctx.font = 'bold 54px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

function addBox(scene, w, h, d, x, y, z, material, collide = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  if (collide) {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  return mesh;
}

function addSign(scene, text, x, y, z, rotY, bg = '#26324e', fg = '#ffd98a') {
  const mat = new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), mat);
  sign.position.set(x, y, z);
  sign.rotation.y = rotY;
  scene.add(sign);
  return sign;
}

const FACADE = facadeTexture();
const BUILDING_TINTS = [0xffffff, 0xf3d9b8, 0xe8a58c, 0x9fd4c8, 0xf0e6d2, 0xd98c6a, 0xb8c8e0, 0xf5efdf];
const ROOF_MAT = new THREE.MeshLambertMaterial({ color: 0x8a4a3a });

function building(scene, cx, cz, w, d, h, tint) {
  const mat = new THREE.MeshLambertMaterial({ map: FACADE, color: tint });
  addBox(scene, w, h, d, cx, h / 2, cz, mat, true);
  addBox(scene, w + 1.2, 1, d + 1.2, cx, h + 0.5, cz, ROOF_MAT, false);
}

// Blocks the generic filler must leave alone (key: "xBandIndex,zBandIndex").
const SPECIAL_BLOCKS = new Set([
  '0,1', // Comisaría
  '1,1', // Comisaría forecourt
  '2,4', // Clínica Sol
  '5,1', // Club Brisa
  '3,3', // Plaza del Faro
  '4,2', // Hotel Marea
  '0,7', // Lockup yard
  '4,6', // Brillo Pintura
  '1,6', // Armería Sol
  '1,3', // Café Alba
]);

const X_BANDS = [[-480, -372], [-348, -252], [-228, -132], [-108, -12], [12, 108], [132, 228]];
const Z_BANDS = [[-480, -372], [-348, -252], [-228, -132], [-108, -12], [12, 108], [132, 228], [252, 348], [372, 480]];

function fillBlocks(scene, rng) {
  for (let xi = 0; xi < X_BANDS.length; xi++) {
    for (let zi = 0; zi < Z_BANDS.length; zi++) {
      if (SPECIAL_BLOCKS.has(xi + ',' + zi)) continue;
      const [x0, x1] = X_BANDS[xi];
      const [z0, z1] = Z_BANDS[zi];
      const south = zi >= 6; // low villas near the south shore road
      // 2x2 plots per block, each usually built on.
      for (let px = 0; px < 2; px++) {
        for (let pz = 0; pz < 2; pz++) {
          if (rng() < 0.14) continue; // the odd empty lot / car park
          const cx = x0 + 26 + px * 48 + (rng() - 0.5) * 6;
          const cz = z0 + 26 + pz * 48 + (rng() - 0.5) * 6;
          const w = 20 + rng() * 14;
          const d = 20 + rng() * 14;
          const centreBoost = 1 - Math.min(1, Math.hypot(cx, cz) / 700);
          const h = south ? 8 + rng() * 7 : 13 + rng() * 30 + centreBoost * 34;
          building(scene, cx, cz, w, d, h, pick(rng, BUILDING_TINTS));
        }
      }
    }
  }
}

function buildSpecials(scene) {
  const stone = new THREE.MeshLambertMaterial({ color: 0xcfd6dd });
  const navy = new THREE.MeshLambertMaterial({ color: 0x33415e });
  // Comisaría — solid block in the north-west, sign facing the avenue.
  addBox(scene, 46, 16, 38, -392, 8, -316, navy, true);
  addBox(scene, 48, 1.4, 40, -392, 16.7, -316, stone, false);
  addSign(scene, 'COMISARÍA', -368.4, 11, -316, Math.PI / 2, '#1d2a47', '#ffd98a');
  // Clínica Sol — white block west of the centre.
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f0e8 });
  const teal = new THREE.MeshLambertMaterial({ color: 0x3f9e8e });
  addBox(scene, 42, 14, 32, -172, 7, 58, white, true);
  addBox(scene, 44, 4, 34, -172, 16, 58, teal, false);
  addSign(scene, 'CLÍNICA SOL', -150.4, 10, 58, Math.PI / 2, '#e8f4f1', '#1d6a5e');
  // Club Brisa — low coral club with a big sign, car park to its south.
  const coral = new THREE.MeshLambertMaterial({ color: 0xd96a4a });
  addBox(scene, 54, 11, 30, PLACES.clubBrisa.x, 5.5, PLACES.clubBrisa.z, coral, true);
  addSign(scene, 'CLUB BRISA', PLACES.clubBrisa.x, 9, PLACES.clubBrisa.z + 15.4, 0, '#5e1f14', '#ffd98a');
  // Hotel Marea — the tall one on the north-centre block.
  building(scene, PLACES.hotelMarea.x, PLACES.hotelMarea.z, 46, 30, 52, 0xf3d9b8);
  addSign(scene, 'HOTEL MAREA', PLACES.hotelMarea.x, 20, PLACES.hotelMarea.z + 15.4, 0, '#7a4a26', '#fff2cf');
  // Café Alba.
  const cafeMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc2 });
  addBox(scene, 30, 9, 24, -272, 4.5, -70, cafeMat, true);
  addSign(scene, 'CAFÉ ALBA', -272, 7.4, -57.6, 0, '#4a3220', '#ffe9bd');
  // Brillo Pintura — open-front garage.
  const garageMat = new THREE.MeshLambertMaterial({ color: 0x7fb3c8 });
  addBox(scene, 38, 9, 26, PLACES.paintShop.x, 4.5, 288, garageMat, true);
  addSign(scene, 'BRILLO PINTURA', PLACES.paintShop.x, 7.6, 274.6, Math.PI, '#274b5e', '#ffe9bd');
  // Armería Sol.
  const gunMat = new THREE.MeshLambertMaterial({ color: 0x8c8578 });
  addBox(scene, 30, 9, 24, -274, 4.5, 288, gunMat, true);
  addSign(scene, 'ARMERÍA SOL', -274, 7.4, 275.6, Math.PI, '#33302a', '#ffd98a');
  // Lavado Brisa — a drive-through canopy on posts, no walls to hit.
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x4a90b8 });
  addBox(scene, 30, 1.2, 20, 272, 7, 84, canopyMat, false);
  for (const [px, pz] of [[258, 76], [286, 76], [258, 92], [286, 92]]) {
    addBox(scene, 1.2, 7, 1.2, px, 3.5, pz, stone, true);
  }
  addSign(scene, 'LAVADO BRISA', 272, 8.6, 84, Math.PI / 2, '#274b5e', '#ffe9bd');
  // The lockup — a plain warehouse in the south-west yard.
  const warehouseMat = new THREE.MeshLambertMaterial({ color: 0x9a8f7c });
  addBox(scene, 46, 12, 32, -424, 6, 424, warehouseMat, true);
  addSign(scene, 'ALMACÉN 9', -400.4, 8, 424, Math.PI / 2, '#3d382e', '#ffd98a');
}

function buildGround(scene) {
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(1020, 1020),
    new THREE.MeshLambertMaterial({ color: 0x7c7466 }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.set(-90, 0, 0);
  scene.add(base);

  // Roads: a pale kerb slab under each, the asphalt strip on top.
  const kerbMat = new THREE.MeshLambertMaterial({ color: 0xa89c88 });
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTexture() });
  const roadMatH = new THREE.MeshLambertMaterial({ map: roadTextureH() });
  for (const x of ROAD_X) {
    const kerb = new THREE.Mesh(new THREE.PlaneGeometry(33, 984), kerbMat);
    kerb.rotation.x = -Math.PI / 2; kerb.position.set(x, 0.02, 0); scene.add(kerb);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(24, 984), roadMat);
    road.rotation.x = -Math.PI / 2; road.position.set(x, 0.04, 0); scene.add(road);
  }
  for (const z of ROAD_Z) {
    const kerb = new THREE.Mesh(new THREE.PlaneGeometry(792, 33), kerbMat);
    kerb.rotation.x = -Math.PI / 2; kerb.position.set(-90, 0.02, z); scene.add(kerb);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(792, 24), roadMatH);
    road.rotation.x = -Math.PI / 2; road.position.set(-90, 0.04, z); scene.add(road);
  }

  // Club Brisa car park and marina parking aprons.
  const lotMat = new THREE.MeshLambertMaterial({ color: 0x4a4d54 });
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(76, 42), lotMat);
  lot.rotation.x = -Math.PI / 2; lot.position.set(168, 0.05, -272); scene.add(lot);
  const marinaLot = new THREE.Mesh(new THREE.PlaneGeometry(56, 60), lotMat);
  marinaLot.rotation.x = -Math.PI / 2; marinaLot.position.set(292, 0.05, -318); scene.add(marinaLot);

  // The promenade: wooden boardwalk the length of the shore.
  const walk = new THREE.Mesh(
    new THREE.PlaneGeometry(84, 984),
    new THREE.MeshLambertMaterial({ map: planksTexture() }),
  );
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(CITY.promenadeX + 22, 0.06, 0);
  scene.add(walk);

  // Beach and sea.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 1020),
    new THREE.MeshLambertMaterial({ color: 0xe6c98c }),
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(356, 0.03, 0); scene.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 1400),
    new THREE.MeshLambertMaterial({ map: waterTexture(), transparent: true, opacity: 0.94 }),
  );
  sea.rotation.x = -Math.PI / 2; sea.position.set(372 + 380, -0.4, 0); scene.add(sea);
}

function buildPierAndMarina(scene) {
  const woodMat = new THREE.MeshLambertMaterial({ map: planksTexture() });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6a4a30 });
  // Pier deck, running east from the promenade.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(150, 1.2, 26), woodMat);
  deck.position.set(392, 1.1, CITY.pierZ);
  scene.add(deck);
  colliders.push({ minX: 466, maxX: 470, minZ: CITY.pierZ - 13, maxZ: CITY.pierZ + 13 }); // end stop
  for (let x = 330; x <= 460; x += 16) {
    addBox(scene, 1.2, 3.4, 1.2, x, -0.4, CITY.pierZ - 11, postMat, false);
    addBox(scene, 1.2, 3.4, 1.2, x, -0.4, CITY.pierZ + 11, postMat, false);
    addBox(scene, 0.8, 1, 24, x, 2.4, CITY.pierZ, postMat, false); // lamp posts along the pier
  }
  // Marina docks: three fingers of decking over the water, boats between.
  const hullColors = [0xe8e2d2, 0xb84a3a, 0x3a6a9e, 0xe8b93c, 0x3f9e63, 0xd8d3c8];
  for (let f = 0; f < 3; f++) {
    const z = -336 - f * 34;
    const finger = new THREE.Mesh(new THREE.BoxGeometry(96, 1, 8), woodMat);
    finger.position.set(384, 0.9, z);
    scene.add(finger);
    for (let b = 0; b < 2; b++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(11, 2.2, 3.6),
        new THREE.MeshLambertMaterial({ color: hullColors[(f * 2 + b) % hullColors.length] }),
      );
      hull.position.y = 0.6;
      boat.add(hull);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(4, 1.8, 2.6),
        new THREE.MeshLambertMaterial({ color: 0xf2efe6 }),
      );
      cabin.position.set(-0.6, 2.4, 0);
      boat.add(cabin);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 9),
        new THREE.MeshLambertMaterial({ color: 0x8a8a8a }),
      );
      mast.position.set(2.4, 5.4, 0);
      boat.add(mast);
      boat.position.set(356 + b * 44, 0, z + (b === 0 ? -9 : 9));
      boat.rotation.y = Math.PI / 2;
      scene.add(boat);
      animated.boats.push({ group: boat, phase: (f * 2 + b) * 1.3 });
    }
  }
}

const PALM_FROND_TEX = () => canvasTexture(128, 128, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#3f7a34';
  ctx.lineWidth = 5;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.quadraticCurveTo(
      w / 2 + Math.cos(a) * 34, h / 2 + Math.sin(a) * 20 - 12,
      w / 2 + Math.cos(a) * 58, h / 2 + Math.sin(a) * 34 + 16,
    );
    ctx.stroke();
  }
});

function buildPalmsAndLamps(scene, rng) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
  const frondMat = new THREE.MeshLambertMaterial({
    map: PALM_FROND_TEX(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
  });
  const palmSpots = [];
  for (let z = -456; z <= 456; z += 38) palmSpots.push([284 + (rng() - 0.5) * 8, z]);
  // A second, sea-side row of palms framing the promenade and the beach.
  for (let z = -438; z <= 456; z += 57) palmSpots.push([330 + (rng() - 0.5) * 6, z + (rng() - 0.5) * 10]);
  for (let i = 0; i < 16; i++) palmSpots.push([-440 + rng() * 660, -440 + rng() * 880]);
  for (const [x, z] of palmSpots) {
    if (Math.abs(x - Math.round(x / 120) * 120) < 16) continue; // keep off the avenues
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 7.5, 6), trunkMat);
    trunk.position.y = 3.75;
    trunk.rotation.z = (rng() - 0.5) * 0.14;
    palm.add(trunk);
    for (let p = 0; p < 3; p++) {
      const fronds = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 8.5), frondMat);
      fronds.position.y = 7.6;
      fronds.rotation.set(-Math.PI / 2 + (rng() - 0.5) * 0.5, 0, (p * Math.PI) / 3);
      palm.add(fronds);
    }
    palm.position.set(x, 0, z);
    scene.add(palm);
    colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
  }
  // Lamp posts along the promenade and plaza.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (let z = -440; z <= 440; z += 55) {
    for (const x of [268, 322]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 5.6, 5), poleMat);
      pole.position.set(x, 2.8, z);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), bulbMat);
      bulb.position.set(x, 5.8, z);
      scene.add(bulb);
    }
  }
}

const UMBRELLA_COLORS = [0xe84a5f, 0xf2b33c, 0x2e9e8f, 0x3a6fb7, 0xe86ab0, 0xf2782e, 0x7a4fa3, 0xe8e2d2];
const TOWEL_COLORS = [0xe84a5f, 0x2e9e8f, 0xf2b33c, 0x3a6fb7, 0xf5efdf, 0xe86ab0];

// Beach life on the sand east of the boardwalk: seeded colourful umbrellas
// (a pole and a cone canopy, no collider — you can stroll between them) with
// a towel laid out under most of them. Placement is all from the seeded rng.
function buildBeachLife(scene, rng) {
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xd8d3c8 });
  for (let i = 0; i < 46; i++) {
    const x = 342 + rng() * 24;
    const z = -452 + rng() * 904;
    if (Math.abs(z - CITY.pierZ) < 24) continue; // keep the pier root clear
    if (z > -436 && z < -300 && x > 330) continue; // keep the marina docks clear
    const color = pick(rng, UMBRELLA_COLORS);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 5), poleMat);
    pole.position.set(x, 1.15, z);
    pole.rotation.z = (rng() - 0.5) * 0.16;
    scene.add(pole);
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(2.35, 0.7, 9),
      new THREE.MeshLambertMaterial({ color }),
    );
    canopy.position.set(x + pole.rotation.z * -2.2, 2.35, z);
    scene.add(canopy);
    if (rng() < 0.78) {
      const towel = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.06, 2.0),
        new THREE.MeshLambertMaterial({ color: pick(rng, TOWEL_COLORS) }),
      );
      towel.position.set(x + 1.4 + rng() * 1.2, 0.09, z + (rng() - 0.5) * 2.4);
      towel.rotation.y = rng() * Math.PI;
      scene.add(towel);
    }
  }
}

// Boardwalk furniture: benches and planters alternating along the promenade,
// plus a second row of palms on the sea side of the walk. Benches and
// planters get small colliders; the palms reuse the palm collider size.
function buildBoardwalkFurniture(scene, rng) {
  const benchWood = new THREE.MeshLambertMaterial({ color: 0x8a5f36 });
  const benchIron = new THREE.MeshLambertMaterial({ color: 0x33383f });
  const planterMat = new THREE.MeshLambertMaterial({ color: 0xb0623f });
  const shrubMat = new THREE.MeshLambertMaterial({ color: 0x3f7a34 });
  for (let z = -430; z <= 430; z += 43) {
    const jz = z + (rng() - 0.5) * 6;
    if (Math.abs(jz - CITY.pierZ) < 18) continue; // pier entrance stays open
    // Bench facing the sea.
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.14, 2.4), benchWood);
    seat.position.y = 0.58;
    bench.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 2.4), benchWood);
    back.position.set(-0.3, 1.0, 0);
    bench.add(back);
    for (const dz of [-1.0, 1.0]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.12), benchIron);
      leg.position.set(0, 0.28, dz);
      bench.add(leg);
    }
    bench.position.set(318, 0, jz);
    scene.add(bench);
    colliders.push({ minX: 317.6, maxX: 318.4, minZ: jz - 1.2, maxZ: jz + 1.2 });
    // Planter with a shrub, a few metres along from the bench.
    const pz = jz + 14 + rng() * 6;
    addBox(scene, 0.9, 0.62, 2.0, 319, 0.31, pz, planterMat, true);
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.85, 7, 6), shrubMat);
    shrub.position.set(319, 1.0, pz);
    shrub.scale.y = 0.75;
    scene.add(shrub);
  }
}

function buildPlaza(scene) {
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(36, 28),
    new THREE.MeshLambertMaterial({ color: 0xb8a888 }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(PLACES.plaza.x, 0.07, PLACES.plaza.z);
  scene.add(disc);
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 1.6, 18),
    new THREE.MeshLambertMaterial({ color: 0x9a8f7c }),
  );
  basin.position.set(PLACES.plaza.x, 0.8, PLACES.plaza.z);
  scene.add(basin);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(6.2, 18),
    new THREE.MeshLambertMaterial({ color: 0x3f8eae }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(PLACES.plaza.x, 1.65, PLACES.plaza.z);
  scene.add(water);
  animated.fountain = water;
  colliders.push({ minX: PLACES.plaza.x - 8, maxX: PLACES.plaza.x + 8, minZ: PLACES.plaza.z - 8, maxZ: PLACES.plaza.z + 8 });
}

export function buildCity(scene) {
  const rng = makeRng(20261119);
  buildGround(scene);
  fillBlocks(scene, rng);
  buildSpecials(scene);
  buildPierAndMarina(scene);
  buildPalmsAndLamps(scene, rng);
  buildBeachLife(scene, rng);
  buildBoardwalkFurniture(scene, rng);
  buildPlaza(scene);
  return { colliders };
}

// What is under a point: movement rules differ on deck, sand and water.
export function surfaceAt(x, z) {
  if (z > CITY.pierZ - 14 && z < CITY.pierZ + 14 && x > 316 && x < 470) return 'pier';
  if (z > -428 && z < -312 && x > 330 && x < 436) return 'dock';
  if (x >= CITY.waterX) return 'water';
  if (x >= CITY.sandX) return 'sand';
  return 'land';
}

// Push a circle (position object with x/z) out of every building box.
export function resolveCollisions(pos, radius) {
  for (const box of colliders) {
    const nearX = Math.max(box.minX, Math.min(pos.x, box.maxX));
    const nearZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
    const dx = pos.x - nearX;
    const dz = pos.z - nearZ;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = nearX + (dx / d) * radius;
      pos.z = nearZ + (dz / d) * radius;
    } else {
      // Centre inside the box: push out along the smallest penetration.
      const left = pos.x - box.minX;
      const right = box.maxX - pos.x;
      const top = pos.z - box.minZ;
      const bottom = box.maxZ - pos.z;
      const min = Math.min(left, right, top, bottom);
      if (min === left) pos.x = box.minX - radius;
      else if (min === right) pos.x = box.maxX + radius;
      else if (min === top) pos.z = box.minZ - radius;
      else pos.z = box.maxZ + radius;
    }
  }
}

export function updateCity(dt, elapsed) {
  for (const map of animated.waterMaps) {
    map.offset.x = elapsed * 0.008;
    map.offset.y = Math.sin(elapsed * 0.11) * 0.02;
  }
  for (const boat of animated.boats) {
    boat.group.position.y = Math.sin(elapsed * 0.9 + boat.phase) * 0.22;
    boat.group.rotation.z = Math.sin(elapsed * 0.7 + boat.phase) * 0.03;
  }
  if (animated.fountain) animated.fountain.rotation.z = elapsed * 0.4;
}
