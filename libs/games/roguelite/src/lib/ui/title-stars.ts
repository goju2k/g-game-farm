/**
 * The title's drifting seal dust (D-050): procedural points, never a looped
 * picture — each one's place is a pure function of time (it rises at its
 * own speed, sways on its own sine, and wraps round the edges), so there is
 * no frame where anything resets. Three depths: far (1px, dim, slowest),
 * middle, near (2px, bright, a little faster). Each twinkles on its own
 * period and phase. Units are art pixels (the caller scales them up whole).
 */

export interface Star {
  readonly x: number;
  readonly y: number;
  /** 0 far, 1 middle, 2 near. */
  readonly layer: 0 | 1 | 2;
  /** Art px per second, upward. */
  readonly rise: number;
  readonly swayPx: number;
  readonly swayPeriodS: number;
  readonly swayPhase: number;
  readonly twinklePeriodS: number;
  readonly twinklePhase: number;
  readonly color: readonly [number, number, number];
}

/** Cold seal colours (and, rarely, white). */
const COLORS: readonly (readonly [number, number, number])[] = [
  [0x30, 0x60, 0x82],
  [0x5f, 0xcd, 0xe4],
  [0xcb, 0xdb, 0xfc],
];
const WHITE: readonly [number, number, number] = [0xff, 0xff, 0xff];

const LAYERS = [
  { share: 0.5, rise: [1.2, 2.2], size: 1, alpha: [0.25, 0.5], colors: [0, 0, 1] },
  { share: 0.33, rise: [2.6, 4], size: 1, alpha: [0.45, 0.75], colors: [1, 1, 2] },
  { share: 0.17, rise: [4.5, 6.5], size: 2, alpha: [0.7, 1], colors: [1, 2, 2] },
] as const;

/** A small seeded generator (mulberry32), so a field looks the same each visit. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many points a field of this size gets: in proportion to its area, 60..120. */
export function starCount(width: number, height: number): number {
  return Math.max(60, Math.min(120, Math.round((width * height) / 900)));
}

export function createStars(width: number, height: number, seed = 7): Star[] {
  const random = seeded(seed);
  const between = ([lo, hi]: readonly [number, number]) => lo + (hi - lo) * random();
  const count = starCount(width, height);
  const stars: Star[] = [];
  LAYERS.forEach((layer, index) => {
    const n = Math.round(count * layer.share);
    for (let i = 0; i < n; i++) {
      const color = random() < 0.05 ? WHITE : COLORS[layer.colors[Math.floor(random() * layer.colors.length)]];
      stars.push({
        x: random() * width,
        y: random() * height,
        layer: index as 0 | 1 | 2,
        rise: between(layer.rise),
        swayPx: 1 + random() * (index + 1.5),
        swayPeriodS: 5 + random() * 7,
        swayPhase: random() * Math.PI * 2,
        twinklePeriodS: 1.8 + random() * 3.4,
        twinklePhase: random() * Math.PI * 2,
        color,
      });
    }
  });
  return stars;
}

/** Wraps v into [0, size) — continuous: leaving one edge is arriving at the other. */
function wrap(v: number, size: number): number {
  return ((v % size) + size) % size;
}

export interface StarAt {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly alpha: number;
  readonly color: readonly [number, number, number];
  /** Whether to keep the sub-pixel place (the far layer, so its slow rise doesn't step a whole pixel at a time). */
  readonly smooth: boolean;
}

/** Where a star is, and how bright, `t` seconds in. A margin of 2px is kept off-screen so a point never pops at the edge. */
export function starAt(star: Star, t: number, width: number, height: number): StarAt {
  const layer = LAYERS[star.layer];
  const span = { w: width + 4, h: height + 4 };
  const x = wrap(star.x + star.swayPx * Math.sin((2 * Math.PI * t) / star.swayPeriodS + star.swayPhase) + 2, span.w) - 2;
  const y = wrap(star.y - star.rise * t + 2, span.h) - 2;
  const twinkle = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / star.twinklePeriodS + star.twinklePhase);
  const [lo, hi] = layer.alpha;
  return { x, y, size: layer.size, alpha: lo + (hi - lo) * twinkle, color: star.color, smooth: star.layer === 0 };
}
