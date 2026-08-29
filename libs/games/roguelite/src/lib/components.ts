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
  /** RGBA multiplier applied to the sampled texel — see SpriteDraw.tint. */
  readonly tint?: readonly [number, number, number, number];
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

/** Current HP. Monsters only, for now — see Hitbox's doc comment for why the player doesn't get one yet. */
export interface Life {
  readonly current: number;
}
export const Life = defineComponent<Life>('roguelite:Life');

/**
 * The box (relative to Position's top-left corner) checkHit tests against —
 * old pre-engine repo's per-species bodyColliderConfig. Monsters only:
 * damage only ever flows player->monster this step (confirmed: no
 * setLife/checkCollisionWith call site anywhere touches the player in the
 * old game), so the player isn't a valid hit target yet — add this to the
 * player when a future step actually needs to check something against it.
 */
export interface Hitbox {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
}
export const Hitbox = defineComponent<Hitbox>('roguelite:Hitbox');

/** A fired basic-attack projectile. Non-penetrating — consumed on its first registered hit (see systems/apply-hit-damage.ts). */
export interface Projectile {
  readonly velocityX: number;
  readonly velocityY: number;
  readonly damage: number;
  readonly remainingLifetimeMs: number;
}
export const Projectile = defineComponent<Projectile>('roguelite:Projectile');

/** Player-only. Counts down every tick; fires + resets to intervalMs when it reaches <=0 while the left mouse button is held and aimed away from the player's own position. */
export interface AttackCooldown {
  readonly remainingMs: number;
  readonly intervalMs: number;
}
export const AttackCooldown = defineComponent<AttackCooldown>('roguelite:AttackCooldown');

/**
 * Timer/counter state for periodic monster-wave spawning — old pre-engine
 * repo's OpeningScene.timeTotal/timeIterateCount (see systems/wave-spawn.ts
 * for the exact formulas). Lives on a single dedicated headless entity (no
 * Position/SpriteRender): this describes the wave-spawning PROCESS, not any
 * visible game object, so it doesn't belong on the player entity (would
 * conflate "the player character" with an unrelated global timer) or on
 * each monster (would multiply and desync). Same singleton-entity idiom as
 * PlayerControlled — see that component's own doc comment.
 */
export interface WaveSpawner {
  /** Old `timeTotal` — ms accumulated since the last wave triggered. */
  readonly elapsedMs: number;
  /** Old `timeIterateCount` — number of waves triggered so far (0 before the first). */
  readonly waveCount: number;
}
export const WaveSpawner = defineComponent<WaveSpawner>('roguelite:WaveSpawner');
