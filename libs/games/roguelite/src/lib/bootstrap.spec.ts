import {
  createEngine,
  createSnapshotStore,
  EMPTY_INPUT_FRAME,
  isCellSolid,
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
  Flags,
  Life,
  Pickup,
  PlayerControlled,
  PlayerForm,
  Position,
  Projectile,
  RoomTileLayout,
  SpriteRender,
  WaveSpawner,
} from './components.js';
import { spawnMonsterWave } from './monsters/monster-wave.js';
import { EMPTY_DIALOGUE_STATE } from './scenario/dialogue-state.js';
import { createRogueliteSession, type PlayerFormId } from './session.js';
import { createRunScenarioSystem } from './systems/run-scenario.js';

const testTextures: Record<RogueliteAssetKey, TextureHandle> = {
  player: 0 as TextureHandle,
  zag: 1 as TextureHandle,
  doltan: 2 as TextureHandle,
  ghost: 3 as TextureHandle,
  grass: 4 as TextureHandle,
  tiles: 6 as TextureHandle,
};
const testWhitePixelTexture = 5 as TextureHandle;
const testFormTextures: Readonly<Record<PlayerFormId, TextureHandle>> = {
  mage: testTextures.player,
  flame: 7 as TextureHandle,
};

function withKeysHeld(...codes: readonly PhysicalKey[]): InputFrame {
  return {
    ...EMPTY_INPUT_FRAME,
    keyboard: { held: new Set(codes), justPressed: new Set(codes), justReleased: new Set() },
  };
}

/**
 * Aim is given in WORLD units — the simulation only ever reads
 * mouse.worldPosition (resolved at capture time against the drawn camera,
 * see GameCanvas's pointerLayer). The screen `position` is irrelevant to
 * the simulation; any value stands in for "the cursor is over the canvas".
 */
function withMouseAimedAt(worldX: number, worldY: number, ...buttons: readonly MouseButton[]): InputFrame {
  return {
    ...EMPTY_INPUT_FRAME,
    mouse: {
      buttons: { held: new Set(buttons), justPressed: new Set(buttons), justReleased: new Set() },
      position: { x: 0, y: 0 },
      worldPosition: { x: worldX, y: worldY },
      wheelDeltaY: 0,
    },
  };
}

/** A fixed random source for tests that only care about counts/timer state, not exact draw-by-draw positions. */
function constantRandom(value: number): () => number {
  return () => value;
}

/** registerRoguelite() only — enough for movement/combat/camera/tilemap, where the scenario system never needs to actually run. */
function spawnPlayerWorld(fixedDeltaMs?: number, random?: () => number) {
  const engine = createEngine(fixedDeltaMs === undefined ? undefined : { fixedDeltaMs });
  const session = createRogueliteSession();
  registerRoguelite(engine, testTextures, testWhitePixelTexture, testFormTextures, session, random);
  engine.loadScene(ROGUELITE_BOOT_SCENE);
  return { engine, session };
}

