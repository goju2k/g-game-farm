import type { ComponentType } from '../ecs/component.js';
import type { ReadonlyWorld, World } from '../ecs/world.js';
import type { FrameRenderer } from '../render/types.js';
import type { EventBus, ReadonlyEventBus } from '../runtime/event-bus.js';
import type { InputFrame } from '../runtime/input-frame.js';

export interface SystemContext {
  readonly world: World;
  readonly events: EventBus;
  readonly input: InputFrame;
  readonly deltaMs: number;
  readonly tick: number;
}

export interface RenderContext {
  readonly world: ReadonlyWorld;
  readonly events: ReadonlyEventBus;
  /** 0..1 — how far the current real-time frame sits between the previous and next fixed simulation step. */
  readonly alpha: number;
  readonly renderer: FrameRenderer;
}

export interface System {
  readonly name: string;
  /** Ascending sort order within its phase; ties keep registration order. Defaults to 0. */
  readonly order?: number;
  run(ctx: SystemContext): void;
}

export interface RenderSystem {
  readonly name: string;
  readonly order?: number;
  run(ctx: RenderContext): void;
}

/**
 * Systems are registered per phase rather than as one array tagged with a
 * `phase` field — that's what lets `render`'s element type (`RenderSystem`)
 * pin `ctx.world` to `ReadonlyWorld` at the type level, with no runtime
 * check needed to keep render systems from mutating simulation state.
 */
export interface SystemRegistration {
  readonly input?: readonly System[];
  readonly simulation?: readonly System[];
  readonly postSimulation?: readonly System[];
  readonly render?: readonly RenderSystem[];
}

export interface SceneDefinition {
  readonly name: string;
  setup(world: World): void;
  teardown?(world: World): void;
}

/**
 * The only channel through which a game may talk to the engine. The engine
 * itself must never import from a game package — see scope:engine in
 * eslint.config.mjs, which enforces that boundary structurally.
 */
export interface PluginApi {
  registerComponents(types: readonly ComponentType<unknown>[]): void;
  registerSystems(systems: SystemRegistration): void;
  registerScenes(scenes: readonly SceneDefinition[]): void;
}
