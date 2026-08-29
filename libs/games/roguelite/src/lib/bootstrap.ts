import type { LayerConfig, PluginApi, TextureHandle } from '@g-game-farm/engine';
import type { RogueliteAssetKey } from './assets.js';
import { Position, SpriteRender } from './components.js';
import { fixedCameraSystem } from './systems/fixed-camera.js';
import { renderSpritesSystem } from './systems/render-sprites.js';

/** Which layer exists is a game decision, not the porting shell's — createEngine() takes this array as-is. */
export const ROGUELITE_LAYERS: readonly LayerConfig[] = [{ id: 'gameplay', pixelSnap: true }];

export const ROGUELITE_BOOT_SCENE = 'boot';

const GAMEPLAY_LAYER = 'gameplay';
/** One frame of the 10x10-grid player.png sheet; frame index 1 = row 0, col 0 = pixel offset (0,0). */
const PLAYER_FRAME_SIZE = 18;

/**
 * Registers this game's content with the engine — the only channel through
 * which the game talks to the engine (see plugin-api). `textures` must
 * already be loaded (see apps/web-roguelite/load-roguelite-textures.ts) —
 * the boot scene's setup() references texture handles synchronously and
 * submitSprite() throws on an unknown handle.
 */
export function registerRoguelite(api: PluginApi, textures: Record<RogueliteAssetKey, TextureHandle>): void {
  api.registerComponents([Position, SpriteRender]);
  api.registerSystems({ render: [fixedCameraSystem, renderSpritesSystem] });
  api.registerScenes([
    {
      name: ROGUELITE_BOOT_SCENE,
      setup: (world) => {
        const player = world.createEntity();
        world.set(player, Position, { x: -PLAYER_FRAME_SIZE / 2, y: -PLAYER_FRAME_SIZE / 2 });
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
      },
    },
  ]);
}
