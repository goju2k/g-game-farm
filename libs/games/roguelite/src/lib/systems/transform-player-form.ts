import { startAnimationPlayer, type EntityId, type TextureHandle, type World } from '@g-game-farm/ribs';
import { Animator, PlayerForm, SpriteRender, WallCollider } from '../components.js';
import { spritePropsForForm } from '../player/player-forms.js';
import type { RogueliteSession, PlayerFormId } from '../session.js';

/**
 * Fires once, on a scripted event (see scenario-commands.ts's
 * 'transformPlayer' handling) — not a System that runs every tick, since a
 * growth-stage swap is a one-shot action, not continuous per-frame state.
 *
 * Eagerly and explicitly writes SpriteRender's full texture/sx/sy/sWidth/
 * sHeight/width/height, Animator's clips/current/state, and WallCollider —
 * deliberately NOT relying on stepAnimatorSystem to pick up the new form
 * over subsequent ticks. stepAnimatorSystem only syncs SpriteRender when
 * the animation player's frameIndex actually changes tick to tick, which a
 * single-frame non-looping clip (or, worse, the very next tick after this
 * runs, before any frame has had a chance to advance) would never trigger —
 * see flame-clips.ts's idle clip, deliberately single-frame to make this a
 * live regression case, not just a hypothetical one.
 */
export function transformPlayerForm(
  world: World,
  playerId: EntityId,
  targetForm: PlayerFormId,
  formTextures: Readonly<Record<PlayerFormId, TextureHandle>>,
  session: RogueliteSession,
): void {
  const existingSprite = world.get(playerId, SpriteRender);
  if (!existingSprite) {
    throw new Error('transformPlayerForm: player entity has no SpriteRender');
  }

  const { sprite, clips, wallCollider } = spritePropsForForm(targetForm, formTextures);
  world.set(playerId, SpriteRender, { ...existingSprite, ...sprite });
  world.set(playerId, Animator, { clips, current: 'idle', state: startAnimationPlayer(clips.idle).state });
  world.set(playerId, WallCollider, wallCollider);
  world.set(playerId, PlayerForm, { form: targetForm });
  session.currentForm = targetForm;
}
