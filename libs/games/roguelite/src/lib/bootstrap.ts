import type { LayerConfig, PluginApi } from '@g-game-farm/engine';

/** Which layer exists is a game decision, not the porting shell's — createEngine() takes this array as-is. */
export const ROGUELITE_LAYERS: readonly LayerConfig[] = [{ id: 'gameplay', pixelSnap: true }];

export const ROGUELITE_BOOT_SCENE = 'boot';

/**
 * Registers this game's content with the engine — the only channel through
 * which the game talks to the engine (see plugin-api). Nothing to register
 * yet beyond a placeholder scene, just so engine.loadScene() has somewhere
 * to go while the rest of the port is built out.
 */
export function registerRoguelite(api: PluginApi): void {
  api.registerScenes([{ name: ROGUELITE_BOOT_SCENE, setup: () => undefined }]);
}
