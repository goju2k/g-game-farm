import type { GrowthGlobals, SkillData } from './balance-data.js';
import type { StatValues } from './stats.js';

/**
 * The growth formulas (doc 45 §2-3, doc 46 — D-071), kept identical to the
 * planning room's calculator (calc.js — the tests check every one against
 * it). Frames: cast frames floor to whole frames; fire-rate and reload are
 * fractional timers (46 §1).
 */

/** Damage x per skill level: +8%/level to 20, +4%/level from 21 to 30. */
export function levelDamageMul(g: GrowthGlobals, level: number): number {
  return 1 + (g.levelDamagePct / 100) * (Math.min(level, 20) - 1) + (g.levelDamagePctHigh / 100) * Math.max(0, level - 20);
}

/** Reload (or, without one, the fire interval) shortens 1%/level after the first, at most 15%. */
export function levelReloadMul(g: GrowthGlobals, level: number): number {
  return 1 - Math.min(g.levelReloadCapPct, g.levelReloadPct * (level - 1)) / 100;
}

/** Cast frames at a cast speed: floor(base x 100/(100+%)), never under half the base; 2f or less is untouched. */
export function castFrames(g: GrowthGlobals, baseF: number, castSpeedPct: number): number {
  if (baseF <= 2) return baseF;
  const min = Math.floor((baseF * g.castMinPct) / 100);
  return Math.max(min, Math.floor((baseF * 100) / (100 + castSpeedPct)));
}

/** The least cast speed % that takes one more frame off — the "next breakpoint" (undefined once at the floor: "max"). */
export function nextCastBreakpoint(g: GrowthGlobals, baseF: number, castSpeedPct: number): number | undefined {
  const now = castFrames(g, baseF, castSpeedPct);
  if (baseF <= 2 || now <= Math.floor((baseF * g.castMinPct) / 100)) return undefined;
  // floor(base*100/(100+p)) <= now-1  <=>  base*100/(100+p) < now  <=>  p > base*100/now - 100
  let p = Math.floor((baseF * 100) / now - 100);
  while (castFrames(g, baseF, p) >= now) p++;
  return p;
}

/** Frames between shots (fractional); without a magazine the level's reload cut speeds the interval instead. */
export function intervalFrames(g: GrowthGlobals, skill: SkillData, level: number, fireRatePct: number): number {
  return (skill.intervalF * (skill.reloadMode === 'none' ? levelReloadMul(g, level) : 1) * 100) / (100 + fireRatePct);
}

/** Reload frames (fractional). */
export function reloadFrames(g: GrowthGlobals, skill: SkillData, level: number, reloadSpeedPct: number): number {
  return (skill.reloadF * levelReloadMul(g, level) * 100) / (100 + reloadSpeedPct);
}

/**
 * Charges at a level, plus the items' "charges +n": a few-charge skill gets
 * +1 at level 15 and +n from items; a magazine (5+) gets 20% of its base at
 * levels 10/20/30 and +25% of its base per item point. Infinity: no magazine.
 */
export function chargesAt(g: GrowthGlobals, skill: SkillData, level: number, extra = 0): number {
  if (skill.charges <= 0) return Infinity;
  if (skill.charges < g.magazineMin) return skill.charges + g.fewChargeLevels.filter((x) => x <= level).length + extra;
  const step = Math.max(1, Math.round((skill.charges * g.multiChargeStepPct) / 100));
  const base = skill.charges + g.multiChargeLevels.filter((x) => x <= level).length * step;
  return base + Math.round(skill.charges * 0.25 * extra);
}

/** The time between two shots: the interval and the cast, whichever is longer (both from cast start — 46 §2). */
export function shotFrames(g: GrowthGlobals, skill: SkillData, level: number, stats: StatValues): number {
  return Math.max(1, intervalFrames(g, skill, level, stats.fireRate), castFrames(g, skill.castF, stats.castSpeed));
}

/** Damage "x" factors beyond the sum (evolution, a legendary's star line, weak points…) — each multiplies. */
export type DamageMultipliers = readonly number[];

