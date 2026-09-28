import { isCellSolid } from '@g-game-farm/ribs';
import { buildRectRoomLayout, cellPosition, tileSourceRect, type RectRoomConfig } from './tile-layout.js';

/** 4x3 cells at (100, -50): wall ring of 10 cells around 2 floor cells. */
const SMALL: RectRoomConfig = { columns: 4, rows: 3, originX: 100, originY: -50, floorTileId: 0, wallTileId: 10 };

describe('tileSourceRect', () => {
  it('maps a tileId to its 16x16 frame in the 10-column tiles.png atlas, row-major', () => {
    expect(tileSourceRect(0)).toEqual({ sx: 0, sy: 0 });
    expect(tileSourceRect(2)).toEqual({ sx: 32, sy: 0 });
    expect(tileSourceRect(10)).toEqual({ sx: 0, sy: 16 });
    expect(tileSourceRect(23)).toEqual({ sx: 48, sy: 32 });
  });
});

describe('cellPosition', () => {
  it('places cells edge to edge, 16 world units apart, from the origin', () => {
    expect(cellPosition(SMALL, { column: 0, row: 0 })).toEqual({ x: 100, y: -50 });
    expect(cellPosition(SMALL, { column: 3, row: 2 })).toEqual({ x: 148, y: -18 });
  });
});

describe('buildRectRoomLayout', () => {
  it('draws floor under every cell, then the wall ring on top', () => {
    const { sprites } = buildRectRoomLayout(SMALL);
    const floor = sprites.slice(0, 12);
    const walls = sprites.slice(12);
    expect(floor.every((s) => s.sx === 0 && s.sy === 0)).toBe(true);
    expect(walls).toHaveLength(10); // 4*3 - 2 interior cells
    expect(walls.every((s) => s.sx === 0 && s.sy === 16)).toBe(true);
  });

  it('makes exactly the wall ring solid, with a grid aligned to the drawn cells', () => {
    const { collision } = buildRectRoomLayout(SMALL);
    expect(collision).toMatchObject({ originX: 100, originY: -50, cellSize: 16, columns: 4, rows: 3 });
    expect(isCellSolid(collision, 0, 0)).toBe(true);
    expect(isCellSolid(collision, 3, 1)).toBe(true);
    expect(isCellSolid(collision, 1, 1)).toBe(false);
    expect(isCellSolid(collision, 2, 1)).toBe(false);
  });

  it('leaves doorways open — neither drawn as wall nor solid', () => {
    const { sprites, collision } = buildRectRoomLayout({ ...SMALL, doorways: [{ column: 3, row: 1 }] });
    expect(sprites.slice(12)).toHaveLength(9);
    expect(sprites.slice(12)).not.toContainEqual({ x: 148, y: -34, sx: 0, sy: 16 });
    expect(isCellSolid(collision, 3, 1)).toBe(false);
  });
});
