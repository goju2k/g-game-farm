import type { ComponentType } from '../ecs/component.js';
import { World } from '../ecs/world.js';
import type { IStorageAdapter } from '../platform/storage-adapter.js';
import type {
  PluginApi,
  RenderContext,
  SceneDefinition,
  SystemContext,
  SystemRegistration,
} from '../plugin-api/types.js';
import { TickEventBus } from './event-bus.js';
import { EMPTY_INPUT_FRAME, type InputFrame } from './input-frame.js';
import { SystemScheduler } from './scheduler.js';

export interface EngineOptions {
  /** Simulation tick length in ms. Defaults to 1000/60. */
  readonly fixedDeltaMs?: number;
  /** Caps how many fixed steps a single `tick()` call may run, so a long stall (e.g. a dropped tab) can't spiral into an unbounded catch-up burst. Defaults to 5. */
  readonly maxSubStepsPerFrame?: number;
  /** Not consumed by the engine itself in Phase 0 — accepted here so `apps/*` has a single place to hand it in once save/load lands. */
  readonly storage?: IStorageAdapter;
}

const DEFAULT_FIXED_DELTA_MS = 1000 / 60;
const DEFAULT_MAX_SUB_STEPS_PER_FRAME = 5;

/**
 * The engine runtime: owns the World, drives the fixed-timestep simulation
 * loop, and is the concrete implementation of PluginApi that game code
 * registers against. See CLAUDE.md's coop principles — this is where
 * "input frame in, simulation ticks, events out, render reads a snapshot"
 * is actually enforced as control flow, not just convention.
 */
export class Engine implements PluginApi {
  readonly world = new World();

  private readonly scheduler = new SystemScheduler();
  private readonly events = new TickEventBus();
  private readonly scenes = new Map<string, SceneDefinition>();
  private readonly registeredComponents = new Map<number, ComponentType<unknown>>();
  private activeScene: SceneDefinition | undefined;

  private readonly fixedDeltaMs: number;
  private readonly maxSubStepsPerFrame: number;

  private accumulatorMs = 0;
  private simTick = 0;

  constructor(options: EngineOptions = {}) {
    this.fixedDeltaMs = options.fixedDeltaMs ?? DEFAULT_FIXED_DELTA_MS;
    this.maxSubStepsPerFrame = options.maxSubStepsPerFrame ?? DEFAULT_MAX_SUB_STEPS_PER_FRAME;
  }

  registerComponents(types: readonly ComponentType<unknown>[]): void {
    for (const type of types) {
      this.registeredComponents.set(type.id, type);
    }
  }

  getRegisteredComponentTypes(): readonly ComponentType<unknown>[] {
    return [...this.registeredComponents.values()];
  }

  registerSystems(systems: SystemRegistration): void {
    this.scheduler.register(systems);
  }

  registerScenes(scenes: readonly SceneDefinition[]): void {
    for (const scene of scenes) {
      if (this.scenes.has(scene.name)) {
        throw new Error(`Scene "${scene.name}" is already registered.`);
      }
      this.scenes.set(scene.name, scene);
    }
  }

  /** Tears down the active scene (if any), wipes the world, and runs the new scene's setup. */
  loadScene(name: string): void {
    const next = this.scenes.get(name);
    if (!next) {
      throw new Error(`Scene "${name}" is not registered.`);
    }
    this.activeScene?.teardown?.(this.world);
    this.world.clear();
    next.setup(this.world);
    this.activeScene = next;
  }

  /**
   * Advances the simulation by `deltaMs` of real time, running zero or more
   * fixed-size steps, then runs the render phase once. Safe to call with a
   * hand-picked `deltaMs` from a test — no dependency on wall-clock time or
   * requestAnimationFrame, both of which are the host's job to supply.
   */
  tick(deltaMs: number, input: InputFrame = EMPTY_INPUT_FRAME): void {
    this.accumulatorMs += deltaMs;

    let steps = 0;
    while (this.accumulatorMs >= this.fixedDeltaMs && steps < this.maxSubStepsPerFrame) {
      this.events.clear();
      this.simTick++;

      const ctx: SystemContext = {
        world: this.world,
        events: this.events,
        input,
        deltaMs: this.fixedDeltaMs,
        tick: this.simTick,
      };
      this.scheduler.runInput(ctx);
      this.scheduler.runSimulation(ctx);
      this.scheduler.runPostSimulation(ctx);

      this.accumulatorMs -= this.fixedDeltaMs;
      steps++;
    }

    const renderCtx: RenderContext = {
      world: this.world,
      events: this.events,
      alpha: this.accumulatorMs / this.fixedDeltaMs,
    };
    this.scheduler.runRender(renderCtx);
  }
}

export function createEngine(options?: EngineOptions): Engine {
  return new Engine(options);
}
