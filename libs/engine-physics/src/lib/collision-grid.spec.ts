import {
  COLLISION_EMPTY as _,
  COLLISION_SOLID as X,
  createCollisionGrid,
  isAreaBlocked,
  isCellSolid,
  moveBoxInGrid,
  type CollisionGrid,
} from './collision-grid.js';

/**
 * 5x4 grid, cells 10 units, origin (100, 200):
 *
 *   X X X X X
 *   X _ _ _ X
 *   X _ _ X X
 *   X X X X X
 */
function roomGrid(): CollisionGrid {
  // prettier-ignore
  const cells = [
    X, X, X, X, X,
    X, _, _, _, X,
    X, _, _, X, X,
    X, X, X, X, X,
  ];
  return createCollisionGrid({ originX: 100, originY: 200, cellSize: 10, columns: 5, rows: 4, cells });
}

describe('createCollisionGrid', () => {
  it('rejects a cell array that does not match columns x rows', () => {
    expect(() => createCollisionGrid({ originX: 0, originY: 0, cellSize: 1, columns: 2, rows: 2, cells: [0, 0, 0] })).toThrow(/expected 4 cells/);
  });

  it('rejects a non-positive cell size', () => {
    expect(() => createCollisionGrid({ originX: 0, originY: 0, cellSize: 0, columns: 0, rows: 0, cells: [] })).toThrow(/cellSize/);
  });
});

describe('isCellSolid', () => {
  it('reads row-major cells and treats everything outside the grid as solid', () => {
    const grid = roomGrid();
    expect(isCellSolid(grid, 1, 1)).toBe(false);
    expect(isCellSolid(grid, 3, 2)).toBe(true);
    expect(isCellSolid(grid, -1, 1)).toBe(true);
    expect(isCellSolid(grid, 5, 1)).toBe(true);
    expect(isCellSolid(grid, 1, 4)).toBe(true);
  });

  it('treats any non-zero value as solid (reserved shape codes)', () => {
    const grid = createCollisionGrid({ originX: 0, originY: 0, cellSize: 1, columns: 1, rows: 1, cells: [7] });
    expect(isCellSolid(grid, 0, 0)).toBe(true);
  });
});

describe('isAreaBlocked', () => {
  it('is false for a box strictly inside empty cells, even when flush against walls', () => {
    // Empty region spans x 110..140 (row 1), y 210..220; box exactly fills cell (1,1)
    expect(isAreaBlocked(roomGrid(), { x: 110, y: 210, width: 10, height: 10 })).toBe(false);
  });

  it('is true as soon as the box overlaps a solid cell by any amount', () => {
    expect(isAreaBlocked(roomGrid(), { x: 109.5, y: 212, width: 5, height: 5 })).toBe(true);
  });

  it('is true for a box outside the grid', () => {
    expect(isAreaBlocked(roomGrid(), { x: 0, y: 0, width: 5, height: 5 })).toBe(true);
  });
});

describe('moveBoxInGrid', () => {
  const box = { x: 112, y: 212, width: 4, height: 4 }; // inside empty cell (1,1)

  it('moves freely when nothing is in the way', () => {
    expect(moveBoxInGrid(roomGrid(), box, 5, 3)).toEqual({ x: 117, y: 215, blockedX: false, blockedY: false });
  });

  it('stops flush against a wall instead of reverting the whole move', () => {
    // Moving left: the west wall's right edge is x=110, box left edge at 112 -> can only go 2.
    const result = moveBoxInGrid(roomGrid(), box, -5, 0);
    expect(result.x).toBeCloseTo(110, 9);
    expect(result.blockedX).toBe(true);
  });

  it('does not tunnel through a thin wall on a long move', () => {
    // Row 2 has a solid cell at column 3 (x 130..140); box on row 2 moving right by 100.
    const onRow2 = { x: 112, y: 222, width: 4, height: 4 };
    const result = moveBoxInGrid(roomGrid(), onRow2, 100, 0);
    expect(result.x + onRow2.width).toBeCloseTo(130, 9);
    expect(result.blockedX).toBe(true);
  });

  it('slides along a wall on the free axis when moving diagonally into it', () => {
    const result = moveBoxInGrid(roomGrid(), box, -5, 3);
    expect(result.x).toBeCloseTo(110, 9);
    expect(result.y).toBeCloseTo(215, 9);
    expect(result).toMatchObject({ blockedX: true, blockedY: false });
  });

  it('resolves Y against the already-moved X (X first, then Y)', () => {
    // Box at row 1, column 2 (x 124..128), moving right 8 then down 8. After X it sits at x 132..136
    // (column 3); column 3's row 2 is solid, so Y is blocked at the row boundary y=220.
    const start = { x: 124, y: 213, width: 4, height: 4 };
    const result = moveBoxInGrid(roomGrid(), start, 8, 8);
    expect(result.x).toBeCloseTo(132, 9);
    expect(result.y + start.height).toBeCloseTo(220, 9);
    expect(result).toMatchObject({ blockedX: false, blockedY: true });
  });

  it('stays put (and reports blocked) when already flush and pushing into the wall, repeatedly — no drift into it', () => {
    const grid = roomGrid();
    let current = { ...box, x: 110 };
    for (let i = 0; i < 5; i++) {
      const result = moveBoxInGrid(grid, current, -3, 0);
      expect(result.x).toBeCloseTo(110, 9);
      expect(result.blockedX).toBe(true);
      current = { ...current, x: result.x };
    }
  });

  it('keeps flush contact exact under floating-point origins/sizes, then moves away freely', () => {
    const grid = createCollisionGrid({ originX: 0.1, originY: 0.1, cellSize: 0.3, columns: 3, rows: 1, cells: [0, 0, X] });
    const start = { x: 0.1, y: 0.15, width: 0.2, height: 0.1 };
    const pushed = moveBoxInGrid(grid, start, 10, 0);
    expect(pushed.x + start.width).toBeCloseTo(0.7, 9);
    const again = moveBoxInGrid(grid, { ...start, x: pushed.x }, 10, 0);
    expect(again.x).toBeCloseTo(pushed.x, 9);
    const back = moveBoxInGrid(grid, { ...start, x: pushed.x }, -0.1, 0);
    expect(back.blockedX).toBe(false);
  });

  it('lets a box that starts inside a solid cell walk out of it', () => {
    const inWall = { x: 102, y: 212, width: 4, height: 4 }; // overlaps west wall column 0
    const result = moveBoxInGrid(roomGrid(), inWall, 5, 0);
    expect(result.x).toBeCloseTo(107, 9);
    expect(result.blockedX).toBe(false);
  });

  it('a zero move is a no-op, never blocked', () => {
    expect(moveBoxInGrid(roomGrid(), box, 0, 0)).toEqual({ x: 112, y: 212, blockedX: false, blockedY: false });
  });
});
