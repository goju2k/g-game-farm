import { COLLISION_EMPTY, COLLISION_SOLID, createCollisionGrid } from '@g-game-farm/ribs';
import type { RoomEntryPoint, RoomExit, RoomTileLayout, RoomTileSprite } from '../components.js';
import { ROOM_TILE_SIZE, tileSourceRect } from './tile-layout.js';

/** Dungeon-part0 tiles a graybox room is drawn with (see its .tsj names). */
const TILESET = 'dungeon-part0';
const TILESET_COLUMNS = 10;
const FLOOR_TILES = [0, 0, 0, 1, 2, 3];
/**
 * Walls (style guide §6, D-040): a top wall is its top (with its lower rim)
 * over a two-row face — both rows solid; side and bottom walls show only
 * their top. Face ends get pillars, rim ends their corner rims, a side wall
 * ending into open floor its front-faced end, a doorway's floor a threshold
 * (asset room #41 — dungeon-part0 v5 tile ids). Every other wall cell is
 * wall top, joined to its neighbours (D-041, asset room #43 — v6).
 */
const TILES = {
  faceUpper: 20,
  faceLower: 22,
  upperEndRight: 54,
  upperEndLeft: 55,
  upperPillar: 57,
  lowerEndRight: 64,
  lowerEndLeft: 65,
  lowerPillar: 67,
  sideEndLeftWall: 58,
  sideEndRightWall: 59,
  threshold: 56,
} as const;
/**
 * Wall top autotile (tileset.json autotile.walltop): 47-tile blob, tile =
 * base + masks.indexOf(mask). Mask bits are the neighbours that are wall top
 * too (N1 NE2 E4 SE8 S16 SW32 W64 NW128); a diagonal counts only with both
 * its sides. A 2px edge runs along every side that isn't.
 */
const WALL_TOP_BASE = 90;
const WALL_TOP_MASKS = [
  0, 1, 4, 5, 7, 16, 17, 20, 21, 23, 28, 29, 31, 64, 65, 68, 69, 71, 80, 81, 84, 85, 87, 92, 93, 95, 112, 113, 116, 117, 119, 124, 125, 127, 193, 197,
  199, 209, 213, 215, 221, 223, 241, 245, 247, 253, 255,
];
/** How far a doorway's sides are looked for, from a threshold cell. */
const DOORWAY_MAX = 6;

/**
 * One cell per character:
 * - `#` wall (solid), `.` floor
 * - `E` the entry (floor), `X` exit cells (floor; all X form one exit zone)
 * - `1`..`9` more exits on the room's edge, each its own zone, each with an
 *   entry point of the same id one cell inside it (arriving through that way)
 *
 * A wall row is added above the rows given (the top walls' second face row,
 * D-040); exits in the first row run up through it. Marker positions, decor
 * and cellOf() all speak in the built room's rows.
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

/** The rows as built: one more wall row on top, exits in the first row carried up through it. */
export function grownRows(rows: GrayboxRows): string[] {
  const first = rows[0] ?? '';
  return [[...first].map((ch) => (ch === 'X' || (ch >= '1' && ch <= '9') ? ch : '#')).join(''), ...rows];
}

