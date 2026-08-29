import { createEngine, type TextureHandle } from '@g-game-farm/engine';
import type { RogueliteAssetKey } from './assets.js';
import { registerRoguelite, ROGUELITE_BOOT_SCENE } from './bootstrap.js';
import { Position, SpriteRender } from './components.js';

const testTextures: Record<RogueliteAssetKey, TextureHandle> = {
  player: 0 as TextureHandle,
};

describe('registerRoguelite', () => {
  it('registers and loads the boot scene without throwing, and tick() runs cleanly', () => {
    const engine = createEngine();
    registerRoguelite(engine, testTextures);

    expect(() => engine.loadScene(ROGUELITE_BOOT_SCENE)).not.toThrow();
    expect(engine.getActiveSceneName()).toBe(ROGUELITE_BOOT_SCENE);
    expect(() => engine.tick(1000 / 60)).not.toThrow();
  });

  it('spawns exactly one entity with Position + SpriteRender referencing the player texture', () => {
    const engine = createEngine();
    registerRoguelite(engine, testTextures);
    engine.loadScene(ROGUELITE_BOOT_SCENE);
    engine.tick(1000 / 60);

    const spawned = [...engine.world.query([Position, SpriteRender] as const)];
    expect(spawned).toHaveLength(1);

    const [, position, sprite] = spawned[0];
    expect(position).toEqual({ x: -9, y: -9 });
    expect(sprite.texture).toBe(testTextures.player);
    expect(sprite.layer).toBe('gameplay');
    expect(sprite).toMatchObject({ sx: 0, sy: 0, sWidth: 18, sHeight: 18, width: 18, height: 18 });
  });
});
