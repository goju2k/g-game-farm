import type { RenderSystem } from '@g-game-farm/ribs';
import { computeCameraPose } from '../camera.js';
import { PlayerControlled, Position } from '../components.js';

/** Both of ROGUELITE_LAYERS' layer ids (bootstrap.ts) — this game uses one shared camera for its whole scene, so both get the same pose every frame. */
const LAYERS_FOLLOWING_PLAYER = ['ground', 'gameplay'] as const;

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
    for (const [, position] of ctx.world.query([Position, PlayerControlled] as const)) {
      const pose = computeCameraPose(position);
      for (const layerId of LAYERS_FOLLOWING_PLAYER) {
        ctx.renderer.setCamera(layerId, pose);
      }
    }
  },
};
