import { defineComponent, type AnimationPlayerState, type SpriteAnimation, type TextureHandle } from '@g-game-farm/engine';

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

/**
 * Marks the single entity movement/camera systems should treat as "the
 * player" — lets movePlayerSystem/cameraFollowPlayerSystem query for
 * exactly that one entity without a name string or singleton lookup, and
 * never matches a monster (see Chaser below) even though monsters also
 * carry Position/SpriteRender/Animator. `speed` lives here — not a magic
 * number inside the system — so a future speed-boost item/status effect
 * is a data change, not a system rewrite.
 */
export interface PlayerControlled {
  /** World units per second. */
  readonly speed: number;
}
export const PlayerControlled = defineComponent<PlayerControlled>('roguelite:PlayerControlled');

/**
 * Marks a non-player entity that should continuously move toward the
 * PlayerControlled entity's current Position — see systems/chase-player.ts.
 * Never attached to the player entity itself. `speed` lives here, same
 * reasoning as PlayerControlled.speed: a per-species stat is data, not a
 * number baked into the system.
 */
export interface Chaser {
  /** World units per second. */
  readonly speed: number;
}
export const Chaser = defineComponent<Chaser>('roguelite:Chaser');

/**
 * One entity's animation playback slot. Deliberately generic — not
 * player-specific in shape — per animation/types.ts's own documented
 * intent: "Games embed this in their own component ... which clip is
 * active, facing, etc." `clips` holds shared SpriteAnimation references
 * (safe: nothing mutates a SpriteAnimation after creation, so many
 * entities of the same kind can share the same clip objects).
 */
export interface Animator {
  readonly clips: Readonly<Record<string, SpriteAnimation>>;
  readonly current: string;
  readonly state: AnimationPlayerState;
}
export const Animator = defineComponent<Animator>('roguelite:Animator');