/** registerRoguelite() + createRunScenarioSystem — the same wiring roguelite-game.tsx does, for tests that need a room's script to actually advance. */
function spawnFullGame(fixedDeltaMs?: number, random: () => number = Math.random) {
  const engine = createEngine(fixedDeltaMs === undefined ? undefined : { fixedDeltaMs });
  const session = createRogueliteSession();
  const dialogueStore = createSnapshotStore(EMPTY_DIALOGUE_STATE);
  registerRoguelite(engine, testTextures, testWhitePixelTexture, testFormTextures, session, random);
  engine.registerSystems({
    simulation: [createRunScenarioSystem({ textures: testTextures, random, formTextures: testFormTextures, session, dialogueStore })],
  });
  engine.loadScene(ROGUELITE_BOOT_SCENE);
  return { engine, session, dialogueStore };
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
  it('registers and loads the boot scene (room-a) without throwing, and tick() runs cleanly', () => {
    const engine = createEngine();
    registerRoguelite(engine, testTextures, testWhitePixelTexture, testFormTextures, createRogueliteSession());

    expect(() => engine.loadScene(ROGUELITE_BOOT_SCENE)).not.toThrow();
    expect(engine.getActiveSceneName()).toBe('room-a');
    expect(() => engine.tick(1000 / 60)).not.toThrow();
  });

  it('spawns the player in the flame form at room-a\'s entry point, with no monsters yet', () => {
    const { engine } = spawnPlayerWorld();

    const [, position, sprite, animator] = findPlayer(engine);
    expect(position).toEqual({ x: -9, y: -9 });
    expect(sprite.texture).toBe(testFormTextures.flame);
    expect(sprite.layer).toBe('gameplay');
    expect(sprite).toMatchObject({ sx: 0, sy: 0, sWidth: 12, sHeight: 12, width: 12, height: 12 });
    expect(animator.current).toBe('idle');
    expect(animator.clips.idle.frames).toHaveLength(1);
    expect(animator.clips.run.frames).toHaveLength(2);
    expect([...engine.world.query([Chaser] as const)]).toHaveLength(0);
  });

  it('spawns PlayerControlled/AttackCooldown/WallCollider/PlayerForm matching the flame form', () => {
    const { engine, session } = spawnPlayerWorld();
    const playerId = findPlayerId(engine);

    expect(required(engine.world.get(playerId, PlayerControlled), 'missing').speed).toBe(64);
    expect(required(engine.world.get(playerId, AttackCooldown), 'missing')).toEqual({ remainingMs: 0, intervalMs: 50 });
    expect(required(engine.world.get(playerId, PlayerForm), 'missing').form).toBe('flame');
    expect(session.currentForm).toBe('flame');
  });

  describe('movement', () => {
    it('does not move when no keys are held', () => {
      const { engine } = spawnPlayerWorld(100);
      engine.tick(100, withKeysHeld());

      const [[, position]] = [...engine.world.query([Position, PlayerControlled] as const)];
      expect(position).toEqual({ x: -9, y: -9 });
    });

    it('KeyD moves right and sets flipX true', () => {
      const { engine } = spawnPlayerWorld(100);
      engine.tick(100, withKeysHeld('KeyD'));

      const [, position, sprite] = findPlayer(engine);
      expect(position.x).toBeCloseTo(-9 + 6.4);
      expect(position.y).toBeCloseTo(-9);
      expect(sprite.flipX).toBe(true);
    });

    it('KeyA moves left and sets flipX false', () => {
      const { engine } = spawnPlayerWorld(100);
      engine.tick(100, withKeysHeld('KeyA'));

      const [, position, sprite] = findPlayer(engine);
      expect(position.x).toBeCloseTo(-9 - 6.4);
      expect(sprite.flipX).toBe(false);
    });

    it('KeyA takes priority over KeyD when both are held', () => {
      const { engine } = spawnPlayerWorld(100);
      engine.tick(100, withKeysHeld('KeyA', 'KeyD'));

      const [, position, sprite] = findPlayer(engine);
      expect(position.x).toBeCloseTo(-9 - 6.4);
      expect(sprite.flipX).toBe(false);
    });

    it('flipX stays sticky when only vertical movement is held afterward', () => {
      const { engine } = spawnPlayerWorld(100);
      engine.tick(100, withKeysHeld('KeyD'));
      engine.tick(100, withKeysHeld('KeyW'));

      const [, position, sprite] = findPlayer(engine);
      expect(sprite.flipX).toBe(true);
      expect(position.y).toBeCloseTo(-9 - 6.4);
    });

    it('diagonal movement is not normalized — both axes move at full speed', () => {
      const { engine } = spawnPlayerWorld(100);
      engine.tick(100, withKeysHeld('KeyD', 'KeyW'));

      const [[, position]] = [...engine.world.query([Position, PlayerControlled] as const)];
      expect(position.x).toBeCloseTo(-9 + 6.4);
      expect(position.y).toBeCloseTo(-9 - 6.4);
    });
  });

  describe('animation', () => {
    it('switches to the run clip while moving and steps it the same tick', () => {
      const { engine } = spawnPlayerWorld(50);
      engine.tick(50, withKeysHeld('KeyD'));

      const [, , sprite, animator] = findPlayer(engine);
      expect(animator.current).toBe('run');
      expect(sprite.sx).toBe(0); // 50ms < the run clip's 90ms first-frame duration
    });

    it('the 2-frame run clip actually alternates once elapsed time crosses a frame boundary', () => {
      const { engine } = spawnPlayerWorld(50); // fixedDeltaMs matches tick() exactly — no fixed-step accumulator drift to reason about
      engine.tick(50, withKeysHeld('KeyD'));
      engine.tick(50, withKeysHeld('KeyD')); // cumulative 100ms > the 90ms first frame

      const [, , sprite] = findPlayer(engine);
      expect(sprite.sx).toBe(12); // FLAME_FRAME_SIZE — the placeholder texture's second frame
    });

    it('returns to idle once all keys are released, and the single-frame idle clip never changes sx', () => {
      const { engine } = spawnPlayerWorld(100);
      engine.tick(100, withKeysHeld('KeyD'));
      engine.tick(100, withKeysHeld());
      engine.tick(100, withKeysHeld());

      const [, , sprite, animator] = findPlayer(engine);
      expect(animator.current).toBe('idle');
      expect(sprite.sx).toBe(0);
    });
  });

  describe('camera', () => {
    it('follows the player sprite center (flame form: half-size 6) every frame, on both layers', () => {
      const { engine } = spawnPlayerWorld(100);
      const setCameraSpy = vi.spyOn(engine.renderer, 'setCamera');

      engine.tick(100, withKeysHeld());
      const [groundArgs1, gameplayArgs1] = setCameraSpy.mock.calls;
      expect(groundArgs1[0]).toBe('ground');
      expect(groundArgs1[1].x).toBeCloseTo(-3);
      expect(groundArgs1[1].y).toBeCloseTo(-3);
      expect(gameplayArgs1[0]).toBe('gameplay');
      expect(gameplayArgs1[1]).toEqual(groundArgs1[1]);

      setCameraSpy.mockClear();
      engine.tick(100, withKeysHeld('KeyD'));
      const [groundArgs2] = setCameraSpy.mock.calls;
      expect(groundArgs2[1].x).toBeCloseTo(3.4);
      expect(groundArgs2[1].y).toBeCloseTo(-3);
    });
  });

  describe('combat', () => {
    /** Spawns 1 of each of the 4 species (deterministic count regardless of random draws — see monster-wave.ts) at scattered positions. */
    function spawnOneOfEach(engine: ReturnType<typeof createEngine>) {
      spawnMonsterWave(engine.world, testTextures, 1, Math.random);
    }

    it('does not fire when the mouse is aimed exactly at the player (zero distance)', () => {
      const { engine } = spawnPlayerWorld(50);
      // The flame-form player's sprite center starts at world (-3,-3) — same point the camera centers on.
      engine.tick(50, withMouseAimedAt(-3, -3, 'left'));
      expect([...engine.world.query([Projectile] as const)]).toHaveLength(0);
    });

    it('fires toward the cursor, spawning centered on the (flame-sized) player, already moved this same tick', () => {
      const { engine } = spawnPlayerWorld(50);
      const playerId = findPlayerId(engine);
      engine.tick(50, withMouseAimedAt(117, -3, 'left')); // straight +x of the player's center

      const projectiles = [...engine.world.query([Position, Projectile] as const)];
      expect(projectiles).toHaveLength(1);
      const [, position, projectile] = projectiles[0];
      // Spawns at playerCenter-1 = (-4,-4), then moveProjectilesSystem (order 2) already
      // advances it by this same tick's velocity*deltaSeconds before render — (150,0)*0.05 = (7.5,0).
      expect(position.x).toBeCloseTo(3.5);
      expect(position.y).toBeCloseTo(-4);
      expect(projectile.velocityX).toBeCloseTo(150);
      expect(projectile.velocityY).toBeCloseTo(0);
      expect(projectile.damage).toBe(20);

      const cooldown = required(engine.world.get(playerId, AttackCooldown), 'cooldown missing');
      expect(cooldown.remainingMs).toBe(50);
    });

    it('fires again once the cooldown elapses, gating correctly on deltas that do not evenly divide the interval', () => {
      const { engine } = spawnPlayerWorld(20);
      const playerId = findPlayerId(engine);
      const frame = withMouseAimedAt(117, -3, 'left');

      engine.tick(20, frame); // remainingMs 0-20=-20<=0 -> fires (1), reset to 50
      engine.tick(20, frame); // 50-20=30 -> no fire
      engine.tick(20, frame); // 30-20=10 -> no fire
      expect([...engine.world.query([Projectile] as const)]).toHaveLength(1);
      expect(required(engine.world.get(playerId, AttackCooldown), 'cooldown missing').remainingMs).toBe(10);

      engine.tick(20, frame); // 10-20=-10<=0 -> fires (2), reset to 50
      expect([...engine.world.query([Projectile] as const)]).toHaveLength(2);
      expect(required(engine.world.get(playerId, AttackCooldown), 'cooldown missing').remainingMs).toBe(50);
    });

    it('does not fire and does not throw when there is no resolved aim point (mouse not moved yet / before first draw)', () => {
      const { engine } = spawnPlayerWorld(50);
      const frame: InputFrame = {
        ...EMPTY_INPUT_FRAME,
        mouse: {
          buttons: { held: new Set<MouseButton>(['left']), justPressed: new Set<MouseButton>(['left']), justReleased: new Set() },
          // A screen position with no world resolution yet — the simulation must not fall back to guessing.
          position: { x: 480, y: 270 },
          worldPosition: undefined,
          wheelDeltaY: 0,
        },
      };
      expect(() => engine.tick(50, frame)).not.toThrow();
      expect([...engine.world.query([Projectile] as const)]).toHaveLength(0);
    });

    it('destroys a projectile whose lifetime has expired', () => {
      const { engine } = spawnPlayerWorld(50);
      const projectile = engine.world.createEntity();
      engine.world.set(projectile, Position, { x: 500, y: 500 });
      engine.world.set(projectile, Projectile, { velocityX: 0, velocityY: 0, damage: 20, remainingLifetimeMs: 10 });

      engine.tick(50, withKeysHeld());

      expect(engine.world.isAlive(projectile)).toBe(false);
    });

    it('applies damage within the same tick the hit was detected, and the hit target survives a non-lethal hit', () => {
      const { engine } = spawnPlayerWorld(50);
      spawnOneOfEach(engine);
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

    it('destroys a monster hit for exactly its remaining life, leaving no residual Life component', () => {
      const { engine } = spawnPlayerWorld(50);
      spawnOneOfEach(engine);
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

    it('does not penetrate — only one of two overlapped monsters takes damage from a single projectile', () => {
      const { engine } = spawnPlayerWorld(50);
      spawnOneOfEach(engine);
      const [zagId, , zagPosition] = findMonster(engine, testTextures.zag);
      const [doltanId] = findMonster(engine, testTextures.doltan);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: zagPosition.x, y: zagPosition.y });
      engine.world.remove(doltanId, Chaser); // freeze doltan in place for this test
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

    it('moves a monster toward a repositioned player, along the normalized direction', () => {
      const { engine } = spawnPlayerWorld(100);
      spawnOneOfEach(engine);
      const playerId = findPlayerId(engine);
      const [doltanId] = findMonster(engine, testTextures.doltan);
      engine.world.set(doltanId, Position, { x: -17, y: 43 });
      engine.world.set(playerId, Position, { x: 0, y: 0 });
      engine.tick(100, withKeysHeld());

      const [, , doltan] = findMonster(engine, testTextures.doltan);
      expect(doltan.x).toBeCloseTo(-16.4485, 3);
      expect(doltan.y).toBeCloseTo(41.6051, 3);
    });

    it('does not block a monster from passing through the wall boundary', () => {
      const { engine } = spawnPlayerWorld(1000);
      spawnOneOfEach(engine);
      const [zagId] = findMonster(engine, testTextures.zag);
      const playerId = findPlayerId(engine);
      engine.world.set(zagId, Position, { x: -215, y: 0 });
      engine.world.set(playerId, Position, { x: -300, y: 0 });

      engine.tick(1000, withKeysHeld());

      const zagPosition = required(engine.world.get(zagId, Position), 'zag Position missing');
      expect(zagPosition.x).toBeCloseTo(-250); // inside the west wall column ([-256,-240)) — proves it passed through unaffected
      expect(zagPosition.y).toBeCloseTo(0);
    });
  });

  describe('wave spawning (no auto-spawn — see rooms/room-a.ts, which scripts spawnWave itself)', () => {
    it('boots with no WaveSpawner entity — periodic auto-spawn is opt-in per room, not automatic', () => {
      const { engine } = spawnPlayerWorld();
      expect([...engine.world.query([WaveSpawner] as const)]).toHaveLength(0);
    });

    it('still triggers correctly when a room manually creates a WaveSpawner entity', () => {
      const { engine } = spawnPlayerWorld(6501, constantRandom(0.5));
      const spawnerId = engine.world.createEntity();
      engine.world.set(spawnerId, WaveSpawner, { elapsedMs: 0, waveCount: 0 });

      engine.tick(6501); // waveCount=0 -> timeUnit=7000-500=6500; 6501>6500 triggers

      const spawner = required(engine.world.get(spawnerId, WaveSpawner), 'spawner missing');
      expect(spawner.waveCount).toBe(1);
      expect(spawner.elapsedMs).toBe(0); // hard reset, not carrying over the 1ms overshoot
      expect([...engine.world.query([Chaser] as const)].length).toBeGreaterThan(0);
    });
  });

  describe('tilemap (room-a: 32x32 cells at -256..256, one door cut into the east wall)', () => {
    function roomATiles(engine: ReturnType<typeof createEngine>) {
      const [match] = [...engine.world.query([RoomTileLayout] as const)];
      return required(match, 'RoomTileLayout not found')[1];
    }

    it('draws a floor tile on every cell plus the wall ring minus the 2 door cells', () => {
      const { engine } = spawnPlayerWorld();
      const { sprites } = roomATiles(engine);
      expect(sprites).toHaveLength(1024 + (124 - 2));
      expect(sprites).toContainEqual({ x: -256, y: -256, sx: 0, sy: 0 });
      expect(sprites).toContainEqual({ x: 240, y: 240, sx: 0, sy: 16 });
    });

    it('blocks exactly the wall ring, with the door cells (x=240, y=-16 and 0) left open', () => {
      const { engine } = spawnPlayerWorld();
      const { collision } = roomATiles(engine);
      expect(collision).toMatchObject({ originX: -256, originY: -256, cellSize: 16, columns: 32, rows: 32 });
      expect(isCellSolid(collision, 0, 0)).toBe(true);
      expect(isCellSolid(collision, 31, 14)).toBe(true);
      expect(isCellSolid(collision, 31, 15)).toBe(false);
      expect(isCellSolid(collision, 31, 16)).toBe(false);
      expect(isCellSolid(collision, 16, 16)).toBe(false);
    });
  });

  describe('tilemap rendering', () => {
    it('submits the whole tilemap (floor + wall, minus the 2 door cells) to the ground layer every frame', () => {
      const { engine } = spawnPlayerWorld(100);
      const submitSpy = vi.spyOn(engine.renderer, 'submitSprite');

      engine.tick(100, withKeysHeld());

      const groundCalls = submitSpy.mock.calls.filter(([draw]) => draw.layer === 'ground');
      expect(groundCalls).toHaveLength(1024 + 122);
    });

    it('registers the ground layer before gameplay, both pixel-snapped with no parallax', () => {
      expect(ROGUELITE_LAYERS.map((layer) => layer.id)).toEqual(['ground', 'gameplay']);
      for (const layer of ROGUELITE_LAYERS) {
        expect(layer.pixelSnap).toBe(true);
        expect(layer.parallaxFactor).toBeUndefined();
      }
    });
  });

  describe('wall collision (flame form: smaller WallCollider offset 3,6 size 6x5)', () => {
    it('blocks movement straight into the west wall', () => {
      const { engine } = spawnPlayerWorld(100);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: -243, y: 0 }); // collider box (x+3) touches the wall's east edge (-240) exactly

      engine.tick(100, withKeysHeld('KeyA'));

      const position = required(engine.world.get(playerId, Position), 'player Position missing');
      expect(position).toEqual({ x: -243, y: 0 });
    });

    it('stops flush against the wall rather than short of it, whatever the step size', () => {
      const { engine } = spawnPlayerWorld(100);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: -240, y: 0 }); // 3 units from the wall; one 100ms step would move 6.4

      engine.tick(100, withKeysHeld('KeyA'));

      const position = required(engine.world.get(playerId, Position), 'player Position missing');
      expect(position.x).toBeCloseTo(-243, 9);
    });

    it('slides along a wall when moving diagonally into it — only the penetrating axis is blocked', () => {
      const { engine } = spawnPlayerWorld(100);
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: -243, y: 0 });

      engine.tick(100, withKeysHeld('KeyA', 'KeyS'));

      const position = required(engine.world.get(playerId, Position), 'player Position missing');
      expect(position.x).toBe(-243); // still blocked
      expect(position.y).toBeCloseTo(6.4); // Y succeeds independently
    });
  });

  describe('room transition (room-a -> room-b)', () => {
    it('keeps the door locked until the scripted wave is cleared, then transitions on the next tick after crossing the zone', () => {
      const { engine } = spawnFullGame(100);
      const playerId = findPlayerId(engine);

      engine.tick(100, withKeysHeld()); // pc0 spawnWave (instant) -> pc1 waitForNoMonsters (blocks, monsters just spawned)
      expect([...engine.world.query([Chaser] as const)].length).toBeGreaterThan(0);

      // Stand in the door zone (x 235..275) while the wave is still up — must NOT unlock.
      engine.world.set(playerId, Position, { x: 236, y: 0 });
      engine.tick(100, withKeysHeld());
      expect(engine.getActiveSceneName()).toBe('room-a');

      for (const [id] of engine.world.query([Chaser] as const)) {
        engine.world.destroyEntity(id);
      }
      // createRoomExitTriggerSystem (order 1) runs BEFORE createRunScenarioSystem (order 2) each
      // tick, so the tick where waitForNoMonsters resolves and setFlag('cleared', true) runs is
      // still evaluated by the exit trigger against the OLD (locked) flag value — the door only
      // sees 'cleared' on the *following* tick.
      engine.tick(100, withKeysHeld()); // pc1 waitForNoMonsters resolves -> pc2 setFlag cleared:true -> finished, same tick
      expect(engine.getActiveSceneName()).toBe('room-a');

      engine.tick(100, withKeysHeld()); // exit trigger now sees cleared:true and the player still in the zone -> requests the change
      expect(engine.getActiveSceneName()).toBe('room-a'); // requestSceneChange only applies at the START of the next tick

      engine.tick(100, withKeysHeld());
      expect(engine.getActiveSceneName()).toBe('room-b');

      const [, position, , animator] = findPlayer(engine);
      expect(position).toEqual({ x: -95, y: -9 }); // room-b's 'fromRoomA' entry point
      expect(animator.clips.idle.frames).toHaveLength(1); // still the flame form — no transform has happened yet
    });
  });

  describe('dialogue and growth-stage transform (room-b)', () => {
    it('shows a dialogue line, dismisses it on KeyE, then transforms flame->mage the same tick the robe is collected', () => {
      // fixedDeltaMs matches every tick() call below exactly (100ms) — one simulation step per
      // call, so 'wait' countdown math is exact instead of subject to fixed-step accumulator drift.
      const { engine, session, dialogueStore } = spawnFullGame(100, Math.random);
      engine.loadScene('room-b');
      const playerId = findPlayerId(engine);

      engine.tick(100, withKeysHeld()); // enters the 400ms wait (consumes no time on the entering tick)
      expect(dialogueStore.getSnapshot().visible).toBe(false);

      engine.tick(100, withKeysHeld()); // 400-100=300
      engine.tick(100, withKeysHeld()); // 300-100=200
      engine.tick(100, withKeysHeld()); // 200-100=100
      engine.tick(100, withKeysHeld()); // 100-100=0 -> wait elapses -> showDialogue sets the store visible
      expect(dialogueStore.getSnapshot()).toEqual({ visible: true, text: '...an ancient seal cracks further.' });

      engine.tick(100, withKeysHeld('KeyE')); // dismiss -> advance to waitUntil(robeTaken), which is false
      expect(dialogueStore.getSnapshot().visible).toBe(false);
      expect(required(engine.world.get(playerId, PlayerForm), 'missing').form).toBe('flame');

      const [robeId] = required([...engine.world.query([Pickup] as const)][0], 'robe pickup not found');
      engine.world.set(playerId, Position, { x: 58, y: -4 }); // overlaps the robe's collision box
      engine.tick(100, withKeysHeld()); // collectPickupsSystem sets robeTaken this tick -> waitUntil resolves -> transformPlayer, same tick

      expect(engine.world.isAlive(robeId)).toBe(false);
      const [, position, sprite, animator] = findPlayer(engine);
      expect(position).toEqual({ x: 58, y: -4 }); // transform doesn't move the player
      expect(sprite.texture).toBe(testFormTextures.mage);
      expect(sprite).toMatchObject({ sx: 0, sy: 0, sWidth: 18, sHeight: 18, width: 18, height: 18 });
      expect(animator.clips.idle.frames).toHaveLength(10); // the mage form's real clip shape, not the flame's 1-frame idle
      expect(required(engine.world.get(playerId, PlayerForm), 'missing').form).toBe('mage');
      expect(session.currentForm).toBe('mage');
    });
  });

  describe('room-c (authored in Tiled — maps/test.tmj)', () => {
    it("is reached through room-b's east door once the robe is taken, landing on the map's entryPoint", () => {
      const { engine } = spawnPlayerWorld(100);
      engine.loadScene('room-b');
      const playerId = findPlayerId(engine);
      engine.world.set(playerId, Position, { x: 110, y: 0 }); // collider box 113..119 — inside the door zone (107..147)

      engine.tick(100, withKeysHeld());
      expect(engine.getActiveSceneName()).toBe('room-b'); // still locked: robeTaken not set

      const [flagsId, flags] = required([...engine.world.query([Flags] as const)][0], 'Flags not found');
      engine.world.set(flagsId, Flags, { values: { ...flags.values, robeTaken: true } });
      engine.tick(100, withKeysHeld()); // exit trigger requests the change
      engine.tick(100, withKeysHeld()); // applied at the start of this tick
      expect(engine.getActiveSceneName()).toBe('room-c');

      const [, position] = findPlayer(engine);
      expect(position).toEqual({ x: 224, y: 192 });
    });

    it("draws the map's artwork and blocks at its painted collision — the player stops flush under the cave's north wall", () => {
      const { engine } = spawnPlayerWorld(100);
      engine.loadScene('room-c');
      const submitSpy = vi.spyOn(engine.renderer, 'submitSprite');

      engine.tick(100, withKeysHeld());
      expect(submitSpy.mock.calls.filter(([draw]) => draw.layer === 'ground')).toHaveLength(398);

      // Straight up from (224,192): column 14 stays open until the wall at row 6 (y 96..112). The
      // collider's top (y+6) ends flush at y=112, i.e. Position.y = 106 — reached well within 2s at 64/s.
      for (let i = 0; i < 20; i++) {
        engine.tick(100, withKeysHeld('KeyW'));
      }
      const [, position] = findPlayer(engine);
      expect(position.x).toBe(224);
      expect(position.y).toBeCloseTo(106, 9);
    });
  });
});
