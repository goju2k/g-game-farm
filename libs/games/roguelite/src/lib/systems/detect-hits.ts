import { checkHit, HitDetected, type HitCandidate, type System } from '@g-game-farm/engine';
import { Hitbox, Position, Projectile } from '../components.js';
import { PROJECTILE_SIZE } from '../projectile-constants.js';

/**
 * order: 3 — after every this-tick position mutation (movePlayerSystem(0),
 * chasePlayerSystem/fireProjectilesSystem(1), moveProjectilesSystem(2)), so
 * a projectile that just moved onto a monster this tick registers the hit
 * this same tick, not next tick.
 */
export const detectHitsSystem: System = {
  name: 'roguelite:detect-hits',
  order: 3,
  run: (ctx) => {
    const targets: HitCandidate[] = [];
    for (const [id, position, hitbox] of ctx.world.query([Position, Hitbox] as const)) {
      targets.push({
        entity: id,
        box: { x: position.x + hitbox.offsetX, y: position.y + hitbox.offsetY, width: hitbox.width, height: hitbox.height },
      });
    }
    if (targets.length === 0) {
      return;
    }

    for (const [id, position] of ctx.world.query([Position, Projectile] as const)) {
      const attacker: HitCandidate = {
        entity: id,
        box: { x: position.x, y: position.y, width: PROJECTILE_SIZE, height: PROJECTILE_SIZE },
      };
      const hits = checkHit(attacker, targets);
      if (hits.length > 0) {
        ctx.events.emit(HitDetected, hits[0]); // non-penetrating: first target only, per checkHit's own documented contract
      }
    }
  },
};
