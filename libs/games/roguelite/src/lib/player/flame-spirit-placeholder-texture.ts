import type { EngineRenderer, TextureHandle } from '@g-game-farm/ribs';
import { FLAME_FRAME_SIZE } from './player-constants.js';

/**
 * A synthetic placeholder for the flame spirit's sprite sheet — no real art
 * exists yet, so this follows createWhitePixelTexture's exact idiom
 * (synthetic ImageData, no PNG file, no ROGUELITE_ASSET_MANIFEST entry, no
 * asset-pipeline dependency). Two side-by-side FLAME_FRAME_SIZE-square
 * frames (a wider/brighter core vs. a narrower one) so flame-clips.ts's
 * `run` clip has two genuinely distinct frames to alternate between, not
 * just two identical ones — real art replaces this whole function later;
 * every consumer only ever sees a TextureHandle.
 */
export function createFlameSpiritPlaceholderTexture(renderer: EngineRenderer): TextureHandle {
  const size = FLAME_FRAME_SIZE;
  const width = size * 2;
  const pixels = new Uint8ClampedArray(width * size * 4);
  const center = (size - 1) / 2;

  for (let frame = 0; frame < 2; frame++) {
    const coreRadius = frame === 0 ? 0.4 : 0.3;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = frame * size + x;
        const i = (y * width + px) * 4;
        const dist = Math.hypot(x - center, y - center) / (size / 2);
        if (dist > 1) continue; // stays transparent (buffer is zero-initialized)
        const [r, g, b] = dist < coreRadius ? [255, 240, 180] : dist < 0.75 ? [255, 150, 40] : [200, 40, 20];
        pixels[i] = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
        pixels[i + 3] = 255;
      }
    }
  }

  return renderer.createTexture(new ImageData(pixels, width, size), { filter: 'nearest' });
}
