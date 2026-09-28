import type { CameraPose } from '@g-game-farm/ribs';
import type { Position } from './components.js';

/** Screen pixels per world unit — extracted from cameraFollowPlayerSystem's previous inline literal. */
export const ROGUELITE_CAMERA_ZOOM = 4;

/**
 * Centers the camera on the player sprite's center, not Position's top-left
 * corner. Takes the player's current half-width/half-height as parameters
 * rather than a fixed constant — the player's on-screen size depends on
 * which growth-stage form is active (see player-forms.ts), so the caller
 * reads it live off the player's own current SpriteRender.
 *
 * Render-side only: aiming no longer re-derives this pose in the
 * simulation — the mouse arrives already in world units, resolved against
 * the camera that was actually drawn (see fire-projectiles.ts).
 */
export function computeCameraPose(playerPosition: Position, playerHalfWidth: number, playerHalfHeight: number): CameraPose {
  return {
    x: playerPosition.x + playerHalfWidth,
    y: playerPosition.y + playerHalfHeight,
    zoom: ROGUELITE_CAMERA_ZOOM,
  };
}
