/** Old pre-engine repo's Particle.ts constructor defaults + Player.ts's spawn call. */
export const PROJECTILE_SIZE = 2;
/** World units/sec. */
export const PROJECTILE_SPEED = 150;
export const PROJECTILE_DAMAGE = 20;
/** No explicit lifetime existed in the old game (see step 5 plan) — flat timer stand-in. */
export const PROJECTILE_LIFETIME_MS = 1000;
/** Old Player.ts's tileNo-cycling basic attack fires once per ~50ms while held (10ms + 40ms threshold sum) — reimplemented as a plain cooldown, not ported verbatim (see step 5 plan). */
export const ATTACK_INTERVAL_MS = 50;
/** CSS 'lightblue' (173,216,230), normalized — the old game's flat fillRect2d color, reproduced via SpriteDraw.tint on a white 1x1 texture instead of a real sprite. */
export const PROJECTILE_TINT: readonly [number, number, number, number] = [0.678, 0.847, 0.902, 1];
