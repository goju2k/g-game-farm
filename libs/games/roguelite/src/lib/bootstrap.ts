import type { LayerConfig, PluginApi, TextureHandle } from '@g-game-farm/engine';
import { startAnimationPlayer } from '@g-game-farm/engine';
import type { RogueliteAssetKey } from './assets.js';
import {
  AttackCooldown,
  Animator,
  Chaser,
  Hitbox,
  Life,
  PlayerControlled,
  Position,
  Projectile,
  SpriteRender,
  WallCollider,
  WaveSpawner,
} from './components.js';
import { spawnMonsterWave } from './monster-wave.js';
import { createPlayerClips } from './player-clips.js';
import { PLAYER_FRAME_SIZE, PLAYER_WALL_COLLIDER } from './player-constants.js';
import { ATTACK_INTERVAL_MS } from './projectile-constants.js';
import { applyHitDamageSystem } from './systems/apply-hit-damage.js';
import { cameraFollowPlayerSystem } from './systems/camera-follow-player.js';
import { chasePlayerSystem } from './systems/chase-player.js';
import { detectHitsSystem } from './systems/detect-hits.js';
import { createFireProjectilesSystem } from './systems/fire-projectiles.js';
import { movePlayerSystem } from './systems/move-player.js';
import { moveProjectilesSystem } from './systems/move-projectiles.js';
import { createRenderTilemapSystem } from './systems/render-tilemap.js';
import { renderSpritesSystem } from './systems/render-sprites.js';
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
  { id: 'ground', pixelSnap: true },
  { id: 'gameplay', pixelSnap: true },
];

export const ROGUELITE_BOOT_SCENE = 'boot';

const GAMEPLAY_LAYER = 'gameplay';
/** World units/sec — old Player.ts's `(time * 64) / 1000`. */
const PLAYER_SPEED = 64;
/** Old pre-engine repo's OpeningScene#init(): `this.config.initGen && this.generateMonster(1)`. */
const INITIAL_MONSTER_WAVE_COUNT = 1;

/**
 * Registers this game's content with the engine — the only channel through
 * which the game talks to the engine (see plugin-api). `textures` must
 * already be loaded (see apps/web-roguelite/load-roguelite-textures.ts) —
 * the boot scene's setup() references texture handles synchronously and
 * submitSprite() throws on an unknown handle. `whitePixelTexture` is the
 * synthetic 1x1 texture the basic attack's projectiles are tinted from (see
 * apps/web-roguelite/create-white-pixel-texture.ts). `random` defaults to
 * Math.random; tests inject a deterministic stub instead (see
 * bootstrap.spec.ts's sequentialRandom/constantRandom helpers) — threaded
 * into both the initial monster spawn and every periodic wave, so a whole
 * test session's spawn sequence is reproducible from one source.
 */
export function registerRoguelite(
  api: PluginApi,
  textures: Record<RogueliteAssetKey, TextureHandle>,
  whitePixelTexture: TextureHandle,
  random: () => number = Math.random,
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
  ]);
  api.registerSystems({
    simulation: [
      movePlayerSystem,
      createWaveSpawnSystem(textures, random),
      chasePlayerSystem,
      stepAnimatorSystem,
      createFireProjectilesSystem(whitePixelTexture),
      moveProjectilesSystem,
      detectHitsSystem,
    ],
    postSimulation: [applyHitDamageSystem],
    render: [createRenderTilemapSystem(textures.tiles), cameraFollowPlayerSystem, renderSpritesSystem],
  });
  api.registerScenes([
    {
      name: ROGUELITE_BOOT_SCENE,
      setup: (world) => {
        const playerSpawnX = -PLAYER_FRAME_SIZE / 2;
        const playerSpawnY = -PLAYER_FRAME_SIZE / 2;

        const clips = createPlayerClips(textures.player);
        const player = world.createEntity();
        world.set(player, Position, { x: playerSpawnX, y: playerSpawnY });
        world.set(player, PlayerControlled, { speed: PLAYER_SPEED });
        world.set(player, AttackCooldown, { remainingMs: 0, intervalMs: ATTACK_INTERVAL_MS });
        world.set(player, WallCollider, PLAYER_WALL_COLLIDER);
        world.set(player, SpriteRender, {
          texture: textures.player,
          layer: GAMEPLAY_LAYER,
          sx: 0,
          sy: 0,
          sWidth: PLAYER_FRAME_SIZE,
          sHeight: PLAYER_FRAME_SIZE,
          width: PLAYER_FRAME_SIZE,
          height: PLAYER_FRAME_SIZE,
        });
        world.set(player, Animator, { clips, current: 'idle', state: startAnimationPlayer(clips.idle).state });

        const waveSpawner = world.createEntity();
        world.set(waveSpawner, WaveSpawner, { elapsedMs: 0, waveCount: 0 });

        spawnMonsterWave(world, textures, INITIAL_MONSTER_WAVE_COUNT, random);
      },
    },
  ]);
}
