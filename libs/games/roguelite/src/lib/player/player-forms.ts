import { spriteAnimationSource, type SpriteAnimation, type SpriteDraw, type TextureHandle } from '@g-game-farm/ribs';
import type { WallCollider } from '../components.js';
import type { PlayerFormId } from '../session.js';
import { createFlameClips } from './flame-clips.js';
import { createPlayerClips } from './player-clips.js';
import { FLAME_FRAME_SIZE, FLAME_WALL_COLLIDER, PLAYER_FRAME_SIZE, PLAYER_WALL_COLLIDER } from './player-constants.js';

export interface PlayerFormDefinition {
  readonly frameSize: number;
  readonly wallCollider: WallCollider;
  readonly createClips: (texture: TextureHandle) => Record<string, SpriteAnimation>;
}

export const PLAYER_FORMS: Readonly<Record<PlayerFormId, PlayerFormDefinition>> = {
  mage: { frameSize: PLAYER_FRAME_SIZE, wallCollider: PLAYER_WALL_COLLIDER, createClips: createPlayerClips },
  flame: { frameSize: FLAME_FRAME_SIZE, wallCollider: FLAME_WALL_COLLIDER, createClips: createFlameClips },
};

/**
 * The single place that knows how to fully materialize a growth-stage
 * form — used identically by rooms/create-room-scene.ts's initial spawn AND
 * systems/transform-player-form.ts's mid-game swap, so the two paths can
 * never drift apart (one defines "what a form looks like," the other two
 * only ever apply it).
 */
export function spritePropsForForm(
  formId: PlayerFormId,
  formTextures: Readonly<Record<PlayerFormId, TextureHandle>>,
): {
  readonly sprite: Pick<SpriteDraw, 'texture' | 'sx' | 'sy' | 'sWidth' | 'sHeight' | 'width' | 'height'>;
  readonly clips: Record<string, SpriteAnimation>;
  readonly wallCollider: WallCollider;
} {
  const definition = PLAYER_FORMS[formId];
  const clips = definition.createClips(formTextures[formId]);
  const frame0 = spriteAnimationSource(clips.idle, 0);
  return {
    sprite: { ...frame0, width: definition.frameSize, height: definition.frameSize },
    clips,
    wallCollider: definition.wallCollider,
  };
}
