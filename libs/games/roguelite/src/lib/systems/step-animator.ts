import type { System } from '@g-game-farm/ribs';
import { spriteAnimationSource, stepAnimationPlayer } from '@g-game-farm/ribs';
import { Animator, SpriteRender } from '../components.js';

/**
 * Advances every Animator's playback by ctx.deltaMs and syncs SpriteRender's
 * source rect from the current frame. Reusable — queries [Animator,
 * SpriteRender] generically, not player-specific, so a future monster with
 * its own Animator gets animated by this same system for free.
 *
 * order: 1 so this runs AFTER movePlayerSystem (default order 0) within
 * the simulation phase — mirrors fixed-camera.ts's own order:-1 comment
 * about render-phase sequencing. If movePlayerSystem just switched an
 * entity onto a fresh clip this tick (Animator.state reset to frame 0 /
 * elapsedInFrameMs 0 via startAnimationPlayer), that switch still needs
 * its share of *this* tick's deltaMs applied on top, same as every other
 * tick — running before movePlayerSystem would apply this tick's deltaMs
 * to the *previous* clip's state right before it's discarded, silently
 * dropping a frame's worth of playback the exact tick a switch happens.
 */
export const stepAnimatorSystem: System = {
  name: 'roguelite:step-animator',
  order: 1,
  run: (ctx) => {
    for (const [id, animator, sprite] of ctx.world.query([Animator, SpriteRender] as const)) {
      const clip = animator.clips[animator.current];
      const result = stepAnimationPlayer(animator.state, clip, ctx.deltaMs);

      if (result.state === animator.state) {
        continue; // deltaMs <= 0 or clip already finished — true no-op, per stepAnimationPlayer's own contract
      }
      ctx.world.set(id, Animator, { ...animator, state: result.state });

      if (result.state.frameIndex !== animator.state.frameIndex) {
        // Only touches texture/sx/sy/sWidth/sHeight — must NOT clobber
        // flipX/layer/width/height, which movePlayerSystem / boot-scene
        // setup own. spriteAnimationSource() also re-asserts `texture`,
        // harmlessly, since it's the same handle already on SpriteRender.
        ctx.world.set(id, SpriteRender, { ...sprite, ...spriteAnimationSource(clip, result.state.frameIndex) });
      }
    }
  },
};
