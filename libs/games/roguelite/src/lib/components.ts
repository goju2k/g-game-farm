import {
  defineComponent,
  type AABB,
  type AnimationPlayerState,
  type CollisionGrid,
  type Condition,
  type ScenarioCommand,
  type ScenarioState,
  type SpriteAnimation,
  type TextureHandle,
} from '@g-game-farm/ribs';
import type { RogueliteScenarioCommand } from './scenario/scenario-commands.js';
import type { PlayerFormId } from './session.js';

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

/**
 * The player's movement-blocking box (relative to Position's top-left
 * corner) — old pre-engine repo's Player.ts colliderConfig/'base' (NOT
 * bodyColliderConfig/'body', which Hitbox already covers). This box, not
 * the sprite, is what's swept through the room's CollisionGrid (see
 * systems/move-player.ts) and tested against exit zones / pickups.
 * Player-only: monsters don't collide with walls.
 */
export interface WallCollider {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
}
export const WallCollider = defineComponent<WallCollider>('roguelite:WallCollider');

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

/** One ROOM_TILE_SIZE square of tiles.png drawn at a world position (top-left). */
export interface RoomTileSprite {
  readonly x: number;
  readonly y: number;
  /** Source rect's top-left in tiles.png — see rooms/tile-layout.ts's tileSourceRect. */
  readonly sx: number;
  readonly sy: number;
}

/**
 * A room's tile geometry, computed once per room (procedurally — see
 * rooms/tile-layout.ts — or from a Tiled map — see rooms/tiled-room.ts) and
 * read every frame by render-tilemap.ts / move-player.ts. Lives on a
 * dedicated singleton entity per room.
 *
 * What's drawn and what blocks are two independent products of the same
 * grid, never derived from one another at runtime: `sprites` is artwork,
 * `collision` is the engine's CollisionGrid. A cell can look like a wall
 * and be walkable (secret passage) or vice versa.
 */
export interface RoomTileLayout {
  /** Back-to-front. */
  readonly sprites: readonly RoomTileSprite[];
  readonly collision: CollisionGrid;
}
export const RoomTileLayout = defineComponent<RoomTileLayout>('roguelite:RoomTileLayout');

/** One traversable connection out of a room — see systems/room-exit-trigger.ts. */
export interface RoomExit {
  readonly id: string;
  /** World-space trigger zone, checked against the player's WallCollider box. */
  readonly zone: AABB;
  /** Must match some other room's RoomDefinition.id (== that room's SceneDefinition name). */
  readonly targetRoomId: string;
  readonly targetEntryId: string;
  /** Undefined means always open. Evaluated against this room's own Flags. */
  readonly lockedUnless?: Condition;
}

export interface RoomEntryPoint {
  readonly id: string;
  readonly position: Position;
}

/** A room's own exits, on the same singleton entity idiom as RoomTileLayout. */
export interface RoomExits {
  readonly exits: readonly RoomExit[];
}
export const RoomExits = defineComponent<RoomExits>('roguelite:RoomExits');

/**
 * Room-local boolean flags — wiped along with everything else in world.clear()
 * on the next room transition, which is correct: nothing in this design
 * needs a room's own flag (e.g. "cleared") after leaving it. Contrast
 * session.ts's RogueliteSession, for state that must survive a transition.
 * See room-flags.ts for the adapter exposing this as the engine's generic
 * FlagWriter.
 */
export interface Flags {
  readonly values: Readonly<Record<string, boolean>>;
}
export const Flags = defineComponent<Flags>('roguelite:Flags');

/** Mirrors session.ts's RogueliteSession.currentForm onto the player entity itself, so ECS systems/tests can query it without reaching into the session object. The session is still the source of truth that survives room transitions — this is a read-friendly ECS copy, kept in sync by transform-player-form.ts. */
export interface PlayerForm {
  readonly form: PlayerFormId;
}
export const PlayerForm = defineComponent<PlayerForm>('roguelite:PlayerForm');

/** A world item the player collects by touching it — sets `flag` and destroys itself. Not just "the robe": reusable verbatim for any future artifact. See systems/collect-pickups.ts. */
export interface Pickup {
  readonly flag: string;
}
export const Pickup = defineComponent<Pickup>('roguelite:Pickup');

/**
 * Wraps the engine's generic ScenarioState with this room's own program —
 * mirrors how Animator wraps AnimationPlayerState with clips/current. Lives
 * on a dedicated singleton entity per room (a room's scenario program is
 * re-created fresh every time that room's scene loads, same as everything
 * else in it).
 */
export interface ScenarioRunner {
  readonly program: readonly ScenarioCommand<RogueliteScenarioCommand>[];
  readonly state: ScenarioState;
}
export const ScenarioRunner = defineComponent<ScenarioRunner>('roguelite:ScenarioRunner');
