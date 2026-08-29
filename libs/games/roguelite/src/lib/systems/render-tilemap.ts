import type { RenderSystem, TextureHandle } from '@g-game-farm/engine';
import { FLOOR_TILES, TILE_SPRITE_SIZE, WALL_TILES } from '../tile-map.js';

const GROUND_LAYER = 'ground';
// tiles.png is a 10x10 grid of 16x16 frames. tileNo 1 (floor) -> row0,col0 -> (0,0). tileNo 11 (wall) -> row1,col0 -> (0,16).
const FLOOR_SOURCE = { sx: 0, sy: 0 };
const WALL_SOURCE = { sx: 0, sy: 16 };

/**
 * A factory (not a plain const) because it needs a real TextureHandle at
 * registration time — same reason createFireProjectilesSystem is a
 * factory. Draws FLOOR_TILES before WALL_TILES: both share one texture
 * handle so this collapses to a single BatchAccumulator span (one GL draw
 * call) regardless of tile count — see batching.ts's consecutive-same-
 * texture merge — and floor-before-wall ordering is required, not just
 * cosmetic: every border cell has a floor tile AND a wall tile at the
 * identical dest rect, so submission order decides which one wins under
 * standard alpha blending.
 *
 * No `order` set — layer draw order comes from ROGUELITE_LAYERS' array
 * position (see Renderer's per-layer Map, built once at construction and
 * iterated in that same order every flush()), not from which system
 * submits in which order within the render phase.
 */
export function createRenderTilemapSystem(texture: TextureHandle): RenderSystem {
  return {
    name: 'roguelite:render-tilemap',
    run: (ctx) => {
      for (const tile of FLOOR_TILES) {
        ctx.renderer.submitSprite({
          layer: GROUND_LAYER,
          texture,
          ...FLOOR_SOURCE,
          sWidth: TILE_SPRITE_SIZE,
          sHeight: TILE_SPRITE_SIZE,
          x: tile.x,
          y: tile.y,
          width: TILE_SPRITE_SIZE,
          height: TILE_SPRITE_SIZE,
        });
      }
      for (const tile of WALL_TILES) {
        ctx.renderer.submitSprite({
          layer: GROUND_LAYER,
          texture,
          ...WALL_SOURCE,
          sWidth: TILE_SPRITE_SIZE,
          sHeight: TILE_SPRITE_SIZE,
          x: tile.x,
          y: tile.y,
          width: TILE_SPRITE_SIZE,
          height: TILE_SPRITE_SIZE,
        });
      }
    },
  };
}
