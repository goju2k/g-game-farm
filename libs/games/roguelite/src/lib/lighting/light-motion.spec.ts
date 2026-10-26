import { describe, expect, it } from 'vitest';
import { LIGHT_MOTION, lightMotionFactor } from './light-motion.js';

describe('light motion (D-039)', () => {
  it('no motion: a steady light', () => {
    expect(lightMotionFactor(undefined, 1234, 5)).toBe(1);
  });

  it('a pulse breathes within its amplitude, and lamps sit on their own phases', () => {
    const samples = Array.from({ length: 100 }, (_, i) => lightMotionFactor(LIGHT_MOTION.sealGlyph, i * 37, 7));
    expect(Math.max(...samples)).toBeLessThanOrEqual(1.12 + 1e-9);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0.88 - 1e-9);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.15);
    expect(lightMotionFactor(LIGHT_MOTION.sealGlyph, 0, 7)).not.toBeCloseTo(lightMotionFactor(LIGHT_MOTION.sealGlyph, 0, 8), 5);
  });

  it('a flicker wavers smoothly (no jumps between steps)', () => {
    let last = lightMotionFactor(LIGHT_MOTION.brazier, 0, 3);
    for (let t = 16; t < 2000; t += 16) {
      const now = lightMotionFactor(LIGHT_MOTION.brazier, t, 3);
      expect(Math.abs(now - last)).toBeLessThan(0.08);
      last = now;
    }
  });
});
