import type { AABB } from '@g-game-farm/ribs';

export interface TilePlacement {
  readonly x: number;
  readonly y: number;
}

/**
 * A room's floor-tile grid geometry — generalizes what used to be
 * `tile-map.ts`'s hardcoded `WORLD_SIZE`/`TILE_GRID_SIZE`/`TILE_SPACING`
 * module constants into per-room parameters, so different rooms can have
 * different sizes without touching this file.
 */
export interface RoomGridConfig {
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly tileSpacing: number;
  /**
   * Deliberately >= tileSpacing on purpose (matches the old single-room
   * tilemap's TILE_SPRITE_SIZE=16 vs TILE_SPACING=15): adjacent
   * tiles/colliders overlap by 1 unit so there are no seam gaps in the
   * floor and no collision gaps in the wall ring.
   */
  readonly tileSpriteSize: number;
  /** World-space position of grid cell (0,0) — lets a room be centered anywhere, not just on world-origin. */
  readonly originX: number;
  readonly originY: number;
}

function tileCoord(origin: number, spacing: number, index: number): number {
  return origin + index * spacing;
}

/** Every cell of the grid — same nested-map-then-flat construction as the original single-room FLOOR_TILES. */
export function buildFloorTiles(config: RoomGridConfig): readonly TilePlacement[] {
  const { gridWidth, gridHeight, tileSpacing, originX, originY } = config;
  return Array.from({ length: gridWidth }, (_, col) =>
    Array.from({ length: gridHeight }, (_, row) => ({
      x: tileCoord(originX, tileSpacing, col),
      y: tileCoord(originY, tileSpacing, row),
    })),
  ).flat();
}

/**
 * Border ring only — same shape as the original single-room WALL_TILES:
 * four independent edge loops (left column, right column, top row, bottom
 * row), NOT deduped, so the 4 corners are each pushed twice. A duplicate
 * wall tile draws/collides identically to its twin — harmless redundancy,
 * matches the original port's source exactly, not a bug to clean up.
 */
export function buildBorderWallTiles(config: RoomGridConfig): readonly TilePlacement[] {
  const { gridWidth, gridHeight, tileSpacing, originX, originY } = config;
  const lastCol = gridWidth - 1;
  const lastRow = gridHeight - 1;
  const x = (col: number) => tileCoord(originX, tileSpacing, col);
  const y = (row: number) => tileCoord(originY, tileSpacing, row);

  const tiles: TilePlacement[] = [];
  for (let row = 0; row < gridHeight; row++) tiles.push({ x: x(0), y: y(row) });
  for (let row = 0; row < gridHeight; row++) tiles.push({ x: x(lastCol), y: y(row) });
  for (let col = 0; col < gridWidth; col++) tiles.push({ x: x(col), y: y(0) });
  for (let col = 0; col < gridWidth; col++) tiles.push({ x: x(col), y: y(lastRow) });
  return tiles;
}

/** One full tileSpriteSize x tileSpriteSize box per wall tile (TopLeft anchor, no offset) — this IS the collision geometry move-player.ts checks against. */
export function buildWallColliders(wallTiles: readonly TilePlacement[], tileSpriteSize: number): readonly AABB[] {
  return wallTiles.map((tile) => ({ x: tile.x, y: tile.y, width: tileSpriteSize, height: tileSpriteSize }));
}
