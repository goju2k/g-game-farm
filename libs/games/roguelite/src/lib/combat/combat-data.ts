import type { ComboData } from '../rules/combo.js';

/**
 * Combat numbers (combat spec v1) — loaded from public/game/data/combat.json
 * so tuning never needs a rebuild (data-driven principle). Units: f = one
 * 60Hz simulation step, px = world units. Validation is strict and lists
 * every problem at once: a typo in a tuning file should fail at load, not
 * as a silently wrong parry window.
 */

export type PlayerFormKey = 'ember' | 'child';

export interface BoxOffset {
  /** Relative to Position (the character's foot/anchor point). */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
}

export interface DashData {
  readonly distance: number;
  readonly chargeF: number;
  readonly travelF: number;
  readonly recoverF: number;
  readonly cooldownF: number;
  readonly travelInvulnerable: boolean;
  readonly travelPassEnemies: boolean;
}

export interface PlayerFormData {
  /** px per second. */
  readonly moveSpeed: number;
  readonly dash: DashData;
  readonly hurtbox: BoxOffset;
  readonly wallCollider: BoxOffset;
}

export interface ParryData {
  readonly startupF: number;
  readonly activeF: number;
  readonly whiffRecoveryF: number;
  readonly hitstopF: number;
  readonly shakePx: number;
  readonly shakeF: number;
  readonly pushPx: number;
}

export interface EmbersData {
  readonly max: number;
  readonly onParry: number;
  readonly onHit: number;
  readonly regenPerSec: number;
  readonly enabledForms: readonly PlayerFormKey[];
}

export interface SentinelMeleeData {
  readonly hp: number;
  /** px per second. */
  readonly moveSpeed: number;
  readonly attackRange: number;
  readonly windupF: number;
  /** The last cueF frames of the windup flash white — "parry now". */
  readonly cueF: number;
  readonly activeF: number;
  readonly recoveryF: number;
  /** From the end of one attack's active frames to the next windup. */
  readonly intervalF: number;
  readonly parryStunF: number;
  readonly damage: number;
  /** Reserved (v1 always true). */
  readonly parryable: boolean;
  /** Reserved (v1 unused). */
  readonly reflectable: boolean;
  readonly body: { readonly width: number; readonly height: number };
  /** In front of the body along the attack direction: `width` across, `depth` along. */
  readonly attackBox: { readonly width: number; readonly depth: number };
}

/** Spec §8-1: looks like remains until woken, then chases; contact only, can't be parried. */
export interface SentinelAwakenedData {
  readonly wakeRange: number;
  readonly wakeF: number;
  /** px per second. */
  readonly moveSpeed: number;
  /** Farther than this from the player and it walks home to sleep again. */
  readonly giveUpRange: number;
  readonly body: { readonly width: number; readonly height: number };
  /** The contact box, centered on the body. */
  readonly hitbox: { readonly width: number; readonly height: number };
  readonly parryable: boolean;
}

/** Spec §9 Part 0 zone tuning. */
export interface ZonesData {
  readonly zone6: {
    readonly windupF: number;
    readonly cueF: number;
    readonly parriesToStop: number;
    /** From this attempt on (1 = first try), the cue grows by assistStepF per attempt, up to assistMaxCueF — unannounced help. */
    readonly assistFromAttempt: number;
    readonly assistStepF: number;
    readonly assistMaxCueF: number;
  };
  readonly zone7: { readonly parriesToStop: number; readonly startDelaysF: readonly number[] };
}

/** Spec §7, Act 2+: health, post-hit invulnerability, knockback. */
export interface ChildHealthData {
  readonly maxHp: number;
  readonly invulnerableF: number;
  readonly knockbackPx: number;
}

