import type { EntityId, RenderSystem, System, TextureHandle, World } from '@g-game-farm/ribs';
import { defineComponent } from '@g-game-farm/ribs';
import { Hidden } from '../events/event-components.js';
import { Position, SpriteRender } from '../components.js';
import type { CombatData } from './combat-data.js';
import { SentinelMelee } from './combat-components.js';

/**
 * Hit feedback for sweeping crowds (D-044): damage numbers that pop up and
 * fade, and small health bars over hurt enemies. Drawn on the canvas every
 * frame (overlay layer, unlit) — not React.
 */

/** How a hit reads: plain white, a focus finisher big and yellow, burning small and orange. */
export type DamageKind = 'normal' | 'focus' | 'burn';

export interface DamageNumber {
  readonly value: number;
  readonly kind: DamageKind;
  readonly x: number;
  readonly y: number;
  readonly ageMs: number;
}
export const DamageNumber = defineComponent<DamageNumber>('roguelite:DamageNumber');

/** An enemy's bar: shown (once hit, or always), and the white trail that drains down to its health. */
export interface HpBar {
  readonly ghost: number;
  readonly holdMs: number;
}
export const HpBar = defineComponent<HpBar>('roguelite:HpBar');

/** The room's random source for damage rolls (a singleton; tests pass a fixed one). */
export interface DamageRoll {
  readonly random: () => number;
}
export const DamageRoll = defineComponent<DamageRoll>('roguelite:DamageRoll');

/** Every player hit varies by this much either way (D-044), rounded to a whole number. */
export const DAMAGE_SPREAD = 0.05;
export const DAMAGE_NUMBER_MS = 600;
const RISE_PX = 14;
/** Numbers born this close together (in space and time) fan out sideways. */
const CROWD_PX = 10;
const CROWD_MS = 250;
const SPREAD_STEP_PX = 6;
const GHOST_HOLD_MS = 250;
/** The white trail drains this share of the full bar per second. */
const GHOST_DRAIN_PER_S = 1.5;

/** A hit's damage after the ±5% roll: whole, never below 1. */
export function rollDamage(world: World, base: number): number {
  const random = [...world.query([DamageRoll] as const)][0]?.[1].random;
  const r = random ? random() : 0.5;
  return Math.max(1, Math.round(base * (1 + (r * 2 - 1) * DAMAGE_SPREAD)));
}

/** Pops a damage number at `at`, nudged sideways if others were just born there. */
export function spawnDamageNumber(world: World, value: number, kind: DamageKind, at: Readonly<{ x: number; y: number }>): void {
  let crowd = 0;
  for (const [, n] of world.query([DamageNumber] as const)) {
    if (n.ageMs < CROWD_MS && Math.abs(n.y - at.y) < CROWD_PX && Math.abs(n.x - at.x) < CROWD_PX * 2) crowd++;
  }
  // 0, +6, -6, +12, -12, ...
  const side = crowd === 0 ? 0 : (crowd % 2 === 1 ? 1 : -1) * Math.ceil(crowd / 2) * SPREAD_STEP_PX;
  world.set(world.createEntity(), DamageNumber, { value, kind, x: at.x + side, y: at.y, ageMs: 0 });
}

/** A hit landed on `id`: its bar shows (the trail holding at the health it had). */
export function revealHpBar(world: World, id: EntityId, hpBefore: number): void {
  const bar = world.get(id, HpBar);
  world.set(id, HpBar, { ghost: Math.max(bar?.ghost ?? hpBefore, hpBefore), holdMs: GHOST_HOLD_MS });
}

/** Ages the numbers and drains the bars' trails. Simulation. */
export function createDamageUiSystem(data: CombatData): System {
  const maxHp = data.enemies['sentinel-melee'].hp;
  return {
    name: 'roguelite:combat/damage-ui',
    run: (ctx) => {
      for (const [id, n] of ctx.world.query([DamageNumber] as const)) {
        const ageMs = n.ageMs + ctx.deltaMs;
        if (ageMs >= DAMAGE_NUMBER_MS) ctx.world.destroyEntity(id);
        else ctx.world.set(id, DamageNumber, { ...n, ageMs });
      }
      for (const [id, sentinel] of ctx.world.query([SentinelMelee] as const)) {
        if (sentinel.hp === undefined) continue;
        const bar = ctx.world.get(id, HpBar);
        if (!bar) {
          if (data.hpBar === 'always') ctx.world.set(id, HpBar, { ghost: sentinel.hp, holdMs: 0 });
          continue;
        }
        if (bar.holdMs > 0) {
          ctx.world.set(id, HpBar, { ...bar, holdMs: Math.max(0, bar.holdMs - ctx.deltaMs) });
          continue;
        }
        // Healed (a revive): the trail follows up at once; otherwise it drains down to the health.
        const ghost = bar.ghost <= sentinel.hp ? sentinel.hp : Math.max(sentinel.hp, bar.ghost - (maxHp * GHOST_DRAIN_PER_S * ctx.deltaMs) / 1000);
        if (ghost !== bar.ghost) ctx.world.set(id, HpBar, { ...bar, ghost });
      }
    },
  };
}

