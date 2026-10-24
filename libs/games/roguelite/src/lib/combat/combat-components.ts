import { defineComponent } from '@g-game-farm/ribs';
import type { PlayerFormKey } from './combat-data.js';
import type { InputBuffer } from './intent.js';

/** What the combat player is doing. `framesLeft` counts down one per simulation step (= 1f). */
export type PlayerAction =
  | { readonly kind: 'free' }
  | { readonly kind: 'dash'; readonly phase: 'charge' | 'travel' | 'recover'; readonly framesLeft: number; readonly dirX: number; readonly dirY: number }
  | { readonly kind: 'parry'; readonly phase: 'startup' | 'active' | 'recovery'; readonly framesLeft: number }
  /** Rooted while the cast spell's delay runs; the aim was fixed when it started (spec §5). A hit cancels it. */
  | { readonly kind: 'casting'; readonly framesLeft: number; readonly aimX: number; readonly aimY: number }
  /** Act 1 soft restart in progress (spec §7): no control until it finishes. */
  | { readonly kind: 'respawning' };

/**
 * The player under combat-spec rules (dash/parry/input buffer). Replaces the
 * legacy demo's movement for this entity — movePlayerSystem skips anything
 * with this component. Position is the foot point (SpriteRender origin).
 */
export interface CombatPlayer {
  readonly form: PlayerFormKey;
  readonly action: PlayerAction;
  readonly dashCooldownF: number;
  readonly buffer: InputBuffer | undefined;
  /** Last non-zero move direction — a dash with no direction held goes this way. */
  readonly facingX: number;
  readonly facingY: number;
  /** Act 2+ only (child form): current health. Undefined for the ember (Act 1 has no health). */
  readonly hp?: number;
  /** Post-hit invulnerability left (child form). */
  readonly invulnerableF: number;
  /** Parry-earned resource (spec §4), 0..max. Always 0 for the ember. */
  readonly embers: number;
  readonly quickCooldownF: number;
  readonly castCooldownF: number;
}
export const CombatPlayer = defineComponent<CombatPlayer>('roguelite:CombatPlayer');

export type SentinelState = 'approach' | 'windup' | 'active' | 'recovery' | 'wait' | 'stunned' | 'dormant' | 'defeated';

/**
 * A melee sentinel (spec §8-2). Position is the body center. The attack
 * direction is locked at windup start (4-way). Per-instance overrides cover
 * zone tuning (Zone 6's slower windup, parries-to-stop counts).
 */
export interface SentinelMelee {
  readonly state: SentinelState;
  readonly framesLeft: number;
  readonly dirX: number;
  readonly dirY: number;
  /** The current active window already hit or was parried. */
  readonly attackSpent: boolean;
  readonly home: Readonly<{ x: number; y: number }>;
  readonly parriesTaken: number;
  /** Parries until it stops for good (Zone 6: 1, Zone 7: 2). Undefined = never. */
  readonly parriesToStop?: number;
  readonly windupF?: number;
  readonly cueF?: number;
  /**
   * Zone 6's unannounced help (spec §9): on each soft restart from attempt
   * `fromAttempt` on, the cue grows by `stepF` (from `baseCueF`) up to `maxCueF`.
   */
  readonly assist?: { readonly baseCueF: number; readonly fromAttempt: number; readonly stepF: number; readonly maxCueF: number };
  /** Health against spells (casting test room). Undefined = can't be damaged (Act 1 zones stop it by parry instead). */
  readonly hp?: number;
  /** When defeated, come back at home with full health after this many frames (test room). Undefined = stays down. */
  readonly reviveF?: number;
}
export const SentinelMelee = defineComponent<SentinelMelee>('roguelite:SentinelMelee');

/**
 * An awakened sentinel (spec §8-1): asleep like remains until the player
 * comes within wakeRange, wakes over wakeF, chases; gives up past
 * giveUpRange and walks home to sleep. Contact hurts; it can't be parried.
 * Position is the body center.
 */
export interface SentinelAwakened {
  readonly state: 'asleep' | 'waking' | 'chase' | 'return';
  readonly framesLeft: number;
  readonly home: Readonly<{ x: number; y: number }>;
}
export const SentinelAwakened = defineComponent<SentinelAwakened>('roguelite:SentinelAwakened');

/**
 * Global freeze after a successful parry (spec §3). Set `framesLeft` to
 * start one; hitStopClockSystem (input phase, first in every step) turns it
 * into `frozen` for exactly that many following steps, during which combat
 * timers and animation don't advance. Singleton.
 */
export interface HitStop {
  readonly framesLeft: number;
  readonly frozen: boolean;
}
export const HitStop = defineComponent<HitStop>('roguelite:HitStop');

/** Camera shake, read by the camera system. Singleton. */
export interface ScreenShake {
  readonly framesLeft: number;
  readonly px: number;
}
export const ScreenShake = defineComponent<ScreenShake>('roguelite:ScreenShake');

/** Where an Act 1 soft restart puts the player back (spec §7: the stretch's entrance). Singleton per room. */
export interface CombatCheckpoint {
  readonly x: number;
  readonly y: number;
}
export const CombatCheckpoint = defineComponent<CombatCheckpoint>('roguelite:CombatCheckpoint');

/** The screen fade of a soft restart: out to black, teleport at the bottom, back in. Singleton while running. */
export interface ScreenFade {
  readonly phase: 'out' | 'in';
  readonly framesLeft: number;
  readonly totalF: number;
}
export const ScreenFade = defineComponent<ScreenFade>('roguelite:ScreenFade');

/** A short-lived parry spark for the graybox — an expanding square ring at x,y. */
export interface ParrySpark {
  readonly x: number;
  readonly y: number;
  readonly framesLeft: number;
  readonly totalF: number;
}
export const ParrySpark = defineComponent<ParrySpark>('roguelite:ParrySpark');

/** Quick-spell projectile: moves vx/vy px per step until it hits a sentinel or a wall, or runs out of range. */
export interface SpellProjectile {
  readonly vx: number;
  readonly vy: number;
  readonly remainingPx: number;
  readonly damage: number;
  readonly size: number;
}
export const SpellProjectile = defineComponent<SpellProjectile>('roguelite:SpellProjectile');

/** The cast spell's pillar — damage is applied when it appears; this only lingers for the graybox visual. */
export interface SpellBurst {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly framesLeft: number;
  readonly totalF: number;
}
export const SpellBurst = defineComponent<SpellBurst>('roguelite:SpellBurst');

/** Playtest counters (spec §11), shown by the debug HUD. Singleton per room. */
export interface CombatStats {
  readonly parryAttempts: number;
  readonly parrySuccesses: number;
  readonly hitsTaken: number;
  readonly dashes: number;
  /** Cast spells started / of those with an ember spent (§11 #5) / started while a sentinel was parry-stunned (§11 #3) / cancelled by a hit. */
  readonly castsStarted: number;
  readonly castsWithEmber: number;
  readonly castsAfterParry: number;
  readonly castsCancelled: number;
}
export const CombatStats = defineComponent<CombatStats>('roguelite:CombatStats');

export const COMBAT_COMPONENTS = [CombatPlayer, SentinelMelee, SentinelAwakened, SpellProjectile, SpellBurst, HitStop, ScreenShake, CombatCheckpoint, ScreenFade, ParrySpark, CombatStats] as const;