/** Spec §5 quick spell (placeholder name "불꽃탄"): a straight projectile, castable while moving. */
export interface QuickSpellData {
  /** px per second. */
  readonly speed: number;
  readonly range: number;
  readonly damage: number;
  /** Also the auto-fire interval while held (D-025). */
  readonly cooldownF: number;
  /** Projectile size, px. */
  readonly size: number;
  /** From the trigger to the projectile leaving the hand (the fire clip's fire:release), f. At least 1. */
  readonly windupF: number;
}

/** One pillar art's steps and light (combat.json pillarArt). */
export interface PillarArt {
  readonly light: { readonly radius: number; readonly offsetY: number };
  readonly steps: readonly { readonly clip: string; readonly ms?: number; readonly light?: number }[];
}

/** Spec §5 cast spell (placeholder name "불기둥"): a cast you can walk through (D-042), then an instant circle at the aim point fixed at its start. */
export interface CastSpellData {
  readonly castDelayF: number;
  /** Move speed while casting, as a share of the form's (D-042: 1 = no slowdown). Every pillar cast, the combo's included. */
  readonly castMovement: number;
  /** Embers spent to skip the delay (when the player has them). */
  readonly emberCost: number;
  readonly damage: number;
  readonly radius: number;
  readonly cooldownF: number;
  /** The aim point is pulled in to at most this far from the player. */
  readonly maxAimRange: number;
  /** How long the graybox pillar effect shows. */
  readonly effectF: number;
}

/** Skill combos (27_skill-combo-v1 §3, D-031): the grammar's numbers (rules/combo.ts) and the moves' own. */
export interface ComboMovesData extends ComboData {
  /** Link R: the quick pillar. */
  readonly linkPillar: { readonly castDelayF: number; readonly radius: number; readonly damage: number };
  /** Finisher L: the fire fan — count shots spread over spreadDeg in total, each its damage. */
  readonly finishFan: { readonly count: number; readonly spreadDeg: number; readonly damage: number };
  /** Finisher R: the big pillar; it sets its target burning (damage every intervalF, ticks times). An ember skips the cast. */
  readonly finishPillar: { readonly castDelayF: number; readonly radius: number; readonly damage: number; readonly burn: { readonly damage: number; readonly ticks: number; readonly intervalF: number } };
  /** Same last two presses: the finisher hits harder and bigger. */
  readonly focus: { readonly damageMul: number; readonly sizeMul: number };
  /** Different last two presses: an automatic short dash right after the finisher — invulnerable, no dash cooldown. */
  readonly switchDash: { readonly distance: number; readonly travelF: number };
  /** Every press alternating (Lv3+): the switch dash plus embers. */
  readonly rhythm: { readonly embers: number };
}

export interface CombatData {
  readonly inputBufferF: number;
  readonly playerForms: Readonly<Record<PlayerFormKey, PlayerFormData>>;
  readonly parry: ParryData;
  readonly embers: EmbersData;
  readonly act1Respawn: { readonly fadeOutF: number; readonly fadeInF: number };
  readonly enemies: { readonly 'sentinel-melee': SentinelMeleeData; readonly 'sentinel-awakened': SentinelAwakenedData };
  readonly zones: ZonesData;
  readonly childHealth: ChildHealthData;
  readonly spells: { readonly quick: QuickSpellData; readonly cast: CastSpellData };
  readonly combo: ComboMovesData;
  /** The child form's warm hand light (spec §5: grows while casting). */
  readonly handFlame: { readonly radius: number; readonly castingRadius: number };
  /**
   * The pillars' art (D-043) — pure show, apart from the hit: clip steps (a
   * looping one needs ms) with light levels, and each art's warm light.
   */
  readonly pillarArt: { readonly cast: PillarArt; readonly quick: PillarArt; readonly big: PillarArt };
  /** The casting test room revives a defeated sentinel after this many frames. */
  readonly castLab: { readonly sentinelReviveF: number };
  /**
   * Per-device adjustments (touch spec §4) — empty by default, i.e. touch
   * plays on the keyboard numbers. Only the input-feel fields can change.
   */
  readonly inputOverrides?: { readonly touch?: DeviceOverrides };
}

