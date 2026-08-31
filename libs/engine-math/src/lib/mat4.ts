import type { Vec3 } from './vec3.js';

/**
 * A 4x4 matrix, column-major (matches WebGL's uniformMatrix4fv convention
 * directly — no transpose needed on upload). Index layout: `m[col*4+row]`.
 * Plain data + free functions, same style as Vec3/AABB — never a class.
 */
export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** `multiply(a, b)` — `b` is applied first: `(a*b)*v === a*(b*v)`, same column-vector convention as GLSL/three.js. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out: number[] = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out as unknown as Mat4;
}

export function translation(x: number, y: number, z: number): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

/**
 * Rotations use the standard right-handed convention (rotationX/Y/Z each
 * rotate the OTHER two axes toward each other by the right-hand rule) —
 * this is the same convention every mainstream 3D library (three.js,
 * gl-matrix, OpenGL) uses, chosen deliberately so composing them (see
 * render/camera-3d.ts's yaw*pitch*roll) behaves the way anyone with 3D
 * experience already expects, per the user's explicit three.js-parity ask.
 */
export function rotationX(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

export function rotationY(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

export function rotationZ(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Standard OpenGL-convention perspective projection — view space looks down -Z, right-handed, NDC z in [-1,1]. */
export function perspective(fovYRadians: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovYRadians / 2);
  const rangeInv = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * rangeInv, -1,
    0, 0, 2 * far * near * rangeInv, 0,
  ];
}

/** Standard OpenGL-convention orthographic projection — same view-space/NDC conventions as perspective() above. */
export function orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4 {
  const sx = 2 / (right - left);
  const sy = 2 / (top - bottom);
  const sz = -2 / (far - near);
  const tx = -(right + left) / (right - left);
  const ty = -(top + bottom) / (top - bottom);
  const tz = -(far + near) / (far - near);
  return [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, tx, ty, tz, 1];
}

/** Transforms a position (w=1), then divides by the resulting w — needed for perspective. Orthographic matrices always yield w=1, so this is a no-op divide in that case. */
export function transformPoint(m: Mat4, v: Vec3): Vec3 {
  const x = m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12];
  const y = m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13];
  const z = m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14];
  const w = m[3] * v.x + m[7] * v.y + m[11] * v.z + m[15];
  return { x: x / w, y: y / w, z: z / w };
}

/** Transforms a direction (w=0, translation ignored, no perspective divide) — for basis vectors, not positions. */
export function transformDirection(m: Mat4, v: Vec3): Vec3 {
  return {
    x: m[0] * v.x + m[4] * v.y + m[8] * v.z,
    y: m[1] * v.x + m[5] * v.y + m[9] * v.z,
    z: m[2] * v.x + m[6] * v.y + m[10] * v.z,
  };
}
