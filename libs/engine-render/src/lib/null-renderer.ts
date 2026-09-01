import type { CameraPose, EngineRenderer, ImageSource, SpriteDraw, TextureHandle, TextureOptions } from './types.js';

/**
 * Default `Engine.renderer` when no canvas was configured. Keeps
 * `ctx.renderer` non-optional so render systems never need a null check,
 * and keeps every headless test (Engine built without `render:` options)
 * working unchanged. Draw calls are silently dropped; asset loading fails
 * loudly, since "load a texture with no canvas" is a real bug, not a
 * no-op scenario.
 */
export class NullRenderer implements EngineRenderer {
  /**
   * Not a true no-op like the other methods here — resize() genuinely
   * tracks this, so a headless test can call `engine.renderer.resize(w, h)`
   * once to give SystemContext.canvasSize a realistic value (e.g. for aim
   * math), the same way a real Renderer's canvasSize reflects whatever
   * GameCanvas last observed.
   */
  private canvasSize = { width: 0, height: 0 };

  setCamera(_layerId: string, _pose: CameraPose): void {
    // no-op
  }

  submitSprite(_draw: SpriteDraw): void {
    // no-op
  }

  createTexture(_source: ImageSource, _options: TextureOptions): TextureHandle {
    throw new Error(
      'NullRenderer has no canvas configured — pass `render: { canvas, layers }` to createEngine() to load textures.',
    );
  }

  destroyTexture(_handle: TextureHandle): void {
    // no-op
  }

  getTextureSize(_handle: TextureHandle): Readonly<{ width: number; height: number }> {
    throw new Error('NullRenderer has no canvas configured.');
  }

  resize(width: number, height: number): void {
    this.canvasSize = { width, height };
  }

  getCanvasSize(): Readonly<{ width: number; height: number }> {
    return this.canvasSize;
  }

  beginFrame(): void {
    // no-op
  }

  flush(): void {
    // no-op
  }

  dispose(): void {
    // no-op
  }
}
