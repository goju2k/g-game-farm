import type { LayerConfig, PluginApi, TextureHandle } from '@g-game-farm/engine';
import { startAnimationPlayer } from '@g-game-farm/engine';
import type { RogueliteAssetKey } from './assets.js';
import { AttackCooldown, Animator, Chaser, Hitbox, Life, PlayerControlled, Position, Projectile, SpriteRender } from './components.js';
import { MONSTER_FRAME_SIZE, MONSTER_STARTING_LIFE } from './monster-constants.js';
import { MONSTER_ROSTER } from './monster-roster.js';
import { createPlayerClips } from './player-clips.js';
import { PLAYER_FRAME_SIZE } from './player-constants.js';
import { ATTACK_INTERVAL_MS } from './projectile-constants.js';
import { applyHitDamageSystem } from './systems/apply-hit-damage.js';
import { cameraFollowPlayerSystem } from './systems/camera-follow-player.js';
import { chasePlayerSystem } from './systems/chase-player.js';
import { detectHitsSystem } from './systems/detect-hits.js';
import { createFireProjectilesSystem } from './systems/fire-projectiles.js';
import { movePlayerSystem } from './systems/move-player.js';
import { moveProjectilesSystem } from './systems/move-projectiles.js';
import { renderSpritesSystem } from './systems/render-sprites.js';
import { stepAnimatorSystem } from './systems/step-animator.js';

/** Which layer exists is a game decision, not the porting shell's — createEngine() takes this array as-is. */
export const ROGUELITE_LAYERS: readonly LayerConfig[] = [{ id: 'gameplay', pixelSnap: true }];

export const ROGUELITE_BOOT_SCENE = 'boot';

const GAMEPLAY_LAYER = 'gameplay';
/** World units/sec — old Player.ts's `(time * 64) / 1000`. */
const PLAYER_SPEED = 64;

/**
 * Registers this game's content with the engine — the only channel through
 * which the game talks to the engine (see plugin-api). `textures` must
 * already be loaded (see apps/web-roguelite/load-roguelite-textures.ts) —
 * the boot scene's setup() references texture handles synchronously and
 * submitSprite() throws on an unknown handle. `whitePixelTexture` is the
 * synthetic 1x1 texture the basic attack's projectiles are tinted from (see
 * apps/web-roguelite/create-white-pixel-texture.ts).
 */
export function registerRoguelite(
  api: PluginApi,
  textures: Record<RogueliteAssetKey, TextureHandle>,
  whitePixelTexture: TextureHandle,
): void {
  api.registerComponents([Position, SpriteRender, PlayerControlled, Animator, Chaser, Life, Hitbox, Projectile, AttackCooldown]);
  api.registerSystems({
    simulation: [
      movePlayerSystem,
      chasePlayerSystem,
      stepAnimatorSystem,
      createFireProjectilesSystem(whitePixelTexture),
      moveProjectilesSystem,
      detectHitsSystem,
    ],
    postSimulation: [applyHitDamageSystem],
    render: [cameraFollowPlayerSystem, renderSpritesSystem],
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

        for (const entry of MONSTER_ROSTER) {
          const texture = textures[entry.assetKey];
          const monsterClips = entry.createPoseClip(texture);
          const monster = world.createEntity();
          world.set(monster, Position, {
            x: playerSpawnX + entry.spawnOffset.x - MONSTER_FRAME_SIZE / 2,
            y: playerSpawnY + entry.spawnOffset.y - MONSTER_FRAME_SIZE / 2,
          });
          world.set(monster, Chaser, { speed: entry.speed });
          world.set(monster, Life, { current: MONSTER_STARTING_LIFE });
          world.set(monster, Hitbox, entry.hitbox);
          world.set(monster, SpriteRender, {
            texture,
            layer: GAMEPLAY_LAYER,
            sx: 0,
            sy: 0,
            sWidth: MONSTER_FRAME_SIZE,
            sHeight: MONSTER_FRAME_SIZE,
            width: MONSTER_FRAME_SIZE,
            height: MONSTER_FRAME_SIZE,
          });
          world.set(monster, Animator, {
            clips: monsterClips,
            current: 'pose',
            state: startAnimationPlayer(monsterClips.pose).state,
          });
        }
      },
    },
  ]);
}
