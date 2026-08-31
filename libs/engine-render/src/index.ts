import { Renderer } from './lib/sprite-batch-renderer.js';
import type { EngineRenderer, LayerConfig } from './lib/types.js';

export * from './lib/types.js';
export * from './lib/load-textures.js';
export * from './lib/white-pixel-texture.js';
export * from './lib/null-renderer.js';

export function createRenderer(canvas: HTMLCanvasElement, layers: readonly LayerConfig[]): EngineRenderer {
  return new Renderer(canvas, layers);
}
