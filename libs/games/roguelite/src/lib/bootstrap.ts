import type { LayerConfig, PluginApi, TextureHandle } from '@g-game-farm/engine';
import { startAnimationPlayer } from '@g-game-farm/engine';
import type { RogueliteAssetKey } from './assets.js';
import { Animator, PlayerControlled, Position, SpriteRender } from './components.js';
import { createPlayerClips } from './player-clips.js';
import { PLAYER_FRAME_SIZE } from './player-constants.js';
import { cameraFollowPlayerSystem } from './systems/camera-follow-player.js';
import { movePlayerSystem } from './systems/move-player.js';
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
 * submitSprite() throws on an unknown handle.
 */
export function registerRoguelite(api: PluginApi, textures: Record<RogueliteAssetKey, TextureHandle>): void {
  api.registerComponents([Position, SpriteRender, PlayerControlled, Animator]);
  api.registerSystems({
    simulation: [movePlayerSystem, stepAnimatorSystem],
    render: [cameraFollowPlayerSystem, renderSpritesSystem],
  });
  api.registerScenes([
    {
      name: ROGUELITE_BOOT_SCENE,
      setup: (world) => {
        const clips = createPlayerClips(textures.player);
        const player = world.createEntity();
        world.set(player, Position, { x: -PLAYER_FRAME_SIZE / 2, y: -PLAYER_FRAME_SIZE / 2 });
        world.set(player, PlayerControlled, { speed: PLAYER_SPEED });
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
      },
    },
  ]);
}
