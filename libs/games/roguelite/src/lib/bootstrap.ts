import type { LayerConfig, PluginApi, TextureHandle } from '@g-game-farm/ribs';
import type { LoadedAnimAsset } from './anim/anim-asset.js';
import type { RogueliteAssetKey } from './assets.js';
import { COMBAT_COMPONENTS } from './combat/combat-components.js';
import type { CombatData } from './combat/combat-data.js';
import { createCombatResolveSystem, createCombatUpkeepSystem, createPlayerCombatSystem, createSentinelMeleeSystem, hitStopClockSystem } from './combat/combat-systems.js';
import { createRenderCombatSystem, createRenderFadeOverlaySystem } from './combat/render-combat.js';
import {
  AttackCooldown,
  Animator,
  Chaser,
  Flags,
  Hitbox,
  Life,
  Pickup,
  PlayerControlled,
  PlayerForm,
  Position,
  Projectile,
  DropShadow,
  LightEmitter,
  RoomClock,
  RoomExits,
  RoomLighting,
  TileLight,
  RoomTileLayout,
  ScenarioRunner,
  SpriteRender,
  WallCollider,
  WaveSpawner,
} from './components.js';
import { createRoomScene, type RoomSceneDeps } from './rooms/create-room-scene.js';
import { roomA } from './rooms/room-a.js';
import { roomB } from './rooms/room-b.js';
import { roomC } from './rooms/room-c.js';
import { roomArena } from './rooms/room-arena.js';
import { roomD } from './rooms/room-d.js';
import type { PlayerFormId, RogueliteSession } from './session.js';
import { applyHitDamageSystem } from './systems/apply-hit-damage.js';
import { cameraFollowPlayerSystem } from './systems/camera-follow-player.js';
import { chasePlayerSystem } from './systems/chase-player.js';
import { collectPickupsSystem } from './systems/collect-pickups.js';
import { detectHitsSystem } from './systems/detect-hits.js';
import { createFireProjectilesSystem } from './systems/fire-projectiles.js';
import { movePlayerSystem } from './systems/move-player.js';
import { moveProjectilesSystem } from './systems/move-projectiles.js';
import { advanceRoomClockSystem, createRenderTilemapSystem } from './systems/render-tilemap.js';
import { createRenderShadowsSystem, renderLightingSystem } from './systems/render-lighting.js';
import { renderSpritesSystem } from './systems/render-sprites.js';
import { createRoomExitTriggerSystem } from './systems/room-exit-trigger.js';
import { stepAnimatorSystem } from './systems/step-animator.js';
import { createWaveSpawnSystem } from './systems/wave-spawn.js';

/**
 * Which layers exist is a game decision, not the porting shell's —
 * createEngine() takes this array as-is. Array order is draw order
 * (back-to-front): 'ground' (floor/wall tilemap) before 'gameplay'
 * (characters/projectiles), so the tilemap never overdraws entities. No
 * parallaxFactor on 'ground' — this is walkable level geometry that must
 * move in lockstep with the camera, not a distant scrolling backdrop.
 */
export const ROGUELITE_LAYERS: readonly LayerConfig[] = [
  { id: 'ground', pixelSnap: true, lit: true },
  { id: 'gameplay', pixelSnap: true, lit: true },
];

/** Every room, in demo order: room-a -> room-b -> room-c (the first Tiled-authored one); room-d (dungeon tileset check) isn't linked yet. Each room's id is also its scene name. */
const ROGUELITE_ROOMS = [roomA, roomB, roomC, roomD, roomArena] as const;

/** Every valid scene name — e.g. for a dev tool that boots straight into a room (see RogueliteGameProps.bootScene). */
export const ROGUELITE_ROOM_IDS: readonly string[] = ROGUELITE_ROOMS.map((room) => room.id);

/** The demo's first room — see rooms/room-a.ts. */
export const ROGUELITE_BOOT_SCENE = roomA.id;

