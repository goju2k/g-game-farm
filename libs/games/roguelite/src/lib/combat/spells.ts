import type { EntityId, System, World } from '@g-game-farm/ribs';
import { overlaps } from '@g-game-farm/ribs';
import { Position } from '../components.js';
import { SentinelMelee, SpellBurst, SpellProjectile } from './combat-components.js';
import type { CombatData } from './combat-data.js';
import { isHitStopped, movePoint, normalize, sentinelBody } from './combat-geometry.js';

/** Spec §5 spells (Phase 1 test-room prototypes): the quick projectile and the cast pillar. */

const STEPS_PER_SECOND = 60;

/** Damages a sentinel that has health; at 0 it's defeated (and revives later in the test room). */
export function damageSentinel(world: World, id: EntityId, sentinel: SentinelMelee, amount: number): void {
  if (sentinel.hp === undefined || sentinel.state === 'defeated') return;
  const hp = sentinel.hp - amount;
  world.set(id, SentinelMelee, hp > 0 ? { ...sentinel, hp } : { ...sentinel, hp: 0, state: 'defeated', framesLeft: sentinel.reviveF ?? 0, attackSpent: true });
}

/** Fires the quick spell from `from` toward `aim` (spec §5: 180px/s straight, 128px range). */
export function fireQuickSpell(world: World, from: Readonly<{ x: number; y: number }>, aim: Readonly<{ x: number; y: number }>, data: CombatData): void {
  const spell = data.spells.quick;
  const dir = normalize(aim.x - from.x, aim.y - from.y);
  if (dir.x === 0 && dir.y === 0) return;
  const speed = spell.speed / STEPS_PER_SECOND;
  const projectile = world.createEntity();
  world.set(projectile, Position, { x: from.x, y: from.y });
  world.set(projectile, SpellProjectile, { vx: dir.x * speed, vy: dir.y * speed, remainingPx: spell.range, damage: spell.damage, size: spell.size });
}

/** The cast spell's aim point, pulled in to maxAimRange from the caster (spec §5: no off-screen sniping). */
export function clampCastAim(from: Readonly<{ x: number; y: number }>, aim: Readonly<{ x: number; y: number }>, data: CombatData): { x: number; y: number } {
  const dx = aim.x - from.x;
  const dy = aim.y - from.y;
  const distance = Math.hypot(dx, dy);
  const max = data.spells.cast.maxAimRange;
  return distance <= max ? { x: aim.x, y: aim.y } : { x: from.x + (dx / distance) * max, y: from.y + (dy / distance) * max };
}

/** Releases the cast spell at `at`: every damageable sentinel whose body the circle touches takes its damage, and the pillar shows briefly. */
export function fireCastSpell(world: World, at: Readonly<{ x: number; y: number }>, data: CombatData): void {
  const spell = data.spells.cast;
  const stats = data.enemies['sentinel-melee'];
  for (const [id, sentinel, position] of world.query([SentinelMelee, Position] as const)) {
    const body = sentinelBody(position, stats);
    const nearestX = Math.max(body.x, Math.min(at.x, body.x + body.width));
    const nearestY = Math.max(body.y, Math.min(at.y, body.y + body.height));
    if (Math.hypot(at.x - nearestX, at.y - nearestY) <= spell.radius) {
      damageSentinel(world, id, sentinel, spell.damage);
    }
  }
  world.set(world.createEntity(), SpellBurst, { x: at.x, y: at.y, radius: spell.radius, framesLeft: spell.effectF, totalF: spell.effectF });
}

/** Moves quick-spell projectiles; each stops at the first wall or damageable sentinel, or when its range runs out. */
export function createSpellProjectileSystem(data: CombatData): System {
  const stats = data.enemies['sentinel-melee'];
  return {
    name: 'roguelite:combat/spell-projectiles',
    order: 0.7,
    run: (ctx) => {
      if (isHitStopped(ctx.world)) return;
      for (const [id, projectile, position] of ctx.world.query([SpellProjectile, Position] as const)) {
        const half = projectile.size / 2;
        const moved = movePoint(ctx.world, position, { offsetX: -half, offsetY: -half, width: projectile.size, height: projectile.size }, projectile.vx, projectile.vy);
        const box = { x: moved.x - half, y: moved.y - half, width: projectile.size, height: projectile.size };
        let spent = moved.blocked;
        for (const [sentinelId, sentinel, sentinelPos] of ctx.world.query([SentinelMelee, Position] as const)) {
          if (spent || sentinel.hp === undefined || sentinel.state === 'defeated') continue;
          if (overlaps(box, sentinelBody(sentinelPos, stats))) {
            damageSentinel(ctx.world, sentinelId, sentinel, projectile.damage);
            spent = true;
          }
        }
        const remainingPx = projectile.remainingPx - Math.hypot(projectile.vx, projectile.vy);
        if (spent || remainingPx <= 0) {
          ctx.world.destroyEntity(id);
        } else {
          ctx.world.set(id, Position, { x: moved.x, y: moved.y });
          ctx.world.set(id, SpellProjectile, { ...projectile, remainingPx });
        }
      }
      for (const [id, burst] of ctx.world.query([SpellBurst] as const)) {
        if (burst.framesLeft <= 1) ctx.world.destroyEntity(id);
        else ctx.world.set(id, SpellBurst, { ...burst, framesLeft: burst.framesLeft - 1 });
      }
    },
  };
}
