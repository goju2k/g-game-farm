import type { RenderSystem, System, TextureHandle } from '@g-game-farm/ribs';
import { RoomClock, RoomTileLayout, type RoomTileFrame, type RoomTileSprite } from '../components.js';
import { ROOM_TILE_SIZE } from '../rooms/tile-layout.js';

const GROUND_LAYER = 'ground';
const GAMEPLAY_LAYER = 'gameplay';
/** RoomTileSprite.tileset's default — the original tiles.png. */
const DEFAULT_TILESET = 'tiles';

/** Advances the room's RoomClock by each simulation step — the clock animated tiles read. */
export const advanceRoomClockSystem: System = {
  name: 'roguelite:advance-room-clock',
  run: (ctx) => {
    for (const [id, clock] of ctx.world.query([RoomClock] as const)) {
      ctx.world.set(id, RoomClock, { elapsedMs: clock.elapsedMs + ctx.deltaMs });
    }
  },
};

/** The frame an animated tile shows `elapsedMs` into its loop (Tiled's own model: the cycle repeats forever, all copies in step). */
export function tileFrameAt(frames: readonly RoomTileFrame[], elapsedMs: number): RoomTileFrame {
  const cycleMs = frames.reduce((sum, f) => sum + f.durationMs, 0);
  let t = elapsedMs % cycleMs;
  for (const frame of frames) {
    if (t < frame.durationMs) {
      return frame;
    }
    t -= frame.durationMs;
  }
  return frames[frames.length - 1]; // unreachable for positive durations; keeps the type total
}

function sourceOf(tile: RoomTileSprite, elapsedMs: number): { readonly sx: number; readonly sy: number } {
  return tile.frames ? tileFrameAt(tile.frames, elapsedMs) : tile;
}

/**
 * A factory (not a plain const) because it needs real TextureHandles at
 * registration time — one per tileset name (see ROGUELITE_TILESET_IMAGES).
 * Reads the active room's RoomTileLayout singleton (set by
 * rooms/create-room-scene.ts) and draws its `sprites` in array order —
 * back-to-front, so where two sprites share a cell (floor under a wall)
 * the later one wins under alpha blending. Consecutive sprites sharing a
 * tileset collapse into one draw call (see batching.ts's same-texture
 * merge). Animated tiles pick their frame from the room's RoomClock. Only
 * draws artwork: the room's CollisionGrid is never rendered.
 *
 * No `order` set — layer draw order comes from ROGUELITE_LAYERS' array
 * position, not from which system submits in which order within the
 * render phase.
 */
export function createRenderTilemapSystem(tilesetTextures: Readonly<Record<string, TextureHandle>>): RenderSystem {
  return {
    name: 'roguelite:render-tilemap',
    run: (ctx) => {
      let elapsedMs = 0;
      for (const [, clock] of ctx.world.query([RoomClock] as const)) {
        elapsedMs = clock.elapsedMs;
      }
      for (const [, layout] of ctx.world.query([RoomTileLayout] as const)) {
        for (const tile of layout.sprites) {
          const tilesetName = tile.tileset ?? DEFAULT_TILESET;
          const texture = tilesetTextures[tilesetName];
          if (texture === undefined) {
            throw new Error(`render-tilemap: no texture for tileset "${tilesetName}" — is it in ROGUELITE_TILESET_IMAGES?`);
          }
          const { sx, sy } = sourceOf(tile, elapsedMs);
          ctx.renderer.submitSprite({
            // A standing wall face sorts among the actors (D-042); the rest lies on the ground.
            ...(tile.depth !== undefined ? { layer: GAMEPLAY_LAYER, depth: tile.depth } : { layer: GROUND_LAYER }),
            texture,
            sx,
            sy,
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
