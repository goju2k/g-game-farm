import type {
  RenderContext,
  RenderSystem,
  System,
  SystemContext,
  SystemRegistration,
} from '@g-game-farm/engine-plugin-api';

interface Orderable {
  readonly order?: number;
}

/**
 * Concatenates onto the existing (already-sorted) list and re-sorts by
 * `order` using the platform's stable sort — ties keep their relative
 * position, which is registration order since the list is built by
 * concatenation.
 */
function mergeSorted<T extends Orderable>(existing: readonly T[], incoming: readonly T[]): T[] {
  return [...existing, ...incoming].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Holds the systems registered for each phase and runs them in order.
 * Internal to the engine — game code only ever calls `registerSystems`
 * on the plugin API, never touches this class directly.
 */
export class SystemScheduler {
  private input: readonly System[] = [];
  private simulation: readonly System[] = [];
  private postSimulation: readonly System[] = [];
  private render: readonly RenderSystem[] = [];

  register(registration: SystemRegistration): void {
    if (registration.input) {
      this.input = mergeSorted(this.input, registration.input);
    }
    if (registration.simulation) {
      this.simulation = mergeSorted(this.simulation, registration.simulation);
    }
    if (registration.postSimulation) {
      this.postSimulation = mergeSorted(this.postSimulation, registration.postSimulation);
    }
    if (registration.render) {
      this.render = mergeSorted(this.render, registration.render);
    }
  }

  runInput(ctx: SystemContext): void {
    for (const system of this.input) {
      system.run(ctx);
    }
  }

  runSimulation(ctx: SystemContext): void {
    for (const system of this.simulation) {
      system.run(ctx);
    }
  }

  runPostSimulation(ctx: SystemContext): void {
    for (const system of this.postSimulation) {
      system.run(ctx);
    }
  }

  runRender(ctx: RenderContext): void {
    for (const system of this.render) {
      system.run(ctx);
    }
  }
}
