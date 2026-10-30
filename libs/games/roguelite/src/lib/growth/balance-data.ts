import { BALANCE_JSON } from './balance.generated.js';

/**
 * balance.json — the planning room's balance numbers (D-073), synced in
 * from their calculator (`npm run sync-balance`) as balance.generated.ts. Skills, the growth globals
 * (level, armour, zone tables), and the calculator's own scenarios (kept
 * for the record; the game doesn't read them).
 */

export type ReloadMode = 'all' | 'one' | 'none';

/** One skill at level 1 (doc 45 §1-1). Damage is in the x10 scale; times are frames at 60fps. */
export interface SkillData {
  readonly id: string;
  readonly name: string;
  readonly range: number;
  readonly damage: number;
  /** Added burn damage (spread over its ticks). */
  readonly burn: number;
  /** 0 = no magazine (held skills). */
  readonly charges: number;
  readonly reloadMode: ReloadMode;
  readonly reloadF: number;
  readonly intervalF: number;
  readonly castF: number;
  readonly projectiles: number;
  readonly radius: number;
  /** Area % applies to it. */
  readonly aoe: boolean;
  /** Projectile +n and speed apply to it. */
  readonly projectile: boolean;
  /** Normal-grade enemies die in one hit (flame lance). */
  readonly instakillNormal: boolean;
  /** The alternative to instakill: damage x this against normal grade (data only for now). */
  readonly normalDmgMul?: number;
  readonly summon?: { readonly durationF: number; readonly shotF: number; readonly maxActive: number; readonly deployF?: number };
}

export interface GrowthGlobals {
  readonly fps: number;
  readonly levelDamagePct: number;
  readonly levelDamagePctHigh: number;
  readonly levelReloadPct: number;
  readonly levelReloadCapPct: number;
  readonly multiChargeLevels: readonly number[];
  readonly multiChargeStepPct: number;
  readonly fewChargeLevels: readonly number[];
  readonly magazineMin: number;
  readonly castMinPct: number;
  readonly baseHp: number;
  readonly armorK: number;
  readonly armorCapPct: number;
  readonly zoneDmgMul: number;
  readonly zoneHpMul: number;
  readonly iframesF: number;
  readonly shieldParryPct: number;
  readonly fullRestF: number;
}

export interface BalanceData {
  readonly version: number;
  readonly globals: GrowthGlobals;
  readonly skills: readonly SkillData[];
}

const NUMBER_GLOBALS = [
  'fps',
  'levelDamagePct',
  'levelDamagePctHigh',
  'levelReloadPct',
  'levelReloadCapPct',
  'multiChargeStepPct',
  'magazineMin',
  'castMinPct',
  'baseHp',
  'armorK',
  'armorCapPct',
  'zoneDmgMul',
  'zoneHpMul',
  'iframesF',
  'shieldParryPct',
  'fullRestF',
] as const;
const NUMBER_SKILL = ['range', 'damage', 'burn', 'charges', 'reloadF', 'intervalF', 'castF', 'projectiles', 'radius'] as const;

/** Validates untrusted JSON as BalanceData; throws one error listing every problem. Extra keys are allowed. */
export function parseBalanceData(json: unknown, label: string): BalanceData {
  const errors: string[] = [];
  const data = json as { globals?: Record<string, unknown>; skills?: unknown[]; version?: unknown };
  if (!data || typeof data !== 'object' || !data.globals || !Array.isArray(data.skills)) {
    throw new Error(`${label}: expected { globals, skills: [...] }`);
  }
  for (const key of NUMBER_GLOBALS) if (typeof data.globals[key] !== 'number') errors.push(`globals.${key}: number`);
  for (const key of ['multiChargeLevels', 'fewChargeLevels'] as const) {
    const v = data.globals[key];
    if (!Array.isArray(v) || v.some((n) => !Number.isInteger(n))) errors.push(`globals.${key}: list of integers`);
  }
  data.skills.forEach((raw, i) => {
    const s = raw as Record<string, unknown>;
    const at = `skills[${i}]${typeof s?.['id'] === 'string' ? ` (${s['id']})` : ''}`;
    if (typeof s?.['id'] !== 'string') errors.push(`${at}.id: string`);
    for (const key of NUMBER_SKILL) if (typeof s?.[key] !== 'number' || (s[key] as number) < 0) errors.push(`${at}.${key}: number >= 0`);
    if (!['all', 'one', 'none'].includes(s?.['reloadMode'] as string)) errors.push(`${at}.reloadMode: "all" | "one" | "none"`);
  });
  if (errors.length > 0) throw new Error(`${label}: invalid balance data\n  - ${errors.join('\n  - ')}`);
  return { ...(json as BalanceData), version: typeof data.version === 'number' ? data.version : 0 };
}

export function skillById(data: BalanceData, id: string): SkillData {
  const skill = data.skills.find((s) => s.id === id);
  if (!skill) throw new Error(`balance.json: no skill "${id}"`);
  return skill;
}

/** The game's balance (the generated copy of the planning room's balance.json), checked once at load. */
export const BALANCE: BalanceData = parseBalanceData(BALANCE_JSON, 'balance.generated.ts');
