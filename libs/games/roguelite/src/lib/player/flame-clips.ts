import type { SpriteAnimation, TextureHandle } from '@g-game-farm/ribs';
import { FLAME_FRAME_SIZE } from './player-constants.js';

/**
 * The flame spirit's clips — deliberately minimal since the texture itself
 * is a synthetic placeholder (see flame-spirit-placeholder-texture.ts, two
 * FLAME_FRAME_SIZE-square frames side by side), not real authored art.
 *
 * `idle` is a single-frame LOOPING clip on purpose: this is the exact shape
 * that would silently never update SpriteRender if a form-swap ever
 * regressed to relying on stepAnimatorSystem's frame-index-diff gate
 * instead of eagerly writing SpriteRender itself (see player-forms.ts's
 * spritePropsForForm and systems/transform-player-form.ts) — so this clip
 * doubles as a live regression case, not just a shortcut. `run` alternates
 * between the placeholder texture's two frames so movePlayerSystem's
 * existing `animator.clips[desiredClip]` idle/run lookup keeps working
 * unmodified for this form, with a genuinely visible flicker.
 */
export function createFlameClips(texture: TextureHandle): Record<string, SpriteAnimation> {
  const idle: SpriteAnimation = {
    name: 'roguelite:flame-idle',
    texture,
    loop: true,
    frames: [{ sx: 0, sy: 0, sWidth: FLAME_FRAME_SIZE, sHeight: FLAME_FRAME_SIZE, durationMs: 300 }],
  };

  const run: SpriteAnimation = {
    name: 'roguelite:flame-run',
    texture,
    loop: true,
    frames: [
      { sx: 0, sy: 0, sWidth: FLAME_FRAME_SIZE, sHeight: FLAME_FRAME_SIZE, durationMs: 90 },
      { sx: FLAME_FRAME_SIZE, sy: 0, sWidth: FLAME_FRAME_SIZE, sHeight: FLAME_FRAME_SIZE, durationMs: 90 },
    ],
  };

  return { idle, run };
}
