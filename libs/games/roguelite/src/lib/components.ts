import { defineComponent, type TextureHandle } from '@g-game-farm/engine';

/**
 * World-space position of an entity's top-left corner — the same min-corner
 * convention as SpriteDraw's dest rect and the engine's AABB (see
 * physics/aabb.ts), so a future hitbox component composes with this
 * directly instead of needing its own translation.
 */
export interface Position {
  readonly x: number;
  readonly y: number;
}
export const Position = defineComponent<Position>('roguelite:Position');

/**
 * What to draw for an entity that also has Position. Mirrors SpriteDraw
 * minus x/y (Position supplies those instead) — see
 * systems/render-sprites.ts, the only place this is consumed.
 */
export interface SpriteRender {
  readonly texture: TextureHandle;
  readonly layer: string;
  /** Source rect, in texture pixels. */
  readonly sx: number;
  readonly sy: number;
  readonly sWidth: number;
  readonly sHeight: number;
  /** Destination size, in world units. */
  readonly width: number;
  readonly height: number;
  readonly flipX?: boolean;
}
export const SpriteRender = defineComponent<SpriteRender>('roguelite:SpriteRender');
