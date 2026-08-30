import { buildBorderWallTiles, buildFloorTiles, buildWallColliders, type RoomGridConfig } from './tile-layout.js';

const SMALL_GRID: RoomGridConfig = { gridWidth: 4, gridHeight: 3, tileSpacing: 10, tileSpriteSize: 12, originX: 0, originY: 0 };

describe('buildFloorTiles', () => {
  it('covers every cell of the grid (gridWidth * gridHeight entries)', () => {
    const tiles = buildFloorTiles(SMALL_GRID);
    expect(tiles).toHaveLength(4 * 3);
  });

  it('places tile (0,0) at the configured origin', () => {
    const tiles = buildFloorTiles({ ...SMALL_GRID, originX: 100, originY: -50 });
    expect(tiles[0]).toEqual({ x: 100, y: -50 });
  });

  it('spaces adjacent tiles by tileSpacing', () => {
    const tiles = buildFloorTiles(SMALL_GRID);
    const xs = [...new Set(tiles.map((t) => t.x))].sort((a, b) => a - b);
    expect(xs).toEqual([0, 10, 20, 30]);
  });
});

describe('buildBorderWallTiles', () => {
  it('produces exactly 2*gridWidth + 2*gridHeight entries (corners duplicated, not deduped)', () => {
    const tiles = buildBorderWallTiles(SMALL_GRID);
    expect(tiles).toHaveLength(2 * SMALL_GRID.gridWidth + 2 * SMALL_GRID.gridHeight);
  });

  it('duplicates each corner exactly once (appears twice in the list)', () => {
    const tiles = buildBorderWallTiles(SMALL_GRID);
    const topLeftCount = tiles.filter((t) => t.x === 0 && t.y === 0).length;
    expect(topLeftCount).toBe(2);
  });

  it('covers all four grid corners', () => {
    const tiles = buildBorderWallTiles(SMALL_GRID);
    const positions = new Set(tiles.map((t) => `${t.x},${t.y}`));
    expect(positions.has('0,0')).toBe(true); // top-left
    expect(positions.has('30,0')).toBe(true); // top-right (lastCol=3 -> x=30)
    expect(positions.has('0,20')).toBe(true); // bottom-left (lastRow=2 -> y=20)
    expect(positions.has('30,20')).toBe(true); // bottom-right
  });

  it('never places a wall tile strictly inside the border (every tile has x or y at an edge)', () => {
    const tiles = buildBorderWallTiles(SMALL_GRID);
    for (const tile of tiles) {
      const atEdgeX = tile.x === 0 || tile.x === 30;
      const atEdgeY = tile.y === 0 || tile.y === 20;
      expect(atEdgeX || atEdgeY).toBe(true);
    }
  });

  it('scales independently with gridWidth and gridHeight for a non-square room', () => {
    const tiles = buildBorderWallTiles({ ...SMALL_GRID, gridWidth: 5, gridHeight: 2 });
    expect(tiles).toHaveLength(2 * 5 + 2 * 2);
  });
});

describe('buildWallColliders', () => {
  it('produces one collider per wall tile, sized tileSpriteSize, at the tile position', () => {
    const wallTiles = buildBorderWallTiles(SMALL_GRID);
    const colliders = buildWallColliders(wallTiles, SMALL_GRID.tileSpriteSize);
    expect(colliders).toHaveLength(wallTiles.length);
    expect(colliders[0]).toEqual({ x: wallTiles[0].x, y: wallTiles[0].y, width: 12, height: 12 });
  });
});
