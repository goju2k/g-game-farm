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
  setCamera(_pose: CameraPose): void {
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

  resize(_width: number, _height: number): void {
    // no-op
  }

  beginFrame(): void {
    // no-op
  }

  flush(): void {
    // no-op
  }
}
