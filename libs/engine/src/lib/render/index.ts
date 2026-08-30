import { Renderer } from './sprite-batch-renderer.js';
import type { EngineRenderer, LayerConfig } from './types.js';

export * from './types.js';
export * from './load-textures.js';
export * from './white-pixel-texture.js';

export function createRenderer(canvas: HTMLCanvasElement, layers: readonly LayerConfig[]): EngineRenderer {
  return new Renderer(canvas, layers);
}
