import { createStars, starAt, starCount } from './title-stars.js';

describe('title dust (D-050)', () => {
  const W = 240;
  const H = 520;
  const stars = createStars(W, H);

  it('60..120 points by area, in three depths (most far, fewest near)', () => {
    expect(starCount(100, 100)).toBe(60);
    expect(starCount(480, 270)).toBe(120); // capped
    const byLayer = [0, 1, 2].map((l) => stars.filter((s) => s.layer === l).length);
    expect(byLayer[0]).toBeGreaterThan(byLayer[1]);
    expect(byLayer[1]).toBeGreaterThan(byLayer[2]);
  });

  it('flows without a reset: frame to frame every point moves under a pixel, except wrapping round an edge off-screen', () => {
    for (let t = 0; t < 600; t += 1 / 60) {
      for (const star of stars) {
        const a = starAt(star, t, W, H);
        const b = starAt(star, t + 1 / 60, W, H);
        if (Math.hypot(b.x - a.x, b.y - a.y) > 1) {
          // Only the wrap — and that happens outside the screen.
          expect(a.y < 0 || a.y >= H - 1 || b.y < 0 || b.y >= H - 1 || a.x < 0 || a.x >= W - 1 || b.x < 0 || b.x >= W - 1).toBe(true);
        }
      }
    }
  });

  it('everything rises; nearer is faster and bigger; the twinkles are out of step', () => {
    const near = stars.filter((s) => s.layer === 2);
    const far = stars.filter((s) => s.layer === 0);
    expect(stars.every((s) => s.rise > 0)).toBe(true);
    expect(Math.min(...near.map((s) => s.rise))).toBeGreaterThan(Math.max(...far.map((s) => s.rise)));
    expect(starAt(near[0], 0, W, H).size).toBe(2);
    expect(starAt(far[0], 0, W, H).size).toBe(1);
    expect(new Set(stars.map((s) => s.twinklePhase.toFixed(2))).size).toBeGreaterThan(stars.length * 0.8);
  });
});
