// world.js — builds Costa Vera: a sunset coastal city on a road grid, with a
// marina, beach, lighthouse, shops and palms. Also owns the shared layout
// constants every other system navigates by, and the static colliders.

import * as THREE from 'three';
import { rand, pick } from './util.js';

export const AVENUES_X = [-200, -120, -40, 40, 120, 200];   // north-south roads
export const STREETS_Z = [-160, -80, 0, 80, 160];            // east-west roads
export const ROAD_W = 16;
export const BOUNDS = { minX: -252, maxX: 252, minZ: -214, maxZ: 212 };
export const WATER_Z = 216;

export const LOCATIONS = {
  club:     { x: -160, z: 146, name: 'Club Brisa' },
  hotel:    { x: 80,   z: 144, name: 'Hotel Palma valet' },
  valetCar: { x: 88,   z: 149, angle: Math.PI },
  garage:   { x: -127, z: -22, name: 'Taller Sol' },
  clinic:   { x: 60,   z: -82, name: 'Clínica Brisa' },
  gunshop:  { x: 130,  z: 24,  name: 'Armería Faro' },
  safehouse:{ x: -204, z: -146, name: 'Piso franco — Calle Niebla' },
  marina:   { x: 150,  z: 196, name: 'Marina del Sol office' },
  yacht:    { x: 182,  z: 234, name: 'Yacht “Reina del Alba”' },
  lighthouse:{ x: 224, z: 184, name: 'Faro point parking' },
  raceStart:{ x: 8,    z: 160, name: 'Boardwalk race start' },
};
export const SHOPS = [
  { id: 'garage', name: 'TALLER SOL', service: 'Full repair — $60', x: -138, z: -22, door: LOCATIONS.garage },
  { id: 'clinic', name: 'CLÍNICA BRISA', service: 'Patch me up — $40', x: 60, z: -92, door: LOCATIONS.clinic },
  { id: 'gun', name: 'ARMERÍA FARO', service: 'Body armor — $100', x: 140, z: 24, door: LOCATIONS.gunshop },
];

// Deterministic layout dice, so the painted ground and the meshes always agree.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Merge simple geometries into one vertex-colored mesh (props, palms, cars).
export function mergeParts(parts) {
  const pos = [], nor = [], col = [], uv = [];
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const p of parts) {
    const g = (p.g.index ? p.g.toNonIndexed() : p.g).clone();
    g.applyMatrix4(p.m); nm.getNormalMatrix(p.m);
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    const ua = g.attributes.uv ? g.attributes.uv.array : new Float32Array(pa.length / 3 * 2);
    for (let i = 0; i < pa.length; i += 3) {
      v.set(na[i], na[i + 1], na[i + 2]).applyMatrix3(nm).normalize();
      pos.push(pa[i], pa[i + 1], pa[i + 2]); nor.push(v.x, v.y, v.z);
      col.push(p.c.r, p.c.g, p.c.b);
    }
    for (let i = 0; i < ua.length; i++) uv.push(ua[i]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}
const M4 = (x, y, z, ry = 0, rx = 0, rz = 0) => {
  const m = new THREE.Matrix4();
  m.makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.setPosition(x, y, z);
  return m;
};
export const partBox = (w, h, d, x, y, z, hex, ry = 0, rx = 0, rz = 0) =>
  ({ g: new THREE.BoxGeometry(w, h, d), m: M4(x, y, z, ry, rx, rz), c: new THREE.Color(hex) });
export const partCyl = (rt, rb, h, x, y, z, hex, seg = 10, rx = 0, rz = 0) =>
  ({ g: new THREE.CylinderGeometry(rt, rb, h, seg), m: M4(x, y, z, 0, rx, rz), c: new THREE.Color(hex) });

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Building facade: pastel wall, grid of windows; a matching emissive canvas
// carries only the lit windows so blocks glow as the sun drops.
function facadePair(base, litRatio, rng) {
  const lit = [];
  const map = canvasTex(128, 256, (c) => {
    c.fillStyle = base; c.fillRect(0, 0, 128, 256);
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, 0, 128, 10);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 5; x++) {
      const on = rng() < litRatio; lit.push(on);
      c.fillStyle = on ? '#ffd98c' : '#2c3542';
      c.fillRect(10 + x * 23, 18 + y * 26, 14, 16);
    }
  });
  const emissive = canvasTex(128, 256, (c) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, 128, 256);
    let i = 0;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 5; x++) {
      if (lit[i++]) { c.fillStyle = '#ffb85e'; c.fillRect(10 + x * 23, 18 + y * 26, 14, 16); }
    }
  });
  return { map, emissive };
}