/**
 * Registers this game's content with the engine — the only channel through
 * which the game talks to the engine (see plugin-api). `textures` must
 * already be loaded (see roguelite-game.tsx, which calls engine's
 * loadTextures()) — a room's populate() references texture handles
 * synchronously and submitSprite() throws on an unknown handle.
 * `whitePixelTexture` is the synthetic 1x1 texture the basic attack's
 * projectiles (and this slice's placeholder NPC/pickup blocks) are tinted
 * from. `formTextures` maps each PlayerFormId to the texture its clips are
 * built from (see player-forms.ts) — both the initial room spawn and any
 * later transformPlayerForm call read from this same map, so a form's
 * appearance can never drift between the two. `session` is the mutable,
 * cross-room state object (see session.ts) rooms read/write through
 * room-exit-trigger.ts/transform-player-form.ts. `random` defaults to
 * Math.random; tests inject a deterministic stub instead (see
 * bootstrap.spec.ts's sequentialRandom/constantRandom helpers).
 * `tilesetTextures` maps each map tileset name (ROGUELITE_TILESET_IMAGES'
 * keys) to its loaded texture; omitted, only the original tiles.png exists.
 * `animAssets` are anim assets (see anim/anim-asset.ts) rooms may place, by id.
 * `combat` (combat spec numbers, see combat/combat-data.ts) turns on the
 * combat systems; rooms with a combat player need it.
 */
export function registerRoguelite(
  api: PluginApi,
  textures: Record<RogueliteAssetKey, TextureHandle>,
  whitePixelTexture: TextureHandle,
  formTextures: Readonly<Record<PlayerFormId, TextureHandle>>,
  session: RogueliteSession,
  random: () => number = Math.random,
  tilesetTextures?: Readonly<Record<string, TextureHandle>>,
  animAssets: Readonly<Record<string, LoadedAnimAsset>> = {},
  combat?: CombatData,
): void {
  api.registerComponents([
    Position,
    SpriteRender,
    PlayerControlled,
    Animator,
    Chaser,
    Life,
    Hitbox,
    Projectile,
    AttackCooldown,
    WaveSpawner,
    WallCollider,
    RoomTileLayout,
    RoomClock,
    RoomLighting,
    TileLight,
    LightEmitter,
    DropShadow,
    RoomExits,
    Flags,
    PlayerForm,
    Pickup,
    ScenarioRunner,
  ]);
  api.registerSystems({
    simulation: [
      movePlayerSystem,
      createWaveSpawnSystem(textures, random),
      chasePlayerSystem,
      stepAnimatorSystem,
      createFireProjectilesSystem(whitePixelTexture),
      collectPickupsSystem,
      createRoomExitTriggerSystem(session),
      moveProjectilesSystem,
      detectHitsSystem,
      advanceRoomClockSystem,
    ],
    postSimulation: [applyHitDamageSystem],
    render: [createRenderTilemapSystem(tilesetTextures ?? { tiles: textures.tiles }), cameraFollowPlayerSystem, createRenderShadowsSystem(whitePixelTexture), renderSpritesSystem, renderLightingSystem],
  });

  if (combat) {
    api.registerComponents([...COMBAT_COMPONENTS]);
    api.registerSystems({
      input: [hitStopClockSystem],
      simulation: [createPlayerCombatSystem(combat), createSentinelMeleeSystem(combat)],
      postSimulation: [createCombatResolveSystem(combat), createCombatUpkeepSystem(combat)],
      render: [createRenderCombatSystem(combat, whitePixelTexture), createRenderFadeOverlaySystem(whitePixelTexture)],
    });
  }

  const sceneDeps: RoomSceneDeps = { textures, formTextures, whitePixelTexture, random, session, animAssets, ...(combat ? { combat } : {}) };
  api.registerScenes(ROGUELITE_ROOMS.map((room) => createRoomScene(room, sceneDeps)));
}
