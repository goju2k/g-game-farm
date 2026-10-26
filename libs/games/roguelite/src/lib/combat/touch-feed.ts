import type { RenderSystem, SnapshotStore, TextureHandle } from '@g-game-farm/ribs';
import { Position } from '../components.js';
import { CombatPlayer, CombatStats, SentinelAwakened, SentinelMelee } from './combat-components.js';
import type { CombatData } from './combat-data.js';
import { boxAt, boxCenter } from './combat-geometry.js';
import { InputLock } from '../events/event-components.js';

/** Cooldown rings step in this many slices — React re-renders at most this often per cooldown. */
const RING_STEPS = 12;

/** What the touch controls draw from game state (low-frequency; see createTouchFeedSystem). */
export interface TouchView {
  readonly active: boolean;
  readonly form: 'ember' | 'child' | undefined;
  /** 0 = ready .. RING_STEPS = just used. */
  readonly dashRing: number;
  readonly quickRing: number;
  readonly castRing: number;
  readonly embers: number;
  readonly maxEmbers: number;
  /** Bumps on every successful parry — the UI vibrates on change. */
  readonly parrySuccesses: number;
  /** An event holds the input — the touch buttons hide (event spec §5). */
  readonly locked: boolean;
  /** The pillar is unlocked (31 §2) — its button shows. */
  readonly canCast: boolean;
}

export const EMPTY_TOUCH_VIEW: TouchView = { active: false, form: undefined, dashRing: 0, quickRing: 0, castRing: 0, embers: 0, maxEmbers: 0, parrySuccesses: 0, locked: false, canCast: false };
export const TOUCH_RING_STEPS = RING_STEPS;

/**
 * Where things are right now, for touch auto-aim — overwritten every frame,
 * read only when a spell button is released. A plain mutable object on
 * purpose: it never drives a React render. All in world units, resolved on
 * the client that draws the controls (coop principle 1).
 */
export interface TouchAimSource {
  player: { x: number; y: number; facingX: number; facingY: number } | undefined;
  enemies: { x: number; y: number }[];
  /** Set by the touch UI while a spell button is being dragged: what to preview in the world. */
  preview?: { kind: 'quick' | 'cast'; x: number; y: number } | undefined;
}

export function createTouchAimSource(): TouchAimSource {
  return { player: undefined, enemies: [] };
}

function ring(left: number, total: number): number {
  return total <= 0 || left <= 0 ? 0 : Math.ceil((left / total) * RING_STEPS);
}

export function createTouchFeedSystem(data: CombatData, store: SnapshotStore<TouchView>, aim: TouchAimSource): RenderSystem {
  let lastKey = '';
  return {
    name: 'roguelite:combat/touch-feed',
    run: (ctx) => {
      let view: TouchView = EMPTY_TOUCH_VIEW;
      aim.player = undefined;
      aim.enemies.length = 0;
      for (const [, player, position] of ctx.world.query([CombatPlayer, Position] as const)) {
        const hand = boxCenter(boxAt(position, data.playerForms[player.form].hurtbox));
        aim.player = { x: hand.x, y: hand.y, facingX: player.facingX, facingY: player.facingY };
        const spells = data.embers.enabledForms.includes(player.form);
        view = {
          active: true,
          form: player.form,
          dashRing: ring(player.dashCooldownF, data.playerForms[player.form].dash.cooldownF),
          quickRing: ring(player.quickCooldownF, data.spells.quick.cooldownF),
          castRing: ring(player.castCooldownF, data.spells.cast.cooldownF),
          embers: player.embers,
          maxEmbers: spells ? data.embers.max : 0,
          parrySuccesses: 0,
          locked: false,
          canCast: player.canCast !== false,
        };
      }
      for (const [, stats] of ctx.world.query([CombatStats] as const)) {
        view = { ...view, parrySuccesses: stats.parrySuccesses };
      }
      for (const [, lock] of ctx.world.query([InputLock] as const)) {
        view = { ...view, locked: lock.locked };
      }
      for (const [, sentinel, position] of ctx.world.query([SentinelMelee, Position] as const)) {
        if (sentinel.state !== 'dormant' && sentinel.state !== 'defeated') aim.enemies.push({ x: position.x, y: position.y });
      }
      for (const [, sentinel, position] of ctx.world.query([SentinelAwakened, Position] as const)) {
        if (sentinel.state === 'chase' || sentinel.state === 'waking') aim.enemies.push({ x: position.x, y: position.y });
      }
      const key = JSON.stringify(view);
      if (key !== lastKey) {
        lastKey = key;
        store.set(view);
      }
    },
  };
}

/**
 * Touch auto-aim (touch spec §2): the nearest enemy within `range` of the
 * player, else `fallback` px ahead in the facing direction. Pure, for tests.
 */
export function autoAim(source: TouchAimSource, range: number, fallback: number): { x: number; y: number } | undefined {
  const player = source.player;
  if (!player) return undefined;
  let best: { x: number; y: number } | undefined;
  let bestDistance = Infinity;
  for (const enemy of source.enemies) {
    const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (distance <= range && distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  if (best) return { x: best.x, y: best.y };
  const length = Math.hypot(player.facingX, player.facingY) || 1;
  return { x: player.x + (player.facingX / length) * fallback, y: player.y + (player.facingY / length) * fallback };
}

/**
 * Draws the touch drag-aim preview in the world (touch spec §2): dots along
 * the quick spell's line, or the cast spell's 20px circle where it will land.
 * Drawn on the gameplay layer so it sits exactly where the spell goes.
 */
export function createTouchAimPreviewSystem(data: CombatData, aim: TouchAimSource, whitePixel: TextureHandle): RenderSystem {
  return {
    name: 'roguelite:combat/touch-aim-preview',
    order: 5,
    run: (ctx) => {
      const preview = aim.preview;
      const player = aim.player;
      if (!preview || !player) return;
      const dot = (x: number, y: number, size: number) =>
        ctx.renderer.submitSprite({ layer: 'gameplay', texture: whitePixel, sx: 0, sy: 0, sWidth: 1, sHeight: 1, x: Math.round(x - size / 2), y: Math.round(y - size / 2), width: size, height: size, tint: [1, 1, 1, 0.8] });
      if (preview.kind === 'quick') {
        const length = Math.hypot(preview.x - player.x, preview.y - player.y);
        for (let d = 8; d < length; d += 8) dot(player.x + ((preview.x - player.x) * d) / length, player.y + ((preview.y - player.y) * d) / length, 2);
        return;
      }
      const r = data.spells.cast.radius;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        dot(preview.x + Math.cos(a) * r, preview.y + Math.sin(a) * r, 2);
      }
    },
  };
}
