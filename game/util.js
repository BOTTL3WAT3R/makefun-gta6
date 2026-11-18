// util.js — shared helpers for Costa Vera: seeded randomness, angle maths,
// canvas textures and the simple collision shapes the whole city uses.

// A small deterministic random generator, so the city is laid out the same
// way on every visit and every machine.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const randRange = (rng, lo, hi) => lo + rng() * (hi - lo);
export const randPick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Turn `current` toward `target` by at most `maxStep`, taking the short way
// around the circle. Every steering behaviour in the game funnels through here.
export function angleTowards(current, target, maxStep) {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

export const headingOf = (dx, dz) => Math.atan2(dx, dz);

// Draw onto an offscreen canvas and hand back a THREE texture for it. Signs,
// facades and the road surface are all painted this way — no image files.
export function canvasTexture(THREE, width, height, painter, repeat) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  painter(c.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  return tex;
}

// A flat ground label: a plane with painted text, used for shop signs and
// street names. Returns a mesh the caller positions.
export function makeSignMesh(THREE, text, w, h, bg, fg, fontPx) {
  const tex = canvasTexture(THREE, 512, Math.round(512 * h / w), (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${fontPx || 64}px Arial, sans-serif`;
    g.fillText(text, W / 2, H / 2 + 2);
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: false })
  );
  return mesh;
}

// Collision: the city is circles (props, people, cars) against boxes
// (buildings). resolveCircleColliders pushes a circle out of every shape it
// overlaps and reports whether anything was hit, so vehicles can slow down.
export function resolveCircleColliders(pos, radius, boxes, circles) {
  let hit = false;
  for (const b of boxes) {
    const nx = clamp(pos.x, b.minX, b.maxX), nz = clamp(pos.z, b.minZ, b.maxZ);
    let dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2), push = radius - d;
      pos.x += (dx / d) * push; pos.z += (dz / d) * push;
    } else {
      // Centre inside the box: leave by the shallowest face.
      const left = pos.x - b.minX, right = b.maxX - pos.x;
      const top = pos.z - b.minZ, bottom = b.maxZ - pos.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = b.minX - radius;
      else if (m === right) pos.x = b.maxX + radius;
      else if (m === top) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
  for (const c of circles) {
    const dx = pos.x - c.x, dz = pos.z - c.z, rr = radius + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr || d2 < 1e-6) continue;
    hit = true;
    const d = Math.sqrt(d2);
    pos.x = c.x + (dx / d) * rr; pos.z = c.z + (dz / d) * rr;
  }
  return hit;
}

export const fmtMoney = n => '$' + Math.round(n).toLocaleString('en-US');
export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}
