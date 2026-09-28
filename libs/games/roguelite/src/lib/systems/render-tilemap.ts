import type { RenderSystem, TextureHandle } from '@g-game-farm/ribs';
import { RoomTileLayout } from '../components.js';
import { ROOM_TILE_SIZE } from '../rooms/tile-layout.js';

const GROUND_LAYER = 'ground';

/**
 * A factory (not a plain const) because it needs a real TextureHandle at
 * registration time — same reason createFireProjectilesSystem is a
 * factory. Reads the active room's RoomTileLayout singleton (set by
 * rooms/create-room-scene.ts) and draws its `sprites` in array order —
 * back-to-front, so where two sprites share a cell (floor under a wall)
 * the later one wins under alpha blending. All share one texture, so this
 * collapses to a single draw call (see batching.ts's same-texture merge).
 * Only draws artwork: the room's CollisionGrid is never rendered.
 *
 * No `order` set — layer draw order comes from ROGUELITE_LAYERS' array
 * position, not from which system submits in which order within the
 * render phase.
 */
export function createRenderTilemapSystem(texture: TextureHandle): RenderSystem {
  return {
    name: 'roguelite:render-tilemap',
    run: (ctx) => {
      for (const [, layout] of ctx.world.query([RoomTileLayout] as const)) {
        for (const tile of layout.sprites) {
          ctx.renderer.submitSprite({
            layer: GROUND_LAYER,
            texture,
            sx: tile.sx,
            sy: tile.sy,
            sWidth: ROOM_TILE_SIZE,
            sHeight: ROOM_TILE_SIZE,
            x: tile.x,
            y: tile.y,
            width: ROOM_TILE_SIZE,
            height: ROOM_TILE_SIZE,
          });
        }
      }
    },
  };
}
