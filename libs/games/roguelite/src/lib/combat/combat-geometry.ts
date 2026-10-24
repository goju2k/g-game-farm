import { moveBoxInGrid, type AABB, type ReadonlyWorld } from '@g-game-farm/ribs';
import { RoomTileLayout, type Position } from '../components.js';
import type { BoxOffset, SentinelMeleeData } from './combat-data.js';
import { HitStop } from './combat-components.js';

/** A box given relative to Position, in world space. */
export function boxAt(position: Position, offset: BoxOffset): AABB {
  return { x: position.x + offset.offsetX, y: position.y + offset.offsetY, width: offset.width, height: offset.height };
}

export function boxCenter(box: AABB): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The room's collision grid, if the scene has one. */
export function roomCollision(world: ReadonlyWorld) {
  for (const [, layout] of world.query([RoomTileLayout] as const)) {
    return layout.collision;
  }
  return undefined;
}

/**
 * Moves a point whose collision box is `offset` (relative to it) by dx/dy
 * through the room grid. Returns the new point and whether either axis hit
 * a wall. No grid = free movement.
 */
export function movePoint(world: ReadonlyWorld, position: Position, offset: BoxOffset, dx: number, dy: number): { x: number; y: number; blocked: boolean } {
  const grid = roomCollision(world);
  if (!grid) {
    return { x: position.x + dx, y: position.y + dy, blocked: false };
  }
  const box = boxAt(position, offset);
  const moved = moveBoxInGrid(grid, box, dx, dy);
  return { x: moved.x - offset.offsetX, y: moved.y - offset.offsetY, blocked: moved.blockedX || moved.blockedY };
}

/** Unit vector, or 0,0 for a zero input. */
export function normalize(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

/** The dominant axis of a direction as a 4-way unit vector (ties go horizontal). */
export function fourWay(x: number, y: number): { x: number; y: number } {
  if (x === 0 && y === 0) return { x: 1, y: 0 };
  return Math.abs(x) >= Math.abs(y) ? { x: Math.sign(x), y: 0 } : { x: 0, y: Math.sign(y) };
}

/** A sentinel's body box around its center. */
export function sentinelBody(center: Position, data: SentinelMeleeData): AABB {
  return { x: center.x - data.body.width / 2, y: center.y - data.body.height / 2, width: data.body.width, height: data.body.height };
}

/** The attack box in front of the body along a 4-way direction: `width` across, `depth` along (spec §8-2: front 24x16). */
export function sentinelAttackBox(center: Position, dirX: number, dirY: number, data: SentinelMeleeData): AABB {
  const { width, depth } = data.attackBox;
  if (dirX !== 0) {
    const nearX = dirX > 0 ? center.x + data.body.width / 2 : center.x - data.body.width / 2 - depth;
    return { x: nearX, y: center.y - width / 2, width: depth, height: width };
  }
  const nearY = dirY > 0 ? center.y + data.body.height / 2 : center.y - data.body.height / 2 - depth;
  return { x: center.x - width / 2, y: nearY, width, height: depth };
}

/** True while a parry hit-stop freezes combat (see hitStopClockSystem). */
export function isHitStopped(world: ReadonlyWorld): boolean {
  for (const [, stop] of world.query([HitStop] as const)) {
    return stop.frozen;
  }
  return false;
}
