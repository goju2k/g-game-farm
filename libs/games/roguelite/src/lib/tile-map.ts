import type { AABB } from '@g-game-farm/ribs';
import { WORLD_SIZE } from './world-constants.js';

/** Old pre-engine repo's OpeningWorld: numberOfTiles:[32,32]. */
export const TILE_GRID_SIZE = 32;

/**
 * Grid step, old pre-engine repo's OpeningWorld tileSize:15 — deliberately
 * NOT TILE_SPRITE_SIZE (16). TILE_GRID_SIZE * TILE_SPACING === WORLD_SIZE
 * (480), the same identity world-constants.ts's own doc comment already
 * establishes; this is the step-7 consumer that comment was written for.
 */
export const TILE_SPACING = 15;

/**
 * tiles.png's real frame size (160x160px, 10x10 grid of 16x16 frames —
 * confirmed by reading the PNG directly). Bigger than TILE_SPACING on
 * purpose: adjacent tiles/wall colliders overlap by 1 unit so there are no
 * seam gaps in the floor and no collision gaps in the wall ring. Don't
 * "fix" this to match TILE_SPACING.
 */
export const TILE_SPRITE_SIZE = 16;

/** Same centering convention as WORLD_SIZE — tile index 0 sits at -WORLD_SIZE/2, not 0. */
const ORIGIN = -WORLD_SIZE / 2;

export interface TilePlacement {
  readonly x: number;
  readonly y: number;
}

function tileCoord(index: number): number {
  return ORIGIN + index * TILE_SPACING;
}

/**
 * Every cell of the 32x32 grid, tileNo 1 — old pre-engine repo's
 * OpeningWorld#init()'s layer1 loop.
 */
export const FLOOR_TILES: readonly TilePlacement[] = Array.from({ length: TILE_GRID_SIZE }, (_, row) =>
  Array.from({ length: TILE_GRID_SIZE }, (_, col) => ({ x: tileCoord(row), y: tileCoord(col) })),
).flat();

/**
 * Border ring only, tileNo 11 — old pre-engine repo's OpeningWorld#init()'s
 * four layer2 loops (left column, right column, top row, bottom row).
 * Exactly 128 entries (4 * TILE_GRID_SIZE), NOT deduped: the 4 corners are
 * each pushed twice (once by a vertical-edge loop, once by a
 * horizontal-edge loop) — 124 unique border positions + 4 duplicates = 128.
 * Matches source exactly; a duplicate wall tile draws/collides identically
 * to its twin, so this is harmless redundancy, not a bug to clean up.
 */
export const WALL_TILES: readonly TilePlacement[] = (() => {
  const last = TILE_GRID_SIZE - 1;
  const tiles: TilePlacement[] = [];
  for (let idx = 0; idx < TILE_GRID_SIZE; idx++) tiles.push({ x: tileCoord(0), y: tileCoord(idx) });
  for (let idx = 0; idx < TILE_GRID_SIZE; idx++) tiles.push({ x: tileCoord(last), y: tileCoord(idx) });
  for (let idx = 0; idx < TILE_GRID_SIZE; idx++) tiles.push({ x: tileCoord(idx), y: tileCoord(0) });
  for (let idx = 0; idx < TILE_GRID_SIZE; idx++) tiles.push({ x: tileCoord(idx), y: tileCoord(last) });
  return tiles;
})();

/**
 * One full TILE_SPRITE_SIZE x TILE_SPRITE_SIZE box per WALL_TILES entry —
 * old pre-engine repo's MapWallTile's colliderConfig:{} resolving through
 * BoxCollider's `width = width || target.width` to a 16x16 box at offset
 * (0,0) (TopLeft anchor, so world position === drawX/drawY directly, no
 * translation needed). This IS the collision geometry movePlayerSystem
 * checks against — confirmed equivalent to the old game's full
 * objectContext.list walk: no monster or particle in the old game ever
 * sets colliderConfig (only bodyColliderConfig, a different collider
 * slot), so MapWallTile is the only thing besides the player itself that
 * ever contributes a 'base'-type collision.
 */
export const WALL_COLLIDERS: readonly AABB[] = WALL_TILES.map((tile) => ({
  x: tile.x,
  y: tile.y,
  width: TILE_SPRITE_SIZE,
  height: TILE_SPRITE_SIZE,
}));
