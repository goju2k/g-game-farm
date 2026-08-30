import type { System, TextureHandle } from '@g-game-farm/ribs';
import { computeCameraPose, ROGUELITE_CANVAS_SIZE, screenToWorld } from '../camera.js';
import { AttackCooldown, Position, Projectile, SpriteRender } from '../components.js';
import {
  PROJECTILE_DAMAGE,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_SIZE,
  PROJECTILE_SPEED,
  PROJECTILE_TINT,
} from '../player/projectile-constants.js';

const GAMEPLAY_LAYER = 'gameplay';

/**
 * A factory (not a plain const) because it needs a real TextureHandle for
 * the synthetic white-pixel projectile sprite — same reason
 * player-clips.ts/monster-clips.ts are factories.
 *
 * order: 1 — same tier as chasePlayerSystem/stepAnimatorSystem. Only ever
 * CREATES a new entity (never mutates an existing one's components), and a
 * fresh projectile has neither Chaser nor Animator, so it can't spuriously
 * match either sibling system's query regardless of tie-break order within
 * this tier.
 */
export function createFireProjectilesSystem(whitePixelTexture: TextureHandle): System {
  return {
    name: 'roguelite:fire-projectiles',
    order: 1,
    run: (ctx) => {
      for (const [id, position, cooldown, sprite] of ctx.world.query([Position, AttackCooldown, SpriteRender] as const)) {
        const remainingMs = cooldown.remainingMs - ctx.deltaMs;
        const mousePosition = ctx.input.mouse.position;
        const held = ctx.input.mouse.buttons.held.has('left');

        let fired = false;
        if (remainingMs <= 0 && held && mousePosition !== undefined) {
          const playerCenterX = position.x + sprite.width / 2;
          const playerCenterY = position.y + sprite.height / 2;
          const camera = computeCameraPose(position, sprite.width / 2, sprite.height / 2);
          const target = screenToWorld(mousePosition.x, mousePosition.y, camera, ROGUELITE_CANVAS_SIZE);
          const dx = target.x - playerCenterX;
          const dy = target.y - playerCenterY;
          const distance = Math.hypot(dx, dy);

          if (distance > 0) {
            const projectile = ctx.world.createEntity();
            ctx.world.set(projectile, Position, {
              x: playerCenterX - PROJECTILE_SIZE / 2,
              y: playerCenterY - PROJECTILE_SIZE / 2,
            });
            ctx.world.set(projectile, Projectile, {
              velocityX: (dx / distance) * PROJECTILE_SPEED,
              velocityY: (dy / distance) * PROJECTILE_SPEED,
              damage: PROJECTILE_DAMAGE,
              remainingLifetimeMs: PROJECTILE_LIFETIME_MS,
            });
            ctx.world.set(projectile, SpriteRender, {
              texture: whitePixelTexture,
              layer: GAMEPLAY_LAYER,
              sx: 0,
              sy: 0,
              sWidth: 1,
              sHeight: 1,
              width: PROJECTILE_SIZE,
              height: PROJECTILE_SIZE,
              tint: PROJECTILE_TINT,
            });
            fired = true;
          }
        }

        ctx.world.set(id, AttackCooldown, {
          remainingMs: fired ? cooldown.intervalMs : remainingMs,
          intervalMs: cooldown.intervalMs,
        });
      }
    },
  };
}
