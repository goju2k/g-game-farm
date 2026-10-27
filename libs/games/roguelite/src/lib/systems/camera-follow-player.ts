import type { RenderSystem, TextureHandle } from '@g-game-farm/ribs';
import { cameraCenterFor, cameraZoomFor, roomBounds, shakeOffsetX } from '../camera.js';

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

/** The void around a room smaller than the view (D-046): letterboxed in the margin colour, over everything but the UI. */
const LETTERBOX: readonly [number, number, number, number] = [0x0b / 255, 0x09 / 255, 0x10 / 255, 1];
const LETTERBOX_FAR = 4000;

/** Draws the letterbox around the room on the (unlit) overlay, first — event fades still go over it. A factory: needs the white-pixel texture. */
export function createLetterboxSystem(whitePixel: TextureHandle): RenderSystem {
  return {
    name: 'roguelite:letterbox',
    order: -0.9,
    run: (ctx) => {
      const room = roomBounds(ctx.world);
      if (!room) return;
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
