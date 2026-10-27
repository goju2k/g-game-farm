import type { CameraPose, ReadonlyWorld } from '@g-game-farm/ribs';
import { ScreenShake } from './combat/combat-components.js';
import type { Position } from './components.js';
import { PlayerControlled, Position as PositionC, RoomTileLayout, SpriteRender } from './components.js';
import { CameraDirector } from './events/event-components.js';
import { spriteDrawOrigin } from './systems/render-sprites.js';

/**
 * The least world view a screen shows (D-046): its short axis always sees at
 * least 270 world units; the long axis sees as much more as the screen's
 * shape gives (a phone upright: 270 wide and taller; a PC: 270 high and
 * wider). The screen is always filled — no fixed 480×270 box any more.
 */
export const VIEW_SHORT_AXIS = 270;
/** The view a 16:9 screen gets — the size the rooms and scenes were laid out for. */
export const ROGUELITE_VIEW = { width: 480, height: VIEW_SHORT_AXIS } as const;
/** Upright, the player stands this far up the screen (0.5 = middle) — clear of the thumbs (D-046). */
const PORTRAIT_PLAYER_AT = 0.4;

/**
 * Screen pixels per world unit: the largest integer scale (of backing-store,
 * i.e. device, pixels) at which the short axis still sees VIEW_SHORT_AXIS
 * world units — so pixel art stays crisp. A canvas whose short side is under
 * 270 px scales down to fit instead.
 */
export function cameraZoomFor(canvas: Readonly<{ width: number; height: number }>): number {
  const short = Math.min(canvas.width, canvas.height);
  // +2: a box sized to exactly k×270 device px can come back a pixel short after CSS rounding.
  const scale = Math.floor((short + 2) / VIEW_SHORT_AXIS);
  return scale >= 1 ? scale : short > 0 ? short / VIEW_SHORT_AXIS : 1;
}

/** The world size the canvas shows at cameraZoomFor's scale. */
export function viewSizeFor(canvas: Readonly<{ width: number; height: number }>): { readonly width: number; readonly height: number } {
  const zoom = cameraZoomFor(canvas);
  return { width: canvas.width / zoom, height: canvas.height / zoom };
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

/** The room's extent in world units (its collision grid), or undefined outside a room (the title). */
export function roomBounds(world: ReadonlyWorld): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | undefined {
  const layout = [...world.query([RoomTileLayout] as const)][0]?.[1];
  if (!layout) return undefined;
  const grid = layout.collision;
  return { x: grid.originX, y: grid.originY, width: grid.columns * grid.cellSize, height: grid.rows * grid.cellSize };
}

/** One axis: a room wider than the view keeps the view inside it; a narrower one sits in the middle (letterboxed). */
function clampAxis(center: number, view: number, start: number, size: number): number {
  if (size <= view) return start + size / 2;
  return Math.max(start + view / 2, Math.min(start + size - view / 2, center));
}

/**
 * Where the camera looks this frame (D-046), shared by the camera system and
 * anything drawn over the whole view: the event director's point, else the
 * player's middle; upright, the player is shown a little above the middle;
 * then held inside the room (it stops at the room's edges, or centres a room
 * smaller than the view). Shake is applied on top by the camera system.
 */
export function cameraCenterFor(world: ReadonlyWorld, canvas: Readonly<{ width: number; height: number }>): { readonly x: number; readonly y: number; readonly view: { readonly width: number; readonly height: number } } | undefined {
  const view = viewSizeFor(canvas);
  const director = [...world.query([CameraDirector] as const)][0]?.[1];
  let center: { x: number; y: number } | undefined;
  let following = true;
  if (director) {
    center = { x: director.x, y: director.y };
    following = director.mode === 'follow';
  } else {
    for (const [, position, sprite] of world.query([PositionC, SpriteRender, PlayerControlled] as const)) {
      // Center on what's drawn: for an origin-anchored sprite Position is the feet, not the top-left.
      const drawn = spriteDrawOrigin(position, sprite);
      center = { x: drawn.x + sprite.width / 2, y: drawn.y + sprite.height / 2 };
    }
  }
  if (!center) return undefined;
  if (following && canvas.height > canvas.width) center = { x: center.x, y: center.y + view.height * (0.5 - PORTRAIT_PLAYER_AT) };
  const room = roomBounds(world);
  if (room) center = { x: clampAxis(center.x, view.width, room.x, room.width), y: clampAxis(center.y, view.height, room.y, room.height) };
  return { ...center, view };
}

/** The current screen shake offset (alternating sides each step while it lasts — combat spec §3). */
export function shakeOffsetX(world: ReadonlyWorld): number {
  let shakeX = 0;
  for (const [, shake] of world.query([ScreenShake] as const)) {
    shakeX = shake.framesLeft > 0 ? (shake.framesLeft % 2 === 0 ? shake.px : -shake.px) : 0;
  }
  return shakeX;
}