export function buildWorld(scene) {
  const rng = mulberry32(20261117);
  const colliders = [];
  const W = { colliders, parkedSpots: [], packageSpots: [], update: null, setDusk: null };

  // ---- sky, sun, fog ----
  scene.fog = new THREE.Fog(0xf2a56b, 120, 780);
  const skyTex = canvasTex(64, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#274069'); g.addColorStop(0.42, '#7a4a6e');
    g.addColorStop(0.68, '#e2603f'); g.addColorStop(0.82, '#ffab5e'); g.addColorStop(1, '#ffd9a0');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 14), skyMat);
  scene.add(sky);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTex(128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,244,200,1)'); g.addColorStop(0.25, 'rgba(255,190,90,0.85)');
      g.addColorStop(1, 'rgba(255,150,60,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    }), fog: false, depthWrite: false }));
  sunSprite.scale.set(420, 420, 1); sunSprite.position.set(-1050, 210, -520);
  scene.add(sunSprite);
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x503a4a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110;
  sun.shadow.camera.far = 480; sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  W.sun = sun; W.hemi = hemi; W.skyMat = skyMat;

  // ---- ground: one big painted canvas (roads, promenade, sand) ----
  const X0 = -280, Z0 = -230, XW = 560, ZW = 500;
  const groundTex = canvasTex(2048, 1828, (c, w, h) => {
    // Canvas row 0 is the city's north edge (z = Z0): the plane's UVs put
    // v = 1 at world -Z, and CanvasTexture's flipY maps that to the top row.
    const cx = x => (x - X0) / XW * w, cy = z => (z - Z0) / ZW * h;
    const sx = v => v / XW * w, sz = v => v / ZW * h;
    c.fillStyle = '#8d8172'; c.fillRect(0, 0, w, h);
    // city block slabs
    c.fillStyle = '#9a8f7d';
    for (const bx of [[-248, -208], [-192, -128], [-112, -48], [-32, 32], [48, 112], [128, 192], [208, 248]])
      for (const bz of [[-208, -168], [-152, -88], [-72, -8], [8, 72], [88, 152]])
        c.fillRect(cx(bx[0]), cy(bz[0]), sx(bx[1] - bx[0]), sz(bz[1] - bz[0]));
    // roads
    c.fillStyle = '#33363d';
    for (const x of AVENUES_X) c.fillRect(cx(x - ROAD_W / 2), 0, sx(ROAD_W), h);
    for (const z of STREETS_Z) c.fillRect(0, cy(z - ROAD_W / 2), w, sz(ROAD_W));
    // lane dashes
    c.fillStyle = '#e8c96a';
    for (const x of AVENUES_X) for (let z = -224; z < 176; z += 14) c.fillRect(cx(x) - 1.5, cy(z), 3, sz(5));
    for (const z of STREETS_Z) for (let x = -272; x < 272; x += 14) c.fillRect(cx(x), cy(z) - 1.5, sx(5), 3);
    // crosswalks at intersections
    c.fillStyle = 'rgba(240,240,235,0.75)';
    for (const x of AVENUES_X) for (const z of STREETS_Z)
      for (let i = 0; i < 5; i++) {
        c.fillRect(cx(x - ROAD_W / 2 + 1.5), cy(z - 12.5 + i * 1.9), sx(ROAD_W - 3), sz(1.1));
        c.fillRect(cx(x - ROAD_W / 2 + 1.5), cy(z + 4.6 + i * 1.9), sx(ROAD_W - 3), sz(1.1));
      }
    // beach sand, then the promenade strip over its top edge
    c.fillStyle = '#e7c48c'; c.fillRect(0, cy(168), w, sz(216 - 168));
    c.fillStyle = '#cfa96f'; c.fillRect(0, cy(168), w, sz(10));
    // marina boardwalk
    c.fillStyle = '#a98f68'; c.fillRect(cx(138), cy(174), sx(96), sz(38));
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(XW, ZW),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(X0 + XW / 2, 0, Z0 + ZW / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- ocean ----
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1800, 620),
    new THREE.MeshStandardMaterial({ color: 0x14606e, roughness: 0.14, metalness: 0.5 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.4, WATER_Z + 300);
  scene.add(sea);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(560, 3.4),
    new THREE.MeshBasicMaterial({ color: 0xfff3da, transparent: true, opacity: 0.55 }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.06, WATER_Z + 1);
  scene.add(foam);

  // ---- buildings ----
  const facades = ['#e8b48f', '#d98e73', '#f0d3a0', '#b7c9c9', '#e39fb0', '#cbb7e2']
    .map(col => facadePair(col, 0.42, rng));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5c4a44, roughness: 0.9 });
  const shopRects = [
    { minX: -182, maxX: -138, minZ: 112, maxZ: 148 },  // Club Brisa lot
    { minX: -150, maxX: -124, minZ: -34, maxZ: -10 },  // Taller Sol lot
    { minX: 50, maxX: 72, minZ: -104, maxZ: -80 },     // Clínica lot
    { minX: 128, maxX: 154, minZ: 12, maxZ: 38 },      // Armería lot
    { minX: 58, maxX: 102, minZ: 100, maxZ: 140 },     // Hotel Palma lot
  ];
  const hitsShop = (x0, x1, z0, z1) => shopRects.some(r => x0 < r.maxX + 3 && x1 > r.minX - 3 && z0 < r.maxZ + 3 && z1 > r.minZ - 3);
  function addBuilding(x, z, w, d, hgt) {
    const f = facades[Math.floor(rng() * facades.length)];
    const mat = new THREE.MeshStandardMaterial({
      map: f.map, emissiveMap: f.emissive, emissive: 0xffb85e, emissiveIntensity: 0.5, roughness: 0.85 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d),
      [mat, mat, roofMat, roofMat, mat, mat]);
    mesh.position.set(x, hgt / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return mesh;
  }
  const lotBlocks = [];
  for (const bx of [[-248, -208], [-192, -128], [-112, -48], [-32, 32], [48, 112], [128, 192], [208, 248]]) {
    for (const bz of [[-208, -168], [-152, -88], [-72, -8], [8, 72], [88, 152]]) {
      const cxm = (bx[0] + bx[1]) / 2, czm = (bz[0] + bz[1]) / 2;
      const roll = rng();
      if (roll < 0.13) { lotBlocks.push([cxm, czm]); continue; }        // parking lot
      if (roll < 0.22) { W['plaza_' + cxm + '_' + czm] = [cxm, czm]; continue; } // plaza (palms only)
      const downtown = Math.abs(cxm) < 70 && czm > -90 && czm < 80;
      const spots = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
      const bw = (bx[1] - bx[0]) / 2 - 7, bd = (bz[1] - bz[0]) / 2 - 7;
      for (const s of spots) {
        if (rng() < 0.18) continue;
        const x = cxm + s[0] * (bx[1] - bx[0]) * 0.92, z = czm + s[1] * (bz[1] - bz[0]) * 0.92;
        if (hitsShop(x - bw / 2, x + bw / 2, z - bd / 2, z + bd / 2)) continue;
        const hgt = downtown ? rand(30, 62) : rand(11, 30);
        addBuilding(x, z, bw * rand(0.8, 1), hgt, bd * rand(0.8, 1));
      }
    }
  }
  // Landmark towers: the twin Torres del Alba downtown.
  addBuilding(-14, -44, 17, 17, 74); addBuilding(14, 44, 17, 17, 66);

  // ---- named buildings: club, hotel, shops ----
  function signTexture(text, bg, fg) {
    return canvasTex(512, 110, (c, w, h) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.font = 'bold 52px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = fg; c.fillText(text, w / 2, h / 2 + 2);
    });
  }
  function addNamedBuilding(x, z, w, d, hgt, color, sign, signColor) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    mesh.position.set(x, hgt / 2, z); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    if (sign) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, 2.6),
        new THREE.MeshBasicMaterial({ map: signTexture(sign, '#22131d', signColor) }));
      s.position.set(x, hgt - 1.2, z + d / 2 + 0.06);
      scene.add(s);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20),
        new THREE.MeshBasicMaterial({ color: 0xffcf6e, transparent: true, opacity: 0.3, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(x, 0.05, z + d / 2 + 3.4);
      scene.add(glow);
    }
    return mesh;
  }
  addNamedBuilding(-160, 130, 34, 20, 13, 0x7a2e4d, 'CLUB BRISA', '#ff9ec4');
  addNamedBuilding(80, 120, 40, 30, 34, 0xe8d9b0, 'HOTEL PALMA', '#ffe9a0');
  addNamedBuilding(-138, -22, 20, 18, 7, 0x8a8f96, 'TALLER SOL', '#aef3b0');
  addNamedBuilding(60, -92, 18, 16, 8, 0xf2f2ee, 'CLÍNICA BRISA', '#7de2ff');
  addNamedBuilding(140, 24, 20, 18, 7.5, 0x4d4438, 'ARMERÍA FARO', '#ffd94d');

  // ---- palms (instanced trunks + merged fronds per palm would be heavy; use
  // shared geometries and two meshes per palm, ~110 palms) ----
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7.5, 6);
  trunkGeo.translate(0, 3.75, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 });
  const leafTex = canvasTex(128, 128, (c) => {
    c.clearRect(0, 0, 128, 128); c.strokeStyle = '#2e7d46'; c.lineWidth = 7; c.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      c.beginPath(); c.moveTo(64, 64);
      c.quadraticCurveTo(64 + Math.cos(a) * 34, 64 + Math.sin(a) * 30 - 12, 64 + Math.cos(a) * 60, 64 + Math.sin(a) * 52 + 14);
      c.stroke();
    }
  });
  const frondGeo = new THREE.PlaneGeometry(7.6, 7.6); frondGeo.rotateX(-Math.PI / 2); frondGeo.translate(0, 7.6, 0);
  const frondMat = new THREE.MeshStandardMaterial({ map: leafTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1 });
  function addPalm(x, z, s = 1) {
    const g = new THREE.Group();
    const lean = rand(-0.09, 0.09);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.rotation.z = lean; trunk.castShadow = true;
    const fronds = new THREE.Mesh(frondGeo, frondMat);
    fronds.position.x = -Math.sin(lean) * 7.4; fronds.rotation.y = rand(0, 6.28);
    g.add(trunk); g.add(fronds); g.position.set(x, 0, z); g.scale.setScalar(s);
    scene.add(g);
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }
  for (let x = -244; x <= 244; x += 16) { if (rng() < 0.85) addPalm(x + rand(-3, 3), 171 + rand(0, 3)); if (rng() < 0.5) addPalm(x + rand(-3, 3), 186 + rand(0, 14), rand(0.85, 1.15)); }
  for (const key of Object.keys(W)) if (key.startsWith('plaza_')) {
    const [px, pz] = W[key];
    for (let i = 0; i < 5; i++) addPalm(px + rand(-16, 16), pz + rand(-16, 16));
    delete W[key];
  }
  for (let i = 0; i < 12; i++) addPalm(rand(-240, 240), rand(188, 208), rand(0.8, 1.2));

  // ---- parking lots: painted stalls + parked-car spots ----
  const propParts = [];
  for (const [lx, lz] of lotBlocks) {
    for (let i = -2; i <= 2; i++) {
      W.parkedSpots.push({ x: lx + i * 7.5, z: lz - 12, angle: 0 });
      W.parkedSpots.push({ x: lx + i * 7.5, z: lz + 12, angle: Math.PI });
    }
    propParts.push(partBox(46, 0.24, 40, lx, 0.12, lz, 0x4a4d52));
  }
  // Curbside spots along the avenues.
  for (const x of AVENUES_X) for (let z = -196; z <= 150; z += 29) {
    if (STREETS_Z.some(s => Math.abs(z - s) < 15)) continue;
    if (rng() < 0.45) W.parkedSpots.push({ x: x + (rng() < 0.5 ? -11.4 : 11.4), z: z + rand(-3, 3), angle: rng() < 0.5 ? 0 : Math.PI });
  }

  // ---- marina: pier, yacht, lighthouse, beach props ----
  for (let i = 0; i < 9; i++) propParts.push(partBox(7, 0.5, 6.4, 180, 0.55, 208 + i * 5.6, 0x9a7c58));
  propParts.push(partBox(3.2, 2.2, 10, 182, 1.1, 258, 0xf4f6f8));            // yacht hull
  propParts.push(partBox(2.4, 1.6, 5.5, 182, 2.9, 256, 0xdfe9ee));           // yacht cabin
  propParts.push(partCyl(0.16, 0.16, 7, 182, 6, 259, 0x8a8f96, 6));          // mast
  propParts.push(partCyl(2.6, 3.6, 15, 238, 7.5, 198, 0xe8e2d4, 12));        // lighthouse
  propParts.push(partCyl(2.9, 2.9, 2.4, 238, 16, 198, 0xc23b2e, 12));
  colliders.push({ minX: 235, maxX: 241, minZ: 195, maxZ: 201 });
  const lampLight = new THREE.PointLight(0xffe9a0, 60, 60, 1.6);
  lampLight.position.set(238, 17.5, 198); scene.add(lampLight);
  for (let i = 0; i < 14; i++) { // beach umbrellas
    const ux = rand(-230, 230), uz = rand(186, 206);
    propParts.push(partCyl(0.06, 0.06, 2.4, ux, 1.2, uz, 0xd8d8d8, 5));
    propParts.push(partCyl(0.1, 1.7, 0.8, ux, 2.6, uz, pick([0xff6b5e, 0xffd94d, 0x3ec6ff, 0xff9ec4]), 8));
  }
  // Street lamps along the coast road and downtown cross.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (let x = -232; x <= 232; x += 32) {
    propParts.push(partCyl(0.09, 0.12, 5.6, x, 2.8, 170, 0x3a3f45, 6));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), lampMat);
    bulb.position.set(x, 5.7, 170); scene.add(bulb);
  }
  const props = new THREE.Mesh(mergeParts(propParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  props.castShadow = true; props.receiveShadow = true;
  scene.add(props);

  // Hidden-package spots: alleys, beach, pier, plazas — all reachable on foot.
  const pkgSpots = [[-206, -170], [-46, -86], [6, 6], [118, -154], [206, 78], [-124, 84], [44, 166],
    [180, 226], [-88, 196], [232, 190], [-14, -166], [96, -14], [-238, 10], [150, 96], [24, -60]];
  W.packageSpots = pkgSpots.map(([x, z], i) => ({ id: i, x, z }));

  // ---- dusk control (screenshots + late-story mood) ----
  const dayFog = new THREE.Color(0xf2a56b), duskFog = new THREE.Color(0x3a2b52);
  W.setDusk = (f) => {
    sun.intensity = 2.4 - f * 1.5; sun.color.setHex(0xffb36b).lerp(new THREE.Color(0x8d7dff), f);
    hemi.intensity = 0.85 - f * 0.45;
    scene.fog.color.copy(dayFog).lerp(duskFog, f);
    skyMat.color.setScalar(1 - f * 0.52);
    lampLight.intensity = 60 + f * 160;
  };
  W.update = (dt, t) => { foam.material.opacity = 0.4 + Math.sin(t * 0.8) * 0.15; sea.position.y = -0.4 + Math.sin(t * 0.5) * 0.08; };
  return W;
}
