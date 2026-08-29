import {
  createEngine,
  EMPTY_INPUT_FRAME,
  type InputFrame,
  type PhysicalKey,
  type TextureHandle,
} from '@g-game-farm/engine';
import type { RogueliteAssetKey } from './assets.js';
import { registerRoguelite, ROGUELITE_BOOT_SCENE } from './bootstrap.js';
import { Animator, PlayerControlled, Position, SpriteRender } from './components.js';

const testTextures: Record<RogueliteAssetKey, TextureHandle> = {
  player: 0 as TextureHandle,
};

function withKeysHeld(...codes: readonly PhysicalKey[]): InputFrame {
  return {
    ...EMPTY_INPUT_FRAME,
    keyboard: { held: new Set(codes), justPressed: new Set(codes), justReleased: new Set() },
  };
}

function spawnPlayerWorld(fixedDeltaMs?: number) {
  const engine = createEngine(fixedDeltaMs === undefined ? undefined : { fixedDeltaMs });
  registerRoguelite(engine, testTextures);
  engine.loadScene(ROGUELITE_BOOT_SCENE);
  return engine;
}

describe('registerRoguelite', () => {
  it('registers and loads the boot scene without throwing, and tick() runs cleanly', () => {
    const engine = createEngine();
    registerRoguelite(engine, testTextures);

    expect(() => engine.loadScene(ROGUELITE_BOOT_SCENE)).not.toThrow();
    expect(engine.getActiveSceneName()).toBe(ROGUELITE_BOOT_SCENE);
    expect(() => engine.tick(1000 / 60)).not.toThrow();
  });

  it('spawns exactly one entity with Position + SpriteRender referencing the player texture', () => {
    const engine = spawnPlayerWorld();

    const spawned = [...engine.world.query([Position, SpriteRender] as const)];
    expect(spawned).toHaveLength(1);

    const [, position, sprite] = spawned[0];
    expect(position).toEqual({ x: -9, y: -9 });
    expect(sprite.texture).toBe(testTextures.player);
    expect(sprite.layer).toBe('gameplay');
    expect(sprite).toMatchObject({ sx: 0, sy: 0, sWidth: 18, sHeight: 18, width: 18, height: 18 });
  });

  it('spawns PlayerControlled + Animator already set to idle frame 0', () => {
    const engine = spawnPlayerWorld();

    const [[, playerControlled, animator]] = [...engine.world.query([PlayerControlled, Animator] as const)];
    expect(playerControlled.speed).toBe(64);
    expect(animator.current).toBe('idle');
    expect(animator.state).toEqual({ frameIndex: 0, elapsedInFrameMs: 0, finished: false });
    expect(animator.clips.idle.frames).toHaveLength(10);
    expect(animator.clips.run.frames).toHaveLength(4);
  });

  it('does not move when no keys are held', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld());

    const [[, position]] = [...engine.world.query([Position, PlayerControlled] as const)];
    expect(position).toEqual({ x: -9, y: -9 });
  });

  it('KeyD moves right and sets flipX true', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld('KeyD'));

    const [[, position, sprite]] = [...engine.world.query([Position, SpriteRender] as const)];
    expect(position.x).toBeCloseTo(-9 + 6.4);
    expect(position.y).toBeCloseTo(-9);
    expect(sprite.flipX).toBe(true);
  });

  it('KeyA moves left and sets flipX false', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld('KeyA'));

    const [[, position, sprite]] = [...engine.world.query([Position, SpriteRender] as const)];
    expect(position.x).toBeCloseTo(-9 - 6.4);
    expect(sprite.flipX).toBe(false);
  });

  it('KeyA takes priority over KeyD when both are held', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld('KeyA', 'KeyD'));

    const [[, position, sprite]] = [...engine.world.query([Position, SpriteRender] as const)];
    expect(position.x).toBeCloseTo(-9 - 6.4);
    expect(sprite.flipX).toBe(false);
  });

  it('flipX stays sticky when only vertical movement is held afterward', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld('KeyD'));
    engine.tick(100, withKeysHeld('KeyW'));

    const [[, position, sprite]] = [...engine.world.query([Position, SpriteRender] as const)];
    expect(sprite.flipX).toBe(true);
    expect(position.y).toBeCloseTo(-9 - 6.4);
  });

  it('diagonal movement is not normalized — both axes move at full speed', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld('KeyD', 'KeyW'));

    const [[, position]] = [...engine.world.query([Position, PlayerControlled] as const)];
    expect(position.x).toBeCloseTo(-9 + 6.4);
    expect(position.y).toBeCloseTo(-9 - 6.4);
  });

  it('switches to the run clip while moving, and step-animator advances it the same tick', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld('KeyD'));

    const [[, animator]] = [...engine.world.query([Animator] as const)];
    expect(animator.current).toBe('run');
    expect(animator.state.elapsedInFrameMs).toBe(100);
  });

  it('returns to idle once all keys are released', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld('KeyD'));
    engine.tick(100, withKeysHeld());

    const [[, animator]] = [...engine.world.query([Animator] as const)];
    expect(animator.current).toBe('idle');
  });

  it('idle animation frame actually advances over consecutive ticks', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld());

    const [[, spriteAfterOne]] = [...engine.world.query([SpriteRender] as const)];
    expect(spriteAfterOne.sx).toBe(0);

    engine.tick(100, withKeysHeld());

    const [[, spriteAfterTwo]] = [...engine.world.query([SpriteRender] as const)];
    expect(spriteAfterTwo.sx).toBe(18);
    expect(spriteAfterTwo.sy).toBe(0);
  });

  it('camera follows the player sprite center every frame', () => {
    const engine = spawnPlayerWorld(100);
    const setCameraSpy = vi.spyOn(engine.renderer, 'setCamera');

    engine.tick(100, withKeysHeld());
    expect(setCameraSpy).toHaveBeenLastCalledWith({ x: 0, y: 0, zoom: 4 });

    engine.tick(100, withKeysHeld('KeyD'));
    expect(setCameraSpy).toHaveBeenLastCalledWith({ x: 6.4, y: 0, zoom: 4 });
  });
});
