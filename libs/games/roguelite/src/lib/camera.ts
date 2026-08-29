import type { CameraPose } from '@g-game-farm/engine';
import type { Position } from './components.js';
import { PLAYER_FRAME_SIZE } from './player-constants.js';

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
 */
export function computeCameraPose(playerPosition: Position): CameraPose {
  return {
    x: playerPosition.x + PLAYER_FRAME_SIZE / 2,
    y: playerPosition.y + PLAYER_FRAME_SIZE / 2,
    zoom: ROGUELITE_CAMERA_ZOOM,
  };
}

/**
 * Inverse of camera-math.ts's computeQuadScreenRect point transform.
 * Ignores parallax/pixelSnap deliberately: the `gameplay` layer's
 * parallaxFactor defaults to 1 and zoom is already the integer 4, so
 * pixelSnap's rounding is a no-op here — and this feeds a normalized aim
 * direction, where sub-pixel rounding differences from rendering are
 * irrelevant. This is the authoritative aim calculation, not a rendering
 * concern.
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  camera: CameraPose,
  canvasSize: Readonly<{ width: number; height: number }>,
): { x: number; y: number } {
  return {
    x: (screenX - canvasSize.width / 2) / camera.zoom + camera.x,
    y: (screenY - canvasSize.height / 2) / camera.zoom + camera.y,
  };
}
