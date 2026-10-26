import type { EntityId, System, World } from '@g-game-farm/ribs';
import { overlaps } from '@g-game-farm/ribs';
import { Position } from '../components.js';
import { Burning, ParrySpark, SentinelMelee, SpellBurst, SpellProjectile, type PillarShot } from './combat-components.js';
import { SpriteRender, Animator } from '../components.js';
import { startAnimator } from '../anim/play-clip.js';
import { HitFlash, type FxStep } from '../fx/fx-components.js';
import { fxAsset, spawnFx, spriteFor } from '../fx/fx.js';

/** The whole-body white flash on a hit (asset room's recommendation: render-side, fits every frame). */
const HIT_FLASH_F = 2;
import type { CombatData, PillarArt } from './combat-data.js';
import { isHitStopped, movePoint, normalize, sentinelBody } from './combat-geometry.js';
import { igniteArea } from '../world/world-systems.js';

/** Spec §5 spells (Phase 1 test-room prototypes): the quick projectile and the cast pillar. */

const STEPS_PER_SECOND = 60;
/** A shot's impact ring lifetime, f. */
const IMPACT_F = 8;
/** How long the fire pillar burns between rising and fading. */

/** Damages a sentinel that has health; at 0 it's defeated (and revives later in the test room). Flashes it and sparks at `at`. */
export function damageSentinel(world: World, id: EntityId, sentinel: SentinelMelee, amount: number, at?: Readonly<{ x: number; y: number }>): void {
  if (sentinel.hp === undefined || sentinel.state === 'defeated') return;
  world.set(id, HitFlash, { framesLeft: HIT_FLASH_F });
  if (at) spawnFx(world, 'fx-hit', at, [{ clip: 'hit' }], { aboveActors: true });
  const hp = sentinel.hp - amount;
  world.set(id, SentinelMelee, hp > 0 ? { ...sentinel, hp } : { ...sentinel, hp: 0, state: 'defeated', framesLeft: sentinel.reviveF ?? 0, attackSpent: true });
}

/** Fires the quick spell from `from` toward `aim` (spec §5: 180px/s straight, 128px range); `angle` turns it off the aim (the fan), `scale` grows it (focus). */
export function fireQuickSpell(
  world: World,
  from: Readonly<{ x: number; y: number }>,
  aim: Readonly<{ x: number; y: number }>,
  data: CombatData,
  shot: { readonly damage?: number; readonly angle?: number; readonly scale?: number; readonly impactScale?: number; readonly fanBlast?: boolean } = {},
): void {
  const spell = data.spells.quick;
  const aimed = normalize(aim.x - from.x, aim.y - from.y);
  if (aimed.x === 0 && aimed.y === 0) return;
  const turn = shot.angle ?? 0;
  const dir = { x: aimed.x * Math.cos(turn) - aimed.y * Math.sin(turn), y: aimed.x * Math.sin(turn) + aimed.y * Math.cos(turn) };
  const scale = shot.scale ?? 1;
  const speed = spell.speed / STEPS_PER_SECOND;
  const projectile = world.createEntity();
  world.set(projectile, Position, { x: from.x, y: from.y });
  world.set(projectile, SpellProjectile, {
    vx: dir.x * speed,
    vy: dir.y * speed,
    remainingPx: spell.range,
    damage: shot.damage ?? spell.damage,
    size: Math.round(spell.size * scale),
    ...(shot.impactScale !== undefined ? { impactScale: shot.impactScale } : {}),
    ...(shot.fanBlast ? { fanBlast: true } : {}),
  });
  const art = fxAsset(world, 'fx-fireball');
  if (art?.clips['projectile']) {
    // Drawn flying right (tail left); spun to the flight direction around its anchor (the ball's center).
    world.set(projectile, SpriteRender, spriteFor(art, 'projectile', { rotation: Math.atan2(dir.y, dir.x), scale }));
    world.set(projectile, Animator, startAnimator(art.clips, 'projectile'));
  }
}

