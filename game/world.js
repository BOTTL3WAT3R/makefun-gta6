// world.js — Costa Vera itself: a sunset coastal grid of avenues and pastel
// blocks, a fountain plaza at its heart, a boardwalk and pier over the sea,
// and the named places the story visits (Club Brisa, Clínica del Sol, the
// Mercado, Taller Vera and the Comisaría). Builds every static mesh and the
// collider list the movers collide against.

import * as THREE from 'three';
import { makeRng, pick } from './util.js';

export const AVENUES = [-165, -55, 55, 165];
export const ROAD_HALF = 10;
export const WORLD_BOUND = 272;
export const BEACH_Z = 205;
export const WATER_Z = 235;
export const PIER_HALF = 7;
export const PIER_END_Z = 296;

export const LOCATIONS = {
  plaza: { x: 0, z: 0, label: 'Plaza del Faro' },
  pilar: { x: 9, z: 7, label: 'Pilar Duarte' },
  pierEnd: { x: 0, z: 288, label: 'Pier End' },
  pierCafe: { x: -34, z: 196, label: 'Café Brisa' },
  clubDoor: { x: 210, z: -110, label: 'Club Brisa' },
  clubCarPark: { x: 199, z: -110, label: 'Club Brisa Car Park' },
  clinicDoor: { x: -214, z: 0, label: 'Clínica del Sol' },
  marketDoor: { x: -110, z: -103, label: 'Mercado Brisa' },
  garageDoor: { x: 110, z: 102, label: 'Taller Vera' },
  policeDoor: { x: 110, z: -103, label: 'Comisaría' },
  raceAvenida: { x: -165, z: 196, label: 'Gran Vuelta Start' },
  boardwalkStart: { x: -238, z: 196, label: 'Boardwalk Run Start' },
  hotel: { x: 0, z: -238, label: 'Hotel Coral' },
};

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function facadeTexture(rng, base, litRatio) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const cols = 6;
    const rows = 12;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = rng() < litRatio;
        g.fillStyle = lit ? '#ffd98a' : '#2c3e55';
        g.fillRect(8 + x * 20, 10 + y * 20, 12, 13);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, h - 14, w, 14);
  });
}

