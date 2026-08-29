import { computeQuadScreenRect } from './camera-math.js';

const canvas = { width: 640, height: 360 };

describe('computeQuadScreenRect — no snapping', () => {
  it('applies camera translation and zoom, centered on the canvas', () => {
    const rect = computeQuadScreenRect(0.25, 0, 4, 2, { x: 0, y: 0, zoom: 2 }, {}, canvas);
    expect(rect).toEqual({ x: 320.5, y: 180, width: 8, height: 4 });
  });

  it('passes fractional positions through untouched when pixelSnap is off', () => {
    const rect = computeQuadScreenRect(0.25, 0.25, 1, 1, { x: 0, y: 0, zoom: 1 }, { pixelSnap: false }, canvas);
    expect(rect.x).toBeCloseTo(320.25);
    expect(rect.y).toBeCloseTo(180.25);
  });
});

describe('computeQuadScreenRect — parallaxFactor', () => {
  it('defaults to 1 (moves 1:1 with the camera)', () => {
    const a = computeQuadScreenRect(0, 0, 0, 0, { x: 0, y: 0, zoom: 1 }, {}, { width: 0, height: 0 });
    const b = computeQuadScreenRect(0, 0, 0, 0, { x: 50, y: 0, zoom: 1 }, {}, { width: 0, height: 0 });
    expect(b.x).toBe(a.x - 50);
  });

  it('0 pins the layer to the screen regardless of camera position', () => {
    const a = computeQuadScreenRect(10, 0, 0, 0, { x: 100, y: 0, zoom: 1 }, { parallaxFactor: 0 }, canvas);
    const b = computeQuadScreenRect(10, 0, 0, 0, { x: 200, y: 0, zoom: 1 }, { parallaxFactor: 0 }, canvas);
    expect(a.x).toBe(b.x);
  });

  it('a fractional factor scrolls slower than the camera', () => {
    const rect = computeQuadScreenRect(0, 0, 0, 0, { x: 100, y: 0, zoom: 1 }, { parallaxFactor: 0.5 }, { width: 0, height: 0 });
    expect(rect.x).toBe(-50); // effective camera offset is 50, not 100
  });
});

describe('computeQuadScreenRect — pixelSnap', () => {
  it('rounds zoom to the nearest integer', () => {
    const rect = computeQuadScreenRect(0, 0, 1, 0, { x: 0, y: 0, zoom: 2.6 }, { pixelSnap: true }, { width: 0, height: 0 });
    expect(rect.width).toBe(3); // round(2.6) = 3, not 2.6
  });

  it('rounds .5 up, matching Math.round', () => {
    // rawX0 = (0.5 - 0) * 3 + 321 = 322.5 -> 323
    const rect = computeQuadScreenRect(0.5, 0, 0, 0, { x: 0, y: 0, zoom: 3 }, { pixelSnap: true }, { width: 642, height: 0 });
    expect(rect.x).toBe(323);
  });

  it('produces integer coordinates even with an odd canvas size', () => {
    const rect = computeQuadScreenRect(0, 0, 0, 0, { x: 0, y: 0, zoom: 1 }, { pixelSnap: true }, { width: 641, height: 361 });
    expect(Number.isInteger(rect.x)).toBe(true);
    expect(Number.isInteger(rect.y)).toBe(true);
  });

  it('leaves no seam between two quads that share an edge', () => {
    const camera = { x: 0, y: 0, zoom: 3 };
    const layer = { pixelSnap: true };
    const canvasSize = { width: 642, height: 2 };

    const a = computeQuadScreenRect(0.5, 0, 2, 1, camera, layer, canvasSize);
    // b starts exactly where a's world rect ends (0.5 + 2)
    const b = computeQuadScreenRect(2.5, 0, 1.5, 1, camera, layer, canvasSize);

    expect(a.x + a.width).toBe(b.x);
  });
});
