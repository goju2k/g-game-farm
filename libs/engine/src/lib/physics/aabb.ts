export interface AABB {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The overlapping rect between a and b, or undefined if they don't overlap.
 * Strict inequalities — boxes that only touch at an edge don't overlap, so
 * a hitbox flush against a wall doesn't spuriously register a hit.
 */
export function intersection(a: AABB, b: AABB): AABB | undefined {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);

  if (x0 < x1 && y0 < y1) {
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  return undefined;
}

export function overlaps(a: AABB, b: AABB): boolean {
  return intersection(a, b) !== undefined;
}
