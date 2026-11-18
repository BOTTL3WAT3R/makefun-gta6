// combat.js — gunfire in Costa Vera: a shared effects kit (muzzle flash,
// tracers, impact sparks) plus the player's hitscan pistol, with damage
// falloff and witnesses who report crimes to the wanted system.

import { clamp } from './util.js';

// Short-lived visual effects, pooled so a firefight never allocates.
export function createEffects(THREE, scene) {
  const flashLight = new THREE.PointLight(0xffc46b, 0, 18);
  scene.add(flashLight);
  const flashSprite = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7),
    new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(flashSprite);
  let flashT = 0, flashPos = null;

  const sparkPool = [];
  for (let i = 0; i < 10; i++) {
    const n = 26, geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc46b, size: 0.16, transparent: true }));
    pts.visible = false; scene.add(pts);
    sparkPool.push({ pts, pos, vel: new Float32Array(n * 3), life: 0, n });
  }
  let sparkIdx = 0;
  const tracers = [];
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    line.visible = false; scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  function muzzle(pos) {
    flashPos = pos; flashT = 0.05;
    flashLight.position.copy(pos); flashLight.intensity = 2.4;
    flashSprite.position.copy(pos);
    flashSprite.material.opacity = 0.9;
  }
  function sparks(pos, color) {
    const s = sparkPool[sparkIdx++ % sparkPool.length];
    s.pts.material.color.setHex(color || 0xffc46b);
    for (let i = 0; i < s.n; i++) {
      s.pos[i * 3] = pos.x; s.pos[i * 3 + 1] = pos.y; s.pos[i * 3 + 2] = pos.z;
      s.vel[i * 3] = (Math.random() - 0.5) * 5;
      s.vel[i * 3 + 1] = Math.random() * 4.4;
      s.vel[i * 3 + 2] = (Math.random() - 0.5) * 5;
    }
    s.life = 0.42; s.pts.visible = true;
    s.pts.geometry.attributes.position.needsUpdate = true;
  }
  function tracer(from, to) {
    const t = tracers[tracerIdx++ % tracers.length];
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z; p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.life = 0.06; t.line.visible = true; t.line.material.opacity = 0.85;
  }
  function update(dt, camera) {
    if (flashT > 0) {
      flashT -= dt;
      if (flashT <= 0) { flashLight.intensity = 0; flashSprite.material.opacity = 0; }
      if (camera) flashSprite.lookAt(camera.position);
    }
    for (const s of sparkPool) {
      if (!s.pts.visible) continue;
      s.life -= dt;
      if (s.life <= 0) { s.pts.visible = false; continue; }
      for (let i = 0; i < s.n; i++) {
        s.vel[i * 3 + 1] -= 12 * dt;
        s.pos[i * 3] += s.vel[i * 3] * dt;
        s.pos[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
        s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
        if (s.pos[i * 3 + 1] < 0.05) s.pos[i * 3 + 1] = 0.05;
      }
      s.pts.geometry.attributes.position.needsUpdate = true;
    }
    for (const t of tracers) {
      if (!t.line.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
    }
  }
  return { muzzle, sparks, tracer, update };
}

// How far a ray travels before a building stops it: slab test per box.
function rayVsBoxes(origin, dir, boxes, maxDist) {
  let best = maxDist;
  for (const b of boxes) {
    let tmin = 0, tmax = best;
    const axes = [
      [origin.x, dir.x, b.minX, b.maxX],
      [origin.z, dir.z, b.minZ, b.maxZ],
    ];
    let ok = true;
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) { ok = false; break; } }
      else {
        let t1 = (lo - o) / d, t2 = (hi - o) / d;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin < best && tmin > 0) best = tmin;
  }
  return best;
}

// The player's pistol. Targets register a hit proxy: {root, kind, ref, hp}.
export function createCombat(THREE, effects) {
  const raycaster = new THREE.Raycaster();
  let cooldown = 0;
  const targets = [];
  function registerTarget(rootMesh, kind, ref) {
    rootMesh.traverse(o => { if (o.isMesh) { o.userData.hitRef = { kind, ref }; targets.push(o); } });
  }
  function shoot(G, origin, dir, shooterPos) {
    if (cooldown > 0) return false;
    cooldown = 0.17;
    G.audio.gunshot();
    const muzzlePos = shooterPos.clone(); muzzlePos.y += 1.32;
    effects.muzzle(muzzlePos);
    const maxDist = rayVsBoxes(origin, dir, G.world.colliders.boxes, 120);
    raycaster.set(origin, dir); raycaster.far = maxDist;
    const hits = raycaster.intersectObjects(targets, false);
    let endDist = maxDist;
    if (hits.length) {
      const hit = hits[0];
      endDist = hit.distance;
      const info = hit.object.userData.hitRef;
      const falloff = clamp(1.18 - hit.distance / 52, 0.3, 1);
      const dmg = 36 * falloff;
      effects.sparks(hit.point, info && info.kind === 'car' ? 0xffc46b : 0xff8a7a);
      if (info) applyHit(G, info, dmg, shooterPos);
    } else if (maxDist < 120) {
      const p = origin.clone().add(dir.clone().multiplyScalar(maxDist));
      effects.sparks(p, 0xffe9a8);
    }
    const end = origin.clone().add(dir.clone().multiplyScalar(endDist));
    effects.tracer(muzzlePos, end);
    // Gunfire is a crime when anyone is around to hear it.
    G.police.addHeat(G.anyoneNear(shooterPos, 46) ? 26 : 10, 'shots fired');
    G.crowd.scareNear(shooterPos, 17);
    return true;
  }
  function applyHit(G, info, dmg, shooterPos) {
    if (info.kind === 'ped') {
      G.crowd.hurtPed(info.ref, dmg, shooterPos);
      G.police.addHeat(30, 'pedestrian hit');
    } else if (info.kind === 'officer') {
      G.police.hurtOfficer(info.ref, dmg, shooterPos);
      G.police.addHeat(85, 'officer down');
    } else if (info.kind === 'hostile') {
      if (G.onHostileHit) G.onHostileHit(info.ref, dmg, shooterPos);
    } else if (info.kind === 'car') {
      const car = info.ref;
      car.hp = (car.hp === undefined ? 100 : car.hp) - dmg;
      if (car.hp <= 0 && !car.dead) {
        car.dead = true; car.speed = 0;
        if (car.mode === 'traffic') car.mode = 'parked';
        G.police.addHeat(20, 'vehicle destroyed');
      }
    }
  }
  function update(dt) { if (cooldown > 0) cooldown -= dt; }
  return { shoot, update, registerTarget, targets };
}
