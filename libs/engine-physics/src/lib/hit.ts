import type { EntityId } from '@g-game-farm/engine-ecs';
import { intersection, type AABB } from './aabb.js';
import type { HitEvent } from './events.js';

export interface HitCandidate {
  readonly entity: EntityId;
  readonly box: AABB;
}

/**
 * Pure geometry judgement — always returns every target whose box overlaps
 * attacker's box, in `targets` order. Doesn't know about penetration,
 * factions, or self-filtering: a caller wanting "first hit only" takes
 * result[0]; excluding the attacker itself or same-faction targets from
 * `targets` is the caller's job before calling this.
 */
export function checkHit(attacker: HitCandidate, targets: readonly HitCandidate[]): readonly HitEvent[] {
  const hits: HitEvent[] = [];
  for (const target of targets) {
    const overlap = intersection(attacker.box, target.box);
    if (overlap) {
      hits.push({ attacker: attacker.entity, target: target.entity, overlap });
    }
  }
  return hits;
}
