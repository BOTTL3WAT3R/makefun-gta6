// world.js — builds Costa Vera: a sunset coastal city on a road grid, with a
// marina, beach, lighthouse, shops, palms and a full wardrobe of street
// furniture — lamp posts and traffic lights, benches, planters, dumpsters,
// market stalls, bus stops — so every street reads lived-in. Also owns the
// shared layout constants every other system navigates by, the static
// colliders, and the dusk control that deepens the golden hour.

import * as THREE from 'three';
import { rand, pick, smoothstep } from './util.js';

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
  tourStart:{ x: 216,  z: 176, name: 'Gran Vuelta start — Faro point' },
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

// Building facade: pastel wall, a shopfront band at street level, and a grid
// of windows; the emissive twin carries only the lit windows so blocks glow.
function facadePair(base, litRatio, rng) {
  const lit = [];
  for (let i = 0; i < 45; i++) lit.push(rng() < litRatio);
  const paint = (c, glow) => {
    c.fillStyle = glow ? '#000' : base; c.fillRect(0, 0, 128, 256);
    if (!glow) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, 0, 128, 10); c.fillStyle = 'rgba(30,16,24,0.55)'; c.fillRect(0, 232, 128, 24); }
    c.fillStyle = glow ? '#c47f2e' : '#ffd98c';
    c.fillRect(8, 240, 26, 9); c.fillRect(52, 240, 26, 9); c.fillRect(94, 240, 26, 9);
    let i = 0;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 5; x++) {
      if (glow && !lit[i]) { i++; continue; }
      c.fillStyle = glow ? '#ffb85e' : (lit[i] ? '#ffd98c' : '#2c3542');
      c.fillRect(10 + x * 23, 18 + y * 26, 14, 16); i++;
    }
  };
  return { map: canvasTex(128, 256, c => paint(c, false)), emissive: canvasTex(128, 256, c => paint(c, true)) };
}

