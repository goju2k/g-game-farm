import { defineComponent } from '@g-game-farm/ribs';
import { maxHealth, totalArmor } from './formulas.js';
import type { ComputedStats } from './stats.js';

/**
 * The player's computed stats (doc 45 §2) and what they make: max health,
 * armour, max shield. Set when the player spawns and whenever equipment or
 * points change — never per frame. Lives on the player entity.
 */
export interface PlayerStats {
  readonly stats: ComputedStats;
  readonly maxHp: number;
  readonly armor: number;
  readonly maxShield: number;
}
export const PlayerStats = defineComponent<PlayerStats>('roguelite:PlayerStats');

/** The room's tier (Part 1..8, doc 46 §7): enemy damage and health x1.3 per tier, armour's K, item tier. Singleton. */
export interface RoomTier {
  readonly tier: number;
}
export const RoomTier = defineComponent<RoomTier>('roguelite:RoomTier');

/** What a set of stats makes for a form whose base health is `formBaseHp`. */
export function playerStatsFor(formBaseHp: number, stats: ComputedStats): PlayerStats {
  return { stats, maxHp: maxHealth(formBaseHp, stats.values), armor: totalArmor(stats.values), maxShield: stats.values.shield };
}
