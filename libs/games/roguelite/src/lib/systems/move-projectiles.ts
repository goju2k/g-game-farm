import type { System } from '@g-game-farm/ribs';
import { Position, Projectile } from '../components.js';

/**
 * order: 2 — after fireProjectilesSystem(1), so a projectile spawned THIS
 * tick still advances this same tick rather than sitting frozen for one
 * tick (matching how monsters/animations already behave when spawned).
 */
export const moveProjectilesSystem: System = {
  name: 'roguelite:move-projectiles',
  order: 2,
  run: (ctx) => {
    const deltaSeconds = ctx.deltaMs / 1000;
    for (const [id, position, projectile] of ctx.world.query([Position, Projectile] as const)) {
      const remainingLifetimeMs = projectile.remainingLifetimeMs - ctx.deltaMs;
      if (remainingLifetimeMs <= 0) {
        ctx.world.destroyEntity(id);
        continue;
      }
      ctx.world.set(id, Position, {
        x: position.x + projectile.velocityX * deltaSeconds,
        y: position.y + projectile.velocityY * deltaSeconds,
      });
      ctx.world.set(id, Projectile, { ...projectile, remainingLifetimeMs });
    }
  },
};
