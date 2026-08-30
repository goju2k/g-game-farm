import {
  createEngine,
  EMPTY_INPUT_FRAME,
  type InputFrame,
  type MouseButton,
  type PhysicalKey,
  type TextureHandle,
} from '@g-game-farm/ribs';
import type { RogueliteAssetKey } from './assets.js';
import { registerRoguelite, ROGUELITE_BOOT_SCENE, ROGUELITE_LAYERS } from './bootstrap.js';
import {
  Animator,
  AttackCooldown,
  Chaser,
  Life,
  PlayerControlled,
  Position,
  Projectile,
  SpriteRender,
  WaveSpawner,
} from './components.js';
import { MONSTER_FRAME_SIZE } from './monster-constants.js';
import { FLOOR_TILES, TILE_GRID_SIZE, TILE_SPACING, WALL_COLLIDERS, WALL_TILES } from './tile-map.js';
import { WORLD_SIZE } from './world-constants.js';

const testTextures: Record<RogueliteAssetKey, TextureHandle> = {
  player: 0 as TextureHandle,
  zag: 1 as TextureHandle,
  doltan: 2 as TextureHandle,
  ghost: 3 as TextureHandle,
  grass: 4 as TextureHandle,
  tiles: 6 as TextureHandle,
};
const testWhitePixelTexture = 5 as TextureHandle;

function withKeysHeld(...codes: readonly PhysicalKey[]): InputFrame {
  return {
    ...EMPTY_INPUT_FRAME,
    keyboard: { held: new Set(codes), justPressed: new Set(codes), justReleased: new Set() },
  };
}

function withMouseHeld(x: number, y: number, ...buttons: readonly MouseButton[]): InputFrame {
  return {
    ...EMPTY_INPUT_FRAME,
    mouse: {
      buttons: { held: new Set(buttons), justPressed: new Set(buttons), justReleased: new Set() },
      position: { x, y },
      wheelDeltaY: 0,
    },
  };
}

/** Cycles through `values` in order, then throws if called more times than provided — keeps wave/spawn tests exact instead of silently wrapping. */
function sequentialRandom(...values: readonly number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) {
      throw new Error(`sequentialRandom: no more values (called ${i + 1} times, only ${values.length} provided)`);
    }
    return values[i++];
  };
}

/** A fixed random source for tests that only care about counts/timer state, not exact draw-by-draw positions. */
function constantRandom(value: number): () => number {
  return () => value;
}

