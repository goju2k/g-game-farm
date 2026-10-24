import { COLLISION_EMPTY, COLLISION_SOLID, createCollisionGrid } from '@g-game-farm/ribs';
import type { RoomEntryPoint, RoomExit, RoomTileLayout, RoomTileSprite } from '../components.js';
import { ROOM_TILE_SIZE, tileSourceRect } from './tile-layout.js';

/** Dungeon-part0 tiles a graybox room is drawn with (see its .tsj names). */
const TILESET = 'dungeon-part0';
const TILESET_COLUMNS = 10;
const FLOOR_TILES = [0, 0, 0, 1, 2, 3];
const WALL_TOP = 11;
const WALL_FACE = 22;

/**
 * One cell per character:
 * - `#` wall (solid), `.` floor
 * - `E` the entry (floor), `X` exit cells (floor; all X form one exit zone)
 * - any other letter: floor with a spawn marker, returned in `spawns`
 */
export type GrayboxRows = readonly string[];

export interface GrayboxRoom {
  readonly tiles: RoomTileLayout;
  readonly entryPoints: readonly RoomEntryPoint[];
  /** Where X cells are — the caller turns it into a RoomExit (target, lock). */
  readonly exitZone: RoomExit['zone'] | undefined;
  /** Marker letter -> centers of its cells, in reading order. */
  readonly spawns: Readonly<Record<string, readonly { x: number; y: number }[]>>;
  /** Marker letter -> the bounding rect of all its cells (event trigger areas). */
  readonly areas: Readonly<Record<string, RoomExit['zone']>>;
}

/**
 * Builds a playable room from ASCII rows — the Phase 1 graybox stand-in for
 * Zones that haven't been laid out in Tiled yet. Floors get a little
 * texture variety from a position hash; walls show their face where floor
 * lies below (3/4 view). The entry point is the cell's bottom-center, i.e.
 * where a combat player's feet go.
 */
export function buildGrayboxRoom(roomId: string, rows: GrayboxRows): GrayboxRoom {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (height === 0 || rows.some((row) => row.length !== width)) {
    throw new Error(`graybox room "${roomId}": rows must be non-empty and the same length.`);
  }
  const at = (column: number, row: number) => rows[row]?.[column] ?? '#';
  const sprites: RoomTileSprite[] = [];
  const cells: number[] = new Array<number>(width * height);
  const spawns: Record<string, { x: number; y: number }[]> = {};
  const areas: Record<string, RoomExit['zone']> = {};
  let entry: RoomEntryPoint | undefined;
  let exitMin: { column: number; row: number } | undefined;
  let exitMax: { column: number; row: number } | undefined;

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const ch = at(column, row);
      const x = column * ROOM_TILE_SIZE;
      const y = row * ROOM_TILE_SIZE;
      const tile = (tileId: number) => sprites.push({ x, y, tileset: TILESET, ...tileSourceRect(tileId, TILESET_COLUMNS) });
      if (ch === '#') {
        cells[row * width + column] = COLLISION_SOLID;
        tile(at(column, row + 1) !== '#' ? WALL_FACE : WALL_TOP);
        continue;
      }
      cells[row * width + column] = COLLISION_EMPTY;
      tile(FLOOR_TILES[(column * 7 + row * 13) % FLOOR_TILES.length]);
      const center = { x: x + ROOM_TILE_SIZE / 2, y: y + ROOM_TILE_SIZE / 2 };
      if (ch === 'E') {
        entry = { id: 'start', position: { x: center.x, y: y + ROOM_TILE_SIZE - 2 } };
      } else if (ch === 'X') {
        exitMin = { column: Math.min(exitMin?.column ?? column, column), row: Math.min(exitMin?.row ?? row, row) };
        exitMax = { column: Math.max(exitMax?.column ?? column, column), row: Math.max(exitMax?.row ?? row, row) };
      } else if (ch !== '.') {
        (spawns[ch] ??= []).push(center);
        const area = areas[ch];
        areas[ch] = area
          ? { x: Math.min(area.x, x), y: Math.min(area.y, y), width: Math.max(area.x + area.width, x + ROOM_TILE_SIZE) - Math.min(area.x, x), height: Math.max(area.y + area.height, y + ROOM_TILE_SIZE) - Math.min(area.y, y) }
          : { x, y, width: ROOM_TILE_SIZE, height: ROOM_TILE_SIZE };
      }
    }
  }
  if (!entry) {
    throw new Error(`graybox room "${roomId}": no E (entry).`);
  }
  return {
    tiles: { sprites, collision: createCollisionGrid({ originX: 0, originY: 0, cellSize: ROOM_TILE_SIZE, columns: width, rows: height, cells }) },
    entryPoints: [entry],
    exitZone:
      exitMin && exitMax
        ? {
            x: exitMin.column * ROOM_TILE_SIZE,
            y: exitMin.row * ROOM_TILE_SIZE,
            width: (exitMax.column - exitMin.column + 1) * ROOM_TILE_SIZE,
            height: (exitMax.row - exitMin.row + 1) * ROOM_TILE_SIZE,
          }
        : undefined,
    spawns,
    areas,
  };
}
