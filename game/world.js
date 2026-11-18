// world.js — builds Costa Vera: the road grid, ~150 lit buildings, the
// fountain plaza, beach, marina and lighthouse, and every static collider
// the rest of the game collides with. All procedural, all painted or boxed.

import { makeRng, randRange, randPick, canvasTexture, makeSignMesh } from './util.js';

// The city's geometry, shared with traffic, pedestrians and missions.
export const LAYOUT = {
  pitch: 76, blockHalf: 29, roadHalf: 9,
  cols: [-190, -114, -38, 38, 114, 190],
  rows: [-152, -76, 0, 76, 152],
  vRoads: [-228, -152, -76, 0, 76, 152, 228],
  hRoads: [-190, -114, -38, 38, 114, 190],
  land: { minX: -240, maxX: 240, minZ: -202, maxZ: 202 },
  beachZ: 202, seaZ: 236,
  plaza: { x: 38, z: 0 },
};

const FACADES = [
  { base: '#8a5a44', trim: '#5d3a2a', lit: '#ffd98a' },
  { base: '#5f6f8a', trim: '#39445c', lit: '#ffe9a8' },
  { base: '#a8765e', trim: '#6e4630', lit: '#fff0b0' },
  { base: '#4f7d7a', trim: '#2f4f4c', lit: '#ffe9a8' },
  { base: '#97789a', trim: '#5f4663', lit: '#ffd98a' },
  { base: '#b08d57', trim: '#75592f', lit: '#fff3c0' },
  { base: '#68707c', trim: '#40454f', lit: '#ffe9a8' },
  { base: '#7d4a56', trim: '#4e2c34', lit: '#ffd98a' },
];

function facadeTexture(THREE, rng, pal, floors, cols) {
  return canvasTexture(THREE, 128, 256, (g, W, H) => {
    g.fillStyle = pal.base; g.fillRect(0, 0, W, H);
    g.fillStyle = pal.trim; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 8, W, 8);
    const cw = W / cols, ch = H / floors;
    for (let y = 0; y < floors; y++) for (let x = 0; x < cols; x++) {
      const lit = rng() < 0.52;
      g.fillStyle = lit ? pal.lit : 'rgba(20,22,38,0.85)';
      g.fillRect(x * cw + 3, y * ch + 4, cw - 6, ch - 7);
      if (lit && rng() < 0.3) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x * cw + 3, y * ch + 4, cw - 6, 3); }
    }
  });
}