/**
 * ui-hpbar v1 / ui-digits v1 layouts (their .json, asset room #47): the bar's
 * 18x4 frame with a 16x2 inside, fill and trail strips below it; digits in
 * two rows, white with a dark outline, tinted by multiplying.
 */
const HPBAR_ART = { frame: [0, 0, 18, 4], inner: [1, 1], fill: [0, 4], ghost: [0, 6], width: 16, height: 2 } as const;
const DIGIT_ART = {
  small: { origin: [0, 0], cell: [6, 8], advance: 5 },
  big: { origin: [0, 8], cell: [8, 10], advance: 7 },
} as const;
const DIGIT_COLORS: Readonly<Record<DamageKind, readonly [number, number, number]>> = {
  normal: [1, 1, 1],
  focus: [0xfb / 255, 0xf2 / 255, 0x36 / 255],
  burn: [0xdf / 255, 0x71 / 255, 0x26 / 255],
};
/** The bar's bottom sits this far above the head (the art's own note). */
const BAR_GAP_PX = 2;

/** 3x5 pixel digits, rows top to bottom ('#' = lit) — the fallback when ui-digits isn't loaded (headless). */
const DIGITS: readonly string[][] = [
  ['###', '#.#', '#.#', '#.#', '###'],
  ['.#.', '##.', '.#.', '.#.', '###'],
  ['###', '..#', '###', '#..', '###'],
  ['###', '..#', '.##', '..#', '###'],
  ['#.#', '#.#', '###', '..#', '..#'],
  ['###', '#..', '###', '..#', '###'],
  ['###', '#..', '###', '#.#', '###'],
  ['###', '..#', '.#.', '.#.', '.#.'],
  ['###', '#.#', '###', '#.#', '###'],
  ['###', '#.#', '###', '..#', '###'],
];

type Rgba = readonly [number, number, number, number];
const STYLE: Readonly<Record<DamageKind, { readonly scale: number; readonly color: readonly [number, number, number] }>> = {
  normal: { scale: 1, color: [1, 1, 1] },
  focus: { scale: 2, color: [1, 0.86, 0.25] },
  burn: { scale: 1, color: [1, 0.55, 0.18] },
};
const OUTLINE: readonly [number, number, number] = [0.08, 0.05, 0.06];

const BAR_WIDTH = 16;
const BAR_HEIGHT = 2;
/** The bar's bottom edge, above the feet (sentinel art is about 28px tall). */
const BAR_ABOVE_FEET = 31;
const BAR_BACK: Rgba = [0.06, 0.05, 0.07, 0.85];
const BAR_GHOST: Rgba = [1, 1, 1, 0.9];
const BAR_FILL: Rgba = [0x8f / 255, 0xc6 / 255, 0xe6 / 255, 1];

