import type { CameraPose } from '@g-game-farm/ribs';
import type { Position } from './components.js';

/**
 * Fixed canvas size — moved here from being an app-local constant
 * (game-canvas.tsx) so it can never drift from the aim math below, which
 * needs the same number.
 */
export const ROGUELITE_CANVAS_SIZE: Readonly<{ width: number; height: number }> = { width: 960, height: 540 };

/** Screen pixels per world unit — extracted from cameraFollowPlayerSystem's previous inline literal. */
export const ROGUELITE_CAMERA_ZOOM = 4;

/**
 * Centers the camera on the player sprite's center, not Position's top-left
 * corner. Shared by cameraFollowPlayerSystem (render) and
 * fireProjectilesSystem (simulation) — both must agree on the exact same
 * camera pose so aim calculations and what's actually drawn on screen match
 * pixel-for-pixel every frame.
 *
 * Takes the player's current half-width/half-height as parameters rather
 * than a fixed constant — the player's on-screen size now depends on which
 * growth-stage form is active (see player-forms.ts), so both callers read
 * it live off the player's own current SpriteRender instead of a single
 * hardcoded frame size.
 */
export function computeCameraPose(playerPosition: Position, playerHalfWidth: number, playerHalfHeight: number): CameraPose {
  return {
    x: playerPosition.x + playerHalfWidth,
    y: playerPosition.y + playerHalfHeight,
    zoom: ROGUELITE_CAMERA_ZOOM,
  };
}

/**
 * Inverse of the engine's default top-down orthographic screen transform
 * (see render/camera-3d.ts). Ignores parallax/pixelSnap deliberately: this
 * uses the raw, unsnapped camera pose, while rendering now snaps the
 * `gameplay` layer's camera to the pixel grid (see render/pixel-snap.ts) —
 * at zoom=4 that's at most ~0.5 screen-px of divergence, and this feeds a
 * normalized aim direction, where that's irrelevant. This is the
 * authoritative aim calculation, not a rendering concern, so it
 * deliberately doesn't couple itself to the render-side snap logic.
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  camera: CameraPose,
  canvasSize: Readonly<{ width: number; height: number }>,
): { x: number; y: number } {
  const zoom = camera.zoom ?? 1;
  return {
    x: (screenX - canvasSize.width / 2) / zoom + camera.x,
    y: (screenY - canvasSize.height / 2) / zoom + camera.y,
  };
}
