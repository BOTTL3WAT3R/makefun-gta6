// util.js — small math and world helpers shared by every system in Golden
// Hour: clamping and interpolation, seeded-free dice, angle work, circle vs.
// box collision, frame-rate-independent damping, and text formatting.

export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const randi = (lo, hi) => Math.floor(rand(lo, hi + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Frame-rate-independent exponential approach: dampFactor(rate, dt) is the
// blend weight that makes `lerp(current, target, dampFactor(rate, dt))`
// converge at the same wall-clock speed whatever the frame rate — the
// chase camera, the helicopter's searchlight and the HUD fades all use it
// so the game feels identical at 30 fps and at 144.
export const dampFactor = (rate, dt) => 1 - Math.exp(-rate * dt);

// Smooth 0→1 ease (Hermite) for cross-fades that should start and end soft.
export function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

// Shortest-path angle interpolation, for steering and camera work.
export function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * clamp(t, 0, 1);
}
// Signed smallest rotation from b to a: positive turns a toward b's frame
// the short way. Callers pass (desired, current) and steer by the result.
export function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Push a circle (x, z, radius) out of every axis-aligned box it overlaps.
// Colliders are { minX, maxX, minZ, maxZ }. Returns the corrected [x, z].
export function collideCircle(x, z, r, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (x < c.minX - r || x > c.maxX + r || z < c.minZ - r || z > c.maxZ + r) continue;
    const dxl = x - (c.minX - r), dxr = (c.maxX + r) - x;
    const dzl = z - (c.minZ - r), dzr = (c.maxZ + r) - z;
    const m = Math.min(dxl, dxr, dzl, dzr);
    if (m === dxl) x = c.minX - r; else if (m === dxr) x = c.maxX + r;
    else if (m === dzl) z = c.minZ - r; else z = c.maxZ + r;
  }
  return [x, z];
}

export const fmtCash = n => '$' + Math.round(n).toLocaleString('en-US');
export const fmtTime = s => {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ':' + String(ss).padStart(2, '0');
};
// Whole metres, for the objective line's distance readout.
export const fmtDist = d => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