export function buildWorld(scene) {
  const rng = mulberry32(20261117);
  const colliders = [];
  const W = { colliders, parkedSpots: [], packageSpots: [], update: null, setDusk: null, duskF: 0 };

  // ---- sky, sun, fog ----
  scene.fog = new THREE.Fog(0xf2a56b, 120, 820);
  const skyTex = canvasTex(64, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#22355e'); g.addColorStop(0.38, '#6e4468');
    g.addColorStop(0.62, '#d95d3d'); g.addColorStop(0.78, '#ff9e57'); g.addColorStop(1, '#ffd9a0');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 14), skyMat);
  scene.add(sky);
  const glowTex = canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,244,200,1)'); g.addColorStop(0.25, 'rgba(255,190,90,0.85)');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, fog: false, depthWrite: false }));
  sunSprite.scale.set(460, 460, 1); sunSprite.position.set(-1050, 200, -520);
  scene.add(sunSprite);
  // High clouds catching the last light; they drift slowly east in update().
  const clouds = [];
  const cloudMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffc4a8, transparent: true, opacity: 0.34, fog: false, depthWrite: false });
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(cloudMat);
    s.position.set(rand(-900, 900), rand(150, 260), rand(-700, 300));
    s.scale.set(rand(260, 460), rand(36, 60), 1);
    scene.add(s); clouds.push(s);
  }
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x503a4a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -115; sun.shadow.camera.right = 115;
  sun.shadow.camera.top = 115; sun.shadow.camera.bottom = -115;
  sun.shadow.camera.far = 520; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  W.sun = sun; W.hemi = hemi; W.skyMat = skyMat;

  // Distant ridge behind the city and two headlands in the bay: silhouettes
  // that give the vista shots a horizon to sit against.
  const ridgeMat = new THREE.MeshBasicMaterial({ color: 0x53355a });
  const ridgeParts = [];
  for (let i = 0; i < 9; i++)
    ridgeParts.push(partBox(rand(120, 220), rand(28, 62), 40, -560 + i * 135 + rand(-20, 20), 12, -292, 0x53355a));
  ridgeParts.push(partBox(150, 26, 60, -352, 6, 130, 0x53355a, 0.5));
  ridgeParts.push(partBox(170, 30, 60, 356, 7, 120, 0x53355a, -0.5));
  const ridge = new THREE.Mesh(mergeParts(ridgeParts), ridgeMat);
  scene.add(ridge);

  // ---- ground: one big painted canvas (roads, promenade, sand) ----
  const X0 = -280, Z0 = -230, XW = 560, ZW = 500;
  const groundTex = canvasTex(2048, 1828, (c, w, h) => {
    // Canvas row 0 is the city's north edge (z = Z0): the plane's UVs put
    // v = 1 at world -Z, and CanvasTexture's flipY maps that to the top row.
    const cx = x => (x - X0) / XW * w, cy = z => (z - Z0) / ZW * h;
    const sx = v => v / XW * w, sz = v => v / ZW * h;
    c.fillStyle = '#877a68'; c.fillRect(0, 0, w, h);
    // city block slabs with a sidewalk tint
    c.fillStyle = '#9a8f7d';
    for (const bx of [[-248, -208], [-192, -128], [-112, -48], [-32, 32], [48, 112], [128, 192], [208, 248]])
      for (const bz of [[-208, -168], [-152, -88], [-72, -8], [8, 72], [88, 152]])
        c.fillRect(cx(bx[0]), cy(bz[0]), sx(bx[1] - bx[0]), sz(bz[1] - bz[0]));
    // roads
    c.fillStyle = '#31343b';
    for (const x of AVENUES_X) c.fillRect(cx(x - ROAD_W / 2), 0, sx(ROAD_W), h);
    for (const z of STREETS_Z) c.fillRect(0, cy(z - ROAD_W / 2), w, sz(ROAD_W));
    // teal bike lanes hugging the coast road
    c.fillStyle = '#2a7d74';
    c.fillRect(0, cy(160 - ROAD_W / 2 + 0.8), w, sz(1.7));
    c.fillRect(0, cy(160 + ROAD_W / 2 - 2.5), w, sz(1.7));
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
    c.fillStyle = '#e9c88f'; c.fillRect(0, cy(168), w, sz(216 - 168));
    c.fillStyle = '#cfa96f'; c.fillRect(0, cy(168), w, sz(10));
    // promenade tile seams
    c.strokeStyle = 'rgba(120,86,50,0.35)'; c.lineWidth = 2;
    for (let x = -272; x < 272; x += 12) { c.beginPath(); c.moveTo(cx(x), cy(168)); c.lineTo(cx(x), cy(178)); c.stroke(); }
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
    new THREE.MeshStandardMaterial({ color: 0x17687a, roughness: 0.12, metalness: 0.55 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.4, WATER_Z + 300);
  scene.add(sea);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(560, 3.4),
    new THREE.MeshBasicMaterial({ color: 0xfff3da, transparent: true, opacity: 0.55 }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.06, WATER_Z + 1);
  scene.add(foam);

  // ---- buildings ----
  const facadeMats = [];
  const facades = ['#e8b48f', '#d98e73', '#f0d3a0', '#b7c9c9', '#e39fb0', '#cbb7e2', '#a8c8a2', '#e8e0cc']
    .map(col => {
      const f = facadePair(col, 0.46, rng);
      const m = new THREE.MeshStandardMaterial({
        map: f.map, emissiveMap: f.emissive, emissive: 0xffb85e, emissiveIntensity: 0.55, roughness: 0.85 });
      facadeMats.push(m);
      return m;
    });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5c4a44, roughness: 0.9 });
  const shopRects = [
    { minX: -182, maxX: -138, minZ: 112, maxZ: 148 },  // Club Brisa lot
    { minX: -150, maxX: -124, minZ: -34, maxZ: -10 },  // Taller Sol lot
    { minX: 50, maxX: 72, minZ: -104, maxZ: -80 },     // Clínica lot
    { minX: 128, maxX: 154, minZ: 12, maxZ: 38 },      // Armería lot
    { minX: 58, maxX: 102, minZ: 100, maxZ: 140 },     // Hotel Palma lot
  ];
  const hitsShop = (x0, x1, z0, z1) => shopRects.some(r => x0 < r.maxX + 3 && x1 > r.minX - 3 && z0 < r.maxZ + 3 && z1 > r.minZ - 3);
  const roofParts = [];
  function addBuilding(x, z, w, d, hgt) {
    const mat = facades[Math.floor(rng() * facades.length)];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d),
      [mat, mat, roofMat, roofMat, mat, mat]);
    mesh.position.set(x, hgt / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    if (hgt > 24) { // cornice lip on the taller blocks
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 0.55, d + 0.9), roofMat);
      lip.position.set(x, hgt + 0.2, z); lip.castShadow = true;
      scene.add(lip);
    }
    if (rng() < 0.4) // rooftop clutter: water tank or AC block
      roofParts.push(rng() < 0.5
        ? partCyl(1.1, 1.1, 2.2, x + rand(-w / 4, w / 4), hgt + 1.1, z + rand(-d / 4, d / 4), 0x9a8f7d, 9)
        : partBox(2.4, 1.1, 1.8, x + rand(-w / 4, w / 4), hgt + 0.55, z + rand(-d / 4, d / 4), 0x7d7466));
    return mesh;
  }
  const lotBlocks = [], plazaBlocks = [];
  for (const bx of [[-248, -208], [-192, -128], [-112, -48], [-32, 32], [48, 112], [128, 192], [208, 248]]) {
    for (const bz of [[-208, -168], [-152, -88], [-72, -8], [8, 72], [88, 152]]) {
      const cxm = (bx[0] + bx[1]) / 2, czm = (bz[0] + bz[1]) / 2;
      const roll = rng();
      if (roll < 0.11) { lotBlocks.push([cxm, czm]); continue; }        // parking lot
      if (roll < 0.20) { plazaBlocks.push([cxm, czm]); continue; }      // plaza
      const downtown = Math.abs(cxm) < 70 && czm > -90 && czm < 80;
      const spots = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
      const bw = (bx[1] - bx[0]) / 2 - 7, bd = (bz[1] - bz[0]) / 2 - 7;
      for (const s of spots) {
        if (rng() < 0.12) continue;
        const x = cxm + s[0] * (bx[1] - bx[0]) * 0.92, z = czm + s[1] * (bz[1] - bz[0]) * 0.92;
        if (hitsShop(x - bw / 2, x + bw / 2, z - bd / 2, z + bd / 2)) continue;
        const hgt = downtown ? rand(32, 68) : rand(11, 30);
        addBuilding(x, z, bw * rand(0.8, 1), hgt, bd * rand(0.8, 1));
      }
    }
  }
  // Landmark towers: the twin Torres del Alba downtown.
  addBuilding(-14, -44, 17, 17, 78); addBuilding(14, 44, 17, 17, 70);

  // ---- named buildings: club, hotel, shops (door + awning over the entry) ----
  function signTexture(text, bg, fg) {
    return canvasTex(512, 110, (c, w, h) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.font = 'bold 52px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = fg; c.fillText(text, w / 2, h / 2 + 2);
    });
  }
  const namedParts = [];
  function addNamedBuilding(x, z, w, d, hgt, color, sign, signColor) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    mesh.position.set(x, hgt / 2, z); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    namedParts.push(partBox(2.6, 3.4, 0.3, x, 1.7, z + d / 2 + 0.1, 0x1c1218));                 // door
    namedParts.push(partBox(6.4, 0.22, 2.6, x, 3.6, z + d / 2 + 1.2, color, 0, -0.32));          // awning
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

  // ---- palms ----
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
  for (let x = -244; x <= 244; x += 15) { if (rng() < 0.88) addPalm(x + rand(-3, 3), 171 + rand(0, 3)); if (rng() < 0.55) addPalm(x + rand(-3, 3), 186 + rand(0, 14), rand(0.85, 1.15)); }
  for (const [px, pz] of plazaBlocks)
    for (let i = 0; i < 6; i++) addPalm(px + rand(-17, 17), pz + rand(-17, 17));
  for (let i = 0; i < 16; i++) addPalm(rand(-240, 240), rand(188, 208), rand(0.8, 1.2));
  for (const x of [-40, 40]) for (let z = -140; z <= 140; z += 40) // downtown avenue palms
    if (rng() < 0.6) addPalm(x + 12.6, z + rand(-4, 4), rand(0.8, 1));

  // ---- street furniture, all merged: lamps, signals, benches, planters,
  // dumpsters, stalls, bus stops, hydrants, litter bins ----
  const propParts = [...roofParts, ...namedParts];
  const bulbParts = [];
  const POLE = 0x3a3f45;
  function lampPost(x, z) {
    propParts.push(partCyl(0.09, 0.13, 5.8, x, 2.9, z, POLE, 6));
    propParts.push(partBox(0.14, 0.14, 1.1, x, 5.8, z, POLE));
    bulbParts.push(partBox(0.5, 0.18, 0.3, x, 5.72, z, 0xffd9a0));
  }
  for (const x of AVENUES_X) for (let z = -196; z <= 196; z += 36) { lampPost(x - 9.8, z); lampPost(x + 9.8, z + 18); }
  for (const z of STREETS_Z) for (let x = -236; x <= 236; x += 36) { lampPost(x, z - 9.8); lampPost(x + 18, z + 9.8); }
  for (let x = -232; x <= 232; x += 32) lampPost(x, 170.5);
  // Traffic lights on two corners of every intersection.
  for (const x of AVENUES_X) for (const z of STREETS_Z) {
    for (const [ox, oz] of [[-9.6, -9.6], [9.6, 9.6]]) {
      propParts.push(partCyl(0.08, 0.11, 4.6, x + ox, 2.3, z + oz, POLE, 6));
      propParts.push(partBox(0.42, 1.15, 0.3, x + ox, 5, z + oz, 0x1c1e24));
      bulbParts.push(partBox(0.2, 0.2, 0.1, x + ox, 5.38, z + oz, rng() < 0.5 ? 0xff4a3d : 0xffb02e));
      bulbParts.push(partBox(0.2, 0.2, 0.1, x + ox, 4.66, z + oz, rng() < 0.5 ? 0x39d353 : 0x27332a));
    }
  }
  function bench(x, z, ry = 0) {
    propParts.push(partBox(2.2, 0.12, 0.55, x, 0.62, z, 0x8a5e3a, ry));
    propParts.push(partBox(2.2, 0.5, 0.1, x, 0.95, z - 0.24, 0x8a5e3a, ry));
    propParts.push(partBox(0.14, 0.6, 0.5, x - 0.9, 0.3, z, 0x3a3f45, ry));
    propParts.push(partBox(0.14, 0.6, 0.5, x + 0.9, 0.3, z, 0x3a3f45, ry));
  }
  for (let x = -220; x <= 220; x += 27) if (rng() < 0.75) bench(x + rand(-3, 3), 174.5, 0);
  for (const [px, pz] of plazaBlocks) { bench(px - 6, pz + 8, 0.4); bench(px + 6, pz + 8, -0.4); bench(px, pz - 9, Math.PI); }
  function planter(x, z) {
    propParts.push(partBox(2.6, 0.8, 1.1, x, 0.4, z, 0xb0563a));
    propParts.push(partCyl(0.75, 0.9, 0.9, x - 0.6, 1.1, z, 0x2e7d46, 7));
    propParts.push(partCyl(0.75, 0.9, 0.9, x + 0.6, 1.1, z, 0x35914f, 7));
  }
  for (const x of [-40, 40]) for (let z = -150; z <= 150; z += 30) { planter(x - 13.4, z); planter(x + 13.4, z + 15); }
  for (const [px, pz] of plazaBlocks) { planter(px - 10, pz - 10); planter(px + 10, pz + 10); }
  // Dumpsters in the block interiors — solid, so they carry colliders.
  const blockCenters = [];
  for (const bx of [[-248, -208], [-192, -128], [-112, -48], [-32, 32], [48, 112], [128, 192], [208, 248]])
    for (const bz of [[-208, -168], [-152, -88], [-72, -8], [8, 72], [88, 152]])
      blockCenters.push([(bx[0] + bx[1]) / 2, (bz[0] + bz[1]) / 2]);
  for (const [bx, bz] of blockCenters) {
    if (rng() < 0.45) continue;
    const dx = bx + rand(-14, 14), dz = bz + rand(-12, 12);
    if (hitsShop(dx - 1.6, dx + 1.6, dz - 1, dz + 1)) continue;
    propParts.push(partBox(3.1, 1.5, 1.9, dx, 0.75, dz, pick([0x2e6e4e, 0x3a5a74, 0x6e4a2e]), rand(0, 3.14)));
    propParts.push(partBox(3.2, 0.16, 2.0, dx, 1.56, dz, 0x27332a, rand(0, 3.14)));
    colliders.push({ minX: dx - 1.7, maxX: dx + 1.7, minZ: dz - 1.1, maxZ: dz + 1.1 });
  }
  // Market stalls along the promenade by the marina.
  for (let i = 0; i < 6; i++) {
    const mx2 = 96 + i * 15, mz2 = 176;
    propParts.push(partBox(4.6, 0.14, 3, mx2, 1.05, mz2, 0x8a5e3a));
    for (const [ox, oz] of [[-2.1, -1.3], [2.1, -1.3], [-2.1, 1.3], [2.1, 1.3]])
      propParts.push(partCyl(0.06, 0.06, 2.6, mx2 + ox, 1.3, mz2 + oz, 0x6e4632, 5));
    propParts.push(partBox(5.2, 0.12, 3.6, mx2, 2.72, mz2, i % 2 ? 0xff6b5e : 0xf2f2ee, 0, 0.1));
    propParts.push(partBox(4.2, 0.5, 2.2, mx2, 0.6, mz2, pick([0xff9a3d, 0xffd94d, 0x3ec6ff])));
    colliders.push({ minX: mx2 - 2.5, maxX: mx2 + 2.5, minZ: mz2 - 1.7, maxZ: mz2 + 1.7 });
  }
  // Bus stops on the two central avenues.
  for (const [bx, bz] of [[-52, 84], [52, -76], [-52, -156], [52, 164], [-132, 4], [132, -4]]) {
    propParts.push(partCyl(0.07, 0.07, 3.1, bx, 1.55, bz, POLE, 6));
    propParts.push(partBox(0.7, 0.5, 0.06, bx, 3, bz, 0x2a7d74));
    propParts.push(partBox(3.4, 0.1, 1.1, bx, 2.5, bz + 0.6, 0xd8d8d2));
    bench(bx, bz + 0.7, 0);
    propParts.push(partBox(0.05, 1.9, 1.4, bx + 1.7, 0.95, bz + 0.6, 0x9fc4cc));
  }
  // Hydrants and litter bins sprinkled along the sidewalks.
  for (let i = 0; i < 26; i++) {
    const x = pick(AVENUES_X) + pick([-11.6, 11.6]), z = rand(-200, 165);
    propParts.push(partCyl(0.16, 0.2, 0.65, x, 0.32, z, 0xd8402e, 7));
  }
  for (let i = 0; i < 30; i++) {
    const z = pick(STREETS_Z) + pick([-11.6, 11.6]), x = rand(-245, 245);
    propParts.push(partCyl(0.3, 0.26, 0.8, x, 0.4, z, 0x37474f, 8));
  }
  // Fountain on the first plaza: basin, water disc, centre jet.
  let fountain = null;
  if (plazaBlocks.length) {
    const [fx, fz] = plazaBlocks[0];
    propParts.push(partCyl(4.6, 5, 0.9, fx, 0.45, fz, 0xb7c9c9, 18));
    propParts.push(partCyl(0.5, 0.7, 2.4, fx, 1.2, fz, 0x9fb4b4, 10));
    colliders.push({ minX: fx - 5, maxX: fx + 5, minZ: fz - 5, maxZ: fz + 5 });
    fountain = { x: fx, z: fz };
  }

  // ---- parking lots: painted stalls + parked-car spots ----
  for (const [lx, lz] of lotBlocks) {
    for (let i = -2; i <= 2; i++) {
      W.parkedSpots.push({ x: lx + i * 7.5, z: lz - 12, angle: 0 });
      W.parkedSpots.push({ x: lx + i * 7.5, z: lz + 12, angle: Math.PI });
    }
    propParts.push(partBox(46, 0.24, 40, lx, 0.12, lz, 0x4a4d52));
  }
  for (const x of AVENUES_X) for (let z = -196; z <= 150; z += 29) {
    if (STREETS_Z.some(s => Math.abs(z - s) < 15)) continue;
    if (rng() < 0.45) W.parkedSpots.push({ x: x + (rng() < 0.5 ? -11.4 : 11.4), z: z + rand(-3, 3), angle: rng() < 0.5 ? 0 : Math.PI });
  }
  W.parkedSpots.push({ x: 70, z: 152, angle: Math.PI }, { x: 96, z: 152, angle: Math.PI }, { x: -148, z: 156, angle: 0 });

  // ---- marina: pier, yacht, sailboats, buoys, lighthouse, beach life ----
  for (let i = 0; i < 9; i++) propParts.push(partBox(7, 0.5, 6.4, 180, 0.55, 208 + i * 5.6, 0x9a7c58));
  propParts.push(partBox(3.2, 2.2, 10, 182, 1.1, 258, 0xf4f6f8));            // yacht hull
  propParts.push(partBox(2.4, 1.6, 5.5, 182, 2.9, 256, 0xdfe9ee));           // yacht cabin
  propParts.push(partCyl(0.16, 0.16, 7, 182, 6, 259, 0x8a8f96, 6));          // mast
  propParts.push(partCyl(2.6, 3.6, 15, 238, 7.5, 198, 0xe8e2d4, 12));        // lighthouse
  propParts.push(partCyl(2.9, 2.9, 2.4, 238, 16, 198, 0xc23b2e, 12));
  colliders.push({ minX: 235, maxX: 241, minZ: 195, maxZ: 201 });
  const lampLight = new THREE.PointLight(0xffe9a0, 60, 60, 1.6);
  lampLight.position.set(238, 17.5, 198); scene.add(lampLight);
  // Rotating lighthouse beam (a flat translucent cone on a pivot).
  const beamPivot = new THREE.Group(); beamPivot.position.set(238, 17.5, 198);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(7, 62, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.rotation.z = Math.PI / 2; beam.position.x = 30;
  beamPivot.add(beam); scene.add(beamPivot);
  for (let i = 0; i < 20; i++) { // beach umbrellas
    const ux = rand(-230, 230), uz = rand(186, 206);
    propParts.push(partCyl(0.06, 0.06, 2.4, ux, 1.2, uz, 0xd8d8d8, 5));
    propParts.push(partCyl(0.1, 1.7, 0.8, ux, 2.6, uz, pick([0xff6b5e, 0xffd94d, 0x3ec6ff, 0xff9ec4]), 8));
  }
  for (let i = 0; i < 16; i++) // beach towels
    propParts.push(partBox(1.9, 0.05, 0.9, rand(-235, 235), 0.05, rand(184, 208), pick([0xff6b5e, 0x3ec6ff, 0xffd94d, 0x7de28a]), rand(0, 3)));
  // Lifeguard tower + volleyball net on the sand.
  const lgX = 36, lgZ = 193;
  for (const [ox, oz] of [[-1.4, -1.1], [1.4, -1.1], [-1.4, 1.1], [1.4, 1.1]])
    propParts.push(partCyl(0.09, 0.09, 3.4, lgX + ox, 1.7, lgZ + oz, 0xd8d8d2, 5));
  propParts.push(partBox(3.6, 1.9, 2.8, lgX, 4.2, lgZ, 0xf2f2ee));
  propParts.push(partBox(4.4, 0.16, 3.6, lgX, 5.4, lgZ, 0xd8402e));
  colliders.push({ minX: lgX - 1.9, maxX: lgX + 1.9, minZ: lgZ - 1.5, maxZ: lgZ + 1.5 });
  propParts.push(partCyl(0.05, 0.05, 2.4, -58, 1.2, 196, 0x3a3f45, 5));
  propParts.push(partCyl(0.05, 0.05, 2.4, -49, 1.2, 196, 0x3a3f45, 5));
  const net = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  net.position.set(-53.5, 1.7, 196); net.rotation.y = Math.PI / 2; scene.add(net);

  const props = new THREE.Mesh(mergeParts(propParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  props.castShadow = true; props.receiveShadow = true;
  scene.add(props);
  const bulbs = new THREE.Mesh(mergeParts(bulbParts), new THREE.MeshBasicMaterial({ vertexColors: true }));
  scene.add(bulbs);
  W.bulbMesh = bulbs;
  if (fountain) { // water disc over the basin, gently pulsing in update()
    const water = new THREE.Mesh(new THREE.CircleGeometry(4.3, 20),
      new THREE.MeshStandardMaterial({ color: 0x3ec6ff, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.set(fountain.x, 0.95, fountain.z);
    scene.add(water); W.fountainWater = water;
  }
  // Sailboats riding at anchor + channel buoys (bob in update()).
  const boats = [];
  const sailShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 4.6), new THREE.Vector2(2.6, 0.4)]);
  const sailGeo = new THREE.ShapeGeometry(sailShape);
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e4, side: THREE.DoubleSide, roughness: 0.9 });
  for (const [bx, bz, ry] of [[128, 238, 0.4], [214, 246, -0.7], [96, 262, 1.2], [238, 226, 0.1]]) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 5.4), new THREE.MeshStandardMaterial({ color: pick([0xf2f2ee, 0xc22430, 0x2255c2, 0x2e8b57]), roughness: 0.5 }));
    hull.position.y = 0.2;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6.4, 5), new THREE.MeshStandardMaterial({ color: 0x8a8f96 }));
    mast.position.y = 3.4;
    const sail = new THREE.Mesh(sailGeo, sailMat); sail.position.set(0.06, 1, 0.4);
    g.add(hull, mast, sail);
    g.position.set(bx, 0, bz); g.rotation.y = ry;
    scene.add(g); boats.push({ g, baseZ: bz, ph: rand(0, 6) });
  }
  const buoys = [];
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xd8402e, roughness: 0.6 });
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 1.1, 7), buoyMat);
    const bx = 110 + i * 26, bz = 224 + (i % 2) * 9;
    b.position.set(bx, 0, bz); scene.add(b);
    buoys.push({ m: b, ph: rand(0, 6) });
  }

  // Hidden-package spots: alleys, beach, pier, plazas — all reachable on foot.
  const pkgSpots = [[-206, -170], [-46, -86], [6, 6], [118, -154], [206, 78], [-124, 84], [44, 166],
    [180, 226], [-88, 196], [232, 190], [-14, -166], [96, -14], [-238, 10], [150, 96], [24, -60]];
  W.packageSpots = pkgSpots.map(([x, z], i) => ({ id: i, x, z }));

  // ---- dusk control (screenshots + late-story mood) ----
  const dayFog = new THREE.Color(0xf2a56b), duskFog = new THREE.Color(0x35264e);
  W.setDusk = (f) => {
    W.duskF = f;
    sun.intensity = 2.6 - f * 1.7; sun.color.setHex(0xffb36b).lerp(new THREE.Color(0x8d7dff), f);
    hemi.intensity = 0.9 - f * 0.5;
    scene.fog.color.copy(dayFog).lerp(duskFog, f);
    skyMat.color.setScalar(1 - f * 0.55);
    lampLight.intensity = 60 + f * 180;
    for (const m of facadeMats) m.emissiveIntensity = 0.55 + f * 1.15;
    bulbs.material.color.setScalar(1 + f * 0.6);
    beam.material.opacity = 0.04 + f * 0.1;
  };
  W.update = (dt, t) => {
    foam.material.opacity = 0.4 + smoothstep(0.5 + Math.sin(t * 0.8) * 0.5) * 0.3;
    sea.position.y = -0.4 + Math.sin(t * 0.5) * 0.08;
    beamPivot.rotation.y = t * 0.35;
    for (const b of boats) { b.g.position.y = Math.sin(t * 0.7 + b.ph) * 0.16; b.g.rotation.z = Math.sin(t * 0.5 + b.ph) * 0.045; }
    for (const b of buoys) b.m.position.y = Math.sin(t * 0.9 + b.ph) * 0.22;
    for (const c of clouds) { c.position.x += dt * 1.1; if (c.position.x > 1000) c.position.x = -1000; }
    if (W.fountainWater) W.fountainWater.material.opacity = 0.78 + Math.sin(t * 2.2) * 0.1;
  };
  return W;
}
