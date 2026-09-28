import type { AABB } from './aabb.js';

/** Cell values. Only "solid block" exists today — any other non-zero value is reserved for future shapes (slopes, one-way, holes — cf. CrossCode's collision palette) and is treated as solid until then. */
export const COLLISION_EMPTY = 0;
export const COLLISION_SOLID = 1;

/**
 * Movement-blocking geometry for a uniform square grid of cells — the
 * engine-side half of "per-cell meaning lives in its own layer": a game
 * builds this from whatever it authored (a Tiled "collision" layer, a
 * procedural room generator, ...), this module only answers "is this box
 * blocked / how far can it move". Deliberately independent of what's DRAWN
 * at those cells: a cell can look like a wall and be empty (secret passage)
 * or look like floor and be solid.
 *
 * Everything outside the grid counts as solid — a room's collision can't
 * leak its occupants into the void through a gap in its border.
 */
export interface CollisionGrid {
  /** World position of cell (0,0)'s top-left corner. */
  readonly originX: number;
  readonly originY: number;
  /** Square cells, in world units. */
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  /** Row-major (index = row * columns + column), length columns * rows. */
  readonly cells: ArrayLike<number>;
}

export function createCollisionGrid(grid: CollisionGrid): CollisionGrid {
  if (!(grid.cellSize > 0)) {
    throw new Error(`createCollisionGrid: cellSize must be > 0, got ${grid.cellSize}.`);
  }
  if (!Number.isInteger(grid.columns) || !Number.isInteger(grid.rows) || grid.columns < 0 || grid.rows < 0) {
    throw new Error(`createCollisionGrid: columns/rows must be non-negative integers, got ${grid.columns}x${grid.rows}.`);
  }
  if (grid.cells.length !== grid.columns * grid.rows) {
    throw new Error(`createCollisionGrid: expected ${grid.columns * grid.rows} cells (${grid.columns}x${grid.rows}), got ${grid.cells.length}.`);
  }
  return grid;
}

export function isCellSolid(grid: CollisionGrid, column: number, row: number): boolean {
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) {
    return true;
  }
  return grid.cells[row * grid.columns + column] !== COLLISION_EMPTY;
}

/**
 * Tolerance, in CELLS, for deciding which cells an edge lies in. A box
 * clamped flush against a wall has its edge at `origin + k * cellSize`,
 * which after floating-point division can land a hair past k — without
 * this, the next sweep would treat the wall column as "already overlapped"
 * and skip it, tunneling straight through.
 */
const EDGE_EPSILON = 1e-7;

/** Index range [first, last] of the cells an open interval [min, max) overlaps — touching a boundary doesn't count as overlapping the next cell (matches aabb.ts's strict-overlap rule). */
function overlappedRange(min: number, max: number, origin: number, cellSize: number): readonly [number, number] {
  return [Math.floor((min - origin) / cellSize + EDGE_EPSILON), Math.ceil((max - origin) / cellSize - EDGE_EPSILON) - 1];
}

/** True if `box` overlaps any solid cell (or leaves the grid). Edge contact alone doesn't count. */
export function isAreaBlocked(grid: CollisionGrid, box: AABB): boolean {
  const [firstColumn, lastColumn] = overlappedRange(box.x, box.x + box.width, grid.originX, grid.cellSize);
  const [firstRow, lastRow] = overlappedRange(box.y, box.y + box.height, grid.originY, grid.cellSize);
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      if (isCellSolid(grid, column, row)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * How far `box` can travel along ONE axis before its leading edge meets a
 * solid cell: returns `delta` itself when the path is clear, otherwise the
 * (smaller-magnitude) distance that leaves the box flush against the first
 * blocking cell. Checks every cell column/row the leading edge passes on
 * the way, so a long move can't skip over a thin wall.
 */
function sweepAxis(
  grid: CollisionGrid,
  min: number,
  size: number,
  delta: number,
  crossMin: number,
  crossSize: number,
  axis: 'x' | 'y',
): number {
  if (delta === 0) {
    return 0;
  }
  const origin = axis === 'x' ? grid.originX : grid.originY;
  const crossOrigin = axis === 'x' ? grid.originY : grid.originX;
  const { cellSize } = grid;
  const [firstCross, lastCross] = overlappedRange(crossMin, crossMin + crossSize, crossOrigin, cellSize);
  const blockedAt = (index: number): boolean => {
    for (let cross = firstCross; cross <= lastCross; cross++) {
      if (axis === 'x' ? isCellSolid(grid, index, cross) : isCellSolid(grid, cross, index)) {
        return true;
      }
    }
    return false;
  };

  if (delta > 0) {
    const leading = min + size;
    // First cell not yet overlapped in the direction of travel, through the last one the moved box would reach.
    const first = Math.ceil((leading - origin) / cellSize - EDGE_EPSILON);
    const last = Math.ceil((leading + delta - origin) / cellSize - EDGE_EPSILON) - 1;
    for (let index = first; index <= last; index++) {
      if (blockedAt(index)) {
        return Math.max(0, origin + index * cellSize - leading);
      }
    }
    return delta;
  }

  const leading = min;
  const first = Math.floor((leading - origin) / cellSize + EDGE_EPSILON) - 1;
  const last = Math.floor((leading + delta - origin) / cellSize + EDGE_EPSILON);
  for (let index = first; index >= last; index--) {
    if (blockedAt(index)) {
      return Math.min(0, origin + (index + 1) * cellSize - leading);
    }
  }
  return delta;
}

export interface GridMoveResult {
  /** The box's new top-left corner. */
  readonly x: number;
  readonly y: number;
  /** Whether the respective axis was cut short by a solid cell. */
  readonly blockedX: boolean;
  readonly blockedY: boolean;
}

/**
 * Moves `box` by (dx, dy) through `grid`, X fully first and then Y from the
 * already-resolved X — so a diagonal move into a wall keeps sliding along
 * it on the free axis instead of stopping dead. A blocked axis ends flush
 * against the wall (not reverted to where it started), so the gap left
 * doesn't depend on speed or tick length.
 *
 * Only cells the box's leading edge newly enters are checked — cells it
 * already overlaps aren't, so a box that somehow starts inside a wall (a
 * bad spawn point) can still walk out of it rather than being stuck.
 */
export function moveBoxInGrid(grid: CollisionGrid, box: AABB, dx: number, dy: number): GridMoveResult {
  const movedX = sweepAxis(grid, box.x, box.width, dx, box.y, box.height, 'x');
  const x = box.x + movedX;
  const movedY = sweepAxis(grid, box.y, box.height, dy, x, box.width, 'y');
  return { x, y: box.y + movedY, blockedX: movedX !== dx, blockedY: movedY !== dy };
}