/** Focus (27_skill-combo §3) shows as a ring over the finisher and a little bigger art (asset room: 1.2x). */
const FOCUS_ART_SCALE = 1.2;

/**
 * The combo's L finisher: count shots fanned over spreadDeg around the aim,
 * each bursting in the fan's blast on impact; a muzzle flash at the hand
 * (27_skill-combo §3, fx-fire-fan).
 */
export function fireFan(world: World, from: Readonly<{ x: number; y: number }>, aim: Readonly<{ x: number; y: number }>, data: CombatData, focus: boolean): void {
  const fan = data.combo.finishFan;
  const damage = fan.damage * (focus ? data.combo.focus.damageMul : 1);
  const scale = focus ? data.combo.focus.sizeMul : 1;
  const spread = (fan.spreadDeg * Math.PI) / 180;
  const rotation = Math.atan2(aim.y - from.y, aim.x - from.x);
  const artScale = focus ? FOCUS_ART_SCALE : 1;
  spawnFx(world, 'fx-fire-fan', from, [{ clip: 'muzzle' }], { rotation, scale: artScale, aboveActors: true });
  if (focus) spawnFx(world, 'fx-focus', from, [{ clip: 'ring' }]);
  for (let i = 0; i < fan.count; i++) {
    const angle = fan.count === 1 ? 0 : -spread / 2 + (spread * i) / (fan.count - 1);
    fireQuickSpell(world, from, aim, data, { damage, angle, scale, impactScale: artScale, fanBlast: true });
  }
}

/** The cast spell's aim point, pulled in to maxAimRange from the caster (spec §5: no off-screen sniping). */
export function clampCastAim(from: Readonly<{ x: number; y: number }>, aim: Readonly<{ x: number; y: number }>, data: CombatData): { x: number; y: number } {
  const dx = aim.x - from.x;
  const dy = aim.y - from.y;
  const distance = Math.hypot(dx, dy);
  const max = data.spells.cast.maxAimRange;
  return distance <= max ? { x: aim.x, y: aim.y } : { x: from.x + (dx / distance) * max, y: from.y + (dy / distance) * max };
}

/** The plain cast spell's pillar (no combo). */
export function castSpellShot(data: CombatData): PillarShot {
  return { radius: data.spells.cast.radius, damage: data.spells.cast.damage };
}

/**
 * Releases a pillar at `at` (the cast spell's by default): every damageable
 * sentinel whose body the circle touches takes its damage (and catches fire
 * for a burning shot), and the pillar shows — its art scaled to the radius.
 */
