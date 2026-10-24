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

export interface CombatData {
  readonly inputBufferF: number;
  readonly playerForms: Readonly<Record<PlayerFormKey, PlayerFormData>>;
  readonly parry: ParryData;
  readonly embers: EmbersData;
  readonly act1Respawn: { readonly fadeOutF: number; readonly fadeInF: number };
  readonly enemies: { readonly 'sentinel-melee': SentinelMeleeData };
}

type Shape = 'num' | 'int' | 'bool' | 'formList' | { readonly [key: string]: Shape };

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
