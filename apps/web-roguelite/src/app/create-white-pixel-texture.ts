import type { EngineRenderer, TextureHandle } from '@g-game-farm/engine';

/**
 * A 1x1 opaque-white texture used as the basic attack projectile's sprite —
 * SpriteRender.tint multiplies it to get the projectile's actual color, the
 * same way the old pre-engine repo's Particle.ts drew a flat-colored rect
 * instead of a real sprite. ImageData needs no async decode (unlike
 * new Image()), so this runs synchronously.
 */
export function createWhitePixelTexture(renderer: EngineRenderer): TextureHandle {
  return renderer.createTexture(new ImageData(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1), { filter: 'nearest' });
}
