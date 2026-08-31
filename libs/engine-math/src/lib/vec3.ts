/**
 * Plain 3D vector — same style as physics/aabb.ts's AABB: a readonly data
 * shape plus free functions, never a class with mutable methods. This
 * engine is Z-up (not three.js's Y-up): world X/Y keep their existing 2D
 * meaning (X = right, Y = "screen-down" depth axis), Z is height off the
 * ground — see render/camera-3d.ts's doc comment for why.
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(v: Vec3): number {
  return Math.sqrt(dot(v, v));
}

/** Returns a zero vector if `v` has zero length, rather than dividing by zero into NaN — a degenerate-but-defined result matching this codebase's "never NaN" convention elsewhere (see e.g. physics/hit.ts's distance>0 guards). */
export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return scale(v, 1 / len);
}