export function buildGrayboxRoom(roomId: string, given: GrayboxRows, decor: readonly GrayboxDecor[] = []): GrayboxRoom {
  if (given.length === 0 || given.some((row) => row.length !== given[0].length)) {
    throw new Error(`graybox room "${roomId}": rows must be non-empty and the same length.`);
  }
  const rows = grownRows(given);
  const height = rows.length;
  const width = rows[0].length;
  const at = (column: number, row: number) => rows[row]?.[column] ?? '#';
  const isWall = (column: number, row: number) => at(column, row) === '#';
  // Wall shapes: a side wall's last cell into open floor; the lower / upper face rows; the rimmed top above them.
  // A side wall (plain floor beside it) ending into an opening below — not a doorway's side,
  // whose neighbour cells are the way through (exits, doors, vines): those get the face's pillar ends instead.
  const plainFloor = (c: number, r: number) => at(c, r) === '.' || at(c, r) === 'E';
  const sideEnd = (c: number, r: number) => {
    if (!isWall(c, r) || isWall(c, r + 1) || !isWall(c, r - 1)) return false;
    const left = plainFloor(c - 1, r) && isWall(c + 1, r);
    const right = plainFloor(c + 1, r) && isWall(c - 1, r);
    return left || right;
  };
  const lowerFace = (c: number, r: number) => isWall(c, r) && !isWall(c, r + 1) && !sideEnd(c, r);
  const upperFace = (c: number, r: number) => isWall(c, r) && lowerFace(c, r + 1);
  // Wall top: any wall that isn't a face row (side ends count); off the map counts too.
  const wallTop = (c: number, r: number) => c < 0 || r < 0 || c >= width || r >= height || (isWall(c, r) && !lowerFace(c, r) && !upperFace(c, r));
  const wallTopTile = (c: number, r: number) => {
    const t = (dc: number, dr: number) => wallTop(c + dc, r + dr);
    const n = t(0, -1);
    const e = t(1, 0);
    const s = t(0, 1);
    const w = t(-1, 0);
    const mask = (n ? 1 : 0) | (n && e && t(1, -1) ? 2 : 0) | (e ? 4 : 0) | (e && s && t(1, 1) ? 8 : 0) | (s ? 16 : 0) | (s && w && t(-1, 1) ? 32 : 0) | (w ? 64 : 0) | (w && n && t(-1, -1) ? 128 : 0);
    return WALL_TOP_BASE + WALL_TOP_MASKS.indexOf(mask);
  };
  const wallTile = (c: number, r: number): number => {
    if (sideEnd(c, r)) return !isWall(c + 1, r) ? TILES.sideEndLeftWall : TILES.sideEndRightWall;
    const ends = (same: (c: number, r: number) => boolean, both: number, right: number, left: number, plain: number) => {
      const r1 = same(c + 1, r);
      const l1 = same(c - 1, r);
      return !r1 && !l1 ? both : !r1 ? right : !l1 ? left : plain;
    };
    if (lowerFace(c, r)) return ends(lowerFace, TILES.lowerPillar, TILES.lowerEndRight, TILES.lowerEndLeft, TILES.faceLower);
    if (upperFace(c, r)) return ends(upperFace, TILES.upperPillar, TILES.upperEndRight, TILES.upperEndLeft, TILES.faceUpper);
    return wallTopTile(c, r);
  };
  /** A standing face's floor line (its depth among the actors, D-042), or undefined for a cell lying flat (tops). */
  const faceDepth = (c: number, r: number): number | undefined =>
    lowerFace(c, r) || sideEnd(c, r) ? (r + 1) * ROOM_TILE_SIZE : upperFace(c, r) ? (r + 2) * ROOM_TILE_SIZE : undefined;
  /** Floor right under a doorway in a top wall: lower faces both sides along the row above. */
  const threshold = (c: number, r: number) => {
    if (isWall(c, r - 1)) return false;
    const sideAt = (step: number) => {
      for (let k = 1; k <= DOORWAY_MAX; k++) {
        const cc = c + step * k;
        if (lowerFace(cc, r - 1)) return true;
        if (isWall(cc, r - 1)) return false;
      }
      return false;
    };
    return sideAt(-1) && sideAt(1);
  };
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
      const tile = (tileId: number, depth?: number) => sprites.push({ x, y, tileset: TILESET, ...tileSourceRect(tileId, TILESET_COLUMNS), ...(depth !== undefined ? { depth } : {}) });
      if (ch === '#') {
        cells[row * width + column] = COLLISION_SOLID;
        tile(wallTile(column, row), faceDepth(column, row));
        continue;
      }
      cells[row * width + column] = COLLISION_EMPTY;
      tile(ch !== 'X' && !(ch >= '1' && ch <= '9') && threshold(column, row) ? TILES.threshold : FLOOR_TILES[(column * 7 + row * 13) % FLOOR_TILES.length]);
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
  // Decor on a face stands with it (same depth, drawn after it).
  for (const d of decor) {
    const depth = isWall(d.column, d.row) ? faceDepth(d.column, d.row) : undefined;
    sprites.push({ x: d.column * ROOM_TILE_SIZE, y: d.row * ROOM_TILE_SIZE, tileset: TILESET, ...tileSourceRect(d.tile, TILESET_COLUMNS), ...(depth !== undefined ? { depth } : {}) });
  }
  const exitZones: Record<string, RoomExit['zone']> = {};
  const numberedEntries: RoomEntryPoint[] = [];
  for (const [digit, { min, max }] of Object.entries(numbered)) {
    exitZones[digit] = { x: min.column * ROOM_TILE_SIZE, y: min.row * ROOM_TILE_SIZE, width: (max.column - min.column + 1) * ROOM_TILE_SIZE, height: (max.row - min.row + 1) * ROOM_TILE_SIZE };
    // One cell inside, on the side the floor is: arriving through this way.
    const midColumn = (min.column + max.column) / 2;
    const midRow = Math.floor((min.row + max.row) / 2);
    const open = (column: number, row: number) => row >= 0 && row < height && column >= 0 && column < width && !isWall(column, row) && at(column, row) !== digit;
    const cell = open(Math.round(midColumn), max.row + 1)
      ? { column: midColumn, row: max.row + 1 }
      : open(Math.round(midColumn), min.row - 1)
        ? { column: midColumn, row: min.row - 1 }
        : open(max.column + 1, midRow)
          ? { column: max.column + 1, row: midRow }
          : { column: min.column - 1, row: midRow };
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

/** The cell holding `ch` (first in reading order) in the room as built from these rows (with its added top row) — for placing decor by a marker. */
export function cellOf(rows: GrayboxRows, ch: string): { column: number; row: number } | undefined {
  const built = grownRows(rows);
  for (let row = 0; row < built.length; row++) {
    const column = built[row].indexOf(ch);
    if (column >= 0) return { column, row };
  }
  return undefined;
}

/** A block of tiles (rows of tile ids) with its top-left at a cell. */
export function decorBlock(at: { column: number; row: number } | undefined, tiles: readonly (readonly number[])[]): GrayboxDecor[] {
  if (!at) return [];
  return tiles.flatMap((line, dy) => line.map((tile, dx) => ({ column: at.column + dx, row: at.row + dy, tile })));
}
