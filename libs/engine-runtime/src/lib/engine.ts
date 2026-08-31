import { World, type ComponentType } from '@g-game-farm/engine-ecs';
import { TickEventBus } from '@g-game-farm/engine-events';
import { EMPTY_INPUT_FRAME, type InputFrame } from '@g-game-farm/engine-input';
import type { IStorageAdapter } from '@g-game-farm/engine-platform';
import type {
  PluginApi,
  RenderContext,
  SceneDefinition,
  SystemContext,
  SystemRegistration,
} from '@g-game-farm/engine-plugin-api';
import { createRenderer, NullRenderer, type EngineRenderer, type LayerConfig } from '@g-game-farm/engine-render';
import { SceneManager } from './scene-manager.js';
import { SystemScheduler } from './scheduler.js';

export interface EngineOptions {
  /** Simulation tick length in ms. Defaults to 1000/60. */
  readonly fixedDeltaMs?: number;
  /** Caps how many fixed steps a single `tick()` call may run, so a long stall (e.g. a dropped tab) can't spiral into an unbounded catch-up burst. Defaults to 5. */
  readonly maxSubStepsPerFrame?: number;
  /** Not consumed by the engine itself in Phase 0 — accepted here so `apps/*` has a single place to hand it in once save/load lands. */
  readonly storage?: IStorageAdapter;
  /** Omit to run headless (`engine.renderer` becomes a NullRenderer) — used by every test that doesn't need real graphics. */
  readonly render?: { readonly canvas: HTMLCanvasElement; readonly layers: readonly LayerConfig[] };
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
  /** NullRenderer unless `render: { canvas, layers }` was passed to createEngine(). */
  readonly renderer: EngineRenderer;

  private readonly scheduler = new SystemScheduler();
  private readonly events = new TickEventBus();
  private readonly sceneManager = new SceneManager();
  private readonly registeredComponents = new Map<number, ComponentType<unknown>>();

  private readonly fixedDeltaMs: number;
  private readonly maxSubStepsPerFrame: number;

  private accumulatorMs = 0;
  private simTick = 0;
  /** Guards loadScene() (mid-tick misuse) and tick() (reentrant calls) — set for the duration of a tick() call. */
  private inTick = false;
  /** Built once so SystemContext doesn't allocate a new closure every tick. */
  private readonly requestSceneChangeFromSystem = (name: string): void => this.requestSceneChange(name);

  constructor(options: EngineOptions = {}) {
    this.fixedDeltaMs = options.fixedDeltaMs ?? DEFAULT_FIXED_DELTA_MS;
    this.maxSubStepsPerFrame = options.maxSubStepsPerFrame ?? DEFAULT_MAX_SUB_STEPS_PER_FRAME;
    this.renderer = options.render ? createRenderer(options.render.canvas, options.render.layers) : new NullRenderer();
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
    this.sceneManager.register(scenes);
  }

  /**
   * Tears down the active scene (if any), wipes the world, and runs the new
   * scene's setup — immediately. Only safe to call between tick() calls
   * (bootstrap, tests); throws if called while a tick is in progress — a
   * system that wants to change scenes must use ctx.requestSceneChange()
   * instead, which applies safely at the start of the next tick().
   */
  loadScene(name: string): void {
    if (this.inTick) {
      throw new Error(
        `loadScene("${name}") cannot be called while a tick is in progress — use ctx.requestSceneChange() from a system, or call loadScene() only between tick() calls.`,
      );
    }
    this.sceneManager.load(name, this.world);
    this.accumulatorMs = 0;
  }

  /** The name of the scene currently reflected in the world (not a pending, not-yet-applied requestSceneChange target). */
  getActiveSceneName(): string | undefined {
    return this.sceneManager.getActiveName();
  }

  /**
   * Host-facing equivalent of ctx.requestSceneChange() — queues a scene
   * transition to apply at the start of the next tick(). Safe to call
   * between ticks or from within one; unlike loadScene(), never throws for
   * being mid-tick. Throws immediately if `name` isn't registered.
   */
  requestSceneChange(name: string): void {
    this.sceneManager.requestChange(name);
  }

  /**
   * Advances the simulation by `deltaMs` of real time, running zero or more
   * fixed-size steps, then runs the render phase once. Safe to call with a
   * hand-picked `deltaMs` from a test — no dependency on wall-clock time or
   * requestAnimationFrame, both of which are the host's job to supply.
   */
  tick(deltaMs: number, input: InputFrame = EMPTY_INPUT_FRAME): void {
    if (this.inTick) {
      throw new Error('tick() called reentrantly — a system must not call engine.tick() from within its own run().');
    }
    this.inTick = true;
    try {
      if (this.sceneManager.applyPending(this.world)) {
        this.accumulatorMs = 0;
      }

      this.accumulatorMs += deltaMs;

      let steps = 0;
      while (
        this.accumulatorMs >= this.fixedDeltaMs &&
        steps < this.maxSubStepsPerFrame &&
        !this.sceneManager.hasPending()
      ) {
        this.events.clear();
        this.simTick++;

        const ctx: SystemContext = {
          world: this.world,
          events: this.events,
          input,
          deltaMs: this.fixedDeltaMs,
          tick: this.simTick,
          requestSceneChange: this.requestSceneChangeFromSystem,
        };
        this.scheduler.runInput(ctx);
        this.scheduler.runSimulation(ctx);
        this.scheduler.runPostSimulation(ctx);

        this.accumulatorMs -= this.fixedDeltaMs;
        steps++;
      }

      if (this.sceneManager.hasPending()) {
        // A transition was requested mid-burst — this scene is done being simulated for this tick.
        this.accumulatorMs = 0;
      }

      const renderCtx: RenderContext = {
        world: this.world,
        events: this.events,
        alpha: this.accumulatorMs / this.fixedDeltaMs,
        renderer: this.renderer,
      };
      this.renderer.beginFrame();
      this.scheduler.runRender(renderCtx);
      this.renderer.flush();
    } finally {
      this.inTick = false;
    }
  }

  /**
   * Releases the renderer's GPU resources synchronously — see
   * EngineRenderer.dispose()'s doc comment. The World/scheduler/scene
   * registry hold no external resources of their own (plain JS
   * objects/Maps only), so the renderer is the only thing that needs
   * releasing here. Call once, when the host is done with this Engine
   * (e.g. GameCanvas unmount) — not usable afterward.
   */
  dispose(): void {
    this.renderer.dispose();
  }
}

export function createEngine(options?: EngineOptions): Engine {
  return new Engine(options);
}
