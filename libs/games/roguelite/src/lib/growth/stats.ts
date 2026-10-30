/**
 * Computed stats (doc 45 §2, D-073): base + items (+ their tier) + skill
 * levels — temperament is on hold. Recomputed only when equipment or points
 * change, never per frame; combat reads the result.
 *
 * Same stat id adds up. Each item option has a cap on the items' total
 * (doc 40 §2): the items' sum is clipped before the base is added.
 */

/** Every stat id (doc 37 §5, doc 45 §2). Percent stats are in %, counts in whole units. */
export const STAT_IDS = [
  // attack (%)
  'power',
  'dmgFire',
  'dmgIce',
  'dmgGravity',
  'dmgShadow',
  'dmgBoss',
  'critChance',
  'critDamage',
  // attack shape
  'area',
  'projectiles',
  'projSpeed',
  'range',
  'pierce',
  // speed (%)
  'castSpeed',
  'fireRate',
  'reloadSpeed',
  // magazine
  'charges',
  // status (%)
  'duration',
  'statusChance',
  // movement
  'moveSpeed',
  'dashCooldown',
  'dashCharges',
  // survival
  'maxHp',
  'maxHpPct',
  'armor',
  'armorPct',
  'shield',
  'iframes',
  'onKillHeal',
  'castDmgTaken',
  // parry, embers
  'parryWindow',
  'emberMax',
  'emberGain',
  // gathering
  'pickupRange',
  'dropRate',
  'rareChance',
  // summons
  'summonCount',
] as const;

export type StatId = (typeof STAT_IDS)[number];
export type StatValues = Readonly<Record<StatId, number>>;

/** Where stats come from: a source's flat stats and its skill-level bonuses (`skillLevel.<skill id>` / `skillLevel.fire`). */
export interface StatSource {
  readonly stats?: Partial<Record<StatId, number>>;
  readonly skillLevels?: Readonly<Record<string, number>>;
}

export interface ComputedStats {
  readonly values: StatValues;
  /** Item-given skill levels by skill id, plus an element key ("fire") for "all fire skills". */
  readonly skillLevelBonus: Readonly<Record<string, number>>;
}

/** The player's own base stats before anything: crit 5% for +50% (D-063). */
export const BASE_STATS: Partial<Record<StatId, number>> = { critChance: 5, critDamage: 50 };

function zero(): Record<StatId, number> {
  return Object.fromEntries(STAT_IDS.map((id) => [id, 0])) as Record<StatId, number>;
}

/**
 * Base + items (the items' total of each stat clipped to `itemCaps`) +
 * other sources (skill levels, later temperament) — summed by id.
 */
export function computeStats(input: {
  readonly base?: Partial<Record<StatId, number>>;
  readonly items?: readonly StatSource[];
  readonly itemCaps?: Partial<Record<StatId, number>>;
  readonly other?: readonly StatSource[];
}): ComputedStats {
  const items = zero();
  const skillLevelBonus: Record<string, number> = {};
  const addLevels = (source: StatSource) => {
    for (const [skill, n] of Object.entries(source.skillLevels ?? {})) skillLevelBonus[skill] = (skillLevelBonus[skill] ?? 0) + n;
  };
  for (const item of input.items ?? []) {
    for (const [id, v] of Object.entries(item.stats ?? {})) items[id as StatId] += v ?? 0;
    addLevels(item);
  }
  for (const [id, cap] of Object.entries(input.itemCaps ?? {})) {
    if (cap !== undefined) items[id as StatId] = Math.min(items[id as StatId], cap);
  }
  const values = zero();
  for (const id of STAT_IDS) values[id] = (input.base?.[id] ?? BASE_STATS[id] ?? 0) + items[id];
  for (const source of input.other ?? []) {
    for (const [id, v] of Object.entries(source.stats ?? {})) values[id as StatId] += v ?? 0;
    addLevels(source);
  }
  return { values, skillLevelBonus };
}

/** A skill's real level (doc 45 §3-3): picked (max 20) + its own and its element's item bonus, capped at 30. */
export function realSkillLevel(picked: number, stats: ComputedStats, skillId: string, element = 'fire'): number {
  const bonus = (stats.skillLevelBonus[skillId] ?? 0) + (stats.skillLevelBonus[element] ?? 0);
  return Math.max(1, Math.min(30, Math.min(20, picked) + bonus));
}