export interface DeviceOverrides {
  readonly inputBufferF?: number;
  readonly parry?: Partial<Pick<ParryData, 'startupF' | 'activeF' | 'whiffRecoveryF'>>;
}

/** The data as a given device plays it: inputOverrides applied on top (touch spec §4). */
export function combatDataForDevice(data: CombatData, touch: boolean): CombatData {
  const overrides = touch ? data.inputOverrides?.touch : undefined;
  if (!overrides || Object.keys(overrides).length === 0) return data;
  return { ...data, inputBufferF: overrides.inputBufferF ?? data.inputBufferF, parry: { ...data.parry, ...overrides.parry } };
}

type Shape = 'num' | 'int' | 'bool' | 'formList' | 'intList' | 'intRecord' | 'fxSteps' | { readonly [key: string]: Shape };

const PILLAR_ART: Shape = { light: { radius: 'num', offsetY: 'num' }, steps: 'fxSteps' };

const BOX: Shape = { offsetX: 'num', offsetY: 'num', width: 'int', height: 'int' };
const FORM: Shape = {
  moveSpeed: 'num',
  dash: { distance: 'num', chargeF: 'int', travelF: 'int', recoverF: 'int', cooldownF: 'int', travelInvulnerable: 'bool', travelPassEnemies: 'bool' },
  hurtbox: BOX,
  wallCollider: BOX,
};
const SCHEMA: Shape = {
  inputBufferF: 'int',
  playerForms: { ember: FORM, child: FORM },
  parry: { startupF: 'int', activeF: 'int', whiffRecoveryF: 'int', hitstopF: 'int', shakePx: 'num', shakeF: 'int', pushPx: 'num' },
  embers: { max: 'int', onParry: 'int', onHit: 'int', regenPerSec: 'num', enabledForms: 'formList' },
  act1Respawn: { fadeOutF: 'int', fadeInF: 'int' },
  enemies: {
    'sentinel-melee': {
      hp: 'int',
      moveSpeed: 'num',
      attackRange: 'num',
      windupF: 'int',
      cueF: 'int',
      activeF: 'int',
      recoveryF: 'int',
      intervalF: 'int',
      parryStunF: 'int',
      damage: 'int',
      parryable: 'bool',
      reflectable: 'bool',
      body: { width: 'int', height: 'int' },
      attackBox: { width: 'int', depth: 'int' },
    },
    'sentinel-awakened': {
      wakeRange: 'num',
      wakeF: 'int',
      moveSpeed: 'num',
      giveUpRange: 'num',
      body: { width: 'int', height: 'int' },
      hitbox: { width: 'int', height: 'int' },
      parryable: 'bool',
    },
  },
  childHealth: { maxHp: 'int', invulnerableF: 'int', knockbackPx: 'num' },
  spells: {
    quick: { speed: 'num', range: 'num', damage: 'int', cooldownF: 'int', size: 'int', windupF: 'int' },
    cast: { castDelayF: 'int', castMovement: 'num', emberCost: 'int', damage: 'int', radius: 'num', cooldownF: 'int', maxAimRange: 'num', effectF: 'int' },
  },
  combo: {
    levels: 'intRecord',
    windowF: 'int',
    rhythmFromLevel: 'int',
    linkPillar: { castDelayF: 'int', radius: 'num', damage: 'num' },
    finishFan: { count: 'int', spreadDeg: 'num', damage: 'num' },
    finishPillar: { castDelayF: 'int', radius: 'num', damage: 'num', burn: { damage: 'num', ticks: 'int', intervalF: 'int' } },
    focus: { damageMul: 'num', sizeMul: 'num' },
    switchDash: { distance: 'num', travelF: 'int' },
    rhythm: { embers: 'int' },
  },
  handFlame: { radius: 'num', castingRadius: 'num' },
  castLab: { sentinelReviveF: 'int' },
  pillarArt: { cast: PILLAR_ART, quick: PILLAR_ART, big: PILLAR_ART },
  zones: {
    zone6: { windupF: 'int', cueF: 'int', parriesToStop: 'int', assistFromAttempt: 'int', assistStepF: 'int', assistMaxCueF: 'int' },
    zone7: { parriesToStop: 'int', startDelaysF: 'intList' },
  },
};

