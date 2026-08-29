import type { World } from '../ecs/world.js';
import type { SceneDefinition } from '../plugin-api/types.js';

/**
 * Owns the scene registry and the "one active scene, replace not stack"
 * transition logic. Internal to the engine — Engine assembles this with
 * the World/tick loop; game code only ever calls registerScenes/loadScene/
 * requestSceneChange through Engine, never touches this class directly.
 */
export class SceneManager {
  private readonly scenes = new Map<string, SceneDefinition>();
  private activeScene: SceneDefinition | undefined;
  private pending: string | undefined;
  /** Guards against setup()/teardown() recursively calling load() (directly, or indirectly via requestChange -> applyPending). */
  private loading = false;

  register(scenes: readonly SceneDefinition[]): void {
    for (const scene of scenes) {
      if (this.scenes.has(scene.name)) {
        throw new Error(`Scene "${scene.name}" is already registered.`);
      }
      this.scenes.set(scene.name, scene);
    }
  }

  /** Tears down the active scene (if any), wipes `world`, runs the new scene's setup — immediately, and cancels any pending requestChange(). */
  load(name: string, world: World): void {
    if (this.loading) {
      throw new Error(`Cannot load scene "${name}" while another scene's setup()/teardown() is still running.`);
    }
    const next = this.resolve(name);
    this.loading = true;
    try {
      this.activeScene?.teardown?.(world);
      world.clear();
      next.setup(world);
      this.activeScene = next;
      this.pending = undefined;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Queues `name` to replace the active scene at the very start of the next
   * tick(). Validates immediately (fail-fast), same contract as load().
   * Safe to call from anywhere, including from inside a system's run().
   */
  requestChange(name: string): void {
    this.resolve(name);
    this.pending = name;
  }

  hasPending(): boolean {
    return this.pending !== undefined;
  }

  /** Called by Engine at the top of tick(), before the fixed-step loop. Returns true iff a transition was actually applied. */
  applyPending(world: World): boolean {
    if (this.pending === undefined) {
      return false;
    }
    this.load(this.pending, world);
    return true;
  }

  getActiveName(): string | undefined {
    return this.activeScene?.name;
  }

  private resolve(name: string): SceneDefinition {
    const scene = this.scenes.get(name);
    if (!scene) {
      throw new Error(`Scene "${name}" is not registered.`);
    }
    return scene;
  }
}
