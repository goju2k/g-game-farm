import type { RenderSystem } from '@g-game-farm/engine';
import { PlayerControlled, Position } from '../components.js';
import { PLAYER_FRAME_SIZE } from '../player-constants.js';

/**
 * Centers the camera on the player sprite's *center*, not Position's
 * top-left corner (Position is a min-corner, same convention as
 * SpriteRender's dest rect — see components.ts). Replaces fixed-camera.ts's
 * hardcoded {x:0,y:0} placeholder now that player movement exists
 * (porting step 3).
 *
 * order: -1, same reason fixed-camera.ts needed it — submitSprite() bakes
 * the *current* camera into the quad's screen rect synchronously (see
 * sprite-batch-renderer.ts), so a render system that draws must run after
 * whichever one sets the camera for that frame; this must run before
 * render-sprites within the render phase.
 *
 * No smoothing/lerp — hard-follows Position every frame.
 * RenderContext.alpha (sub-step interpolation) isn't consumed anywhere in
 * this codebase yet, so this reads Position directly, same as
 * fixed-camera.ts did.
 */
export const cameraFollowPlayerSystem: RenderSystem = {
  name: 'roguelite:camera-follow-player',
  order: -1,
  run: (ctx) => {
    for (const [, position] of ctx.world.query([Position, PlayerControlled] as const)) {
      ctx.renderer.setCamera({
        x: position.x + PLAYER_FRAME_SIZE / 2,
        y: position.y + PLAYER_FRAME_SIZE / 2,
        zoom: 4,
      });
    }
  },
};
