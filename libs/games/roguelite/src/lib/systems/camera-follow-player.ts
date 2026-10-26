import type { RenderSystem } from '@g-game-farm/ribs';
import { cameraZoomFor, computeCameraPose } from '../camera.js';
import { ScreenShake } from '../combat/combat-components.js';
import { PlayerControlled, Position, SpriteRender } from '../components.js';
import { CameraDirector } from '../events/event-components.js';
import { spriteDrawOrigin } from './render-sprites.js';

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
    const zoom = cameraZoomFor(ctx.renderer.getCanvasSize());
    let shakeX = 0;
    for (const [, shake] of ctx.world.query([ScreenShake] as const)) {
      // Alternate sides each step while it lasts (combat spec §3: 2px, 6f).
      shakeX = shake.framesLeft > 0 ? (shake.framesLeft % 2 === 0 ? shake.px : -shake.px) : 0;
    }
    // Rooms with events steer the camera through CameraDirector (pans, follow targets); its x,y is the center to show.
    const director = [...ctx.world.query([CameraDirector] as const)][0]?.[1];
    if (director) {
      const pose = { ...computeCameraPose({ x: director.x, y: director.y }, 0, 0, zoom), x: director.x + shakeX };
      for (const layerId of LAYERS_FOLLOWING_PLAYER) ctx.renderer.setCamera(layerId, pose);
      return;
    }
    for (const [, position, sprite] of ctx.world.query([Position, SpriteRender, PlayerControlled] as const)) {
      // Center on what's drawn: for an origin-anchored sprite Position is the feet, not the top-left.
      const drawn = spriteDrawOrigin(position, sprite);
      const centered = computeCameraPose(drawn, sprite.width / 2, sprite.height / 2, zoom);
      const pose = { ...centered, x: centered.x + shakeX };
      for (const layerId of LAYERS_FOLLOWING_PLAYER) {
        ctx.renderer.setCamera(layerId, pose);
      }
    }
  },
};
