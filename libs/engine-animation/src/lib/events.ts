import type { EntityId } from '@g-game-farm/engine-ecs';
import { defineEventType } from '@g-game-farm/engine-events';

export interface AnimationFrameTagEvent {
  readonly entity: EntityId;
  /** SpriteAnimation.name of the clip that was playing — lets a listener without a clip reference know which animation a tag came from. */
  readonly clip: string;
  readonly frameIndex: number;
  readonly tags: readonly string[];
  /** True when a looping clip wrapped back to frame 0 (not the clip's start) — a listener can act once per play. */
  readonly wrapped?: boolean;
}

export const AnimationFrameTag = defineEventType<AnimationFrameTagEvent>('engine:animation/frame-tag');
