import { COLLISION_EMPTY, COLLISION_SOLID, createCollisionGrid } from '@g-game-farm/ribs';
import type { RoomTileLayout, RoomTileSprite } from '../components.js';

/**
 * tiles.png's frame size — and, since tiles are laid edge to edge (no
 * overlap), also the world size of one room grid cell and of one collision
 * cell. Adjacent tiles meet exactly on a 16-unit boundary; with the ground
 * layer's camera pixel-snapped at an integer zoom, that boundary lands on a
 * whole screen pixel, so there's no seam to paper over. (The ported game
 * used to space 16-unit tiles 15 apart to hide seams, which made world
 * coordinates disagree with any grid-based editor's — gone.)
 */
export const ROOM_TILE_SIZE = 16;

/** tiles.png is a 10x10 atlas of ROOM_TILE_SIZE frames. */
export const TILES_ATLAS_COLUMNS = 10;

/** Where tileId lives inside tiles.png — row-major, same indexing Tiled uses for a tileset. */
export function tileSourceRect(tileId: number): Pick<RoomTileSprite, 'sx' | 'sy'> {
  return {
    sx: (tileId % TILES_ATLAS_COLUMNS) * ROOM_TILE_SIZE,
    sy: Math.floor(tileId / TILES_ATLAS_COLUMNS) * ROOM_TILE_SIZE,
  };
}

export interface GridCell {
  readonly column: number;
  readonly row: number;
}

/** A plain rectangular room: floor everywhere, a one-cell wall ring, optional gaps (doorways) in that ring. */
export interface RectRoomConfig {
  readonly columns: number;
  readonly rows: number;
  /** World position of cell (0,0)'s top-left corner. */
  readonly originX: number;
  readonly originY: number;
  readonly floorTileId: number;
  readonly wallTileId: number;
  /** Border cells left open — no wall drawn, no collision. */
  readonly doorways?: readonly GridCell[];
}

/** World-space top-left corner of a grid cell. */
export function cellPosition(config: Pick<RectRoomConfig, 'originX' | 'originY'>, cell: GridCell): { x: number; y: number } {
  return { x: config.originX + cell.column * ROOM_TILE_SIZE, y: config.originY + cell.row * ROOM_TILE_SIZE };
}

/**
 * Procedural stand-in for a hand-authored map, producing the exact same
 * RoomTileLayout shape a Tiled room does (see tiled-room.ts): artwork and
 * collision as two independent products of the same grid. Floor is drawn
 * under every cell (walls included), then walls on top — matching how the
 * rooms have always looked.
 */
export function buildRectRoomLayout(config: RectRoomConfig): RoomTileLayout {
  const { columns, rows, floorTileId, wallTileId } = config;
  const isDoorway = (column: number, row: number) => (config.doorways ?? []).some((d) => d.column === column && d.row === row);
  const isWall = (column: number, row: number) =>
    (column === 0 || row === 0 || column === columns - 1 || row === rows - 1) && !isDoorway(column, row);

  const floorSource = tileSourceRect(floorTileId);
  const wallSource = tileSourceRect(wallTileId);
  const floor: RoomTileSprite[] = [];
  const walls: RoomTileSprite[] = [];
  // A plain array (not a typed array) — this ends up inside an ECS component, which this project keeps JSON-plain for snapshotting.
  const cells: number[] = new Array<number>(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const position = cellPosition(config, { column, row });
      floor.push({ ...position, ...floorSource });
      if (isWall(column, row)) {
        walls.push({ ...position, ...wallSource });
        cells[row * columns + column] = COLLISION_SOLID;
      } else {
        cells[row * columns + column] = COLLISION_EMPTY;
      }
    }
  }

  return {
    sprites: [...floor, ...walls],
    collision: createCollisionGrid({ originX: config.originX, originY: config.originY, cellSize: ROOM_TILE_SIZE, columns, rows, cells }),
  };
}