function spawnPlayerWorld(fixedDeltaMs?: number, random?: () => number) {
  const engine = createEngine(fixedDeltaMs === undefined ? undefined : { fixedDeltaMs });
  registerRoguelite(engine, testTextures, testWhitePixelTexture, random);
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

/** [id, spawner] of the one WaveSpawner entity. */
function findWaveSpawner(engine: ReturnType<typeof createEngine>) {
  const [match] = [...engine.world.query([WaveSpawner] as const)];
  return required(match, 'WaveSpawner entity not found');
}

describe('registerRoguelite', () => {
  it('registers and loads the boot scene without throwing, and tick() runs cleanly', () => {
    const engine = createEngine();
    registerRoguelite(engine, testTextures, testWhitePixelTexture);

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

  it('camera follows the player sprite center every frame, on both the ground and gameplay layers', () => {
    const engine = spawnPlayerWorld(100);
    const setCameraSpy = vi.spyOn(engine.renderer, 'setCamera');

    engine.tick(100, withKeysHeld());
    expect(setCameraSpy).toHaveBeenCalledWith('ground', { x: 0, y: 0, zoom: 4 });
    expect(setCameraSpy).toHaveBeenLastCalledWith('gameplay', { x: 0, y: 0, zoom: 4 });

    engine.tick(100, withKeysHeld('KeyD'));
    expect(setCameraSpy).toHaveBeenCalledWith('ground', { x: 6.4, y: 0, zoom: 4 });
    expect(setCameraSpy).toHaveBeenLastCalledWith('gameplay', { x: 6.4, y: 0, zoom: 4 });
  });

  describe('monsters', () => {
    it('spawns 5 entities total (1 player + 4 monsters) with Position + SpriteRender', () => {
      const engine = spawnPlayerWorld();
      const spawned = [...engine.world.query([Position, SpriteRender] as const)];
      expect(spawned).toHaveLength(5);
    });

    it('spawns all 4 monster types with the right speed/texture/size, scattered within the world spawn box', () => {
      const engine = spawnPlayerWorld();
      const byTexture = new Map(
        [...engine.world.query([Chaser, Position, SpriteRender] as const)].map(([, chaser, position, sprite]) => [
          sprite.texture,
          { chaser, position, sprite },
        ]),
      );

      expect(required(byTexture.get(testTextures.zag), 'zag not spawned').chaser.speed).toBe(35);
      expect(required(byTexture.get(testTextures.doltan), 'doltan not spawned').chaser.speed).toBe(15);
      expect(required(byTexture.get(testTextures.ghost), 'ghost not spawned').chaser.speed).toBe(25);
      expect(required(byTexture.get(testTextures.grass), 'grass not spawned').chaser.speed).toBe(15);

      // spawnMonsterWave() scatters positions randomly across [-WORLD_SIZE/2, WORLD_SIZE/2) on
      // each axis, centered on the sprite's origin corner (- MONSTER_FRAME_SIZE/2) — this holds
      // under real Math.random(), no stub needed.
      const minCoord = -WORLD_SIZE / 2 - MONSTER_FRAME_SIZE / 2;
      const maxCoord = WORLD_SIZE / 2 - MONSTER_FRAME_SIZE / 2;
      for (const { position, sprite } of byTexture.values()) {
        expect(position.x).toBeGreaterThanOrEqual(minCoord);
        expect(position.x).toBeLessThan(maxCoord);
        expect(position.y).toBeGreaterThanOrEqual(minCoord);
        expect(position.y).toBeLessThan(maxCoord);
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
      const [doltanId] = findMonster(engine, testTextures.doltan);
      engine.world.set(doltanId, Position, { x: -17, y: 43 }); // pin to a known start — decoupled from wave-spawn's now-random positions
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
      const [zagId] = findMonster(engine, testTextures.zag);
      engine.world.set(zagId, Position, { x: -17, y: -77 }); // pin to a known start — decoupled from wave-spawn's now-random positions

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

  describe('combat', () => {
    it('does not fire when the mouse is aimed exactly at the player (zero distance)', () => {
      const engine = spawnPlayerWorld(50);
      engine.tick(50, withMouseHeld(480, 270, 'left'));
      expect([...engine.world.query([Projectile] as const)]).toHaveLength(0);
    });

    it('fires toward the cursor, spawning centered on the player and already moved this same tick', () => {
      const engine = spawnPlayerWorld(50);
      const playerId = findPlayerId(engine);
      engine.tick(50, withMouseHeld(960, 270, 'left'));

      const projectiles = [...engine.world.query([Position, Projectile] as const)];
      expect(projectiles).toHaveLength(1);
      const [, position, projectile] = projectiles[0];
      expect(position.x).toBeCloseTo(6.5);
      expect(position.y).toBeCloseTo(-1);
      expect(projectile.velocityX).toBeCloseTo(150);
      expect(projectile.velocityY).toBeCloseTo(0);
      expect(projectile.damage).toBe(20);

      const cooldown = required(engine.world.get(playerId, AttackCooldown), 'cooldown missing');
      expect(cooldown.remainingMs).toBe(50);
    });

    it('fires again once the cooldown elapses, gating correctly on deltas that do not evenly divide the interval', () => {
      const engine = spawnPlayerWorld(20);
      const playerId = findPlayerId(engine);
      const frame = withMouseHeld(960, 270, 'left');

      engine.tick(20, frame); // remainingMs 0-20=-20<=0 -> fires (1), reset to 50
      engine.tick(20, frame); // 50-20=30 -> no fire
      engine.tick(20, frame); // 30-20=10 -> no fire
      expect([...engine.world.query([Projectile] as const)]).toHaveLength(1);
      expect(required(engine.world.get(playerId, AttackCooldown), 'cooldown missing').remainingMs).toBe(10);

      engine.tick(20, frame); // 10-20=-10<=0 -> fires (2), reset to 50
      expect([...engine.world.query([Projectile] as const)]).toHaveLength(2);
      expect(required(engine.world.get(playerId, AttackCooldown), 'cooldown missing').remainingMs).toBe(50);
    });

    it('does not burst-fire after the cooldown drifts negative while blocked by zero distance', () => {
      const engine = spawnPlayerWorld(50);
      const playerId = findPlayerId(engine);

      engine.tick(50, withMouseHeld(480, 270, 'left')); // aimed at self, blocked -> cooldown decremented but not reset
      expect(required(engine.world.get(playerId, AttackCooldown), 'cooldown missing').remainingMs).toBe(-50);
      expect([...engine.world.query([Projectile] as const)]).toHaveLength(0);

      engine.tick(50, withMouseHeld(960, 270, 'left')); // now aimed away -> fires exactly once
      expect([...engine.world.query([Projectile] as const)]).toHaveLength(1);
      expect(required(engine.world.get(playerId, AttackCooldown), 'cooldown missing').remainingMs).toBe(50);
    });

    it('does not fire and does not throw when the mouse has not moved yet (position undefined)', () => {
      const engine = spawnPlayerWorld(50);
      const frame: InputFrame = {
        ...EMPTY_INPUT_FRAME,
        mouse: {
          buttons: { held: new Set<MouseButton>(['left']), justPressed: new Set<MouseButton>(['left']), justReleased: new Set() },
          position: undefined,
          wheelDeltaY: 0,
        },
      };
      expect(() => engine.tick(50, frame)).not.toThrow();
      expect([...engine.world.query([Projectile] as const)]).toHaveLength(0);
    });

    it('does not fire when the mouse position is known but the button is not held', () => {
      const engine = spawnPlayerWorld(50);
      const frame: InputFrame = { ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, position: { x: 960, y: 270 } } };
      engine.tick(50, frame);
      expect([...engine.world.query([Projectile] as const)]).toHaveLength(0);
    });

    it('destroys a projectile whose lifetime has expired', () => {
      const engine = spawnPlayerWorld(50);
      const projectile = engine.world.createEntity();
      engine.world.set(projectile, Position, { x: 500, y: 500 }); // far from anything, no incidental hit
      engine.world.set(projectile, Projectile, { velocityX: 0, velocityY: 0, damage: 20, remainingLifetimeMs: 10 });

      engine.tick(50, withKeysHeld());

      expect(engine.world.isAlive(projectile)).toBe(false);
    });

    it('keeps a projectile alive and ticks its lifetime down while time remains', () => {
      const engine = spawnPlayerWorld(50);
      const projectile = engine.world.createEntity();
      engine.world.set(projectile, Position, { x: 500, y: 500 });
      engine.world.set(projectile, Projectile, { velocityX: 0, velocityY: 0, damage: 20, remainingLifetimeMs: 1000 });

      engine.tick(50, withKeysHeld());

      expect(engine.world.isAlive(projectile)).toBe(true);
      expect(required(engine.world.get(projectile, Projectile), 'projectile missing').remainingLifetimeMs).toBe(950);
    });

    it('applies damage using the post-move projectile position, not pre-move (move-before-detect ordering)', () => {
      const engine = spawnPlayerWorld(50);
      const [zagId, , zagPosition] = findMonster(engine, testTextures.zag);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: zagPosition.x, y: zagPosition.y }); // zero distance -> chasePlayerSystem won't move zag this tick

      const projectile = engine.world.createEntity();
      // Pre-move: well outside zag's hitbox box ([zagX+1,zagX+15) x [zagY+9,zagY+15)).
      // Post-move (velocityX*0.05s = 28 units): lands well inside it.
      engine.world.set(projectile, Position, { x: zagPosition.x - 23, y: zagPosition.y + 12 });
      engine.world.set(projectile, Projectile, { velocityX: 560, velocityY: 0, damage: 20, remainingLifetimeMs: 1000 });

      engine.tick(50, withKeysHeld());

      expect(required(engine.world.get(zagId, Life), 'zag Life missing').current).toBe(80);
    });

    it('applies damage within the same tick the hit was detected, and the hit target survives a non-lethal hit', () => {
      const engine = spawnPlayerWorld(50);
      const [zagId, , zagPosition] = findMonster(engine, testTextures.zag);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: zagPosition.x, y: zagPosition.y });

      const projectile = engine.world.createEntity();
      engine.world.set(projectile, Position, { x: zagPosition.x + 5, y: zagPosition.y + 12 }); // already overlapping zag's hitbox
      engine.world.set(projectile, Projectile, { velocityX: 0, velocityY: 0, damage: 20, remainingLifetimeMs: 1000 });

      engine.tick(50, withKeysHeld());

      expect(required(engine.world.get(zagId, Life), 'zag Life missing').current).toBe(80);
      expect(engine.world.isAlive(zagId)).toBe(true);
    });

    it('does not double-apply damage across tick boundaries', () => {
      const engine = spawnPlayerWorld(50);
      const [zagId, , zagPosition] = findMonster(engine, testTextures.zag);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: zagPosition.x, y: zagPosition.y });

      const projectile = engine.world.createEntity();
      engine.world.set(projectile, Position, { x: zagPosition.x + 5, y: zagPosition.y + 12 });
      engine.world.set(projectile, Projectile, { velocityX: 0, velocityY: 0, damage: 20, remainingLifetimeMs: 1000 });

      engine.tick(50, withKeysHeld());
      expect(required(engine.world.get(zagId, Life), 'zag Life missing').current).toBe(80);

      engine.tick(50, withKeysHeld());
      expect(required(engine.world.get(zagId, Life), 'zag Life missing').current).toBe(80);
    });

    it('destroys both projectiles and the monster when two projectiles hit the same target in one tick, without crashing', () => {
      const engine = spawnPlayerWorld(50);
      const [zagId, , zagPosition] = findMonster(engine, testTextures.zag);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: zagPosition.x, y: zagPosition.y });
      engine.world.set(zagId, Life, { current: 15 }); // below one projectile's 20 damage

      const overlapPoint = { x: zagPosition.x + 5, y: zagPosition.y + 12 };
      const projectileA = engine.world.createEntity();
      engine.world.set(projectileA, Position, overlapPoint);
      engine.world.set(projectileA, Projectile, { velocityX: 0, velocityY: 0, damage: 20, remainingLifetimeMs: 1000 });
      const projectileB = engine.world.createEntity();
      engine.world.set(projectileB, Position, overlapPoint);
      engine.world.set(projectileB, Projectile, { velocityX: 0, velocityY: 0, damage: 20, remainingLifetimeMs: 1000 });

      expect(() => engine.tick(50, withKeysHeld())).not.toThrow();

      expect(engine.world.isAlive(zagId)).toBe(false);
      expect(engine.world.isAlive(projectileA)).toBe(false);
      expect(engine.world.isAlive(projectileB)).toBe(false);
    });

    it('does not penetrate — only one of two overlapped monsters takes damage from a single projectile', () => {
      const engine = spawnPlayerWorld(50);
      const [zagId, , zagPosition] = findMonster(engine, testTextures.zag);
      const [doltanId] = findMonster(engine, testTextures.doltan);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: zagPosition.x, y: zagPosition.y });
      engine.world.remove(doltanId, Chaser); // freeze doltan in place for this test

      // doltan's hitbox (offset 2,7) now starts at the same point as zag's (offset 1,9) shifted so both boxes cover the same overlap point below.
      engine.world.set(doltanId, Position, { x: zagPosition.x - 1, y: zagPosition.y + 2 });

      const overlapPoint = { x: zagPosition.x + 5, y: zagPosition.y + 12 };
      const projectile = engine.world.createEntity();
      engine.world.set(projectile, Position, overlapPoint);
      engine.world.set(projectile, Projectile, { velocityX: 0, velocityY: 0, damage: 20, remainingLifetimeMs: 1000 });

      engine.tick(50, withKeysHeld());

      const zagLife = required(engine.world.get(zagId, Life), 'zag Life missing').current;
      const doltanLife = required(engine.world.get(doltanId, Life), 'doltan Life missing').current;
      const damaged = [zagLife, doltanLife].filter((life) => life === 80).length;
      const untouched = [zagLife, doltanLife].filter((life) => life === 100).length;
      expect(damaged).toBe(1);
      expect(untouched).toBe(1);
    });

    it('destroys a monster hit for exactly its remaining life, leaving no residual Life component', () => {
      const engine = spawnPlayerWorld(50);
      const [zagId, , zagPosition] = findMonster(engine, testTextures.zag);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: zagPosition.x, y: zagPosition.y });
      engine.world.set(zagId, Life, { current: 20 });

      const projectile = engine.world.createEntity();
      engine.world.set(projectile, Position, { x: zagPosition.x + 5, y: zagPosition.y + 12 });
      engine.world.set(projectile, Projectile, { velocityX: 0, velocityY: 0, damage: 20, remainingLifetimeMs: 1000 });

      engine.tick(50, withKeysHeld());

      expect(engine.world.isAlive(zagId)).toBe(false);
      expect(engine.world.get(zagId, Life)).toBeUndefined();
    });

    it('keeps working when a monster has already been destroyed before the tick', () => {
      const engine = spawnPlayerWorld(50);
      const [grassId] = findMonster(engine, testTextures.grass);
      engine.world.destroyEntity(grassId);

      expect(() => engine.tick(50, withKeysHeld('KeyD'))).not.toThrow();
      expect([...engine.world.query([Chaser] as const)]).toHaveLength(3);
    });
  });

  describe('wave spawning', () => {
    it('initial spawn always yields exactly 1 of each species regardless of random(), at formula-derived positions', () => {
      const random = sequentialRandom(
        0,
        0.25,
        0.75, // zag: count-draw (irrelevant — floor(x*1)+1=1 for any x), x, y
        0.99,
        0.5,
        0.5, // doltan
        0.42,
        0.1,
        0.9, // ghost
        0.01,
        0.75,
        0.25, // grass
      );
      const engine = spawnPlayerWorld(undefined, random);

      const byTexture = new Map(
        [...engine.world.query([Chaser, Position, SpriteRender] as const)].map(([, , position, sprite]) => [
          sprite.texture,
          position,
        ]),
      );
      expect(byTexture.size).toBe(4);
      expect(byTexture.get(testTextures.zag)).toEqual({ x: -128, y: 112 }); // -240 + 0.25*480 - 8, -240 + 0.75*480 - 8
      expect(byTexture.get(testTextures.doltan)).toEqual({ x: -8, y: -8 });
      expect(byTexture.get(testTextures.ghost)).toEqual({ x: -200, y: 184 });
      expect(byTexture.get(testTextures.grass)).toEqual({ x: 112, y: -128 });
    });

    it('starts the WaveSpawner at elapsedMs:0, waveCount:0', () => {
      const engine = spawnPlayerWorld();
      const [, spawner] = findWaveSpawner(engine);
      expect(spawner).toEqual({ elapsedMs: 0, waveCount: 0 });
    });

    it('does not trigger when elapsedMs exactly equals timeUnit', () => {
      const engine = spawnPlayerWorld(6500, constantRandom(0.5));
      engine.tick(6500); // waveCount=0 -> timeUnit=6500; 6500 is not > 6500
      const [, spawner] = findWaveSpawner(engine);
      expect(spawner).toEqual({ elapsedMs: 6500, waveCount: 0 });
      expect([...engine.world.query([Chaser] as const)]).toHaveLength(4);
    });

    it('triggers a wave once elapsedMs exceeds timeUnit, spawning at least 1 of each species more', () => {
      const engine = spawnPlayerWorld(6501, constantRandom(0.5));
      engine.tick(6501);
      const [, spawner] = findWaveSpawner(engine);
      expect(spawner.waveCount).toBe(1);
      expect(spawner.elapsedMs).toBe(0); // hard reset, not carrying over the 1ms overshoot
      expect([...engine.world.query([Chaser] as const)].length).toBeGreaterThan(4);
    });

    it('computes timeUnit from the pre-increment waveCount, not the post-increment one', () => {
      // waveCount=4 (pre-increment) -> timeUnit = max(2000,7000-500*floor(4/5+1)) = 6500.
      // A flattened implementation reading the post-increment value (5) would instead compute
      // 6000 and wrongly trigger on a 6200ms tick — this asserts it does NOT trigger.
      const engine = spawnPlayerWorld(6200, constantRandom(0.5));
      const [spawnerId] = findWaveSpawner(engine);
      engine.world.set(spawnerId, WaveSpawner, { elapsedMs: 0, waveCount: 4 });

      engine.tick(6200);

      expect(findWaveSpawner(engine)[1]).toEqual({ elapsedMs: 6200, waveCount: 4 });
    });

    it('computes multiple from the post-increment waveCount, not the pre-increment one', () => {
      // waveCount 5->6 this tick (timeUnit(5)=6000, 6100>6000 triggers). multiple must use the
      // NEW waveCount 6: floor(6/2+1)=4 -> count=floor(0.9*4)=3 -> speciesCount=floor(0.9*3)+1=3
      // per species -> 4*3=12 new. A flattened impl using the pre-increment waveCount (5) would
      // instead get multiple=floor(5/2+1)=3 -> count=floor(0.9*3)=2 -> speciesCount=3 per
      // species too by coincidence at this random() value — so this also cross-checks waveCount
      // itself actually became 6, not just the resulting monster count.
      const engine = spawnPlayerWorld(6100, constantRandom(0.9));
      const [spawnerId] = findWaveSpawner(engine);
      engine.world.set(spawnerId, WaveSpawner, { elapsedMs: 0, waveCount: 5 });

      engine.tick(6100);

      const [, spawner] = findWaveSpawner(engine);
      expect(spawner.waveCount).toBe(6);
      expect([...engine.world.query([Chaser] as const)]).toHaveLength(4 + 12);
    });

    it('clamps a wave to at most 10 per species, even when multiple is large', () => {
      const engine = spawnPlayerWorld(2001, constantRandom(0.999999));
      const [spawnerId] = findWaveSpawner(engine);
      engine.world.set(spawnerId, WaveSpawner, { elapsedMs: 0, waveCount: 100 });

      engine.tick(2001); // waveCount->101, multiple=floor(101/2+1)=51, count=min(10,floor(0.999999*51)=50)=10

      expect([...engine.world.query([Chaser] as const)]).toHaveLength(4 + 4 * 10);
    });

    it('floors timeUnit at 2000ms no matter how large waveCount grows', () => {
      const notTriggered = spawnPlayerWorld(1999, constantRandom(0.5));
      const [id1] = findWaveSpawner(notTriggered);
      notTriggered.world.set(id1, WaveSpawner, { elapsedMs: 0, waveCount: 1000 });
      notTriggered.tick(1999);
      expect(findWaveSpawner(notTriggered)[1]).toEqual({ elapsedMs: 1999, waveCount: 1000 });

      const triggered = spawnPlayerWorld(2001, constantRandom(0.5));
      const [id2] = findWaveSpawner(triggered);
      triggered.world.set(id2, WaveSpawner, { elapsedMs: 0, waveCount: 1000 });
      triggered.tick(2001);
      expect(findWaveSpawner(triggered)[1].waveCount).toBe(1001);
    });

    it('a monster killed from a wave-spawned batch does not reappear', () => {
      // Same sequentialRandom values as the initial-spawn position test above, so each species
      // lands at a distinct, well-separated position (zag (-128,112), doltan (-8,-8), ghost
      // (-200,184), grass (112,-128)) — avoids an ambiguous "which of two overlapping monsters
      // absorbs the hit" situation (ties are unspecified/query-order-dependent, see the
      // "does not penetrate" test in the combat block above).
      const random = sequentialRandom(0, 0.25, 0.75, 0.99, 0.5, 0.5, 0.42, 0.1, 0.9, 0.01, 0.75, 0.25);
      const engine = spawnPlayerWorld(50, random);
      const [zagId, , zagPosition] = findMonster(engine, testTextures.zag);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: zagPosition.x, y: zagPosition.y });
      engine.world.set(zagId, Life, { current: 20 });

      const projectile = engine.world.createEntity();
      engine.world.set(projectile, Position, { x: zagPosition.x + 5, y: zagPosition.y + 12 });
      engine.world.set(projectile, Projectile, { velocityX: 0, velocityY: 0, damage: 20, remainingLifetimeMs: 1000 });

      engine.tick(50, withKeysHeld());
      expect(engine.world.isAlive(zagId)).toBe(false);

      engine.tick(50, withKeysHeld());
      expect(engine.world.isAlive(zagId)).toBe(false);
      expect([...engine.world.query([Chaser] as const)].some(([id]) => id === zagId)).toBe(false);
    });
  });

  describe('tilemap', () => {
    it('has the expected floor/wall/collider counts', () => {
      expect(FLOOR_TILES).toHaveLength(1024);
      expect(WALL_TILES).toHaveLength(128);
      expect(WALL_COLLIDERS).toHaveLength(128);
    });

    it('covers the grid corners', () => {
      expect(FLOOR_TILES).toContainEqual({ x: -240, y: -240 });
      expect(FLOOR_TILES).toContainEqual({ x: 225, y: 225 });
    });

    it('places each map corner twice, on purpose (matches the old game exactly, not deduped)', () => {
      const topLeftCorner = WALL_TILES.filter((tile) => tile.x === -240 && tile.y === -240);
      expect(topLeftCorner).toHaveLength(2);
    });

    it('gives every wall collider the full tile sprite size', () => {
      for (const collider of WALL_COLLIDERS) {
        expect(collider.width).toBe(16);
        expect(collider.height).toBe(16);
      }
    });

    it('cross-checks the grid size against WORLD_SIZE', () => {
      expect(TILE_GRID_SIZE * TILE_SPACING).toBe(WORLD_SIZE);
    });
  });

  describe('tilemap rendering', () => {
    it('submits the whole tilemap to the ground layer every frame', () => {
      const engine = spawnPlayerWorld(100);
      const submitSpy = vi.spyOn(engine.renderer, 'submitSprite');

      engine.tick(100, withKeysHeld());

      const groundCalls = submitSpy.mock.calls.filter(([draw]) => draw.layer === 'ground');
      expect(groundCalls).toHaveLength(1152);

      const floorCall = groundCalls.find(([draw]) => draw.sy === 0);
      expect(floorCall?.[0]).toMatchObject({
        sx: 0,
        sy: 0,
        sWidth: 16,
        sHeight: 16,
        width: 16,
        height: 16,
        texture: testTextures.tiles,
      });

      const wallCall = groundCalls.find(([draw]) => draw.sy === 16);
      expect(wallCall?.[0]).toMatchObject({
        sx: 0,
        sy: 16,
        sWidth: 16,
        sHeight: 16,
        width: 16,
        height: 16,
        texture: testTextures.tiles,
      });

      submitSpy.mockClear();
      engine.tick(100, withKeysHeld());
      const groundCallsAgain = submitSpy.mock.calls.filter(([draw]) => draw.layer === 'ground');
      expect(groundCallsAgain).toHaveLength(1152);
    });

    it('registers the ground layer before gameplay, both pixel-snapped with no parallax', () => {
      expect(ROGUELITE_LAYERS.map((layer) => layer.id)).toEqual(['ground', 'gameplay']);
      for (const layer of ROGUELITE_LAYERS) {
        expect(layer.pixelSnap).toBe(true);
        expect(layer.parallaxFactor).toBeUndefined();
      }
    });
  });

  describe('wall collision', () => {
    it('blocks movement straight into a wall', () => {
      const engine = spawnPlayerWorld(100);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: -229, y: 0 });

      engine.tick(100, withKeysHeld('KeyA'));

      const position = required(engine.world.get(playerId, Position), 'player Position missing');
      expect(position).toEqual({ x: -229, y: 0 });
    });

    it('slides along a wall when moving diagonally into it — only the penetrating axis is blocked', () => {
      const engine = spawnPlayerWorld(100);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: -229, y: 0 });

      engine.tick(100, withKeysHeld('KeyA', 'KeyS'));

      const position = required(engine.world.get(playerId, Position), 'player Position missing');
      expect(position.x).toBe(-229); // still blocked
      expect(position.y).toBeCloseTo(6.4); // Y succeeds independently, resolved against the already-blocked X
    });

    it('does not block a monster from passing through the wall boundary', () => {
      const engine = spawnPlayerWorld(1000);
      const [zagId] = findMonster(engine, testTextures.zag);
      const playerId = findPlayerId(engine);
      engine.world.set(zagId, Position, { x: -200, y: 0 });
      engine.world.set(playerId, Position, { x: -260, y: 0 });

      engine.tick(1000, withKeysHeld());

      const zagPosition = required(engine.world.get(zagId, Position), 'zag Position missing');
      expect(zagPosition.x).toBeCloseTo(-235); // inside the wall band ([-240,-224)) — proves it passed through unaffected
      expect(zagPosition.y).toBeCloseTo(0);
    });
  });
});
