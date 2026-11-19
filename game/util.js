// util.js — small math and world helpers shared by every Costa Vera system.

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent damping factor.
export function damp(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

export function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Shortest signed turn from angle a to angle b, in radians.
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function turnToward(current, target, maxStep) {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

// Deterministic seeded RNG so the city builds identically on every load.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

// Push a circle (x, z, r) out of every axis-aligned box collider it overlaps.
// Colliders are { minX, maxX, minZ, maxZ }. Mutates and returns the point.
export function resolveCollisions(p, r, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const nx = clamp(p.x, c.minX, c.maxX);
    const nz = clamp(p.z, c.minZ, c.maxZ);
    let dx = p.x - nx;
    let dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      p.x = nx + (dx / d) * r;
      p.z = nz + (dz / d) * r;
    } else {
      // Centre is inside the box: leave through the nearest face.
      const left = p.x - c.minX;
      const right = c.maxX - p.x;
      const top = p.z - c.minZ;
      const bottom = c.maxZ - p.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) p.x = c.minX - r;
      else if (m === right) p.x = c.maxX + r;
      else if (m === top) p.z = c.minZ - r;
      else p.z = c.maxZ + r;
    }
  }
  return p;
}

// Is the segment from a to b blocked by any collider box? Cheap LOS test used
// by police vision and hostile aim.
export function lineBlocked(ax, az, bx, bz, colliders) {
  const steps = 10;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    for (let j = 0; j < colliders.length; j++) {
      const c = colliders[j];
      if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
    }
  }
  return false;
}

export function formatMoney(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}