/** Draws the numbers and bars on the overlay (above the lighting). A factory: needs the white-pixel texture. */
export function createRenderDamageUiSystem(
  data: CombatData,
  whitePixel: TextureHandle,
  art: { readonly hpBar?: TextureHandle; readonly digits?: TextureHandle } = {},
  layer = 'overlay',
): RenderSystem {
  const maxHp = data.enemies['sentinel-melee'].hp;
  return {
    name: 'roguelite:combat/render-damage-ui',
    run: (ctx) => {
      const rect = (x: number, y: number, width: number, height: number, tint: Rgba) =>
        ctx.renderer.submitSprite({ layer, texture: whitePixel, sx: 0, sy: 0, sWidth: 1, sHeight: 1, x, y, width, height, tint });

      const piece = (texture: TextureHandle, sx: number, sy: number, sWidth: number, sHeight: number, x: number, y: number, tint?: Rgba, scale = 1) =>
        ctx.renderer.submitSprite({ layer, texture, sx, sy, sWidth, sHeight, x, y, width: sWidth * scale, height: sHeight * scale, ...(tint ? { tint } : {}) });

      for (const [id, sentinel, position] of ctx.world.query([SentinelMelee, Position] as const)) {
        const bar = ctx.world.get(id, HpBar);
        if (!bar || sentinel.hp === undefined || sentinel.state === 'defeated' || ctx.world.get(id, Hidden)) continue;
        const share = (hp: number) => Math.max(0, Math.min(1, hp / maxHp));
        if (art.hpBar !== undefined) {
          // Over the head: the art's top is its feet minus its anchor's height.
          const sprite = ctx.world.get(id, SpriteRender);
          const head = sprite?.originY !== undefined ? position.y - sprite.originY : position.y - BAR_ABOVE_FEET;
          const [fx, fy, fw, fh] = HPBAR_ART.frame;
          const x = Math.round(position.x - fw / 2);
          const y = Math.round(head - BAR_GAP_PX - fh);
          piece(art.hpBar, fx, fy, fw, fh, x, y);
          const ix = x + HPBAR_ART.inner[0];
          const iy = y + HPBAR_ART.inner[1];
          const ghostW = Math.round(HPBAR_ART.width * share(bar.ghost));
          if (ghostW > 0) piece(art.hpBar, HPBAR_ART.ghost[0], HPBAR_ART.ghost[1], ghostW, HPBAR_ART.height, ix, iy);
          const fillW = Math.max(sentinel.hp > 0 ? 1 : 0, Math.round(HPBAR_ART.width * share(sentinel.hp)));
          if (fillW > 0) piece(art.hpBar, HPBAR_ART.fill[0], HPBAR_ART.fill[1], fillW, HPBAR_ART.height, ix, iy);
          continue;
        }
        const x = Math.round(position.x - BAR_WIDTH / 2);
        const y = Math.round(position.y - BAR_ABOVE_FEET);
        rect(x - 1, y - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2, BAR_BACK);
        const ghostW = Math.round(BAR_WIDTH * share(bar.ghost));
        if (ghostW > 0) rect(x, y, ghostW, BAR_HEIGHT, BAR_GHOST);
        const fillW = Math.max(sentinel.hp > 0 ? 1 : 0, Math.round(BAR_WIDTH * share(sentinel.hp)));
        if (fillW > 0) rect(x, y, fillW, BAR_HEIGHT, BAR_FILL);
      }

      for (const [, n] of ctx.world.query([DamageNumber] as const)) {
        const style = STYLE[n.kind];
        const t = n.ageMs / DAMAGE_NUMBER_MS;
        // Pops up fast and settles; fades over the last third.
        const rise = RISE_PX * (1 - (1 - t) * (1 - t));
        const alpha = t < 2 / 3 ? 1 : 1 - (t - 2 / 3) * 3;
        const text = String(n.value);
        if (art.digits !== undefined) {
          const sheet = n.kind === 'focus' ? DIGIT_ART.big : DIGIT_ART.small;
          const [cw, ch] = sheet.cell;
          const width = (text.length - 1) * sheet.advance + cw;
          const left = Math.round(n.x - width / 2);
          const top = Math.round(n.y - rise - ch);
          const c = DIGIT_COLORS[n.kind];
          [...text].forEach((digit, i) => {
            const k = digit.charCodeAt(0) - 48;
            if (k >= 0 && k <= 9) piece(art.digits as TextureHandle, sheet.origin[0] + k * cw, sheet.origin[1], cw, ch, left + i * sheet.advance, top, [c[0], c[1], c[2], alpha]);
          });
          continue;
        }
        const s = style.scale;
        const width = (text.length * 4 - 1) * s;
        const left = Math.round(n.x - width / 2);
        const top = Math.round(n.y - rise - 5 * s);
        // Outline first (all four sides), then the digits.
        for (const [ox, oy, color] of [
          [-1, 0, OUTLINE],
          [1, 0, OUTLINE],
          [0, -1, OUTLINE],
          [0, 1, OUTLINE],
          [0, 0, style.color],
        ] as const) {
          const tint: Rgba = [color[0], color[1], color[2], alpha];
          [...text].forEach((ch, i) => {
            const glyph = DIGITS[ch.charCodeAt(0) - 48];
            if (!glyph) return;
            glyph.forEach((row, gy) => {
              for (let gx = 0; gx < 3; gx++) if (row[gx] === '#') rect(left + (i * 4 + gx) * s + ox, top + gy * s + oy, s, s, tint);
            });
          });
        }
      }
    },
  };
}