function signTexture(text, fg, bg) {
  return canvasTexture(512, 96, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.font = 'bold 52px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = fg;
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

const PASTELS = ['#e8a37c', '#d98c8c', '#e6c79a', '#a8c3a0', '#93b5c9', '#d9b8d0', '#f0d9a8', '#c97e5a'];

export function buildWorld(scene) {
  const rng = makeRng(20261117);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // --- sky, light and air -------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(1500, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top = vec3(0.13,0.23,0.45); vec3 mid = vec3(0.93,0.42,0.22); vec3 low = vec3(1.0,0.72,0.38); vec3 c = h > 0.22 ? mix(mid, top, smoothstep(0.22, 0.75, h)) : mix(low, mid, smoothstep(-0.05, 0.22, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  group.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog(0xdd8858, 200, 950);

  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x4a3a52, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb37a, 1.6);
  sun.position.set(-260, 190, 420);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.25);
  fill.position.set(200, 300, -200);
  scene.add(fill);

  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(38, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffdf9e, fog: false })
  );
  sunBall.position.set(-390, 130, 900);
  group.add(sunBall);

  // --- ground, roads, sidewalks -------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 620),
    new THREE.MeshLambertMaterial({ color: 0x707a68 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -20;
  group.add(ground);

  const roadTex = canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#33343a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8c96a';
    g.fillRect(w / 2 - 2, 4, 4, 20);
    g.fillRect(w / 2 - 2, 40, 4, 20);
  });
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb8ab98 });

  function roadStrip(len, horiz, at) {
    const t = roadTex.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(horiz ? 1 : len / 16, horiz ? len / 16 : 1);
    if (horiz) t.rotation = Math.PI / 2;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(horiz ? len : ROAD_HALF * 2, horiz ? ROAD_HALF * 2 : len),
      new THREE.MeshLambertMaterial({ map: t })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(horiz ? 0 : at, 0.02, horiz ? at : -10);
    group.add(m);
    for (const s of [-1, 1]) {
      const walk = new THREE.Mesh(
        new THREE.PlaneGeometry(horiz ? len : 4, horiz ? 4 : len),
        walkMat
      );
      walk.rotation.x = -Math.PI / 2;
      const off = (ROAD_HALF + 2) * s;
      walk.position.set(horiz ? 0 : at + off, 0.03, horiz ? at + off : -10);
      group.add(walk);
    }
  }
  for (const a of AVENUES) {
    roadStrip(560, false, a);
    roadStrip(560, true, a);
  }

  // --- the sea, beach, boardwalk and pier ----------------------------------
  const waterTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#17557c';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,170,90,0.35)';
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      const y = (i * 17) % h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + 5, w * 0.6, y - 5, w, y + 2);
      g.stroke();
    }
  });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(30, 12);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 700),
    new THREE.MeshLambertMaterial({ map: waterTex })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, WATER_Z + 348);
  group.add(water);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(620, BEACH_Z ? WATER_Z - BEACH_Z + 14 : 40),
    new THREE.MeshLambertMaterial({ color: 0xe6c188 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.04, (BEACH_Z + WATER_Z) / 2 + 4);
  group.add(sand);

  const woodTex = canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = '#8a6844';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 2, h);
  });
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  const boardwalkTex = woodTex.clone();
  boardwalkTex.needsUpdate = true;
  boardwalkTex.repeat.set(60, 2);
  const boardwalk = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 12),
    new THREE.MeshLambertMaterial({ map: boardwalkTex })
  );
  boardwalk.rotation.x = -Math.PI / 2;
  boardwalk.position.set(0, 0.06, 196);
  group.add(boardwalk);

  const pierTex = woodTex.clone();
  pierTex.needsUpdate = true;
  pierTex.repeat.set(2, 16);
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(PIER_HALF * 2, 1.2, PIER_END_Z - 190 + 14),
    new THREE.MeshLambertMaterial({ map: pierTex })
  );
  pier.position.set(0, 0.5, (190 + PIER_END_Z) / 2);
  group.add(pier);
  const postGeo = new THREE.CylinderGeometry(0.35, 0.35, 3, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6e5136 });
  for (let z = 200; z <= PIER_END_Z; z += 12) {
    for (const sx of [-PIER_HALF + 0.4, PIER_HALF - 0.4]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(sx, 1.6, z);
      group.add(post);
    }
  }

  // --- plaza and fountain ---------------------------------------------------
  const pavingTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#c9a184';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(90,50,30,0.4)';
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke();
    }
    g.fillStyle = 'rgba(255,220,170,0.25)';
    g.fillRect(0, 0, 32, 32);
    g.fillRect(64, 64, 32, 32);
  });
  pavingTex.wrapS = pavingTex.wrapT = THREE.RepeatWrapping;
  pavingTex.repeat.set(10, 10);
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(92, 92),
    new THREE.MeshLambertMaterial({ map: pavingTex })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.05, 0);
  group.add(plaza);

  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 10, 1.6, 24),
    new THREE.MeshLambertMaterial({ color: 0xd8cfc0 })
  );
  basin.position.set(0, 0.8, 0);
  group.add(basin);
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(8.2, 8.2, 0.3, 24),
    new THREE.MeshLambertMaterial({ color: 0x3f9ec9, transparent: true, opacity: 0.85 })
  );
  pool.position.set(0, 1.55, 0);
  group.add(pool);
  const jetBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 1.4, 3.4, 10),
    new THREE.MeshLambertMaterial({ color: 0xd8cfc0 })
  );
  jetBase.position.set(0, 2.6, 0);
  group.add(jetBase);
  colliders.push({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });

  const jetCount = 240;
  const jetPos = new Float32Array(jetCount * 3);
  const jetVel = new Float32Array(jetCount);
  for (let i = 0; i < jetCount; i++) {
    jetPos[i * 3] = (rng() - 0.5) * 1.4;
    jetPos[i * 3 + 1] = 4 + rng() * 5;
    jetPos[i * 3 + 2] = (rng() - 0.5) * 1.4;
    jetVel[i] = 0;
  }
  const jetGeo = new THREE.BufferGeometry();
  jetGeo.setAttribute('position', new THREE.BufferAttribute(jetPos, 3));
  const jet = new THREE.Points(jetGeo, new THREE.PointsMaterial({ color: 0xbfe8ff, size: 0.35, transparent: true, opacity: 0.8 }));
  group.add(jet);

  // --- buildings --------------------------------------------------------------
  const facadeMats = PASTELS.map((c) => new THREE.MeshLambertMaterial({ map: facadeTexture(rng, c, 0.4) }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a4638 });

  function building(x, z, w, d, h, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || pick(rng, facadeMats));
    m.position.set(x, h / 2, z);
    group.add(m);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.7, d + 0.6), roofMat);
    roof.position.set(x, h + 0.35, z);
    group.add(roof);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return m;
  }

  function sign(x, y, z, ry, text, fg, bg, w = 17) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * 0.19),
      new THREE.MeshBasicMaterial({ map: signTexture(text, fg, bg), side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    group.add(m);
    return m;
  }

  // Ordinary blocks: a few pastel towers per block, kept off the sidewalks.
  const blockCenters = [-110, 0, 110];
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (bx === 0 && bz === 0) continue; // the plaza
      const isService = (bx === -110 && bz === -110) || (bx === 110 && bz === -110) || (bx === 110 && bz === 110);
      const n = isService ? 2 : 4;
      for (let i = 0; i < n; i++) {
        const w = 16 + rng() * 12;
        const d = 16 + rng() * 12;
        const x = bx + (rng() - 0.5) * 52;
        const z = bz + (rng() - 0.5) * 52;
        if (Math.abs(x - bx) < 22 && Math.abs(z - bz) < 22 && isService) continue;
        building(x, z, w, d, 12 + rng() * rng() * 38);
      }
    }
  }
  // North hotel row and edge strips.
  building(0, -238, 64, 26, 46);
  sign(0, 30, -224.5, 0, 'HOTEL CORAL', '#ffe9b0', '#7a2d4d', 30);
  building(-232, -110, 26, 40, 30);
  building(-232, 110, 26, 36, 22);
  building(232, 60, 26, 44, 26);
  building(232, -232, 30, 30, 34);
  building(-120, -238, 40, 24, 18);
  building(130, -238, 44, 24, 24);

  // Named service buildings.
  building(256, -110, 34, 42, 13, new THREE.MeshLambertMaterial({ color: 0x3a2b4d }));
  sign(238.5, 8.5, -110, -Math.PI / 2, 'CLUB BRISA', '#ff7ae0', '#1c1030', 20);
  const park = new THREE.Mesh(new THREE.PlaneGeometry(26, 38), new THREE.MeshLambertMaterial({ color: 0x3c3d42 }));
  park.rotation.x = -Math.PI / 2;
  park.position.set(199, 0.04, -110);
  group.add(park);

  building(-232, 0, 30, 32, 11, new THREE.MeshLambertMaterial({ color: 0xf2ede2 }));
  sign(-216.5, 7.5, 0, Math.PI / 2, 'CLÍNICA DEL SOL', '#d23c2e', '#ffffff', 19);
  building(-110, -120, 30, 20, 9, new THREE.MeshLambertMaterial({ color: 0xe0a458 }));
  sign(-110, 6.5, -109.5, 0, 'MERCADO BRISA', '#fff3d0', '#a33d1d', 18);
  building(110, 120, 32, 22, 9, new THREE.MeshLambertMaterial({ color: 0x8c99a6 }));
  sign(110, 6.5, 108.5, Math.PI, 'TALLER VERA', '#eaf6ff', '#274b63', 18);
  building(110, -120, 30, 20, 10, new THREE.MeshLambertMaterial({ color: 0xb9c4cf }));
  sign(110, 7, -109.5, 0, 'COMISARÍA', '#eaf6ff', '#1d3f8c', 18);

  // --- palms, lamps, benches ---------------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f, side: THREE.DoubleSide });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.5, 6);
  const frondGeo = new THREE.PlaneGeometry(0.9, 4.4);
  frondGeo.translate(0, 2.2, 0);
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.25;
    trunk.rotation.z = (rng() - 0.5) * 0.14;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(frondGeo, frondMat);
      f.position.y = 6.5;
      f.rotation.y = (i / 6) * Math.PI * 2;
      f.rotation.x = -0.9 - rng() * 0.35;
      g.add(f);
    }
    g.position.set(x, 0, z);
    group.add(g);
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  }
  for (let x = -250; x <= 250; x += 25) {
    if (Math.abs(x) > 12) palm(x + (rng() - 0.5) * 4, 188 + (rng() - 0.5) * 3);
  }
  for (const [x, z] of [[-38, -38], [38, -38], [-38, 38], [38, 38], [-38, 0], [38, 0], [0, -38], [0, 38]]) palm(x, z);
  for (const a of AVENUES) {
    for (let t = -240; t <= 250; t += 118) {
      if (Math.abs(t) > 16) palm(a + 13.5, t);
      if (Math.abs(t) > 16) palm(t, a - 13.5);
    }
  }

  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2e2e33 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const lampGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5);
  const bulbGeo = new THREE.SphereGeometry(0.32, 8, 6);
  function lamp(x, z) {
    const pole = new THREE.Mesh(lampGeo, lampMat);
    pole.position.set(x, 2.7, z);
    group.add(pole);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(x, 5.5, z);
    group.add(bulb);
  }
  for (let x = -240; x <= 240; x += 40) lamp(x, 188);
  for (let z = 205; z <= PIER_END_Z - 8; z += 18) { lamp(-6, z); lamp(6, z); }
  for (const a of AVENUES) for (let t = -240; t <= 240; t += 80) lamp(a + 11, t + 20);

  // Objective beacon shared by missions and activities (a pillar of light).
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffcf4d, transparent: true, opacity: 0.33, side: THREE.DoubleSide, depthWrite: false })
  );
  beacon.visible = false;
  group.add(beacon);

  let time = 0;
  function update(dt) {
    time += dt;
    waterTex.offset.y = time * 0.008;
    waterTex.offset.x = Math.sin(time * 0.05) * 0.02;
    const pos = jetGeo.attributes.position.array;
    for (let i = 0; i < jetCount; i++) {
      jetVel[i] -= 9.8 * dt * 0.35;
      pos[i * 3 + 1] += jetVel[i] * dt + 0.09;
      if (pos[i * 3 + 1] < 1.7) {
        pos[i * 3] = (rng() - 0.5) * 1.3;
        pos[i * 3 + 1] = 4.3;
        pos[i * 3 + 2] = (rng() - 0.5) * 1.3;
        jetVel[i] = 2.6 + rng() * 1.6;
      }
    }
    jetGeo.attributes.position.needsUpdate = true;
  }

  return {
    colliders,
    beacon,
    update,
    setBeacon(x, z, color) {
      if (x === null) { beacon.visible = false; return; }
      beacon.visible = true;
      beacon.position.set(x, 30, z);
      if (color) beacon.material.color.setHex(color);
    },
  };
}
