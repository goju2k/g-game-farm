import type { CameraPose } from '@g-game-farm/ribs';
import type { Position } from './components.js';

/** The world view every screen shows (D-026, D-028): 480×270 world units. */
export const ROGUELITE_VIEW = { width: 480, height: 270 } as const;

/**
 * Screen pixels per world unit: the largest integer scale (of backing-store,
 * i.e. device, pixels) at which the whole 480×270 view fits — so pixel art
 * stays crisp. The game box is sized to exactly that (ui/screen-layout.ts),
 * so every screen shows the same world view (D-028). A canvas smaller than
 * 480×270 scales the view down to fit instead.
 */
export function cameraZoomFor(canvas: Readonly<{ width: number; height: number }>): number {
  const fit = Math.min(canvas.width / ROGUELITE_VIEW.width, canvas.height / ROGUELITE_VIEW.height);
  // +2: a box sized to exactly k×480 device px can come back a pixel short after CSS rounding.
  const scale = Math.floor(Math.min((canvas.width + 2) / ROGUELITE_VIEW.width, (canvas.height + 2) / ROGUELITE_VIEW.height));
  return scale >= 1 ? scale : fit > 0 ? fit : 1;
}

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
export function computeCameraPose(playerPosition: Position, playerHalfWidth: number, playerHalfHeight: number, zoom: number): CameraPose {
  return {
    x: playerPosition.x + playerHalfWidth,
    y: playerPosition.y + playerHalfHeight,
    zoom,
  };
}
