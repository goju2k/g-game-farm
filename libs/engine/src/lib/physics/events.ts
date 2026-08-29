import type { EntityId } from '../ecs/entity.js';
import { defineEventType } from '../runtime/event-bus.js';
import type { AABB } from './aabb.js';

export interface HitEvent {
  readonly attacker: EntityId;
  readonly target: EntityId;
  readonly overlap: AABB;
}

export const HitDetected = defineEventType<HitEvent>('engine:physics/hit-detected');