export function fireCastSpell(world: World, at: Readonly<{ x: number; y: number }>, data: CombatData, shot: PillarShot = castSpellShot(data)): void {
  igniteArea(world, at, shot.radius, shot.art === 'big');
  const stats = data.enemies['sentinel-melee'];
  for (const [id, sentinel, position] of world.query([SentinelMelee, Position] as const)) {
    const body = sentinelBody(position, stats);
    const nearestX = Math.max(body.x, Math.min(at.x, body.x + body.width));
    const nearestY = Math.max(body.y, Math.min(at.y, body.y + body.height));
    if (Math.hypot(at.x - nearestX, at.y - nearestY) <= shot.radius) {
      damageSentinel(world, id, sentinel, shot.damage, { x: nearestX, y: nearestY });
      if (shot.burn && world.get(id, SentinelMelee)?.state !== 'defeated') world.set(id, Burning, { ...shot.burn, ticksLeft: shot.burn.ticks, nextF: shot.burn.intervalF });
    }
  }
  // The pillar art: the combo's quick burst or big pillar (smouldering while its target burns), else the cast spell's.
  // Focus: its ring over the pillar and the art a little bigger. The graybox disc only without art.
  const focus = shot.finish === 'focus';
  // The art outlasts the hit (D-043): it plays its steps through, with a warm wavering light that dies down with it.
  const show = (id: string, art: PillarArt, scale: number, extra: readonly FxStep[] = []) =>
    spawnFx(world, id, at, [...art.steps, ...extra], { scale, light: { radius: art.light.radius * scale, offsetY: art.light.offsetY * scale } });
  let pillar: EntityId | undefined;
  if (shot.art === 'quick') {
    pillar = show('fx-fire-pillar-quick', data.pillarArt.quick, 1);
  } else if (shot.art === 'big') {
    // While its target burns, the pillar smoulders on (when the art has it).
    const smolderMs = shot.burn ? (shot.burn.ticks * shot.burn.intervalF * 1000) / STEPS_PER_SECOND : 0;
    pillar = show('fx-fire-pillar-big', data.pillarArt.big, focus ? FOCUS_ART_SCALE : 1, smolderMs > 0 ? [{ clip: 'smolder', ms: smolderMs, light: 0 }] : []);
  }
  if (pillar === undefined) pillar = show('fx-fire-pillar', data.pillarArt.cast, shot.radius / data.spells.cast.radius);
  if (focus) spawnFx(world, 'fx-focus', at, [{ clip: 'ring' }]);
  const effectF = data.spells.cast.effectF;
  if (pillar === undefined) world.set(world.createEntity(), SpellBurst, { x: at.x, y: at.y, radius: shot.radius, framesLeft: effectF, totalF: effectF });
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
            damageSentinel(ctx.world, sentinelId, sentinel, projectile.damage, { x: moved.x, y: moved.y });
            spent = true;
          }
        }
        const remainingPx = projectile.remainingPx - Math.hypot(projectile.vx, projectile.vy);
        if (spent || remainingPx <= 0) {
          if (spent) {
            const rotation = Math.atan2(projectile.vy, projectile.vx);
            const scaled = projectile.impactScale !== undefined ? { scale: projectile.impactScale } : {};
            const burst = projectile.fanBlast ? spawnFx(ctx.world, 'fx-fire-fan', moved, [{ clip: 'blast' }], { ...scaled, aboveActors: true }) : undefined;
            if (burst === undefined && spawnFx(ctx.world, 'fx-fireball', moved, [{ clip: 'impact' }], { rotation, ...scaled, aboveActors: true }) === undefined) {
              ctx.world.set(ctx.world.createEntity(), ParrySpark, { x: moved.x, y: moved.y, framesLeft: IMPACT_F, totalF: IMPACT_F, radius: 5, tone: 'fire' });
            }
          }
          ctx.world.destroyEntity(id);
        } else {
          ctx.world.set(id, Position, { x: moved.x, y: moved.y });
          ctx.world.set(id, SpellProjectile, { ...projectile, remainingPx });
        }
      }
      // Burning sentinels (the big pillar): a small hit every interval.
      for (const [id, burning, sentinel, position] of ctx.world.query([Burning, SentinelMelee, Position] as const)) {
        if (sentinel.state === 'defeated') {
          ctx.world.remove(id, Burning);
          continue;
        }
        if (burning.nextF > 1) {
          ctx.world.set(id, Burning, { ...burning, nextF: burning.nextF - 1 });
          continue;
        }
        damageSentinel(ctx.world, id, sentinel, burning.damage, { x: position.x, y: position.y - 4 });
        if (burning.ticksLeft <= 1) ctx.world.remove(id, Burning);
        else ctx.world.set(id, Burning, { ...burning, ticksLeft: burning.ticksLeft - 1, nextF: burning.intervalF });
      }
      for (const [id, burst] of ctx.world.query([SpellBurst] as const)) {
        if (burst.framesLeft <= 1) ctx.world.destroyEntity(id);
        else ctx.world.set(id, SpellBurst, { ...burst, framesLeft: burst.framesLeft - 1 });
      }
    },
  };
}
