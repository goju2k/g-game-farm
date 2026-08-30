import type { EngineRenderer, TextureHandle } from './types.js';

/**
 * A 1x1 opaque-white texture, useful as a tint-only sprite (e.g. a flat-
 * colored projectile or UI rect) — SpriteRender.tint multiplies it to get
 * the actual color. ImageData needs no async decode (unlike new Image()),
 * so this runs synchronously.
 */
export function createWhitePixelTexture(renderer: EngineRenderer): TextureHandle {
  return renderer.createTexture(new ImageData(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1), { filter: 'nearest' });
}