/** Signed fields — everything else must be >= 0 (counts, sizes, speeds). */
const MAY_BE_NEGATIVE = new Set(['offsetX', 'offsetY', 'onHit']);

function check(value: unknown, shape: Shape, path: string, key: string, errors: string[]): void {
  if (shape === 'bool') {
    if (typeof value !== 'boolean') errors.push(`${path}: boolean`);
    return;
  }
  if (shape === 'num' || shape === 'int') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${path}: number`);
    } else if (shape === 'int' && !Number.isInteger(value)) {
      errors.push(`${path}: integer`);
    } else if (value < 0 && !MAY_BE_NEGATIVE.has(key)) {
      errors.push(`${path}: must be >= 0`);
    }
    return;
  }
  if (shape === 'intRecord') {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.values(value).some((v) => !Number.isInteger(v) || (v as number) < 0)) errors.push(`${path}: { name: non-negative integer }`);
    return;
  }
  if (shape === 'intList') {
    if (!Array.isArray(value) || value.some((v) => !Number.isInteger(v) || v < 0)) errors.push(`${path}: list of non-negative integers`);
    return;
  }
  if (shape === 'fxSteps') {
    const bad = (s: unknown) => {
      const step = s as { clip?: unknown; ms?: unknown; light?: unknown };
      return typeof s !== 'object' || s === null || typeof step.clip !== 'string' || (step.ms !== undefined && (typeof step.ms !== 'number' || step.ms <= 0)) || (step.light !== undefined && (typeof step.light !== 'number' || step.light < 0 || step.light > 1));
    };
    if (!Array.isArray(value) || value.length === 0 || value.some(bad)) errors.push(`${path}: list of { "clip", "ms"? > 0, "light"? 0..1 }`);
    return;
  }
  if (shape === 'formList') {
    if (!Array.isArray(value) || value.some((v) => v !== 'ember' && v !== 'child')) errors.push(`${path}: list of "ember"/"child"`);
    return;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push(`${path}: object`);
    return;
  }
  for (const [childKey, childShape] of Object.entries(shape)) {
    check((value as Record<string, unknown>)[childKey], childShape, path ? `${path}.${childKey}` : childKey, childKey, errors);
  }
}

/** Validates untrusted JSON as CombatData; throws one error listing every problem. Unknown extra keys (comments, future fields) are allowed. */
export function parseCombatData(json: unknown, label: string): CombatData {
  const errors: string[] = [];
  check(json, SCHEMA, '', '', errors);
  if (errors.length === 0) {
    const data = json as CombatData;
    if (data.enemies['sentinel-melee'].cueF > data.enemies['sentinel-melee'].windupF) errors.push('enemies.sentinel-melee.cueF: must be <= windupF');
    if (data.enemies['sentinel-melee'].intervalF < data.enemies['sentinel-melee'].recoveryF) errors.push('enemies.sentinel-melee.intervalF: must be >= recoveryF');
    if (data.spells.quick.windupF < 1) errors.push('spells.quick.windupF: must be >= 1 (the shot leaves the hand at the end of the windup)');
  }
  if (errors.length > 0) {
    throw new Error(`${label}: invalid combat data\n  - ${errors.join('\n  - ')}`);
  }
  return json as CombatData;
}

/** Where the game serves combat.json from, relative to its asset base. */
export const COMBAT_DATA_PATH = 'data/combat.json';

export async function loadCombatData(assetBaseUrl: string): Promise<CombatData> {
  const url = assetBaseUrl + COMBAT_DATA_PATH;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return parseCombatData(await response.json(), url);
}
