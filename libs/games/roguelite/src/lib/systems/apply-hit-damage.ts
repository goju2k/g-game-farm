import { HitDetected, type System } from '@g-game-farm/ribs';
import { Life, Projectile } from '../components.js';

/**
 * postSimulation — reads HitDetected emitted by detectHitsSystem earlier
 * THIS tick (TickEventBus clears at the START of the next fixed step, not
 * the end — see runtime/event-bus.ts).
 */
export const applyHitDamageSystem: System = {
  name: 'roguelite:apply-hit-damage',
  run: (ctx) => {
    for (const hit of ctx.events.read(HitDetected)) {
      const projectile = ctx.world.get(hit.attacker, Projectile);
      if (projectile === undefined) {
        continue; // defensive — unreachable today (each projectile yields at most one HitEvent per tick)
      }
      // Consumed on its one registered hit — independent of whether the
      // target below is still around by the time this runs (two projectiles
      // can hit the same target in one tick; both must still be destroyed).
      ctx.world.destroyEntity(hit.attacker);

      const life = ctx.world.get(hit.target, Life);
      if (life === undefined) {
        continue; // target already destroyed by an earlier HitEvent processed earlier in this same loop
      }
      const remaining = life.current - projectile.damage;
      if (remaining <= 0) {
        ctx.world.destroyEntity(hit.target);
      } else {
        ctx.world.set(hit.target, Life, { current: remaining });
      }
    }
  },
};
