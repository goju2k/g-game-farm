import type { SpriteAnimation, TextureHandle } from '@g-game-farm/ribs';
import { PLAYER_FRAME_SIZE } from './player-constants.js';

/**
 * Builds the player's idle/run clips from the loaded player texture. A
 * factory (not module-level constants) because it needs an actual
 * TextureHandle, only available after the app's texture load — same
 * reason registerRoguelite() already takes `textures` as a parameter.
 * Returns a plain Record (not a named {idle,run} shape) so the result
 * assigns directly into Animator.clips (Record<string, SpriteAnimation>)
 * without a cast — a named interface without an index signature isn't
 * structurally assignable to a Record<string, ...> field.
 *
 * Frame data ported verbatim from the old pre-engine repo: Player.ts's
 * tileNo cycling (idle = tileNo 1..10, 150ms each, loop; run = tileNo
 * 11..14, 120ms each, loop) combined with Sprite.ts's 1-based, row-major,
 * 10-cols/row frame numbering (frame N -> row=floor((N-1)/10),
 * col=(N-1)%10 -> pixel offset (col*18, row*18)). Idle's 10 frames are
 * all row 0 (old tileNo 1..10 -> col 0..9); run's 4 frames are all row 1
 * (old tileNo 11..14 -> col 0..3).
 */
export function createPlayerClips(texture: TextureHandle): Record<string, SpriteAnimation> {
  const idle: SpriteAnimation = {
    name: 'roguelite:player-idle',
    texture,
    loop: true,
    frames: Array.from({ length: 10 }, (_, col) => ({
      sx: col * PLAYER_FRAME_SIZE,
      sy: 0,
      sWidth: PLAYER_FRAME_SIZE,
      sHeight: PLAYER_FRAME_SIZE,
      durationMs: 150,
    })),
  };

  const run: SpriteAnimation = {
    name: 'roguelite:player-run',
    texture,
    loop: true,
    frames: Array.from({ length: 4 }, (_, col) => ({
      sx: col * PLAYER_FRAME_SIZE,
      sy: PLAYER_FRAME_SIZE,
      sWidth: PLAYER_FRAME_SIZE,
      sHeight: PLAYER_FRAME_SIZE,
      durationMs: 120,
    })),
  };

  return { idle, run };
}
