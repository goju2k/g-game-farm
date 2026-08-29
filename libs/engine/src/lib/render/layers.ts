import type { LayerConfig } from './types.js';

/**
 * Holds the layer stack an engine was configured with. Validated once at
 * construction; there is deliberately no method to add/remove/reorder a
 * layer afterward — the stack is fixed for the engine's lifetime.
 */
export class LayerStack {
  private readonly order: readonly LayerConfig[];
  private readonly byId = new Map<string, LayerConfig>();

  constructor(layers: readonly LayerConfig[]) {
    if (layers.length === 0) {
      throw new Error('LayerStack requires at least one layer.');
    }
    for (const layer of layers) {
      if (this.byId.has(layer.id)) {
        throw new Error(`Duplicate layer id "${layer.id}".`);
      }
      this.byId.set(layer.id, layer);
    }
    this.order = layers;
  }

  get(id: string): LayerConfig {
    const layer = this.byId.get(id);
    if (!layer) {
      throw new Error(`Unknown layer "${id}".`);
    }
    return layer;
  }

  /** Back-to-front draw order, same as the array this stack was built from. */
  [Symbol.iterator](): IterableIterator<LayerConfig> {
    return this.order[Symbol.iterator]();
  }
}
