import type { System } from '@g-game-farm/ribs';
import { Chaser, PlayerControlled, Position, SpriteRender } from '../components.js';

/**
 * Moves every Chaser entity toward the PlayerControlled entity's current
 * Position. Ported from the old pre-engine repo's MeleeMonster/ActionMove:
 * CHASE_ENEMY re-targets the player's live position every tick, then moves
 * speed*dt toward it, clamped to not overshoot. flipX is recomputed fresh
 * every tick from the direction to the player (dx > 0) — NOT sticky, unlike
 * movePlayerSystem's flipX, matching the old ActionMove.next() setting
 * `flipX = moveDirectionH` unconditionally every call.
 *
 * order: 1, same numeric value as stepAnimatorSystem — both need to run
 * after movePlayerSystem (default order 0) for correctness (this system:
 * chase this tick's player position, not last tick's; stepAnimatorSystem:
 * apply this tick's deltaMs to whichever clip is active *after* any switch).
 * The tie between this system and stepAnimatorSystem doesn't matter: this
 * system only ever writes Position and SpriteRender.flipX; stepAnimatorSystem
 * only ever writes Animator.state and SpriteRender.{texture,sx,sy,sWidth,
 * sHeight} (spriteAnimationSource never returns flipX) — disjoint fields,
 * so their relative order is a genuine no-op either way.
 */
export const chasePlayerSystem: System = {
  name: 'roguelite:chase-player',
  order: 1,
  run: (ctx) => {
    let playerX: number | undefined;
    let playerY: number | undefined;
    for (const [, position] of ctx.world.query([Position, PlayerControlled] as const)) {
      playerX = position.x;
      playerY = position.y;
      break; // exactly one PlayerControlled entity today
    }
    if (playerX === undefined || playerY === undefined) {
      return; // defensive — boot scene always spawns a player today
    }

    const deltaSeconds = ctx.deltaMs / 1000;
    for (const [id, position, chaser, sprite] of ctx.world.query([Position, Chaser, SpriteRender] as const)) {
      const dx = playerX - position.x;
      const dy = playerY - position.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 0) {
        const step = Math.min(chaser.speed * deltaSeconds, distance);
        const nx = position.x + (dx / distance) * step;
        const ny = position.y + (dy / distance) * step;
        ctx.world.set(id, Position, { x: nx, y: ny });
      }

      const flipX = dx > 0;
      if (flipX !== sprite.flipX) {
        ctx.world.set(id, SpriteRender, { ...sprite, flipX });
      }
    }
  },
};