function groundTexture(THREE) {
  const S = 2048, W2C = S / 500, H2C = S / 470; // world -> canvas scale
  const X = wx => (wx + 250) * W2C, Y = wz => (wz + 210) * H2C;
  return canvasTexture(THREE, S, S, (g) => {
    g.fillStyle = '#5a5a64'; g.fillRect(0, 0, S, S);                    // pavement
    g.fillStyle = '#d9b77c'; g.fillRect(0, Y(LAYOUT.beachZ), S, S - Y(LAYOUT.beachZ)); // sand
    // roads
    g.fillStyle = '#37353f';
    for (const x of LAYOUT.vRoads) g.fillRect(X(x - 9), Y(-202), 18 * W2C, (404) * H2C);
    for (const z of LAYOUT.hRoads) g.fillRect(X(-240), Y(z - 9), 480 * W2C, 18 * H2C);
    // bike lanes along the boardwalk road
    g.fillStyle = '#2e6e4e';
    g.fillRect(X(-240), Y(190 - 9), 480 * W2C, 3.4 * H2C);
    g.fillRect(X(-240), Y(190 + 5.6), 480 * W2C, 3.4 * H2C);
    // lane dashes
    g.fillStyle = '#e8c85a';
    for (const x of LAYOUT.vRoads) for (let z = -198; z < 198; z += 14) g.fillRect(X(x) - 1, Y(z), 2, 6 * H2C);
    for (const z of LAYOUT.hRoads) for (let x = -236; x < 236; x += 14) g.fillRect(X(x), Y(z) - 1, 6 * W2C, 2);
    // crosswalks at intersections
    g.fillStyle = 'rgba(240,240,240,0.75)';
    for (const x of LAYOUT.vRoads) for (const z of LAYOUT.hRoads) {
      for (let i = -3; i <= 3; i++) {
        g.fillRect(X(x + i * 2.4) - 1, Y(z - 11), 2, 4 * H2C);
        g.fillRect(X(x + i * 2.4) - 1, Y(z + 7), 2, 4 * H2C);
      }
    }
    // plaza paving: a sun medallion around the fountain
    g.fillStyle = '#6b5560'; g.fillRect(X(38 - 29), Y(0 - 29), 58 * W2C, 58 * H2C);
    g.strokeStyle = '#ffb347'; g.lineWidth = 5;
    g.beginPath(); g.arc(X(38), Y(0), 15 * W2C, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(X(38), Y(0), 22 * W2C, 0, Math.PI * 2); g.stroke();
  });
}

export function createWorld(THREE, scene) {
  const rng = makeRng(20261118);
  const boxes = [], circles = [];
  const dynamic = { waterMats: [], beam: null, beamLight: null, jets: null, lightHeads: [], boats: [] };

  // ---- sky, light, sea air ----
  const skyTex = canvasTexture(THREE, 64, 512, (g, W, H) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1c1440'); grad.addColorStop(0.42, '#5b2a63');
    grad.addColorStop(0.68, '#c94f5e'); grad.addColorStop(0.85, '#ff9a5c'); grad.addColorStop(1, '#ffc46b');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  scene.fog = new THREE.Fog(0x59304f, 200, 780);
  const sun = new THREE.DirectionalLight(0xffb070, 1.75);
  sun.position.set(90, 120, 330); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280; sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280; sun.shadow.camera.bottom = -280; sun.shadow.camera.far = 900;
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0x9a6fae, 0x40304a, 1.05));
  const fill = new THREE.DirectionalLight(0x6a7bd8, 0.3); fill.position.set(-140, 200, -120); scene.add(fill);

  // ---- ground and sea ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 470),
    new THREE.MeshLambertMaterial({ map: groundTexture(THREE) }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 20); ground.receiveShadow = true;
  scene.add(ground);
  const seaTex = canvasTexture(THREE, 256, 256, (g, W, H) => {
    g.fillStyle = '#274b73'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,170,120,0.35)';
    for (let i = 0; i < 60; i++) {
      g.beginPath(); const y = rng() * H;
      g.moveTo(rng() * W, y); g.lineTo(rng() * W, y); g.stroke();
    }
  }, [10, 10]);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1100, 420),
    new THREE.MeshLambertMaterial({ map: seaTex, transparent: true, opacity: 0.94 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.35, LAYOUT.seaZ + 208);
  scene.add(sea); dynamic.waterMats.push(seaTex);

  // ---- buildings ----
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3340 });
  const facadeMats = FACADES.map((pal, i) => {
    const tex = facadeTexture(THREE, makeRng(500 + i), pal, 9, 6);
    return new THREE.MeshLambertMaterial({ map: tex });
  });
  const shopSpots = [];
  let buildingCount = 0;
  for (const bx of LAYOUT.cols) for (const bz of LAYOUT.rows) {
    if (bx === LAYOUT.plaza.x && bz === LAYOUT.plaza.z) continue; // the plaza block
    // Subdivide the block into plots; most plots get a tower.
    const plots = [];
    const colsN = rng() < 0.5 ? 2 : 3, rowsN = 2;
    for (let i = 0; i < colsN; i++) for (let j = 0; j < rowsN; j++) {
      plots.push({
        x: bx - 29 + (i + 0.5) * (58 / colsN), z: bz - 29 + (j + 0.5) * (58 / rowsN),
        w: 58 / colsN - 3.5, d: 58 / rowsN - 3.5,
      });
    }
    for (const p of plots) {
      if (rng() < 0.1) continue; // a courtyard gap keeps the count honest
      const h = randRange(rng, 11, 38) * (rng() < 0.12 ? 1.5 : 1);
      const mat = facadeMats[Math.floor(rng() * facadeMats.length)];
      const b = new THREE.Mesh(new THREE.BoxGeometry(p.w, h, p.d),
        [mat, mat, roofMat, roofMat, mat, mat]);
      b.position.set(p.x, h / 2, p.z); b.castShadow = true; b.receiveShadow = true;
      scene.add(b); buildingCount++;
      boxes.push({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2 });
      // Rooftop clutter: vents, AC boxes, the odd water tower.
      if (rng() < 0.55) {
        const n = 1 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) {
          const s = randRange(rng, 1.4, 3.2);
          const vent = new THREE.Mesh(new THREE.BoxGeometry(s, randRange(rng, 0.8, 1.6), s),
            new THREE.MeshLambertMaterial({ color: 0x8b8f99 }));
          vent.position.set(p.x + randRange(rng, -p.w / 3, p.w / 3), h + 0.6, p.z + randRange(rng, -p.d / 3, p.d / 3));
          scene.add(vent);
        }
      }
      if (rng() < 0.16) {
        const tower = new THREE.Group();
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 3.4, 10),
          new THREE.MeshLambertMaterial({ color: 0x7a4a34 }));
        tank.position.y = 3.4;
        const capTop = new THREE.Mesh(new THREE.ConeGeometry(2, 1.4, 10),
          new THREE.MeshLambertMaterial({ color: 0x4e2c34 }));
        capTop.position.y = 5.8;
        tower.add(tank, capTop);
        tower.position.set(p.x + p.w / 4, h, p.z);
        scene.add(tower);
      }
      // Ground-floor shopfronts on road-facing plots: awning + sign.
      const facesRoad = Math.abs(p.z - bz) > 12 || Math.abs(p.x - bx) > 12;
      if (facesRoad && rng() < 0.3) {
        const awn = new THREE.Mesh(new THREE.BoxGeometry(p.w * 0.8, 0.25, 2.6),
          new THREE.MeshLambertMaterial({ color: randPick(rng, [0xd8546a, 0x2e8f86, 0xe0a33c, 0x5168b8]) }));
        const south = p.z > bz;
        awn.position.set(p.x, 3.1, p.z + (south ? p.d / 2 + 1.2 : -p.d / 2 - 1.2));
        scene.add(awn);
        shopSpots.push({ x: p.x, z: p.z + (south ? p.d / 2 : -p.d / 2), south });
      }
    }
  }

  // Named storefronts the player can use, each with a painted sign.
  function storefront(x, z, faceDir, label, color, name) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 8),
      new THREE.MeshLambertMaterial({ color }));
    base.position.set(x, 3.5, z); base.castShadow = true; scene.add(base);
    boxes.push({ minX: x - 8, maxX: x + 8, minZ: z - 4, maxZ: z + 4 });
    const sign = makeSignMesh(THREE, label, 13, 2.2, '#1c1430', '#ffd98a', 58);
    sign.position.set(x, 6.2, z + faceDir * 4.06);
    if (faceDir < 0) sign.rotation.y = Math.PI;
    scene.add(sign);
    return { id: label, name, x, z: z + faceDir * 7.5 };
  }
  const shops = [
    storefront(-114, 96, 1, 'CLINIC', 0xdcd8e2, 'Costa Care Clinic'),
    storefront(114, -96, -1, 'THREADS', 0x5168b8, 'Vera Threads'),
    storefront(-38, 172, 1, 'SNACKS', 0xe0a33c, 'Boardwalk Snacks'),
  ];
  // Club Brisa: the nightclub that anchors the last story job.
  const club = storefront(190, 172, 1, 'CLUB BRISA', 0x3a1c50, 'Club Brisa');
  club.signColor = '#ff7eb6';

  // ---- the fountain plaza ----
  const plaza = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 8.2, 1.1, 24),
    new THREE.MeshLambertMaterial({ color: 0xb8a8a0 }));
  basin.position.y = 0.55; plaza.add(basin);
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(6.9, 6.9, 0.3, 24),
    new THREE.MeshLambertMaterial({ color: 0x3f7fbf, transparent: true, opacity: 0.85 }));
  pool.position.y = 1.05; plaza.add(pool);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 3.6, 10),
    new THREE.MeshLambertMaterial({ color: 0xb8a8a0 }));
  column.position.y = 2.6; plaza.add(column);
  const jetGeo = new THREE.BufferGeometry();
  const jetCount = 260, jetPos = new Float32Array(jetCount * 3);
  jetGeo.setAttribute('position', new THREE.BufferAttribute(jetPos, 3));
  const jets = new THREE.Points(jetGeo, new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.32, transparent: true, opacity: 0.85 }));
  plaza.add(jets); dynamic.jets = { points: jets, pos: jetPos, count: jetCount };
  plaza.position.set(LAYOUT.plaza.x, 0, LAYOUT.plaza.z);
  scene.add(plaza);
  circles.push({ x: LAYOUT.plaza.x, z: LAYOUT.plaza.z, r: 8.6 });
  // Plaza benches and planters.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bx2 = LAYOUT.plaza.x + Math.cos(a) * 13, bz2 = LAYOUT.plaza.z + Math.sin(a) * 13;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 0.9),
      new THREE.MeshLambertMaterial({ color: 0x7a4a34 }));
    bench.position.set(bx2, 0.45, bz2); bench.rotation.y = -a; scene.add(bench);
    circles.push({ x: bx2, z: bz2, r: 1.4 });
  }

  // ---- palms, lampposts, traffic lights, props ----
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f, side: THREE.DoubleSide });
  function palm(x, z, s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.3 * s, 5.4 * s, 6), trunkMat);
    trunk.position.y = 2.7 * s; trunk.rotation.z = 0.09; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.75 * s, 2.9 * s), frondMat);
      const a = (i / 7) * Math.PI * 2;
      f.position.set(Math.cos(a) * 1.1 * s + 0.5, 5.5 * s, Math.sin(a) * 1.1 * s);
      f.rotation.set(-0.85, a, 0, 'YXZ'); g.add(f);
    }
    g.position.set(x, 0, z); scene.add(g);
    circles.push({ x, z, r: 0.55 });
  }
  for (let x = -232; x <= 232; x += 23) { palm(x + randRange(rng, -3, 3), 197.5, randRange(rng, 0.9, 1.25)); }
  for (const bx of LAYOUT.cols) for (const bz of LAYOUT.rows) {
    if (rng() < 0.75) palm(bx - 31 + randRange(rng, -2, 2), bz - 31 + randRange(rng, -2, 2), randRange(rng, 0.8, 1.1));
  }

  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffc98a });
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2c2c34 });
  function lamppost(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6), lampPoleMat);
    pole.position.y = 2.8; g.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), lampHeadMat);
    head.position.y = 5.7; g.add(head);
    g.position.set(x, 0, z); scene.add(g);
  }
  for (const x of LAYOUT.vRoads) for (let z = -180; z <= 180; z += 45) lamppost(x + 10.5, z + (x % 2 === 0 ? 12 : 0));
  for (let x = -220; x <= 220; x += 44) lamppost(x, 181);

  // Traffic lights at the busiest crossings; heads cycle in update().
  function trafficLight(x, z, phase) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.6, 6), lampPoleMat);
    pole.position.y = 2.3; g.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x1c1c22 }));
    box.position.y = 5.1; g.add(box);
    const lamps = [];
    [0xff4444, 0xffc93c, 0x44dd66].forEach((c, i) => {
      const m = new THREE.MeshBasicMaterial({ color: 0x222222 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), m);
      lamp.position.set(0, 5.55 - i * 0.42, 0.28); g.add(lamp); lamps.push(m);
    });
    g.position.set(x, 0, z); scene.add(g);
    dynamic.lightHeads.push({ lamps, phase });
    circles.push({ x, z, r: 0.4 });
  }
  [[0, -38], [76, 38], [-76, 114], [152, -114], [-152, 38], [0, 190 - 12]].forEach(([x, z], i) =>
    trafficLight(x + 10, z + 10, i * 1.7));

  // Street props with colliders: crates, dumpsters, hydrants, barriers.
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7a4e });
  const dumpMat = new THREE.MeshLambertMaterial({ color: 0x3f6e4e });
  for (let i = 0; i < 46; i++) {
    const bx = randPick(rng, LAYOUT.cols), bz = randPick(rng, LAYOUT.rows);
    const x = bx + randRange(rng, -27, 27), z = bz + randRange(rng, -27, 27);
    if (Math.abs(x - LAYOUT.plaza.x) < 32 && Math.abs(z - LAYOUT.plaza.z) < 32) continue;
    if (rng() < 0.5) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), crateMat);
      crate.position.set(x, 0.7, z); crate.rotation.y = rng() * 3; crate.castShadow = true; scene.add(crate);
      circles.push({ x, z, r: 1.1 });
    } else {
      const dump = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.4), dumpMat);
      dump.position.set(x, 0.75, z); dump.rotation.y = rng() * 3; dump.castShadow = true; scene.add(dump);
      circles.push({ x, z, r: 1.6 });
    }
  }
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xd84040 });
  for (let i = 0; i < 22; i++) {
    const x = randPick(rng, LAYOUT.vRoads) + 11, z = randRange(rng, -185, 185);
    const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.8, 8), hydMat);
    hyd.position.set(x, 0.4, z); scene.add(hyd);
    circles.push({ x, z, r: 0.45 });
  }

  // ---- beach, marina, lighthouse ----
  const umbMats = [0xff6b81, 0xffd23e, 0x4ecdc4, 0xff9a5f].map(c => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
  for (let i = 0; i < 16; i++) {
    const x = randRange(rng, -225, 225), z = randRange(rng, 208, 228);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), trunkMat);
    pole.position.set(x, 1.2, z); scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8), umbMats[i % 4]);
    top.position.set(x, 2.5, z); scene.add(top);
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(1, 2),
      new THREE.MeshLambertMaterial({ color: umbMats[(i + 1) % 4].color }));
    towel.rotation.x = -Math.PI / 2; towel.rotation.z = rng() * 3;
    towel.position.set(x + 1.6, 0.03, z + 0.8); scene.add(towel);
    circles.push({ x, z, r: 0.5 });
  }
  // The pier: planks out over the water on the -152 road line.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 72), pierMat);
  pier.position.set(-152, 0.9, LAYOUT.seaZ + 34); pier.receiveShadow = true; scene.add(pier);
  for (let z = LAYOUT.seaZ + 2; z < LAYOUT.seaZ + 68; z += 8) {
    for (const px of [-156.5, -147.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 6), pierMat);
      post.position.set(px, 0, z); scene.add(post);
    }
  }
  function sailboat(x, z, sailColor, scale) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2 * scale, 1 * scale, 6.4 * scale),
      new THREE.MeshLambertMaterial({ color: 0xf0ece2 }));
    hull.position.y = 0.4; g.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7 * scale, 5), trunkMat);
    mast.position.y = 3.8 * scale; g.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.6 * scale, 4.6 * scale),
      new THREE.MeshLambertMaterial({ color: sailColor, side: THREE.DoubleSide }));
    sail.position.set(0, 4 * scale, 0.4); sail.rotation.y = 0.5; g.add(sail);
    g.position.set(x, -0.2, z); g.rotation.y = randRange(rng, 0, 3);
    scene.add(g); dynamic.boats.push({ g, baseY: -0.2, phase: rng() * 6 });
    return g;
  }
  sailboat(-168, 262, 0xffffff, 1); sailboat(-136, 276, 0xffd23e, 1.15);
  sailboat(-170, 292, 0x4ecdc4, 0.9); sailboat(60, 268, 0xffffff, 1.05); sailboat(120, 292, 0xff9a5f, 1);
  // The yacht: bigger hull, flybridge, a name board.
  const yacht = new THREE.Group();
  const yhull = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 15), new THREE.MeshLambertMaterial({ color: 0xf6f2ea }));
  yhull.position.y = 0.8; yacht.add(yhull);
  const ycab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.8, 7), new THREE.MeshLambertMaterial({ color: 0x2c3e55 }));
  ycab.position.set(0, 2.6, -0.6); yacht.add(ycab);
  yacht.position.set(-196, -0.2, 292); yacht.rotation.y = 0.4;
  scene.add(yacht); dynamic.boats.push({ g: yacht, baseY: -0.2, phase: 2 });
  circles.push({ x: -152, z: 250, r: 0.1 }); // pier posts are visual; walkway stays open

  // Lighthouse on its rock, sweeping a beam over the bay.
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(13, 17, 3, 9),
    new THREE.MeshLambertMaterial({ color: 0x5a4a52 }));
  rock.position.set(222, 0.4, 292); scene.add(rock);
  const lh = new THREE.Group();
  const lhBody = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 13, 12),
    new THREE.MeshLambertMaterial({ color: 0xf0ece2 }));
  lhBody.position.y = 6.5; lh.add(lhBody);
  const lhBand = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.8, 3, 12),
    new THREE.MeshLambertMaterial({ color: 0xd84040 }));
  lhBand.position.y = 8.6; lh.add(lhBand);
  const lhTop = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.8, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  lhTop.position.y = 13.8; lh.add(lhTop);
  const beamGeo = new THREE.ConeGeometry(6, 55, 16, 1, true);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    color: 0xffe9a8, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  beam.rotation.z = Math.PI / 2; beam.position.set(27.5, 13.8, 0);
  const beamPivot = new THREE.Group(); beamPivot.add(beam); beamPivot.position.set(222, 1.8, 292);
  beam.position.set(27.5, 12, 0);
  lh.position.set(222, 1.8, 292); scene.add(lh); scene.add(beamPivot);
  dynamic.beam = beamPivot;

  // Hidden package spots: reachable corners, the plaza, the beach, the pier.
  const packageSpots = [
    { x: 20, z: 20 }, { x: -68, z: -68 }, { x: 68, z: 68 }, { x: -144, z: 144 },
    { x: 144, z: -144 }, { x: -220, z: 216 }, { x: 60, z: 220 }, { x: -152, z: 300 },
    { x: 206, z: 244 }, { x: -228, z: -190 }, { x: 228, z: 114 }, { x: 0, z: -196 },
    { x: -76, z: 30 }, { x: 190, z: -30 }, { x: 114, z: 186 },
  ];

  // Race gate layouts: along the boardwalk, and a full loop of the city.
  const boardwalkGates = [];
  for (let i = 0; i < 8; i++) boardwalkGates.push({ x: -196 + i * 56, z: 190 });
  const vueltaGates = [
    { x: -228, z: 114 }, { x: -152, z: -38 }, { x: -76, z: -190 }, { x: 38, z: -114 },
    { x: 152, z: -190 }, { x: 228, z: -38 }, { x: 152, z: 114 }, { x: 76, z: 190 },
    { x: -38, z: 114 }, { x: -152, z: 190 },
  ];

  function update(dt, t) {
    seaTex.offset.y = t * 0.008; seaTex.offset.x = Math.sin(t * 0.05) * 0.02;
    if (dynamic.jets) {
      const { pos, count } = dynamic.jets;
      for (let i = 0; i < count; i++) {
        const life = ((t * 0.7 + i * 0.618) % 1);
        const a = (i * 2.399) % (Math.PI * 2);
        const r = life * 2.6;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = 4.4 - life * life * 4.2 + 0.4;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
      dynamic.jets.points.geometry.attributes.position.needsUpdate = true;
    }
    if (dynamic.beam) dynamic.beam.rotation.y = t * 0.45;
    for (const b of dynamic.boats) b.g.position.y = b.baseY + Math.sin(t * 0.9 + b.phase) * 0.16;
    for (const head of dynamic.lightHeads) {
      const phase = (t * 0.14 + head.phase) % 3;
      head.lamps[0].color.setHex(phase < 1 ? 0xff4444 : 0x2a1515);
      head.lamps[1].color.setHex(phase >= 1 && phase < 1.3 ? 0xffc93c : 0x2a2410);
      head.lamps[2].color.setHex(phase >= 1.3 ? 0x44dd66 : 0x102a15);
    }
  }

  return {
    colliders: { boxes, circles },
    shops, club,
    packageSpots, boardwalkGates, vueltaGates,
    buildingCount,
    update,
  };
}
