import type { RenderSystem, TextureHandle } from '@g-game-farm/ribs';
import { cameraCenterFor, cameraZoomFor, roomBounds, shakeOffsetX } from '../camera.js';
import { RoomTileLayout } from '../components.js';
import { ROOM_TILE_SIZE } from '../rooms/tile-layout.js';

/** Both of ROGUELITE_LAYERS' layer ids (bootstrap.ts) — this game uses one shared camera for its whole scene, so both get the same pose every frame. */
const LAYERS_FOLLOWING_PLAYER = ['ground', 'gameplay', 'overlay'] as const;

/**
 * Centers the camera on the player sprite's *center*, not Position's
 * top-left corner (Position is a min-corner, same convention as
 * SpriteRender's dest rect — see components.ts). Replaces fixed-camera.ts's
 * hardcoded {x:0,y:0} placeholder now that player movement exists
 * (porting step 3).
 *
 * order: -1 — submitSprite() now requires a camera to already be set for
 * its target layer this frame (see sprite-batch-renderer.ts), so a render
 * system that draws must run after whichever one sets the camera for that
 * frame; this must run before render-tilemap/render-sprites within the
 * render phase.
 *
 * No smoothing/lerp — hard-follows Position every frame. Uses
 * computeCameraPose() (camera.ts) — the same function fireProjectilesSystem
 * uses for aim conversion, so aim math and what's drawn on screen always
 * agree pixel-for-pixel (porting step 5).
 *
 * RenderContext.alpha (sub-step interpolation) isn't consumed anywhere in
 * this codebase yet, so this reads Position directly, same as
 * fixed-camera.ts did.
 */
export const cameraFollowPlayerSystem: RenderSystem = {
  name: 'roguelite:camera-follow-player',
  order: -1,
  run: (ctx) => {
    const canvas = ctx.renderer.getCanvasSize();
    // D-046: the screen is filled; where to look (director / player, the upright offset, held in the room) is camera.ts's.
    const center = cameraCenterFor(ctx.world, canvas);
    if (!center) return;
    const pose = { x: center.x + shakeOffsetX(ctx.world), y: center.y, zoom: cameraZoomFor(canvas) };
    for (const layerId of LAYERS_FOLLOWING_PLAYER) ctx.renderer.setCamera(layerId, pose);
  },
};

/** Around a room with no outside tile (D-046): a flat letterbox in the margin colour, over everything but the UI. */
const LETTERBOX: readonly [number, number, number, number] = [0x0b / 255, 0x09 / 255, 0x10 / 255, 1];
const LETTERBOX_FAR = 4000;

/**
 * What lies beyond the room (D-048): the room's outside tile — solid rock —
 * laid over the visible area outside the map on the lit ground layer, so the
 * dungeon runs on to the screen's edges under the same light (no box in a
 * margin). A room without one gets the flat letterbox. A factory: needs the
 * tileset textures and the white-pixel texture.
 */
export function createLetterboxSystem(whitePixel: TextureHandle, tilesetTextures: Readonly<Record<string, TextureHandle>> = {}): RenderSystem {
  return {
    name: 'roguelite:letterbox',
    order: -0.9,
    run: (ctx) => {
      const room = roomBounds(ctx.world);
      if (!room) return;
      const layout = [...ctx.world.query([RoomTileLayout] as const)][0]?.[1];
      const texture = layout?.outside ? tilesetTextures[layout.outside.tileset] : undefined;
      const camera = layout?.outside && texture !== undefined ? cameraCenterFor(ctx.world, ctx.renderer.getCanvasSize()) : undefined;
      if (layout?.outside && texture !== undefined && camera) {
        const { sx, sy } = layout.outside;
        const size = ROOM_TILE_SIZE;
        // The visible area, a tile of margin all round (shake), in whole tiles on the room's grid.
        const left = Math.floor((camera.x - camera.view.width / 2 - room.x) / size) - 1;
        const right = Math.ceil((camera.x + camera.view.width / 2 - room.x) / size) + 1;
        const top = Math.floor((camera.y - camera.view.height / 2 - room.y) / size) - 1;
        const bottom = Math.ceil((camera.y + camera.view.height / 2 - room.y) / size) + 1;
        const columns = room.width / size;
        const rows = room.height / size;
        for (let r = top; r < bottom; r++) {
          for (let c = left; c < right; c++) {
            if (r >= 0 && r < rows && c >= 0 && c < columns) continue; // the room draws itself
            ctx.renderer.submitSprite({ layer: 'ground', texture, sx, sy, sWidth: size, sHeight: size, x: room.x + c * size, y: room.y + r * size, width: size, height: size });
          }
        }
        return;
      }
      const rect = (x: number, y: number, width: number, height: number) =>
        ctx.renderer.submitSprite({ layer: 'overlay', texture: whitePixel, sx: 0, sy: 0, sWidth: 1, sHeight: 1, x, y, width, height, tint: LETTERBOX });
      const far = LETTERBOX_FAR;
      rect(room.x - far, room.y - far, room.width + far * 2, far); // above
      rect(room.x - far, room.y + room.height, room.width + far * 2, far); // below
      rect(room.x - far, room.y, far, room.height); // left
      rect(room.x + room.width, room.y, far, room.height); // right
    },
  };
}
