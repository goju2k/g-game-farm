import {
  defineComponent,
  type AABB,
  type AnimationPlayerState,
  type CollisionGrid,
  type LightingSettings,
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
 * directly instead of needing its own translation. Exception: an entity
 * whose SpriteRender sets originX/originY (anim-asset characters) — there
 * Position is that origin point (the character's feet), and box offsets
 * (WallCollider, Hitbox) are relative to it.
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
  /**
   * The point inside the frame (source pixels, art's own unflipped facing)
   * that sits at Position. Omitted = 0,0 = Position is the sprite's
   * top-left, as for every sprite before anim assets. Set from an anim
   * asset's anchor (see anim/anim-asset.ts) so Position is the character's
   * foot point instead. render-sprites mirrors originX when flipX is set,
   * so turning around never makes the character jump sideways.
   */
  readonly originX?: number;
  readonly originY?: number;
  /** Radians, clockwise on screen, around the origin (or the center without one) — see SpriteDraw.rotation. */
  readonly rotation?: number;
  /**
   * Added to the feet's y for 3/4 draw order (D-042): a thing hung on a wall
   * sorts with the wall's floor line, an effect in the air above everyone
   * (ABOVE_ACTORS). Default 0.
   */
  readonly depthOffset?: number;
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
  /** Playback speed of the current clip (an event's anim "speed": 0.5 = half). Undefined = 1; a new clip resets it. */
  readonly rate?: number;
  /**
   * Set when `current` was just (re)started (see anim/play-clip.ts) — tells
   * stepAnimatorSystem to fire frame 0's own tags, which
   * stepAnimationPlayer never reports (it only reports transitions).
   * Without this a tag on a clip's first frame (dash:charge, parry:flash)
   * would silently never reach the game.
   */
  readonly startPending?: boolean;
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

/** One step of an animated tile — a source rect in the same tileset, shown for durationMs. */
export interface RoomTileFrame {
  readonly sx: number;
  readonly sy: number;
  readonly durationMs: number;
}

/** One ROOM_TILE_SIZE square of a tileset drawn at a world position (top-left). */
export interface RoomTileSprite {
  readonly x: number;
  readonly y: number;
  /**
   * A standing wall face (D-042): drawn among the actors at this depth — the
   * y where the wall meets the floor — instead of flat on the ground.
   */
  readonly depth?: number;
  /** Which tileset texture (a key of ROGUELITE_TILESET_IMAGES). Omitted = 'tiles', the original tiles.png. */
  readonly tileset?: string;
  /** Source rect's top-left in that tileset — see rooms/tile-layout.ts's tileSourceRect. For an animated tile, its first frame. */
  readonly sx: number;
  readonly sy: number;
  /** Animated tiles only: every frame in order, played on the room's RoomClock (so identical tiles stay in sync). */
  readonly frames?: readonly RoomTileFrame[];
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
  /**
   * The tile everything beyond the room is made of (D-048: solid rock — the
   * wall top's plain middle — so the dungeon runs on to the screen's edges
   * instead of a box in a margin). Omitted: a flat letterbox colour.
   */
  readonly outside?: { readonly tileset: string; readonly sx: number; readonly sy: number };
}
export const RoomTileLayout = defineComponent<RoomTileLayout>('roguelite:RoomTileLayout');

/**
 * Simulation time since the room was entered — the one clock every animated
 * map tile reads (see systems/render-tilemap.ts). Simulation time, not wall
 * time, so tile animation pauses and replays with the game. Singleton per room.
 */
export interface RoomClock {
  readonly elapsedMs: number;
}
export const RoomClock = defineComponent<RoomClock>('roguelite:RoomClock');

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

/**
 * The active room's lighting model — present only in rooms that are lit
 * (see lighting/). Singleton per room, set from RoomDefinition.lighting by
 * create-room-scene.ts. Without it the room draws fully bright, as before.
 */
export interface RoomLighting {
  readonly settings: LightingSettings;
  /** Vertical squash every light in this room uses (top-down 3/4 look). */
  readonly squashY: number;
}
export const RoomLighting = defineComponent<RoomLighting>('roguelite:RoomLighting');

/**
 * A light fixed in the room, usually from a light-emitting map tile (see
 * lighting/tile-lights.ts). When `frameDurationsMs` is set the radius
 * follows the tile's own animation on the RoomClock: frame i -> radii[i].
 */
/**
 * A light's life (D-039): a slow breathing (pulse) and/or a quick unsteady
 * waver (flicker), each as a fraction of its radius. Data on the light —
 * see lighting/light-motion.ts for the styles rooms use.
 */
export interface LightMotion {
  readonly pulse?: { readonly amp: number; readonly periodMs: number };
  readonly flicker?: { readonly amp: number; readonly periodMs: number };
}

export interface TileLight {
  readonly x: number;
  readonly y: number;
  readonly tint: readonly [number, number, number];
  readonly radii: readonly number[];
  readonly frameDurationsMs?: readonly number[];
  readonly motion?: LightMotion;
}
export const TileLight = defineComponent<TileLight>('roguelite:TileLight');

/**
 * A light carried by an entity — e.g. the mage's hand flame. Offset is from
 * Position in the art's own facing (right), mirrored when SpriteRender.flipX.
 */
export interface LightEmitter {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly radius: number;
  readonly tint: readonly [number, number, number];
  readonly motion?: LightMotion;
}
export const LightEmitter = defineComponent<LightEmitter>('roguelite:LightEmitter');

/**
 * A two-row ground shadow at Position (the feet / anchor point): `widths`
 * pixels wide for row 1 and row 2, centered. While the entity's Animator is
 * on `lifted.clip` at one of `lifted.frames`, `lifted.widths` instead — a
 * floating character's shadow shrinks as it rises.
 */
export interface DropShadow {
  readonly widths: readonly [number, number];
  readonly alpha: number;
  readonly lifted?: { readonly clip: string; readonly frames: readonly number[]; readonly widths: readonly [number, number] };
}
export const DropShadow = defineComponent<DropShadow>('roguelite:DropShadow');
