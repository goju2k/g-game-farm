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
 * - `1`..`9` more exits on the room's edge, each its own zone, each with an
 *   entry point of the same id one cell inside it (arriving through that way)
 * - any other letter: floor with a spawn marker, returned in `spawns`
 */
export type GrayboxRows = readonly string[];

export interface GrayboxRoom {
  readonly tiles: RoomTileLayout;
  readonly entryPoints: readonly RoomEntryPoint[];
  /** Where X cells are — the caller turns it into a RoomExit (target, lock). */
  readonly exitZone: RoomExit['zone'] | undefined;
  /** Numbered exits (`1`..`9`) by digit; each has an entry point with the same id. */
  readonly exitZones: Readonly<Record<string, RoomExit['zone']>>;
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
/** A tileset tile drawn over the room at a cell (traces on walls, the seal mark, remains). Static (first frame). */
export interface GrayboxDecor {
  readonly column: number;
  readonly row: number;
  readonly tile: number;
}

export function buildGrayboxRoom(roomId: string, rows: GrayboxRows, decor: readonly GrayboxDecor[] = []): GrayboxRoom {
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
  const numbered: Record<string, { min: { column: number; row: number }; max: { column: number; row: number } }> = {};

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
      } else if (ch >= '1' && ch <= '9') {
        const zone = numbered[ch];
        numbered[ch] = zone
          ? { min: { column: Math.min(zone.min.column, column), row: Math.min(zone.min.row, row) }, max: { column: Math.max(zone.max.column, column), row: Math.max(zone.max.row, row) } }
          : { min: { column, row }, max: { column, row } };
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
  for (const d of decor) sprites.push({ x: d.column * ROOM_TILE_SIZE, y: d.row * ROOM_TILE_SIZE, tileset: TILESET, ...tileSourceRect(d.tile, TILESET_COLUMNS) });
  const exitZones: Record<string, RoomExit['zone']> = {};
  const numberedEntries: RoomEntryPoint[] = [];
  for (const [digit, { min, max }] of Object.entries(numbered)) {
    exitZones[digit] = { x: min.column * ROOM_TILE_SIZE, y: min.row * ROOM_TILE_SIZE, width: (max.column - min.column + 1) * ROOM_TILE_SIZE, height: (max.row - min.row + 1) * ROOM_TILE_SIZE };
    // One cell inside, off the edge it's on: arriving through this way.
    const midColumn = (min.column + max.column) / 2;
    const midRow = Math.floor((min.row + max.row) / 2);
    const cell =
      min.column === 0 ? { column: max.column + 1, row: midRow } : max.column === width - 1 ? { column: min.column - 1, row: midRow } : min.row === 0 ? { column: midColumn, row: max.row + 1 } : { column: midColumn, row: min.row - 1 };
    numberedEntries.push({ id: digit, position: { x: cell.column * ROOM_TILE_SIZE + ROOM_TILE_SIZE / 2, y: cell.row * ROOM_TILE_SIZE + ROOM_TILE_SIZE - 2 } });
  }
  // No E: a room only ever entered through its numbered ways starts (cold boot, ?room=) at the first of them.
  const start = entry ?? (numberedEntries[0] ? { id: 'start', position: numberedEntries[0].position } : undefined);
  if (!start) {
    throw new Error(`graybox room "${roomId}": no E (entry) and no numbered exits.`);
  }
  return {
    tiles: { sprites, collision: createCollisionGrid({ originX: 0, originY: 0, cellSize: ROOM_TILE_SIZE, columns: width, rows: height, cells }) },
    entryPoints: [start, ...numberedEntries],
    exitZones,
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

/** A numbered exit's destination: another room, arriving at its entry point `entry`. */
export interface ExitLink {
  readonly room: string;
  readonly entry: string;
}

/** The room's numbered exits as RoomExits, by digit -> destination. Throws on a link to a digit the map doesn't have. */
export function linkExits(roomId: string, room: GrayboxRoom, links: Readonly<Record<string, ExitLink>>): RoomExit[] {
  return Object.entries(links).map(([digit, link]) => {
    const zone = room.exitZones[digit];
    if (!zone) throw new Error(`graybox room "${roomId}": no exit "${digit}" in the map.`);
    return { id: `exit-${digit}`, zone, targetRoomId: link.room, targetEntryId: link.entry };
  });
}

/** The first cell holding `ch` in the rows (for placing decor by a marker). */
export function cellOf(rows: GrayboxRows, ch: string): { column: number; row: number } | undefined {
  for (let row = 0; row < rows.length; row++) {
    const column = rows[row].indexOf(ch);
    if (column >= 0) return { column, row };
  }
  return undefined;
}

/** A block of tiles (rows of tile ids) with its top-left at a cell. */
export function decorBlock(at: { column: number; row: number } | undefined, tiles: readonly (readonly number[])[]): GrayboxDecor[] {
  if (!at) return [];
  return tiles.flatMap((line, dy) => line.map((tile, dx) => ({ column: at.column + dx, row: at.row + dy, tile })));
}
