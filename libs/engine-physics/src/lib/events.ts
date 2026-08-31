import type { EntityId } from '@g-game-farm/engine-ecs';
import { defineEventType } from '@g-game-farm/engine-events';
import type { AABB } from './aabb.js';

export interface HitEvent {
  readonly attacker: EntityId;
  readonly target: EntityId;
  readonly overlap: AABB;
}

export const HitDetected = defineEventType<HitEvent>('engine:physics/hit-detected');
