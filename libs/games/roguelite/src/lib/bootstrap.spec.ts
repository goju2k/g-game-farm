import {
  createEngine,
  EMPTY_INPUT_FRAME,
  type InputFrame,
  type PhysicalKey,
  type TextureHandle,
} from '@g-game-farm/engine';
import type { RogueliteAssetKey } from './assets.js';
import { registerRoguelite, ROGUELITE_BOOT_SCENE } from './bootstrap.js';
import { Animator, Chaser, PlayerControlled, Position, SpriteRender } from './components.js';

const testTextures: Record<RogueliteAssetKey, TextureHandle> = {
  player: 0 as TextureHandle,
  zag: 1 as TextureHandle,
  doltan: 2 as TextureHandle,
  ghost: 3 as TextureHandle,
  grass: 4 as TextureHandle,
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

/** Unwraps a possibly-missing test lookup with a clear failure message, instead of `!`. */
function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

/** The one PlayerControlled entity's [id, position, sprite, animator]. */
function findPlayer(engine: ReturnType<typeof createEngine>) {
  const [match] = [...engine.world.query([Position, SpriteRender, Animator, PlayerControlled] as const)];
  return required(match, 'player entity not found');
}

/** id of the one PlayerControlled entity's Position, for direct manipulation in tests. */
function findPlayerId(engine: ReturnType<typeof createEngine>) {
  const [match] = [...engine.world.query([PlayerControlled] as const)];
  return required(match, 'player entity not found')[0];
}

/** [id, chaser, position, sprite] of the one monster whose SpriteRender.texture matches `texture`. */
function findMonster(engine: ReturnType<typeof createEngine>, texture: TextureHandle) {
  const match = [...engine.world.query([Chaser, Position, SpriteRender] as const)].find(
    ([, , , sprite]) => sprite.texture === texture,
  );
  return required(match, `no monster found with texture ${String(texture)}`);
}

describe('registerRoguelite', () => {
  it('registers and loads the boot scene without throwing, and tick() runs cleanly', () => {
    const engine = createEngine();
    registerRoguelite(engine, testTextures);

    expect(() => engine.loadScene(ROGUELITE_BOOT_SCENE)).not.toThrow();
    expect(engine.getActiveSceneName()).toBe(ROGUELITE_BOOT_SCENE);
    expect(() => engine.tick(1000 / 60)).not.toThrow();
  });

  it('spawns the player entity with Position + SpriteRender referencing the player texture', () => {
    const engine = spawnPlayerWorld();

    const [, position, sprite] = findPlayer(engine);
    expect(position).toEqual({ x: -9, y: -9 });
    expect(sprite.texture).toBe(testTextures.player);
    expect(sprite.layer).toBe('gameplay');
    expect(sprite).toMatchObject({ sx: 0, sy: 0, sWidth: 18, sHeight: 18, width: 18, height: 18 });
  });

  it('spawns PlayerControlled + Animator already set to idle frame 0', () => {
    const engine = spawnPlayerWorld();

    const [, , , animator] = findPlayer(engine);
    const [[, playerControlled]] = [...engine.world.query([PlayerControlled] as const)];
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

    const [, position, sprite] = findPlayer(engine);
    expect(position.x).toBeCloseTo(-9 + 6.4);
    expect(position.y).toBeCloseTo(-9);
    expect(sprite.flipX).toBe(true);
  });

  it('KeyA moves left and sets flipX false', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld('KeyA'));

    const [, position, sprite] = findPlayer(engine);
    expect(position.x).toBeCloseTo(-9 - 6.4);
    expect(sprite.flipX).toBe(false);
  });

  it('KeyA takes priority over KeyD when both are held', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld('KeyA', 'KeyD'));

    const [, position, sprite] = findPlayer(engine);
    expect(position.x).toBeCloseTo(-9 - 6.4);
    expect(sprite.flipX).toBe(false);
  });

  it('flipX stays sticky when only vertical movement is held afterward', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld('KeyD'));
    engine.tick(100, withKeysHeld('KeyW'));

    const [, position, sprite] = findPlayer(engine);
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

    const [, , , animator] = findPlayer(engine);
    expect(animator.current).toBe('run');
    expect(animator.state.elapsedInFrameMs).toBe(100);
  });

  it('returns to idle once all keys are released', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld('KeyD'));
    engine.tick(100, withKeysHeld());

    const [, , , animator] = findPlayer(engine);
    expect(animator.current).toBe('idle');
  });

  it('idle animation frame actually advances over consecutive ticks', () => {
    const engine = spawnPlayerWorld(100);
    engine.tick(100, withKeysHeld());

    const [, , spriteAfterOne] = findPlayer(engine);
    expect(spriteAfterOne.sx).toBe(0);

    engine.tick(100, withKeysHeld());

    const [, , spriteAfterTwo] = findPlayer(engine);
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

  describe('monsters', () => {
    it('spawns 5 entities total (1 player + 4 monsters) with Position + SpriteRender', () => {
      const engine = spawnPlayerWorld();
      const spawned = [...engine.world.query([Position, SpriteRender] as const)];
      expect(spawned).toHaveLength(5);
    });

    it('spawns all 4 monster types with the right speed, position, texture, and size', () => {
      const engine = spawnPlayerWorld();
      const byTexture = new Map(
        [...engine.world.query([Chaser, Position, SpriteRender] as const)].map(([, chaser, position, sprite]) => [
          sprite.texture,
          { chaser, position, sprite },
        ]),
      );

      const zag = required(byTexture.get(testTextures.zag), 'zag not spawned');
      expect(zag.chaser.speed).toBe(35);
      expect(zag.position).toEqual({ x: -17, y: -77 });

      const doltan = required(byTexture.get(testTextures.doltan), 'doltan not spawned');
      expect(doltan.chaser.speed).toBe(15);
      expect(doltan.position).toEqual({ x: -17, y: 43 });

      const ghost = required(byTexture.get(testTextures.ghost), 'ghost not spawned');
      expect(ghost.chaser.speed).toBe(25);
      expect(ghost.position).toEqual({ x: -77, y: -17 });

      const grass = required(byTexture.get(testTextures.grass), 'grass not spawned');
      expect(grass.chaser.speed).toBe(15);
      expect(grass.position).toEqual({ x: 43, y: -17 });

      for (const { sprite } of byTexture.values()) {
        expect(sprite).toMatchObject({ layer: 'gameplay', sx: 0, sy: 0, sWidth: 16, sHeight: 16, width: 16, height: 16 });
      }
    });

    it('gives each species the right pose clip frame count', () => {
      const engine = spawnPlayerWorld();
      const framesByTexture = new Map(
        [...engine.world.query([Chaser, SpriteRender, Animator] as const)].map(([, , sprite, animator]) => [
          sprite.texture,
          animator.clips.pose.frames.length,
        ]),
      );

      expect(framesByTexture.get(testTextures.zag)).toBe(3);
      expect(framesByTexture.get(testTextures.doltan)).toBe(6);
      expect(framesByTexture.get(testTextures.ghost)).toBe(6);
      expect(framesByTexture.get(testTextures.grass)).toBe(28);
    });

    it('moves a monster toward a repositioned player, along the normalized direction', () => {
      const engine = spawnPlayerWorld(100);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: 0, y: 0 });
      engine.tick(100, withKeysHeld());

      const [, , doltan] = findMonster(engine, testTextures.doltan);
      expect(doltan.x).toBeCloseTo(-16.4485, 3);
      expect(doltan.y).toBeCloseTo(41.6051, 3);
    });

    it('does not move (and stays finite) when a monster starts exactly on the player position', () => {
      const engine = spawnPlayerWorld(100);
      const [, playerPosition] = [...engine.world.query([Position, PlayerControlled] as const)][0];

      const [zagId] = findMonster(engine, testTextures.zag);
      engine.world.set(zagId, Position, { x: playerPosition.x, y: playerPosition.y });

      engine.tick(100, withKeysHeld());

      const afterPosition = required(engine.world.get(zagId, Position), 'zag Position missing after tick');
      expect(afterPosition).toEqual({ x: playerPosition.x, y: playerPosition.y });
      expect(Number.isFinite(afterPosition.x)).toBe(true);
      expect(Number.isFinite(afterPosition.y)).toBe(true);
    });

    it('flipX is not sticky — flips immediately as the player crosses to the other side', () => {
      const engine = spawnPlayerWorld(100);
      const playerId = findPlayerId(engine);

      const [ghostId, , ghostPosition] = findMonster(engine, testTextures.ghost);

      engine.world.set(playerId, Position, { x: ghostPosition.x - 200, y: ghostPosition.y });
      engine.tick(100, withKeysHeld());
      expect(required(engine.world.get(ghostId, SpriteRender), 'ghost SpriteRender missing').flipX).toBe(false);

      engine.world.set(playerId, Position, { x: ghostPosition.x + 200, y: ghostPosition.y });
      engine.tick(100, withKeysHeld());
      expect(required(engine.world.get(ghostId, SpriteRender), 'ghost SpriteRender missing').flipX).toBe(true);
    });

    it('chases the same tick the player moved on, not the previous tick', () => {
      const engine = spawnPlayerWorld(100);

      // Holding KeyD moves the player from (-9,-9) to (-2.6,-9) *this* tick
      // (movePlayerSystem, order 0). chasePlayerSystem (order 1) must read
      // that post-move position, not the pre-tick one — the two produce
      // measurably different resulting monster positions (see plan).
      engine.tick(100, withKeysHeld('KeyD'));

      const [, , zag] = findMonster(engine, testTextures.zag);
      expect(zag.x).toBeCloseTo(-16.2749, 3);
      expect(zag.y).toBeCloseTo(-73.5759, 3);
    });
  });
});