/**
 * One direct hit's damage before the roll (doc 45 §2-1): base x level x
 * (1 + every +% damage summed) x each "x" factor. `boss` adds dmgBoss.
 */
export function hitDamageBase(g: GrowthGlobals, base: number, level: number, stats: StatValues, opts: { readonly boss?: boolean; readonly multipliers?: DamageMultipliers } = {}): number {
  const increase = (stats.power + stats.dmgFire + (opts.boss ? stats.dmgBoss : 0)) / 100;
  const multiplied = (opts.multipliers ?? []).reduce((a, m) => a * m, 1);
  return base * levelDamageMul(g, level) * (1 + increase) * multiplied;
}

/** The ±5% spread on every hit (D-044). */
export const DAMAGE_SPREAD = 0.05;

/**
 * The rolled hit (46 ★5): the ±5% spread, then the crit (critChance % for
 * +critDamage %), then rounded — never below 1. `random` gives [0,1): the
 * first draw is the spread, the second the crit.
 */
export function rollHit(amount: number, stats: StatValues, random: () => number): { readonly damage: number; readonly crit: boolean } {
  const spread = amount * (1 + (random() * 2 - 1) * DAMAGE_SPREAD);
  const crit = random() < stats.critChance / 100;
  const value = crit ? spread * (1 + stats.critDamage / 100) : spread;
  return { damage: Math.max(1, Math.round(value)), crit };
}

/**
 * Burn (46 ★4): the same damage per tick, more ticks with duration — a
 * whole number of ticks and then a small last one for the remainder, so the
 * total is burn x level x increase x (1 + duration), as the calculator has it.
 * Returns each tick's damage (before its own roll).
 */
export function burnTicks(totalAtBase: number, baseTicks: number, durationPct: number): number[] {
  if (totalAtBase <= 0 || baseTicks <= 0) return [];
  const perTick = totalAtBase / baseTicks;
  const ticks = baseTicks * (1 + durationPct / 100);
  const whole = Math.floor(ticks + 1e-9);
  const out = new Array<number>(whole).fill(perTick);
  const rest = ticks - whole;
  if (rest > 1e-9) out.push(perTick * rest);
  return out;
}

/** The zone's multiplier on enemy damage and health: x1.3 per tier above the first (D-063). */
export function tierMul(perTier: number, tier: number): number {
  return Math.pow(perTier, Math.max(1, tier) - 1);
}

/** The share of a hit armour takes away: armor / (armor + K), K = 100 x 1.3^(tier-1), at most 75%. */
export function armorReduction(g: GrowthGlobals, armor: number, tier: number): number {
  if (armor <= 0) return 0;
  const k = g.armorK * tierMul(g.zoneDmgMul, tier);
  return Math.min(g.armorCapPct / 100, armor / (armor + k));
}

/**
 * A hit on the player (46 ★6): armour first, then the shield takes what it
 * can, then health. Returns the new health and shield, and what each lost.
 */
export function takeHit(
  g: GrowthGlobals,
  state: { readonly hp: number; readonly shield: number },
  raw: number,
  armor: number,
  tier: number,
): { readonly hp: number; readonly shield: number; readonly absorbed: number; readonly lost: number } {
  const after = raw * (1 - armorReduction(g, armor, tier));
  const absorbed = Math.min(state.shield, after);
  const lost = after - absorbed;
  return { hp: Math.max(0, state.hp - lost), shield: state.shield - absorbed, absorbed, lost };
}

/** Max health (doc 45 §5): the form's base + flat items, then x (1 + maxHpPct). Rounded. */
export function maxHealth(formBaseHp: number, stats: StatValues): number {
  return Math.round((formBaseHp + stats.maxHp) * (1 + stats.maxHpPct / 100));
}

/** Total armour: flat x (1 + armorPct). */
export function totalArmor(stats: StatValues): number {
  return stats.armor * (1 + stats.armorPct / 100);
}
