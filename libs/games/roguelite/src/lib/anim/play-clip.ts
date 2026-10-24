import { spriteAnimationSource, startAnimationPlayer, type EntityId, type SpriteAnimation, type World } from '@g-game-farm/ribs';
import { Animator, SpriteRender } from '../components.js';

/** A fresh Animator playing `current` from frame 0, with frame 0's tags still to fire (see Animator.startPending). */
export function startAnimator(clips: Readonly<Record<string, SpriteAnimation>>, current: string): Animator {
  const clip = clips[current];
  if (!clip) {
    throw new Error(`startAnimator: no clip "${current}" (have: ${Object.keys(clips).join(', ')})`);
  }
  return { clips, current, state: startAnimationPlayer(clip).state, startPending: true };
}

/**
 * Switches an entity onto `clipName` (restarting it if it's already the
 * current clip) and syncs SpriteRender to frame 0 right away — the step
 * animator only writes SpriteRender when frameIndex changes, so a switch
 * that's still on frame 0 after this tick would otherwise keep showing the
 * previous clip's frame.
 */
export function playClip(world: World, id: EntityId, clipName: string): void {
  const animator = world.get(id, Animator);
  if (!animator) {
    throw new Error(`playClip: entity ${id} has no Animator`);
  }
  const next = startAnimator(animator.clips, clipName);
  world.set(id, Animator, next);
  const sprite = world.get(id, SpriteRender);
  if (sprite) {
    world.set(id, SpriteRender, { ...sprite, ...spriteAnimationSource(next.clips[clipName], 0) });
  }
}
