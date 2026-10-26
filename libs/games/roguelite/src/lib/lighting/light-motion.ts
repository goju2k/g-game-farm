import type { LightMotion } from '../components.js';

/**
 * How the dungeon's lights live (D-039): seal lamps and crystals breathe
 * cold and slow; fire (braziers — warm light is the hero's and the
 * braziers' only) wavers quick. Amplitudes are fractions of the radius.
 */
export const LIGHT_MOTION = {
  sealLamp: { pulse: { amp: 0.08, periodMs: 2600 }, flicker: { amp: 0.03, periodMs: 220 } },
  sealGlyph: { pulse: { amp: 0.12, periodMs: 1800 } },
  crystal: { pulse: { amp: 0.15, periodMs: 1800 }, flicker: { amp: 0.02, periodMs: 260 } },
  brazier: { pulse: { amp: 0.04, periodMs: 1300 }, flicker: { amp: 0.12, periodMs: 110 } },
  socket: { flicker: { amp: 0.1, periodMs: 130 } },
} as const satisfies Readonly<Record<string, LightMotion>>;

/** A stable 0..1 value per (seed, step) — the flicker's random walk. */
function noise(seed: number, step: number): number {
  let h = (Math.imul(seed | 0, 0x27d4eb2d) ^ Math.imul(step | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 0xffffffff;
}

/**
 * The radius multiplier at `elapsedMs` for a light with `motion`. `seed`
 * (its position) puts every lamp on its own phase so a room doesn't
 * breathe in unison.
 */
export function lightMotionFactor(motion: LightMotion | undefined, elapsedMs: number, seed: number): number {
  if (!motion) return 1;
  let factor = 1;
  if (motion.pulse) {
    const phase = noise(seed, 0) * Math.PI * 2;
    factor += motion.pulse.amp * Math.sin((elapsedMs / motion.pulse.periodMs) * Math.PI * 2 + phase);
  }
  if (motion.flicker) {
    // Eased between random levels, one per period.
    const t = elapsedMs / motion.flicker.periodMs;
    const step = Math.floor(t);
    const a = noise(seed, step) * 2 - 1;
    const b = noise(seed, step + 1) * 2 - 1;
    const k = t - step;
    factor += motion.flicker.amp * (a + (b - a) * k * k * (3 - 2 * k));
  }
  return Math.max(0, factor);
}
