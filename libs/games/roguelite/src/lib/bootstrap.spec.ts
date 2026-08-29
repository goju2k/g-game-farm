import { createEngine } from '@g-game-farm/engine';
import { registerRoguelite, ROGUELITE_BOOT_SCENE } from './bootstrap.js';

describe('registerRoguelite', () => {
  it('registers and loads the boot scene without throwing, and tick() runs cleanly', () => {
    const engine = createEngine();
    registerRoguelite(engine);

    expect(() => engine.loadScene(ROGUELITE_BOOT_SCENE)).not.toThrow();
    expect(engine.getActiveSceneName()).toBe(ROGUELITE_BOOT_SCENE);
    expect(() => engine.tick(1000 / 60)).not.toThrow();
  });
});
