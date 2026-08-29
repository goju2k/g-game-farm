import type { RenderSystem } from '@g-game-farm/engine';

/**
 * Hardcoded camera. order: -1 so this runs before render-sprites within
 * the render phase — submitSprite() bakes the *current* camera into the
 * quad's screen rect synchronously (see sprite-batch-renderer.ts), it
 * doesn't re-read the camera later at flush(). A render system that draws
 * must therefore run after whichever one sets the camera for that frame.
 *
 * Placeholder only — gets replaced by a camera-follows-player system once
 * player movement lands (porting step 3). zoom: 4 turns the player's
 * 18x18-world-unit sprite into a 72x72 screen-pixel region, comfortably
 * visible against the 960x540 canvas for a screenshot-based check.
 */
export const fixedCameraSystem: RenderSystem = {
  name: 'roguelite:fixed-camera',
  order: -1,
  run: (ctx) => {
    ctx.renderer.setCamera({ x: 0, y: 0, zoom: 4 });
  },
};
